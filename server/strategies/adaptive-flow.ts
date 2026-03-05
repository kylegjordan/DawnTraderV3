/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 12.3.2 — adaptive_flow Strategy Implementation
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Type:        HYBRID (pattern + indicator)
 * Direction:   BUY only
 * Regime:      LOW_VOL_CHOP — range-bound, directionless markets
 *
 * Identifies three-white-soldiers breakout setups within low-trend (low ADX),
 * high-inversion, high-volatility-percentile environments. Targets a
 * measured move with a wide ATR-based stop for the choppy context.
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

// ═══════════════════════════════════════════════════════════════
// Strategy Constants
// ═══════════════════════════════════════════════════════════════

const AF_LOOKBACK              = 20;
const AF_MIN_INVERSIONS        = 3;
const AF_VOL_PERCENTILE_WINDOW = 50;
const AF_MIN_VOL_PERCENTILE    = 70;
const AF_VOL_MULT              = 1.3;
const AF_ADX_MAX               = 25;
const AF_STOP_ATR_MULT         = 1.5;
const AF_STOP_BUFFER           = 0.003;
const AF_TARGET_ATR_MULT       = 3.0;
const AF_PATTERN_WEIGHT        = 0.35;
const AF_INVERSION_RATE        = 0.05;
const AF_MAX_INVERSION_BONUS   = 0.20;
const AF_VOL_PCT_WEIGHT        = 0.25;
const AF_HIGH_VOL_BONUS        = 0.08;

const STRATEGY_KEY = 'adaptive_flow';
const LOG_PREFIX   = '[12.3.2][ADAPTIVE_FLOW]';

// ═══════════════════════════════════════════════════════════════
// Detection Function
// ═══════════════════════════════════════════════════════════════

/**
 * Detect an adaptive-flow BUY signal.
 *
 * Targets low-ADX, choppy environments where a THREE_SOLDIERS pattern
 * emerges with sufficient momentum inversions and elevated volatility
 * percentile, signalling a directional breakout from the chop.
 *
 * @param indicators    - Current technical indicator snapshot
 * @param candles       - Raw candle array (will be parsed internally)
 * @param patternSignal - Pattern detection result (expects THREE_SOLDIERS / BUY)
 * @returns StrategySignal or null if conditions are not met
 */
export function detectAdaptiveFlow(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null
): StrategySignal | null {
  // ── Parse candles ──────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < AF_VOL_PERCENTILE_WINDOW + 15) {
    console.log(`${LOG_PREFIX} Insufficient candles: ${ohlc.length}`);
    return null;
  }

  const { currentPrice } = indicators;

  // ── Pattern gate ───────────────────────────────────────────
  if (!patternSignal) {
    console.log(`${LOG_PREFIX} No pattern signal`);
    return null;
  }
  if (patternSignal.pattern !== 'THREE_SOLDIERS' || patternSignal.direction !== 'BUY') {
    console.log(`${LOG_PREFIX} Pattern mismatch: ${patternSignal.pattern}/${patternSignal.direction}`);
    return null;
  }
  if (patternSignal.strength < 0.55) {
    console.log(`${LOG_PREFIX} Strength too low: ${patternSignal.strength.toFixed(3)} < 0.55`);
    return null;
  }

  // ── Momentum inversion gate ────────────────────────────────
  const inversionCount = countMomentumInversions(ohlc, AF_LOOKBACK);
  if (inversionCount < AF_MIN_INVERSIONS) {
    console.log(`${LOG_PREFIX} Too few inversions: ${inversionCount} < ${AF_MIN_INVERSIONS}`);
    return null;
  }

  // ── Volatility percentile gate ─────────────────────────────
  const volPercentile = volatilityPercentile(ohlc, AF_VOL_PERCENTILE_WINDOW);
  if (volPercentile < AF_MIN_VOL_PERCENTILE) {
    console.log(`${LOG_PREFIX} Vol percentile too low: ${volPercentile.toFixed(2)} < ${AF_MIN_VOL_PERCENTILE}`);
    return null;
  }

  // ── Volume gate ────────────────────────────────────────────
  const avgVol = calculateAvgVolume(ohlc, GLOBAL_CONSTANTS.VOLUME_BASELINE_PERIOD);
  const lastCandle = ohlc[ohlc.length - 1];
  const currentVolume = lastCandle.volume;

  if (avgVol <= 0 || currentVolume < avgVol * AF_VOL_MULT) {
    console.log(`${LOG_PREFIX} Volume too low: ${currentVolume.toFixed(2)} < ${(avgVol * AF_VOL_MULT).toFixed(2)}`);
    return null;
  }

  // ── ADX anti-trend gate ────────────────────────────────────
  const adx = calculateADX(ohlc, 14);
  if (adx >= AF_ADX_MAX) {
    console.log(`${LOG_PREFIX} ADX too high (trending): ${adx.toFixed(2)} >= ${AF_ADX_MAX}`);
    return null;
  }

  // ── ATR & Effective ATR ────────────────────────────────────
  const effectiveATR = getEffectiveATR(ohlc, currentPrice);
  if (effectiveATR === null) {
    console.log(`${LOG_PREFIX} ATR guard rejected signal`);
    return null;
  }

  // ── Price levels ───────────────────────────────────────────
  const entryPrice = currentPrice * 1.001;

  // Three soldiers low: minimum low of the last 3 candles
  const threeSoldiersLow = Math.min(
    ohlc[ohlc.length - 1].low,
    ohlc[ohlc.length - 2].low,
    ohlc[ohlc.length - 3].low
  );

  // Stop: pick the wider (more protective) of pattern-based and ATR-based
  const patternStop = threeSoldiersLow * (1 - AF_STOP_BUFFER);
  const atrStop     = entryPrice - AF_STOP_ATR_MULT * effectiveATR;
  const stopPrice   = Math.min(patternStop, atrStop);

  const targetPrice = entryPrice + AF_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards ──────────────────────────────────────────
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR)) {
    console.log(`${LOG_PREFIX} Global guards rejected signal`);
    return null;
  }

  // ── Confidence scoring ─────────────────────────────────────
  const patternScore    = patternSignal.strength * AF_PATTERN_WEIGHT;
  const inversionScore  = Math.min(AF_MAX_INVERSION_BONUS, (inversionCount - AF_MIN_INVERSIONS + 1) * AF_INVERSION_RATE);
  const volPctScore     = ((volPercentile - AF_MIN_VOL_PERCENTILE) / (100 - AF_MIN_VOL_PERCENTILE)) * AF_VOL_PCT_WEIGHT;
  const volumeBonus     = (currentVolume >= avgVol * 1.8) ? AF_HIGH_VOL_BONUS : 0;

  const rawConfidence   = patternScore + inversionScore + volPctScore + volumeBonus;
  const confidence      = clampConfidence(Math.min(rawConfidence, 0.88));

  console.log(`${LOG_PREFIX} Signal detected`, JSON.stringify({
    entryPrice: entryPrice.toFixed(6),
    stopPrice: stopPrice.toFixed(6),
    targetPrice: targetPrice.toFixed(6),
    confidence: confidence.toFixed(4),
    components: {
      patternScore: patternScore.toFixed(4),
      inversionScore: inversionScore.toFixed(4),
      volPctScore: volPctScore.toFixed(4),
      volumeBonus: volumeBonus.toFixed(4),
    },
    indicators: {
      inversionCount,
      volPercentile: volPercentile.toFixed(2),
      adx: adx.toFixed(2),
      currentVolume: currentVolume.toFixed(2),
      avgVolume: avgVol.toFixed(2),
      effectiveATR: effectiveATR.toFixed(6),
      threeSoldiersLow: threeSoldiersLow.toFixed(6),
      patternStop: patternStop.toFixed(6),
      atrStop: atrStop.toFixed(6),
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
      regime: 'RANGE_BOUND_STABLE',
      pattern: 'THREE_SOLDIERS',
      patternStrength: patternSignal.strength,
      inversionCount,
      volPercentile,
      adx,
      currentVolume,
      avgVolume: avgVol,
      effectiveATR,
      threeSoldiersLow,
      components: {
        patternScore,
        inversionScore,
        volPctScore,
        volumeBonus,
      },
    },
  };
}

/**
 * Default export — `detect` entry-point for the strategy engine.
 */
export const detect = detectAdaptiveFlow;
