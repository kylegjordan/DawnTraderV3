/**
 * ============================================================================
 * Directive 12.3.2 -- Morning Star Strategy
 * ============================================================================
 *
 * Type:      PATTERN
 * Direction: BUY only
 * Key:       morning_star
 *
 * Classic three-candle bullish reversal pattern. Requires a confirmed
 * Morning Star candlestick formation with volume confirmation and
 * price trading below SMA(20) to filter for mean-reversion setups.
 *
 * Entry: Slight premium above current price (0.1%).
 * Stop:  Below the lowest low of the star/first candle minus buffer.
 * Target: Entry + 2.5 ATR(14).
 *
 * Confidence built from pattern strength, volume surge, gap presence,
 * and candle body recovery ratio.
 * ============================================================================
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

// ============================================================================
// Strategy Constants
// ============================================================================

const MS_MIN_STRENGTH      = 0.55;   // Minimum pattern strength — Crypto-calibrated (Batch 18H): 0.60 → 0.55
const MS_VOL_MULT          = 1.2;    // Volume must be >= avgVol * this
const MS_STOP_BUFFER       = 0.003;  // 0.3% buffer below stop reference
const MS_TARGET_ATR_MULT   = 2.5;    // Target = entry + 2.5 * ATR
const MS_STRENGTH_WEIGHT   = 0.80;   // Weight for pattern strength in confidence
const MS_HIGH_VOL_BONUS    = 0.08;   // Bonus when volume >= 2x average
const MS_GAP_BONUS         = 0.07;   // Bonus when gap present in pattern
const MS_MAX_RECOVERY_BONUS = 0.05;  // Max bonus for candle body recovery ratio

const STRATEGY_KEY = 'morning_star';
const LOG_PREFIX = '[12.3.2][MORNING_STAR]';

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect a Morning Star pattern-based BUY signal.
 *
 * Requires a confirmed MORNING_STAR pattern input, price below SMA(20),
 * and volume confirmation on the third (recovery) candle.
 *
 * @param indicators - Technical indicators snapshot (currentPrice, volume, etc.)
 * @param candles    - Raw candle array from the data feed
 * @param patternSignal - Pre-detected pattern input (from pattern recogniser)
 * @returns StrategySignal if all conditions are met, null otherwise
 */
export function detectMorningStar(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null
): StrategySignal | null {
  const { currentPrice, volume } = indicators;

  // ── Guard: Parse candles ─────────────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < 20) {
    console.log(`${LOG_PREFIX} Insufficient candle data (${ohlc.length} < 20). Skipping.`);
    return null;
  }

  // ── Condition 1: Pattern must be MORNING_STAR / BUY ──────────────────────
  if (!patternSignal || patternSignal.pattern !== 'MORNING_STAR' || patternSignal.direction !== 'BUY') {
    return null;
  }

  // ── Condition 2: Minimum pattern strength ────────────────────────────────
  if (patternSignal.strength < MS_MIN_STRENGTH) {
    console.log(`${LOG_PREFIX} Pattern strength ${patternSignal.strength.toFixed(3)} < ${MS_MIN_STRENGTH}. Skipping.`);
    return null;
  }

  // ── Condition 3: Price below SMA(20) (mean-reversion filter) ─────────────
  const sma20 = calculateSMA(ohlc, 20);
  if (sma20 === 0) {
    console.log(`${LOG_PREFIX} SMA(20) could not be computed. Skipping.`);
    return null;
  }
  if (currentPrice >= sma20) {
    console.log(`${LOG_PREFIX} Price ${currentPrice} >= SMA(20) ${sma20.toFixed(4)}. Skipping.`);
    return null;
  }

  // ── Condition 4: Volume confirmation on the third candle ─────────────────
  const avgVolume = calculateAvgVolume(ohlc, 20);
  const c3Volume = ohlc[ohlc.length - 1].volume; // Last candle = recovery candle
  if (avgVolume === 0 || c3Volume < avgVolume * MS_VOL_MULT) {
    console.log(
      `${LOG_PREFIX} Volume check failed: c3Vol=${c3Volume.toFixed(2)}, ` +
      `avgVol=${avgVolume.toFixed(2)}, threshold=${(avgVolume * MS_VOL_MULT).toFixed(2)}. Skipping.`
    );
    return null;
  }

  // ── Compute effective ATR ────────────────────────────────────────────────
  const effectiveATR = getEffectiveATR(ohlc, currentPrice);
  if (effectiveATR === null) {
    console.log(`${LOG_PREFIX} ATR guard failed (ATR too small or zero). Skipping.`);
    return null;
  }

  // ── Price calculations ───────────────────────────────────────────────────
  const entryPrice = currentPrice * 1.001;

  // Stop below the lowest low of the star candle (c2) and the first candle (c1)
  const c2Low = ohlc[ohlc.length - 2].low; // Star candle
  const c1Low = ohlc[ohlc.length - 3].low; // First bearish candle
  const stopPrice = Math.min(c2Low, c1Low) * (1 - MS_STOP_BUFFER);

  const targetPrice = entryPrice + MS_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR)) {
    console.log(`${LOG_PREFIX} Global guards failed. Skipping.`);
    return null;
  }

  // ── Confidence calculation ───────────────────────────────────────────────
  const baseConfidence = patternSignal.strength * MS_STRENGTH_WEIGHT;
  const volumeBonus = (c3Volume >= avgVolume * 2.0) ? MS_HIGH_VOL_BONUS : 0;
  const gapBonus = patternSignal.metadata?.hasGap ? MS_GAP_BONUS : 0;
  const recoveryRatio = patternSignal.metadata?.recoveryRatio || 0;
  const recoveryBonus = Math.min(MS_MAX_RECOVERY_BONUS, recoveryRatio * 0.05);

  const confidence = clampConfidence(baseConfidence + volumeBonus + gapBonus + recoveryBonus);

  // ── Build and return signal ──────────────────────────────────────────────
  console.log(
    `${LOG_PREFIX} SIGNAL | entry=${entryPrice.toFixed(4)} stop=${stopPrice.toFixed(4)} ` +
    `target=${targetPrice.toFixed(4)} conf=${confidence.toFixed(3)} | ` +
    `strength=${patternSignal.strength.toFixed(3)} volBonus=${volumeBonus.toFixed(2)} ` +
    `gapBonus=${gapBonus.toFixed(2)} recoveryBonus=${recoveryBonus.toFixed(3)}`
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
      type: 'PATTERN',
      direction: 'BUY',
      patternStrength: patternSignal.strength,
      sma20,
      c3Volume,
      avgVolume,
      effectiveATR,
      c2Low,
      c1Low,
      volumeBonus,
      gapBonus,
      recoveryBonus,
      hasGap: !!patternSignal.metadata?.hasGap,
      recoveryRatio,
    },
  };
}

// Default export for strategy module resolution
export const detect = detectMorningStar;
