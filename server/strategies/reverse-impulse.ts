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
import {
  calculateATR, calculateRSI, calculateSMA, calculateAvgVolume, calculateMomentum,
  minMomentum, calculateADXSeries, calculateADX, calculateReturnStdDev,
  volatilityPercentile, countMomentumInversions, spearmanRankCorrelation,
  getEffectiveATR, applyGlobalGuards, clampConfidence, parseCandles,
  findLocalMinima, GLOBAL_CONSTANTS,
  type OHLCCandle, type PatternInput
} from './strategy-helpers';
import { setNullReason } from '../utils/null-reason-tracker.js';

// ═══════════════════════════════════════════════════════════════
// Strategy Constants
// ═══════════════════════════════════════════════════════════════

const RI_MIN_STRENGTH       = 0.58;  // Crypto-calibrated (Batch 18H): 0.65 → 0.58
const RI_MOMENTUM_THRESHOLD = -0.01;
const RI_LOOKBACK           = 5;
const RI_VOL_MULT           = 1.5;
const RI_RSI_MAX            = 38;    // Crypto-calibrated (Batch 18H): 35 → 38
const RI_STOP_BUFFER        = 0.005;
const RI_TARGET_ATR_MULT    = 2.0;
const RI_PATTERN_WEIGHT     = 0.40;
const RI_MOMENTUM_RATE      = 10.0;
const RI_MAX_MOMENTUM_BONUS = 0.20;
const RI_RSI_WEIGHT         = 0.25;
const RI_EXTREME_VOL_BONUS  = 0.10;

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
  patternSignal: PatternInput | null
): StrategySignal | null {
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

  // ── Volume gate ────────────────────────────────────────────
  const avgVol = calculateAvgVolume(ohlc, GLOBAL_CONSTANTS.VOLUME_BASELINE_PERIOD);
  const lastCandle = ohlc[ohlc.length - 1];
  const pinbarVolume = lastCandle.volume;
  if (avgVol <= 0 || pinbarVolume < avgVol * RI_VOL_MULT) {
    console.log(`${LOG_PREFIX} Volume too low: ${pinbarVolume.toFixed(2)} < ${(avgVol * RI_VOL_MULT).toFixed(2)}`);
    setNullReason('volume_insufficient');
    return null;
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
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR)) {
    console.log(`${LOG_PREFIX} Global guards rejected signal`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Confidence scoring ─────────────────────────────────────
  const patternScore   = patternSignal.strength * RI_PATTERN_WEIGHT;
  const momentumScore  = Math.min(RI_MAX_MOMENTUM_BONUS, Math.abs(momMin - RI_MOMENTUM_THRESHOLD) * RI_MOMENTUM_RATE);
  const rsiScore       = (1 - rsi / 100) * RI_RSI_WEIGHT;
  const volumeBonus    = (pinbarVolume >= avgVol * 2.5) ? RI_EXTREME_VOL_BONUS : 0;
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
