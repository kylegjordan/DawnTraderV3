/**
 * ============================================================================
 * Directive 12.3.2 -- Inside Bar Reversal Strategy
 * ============================================================================
 *
 * Type:      PATTERN
 * Direction: BUY and SELL
 * Key:       inside_bar_reversal
 *
 * Detects breakout from an inside bar (compression) pattern. When the current
 * price breaks above the parent high (BUY) or below the parent low (SELL)
 * with volume confirmation, a reversal signal is generated.
 *
 * Compression ratio filters for tight consolidation. Breakout buffer (0.2%)
 * ensures a genuine break beyond the parent range rather than noise.
 *
 * Entry: Parent high/low +/- breakout buffer.
 * Stop:  Opposite parent extreme +/- stop buffer.
 * Target: Entry +/- 2.0 ATR(14).
 *
 * Confidence built from compression quality, pattern strength, and volume.
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
import { setNullReason } from '../utils/null-reason-tracker.js';

// ============================================================================
// Strategy Constants
// ============================================================================

const IB_MAX_COMPRESSION    = 0.80;  // Maximum compression ratio — Crypto-calibrated (Batch 18H): 0.75 → 0.80
const IB_BREAKOUT_BUFFER    = 0.002; // 0.2% breakout buffer above/below parent
const IB_VOL_MULT           = 1.3;   // Batch 47: 1.5→1.3, inside bar breakouts can occur on moderate volume
const IB_STOP_BUFFER        = 0.003; // 0.3% buffer beyond parent extreme
const IB_TARGET_ATR_MULT    = 2.0;   // Target = entry +/- 2.0 * ATR
const IB_COMPRESSION_WEIGHT = 0.35;  // Weight of compression score in confidence
const IB_STRENGTH_WEIGHT    = 0.45;  // Weight of pattern strength in confidence
const IB_VOL_SCORE_RATE     = 0.10;  // Rate at which excess volume adds confidence
const IB_MAX_VOL_BONUS      = 0.20;  // Maximum volume-based confidence bonus
const IB_SELL_RSI_MIN       = 45;    // Minimum RSI for SELL (filters oversold)

const STRATEGY_KEY = 'inside_bar_reversal';
const LOG_PREFIX = '[12.3.2][INSIDE_BAR_REVERSAL]';

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect an Inside Bar breakout reversal signal (BUY or SELL).
 *
 * Requires an INSIDE_BAR pattern with tight compression, a confirmed breakout
 * beyond the parent bar's range, and volume surge on the breakout candle.
 *
 * @param indicators - Technical indicators snapshot (currentPrice, volume, etc.)
 * @param candles    - Raw candle array from the data feed
 * @param patternSignal - Pre-detected pattern input (from pattern recogniser)
 * @returns StrategySignal if all conditions are met, null otherwise
 */
export function detectInsideBarReversal(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null
): StrategySignal | null {
  const { currentPrice, volume } = indicators;

  // ── Guard: Parse candles ─────────────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < 20) {
    console.log(`${LOG_PREFIX} Insufficient candle data (${ohlc.length} < 20). Skipping.`);
    setNullReason('insufficient_data');
    return null;
  }

  // ── Condition 1: Pattern must be INSIDE_BAR ──────────────────────────────
  if (!patternSignal || patternSignal.pattern !== 'INSIDE_BAR') {
    setNullReason('no_pattern');
    return null;
  }

  // ── Extract metadata ─────────────────────────────────────────────────────
  const compressionRatio = patternSignal.metadata?.compressionRatio ?? 1.0;
  const parentHigh = patternSignal.metadata?.parentHigh ?? 0;
  const parentLow = patternSignal.metadata?.parentLow ?? 0;

  if (parentHigh === 0 || parentLow === 0) {
    console.log(`${LOG_PREFIX} Missing parentHigh/parentLow in metadata. Skipping.`);
    setNullReason('no_pattern');
    return null;
  }

  // ── Condition 2: Compression ratio must be tight ─────────────────────────
  if (compressionRatio > IB_MAX_COMPRESSION) {
    console.log(
      `${LOG_PREFIX} Compression ratio ${compressionRatio.toFixed(3)} > ${IB_MAX_COMPRESSION}. Skipping.`
    );
    setNullReason('no_pattern');
    return null;
  }

  // ── Determine direction from breakout ────────────────────────────────────
  const isBuyBreakout = currentPrice > parentHigh * (1 + IB_BREAKOUT_BUFFER);
  const isSellBreakout = currentPrice < parentLow * (1 - IB_BREAKOUT_BUFFER);

  if (!isBuyBreakout && !isSellBreakout) {
    console.log(
      `${LOG_PREFIX} No breakout detected: price=${currentPrice.toFixed(4)}, ` +
      `parentHigh=${parentHigh.toFixed(4)}, parentLow=${parentLow.toFixed(4)}. Skipping.`
    );
    setNullReason('breakout_fail');
    return null;
  }

  // Batch 45: Block SELL breakouts — system is long-only
  if (!isBuyBreakout) {
    setNullReason('sell_disabled_long_only');
    return null;
  }
  const direction: 'BUY' = 'BUY';

  // ── Condition 4: Volume confirmation on breakout candle ──────────────────
  const avgVolume = calculateAvgVolume(ohlc, 20);
  const breakoutVolume = ohlc[ohlc.length - 1].volume;
  if (avgVolume === 0 || breakoutVolume < avgVolume * IB_VOL_MULT) {
    console.log(
      `${LOG_PREFIX} Volume check failed: breakoutVol=${breakoutVolume.toFixed(2)}, ` +
      `avgVol=${avgVolume.toFixed(2)}, threshold=${(avgVolume * IB_VOL_MULT).toFixed(2)}. Skipping.`
    );
    setNullReason('volume_insufficient');
    return null;
  }

  // ── Condition 5: RSI filter ──────────────────────────────────────────────
  const rsi = calculateRSI(ohlc, 14);
  if (direction === 'BUY' && rsi >= 65) {
    console.log(`${LOG_PREFIX} BUY RSI filter: RSI=${rsi.toFixed(2)} >= 65. Skipping.`);
    setNullReason('indicator_filter');
    return null;
  }
  if (direction === 'SELL' && rsi <= IB_SELL_RSI_MIN) {
    console.log(`${LOG_PREFIX} SELL RSI filter: RSI=${rsi.toFixed(2)} <= ${IB_SELL_RSI_MIN}. Skipping.`);
    setNullReason('indicator_filter');
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
  let entryPrice: number;
  let stopPrice: number;
  let targetPrice: number;

  if (direction === 'BUY') {
    entryPrice  = parentHigh * (1 + IB_BREAKOUT_BUFFER);
    stopPrice   = parentLow * (1 - IB_STOP_BUFFER);
    targetPrice = entryPrice + IB_TARGET_ATR_MULT * effectiveATR;
  } else {
    entryPrice  = parentLow * (1 - IB_BREAKOUT_BUFFER);
    stopPrice   = parentHigh * (1 + IB_STOP_BUFFER);
    targetPrice = entryPrice - IB_TARGET_ATR_MULT * effectiveATR;
  }

  // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR)) {
    console.log(`${LOG_PREFIX} Global guards failed for ${direction}. Skipping.`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Confidence calculation ───────────────────────────────────────────────
  const compressionScore = (1 - compressionRatio) * IB_COMPRESSION_WEIGHT;
  const volumeScore = Math.min(IB_MAX_VOL_BONUS, (breakoutVolume / avgVolume - 1) * IB_VOL_SCORE_RATE);
  const strengthScore = patternSignal.strength * IB_STRENGTH_WEIGHT;

  const confidence = clampConfidence(compressionScore + volumeScore + strengthScore);

  // ── Build and return signal ──────────────────────────────────────────────
  console.log(
    `${LOG_PREFIX} ${direction} SIGNAL | entry=${entryPrice.toFixed(4)} stop=${stopPrice.toFixed(4)} ` +
    `target=${targetPrice.toFixed(4)} conf=${confidence.toFixed(3)} | ` +
    `compression=${compressionRatio.toFixed(3)} rsi=${rsi.toFixed(2)} ` +
    `breakoutVol=${breakoutVolume.toFixed(2)} avgVol=${avgVolume.toFixed(2)}`
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
      direction,
      compressionRatio,
      parentHigh,
      parentLow,
      rsi,
      breakoutVolume,
      avgVolume,
      effectiveATR,
      compressionScore,
      volumeScore,
      strengthScore,
      patternStrength: patternSignal.strength,
    },
  };
}

// Default export for strategy module resolution
export const detect = detectInsideBarReversal;
