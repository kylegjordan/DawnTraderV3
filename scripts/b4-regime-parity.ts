#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B.4 FOUNDATION — 3-WAY REGIME-LABEL PARITY REPORT (READ-ONLY)  ── EXIT GATE ──
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * THE B.4-FOUNDATION EXIT GATE. Produces a THREE-baseline joint regime mix so we
 * can prove the NEW 15-minute thresholds RESTORE a sensible regime distribution
 * (no collapse into STRUCTURAL_TRANSITION) — i.e. that the 60m→15m bar switch +
 * paired threshold recalibration leaves the regime mix close to the clean-60m
 * baseline rather than silently warping it.
 *
 * Reuses the b4-regime-recalib-study.ts machinery verbatim (bar rebuild, ATR,
 * DBS slope, RegimeConfig build, per-substrate lookbacks). The only additions:
 *   (1) live-60m mix queried from signal_eval_archive.regime_label;
 *   (3) a clean-15m pass classified with NEW (parameterized) 15m thresholds via
 *       a VERBATIM replica of calculatePairRegime's branch logic (the threshold
 *       object is the only thing swapped — regime-thresholds.ts is NOT edited).
 *
 * ── THE THREE BASELINES ─────────────────────────────────────────────────────
 *  (1) live-60m            : ACTUAL production regime distribution. Query
 *                            signal_eval_archive WHERE asset_class='xstock_spot'
 *                            over the last ~14d, GROUP BY regime_label. This is
 *                            what production EMITS today (60m snapshot substrate,
 *                            current thresholds, live classifier in-loop).
 *  (2) clean-60m (CURRENT) : 1m→60m rebuilt bars, classified by the PRODUCTION
 *                            calculatePairRegime with the CURRENT xStock
 *                            thresholds (the values in regime-thresholds.ts).
 *                            Same engine as the recalib study's 60m panel.
 *  (3) clean-15m (NEW)     : 1m→15m rebuilt bars, NEW per-class lookbacks
 *                            (mom 120 / ADX 56 / DBS 192 ema48-104 / ATR 56),
 *                            classified with the NEW FINAL 15m thresholds passed
 *                            as an OVERRIDE object into a verbatim branch replica.
 *
 * ── DELTAS REPORTED ─────────────────────────────────────────────────────────
 *  (2)→(3)  PURE bar-size effect WITH thresholds recalibrated = the exit-gate
 *           basis. Question: does (3) sit close to (2), i.e. NO ST collapse?
 *  (1)→(2)  substrate effect: live 60m snapshot vs clean 60m rebuild (same
 *           thresholds) — quantifies snapshot-vs-rebuild drift.
 *  (3) vs the recalib study's "15m-with-OLD-thresholds" COLLAPSE mix
 *           (TFS 29.2 / ST 51.2 / HVU 4.9 / IE 5.4 / RBS 9.3) — proves the new
 *           thresholds FIXED the collapse.
 *  + regime-flip rate at 15m under the new thresholds (stability anchor).
 *
 * ── PARITY / METHODOLOGY (inherited from b4-regime-recalib-study.ts) ─────────
 *  - Bars rebuilt from xstock_spot_ohlc_1m by direct SQL bucket aggregation
 *    (epoch/900 for 15m, epoch/3600 for 60m), UNCAPPED over all history,
 *    o=first/h=max/l=min/c=last/v=sum (rule #13, decision-grade rolling window).
 *  - Trailing window per substrate matches the live cache cap: 15m=240 bars
 *    (60h, MAX_BARS_15M), 60m=60 bars (getOHLCDataBatch(...,60)). A 15m bar is
 *    classified only with a full window AND >=192 prior bars (DBS-192 saturated).
 *  - Inputs via PRODUCTION fns verbatim: computeVolatility (whole-array),
 *    computeMomentum(window, lookback), computeADX(window, period),
 *    computeDirectionalBias(window, atr, config).score. DBS slope = score minus
 *    score over window.slice(0,-3) (scanner parity). atr<=0 bars skipped.
 *  - Baseline (2) uses production calculatePairRegime (current thresholds).
 *    Baseline (3) uses classifyWithThresholds() below — a LINE-FOR-LINE replica
 *    of calculatePairRegime's branch chain (market-regime.ts:296-350), reading
 *    the NEW_15M_THRESHOLDS object instead of the imported xStock constants.
 *    The label-selection logic is pure (no other deps), so the replica is
 *    faithful; only the regime LABEL is needed for the mix (confidence omitted).
 *
 * ── DISPOSITION ─────────────────────────────────────────────────────────────
 *  READ-ONLY. No writes, no DDL. xStock-only. Does NOT edit regime-thresholds.ts.
 *  Safe to re-invoke. Run on staging (DATABASE_URL via .env).
 *
 * Usage:
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && \
 *     npx tsx scripts/b4-regime-parity.ts 2>&1 | tee /tmp/b4_regime_parity.txt'"
 * ═════════════════════════════════════════════════════════════════════════════
 */

import pg from 'pg';
const { Client } = pg;
import {
  calculatePairRegime,
  computeVolatility,
  computeMomentum,
  computeADX,
} from '../server/core/metrics/market-regime.js';
import { computeDirectionalBias } from '../server/core/metrics/directional-bias.js';
import { DEFAULT_DBS_CONFIG, type DBSConfig } from '../server/types/directional-bias.types.js';
import type { OHLCData, RegimeConfig } from '../server/types/market-regime.types.js';
import type { AssetClass } from '../shared/asset-classes.js';

// ── Per-substrate parity constants (mirror b4-regime-recalib-study.ts) ───────
const WINDOW_15M = 240;          // = MAX_BARS_15M (60h) live cache cap
const WINDOW_60M = 60;           // = getOHLCDataBatch(...,60) live window
const MIN_PRIOR_15M = 192;       // DBS-192 lookback must be saturated (spec)

const MOM_LOOKBACK_15M = 120;    // 30h @ 15m
const ADX_PERIOD_15M = 56;       // 14h @ 15m
const ATR_PERIOD_15M = 56;       // ATR over 56 @ 15m for DBS normalization
const DBS_CONFIG_15M: DBSConfig = {
  ...DEFAULT_DBS_CONFIG,
  lookbackPeriod: 192,
  emaPeriods: { fast: 48, slow: 104 },
};

const MOM_LOOKBACK_60M = 30;     // current production
const ADX_PERIOD_60M = 14;       // current production
const ATR_PERIOD_60M = 14;       // current production ATR period for DBS norm
const DBS_CONFIG_60M: DBSConfig = DEFAULT_DBS_CONFIG; // lookback 48, ema 12/26

const PATH_B_MOM_KEY = 'b68_5_path_b_momentum_min';
const LIVE_WINDOW_DAYS = 14;

// ── CURRENT xStock thresholds (echoed for the report; values match
//    server/asset_classes/xstock_spot/regime-thresholds.ts — used by the
//    PRODUCTION classifier in baseline (2), NOT re-applied here). ─────────────
const CURRENT_60M_THRESHOLDS = {
  RBS_VOL_MAX: 0.006,
  RBS_DX_MAX: 35,
  RBS_DBS_MAX: 0.10,
  IE_VOL_MIN_PATH_A: 0.010,
  IE_DX_MIN_PATH_A: 40,
  IE_VOL_MIN_PATH_B: 0.0075,
  IE_DBS_STRONG: 0.50,
  TFS_MOM_MIN_PATH_A: 0.0015,
  TFS_DX_MIN: 35,
  TFS_DBS_MODERATE: 0.30,
  HVU_VOL_MIN: 0.0075,
  HVU_MOM_NEG_PATH_A: -0.0015,
  HVU_DX_STRONG: 45,
  HVU_MOM_NEG_PATH_B: -0.0025,
};

// ── NEW FINAL 15m thresholds (B.4 foundation — passed as OVERRIDE; do NOT edit
//    regime-thresholds.ts). ──────────────────────────────────────────────────
const NEW_15M_THRESHOLDS = {
  RBS_VOL_MAX: 0.0037,
  RBS_DX_MAX: 17,
  RBS_DBS_MAX: 0.16,
  IE_VOL_MIN_PATH_A: 0.0059,
  IE_DX_MIN_PATH_A: 19,
  IE_VOL_MIN_PATH_B: 0.0045,
  IE_DBS_STRONG: 0.51,
  TFS_MOM_MIN_PATH_A: 0.0024,
  TFS_DX_MIN: 17,
  TFS_DBS_MODERATE: 0.35,
  HVU_VOL_MIN: 0.0045,
  HVU_MOM_NEG_PATH_A: -0.0010,
  HVU_DX_STRONG: 22,
  HVU_MOM_NEG_PATH_B: -0.0021,
};
type ThresholdSet = typeof NEW_15M_THRESHOLDS;

// Recalib-study "15m-with-OLD-thresholds" COLLAPSE mix (for the fix-proof panel).
const OLD_THRESH_15M_COLLAPSE: Record<string, number> = {
  TREND_FRIENDLY_STABLE: 29.2,
  STRUCTURAL_TRANSITION: 51.2,
  HIGH_VOLATILITY_UNSTABLE: 4.9,
  IMPULSE_EXPANSION: 5.4,
  RANGE_BOUND_STABLE: 9.3,
};

// Canonical 5 regimes (order = canonical-regime-strategy-map REGIMES).
const REGIME_ORDER = [
  'TREND_FRIENDLY_STABLE',
  'STRUCTURAL_TRANSITION',
  'HIGH_VOLATILITY_UNSTABLE',
  'IMPULSE_EXPANSION',
  'RANGE_BOUND_STABLE',
] as const;
type Regime = (typeof REGIME_ORDER)[number];

// ── computeATRFromOHLC — VERBATIM copy of scanner.ts:56 / recalib study ──────
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

// ── classifyWithThresholds — VERBATIM branch replica of calculatePairRegime
//    (market-regime.ts:296-350), with the threshold object parameterized.
//    Returns ONLY the regime LABEL (confidence not needed for the mix). The
//    branch ORDER + conditions are line-for-line identical to production, so
//    swapping the threshold object is the sole difference vs the live path. ──
function classifyWithThresholds(
  vol: number,
  mom: number,
  dx: number,
  absDbs: number,
  pathBMomentumMin: number,
  t: ThresholdSet,
): Regime {
  if (vol < t.RBS_VOL_MAX && dx < t.RBS_DX_MAX && absDbs < t.RBS_DBS_MAX) {
    return 'RANGE_BOUND_STABLE';
  } else if ((vol > t.IE_VOL_MIN_PATH_A && dx > t.IE_DX_MIN_PATH_A) || (vol > t.IE_VOL_MIN_PATH_B && absDbs >= t.IE_DBS_STRONG)) {
    return 'IMPULSE_EXPANSION';
  } else if (
    (mom > t.TFS_MOM_MIN_PATH_A && dx > t.TFS_DX_MIN) ||
    (absDbs >= t.TFS_DBS_MODERATE && mom > pathBMomentumMin)
  ) {
    return 'TREND_FRIENDLY_STABLE';
  } else if ((vol > t.HVU_VOL_MIN && mom < t.HVU_MOM_NEG_PATH_A) || (dx > t.HVU_DX_STRONG && mom < t.HVU_MOM_NEG_PATH_B)) {
    return 'HIGH_VOLATILITY_UNSTABLE';
  } else {
    return 'STRUCTURAL_TRANSITION';
  }
}

// ── Build live xstock_spot RegimeConfig from module_constants (mirrors recalib) ─
async function buildXstockRegimeConfig(
  client: InstanceType<typeof Client>,
  momentumLookback: number,
  adxPeriod: number,
): Promise<RegimeConfig> {
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
    momentumLookback,
    adxPeriod,
  };
}

// ── Bar rebuild (direct SQL bucket aggregation, UNCAPPED) — recalib parity ───
interface FBar extends OHLCData { _ms: number; }
async function loadFBars(
  client: InstanceType<typeof Client>,
  symbol: string,
  bucketSeconds: number,
): Promise<FBar[]> {
  const r = await client.query<{
    bucket: string; open: string; high: string; low: string; close: string; volume: string;
  }>(
    `SELECT bucket,
            (array_agg(open  ORDER BY interval_begin ASC ))[1] AS open,
            max(high)                                          AS high,
            min(low)                                           AS low,
            (array_agg(close ORDER BY interval_begin DESC))[1] AS close,
            sum(volume)                                        AS volume
       FROM (
         SELECT (floor(extract(epoch FROM interval_begin) / $2)::bigint * $2) AS bucket,
                interval_begin, open, high, low, close, volume
           FROM xstock_spot_ohlc_1m
          WHERE symbol = $1
       ) s
      GROUP BY bucket
      ORDER BY bucket ASC`,
    [symbol, bucketSeconds],
  );
  return r.rows.map((row) => {
    const ms = Number(row.bucket) * 1000;
    return {
      timestamp: ms, _ms: ms,
      open: Number(row.open), high: Number(row.high),
      low: Number(row.low), close: Number(row.close), volume: Number(row.volume),
    };
  });
}

// ── Substrate result ─────────────────────────────────────────────────────────
interface SubstrateResult {
  label: string;
  regimeCounts: Record<string, number>;
  totalClassified: number;
  symbolsUsed: number;
  totalFBars: number;
  flips: number;
  flipDenom: number;
}

/**
 * One substrate pass.
 *  - mode='production' → label via production calculatePairRegime (baseline 2).
 *  - mode='override'   → label via classifyWithThresholds(overrideThresholds)
 *                        with the NEW 15m thresholds (baseline 3). Inputs come
 *                        from the SAME production fns + per-substrate DBS config.
 */
async function runSubstrate(
  client: InstanceType<typeof Client>,
  symbols: string[],
  opts: {
    label: string;
    bucketSeconds: number;
    windowBars: number;
    minPrior: number;
    atrPeriod: number;
    dbsConfig: DBSConfig;
    regimeConfig: RegimeConfig;
    mode: 'production' | 'override';
    overrideThresholds?: ThresholdSet;
  },
): Promise<SubstrateResult> {
  const regimeCounts: Record<string, number> = {};
  for (const r of REGIME_ORDER) regimeCounts[r] = 0;
  let totalClassified = 0;
  let symbolsUsed = 0;
  let totalFBars = 0;
  let flips = 0;
  let flipDenom = 0;
  let processed = 0;

  for (const symbol of symbols) {
    const bars = await loadFBars(client, symbol, opts.bucketSeconds);
    totalFBars += bars.length;
    if (bars.length < opts.windowBars || bars.length <= opts.minPrior) { processed++; continue; }
    symbolsUsed++;

    let prevRegime: string | null = null;
    const startIdx = Math.max(opts.windowBars - 1, opts.minPrior);
    for (let i = startIdx; i < bars.length; i++) {
      const window = bars.slice(i - opts.windowBars + 1, i + 1).map((b) => ({
        timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }));
      const atr = computeATRFromOHLC(window, opts.atrPeriod);
      if (atr <= 0) continue; // live scanner skips atr<=0
      const dbsResult = computeDirectionalBias(window, atr, opts.dbsConfig);

      let slope = 0;
      const priorOHLC = window.slice(0, -3);
      if (priorOHLC.length >= 20) {
        const priorAtr = computeATRFromOHLC(priorOHLC, opts.atrPeriod);
        if (priorAtr > 0) slope = dbsResult.score - computeDirectionalBias(priorOHLC, priorAtr, opts.dbsConfig).score;
      }

      let regime: string;
      if (opts.mode === 'production') {
        // PRODUCTION classifier (current xStock thresholds) — baseline (2).
        const res = calculatePairRegime(window, dbsResult.score, slope, 1.0, opts.regimeConfig, 'xstock_spot' as AssetClass);
        regime = res.regime;
      } else {
        // OVERRIDE classifier (NEW 15m thresholds) — baseline (3). Inputs use
        // the SAME production fns + per-substrate lookbacks as production would.
        const vol = computeVolatility(window);
        const mom = computeMomentum(window, opts.regimeConfig.momentumLookback);
        const dx = computeADX(window, opts.regimeConfig.adxPeriod);
        const absDbs = Math.abs(dbsResult.score);
        regime = classifyWithThresholds(
          vol, mom, dx, absDbs,
          opts.regimeConfig.b68_5PathBMomentumMin,
          opts.overrideThresholds!,
        );
      }

      regimeCounts[regime] = (regimeCounts[regime] ?? 0) + 1;
      totalClassified++;
      if (prevRegime !== null) { flipDenom++; if (regime !== prevRegime) flips++; }
      prevRegime = regime;
    }
    processed++;
    if (processed % 50 === 0) {
      console.log(`[B4-PARITY] ${opts.label}: ${processed}/${symbols.length} symbols, ${totalClassified.toLocaleString()} bars classified`);
    }
  }

  return { label: opts.label, regimeCounts, totalClassified, symbolsUsed, totalFBars, flips, flipDenom };
}

// ── Live-60m mix from signal_eval_archive.regime_label ───────────────────────
interface LiveResult { regimeCounts: Record<string, number>; total: number; nullN: number; minTs: string; maxTs: string; }
async function loadLive60m(client: InstanceType<typeof Client>): Promise<LiveResult> {
  const grp = await client.query<{ regime_label: string | null; n: string }>(
    `SELECT regime_label, count(*)::text AS n
       FROM signal_eval_archive
      WHERE asset_class = 'xstock_spot'
        AND captured_at >= now() - ($1 || ' days')::interval
      GROUP BY regime_label`,
    [String(LIVE_WINDOW_DAYS)],
  );
  const span = await client.query<{ min: string; max: string }>(
    `SELECT min(captured_at)::text AS min, max(captured_at)::text AS max
       FROM signal_eval_archive
      WHERE asset_class = 'xstock_spot'
        AND captured_at >= now() - ($1 || ' days')::interval`,
    [String(LIVE_WINDOW_DAYS)],
  );
  const regimeCounts: Record<string, number> = {};
  for (const r of REGIME_ORDER) regimeCounts[r] = 0;
  let total = 0;
  let nullN = 0;
  for (const row of grp.rows) {
    const n = Number(row.n);
    total += n;
    if (row.regime_label === null) { nullN += n; continue; }
    if (!(row.regime_label in regimeCounts)) regimeCounts[row.regime_label] = 0; // surface any unexpected label
    regimeCounts[row.regime_label] += n;
  }
  return { regimeCounts, total, nullN, minTs: span.rows[0]?.min ?? 'n/a', maxTs: span.rows[0]?.max ?? 'n/a' };
}

// ── Report helpers ───────────────────────────────────────────────────────────
function pct(n: number, denom: number): number { return denom > 0 ? (100 * n) / denom : 0; }

function printThreeWay(live: LiveResult, clean60: SubstrateResult, clean15: SubstrateResult): void {
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`THREE-WAY REGIME MIX (%, raw N) — the EXIT-GATE panel`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  (1) live-60m  = signal_eval_archive.regime_label, xstock_spot, last ${LIVE_WINDOW_DAYS}d`);
  console.log(`  (2) clean-60m = 1m→60m rebuild, PRODUCTION classifier, CURRENT thresholds`);
  console.log(`  (3) clean-15m = 1m→15m rebuild, NEW lookbacks + NEW thresholds (override)\n`);
  console.log(`  regime                       |   (1) live-60m        |   (2) clean-60m       |   (3) clean-15m`);
  console.log(`                               |   N          %        |   N          %        |   N          %`);
  console.log(`  -----------------------------+-----------------------+-----------------------+----------------------`);
  for (const reg of REGIME_ORDER) {
    const lN = live.regimeCounts[reg] ?? 0;
    const c6N = clean60.regimeCounts[reg] ?? 0;
    const c1N = clean15.regimeCounts[reg] ?? 0;
    console.log(
      `  ${reg.padEnd(28)} | ${String(lN).padStart(10)} ${pct(lN, live.total).toFixed(2).padStart(6)}%  | ` +
      `${String(c6N).padStart(10)} ${pct(c6N, clean60.totalClassified).toFixed(2).padStart(6)}%  | ` +
      `${String(c1N).padStart(10)} ${pct(c1N, clean15.totalClassified).toFixed(2).padStart(6)}%`,
    );
  }
  console.log(`  -----------------------------+-----------------------+-----------------------+----------------------`);
  console.log(
    `  ${'TOTAL'.padEnd(28)} | ${String(live.total).padStart(10)}          | ` +
    `${String(clean60.totalClassified).padStart(10)}          | ${String(clean15.totalClassified).padStart(10)}`,
  );
  if (live.nullN > 0) console.log(`  (note: ${live.nullN} live rows had NULL regime_label — excluded from %)`);
}

function printDeltas(live: LiveResult, clean60: SubstrateResult, clean15: SubstrateResult): void {
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`DELTA PANELS`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);

  // (2)→(3): pure bar-size effect WITH thresholds recalibrated = EXIT-GATE basis.
  console.log(`\n  ── (2)→(3) Δpp  PURE BAR-SIZE EFFECT (thresholds recalibrated) = EXIT-GATE BASIS ──`);
  console.log(`     Question: is (3) close to (2)? i.e. do the NEW thresholds AVOID an ST collapse?`);
  console.log(`     regime                       | (2) clean-60m % | (3) clean-15m % | Δpp (3-2)`);
  console.log(`     -----------------------------+-----------------+-----------------+----------`);
  let maxAbs23 = 0;
  for (const reg of REGIME_ORDER) {
    const p2 = pct(clean60.regimeCounts[reg] ?? 0, clean60.totalClassified);
    const p3 = pct(clean15.regimeCounts[reg] ?? 0, clean15.totalClassified);
    const d = p3 - p2;
    if (Math.abs(d) > maxAbs23) maxAbs23 = Math.abs(d);
    console.log(`     ${reg.padEnd(28)} | ${p2.toFixed(2).padStart(13)}%  | ${p3.toFixed(2).padStart(13)}%  | ${d >= 0 ? '+' : ''}${d.toFixed(2)}`);
  }
  console.log(`     -----------------------------+-----------------+-----------------+----------`);
  console.log(`     max |Δpp| across regimes = ${maxAbs23.toFixed(2)}pp  (smaller = mix better preserved across bar-size)`);

  // (1)→(2): substrate effect (live snapshot vs clean rebuild at 60m).
  console.log(`\n  ── (1)→(2) Δpp  SUBSTRATE EFFECT (live 60m snapshot vs clean 60m rebuild) ──`);
  console.log(`     regime                       | (1) live-60m %  | (2) clean-60m % | Δpp (2-1)`);
  console.log(`     -----------------------------+-----------------+-----------------+----------`);
  for (const reg of REGIME_ORDER) {
    const p1 = pct(live.regimeCounts[reg] ?? 0, live.total);
    const p2 = pct(clean60.regimeCounts[reg] ?? 0, clean60.totalClassified);
    const d = p2 - p1;
    console.log(`     ${reg.padEnd(28)} | ${p1.toFixed(2).padStart(13)}%  | ${p2.toFixed(2).padStart(13)}%  | ${d >= 0 ? '+' : ''}${d.toFixed(2)}`);
  }
}

function printCollapseFixProof(clean15: SubstrateResult): void {
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`COLLAPSE-FIX PROOF — (3) NEW-threshold 15m  vs  recalib-study OLD-threshold 15m`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  OLD-threshold 15m = the recalib study's "current 60m thresholds applied to 15m"`);
  console.log(`  collapse (ST balloons to 51.2%). NEW 15m thresholds should pull ST back DOWN and`);
  console.log(`  restore TFS/HVU/IE/RBS toward the clean-60m mix.\n`);
  console.log(`  regime                       | OLD-thr 15m %  | NEW-thr 15m %  | Δpp (NEW-OLD)`);
  console.log(`  -----------------------------+----------------+----------------+--------------`);
  for (const reg of REGIME_ORDER) {
    const old = OLD_THRESH_15M_COLLAPSE[reg] ?? 0;
    const neu = pct(clean15.regimeCounts[reg] ?? 0, clean15.totalClassified);
    const d = neu - old;
    console.log(`  ${reg.padEnd(28)} | ${old.toFixed(2).padStart(12)}%  | ${neu.toFixed(2).padStart(12)}%  | ${d >= 0 ? '+' : ''}${d.toFixed(2)}`);
  }
  const stNew = pct(clean15.regimeCounts['STRUCTURAL_TRANSITION'] ?? 0, clean15.totalClassified);
  console.log(`  -----------------------------+----------------+----------------+--------------`);
  console.log(`  ST: OLD 51.2% → NEW ${stNew.toFixed(2)}%  (collapse ${stNew < 51.2 ? 'REDUCED by ' + (51.2 - stNew).toFixed(2) + 'pp' : 'NOT reduced'})`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('═'.repeat(78));
  console.log('[B4-PARITY] 3-WAY REGIME-LABEL PARITY REPORT (READ-ONLY) — B.4 FOUNDATION EXIT GATE');
  console.log('═'.repeat(78));

  const span = await client.query<{ min: string; max: string; n: string }>(
    `SELECT min(interval_begin)::text AS min, max(interval_begin)::text AS max, count(*)::text AS n FROM xstock_spot_ohlc_1m`,
  );
  console.log(`[B4-PARITY] xstock_spot_ohlc_1m: ${Number(span.rows[0].n).toLocaleString()} rows | ${span.rows[0].min} → ${span.rows[0].max}`);

  const symRes = await client.query<{ symbol: string }>(
    `SELECT DISTINCT symbol FROM xstock_spot_ohlc_1m ORDER BY symbol`,
  );
  const symbols = symRes.rows.map((r) => r.symbol);
  console.log(`[B4-PARITY] ${symbols.length} xStock symbols in the 1m archive`);

  // ── (1) live-60m ────────────────────────────────────────────────────────────
  console.log(`\n[B4-PARITY] === (1) LIVE-60m mix from signal_eval_archive.regime_label ===`);
  const live = await loadLive60m(client);
  console.log(`[B4-PARITY] live window: ${live.minTs} → ${live.maxTs} | ${live.total.toLocaleString()} rows (${live.nullN} null regime_label)`);

  // Build per-substrate RegimeConfigs (mom/adx lookbacks per substrate).
  const regimeConfig15 = await buildXstockRegimeConfig(client, MOM_LOOKBACK_15M, ADX_PERIOD_15M);
  const regimeConfig60 = await buildXstockRegimeConfig(client, MOM_LOOKBACK_60M, ADX_PERIOD_60M);
  console.log(`[B4-PARITY] regimeConfig (xstock_spot, shared scales): ${JSON.stringify({ ...regimeConfig60, momentumLookback: undefined, adxPeriod: undefined })}`);
  console.log(`[B4-PARITY] 15m lookbacks: mom=${MOM_LOOKBACK_15M} adx=${ADX_PERIOD_15M} DBS=192 ema=48/104 atr=${ATR_PERIOD_15M} window=${WINDOW_15M} minPrior=${MIN_PRIOR_15M}`);
  console.log(`[B4-PARITY] 60m lookbacks: mom=${MOM_LOOKBACK_60M} adx=${ADX_PERIOD_60M} DBS=${DEFAULT_DBS_CONFIG.lookbackPeriod} ema=${DEFAULT_DBS_CONFIG.emaPeriods.fast}/${DEFAULT_DBS_CONFIG.emaPeriods.slow} atr=${ATR_PERIOD_60M} window=${WINDOW_60M}`);
  console.log(`[B4-PARITY] live path-B momentum min = ${regimeConfig60.b68_5PathBMomentumMin}`);

  // ── (2) clean-60m, CURRENT thresholds (production classifier) ───────────────
  console.log(`\n[B4-PARITY] === (2) CLEAN-60m pass (production classifier, current thresholds) ===`);
  const clean60 = await runSubstrate(client, symbols, {
    label: '60m', bucketSeconds: 3600, windowBars: WINDOW_60M, minPrior: 0,
    atrPeriod: ATR_PERIOD_60M, dbsConfig: DBS_CONFIG_60M, regimeConfig: regimeConfig60,
    mode: 'production',
  });
  console.log(`[B4-PARITY] (2) done: ${clean60.totalClassified.toLocaleString()} bars / ${clean60.symbolsUsed} symbols (${clean60.totalFBars.toLocaleString()} 60m bars rebuilt)`);

  // ── (3) clean-15m, NEW thresholds (override classifier) ─────────────────────
  console.log(`\n[B4-PARITY] === (3) CLEAN-15m pass (NEW lookbacks + NEW thresholds, override) ===`);
  const clean15 = await runSubstrate(client, symbols, {
    label: '15m', bucketSeconds: 900, windowBars: WINDOW_15M, minPrior: MIN_PRIOR_15M,
    atrPeriod: ATR_PERIOD_15M, dbsConfig: DBS_CONFIG_15M, regimeConfig: regimeConfig15,
    mode: 'override', overrideThresholds: NEW_15M_THRESHOLDS,
  });
  console.log(`[B4-PARITY] (3) done: ${clean15.totalClassified.toLocaleString()} bars / ${clean15.symbolsUsed} symbols (${clean15.totalFBars.toLocaleString()} 15m bars rebuilt)`);

  // ── Report ──────────────────────────────────────────────────────────────────
  printThreeWay(live, clean60, clean15);
  printDeltas(live, clean60, clean15);
  printCollapseFixProof(clean15);

  // ── Regime-flip rates ───────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`REGIME-FLIP RATE (consecutive classified bars, same symbol)`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  (2) clean-60m current-thresh : ${pct(clean60.flips, clean60.flipDenom).toFixed(2)}% (${clean60.flips}/${clean60.flipDenom})`);
  console.log(`  (3) clean-15m NEW-thresh     : ${pct(clean15.flips, clean15.flipDenom).toFixed(2)}% (${clean15.flips}/${clean15.flipDenom})  ← exit-gate stability number`);
  console.log(`  [W1 anchor: 15m≈37%, 60m≈34% on a directional 3-bar proxy — different proxy, directional read only]`);

  // ── Threshold provenance echo ───────────────────────────────────────────────
  console.log(`\n  CURRENT 60m thresholds (regime-thresholds.ts) used by (2):`);
  for (const [k, v] of Object.entries(CURRENT_60M_THRESHOLDS)) console.log(`    ${k.padEnd(20)} = ${v}`);
  console.log(`\n  NEW 15m thresholds (override, NOT written to regime-thresholds.ts) used by (3):`);
  for (const [k, v] of Object.entries(NEW_15M_THRESHOLDS)) console.log(`    ${k.padEnd(20)} = ${v}`);

  await client.end();
  console.log(`\n[B4-PARITY] complete. READ-ONLY — no writes, no DDL, regime-thresholds.ts NOT edited.`);
}

main().catch((err) => { console.error('[B4-PARITY] Fatal:', err); process.exit(1); });
