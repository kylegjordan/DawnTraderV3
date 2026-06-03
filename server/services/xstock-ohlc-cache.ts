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
 *   - Cache depth: 200 bars (60-min) + 60 bars (240-min) per symbol per
 *     interval (R2#5) — aggregator naturally caps the return
 *   - Re-roll cost on cache miss is cheap (single SQL with ANY($1))
 *
 * B-NEW-34b cold-read shape (RUNNING_ISSUES #118 pivot):
 *   - On cache miss for the 60-min interval, the cache reads the pre-aggregated
 *     xstock_spot_ohlc_60m_snapshot table FIRST (cheap PK-indexed scan), then
 *     calls the live aggregator with a NARROW 24h overlay window to capture
 *     the recent tail. Merge: live wins on bucket_ts collisions.
 *   - This eliminates the DISTINCT-ON-over-120h-of-duplicate-rows cost that
 *     made B-NEW-34a hotfix iterations all time out (#118).
 *   - 240-min path is unchanged (it was already disabled by B-NEW-34 hotfix 3
 *     pending B-NEW-35 source-side dedup).
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

interface CacheEntry {
  bars: OHLCData[];
  fetchedAt: number;
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

class XstockOHLCCache {
  private cache: Map<string, CacheEntry> = new Map();
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
   *   5. Write-back: UPSERT the most-recent N=12 buckets per symbol to the
   *      snapshot table so the snapshot stays ≤5 min stale during active
   *      scanning.
   *
   * 240-min path unchanged — falls through to the legacy single-call shape
   * because that path is currently disabled in scanner.ts (B-NEW-34 hotfix
   * 3, pending B-NEW-35).
   *
   * B.4 foundation (2026-06-03): a 15-min branch mirrors the 60-min snapshot-
   * first shape EXACTLY (snapshot read → narrow live overlay → merge → cache
   * store → write-back), against the xstock_spot_ohlc_15m_snapshot table with
   * the 15m constants (NARROW_OVERLAY_HOURS_15M, MAX_BARS_15M,
   * WRITE_BACK_RECENT_BUCKETS_15M). Additive, xStock-only — the 60-min and
   * 240-min paths are unchanged.
   *
   * Per Langston R2#4 + B-NEW-34b: this is the call site that bounds per-
   * cycle DB cost at "1 snapshot SQL + 1 narrow live SQL + 1 write-back SQL"
   * regardless of universe size.
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
    // only, additive: crypto/fx5 never reach this instance, and the 60-min /
    // 240-min paths are untouched.
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

    // ════════════════════════════════════════════════════════════════════
    // DEAD per B-NEW-34 hotfix 3 — remove with B-NEW-35 two-table cutover.
    // ════════════════════════════════════════════════════════════════════
    // Legacy path (240-min only — currently disabled at the caller in
    // scanner.ts:408). Preserved verbatim from the pre-B-NEW-34b shape so
    // the 240-min code path remains unchanged in behavior. Restored if
    // 240-min consumption is wired (Phase D of XSTOCK_CALIBRATION_PLAN).
    // Langston Step 4 Q5 ACK (2026-05-18 night): mark DEAD with cutover
    // pointer; do NOT remove tonight (not in scope for the scanner-recovery
    // ship). B-NEW-35 owns the cleanup.
    // ════════════════════════════════════════════════════════════════════
    const fresh = await aggregateXstockOHLC(misses, intervalMinutes);
    for (const [symbol, bars] of fresh) {
      this.cache.set(this.getCacheKey(symbol, intervalMinutes), { bars, fetchedAt: now });
      result.set(symbol, bars);
    }
    return result;
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
