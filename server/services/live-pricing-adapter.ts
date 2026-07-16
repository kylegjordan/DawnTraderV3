import { contextBridge } from './context-bridge';
import { normalizeToInternalSymbol } from '../markets/kraken-symbol-resolver.js';
import { priceTraceService } from './price-trace-service';
import { priceCache } from './price-cache.js';
import { restRateLimiter } from './market-data/rest-rate-limiter.js';
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import { trackPipelineTime } from './system-health-service.js';

/**
 * Phase 27.F.15.D: Live Pricing Adapter
 * 
 * Fetches live market prices from public APIs with caching and mock fallback.
 * Broadcasts price updates via WebSocket to all connected clients.
 * 
 * Features:
 * - API Integration: Binance, CoinGecko, or test sandbox
 * - Auto-refresh: Every 15 seconds
 * - In-memory caching: live_prices:<symbol>
 * - WebSocket broadcasts: price_updated events
 * - Mock fallback: Synthetic ±0.2% price movements when offline
 * 
 * Phase 8.8.3-I7-WS-E: REST Fallback Optimization
 * - REST fallback only when: WS cache stale >2s OR no WS subscription
 * - Thresholds: fresh ≤2s, warning ≥3s, immediate fallback ≥5s
 * - Diagnostic tracking for REST fallback reasons
 */

/**
 * Phase 8.8.3-I7-WS-E: REST fallback reason types
 */
type RestFallbackReason = 'cache_stale' | 'no_ws_subscription' | 'cache_miss';

/**
 * Phase 8.8.3-I7-WS-E: REST fallback metric entry
 */
interface RestFallbackMetric {
  symbol: string;
  count: number;
  lastReason: RestFallbackReason;
  lastTimestamp: number;
}

interface PriceQuote {
  symbol: string;
  price: number | null;
  timestamp: string;
  source: 'binance' | 'coingecko' | 'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good' | 'no_reliable_price';
}

interface CachedPrice {
  symbol: string;
  price: number;
  timestamp: string;
  source: 'binance' | 'coingecko' | 'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good';
  cachedAt: number;
}

// P19-B8.9a (Langston amendment 1 — encode the concept once, never a per-site whitelist):
// Kraken is the venue we fill against, so a FRESH value from ANY of its feeds — crypto WS,
// equities WS, or REST — is venue data. The engine's actionable gate AND its non-venue warn
// both reference THIS predicate so they cannot drift apart. Freshness is the CALLER's
// dimension (getPriceWithFallback's window); this predicate rules only on provenance.
export function isKrakenVenueSource(source: string): boolean {
  return source === 'kraken_ws' || source === 'kraken_equities_ws' || source === 'kraken_rest';
}

/**
 * P19-B8.5 (soak fix C, prong 1) — the PURE Binance routing decision, exported for tests.
 * Binance is consulted ONLY for USD-quoted pairs (mapped `${base}USDT`); any other quote
 * returns null — the source structurally cannot quote that market for us, and asking
 * anyway returns ghost-market or wrong-market numbers (see fetchFromBinance).
 */
export function binanceSymbolFor(symbol: string): string | null {
  const parts = symbol.split('/');
  if (parts.length !== 2) return null;
  const [base, quote] = parts;
  if (!base || quote !== 'USD') return null;
  return `${base}USDT`;
}

export class LivePricingAdapter {
  private priceCache: Map<string, CachedPrice> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private useMockMode: boolean = false;
  
  // Phase 8.8.3-I6-FIX: Track current trading mode for WebSocket broadcasts
  private currentTradingMode: 'paper' | 'live' = 'paper';
  
  // Phase 8.8.3-I7-WS-D: Reduced throttling for price broadcasts
  // D1: Changed from 1000ms to 150ms to ensure WebSocket ticks reach frontend
  private lastBroadcastTime: Map<string, number> = new Map();
  private readonly BROADCAST_THROTTLE_MS = 150; // 150ms minimum between broadcasts per symbol
  
  // Phase 8.8.3-I7-WS-E: REST Fallback Optimization
  // Phase 8.8.3-I8E: Increased staleness thresholds for low-volume pairs
  // Kraken low-volume pairs tick every 10-40 seconds, so 5s was too strict
  // Thresholds for WebSocket cache freshness
  private readonly WS_CACHE_FRESH_MS = 2000;       // ≤2s = fresh, use WS cache
  private readonly WS_CACHE_WARNING_MS = 10000;    // ≥10s = mild warning (was 3s)
  private readonly WS_CACHE_FALLBACK_MS = 25000;   // ≥25s = REST fallback (was 5s)
  
  // I7-WS-E: REST fallback metrics tracking
  private restFallbackMetrics: Map<string, RestFallbackMetric> = new Map();
  private wsSubscriptionChecker: (() => string[]) | null = null;
  
  // Configuration
  private readonly REFRESH_INTERVAL_MS = 15000; // 15 seconds for general price tracking
  private readonly CACHE_TTL_MS = 1000; // Phase 8.8.3-B3.5: 1 second cache TTL for open-trade symbols
  private readonly MOCK_VOLATILITY = 0.002; // ±0.2% for mock prices
  private readonly MODULE_NAME = 'LivePricingAdapter';
  
  // Tracked symbols (can be updated dynamically)
  private trackedSymbols: Set<string> = new Set([
    'BTC/USD',
    'ETH/USD',
    'SOL/USD',
    'XRP/USD',
    'ADA/USD'
  ]);

  /**
   * Start the live pricing adapter
   */
  async start(mockMode: boolean = false): Promise<void> {
    if (this.isRunning) {
      console.log(`[27.F.15.D][Pricing] Already running`);
      return;
    }

    this.useMockMode = mockMode;
    this.isRunning = true;

    console.log(`[27.F.15.D][Pricing] Starting LivePricingAdapter (mode: ${mockMode ? 'MOCK' : 'LIVE'})`);

    // Initial fetch
    await this.fetchAllPrices();

    // Start refresh interval
    this.refreshInterval = setInterval(async () => {
      await this.fetchAllPrices();
    }, this.REFRESH_INTERVAL_MS);

    console.log(`[27.F.15.D][Pricing] Started with ${this.trackedSymbols.size} tracked symbols`);
  }

  /**
   * Stop the live pricing adapter
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    this.isRunning = false;
    console.log(`[27.F.15.D][Pricing] Stopped`);
  }

  /**
   * Add symbols to track
   */
  addSymbols(symbols: string[]): void {
    const added: string[] = [];
    symbols.forEach(symbol => {
      const normalized = this.normalizeSymbol(symbol);
      if (!this.trackedSymbols.has(normalized)) {
        this.trackedSymbols.add(normalized);
        added.push(normalized);
      }
    });

    if (added.length > 0) {
      console.log(`[27.F.15.D][Pricing] Added ${added.length} new symbols: ${added.join(', ')}`);
    }
  }

  /**
   * Remove symbols from tracking
   */
  removeSymbols(symbols: string[]): void {
    symbols.forEach(symbol => {
      const normalized = this.normalizeSymbol(symbol);
      this.trackedSymbols.delete(normalized);
      this.priceCache.delete(normalized);
    });
  }

  /**
   * Get cached price for a symbol
   */
  getPrice(symbol: string): PriceQuote | null {
    const normalized = this.normalizeSymbol(symbol);
    const cached = this.priceCache.get(normalized);

    if (!cached) {
      return null;
    }

    // Check if cache is stale
    const age = Date.now() - cached.cachedAt;
    if (age > this.CACHE_TTL_MS) {
      console.log(`[27.F.15.D][Pricing] Cache stale for ${normalized} (age: ${age}ms)`);
      return null;
    }

    return {
      symbol: cached.symbol,
      price: cached.price,
      timestamp: cached.timestamp,
      source: cached.source
    };
  }
  

  /**
   * Get all cached prices
   */
  getAllPrices(): PriceQuote[] {
    const prices: PriceQuote[] = [];
    const now = Date.now();

    this.priceCache.forEach((cached, symbol) => {
      const age = now - cached.cachedAt;
      if (age <= this.CACHE_TTL_MS) {
        prices.push({
          symbol: cached.symbol,
          price: cached.price,
          timestamp: cached.timestamp,
          source: cached.source
        });
      }
    });

    return prices;
  }

  /**
   * Fetch all tracked prices
   */
  private async fetchAllPrices(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const promises: Promise<void>[] = [];

    this.trackedSymbols.forEach(symbol => {
      promises.push(this.fetchPrice(symbol));
    });

    await Promise.allSettled(promises);
  }

  /**
   * Fetch price for a single symbol
   * Phase 8.8.3-B9: Only cache valid prices (not null/no_reliable_price)
   */
  private async fetchPrice(symbol: string): Promise<void> {
    try {
      let quote: PriceQuote | null;

      if (this.useMockMode) {
        quote = await this.fetchMockPrice(symbol);
      } else {
        quote = await this.fetchLivePrice(symbol);
      }

      // Phase 8.8.3-B9: Only cache if we got a valid price
      if (quote && quote.price !== null && quote.source !== 'no_reliable_price') {
        this.priceCache.set(symbol, {
          symbol: quote.symbol,
          price: quote.price,
          timestamp: quote.timestamp,
          source: quote.source as CachedPrice['source'],
          cachedAt: Date.now()
        });

        // Broadcast update
        await this.broadcastPriceUpdate(quote);
      } else {
        console.log(`[B9.PRICING][SKIP_CACHE] ${symbol}: No valid price to cache`);
      }

    } catch (error) {
      console.error(`[27.F.15.D][Pricing] Error fetching ${symbol}:`, error);
    }
  }

  /**
   * Fetch live price from API (Binance, CoinGecko, or Kraken REST)
   * Phase 8.8.3-I6: Added Kraken REST API as PRIMARY fallback for Kraken pairs
   * Phase 8.8.3-B9: Mock pricing disabled in production - returns null if no reliable price
   */
  private async fetchLivePrice(symbol: string): Promise<PriceQuote | null> {
    try {
      // Try Binance first (good for common pairs)
      const binancePrice = await this.fetchFromBinance(symbol);
      if (binancePrice !== null) {
        return {
          symbol,
          price: binancePrice,
          timestamp: new Date().toISOString(),
          source: 'binance'
        };
      }

      // Fallback to CoinGecko (limited to mapped coins)
      const coinGeckoPrice = await this.fetchFromCoinGecko(symbol);
      if (coinGeckoPrice !== null) {
        return {
          symbol,
          price: coinGeckoPrice,
          timestamp: new Date().toISOString(),
          source: 'coingecko'
        };
      }

      // Phase 8.8.3-I6: CRITICAL - Kraken REST API as PRIMARY fallback for Kraken-specific pairs
      // This ensures we always get fresh prices when WebSocket is stale
      const krakenPrice = await this.fetchFromKrakenRest(symbol);
      if (krakenPrice !== null) {
        return {
          symbol,
          price: krakenPrice,
          timestamp: new Date().toISOString(),
          source: 'kraken_rest'
        };
      }

      // Phase 8.8.3-B9: Check if mock mode is EXPLICITLY enabled (dev/testing only)
      if (this.useMockMode) {
        console.log(`[27.F.15.D][Pricing] API unavailable for ${symbol}, falling back to mock (MOCK_MODE=true)`);
        return await this.fetchMockPrice(symbol);
      }
      
      // Phase 8.8.3-I6: Only use last_known_good if ALL external APIs fail
      // This should now be rare since Kraken REST is the authoritative source
      const cached = this.priceCache.get(this.normalizeSymbol(symbol));
      if (cached && cached.price > 0) {
        const cacheAge = Date.now() - cached.cachedAt;
        console.log(`[8.8.3-I6][LAST_KNOWN_GOOD_FALLBACK] symbol=${symbol} price=${cached.price.toFixed(4)} age=${cacheAge}ms reason=all_apis_failed`);
        return {
          symbol,
          price: cached.price,
          timestamp: new Date().toISOString(),
          source: 'last_known_good'
        };
      }
      
      // Phase 8.8.3-B9: NO mock fallback in production - return null
      console.warn(`[8.8.3-I6][NO_RELIABLE_PRICE] ${symbol}: All APIs failed (Binance/CoinGecko/Kraken), no cached data`);
      return {
        symbol,
        price: null,
        timestamp: new Date().toISOString(),
        source: 'no_reliable_price'
      };

    } catch (error) {
      // Phase 8.8.3-B9: Only use mock in explicit mock mode
      if (this.useMockMode) {
        console.error(`[27.F.15.D][Pricing] Live fetch failed for ${symbol}, using mock (MOCK_MODE=true)`, error);
        return await this.fetchMockPrice(symbol);
      }
      
      // Try cached price as last resort
      const cached = this.priceCache.get(this.normalizeSymbol(symbol));
      if (cached && cached.price > 0) {
        const cacheAge = Date.now() - cached.cachedAt;
        console.log(`[8.8.3-I6][LAST_KNOWN_GOOD_FALLBACK] symbol=${symbol} price=${cached.price.toFixed(4)} age=${cacheAge}ms reason=fetch_exception`);
        return {
          symbol,
          price: cached.price,
          timestamp: new Date().toISOString(),
          source: 'last_known_good'
        };
      }
      
      console.error(`[8.8.3-I6][NO_RELIABLE_PRICE] ${symbol}: Live fetch exception, no cached data`, error);
      return {
        symbol,
        price: null,
        timestamp: new Date().toISOString(),
        source: 'no_reliable_price'
      };
    }
  }

  /**
   * Fetch from Binance public API
   */
  private async fetchFromBinance(symbol: string): Promise<number | null> {
    try {
      // P19-B8.5 (soak fix C, prong 1 — ROUTING): only consult Binance for markets it can
      // structurally quote for us: USD-quoted pairs, mapped base+'USDT'. The old blind
      // `replace('/','').replace('USD','USDT')` passed non-USD quotes through VERBATIM
      // (XRP/GBP -> 'XRPGBP'), and Binance's ticker answers for DELISTED ghost markets
      // with the last price ever traded — a frozen number. Measured live 2026-07-15:
      // XRPGBP returned a static 0.5257 (vs the real ~0.827) for 37 straight minutes and
      // phantom-stopped five paper positions. A source that cannot quote the requested
      // market must return NULL (the chain skips it honestly), never a different market's
      // number. (It also mangled USD-BASED pairs: 'USDC/CHF' -> 'USDTCCHF' — garbage that
      // only failed safe by 404.)
      const binanceSymbol = binanceSymbolFor(symbol);
      if (binanceSymbol === null) {
        return null; // Binance cannot quote this market for us — refuse, don't improvise.
      }

      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`,
        {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'DawnTrader/1.0' }
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { price: string };
      return parseFloat(data.price);

    } catch (error) {
      return null;
    }
  }

  /**
   * Fetch from CoinGecko public API
   */
  private async fetchFromCoinGecko(symbol: string): Promise<number | null> {
    try {
      // Map symbols to CoinGecko IDs
      const coinGeckoMap: Record<string, string> = {
        'BTC/USD': 'bitcoin',
        'ETH/USD': 'ethereum',
        'SOL/USD': 'solana',
        'XRP/USD': 'ripple',
        'ADA/USD': 'cardano'
      };

      const coinId = coinGeckoMap[symbol];
      if (!coinId) {
        return null;
      }

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
        {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'DawnTrader/1.0' }
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as Record<string, { usd: number }>;
      return data[coinId]?.usd || null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Phase 8.8.3-I6: Fetch from Kraken public REST API
   * This is the PRIMARY fallback for Kraken-specific pairs when WebSocket is stale
   * Phase 8.8.5: Integrated RestRateLimiter to prevent Kraken bans
   */
  private async fetchFromKrakenRest(symbol: string): Promise<number | null> {
    try {
      // Phase 8.8.5: Check rate limiter before making REST call
      if (!restRateLimiter.check(symbol)) {
        const cached = this.priceCache.get(this.normalizeSymbol(symbol));
        console.log(`[8.8.5][REST_BLOCKED] ${symbol}: Rate limited, using cached price=${cached?.price ?? 'none'}`);
        krakenWebSocketAdapter.incrementRestFallbackBlocked();
        return cached?.price ?? null;
      }
      
      // Phase 8.8.5: REST call allowed
      krakenWebSocketAdapter.incrementRestFallbackAllowed();
      
      // Convert internal symbol to Kraken REST API format
      // Examples: XTZ/USD -> XTZUSD, XXRPZUSD -> XXRPZUSD, SUI/USD -> SUIUSD
      let krakenPair = symbol.replace('/', '');
      
      // Handle slash-format symbols (e.g., XTZ/USD -> XTZUSD)
      if (symbol.includes('/')) {
        const [base, quote] = symbol.split('/');
        // Special case for BTC -> XBT
        const krakenBase = base === 'BTC' ? 'XBT' : base;
        krakenPair = `${krakenBase}${quote}`;
      }
      
      const response = await fetch(
        `https://api.kraken.com/0/public/Ticker?pair=${krakenPair}`,
        {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'DawnTrader/1.0' }
        }
      );

      if (!response.ok) {
        console.log(`[8.8.3-I6][KRAKEN_REST_FAIL] ${symbol}: HTTP ${response.status}`);
        return null;
      }

      const data = await response.json() as { 
        error: string[];
        result: Record<string, { 
          a: [string, string, string]; // ask [price, whole lot volume, lot volume]
          b: [string, string, string]; // bid [price, whole lot volume, lot volume]
          c: [string, string];         // last trade [price, lot volume]
        }>
      };
      
      if (data.error && data.error.length > 0) {
        console.log(`[8.8.3-I6][KRAKEN_REST_ERROR] ${symbol}: ${data.error.join(', ')}`);
        return null;
      }
      
      // Get the first result key (Kraken returns dynamic key names)
      const resultKey = Object.keys(data.result || {})[0];
      if (!resultKey) {
        console.log(`[8.8.3-I6][KRAKEN_REST_NO_DATA] ${symbol}: No result in response`);
        return null;
      }
      
      const tickerData = data.result[resultKey];
      
      // 8.9.2: Calculate midpoint from bid/ask, fallback to last trade
      const ask = parseFloat(tickerData?.a?.[0] || '0');
      const bid = parseFloat(tickerData?.b?.[0] || '0');
      const lastTrade = parseFloat(tickerData?.c?.[0] || '0');
      const midpoint = (ask > 0 && bid > 0) ? (ask + bid) / 2 : lastTrade;
      
      if (midpoint <= 0 || isNaN(midpoint)) {
        console.log(`[8.9.2][KRAKEN_REST_INVALID_PRICE] ${symbol}: bid=${bid} ask=${ask} last=${lastTrade}`);
        return null;
      }
      
      console.log(`[8.9.2][REST_TICK] ${symbol} bid=${bid} ask=${ask} mid=${midpoint.toFixed(8)}`);
      console.log(`[8.8.3-I6][REST_FALLBACK] symbol=${symbol} price=${midpoint} source=kraken_rest priceAgeMs=0`);
      
      // Phase 8.8.4-IA-PRICE-CACHE: Update centralized price cache from REST
      const normalized = this.normalizeSymbol(symbol);
      priceCache.updateFromRest(normalized, midpoint);
      
      return midpoint;

    } catch (error) {
      console.error(`[8.8.3-I6][KRAKEN_REST_EXCEPTION] ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Generate mock price with synthetic volatility
   */
  private async fetchMockPrice(symbol: string): Promise<PriceQuote> {
    // Get previous price if available
    const cached = this.priceCache.get(symbol);
    
    let basePrice: number;
    
    if (cached) {
      // Apply random ±0.2% movement
      const change = (Math.random() - 0.5) * 2 * this.MOCK_VOLATILITY;
      basePrice = cached.price * (1 + change);
    } else {
      // Initialize with realistic base prices
      const basePrices: Record<string, number> = {
        'BTC/USD': 68000,
        'ETH/USD': 3500,
        'SOL/USD': 170,
        'XRP/USD': 0.62,
        'ADA/USD': 0.45
      };
      basePrice = basePrices[symbol] || 100;
    }

    const delta = cached ? ((basePrice - cached.price) / cached.price * 100).toFixed(3) : '0';
    console.log(`[27.F.15.D][Pricing-MOCK] ${symbol}: $${basePrice.toFixed(2)} (Δ${delta}%)`);

    return {
      symbol,
      price: basePrice,
      timestamp: new Date().toISOString(),
      source: 'mock'
    };
  }

  /**
   * Phase 8.8.3-I6-FIX: Set the current trading mode for WebSocket broadcasts
   * Called when simulation starts/stops or trading mode changes
   */
  setTradingMode(mode: 'paper' | 'live'): void {
    const previousMode = this.currentTradingMode;
    this.currentTradingMode = mode;
    console.log(`[8.8.3-I6-FIX][PRICING] Trading mode changed: ${previousMode} -> ${mode}`);
  }

  /**
   * Phase 8.8.3-I6-FIX: Get the current trading mode
   */
  getTradingMode(): 'paper' | 'live' {
    return this.currentTradingMode;
  }

  /**
   * Broadcast price update via WebSocket
   * Phase 34: Throttled to max 1 broadcast per second per symbol
   * Phase 8.8.3-B9: Skip broadcast for null prices (no_reliable_price)
   * Phase 8.8.3-I6-FIX: Use currentTradingMode instead of hardcoded 'live'
   */
  private async broadcastPriceUpdate(quote: PriceQuote): Promise<void> {
    try {
      // Phase 8.8.3-B9: Don't broadcast null prices
      if (quote.price === null) {
        console.log(`[B9.PRICING][SKIP_BROADCAST] ${quote.symbol}: Price is null, skipping broadcast`);
        return;
      }
      
      // Phase 34: Throttle broadcasts to ≤1/second per symbol
      const now = Date.now();
      const lastBroadcast = this.lastBroadcastTime.get(quote.symbol) || 0;
      
      if (now - lastBroadcast < this.BROADCAST_THROTTLE_MS) {
        // Skip this broadcast - too soon since last one
        return;
      }
      
      // Update last broadcast time
      this.lastBroadcastTime.set(quote.symbol, now);
      
      // Phase 8.8.3-I6-FIX: Use currentTradingMode instead of hardcoded 'live'
      await contextBridge.broadcast({
        type: 'price_updated',
        payload: {
          mode: this.currentTradingMode,
          symbol: quote.symbol,
          price: quote.price,
          timestamp: quote.timestamp,
          source: quote.source
        }
      });

      console.log(`[8.8.3-I6-FIX][Pricing-WS] Broadcast: ${quote.symbol} = $${quote.price.toFixed(2)} (${quote.source}) [mode=${this.currentTradingMode}]`);
      
      // Phase 8.8.3-I7-WS-A (A5): Log price broadcast for diagnostic audit
      console.log(`[I7-WS-A][BROADCAST] internal_symbol=${quote.symbol} price=${quote.price} mode=${this.currentTradingMode}`);

    } catch (error) {
      console.error(`[27.F.15.D][Pricing-WS] Broadcast failed:`, error);
    }
  }

  /**
   * Phase 8.8.3-I7-WS-D: Broadcast price from WebSocket with reduced throttling
   * D3: Every cache update from WebSocket triggers a broadcast (1:1 Stage-3→Stage-4)
   * D4: Removed suppression due to price age, delta, timestamp, etc.
   * Only applies minimal throttling (150ms) to prevent flooding
   */
  private broadcastFromWebSocket(quote: { symbol: string; price: number; timestamp: string; source: string }, traceId?: string): void {
    try {
      // D4: No suppression for null prices on WS path (WS always provides valid prices)
      const now = Date.now();
      const lastBroadcast = this.lastBroadcastTime.get(quote.symbol) || 0;
      
      // D1: Minimal throttling at 150ms (not 1000ms) to prevent flooding while ensuring updates
      if (now - lastBroadcast < this.BROADCAST_THROTTLE_MS) {
        // Log throttled broadcasts for diagnostic visibility
        console.log(`[I7-WS-D][BROADCAST_THROTTLED] symbol=${quote.symbol} timeSinceLast=${now - lastBroadcast}ms`);
        return;
      }
      
      // Update last broadcast time
      this.lastBroadcastTime.set(quote.symbol, now);
      
      // Phase 8.8.3-I7-WS-C (C2 Stage 4): Log broadcast with trace ID
      if (traceId) {
        priceTraceService.recordStage(traceId, 4, 'BROADCAST', {
          internal_symbol: quote.symbol,
          price: quote.price
        });
      }
      
      // Phase 8.8.3-I7-WS-D (D6): Diagnostic log for broadcast
      console.log(`[I7-WS-D][BROADCAST_SEND] symbol=${quote.symbol} price=${quote.price}`);
      
      // Broadcast to clients
      contextBridge.broadcast({
        type: 'price_updated',
        payload: {
          mode: this.currentTradingMode,
          symbol: quote.symbol,
          price: quote.price,
          timestamp: quote.timestamp,
          source: quote.source
        }
      });
      
      console.log(`[8.8.3-I6-FIX][Pricing-WS] Broadcast: ${quote.symbol} = $${quote.price.toFixed(2)} (${quote.source}) [mode=${this.currentTradingMode}]`);
      
      // Phase 8.8.3-I7-WS-A (A5): Log price broadcast for diagnostic audit
      console.log(`[I7-WS-A][BROADCAST] internal_symbol=${quote.symbol} price=${quote.price} mode=${this.currentTradingMode}`);

    } catch (error) {
      console.error(`[I7-WS-D][BROADCAST_ERROR] ${quote.symbol}:`, error);
    }
  }

  /**
   * Phase 8.8.3-I7: Normalize symbol using canonical resolver
   * No more USDT→USD collapsing - each quote currency is distinct
   */
  private normalizeSymbol(symbol: string): string {
    return normalizeToInternalSymbol(symbol);
  }

  /**
   * Phase 8.8.3-B3.6: Update price from WebSocket
   * Called by KrakenWebSocketAdapter when real-time prices arrive
   * Phase 8.8.3-I7-WS-C: Added traceId parameter for pipeline tracing
   * Phase 8.8.3-I7-WS-D: Now broadcasts EVERY WebSocket tick (D2/D3)
   */
  // P19-B8.9a (Langston amendment 2): the honest generic cache-write. The old name
  // `updateFromWebSocket` had three callers, two of them stamping non-WS data 'kraken_ws'
  // (the engine's REST broadcast + the equities-mark feed) — the method name was the third
  // mislabel. Callers now declare their true source; 'binance_ws' remains representable
  // only until B8.9 OBJ-1 retires the third-party machinery.
  updateCache(symbol: string, price: number, source: 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'binance_ws' = 'kraken_ws', traceId?: string): void {
    const pipelineStart = Date.now(); // Directive 9.0.C: Track pipeline time
    const normalized = this.normalizeSymbol(symbol);
    const timestamp = new Date().toISOString();
    const now = Date.now();
    
    // D2: Always update cache on EVERY WebSocket tick
    this.priceCache.set(normalized, {
      symbol: normalized,
      price,
      timestamp,
      // P19-B8.9a: the FOURTH mislabel, hiding inside the method — this ternary
      // discarded the caller's source into 'binance' for everything non-kraken_ws.
      // Store the true source; only binance_ws maps to the cache's 'binance' member.
      source: source === 'binance_ws' ? 'binance' : source,
      cachedAt: now
    });
    
    // Phase 8.8.4-IA-PRICE-CACHE: Update centralized price cache for active trades
    priceCache.updateFromWebSocket(normalized, price);
    
    // Phase 8.8.3-I7-WS-D (D6): Diagnostic log for cache write
    console.log(`[I7-WS-D][CACHE_WRITE] symbol=${normalized} price=${price} source=${source}`);
    
    // Phase 8.8.3-I7-WS-C (C2 Stage 3): Log cache update with trace ID
    if (traceId) {
      priceTraceService.recordStage(traceId, 3, 'CACHE_UPDATE', {
        internal_symbol: normalized,
        price
      });
    }
    
    // Phase 8.8.3-I5: Diagnostic logging for cache update audit
    console.log(`[8.8.3-I5][CACHE_UPDATE] symbol=${normalized} newPrice=${price} lastTickMsAgo=0 timestamp=${now}`);
    
    // Phase 8.8.3-I7-WS-A (A4): Log cache update for diagnostic audit
    console.log(`[I7-WS-A][CACHE_UPDATE] internal_symbol=${normalized} price=${price}`);
    
    if (!this.trackedSymbols.has(normalized)) {
      this.trackedSymbols.add(normalized);
    }
    
    // Phase 8.8.3-I7-WS-D (D3): Broadcast EVERY cache update to frontend
    // This ensures Stage-3 → Stage-4 is 1:1
    this.broadcastFromWebSocket({
      symbol: normalized,
      price,
      timestamp,
      source: source === 'kraken_ws' ? 'kraken_ws' : 'binance'
    }, traceId);
    
    // Directive 9.0.C: Track pipeline processing time (WS receive → cache → broadcast complete)
    // Note: broadcastFromWebSocket is fire-and-forget, so we track synchronous portion
    const pipelineEnd = Date.now();
    const pipelineDuration = pipelineEnd - pipelineStart;
    trackPipelineTime(normalized, pipelineStart);
    
    // Additional logging for pipeline visibility
    if (pipelineDuration > 50) {
      console.log(`[9.0][PIPELINE] ${normalized} sync processing = ${pipelineDuration}ms`);
    }
  }

  /**
   * Phase 8.8.3-B9: Seed price cache with entry price
   * Called when a trade opens to establish a lastKnownGoodPrice anchor
   * This prevents mock fallback from using fabricated prices on exit
   */
  seedLastKnownGoodPrice(symbol: string, price: number): void {
    const normalized = this.normalizeSymbol(symbol);
    const timestamp = new Date().toISOString();
    
    // Only seed if we don't have a more recent real price
    const existing = this.priceCache.get(normalized);
    if (existing && existing.source !== 'mock' && existing.source !== 'entry_seed') {
      const age = Date.now() - existing.cachedAt;
      if (age < 60000) { // Keep existing real price if less than 60s old
        console.log(`[B9.PRICING][SEED_SKIP] ${normalized}: Keeping existing real price $${existing.price.toFixed(2)} (${existing.source}, age: ${age}ms)`);
        return;
      }
    }
    
    this.priceCache.set(normalized, {
      symbol: normalized,
      price,
      timestamp,
      source: 'entry_seed',
      cachedAt: Date.now()
    });
    
    // Ensure symbol is tracked
    if (!this.trackedSymbols.has(normalized)) {
      this.trackedSymbols.add(normalized);
    }
    
    console.log(`[B9.PRICING][ENTRY_SEED] ${normalized}: Seeded price cache with entry price $${price.toFixed(2)}`);
  }

  /**
   * Phase 8.8.3-I7-WS-E: Set WebSocket subscription checker
   * Allows the adapter to check if a symbol has an active WS subscription
   */
  setWsSubscriptionChecker(checker: () => string[]): void {
    this.wsSubscriptionChecker = checker;
    console.log(`[I7-WS-E] WebSocket subscription checker registered`);
  }

  /**
   * Phase 8.8.3-I7-WS-E: Check if symbol has active WebSocket subscription
   */
  private hasWsSubscription(symbol: string): boolean {
    if (!this.wsSubscriptionChecker) {
      return false;
    }
    const subscribedSymbols = this.wsSubscriptionChecker();
    const normalized = this.normalizeSymbol(symbol);
    return subscribedSymbols.includes(normalized) || subscribedSymbols.some(s => 
      this.normalizeSymbol(s) === normalized
    );
  }

  /**
   * Phase 8.8.3-I7-WS-E: Record REST fallback metric
   */
  private recordRestFallback(symbol: string, reason: RestFallbackReason): void {
    const existing = this.restFallbackMetrics.get(symbol);
    if (existing) {
      existing.count++;
      existing.lastReason = reason;
      existing.lastTimestamp = Date.now();
    } else {
      this.restFallbackMetrics.set(symbol, {
        symbol,
        count: 1,
        lastReason: reason,
        lastTimestamp: Date.now()
      });
    }
    console.log(`[I7-WS-E][REST_FALLBACK] symbol=${symbol} reason=${reason}`);
  }

  /**
   * Phase 8.8.3-B3.6 + I7-WS-E: Get price with optimized REST fallback
   * 
   * I7-WS-E Logic:
   * - Use WebSocket cache if fresh (≤2s)
   * - Log warning if cache age ≥3s
   * - REST fallback if: cache stale >2s OR no WS subscription
   */
  async getPriceWithFallback(symbol: string, staleThresholdMs: number = 5000): Promise<PriceQuote | null> {
    const normalized = this.normalizeSymbol(symbol);
    const cached = this.priceCache.get(normalized);
    const now = Date.now();
    
    // Phase 8.8.3-I7-WS-E: Check WebSocket subscription status
    const hasWsSub = this.hasWsSubscription(normalized);
    
    if (cached) {
      const age = now - cached.cachedAt;
      
      // I7-WS-E: Fresh WebSocket cache (≤2s) - use directly
      // P19-B8.9a: venue predicate, not the WS tag — a fresh same-venue REST/equities entry
      // is servable without wearing a false WS badge (the honest form of the old behavior).
      if (age <= this.WS_CACHE_FRESH_MS && isKrakenVenueSource(cached.source)) {
        return {
          symbol: cached.symbol,
          price: cached.price,
          timestamp: cached.timestamp,
          source: cached.source
        };
      }
      
      // I7-WS-E: Any source within stale threshold - use cache
      if (age <= staleThresholdMs) {
        // Mild warning at ≥3s
        if (age >= this.WS_CACHE_WARNING_MS) {
          console.log(`[I7-WS-E][CACHE_WARNING] symbol=${normalized} age=${age}ms source=${cached.source} (approaching stale)`);
        }
        return {
          symbol: cached.symbol,
          price: cached.price,
          timestamp: cached.timestamp,
          source: cached.source
        };
      }
      
      // I7-WS-E: Cache is stale, determine reason and fallback
      if (!hasWsSub) {
        this.recordRestFallback(normalized, 'no_ws_subscription');
      } else {
        this.recordRestFallback(normalized, 'cache_stale');
      }
    } else {
      // No cache at all
      this.recordRestFallback(normalized, hasWsSub ? 'cache_miss' : 'no_ws_subscription');
    }
    
    // Perform REST fallback
    try {
      await this.fetchPrice(normalized);
      const updated = this.priceCache.get(normalized);
      if (updated) {
        return {
          symbol: updated.symbol,
          price: updated.price,
          timestamp: updated.timestamp,
          source: updated.source
        };
      }
    } catch (error) {
      console.error(`[I7-WS-E][REST_FALLBACK_ERROR] symbol=${normalized}:`, error);
    }
    
    // Return stale cache as last resort — P19-B8.9a: tagged HONESTLY as last_known_good.
    // Pre-existing hole (found via Langston's Step-4 checklist item): re-serving a STALE
    // entry with its original venue tag let it satisfy the engine's actionable gate in the
    // exact dark-venue scenario the skip-rail was built for (WS stale AND REST failed).
    // A stale re-serve is a MEMORY of a venue read, not a venue read — last_known_good is
    // its true name; the engine's skip-tick + escalation rail now engage as designed.
    return cached ? {
      symbol: cached.symbol,
      price: cached.price,
      timestamp: cached.timestamp,
      source: 'last_known_good'
    } : null;
  }

  /**
   * Phase 8.8.3-I7-WS-E: Get REST fallback metrics for diagnostics
   */
  getRestFallbackMetrics(): {
    totalFallbacks: number;
    bySymbol: Array<{
      symbol: string;
      count: number;
      lastReason: string;
      lastTimestamp: string;
      wsTimestamp: string | null;
      hasWsSubscription: boolean;
    }>;
    summary: {
      cache_stale: number;
      no_ws_subscription: number;
      cache_miss: number;
    };
  } {
    const now = Date.now();
    const summary = { cache_stale: 0, no_ws_subscription: 0, cache_miss: 0 };
    let totalFallbacks = 0;
    
    const bySymbol = Array.from(this.restFallbackMetrics.entries()).map(([symbol, metric]) => {
      totalFallbacks += metric.count;
      summary[metric.lastReason] = (summary[metric.lastReason] || 0) + metric.count;
      
      const cached = this.priceCache.get(symbol);
      const wsTimestamp = (cached?.source === 'kraken_ws' || cached?.source === 'kraken_equities_ws') ? cached.timestamp : null;
      
      return {
        symbol,
        count: metric.count,
        lastReason: metric.lastReason,
        lastTimestamp: new Date(metric.lastTimestamp).toISOString(),
        wsTimestamp,
        hasWsSubscription: this.hasWsSubscription(symbol)
      };
    });
    
    return { totalFallbacks, bySymbol, summary };
  }

  /**
   * Phase 8.8.3-I7-WS-E: Clear REST fallback metrics (for testing/reset)
   */
  clearRestFallbackMetrics(): void {
    this.restFallbackMetrics.clear();
    console.log(`[I7-WS-E] REST fallback metrics cleared`);
  }

  /**
   * Phase B7.MDR: Clear all price caches for hard reset
   * Called during paper simulation reset to ensure fresh market data
   */
  clearCache(): void {
    const previousSize = this.priceCache.size;
    this.priceCache.clear();
    this.lastBroadcastTime.clear();
    console.log(`[PRICE_ENGINE][RESET] Cleared price cache (${previousSize} entries)`);
  }

  /**
   * Get cache size for verification
   */
  getCacheSize(): number {
    return this.priceCache.size;
  }

  /**
   * Get adapter status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.useMockMode ? 'mock' : 'live',
      trackedSymbols: Array.from(this.trackedSymbols),
      cachedPrices: this.priceCache.size,
      refreshIntervalMs: this.REFRESH_INTERVAL_MS
    };
  }
}

// Singleton instance
export const livePricingAdapter = new LivePricingAdapter();

// B78.1: Cycle-break wiring. ws-adapter no longer imports live-pricing-adapter;
// instead it emits 'priceTick' events. live-pricing subscribes here at module-load
// and binds its tradingMode getter back so ws-adapter can label broadcast payloads
// without a reverse import. Subscription is registered ONCE (singleton import side
// effect); removeAllListeners defensive in case of HMR/test re-import.
import type { PriceTickEvent } from '../exchanges/kraken/kraken-websocket-adapter.js';
krakenWebSocketAdapter.removeAllListeners('priceTick');
krakenWebSocketAdapter.on('priceTick', (evt: PriceTickEvent) => {
  try {
    livePricingAdapter.updateCache(evt.symbol, evt.price, evt.source, evt.traceId);
  } catch (err) {
    // Subscriber error must not propagate back to ws-adapter (fire-and-forget invariant)
    console.error('[B78.1][PRICING_TICK_HANDLER] error processing priceTick event:', err);
  }
});
krakenWebSocketAdapter.bindTradingModeGetter(() => livePricingAdapter.getTradingMode());
console.log('[B78.1][PRICING] subscribed to ws-adapter priceTick events + bound tradingMode getter');
