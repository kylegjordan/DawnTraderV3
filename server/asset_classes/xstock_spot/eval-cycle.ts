/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b2 — xstock_spot VTS evaluation cycle (parallel pattern path + fan-out)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per-pair post-filter chain for xstock_spot. Called from xstockSpotScanner
 * after the per-pair freshness gate succeeds. Mirrors crypto's `fx5-scanner.ts`
 * + `vts-runner.ts` shape EXACTLY (architectural lock per Kyle directive
 * 2026-05-11 + Langston rev2 sign-off): same 6 filter paths (5 quant families
 * + 1 pattern), same fan-out (a pair passing N families + pattern produces
 * `N + 1` evaluation entries), same family-routed strategy iteration via
 * `STRATEGY_FAMILY_MAP`, same per-pair post-detect math, same exit cycle.
 * Differences live in DB rows (`screener_filters` + `module_constants`), NOT
 * code.
 *
 * Pipeline:
 *
 *   market-hours → global-filter → MCE → family-IMF (5 lanes) || pattern-filter
 *      ↓                                       ↓                     ↓
 *      reject                          one lane per passed family + (if pattern passed) one pattern lane
 *                                                       ↓
 *                                       per-lane strategy iteration:
 *                                         - pattern lane → STRATEGY_FAMILY_MAP[s] === 'pattern'
 *                                         - family lane → primary OR hybrid OR multi-family match
 *                                                       ↓
 *                                       detect → setup-hash → finalScore → Net-EV → archive → registerOpenVtsTrade
 *
 * SQE is intentionally NOT called (crypto VTS doesn't call SQE either —
 * confirmed via grep on `vts-runner.ts`). Active-trading dispatch is
 * separately wired via signal-orchestrator.
 *
 * Setup-hash dedupe is assetClass-keyed via `isIdenticalXstockSetupSuppressed`
 * (Langston rev2 R6 from B79.0m.b). Pattern-pool guardrails (final_score_floor
 * = 0.45, max_position_pct = 0.50) live in `module_constants.pattern_pool_
 * gates.xstock_spot.*` and are consumed downstream (not enforced here at
 * Layer-1; calibration debt — see BATCH_79_0m_b2_PRE_AUDIT.md §-1.10).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getMarketContextEngine } from '../../services/market-context-engine.js';
// B-XSTOCK-GLOBALS (Kyle-raised 2026-06-18): the per-class GLOBAL market-structure
// cache getters. getMarketIndicators('xstock_spot') populates these every cycle; the
// xStock VTS open-path reads them here to stamp the at-open global snapshot (the crypto
// inline path at vts-runner.ts:1561-1576 does the equivalent; the xStock caller did not,
// so every xStock VTS row persisted blank globalRegime/Friction/DBS — UI "—"/"pending").
import { getCurrentRegime, getGlobalFriction, getLastGlobalDBSCategory, getLastGlobalDBSScore } from '../../services/market-indicators.js';
import { recordSyncSpan, syncSpanStart } from '../../services/scan-stall-instrument.js';
import {
  getStrategiesForRegime,
  isStrategyEnabledForAssetClass,
  normalizePatternToCanonical,
  normalizeStrategy,
  STRATEGY_FAMILY_MAP,
  type StrategyFamily,
} from '../../config/canonical-regime-strategy-map.js';
import {
  callStrategyDetect,
  registerOpenVtsTrade,
  maybeOpenTwin,
  isIdenticalXstockSetupSuppressed,
  computeFinalScore,
  checkPreOpenGates,
  VTS_NET_EV_FLOOR,
} from '../../services/vts-runner.js';
// P19-B7.2d (#434): the SHARED maker/taker decision + B7.2c pending lifecycle, wired
// into this lane at parity with crypto's vts-runner placement (B7.2b :1688 + B7.2c :1944).
import { decideMakerTaker, entryUrgencyClassForFamily } from '../../core/math/maker-taker-decision.js';
import { resolveMakerTakerHaircut, resolveMakerMaxPendingMs } from '../../services/maker-taker-config.js';
import { isMarketableAtPlacement } from '../../core/trading/pending-maker-logic.js';
// P19-B4a (C2): xStock active-path dispatch (stamp-at-source wire-in; dormant until B7b).
import { dispatchXstockActiveSignal } from './active-dispatch.js';
import { resetNullReason, getNullReason } from '../../utils/null-reason-tracker.js';
import { isXstockMarketOpenUTC } from './market-hours.js';
import { evaluateXstockGlobalFilter } from './global-filter.js';
import { evaluateXstockFamilyIMF } from './imf-evaluator.js';
import { evaluateXstockPatternFilter } from './pattern-filter.js';
import { scanPatterns } from '../../services/pattern-recognizer.js';
// reorg-B3.3x (2026-06-24): the SHARED VTS gate (reorg-B2 normalizer + reorg-B3.2 tag-don't-drop +
// reorg-B3.3y target<=entry validity) — the same one crypto vts-runner runs. Unifies xStock VTS gating
// onto the one SSOT instead of a hand-rolled second copy (Langston Option B).
import { normalizeAndGateTarget } from '../../core/calculations/signal-target-normalizer.js';
import { getPerClassTargetGate } from '../../core/calculations/expectancy.js';
import { computeRealHybridScore, computeRealDecayPenalty } from '../../core/utils/vts-real-score.js';
import { getPredictiveConfidence } from '../../core/utils/score-calculator.js';
import { calculateRegimeScore } from '../../core/metrics/market-regime.js';
import { getCachedCostMetrics, getFrictionForAssetClass } from '../../core/math/cost-model.js';
import { getCachedNumberRequired } from '../../services/module-constants-service.js';
import { buildBarProvenance } from '../../services/data-archive/signal-eval-archiver.js'; // B-NEW-53 shared forming-bar snapshot
import { buildMacroSnapshot } from './macro-snapshot.js'; // P19-B5b (#94): xStock decision-time macro snapshot
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import type { OHLCData } from '../../types/market-regime.types';

const _XSTOCK_GK = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };

// B-NEW-34 (2026-05-15): `fetchXstockOHLC` REMOVED. Replaced by the
// `xstockOhlcCache` (server/services/xstock-ohlc-cache.ts) which aggregates
// 60-min + 240-min bars from `xstock_spot_ohlc_1m` via SQL rollup and caches
// with 5-min TTL. Scanner now fetches the batch up-front per cycle and
// passes pre-rolled bars into evaluateXstockPairForVTS — no per-pair 1-min
// query in the hot loop.
//
// xstock_spot_ohlc_1m remains the long-term canonical 1-min store (B74
// archive). Backtesting + ML training paths still query it directly.

const ASSET_CLASS = 'xstock_spot' as const;

/**
 * Per-cycle pre-loaded screener_filters config bundle. Loaded ONCE at the top
 * of scanner.runCycle (mirroring crypto fx5-scanner.ts:737-815 which loads
 * `vts_quant` + `vts_pattern` + 5 family rows once per cycle and passes them
 * through). Pre-bundle, each filter function did its own per-pair DB lookup
 * — for a 234-fresh-pair cycle that's 7 lookups × 234 pairs = 1638 redundant
 * round-trips to Supabase, saturating the connection pool and dragging
 * cycle time from ~22s to 280s+.
 */
export interface XstockFilterConfigBundle {
  globalQuant: any | null;             // screener_filters row for 'active_quant'
  pattern: any | null;                 // screener_filters row for 'vts_pattern' or 'active_pattern'
  families: Map<string, any>;          // 5 entries: 'vts_trend' .. 'vts_strong_trend'
}

import { storage } from '../../storage.js';

const FAMILY_PATHS_FOR_BUNDLE = ['vts_trend', 'vts_reversal', 'vts_breakout', 'vts_oscillator', 'vts_strong_trend'] as const;

export async function loadXstockFilterConfigs(mode: 'paper' | 'live'): Promise<XstockFilterConfigBundle> {
  const globalQuant = await storage.getScreenerFilters({ mode, assetClass: 'xstock_spot', filterPath: 'active_quant' }).catch(() => null);
  const patternPath = mode === 'paper' ? 'vts_pattern' : 'active_pattern';
  const pattern = await storage.getScreenerFilters({ mode, assetClass: 'xstock_spot', filterPath: patternPath }).catch(() => null);
  const families = new Map<string, any>();
  for (const fp of FAMILY_PATHS_FOR_BUNDLE) {
    const row = await storage.getScreenerFilters({ mode, assetClass: 'xstock_spot', filterPath: fp }).catch(() => null);
    if (row) families.set(fp, row);
  }
  return { globalQuant, pattern, families };
}

const XSTOCK_BENCHMARKS: ReadonlySet<string> = new Set([
  'SPY/USD',
  'QQQ/USD',
  'IWM/USD',
  'DIA/USD',
  'GLD/USD',
]);

function isXstockBenchmark(symbol: string): boolean {
  return XSTOCK_BENCHMARKS.has(symbol);
}

export interface XstockEvalCycleCounters {
  pairsEntered: number;
  pairsFailedMarketHours: number;
  pairsFailedGlobalFilter: number;
  pairsFailedAllFamilies: number;
  pairsPassedFamilies: number;
  // B79.0m.b2 — pattern path counters
  pairsPassedPattern: number;
  pairsFailedPattern: number;
  patternRejectByMinHistory: number;     // Langston rev1 edit #7 — instant tripwire for §-1.1 implementation
  patternFanOut: number;                  // pairs admitted to pattern lane (1 per pair max — not multi-fanout like families)
  strategiesEvaluated: number;
  strategyNulls: number;
  signalsGenerated: number;
  signalsArchived: number;
  signalsRejectedBySQE: number;
  tradesOpened: number;
  errors: number;
  // B79.0m.b2-followup (2026-05-12): per-lane (quant vs pattern) split for the
  // VTS Evaluation Detail panel. The endpoint was hardcoding patternPairs
  // Evaluated/StrategyEvaluations/SignalsGenerated to 0, leaving the panel
  // showing "pattern path goes dead after VTS destination." These counters
  // populate from the lane-iteration loop so the panel shows real numbers.
  quantPairsEvaluated: number;        // unique pairs that hit ≥1 family lane
  patternPairsEvaluated: number;      // unique pairs that hit the pattern lane
  quantStrategiesEvaluated: number;   // strategy-detect calls inside family lanes
  patternStrategiesEvaluated: number; // strategy-detect calls inside the pattern lane
  quantStrategyNulls: number;
  patternStrategyNulls: number;
  quantSignalsGenerated: number;
  patternSignalsGenerated: number;
  // B-NEW-9 per-lane trade counts (2026-05-12). Distinct from
  // *SignalsGenerated which is post-detect (pre-gate). These two are the
  // actual "trade was opened" counters, per lane.
  quantTradesOpened: number;
  patternTradesOpened: number;
  quantSignalsRejected: number;       // post-detect rejection (Net EV gate or pre-open)
  patternSignalsRejected: number;
  // B79.0m.b2-followup: setup-hash dedupe was a silent `continue;` —
  // strategy fires a signal but it dedupes against a prior identical setup
  // and the signal vanishes with no counter. Result: signalsGenerated > 0
  // while tradesOpened = 0 with no visible reason in the diagnostics panel.
  setupHashDeduped: number;
  // B79.0m.b2 Langston Step 4 nit #7 (2026-05-11): counter for silent archive
  // failures in the 4 archiveSignalEval try/catch blocks (strategy_internal,
  // sqe, tcl, admitted). Currently swallowed `catch { /* hot path */ }` per
  // pre-existing crypto pattern; this counter surfaces them in PM2 logs +
  // the diagnostics endpoint so a schema drift or insert failure isn't
  // invisible.
  archiveFailures: number;
  globalFilterCounters: Record<string, number>;
  imfFilterCounters: Record<string, number>;
  patternFilterCounters: Record<string, number>;  // B79.0m.b2 — pattern-side merge target
  imfPerMetric: { failedLQ: number; failedVN: number; failedCorr: number; failedDI: number; passed: number; total: number };
  imfPerFamily: Record<string, { evaluated: number; failedLQ: number; failedVN: number; failedCorr: number; failedDI: number; passed: number }>;
  patternPerMetric: { failedLQ: number; failedVN: number; failedDI: number; passed: number; total: number };  // B79.0m.b2
  familyFanOutSum: number;
  familyQualifiedUnique: number;
  benchmarksRemoved: number;
  vtsDestination: number;
  byStrategyNullReasons: Record<string, Record<string, number>>;
  nullReasonAggregate: Record<string, number>;
  // B-NEW-12.b (2026-05-13): per-lane null-reason aggregates so the panel's
  // Quant + Pattern columns can show their share of each reason against
  // their own evaluation total. Previously the panel rendered the combined
  // aggregate in the Quant column → sums could exceed 100% of quant evals.
  quantNullReasonAggregate: Record<string, number>;
  patternNullReasonAggregate: Record<string, number>;
  byStrategy: Record<string, { evaluated: number; nulls: number; signals: number; rejected: number; trades: number }>;
}

export function makeEmptyXstockCycleCounters(): XstockEvalCycleCounters {
  return {
    pairsEntered: 0,
    pairsFailedMarketHours: 0,
    pairsFailedGlobalFilter: 0,
    pairsFailedAllFamilies: 0,
    pairsPassedFamilies: 0,
    pairsPassedPattern: 0,
    pairsFailedPattern: 0,
    patternRejectByMinHistory: 0,
    patternFanOut: 0,
    strategiesEvaluated: 0,
    strategyNulls: 0,
    signalsGenerated: 0,
    signalsArchived: 0,
    signalsRejectedBySQE: 0,
    tradesOpened: 0,
    errors: 0,
    quantPairsEvaluated: 0,
    patternPairsEvaluated: 0,
    quantStrategiesEvaluated: 0,
    patternStrategiesEvaluated: 0,
    quantStrategyNulls: 0,
    patternStrategyNulls: 0,
    quantSignalsGenerated: 0,
    patternSignalsGenerated: 0,
    quantTradesOpened: 0,
    patternTradesOpened: 0,
    quantSignalsRejected: 0,
    patternSignalsRejected: 0,
    setupHashDeduped: 0,
    archiveFailures: 0,
    globalFilterCounters: {},
    imfFilterCounters: {},
    patternFilterCounters: {},
    imfPerMetric: { failedLQ: 0, failedVN: 0, failedCorr: 0, failedDI: 0, passed: 0, total: 0 },
    imfPerFamily: {},
    patternPerMetric: { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0 },
    familyFanOutSum: 0,
    familyQualifiedUnique: 0,
    benchmarksRemoved: 0,
    vtsDestination: 0,
    byStrategyNullReasons: {},
    nullReasonAggregate: {},
    quantNullReasonAggregate: {},
    patternNullReasonAggregate: {},
    byStrategy: {},
  };
}

function mergeCounters(target: Record<string, number>, src: Record<string, number>): void {
  for (const k of Object.keys(src)) {
    target[k] = (target[k] ?? 0) + src[k];
  }
}

// B79.0m.b2 (Langston Step 4 nit #1): EvalLane type + isStrategyEligibleForLane
// helper extracted to `./lane-eligibility.ts` so unit tests can import the
// production function without pulling in the full eval-cycle dependency graph.
// See `b79-0m-b2-lane-eligibility.test.ts`.
import { isStrategyEligibleForLane, type EvalLane } from './lane-eligibility.js';

/**
 * Evaluate a single xstock pair through the full post-filter chain (parallel
 * pattern + family fan-out). Mutates `counters` in-place; never throws.
 */
export async function evaluateXstockPairForVTS(
  symbol: string,
  ohlc: OHLCData[],
  lastPrice: number,
  volume24h: number,
  mode: 'paper' | 'live',
  counters: XstockEvalCycleCounters,
  configs?: XstockFilterConfigBundle,
  // B-NEW-14 (2026-05-14): bid/ask spread % measured at scan time from the
  // latest snap row by the scanner. Threaded into BOTH global filters
  // (quant + pattern) so max_bid_ask_spread runs as a peer global filter
  // on each lane. Sentinel -1 = "data unavailable; skip check".
  bidAskSpreadPct: number = -1,
  // B-PHASE-A2 (2026-05-17): real DBS values pre-computed by the scanner from
  // archived 60-min OHLC bars. When provided, MCE's non-crypto branch reads
  // these directly (replacing the synthesized-neutral fallback). When undefined
  // (insufficient OHLC / ATR=0 / sector missing), MCE synthesizes neutral as
  // before — preserves current behavior for thin pairs.
  propagatedDbs?: { score: number; category: string; slope: number },
  // B.1.5: rolling-median top-of-book depth-USD (ask-side = entry liquidity,
  // drives the depth-LQ + min_depth gate; bid-side = exit liquidity, for the
  // two-way min_depth gate). Sentinel -1 = depth unavailable this cycle → depth
  // gate + depth-LQ skip gracefully (§R-fold-1b). Default -1 keeps existing
  // callers/tests compiling.
  askDepthUsd: number = -1,
  bidDepthUsd: number = -1,
): Promise<void> {
  counters.pairsEntered++;

  try {
    // ── 0. Market-hours gate (per-symbol; B79.0c handles 24/7 names) ──
    if (!isXstockMarketOpenUTC(symbol)) {
      counters.pairsFailedMarketHours++;
      return;
    }

    // ── 1. PARALLEL global filters (mirrors crypto fx5-scanner.ts:743-1188) ──
    // Quant global filter and pattern global filter run INDEPENDENTLY on
    // every scanned pair. A pair that fails quant global can still pass
    // pattern global (e.g. PLUG $3.95 < quant min_price=$5 but > pattern
    // min_price=$2). Pair is rejected only when BOTH global filters fail.
    // Per Kyle directive 2026-05-12 EOD post-compact: do not let quant
    // global short-circuit the pattern path.
    // B-NEW-14 (2026-05-14): bidAskSpreadPct threaded into BOTH filters —
    // each filter compares it against its own pool's threshold.
    const globalResult = await evaluateXstockGlobalFilter(symbol, ohlc, lastPrice, volume24h, mode, configs?.globalQuant, bidAskSpreadPct, askDepthUsd, bidDepthUsd);
    mergeCounters(counters.globalFilterCounters, globalResult.counters);

    const patternResult = await evaluateXstockPatternFilter(symbol, ohlc, lastPrice, volume24h, mode, configs?.pattern, bidAskSpreadPct, askDepthUsd, bidDepthUsd);
    mergeCounters(counters.patternFilterCounters, patternResult.counters);
    counters.patternPerMetric.failedLQ += patternResult.perMetric.failedLQ;
    counters.patternPerMetric.failedVN += patternResult.perMetric.failedVN;
    counters.patternPerMetric.failedDI += patternResult.perMetric.failedDI;
    counters.patternPerMetric.passed += patternResult.perMetric.passed;
    counters.patternPerMetric.total += patternResult.perMetric.total;
    if (patternResult.failureReason?.startsWith('pattern_history_')) {
      counters.patternRejectByMinHistory++;
    }
    if (patternResult.passed) {
      counters.pairsPassedPattern++;
      counters.patternFanOut++;
    } else {
      counters.pairsFailedPattern++;
    }

    if (!globalResult.passed && !patternResult.passed) {
      counters.pairsFailedGlobalFilter++;
      return;
    }

    // ── 2. MCE context (assetClass-aware) ──
    // B-PHASE-A2 (2026-05-17): when propagatedDbs is supplied, MCE non-crypto
    // branch reads real DBS values; regime classifier consumes real dbsScore +
    // dbsSlope (XSTOCK threshold dispatch at market-regime.ts:227-249 already
    // wired via B79.0m.b). When propagatedDbs is undefined (scanner didn't have
    // enough OHLC / ATR=0 / sector missing), MCE falls back to synthesized
    // neutral as before — preserves the prior behavior for thin pairs.
    const mce = getMarketContextEngine();
    let mceContext;
    try {
      mceContext = mce.computeContext(symbol, ohlc, lastPrice, volume24h, undefined, propagatedDbs, ASSET_CLASS);
    } catch (mceErr) {
      counters.errors++;
      console.warn(`[B79.0m.b2][EVAL_MCE_FAIL] ${symbol}: ${mceErr instanceof Error ? mceErr.message : mceErr}`);
      return;
    }
    const regime = mceContext.regime.regime;

    // ── 3a. Family IMF (5 quant lanes) — only if quant global passed ──
    let passedFamilies: string[] = [];
    // P19-B8.5b (#500): hoist the lane-native real DI out of the IMF block so the kernel
    // consume (downstream, outside this block) can read it. Stays undefined when the IMF
    // never ran (globalResult failed / DI null) → kernel documented default, honest-absent.
    let laneRealDi: number | undefined;
    if (globalResult.passed) {
      const imfResult = await evaluateXstockFamilyIMF(symbol, ohlc, mode, configs?.families, askDepthUsd);
      laneRealDi = imfResult.metrics.DI ?? undefined;
      mergeCounters(counters.imfFilterCounters, imfResult.counters);
      counters.imfPerMetric.failedLQ += imfResult.perMetric.failedLQ;
      counters.imfPerMetric.failedVN += imfResult.perMetric.failedVN;
      counters.imfPerMetric.failedCorr += imfResult.perMetric.failedCorr;
      counters.imfPerMetric.failedDI += imfResult.perMetric.failedDI;
      counters.imfPerMetric.passed += imfResult.perMetric.passed;
      counters.imfPerMetric.total += imfResult.perMetric.total;
      for (const fam of Object.keys(imfResult.perFamily)) {
        const src = imfResult.perFamily[fam];
        if (!counters.imfPerFamily[fam]) {
          counters.imfPerFamily[fam] = { evaluated: 0, failedLQ: 0, failedVN: 0, failedCorr: 0, failedDI: 0, passed: 0 };
        }
        const dst = counters.imfPerFamily[fam];
        dst.evaluated += src.evaluated;
        dst.failedLQ += src.failedLQ;
        dst.failedVN += src.failedVN;
        dst.failedCorr += src.failedCorr;
        dst.failedDI += src.failedDI;
        dst.passed += src.passed;
      }
      counters.familyFanOutSum += imfResult.passedFamilies.length;
      passedFamilies = imfResult.passedFamilies;
      if (imfResult.anyPassed) {
        counters.pairsPassedFamilies++;
        counters.familyQualifiedUnique++;
      }
    }

    // B-4.6-B chunk A (measurement only): the contiguous pre-fan-out sync block
    // (lane composition + scanPatterns + regime-strategy set). The fan-out's
    // per-strategy sync chunks are bounded by per-strategy conditional awaits
    // and are read via the ELD histogram; if this segment reads cold while ELD
    // stays hot, the fan-out gets its own wrap in an instrumentation iteration.
    const _ss46b = syncSpanStart();
    // ── 3c. Lane composition (fan-out) ──
    const lanes: EvalLane[] = [];
    for (const fp of passedFamilies) {
      const familyKey = fp.replace(/^vts_|^active_/, '') as StrategyFamily;
      lanes.push({ kind: 'family', family: familyKey, sourcePool: `xstock-${familyKey}` });
    }
    if (patternResult.passed) {
      lanes.push({ kind: 'pattern', sourcePool: 'pattern' });
    }

    if (lanes.length === 0) {
      counters.pairsFailedAllFamilies++;
      return;
    }

    // Benchmark removal currently OFF (mirrors crypto B62 posture).
    if (isXstockBenchmark(symbol)) {
      // Reserved hook — counter stays wired but always zero until re-enabled.
    }
    counters.vtsDestination++;

    // ── 4. Pre-compute pattern detection ONCE for the pair (cheap shared work) ──
    const candles = ohlc.map(o => ({
      timestamp: o.timestamp,
      open: o.open,
      high: o.high,
      low: o.low,
      close: o.close,
      volume: o.volume,
    }));
    // B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` threaded —
    // xstock VTS path passes the file-scope ASSET_CLASS = 'xstock_spot' const.
    const detectedPatterns = scanPatterns(candles, symbol, ASSET_CLASS);

    // ── 5. Regime-strategy set (the universe of strategies before per-lane filter) ──
    const regimeStrategies = getStrategiesForRegime(ASSET_CLASS, regime); // B-4.7 (#163): per-class membership
    if (regimeStrategies.length === 0) {
      console.log(`[B79.0m.b2][EVAL] ${symbol} regime=${regime} — no strategies mapped`);
      return;
    }

    recordSyncSpan('xstock_eval', _ss46b, symbol);
    // ── 6. Lane × strategy fan-out (mirrors crypto fx5-scanner.ts:1607-1643) ──
    // B79.0m.b2-followup (Kyle 2026-05-12): per-lane pair-pool eval counts.
    // Counts unique pair-into-lane events so the "Pair-Pool Evaluations"
    // panel row shows quant + pattern split instead of hardcoded 0.
    const sawQuantLane = lanes.some((l) => l.kind === 'family');
    const sawPatternLane = lanes.some((l) => l.kind === 'pattern');
    if (sawQuantLane) counters.quantPairsEvaluated++;
    if (sawPatternLane) counters.patternPairsEvaluated++;

    for (const lane of lanes) {
      for (const stratDef of regimeStrategies) {
        const strategyKey = stratDef.strategyKey;

        // Asset-class gate (DB-driven via strategy_gates rows).
        if (!isStrategyEnabledForAssetClass(strategyKey, ASSET_CLASS)) {
          continue;
        }

        // Per-lane eligibility — replaces the old single family-eligibility gate.
        if (!isStrategyEligibleForLane(strategyKey, lane)) {
          counters.nullReasonAggregate['family_filter_mismatch'] =
            (counters.nullReasonAggregate['family_filter_mismatch'] ?? 0) + 1;
          // B-NEW-12.b per-lane split
          if (lane.kind === 'pattern') {
            counters.patternNullReasonAggregate['family_filter_mismatch'] =
              (counters.patternNullReasonAggregate['family_filter_mismatch'] ?? 0) + 1;
          } else {
            counters.quantNullReasonAggregate['family_filter_mismatch'] =
              (counters.quantNullReasonAggregate['family_filter_mismatch'] ?? 0) + 1;
          }
          continue;
        }

        counters.strategiesEvaluated++;
        // Per-lane split for VTS Evaluation Detail panel (Kyle 2026-05-12).
        if (lane.kind === 'pattern') {
          counters.patternStrategiesEvaluated++;
        } else {
          counters.quantStrategiesEvaluated++;
        }
        if (!counters.byStrategy[strategyKey]) {
          counters.byStrategy[strategyKey] = { evaluated: 0, nulls: 0, signals: 0, rejected: 0, trades: 0 };
        }
        counters.byStrategy[strategyKey].evaluated++;

        // Build patternInput for this strategy.
        const canonicalPatternType = (stratDef.patternType as any) ?? null;
        const matchingPatterns = canonicalPatternType
          ? detectedPatterns.filter(p => normalizePatternToCanonical(p.pattern as any) === canonicalPatternType)
          : detectedPatterns;
        const bestDetectedPattern = matchingPatterns.length > 0
          ? matchingPatterns.reduce((best, p) => p.strength > best.strength ? p : best, matchingPatterns[0])
          : null;
        const canonicalPatternName = bestDetectedPattern
          ? normalizePatternToCanonical(bestDetectedPattern.pattern as any)
          : null;
        const stratPatternInput = bestDetectedPattern ? {
          pattern: canonicalPatternName ?? bestDetectedPattern.pattern,
          direction: bestDetectedPattern.direction as 'BUY' | 'SELL',
          strength: bestDetectedPattern.strength,
          metadata: {
            ...(bestDetectedPattern as any),
            parentHigh: (bestDetectedPattern as any).metadata?.parentHigh ?? (candles.length >= 2 ? candles[candles.length - 2].high : 0),
            parentLow: (bestDetectedPattern as any).metadata?.parentLow ?? (candles.length >= 2 ? candles[candles.length - 2].low : 0),
            compressionRatio: (bestDetectedPattern as any).metadata?.compressionRatio ?? 0.5,
            pinbarLow: (bestDetectedPattern as any).metadata?.pinbarLow ?? (candles.length > 0 ? candles[candles.length - 1].low : 0),
            engulfingLow: (bestDetectedPattern as any).metadata?.engulfingLow ??
              (candles.length >= 2 ? Math.min(candles[candles.length - 1].low, candles[candles.length - 2].low) : 0),
            engulfRatio: (bestDetectedPattern as any).metadata?.engulfRatio ?? 1.0,
            hasGap: (bestDetectedPattern as any).metadata?.hasGap ?? false,
            recoveryRatio: (bestDetectedPattern as any).metadata?.recoveryRatio ?? 0,
            aPointLow: (bestDetectedPattern as any).metadata?.aPointLow,
            bPointHigh: (bestDetectedPattern as any).metadata?.bPointHigh,
            cPointLow: (bestDetectedPattern as any).metadata?.cPointLow,
            cPointHigh: (bestDetectedPattern as any).metadata?.cPointHigh,
          },
        } : null;

        // Strategy detect.
        resetNullReason();
        let strategySignal: any = null;
        try {
          strategySignal = callStrategyDetect(
            strategyKey,
            mceContext.indicators,
            ohlc as any,
            stratPatternInput as any,
            symbol,
            ASSET_CLASS,
            'tag', // reorg-B3.3x: xStock VTS un-strangle — the strategy guard no longer hard-drops quality
                   // fails (rr_below_min/unreachable); the shared normalizer below tags + simulates them.
          );
        } catch (detectErr) {
          counters.errors++;
          console.warn(`[B79.0m.b2][EVAL_DETECT_FAIL] ${symbol}/${strategyKey} lane=${lane.sourcePool}: ${detectErr instanceof Error ? detectErr.message : detectErr}`);
          continue;
        }

        // B-NEW-53: snapshot the forming (in-progress) bar BY VALUE right at the
        // detect site, via the shared helper (single source of truth — the crypto
        // hooks in vts-runner.ts use the same fn). Captured here so even strategy-
        // null decisions get it; hooks add the resolved stop/target where known.
        // P19-B8.5b (OBJ-1): + the decision-time indicator scalars BY VALUE — the
        // EXACT mceContext.indicators object the detect call above consumed — and
        // the settled-window hash (computed inside the builder).
        const _provBase = buildBarProvenance(ohlc, undefined, undefined, {
          vwap: mceContext.indicators.vwap,
          atr: mceContext.indicators.atr,
          sma: mceContext.indicators.sma,
          high24h: mceContext.indicators.high24h,
          low24h: mceContext.indicators.low24h,
          currentVolume: mceContext.indicators.volume,
        });

        if (!strategySignal) {
          counters.strategyNulls++;
          if (lane.kind === 'pattern') counters.patternStrategyNulls++;
          else counters.quantStrategyNulls++;
          counters.byStrategy[strategyKey].nulls++;
          const reason = getNullReason();
          counters.nullReasonAggregate[reason] = (counters.nullReasonAggregate[reason] ?? 0) + 1;
          // B-NEW-12.b per-lane split
          if (lane.kind === 'pattern') {
            counters.patternNullReasonAggregate[reason] = (counters.patternNullReasonAggregate[reason] ?? 0) + 1;
          } else {
            counters.quantNullReasonAggregate[reason] = (counters.quantNullReasonAggregate[reason] ?? 0) + 1;
          }
          if (!counters.byStrategyNullReasons[strategyKey]) counters.byStrategyNullReasons[strategyKey] = {};
          counters.byStrategyNullReasons[strategyKey][reason] = (counters.byStrategyNullReasons[strategyKey][reason] ?? 0) + 1;
          try {
            const { archiveSignalEval } = await import('../../services/data-archive/signal-eval-archiver.js');
            archiveSignalEval({
              mode: 'vts', // ITEM-4 step 2 (D1): xstock eval-cycle is VTS-side — carried stamp
              symbol,
              exchange: 'kraken',
              assetClass: ASSET_CLASS,
              source: 'vts-runner',
              strategy: strategyKey,
              regimeLabel: regime ?? undefined,
              rejectStage: 'strategy_internal',
              gateDecision: { gate: 'strategy_detect', accepted: false, reason },
              features: { sourcePool: lane.sourcePool, detailReason: reason, macro: buildMacroSnapshot() }, // P19-B5b #94
              // B-NEW-53: forming bar only — detect returned null, no stop/target yet.
              provenance: _provBase,
            });
            counters.signalsArchived++;
          } catch { counters.archiveFailures++; /* hot path; counter increment only — no log spam */ }
          continue;
        }
        counters.signalsGenerated++;
        if (lane.kind === 'pattern') counters.patternSignalsGenerated++;
        else counters.quantSignalsGenerated++;
        counters.byStrategy[strategyKey].signals++;

        // Setup-hash dedupe (assetClass-keyed). Kyle 2026-05-12: was a silent
        // continue — `signalsGenerated > 0` but `tradesOpened = 0` with no
        // visible reason in diagnostics. Tracking via setupHashDeduped + null-
        // reason aggregate so the panel surfaces the cause.
        if (
          isIdenticalXstockSetupSuppressed(
            ASSET_CLASS,
            symbol,
            strategyKey,
            strategySignal.entryPrice,
            strategySignal.stopPrice,
            strategySignal.targetPrice,
          )
        ) {
          counters.setupHashDeduped++;
          counters.nullReasonAggregate['setup_hash_dedupe'] =
            (counters.nullReasonAggregate['setup_hash_dedupe'] ?? 0) + 1;
          continue;
        }

        // Post-detect canonical scores (mirrors crypto vts-runner:1059-1132).
        const entryPrice = strategySignal.entryPrice;
        const takeProfit = strategySignal.targetPrice;
        const stopLoss = strategySignal.stopPrice;
        // P19-B8.7 Step-9 FIX-ON-FIND (rule 23): `const spread = 0.001` DELETED.
        // It was CRYPTO's spread constant hardcoded into the xStock lane — below
        // even this class's own static default (0.0012, friction.ts:37, the
        // observed 12bps mid-range) — and it silently overrode the per-symbol
        // MEASURED spread that getCachedCostMetrics already serves for xstock
        // (B-5 AMR Obj-12: measured-with-fallback + spreadSource provenance).
        // The friction blend below now consumes costMetrics.spread.
        const hybridScore = computeRealHybridScore(strategyKey, mceContext.indicators, ohlc as any, regime);
        // B79.0n.SCORING (2026-05-26): assetClass threaded for per-class cache-key isolation.
        // xstock_spot file — hardcoded class literal matches file scope.
        const predictiveConfidence = getPredictiveConfidence('xstock_spot' as const, symbol, regime, strategyKey);
        const regimeScoreRaw = calculateRegimeScore(regime, {
          adx: (mceContext.raw as any)?.adx ?? 0,
          volatility: (mceContext.raw as any)?.volatility ?? 0,
        });
        const regimeWeight = regimeScoreRaw / 100;
        const decayPenalty = computeRealDecayPenalty();
        const finalScore = computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty);

        // archiveSignalEval + archiveCommon HOISTED here (reorg-B3.3x) so the shared-normalizer validity-drop
        // below can archive with the same fields as the downstream rejects. (Was declared just below the kernel.)
        const { archiveSignalEval } = await import('../../services/data-archive/signal-eval-archiver.js');
        const archiveCommon = {
          symbol,
          exchange: 'kraken',
          assetClass: ASSET_CLASS,
          source: 'vts-runner' as const,
          strategy: strategyKey,
          regimeLabel: regime ?? undefined,
          finalScore,
        };

        // reorg-B3.3x (2026-06-24, Langston Option B): the SHARED VTS gate — the SAME `normalizeAndGateTarget`
        // crypto runs at `vts-runner:~1189` (reorg-B2 RR/reachability + reorg-B3.2 tag-don't-drop + reorg-B3.3y
        // `target<=entry` validity). xStock VTS lacked it (build-history gap, B79.0m); unified here onto the one
        // SSOT instead of a hand-rolled second copy. Sequenced BEFORE the Net-EV floor (:~660) and ORTHOGONAL to
        // it (geometry/RR/reachability vs friction-adjusted EV) — a tag'd-through signal still hits that floor
        // exactly as today. On the VTS learning path the QUALITY gates (`rr_below_min`, `unreachable`) TAG
        // (`vtsGateVerdict`) + simulate with the NATIVE target; DATA-VALIDITY (`invalid_atr`, `invalid_geometry`)
        // DROP. The strategy-level un-strangle itself is the `'tag'` arg on `callStrategyDetect` above.
        const _b3xGate = getPerClassTargetGate(ASSET_CLASS, strategyKey);
        const _b3x = normalizeAndGateTarget({
          entryPrice, stopPrice: stopLoss, targetPrice: takeProfit,
          floorPct: _b3xGate.floorPct, minRR: _b3xGate.minRR,
          atr: mceContext.indicators.atr, reachAtrMax: _b3xGate.reachAtrMax,
        });
        let vtsGateVerdict: 'passed' | 'rr_below_min' | 'unreachable' = 'passed';
        if (!_b3x.ok) {
          if (_b3x.reason === 'rr_below_min' || _b3x.reason === 'unreachable') {
            // QUALITY/EV gate → TAG-AND-SIMULATE on the VTS learning path (native target retained; positive-narrow
            // on the two quality reasons so `vtsGateVerdict` assigns type-safely — TargetNormalizeResult is flat).
            vtsGateVerdict = _b3x.reason;
            console.log(`[reorg-B3.3x][VTS][TAG_NO_DROP] ${symbol}/${strategyKey} would-gate=${_b3x.reason} rr=${_b3x.rr.toFixed(2)} — simulating anyway for learning data (active path still suppresses).`);
          } else {
            // DATA-VALIDITY (invalid_atr, invalid_geometry) → DROP; simulating garbage isn't learning signal.
            if (_b3x.reason === 'invalid_atr') {
              console.error(`[reorg-B2][TARGET_GATE][VTS][INVALID_ATR] ${symbol}/${strategyKey} — ATR unavailable (mceContext.indicators.atr missing). Wiring bug — investigate.`);
            }
            counters.signalsRejectedBySQE++;
            if (lane.kind === 'pattern') counters.patternSignalsRejected++;
            else counters.quantSignalsRejected++;
            counters.byStrategy[strategyKey].rejected++;
            const _b3xNull = _b3x.reason === 'invalid_atr' ? 'target_invalid_atr' : 'target_invalid_geometry';
            counters.nullReasonAggregate[_b3xNull] = (counters.nullReasonAggregate[_b3xNull] ?? 0) + 1;
            try {
              archiveSignalEval({
                mode: 'vts',
                ...archiveCommon,
                rejectStage: 'sqe',
                gateDecision: { gate: 'target_normalizer', accepted: false, reason: _b3x.reason },
                features: { sourcePool: lane.sourcePool, macro: buildMacroSnapshot() },
                provenance: _provBase
                  ? { ..._provBase, resolvedStopPrice: stopLoss, resolvedTargetPrice: takeProfit }
                  : undefined,
              });
              counters.signalsArchived++;
            } catch { counters.archiveFailures++; /* hot path */ }
            continue;
          }
        }

        // Net EV gate.
        // B79.0n.MCE: assetClass REQUIRED — this is the xStock eval cycle, so
        // the file-level ASSET_CLASS constant ('xstock_spot') is passed directly.
        const costMetrics = getCachedCostMetrics(symbol, ASSET_CLASS);
        // P19-B8.7 Step-9 (rule 23): costMetrics.spread — per-symbol MEASURED
        // when the friction-sample store has a fresh sample, the class static
        // default (0.0012) otherwise. Was a hardcoded 0.001 (crypto's constant).
        const totalFriction = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + costMetrics.spread;
        // P19-B8.5b (OBJ-3, #500): the predictiveConfidence×100 DI proxy is DELETED (rule 18 —
        // FINDING B's second site; the crypto twin died at vts-runner in the same diff). The
        // kernel now consumes the LANE-NATIVE real DI: the imf-evaluator's own computed value
        // (imfResult.metrics.DI, :380 — the number this lane's IMF actually gates on), 0-100,
        // null→undefined-honest (kernel documented default; NEVER fabricated).
        // ⚠ FLAGGED (own homed item, not this batch): the two lanes' "real DI" are DIFFERENT
        // FORMULAS sharing a name — crypto = trend-STRAIGHTNESS (|net|/path, direction-blind,
        // analysis-utils.ts:107); xstock = SIGNED DIRECTION ((net/abs)×50+50, imf-evaluator.ts:71).
        // Carrying each lane's native value is the honest cut; unifying the formula is a
        // Phase-25 scoring question, recorded at this batch's close.
        const DI = laneRealDi;
        // P19-B8.5c (#503): the STANDALONE computeNetExpectancyKernel call that lived here
        // is DELETED (rule 18, DELETED_COMPONENTS_LOG 2026-07-14). It passed `totalFriction`
        // as a round-trip FRACTION where the kernel contract requires PRICE-UNIT dollars,
        // under-penalizing every >$1 xStock by ~entryPrice× (the 07-03 admit collapse was
        // this bug's correction arriving via the B7.2d gate switch, not a regression). The
        // ONE computation site is the shared decideMakerTaker below (its taker leg
        // multiplies correctly, ×entryPrice); every former kernelResult consumer reads
        // `_xMtDecision.taker.*` / `.chosenNetEV`. The fraction `totalFriction` above
        // SURVIVES for its two RATE consumers only (checkPreOpenGates, which multiplies by
        // price itself, and the payload rate fields) — never as a kernel input.

        // ══════════════════════════════════════════════════════════════════════
        // P19-B7.2d (#434): the SHARED maker/taker best-of-both entry decision —
        // the SAME `decideMakerTaker` the crypto VTS lane and the active path run,
        // BEFORE the Net-EV floor, so the floor gates on the best-of-both
        // `chosenNetEV`. P19-B8.5c (#503): this is now the lane's ONLY kernel-
        // computation site (the former standalone call is deleted — it carried the
        // fraction-as-dollars friction units bug); `_xMtDecision.taker` is the full
        // taker-leg kernel decomposition every downstream consumer reads. Canonical
        // strategy key via normalizeStrategy (the B7.2b confirm-B discipline).
        // ══════════════════════════════════════════════════════════════════════
        const _xFriction = getFrictionForAssetClass(ASSET_CLASS);
        let _xMtDecision;
        try {
          _xMtDecision = decideMakerTaker({
          entryPrice,
          stopPrice: stopLoss,
          targetPrice: takeProfit,
          costs: costMetrics,
          feeRateMaker: _xFriction.feeRateMaker,
          feeRateTaker: _xFriction.feeRateTaker,
          DI,
          sourcePool: lane.sourcePool,
          minPWin: getCachedNumberRequired('expectancy_kernel', 'pwin_floor', _XSTOCK_GK),
          maxPWin: getCachedNumberRequired('expectancy_kernel', 'pwin_ceiling', _XSTOCK_GK),
          diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', _XSTOCK_GK),
          // P19-B8.5a (OBJ-1, FIX-1): the measured flat pWin base rate (per-class DB knob) —
          // the FOURTH signalStrength site (found at implementation; the Step-2 enumeration
          // said three). Same de-tinting as gen/RTB-refresh/crypto-VTS: the anti-predictive
          // finalScore no longer tints this lane's chosenNetEV either.
          signalStrength: getCachedNumberRequired('scoring_base', 'flat_pwin_base',
            { exchange: '*', assetClass: ASSET_CLASS, strategy: '*', regime: '*' }),
          urgencyClass: entryUrgencyClassForFamily(STRATEGY_FAMILY_MAP[normalizeStrategy(strategyKey)]),
          haircut: resolveMakerTakerHaircut(ASSET_CLASS),
          });
        } catch (kernelErr) {
          // P19-B8.5c: reject-on-throw parity with the deleted standalone kernel call —
          // a failed EV computation drops the candidate loudly, never opens on a guess.
          counters.errors++;
          console.warn(`[B79.0m.b2][EVAL_KERNEL_FAIL] ${symbol}/${strategyKey} lane=${lane.sourcePool}: ${kernelErr instanceof Error ? kernelErr.message : kernelErr}`);
          continue;
        }
        console.log(`[P19-B7.2b][VTS][MAKER_TAKER] ${symbol}/${strategyKey}: chose ${_xMtDecision.chosenMode} (taker=${_xMtDecision.takerNetEV.toFixed(6)}, maker-adj=${_xMtDecision.makerNetEVAdjusted.toFixed(6)})`);

        if (_xMtDecision.chosenNetEV <= VTS_NET_EV_FLOOR) {
          counters.signalsRejectedBySQE++;
          if (lane.kind === 'pattern') counters.patternSignalsRejected++;
          else counters.quantSignalsRejected++;
          counters.byStrategy[strategyKey].rejected++;
          // B-DIAG-387 (#387): record the net-EV-floor rejection so the dashboard
          // "Net EV Below Floor" tile reflects reality. It was hard-zero because
          // the endpoint read a dead `byReason` scaffold while this site bumped
          // only signalsRejectedBySQE. The combined aggregate feeds the endpoint
          // total via the lifetime accumulator (scanner.ts:1033); the per-lane
          // 'net_ev_rejected' key feeds the panel's Quant/Pattern columns
          // (machine-learning.tsx:3148-3149). Same key both places. NOTE:
          // 'net_ev_rejected' is NOT in the Section-1 groupDefs, so it does not
          // render or pollute the Setup-Nulls section total — it surfaces only
          // in Section-3 via rejectedReasons.netEvBelowFloor.
          counters.nullReasonAggregate['net_ev_rejected'] =
            (counters.nullReasonAggregate['net_ev_rejected'] ?? 0) + 1;
          if (lane.kind === 'pattern') {
            counters.patternNullReasonAggregate['net_ev_rejected'] =
              (counters.patternNullReasonAggregate['net_ev_rejected'] ?? 0) + 1;
          } else {
            counters.quantNullReasonAggregate['net_ev_rejected'] =
              (counters.quantNullReasonAggregate['net_ev_rejected'] ?? 0) + 1;
          }
          try {
            archiveSignalEval({
              mode: 'vts', // ITEM-4 step 2 (D1): xstock eval-cycle is VTS-side — carried stamp
              ...archiveCommon,
              rejectStage: 'sqe',
              gateDecision: {
                gate: 'net_ev_floor',
                accepted: false,
                reason: 'net_ev_below_floor',
                // P19-B7.2d: the floor now compares the best-of-both chosenNetEV
                // (B7.2b crypto parity). Both values recorded: `netEv` = the gated
                // number; `takerNetEv` = the kernel's taker leg (chosen ≥ taker by
                // construction, so both are below the floor on this reject path).
                netEv: _xMtDecision.chosenNetEV,
                chosenMode: _xMtDecision.chosenMode,
                takerNetEv: _xMtDecision.taker.netEV, // P19-B8.5c (#503): the single kernel site's taker leg (honest price-unit dollars)
                netEvFloor: VTS_NET_EV_FLOOR,
              },
              features: { sourcePool: lane.sourcePool, macro: buildMacroSnapshot() }, // P19-B5b #94
              // B-NEW-53: forming bar + the resolved stop/target LEVELS (RI-a checksum).
              provenance: _provBase
                ? { ..._provBase, resolvedStopPrice: stopLoss, resolvedTargetPrice: takeProfit }
                : undefined,
            });
            counters.signalsArchived++;
          } catch { counters.archiveFailures++; /* hot path; counter increment only — no log spam */ }
          continue;
        }

        // Pre-open gates.
        const gateCheck = checkPreOpenGates(
          ASSET_CLASS,
          symbol,
          strategyKey,
          lastPrice,
          stopLoss,
          takeProfit,
          totalFriction,
        );
        if (!gateCheck.allowed) {
          if (lane.kind === 'pattern') counters.patternSignalsRejected++;
          else counters.quantSignalsRejected++;
          counters.byStrategy[strategyKey].rejected++;
          counters.nullReasonAggregate[gateCheck.reason] = (counters.nullReasonAggregate[gateCheck.reason] ?? 0) + 1;
          // B-DIAG-387 (#387) OBJ-2: also record the pre-open gate reason per-lane so
          // the panel's Quant/Pattern columns are accurate (the combined aggregate
          // alone left the per-pool cells at 0). Same if/else split the other reason
          // sites use. Surfaces reentry_cooldown/price_past_stop/price_past_target —
          // previously invisible gates (no-hidden-gates).
          if (lane.kind === 'pattern') {
            counters.patternNullReasonAggregate[gateCheck.reason] =
              (counters.patternNullReasonAggregate[gateCheck.reason] ?? 0) + 1;
          } else {
            counters.quantNullReasonAggregate[gateCheck.reason] =
              (counters.quantNullReasonAggregate[gateCheck.reason] ?? 0) + 1;
          }
          try {
            archiveSignalEval({
              mode: 'vts', // ITEM-4 step 2 (D1): xstock eval-cycle is VTS-side — carried stamp
              ...archiveCommon,
              rejectStage: 'tcl',
              gateDecision: {
                gate: 'pre_open',
                accepted: false,
                reason: gateCheck.reason,
              },
              features: { sourcePool: lane.sourcePool, macro: buildMacroSnapshot() }, // P19-B5b #94
              // B-NEW-53: forming bar + resolved stop/target LEVELS (RI-a checksum).
              provenance: _provBase
                ? { ..._provBase, resolvedStopPrice: stopLoss, resolvedTargetPrice: takeProfit }
                : undefined,
            });
            counters.signalsArchived++;
          } catch { counters.archiveFailures++; /* hot path; counter increment only — no log spam */ }
          continue;
        }

        // ── P19-B7.2d (#434): pending-maker bifurcation (crypto parity — vts-runner
        // :1944-1958). A maker-chosen open does NOT open filled — it rests as
        // state='pending' at the limit until the shared resolve pre-pass fills it on an
        // honest trade-through or drops it at the hard deadline. EXCEPT marketable-at-
        // placement (market already at/through the buy limit — a real post-only would
        // REJECT): run the stored-taker check on the decision's OWN taker leg —
        // takerNetEV>0 → open as TAKER now (effective-mode flip, accounting-only), else
        // skip the trade entirely (non-trade).
        let _xEffectiveMode: 'taker' | 'maker' = _xMtDecision.chosenMode;
        let _xPendingMaker = false;
        if (_xMtDecision.chosenMode === 'maker') {
          if (isMarketableAtPlacement('buy', lastPrice, entryPrice)) {
            if (_xMtDecision.takerNetEV > 0) {
              _xEffectiveMode = 'taker';
              console.log(`[P19-B7.2c][VTS][MARKETABLE_TAKER_FALLBACK] ${symbol}/${strategyKey}: maker limit ${entryPrice} already marketable (price=${lastPrice}) — takerNetEV=${_xMtDecision.takerNetEV.toFixed(6)}>0 → opening as taker now`);
            } else {
              console.log(`[P19-B7.2c][VTS][MAKER_MARKETABLE_DROPPED] ${symbol}/${strategyKey}: maker limit ${entryPrice} marketable (price=${lastPrice}) and takerNetEV=${_xMtDecision.takerNetEV.toFixed(6)} not positive — dropped (non-trade)`);
              counters.signalsRejectedBySQE++;
              if (lane.kind === 'pattern') counters.patternSignalsRejected++;
              else counters.quantSignalsRejected++;
              counters.byStrategy[strategyKey].rejected++;
              counters.nullReasonAggregate['maker_marketable_dropped'] =
                (counters.nullReasonAggregate['maker_marketable_dropped'] ?? 0) + 1;
              if (lane.kind === 'pattern') {
                counters.patternNullReasonAggregate['maker_marketable_dropped'] =
                  (counters.patternNullReasonAggregate['maker_marketable_dropped'] ?? 0) + 1;
              } else {
                counters.quantNullReasonAggregate['maker_marketable_dropped'] =
                  (counters.quantNullReasonAggregate['maker_marketable_dropped'] ?? 0) + 1;
              }
              try {
                archiveSignalEval({
                  mode: 'vts',
                  ...archiveCommon,
                  rejectStage: 'tcl',
                  gateDecision: {
                    gate: 'maker_marketable',
                    accepted: false,
                    reason: 'maker_marketable_dropped',
                    takerNetEv: _xMtDecision.takerNetEV,
                  },
                  features: { sourcePool: lane.sourcePool, macro: buildMacroSnapshot() },
                  provenance: _provBase
                    ? { ..._provBase, resolvedStopPrice: stopLoss, resolvedTargetPrice: takeProfit }
                    : undefined,
                });
                counters.signalsArchived++;
              } catch { counters.archiveFailures++; /* hot path */ }
              continue;
            }
          } else {
            _xPendingMaker = true;
          }
        }

        // Net EV passes — open the VTS trade. B-NEW-53.2 (#208): build the
        // open-trade record FIRST (hoisted above the admitted archive) so the
        // at-entry-context features block can read the SAME values the trade opens
        // with — pure reads, no re-derivation — then archive admitted, then register
        // the identical object. Hoist is side-effect-free: `dollarValue` is a literal,
        // `quantity` is pure arithmetic over the `const entryPrice`, and nothing
        // between here and the register call mutates an input. Archive-before-register
        // ordering preserved (admitted-archival stays decoupled from open success).
        const dollarValue = 150;
        const quantity = entryPrice > 0 ? dollarValue / entryPrice : 0;
        const xOpenTrade = {
          symbol,
          assetClass: ASSET_CLASS,
          // P19-B7.2d (#434): the maker/taker decision + B7.2c pending-lifecycle stamp
          // (crypto parity — vts-runner :1971-1977). EFFECTIVE mode (the marketable
          // fallback flips maker→taker; the fee shown is the fee actually paid). A
          // pending maker is born state='pending' resting at the limit + deadline.
          chosenEntryMode: _xEffectiveMode,
          entryFeeRate: _xEffectiveMode === 'maker' ? _xFriction.feeRateMaker : _xFriction.feeRateTaker,
          // P19-B8.5a (OBJ-2, FIX-2): honest calibration snapshot (xstock lane — crypto parity).
          // realDiAtOpen: the FX5 pool is crypto-only, so xStock has NO real-DI source today —
          // honest NULL by construction, never fabricated (the xStock EV-input gap is the known
          // reorg-B3 RUNNING_ISSUES item; a future xStock DI source fills this without a schema change).
          realDiAtOpen: null,
          kernelDiInputAtOpen: DI,                        // the proxy the kernel actually consumed
          netEvAtOpen: _xMtDecision.chosenNetEV,          // the best-of-both EV the floor gated on
          predictedPwinAtOpen: _xMtDecision.taker.pWin,   // kernel taker-leg pWin (exposed)
          ...(_xPendingMaker ? {
            state: 'pending' as const,
            makerLimitPrice: entryPrice,
            makerDeadline: Date.now() + resolveMakerMaxPendingMs(ASSET_CLASS),
          } : {}),
          entryPrice,
          stopLoss,
          takeProfit,
          positionSize: dollarValue,
          dollarValue,
          quantity,
          frictionCost: totalFriction,
          // P19-B8.7 Step-9 (#527): the components behind totalFriction, for the
          // UI cost 5-col split — the SAME three terms summed into the blend
          // above (post rule-23 fix: costMetrics.spread, measured-with-fallback),
          // so the split reconciles to frictionCost exactly.
          costFeeFraction: costMetrics.fee,
          costSlippageFraction: costMetrics.slippage,
          costSpreadFraction: costMetrics.spread,
          regime,
          regimeScore: regimeScoreRaw,
          signalType: stratDef.signalType,
          strategy: strategyKey,
          patternType: (stratDef.patternType as any) ?? null,
          finalScore,
          hybridScore,
          predictiveConfidence,
          regimeWeight,
          decayPenalty,
          pool: 'rotational' as const,
          sourcePool: lane.sourcePool,
          // reorg-B3.3x: the shared-normalizer verdict — 'passed' cleared the RR/reachability gate;
          // 'rr_below_min'/'unreachable' = the active path WOULD suppress it but VTS tags + simulates
          // (parity with crypto's vts-runner trade record; the shared registerOpenVtsTrade sink carries it).
          vtsGateVerdict,
          atrAtOpen: mceContext.indicators.atr,
          pairDirectionalBias: mceContext.directionalBias?.category,
          pairDirectionalBiasScore: mceContext.directionalBias?.score ?? null,
          // B-XSTOCK-GLOBALS (Kyle-raised 2026-06-18): at-open per-class GLOBAL snapshot.
          // B-4.7 made registerOpenVtsTrade caller-pass-only (it no longer back-fills these);
          // the crypto inline path passes them (vts-runner.ts:1561-1576) but this xStock caller
          // never did, so xStock VTS rows persisted blank while getMarketIndicators('xstock_spot')
          // was LIVE upstream. Read the SAME per-class cache (regime via getCurrentRegime = the
          // displayed cachedGlobalRegime; friction/DBS mirror the crypto per-class getters,
          // null preserved as the honest no-sample value).
          // NOTE (Langston Step-4): getCurrentRegime returns the last-known regime during
          // idle/warming (not null) — INTENTIONAL. xStock's live regime source is MCE (not the
          // telemetry-aggregator dominant the crypto path reads), so a null-when-idle source
          // would stamp undefined on the very field we are fixing; a recent regime ≫ blank for
          // learning context, and this keeps the stamped regime == the displayed regime.
          globalRegime: getCurrentRegime(ASSET_CLASS),
          globalFriction: getGlobalFriction(ASSET_CLASS) ?? undefined,
          globalDirectionalBias: getLastGlobalDBSCategory(ASSET_CLASS),
          globalDirectionalBiasScore: getLastGlobalDBSScore(ASSET_CLASS) ?? undefined,
          macroModifierValue: getMarketContextEngine().getCurrentMacroContext()?.modifier.value,
          regimeConfidenceModulated: mceContext.regime.confidence,
          regimeConfidenceRaw: mceContext.regime.confidence,
          phase: mceContext.regime.phase,
          phaseAgeSeconds: mceContext.regime.phaseAgeSeconds,
          // B.2.UI (2026-06-02): capture the ask-side order-book depth (USD) the LQ
          // gate just used at entry. Sentinel -1 (no two-sided quote this cycle) → omit → "—".
          entryLiquidityValue: askDepthUsd >= 0 ? askDepthUsd : undefined,
          entryLiquidityKind: 'depth_usd' as const,
        };
        try {
          archiveSignalEval({
              mode: 'vts', // ITEM-4 step 2 (D1): xstock eval-cycle is VTS-side — carried stamp
            ...archiveCommon,
            rejectStage: 'admitted',
            gateDecision: {
              gate: 'net_ev_floor',
              accepted: true,
              // P19-B7.2d: the admit gate compares the best-of-both chosenNetEV
              // (B7.2b crypto parity). takerNetEv = the kernel's taker leg, kept
              // for row-comparability with pre-B7.2d records.
              netEv: _xMtDecision.chosenNetEV,
              chosenMode: _xMtDecision.chosenMode,
              takerNetEv: _xMtDecision.taker.netEV, // P19-B8.5c (#503): the single kernel site's taker leg (honest price-unit dollars)
            },
            // B-NEW-53.2 (#208): at-entry economics + context, mirroring the crypto
            // B70.2 admitted-features key SET so a Phase-25 cross-class query reads ONE
            // schema. Pure reads from the hoisted xOpenTrade record + in-scope locals;
            // `?? null` preserves each JSONB key. null where xStock genuinely lacks the
            // value: pairIdHash = crypto-only cohort A/B marker (B67.3); strategyPhaseWeight
            // = eval-cycle applies no phase-preference; the global-market-structure fields
            // are crypto concepts resolved INSIDE registerOpenVtsTrade post-hook (B-NEW-22),
            // not part of the xStock decision.
            // ⚠️ UNITS: `expectedEdge` here is the xStock kernel's PRICE-SPACE net-EV
            // (scales with asset price) — the kernel's TAKER leg (since P19-B7.2d the
            // admit gate compares the best-of-both chosenNetEV; the gateDecision block
            // above records both) — and is NOT comparable to crypto's scale-free score-space
            // `expectedEdge`. NEVER pool/compare cross-class (the HCE engine partitions by
            // asset_class in code: hce_study.py loops per `ac`). `netRewardToRisk` is the
            // kernel's native scale-free metric for within-class Phase-25 selectivity.
            features: {
              // Signal economics
              entryPrice: xOpenTrade.entryPrice,
              target: xOpenTrade.takeProfit,
              stopLoss: xOpenTrade.stopLoss,
              positionSize: xOpenTrade.positionSize,
              quantity: xOpenTrade.quantity,
              // Signal classification
              signalType: xOpenTrade.signalType,
              patternType: xOpenTrade.patternType ?? null,
              pool: xOpenTrade.pool,
              sourcePool: lane.sourcePool,
              filterTier: null, // xStock uses lanes, not the crypto IMF filter-tier
              // Scoring
              hybridScore,
              predictiveConfidence,
              regimeWeight,
              expectedEdge: _xMtDecision.taker.netEV, // price-space, honest dollars since P19-B8.5c (#503; pre-fix rows carry the fraction-friction cohort)
              netRewardToRisk: _xMtDecision.taker.netRewardToRisk, // kernel-native scale-free (single site since P19-B8.5c)
              decayPenalty,
              // Regime + bias (global-market fields are crypto-only, resolved post-hook)
              globalRegime: null,
              pairFriction: null,
              globalFriction: null,
              pairDirectionalBias: xOpenTrade.pairDirectionalBias ?? null,
              globalDirectionalBias: null,
              pairDirectionalBiasScore: xOpenTrade.pairDirectionalBiasScore ?? null,
              globalDirectionalBiasScore: null,
              // Phase
              regimeConfidenceRaw: xOpenTrade.regimeConfidenceRaw ?? null,
              macroModifierValue: xOpenTrade.macroModifierValue ?? null,
              phase: xOpenTrade.phase ?? null,
              phaseAgeSeconds: xOpenTrade.phaseAgeSeconds ?? null,
              strategyPhaseWeight: null, // no phase-preference modulation on xStock
              // Cohort marker + ATR
              pairIdHash: null, // crypto-only cohort A/B marker (B67.3)
              atrAtOpen: xOpenTrade.atrAtOpen ?? null,
              // P19-B5b #94: decision-time equity-macro snapshot (VIX/DXY z + raw +
              // freshness). Distinct from `macroModifierValue` above (the AMR modifier
              // scalar) — this is the backdrop Phase-25 25-7 trains on.
              macro: buildMacroSnapshot(),
            },
            modulators: {
              chain_modulated_confidence: null, // xStock applies no B67 confidence chain
              regimeConfidenceModulated: xOpenTrade.regimeConfidenceModulated ?? null,
            },
            // B-NEW-53: forming bar + resolved stop/target LEVELS (RI-a checksum).
            provenance: _provBase
              ? { ..._provBase, resolvedStopPrice: stopLoss, resolvedTargetPrice: takeProfit }
              : undefined,
          });
          counters.signalsArchived++;
        } catch { counters.archiveFailures++; /* hot path; counter increment only — no log spam */ }

        const tradeId = await registerOpenVtsTrade(xOpenTrade);

        // P19-B4a (C2): ALSO route this signal onto the active paper pipeline when active
        // trading is authoritatively ON (gated inside the helper on system_context.isEngineActive,
        // the flag B7b flips — DORMANT until then, §9.1 scaffolding). Fire-and-forget: the helper
        // never throws into this loop, and the VTS dispatch above is unaffected either way.
        void dispatchXstockActiveSignal({
          symbol,
          strategyKey,
          entryPrice,
          stopPrice: stopLoss,
          targetPrice: takeProfit,
          predictiveConfidence,
          signalType: stratDef.signalType,
          sourcePool: lane.sourcePool,
          atr: mceContext.indicators?.atr,
          high24h: mceContext.indicators?.high24h,
          low24h: mceContext.indicators?.low24h,
          // P19-B8.10 (OBJ-4): genesis display-context — this cycle's own regime +
          // pair DBS (same mceContext the VTS xstock lane captures at open).
          regime,
          pairDbsCategory: mceContext.directionalBias?.category,
          pairDbsScore: mceContext.directionalBias?.score,
          // #561: carry the ask-side order-book depth (same value the VTS open stamps at
          // :1037) so the active trade's "Volume / Order Book" cell fills for xStock too.
          entryLiquidityValue: askDepthUsd >= 0 ? askDepthUsd : undefined,
          entryLiquidityKind: 'depth_usd' as const,
        });

        if (tradeId) {
          counters.tradesOpened++;
          // B-NEW-9 per-lane trade counts (2026-05-12): panel "Trades Opened"
          // row was reading quant/patternSignalsGenerated (post-detect, pre-
          // gate). After all gates pass and a trade is actually opened, also
          // bump the per-lane counter so the panel reflects actual trades.
          if (lane.kind === 'pattern') (counters as any).patternTradesOpened = ((counters as any).patternTradesOpened ?? 0) + 1;
          else (counters as any).quantTradesOpened = ((counters as any).quantTradesOpened ?? 0) + 1;
          counters.byStrategy[strategyKey].trades++;
          console.log(`[B79.0m.b2][EVAL] ${symbol} (xstock_spot) regime=${regime} strategy=${strategyKey} lane=${lane.sourcePool} netEV=${_xMtDecision.chosenNetEV.toFixed(4)} mode=${_xEffectiveMode}${_xPendingMaker ? ' (pending)' : ''} → trade ${tradeId} opened`);
          // P19-B7.2d (#434): open the NON-chosen leg as a tagged twin through the
          // SHARED maybeOpenTwin seam (the same helper crypto's lane calls — parity by
          // construction; degenerate skips + kill-knob + TWIN_FAIL isolation inside).
          await maybeOpenTwin({
            chosenTradeId: tradeId,
            decisionChosenMode: _xMtDecision.chosenMode,
            effectiveMode: _xEffectiveMode,
            pendingMaker: _xPendingMaker,
            feeRateMaker: _xFriction.feeRateMaker,
            feeRateTaker: _xFriction.feeRateTaker,
            currentMarketPrice: lastPrice,
          });
        }
      }
    }
  } catch (err) {
    counters.errors++;
    console.error(`[B79.0m.b2][EVAL_PAIR_ERROR] ${symbol}:`, err instanceof Error ? err.message : err);
  }
}
