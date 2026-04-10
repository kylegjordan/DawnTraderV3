/**
 * Directive 11.0E — Score Calculator Utilities
 * Directive 11.7C — PredictiveConfidence Integration
 * 
 * Centralized FinalScore and RegimeWeight calculation functions.
 * Used by SQE backfill for dynamic recalculation when values are missing.
 * 
 * FinalScore and RegimeWeight are the sole determinants for signal quality.
 * 
 * DIRECTIVE 11.7C: Adds PredictiveConfidence derived from VTS telemetry
 * to drive dynamic ROI thresholding across VTS, SQE, DSS, and RTB.
 */

import { SCORE_WEIGHTS } from '../../config/score-weights.config.js';
import { getRegimePerformance, getVTSTelemetry } from '../logging/vts-telemetry.js';

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

const predictiveConfidenceCache = new Map<string, { value: number; timestamp: number }>();
const CACHE_TTL_MS = 60000;

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
  
  // Directive 11.0E: Post-SQE Safety Hook - ensure numeric integrity
  if (isNaN(finalScore) || finalScore < 0) {
    console.error('[11.0E] Invalid FinalScore computation detected', { hybridScore, confidence, regimeWeight, decayPenalty, finalScore });
    throw new Error('[11.0E] Invalid FinalScore computation');
  }
  
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

/**
 * Directive 11.7C Task 4: PredictiveConfidence Source
 * 
 * Derives PredictiveConfidence from VTS telemetry winRate for a given
 * regime × strategy combination. Uses sigmoid transformation to convert
 * winRate to confidence score, with neutral fallback (0.5) when no data.
 * 
 * Formula: confidence = sigmoid((winRate - 0.5) × 6)
 * 
 * @param symbol - Trading pair symbol (for future per-symbol tracking)
 * @param regime - Market regime (e.g., BULL_STABLE)
 * @param strategy - Strategy name (e.g., momentum_breakout)
 * @returns PredictiveConfidence bounded [0.0, 1.0]
 */
export function getPredictiveConfidence(symbol: string, regime: string, strategy: string): number {
  const cacheKey = `${regime}:${strategy}`;
  const now = Date.now();
  
  const cached = predictiveConfidenceCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.value;
  }
  
  const perf = getRegimePerformance(regime, strategy);
  if (!perf || perf.winRate == null) {
    return 0.5;
  }
  
  const confidence = sigmoid((perf.winRate - 0.5) * 6);
  const boundedConfidence = Math.min(Math.max(confidence, 0.0), 1.0);
  
  predictiveConfidenceCache.set(cacheKey, { value: boundedConfidence, timestamp: now });
  
  const telemetry = getVTSTelemetry();
  if (telemetry.regimePerformance[regime]?.[strategy]) {
    (telemetry.regimePerformance[regime][strategy] as unknown as { predictiveConfidence: number }).predictiveConfidence = boundedConfidence;
  }
  
  return boundedConfidence;
}

/**
 * Clear predictive confidence cache (for testing/telemetry refresh)
 */
export function clearPredictiveConfidenceCache(): void {
  predictiveConfidenceCache.clear();
  console.log('[11.7C][Cache] PredictiveConfidence cache cleared');
}
