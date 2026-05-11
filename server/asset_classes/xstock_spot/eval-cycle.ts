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
import { evaluateSignalQuality } from '../../core/filters/signal_quality_evaluator.js';
import {
  getStrategiesForRegime,
  isStrategyEnabledForAssetClass,
} from '../../config/canonical-regime-strategy-map.js';
import { callStrategyDetect, registerOpenVtsTrade, isIdenticalXstockSetupSuppressed } from '../../services/vts-runner.js';
import { isXstockMarketOpenUTC } from './market-hours.js';
import { evaluateXstockGlobalFilter } from './global-filter.js';
import { evaluateXstockFamilyIMF } from './imf-evaluator.js';
import { db } from '../../db.js';
import { sql } from 'drizzle-orm';
import type { OHLCData } from '../../types/market-regime.types';

/**
 * Fetch most-recent N 1-minute candles from xstock_spot_ohlc_1m for a symbol.
 * Layer-1 starter: reads the partitioned passive-archive table directly.
 * Future B79.0m.b2: introduce an `XstockOHLCCache` (5-min TTL) mirroring the
 * crypto ohlcCache, so per-cycle reads don't hit DB.
 */
export async function fetchXstockOHLC(symbol: string, limit = 120): Promise<OHLCData[]> {
  try {
    const result: any = await db.execute(sql`
      SELECT timestamp_minute, open, high, low, close, volume
        FROM xstock_spot_ohlc_1m
       WHERE symbol = ${symbol}
         AND timestamp_minute > NOW() - INTERVAL '6 hours'
       ORDER BY timestamp_minute DESC
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
        timestamp: new Date(r.timestamp_minute).getTime(),
      } as OHLCData));
    return bars;
  } catch (err) {
    console.warn(`[B79.0m.b][fetchXstockOHLC] ${symbol}: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

const ASSET_CLASS = 'xstock_spot' as const;

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
    if (!imfResult.anyPassed) {
      counters.pairsFailedAllFamilies++;
      return;
    }
    counters.pairsPassedFamilies++;

    // ── 4. Iterate eligible strategies for this regime ──
    const regimeStrategies = getStrategiesForRegime(regime);
    if (regimeStrategies.length === 0) {
      console.log(`[B79.0m.b][EVAL] ${symbol} regime=${regime} — no strategies mapped`);
      return;
    }

    for (const stratDef of regimeStrategies) {
      const strategyKey = stratDef.strategyKey;
      // Per-asset-class enablement gate (B79.0m.a — DB-authoritative).
      if (!isStrategyEnabledForAssetClass(strategyKey, ASSET_CLASS)) {
        continue;
      }
      counters.strategiesEvaluated++;

      // ── 5. callStrategyDetect (pattern strategies get null patternInput; pattern detection deferred for B79.0m.b2) ──
      let strategySignal: any = null;
      try {
        strategySignal = callStrategyDetect(
          strategyKey,
          mceContext.indicators,
          ohlc as any,
          null,
          symbol,
          ASSET_CLASS,
        );
      } catch (detectErr) {
        counters.errors++;
        console.warn(`[B79.0m.b][EVAL_DETECT_FAIL] ${symbol}/${strategyKey}: ${detectErr instanceof Error ? detectErr.message : detectErr}`);
        continue;
      }
      if (!strategySignal) {
        counters.strategyNulls++;
        continue;
      }
      counters.signalsGenerated++;

      // ── 6. Setup-hash dedupe (assetClass-keyed) ──
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

      // ── 7. SQE evaluate ──
      const signalId = `xstock_${symbol.replace(/[^A-Z0-9]/gi, '')}_${strategyKey}_${Date.now()}`;
      let sqeResult;
      try {
        sqeResult = await evaluateSignalQuality({
          signalId,
          symbol,
          strategy: strategyKey,
          mode,
          finalScore: (strategySignal as any).finalScore,
          regimeWeight: mceContext.regime.confidence,
          confidence: (strategySignal as any).confidence,
          entryPrice: strategySignal.entryPrice,
          targetPrice: strategySignal.targetPrice,
          regime,
          signalType: stratDef.signalType,
          sourcePool: 'xstock_spot',
        }, { skipGovernanceGate: true });
      } catch (sqeErr) {
        counters.errors++;
        console.warn(`[B79.0m.b][EVAL_SQE_FAIL] ${symbol}/${strategyKey}: ${sqeErr instanceof Error ? sqeErr.message : sqeErr}`);
        continue;
      }

      // ── 8. Archive signal_eval (passed or rejected) ──
      try {
        const { archiveSignalEval } = await import('../../services/data-archive/signal-eval-archiver.js');
        archiveSignalEval({
          symbol,
          exchange: 'kraken',
          assetClass: ASSET_CLASS,
          // B79.0m.b: reusing 'vts-runner' source enum; xstock evaluator is the
          // xstock-side VTS feeder. Adding a dedicated 'xstock-eval-cycle' source
          // is a future SignalEvalSource union extension (B79.0m.b2 governance).
          source: 'vts-runner',
          strategy: strategyKey,
          regimeLabel: regime ?? undefined,
          rejectStage: sqeResult.passed ? 'admitted' : 'sqe',
          finalScore: sqeResult.metrics.finalScore,
          gateDecision: {
            gate: 'sqe',
            accepted: sqeResult.passed,
            reason: sqeResult.reason ?? (sqeResult.failures?.[0] ?? 'passed'),
            finalScoreMin: sqeResult.thresholds.finalScoreMin,
            regimeWeightMin: sqeResult.thresholds.regimeWeightMin,
          },
          features: {
            sourcePool: 'xstock_spot',
            macroModifier: mceContext.directionalBias?.score,
          },
        });
        counters.signalsArchived++;
      } catch (archiveErr) {
        // Silent on hot path
      }

      if (!sqeResult.passed) {
        counters.signalsRejectedBySQE++;
        continue;
      }

      // ── 9. Open VTS trade ──
      // Layer-1 starter sizing: fixed $150 per trade (mirrors xstock starter).
      const dollarValue = 150;
      const quantity = strategySignal.entryPrice > 0 ? dollarValue / strategySignal.entryPrice : 0;
      const tradeId = await registerOpenVtsTrade({
        symbol,
        assetClass: ASSET_CLASS,
        entryPrice: strategySignal.entryPrice,
        stopLoss: strategySignal.stopPrice,
        takeProfit: strategySignal.targetPrice,
        positionSize: dollarValue,
        dollarValue,
        quantity,
        frictionCost: 0,
        regime,
        regimeScore: mceContext.regime.confidence,
        signalType: stratDef.signalType,
        strategy: strategyKey,
        patternType: (stratDef.patternType as any) ?? null,
        finalScore: sqeResult.metrics.finalScore,
        hybridScore: 0,
        predictiveConfidence: (strategySignal as any).confidence ?? 0.5,
        regimeWeight: sqeResult.metrics.regimeWeight,
        decayPenalty: 1.0,
        pool: 'rotational',
        sourcePool: 'xstock_spot',
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
        console.log(`[B79.0m.b][EVAL] ${symbol} (xstock_spot) regime=${regime} strategy=${strategyKey} → trade ${tradeId} opened`);
      }
    }
  } catch (err) {
    counters.errors++;
    console.error(`[B79.0m.b][EVAL_PAIR_ERROR] ${symbol}:`, err instanceof Error ? err.message : err);
  }
}
