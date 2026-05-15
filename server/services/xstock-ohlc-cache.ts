/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-NEW-34 — xstock OHLC cache (5-min TTL, asset-class-scoped)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Wraps `aggregateXstockOHLC` with a 5-minute TTL cache. Mirrors the crypto
 * `ohlcCache` shape (key = `${symbol}_${interval}`, 5-min TTL, periodic
 * cleanup) but backed by local DB aggregation instead of Kraken REST.
 *
 * Asset-class-scoped by construction: this instance only ever holds xstock
 * data. The 5 collision symbols (CVX, DASH, MET, OPEN, SUI per
 * `XSTOCK_SPOT_KRAKEN_COLLISIONS`) are non-issues here because crypto's
 * `ohlcCache` never sees this instance and vice versa. Canonical `BASE/USD`
 * keys work fine within the xstock-scoped cache — no x-suffix needed at this
 * layer (B-NEW-34 design ask Round 2 §1.2).
 *
 * Architecture per Langston R2 + R3:
 *   - Separate cache instance (R2 Q1 flip from "shared concur" — see R2 §2)
 *   - Cache depth: 200 bars (60-min) + 60 bars (240-min) per symbol per
 *     interval (R2#5) — aggregator naturally caps the return
 *   - Re-roll cost on cache miss is cheap (single SQL with ANY($1))
 *
 * Crypto regression: NONE by-construction (separate instance, separate code path).
 *
 * Reference: server/services/ohlc-cache.ts (the crypto/Kraken-REST equivalent)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData } from '../types/market-regime.types.js';
import {
  aggregateXstockOHLC,
  type XstockAggregationInterval,
} from '../asset_classes/xstock_spot/ohlc-aggregator.js';

interface CacheEntry {
  bars: OHLCData[];
  fetchedAt: number;
}

const DEFAULT_TTL_MS = 300_000; // 5 minutes — matches crypto ohlcCache

class XstockOHLCCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private hitCount = 0;
  private missCount = 0;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    // Periodic cleanup mirrors crypto ohlcCache — every 10 min, drop entries
    // older than 2× TTL. Keeps memory bounded under universe churn.
    this.cleanupInterval = setInterval(() => this.cleanup(), 600_000);
    console.log(`[B-NEW-34][xstockOhlcCache] Initialized with ${ttlMs / 1000}s TTL`);
  }

  private getCacheKey(symbol: string, intervalMinutes: number): string {
    return `${symbol}_${intervalMinutes}`;
  }

  /**
   * Get OHLC bars for a single symbol at the requested interval. Returns
   * cached data if fresh (<TTL); otherwise re-rolls from `xstock_spot_ohlc_1m`
   * via the aggregator (single SQL).
   *
   * Empty arrays are valid cache values — represent "rolled up the source,
   * no data exists" (e.g., during US market close for an ARCA-aligned name).
   * Caller filters on `bars.length` (see global-filter / pattern-filter
   * `min_ohlc_history_bars` floor).
   */
  async getOHLCData(
    symbol: string,
    intervalMinutes: XstockAggregationInterval,
  ): Promise<{ bars: OHLCData[]; cacheHit: boolean }> {
    const key = this.getCacheKey(symbol, intervalMinutes);
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < this.ttlMs) {
      this.hitCount++;
      return { bars: cached.bars, cacheHit: true };
    }

    this.missCount++;
    // Single-symbol miss: re-roll just this one. The scanner uses
    // getOHLCDataBatch (below) for the rotation batch to amortize round-trips.
    const m = await aggregateXstockOHLC([symbol], intervalMinutes);
    const bars = m.get(symbol) ?? [];
    this.cache.set(key, { bars, fetchedAt: now });
    return { bars, cacheHit: false };
  }

  /**
   * Batched fetch — the hot path for the scanner cycle. Splits the rotation
   * symbol list into cache-hits (already fresh) and cache-misses (need re-roll).
   * Misses get rolled up in ONE SQL round-trip per interval via the aggregator.
   *
   * Returns a Map keyed by symbol. Cached entries are returned directly;
   * freshly-rolled entries are stored in the cache before returning.
   *
   * Per Langston R2#4: this is the call site that makes the 75-pair-per-cycle
   * cost bounded at 1 SQL round-trip per interval (vs 75 if we called the
   * single-symbol path in a loop).
   */
  async getOHLCDataBatch(
    symbols: string[],
    intervalMinutes: XstockAggregationInterval,
  ): Promise<Map<string, OHLCData[]>> {
    const result = new Map<string, OHLCData[]>();
    const misses: string[] = [];
    const now = Date.now();

    for (const symbol of symbols) {
      const key = this.getCacheKey(symbol, intervalMinutes);
      const cached = this.cache.get(key);
      if (cached && now - cached.fetchedAt < this.ttlMs) {
        result.set(symbol, cached.bars);
        this.hitCount++;
      } else {
        misses.push(symbol);
        this.missCount++;
      }
    }

    if (misses.length === 0) return result;

    // R2#4: single SQL for all misses
    const fresh = await aggregateXstockOHLC(misses, intervalMinutes);
    for (const [symbol, bars] of fresh) {
      this.cache.set(this.getCacheKey(symbol, intervalMinutes), { bars, fetchedAt: now });
      result.set(symbol, bars);
    }

    return result;
  }

  /**
   * Periodic cleanup. Removes entries older than 2× TTL so memory stays
   * bounded even if scanner stops querying a symbol (e.g., universe shrinks).
   */
  cleanup(): void {
    const now = Date.now();
    const expiryMs = this.ttlMs * 2;
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.fetchedAt > expiryMs) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[B-NEW-34][xstockOhlcCache] Cleanup removed ${removed} stale entries; ${this.cache.size} remain`);
    }
  }

  /**
   * Diagnostic stats. Surfaced via a single aggregate `[B-NEW-34][AGGREGATOR]`
   * log line per scanner cycle (scanner.ts emits cache_hit_rate + size + db_ms
   * once per cycle rather than per call — quieter and more readable than
   * per-hit/per-miss lines). Langston Step 4 R4 docstring correction.
   */
  getStats(): { size: number; hits: number; misses: number; hitRatePct: number } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRatePct: total > 0 ? Math.round((this.hitCount * 1000) / total) / 10 : 0,
    };
  }

  /**
   * Test-only — clear all cache state. Used by unit tests for clean slate.
   * NOT called from production code.
   */
  _resetForTests(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }
}

export const xstockOhlcCache = new XstockOHLCCache();

// Re-export the interval type for callers that import the cache singleton.
export type { XstockAggregationInterval };
