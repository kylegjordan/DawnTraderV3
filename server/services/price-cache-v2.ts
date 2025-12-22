/**
 * Directive 8.8.4-A4.R10: Extended Price Cache Integration & Rate-Governed FX5 Scaling
 * 
 * Multi-bucket price cache service handling:
 * - Open trades (high-priority, 2s updates)
 * - Ready-to-Buy signals (medium priority, 15s updates)
 * - FX5 snapshots (low priority, 30s updates)
 * 
 * Maintains Kraken API compliance (< 10 weighted req/s)
 */

import { KrakenService } from './kraken.js';

export type CacheBucketType = 'openTrade' | 'readyToBuy' | 'fx5Snapshot';

interface CacheBucket {
  type: CacheBucketType;
  symbols: Set<string>;
  refreshIntervalMs: number;
  lastRefresh: number;
}

interface CachedTickerData {
  symbol: string;
  price: number;
  ask: number;
  bid: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  updated: number;
  source: 'kraken_rest';
}

class MultiBucketPriceCache {
  private buckets: CacheBucket[] = [
    { type: 'openTrade', symbols: new Set(), refreshIntervalMs: 2000, lastRefresh: 0 },
    { type: 'readyToBuy', symbols: new Set(), refreshIntervalMs: 15000, lastRefresh: 0 },
    { type: 'fx5Snapshot', symbols: new Set(), refreshIntervalMs: 30000, lastRefresh: 0 },
  ];

  private cache: Map<string, CachedTickerData> = new Map();
  private currentWeight = 0;
  private weightResetInterval: NodeJS.Timeout | null = null;
  private refreshLoopInterval: NodeJS.Timeout | null = null;
  private krakenService: KrakenService;
  private isInitialized = false;

  private readonly MAX_WEIGHT_PER_SECOND = 10;
  private readonly BATCH_SIZE = 100;

  constructor() {
    this.krakenService = new KrakenService();
  }

  /**
   * Initialize the price cache service
   * Call this once during server startup
   */
  initialize(): void {
    if (this.isInitialized) {
      console.log('[A4.R10][PriceCache] Already initialized');
      return;
    }

    this.weightResetInterval = setInterval(() => {
      this.currentWeight = 0;
    }, 1000);

    this.refreshLoopInterval = setInterval(() => {
      this.refreshBuckets().catch(err => {
        console.error('[A4.R10][PriceCache] Refresh error:', err.message);
      });
    }, 1000);

    this.isInitialized = true;
    console.log('[A4.R10][PriceCache] Initialized with 3 buckets (openTrade=2s, readyToBuy=15s, fx5Snapshot=30s)');
  }

  /**
   * Stop the price cache service
   */
  shutdown(): void {
    if (this.weightResetInterval) {
      clearInterval(this.weightResetInterval);
      this.weightResetInterval = null;
    }
    if (this.refreshLoopInterval) {
      clearInterval(this.refreshLoopInterval);
      this.refreshLoopInterval = null;
    }
    this.isInitialized = false;
    console.log('[A4.R10][PriceCache] Shutdown complete');
  }

  /**
   * Rate-governed fetch - waits if over budget
   */
  private async safeFetch<T>(weight: number, fn: () => Promise<T>): Promise<T> {
    const maxRetries = 20;
    let retries = 0;

    while (this.currentWeight + weight > this.MAX_WEIGHT_PER_SECOND && retries < maxRetries) {
      await this.delay(250);
      retries++;
    }

    if (retries >= maxRetries) {
      throw new Error('[A4.R10] Rate limit budget exhausted after max retries');
    }

    this.currentWeight += weight;
    return fn();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Refresh all buckets that are due for update
   */
  private async refreshBuckets(): Promise<void> {
    const now = Date.now();

    for (const bucket of this.buckets) {
      if (now - bucket.lastRefresh >= bucket.refreshIntervalMs && bucket.symbols.size > 0) {
        await this.refreshBucket(bucket, now);
      }
    }
  }

  /**
   * Refresh a single bucket's symbols
   */
  private async refreshBucket(bucket: CacheBucket, now: number): Promise<void> {
    const symbols = Array.from(bucket.symbols);
    
    if (symbols.length === 0) {
      bucket.lastRefresh = now;
      return;
    }

    for (let i = 0; i < symbols.length; i += this.BATCH_SIZE) {
      const batch = symbols.slice(i, i + this.BATCH_SIZE);
      const pairString = batch.join(',');

      try {
        await this.safeFetch(1, async () => {
          const data = await this.krakenService.getTicker(pairString);
          
          for (const [pair, ticker] of Object.entries(data)) {
            const normalizedSymbol = this.normalizeKrakenPair(pair);
            this.cache.set(normalizedSymbol, {
              symbol: normalizedSymbol,
              price: parseFloat(ticker.c?.[0] || '0'),
              ask: parseFloat(ticker.a?.[0] || '0'),
              bid: parseFloat(ticker.b?.[0] || '0'),
              volume24h: parseFloat(ticker.v?.[1] || '0'),
              high24h: parseFloat(ticker.h?.[1] || '0'),
              low24h: parseFloat(ticker.l?.[1] || '0'),
              updated: now,
              source: 'kraken_rest',
            });
          }

          console.log(`[A4.R10][PriceCache][${bucket.type}] Refreshed ${batch.length} symbols`);
        });
      } catch (err: any) {
        console.warn(`[A4.R10][PriceCache][${bucket.type}] Batch fetch error:`, err.message);
      }
    }

    bucket.lastRefresh = now;
  }

  /**
   * Normalize Kraken pair to internal BASE/QUOTE format
   */
  private normalizeKrakenPair(krakenPair: string): string {
    const knownBases = ['XBT', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'LINK', 'LTC', 'BCH', 'AVAX', 'ATOM', 'UNI', 'MATIC', 'DOGE', 'SHIB'];
    const knownQuotes = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'USDT', 'USDC'];

    let base = krakenPair;
    let quote = '';

    for (const q of knownQuotes) {
      if (krakenPair.endsWith(q)) {
        quote = q;
        base = krakenPair.slice(0, -q.length);
        break;
      }
    }

    if (base.startsWith('X') && base.length > 3) {
      base = base.slice(1);
    }
    if (base.startsWith('Z') && base.length > 3) {
      base = base.slice(1);
    }
    if (base === 'XBT') {
      base = 'BTC';
    }
    if (quote.startsWith('Z') && quote.length > 3) {
      quote = quote.slice(1);
    }

    return quote ? `${base}/${quote}` : base;
  }

  /**
   * Subscribe a symbol to a specific bucket
   */
  subscribe(symbol: string, bucketType: CacheBucketType): void {
    const bucket = this.buckets.find(b => b.type === bucketType);
    if (!bucket) {
      console.warn(`[A4.R10][PriceCache] Invalid bucket type: ${bucketType}`);
      return;
    }
    
    bucket.symbols.add(symbol);
    console.log(`[A4.R10][PriceCache] Subscribed ${symbol} to ${bucketType} (total: ${bucket.symbols.size})`);
  }

  /**
   * Unsubscribe a symbol from all buckets
   */
  unsubscribe(symbol: string): void {
    for (const bucket of this.buckets) {
      bucket.symbols.delete(symbol);
    }
  }

  /**
   * Unsubscribe a symbol from a specific bucket
   */
  unsubscribeFrom(symbol: string, bucketType: CacheBucketType): void {
    const bucket = this.buckets.find(b => b.type === bucketType);
    if (bucket) {
      bucket.symbols.delete(symbol);
    }
  }

  /**
   * Get cached price for a symbol
   */
  getCachedPrice(symbol: string): CachedTickerData | null {
    return this.cache.get(symbol) || null;
  }

  /**
   * A4.R10: Get price with auto-subscribe and on-demand fetch
   * 
   * If symbol is not in cache or is stale, fetches fresh data.
   * Auto-subscribes to specified bucket for future refreshes.
   */
  async getPrice(symbol: string, bucketType: CacheBucketType = 'readyToBuy'): Promise<CachedTickerData | null> {
    const bucket = this.buckets.find(b => b.type === bucketType);
    const refreshInterval = bucket?.refreshIntervalMs ?? 15000;
    
    const cached = this.cache.get(symbol);
    const now = Date.now();
    
    const isFresh = cached && (now - cached.updated) < refreshInterval;
    
    if (isFresh) {
      return cached;
    }
    
    if (!bucket?.symbols.has(symbol)) {
      this.subscribe(symbol, bucketType);
    }
    
    try {
      await this.safeFetch(1, async () => {
        const krakenSymbol = this.toKrakenSymbol(symbol);
        const data = await this.krakenService.getTicker(krakenSymbol);
        
        for (const [pair, ticker] of Object.entries(data)) {
          const normalizedSymbol = this.normalizeKrakenPair(pair);
          this.cache.set(normalizedSymbol, {
            symbol: normalizedSymbol,
            price: parseFloat(ticker.c?.[0] || '0'),
            ask: parseFloat(ticker.a?.[0] || '0'),
            bid: parseFloat(ticker.b?.[0] || '0'),
            volume24h: parseFloat(ticker.v?.[1] || '0'),
            high24h: parseFloat(ticker.h?.[1] || '0'),
            low24h: parseFloat(ticker.l?.[1] || '0'),
            updated: now,
            source: 'kraken_rest',
          });
        }
      });
      
      return this.cache.get(symbol) || null;
    } catch (err: any) {
      console.warn(`[A4.R10][PriceCache] getPrice error for ${symbol}:`, err.message);
      return cached || null;
    }
  }

  /**
   * Convert internal BASE/QUOTE format to Kraken pair
   */
  private toKrakenSymbol(symbol: string): string {
    const parts = symbol.split('/');
    if (parts.length !== 2) return symbol;
    
    let [base, quote] = parts;
    
    if (base === 'BTC') base = 'XBT';
    
    return `${base}${quote}`;
  }

  /**
   * Get all cached prices
   */
  getAllCachedPrices(): CachedTickerData[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get health metrics for monitoring
   */
  getHealthMetrics(): {
    openTrade: number;
    readyToBuy: number;
    fx5Snapshot: number;
    currentWeight: number;
    maxWeight: number;
    cacheSize: number;
  } {
    return {
      openTrade: this.buckets[0].symbols.size,
      readyToBuy: this.buckets[1].symbols.size,
      fx5Snapshot: this.buckets[2].symbols.size,
      currentWeight: this.currentWeight,
      maxWeight: this.MAX_WEIGHT_PER_SECOND,
      cacheSize: this.cache.size,
    };
  }

  /**
   * Bulk subscribe symbols to FX5 snapshot bucket
   */
  subscribeFx5Symbols(symbols: string[]): void {
    const bucket = this.buckets.find(b => b.type === 'fx5Snapshot');
    if (bucket) {
      for (const symbol of symbols) {
        bucket.symbols.add(symbol);
      }
      console.log(`[A4.R10][PriceCache] Subscribed ${symbols.length} symbols to fx5Snapshot (total: ${bucket.symbols.size})`);
    }
  }

  /**
   * Clear a specific bucket
   */
  clearBucket(bucketType: CacheBucketType): void {
    const bucket = this.buckets.find(b => b.type === bucketType);
    if (bucket) {
      bucket.symbols.clear();
      console.log(`[A4.R10][PriceCache] Cleared ${bucketType} bucket`);
    }
  }

  /**
   * Check if a symbol is in any bucket
   */
  isSubscribed(symbol: string): boolean {
    return this.buckets.some(b => b.symbols.has(symbol));
  }

  /**
   * Get bucket for a symbol
   */
  getSymbolBucket(symbol: string): CacheBucketType | null {
    for (const bucket of this.buckets) {
      if (bucket.symbols.has(symbol)) {
        return bucket.type;
      }
    }
    return null;
  }
}

export const multiBucketPriceCache = new MultiBucketPriceCache();

setInterval(() => {
  const metrics = multiBucketPriceCache.getHealthMetrics();
  console.log(`[A4.R10][PriceCache][HEALTH] open=${metrics.openTrade} rtb=${metrics.readyToBuy} fx5=${metrics.fx5Snapshot} weight=${metrics.currentWeight}/${metrics.maxWeight} cache=${metrics.cacheSize}`);
}, 60000);
