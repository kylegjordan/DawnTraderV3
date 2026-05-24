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
 * Morning Star candlestick formation with volume confirmation.
 * SMA(20) context used as confidence factor (bonus if below, penalty if above)
 * rather than a hard gate (Batch 41 relaxation).
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
import type { AssetClass } from '@shared/asset-classes';
import {
  calculateATR, calculateRSI, calculateSMA, calculateAvgVolume, calculateMomentum,
  minMomentum, calculateADXSeries, calculateADX, calculateReturnStdDev,
  volatilityPercentile, countMomentumInversions, spearmanRankCorrelation,
  getEffectiveATR, applyGlobalGuards, clampConfidence, parseCandles,
  findLocalMinima, GLOBAL_CONSTANTS,
  type OHLCCandle, type PatternInput
} from './strategy-helpers';
import { setNullReason } from '../utils/null-reason-tracker.js';
import { getCachedNumberRequired, getCachedNumbersForModule } from '../services/module-constants-service.js';

// ============================================================================
// Strategy Constants
// ============================================================================
// B72 (2026-05-05): the |DBS| >= 0.35 mutual-exclusion guards below now read
// from module_constants ('strategy_dbs_routing_guards' / 'dbs_min_threshold').
// Group migrated atomically with strong_bull_trend, defensive_hedge,
// reverse_impulse. See server/tests/integration/b72-dbs-routing-guards-consistency.test.ts.

// B72 (2026-05-05): all strategy levers moved to module='strategy.morning_star'.
// MS_STOP_BUFFER (0.003) remains hardcoded — KEEP per LEVER_INVENTORY (geometric buffer).
const MS_STOP_BUFFER       = 0.003;

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
  patternSignal: PatternInput | null,
  assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
): StrategySignal | null {
  const { currentPrice, volume } = indicators;

  // B72: bulk read all strategy levers from module_constants.
  // B79.0n.STRATEGY: per-class resolver scope.
  const c = getCachedNumbersForModule('strategy.morning_star', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  const MS_MIN_STRENGTH      = c.min_pattern_strength;
  const MS_VOL_MULT          = c.volume_threshold_multiplier;
  const MS_TARGET_ATR_MULT   = c.target_exit_atr_multiplier;
  const MS_STRENGTH_WEIGHT   = c.pattern_strength_confidence_weight;
  const MS_HIGH_VOL_BONUS    = c.high_volume_confidence_bonus;
  const MS_GAP_BONUS         = c.gap_presence_confidence_bonus;
  const MS_MAX_RECOVERY_BONUS = c.recovery_ratio_confidence_bonus_max;

  // B63 + B72: Belt-and-braces for Path D LONG-only leak.
  // Threshold sourced from module_constants (group with strong_bull_trend).
  // B79.0n.STRATEGY: per-class resolver scope (dbs_min_threshold value is class-invariant
  // per pre-audit §4 — 0.35 same crypto/xStock; tightening for shape consistency).
  const dbsGuardThreshold = getCachedNumberRequired(
    'strategy_dbs_routing_guards',
    'dbs_min_threshold',
    { exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*' },
  );
  if (((indicators as any).dbsScore ?? 0) >= dbsGuardThreshold) {
    setNullReason('b63_strong_dbs_exclusion');
    return null;
  }

  // B63 Item 10: Counter-trend LONG guard (mirror-defect fix). morning_star is LONG-only
  // and opens on reversal setups; firing on strong NEGATIVE DBS pairs means entering LONG
  // against a strong downtrend — this is the mirror of the positive-DBS leak and produced
  // 22 losing trades in the B62 72h window per BATCH_63_COUNTERFACTUAL_AUDIT. Block here.
  if (((indicators as any).dbsScore ?? 0) <= -dbsGuardThreshold) {
    setNullReason('b63b_counter_trend_long_exclusion');
    return null;
  }

  // ── Guard: Parse candles ─────────────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < 20) {
    console.log(`${LOG_PREFIX} Insufficient candle data (${ohlc.length} < 20). Skipping.`);
    setNullReason('insufficient_data');
    return null;
  }

  // ── Condition 1: Pattern must be MORNING_STAR / BUY ──────────────────────
  if (!patternSignal || patternSignal.pattern !== 'MORNING_STAR' || patternSignal.direction !== 'BUY') {
    setNullReason('no_pattern');
    return null;
  }

  // ── Condition 2: Minimum pattern strength ────────────────────────────────
  if (patternSignal.strength < MS_MIN_STRENGTH) {
    console.log(`${LOG_PREFIX} Pattern strength ${patternSignal.strength.toFixed(3)} < ${MS_MIN_STRENGTH}. Skipping.`);
    setNullReason('weak_pattern');
    return null;
  }

  // ── Condition 3: SMA(20) context (Batch 41: hard gate → confidence factor) ──
  // Industry practice: SMA below is downtrend context, not a universal hard gate.
  // Morning Star pattern itself already implies reversal from a downtrend.
  const sma20 = calculateSMA(ohlc, 20);
  const belowSMA = sma20 > 0 && currentPrice < sma20;
  // Confidence bonus/penalty applied in confidence calculation below

  // ── Condition 4: Volume assessment (soft factor, not hard gate) ──────────
  // B57: Converted from hard gate to confidence factor. Morning star reversals
  // are driven by the 3-candle structure, not volume spikes. Volume now
  // influences confidence score instead of blocking the trade.
  const avgVolume = calculateAvgVolume(ohlc, 20);
  const c3Volume = ohlc[ohlc.length - 1].volume; // Last candle = recovery candle
  const volumeRatio = avgVolume > 0 ? c3Volume / avgVolume : 0;
  if (avgVolume > 0) {
    console.log(
      `${LOG_PREFIX} Volume ratio: c3Vol=${c3Volume.toFixed(2)}, ` +
      `avgVol=${avgVolume.toFixed(2)}, ratio=${volumeRatio.toFixed(2)}x (soft factor)`
    );
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

  // Stop below the lowest low of the star candle (c2) and the first candle (c1)
  const c2Low = ohlc[ohlc.length - 2].low; // Star candle
  const c1Low = ohlc[ohlc.length - 3].low; // First bearish candle
  const stopPrice = Math.min(c2Low, c1Low) * (1 - MS_STOP_BUFFER);

  const targetPrice = entryPrice + MS_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR)) {
    console.log(`${LOG_PREFIX} Global guards failed. Skipping.`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Confidence calculation ───────────────────────────────────────────────
  const baseConfidence = patternSignal.strength * MS_STRENGTH_WEIGHT;
  // B57: Graduated volume factor
  const volumeBonus = volumeRatio >= 2.0 ? MS_HIGH_VOL_BONUS
    : volumeRatio >= 1.2 ? 0.04
    : volumeRatio >= 0.8 ? 0
    : -0.04;
  const gapBonus = patternSignal.metadata?.hasGap ? MS_GAP_BONUS : 0;
  const recoveryRatio = patternSignal.metadata?.recoveryRatio || 0;
  const recoveryBonus = Math.min(MS_MAX_RECOVERY_BONUS, recoveryRatio * 0.05);
  // Batch 41: SMA context as confidence factor — bonus if below SMA (downtrend), penalty if above
  const smaContextBonus = belowSMA ? 0.05 : -0.08;

  const confidence = clampConfidence(baseConfidence + volumeBonus + gapBonus + recoveryBonus + smaContextBonus);

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
