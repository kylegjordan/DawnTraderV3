/**
 * Directive 11.0E — Score Calculator Utilities
 * 
 * Centralized FinalScore and RegimeWeight calculation functions.
 * Used by SQE backfill for dynamic recalculation when values are missing.
 * 
 * DIRECTIVE 11.0E: All legacy metrics (NGC, CWQI, ProfitRate) have been REMOVED.
 * FinalScore and RegimeWeight are the sole determinants for signal quality.
 */

import { SCORE_WEIGHTS } from '../../config/score-weights.config.js';

export interface SignalMetrics {
  hybridScore?: number;
  confidence?: number;
  regimeWeight?: number;
  decayPenalty?: number;
  volatility?: number;
  volume24h?: number;
  trendStrength?: number;
}

/**
 * Calculate FinalScore using centralized SCORE_WEIGHTS
 * Formula: hybridScore × 0.4 + confidence × 0.3 + regimeWeight × 0.2 - decayPenalty × 0.1
 * 
 * DIRECTIVE 11.0E: No NGC fallback - uses confidence directly
 */
export function calculateFinalScore(metrics: SignalMetrics): number {
  const W = SCORE_WEIGHTS.FINAL_SCORE;
  
  const hybridScore = metrics.hybridScore ?? metrics.confidence ?? 0.5;
  const confidence = metrics.confidence ?? 0.5;
  const regimeWeight = metrics.regimeWeight ?? 0.5;
  const decayPenalty = metrics.decayPenalty ?? 0;
  
  const finalScore = 
    hybridScore * W.HYBRID +
    confidence * W.CONFIDENCE +
    regimeWeight * W.REGIME -
    decayPenalty * W.DECAY;
  
  return Math.max(0, Math.min(1, finalScore));
}

/**
 * Calculate RegimeWeight from signal metrics
 * Based on trend strength and volatility indicators
 */
export function calculateRegimeWeight(metrics: SignalMetrics): number {
  const trendStrength = metrics.trendStrength ?? 0.5;
  const volatility = metrics.volatility ?? 0.5;
  
  const normalizedVolatility = Math.min(1, volatility);
  const trendScore = Math.min(1, trendStrength);
  
  const regimeWeight = (trendScore * 0.7) + ((1 - normalizedVolatility) * 0.3);
  
  return Math.max(0.1, Math.min(1, regimeWeight));
}
