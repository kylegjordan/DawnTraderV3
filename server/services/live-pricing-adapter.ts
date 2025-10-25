import { contextBridge } from './context-bridge';

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
  price: number;
  timestamp: string;
  source: 'binance' | 'coingecko' | 'mock';
}

interface CachedPrice extends PriceQuote {
  cachedAt: number;
}

export class LivePricingAdapter {
  private priceCache: Map<string, CachedPrice> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private useMockMode: boolean = false;
  
  // Configuration
  private readonly REFRESH_INTERVAL_MS = 15000; // 15 seconds
  private readonly CACHE_TTL_MS = 30000; // 30 seconds
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
   */
  private async fetchPrice(symbol: string): Promise<void> {
    try {
      let quote: PriceQuote;

      if (this.useMockMode) {
        quote = await this.fetchMockPrice(symbol);
      } else {
        quote = await this.fetchLivePrice(symbol);
      }

      // Cache the price
      this.priceCache.set(symbol, {
        ...quote,
        cachedAt: Date.now()
      });

      // Broadcast update
      await this.broadcastPriceUpdate(quote);

    } catch (error) {
      console.error(`[27.F.15.D][Pricing] Error fetching ${symbol}:`, error);
    }
  }

  /**
   * Fetch live price from API (Binance or CoinGecko)
   */
  private async fetchLivePrice(symbol: string): Promise<PriceQuote> {
    try {
      // Try Binance first
      const binancePrice = await this.fetchFromBinance(symbol);
      if (binancePrice !== null) {
        return {
          symbol,
          price: binancePrice,
          timestamp: new Date().toISOString(),
          source: 'binance'
        };
      }

      // Fallback to CoinGecko
      const coinGeckoPrice = await this.fetchFromCoinGecko(symbol);
      if (coinGeckoPrice !== null) {
        return {
          symbol,
          price: coinGeckoPrice,
          timestamp: new Date().toISOString(),
          source: 'coingecko'
        };
      }

      // If both fail, use mock
      console.log(`[27.F.15.D][Pricing] API unavailable for ${symbol}, falling back to mock`);
      return await this.fetchMockPrice(symbol);

    } catch (error) {
      console.error(`[27.F.15.D][Pricing] Live fetch failed for ${symbol}, using mock`, error);
      return await this.fetchMockPrice(symbol);
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
   * Broadcast price update via WebSocket
   */
  private async broadcastPriceUpdate(quote: PriceQuote): Promise<void> {
    try {
      await contextBridge.broadcast({
        type: 'price_updated',
        payload: {
          mode: 'live',
          symbol: quote.symbol,
          price: quote.price,
          timestamp: quote.timestamp,
          source: quote.source
        }
      });

      console.log(`[27.F.15.D][Pricing-WS] Broadcast: ${quote.symbol} = $${quote.price.toFixed(2)} (${quote.source})`);

    } catch (error) {
      console.error(`[27.F.15.D][Pricing-WS] Broadcast failed:`, error);
    }
  }

  /**
   * Normalize symbol format
   */
  private normalizeSymbol(symbol: string): string {
    // Convert various formats to BTC/USD standard
    return symbol.toUpperCase()
      .replace('USDT', 'USD')
      .replace(/([A-Z]{3,4})USD/, '$1/USD');
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
