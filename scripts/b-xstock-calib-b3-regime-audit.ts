#!/usr/bin/env tsx
/**
 * B.3 — xStock Regime-Correctness Audit Replay (Group A)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Re-runs the PRODUCTION regime classifier against recent archived xStock
 * OHLC, recomputing DBS from OHLC the EXACT way the live xStock scanner does,
 * to measure where each regime cutoff sits vs the live input distribution and
 * to root-cause the near-empty RANGE_BOUND regime (0.02% live, 7-day rolling).
 *
 * WHY A NEW SCRIPT (not extending b1a-replay):
 *   The B.1a harness had TWO fidelity gaps vs live:
 *     (1) it JOINED a STALE DBS column (`xstock_dbs_backfill`, pinned
 *         2026-05-05→15) — a 9-day-old DBS onto a current window.
 *     (2) it classified on a 31-bar window (OHLC_LOOKBACK_BARS=30+1), but the
 *         live path uses 60-bar windows. `computeVolatility` runs over the FULL
 *         array passed and the DBS EMA depends on the full length, so window
 *         length materially changes vol + dbs → the regime LABEL.
 *   Both are fixed here.
 *
 * PARITY FACTS (code-traced 2026-06-02, B_3_PRE_AUDIT.md §6-§7):
 *   - OHLC window = 60 bars. Live: `getOHLCDataBatch(symbolList, 60)`
 *     (scanner.ts:533); `ohlc = ohlcBatch.get(symbol)` is fed to BOTH the DBS
 *     compute (scanner.ts:727) AND the regime classify
 *     (eval-cycle.ts:345 → mce.computeContext → calculatePairRegime).
 *   - ATR = computeATRFromOHLC(ohlc, 14) — copied VERBATIM from scanner.ts:56
 *     (simple mean True Range over the last 15 bars). Passed into
 *     computeDirectionalBias(ohlc, atr) at scanner.ts:727.
 *   - DBS = production `computeDirectionalBias(window60, atr)` with
 *     DEFAULT_DBS_CONFIG (lookbackPeriod 48, ema 12/26). dbsSlope from the
 *     prior-3-bar window (scanner.ts:728-735): priorOHLC = window.slice(0,-3),
 *     priorAtr = ATR(priorOHLC,14), slope = dbs.score - priorDbs.score.
 *   - Regime = production `calculatePairRegime(window60, dbs.score, slope,
 *     1.0, regimeConfig, 'xstock_spot')`. macroModifier=1.0 affects CONFIDENCE
 *     only — NOT the branch/label — so it's neutral for the distribution.
 *   - Steady-state: classify only bars with a FULL 60-bar window (warmed-up
 *     cache, which dominates the live 7-day sample). Earliest ~2 days dropped.
 *
 * AUDIT OUTPUTS (B_3_REGIME_AUDIT_REPORT.md will narrate from these):
 *   - Regime distribution vs the live 7d (TFS 37.23 / ST 35.17 / HVU 20.66 /
 *     IE 6.91 / RBS 0.02). PRE-REGISTERED match rule (Langston LOCK 2): every
 *     regime share within ±2pp AND RANGE_BOUND <0.5% in BOTH → replay matches
 *     live → B.1's 8.8% RBS is confirmed a stale/short-window artifact.
 *   - Per-branch input quartiles (vol/dx/dbs/mom).
 *   - G1 (primary lane): RANGE_BOUND near-miss attribution — of non-RBS bars,
 *     how many pass vol<0.006 AND |dbs|<0.10 but FAIL dx<35 (miss only on
 *     trend-strength), + the dx distribution among them. This is the decisive
 *     raw-DX-vs-smoothed measurement that drives the crypto-fence escalation.
 *   - DX distribution overall + % of bars with dx<35.
 *   - Sentinel-zero DBS fraction (G2 caveat: this is a FLOOR — every replay bar
 *     has a clean 60-bar prefix; live hits sentinel more on real-time gaps).
 *   - Holiday segment: Memorial Day 2026-05-25 (ARCA closed) analyzed
 *     separately (G3). US-RTH vs off-hours session split (xStocks 24/5 per
 *     §5 #17 — this is ANALYTICAL segmentation, not a trading boundary).
 *
 * DISPOSITION: offline diagnostic, READ-ONLY against archive/OHLC. No deploy,
 * zero production blast radius. Safe to re-invoke.
 *
 * Usage (on staging — has DATABASE_URL via .env):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && \
 *     npx tsx scripts/b-xstock-calib-b3-regime-audit.ts'"
 * ─────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
const { Client } = pg;
import { createWriteStream } from 'node:fs';
import { calculatePairRegime } from '../server/core/metrics/market-regime.js';
import { computeDirectionalBias } from '../server/core/metrics/directional-bias.js';
import { DEFAULT_DBS_CONFIG } from '../server/types/directional-bias.types.js';
import type { OHLCData, RegimeConfig } from '../server/types/market-regime.types.js';
import type { AssetClass } from '../shared/asset-classes.js';
import {
  RBS_VOL_MAX_XSTOCK,
  RBS_DX_MAX_XSTOCK,
  RBS_DBS_MAX_XSTOCK,
  IE_VOL_MIN_PATH_A_XSTOCK,
  IE_DX_MIN_PATH_A_XSTOCK,
  IE_VOL_MIN_PATH_B_XSTOCK,
  IE_DBS_STRONG_XSTOCK,
  TFS_MOM_MIN_PATH_A_XSTOCK,
  TFS_DX_MIN_XSTOCK,
  TFS_DBS_MODERATE_XSTOCK,
  HVU_VOL_MIN_XSTOCK,
  HVU_MOM_NEG_PATH_A_XSTOCK,
  HVU_DX_STRONG_XSTOCK,
  HVU_MOM_NEG_PATH_B_XSTOCK,
} from '../server/asset_classes/xstock_spot/regime-thresholds.js';

// ── Parity constants ────────────────────────────────────────────────────────
const WINDOW_BARS = 60;          // getOHLCDataBatch(symbolList, 60) — live window
const MATCH_WINDOW_DAYS = 7;     // Flag A (Langston Step-4): the match VERDICT is on a 7-day window aligned to LIVE_7D
const PATH_B_MOM_KEY = 'b68_5_path_b_momentum_min';
const OUT_PATH = './scripts/b-xstock-calib-b3-regime-audit-output.csv';
const MEMORIAL_DAY_UTC = '2026-05-25'; // ARCA closed (US holiday)
// Live 7-day rolling distribution (signal_eval_archive, 2026-06-02) for the
// pre-registered A3 match check.
const LIVE_7D: Record<string, number> = {
  TREND_FRIENDLY_STABLE: 37.23,
  STRUCTURAL_TRANSITION: 35.17,
  HIGH_VOLATILITY_UNSTABLE: 20.66,
  IMPULSE_EXPANSION: 6.91,
  RANGE_BOUND_STABLE: 0.02,
};

// ── computeATRFromOHLC — VERBATIM copy of scanner.ts:56-68 (parity, no drift) ─
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

// ── Build live RegimeConfig from module_constants (mirrors b1a) ───────────────
async function buildXstockRegimeConfig(client: InstanceType<typeof Client>): Promise<RegimeConfig> {
  const r = await client.query<{ module_name: string; constant_name: string; value: unknown }>(
    `SELECT module_name, constant_name, value
       FROM module_constants
      WHERE asset_class = 'xstock_spot'
        AND (module_name = 'regime_classifier' OR module_name = 'path_b_sustainability')`,
  );
  const byKey = new Map<string, number>();
  for (const row of r.rows) {
    const v = typeof row.value === 'number' ? row.value : Number(row.value);
    byKey.set(`${row.module_name}.${row.constant_name}`, v);
  }
  const need = (k: string): number => {
    const v = byKey.get(k);
    if (v === undefined || Number.isNaN(v)) throw new Error(`[REGIME_CONFIG] Missing xstock_spot key: ${k}`);
    return v;
  };
  return {
    tfsDesatMin: need('regime_classifier.b67_3_5_tfs_desat_min'),
    tfsDesatMax: need('regime_classifier.b67_3_5_tfs_desat_max'),
    tfsMomentumScale: need('regime_classifier.b67_3_5_tfs_momentum_scale'),
    tfsVolatilityScale: need('regime_classifier.b67_3_5_tfs_volatility_scale'),
    tfsDbsScale: need('regime_classifier.b67_3_5_tfs_dbs_scale'),
    b68_5PathBMomentumMin: need(`path_b_sustainability.${PATH_B_MOM_KEY}`),
    b68_5DbsSlopeMin: 0.0,
    b67_5PostCompositionFloor: need('regime_classifier.b67_5_post_composition_floor'),
  };
}

// Flag B (Langston Step-4): restrict to the LIVE-classified universe — symbols
// present in signal_eval_archive over the last 7 days (478 verified 2026-06-02),
// NOT the snapshot's full 485 (which includes ~7 inactive/delisted archived
// symbols that would tilt the shares vs the live reference LIVE_7D).
async function fetchLiveUniverseSymbols(client: InstanceType<typeof Client>): Promise<string[]> {
  const r = await client.query<{ symbol: string }>(
    `SELECT DISTINCT symbol FROM xstock_spot_ohlc_60m_snapshot
      WHERE symbol IN (
        SELECT DISTINCT symbol FROM signal_eval_archive
         WHERE asset_class = 'xstock_spot' AND captured_at > NOW() - INTERVAL '7 days'
      )
      ORDER BY symbol`,
  );
  return r.rows.map((x) => x.symbol);
}

async function fetchMaxTs(client: InstanceType<typeof Client>): Promise<number> {
  const r = await client.query<{ max: string }>(
    `SELECT max(bucket_ts) AS max FROM xstock_spot_ohlc_60m_snapshot`,
  );
  return new Date(r.rows[0].max).getTime();
}

// ── Aggregation ──────────────────────────────────────────────────────────────
interface BranchStats { count: number; vol: number[]; dx: number[]; dbs: number[]; mom: number[]; }
function newBranch(): BranchStats { return { count: 0, vol: [], dx: [], dbs: [], mom: [] }; }
interface Agg {
  total: number;
  sentinel: number;
  perRegime: Record<string, BranchStats>;
  // RANGE_BOUND near-miss (G1): non-RBS bars, decomposed
  rbsMissOnlyDx: number;    // pass vol & dbs, fail dx
  rbsMissOnlyVol: number;   // pass dx & dbs, fail vol
  rbsMissOnlyDbs: number;   // pass vol & dx, fail dbs
  rbsMissOnlyDxDxVals: number[]; // dx values of the miss-only-dx bars
  dxAll: number[];          // dx of every classified bar
  dxLt35: number;           // bars with dx < RBS_DX_MAX_XSTOCK
}
function newAgg(): Agg {
  return { total: 0, sentinel: 0, perRegime: {}, rbsMissOnlyDx: 0, rbsMissOnlyVol: 0,
    rbsMissOnlyDbs: 0, rbsMissOnlyDxDxVals: [], dxAll: [], dxLt35: 0 };
}
function record(agg: Agg, regime: string, vol: number, dx: number, absDbs: number, mom: number, sentinel: boolean): void {
  agg.total++;
  if (sentinel) agg.sentinel++;
  if (!agg.perRegime[regime]) agg.perRegime[regime] = newBranch();
  const b = agg.perRegime[regime];
  b.count++; b.vol.push(vol); b.dx.push(dx); b.dbs.push(absDbs); b.mom.push(mom);
  agg.dxAll.push(dx);
  if (dx < RBS_DX_MAX_XSTOCK) agg.dxLt35++;
  // G1 RANGE_BOUND near-miss decomposition (only meaningful for non-RBS bars)
  if (regime !== 'RANGE_BOUND_STABLE') {
    const passVol = vol < RBS_VOL_MAX_XSTOCK;
    const passDx = dx < RBS_DX_MAX_XSTOCK;
    const passDbs = absDbs < RBS_DBS_MAX_XSTOCK;
    if (passVol && passDbs && !passDx) { agg.rbsMissOnlyDx++; agg.rbsMissOnlyDxDxVals.push(dx); }
    if (passDx && passDbs && !passVol) agg.rbsMissOnlyVol++;
    if (passVol && passDx && !passDbs) agg.rbsMissOnlyDbs++;
  }
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return base + 1 < sorted.length ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}
function qline(arr: number[], dp = 6): string {
  const s = [...arr].sort((a, b) => a - b);
  const f = (q: number) => quantile(s, q).toFixed(dp);
  return `p5=${f(0.05)} p25=${f(0.25)} p50=${f(0.5)} p75=${f(0.75)} p95=${f(0.95)}`;
}

function printSummary(label: string, agg: Agg): void {
  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`B.3 REGIME AUDIT — ${label}`);
  console.log(`══════════════════════════════════════════════════════════`);
  console.log(`Total bars: ${agg.total.toLocaleString()} | sentinel-DBS: ${agg.sentinel} (${(100 * agg.sentinel / Math.max(1, agg.total)).toFixed(3)}%, FLOOR estimate)`);
  console.log(`\nRegime distribution (vs live 7d):`);
  console.log(`Regime                        | n        | share  | live%  | Δpp`);
  console.log(`------------------------------|----------|--------|--------|------`);
  let matchOk = true;
  for (const regime of Object.keys(LIVE_7D)) {
    const s = agg.perRegime[regime];
    const n = s?.count ?? 0;
    const share = (100 * n) / Math.max(1, agg.total);
    const live = LIVE_7D[regime];
    const dpp = share - live;
    if (Math.abs(dpp) > 2) matchOk = false;
    console.log(`${regime.padEnd(30)}| ${String(n).padStart(8)} | ${share.toFixed(2).padStart(5)}% | ${live.toFixed(2).padStart(5)}% | ${dpp >= 0 ? '+' : ''}${dpp.toFixed(2)}`);
  }
  const replayRbs = (100 * (agg.perRegime['RANGE_BOUND_STABLE']?.count ?? 0)) / Math.max(1, agg.total);
  const rbsBothLow = replayRbs < 0.5 && LIVE_7D.RANGE_BOUND_STABLE < 0.5;
  console.log(`\nPRE-REGISTERED A3 MATCH (Langston LOCK 2): every regime within ±2pp AND RANGE_BOUND <0.5% both`);
  console.log(`  → all-within-±2pp: ${matchOk ? 'YES' : 'NO'} | RANGE_BOUND<0.5% both: ${rbsBothLow ? 'YES' : 'NO'} | VERDICT: ${matchOk && rbsBothLow ? 'MATCH (replay≈live → B.1 8.8% RBS = artifact, discard replay-of-record, no |dbs| move on reconciliation grounds)' : 'NO MATCH (chase residual)'}`);

  console.log(`\nPer-branch input quartiles:`);
  for (const regime of Object.keys(agg.perRegime).sort()) {
    const s = agg.perRegime[regime];
    console.log(`  ${regime}  (n=${s.count})`);
    console.log(`    vol: ${qline(s.vol)}`);
    console.log(`    dx : ${qline(s.dx, 2)}`);
    console.log(`    dbs: ${qline(s.dbs, 4)}`);
    console.log(`    mom: ${qline(s.mom)}`);
  }

  console.log(`\n── G1 PRIMARY LANE: RANGE_BOUND near-miss attribution (the DX question) ──`);
  console.log(`  RANGE_BOUND requires vol<${RBS_VOL_MAX_XSTOCK} AND dx<${RBS_DX_MAX_XSTOCK} AND |dbs|<${RBS_DBS_MAX_XSTOCK} (all three).`);
  const nonRbs = agg.total - (agg.perRegime['RANGE_BOUND_STABLE']?.count ?? 0);
  const pct = (x: number) => `${x} (${(100 * x / Math.max(1, nonRbs)).toFixed(2)}% of ${nonRbs} non-RBS)`;
  console.log(`  miss ONLY on dx (pass vol+dbs, fail dx<35): ${pct(agg.rbsMissOnlyDx)}  ← the decisive raw-DX number`);
  if (agg.rbsMissOnlyDxDxVals.length) console.log(`     dx among those near-miss bars: ${qline(agg.rbsMissOnlyDxDxVals, 2)}`);
  console.log(`  miss ONLY on vol (pass dx+dbs, fail vol): ${pct(agg.rbsMissOnlyVol)}`);
  console.log(`  miss ONLY on dbs (pass vol+dx, fail dbs): ${pct(agg.rbsMissOnlyDbs)}`);
  console.log(`\n  DX overall: ${qline(agg.dxAll, 2)} | bars with dx<35: ${agg.dxLt35} (${(100 * agg.dxLt35 / Math.max(1, agg.total)).toFixed(2)}%)`);
  console.log(`  INTERPRETATION: if "miss only on dx" is large AND dx-among-them clusters just above 35,`);
  console.log(`  the dx<35 boundary (or raw single-period DX spikiness) is the RANGE_BOUND killer → A4/B3.0 + possible crypto-fence escalation.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('[B3-AUDIT] Building live xstock_spot RegimeConfig from module_constants…');
  const regimeConfig = await buildXstockRegimeConfig(client);
  console.log(`[B3-AUDIT] RegimeConfig: ${JSON.stringify(regimeConfig)}`);
  console.log(`[B3-AUDIT] DBS config: lookback=${DEFAULT_DBS_CONFIG.lookbackPeriod} ema=${DEFAULT_DBS_CONFIG.emaPeriods.fast}/${DEFAULT_DBS_CONFIG.emaPeriods.slow} | window=${WINDOW_BARS} bars`);

  const symbols = await fetchLiveUniverseSymbols(client);
  const maxTs = await fetchMaxTs(client);
  const cutoff7d = maxTs - MATCH_WINDOW_DAYS * 86_400_000;
  console.log(`[B3-AUDIT] ${symbols.length} live-universe symbols | maxTs=${new Date(maxTs).toISOString()} | 7d match cutoff=${new Date(cutoff7d).toISOString()}`);

  const out = createWriteStream(OUT_PATH);
  out.write('symbol,bucket_ts,regime,confidence,vol,mom,dx,dbs,sentinel,session,is_holiday,rbs_miss_only_dx,in_7d\n');

  const aggAll = newAgg();
  const agg7d = newAgg();   // Flag A: verdict-bearing window aligned to LIVE_7D
  const aggRth = newAgg();
  const aggOff = newAgg();
  const aggHoliday = newAgg();

  let processed = 0;
  let totalRows = 0;
  for (const symbol of symbols) {
    const ohlcRes = await client.query<{ bucket_ts: string; open: string; high: string; low: string; close: string; volume: string }>(
      `SELECT bucket_ts, open, high, low, close, volume
         FROM xstock_spot_ohlc_60m_snapshot WHERE symbol = $1 ORDER BY bucket_ts ASC`,
      [symbol],
    );
    const bars: Array<OHLCData & { _ts: string }> = ohlcRes.rows.map((r) => ({
      timestamp: new Date(r.bucket_ts).getTime(),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume),
      _ts: new Date(r.bucket_ts).toISOString(),
    }));

    // Steady-state: classify only bars with a full 60-bar trailing window.
    for (let i = WINDOW_BARS - 1; i < bars.length; i++) {
      const window = bars.slice(i - WINDOW_BARS + 1, i + 1).map((b) => ({
        timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }));
      const bar = bars[i];

      // DBS — production fn, live parity (ATR = computeATRFromOHLC(window,14))
      const atr = computeATRFromOHLC(window, 14);
      if (atr <= 0) continue; // live scanner skips atr<=0 (scanner.ts:716)
      const dbsResult = computeDirectionalBias(window, atr);
      let slope = 0;
      const priorOHLC = window.slice(0, -3);
      if (priorOHLC.length >= 20) {
        const priorAtr = computeATRFromOHLC(priorOHLC, 14);
        if (priorAtr > 0) slope = dbsResult.score - computeDirectionalBias(priorOHLC, priorAtr).score;
      }

      // Regime — production classifier, xstock_spot dispatch
      const res = calculatePairRegime(window, dbsResult.score, slope, 1.0, regimeConfig, 'xstock_spot' as AssetClass);

      const absDbs = Math.abs(dbsResult.score);
      const utcDate = bar._ts.slice(0, 10);
      const isHoliday = utcDate === MEMORIAL_DAY_UTC;
      const hourUtc = new Date(bar.timestamp).getUTCHours();
      const isRth = hourUtc >= 13 && hourUtc < 20; // 13:30-20:00 UTC US RTH (analytical only; xStocks 24/5)
      const session = isRth ? 'us_rth' : 'off_hours';

      const passVol = res.volatility < RBS_VOL_MAX_XSTOCK;
      const passDx = res.adx < RBS_DX_MAX_XSTOCK;
      const passDbs = absDbs < RBS_DBS_MAX_XSTOCK;
      const rbsMissOnlyDx = res.regime !== 'RANGE_BOUND_STABLE' && passVol && passDbs && !passDx;

      const in7d = bar.timestamp >= cutoff7d;
      record(aggAll, res.regime, res.volatility, res.adx, absDbs, res.momentum, dbsResult.sentinelZero);
      if (in7d) record(agg7d, res.regime, res.volatility, res.adx, absDbs, res.momentum, dbsResult.sentinelZero);
      record(isRth ? aggRth : aggOff, res.regime, res.volatility, res.adx, absDbs, res.momentum, dbsResult.sentinelZero);
      if (isHoliday) record(aggHoliday, res.regime, res.volatility, res.adx, absDbs, res.momentum, dbsResult.sentinelZero);

      out.write([
        symbol, bar._ts, res.regime, res.confidence.toFixed(4),
        res.volatility.toFixed(6), res.momentum.toFixed(6), res.adx.toFixed(2), dbsResult.score.toFixed(4),
        dbsResult.sentinelZero ? 1 : 0, session, isHoliday ? 1 : 0, rbsMissOnlyDx ? 1 : 0, in7d ? 1 : 0,
      ].join(',') + '\n');
      totalRows++;
    }
    processed++;
    if (processed % 50 === 0) console.log(`[B3-AUDIT] ${processed}/${symbols.length} symbols, ${totalRows.toLocaleString()} bars`);
  }

  out.end();
  await client.end();
  console.log(`\n[B3-AUDIT] Complete. ${totalRows.toLocaleString()} bars → ${OUT_PATH}`);

  // Flag A: the PRE-REGISTERED MATCH VERDICT is load-bearing ONLY on the 7-day
  // window (aligned to LIVE_7D). The full-window run is for the richer input +
  // near-miss distribution analysis, where the match line is informational only.
  printSummary('★ LAST 7 DAYS — PRE-REGISTERED MATCH VERDICT (aligned to LIVE_7D)', agg7d);
  printSummary('FULL WINDOW (~27d, broader input + near-miss analysis; match line informational)', aggAll);
  printSummary('US-RTH session, full window (13:30-20:00 UTC; analytical only — xStocks 24/5)', aggRth);
  printSummary('OFF-HOURS session, full window', aggOff);
  if (aggHoliday.total > 0) printSummary(`HOLIDAY segment (Memorial Day ${MEMORIAL_DAY_UTC})`, aggHoliday);
  else console.log(`\n[B3-AUDIT] No bars on ${MEMORIAL_DAY_UTC} (ARCA closed — expected; confirms holiday pause).`);
}

main().catch((err) => { console.error('[B3-AUDIT] Fatal:', err); process.exit(1); });
