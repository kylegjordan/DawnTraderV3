/**
 * ============================================================================
 * Directive 12.3.2 -- Pivot Shift Strategy
 * ============================================================================
 *
 * Type:      HYBRID (pattern + momentum indicators)
 * Direction: BUY only
 * Key:       pivot_shift
 *
 * Combines a Morning Star candlestick reversal with momentum confirmation
 * from RSI neutrality and rising ADX slope. The strategy targets pivots
 * where price is shifting from consolidation/decline into a new uptrend,
 * confirmed by two consecutive positive ADX slope readings.
 *
 * Entry: Slight premium above current price (0.1%).
 * Stop:  Max of (morning star low, entry - 1.5 * ATR) -- picks tighter stop.
 * Target: Entry + 3.0 ATR(14).
 *
 * Confidence built from pattern strength, RSI neutrality score, ADX
 * slope acceleration, and volume surge.
 * ============================================================================
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
// B72 (2026-05-05): all strategy levers moved to module='strategy.pivot_shift'.
import { getCachedNumbersForModule } from '../services/module-constants-service.js';

// ============================================================================
// Strategy Constants
// ============================================================================

// B72 (2026-05-05): all strategy levers moved to module='strategy.pivot_shift'.

const STRATEGY_KEY = 'pivot_shift';
const LOG_PREFIX = '[12.3.2][PIVOT_SHIFT]';

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect a Pivot Shift BUY signal (hybrid pattern + momentum).
 *
 * Requires a Morning Star pattern, RSI in the neutral zone (40-60),
 * two consecutive rising ADX periods, and volume confirmation.
 *
 * @param indicators - Technical indicators snapshot (currentPrice, volume, etc.)
 * @param candles    - Raw candle array from the data feed
 * @param patternSignal - Pre-detected pattern input (from pattern recogniser)
 * @returns StrategySignal if all conditions are met, null otherwise
 */
export function detectPivotShift(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null,
  assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
): StrategySignal | null {
  const { currentPrice, volume } = indicators;

  // B72: bulk read all strategy levers from module_constants.
  // B79.0n.STRATEGY: per-class resolver scope.
  const c = getCachedNumbersForModule('strategy.pivot_shift', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  const PS_RSI_LOW           = c.rsi_neutral_zone_low;
  const PS_RSI_HIGH          = c.rsi_neutral_zone_high;
  const PS_ADX_SLOPE_MIN     = c.min_adx_slope_per_period;
  const PS_VOL_MULT          = c.volume_threshold_multiplier;
  const PS_VOL_CONFIRM       = (c.volume_confirmation_enabled ?? 1) !== 0; // B3.1b: per-class volume toggle (xstock_spot=off)
  const PS_STOP_ATR_MULT     = c.stop_loss_atr_multiplier;
  const PS_TARGET_ATR_MULT   = c.target_exit_atr_multiplier;
  const PS_PATTERN_WEIGHT    = c.pattern_strength_confidence_weight;
  const PS_RSI_WEIGHT        = c.rsi_neutrality_confidence_weight;
  const PS_ADX_SCORE_RATE    = c.adx_slope_confidence_rate;
  const PS_MAX_ADX_BONUS     = c.adx_slope_confidence_bonus_max;
  const PS_HIGH_VOL_BONUS    = c.high_volume_confidence_bonus;

  // ── Guard: Parse candles ─────────────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < 30) {
    console.log(`${LOG_PREFIX} Insufficient candle data (${ohlc.length} < 30). Skipping.`);
    setNullReason('insufficient_data');
    return null;
  }

  // ── Condition 1: Pattern must be MORNING_STAR / BUY ──────────────────────
  if (!patternSignal || patternSignal.pattern !== 'MORNING_STAR' || patternSignal.direction !== 'BUY') {
    setNullReason('no_pattern');
    return null;
  }

  // ── Condition 2: Minimum pattern strength ────────────────────────────────
  if (patternSignal.strength < 0.50) {  // Crypto-calibrated (Batch 18H): 0.55 → 0.50
    console.log(`${LOG_PREFIX} Pattern strength ${patternSignal.strength.toFixed(3)} < 0.50. Skipping.`);
    setNullReason('weak_pattern');
    return null;
  }

  // ── Condition 3: RSI in neutral zone [40, 60] ────────────────────────────
  const rsi = calculateRSI(ohlc, 14);
  if (rsi < PS_RSI_LOW || rsi > PS_RSI_HIGH) {
    console.log(`${LOG_PREFIX} RSI ${rsi.toFixed(2)} outside [${PS_RSI_LOW}, ${PS_RSI_HIGH}]. Skipping.`);
    setNullReason('indicator_filter');
    return null;
  }

  // ── Condition 4: ADX slope -- two consecutive positive slopes >= 0.5 ─────
  const adxSeries = calculateADXSeries(ohlc, 14);
  if (adxSeries.length < 3) {
    console.log(`${LOG_PREFIX} ADX series too short (${adxSeries.length} < 3). Skipping.`);
    setNullReason('insufficient_data');
    return null;
  }

  const adxCurrent = adxSeries[adxSeries.length - 1];
  const adxPrev    = adxSeries[adxSeries.length - 2];
  const adxPrevPrev = adxSeries[adxSeries.length - 3];

  const slope1 = adxCurrent - adxPrev;
  const slope2 = adxPrev - adxPrevPrev;

  if (slope1 < PS_ADX_SLOPE_MIN || slope2 < PS_ADX_SLOPE_MIN) {
    console.log(
      `${LOG_PREFIX} ADX slope check failed: slope1=${slope1.toFixed(3)}, slope2=${slope2.toFixed(3)} ` +
      `(min=${PS_ADX_SLOPE_MIN}). Skipping.`
    );
    setNullReason('indicator_filter');
    return null;
  }

  // ── Condition 5: Volume confirmation ─────────────────────────────────────
  // B3.1b: skip entirely when disabled for this asset class (xstock_spot — the
  // ws-equities volume is the underlying equity's, not the token's).
  const avgVolume = calculateAvgVolume(ohlc, 20);
  const currentVolume = ohlc[ohlc.length - 1].volume;
  if (PS_VOL_CONFIRM && (avgVolume === 0 || currentVolume < avgVolume * PS_VOL_MULT)) {
    console.log(
      `${LOG_PREFIX} Volume check failed: currentVol=${currentVolume.toFixed(2)}, ` +
      `avgVol=${avgVolume.toFixed(2)}, threshold=${(avgVolume * PS_VOL_MULT).toFixed(2)}. Skipping.`
    );
    setNullReason('volume_insufficient');
    return null;
  }

  // ── Compute effective ATR ────────────────────────────────────────────────
  const effectiveATR = getEffectiveATR(ohlc, currentPrice);
  if (effectiveATR === null) {
    console.log(`${LOG_PREFIX} ATR guard failed (ATR too small or zero). Skipping.`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Price calculations ───────────────────────────────────────────────────
  const entryPrice = currentPrice * 1.001;

  // Morning star low = min of last 3 candle lows
  const morningStarLow = Math.min(
    ohlc[ohlc.length - 1].low,
    ohlc[ohlc.length - 2].low,
    ohlc[ohlc.length - 3].low
  );

  // Stop: max of (morning star low, entry - 1.5 * ATR) -- picks tighter stop for BUY
  const atrBasedStop = entryPrice - PS_STOP_ATR_MULT * effectiveATR;
  const stopPrice = Math.max(morningStarLow, atrBasedStop);

  const targetPrice = entryPrice + PS_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
  const gate = getPerClassTargetGate(assetClass);
  const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
  recordGuardEval('pivot_shift', _gr.rr, _gr.pass, _gr.dropReason);
  if (!_gr.pass) {
    console.log(`${LOG_PREFIX} Global guards failed. Skipping.`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Confidence calculation ───────────────────────────────────────────────
  const patternScore = patternSignal.strength * PS_PATTERN_WEIGHT;
  const rsiScore = (1 - Math.abs(rsi - 50) / 50) * PS_RSI_WEIGHT;
  const adxSlope = adxCurrent - adxPrev;
  const adxSlopeScore = Math.max(0, Math.min(PS_MAX_ADX_BONUS, adxSlope * PS_ADX_SCORE_RATE));
  const volumeBonus = (currentVolume >= avgVolume * 2.0) ? PS_HIGH_VOL_BONUS : 0;

  // Cap confidence at 0.93 for pivot shift (spec constraint)
  const rawConfidence = patternScore + rsiScore + adxSlopeScore + volumeBonus;
  const confidence = Math.max(0, Math.min(0.93, rawConfidence));

  // ── Build and return signal ──────────────────────────────────────────────
  console.log(
    `${LOG_PREFIX} SIGNAL | entry=${entryPrice.toFixed(4)} stop=${stopPrice.toFixed(4)} ` +
    `target=${targetPrice.toFixed(4)} conf=${confidence.toFixed(3)} | ` +
    `rsi=${rsi.toFixed(2)} adxSlope=${adxSlope.toFixed(3)} adxCurrent=${adxCurrent.toFixed(2)} ` +
    `currentVol=${currentVolume.toFixed(2)} avgVol=${avgVolume.toFixed(2)} ` +
    `morningStarLow=${morningStarLow.toFixed(4)}`
  );

  return {
    symbol: '',  // Populated by caller
    strategy: STRATEGY_KEY as any,
    entryPrice,
    stopPrice,
    targetPrice,
    confidence,
    metadata: {
      directive: '12.3.2',
      type: 'HYBRID',
      direction: 'BUY',
      patternStrength: patternSignal.strength,
      rsi,
      adxCurrent,
      adxPrev,
      adxPrevPrev,
      adxSlope,
      slope2,
      morningStarLow,
      currentVolume,
      avgVolume,
      effectiveATR,
      patternScore,
      rsiScore,
      adxSlopeScore,
      volumeBonus,
    },
  };
}

// Default export for strategy module resolution
export const detect = detectPivotShift;
