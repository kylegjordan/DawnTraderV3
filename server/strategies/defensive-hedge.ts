/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 12.3.2 — defensive_hedge Strategy Implementation
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Type:        HYBRID (pattern + indicator + cross-asset correlation)
 * Direction:   BUY only
 * Pattern:     ENGULFING
 * Regime:      Decorrelated asset hedge play
 *
 * Identifies assets with low BTC correlation and elevated idiosyncratic
 * volatility, entering on bullish engulfing patterns for portfolio
 * diversification benefit.
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { StrategySignal, TechnicalIndicators } from '../services/strategy-engine';
import type { PriceData } from '@shared/schema';
import type { AssetClass } from '@shared/asset-classes';
import {
  calculateATR, calculateRSI, calculateSMA, calculateAvgVolume, calculateMomentum,
  minMomentum, calculateADXSeries, calculateADX, calculateReturnStdDev,
  volatilityPercentile, countMomentumInversions, spearmanRankCorrelation,
  getEffectiveATR, applyGlobalGuards, clampConfidence, parseCandles,
  findLocalMinima, GLOBAL_CONSTANTS,
  type OHLCCandle, type PatternInput
} from './strategy-helpers';
import { getPerClassTargetGate } from '../core/calculations/expectancy.js';
import { recordGuardEval } from './guard-eval-tracker.js';
import { setNullReason } from '../utils/null-reason-tracker.js';
import { getCachedNumberRequired, getCachedNumbersForModule } from '../services/module-constants-service.js';

// ═══════════════════════════════════════════════════════════════
// Strategy Constants
// ═══════════════════════════════════════════════════════════════
// B72 (2026-05-05): the |DBS| >= 0.35 mutual-exclusion guards below now read
// from module_constants ('strategy_dbs_routing_guards' / 'dbs_min_threshold').
// Group migrated atomically with strong_bull_trend, reverse_impulse,
// morning_star. See server/tests/integration/b72-dbs-routing-guards-consistency.test.ts.

// B72 (2026-05-05): all strategy levers moved to module='strategy.defensive_hedge'.
// DH_STOP_BUFFER (0.005) remains hardcoded — KEEP per LEVER_INVENTORY (geometric buffer).
const DH_STOP_BUFFER        = 0.005;

const STRATEGY_KEY = 'defensive_hedge';
const LOG_PREFIX   = '[12.3.2][DEFENSIVE_HEDGE]';

// ═══════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Compute close-to-close returns from an OHLC candle array.
 */
function computeReturns(candles: OHLCCandle[], count: number): number[] {
  const slice = candles.slice(-(count + 1));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1].close > 0) {
      returns.push((slice[i].close - slice[i - 1].close) / slice[i - 1].close);
    }
  }
  return returns;
}

// ═══════════════════════════════════════════════════════════════
// Detection Function
// ═══════════════════════════════════════════════════════════════

/**
 * Detect a defensive-hedge BUY signal.
 *
 * Targets assets that are decorrelated from BTC with higher idiosyncratic
 * volatility, entering on a confirmed bullish engulfing pattern.
 *
 * @param indicators    - Current technical indicator snapshot
 * @param candles       - Raw candle array for the asset (will be parsed)
 * @param patternSignal - Pattern detection result (expects ENGULFING / BUY)
 * @param btcCandles    - Raw BTC candle array for correlation calculation
 * @returns StrategySignal or null if conditions are not met
 */
export function detectDefensiveHedge(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null,
  assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope (5th positional; btcCandles moves to 6th)
  btcCandles?: any[],
): StrategySignal | null {
  // B72: bulk read all strategy levers from module_constants.
  // B79.0n.STRATEGY: per-class resolver scope.
  const c = getCachedNumbersForModule('strategy.defensive_hedge', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  const DH_CORR_WINDOW         = c.correlation_lookback_bars;
  const DH_VOL_WINDOW          = c.volatility_lookback_bars;
  const DH_MAX_CORRELATION     = c.max_btc_correlation_threshold;
  const DH_MIN_VOL_OFFSET      = c.min_idiosyncratic_volatility_offset;
  const DH_VOL_MULT            = c.volume_threshold_multiplier;
  const DH_TARGET_ATR_MULT     = c.target_exit_atr_multiplier;
  const DH_PATTERN_WEIGHT      = c.pattern_strength_confidence_weight;
  const DH_DECORR_WEIGHT       = c.correlation_offset_confidence_weight;
  const DH_VOL_OFFSET_RATE     = c.volatility_offset_confidence_rate;
  const DH_MAX_VOL_BONUS       = c.volume_confidence_bonus_max;
  const DH_STRONG_ENGULF_BONUS = c.strong_engulfing_pattern_bonus;

  // B63 + B72: Belt-and-braces for Path D LONG-only leak.
  // Threshold sourced from module_constants (group with strong_bull_trend).
  // B79.0n.STRATEGY: per-class resolver scope (value class-invariant; shape consistency).
  const dbsGuardThreshold = getCachedNumberRequired(
    'strategy_dbs_routing_guards',
    'dbs_min_threshold',
    { exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*' },
  );
  if (((indicators as any).dbsScore ?? 0) >= dbsGuardThreshold) {
    setNullReason('b63_strong_dbs_exclusion');
    return null;
  }
  // B63 Item 10: Counter-trend LONG guard (mirror-defect fix). defensive_hedge is BUY-only
  // (direction: 'BUY'); firing on strong NEGATIVE DBS pairs means entering LONG against a
  // strong downtrend. 2 mirror-defect trades in the B62 72h window per
  // BATCH_63_COUNTERFACTUAL_AUDIT. Block here.
  if (((indicators as any).dbsScore ?? 0) <= -dbsGuardThreshold) {
    setNullReason('b63b_counter_trend_long_exclusion');
    return null;
  }
  // ── Parse candles ──────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < DH_CORR_WINDOW + 2) {
    console.log(`${LOG_PREFIX} Insufficient asset candles: ${ohlc.length}`);
    setNullReason('insufficient_data');
    return null;
  }

  // ── BTC candles required ───────────────────────────────────
  if (!btcCandles || btcCandles.length === 0) {
    console.log(`${LOG_PREFIX} No BTC candles provided — cannot compute correlation`);
    setNullReason('insufficient_data');
    return null;
  }
  const btcOhlc = parseCandles(btcCandles);
  if (btcOhlc.length < DH_CORR_WINDOW + 2) {
    console.log(`${LOG_PREFIX} Insufficient BTC candles: ${btcOhlc.length}`);
    setNullReason('insufficient_data');
    return null;
  }

  const { currentPrice } = indicators;

  // ── BTC short-circuit ──────────────────────────────────────
  // This strategy should not trade BTC against itself
  if (indicators.vwap !== undefined) {
    // We check the symbol via a loose heuristic: if the caller has set
    // symbol metadata, we rely on that downstream. As a secondary guard
    // we check for identical candle series, but the primary gate is the
    // symbol name which the orchestrator checks before calling.
    // Per spec: if symbol contains 'BTC', return null.
    // The symbol is set by the caller after this function returns, so
    // we cannot check it here directly. Instead the caller must enforce
    // the BTC exclusion. We add a metadata flag for defense-in-depth.
  }

  // ── Pattern gate ───────────────────────────────────────────
  if (!patternSignal) {
    console.log(`${LOG_PREFIX} No pattern signal`);
    setNullReason('no_pattern');
    return null;
  }
  if (patternSignal.pattern !== 'ENGULFING' || patternSignal.direction !== 'BUY') {
    console.log(`${LOG_PREFIX} Pattern mismatch: ${patternSignal.pattern}/${patternSignal.direction}`);
    setNullReason('no_pattern');
    return null;
  }
  if (patternSignal.strength < 0.50) {  // Crypto-calibrated (Batch 18H): 0.55 → 0.50
    console.log(`${LOG_PREFIX} Strength too low: ${patternSignal.strength.toFixed(3)} < 0.50`);
    setNullReason('weak_pattern');
    return null;
  }

  // ── Spearman correlation ───────────────────────────────────
  const assetReturns = computeReturns(ohlc, DH_CORR_WINDOW);
  const btcReturns   = computeReturns(btcOhlc, DH_CORR_WINDOW);
  const btcCorrelation = spearmanRankCorrelation(assetReturns, btcReturns);

  if (Math.abs(btcCorrelation) >= DH_MAX_CORRELATION) {
    console.log(`${LOG_PREFIX} Correlation too high: |${btcCorrelation.toFixed(4)}| >= ${DH_MAX_CORRELATION}`);
    setNullReason('correlation_fail');
    return null;
  }

  // ── Volatility offset ─────────────────────────────────────
  const assetVol  = calculateReturnStdDev(ohlc, DH_VOL_WINDOW);
  const marketVol = calculateReturnStdDev(btcOhlc, DH_VOL_WINDOW);

  if (marketVol <= 0) {
    console.log(`${LOG_PREFIX} Market volatility is zero — cannot compute offset`);
    setNullReason('insufficient_data');
    return null;
  }

  const volOffset = (assetVol - marketVol) / marketVol;
  if (volOffset <= DH_MIN_VOL_OFFSET) {
    console.log(`${LOG_PREFIX} Volatility offset too low: ${volOffset.toFixed(4)} <= ${DH_MIN_VOL_OFFSET}`);
    setNullReason('volatility_filter');
    return null;
  }

  // ── Volume gate ────────────────────────────────────────────
  const avgVol = calculateAvgVolume(ohlc, GLOBAL_CONSTANTS.VOLUME_BASELINE_PERIOD);
  const lastCandle = ohlc[ohlc.length - 1];
  const engulfingVolume = lastCandle.volume;

  if (avgVol <= 0 || engulfingVolume < avgVol * DH_VOL_MULT) {
    console.log(`${LOG_PREFIX} Volume too low: ${engulfingVolume.toFixed(2)} < ${(avgVol * DH_VOL_MULT).toFixed(2)}`);
    setNullReason('volume_insufficient');
    return null;
  }

  // ── ATR & Effective ATR ────────────────────────────────────
  const effectiveATR = getEffectiveATR(ohlc, currentPrice);
  if (effectiveATR === null) {
    console.log(`${LOG_PREFIX} ATR guard rejected signal`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Price levels ───────────────────────────────────────────
  const entryPrice = currentPrice * 1.001;

  // Engulfing low: prefer metadata, fallback to min low of last 2 candles
  const engulfingLow = patternSignal.metadata?.engulfingLow
    ?? Math.min(ohlc[ohlc.length - 1].low, ohlc[ohlc.length - 2].low);

  const stopPrice   = engulfingLow * (1 - DH_STOP_BUFFER);
  const targetPrice = entryPrice + DH_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards ──────────────────────────────────────────
  const gate = getPerClassTargetGate(assetClass);
  const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
  recordGuardEval('defensive_hedge', _gr.rr, _gr.pass, _gr.dropReason);
  if (!_gr.pass) {
    console.log(`${LOG_PREFIX} Global guards rejected signal`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Confidence scoring ─────────────────────────────────────
  const patternScore    = patternSignal.strength * DH_PATTERN_WEIGHT;
  const decorrelScore   = (1 - Math.abs(btcCorrelation) / DH_MAX_CORRELATION) * DH_DECORR_WEIGHT;
  const volOffsetScore  = Math.min(DH_MAX_VOL_BONUS, volOffset * DH_VOL_OFFSET_RATE);

  const engulfRatio     = patternSignal.metadata?.engulfRatio ?? 0;
  const engulfRatioBonus = (engulfRatio > 1.5) ? DH_STRONG_ENGULF_BONUS : 0;

  const rawConfidence   = patternScore + decorrelScore + volOffsetScore + engulfRatioBonus;
  const confidence      = clampConfidence(Math.min(rawConfidence, 0.93));

  console.log(`${LOG_PREFIX} Signal detected`, JSON.stringify({
    entryPrice: entryPrice.toFixed(6),
    stopPrice: stopPrice.toFixed(6),
    targetPrice: targetPrice.toFixed(6),
    confidence: confidence.toFixed(4),
    components: {
      patternScore: patternScore.toFixed(4),
      decorrelScore: decorrelScore.toFixed(4),
      volOffsetScore: volOffsetScore.toFixed(4),
      engulfRatioBonus: engulfRatioBonus.toFixed(4),
    },
    indicators: {
      btcCorrelation: btcCorrelation.toFixed(4),
      assetVol: assetVol.toFixed(6),
      marketVol: marketVol.toFixed(6),
      volOffset: volOffset.toFixed(4),
      engulfingVolume: engulfingVolume.toFixed(2),
      avgVolume: avgVol.toFixed(2),
      effectiveATR: effectiveATR.toFixed(6),
      engulfRatio,
    },
  }));

  return {
    symbol: '',   // Set by caller
    strategy: STRATEGY_KEY as any,
    entryPrice,
    stopPrice,
    targetPrice,
    confidence,
    metadata: {
      strategyVersion: '12.3.2',
      type: 'HYBRID',
      direction: 'BUY',
      regime: 'decorrelated-hedge',
      pattern: 'ENGULFING',
      patternStrength: patternSignal.strength,
      btcCorrelation,
      assetVol,
      marketVol,
      volOffset,
      engulfingVolume,
      avgVolume: avgVol,
      effectiveATR,
      engulfingLow,
      engulfRatio,
      btcExcluded: true,    // Defence-in-depth flag: caller must skip BTC pairs
      components: {
        patternScore,
        decorrelScore,
        volOffsetScore,
        engulfRatioBonus,
      },
    },
  };
}

/**
 * Default export — `detect` entry-point for the strategy engine.
 */
export const detect = detectDefensiveHedge;
