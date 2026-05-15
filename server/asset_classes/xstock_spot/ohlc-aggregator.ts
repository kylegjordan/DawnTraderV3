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
 */
const MAX_BARS_60M = 200; // ~8 trading days of hourly history
const MAX_BARS_240M = 60; // ~10 trading days of 4h history

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
 */
export async function aggregateXstockOHLC(
  symbols: string[],
  intervalMinutes: XstockAggregationInterval,
): Promise<Map<string, OHLCData[]>> {
  const out = new Map<string, OHLCData[]>();
  for (const s of symbols) out.set(s, []);
  if (symbols.length === 0) return out;

  // Lookback window sized to cache depth + buffer to ensure we have enough
  // 1-min source bars to produce the requested rollup bar count.
  // 60-min × 200 = 200 hours = ~8.3 days of 1-min bars.
  // 240-min × 60  = 240 hours = 10 days of 1-min bars.
  const maxBars = intervalMinutes === 60 ? MAX_BARS_60M : MAX_BARS_240M;
  const lookbackHours = (intervalMinutes * maxBars) / 60;

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

  // R2#4: single SQL with ANY($1). R2#1: ordered aggregation via
  // (array_agg(... ORDER BY interval_begin))[1] for open and [LAST] for close.
  // R2#2: partial-bar emission — no "interval_begin <= bucket+interval - 1min"
  // gating, so the currently-forming bucket is included.
  const result: any = await db.execute(sql`
    WITH bucketed AS (
      SELECT
        symbol,
        (${sql.raw(bucketExpr)}) AS bucket_ts,
        interval_begin,
        open, high, low, close, volume
      FROM xstock_spot_ohlc_1m
      WHERE symbol = ANY(${symbols})
        AND interval_begin > NOW() - (${lookbackHours}::int * INTERVAL '1 hour')
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
