/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 14 — Directional Bias Score (DBS) Calculator
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Computes directional bias at pair-level and global-level.
 *
 * DBS Formula (pair-level):
 *   DBS = w1 * slope(log(price), N) + w2 * normalized_return(N) + w3 * EMA_trend_alignment
 *
 * Where:
 *   - slope(log(price), N): Linear regression slope of log(close) over N candles,
 *     normalized by ATR for cross-pair comparability
 *   - normalized_return(N): (close[N] - close[0]) / close[0], normalized to [-1,1]
 *   - EMA_trend_alignment: sign(EMA_fast - EMA_slow) * |EMA_fast - EMA_slow| / ATR
 *
 * Output clamped to [-1.0, +1.0]
 *
 * Global DBS:
 *   Weighted median of pair DBS scores, weighted by 24h volume.
 *
 * Confidence Modifier:
 *   Opposing bias dampens confidence (0.70-0.85x)
 *   Aligning bias amplifies confidence (1.05-1.15x)
 *   Neutral = 1.0x
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData } from '../../types/market-regime.types';
import type {
  DirectionalBiasCategory,
  DirectionalBiasResult,
  GlobalDirectionalBias,
  DBSConfig,
  BiasConfidenceModifier,
} from '../../types/directional-bias.types';
import {
  DEFAULT_DBS_CONFIG,
  DEFAULT_BIAS_CONFIDENCE_MODIFIER,
  DIRECTIONAL_BIAS_CATEGORIES,
  GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT,
} from '../../types/directional-bias.types';

// ─── Pair-Level DBS ─────────────────────────────────────────────────────────

/**
 * Compute Directional Bias Score for a single pair from OHLC data.
 *
 * @param ohlcData - OHLC candles (most recent last)
 * @param atr - Average True Range (from MCE, for normalization)
 * @param config - DBS configuration (weights, thresholds, lookback)
 * @returns DirectionalBiasResult with score, category, and component breakdown
 */
export function computeDirectionalBias(
  ohlcData: OHLCData[],
  atr: number,
  config: DBSConfig = DEFAULT_DBS_CONFIG
): DirectionalBiasResult {
  const { weights, thresholds, lookbackPeriod, emaPeriods } = config;

  // Need minimum data for calculation
  if (ohlcData.length < Math.max(lookbackPeriod, emaPeriods.slow + 1) || atr <= 0) {
    return {
      score: 0,
      category: 'NEUTRAL',
      sentinelZero: true,
      components: { slopeComponent: 0, returnComponent: 0, emaComponent: 0 }
    };
  }

  const recentData = ohlcData.slice(-lookbackPeriod);
  const closes = recentData.map(c => c.close);

  // ── Component 1: Log-price slope normalized by ATR ──
  const logPrices = closes.map(p => Math.log(Math.max(p, 1e-10)));
  const slope = linearRegressionSlope(logPrices);
  // Normalize by ATR: slope per candle relative to average range
  const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length;
  const normalizedSlope = avgPrice > 0 ? (slope * avgPrice) / atr : 0;
  const slopeComponent = clamp(normalizedSlope * weights.slopeWeight, -weights.slopeWeight, weights.slopeWeight);

  // ── Component 2: Normalized return ──
  const startPrice = closes[0];
  const endPrice = closes[closes.length - 1];
  const rawReturn = startPrice > 0 ? (endPrice - startPrice) / startPrice : 0;
  // Normalize to roughly [-1, 1] range (10% move maps to ~1.0)
  const normalizedReturn = clamp(rawReturn * 10, -1, 1);
  const returnComponent = normalizedReturn * weights.returnWeight;

  // ── Component 3: EMA trend alignment ──
  const allCloses = ohlcData.map(c => c.close);
  const emaFast = computeEMA(allCloses, emaPeriods.fast);
  const emaSlow = computeEMA(allCloses, emaPeriods.slow);
  const emaDiff = emaFast - emaSlow;
  // Normalize by ATR for cross-pair comparability
  const emaAlignment = atr > 0 ? clamp(emaDiff / atr, -1, 1) : 0;
  const emaComponent = emaAlignment * weights.emaWeight;

  // ── Combine and clamp ──
  const rawScore = slopeComponent + returnComponent + emaComponent;
  const score = clamp(rawScore, -1.0, 1.0);

  const category = classifyDBS(score, thresholds);

  return {
    score,
    category,
    sentinelZero: false,
    components: {
      slopeComponent,
      returnComponent,
      emaComponent
    }
  };
}

// ─── Global DBS ─────────────────────────────────────────────────────────────

/**
 * Compute global directional bias as weighted median of pair DBS scores.
 *
 * @param pairScores - Map of symbol -> DBS score
 * @param volumes - Map of symbol -> 24h volume (for weighting)
 * @returns GlobalDirectionalBias
 */
/**
 * Compute global directional bias as weighted median of pair DBS scores.
 * B62: Filters sentinel-zero entries, applies configurable per-pair weight cap.
 *
 * @param pairScores - Map of symbol -> DBS score
 * @param volumes - Map of symbol -> 24h volume (for weighting)
 * @param sentinelFlags - Map of symbol -> sentinelZero boolean (B62: filter these out)
 * @returns GlobalDirectionalBias
 */
export function computeGlobalDirectionalBias(
  pairScores: Map<string, number>,
  volumes: Map<string, number>,
  config: DBSConfig = DEFAULT_DBS_CONFIG,
  sentinelFlags?: Map<string, boolean>
): GlobalDirectionalBias {
  if (pairScores.size === 0) {
    return {
      score: 0,
      category: 'NEUTRAL',
      pairCount: 0,
      distribution: emptyDistribution()
    };
  }

  // Build weighted entries, filtering sentinel zeros
  const entries: { symbol: string; score: number; weight: number }[] = [];
  const distribution: Record<DirectionalBiasCategory, number> = emptyDistribution();

  for (const [symbol, score] of pairScores.entries()) {
    // B62 A.3 fix #3: exclude sentinel-zero pairs from global aggregation
    if (sentinelFlags?.get(symbol) === true) {
      continue;
    }
    const volume = volumes.get(symbol) ?? 1;
    entries.push({ symbol, score, weight: volume });
    const cat = classifyDBS(score, config.thresholds);
    distribution[cat]++;
  }

  if (entries.length === 0) {
    return {
      score: 0,
      category: 'NEUTRAL',
      pairCount: 0,
      distribution: emptyDistribution()
    };
  }

  // B62: Apply per-pair weight cap (GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT)
  if (GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT < 1.0) {
    const totalRawWeight = entries.reduce((sum, e) => sum + e.weight, 0);
    const maxWeight = totalRawWeight * GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT;
    for (const entry of entries) {
      if (entry.weight > maxWeight) {
        entry.weight = maxWeight;
      }
    }
  }

  // Weighted median
  entries.sort((a, b) => a.score - b.score);
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  const halfWeight = totalWeight / 2;

  let cumWeight = 0;
  let globalScore = 0;
  for (const entry of entries) {
    cumWeight += entry.weight;
    if (cumWeight >= halfWeight) {
      globalScore = entry.score;
      break;
    }
  }

  const globalCategory = classifyDBS(globalScore, config.thresholds);

  return {
    score: globalScore,
    category: globalCategory,
    pairCount: entries.length,
    distribution
  };
}

// ─── Confidence Modifier ────────────────────────────────────────────────────

/**
 * Compute the confidence multiplier based on directional bias alignment.
 *
 * All DawnTrader strategies are currently LONG-only.
 * - UP bias aligns with long strategies -> slight boost
 * - DOWN bias opposes long strategies -> dampening
 * - NEUTRAL -> no change
 *
 * @param biasCategory - The directional bias category
 * @param modifierConfig - Modifier ranges
 * @returns Confidence multiplier (0.70 - 1.15)
 */
export function computeBiasConfidenceModifier(
  biasCategory: DirectionalBiasCategory,
  modifierConfig: BiasConfidenceModifier = DEFAULT_BIAS_CONFIDENCE_MODIFIER
): number {
  switch (biasCategory) {
    // Aligning (upward bias for long-only system)
    case 'UP_STRONG':
      return modifierConfig.aligning.max; // 1.15
    case 'UP_MODERATE':
      return (modifierConfig.aligning.min + modifierConfig.aligning.max) / 2; // 1.10
    case 'UP_WEAK':
      return modifierConfig.aligning.min; // 1.05

    // Neutral
    case 'NEUTRAL':
      return modifierConfig.neutral; // 1.0

    // Opposing (downward bias for long-only system)
    case 'DOWN_WEAK':
      return modifierConfig.opposing.max; // 0.85
    case 'DOWN_MODERATE':
      return (modifierConfig.opposing.min + modifierConfig.opposing.max) / 2; // 0.775
    case 'DOWN_STRONG':
      return modifierConfig.opposing.min; // 0.70

    default:
      return 1.0;
  }
}

// ─── Classification ─────────────────────────────────────────────────────────

/**
 * Classify a DBS score into one of 7 categories.
 */
export function classifyDBS(
  score: number,
  thresholds = DEFAULT_DBS_CONFIG.thresholds
): DirectionalBiasCategory {
  if (score >= thresholds.upStrong) return 'UP_STRONG';
  if (score >= thresholds.upModerate) return 'UP_MODERATE';
  if (score >= thresholds.upWeak) return 'UP_WEAK';
  if (score <= thresholds.downStrong) return 'DOWN_STRONG';
  if (score <= thresholds.downModerate) return 'DOWN_MODERATE';
  if (score <= thresholds.downWeak) return 'DOWN_WEAK';
  return 'NEUTRAL';
}

// ─── Math Helpers ───────────────────────────────────────────────────────────

/**
 * Linear regression slope for an array of values.
 * Returns the slope (change per index).
 */
function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Compute Exponential Moving Average.
 * Returns the final EMA value.
 */
function computeEMA(prices: number[], period: number): number {
  if (prices.length < period) {
    // Not enough data, return SMA
    const slice = prices.slice(-Math.min(prices.length, period));
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  const multiplier = 2 / (period + 1);

  // Initialize with SMA of first 'period' values
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Apply EMA formula
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Create empty distribution record.
 */
function emptyDistribution(): Record<DirectionalBiasCategory, number> {
  return {
    UP_STRONG: 0,
    UP_MODERATE: 0,
    UP_WEAK: 0,
    NEUTRAL: 0,
    DOWN_WEAK: 0,
    DOWN_MODERATE: 0,
    DOWN_STRONG: 0
  };
}
