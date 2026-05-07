/**
 * 🔒 LOCKED MODULE — DO NOT MODIFY
 * Directive: 8.8.4-A4.R10R-4 (Core System Hardening)
 * Owner: Dawn Trader Core
 * Summary: This module is production-locked. Changes require a formal directive.
 * 
 * Previous: A4.R10R-1 — Unified, Rate-Governed Price Cache
 * 
 * This service consolidates all price retrieval logic for:
 * - Open trades (2s refresh)
 * - Ready-to-Buy signals (15s refresh)
 * - FX5 snapshots (30s refresh)
 * 
 * Responsibilities:
 *  - Manage three priority buckets with distinct refresh intervals.
 *  - Maintain Kraken API load below 10 weighted requests/second.
 *  - Provide universal subscription/unsubscription API.
 *  - Deliver cached prices to all consuming modules.
 * 
 * A4.R10R-1: Uses canonical normalizeToInternalSymbol from kraken-symbol-resolver.
 */

import { KrakenService } from '../exchanges/kraken/kraken.js';
import { normalizeToInternalSymbol as normalizeKrakenPair } from '../markets/kraken-symbol-resolver';

export type PriceSourceTag = 'kraken_ws' | 'kraken_rest';

/**
 * Directive 11.0E.2: Added 'vtsSimulation' bucket for cache sandboxing
 * VTS simulations use isolated cache to prevent pollution of live data
 */
export type CacheBucketType = 'openTrade' | 'readyToBuy' | 'fx5Snapshot' | 'vtsSimulation';

interface CacheBucket {
  type: CacheBucketType;
  symbols: Set<string>;
  refreshIntervalMs: number;
  lastRefresh: number;
}

export interface CachedPrice {
  symbol: string;
  price: number;
  ask: number;
  bid: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  lastSource: PriceSourceTag;
  lastUpdatedAt: number;
}

class UnifiedPriceCache {
  /**
   * Directive 11.0E.2: Added vtsSimulation bucket (60s refresh) for cache sandboxing
   * VTS data isolation prevents simulation from affecting live trading cache
   */
  private buckets: CacheBucket[] = [
    { type: 'openTrade', symbols: new Set(), refreshIntervalMs: 2000, lastRefresh: 0 },
    { type: 'readyToBuy', symbols: new Set(), refreshIntervalMs: 15000, lastRefresh: 0 },
    { type: 'fx5Snapshot', symbols: new Set(), refreshIntervalMs: 30000, lastRefresh: 0 },
    { type: 'vtsSimulation', symbols: new Set(), refreshIntervalMs: 60000, lastRefresh: 0 }
  ];

  private cache: Map<string, CachedPrice> = new Map();
  private currentWeight = 0;
  private refreshing = false;
  private krakenService: KrakenService;
  private weightResetInterval: NodeJS.Timeout | null = null;
  private refreshLoopInterval: NodeJS.Timeout | null = null;
  private healthLogInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private readonly MAX_WEIGHT_PER_SECOND = 10;
  private readonly BATCH_SIZE = 100;

  constructor() {
    this.krakenService = new KrakenService();
  }

  initialize(): void {
    if (this.isInitialized) {
      console.log('[A4.R10R-1][PriceCache] Already initialized');
      return;
    }

    this.weightResetInterval = setInterval(() => {
      this.currentWeight = 0;
    }, 1000);

    this.refreshLoopInterval = setInterval(() => {
      this.refreshBuckets().catch(err => {
        console.error('[A4.R10R-1][PriceCache] Refresh error:', err.message);
      });
    }, 1000);

    this.healthLogInterval = setInterval(() => {
      const open = this.buckets[0].symbols.size;
      const rtb = this.buckets[1].symbols.size;
      const fx5 = this.buckets[2].symbols.size;
      const vts = this.buckets[3].symbols.size;
      console.log(`[A4.R10R-1][PriceCache][HEALTH] open=${open} rtb=${rtb} fx5=${fx5} vts=${vts} weight=${this.currentWeight}/${this.MAX_WEIGHT_PER_SECOND} cacheSize=${this.cache.size}`);
    }, 60000);

    this.isInitialized = true;
    console.log('[A4.R10R-1][PriceCache] Initialized with 4 buckets (openTrade=2s, readyToBuy=15s, fx5Snapshot=30s, vtsSimulation=60s)');
  }

  shutdown(): void {
    if (this.weightResetInterval) {
      clearInterval(this.weightResetInterval);
      this.weightResetInterval = null;
    }
    if (this.refreshLoopInterval) {
      clearInterval(this.refreshLoopInterval);
      this.refreshLoopInterval = null;
    }
    if (this.healthLogInterval) {
      clearInterval(this.healthLogInterval);
      this.healthLogInterval = null;
    }
    this.isInitialized = false;
    console.log('[A4.R10R-1][PriceCache] Shutdown complete');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async safeFetch<T>(weight: number, fn: () => Promise<T>): Promise<T> {
    const maxRetries = 20;
    let retries = 0;

    while (this.currentWeight + weight > this.MAX_WEIGHT_PER_SECOND && retries < maxRetries) {
      await this.delay(250);
      retries++;
    }

    if (retries >= maxRetries) {
      throw new Error('[A4.R10R-1] Rate limit budget exhausted after max retries');
    }

    this.currentWeight += weight;
    return fn();
  }

  private async refreshBuckets(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;

    const now = Date.now();

    try {
      for (const bucket of this.buckets) {
        if (now - bucket.lastRefresh >= bucket.refreshIntervalMs && bucket.symbols.size > 0) {
          await this.refreshBucket(bucket, now);
        }
      }
    } finally {
      this.refreshing = false;
    }
  }

  private async refreshBucket(bucket: CacheBucket, now: number): Promise<void> {
    const symbols = Array.from(bucket.symbols);
    
    for (let i = 0; i < symbols.length; i += this.BATCH_SIZE) {
      const batch = symbols.slice(i, i + this.BATCH_SIZE);
      const pairString = batch.map(s => this.toKrakenSymbol(s)).join(',');
      
      try {
        await this.safeFetch(1, async () => {
          const data = await this.krakenService.getTicker(pairString);
          
          for (const [pair, ticker] of Object.entries(data)) {
            const normalizedSymbol = normalizeKrakenPair(pair);
            const cachedPrice: CachedPrice = {
              symbol: normalizedSymbol,
              price: parseFloat(ticker.c?.[0] || '0'),
              ask: parseFloat(ticker.a?.[0] || '0'),
              bid: parseFloat(ticker.b?.[0] || '0'),
              volume24h: parseFloat(ticker.v?.[1] || '0'),
              high24h: parseFloat(ticker.h?.[1] || '0'),
              low24h: parseFloat(ticker.l?.[1] || '0'),
              lastSource: 'kraken_rest',
              lastUpdatedAt: now,
            };
            
            this.cache.set(normalizedSymbol, cachedPrice);
            
            const requestedSymbol = batch.find(s => this.symbolsMatch(s, normalizedSymbol));
            if (requestedSymbol && requestedSymbol !== normalizedSymbol) {
              this.cache.set(requestedSymbol, cachedPrice);
            }
          }
          
          console.log(`[A4.R10R-1][PriceCache][${bucket.type}] refreshed ${batch.length} symbols`);
        });
      } catch (err: any) {
        console.warn(`[A4.R10R-1][PriceCache][${bucket.type}] Batch fetch error:`, err.message);
      }
    }

    bucket.lastRefresh = now;
  }

  private toKrakenSymbol(symbol: string): string {
    const parts = symbol.split('/');
    if (parts.length !== 2) return symbol;
    
    let [base, quote] = parts;
    
    if (base === 'BTC') base = 'XBT';
    
    return `${base}${quote}`;
  }

  private symbolsMatch(a: string, b: string): boolean {
    const normalizeA = normalizeKrakenPair(a);
    const normalizeB = normalizeKrakenPair(b);
    return normalizeA === normalizeB;
  }

  subscribe(symbol: string, bucketType: CacheBucketType): void {
    const bucket = this.buckets.find(b => b.type === bucketType);
    if (!bucket) {
      console.warn(`[A4.R10R-1][PriceCache] Invalid bucket type: ${bucketType}`);
      return;
    }
    bucket.symbols.add(symbol);
    console.log(`[A4.R10R-1][PriceCache] Subscribed ${symbol} to ${bucketType} (total: ${bucket.symbols.size})`);
  }

  unsubscribe(symbol: string): void {
    for (const bucket of this.buckets) {
      bucket.symbols.delete(symbol);
    }
  }

  unsubscribeFrom(symbol: string, bucketType: CacheBucketType): void {
    const bucket = this.buckets.find(b => b.type === bucketType);
    if (bucket) {
      bucket.symbols.delete(symbol);
    }
  }

  getCachedPrice(symbol: string): CachedPrice | null {
    return this.cache.get(symbol) || null;
  }

  async getPrice(symbol: string, bucketType: CacheBucketType = 'readyToBuy'): Promise<CachedPrice | null> {
    const bucket = this.buckets.find(b => b.type === bucketType);
    const refreshInterval = bucket?.refreshIntervalMs ?? 15000;
    
    const cached = this.cache.get(symbol);
    const now = Date.now();
    
    const isFresh = cached && (now - cached.lastUpdatedAt) < refreshInterval;
    
    if (isFresh) {
      return cached;
    }
    
    if (!bucket?.symbols.has(symbol)) {
      this.subscribe(symbol, bucketType);
    }
    
    try {
      let fetchedData: CachedPrice | null = null;
      
      await this.safeFetch(1, async () => {
        const krakenSymbol = this.toKrakenSymbol(symbol);
        const data = await this.krakenService.getTicker(krakenSymbol);
        
        for (const [pair, ticker] of Object.entries(data)) {
          const normalizedSymbol = normalizeKrakenPair(pair);
          const tickerData: CachedPrice = {
            symbol: normalizedSymbol,
            price: parseFloat(ticker.c?.[0] || '0'),
            ask: parseFloat(ticker.a?.[0] || '0'),
            bid: parseFloat(ticker.b?.[0] || '0'),
            volume24h: parseFloat(ticker.v?.[1] || '0'),
            high24h: parseFloat(ticker.h?.[1] || '0'),
            low24h: parseFloat(ticker.l?.[1] || '0'),
            lastSource: 'kraken_rest',
            lastUpdatedAt: now,
          };
          
          this.cache.set(normalizedSymbol, tickerData);
          
          if (normalizedSymbol === symbol || this.symbolsMatch(normalizedSymbol, symbol)) {
            this.cache.set(symbol, tickerData);
            fetchedData = tickerData;
          }
        }
      });
      
      return fetchedData || this.cache.get(symbol) || null;
    } catch (err: any) {
      console.warn(`[A4.R10R-1][PriceCache] getPrice error for ${symbol}:`, err.message);
      return cached || null;
    }
  }

  getAllCachedPrices(): CachedPrice[] {
    return Array.from(this.cache.values());
  }

  /**
   * A4.R10R-1: Check if a symbol exists in the cache
   */
  has(symbol: string): boolean {
    return this.cache.has(symbol);
  }

  /**
   * A4.R10R-1: Batch retrieval for FX5 integration
   * Returns cached prices for a list of symbols, fetching missing ones if needed
   */
  async getBatch(bucketType: CacheBucketType, symbols: string[]): Promise<Map<string, CachedPrice>> {
    const result = new Map<string, CachedPrice>();
    const bucket = this.buckets.find(b => b.type === bucketType);
    const refreshInterval = bucket?.refreshIntervalMs ?? 30000;
    const now = Date.now();
    const missingSymbols: string[] = [];

    for (const symbol of symbols) {
      const cached = this.cache.get(symbol);
      const isFresh = cached && (now - cached.lastUpdatedAt) < refreshInterval;
      
      if (isFresh) {
        result.set(symbol, cached);
      } else {
        missingSymbols.push(symbol);
        if (bucket && !bucket.symbols.has(symbol)) {
          bucket.symbols.add(symbol);
        }
      }
    }

    if (missingSymbols.length > 0) {
      try {
        for (let i = 0; i < missingSymbols.length; i += this.BATCH_SIZE) {
          const batch = missingSymbols.slice(i, i + this.BATCH_SIZE);
          const pairString = batch.map(s => this.toKrakenSymbol(s)).join(',');
          
          await this.safeFetch(1, async () => {
            const data = await this.krakenService.getTicker(pairString);
            
            for (const [pair, ticker] of Object.entries(data)) {
              const normalizedSymbol = normalizeKrakenPair(pair);
              const tickerData: CachedPrice = {
                symbol: normalizedSymbol,
                price: parseFloat(ticker.c?.[0] || '0'),
                ask: parseFloat(ticker.a?.[0] || '0'),
                bid: parseFloat(ticker.b?.[0] || '0'),
                volume24h: parseFloat(ticker.v?.[1] || '0'),
                high24h: parseFloat(ticker.h?.[1] || '0'),
                low24h: parseFloat(ticker.l?.[1] || '0'),
                lastSource: 'kraken_rest',
                lastUpdatedAt: now,
              };
              
              this.cache.set(normalizedSymbol, tickerData);
              result.set(normalizedSymbol, tickerData);
              
              const requestedSymbol = batch.find(s => this.symbolsMatch(s, normalizedSymbol));
              if (requestedSymbol && requestedSymbol !== normalizedSymbol) {
                this.cache.set(requestedSymbol, tickerData);
                result.set(requestedSymbol, tickerData);
              }
            }
          });
        }
        console.log(`[A4.R10R-1][PriceCache][getBatch] Fetched ${missingSymbols.length} missing symbols for ${bucketType}`);
      } catch (err: any) {
        console.warn(`[A4.R10R-1][PriceCache][getBatch] Error fetching batch:`, err.message);
      }
    }

    return result;
  }

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

  updateFromWebSocket(symbol: string, price: number): void {
    const now = Date.now();
    const existing = this.cache.get(symbol);
    this.cache.set(symbol, {
      symbol,
      price,
      ask: existing?.ask ?? price,
      bid: existing?.bid ?? price,
      volume24h: existing?.volume24h ?? 0,
      high24h: existing?.high24h ?? price,
      low24h: existing?.low24h ?? price,
      lastSource: 'kraken_ws',
      lastUpdatedAt: now,
    });
  }

  updateFromRest(symbol: string, price: number): void {
    const now = Date.now();
    const existing = this.cache.get(symbol);
    this.cache.set(symbol, {
      symbol,
      price,
      ask: existing?.ask ?? price,
      bid: existing?.bid ?? price,
      volume24h: existing?.volume24h ?? 0,
      high24h: existing?.high24h ?? price,
      low24h: existing?.low24h ?? price,
      lastSource: 'kraken_rest',
      lastUpdatedAt: now,
    });
  }

  get(symbol: string): CachedPrice | null {
    return this.cache.get(symbol) ?? null;
  }

  snapshot(): CachedPrice[] {
    return Array.from(this.cache.values());
  }

  clear(): void {
    this.cache.clear();
  }
}

export const priceCache = new UnifiedPriceCache();
