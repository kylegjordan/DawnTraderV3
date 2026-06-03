#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B.4 FOUNDATION — xStock REGIME-THRESHOLD RECALIBRATION STUDY (READ-ONLY)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Question (B.4 foundation, 60m→15m bar switch): the 14 xStock regime-classifier
 * thresholds in server/asset_classes/xstock_spot/regime-thresholds.ts were
 * calibrated against the 60-MINUTE input distribution (vol/momentum/ADX/|DBS|).
 * At 15-minute bars those same inputs land at DIFFERENT magnitudes (volatility
 * per-bar shrinks, ADX/DBS computed over more, shorter bars), so the SAME
 * numeric cutoffs sit at DIFFERENT percentiles of the 15m distribution → the
 * regime MIX silently shifts. This study produces the distributions Kyle needs
 * to RE-CENTER those thresholds for 15m, plus a percentile-preserving CANDIDATE
 * mapping for each one.
 *
 * It does NOT derive final thresholds. It produces:
 *   (a) percentile tables of each classifier input at BOTH 15m and 60m;
 *   (b) for each current 60m-calibrated threshold, its percentile RANK on the
 *       60m distribution + the 15m value at that SAME percentile = the
 *       percentile-preserving CANDIDATE new threshold;
 *   (c) the regime-MIX collapse demonstration — apply the CURRENT (60m) thresholds
 *       to the 15m inputs and compare the resulting regime mix to the actual
 *       60m regime mix, quantifying the silent shift.
 *
 * ── PARITY / METHODOLOGY ────────────────────────────────────────────────────
 *  - Bars rebuilt from xstock_spot_ohlc_1m (the 1-min archive) by DIRECT SQL
 *    bucket aggregation (epoch/900 for 15m, epoch/3600 for 60m), UNCAPPED over
 *    ALL available history (o=first,h=max,l=min,c=last). NOT the 240-cap cache
 *    aggregator — we want the full rolling distribution (rule #13, decision-grade).
 *  - Each classified bar uses a TRAILING WINDOW that matches the live cache cap:
 *      • 15m: WINDOW_15M = 240 bars (= 60h of bar time; MAX_BARS_15M in
 *        ohlc-aggregator.ts; ≥192 DBS lookback ≥120 regime momentum lookback).
 *      • 60m: WINDOW_60M = 60 bars (= live getOHLCDataBatch(...,60), scanner.ts:537;
 *        B.3 audit parity).
 *    computeVolatility runs over the WHOLE window (whole-array, per its contract),
 *    so the window length is a parity input — hence the per-substrate window.
 *  - A bar is classified only when it has a FULL trailing window AND ≥192 prior
 *    15m bars (so the DBS-192 lookback is saturated; spec requirement).
 *  - Regime inputs use the PRODUCTION functions verbatim:
 *      vol = computeVolatility(window)
 *      mom = computeMomentum(window, momentumLookback)   [15m:120  60m:30]
 *      dx  = computeADX(window, adxPeriod)               [15m:56   60m:14]
 *      dbs = computeDirectionalBias(window, atr, config).score
 *            15m config: {...DEFAULT_DBS_CONFIG, lookbackPeriod:192, emaPeriods:{48,104}}, atr period 56
 *            60m config: DEFAULT_DBS_CONFIG (lookback 48, ema 12/26), atr period 14
 *  - Regime LABEL via production calculatePairRegime(window, dbs, slope, 1.0,
 *    regimeConfig, 'xstock_spot'). regimeConfig is built from module_constants
 *    (same as the B.3 audit) with momentumLookback/adxPeriod overridden per
 *    substrate. macroModifier=1.0 affects confidence only, not the label.
 *  - The regime-MIX-collapse panel re-classifies the 15m inputs with the SAME
 *    production classifier but the CURRENT (60m-calibrated) xStock thresholds
 *    (which is exactly what the code does TODAY for assetClass='xstock_spot'),
 *    so panel (c) is literally "what the live classifier would emit on 15m bars
 *    before any recalibration".
 *
 * ── SANITY ANCHORS (flag a likely bug if violated) ──────────────────────────
 *  - W1 study: 15m regime-flip ~37%, 60m ~34% (different proxy, directional only).
 *  - B.3 audit: 60m regime mix heavily TREND/STRUCTURAL, RANGE_BOUND near-zero
 *    (TFS ~37 / ST ~35 / HVU ~21 / IE ~7 / RBS ~0.02). The 60m panel here uses
 *    bars rebuilt from 1m (not the 60m snapshot) so it need not match exactly,
 *    but a WILDLY different 60m mix (e.g. RBS >5%, or TFS <10%) ⇒ likely bug.
 *
 * ── DISPOSITION ─────────────────────────────────────────────────────────────
 *  READ-ONLY. No writes, no DDL. xStock-only. Zero production blast radius.
 *  Safe to re-invoke. Does NOT set thresholds — produces numbers + candidate map.
 *
 * Usage (on staging — has DATABASE_URL via .env):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && \
 *     npx tsx scripts/b4-regime-recalib-study.ts 2>&1 | tee /tmp/b4_regime_recalib.txt'"
 * ═════════════════════════════════════════════════════════════════════════════
 */

import pg from 'pg';
const { Client } = pg;
import { calculatePairRegime } from '../server/core/metrics/market-regime.js';
import { computeVolatility, computeMomentum, computeADX } from '../server/core/metrics/market-regime.js';
import { computeDirectionalBias } from '../server/core/metrics/directional-bias.js';
import { DEFAULT_DBS_CONFIG, type DBSConfig } from '../server/types/directional-bias.types.js';
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

// ── Per-substrate parity constants ──────────────────────────────────────────
// 15m: NEW per-class time-anchored lookbacks (B.4 foundation; same wall-clock
//      window as the 60m settings). 60m: CURRENT production lookbacks.
const WINDOW_15M = 240;          // = MAX_BARS_15M (60h) live cache cap
const WINDOW_60M = 60;           // = getOHLCDataBatch(...,60) live window
const MIN_PRIOR_15M = 192;       // DBS-192 lookback must be saturated (spec)

const MOM_LOOKBACK_15M = 120;    // 30h @ 15m  (current 30 @ 60m)
const ADX_PERIOD_15M = 56;       // 14h @ 15m  (current 14 @ 60m)
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

// The 5 regimes the classifier can emit (canonical-regime-strategy-map REGIMES).
const REGIME_ORDER = [
  'TREND_FRIENDLY_STABLE',
  'STRUCTURAL_TRANSITION',
  'HIGH_VOLATILITY_UNSTABLE',
  'IMPULSE_EXPANSION',
  'RANGE_BOUND_STABLE',
] as const;

// ── computeATRFromOHLC — VERBATIM copy of scanner.ts:56 / b3-audit (parity) ──
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

// ── Build live xstock_spot RegimeConfig from module_constants (mirrors b3) ────
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

// ── Bar rebuild (direct SQL bucket aggregation, UNCAPPED) ────────────────────
interface FBar extends OHLCData { _ms: number; }
// Per-symbol full F-bar series built in SQL: open=first, high=max, low=min,
// close=last, volume=sum, per epoch/bucketSeconds bucket, ASC by bucket.
async function loadFBars(
  client: InstanceType<typeof Client>,
  symbol: string,
  bucketSeconds: number,
): Promise<FBar[]> {
  // first_value/last_value ordered within the bucket window give true OHLC open/close.
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
      timestamp: ms,
      _ms: ms,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    };
  });
}

// ── Distribution accumulator ─────────────────────────────────────────────────
interface Dist { vol: number[]; mom: number[]; absMom: number[]; adx: number[]; absDbs: number[]; }
function newDist(): Dist { return { vol: [], mom: [], absMom: [], adx: [], absDbs: [] }; }

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return base + 1 < sorted.length ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}
// percentile RANK (fraction of values <= x), linear-interpolated. Inverse of quantile.
function pctRank(sorted: number[], x: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (x <= sorted[0]) return 0;
  if (x >= sorted[n - 1]) return 1;
  // binary search for the first index with sorted[i] >= x
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < x) lo = mid + 1; else hi = mid; }
  // sorted[lo] >= x, sorted[lo-1] < x. Interpolate position between lo-1 and lo.
  const below = sorted[lo - 1];
  const at = sorted[lo];
  const frac = at === below ? 0 : (x - below) / (at - below);
  const pos = (lo - 1) + frac;          // fractional index
  return pos / (n - 1);
}

const PCTS = [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99];
function pctTable(label: string, arr: number[], dp: number): string {
  const s = [...arr].sort((a, b) => a - b);
  const cells = PCTS.map((q) => quantile(s, q).toFixed(dp).padStart(11)).join(' ');
  return `  ${label.padEnd(8)} (n=${String(arr.length).padStart(7)}) | ${cells}`;
}

// ── One substrate's full pass ────────────────────────────────────────────────
interface SubstrateResult {
  label: string;
  dist: Dist;
  regimeCounts: Record<string, number>;
  totalClassified: number;
  symbolsUsed: number;
  totalFBars: number;
  flips: number;
  flipDenom: number;
}

async function runSubstrate(
  client: InstanceType<typeof Client>,
  symbols: string[],
  opts: {
    label: string;
    bucketSeconds: number;
    windowBars: number;
    minPrior: number;
    momentumLookback: number;
    adxPeriod: number;
    atrPeriod: number;
    dbsConfig: DBSConfig;
    regimeConfig: RegimeConfig;
    // when set, RE-classify with these (the OTHER substrate's actual labels are
    // computed inline; this hook is unused — kept for clarity).
  },
): Promise<SubstrateResult> {
  const dist = newDist();
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
    // classify every bar that has a full trailing window AND >= minPrior prior bars
    const startIdx = Math.max(opts.windowBars - 1, opts.minPrior);
    for (let i = startIdx; i < bars.length; i++) {
      const window = bars.slice(i - opts.windowBars + 1, i + 1).map((b) => ({
        timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
      }));
      // DBS — production fn, per-substrate config + ATR period
      const atr = computeATRFromOHLC(window, opts.atrPeriod);
      if (atr <= 0) continue; // live scanner skips atr<=0
      const dbsResult = computeDirectionalBias(window, atr, opts.dbsConfig);
      // DBS slope (prior-3-bar window), parity with scanner.ts:728-735 / b3-audit
      let slope = 0;
      const priorOHLC = window.slice(0, -3);
      if (priorOHLC.length >= 20) {
        const priorAtr = computeATRFromOHLC(priorOHLC, opts.atrPeriod);
        if (priorAtr > 0) slope = dbsResult.score - computeDirectionalBias(priorOHLC, priorAtr, opts.dbsConfig).score;
      }

      // Regime — production classifier, xstock_spot dispatch (CURRENT thresholds)
      const res = calculatePairRegime(window, dbsResult.score, slope, 1.0, opts.regimeConfig, 'xstock_spot' as AssetClass);

      // Distribution accumulation uses the SAME production input fns the
      // classifier used internally (res.volatility/momentum/adx mirror them).
      dist.vol.push(res.volatility);
      dist.mom.push(res.momentum);
      dist.absMom.push(Math.abs(res.momentum));
      dist.adx.push(res.adx);
      dist.absDbs.push(Math.abs(dbsResult.score));

      regimeCounts[res.regime] = (regimeCounts[res.regime] ?? 0) + 1;
      totalClassified++;

      // regime-flip rate between consecutive classified bars (stability anchor)
      if (prevRegime !== null) { flipDenom++; if (res.regime !== prevRegime) flips++; }
      prevRegime = res.regime;
    }
    processed++;
    if (processed % 50 === 0) {
      console.log(`[B4-RECALIB] ${opts.label}: ${processed}/${symbols.length} symbols, ${totalClassified.toLocaleString()} bars classified`);
    }
  }

  return { label: opts.label, dist, regimeCounts, totalClassified, symbolsUsed, totalFBars, flips, flipDenom };
}

// ── Candidate-threshold mapping ──────────────────────────────────────────────
// Each current threshold lives on a particular INPUT distribution. We report its
// percentile rank on the 60m dist + the 15m value at that same percentile.
interface ThreshSpec { name: string; value: number; input: keyof Dist; dp: number; note: string; }
const THRESHOLDS: ThreshSpec[] = [
  { name: 'RBS_VOL_MAX',        value: RBS_VOL_MAX_XSTOCK,        input: 'vol',    dp: 6, note: 'RBS: vol <  this' },
  { name: 'RBS_DX_MAX',         value: RBS_DX_MAX_XSTOCK,         input: 'adx',    dp: 2, note: 'RBS: dx  <  this' },
  { name: 'RBS_DBS_MAX',        value: RBS_DBS_MAX_XSTOCK,        input: 'absDbs', dp: 4, note: 'RBS: |dbs| < this' },
  { name: 'IE_VOL_MIN_PATH_A',  value: IE_VOL_MIN_PATH_A_XSTOCK,  input: 'vol',    dp: 6, note: 'IE-A: vol > this' },
  { name: 'IE_DX_MIN_PATH_A',   value: IE_DX_MIN_PATH_A_XSTOCK,   input: 'adx',    dp: 2, note: 'IE-A: dx  > this' },
  { name: 'IE_VOL_MIN_PATH_B',  value: IE_VOL_MIN_PATH_B_XSTOCK,  input: 'vol',    dp: 6, note: 'IE-B: vol > this' },
  { name: 'IE_DBS_STRONG',      value: IE_DBS_STRONG_XSTOCK,      input: 'absDbs', dp: 4, note: 'IE-B: |dbs| >= this' },
  { name: 'TFS_MOM_MIN_PATH_A', value: TFS_MOM_MIN_PATH_A_XSTOCK, input: 'mom',    dp: 6, note: 'TFS-A: mom > this (signed)' },
  { name: 'TFS_DX_MIN',         value: TFS_DX_MIN_XSTOCK,         input: 'adx',    dp: 2, note: 'TFS-A: dx  > this' },
  { name: 'TFS_DBS_MODERATE',   value: TFS_DBS_MODERATE_XSTOCK,   input: 'absDbs', dp: 4, note: 'TFS-B: |dbs| >= this' },
  { name: 'HVU_VOL_MIN',        value: HVU_VOL_MIN_XSTOCK,        input: 'vol',    dp: 6, note: 'HVU-A: vol > this' },
  { name: 'HVU_MOM_NEG_PATH_A', value: HVU_MOM_NEG_PATH_A_XSTOCK, input: 'mom',    dp: 6, note: 'HVU-A: mom < this (signed, neg)' },
  { name: 'HVU_DX_STRONG',      value: HVU_DX_STRONG_XSTOCK,      input: 'adx',    dp: 2, note: 'HVU-B: dx  > this' },
  { name: 'HVU_MOM_NEG_PATH_B', value: HVU_MOM_NEG_PATH_B_XSTOCK, input: 'mom',    dp: 6, note: 'HVU-B: mom < this (signed, neg)' },
];

function printCandidateMapping(d60: Dist, d15: Dist): void {
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`(b) CANDIDATE-THRESHOLD MAPPING — percentile-preserving (60m rank → 15m value)`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  For each current xStock threshold: its percentile RANK on the 60m distribution`);
  console.log(`  of its input, and the 15m value AT THAT SAME PERCENTILE = the candidate new 15m`);
  console.log(`  threshold. (Percentile-preserving: keeps the same fraction of bars on each side.)`);
  console.log(`  NOTE: this is a NEUTRAL mechanical mapping — NOT a final threshold. Kyle sets finals.\n`);
  const sortedBy: Record<string, number[]> = {};
  for (const k of ['vol', 'mom', 'absMom', 'adx', 'absDbs'] as (keyof Dist)[]) {
    sortedBy[`60_${k}`] = [...d60[k]].sort((a, b) => a - b);
    sortedBy[`15_${k}`] = [...d15[k]].sort((a, b) => a - b);
  }
  console.log(`  threshold              input  | current(60m) | 60m %ile | candidate(15m) | note`);
  console.log(`  -----------------------+-------+--------------+----------+----------------+--------------------`);
  for (const t of THRESHOLDS) {
    const s60 = sortedBy[`60_${t.input}`];
    const s15 = sortedBy[`15_${t.input}`];
    const rank = pctRank(s60, t.value);           // 0..1
    const candidate = quantile(s15, rank);        // 15m value at that percentile
    console.log(
      `  ${t.name.padEnd(22)} ${String(t.input).padEnd(6)} | ` +
      `${t.value.toFixed(t.dp).padStart(12)} | ` +
      `${(rank * 100).toFixed(2).padStart(7)}% | ` +
      `${candidate.toFixed(t.dp).padStart(14)} | ${t.note}`,
    );
  }
}

function printDistPanel(label: string, d: Dist): void {
  console.log(`\n  ── ${label} input percentiles ──`);
  console.log(`  ${'input'.padEnd(8)} ${''.padEnd(11)}  |${PCTS.map((q) => `p${Math.round(q * 100)}`.padStart(12)).join('')}`);
  console.log(pctTable('vol', d.vol, 6));
  console.log(pctTable('mom', d.mom, 6));
  console.log(pctTable('|mom|', d.absMom, 6));
  console.log(pctTable('adx', d.adx, 2));
  console.log(pctTable('|dbs|', d.absDbs, 4));
}

function printRegimeMix(r60: SubstrateResult, r15: SubstrateResult): void {
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`(c) REGIME-MIX COLLAPSE — CURRENT (60m-calibrated) thresholds applied to 15m inputs`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  This is what the LIVE classifier (which still holds the 60m thresholds) WOULD`);
  console.log(`  emit on 15m bars, BEFORE recalibration — vs the actual 60m mix. The Δ quantifies`);
  console.log(`  the silent regime shift the 60m→15m switch causes if thresholds are NOT moved.\n`);
  console.log(`  regime                       | 60m n     60m %  | 15m n     15m %  | Δpp (15m-60m)`);
  console.log(`  -----------------------------+-----------------+-----------------+--------------`);
  for (const reg of REGIME_ORDER) {
    const n60 = r60.regimeCounts[reg] ?? 0;
    const n15 = r15.regimeCounts[reg] ?? 0;
    const p60 = (100 * n60) / Math.max(1, r60.totalClassified);
    const p15 = (100 * n15) / Math.max(1, r15.totalClassified);
    const dpp = p15 - p60;
    console.log(
      `  ${reg.padEnd(28)} | ${String(n60).padStart(8)} ${p60.toFixed(2).padStart(5)}% | ` +
      `${String(n15).padStart(8)} ${p15.toFixed(2).padStart(5)}% | ${dpp >= 0 ? '+' : ''}${dpp.toFixed(2)}`,
    );
  }
  console.log(`  -----------------------------+-----------------+-----------------+--------------`);
  console.log(`  TOTAL classified             | ${String(r60.totalClassified).padStart(8)}        | ${String(r15.totalClassified).padStart(8)}        |`);
  console.log(`\n  regime-flip rate (consecutive classified bars, same symbol):`);
  console.log(`    60m: ${(100 * r60.flips / Math.max(1, r60.flipDenom)).toFixed(2)}% (${r60.flips}/${r60.flipDenom})  |  ` +
              `15m: ${(100 * r15.flips / Math.max(1, r15.flipDenom)).toFixed(2)}% (${r15.flips}/${r15.flipDenom})`);
  console.log(`    [W1 anchor: 15m≈37%, 60m≈34% on a directional 3-bar proxy — different proxy, directional read only]`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('═'.repeat(78));
  console.log('[B4-RECALIB] xStock REGIME-THRESHOLD RECALIBRATION STUDY (READ-ONLY)');
  console.log('═'.repeat(78));

  // Window / history span of the 1m archive (informational).
  const span = await client.query<{ min: string; max: string; n: string }>(
    `SELECT min(interval_begin)::text AS min, max(interval_begin)::text AS max, count(*)::text AS n FROM xstock_spot_ohlc_1m`,
  );
  console.log(`[B4-RECALIB] xstock_spot_ohlc_1m: ${Number(span.rows[0].n).toLocaleString()} rows | ${span.rows[0].min} → ${span.rows[0].max}`);

  // Symbol universe — every symbol with 1m bars (xStock-only table). Full set.
  const symRes = await client.query<{ symbol: string }>(
    `SELECT DISTINCT symbol FROM xstock_spot_ohlc_1m ORDER BY symbol`,
  );
  const symbols = symRes.rows.map((r) => r.symbol);
  console.log(`[B4-RECALIB] ${symbols.length} xStock symbols in the 1m archive\n`);

  // Build the two RegimeConfigs (per-substrate momentum/adx lookbacks).
  const regimeConfig15 = await buildXstockRegimeConfig(client, MOM_LOOKBACK_15M, ADX_PERIOD_15M);
  const regimeConfig60 = await buildXstockRegimeConfig(client, MOM_LOOKBACK_60M, ADX_PERIOD_60M);
  console.log(`[B4-RECALIB] regimeConfig (shared, xstock_spot): ${JSON.stringify({ ...regimeConfig60, momentumLookback: undefined, adxPeriod: undefined })}`);
  console.log(`[B4-RECALIB] 15m lookbacks: mom=${MOM_LOOKBACK_15M} adx=${ADX_PERIOD_15M} | DBS lookback=192 ema=48/104 atr=${ATR_PERIOD_15M} | window=${WINDOW_15M} minPrior=${MIN_PRIOR_15M}`);
  console.log(`[B4-RECALIB] 60m lookbacks: mom=${MOM_LOOKBACK_60M} adx=${ADX_PERIOD_60M} | DBS lookback=${DEFAULT_DBS_CONFIG.lookbackPeriod} ema=${DEFAULT_DBS_CONFIG.emaPeriods.fast}/${DEFAULT_DBS_CONFIG.emaPeriods.slow} atr=${ATR_PERIOD_60M} | window=${WINDOW_60M}`);

  // ── 60m substrate (current production substrate + lookbacks) ────────────────
  console.log(`\n[B4-RECALIB] === 60-MINUTE substrate pass ===`);
  const r60 = await runSubstrate(client, symbols, {
    label: '60m', bucketSeconds: 3600, windowBars: WINDOW_60M, minPrior: 0,
    momentumLookback: MOM_LOOKBACK_60M, adxPeriod: ADX_PERIOD_60M, atrPeriod: ATR_PERIOD_60M,
    dbsConfig: DBS_CONFIG_60M, regimeConfig: regimeConfig60,
  });
  console.log(`[B4-RECALIB] 60m done: ${r60.totalClassified.toLocaleString()} bars classified across ${r60.symbolsUsed} symbols (${r60.totalFBars.toLocaleString()} total 60m bars rebuilt)`);

  // ── 15m substrate (NEW per-class lookbacks; same CURRENT thresholds) ───────
  console.log(`\n[B4-RECALIB] === 15-MINUTE substrate pass ===`);
  const r15 = await runSubstrate(client, symbols, {
    label: '15m', bucketSeconds: 900, windowBars: WINDOW_15M, minPrior: MIN_PRIOR_15M,
    momentumLookback: MOM_LOOKBACK_15M, adxPeriod: ADX_PERIOD_15M, atrPeriod: ATR_PERIOD_15M,
    dbsConfig: DBS_CONFIG_15M, regimeConfig: regimeConfig15,
  });
  console.log(`[B4-RECALIB] 15m done: ${r15.totalClassified.toLocaleString()} bars classified across ${r15.symbolsUsed} symbols (${r15.totalFBars.toLocaleString()} total 15m bars rebuilt)`);

  // ── (a) Percentile tables at both substrates ───────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`(a) INPUT PERCENTILE TABLES — classifier inputs at BOTH substrates (raw N shown)`);
  console.log(`══════════════════════════════════════════════════════════════════════════════`);
  printDistPanel('60-MINUTE (current substrate, current lookbacks)', r60.dist);
  printDistPanel('15-MINUTE (new per-class lookbacks)', r15.dist);

  // ── (b) Candidate-threshold mapping ────────────────────────────────────────
  printCandidateMapping(r60.dist, r15.dist);

  // ── (c) Regime-mix collapse ────────────────────────────────────────────────
  printRegimeMix(r60, r15);

  // ── Current thresholds echo (provenance) ───────────────────────────────────
  console.log(`\n  CURRENT xStock thresholds (server/asset_classes/xstock_spot/regime-thresholds.ts):`);
  for (const t of THRESHOLDS) console.log(`    ${t.name.padEnd(22)} = ${t.value}`);

  await client.end();
  console.log(`\n[B4-RECALIB] complete. READ-ONLY — no writes, no DDL. Thresholds NOT set; candidate map is mechanical/percentile-preserving only.`);
}

main().catch((err) => { console.error('[B4-RECALIB] Fatal:', err); process.exit(1); });
