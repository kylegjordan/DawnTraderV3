/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-NEW-34 — xstock OHLC aggregator (60-min + 240-min from 1-min source)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Rolls up `xstock_spot_ohlc_1m` rows into higher-timeframe OHLC bars on demand.
 * Provides 60-min (hourly) and 240-min (4-hour) aggregations. Used by
 * `xstockOhlcCache` to feed the xstock scanner pipeline, mirroring crypto's
 * `ohlcCache` consumer pattern but sourcing from local DB instead of Kraken
 * REST (because Kraken has no public equities REST endpoint — see
 * BATCH_79_0k investigation + B-NEW-34 design ask Round 2 §0).
 *
 * Per Langston B-NEW-34 Round 2 + Round 3 review:
 *
 *   R2#1 ORDERED AGGREGATION — open = first bar's open by interval_begin,
 *        close = last bar's close. SQL uses array_agg(... ORDER BY ...) so
 *        the (open, close) pair is deterministic. Golden-fixture test in
 *        `b-new-34-aggregator.test.ts` regresses against silent drift.
 *
 *   R2#2 PARTIAL-BAR SEMANTICS — emits the in-progress bar. Matches crypto's
 *        Kraken-REST behavior where the current (still-forming) 60-min bar is
 *        included in the returned series. SYSTEM_MANUAL "Bar interval — design
 *        rationale" section documents this choice.
 *
 *   R2#3 240-MIN UTC ALIGNMENT — boundaries at 00/04/08/12/16/20 UTC matching
 *        Kraken's native interval=240 candles. Uses
 *        `to_timestamp(floor(extract(epoch from interval_begin)/14400)*14400)`
 *        because postgres has no native 4-hour date_trunc.
 *
 *   R2#4 QUERY FANOUT — single SQL per interval with
 *        `WHERE symbol = ANY($1)`. Two round-trips per cycle (60-min + 240-min),
 *        not 75 × 2 = 150. Postgres groups in-process.
 *
 *   R2#5 CACHE DEPTH — 200 bars for 60-min, 60 bars for 240-min. Memory ~5.5MB
 *        total across the 265-symbol universe.
 *
 *   R3 No 1m-bar-cadence assumption in the aggregator output: returned
 *      OHLCData arrays are consumed by 60-min-calibrated downstream code.
 *
 * Architecture decision per B-NEW-34: Kraken does NOT expose xstock data via
 * REST at any tier (B79.0k investigation verdict, re-verified 2026-05-15:
 * `pair=TSLAxUSD&interval=60` → EGeneral:Invalid arguments). Local aggregation
 * from the B74 WebSocket-fed archive is the only viable path. Returned bars
 * are not synthesized — missing 1-min source bars are simply absent from the
 * rollup (no forward-fill, no zero-volume continuation). Caller decides what
 * to do with sparse/empty results via the `min_ohlc_history_bars` floor in
 * downstream filters.
 *
 * Reference: BATCH_68_1 multi-tf-agreement.ts pattern + crypto ohlc-cache.ts
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import type { OHLCData } from '../../types/market-regime.types.js';

/**
 * Supported aggregation intervals. Strict union — anything else throws.
 * 60 = hourly (matches crypto interval=60).
 * 240 = 4-hour (matches B68.1 multi-TF agreement higher-TF + crypto interval=240).
 */
export type XstockAggregationInterval = 60 | 240;

/**
 * Per-Langston R2#5 — cache depth caps. Aggregator returns up to this many
 * bars per symbol per interval. Caller can re-roll on cache expiry cheaply.
 *
 * B-NEW-34 hotfix (2026-05-15 post-staging-verify): initial 200/60 depths
 * produced ~15s 60-min cycle times and statement-timeout errors on the 240-min
 * warm-fetch. Source-row math: 200 bars × 60-min × 60 1-min/bar = 720K rows
 * for the 60-min query alone; 60 bars × 240-min × 60 = 864K rows for the
 * 240-min. Concurrent execution saturated the connection pool.
 *
 * Reduced to 60/30 — still well above the 24-bar floor (`min_ohlc_history_bars`)
 * and B68.1's 30-bar `min_higher_tf_samples` threshold. Source-row counts drop
 * to 270K (60-min) + 540K (240-min) ≈ 4× faster on the rollup queries.
 */
// MAX_BARS_60M / MAX_BARS_240M govern the RETURNED ARRAY CAP (most-recent N bars).
// They are independent of LOOKBACK_HOURS_* (the DB query wall-clock window). Per
// B-NEW-34a (2026-05-18), the lookback hours are decoupled from the cap because
// xStock weekend close (Fri 20:00 ET → Sun 20:00 ET = 48h gap) means
// `wall-clock hours ≠ bar-producing hours` for equities.
const MAX_BARS_60M = 60;  // ≤60 returned per pair regardless of lookback breadth
const MAX_BARS_240M = 30; // ≤30 returned per pair (matches B68.1 min_higher_tf_samples)

// B-NEW-34a (2026-05-18) — lookback wall-clock hours are session-shape-aware.
// xStocks have a 48-hour weekend close (Fri 20:00 ET → Sun 20:00 ET) plus
// ~17.5 non-RTH hours per weekday for the 255 non-24/7 names. The wall-clock
// window required to find N bars is much larger than for crypto's continuous
// trading. 240h = 10 days = spans weekend + 4 prior RTH sessions, which yields
// ~30-50 buckets for non-24/7 names by Mon market open, satisfying the
// 24-bar `min_ohlc_history_bars` floor.
//
// Trade-off (governance: RUNNING_ISSUES #118 + B-NEW-35 promotion):
//   240h × 60 1m bars/h × 75 symbols × ~21× B74 source-side duplication ≈
//   22M source rows per cycle scan, on 30s cadence → ~750K rows/sec sustained
//   read pressure on `xstock_spot_ohlc_1m`. The DISTINCT ON dedup (see L152+
//   below) is required because B74 archiver currently writes 18-56× duplicates
//   per (symbol, interval_begin). B-NEW-35 source-side dedup is the structural
//   fix; until that ships, this hotfix temporarily worsens Supabase Disk IO
//   Budget posture ~4× vs the prior 60h window. Hard rollback thresholds in
//   `B_NEW_34a_HOTFIX_SCOPE.md` §6. Acceptable short-term given Supabase
//   warning is depleting-not-exhausted; B-NEW-35 is next-batch top priority.
// B-NEW-34a tuning iteration 2026-05-18 20:15 UTC: 240h then 168h both caused
// per-cycle SCAN_TIMEOUT at 25s budget. The DISTINCT ON dedup over 15-22M
// source rows (from B74's 18-56× duplicate writes) exceeds the budget.
// Reduced to 120h (5 days wall-clock).
//
// B-NEW-34b (2026-05-18 night) — Lookback-tuning ABANDONED as the production
// path. The cache now uses a snapshot-first read (xstock_spot_ohlc_60m_snapshot)
// plus a narrow 24h live overlay window (passed as lookbackHoursOverride). The
// 120h default below is preserved only for FORENSIC / direct callers that bypass
// the cache layer (e.g. b-phase-a2-backfill rerun scripts, ad-hoc DB tools). The
// hot scanner cycle no longer scans the wide window — see
// server/services/xstock-ohlc-cache.ts NARROW_OVERLAY_HOURS_60M.
const LOOKBACK_HOURS_60M = 120;
const LOOKBACK_HOURS_240M = 30 * 24; // 720h = 30 days; 240-min warm-fetch is disabled today (scanner.ts:408) so this is dead-code-safe but symmetric.

/**
 * Aggregate xstock_spot_ohlc_1m rows into higher-timeframe OHLC bars.
 *
 * Single SQL round-trip per interval. Returns a Map keyed by symbol; symbols
 * with zero source 1-min bars in the lookback window get an empty array (not
 * absent from the map — caller can distinguish "queried but no data" from
 * "not queried").
 *
 * @param symbols - Canonical BASE/USD form. Asset-class-scoped at the table
 *                  level (xstock_spot_ohlc_1m only holds xstock data), so the
 *                  5 known collision tickers (CVX, DASH, MET, OPEN, SUI per
 *                  XSTOCK_SPOT_KRAKEN_COLLISIONS) are unambiguous here.
 * @param intervalMinutes - 60 or 240
 * @param lookbackHoursOverride - B-NEW-34b (2026-05-18) optional override of the
 *                  default wall-clock lookback. When the snapshot-first cache
 *                  path is in use, the cache supplies a NARROW overlay window
 *                  (e.g. 24h) so the live aggregator only fetches the recent
 *                  tail. The snapshot table provides the historical bars,
 *                  eliminating the DISTINCT-ON-over-wide-window cost.
 *                  Undefined → use the default constants as before.
 */
export async function aggregateXstockOHLC(
  symbols: string[],
  intervalMinutes: XstockAggregationInterval,
  lookbackHoursOverride?: number,
): Promise<Map<string, OHLCData[]>> {
  const out = new Map<string, OHLCData[]>();
  for (const s of symbols) out.set(s, []);
  if (symbols.length === 0) return out;

  // B-NEW-34a (2026-05-18): lookback wall-clock hours are session-shape-aware
  // and decoupled from the returned-array cap. See LOOKBACK_HOURS_60M comment
  // block for the rationale (xStock weekend close eats 48h of any window built
  // on crypto-style "wall-clock hours = bar hours" math).
  //
  // B-NEW-34b (2026-05-18): when lookbackHoursOverride is provided (the cache's
  // narrow-overlay path), use that instead. Otherwise fall back to the default
  // session-shape-aware constants. Range guard: override must be a positive
  // finite number; anything else falls back to the default.
  const maxBars = intervalMinutes === 60 ? MAX_BARS_60M : MAX_BARS_240M;
  const defaultLookback = intervalMinutes === 60 ? LOOKBACK_HOURS_60M : LOOKBACK_HOURS_240M;
  const lookbackHours =
    Number.isFinite(lookbackHoursOverride) && (lookbackHoursOverride as number) > 0
      ? (lookbackHoursOverride as number)
      : defaultLookback;

  // B-NEW-34 R4 (Langston Step 4 fix): both branches use epoch-floor to align
  // to UTC boundaries WITHOUT depending on postgres session TZ.
  //
  //   60-min:  epoch / 3600  → UTC hour boundaries (Kraken interval=60 native)
  //   240-min: epoch / 14400 → UTC 00/04/08/12/16/20 (Kraken interval=240)
  //
  // R4#1: `date_trunc('hour', timestamptz)` truncates in session TZ, not UTC.
  // Silent parity break with crypto under non-UTC postgres session config.
  // R4#2: `to_timestamp(...) AT TIME ZONE 'UTC'` converts timestamptz → timestamp
  // (TZ-naive), which the pg driver renders without `+00` suffix; `new Date()`
  // would then interpret as host-local TZ. Hetzner is UTC today but this
  // breaks elsewhere (laptop dev, CI runners, future regions).
  //
  // Epoch-floor pattern in both branches: returns plain timestamptz, UTC-
  // anchored, no session-TZ surface area, mirror shape between the two
  // intervals so future readers see one pattern not two.
  let bucketExpr: string;
  if (intervalMinutes === 60) {
    bucketExpr = "to_timestamp(floor(extract(epoch from interval_begin) / 3600) * 3600)";
  } else {
    bucketExpr = "to_timestamp(floor(extract(epoch from interval_begin) / 14400) * 14400)";
  }

  // R2#4: single SQL with IN-literal-list (per the workaround documented in
  // scanner.ts:337-339 — drizzle sql template doesn't auto-bind JS arrays to
  // postgres array params, so `ANY($1)` throws "op ANY/ALL (array) requires
  // array on right side". Mitigation: string-literal-inject the symbol list.
  // Safe because the symbol list is sourced from XSTOCK_SPOT_SYMBOLS (hardcoded
  // const Set), not user input. Each entry is `'` escaped via `replace(/'/g, "''")`.
  // R2#1: ordered aggregation via (array_agg(... ORDER BY interval_begin))[1]
  // for open and [1 DESC] for close. R2#2: partial-bar emission — no end-of-
  // bucket gating, so the currently-forming bucket is included.
  // B-NEW-34a (2026-05-18) addendum: lookback widened to 240h per the comment
  // block at LOOKBACK_HOURS_60M. The DISTINCT ON scan cost scales with that
  // window, so the per-cycle source-row count is now ~22M rather than the
  // ~720K cited in the original 60h-era comment below. Sustained ~750K rows/sec
  // read pressure on `xstock_spot_ohlc_1m` until B-NEW-35 source-side dedup
  // ships. RUNNING_ISSUES #118 tracks the IO posture + hard rollback thresholds.
  //
  // B-NEW-34 hotfix 3 (2026-05-15 — discovered post-staging-verify): the
  // `xstock_spot_ohlc_1m` table is being written by B74 with 18-56× duplicate
  // rows per (symbol, interval_begin) — the WS archive emits a fresh row for
  // every intra-minute tick rather than upserting one closed bar per minute.
  // Empirical (2026-05-15, AAPL/USD over 60h lookback): 60K rows for 2900
  // distinct minutes = ~21× duplication; recent hours up to 56× (current bar
  // being tick-updated). Source-quality bug tracked as B-NEW-35 (B74 archive
  // dedup); for the aggregator we MUST de-dup at query time or the rollup
  // produces incorrect MAX/MIN/SUM (counting the same minute's high/low/volume
  // dozens of times).
  //
  // The DISTINCT ON pick: latest `captured_at` per (symbol, interval_begin)
  // wins, ties broken by `id` DESC. Latest tick == bar-close-aligned snapshot
  // == correct closed-bar OHLCV for that minute. The OLDER intra-minute rows
  // are partial bars from earlier in the minute (open held constant, high/
  // low/close/volume evolving as more ticks arrived); only the LAST row holds
  // the full minute's OHLCV. This is the structurally-correct interpretation
  // of the table's current write pattern; B-NEW-35 will normalize the write
  // side so DISTINCT ON is no longer needed.
  //
  // Note: even with DISTINCT ON the scan cost remains O(rows-in-window).
  // Combined with the 240-min warm-fetch disable in scanner.ts (also B-NEW-34
  // hotfix 3), this brings cold-cache cycle time from 25s+ (SCAN_TIMEOUT) into
  // the single-digit-seconds range.
  const symbolListSql = symbols.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
  const result: any = await db.execute(sql`
    WITH deduped AS (
      SELECT DISTINCT ON (symbol, interval_begin)
        symbol, interval_begin, open, high, low, close, volume
      FROM xstock_spot_ohlc_1m
      WHERE symbol IN (${sql.raw(symbolListSql)})
        AND interval_begin > NOW() - (${lookbackHours}::int * INTERVAL '1 hour')
      ORDER BY symbol, interval_begin, captured_at DESC, id DESC
    ),
    bucketed AS (
      SELECT
        symbol,
        (${sql.raw(bucketExpr)}) AS bucket_ts,
        interval_begin,
        open, high, low, close, volume
      FROM deduped
    ),
    aggregated AS (
      SELECT
        symbol,
        bucket_ts,
        (array_agg(open ORDER BY interval_begin ASC))[1] AS bar_open,
        MAX(high) AS bar_high,
        MIN(low)  AS bar_low,
        (array_agg(close ORDER BY interval_begin DESC))[1] AS bar_close,
        SUM(volume) AS bar_volume,
        COUNT(*) AS source_bar_count
      FROM bucketed
      GROUP BY symbol, bucket_ts
    )
    SELECT symbol, bucket_ts, bar_open, bar_high, bar_low, bar_close, bar_volume, source_bar_count
    FROM aggregated
    ORDER BY symbol, bucket_ts ASC
  `);

  const rows: any[] = (result as any).rows ?? result;
  if (!Array.isArray(rows) || rows.length === 0) return out;

  // Group rows by symbol, truncate to max bars (most recent), return ASC.
  // Aggregated rows are already ASC by bucket_ts within each symbol.
  for (const r of rows) {
    const symbol = r.symbol;
    const bar: OHLCData = {
      open: parseFloat(r.bar_open),
      high: parseFloat(r.bar_high),
      low: parseFloat(r.bar_low),
      close: parseFloat(r.bar_close),
      volume: parseFloat(r.bar_volume),
      timestamp: new Date(r.bucket_ts).getTime(),
    };
    const list = out.get(symbol);
    if (list) list.push(bar);
  }

  // Cap per-symbol to maxBars (keep most recent). Drop excess from the front.
  for (const [symbol, list] of out) {
    if (list.length > maxBars) {
      out.set(symbol, list.slice(list.length - maxBars));
    }
  }

  return out;
}

/**
 * Convenience: single-symbol variant. Delegates to the batched form and
 * unwraps the map. Useful for ad-hoc queries; the scanner uses the batched
 * form to avoid 150 round-trips per cycle.
 */
export async function aggregateXstockOHLCSingle(
  symbol: string,
  intervalMinutes: XstockAggregationInterval,
): Promise<OHLCData[]> {
  const m = await aggregateXstockOHLC([symbol], intervalMinutes);
  return m.get(symbol) ?? [];
}
