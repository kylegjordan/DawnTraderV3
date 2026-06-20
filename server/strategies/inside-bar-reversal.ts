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
import { setNullReason } from '../utils/null-reason-tracker.js';
// B72 (2026-05-05): all strategy levers moved to module='strategy.inside_bar_reversal'.
// IB_BREAKOUT_BUFFER + IB_STOP_BUFFER remain hardcoded — KEEP per LEVER_INVENTORY (geometric buffers).
import { getCachedNumbersForModule } from '../services/module-constants-service.js';

// ============================================================================
// Strategy Constants — geometric buffers (KEEP)
// ============================================================================
const IB_BREAKOUT_BUFFER    = 0.002;
const IB_STOP_BUFFER        = 0.003;

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
  patternSignal: PatternInput | null,
  assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
): StrategySignal | null {
  const { currentPrice, volume } = indicators;

  // B72: bulk read all strategy levers from module_constants.
  // B79.0n.STRATEGY: per-class resolver scope.
  const c = getCachedNumbersForModule('strategy.inside_bar_reversal', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  const IB_MAX_COMPRESSION    = c.max_compression_ratio;
  const IB_VOL_MULT           = c.volume_threshold_multiplier;
  const IB_VOL_CONFIRM        = (c.volume_confirmation_enabled ?? 1) !== 0; // B3.1b: per-class volume toggle (xstock_spot=off)
  const IB_TARGET_ATR_MULT    = c.target_exit_atr_multiplier;
  const IB_COMPRESSION_WEIGHT = c.compression_quality_confidence_weight;
  const IB_STRENGTH_WEIGHT    = c.pattern_strength_confidence_weight;
  const IB_VOL_SCORE_RATE     = c.volume_confidence_rate;
  const IB_MAX_VOL_BONUS      = c.volume_confidence_bonus_max;
  const IB_SELL_RSI_MIN       = c.sell_rsi_min_threshold;

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
  // B3.1b: skip entirely when disabled for this asset class (xstock_spot — the
  // ws-equities volume is the underlying equity's, not the token's).
  const avgVolume = calculateAvgVolume(ohlc, 20);
  const breakoutVolume = ohlc[ohlc.length - 1].volume;
  if (IB_VOL_CONFIRM && (avgVolume === 0 || breakoutVolume < avgVolume * IB_VOL_MULT)) {
    console.log(
      `${LOG_PREFIX} Volume check failed: breakoutVol=${breakoutVolume.toFixed(2)}, ` +
      `avgVol=${avgVolume.toFixed(2)}, threshold=${(avgVolume * IB_VOL_MULT).toFixed(2)}. Skipping.`
    );
    setNullReason('volume_insufficient');
    return null;
  }

  // ── Condition 5: RSI filter ──────────────────────────────────────────────
  const rsi = calculateRSI(ohlc, 14);
  // B79.0n.STRATEGY (2026-05-24): SELL branch dead-code removed (cleanup surfaced by
  // tsc TS2367 narrowing — direction is constrained to 'BUY' literal at line 136 since
  // B79.0m.b2's LONG-only enforcement at lines 131-135 returns null for all SELL paths).
  // Pre-cleanup the SELL RSI filter at the removed line was unreachable. IB_SELL_RSI_MIN
  // module_constant retained for documentation; can be removed in Phase 16 cleanup pass.
  if (rsi >= 65) {
    console.log(`${LOG_PREFIX} BUY RSI filter: RSI=${rsi.toFixed(2)} >= 65. Skipping.`);
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

  // B79.0n.STRATEGY: SELL branch dead-code removed per tsc narrowing.
  // direction is always 'BUY' here (see line 136 explicit type annotation).
  entryPrice  = parentHigh * (1 + IB_BREAKOUT_BUFFER);
  stopPrice   = parentLow * (1 - IB_STOP_BUFFER);
  targetPrice = entryPrice + IB_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
  const gate = getPerClassTargetGate(assetClass);
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate)) {
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
