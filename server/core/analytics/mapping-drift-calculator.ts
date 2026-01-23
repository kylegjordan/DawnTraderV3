/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F — Mapping Drift Calculator
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Computes DriftScore using weighted Euclidean distance between actual and
 * ideal regime conditions. Applies EMA smoothing for temporal stability.
 * 
 * Schema Version: regime-mapping/v1.4b
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { DRIFT_CANONICAL, type DriftCanonicalEntry } from '../../config/drift-definitions';
import { getDriftDescription, getDriftLabel, getDriftColor, type DriftDescription } from '../../config/drift-descriptions';

/**
 * Exponential Moving Average smoothing utility
 * @param values Array of values to smooth
 * @param alpha Smoothing factor (0-1, higher = more weight to recent values)
 * @returns EMA-smoothed array
 */
export function ema(values: number[], alpha: number = 0.4): number[] {
  if (values.length === 0) return [];
  
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

export interface DriftScoreResult {
  score: number;
  regime: string;
  actualVolZ: number;
  actualTrendZ: number;
  idealVolZ: number;
  idealTrendZ: number;
  volContribution: number;
  trendContribution: number;
  description: DriftDescription;
  label: string;
  color: string;
}

/**
 * Computes the DriftScore for a strategy operating under a given regime.
 * 
 * Uses weighted Euclidean distance:
 *   DriftScore = sqrt(weightVol * (dVol)² + weightTrend * (dTrend)²)
 * 
 * Where:
 *   dVol = smoothedVol - idealVolZ
 *   dTrend = smoothedTrend - idealTrendZ
 * 
 * @param actualVolZ Array of recent volatility Z-scores
 * @param actualTrendZ Array of recent trend Z-scores
 * @param regime The canonical regime being evaluated
 * @returns DriftScore result with detailed breakdown
 */
export function computeDriftScore(
  actualVolZ: number[],
  actualTrendZ: number[],
  regime: string
): DriftScoreResult {
  const ideal = DRIFT_CANONICAL[regime];
  
  if (!ideal) {
    return {
      score: 0,
      regime,
      actualVolZ: 0,
      actualTrendZ: 0,
      idealVolZ: 0,
      idealTrendZ: 0,
      volContribution: 0,
      trendContribution: 0,
      description: getDriftDescription(0),
      label: 'Unknown',
      color: '#6b7280'
    };
  }
  
  const smoothedVol = ema(actualVolZ, 0.4).at(-1) ?? actualVolZ.at(-1) ?? 0;
  const smoothedTrend = ema(actualTrendZ, 0.4).at(-1) ?? actualTrendZ.at(-1) ?? 0;
  
  const dVol = smoothedVol - ideal.idealVolZ;
  const dTrend = smoothedTrend - ideal.idealTrendZ;
  
  const volContribution = ideal.weightVol * (dVol ** 2);
  const trendContribution = ideal.weightTrend * (dTrend ** 2);
  
  const rawScore = Math.sqrt(volContribution + trendContribution);
  
  const score = Math.min(Math.max(rawScore, 0), 3);
  
  return {
    score: parseFloat(score.toFixed(4)),
    regime,
    actualVolZ: parseFloat(smoothedVol.toFixed(4)),
    actualTrendZ: parseFloat(smoothedTrend.toFixed(4)),
    idealVolZ: ideal.idealVolZ,
    idealTrendZ: ideal.idealTrendZ,
    volContribution: parseFloat(volContribution.toFixed(4)),
    trendContribution: parseFloat(trendContribution.toFixed(4)),
    description: getDriftDescription(score),
    label: getDriftLabel(score),
    color: getDriftColor(score)
  };
}

/**
 * Batch compute drift scores for multiple strategies/pairs
 */
export function computeBatchDriftScores(
  entries: Array<{
    id: string;
    regime: string;
    volZHistory: number[];
    trendZHistory: number[];
  }>
): Map<string, DriftScoreResult> {
  const results = new Map<string, DriftScoreResult>();
  
  for (const entry of entries) {
    const result = computeDriftScore(entry.volZHistory, entry.trendZHistory, entry.regime);
    results.set(entry.id, result);
  }
  
  return results;
}

/**
 * Get aggregate drift statistics for a set of results
 */
export function aggregateDriftStats(results: DriftScoreResult[]): {
  avgScore: number;
  maxScore: number;
  minScore: number;
  alignedCount: number;
  driftedCount: number;
  distribution: Record<string, number>;
} {
  if (results.length === 0) {
    return {
      avgScore: 0,
      maxScore: 0,
      minScore: 0,
      alignedCount: 0,
      driftedCount: 0,
      distribution: {}
    };
  }
  
  const scores = results.map(r => r.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  
  const alignedCount = results.filter(r => r.score <= 0.8).length;
  const driftedCount = results.filter(r => r.score > 1.5).length;
  
  const distribution: Record<string, number> = {};
  for (const result of results) {
    distribution[result.label] = (distribution[result.label] || 0) + 1;
  }
  
  return {
    avgScore: parseFloat(avgScore.toFixed(4)),
    maxScore: parseFloat(maxScore.toFixed(4)),
    minScore: parseFloat(minScore.toFixed(4)),
    alignedCount,
    driftedCount,
    distribution
  };
}
