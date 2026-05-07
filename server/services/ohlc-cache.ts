/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Batch 18: OHLC Data Cache
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Caches Kraken OHLC candle data with a configurable TTL to eliminate redundant
 * API calls. 60-minute candles only change once per hour when a new candle closes,
 * but the VTS runner (every 60s) and signal orchestrator (every 30s) were both
 * fetching fresh OHLC data for every symbol on every cycle — 60x more calls than
 * necessary.
 *
 * With a 5-minute TTL:
 *   - 300 pairs × 12 fetches/hr = 3,600 OHLC calls/hr (vs 18,000+ uncached)
 *   - Cache hits return instantly with 0 API calls
 *   - IMF caching in fetchOHLCForPair still runs on every VTS cycle (uses cached data)
 *
 * Design decisions:
 *   - Only caches standard (non-paginated) fetches. Historical backfills bypass cache.
 *   - Cache key is symbol+interval (not options-dependent — pagination is not cached).
 *   - Uses its own KrakenService instance (consistent with priceCache, vtsKrakenService).
 *   - Periodic cleanup removes entries older than 2×TTL.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { KrakenService } from '../exchanges/kraken/kraken.js';

/**
 * Mirror of KrakenOHLCData from kraken.ts (not exported there).
 * Used only for cache storage typing — consumers parse fields independently.
 */
interface OHLCCandle {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  vwap: string;
  volume: string;
  count: number;
  [key: string]: any;  // Allow additional fields from Kraken response
}

interface OHLCCacheEntry {
  ohlc: OHLCCandle[];
  last: number;
  fetchedAt: number;
}

const DEFAULT_TTL_MS = 300_000; // 5 minutes

class OHLCCache {
  private cache: Map<string, OHLCCacheEntry> = new Map();
  private krakenService: KrakenService;
  private readonly ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.krakenService = new KrakenService();
    this.ttlMs = ttlMs;

    // Periodic cleanup every 10 minutes — removes entries older than 2×TTL
    this.cleanupInterval = setInterval(() => this.cleanup(), 600_000);
    console.log(`[OHLCCache] Initialized with ${ttlMs / 1000}s TTL`);
  }

  private getCacheKey(symbol: string, interval: number): string {
    return `${symbol}_${interval}`;
  }

  /**
   * Get OHLC data for a symbol, returning cached data if fresh or fetching from Kraken if stale.
   *
   * Only standard (non-paginated, no 'since') fetches are cached. Historical/paginated
   * fetches bypass the cache entirely since they request different time ranges.
   */
  async getOHLCData(
    symbol: string,
    interval: number = 60,
    since?: number,
    options?: {
      paginationEnabled?: boolean;
      maxBatches?: number;
      paginationDelayMs?: number;
      maxCandlesTotal?: number;
      endTimestamp?: number;
    }
  ): Promise<{ ohlc: OHLCCandle[]; last: number }> {
    // Paginated or historical fetches bypass cache — different time ranges each call
    if (since || options?.paginationEnabled) {
      return this.krakenService.getOHLCData(symbol, interval, since, options);
    }

    const key = this.getCacheKey(symbol, interval);
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && (now - cached.fetchedAt) < this.ttlMs) {
      return { ohlc: cached.ohlc, last: cached.last };
    }

    // Cache miss or stale — fetch fresh from Kraken
    const result = await this.krakenService.getOHLCData(symbol, interval, undefined, options);

    if (result.ohlc && result.ohlc.length > 0) {
      this.cache.set(key, {
        ohlc: result.ohlc,
        last: result.last,
        fetchedAt: now,
      });
    }

    return result;
  }

  /**
   * Remove expired entries to prevent unbounded memory growth.
   * Called automatically every 10 minutes.
   */
  cleanup(): void {
    const now = Date.now();
    const expiry = this.ttlMs * 2;
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.fetchedAt > expiry) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[OHLCCache] Cleanup: removed ${removed} expired entries, ${this.cache.size} remaining`);
    }
  }

  /**
   * Cache diagnostics for health logging.
   */
  getStats(): { entries: number; hitRate: string } {
    return {
      entries: this.cache.size,
      hitRate: `TTL=${this.ttlMs / 1000}s`,
    };
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    console.log('[OHLCCache] Shutdown complete');
  }
}

export const ohlcCache = new OHLCCache();
