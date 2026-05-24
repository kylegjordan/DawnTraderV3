/**
 * ============================================================================
 * Directive 12.3.2 -- Support Bounce Strategy
 * ============================================================================
 *
 * Type:      PATTERN
 * Direction: BUY only
 * Key:       support_bounce
 *
 * Identifies horizontal support levels from clustered local minima, then
 * fires a BUY signal when price bounces off a valid support zone with
 * volume confirmation. PINBAR pattern is a confidence bonus, not a hard
 * gate (Batch 41 relaxation). Any bullish candle near support qualifies.
 *
 * Support detection:
 *   1. Find local minima in last 50 candles.
 *   2. Cluster nearby lows (tolerance = max(0.5%, ATR/price * 0.5)).
 *   3. Require >= 2 touches per cluster (Batch 18H: 3 → 2).
 *   4. Select nearest valid support within 3% of current price.
 *   5. Price must be within 2.5% of support (Batch 41: 1.5% → 2.5%).
 *
 * Entry: Slight premium above current price (0.1%).
 * Stop:  Below support level minus buffer (0.5%).
 * Target: Entry + 2.0 ATR(14).
 *
 * Confidence built from pattern strength, support quality (touch count),
 * proximity to the support level, and volume surge.
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
// B72 (2026-05-05): all strategy levers moved to module='strategy.support_bounce'.
import { getCachedNumbersForModule } from '../services/module-constants-service.js';

// ============================================================================
// Strategy Constants
// ============================================================================

// B72 (2026-05-05): all strategy levers moved to module='strategy.support_bounce'.
// SB_STOP_BELOW_SUPPORT (0.005) remains hardcoded — KEEP per LEVER_INVENTORY (geometric buffer).
const SB_STOP_BELOW_SUPPORT     = 0.005;

const STRATEGY_KEY = 'support_bounce';
const LOG_PREFIX = '[12.3.2][SUPPORT_BOUNCE]';

// ============================================================================
// Support Level Identification
// ============================================================================

interface SupportCluster {
  level: number;
  touchCount: number;
}

/**
 * Identify horizontal support levels by clustering local minima.
 *
 * Steps:
 *   1. Find local minima (low < prev.low AND low < next.low).
 *   2. Sort minima ascending.
 *   3. Group minima where |a - b| / a <= tolerance.
 *   4. Cluster level = mean of grouped values.
 *   5. Filter for clusters with >= SB_MIN_TOUCHES touches.
 *
 * @param ohlc - Parsed OHLC candles
 * @param currentPrice - Current market price
 * @param effectiveATR - Clamped ATR value for dynamic tolerance
 * @returns Array of valid support clusters, sorted nearest-first
 */
function identifySupportLevels(
  ohlc: OHLCCandle[],
  currentPrice: number,
  effectiveATR: number,
  assetClass: AssetClass,  // B79.0n.STRATEGY — threaded from detectSupportBounce caller
): SupportCluster[] {
  // B72: bulk read — same module as detectSupportBounce.
  // B79.0n.STRATEGY: per-class resolver scope.
  const c = getCachedNumbersForModule('strategy.support_bounce', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  const SB_LOOKBACK_CANDLES       = c.support_level_lookback_bars;
  const SB_CLUSTER_TOLERANCE_BASE = c.support_cluster_tolerance_base;
  const SB_MIN_TOUCHES            = c.min_support_touches_required;
  const SB_MAX_DISTANCE           = c.max_support_distance_from_price;

  // Step 1: Find local minima
  const minima = findLocalMinima(ohlc, SB_LOOKBACK_CANDLES);
  if (minima.length === 0) return [];

  // Step 2: Dynamic cluster tolerance
  const tolerance = Math.max(SB_CLUSTER_TOLERANCE_BASE, (effectiveATR / currentPrice) * 0.5);

  // Step 3: Sort and cluster
  const sorted = [...minima].sort((a, b) => a - b);
  const clusters: SupportCluster[] = [];
  let clusterValues: number[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = clusterValues[clusterValues.length - 1];
    if (Math.abs(sorted[i] - prev) / prev <= tolerance) {
      clusterValues.push(sorted[i]);
    } else {
      // Finalise current cluster
      const level = clusterValues.reduce((a, b) => a + b, 0) / clusterValues.length;
      clusters.push({ level, touchCount: clusterValues.length });
      clusterValues = [sorted[i]];
    }
  }
  // Finalise last cluster
  if (clusterValues.length > 0) {
    const level = clusterValues.reduce((a, b) => a + b, 0) / clusterValues.length;
    clusters.push({ level, touchCount: clusterValues.length });
  }

  // Step 4: Filter for minimum touches and valid position (below price, within max distance)
  return clusters
    .filter(c => {
      if (c.touchCount < SB_MIN_TOUCHES) return false;
      if (c.level >= currentPrice) return false;
      const distance = (currentPrice - c.level) / c.level;
      return distance <= SB_MAX_DISTANCE;
    })
    .sort((a, b) => {
      // Nearest first (closest to current price)
      const distA = currentPrice - a.level;
      const distB = currentPrice - b.level;
      return distA - distB;
    });
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect a Support Bounce BUY signal.
 *
 * Identifies a valid horizontal support level, confirms a PINBAR bounce
 * pattern with volume surge, and generates a long entry near support.
 *
 * @param indicators - Technical indicators snapshot (currentPrice, volume, etc.)
 * @param candles    - Raw candle array from the data feed
 * @param patternSignal - Pre-detected pattern input (from pattern recogniser)
 * @returns StrategySignal if all conditions are met, null otherwise
 */
export function detectSupportBounce(
  indicators: TechnicalIndicators,
  candles: any[],
  patternSignal: PatternInput | null,
  assetClass: AssetClass,  // B79.0n.STRATEGY — REQUIRED per-class scope
): StrategySignal | null {
  const { currentPrice, volume } = indicators;

  // B72: bulk read all strategy levers from module_constants.
  // B79.0n.STRATEGY: per-class resolver scope.
  const c = getCachedNumbersForModule('strategy.support_bounce', {
    exchange: '*', assetClass, strategy: STRATEGY_KEY, regime: '*',
  });
  const SB_LOOKBACK_CANDLES       = c.support_level_lookback_bars;
  const SB_PROXIMITY              = c.min_support_proximity_required;
  const SB_VOL_MULT               = c.volume_threshold_multiplier;
  const SB_TARGET_ATR_MULT        = c.target_exit_atr_multiplier;
  const SB_PATTERN_WEIGHT         = c.pattern_strength_confidence_weight;
  const SB_SUPPORT_WEIGHT         = c.support_quality_confidence_weight;
  const SB_PROXIMITY_WEIGHT       = c.proximity_confidence_weight;
  const SB_HIGH_VOL_BONUS         = c.high_volume_confidence_bonus;

  // ── Guard: Parse candles ─────────────────────────────────────────────────
  const ohlc = parseCandles(candles);
  if (ohlc.length < SB_LOOKBACK_CANDLES) {
    console.log(`${LOG_PREFIX} Insufficient candle data (${ohlc.length} < ${SB_LOOKBACK_CANDLES}). Skipping.`);
    setNullReason('insufficient_data');
    return null;
  }

  // ── Compute effective ATR early (needed for support identification) ──────
  const effectiveATR = getEffectiveATR(ohlc, currentPrice);
  if (effectiveATR === null) {
    console.log(`${LOG_PREFIX} ATR guard failed (ATR too small or zero). Skipping.`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Condition 1: Valid support level exists ──────────────────────────────
  const supportLevels = identifySupportLevels(ohlc, currentPrice, effectiveATR, assetClass);
  if (supportLevels.length === 0) {
    console.log(`${LOG_PREFIX} No valid support level found within ${(c.max_support_distance_from_price * 100).toFixed(1)}%. Skipping.`);
    setNullReason('range_not_found');
    return null;
  }

  const nearestSupport = supportLevels[0];
  const supportLevel = nearestSupport.level;
  const touchCount = nearestSupport.touchCount;

  // ── Condition 2: Price is proximate to support ──────────────────────────
  const proximityDistance = (currentPrice - supportLevel) / supportLevel;
  if (proximityDistance > SB_PROXIMITY) {
    console.log(
      `${LOG_PREFIX} Price too far from support: distance=${(proximityDistance * 100).toFixed(3)}% > ` +
      `${(SB_PROXIMITY * 100).toFixed(1)}%. Skipping.`
    );
    setNullReason('price_position');
    return null;
  }

  // ── Condition 3: Pattern confirmation (Batch 41: PINBAR hard gate → confidence factor) ──
  // Industry practice: PINBAR at exact support is ideal but not required.
  // A bullish candle near support with volume is sufficient for a bounce setup.
  // PINBAR presence becomes a confidence bonus instead of a hard gate.
  const hasPinbar = patternSignal && patternSignal.pattern === 'PINBAR' && patternSignal.direction === 'BUY';
  const hasBullishPattern = patternSignal && patternSignal.direction === 'BUY';

  // Require at least a bullish pattern (any type) — but not specifically PINBAR
  if (!hasBullishPattern) {
    // Check if the last candle is at least bullish (close > open)
    const lastCandle = ohlc[ohlc.length - 1];
    if (lastCandle.close <= lastCandle.open) {
      setNullReason('no_pattern');
      return null;
    }
  }

  // ── Condition 4: Minimum pattern strength (if pattern provided) ──────────
  const patternStrength = patternSignal?.strength ?? 0.40; // Default if no pattern signal
  if (hasBullishPattern && patternSignal!.strength < 0.40) { // Batch 41: 0.50 → 0.40 minimum
    console.log(`${LOG_PREFIX} Pattern strength ${patternSignal!.strength.toFixed(3)} < 0.40. Skipping.`);
    setNullReason('weak_pattern');
    return null;
  }

  // ── Condition 5: Volume assessment (soft factor, not hard gate) ──────────
  // B57: Converted from hard gate to confidence factor. Support bounces are
  // driven by price level and pattern, not volume. Volume now influences
  // confidence score instead of blocking the trade.
  const avgVolume = calculateAvgVolume(ohlc, 20);
  const bounceVolume = ohlc[ohlc.length - 1].volume;
  const volumeRatio = avgVolume > 0 ? bounceVolume / avgVolume : 0;
  if (avgVolume > 0) {
    console.log(
      `${LOG_PREFIX} Volume ratio: bounceVol=${bounceVolume.toFixed(2)}, ` +
      `avgVol=${avgVolume.toFixed(2)}, ratio=${volumeRatio.toFixed(2)}x (soft factor)`
    );
  }

  // ── Price calculations ───────────────────────────────────────────────────
  const entryPrice = currentPrice * 1.001;
  const stopPrice = supportLevel * (1 - SB_STOP_BELOW_SUPPORT);
  const targetPrice = entryPrice + SB_TARGET_ATR_MULT * effectiveATR;

  // ── Global guards (ATR, stop distance, R:R) ──────────────────────────────
  if (!applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR)) {
    console.log(`${LOG_PREFIX} Global guards failed. Skipping.`);
    setNullReason('guard_fail');
    return null;
  }

  // ── Confidence calculation ───────────────────────────────────────────────
  const patternScore = patternStrength * SB_PATTERN_WEIGHT;
  const pinbarBonus = hasPinbar ? 0.05 : 0; // Batch 41: PINBAR is now a confidence bonus, not a hard gate
  const supportScore = Math.min(1.0, touchCount / 3) * SB_SUPPORT_WEIGHT;
  const proximityDenom = supportLevel * SB_PROXIMITY;
  const proximityScore = proximityDenom > 0
    ? Math.max(0, (1 - (currentPrice - supportLevel) / proximityDenom)) * SB_PROXIMITY_WEIGHT
    : 0;
  // B57: Graduated volume factor — boosts confidence for high volume, penalizes for low
  // >= 2.0x avg: +0.08 bonus (unchanged)
  // >= 1.2x avg: +0.04 bonus (above-average, good confirmation)
  // >= 0.8x avg: +0.00 (normal volume, neutral)
  // < 0.8x avg:  -0.04 penalty (below-average, weaker signal)
  const volumeBonus = volumeRatio >= 2.0 ? SB_HIGH_VOL_BONUS
    : volumeRatio >= 1.2 ? 0.04
    : volumeRatio >= 0.8 ? 0
    : -0.04;

  // Cap confidence at 0.93 for support bounce (spec constraint)
  const rawConfidence = patternScore + supportScore + proximityScore + volumeBonus + pinbarBonus;
  const confidence = Math.max(0, Math.min(0.93, rawConfidence));

  // ── Build and return signal ──────────────────────────────────────────────
  console.log(
    `${LOG_PREFIX} SIGNAL | entry=${entryPrice.toFixed(4)} stop=${stopPrice.toFixed(4)} ` +
    `target=${targetPrice.toFixed(4)} conf=${confidence.toFixed(3)} | ` +
    `support=${supportLevel.toFixed(4)} touches=${touchCount} ` +
    `proximity=${(proximityDistance * 100).toFixed(3)}% ` +
    `bounceVol=${bounceVolume.toFixed(2)} avgVol=${avgVolume.toFixed(2)}`
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
      supportLevel,
      touchCount,
      proximityDistance,
      patternStrength, // Batch 41: uses safe value (handles null patternSignal)
      bounceVolume,
      avgVolume,
      effectiveATR,
      patternScore,
      supportScore,
      proximityScore,
      volumeBonus,
    },
  };
}

// Default export for strategy module resolution
export const detect = detectSupportBounce;
