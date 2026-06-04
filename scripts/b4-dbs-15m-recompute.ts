#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B.4 FOUNDATION (Step-3 Chunk C) — xStock DBS 15-minute SUPERVISED RECOMPUTE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * SUPERVISED ONE-SHOT. This is the directional-bias (DBS) PER-BAR HISTORY rebuild
 * that swaps the xStock DBS substrate from 60-minute bars to 15-minute bars as
 * part of the B.4 foundation 60m→15m evaluation-bar switch (scope
 * B_4_FOUNDATION_SCOPE.md v2; pre-audit B_4_FOUNDATION_PRE_AUDIT.md; Langston
 * Step-1 + Step-2 approved). Active trading is OFF. xStock-scoped — crypto's
 * DBS path (fx5-scanner + market-scanner + DEFAULT_DBS_CONFIG) is NOT touched here.
 *
 * ── WHAT `xstock_dbs_backfill` IS (and why the prior draft was wrong) ─────────
 * `xstock_dbs_backfill` is a PER-BAR DBS HISTORY table: one row per (symbol, bar)
 * across ALL available history (~tens of thousands of rows), used for distribution
 * analysis / calibration replay (it is NOT a "current per-pair score" cache). The
 * original B-PHASE-A2 backfill built the FULL 60-minute series per symbol from the
 * 1-minute archive and slid a 48-bar window across it → one row per 60m bar. This
 * recompute does the EXACT SAME SHAPE at 15 minutes: build the full uncapped 15m
 * series per symbol from `xstock_spot_ohlc_1m`, slide a 192-bar window → one row
 * per 15m bar. (The earlier draft mistakenly used the capped live-cache aggregator,
 * which returns ≤240 most-recent buckets and so produced ONE current row per
 * symbol — that is the live-path shape, NOT the per-bar history this table holds.)
 *
 * ── SEQUENCE (idempotent: archive → safety-gate → clear → recompute → stamp) ──
 *   (1) ARCHIVE   CREATE xstock_dbs_backfill_60m_archive (LIKE ... INCLUDING ALL)
 *                 if absent; INSERT the live 60-min rows into it
 *                 (ON CONFLICT DO NOTHING). Read-only 60m history kept for
 *                 diff / rollback (Langston Step-2: recompute PLUS stamp PLUS
 *                 retain 60m archive — not either/or).
 *                 SAFETY GATE: before clearing, VERIFY the archive now holds at
 *                 least as many 60-min rows as the live table does. If the
 *                 archive did NOT capture them, ABORT — no DELETE happens.
 *   (2) CLEAR     DELETE FROM xstock_dbs_backfill  (live table becomes 15m-only).
 *   (3) RECOMPUTE For every xStock symbol in XSTOCK_SPOT_REGISTRY: rebuild the
 *                 FULL UNCAPPED 15-minute OHLC series directly from
 *                 `xstock_spot_ohlc_1m` (900-second buckets, ALL history), then
 *                 slide a 192-bar DBS window across it. For each window: compute
 *                 ATR (xStock atr_period) over the window, compute DBS with the
 *                 xStock per-class config (lookbackPeriod / emaPeriods) — ALL
 *                 resolved from module_constants (module 'directional_bias',
 *                 assetClass 'xstock_spot'). HARD-FAIL if any seed is missing (no
 *                 silent default; Kyle directive §5 #15). These come from migration
 *                 2026-06-03c: lookback_period=192, ema_fast=48, ema_slow=104,
 *                 atr_period=56.
 *   (4) STAMP     INSERT the recomputed rows with bar_interval_minutes = 15 on
 *                 every row (column added in migration 2026-06-03b; default 60).
 *                 The live table is 15m-ONLY thereafter; ML consumers can
 *                 distinguish native-15m rows from the 60m archive via this
 *                 stamp (Step-4 mixed-substrate guard).
 *
 * Steps (1)→(4) run inside ONE transaction. On any error the whole thing rolls
 * back — the live 60-min DBS table is never left in a half-cleared state.
 *
 * ── CONFIG / WINDOW PARITY WITH THE LIVE SCANNER ────────────────────────────
 * `computeDirectionalBias` does NOT internally clamp the WHOLE passed array to
 * `lookbackPeriod`: it slices `ohlcData.slice(-lookbackPeriod)` for the slope +
 * return components, but the EMA component (`emaPeriods.fast`/`.slow`) is computed
 * over the ENTIRE passed array. Passing exactly `lookbackPeriod` (192) bars makes
 * the slice a no-op and computes both EMAs over those same 192 bars — a clean,
 * deterministic per-bar window (192 > emaSlow 104 + 1, so no SMA-fallback). The
 * window is built so its LAST bar is the bar being scored, mirroring how the live
 * scanner scores the latest bucket. See the §JUDGMENT note at the bottom of the
 * recompute function for the marginal live-vs-replay EMA-warmup difference (the
 * live scanner feeds up to MAX_BARS_15M=240 cached bars, so its EMA sees a few
 * extra warm-up bars at the head; the per-bar HISTORY replay this table needs is
 * the strict sliding 192-bar window).
 *
 * ── IDEMPOTENCY ────────────────────────────────────────────────────────────
 * Re-running reproduces the SAME end state, it does not double-insert:
 *   • the archive INSERT is ON CONFLICT (symbol, ts) DO NOTHING, so a second run
 *     adds nothing new to the archive (the original 60m rows are already there);
 *   • the live table is DELETEd wholesale each run, then re-INSERTed, so the
 *     final live rowset is exactly the current 15m recompute, no accumulation;
 *   • the per-row INSERT is ON CONFLICT (symbol, ts) DO NOTHING — within one run
 *     a (symbol, ts) produced twice settles to one row (a single 15m bucket maps
 *     to one bar; collisions are not expected, but the guard is defensive).
 * Note: a SECOND run after the substrate is already 15m will find the live table
 * holding 15m rows (bar_interval_minutes = 15), so the "60m rows to archive"
 * count is 0 — the archive already captured the original 60m rows on the FIRST
 * run and they are preserved untouched. The safety gate accounts for this
 * (0 live-60m rows ⇒ archive trivially satisfies the >= check).
 *
 * ── OPERATOR PRE-CONDITIONS (read before running) ──────────────────────────
 *   • This is a SUPERVISED run in the weekend-close window. It is deliberately
 *     NOT coupled to the flaky `weekend_shutdown` cron timer (Langston Step-2
 *     refinement #3) — an operator runs it by hand, watches the output, and
 *     confirms the row counts.
 *   • CONFIRM THE xStock SCANNER IS PAUSED FIRST. The live DBS pre-cycle compute
 *     in xstock_spot/scanner.ts writes nothing to this table (it feeds an
 *     in-memory store), but pausing avoids contending with the 15m cache warm
 *     and keeps the recompute window quiet. Do not run while active trading is on.
 *   • Migrations 2026-06-03b (schema: 15m snapshot table + bar_interval_minutes
 *     column) and 2026-06-03c (per-class lookback seeds) MUST already be applied.
 *     The script hard-fails if the module_constants seeds are missing.
 *
 * ── USAGE ──────────────────────────────────────────────────────────────────
 *   Suggested npm script entry (add to package.json — do NOT edit it from here):
 *     "b4:dbs-15m-recompute": "tsx scripts/b4-dbs-15m-recompute.ts"
 *
 *   Dry-run (no DDL, no DELETE, no INSERT — prints what it WOULD do + row counts):
 *     npm run b4:dbs-15m-recompute -- --dry-run
 *
 *   Live (supervised, scanner paused, weekend-close window):
 *     npm run b4:dbs-15m-recompute
 *
 *   Optional symbol subset (forensic re-run for a few names):
 *     npm run b4:dbs-15m-recompute -- --symbols AAPL/USD,MSFT/USD
 *
 *   Optional history cap in DAYS (TESTING ONLY — default UNBOUNDED = all history,
 *   because xstock_dbs_backfill is the full per-bar history table):
 *     npm run b4:dbs-15m-recompute -- --days 14
 *
 * Reference: b-phase-a2-backfill.ts (full-series + sliding-window pattern, ported
 *            from 48-bar/60m to 192-bar/15m);
 *            xstock_spot/scanner.ts:721-745 (per-class DBS config resolution) +
 *            :752/:764 (ATR + DBS compute call shape);
 *            migration 2026-06-03b (schema) + 2026-06-03c (per-class seeds).
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
// ESM default import for CommonJS pg module — same pattern as b-phase-a2-backfill.ts:32
// + scripts/db-migrate.ts + server/db.ts.
import pg from 'pg';
const { Pool } = pg;
import { computeDirectionalBias } from '../server/core/metrics/directional-bias.js';
import { DEFAULT_DBS_CONFIG, type DBSConfig } from '../server/types/directional-bias.types.js';
import { getConstant } from '../server/services/module-constants-service.js';
import { XSTOCK_SPOT_REGISTRY } from '../shared/asset-classes.js';
import type { OHLCData } from '../server/types/market-regime.types.js';

const TABLE = 'xstock_dbs_backfill';
const ARCHIVE_TABLE = 'xstock_dbs_backfill_60m_archive';
const BAR_INTERVAL_15M = 15;
const ARCHIVED_INTERVAL_60M = 60;

// 15-minute bucket width in seconds — bucket = floor(epoch/900)*900.
const BUCKET_SECONDS_15M = 900;

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.indexOf(`--${name}`) >= 0;
}

/** Local ATR helper — identical to b-phase-a2-backfill.ts:48 + scanner.ts:60. */
function computeATRFromOHLC(ohlcData: OHLCData[], period: number = 14): number {
  if (ohlcData.length < period + 1) return 0;
  const recent = ohlcData.slice(-(period + 1));
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const high = recent[i].high;
    const low = recent[i].low;
    const prevClose = recent[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  return trSum / period;
}

/**
 * Resolve the xStock per-class DBS config + DBS-normalization ATR period from
 * module_constants. Mirrors xstock_spot/scanner.ts:721-745 EXACTLY — module
 * 'directional_bias', key assetClass 'xstock_spot'. Hard-fails on a missing
 * seed (no silent default; Kyle directive §5 #15 — NO hardcoded fallbacks for
 * DB-governed settings). Returns the same shape the scanner builds.
 */
async function resolveXstockDbsConfig(): Promise<{ config: DBSConfig; atrPeriod: number }> {
  const DBS_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };
  const [xsLookback, xsEmaFast, xsEmaSlow, xsAtrPeriod] = await Promise.all([
    getConstant<number>('directional_bias', 'lookback_period', DBS_KEY),
    getConstant<number>('directional_bias', 'ema_fast', DBS_KEY),
    getConstant<number>('directional_bias', 'ema_slow', DBS_KEY),
    getConstant<number>('directional_bias', 'atr_period', DBS_KEY),
  ]);
  const missing: string[] = [];
  if (typeof xsLookback !== 'number') missing.push('lookback_period');
  if (typeof xsEmaFast !== 'number') missing.push('ema_fast');
  if (typeof xsEmaSlow !== 'number') missing.push('ema_slow');
  if (typeof xsAtrPeriod !== 'number') missing.push('atr_period');
  if (missing.length > 0) {
    throw new Error(
      `[B.4 DBS-15m] missing xstock_spot module_constants directional_bias {${missing.join(', ')}}. ` +
      `Apply migration 2026-06-03c (xStock lookback_period=192, ema_fast=48, ema_slow=104, atr_period=56) before running.`,
    );
  }
  const config: DBSConfig = {
    ...DEFAULT_DBS_CONFIG,
    lookbackPeriod: xsLookback as number,
    emaPeriods: { fast: xsEmaFast as number, slow: xsEmaSlow as number },
  };
  return { config, atrPeriod: xsAtrPeriod as number };
}

interface RecomputedRow {
  symbol: string;
  sector: string;
  ts: Date;
  finalScore: number;
  slopeComponent: number;
  returnComponent: number;
  emaComponent: number;
  sentinelZero: boolean;
  atr: number;
  volume24hUsd: number | null;
}

/**
 * Build the FULL UNCAPPED 15-minute OHLC series for ONE symbol directly from
 * `xstock_spot_ohlc_1m`. Mirrors b-phase-a2-backfill.ts:fetchHistoricalOhlc60m
 * but: (a) 900-second epoch buckets instead of date_trunc('hour'), (b) NO
 * implicit cap — returns ALL buckets (the table is full per-bar history), (c)
 * optional `daysBack` for testing only (default unbounded). Open = first 1m
 * open in the bucket, close = last 1m close, high/low = max/min, volume = sum.
 */
async function fetchFull15mSeries(
  pool: Pool,
  symbol: string,
  daysBack: number | undefined,
): Promise<OHLCData[]> {
  // bucket = floor(epoch(interval_begin)/900)*900 — the 15m epoch-anchored bucket
  // start (seconds). array_agg ASC/DESC for first-open / last-close (matches the
  // b-phase-a2 60m rollup). When daysBack is given (testing), bound the scan;
  // otherwise scan all history.
  const params: Array<string | number> = [symbol];
  let dayFilter = '';
  if (daysBack !== undefined) {
    params.push(daysBack);
    dayFilter = `AND interval_begin >= NOW() - ($2::text || ' days')::interval`;
  }
  const result = await pool.query<{
    bucket: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>(
    `
    SELECT
      (floor(extract(epoch FROM interval_begin) / ${BUCKET_SECONDS_15M})::bigint * ${BUCKET_SECONDS_15M})::text AS bucket,
      (array_agg(open  ORDER BY interval_begin ASC))[1]  AS open,
      MAX(high)                                          AS high,
      MIN(low)                                           AS low,
      (array_agg(close ORDER BY interval_begin DESC))[1] AS close,
      SUM(volume)                                        AS volume
    FROM xstock_spot_ohlc_1m
    WHERE symbol = $1
      ${dayFilter}
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    params,
  );

  // bucket is the epoch-SECONDS bucket start; OHLCData.timestamp is epoch MS.
  return result.rows.map((r): OHLCData => ({
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    timestamp: Number(r.bucket) * 1000,
  }));
}

/**
 * For ONE symbol, build the full 15m series, slide a strict `lookbackPeriod`-bar
 * (192) window across it, and emit one RecomputedRow per scored bar. Per-window:
 * ATR over the window (atrPeriod), DBS via computeDirectionalBias with the xStock
 * config. Skips bars whose window has ATR<=0 or a sentinel-zero DBS (same filter
 * spirit as b-phase-a2 + the live scanner).
 *
 * § JUDGMENT — window length: a strict 192-bar window is passed (not the full
 * series, not the live cache's ≤240). computeDirectionalBias slices to
 * lookbackPeriod for slope/return but uses the WHOLE passed array for the EMA
 * components; passing exactly 192 makes both EMAs see exactly the 192-bar window
 * ending at the scored bar — the faithful per-bar history shape this table holds.
 * The live scanner feeds up to MAX_BARS_15M=240 cached bars, so its EMA sees a
 * handful of extra warm-up bars at the head — a marginal difference at the EMA
 * warm-up only; the table's purpose is per-bar distribution history, for which
 * the strict sliding window is the correct, reproducible substrate.
 */
function recomputeSymbol(
  symbol: string,
  sector: string,
  bars: OHLCData[],
  dbsConfig: DBSConfig,
  atrPeriod: number,
): { rows: RecomputedRow[]; skippedAtr: number; sentinelZeroRows: number } {
  const rows: RecomputedRow[] = [];
  let skippedAtr = 0;
  let sentinelZeroRows = 0;

  const lookback = dbsConfig.lookbackPeriod; // 192 (15m-anchored)

  // Slide a strict full-lookback window: window's LAST bar is the bar being
  // scored. First scorable bar index = lookback-1 (needs `lookback` bars behind).
  for (let i = lookback - 1; i < bars.length; i++) {
    const window = bars.slice(i - (lookback - 1), i + 1); // exactly `lookback` bars
    const atr = computeATRFromOHLC(window, atrPeriod);
    if (atr <= 0) { skippedAtr++; continue; }

    const result = computeDirectionalBias(window, atr, dbsConfig);
    // Langston Step-4 Q1 (2026-06-04): INSERT sentinel-zero bars WITH the flag —
    // do NOT skip. The sentinel_zero column exists to mark computed-but-degenerate
    // (flat-price) bars; dropping them erases the absence-vs-degenerate distinction
    // the column encodes and breaks 60m-archive parity. "Cleaner distribution for
    // threshold derivation" is recoverable at query time via WHERE NOT
    // sentinel_zero. Contrast atr<=0 (skipped above): those are UNcomputable
    // (computeDirectionalBias cannot run) — a genuinely different semantics, so the
    // skip-atr / insert-sentinel asymmetry is coherent, not sloppy.
    if (result.sentinelZero) sentinelZeroRows++;

    const scoredBar = bars[i];
    const ts = new Date(scoredBar.timestamp);
    // volume_24h_usd best-effort — same approximation as b-phase-a2-backfill.ts:136
    // (scored bar's rolled-up volume × close). The backfill cannot reach the live
    // ticker stream; this is the documented approximation for the volume column.
    const vol24hUsd = Number.isFinite(scoredBar.volume) && Number.isFinite(scoredBar.close)
      ? scoredBar.volume * scoredBar.close
      : null;

    rows.push({
      symbol,
      sector,
      ts,
      finalScore: result.score,
      slopeComponent: result.components.slopeComponent,
      returnComponent: result.components.returnComponent,
      emaComponent: result.components.emaComponent,
      sentinelZero: result.sentinelZero,
      atr,
      volume24hUsd: vol24hUsd,
    });
  }

  return { rows, skippedAtr, sentinelZeroRows };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = hasFlag(args, 'dry-run');
  const symbolsArg = getFlag(args, 'symbols');
  // --days is TESTING-ONLY; default UNBOUNDED (all history) because this table is
  // the full per-bar history. An explicit --days bounds the 1m scan for fast
  // forensic re-runs over a few names.
  const daysArg = getFlag(args, 'days');
  const daysBack = daysArg !== undefined ? Number(daysArg) : undefined;
  if (daysArg !== undefined && (!Number.isFinite(daysBack) || (daysBack as number) <= 0)) {
    console.error(`[B.4 DBS-15m] invalid --days: ${daysArg}`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('[B.4 DBS-15m] DATABASE_URL not set');
    process.exit(1);
  }
  // B.4 (2026-06-04): load the DB-dynamic xStock universe (B79.0n.UNIVERSE-
  // DISCOVERY, 2026-05-21) so XSTOCK_SPOT_REGISTRY is populated in this standalone
  // CLI context — app boot does this via xstockUniverseService.initializeFromDB(),
  // a CLI run does not (it would otherwise build an empty symbol set and abort).
  const { xstockUniverseService } = await import('../server/asset_classes/xstock_spot/universe-service.js');
  await xstockUniverseService.initializeFromDB();
  console.log(`[B.4 DBS-15m] xStock universe loaded: ${XSTOCK_SPOT_REGISTRY.size} symbols`);

  const targetSymbols: Array<[string, string]> = symbolsArg
    ? symbolsArg.split(',').map((s) => {
        const entry = XSTOCK_SPOT_REGISTRY.get(s);
        if (!entry) throw new Error(`Symbol ${s} not in XSTOCK_SPOT_REGISTRY`);
        return [s, entry.sector] as [string, string];
      })
    : Array.from(XSTOCK_SPOT_REGISTRY.entries()).map(
        ([sym, entry]) => [sym, entry.sector] as [string, string],
      );

  console.log('═'.repeat(78));
  console.log('[B.4 DBS-15m] SUPERVISED ONE-SHOT — xStock DBS 60m→15m PER-BAR HISTORY recompute');
  console.log(`  symbols:        ${targetSymbols.length}`);
  console.log(`  history scope:  ${daysBack !== undefined ? `${daysBack} days (TESTING bound)` : 'ALL history (unbounded)'}`);
  console.log(`  mode:           ${dryRun ? 'DRY-RUN (no DDL, no DELETE, no INSERT)' : 'LIVE'}`);
  console.log('  PRE-CONDITION:  xStock scanner paused, weekend-close window, 2026-06-03b+c applied.');
  console.log('═'.repeat(78));

  if (!process.env.DATABASE_URL) {
    console.error('[B.4 DBS-15m] DATABASE_URL not set');
    process.exit(1);
  }

  // Resolve the per-class DBS config FIRST — hard-fails before any DDL/DELETE if
  // the migration 2026-06-03c seeds are missing. Fail fast, fail safe.
  const { config: dbsConfig, atrPeriod } = await resolveXstockDbsConfig();
  console.log(
    `[B.4 DBS-15m] resolved xStock DBS config: lookbackPeriod=${dbsConfig.lookbackPeriod}, ` +
    `emaFast=${dbsConfig.emaPeriods.fast}, emaSlow=${dbsConfig.emaPeriods.slow}, atrPeriod=${atrPeriod}`,
  );
  if (dbsConfig.lookbackPeriod !== 192 || dbsConfig.emaPeriods.fast !== 48 ||
      dbsConfig.emaPeriods.slow !== 104 || atrPeriod !== 56) {
    // Not fatal — the DB is the source of truth — but loud, because these are
    // the expected 15m-anchored values from migration 2026-06-03c. A mismatch
    // means the seeds were changed or a wildcard row shadowed the xstock_spot row.
    console.warn(
      `[B.4 DBS-15m] ⚠️ resolved DBS config differs from the expected 15m seeds ` +
      `(192/48/104/56). Proceeding with the DB-resolved values — confirm this is intended.`,
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // ── Recompute ALL symbols up front (read-only; safe even in dry-run) ────────
  // Each symbol's full 15m series is built, scored over the sliding 192-bar
  // window, then released before moving to the next symbol — so only ONE symbol's
  // series is held in memory at a time. The accumulated `recomputed` rows (the
  // per-bar history for all symbols) ARE held until the transaction insert; see
  // the §JUDGMENT note in main() below re: total row count.
  const recomputed: RecomputedRow[] = [];
  let symbolsWithRows = 0;
  let symbolsNoBars = 0;
  let totalSkippedAtr = 0;
  let totalSentinelZeroRows = 0;
  let processed = 0;

  console.log(`[B.4 DBS-15m] building full 15-min series + sliding ${dbsConfig.lookbackPeriod}-bar DBS window per symbol...`);
  for (const [symbol, sector] of targetSymbols) {
    const bars = await fetchFull15mSeries(pool, symbol, daysBack);
    if (bars.length < dbsConfig.lookbackPeriod) {
      symbolsNoBars++;
      processed++;
      continue;
    }
    const { rows, skippedAtr, sentinelZeroRows } = recomputeSymbol(symbol, sector, bars, dbsConfig, atrPeriod);
    if (rows.length > 0) symbolsWithRows++;
    recomputed.push(...rows);
    totalSkippedAtr += skippedAtr;
    totalSentinelZeroRows += sentinelZeroRows;
    processed++;
    if (processed % 25 === 0) {
      console.log(`[B.4 DBS-15m] progress: ${processed}/${targetSymbols.length} symbols, ${recomputed.length} rows so far`);
    }
  }

  console.log(
    `[B.4 DBS-15m] recomputed ${recomputed.length} per-bar 15-min DBS rows ` +
    `across ${symbolsWithRows} symbols (${symbolsNoBars} symbols < ${dbsConfig.lookbackPeriod}-bar window; ` +
    `${totalSkippedAtr} bars skipped ATR<=0 [uncomputable]; ${totalSentinelZeroRows} sentinel-zero bars INSERTED with flag).`,
  );

  const client = await pool.connect();
  try {
    // ── Pre-flight read (outside tx): how many live 60m rows exist? ──────────
    const liveCountRes = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${TABLE} WHERE bar_interval_minutes = $1`,
      [ARCHIVED_INTERVAL_60M],
    );
    const liveTotalRes = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${TABLE}`,
    );
    const live60mRows = Number(liveCountRes.rows[0].n);
    const liveTotalRows = Number(liveTotalRes.rows[0].n);
    console.log(`[B.4 DBS-15m] live table: ${liveTotalRows} rows total, ${live60mRows} stamped 60-min.`);

    if (dryRun) {
      console.log('[B.4 DBS-15m] DRY-RUN — no archive, no clear, no insert. Would have:');
      console.log(`  • archived ${live60mRows} live 60-min rows into ${ARCHIVE_TABLE}`);
      console.log(`  • DELETEd all ${liveTotalRows} live rows`);
      console.log(`  • INSERTed ${recomputed.length} per-bar rows stamped bar_interval_minutes=15`);
      const sample = recomputed.slice(0, 3).map((r) =>
        `${r.symbol}@${r.ts.toISOString()} score=${r.finalScore.toFixed(4)} atr=${r.atr.toFixed(6)}`,
      );
      if (sample.length) console.log(`  • sample: ${sample.join(' | ')}`);
      client.release();
      await pool.end();
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // TRANSACTION: archive → verify → clear → insert(stamp). All-or-nothing.
    // ════════════════════════════════════════════════════════════════════════
    await client.query('BEGIN');

    // (1) ARCHIVE — create the read-only 60m archive (shape-identical) if absent,
    //     then copy the live 60-min rows into it. ON CONFLICT DO NOTHING makes a
    //     re-run a no-op on the archive (originals already preserved).
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${ARCHIVE_TABLE} (LIKE ${TABLE} INCLUDING ALL)`,
    );
    const archiveInsertRes = await client.query(
      `INSERT INTO ${ARCHIVE_TABLE}
         SELECT * FROM ${TABLE} WHERE bar_interval_minutes = $1
         ON CONFLICT (symbol, ts) DO NOTHING`,
      [ARCHIVED_INTERVAL_60M],
    );
    const archivedThisRun = archiveInsertRes.rowCount ?? 0;

    // ── SAFETY GATE (archive-before-clear) ──────────────────────────────────
    // Re-count, INSIDE the transaction, how many 60-min rows the archive now
    // holds. It MUST be >= the number of 60-min rows currently in the live
    // table. If it is not, the archive did NOT capture the live 60m rows (DDL
    // failed silently, PK collision on differing data, partial copy) — ABORT
    // before any DELETE so the live 60m table is never destroyed un-backed-up.
    const archive60mRes = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${ARCHIVE_TABLE} WHERE bar_interval_minutes = $1`,
      [ARCHIVED_INTERVAL_60M],
    );
    const archive60mRows = Number(archive60mRes.rows[0].n);
    console.log(
      `[B.4 DBS-15m] archive check: ${archive60mRows} 60-min rows in ${ARCHIVE_TABLE} ` +
      `(+${archivedThisRun} this run); live 60-min rows to cover = ${live60mRows}.`,
    );
    if (archive60mRows < live60mRows) {
      await client.query('ROLLBACK');
      throw new Error(
        `[B.4 DBS-15m] ABORT (archive-before-clear gate failed): archive holds ${archive60mRows} ` +
        `60-min rows but the live table has ${live60mRows}. The archive did NOT capture the live ` +
        `60-min rows — refusing to DELETE the live table. No data was cleared. Investigate the ` +
        `${ARCHIVE_TABLE} contents + the CREATE/INSERT step before retrying.`,
      );
    }

    // (2) CLEAR — wipe the live table; it becomes 15m-only after the insert.
    const deleteRes = await client.query(`DELETE FROM ${TABLE}`);
    const deletedRows = deleteRes.rowCount ?? 0;
    console.log(`[B.4 DBS-15m] cleared live table (${deletedRows} rows deleted).`);

    // (3)+(4) RECOMPUTE-INSERT (stamp bar_interval_minutes=15). ON CONFLICT
    //     (symbol, ts) DO NOTHING — within one run a (symbol, ts) produced twice
    //     settles to one row (each 15m bucket maps to one bar; collisions are not
    //     expected); across runs the table was just cleared so nothing conflicts.
    //
    // § JUDGMENT — insert volume: this is a per-bar history (~tens of thousands of
    // rows). Inserts run row-by-row INSIDE the single transaction (rollback-safe,
    // mirrors b-phase-a2's per-row pattern). At ~30k rows this is the dominant
    // time cost but well within a supervised weekend-close window; it is NOT
    // batched into multi-row VALUES to keep the rollback-safety + the existing
    // ON CONFLICT shape simple. If row count grows much larger, batch the INSERT.
    let inserted = 0;
    for (const r of recomputed) {
      const res = await client.query(
        `INSERT INTO ${TABLE}
           (symbol, sector, ts, final_score, slope_component, return_component,
            ema_component, sentinel_zero, atr, volume_24h_usd, bar_interval_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (symbol, ts) DO NOTHING`,
        [
          r.symbol, r.sector, r.ts,
          r.finalScore, r.slopeComponent, r.returnComponent, r.emaComponent,
          r.sentinelZero, r.atr, r.volume24hUsd, BAR_INTERVAL_15M,
        ],
      );
      inserted += res.rowCount ?? 0;
    }
    console.log(`[B.4 DBS-15m] inserted ${inserted} per-bar 15-min DBS rows (stamped bar_interval_minutes=15).`);

    await client.query('COMMIT');

    // ── Post-commit verification (read-only) ────────────────────────────────
    const finalLiveRes = await client.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${TABLE}`);
    const final15mRes = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${TABLE} WHERE bar_interval_minutes = $1`,
      [BAR_INTERVAL_15M],
    );
    const finalArchiveRes = await client.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${ARCHIVE_TABLE}`);
    console.log('═'.repeat(78));
    console.log('[B.4 DBS-15m] COMMIT OK. Final state:');
    console.log(`  live table:    ${finalLiveRes.rows[0].n} rows total, ${final15mRes.rows[0].n} stamped 15-min`);
    console.log(`  archive table: ${finalArchiveRes.rows[0].n} rows (read-only 60-min history)`);
    console.log('═'.repeat(78));
  } catch (err) {
    // Best-effort rollback if the error happened mid-transaction.
    try { await client.query('ROLLBACK'); } catch { /* already rolled back / not in tx */ }
    console.error('[B.4 DBS-15m] FAILED — no partial state committed:', err instanceof Error ? err.message : err);
    client.release();
    await pool.end();
    process.exit(1);
  }

  client.release();
  await pool.end();
}

main().catch((err) => {
  console.error('[B.4 DBS-15m] fatal:', err);
  process.exit(1);
});
