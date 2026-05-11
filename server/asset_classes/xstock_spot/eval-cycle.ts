/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b — xstock_spot VTS evaluation cycle
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per-pair post-filter chain for xstock_spot. Called from xstockSpotScanner
 * after the per-pair freshness gate succeeds. Implements the "feed survivors
 * into VTS" path per Langston Step 2 architecture lock:
 *
 *   global-filter (asset-class-owned)
 *     ↓
 *   imf-evaluator (asset-class-owned, family-aware)
 *     ↓
 *   MCE.computeContext (shared, asset-class-aware — B79.0m.b)
 *     ↓
 *   per-strategy: callStrategyDetect → SQE → archive → registerOpenVtsTrade
 *
 * MCE is called with assetClass='xstock_spot' which:
 *   (a) synthesizes neutral DBS (Layer-1 starter; per-asset-class DBS deferred)
 *   (b) reads `module_constants.mce_config.xstock_spot.macro_modifier`
 *
 * SQE already enforces market-hours + asset-class-aware strategy gating
 * (B79.0L + B79.0m.a). Setup-hash dedupe is assetClass-keyed in
 * registerOpenVtsTrade (Langston rev2 R6).
 *
 * Layer-1 starter scope: emits per-pair eval logs + accumulates
 * signal_eval_archive xstock rows. Trade-open writes vts_open_trades rows
 * with asset_class='xstock_spot'. Banner removal on the xStocks tab gates on
 * verified end-to-end flow.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getMarketContextEngine } from '../../services/market-context-engine.js';
import {
  getStrategiesForRegime,
  isStrategyEnabledForAssetClass,
  STRATEGY_FAMILY_MAP,
  HYBRID_FAMILY_ELIGIBILITY,
  MULTI_FAMILY_ELIGIBILITY,
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
import type { PatternType } from '../../types';

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
    // Reverse so oldest-first matches OHLC convention.
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
    console.warn(`[B79.0m.b][fetchXstockOHLC] ${symbol}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

const ASSET_CLASS = 'xstock_spot' as const;

// B79.0m.b iteration 2: xstock benchmark tickers. These are broad-market
// ETFs / index proxies that the family-IMF pipeline admits but VTS should
// NOT trade in isolation (they're benchmarks against which other names are
// measured). Mirrors crypto's BTC/ETH benchmark exclusion at the VTS-
// destination step. SPY/QQQ/IWM/DIA = index ETFs; GLD = gold ETF (macro
// benchmark, not a stock).
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
  strategiesEvaluated: number;
  strategyNulls: number;
  signalsGenerated: number;
  signalsArchived: number;
  signalsRejectedBySQE: number;
  tradesOpened: number;
  errors: number;
  // pass-through from global-filter + imf-evaluator
  globalFilterCounters: Record<string, number>;
  imfFilterCounters: Record<string, number>;
  // B79.0m.b: per-metric IMF attribution (summed across families) so the
  // Filter Diagnostics UI can break the IMF rejection bucket out into
  // failedLQ / failedVN / failedCorr individually instead of one lumped
  // count. Mirrors the crypto Filter Diagnostics shape.
  imfPerMetric: { failedLQ: number; failedVN: number; failedCorr: number; failedDI: number; passed: number; total: number };
  // B79.0m.b iteration 2 — per-family breakdown (which family is failing what).
  imfPerFamily: Record<string, { evaluated: number; failedLQ: number; failedVN: number; failedCorr: number; failedDI: number; passed: number }>;
  // B79.0m.b iteration 2 — fan-out + qualified-unique + VTS destination accounting.
  familyFanOutSum: number;           // total family-row passes (sum across all family paths)
  familyQualifiedUnique: number;     // unique pairs that passed >=1 family (same as pairsPassedFamilies but clearer name)
  benchmarksRemoved: number;         // unique pairs filtered out at VTS destination because they're benchmark ETFs
  vtsDestination: number;            // familyQualifiedUnique - benchmarksRemoved
  // B79.0m.b: per-strategy + null-reason attribution. Reads from
  // null-reason-tracker after each callStrategyDetect.
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
    strategiesEvaluated: 0,
    strategyNulls: 0,
    signalsGenerated: 0,
    signalsArchived: 0,
    signalsRejectedBySQE: 0,
    tradesOpened: 0,
    errors: 0,
    globalFilterCounters: {},
    imfFilterCounters: {},
    imfPerMetric: { failedLQ: 0, failedVN: 0, failedCorr: 0, failedDI: 0, passed: 0, total: 0 },
    imfPerFamily: {},
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

/**
 * Evaluate a single xstock pair through the full post-filter chain.
 * Mutates `counters` in-place; never throws (errors counted + logged).
 */
export async function evaluateXstockPairForVTS(
  symbol: string,
  ohlc: OHLCData[],
  lastPrice: number,
  volume24h: number,
  mode: 'paper' | 'live',
  counters: XstockEvalCycleCounters,
): Promise<void> {
  counters.pairsEntered++;

  try {
    // ── 0. Market-hours gate (per-symbol; B79.0c handles 24/7 names) ──
    if (!isXstockMarketOpenUTC(symbol)) {
      counters.pairsFailedMarketHours++;
      return;
    }

    // ── 1. Global filter ──
    const globalResult = await evaluateXstockGlobalFilter(symbol, ohlc, lastPrice, volume24h, mode);
    mergeCounters(counters.globalFilterCounters, globalResult.counters);
    if (!globalResult.passed) {
      counters.pairsFailedGlobalFilter++;
      return;
    }

    // ── 2. Compute MCE context (assetClass-aware; synthesized neutral DBS) ──
    const mce = getMarketContextEngine();
    let mceContext;
    try {
      mceContext = mce.computeContext(symbol, ohlc, lastPrice, volume24h, undefined, undefined, ASSET_CLASS);
    } catch (mceErr) {
      counters.errors++;
      console.warn(`[B79.0m.b][EVAL_MCE_FAIL] ${symbol}: ${mceErr instanceof Error ? mceErr.message : mceErr}`);
      return;
    }
    const regime = mceContext.regime.regime;

    // ── 3. Family IMF (Layer-1 starter: any-family-passes admits to strategy eval) ──
    const imfResult = await evaluateXstockFamilyIMF(symbol, ohlc, mode);
    mergeCounters(counters.imfFilterCounters, imfResult.counters);
    // Sum per-metric attribution into the cycle-level imfPerMetric.
    counters.imfPerMetric.failedLQ += imfResult.perMetric.failedLQ;
    counters.imfPerMetric.failedVN += imfResult.perMetric.failedVN;
    counters.imfPerMetric.failedCorr += imfResult.perMetric.failedCorr;
    counters.imfPerMetric.failedDI += imfResult.perMetric.failedDI;
    counters.imfPerMetric.passed += imfResult.perMetric.passed;
    counters.imfPerMetric.total += imfResult.perMetric.total;
    // Merge per-family breakdown for the UI.
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
    // Fan-out sum: how many family-rows admitted this pair.
    counters.familyFanOutSum += imfResult.passedFamilies.length;

    if (!imfResult.anyPassed) {
      counters.pairsFailedAllFamilies++;
      return;
    }
    counters.pairsPassedFamilies++;
    counters.familyQualifiedUnique++;

    // B79.0m.b2: benchmark-specific removal is OFF (per Kyle directive — same
    // posture as crypto since B62 2026-04-16). Counter stays wired but always
    // zero so the metric is visible and ready when removal is re-enabled.
    // Benchmark pairs continue through into strategy evaluation.
    if (isXstockBenchmark(symbol)) {
      // No-op for now; benchmark removal is disabled. Reserved hook for
      // when the benchmark-specific exclusion is re-enabled.
    }
    counters.vtsDestination++;

    // ── 4. Pattern detection (mirrors crypto vts-runner generatePhase10Signal:907-925) ──
    const candles = ohlc.map(o => ({
      timestamp: o.timestamp,
      open: o.open,
      high: o.high,
      low: o.low,
      close: o.close,
      volume: o.volume,
    }));
    const detectedPatterns = scanPatterns(candles, symbol);
    const detectedPattern = detectedPatterns.length > 0 ? detectedPatterns[0] : null;

    // ── 5. Family-fanout iteration (mirrors crypto vts-runner runPhase10SimulationCycle
    //    family-eligibility gate at lines 3050-3083). Each family the pair passes
    //    becomes a separate routing lane; strategies are filtered by STRATEGY_FAMILY_MAP. ──
    const regimeStrategies = getStrategiesForRegime(regime);
    if (regimeStrategies.length === 0) {
      console.log(`[B79.0m.b2][EVAL] ${symbol} regime=${regime} — no strategies mapped`);
      return;
    }

    const pairFams = new Set<StrategyFamily>(imfResult.passedFamilies.map(p => p.replace(/^vts_|^active_/, '') as StrategyFamily));

    // Iterate each strategy in the regime. Family-eligibility gate filters per pair.
    for (const stratDef of regimeStrategies) {
      const strategyKey = stratDef.strategyKey;
      if (!isStrategyEnabledForAssetClass(strategyKey, ASSET_CLASS)) {
        continue;
      }

      // ── Family-eligibility gate (mirrors crypto vts-runner:3050-3083) ──
      const stratFamily: StrategyFamily | undefined = STRATEGY_FAMILY_MAP[strategyKey];
      if (stratFamily && stratFamily !== 'hybrid' && stratFamily !== 'pattern') {
        const additionalFams = MULTI_FAMILY_ELIGIBILITY[strategyKey] ?? [];
        const primaryFamilyMismatch = !pairFams.has(stratFamily);
        const additionalFamilyMatch = additionalFams.some(f => pairFams.has(f));
        if (primaryFamilyMismatch && !additionalFamilyMatch) {
          counters.nullReasonAggregate['family_filter_mismatch'] = (counters.nullReasonAggregate['family_filter_mismatch'] ?? 0) + 1;
          continue;
        }
      } else if (stratFamily === 'hybrid') {
        const parentFams = HYBRID_FAMILY_ELIGIBILITY[strategyKey] ?? [];
        if (!parentFams.some(f => pairFams.has(f))) {
          counters.nullReasonAggregate['family_filter_mismatch'] = (counters.nullReasonAggregate['family_filter_mismatch'] ?? 0) + 1;
          continue;
        }
      }
      // Pattern strategies (stratFamily === 'pattern') gate on the pattern path —
      // they require a matching detected pattern. We let the per-strategy detect
      // function handle the no_pattern null return when the patternInput doesn't
      // match the strategy's expected patternType.

      counters.strategiesEvaluated++;
      if (!counters.byStrategy[strategyKey]) {
        counters.byStrategy[strategyKey] = { evaluated: 0, nulls: 0, signals: 0, rejected: 0, trades: 0 };
      }
      counters.byStrategy[strategyKey].evaluated++;

      // ── Build patternInput for this strategy (matches the strategy's expected pattern type) ──
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

      // ── Strategy detect with patternInput (real, not null) ──
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
        console.warn(`[B79.0m.b2][EVAL_DETECT_FAIL] ${symbol}/${strategyKey}: ${detectErr instanceof Error ? detectErr.message : detectErr}`);
        continue;
      }
      if (!strategySignal) {
        counters.strategyNulls++;
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
            features: { sourcePool: 'xstock_spot', detailReason: reason },
          });
          counters.signalsArchived++;
        } catch { /* hot path */ }
        continue;
      }
      counters.signalsGenerated++;
      counters.byStrategy[strategyKey].signals++;

      // ── Setup-hash dedupe (assetClass-keyed) ──
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
        continue;
      }

      // ── Compute the canonical post-detect scores (mirrors crypto vts-runner:1059-1132) ──
      const entryPrice = strategySignal.entryPrice;
      const takeProfit = strategySignal.targetPrice;
      const stopLoss = strategySignal.stopPrice;
      const spread = 0.001; // xstock spread placeholder — equity has bid/ask snap; full wiring is a follow-up
      const hybridScore = computeRealHybridScore(strategyKey, mceContext.indicators, ohlc as any, regime);
      const predictiveConfidence = getPredictiveConfidence(symbol, regime, strategyKey);
      const regimeScoreRaw = calculateRegimeScore(regime, {
        adx: (mceContext.raw as any)?.adx ?? 0,
        volatility: (mceContext.raw as any)?.volatility ?? 0,
      });
      const regimeWeight = regimeScoreRaw / 100;
      const decayPenalty = computeRealDecayPenalty();
      const finalScore = computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty);

      // ── Net EV gate via canonical kernel (mirrors crypto vts-runner:1141-1183) ──
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
          sourcePool: 'xstock_spot',
          minPWin: getCachedNumberRequired('expectancy_kernel', 'pwin_floor', _XSTOCK_GK),
          maxPWin: getCachedNumberRequired('expectancy_kernel', 'pwin_ceiling', _XSTOCK_GK),
          diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_to_pwin_scaling_factor', _XSTOCK_GK),
        });
      } catch (kernelErr) {
        counters.errors++;
        console.warn(`[B79.0m.b2][EVAL_KERNEL_FAIL] ${symbol}/${strategyKey}: ${kernelErr instanceof Error ? kernelErr.message : kernelErr}`);
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
            features: { sourcePool: 'xstock_spot' },
          });
          counters.signalsArchived++;
        } catch { /* hot path */ }
        continue;
      }

      // ── Pre-open gates: cooldown, dup-position, price-past-stop, max-open-trades ──
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
            features: { sourcePool: 'xstock_spot' },
          });
          counters.signalsArchived++;
        } catch { /* hot path */ }
        continue;
      }

      // ── Net EV passes — archive admitted + open VTS trade ──
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
            sourcePool: 'xstock_spot',
            hybridScore,
            predictiveConfidence,
            regimeWeight,
          },
        });
        counters.signalsArchived++;
      } catch { /* hot path */ }

      // Layer-1 starter sizing: fixed $150 per trade.
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
        sourcePool: stratFamily ? `xstock-${stratFamily}` : 'xstock_spot',
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
        counters.byStrategy[strategyKey].trades++;
        console.log(`[B79.0m.b2][EVAL] ${symbol} (xstock_spot) regime=${regime} strategy=${strategyKey} family=${stratFamily ?? '-'} netEV=${kernelResult.netEV.toFixed(4)} → trade ${tradeId} opened`);
      }
    }
  } catch (err) {
    counters.errors++;
    console.error(`[B79.0m.b][EVAL_PAIR_ERROR] ${symbol}:`, err instanceof Error ? err.message : err);
  }
}
