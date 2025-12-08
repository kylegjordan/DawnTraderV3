import { contextBridge } from './context-bridge';
import { normalizeToInternalSymbol } from '../markets/kraken-symbol-resolver';
import { priceTraceService } from './price-trace-service';

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
 */

interface PriceQuote {
  symbol: string;
  price: number | null;
  timestamp: string;
  source: 'binance' | 'coingecko' | 'mock' | 'kraken_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good' | 'no_reliable_price';
}

interface CachedPrice {
  symbol: string;
  price: number;
  timestamp: string;
  source: 'binance' | 'coingecko' | 'mock' | 'kraken_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good';
  cachedAt: number;
}

export class LivePricingAdapter {
  private priceCache: Map<string, CachedPrice> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private useMockMode: boolean = false;
  
  // Phase 8.8.3-I6-FIX: Track current trading mode for WebSocket broadcasts
  private currentTradingMode: 'paper' | 'live' = 'paper';
  
  // Phase 34: Throttling for price broadcasts
  private lastBroadcastTime: Map<string, number> = new Map();
  private readonly BROADCAST_THROTTLE_MS = 1000; // 1 second minimum between broadcasts per symbol
  
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
      // Convert symbol format: BTC/USD -> BTCUSDT
      const binanceSymbol = symbol.replace('/', '').replace('USD', 'USDT');
      
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
   */
  private async fetchFromKrakenRest(symbol: string): Promise<number | null> {
    try {
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
        result: Record<string, { c: [string, string] }> // c = last trade close [price, lot volume]
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
      const lastPrice = parseFloat(tickerData?.c?.[0] || '0');
      
      if (lastPrice <= 0 || isNaN(lastPrice)) {
        console.log(`[8.8.3-I6][KRAKEN_REST_INVALID_PRICE] ${symbol}: price=${tickerData?.c?.[0]}`);
        return null;
      }
      
      console.log(`[8.8.3-I6][REST_FALLBACK] symbol=${symbol} price=${lastPrice} source=kraken_rest priceAgeMs=0`);
      return lastPrice;

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
   */
  updateFromWebSocket(symbol: string, price: number, source: 'kraken_ws' | 'binance_ws' = 'kraken_ws', traceId?: string): void {
    const normalized = this.normalizeSymbol(symbol);
    const timestamp = new Date().toISOString();
    const now = Date.now();
    
    this.priceCache.set(normalized, {
      symbol: normalized,
      price,
      timestamp,
      source: source === 'kraken_ws' ? 'kraken_ws' : 'binance',
      cachedAt: now
    });
    
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
   * Phase 8.8.3-B3.6: Get price with REST fallback
   * Returns cached price if fresh, otherwise attempts REST fetch
   */
  async getPriceWithFallback(symbol: string, staleThresholdMs: number = 5000): Promise<PriceQuote | null> {
    const normalized = this.normalizeSymbol(symbol);
    const cached = this.priceCache.get(normalized);
    
    if (cached) {
      const age = Date.now() - cached.cachedAt;
      if (age <= staleThresholdMs) {
        return {
          symbol: cached.symbol,
          price: cached.price,
          timestamp: cached.timestamp,
          source: cached.source
        };
      }
      console.log(`[27.F.15.D][Pricing] Cache stale for ${normalized} (age: ${age}ms > ${staleThresholdMs}ms), falling back to REST`);
    }
    
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
      console.error(`[27.F.15.D][Pricing] REST fallback failed for ${normalized}:`, error);
    }
    
    return cached ? {
      symbol: cached.symbol,
      price: cached.price,
      timestamp: cached.timestamp,
      source: cached.source
    } : null;
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
