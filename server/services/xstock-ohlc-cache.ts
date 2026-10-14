/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-NEW-34 — xstock OHLC cache (5-min TTL, asset-class-scoped)
 * B-NEW-34b (2026-05-18) — snapshot-first cold read + narrow live overlay
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
 *   - Legacy cache depth follows the existing 15-min and 60-min caps.
 *     Revision-aware reads preserve the same bounded shape.
 *   - Re-roll cost on cache miss is cheap (single SQL with ANY($1))
 *
 * B-NEW-34b cold-read shape (RUNNING_ISSUES #118 pivot):
 *   - On cache miss for the 60-min interval, the cache reads the pre-aggregated
 *     xstock_spot_ohlc_60m_snapshot table FIRST (cheap PK-indexed scan), then
 *     calls the live aggregator with a NARROW 24h overlay window to capture
 *     the recent tail. Merge: live wins on bucket_ts collisions.
 *   - This eliminates the DISTINCT-ON-over-120h-of-duplicate-rows cost that
 *     made B-NEW-34a hotfix iterations all time out (#118).
 *   - 240-min is hard-refused until it has the same revision contract.
 *
 * Crypto regression: NONE by-construction (separate instance, separate code path).
 *
 * Reference: server/services/ohlc-cache.ts (the crypto/Kraken-REST equivalent)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import type { OHLCData } from '../types/market-regime.types.js';
import {
  aggregateXstockOHLC,
  type XstockAggregationInterval,
} from '../asset_classes/xstock_spot/ohlc-aggregator.js';
import {
  aggregateAvailableXstockOHLC,
  assertEligibleXstockAggregate,
  type XstockAvailabilityAggregate,
  type XstockAvailabilityInterval,
} from '../asset_classes/xstock_spot/availability-aggregator.js';
import { XSTOCK_BAR_AVAILABILITY_CONTRACT } from './passive-archive/xstock-bar-availability.js';

interface CacheEntry {
  bars: OHLCData[];
  fetchedAt: number;
}

interface AvailabilityCacheEntry {
  bars: XstockAvailabilityAggregate[];
  fetchedAt: number;
}

export interface XstockAvailabilityPrewarmResult {
  bucketsRead: number;
  eligibleBuckets: number;
  ineligibleBuckets: number;
  snapshotRowsWritten: number;
}

const DEFAULT_TTL_MS = 300_000; // 5 minutes — matches crypto ohlcCache

// B-NEW-34b (2026-05-18) — narrow overlay window for the live aggregator
// when the snapshot table is supplying the historical bars. 24h × 60 1m/h ×
// 75 syms × ~21× B74 dup ≈ 2.3M source rows pre-DISTINCT-ON — small enough
// that the dedup cost fits comfortably in the 25s scanner budget with margin
// for the rest of the cycle's work. The snapshot covers everything older
// than this window; live aggregator handles the recent tail.
//
// 24h is chosen so that the snapshot can be up to ~24h stale before any gap
// opens between snapshot's most-recent bucket and the live overlay's window.
// The cache's write-back-on-miss path keeps the snapshot fresh on every miss
// (~5 min TTL), and the future B-NEW-36 session-lifecycle controller will
// refresh the snapshot on Sun-night startup so cold-start cycles never see
// a stale snapshot at startup.
const NARROW_OVERLAY_HOURS_60M = 24;

// B-NEW-34b (2026-05-18) — write-back-on-miss row count.
//
// Langston Step 4 review (2026-05-18 night): align write-back with the
// live-overlay window. The narrow overlay computed NARROW_OVERLAY_HOURS_60M=24
// FRESH buckets — those are exactly the buckets where B74's late-arriving
// 1m duplicates could shift values meaningfully. Writing back fewer than 24
// leaves stale snapshot values for the buckets between the cutoff and the
// overlay edge. Writing back more is wasted IO (older buckets are immutable
// — their source 1m rows have settled).
//
// 75 syms × 24 buckets = 1,800 rows per cache-miss cycle, single multi-row
// INSERT with ON CONFLICT DO UPDATE. Trivial DB cost.
const WRITE_BACK_RECENT_BUCKETS = NARROW_OVERLAY_HOURS_60M;

// B.4 foundation (2026-06-03): the 60-min cache cap, named so the parameterized
// read/merge helpers below can be passed it explicitly. This is the exact value
// the 60-min path used as a bare `60` literal pre-B.4 (readSnapshotBars
// `rn <= 60`, mergeBars `slice(-60)`) — naming it changes no behavior. Mirrors
// MAX_BARS_60M in ohlc-aggregator.ts (the aggregator's own return-array cap).
const MAX_BARS_60M = 60;

// B.4 foundation (2026-06-03): 15-min evaluation-bar read path (additive,
// xStock-only). Mirrors the 60-min snapshot-first shape EXACTLY — only the
// snapshot table, the cache cap, the live-overlay window, and the write-back
// depth differ. The 60-min path above is untouched.
//
//   NARROW_OVERLAY_HOURS_15M = 6  → the live overlay window. 6h × 4 bars/h = 24
//     live bars, matching the 60-min branch's 24-bar overlay (24h × 1 bar/h).
//     Same "snapshot supplies history, live supplies the recent tail" shape;
//     same bucket-count of fresh live bars where B74's late-arriving 1m
//     duplicates could still shift values.
//   MAX_BARS_15M = 240  → the cache cap (most-recent N buckets per symbol). The
//     new xstock_spot_ohlc_15m_snapshot table holds up to ~240 buckets/symbol =
//     60h, sized to the deepest 15-min consumer DBS-192 (Langston Step-2
//     must-fix #1) + margin. Matches MAX_BARS_15M in ohlc-aggregator.ts.
//   WRITE_BACK_RECENT_BUCKETS_15M = 24  → write-back depth, aligned to the
//     live-overlay bucket count (same rationale as WRITE_BACK_RECENT_BUCKETS:
//     write back exactly the fresh-live buckets, no more, no less).
const NARROW_OVERLAY_HOURS_15M = 6;
const MAX_BARS_15M = 240;
const WRITE_BACK_RECENT_BUCKETS_15M = 24;

// B.4 foundation (2026-06-03): snapshot table names, kept as named constants so
// the parameterized read/write/merge helpers below stay table-agnostic and the
// 60-min path remains bit-identical (it passes the 60-min table + cap, the 15m
// path passes the 15m table + cap).
const SNAPSHOT_TABLE_60M = 'xstock_spot_ohlc_60m_snapshot';
const SNAPSHOT_TABLE_15M = 'xstock_spot_ohlc_15m_snapshot';

interface SnapshotRow {
  symbol: string;
  bucket_ts: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  source_bar_count: string | number;
}

interface AvailabilitySnapshotRow extends SnapshotRow {
  aggregate_revision_id: string | null;
  aggregate_hash: string | null;
  source_revision_set_hash: string | null;
  source_max_visible_by: string | null;
  source_max_visible_seq: number | string | null;
  read_observed_at: string | null;
  read_observed_seq: number | string | null;
  certificate_primary_identity: string | null;
  availability_contract_version: string | null;
  eligibility_state: string | null;
  source_revision_ids: string[] | null;
  persisted_symbol: string | null;
  persisted_interval_minutes: number | string | null;
  persisted_open: string | null;
  persisted_high: string | null;
  persisted_low: string | null;
  persisted_close: string | null;
  persisted_volume: string | null;
  persisted_source_bar_count: number | string | null;
  persisted_aggregate_hash: string | null;
  persisted_source_revision_set_hash: string | null;
  persisted_source_max_visible_by: string | null;
  persisted_source_max_visible_seq: number | string | null;
  persisted_certificate_primary_identity: string | null;
  persisted_contract_version: string | null;
  current_primary_identity: string;
}

class XstockOHLCCache {
  private cache: Map<string, CacheEntry> = new Map();
  private availabilityCache: Map<string, AvailabilityCacheEntry> = new Map();
  private readonly ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private hitCount = 0;
  private missCount = 0;
  // B-NEW-34b (2026-05-18) snapshot-path telemetry.
  private snapshotReadCount = 0;
  private snapshotReadBars = 0;
  private snapshotWriteBackCount = 0;

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
   *
   * B-NEW-34b: single-symbol path also goes through the snapshot-first read
   * for the 60-min interval. Delegates to getOHLCDataBatch so the snapshot
   * read + live overlay + merge + write-back logic stays in one place.
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

    // B-NEW-34b: delegate to the batched path so the snapshot-first logic
    // applies. The batched path will populate the cache for `symbol`.
    const result = await this.getOHLCDataBatch([symbol], intervalMinutes);
    return { bars: result.get(symbol) ?? [], cacheHit: false };
  }

  /**
   * Batched fetch — the hot path for the scanner cycle. Splits the rotation
   * symbol list into cache-hits (already fresh) and cache-misses.
   *
   * B-NEW-34b cold-miss shape (60-min only):
   *   1. Read snapshot table for missed symbols in ONE SQL (PK-indexed scan).
   *   2. Run live aggregator with NARROW 24h overlay window — captures the
   *      recent tail. Cheap vs the old 120h window because the dedup cost
   *      scales linearly with the window width.
   *   3. Merge per symbol: live overlay wins where the same bucket_ts is
   *      present in both. Sort ASC, cap to MAX_BARS_60M (60).
   *   4. Store the merged result in the cache.
   *   5. Write-back: UPSERT the most-recent N=24 buckets per symbol. This
   *      refreshes values on cache misses but does not claim provider
   *      currentness and does not provide snapshot-table retention.
   *
   * 240-min is now hard-refused before any cache lookup. It has no revision-
   * aware contract and therefore cannot silently return the legacy shape.
   *
   * B.4 foundation (2026-06-03): a 15-min branch mirrors the 60-min snapshot-
   * first shape EXACTLY (snapshot read → narrow live overlay → merge → cache
   * store -> write-back), against the xstock_spot_ohlc_15m_snapshot table with
   * the 15m constants (NARROW_OVERLAY_HOURS_15M, MAX_BARS_15M,
   * WRITE_BACK_RECENT_BUCKETS_15M). Additive and xStock-only.
   *
   * Per Langston R2#4 + B-NEW-34b: this is the call site that bounds per-
   * cycle DB cost at "1 snapshot SQL + 1 narrow live SQL + 1 write-back SQL"
   * regardless of universe size.
   */
  async getOHLCDataBatch(
    symbols: string[],
    intervalMinutes: XstockAggregationInterval,
  ): Promise<Map<string, OHLCData[]>> {
    if (intervalMinutes === 240) {
      throw new Error(
        '[B-XSTOCK-BAR-AVAILABILITY] xStock 240m is unsupported until its revision contract is migrated',
      );
    }
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

    // ════════════════════════════════════════════════════════════════════
    // B-NEW-34b 60-min snapshot-first path
    // ════════════════════════════════════════════════════════════════════
    if (intervalMinutes === 60) {
      // 1. Read snapshot rows for all missed symbols. Single SQL across the
      //    miss list — PK-indexed (symbol, bucket_ts), bounded to most-
      //    recent MAX_BARS_60M (60) per symbol via a window function.
      const snapshotBySymbol = await this.readSnapshotBars(misses, SNAPSHOT_TABLE_60M, MAX_BARS_60M);

      // 2. Live aggregator with NARROW overlay. Single SQL across all misses.
      const liveBySymbol = await aggregateXstockOHLC(misses, 60, NARROW_OVERLAY_HOURS_60M);

      // 3. Merge per symbol.
      const mergedBySymbol = new Map<string, OHLCData[]>();
      for (const symbol of misses) {
        const snap = snapshotBySymbol.get(symbol) ?? [];
        const live = liveBySymbol.get(symbol) ?? [];
        const merged = this.mergeBars(snap, live, MAX_BARS_60M);
        mergedBySymbol.set(symbol, merged);
        this.cache.set(this.getCacheKey(symbol, 60), { bars: merged, fetchedAt: now });
        result.set(symbol, merged);
      }

      // 4. Write-back: UPSERT the most-recent N buckets per symbol back to
      //    snapshot so subsequent cold reads find fresh data. Fire-and-
      //    forget — never blocks the hot path. Errors are logged but do
      //    not propagate (the cache and live result are already returned).
      void this.writeBackSnapshot(mergedBySymbol, SNAPSHOT_TABLE_60M, WRITE_BACK_RECENT_BUCKETS).catch((err) => {
        console.warn(
          `[B-NEW-34b][SNAPSHOT_WRITEBACK_ERROR] ${err instanceof Error ? err.message : err}`,
        );
      });

      return result;
    }

    // ════════════════════════════════════════════════════════════════════
    // B.4 foundation (2026-06-03) — 15-min snapshot-first path
    // ════════════════════════════════════════════════════════════════════
    // Mirrors the 60-min branch above EXACTLY in shape — only the snapshot
    // table (xstock_spot_ohlc_15m_snapshot), the cache cap (MAX_BARS_15M=240),
    // the live-overlay window (NARROW_OVERLAY_HOURS_15M=6 → 24 live bars), and
    // the write-back depth (WRITE_BACK_RECENT_BUCKETS_15M=24) differ. xStock-
    // only, additive: crypto/fx5 never reach this instance; 240-min is refused.
    // ════════════════════════════════════════════════════════════════════
    if (intervalMinutes === 15) {
      // 1. Read snapshot rows for all missed symbols. Single SQL across the
      //    miss list — PK-indexed (symbol, bucket_ts), bounded to most-
      //    recent MAX_BARS_15M (240) per symbol via a window function.
      const snapshotBySymbol = await this.readSnapshotBars(misses, SNAPSHOT_TABLE_15M, MAX_BARS_15M);

      // 2. Live aggregator with NARROW overlay. Single SQL across all misses.
      const liveBySymbol = await aggregateXstockOHLC(misses, 15, NARROW_OVERLAY_HOURS_15M);

      // 3. Merge per symbol.
      const mergedBySymbol = new Map<string, OHLCData[]>();
      for (const symbol of misses) {
        const snap = snapshotBySymbol.get(symbol) ?? [];
        const live = liveBySymbol.get(symbol) ?? [];
        const merged = this.mergeBars(snap, live, MAX_BARS_15M);
        mergedBySymbol.set(symbol, merged);
        this.cache.set(this.getCacheKey(symbol, 15), { bars: merged, fetchedAt: now });
        result.set(symbol, merged);
      }

      // 4. Write-back: UPSERT the most-recent N buckets per symbol back to
      //    snapshot so subsequent cold reads find fresh data. Fire-and-
      //    forget — never blocks the hot path. Errors are logged but do
      //    not propagate (the cache and live result are already returned).
      void this.writeBackSnapshot(mergedBySymbol, SNAPSHOT_TABLE_15M, WRITE_BACK_RECENT_BUCKETS_15M).catch((err) => {
        console.warn(
          `[B-NEW-34b][SNAPSHOT_WRITEBACK_ERROR] ${err instanceof Error ? err.message : err}`,
        );
      });

      return result;
    }

    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] unreachable xStock interval ${intervalMinutes}`,
    );
  }

  /**
   * Canonical availability-aware cache path for the later dual-read/enforcement
   * phases. It is additive in capture-only rollout: existing scanner and RTB
   * callers remain on getOHLCDataBatch until P8 switches both together.
   */
  async getAvailabilityDataBatch(
    symbols: string[],
    intervalMinutes: XstockAvailabilityInterval,
  ): Promise<Map<string, XstockAvailabilityAggregate[]>> {
    const result = new Map<string, XstockAvailabilityAggregate[]>();
    const misses: string[] = [];
    const now = Date.now();

    for (const symbol of symbols) {
      const key = this.getCacheKey(symbol, intervalMinutes);
      const cached = this.availabilityCache.get(key);
      if (cached && now - cached.fetchedAt < this.ttlMs) {
        result.set(symbol, cached.bars);
        this.hitCount++;
      } else {
        misses.push(symbol);
        this.missCount++;
      }
    }
    if (misses.length === 0) return result;

    const is15m = intervalMinutes === 15;
    const tableName = is15m ? SNAPSHOT_TABLE_15M : SNAPSHOT_TABLE_60M;
    const maxBars = is15m ? MAX_BARS_15M : MAX_BARS_60M;
    const lookbackHours = is15m ? NARROW_OVERLAY_HOURS_15M : NARROW_OVERLAY_HOURS_60M;
    const writeBackBuckets = is15m ? WRITE_BACK_RECENT_BUCKETS_15M : WRITE_BACK_RECENT_BUCKETS;

    const snapshotBySymbol = await this.readAvailabilitySnapshotBars(misses, tableName, maxBars, intervalMinutes);
    const liveBySymbol = await aggregateAvailableXstockOHLC(misses, intervalMinutes, lookbackHours);
    const mergedBySymbol = new Map<string, XstockAvailabilityAggregate[]>();
    for (const symbol of misses) {
      const merged = this.mergeAvailabilityBars(
        snapshotBySymbol.get(symbol) ?? [],
        liveBySymbol.get(symbol) ?? [],
        maxBars,
      );
      mergedBySymbol.set(symbol, merged);
      this.availabilityCache.set(this.getCacheKey(symbol, intervalMinutes), { bars: merged, fetchedAt: now });
      result.set(symbol, merged);
    }

    void this.writeBackAvailabilitySnapshot(mergedBySymbol, tableName, writeBackBuckets).catch((error) => {
      console.warn(
        `[B-XSTOCK-BAR-AVAILABILITY][SNAPSHOT_WRITEBACK_ERROR] `
        + `${error instanceof Error ? error.message : error}`,
      );
    });
    return result;
  }

  async getAvailabilityData(
    symbol: string,
    intervalMinutes: XstockAvailabilityInterval,
  ): Promise<{ bars: XstockAvailabilityAggregate[]; cacheHit: boolean }> {
    const key = this.getCacheKey(symbol, intervalMinutes);
    const cached = this.availabilityCache.get(key);
    const cacheHit = !!cached && Date.now() - cached.fetchedAt < this.ttlMs;
    const result = await this.getAvailabilityDataBatch([symbol], intervalMinutes);
    return { bars: result.get(symbol) ?? [], cacheHit };
  }

  /**
   * Restart/prewarm entry point. Unlike the hot cache path, this uses the full
   * caller-supplied lookback, caps the resulting snapshot window, and awaits
   * the exact-identity write before reporting success.
   */
  async prewarmAvailabilitySnapshot(
    symbol: string,
    intervalMinutes: XstockAvailabilityInterval,
    lookbackHours: number,
  ): Promise<XstockAvailabilityPrewarmResult> {
    const is15m = intervalMinutes === 15;
    const tableName = is15m ? SNAPSHOT_TABLE_15M : SNAPSHOT_TABLE_60M;
    const maxBars = is15m ? MAX_BARS_15M : MAX_BARS_60M;
    const fresh = await aggregateAvailableXstockOHLC([symbol], intervalMinutes, lookbackHours);
    const bars = (fresh.get(symbol) ?? []).slice(-maxBars);
    const eligibleBuckets = bars.filter((bar) => bar.eligibilityState === 'eligible_certified').length;
    const snapshotRowsWritten = await this.writeBackAvailabilitySnapshot(
      new Map([[symbol, bars]]),
      tableName,
      maxBars,
    );
    return {
      bucketsRead: bars.length,
      eligibleBuckets,
      ineligibleBuckets: bars.length - eligibleBuckets,
      snapshotRowsWritten,
    };
  }

  private async readAvailabilitySnapshotBars(
    symbols: string[],
    tableName: string,
    maxBars: number,
    intervalMinutes: XstockAvailabilityInterval,
  ): Promise<Map<string, XstockAvailabilityAggregate[]>> {
    const out = new Map<string, XstockAvailabilityAggregate[]>();
    for (const symbol of symbols) out.set(symbol, []);
    if (symbols.length === 0) return out;
    const symbolListSql = symbols.map((symbol) => `'${symbol.replace(/'/g, "''")}'`).join(',');
    const queryResult = await db.execute(sql`
      WITH primary_context AS (
        SELECT current_database() || '@' || COALESCE(inet_server_addr()::text, 'local') || ':'
          || COALESCE(inet_server_port()::text, 'local') || '/system:'
          || (SELECT system_identifier::text FROM pg_control_system()) AS primary_identity
      ),
      ranked AS (
        SELECT s.*,
          ROW_NUMBER() OVER (PARTITION BY s.symbol ORDER BY s.bucket_ts DESC) AS rn
        FROM ${sql.raw(tableName)} s
        WHERE s.symbol IN (${sql.raw(symbolListSql)})
      )
      SELECT r.symbol, r.bucket_ts, r.open, r.high, r.low, r.close, r.volume,
        r.source_bar_count, r.aggregate_revision_id, r.aggregate_hash,
        r.source_revision_set_hash,
        to_char(r.source_max_visible_by AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          AS source_max_visible_by,
        r.source_max_visible_seq,
        to_char(r.read_observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          AS read_observed_at,
        r.read_observed_seq, r.certificate_primary_identity,
        r.availability_contract_version, r.eligibility_state,
        a.source_revision_ids,
        a.symbol AS persisted_symbol,
        a.interval_minutes AS persisted_interval_minutes,
        a.open::text AS persisted_open,
        a.high::text AS persisted_high,
        a.low::text AS persisted_low,
        a.close::text AS persisted_close,
        a.volume::text AS persisted_volume,
        a.source_bar_count AS persisted_source_bar_count,
        a.aggregate_hash AS persisted_aggregate_hash,
        a.source_revision_set_hash AS persisted_source_revision_set_hash,
        to_char(a.source_max_visible_by AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          AS persisted_source_max_visible_by,
        a.source_max_visible_seq AS persisted_source_max_visible_seq,
        a.certificate_primary_identity AS persisted_certificate_primary_identity,
        a.contract_version AS persisted_contract_version,
        c.primary_identity AS current_primary_identity
      FROM ranked r
      CROSS JOIN primary_context c
      LEFT JOIN xstock_bar_aggregate_revision a
        ON a.aggregate_revision_id = r.aggregate_revision_id
       AND a.bucket_ts = r.bucket_ts
      WHERE r.rn <= ${sql.raw(String(maxBars))}
      ORDER BY r.symbol, r.bucket_ts ASC
    `);
    const rows: AvailabilitySnapshotRow[] = (queryResult as any).rows ?? queryResult;
    for (const row of rows) {
      const exactShape = row.aggregate_revision_id != null
        && row.aggregate_hash != null
        && row.source_revision_set_hash != null
        && row.source_max_visible_by != null
        && row.source_max_visible_seq != null
        && row.read_observed_at != null
        && row.read_observed_seq != null
        && row.certificate_primary_identity != null
        && row.availability_contract_version === XSTOCK_BAR_AVAILABILITY_CONTRACT
        && row.eligibility_state === 'eligible_certified'
        && Array.isArray(row.source_revision_ids)
        && row.source_revision_ids.length > 0
        && row.source_revision_ids.length === Number(row.source_bar_count)
        && row.persisted_symbol === row.symbol
        && Number(row.persisted_interval_minutes) === intervalMinutes
        && Number(row.persisted_open) === Number(row.open)
        && Number(row.persisted_high) === Number(row.high)
        && Number(row.persisted_low) === Number(row.low)
        && Number(row.persisted_close) === Number(row.close)
        && Number(row.persisted_volume) === Number(row.volume)
        && Number(row.persisted_source_bar_count) === Number(row.source_bar_count)
        && row.persisted_aggregate_hash === row.aggregate_hash
        && row.persisted_source_revision_set_hash === row.source_revision_set_hash
        && row.persisted_source_max_visible_by === row.source_max_visible_by
        && Number(row.persisted_source_max_visible_seq) === Number(row.source_max_visible_seq)
        && row.persisted_certificate_primary_identity === row.certificate_primary_identity
        && row.certificate_primary_identity === row.current_primary_identity
        && row.persisted_contract_version === XSTOCK_BAR_AVAILABILITY_CONTRACT;
      const bar: XstockAvailabilityAggregate = {
        symbol: row.symbol,
        intervalMinutes,
        timestamp: new Date(row.bucket_ts).getTime(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
        sourceBarCount: Number(row.source_bar_count),
        aggregateRevisionId: exactShape ? row.aggregate_revision_id : null,
        aggregateHash: exactShape ? row.aggregate_hash : null,
        sourceRevisionSetHash: exactShape ? row.source_revision_set_hash ?? '' : '',
        sourceRevisionIds: exactShape ? row.source_revision_ids ?? [] : [],
        sourceMaxVisibleBy: exactShape ? row.source_max_visible_by : null,
        sourceMaxVisibleSeq: exactShape ? Number(row.source_max_visible_seq) : null,
        readObservedAt: exactShape ? row.read_observed_at : null,
        readObservedSeq: exactShape ? Number(row.read_observed_seq) : null,
        certificatePrimaryIdentity: exactShape ? row.certificate_primary_identity : null,
        contractVersion: exactShape ? XSTOCK_BAR_AVAILABILITY_CONTRACT : null,
        eligibilityState: exactShape ? 'eligible_certified' : 'metadata_unknown_legacy',
        providerCurrentnessState: 'provider_currentness_unknown',
      };
      out.get(row.symbol)?.push(bar);
    }
    return out;
  }

  private mergeAvailabilityBars(
    snapshot: XstockAvailabilityAggregate[],
    live: XstockAvailabilityAggregate[],
    maxBars: number,
  ): XstockAvailabilityAggregate[] {
    const byTimestamp = new Map<number, XstockAvailabilityAggregate>();
    for (const bar of snapshot) byTimestamp.set(bar.timestamp, bar);
    // The newest raw winner always wins the label collision as one whole
    // object. If it is ineligible, the cache must not resurrect an older
    // certified snapshot revision for the same bucket.
    for (const bar of live) byTimestamp.set(bar.timestamp, bar);
    const merged = [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
    return merged.length > maxBars ? merged.slice(-maxBars) : merged;
  }

  private async writeBackAvailabilitySnapshot(
    mergedBySymbol: Map<string, XstockAvailabilityAggregate[]>,
    tableName: string,
    writeBackBuckets: number,
  ): Promise<number> {
    const values: string[] = [];
    for (const [symbol, bars] of mergedBySymbol) {
      for (const bar of bars.slice(-writeBackBuckets)) {
        if (bar.eligibilityState !== 'eligible_certified') continue;
        assertEligibleXstockAggregate(bar);
        if (bar.symbol !== symbol) {
          throw new Error('[B-XSTOCK-BAR-AVAILABILITY] snapshot map key/symbol mismatch');
        }
        const sym = symbol.replace(/'/g, "''");
        const primary = bar.certificatePrimaryIdentity.replace(/'/g, "''");
        values.push(
          `('${sym}', '${new Date(bar.timestamp).toISOString()}', ${bar.open}, ${bar.high}, ${bar.low}, `
          + `${bar.close}, ${bar.volume}, ${bar.sourceBarCount}, '${bar.aggregateRevisionId}'::uuid, `
          + `'${bar.aggregateHash}', '${bar.sourceRevisionSetHash}', `
          + `'${bar.sourceMaxVisibleBy.replace(/'/g, "''")}', ${bar.sourceMaxVisibleSeq}, `
          + `'${bar.readObservedAt.replace(/'/g, "''")}', ${bar.readObservedSeq}, '${primary}', `
          + `'${XSTOCK_BAR_AVAILABILITY_CONTRACT}', 'eligible_certified')`,
        );
      }
    }
    if (values.length === 0) return 0;

    await db.execute(sql`
      INSERT INTO ${sql.raw(tableName)} (
        symbol, bucket_ts, open, high, low, close, volume, source_bar_count,
        aggregate_revision_id, aggregate_hash, source_revision_set_hash,
        source_max_visible_by, source_max_visible_seq, read_observed_at,
        read_observed_seq, certificate_primary_identity,
        availability_contract_version, eligibility_state
      ) VALUES ${sql.raw(values.join(','))}
      ON CONFLICT (symbol, bucket_ts) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        source_bar_count = EXCLUDED.source_bar_count,
        aggregate_revision_id = EXCLUDED.aggregate_revision_id,
        aggregate_hash = EXCLUDED.aggregate_hash,
        source_revision_set_hash = EXCLUDED.source_revision_set_hash,
        source_max_visible_by = EXCLUDED.source_max_visible_by,
        source_max_visible_seq = EXCLUDED.source_max_visible_seq,
        read_observed_at = CASE
          WHEN ${sql.raw(tableName)}.aggregate_revision_id = EXCLUDED.aggregate_revision_id
            THEN ${sql.raw(tableName)}.read_observed_at
          ELSE EXCLUDED.read_observed_at
        END,
        read_observed_seq = CASE
          WHEN ${sql.raw(tableName)}.aggregate_revision_id = EXCLUDED.aggregate_revision_id
            THEN ${sql.raw(tableName)}.read_observed_seq
          ELSE EXCLUDED.read_observed_seq
        END,
        certificate_primary_identity = CASE
          WHEN ${sql.raw(tableName)}.aggregate_revision_id = EXCLUDED.aggregate_revision_id
            THEN ${sql.raw(tableName)}.certificate_primary_identity
          ELSE EXCLUDED.certificate_primary_identity
        END,
        availability_contract_version = EXCLUDED.availability_contract_version,
        eligibility_state = EXCLUDED.eligibility_state,
        captured_at = NOW()
    `);
    this.snapshotWriteBackCount += values.length;
    return values.length;
  }

  /**
   * B-NEW-34b — read the pre-aggregated buckets from snapshot for the supplied
   * symbol list. Single SQL, PK-indexed. Bounded to the most-recent `maxBars`
   * buckets per symbol via a window function.
   *
   * B.4 foundation (2026-06-03): parameterized on `tableName` + `maxBars` so the
   * 60-min and 15-min snapshot-first paths share one read helper. The 60-min
   * caller passes (xstock_spot_ohlc_60m_snapshot, MAX_BARS_60M=60) — bit-
   * identical to the pre-B.4 behavior; the 15-min caller passes
   * (xstock_spot_ohlc_15m_snapshot, MAX_BARS_15M=240). Both table names are
   * module-level named constants (not user input), so the sql.raw identifier
   * injection is safe.
   *
   * Returns a Map keyed by symbol. Symbols absent from the snapshot table
   * (e.g., new ticker added to XSTOCK_SPOT_REGISTRY before its first pre-
   * warm run) get an empty array — the merge with live overlay still works.
   */
  private async readSnapshotBars(
    symbols: string[],
    tableName: string,
    maxBars: number,
  ): Promise<Map<string, OHLCData[]>> {
    const out = new Map<string, OHLCData[]>();
    for (const s of symbols) out.set(s, []);
    if (symbols.length === 0) return out;

    // Inline IN-literal — same pattern as ohlc-aggregator.ts:222 (drizzle
    // sql template doesn't auto-bind JS arrays to postgres array params).
    // Safe: symbol list sourced from XSTOCK_SPOT_REGISTRY (hardcoded const),
    // not user input. Single-quote-escape per entry.
    //
    // TODO B-NEW-35: switch to `WHERE symbol = ANY($1::text[])` once we
    // refactor the surrounding write paths. Drizzle parameterizes arrays
    // when passed natively; the current sql.raw shape is hygiene debt
    // (Langston Step 4 Finding 1, 2026-05-18). Functionally safe today
    // because xStock symbols are an uppercase-ticker hardcoded set.
    const symbolListSql = symbols.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    // Window-function shape: rank rows by bucket_ts DESC per symbol, keep
    // top `maxBars`. Postgres uses the (symbol, bucket_ts DESC) index for the
    // partitioned ordering — backward index scan, no sort step.
    // B.4 foundation (2026-06-03): table name + cap are parameters (named-
    // constant table → sql.raw is safe; maxBars is an integer literal).
    const dbStart = Date.now();
    const result: any = await db.execute(sql`
      WITH ranked AS (
        SELECT
          symbol,
          bucket_ts,
          open, high, low, close, volume, source_bar_count,
          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY bucket_ts DESC) AS rn
        FROM ${sql.raw(tableName)}
        WHERE symbol IN (${sql.raw(symbolListSql)})
      )
      SELECT symbol, bucket_ts, open, high, low, close, volume, source_bar_count
      FROM ranked
      WHERE rn <= ${sql.raw(String(maxBars))}
      ORDER BY symbol, bucket_ts ASC
    `);
    const dbMs = Date.now() - dbStart;

    const rows: SnapshotRow[] = (result as any).rows ?? result;
    if (!Array.isArray(rows) || rows.length === 0) {
      this.snapshotReadCount++;
      return out;
    }

    for (const r of rows) {
      const bar: OHLCData = {
        open: parseFloat(r.open as any),
        high: parseFloat(r.high as any),
        low: parseFloat(r.low as any),
        close: parseFloat(r.close as any),
        volume: parseFloat(r.volume as any),
        timestamp: new Date(r.bucket_ts).getTime(),
      };
      const list = out.get(r.symbol);
      if (list) list.push(bar);
    }

    let totalBars = 0;
    for (const list of out.values()) totalBars += list.length;
    this.snapshotReadCount++;
    this.snapshotReadBars += totalBars;
    console.log(
      `[B-NEW-34b][SNAPSHOT_READ] symbols=${symbols.length} bars=${totalBars} db_ms=${dbMs}`,
    );

    return out;
  }

  /**
   * B-NEW-34b — merge snapshot bars + live overlay bars per symbol.
   * Live wins on bucket_ts collision (live overlay reflects the freshest
   * 1m source data; snapshot rows may have been written hours/days ago).
   * Sort ASC by timestamp, cap to `maxBars` (most-recent).
   *
   * B.4 foundation (2026-06-03): `maxBars` is a parameter so the 60-min path
   * caps at MAX_BARS_60M=60 (bit-identical to pre-B.4) and the 15-min path
   * caps at MAX_BARS_15M=240.
   */
  private mergeBars(snap: OHLCData[], live: OHLCData[], maxBars: number): OHLCData[] {
    if (snap.length === 0 && live.length === 0) return [];
    const byTs = new Map<number, OHLCData>();
    for (const b of snap) byTs.set(b.timestamp, b);
    // Live overrides — same timestamp wins for live.
    for (const b of live) byTs.set(b.timestamp, b);
    const merged = Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp);
    if (merged.length > maxBars) {
      return merged.slice(merged.length - maxBars);
    }
    return merged;
  }

  /**
   * B-NEW-34b — UPSERT the most-recent N buckets per symbol back to the
   * snapshot table. Single multi-row INSERT with ON CONFLICT DO UPDATE.
   * Fire-and-forget caller; errors logged but do not propagate.
   *
   * B.4 foundation (2026-06-03): parameterized on `tableName` +
   * `writeBackBuckets` so the 60-min and 15-min paths share one write helper.
   * The 60-min caller passes (xstock_spot_ohlc_60m_snapshot,
   * WRITE_BACK_RECENT_BUCKETS=24) — bit-identical to the pre-B.4 behavior; the
   * 15-min caller passes (xstock_spot_ohlc_15m_snapshot,
   * WRITE_BACK_RECENT_BUCKETS_15M=24). The table name is a module-level named
   * constant (not user input), so the sql.raw identifier injection is safe.
   */
  private async writeBackSnapshot(
    mergedBySymbol: Map<string, OHLCData[]>,
    tableName: string,
    writeBackBuckets: number,
  ): Promise<void> {
    // Build the VALUES list of (symbol, bucket_ts, open, high, low, close,
    // volume) tuples. source_bar_count is unknown at this point (would
    // require re-running DISTINCT ON or threading the count from the
    // aggregator) — write 0 as a forensic sentinel meaning "live overlay,
    // not freshly counted". The pre-warm script writes the real count.
    //
    // Verified no consumer (server/) reads source_bar_count for filtering
    // or decisioning — it's forensic-only. Per Langston Step 4 Q2 ACK.
    // The ON CONFLICT DO UPDATE intentionally OMITS source_bar_count so
    // pre-warm's real count is PRESERVED when a later live-overlay write-
    // back collides on the same (symbol, bucket_ts).
    //
    // TODO B-NEW-35: parameterize this multi-row INSERT (currently sql.raw'd
    // for VALUES — same hygiene debt as snapshot read; Langston Step 4
    // Finding 1, 2026-05-18). Functionally safe today: numerics originate
    // from OHLCData (typed `number`), symbol is registry-sourced.
    const valuesLiteralParts: string[] = [];
    for (const [symbol, bars] of mergedBySymbol) {
      if (bars.length === 0) continue;
      const tail = bars.slice(Math.max(0, bars.length - writeBackBuckets));
      for (const b of tail) {
        if (!Number.isFinite(b.open) || !Number.isFinite(b.close)) continue;
        const ts = new Date(b.timestamp).toISOString();
        // SQL-safe literal build: symbol single-quote-escaped, numerics
        // inline because they originate from a typed OHLCData (no user
        // input surface).
        const symEsc = symbol.replace(/'/g, "''");
        valuesLiteralParts.push(
          `('${symEsc}', '${ts}', ${b.open}, ${b.high}, ${b.low}, ${b.close}, ${b.volume}, 0)`,
        );
      }
    }
    if (valuesLiteralParts.length === 0) return;

    const dbStart = Date.now();
    await db.execute(sql`
      INSERT INTO ${sql.raw(tableName)}
        (symbol, bucket_ts, open, high, low, close, volume, source_bar_count)
      VALUES ${sql.raw(valuesLiteralParts.join(','))}
      ON CONFLICT (symbol, bucket_ts) DO UPDATE SET
        open             = EXCLUDED.open,
        high             = EXCLUDED.high,
        low              = EXCLUDED.low,
        close            = EXCLUDED.close,
        volume           = EXCLUDED.volume,
        captured_at      = NOW()
    `);
    const dbMs = Date.now() - dbStart;
    this.snapshotWriteBackCount += valuesLiteralParts.length;
    console.log(
      `[B-NEW-34b][SNAPSHOT_WRITEBACK] rows=${valuesLiteralParts.length} db_ms=${dbMs}`,
    );
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
    for (const [key, entry] of this.availabilityCache) {
      if (now - entry.fetchedAt > expiryMs) {
        this.availabilityCache.delete(key);
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
   *
   * B-NEW-34b adds snapshot-path counters (snapshotReadCount,
   * snapshotReadBars, snapshotWriteBackCount) so the cold-read shape is
   * observable in scanner cycle logs and (future) /api/xstocks/filter-
   * diagnostics endpoint.
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRatePct: number;
    snapshotReadCount: number;
    snapshotReadBars: number;
    snapshotWriteBackCount: number;
  } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRatePct: total > 0 ? Math.round((this.hitCount * 1000) / total) / 10 : 0,
      snapshotReadCount: this.snapshotReadCount,
      snapshotReadBars: this.snapshotReadBars,
      snapshotWriteBackCount: this.snapshotWriteBackCount,
    };
  }

  /**
   * Test-only — clear all cache state. Used by unit tests for clean slate.
   * NOT called from production code.
   */
  _resetForTests(): void {
    this.cache.clear();
    this.availabilityCache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.snapshotReadCount = 0;
    this.snapshotReadBars = 0;
    this.snapshotWriteBackCount = 0;
  }
}

export const xstockOhlcCache = new XstockOHLCCache();

// Re-export the interval type for callers that import the cache singleton.
export type { XstockAggregationInterval };
