/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 12.3.2 — reverse_impulse Strategy Implementation
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Type:        HYBRID (pattern + indicator)
 * Direction:   BUY only (counter-trend)
 * Pattern:     PINBAR
 * Regime:      Counter-trend mean-reversion on impulse exhaustion
 *
 * Detects oversold pinbar reversals confirmed by negative momentum exhaustion
 * and elevated volume, targeting a bounce toward mean.
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
import { guardForcesDrop, type GateDisposition } from './strategy-helpers';
import { getPerClassTargetGate } from '../core/calculations/expectancy.js';
import { recordGuardEval } from './guard-eval-tracker.js';
import { setNullReason } from '../utils/null-reason-tracker.js';
import { getCachedNumberRequired, getCachedNumbersForModule } from '../services/module-constants-service.js';

// ═══════════════════════════════════════════════════════════════
// Strategy Constants
// ═══════════════════════════════════════════════════════════════
// B72 (2026-05-05): the |DBS| >= 0.35 mutual-exclusion guards below now read
// from module_constants ('strategy_dbs_routing_guards' / 'dbs_min_threshold').
// Group migrated atomically with strong_bull_trend, defensive_hedge,
// morning_star. See server/tests/integration/b72-dbs-routing-guards-consistency.test.ts.

// B72 (2026-05-05): all strategy levers moved to module='strategy.reverse_impulse'.
// RI_STOP_BUFFER (0.005) remains hardcoded — KEEP per LEVER_INVENTORY (geometric buffer).
const RI_STOP_BUFFER        = 0.005;

const STRATEGY_KEY = 'reverse_impulse';
const LOG_PREFIX   = '[12.3.2][REVERSE_IMPULSE]';

// ═══════════════════════════════════════════════════════════════
// Detection Function
// ═══════════════════════════════════════════════════════════════

/**
 * Detect a reverse-impulse BUY signal.
 *
 * Looks for a PINBAR reversal at the tail of a momentum sell-off,
 * confirmed by oversold RSI and elevated volume on the pinbar candle.
 *
 * @param indicators  - Current technical indicator snapshot
 * @param candles     - Raw candle array (will be parsed internally)
 * @param patternSignal - Pattern detection result (expects PINBAR / BUY)
 * @returns StrategySignal or null if conditions are not met
 */
export function detectReverseImpulse(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null,
  assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
  gateDisposition: GateDisposition = 'enforce',
): StrategySignal | null {
  // B72: bulk read all strategy levers from module_constants.
  // B79.0n.STRATEGY: per-class resolver scope.
  const c = getCachedNumbersForModule('strategy.reverse_impulse', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  const RI_MIN_STRENGTH       = c.min_pattern_strength;
  const RI_MOMENTUM_THRESHOLD = c.momentum_threshold_negative;
  const RI_LOOKBACK           = c.momentum_lookback_bars;
  const RI_VOL_MULT           = c.volume_threshold_multiplier;
  const RI_RSI_MAX            = c.max_rsi_oversold_threshold;
  const RI_TARGET_ATR_MULT    = c.target_exit_atr_multiplier;
  const RI_PATTERN_WEIGHT     = c.pattern_strength_confidence_weight;
  const RI_MOMENTUM_RATE      = c.momentum_exhaustion_confidence_rate;
  const RI_MAX_MOMENTUM_BONUS = c.momentum_confidence_bonus_max;
  const RI_RSI_WEIGHT         = c.rsi_oversold_confidence_weight;
  const RI_EXTREME_VOL_BONUS  = c.extreme_volume_confidence_bonus;

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
  // B63 Item 10: Counter-trend LONG guard (mirror-defect fix). reverse_impulse is LONG-only
  // and fires on pinbar-reversal setups; firing on strong NEGATIVE DBS pairs means entering
  // LONG against a strong downtrend. This strategy was the LARGEST contributor to the mirror
  // defect — 54 losing trades in the B62 72h window per BATCH_63_COUNTERFACTUAL_AUDIT. Block.
  if (((indicators as any).dbsScore ?? 0) <= -dbsGuardThreshold) {
    setNullReason('b63b_counter_trend_long_exclusion');
    return null;
  }
  // ── Parse candles ──────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < RI_LOOKBACK + 1) {
    console.log(`${LOG_PREFIX} Insufficient candles: ${ohlc.length}`);
    setNullReason('insufficient_data');
    return null;
  }

  const { currentPrice } = indicators;

  // ── Pattern gate ───────────────────────────────────────────
  if (!patternSignal) {
    console.log(`${LOG_PREFIX} No pattern signal`);
    setNullReason('no_pattern');
    return null;
  }
  if (patternSignal.pattern !== 'PINBAR' || patternSignal.direction !== 'BUY') {
    console.log(`${LOG_PREFIX} Pattern mismatch: ${patternSignal.pattern}/${patternSignal.direction}`);
    setNullReason('no_pattern');
    return null;
  }
  if (patternSignal.strength < RI_MIN_STRENGTH) {
    console.log(`${LOG_PREFIX} Strength too low: ${patternSignal.strength.toFixed(3)} < ${RI_MIN_STRENGTH}`);
    setNullReason('weak_pattern');
    return null;
  }

  // ── Momentum gate ──────────────────────────────────────────
  const momMin = minMomentum(ohlc, RI_LOOKBACK);
  if (momMin > RI_MOMENTUM_THRESHOLD) {
    console.log(`${LOG_PREFIX} Momentum not negative enough: ${momMin.toFixed(5)} > ${RI_MOMENTUM_THRESHOLD}`);
    setNullReason('indicator_filter');
    return null;
  }

  // ── Volume assessment (soft factor, not hard gate) ─────────
  // B57: Converted from hard gate to confidence factor. Reverse impulse
  // signals are driven by RSI oversold + momentum, not volume. Volume
  // now influences confidence score instead of blocking the trade.
  const avgVol = calculateAvgVolume(ohlc, GLOBAL_CONSTANTS.VOLUME_BASELINE_PERIOD);
  const lastCandle = ohlc[ohlc.length - 1];
  const pinbarVolume = lastCandle.volume;
  const volumeRatio = avgVol > 0 ? pinbarVolume / avgVol : 0;
  if (avgVol > 0) {
    console.log(`${LOG_PREFIX} Volume ratio: ${pinbarVolume.toFixed(2)} / ${avgVol.toFixed(2)} = ${volumeRatio.toFixed(2)}x (soft factor)`);
  }

  // ── RSI gate ───────────────────────────────────────────────
  const rsi = calculateRSI(ohlc, 14);
  if (rsi >= RI_RSI_MAX) {
    console.log(`${LOG_PREFIX} RSI not oversold: ${rsi.toFixed(2)} >= ${RI_RSI_MAX}`);
    setNullReason('indicator_filter');
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
  const pinbarLow  = patternSignal.metadata?.pinbarLow ?? lastCandle.low;
  const stopPrice  = pinbarLow * (1 - RI_STOP_BUFFER);
  const targetPrice = entryPrice + RI_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards ──────────────────────────────────────────
  const gate = getPerClassTargetGate(assetClass, 'reverse_impulse');
  const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
  recordGuardEval('reverse_impulse', _gr.rr, _gr.pass, _gr.dropReason, assetClass, effectiveATR, _gr.atrsToTarget);
  if (guardForcesDrop(_gr, gateDisposition)) {
    console.log(`${LOG_PREFIX} Global guards rejected signal`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Confidence scoring ─────────────────────────────────────
  const patternScore   = patternSignal.strength * RI_PATTERN_WEIGHT;
  const momentumScore  = Math.min(RI_MAX_MOMENTUM_BONUS, Math.abs(momMin - RI_MOMENTUM_THRESHOLD) * RI_MOMENTUM_RATE);
  const rsiScore       = (1 - rsi / 100) * RI_RSI_WEIGHT;
  // B57: Graduated volume factor — boosts for high volume, penalizes for low
  const volumeBonus = volumeRatio >= 2.5 ? RI_EXTREME_VOL_BONUS
    : volumeRatio >= 1.2 ? 0.04
    : volumeRatio >= 0.8 ? 0
    : -0.04;
  const rawConfidence  = patternScore + momentumScore + rsiScore + volumeBonus;
  const confidence     = clampConfidence(Math.min(rawConfidence, 0.95));

  console.log(`${LOG_PREFIX} Signal detected`, JSON.stringify({
    entryPrice: entryPrice.toFixed(6),
    stopPrice: stopPrice.toFixed(6),
    targetPrice: targetPrice.toFixed(6),
    confidence: confidence.toFixed(4),
    components: {
      patternScore: patternScore.toFixed(4),
      momentumScore: momentumScore.toFixed(4),
      rsiScore: rsiScore.toFixed(4),
      volumeBonus: volumeBonus.toFixed(4),
    },
    indicators: {
      rsi: rsi.toFixed(2),
      minMomentum: momMin.toFixed(6),
      pinbarVolume: pinbarVolume.toFixed(2),
      avgVolume: avgVol.toFixed(2),
      effectiveATR: effectiveATR.toFixed(6),
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
      regime: 'counter-trend',
      pattern: 'PINBAR',
      patternStrength: patternSignal.strength,
      rsi,
      minMomentum: momMin,
      pinbarVolume,
      avgVolume: avgVol,
      effectiveATR,
      pinbarLow,
      components: {
        patternScore,
        momentumScore,
        rsiScore,
        volumeBonus,
      },
    },
  };
}

/**
 * Default export — `detect` entry-point for the strategy engine.
 */
export const detect = detectReverseImpulse;
