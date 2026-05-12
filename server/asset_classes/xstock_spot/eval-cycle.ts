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
import {
  getStrategiesForRegime,
  isStrategyEnabledForAssetClass,
  normalizePatternToCanonical,
  type StrategyFamily,
} from '../../config/canonical-regime-strategy-map.js';
import {
  callStrategyDetect,
  registerOpenVtsTrade,
  isIdenticalXstockSetupSuppressed,
  computeFinalScore,
  checkPreOpenGates,
  VTS_NET_EV_FLOOR,
} from '../../services/vts-runner.js';
import { resetNullReason, getNullReason } from '../../utils/null-reason-tracker.js';
import { isXstockMarketOpenUTC } from './market-hours.js';
import { evaluateXstockGlobalFilter } from './global-filter.js';
import { evaluateXstockFamilyIMF } from './imf-evaluator.js';
import { evaluateXstockPatternFilter } from './pattern-filter.js';
import { scanPatterns } from '../../services/pattern-recognizer.js';
import { computeNetExpectancyKernel } from '../../core/calculations/net-expectancy-kernel.js';
import { computeRealHybridScore, computeRealDecayPenalty } from '../../core/utils/vts-real-score.js';
import { getPredictiveConfidence } from '../../core/utils/score-calculator.js';
import { calculateRegimeScore } from '../../core/metrics/market-regime.js';
import { getCachedCostMetrics } from '../../core/math/cost-model.js';
import { getCachedNumberRequired } from '../../services/module-constants-service.js';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import type { OHLCData } from '../../types/market-regime.types';

const _XSTOCK_GK = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };

/**
 * Fetch most-recent N 1-minute candles from xstock_spot_ohlc_1m for a symbol.
 * Layer-1 starter: reads the partitioned passive-archive table directly.
 * Future B79.0m.b2: introduce an `XstockOHLCCache` (5-min TTL) mirroring the
 * crypto ohlcCache, so per-cycle reads don't hit DB.
 */
export async function fetchXstockOHLC(symbol: string, limit = 120): Promise<OHLCData[]> {
  try {
    const result: any = await db.execute(sql`
      SELECT interval_begin, open, high, low, close, volume
        FROM xstock_spot_ohlc_1m
       WHERE symbol = ${symbol}
         AND interval_begin > NOW() - INTERVAL '6 hours'
       ORDER BY interval_begin DESC
       LIMIT ${limit}
    `);
    const rows: any[] = (result as any).rows ?? result;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const bars: OHLCData[] = rows
      .slice()
      .reverse()
      .map((r) => ({
        open: parseFloat(r.open),
        high: parseFloat(r.high),
        low: parseFloat(r.low),
        close: parseFloat(r.close),
        volume: parseFloat(r.volume),
        timestamp: new Date(r.interval_begin).getTime(),
      } as OHLCData));
    return bars;
  } catch (err) {
    console.warn(`[B79.0m.b2][fetchXstockOHLC] ${symbol}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

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
    const globalResult = await evaluateXstockGlobalFilter(symbol, ohlc, lastPrice, volume24h, mode, configs?.globalQuant);
    mergeCounters(counters.globalFilterCounters, globalResult.counters);

    const patternResult = await evaluateXstockPatternFilter(symbol, ohlc, lastPrice, volume24h, mode, configs?.pattern);
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

    // ── 2. MCE context (assetClass-aware; synthesized neutral DBS for xstock) ──
    // Needed by both lanes for regime-routing of strategies downstream.
    const mce = getMarketContextEngine();
    let mceContext;
    try {
      mceContext = mce.computeContext(symbol, ohlc, lastPrice, volume24h, undefined, undefined, ASSET_CLASS);
    } catch (mceErr) {
      counters.errors++;
      console.warn(`[B79.0m.b2][EVAL_MCE_FAIL] ${symbol}: ${mceErr instanceof Error ? mceErr.message : mceErr}`);
      return;
    }
    const regime = mceContext.regime.regime;

    // ── 3a. Family IMF (5 quant lanes) — only if quant global passed ──
    let passedFamilies: string[] = [];
    if (globalResult.passed) {
      const imfResult = await evaluateXstockFamilyIMF(symbol, ohlc, mode, configs?.families);
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
    const detectedPatterns = scanPatterns(candles, symbol);

    // ── 5. Regime-strategy set (the universe of strategies before per-lane filter) ──
    const regimeStrategies = getStrategiesForRegime(regime);
    if (regimeStrategies.length === 0) {
      console.log(`[B79.0m.b2][EVAL] ${symbol} regime=${regime} — no strategies mapped`);
      return;
    }

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
          );
        } catch (detectErr) {
          counters.errors++;
          console.warn(`[B79.0m.b2][EVAL_DETECT_FAIL] ${symbol}/${strategyKey} lane=${lane.sourcePool}: ${detectErr instanceof Error ? detectErr.message : detectErr}`);
          continue;
        }
        if (!strategySignal) {
          counters.strategyNulls++;
          if (lane.kind === 'pattern') counters.patternStrategyNulls++;
          else counters.quantStrategyNulls++;
          counters.byStrategy[strategyKey].nulls++;
          const reason = getNullReason();
          counters.nullReasonAggregate[reason] = (counters.nullReasonAggregate[reason] ?? 0) + 1;
          if (!counters.byStrategyNullReasons[strategyKey]) counters.byStrategyNullReasons[strategyKey] = {};
          counters.byStrategyNullReasons[strategyKey][reason] = (counters.byStrategyNullReasons[strategyKey][reason] ?? 0) + 1;
          try {
            const { archiveSignalEval } = await import('../../services/data-archive/signal-eval-archiver.js');
            archiveSignalEval({
              symbol,
              exchange: 'kraken',
              assetClass: ASSET_CLASS,
              source: 'vts-runner',
              strategy: strategyKey,
              regimeLabel: regime ?? undefined,
              rejectStage: 'strategy_internal',
              gateDecision: { gate: 'strategy_detect', accepted: false, reason },
              features: { sourcePool: lane.sourcePool, detailReason: reason },
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
        const spread = 0.001;
        const hybridScore = computeRealHybridScore(strategyKey, mceContext.indicators, ohlc as any, regime);
        const predictiveConfidence = getPredictiveConfidence(symbol, regime, strategyKey);
        const regimeScoreRaw = calculateRegimeScore(regime, {
          adx: (mceContext.raw as any)?.adx ?? 0,
          volatility: (mceContext.raw as any)?.volatility ?? 0,
        });
        const regimeWeight = regimeScoreRaw / 100;
        const decayPenalty = computeRealDecayPenalty();
        const finalScore = computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty);

        // Net EV gate.
        const costMetrics = getCachedCostMetrics(symbol);
        const totalFriction = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + spread;
        const DI = Math.min(100, Math.max(0, predictiveConfidence * 100));
        let kernelResult;
        try {
          kernelResult = computeNetExpectancyKernel({
            entryPrice,
            stopPrice: stopLoss,
            targetPrice: takeProfit,
            totalFriction,
            DI,
            sourcePool: lane.sourcePool,
            minPWin: getCachedNumberRequired('expectancy_kernel', 'pwin_floor', _XSTOCK_GK),
            maxPWin: getCachedNumberRequired('expectancy_kernel', 'pwin_ceiling', _XSTOCK_GK),
            diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', _XSTOCK_GK),
          });
        } catch (kernelErr) {
          counters.errors++;
          console.warn(`[B79.0m.b2][EVAL_KERNEL_FAIL] ${symbol}/${strategyKey} lane=${lane.sourcePool}: ${kernelErr instanceof Error ? kernelErr.message : kernelErr}`);
          continue;
        }
        const archiveCommon = {
          symbol,
          exchange: 'kraken',
          assetClass: ASSET_CLASS,
          source: 'vts-runner' as const,
          strategy: strategyKey,
          regimeLabel: regime ?? undefined,
          finalScore,
        };
        const { archiveSignalEval } = await import('../../services/data-archive/signal-eval-archiver.js');
        if (kernelResult.netEV <= VTS_NET_EV_FLOOR) {
          counters.signalsRejectedBySQE++;
          if (lane.kind === 'pattern') counters.patternSignalsRejected++;
          else counters.quantSignalsRejected++;
          counters.byStrategy[strategyKey].rejected++;
          try {
            archiveSignalEval({
              ...archiveCommon,
              rejectStage: 'sqe',
              gateDecision: {
                gate: 'net_ev_floor',
                accepted: false,
                reason: 'net_ev_below_floor',
                netEv: kernelResult.netEV,
                netEvFloor: VTS_NET_EV_FLOOR,
              },
              features: { sourcePool: lane.sourcePool },
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
          try {
            archiveSignalEval({
              ...archiveCommon,
              rejectStage: 'tcl',
              gateDecision: {
                gate: 'pre_open',
                accepted: false,
                reason: gateCheck.reason,
              },
              features: { sourcePool: lane.sourcePool },
            });
            counters.signalsArchived++;
          } catch { counters.archiveFailures++; /* hot path; counter increment only — no log spam */ }
          continue;
        }

        // Net EV passes — archive admitted + open VTS trade.
        try {
          archiveSignalEval({
            ...archiveCommon,
            rejectStage: 'admitted',
            gateDecision: {
              gate: 'net_ev_floor',
              accepted: true,
              netEv: kernelResult.netEV,
            },
            features: {
              sourcePool: lane.sourcePool,
              hybridScore,
              predictiveConfidence,
              regimeWeight,
            },
          });
          counters.signalsArchived++;
        } catch { counters.archiveFailures++; /* hot path; counter increment only — no log spam */ }

        const dollarValue = 150;
        const quantity = entryPrice > 0 ? dollarValue / entryPrice : 0;
        const tradeId = await registerOpenVtsTrade({
          symbol,
          assetClass: ASSET_CLASS,
          entryPrice,
          stopLoss,
          takeProfit,
          positionSize: dollarValue,
          dollarValue,
          quantity,
          frictionCost: totalFriction,
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
          pool: 'rotational',
          sourcePool: lane.sourcePool,
          atrAtOpen: mceContext.indicators.atr,
          pairDirectionalBias: mceContext.directionalBias?.category,
          pairDirectionalBiasScore: mceContext.directionalBias?.score ?? null,
          macroModifierValue: getMarketContextEngine().getCurrentMacroContext()?.modifier.value,
          regimeConfidenceModulated: mceContext.regime.confidence,
          regimeConfidenceRaw: mceContext.regime.confidence,
          phase: mceContext.regime.phase,
          phaseAgeSeconds: mceContext.regime.phaseAgeSeconds,
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
          console.log(`[B79.0m.b2][EVAL] ${symbol} (xstock_spot) regime=${regime} strategy=${strategyKey} lane=${lane.sourcePool} netEV=${kernelResult.netEV.toFixed(4)} → trade ${tradeId} opened`);
        }
      }
    }
  } catch (err) {
    counters.errors++;
    console.error(`[B79.0m.b2][EVAL_PAIR_ERROR] ${symbol}:`, err instanceof Error ? err.message : err);
  }
}
