/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.9 — Score Weights Configuration
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Central, immutable source of truth for all scoring coefficients used across
 * DawnTrader's math stack. This ensures mathematical consistency between the
 * Signal Orchestrator and Ready-to-Buy Refresh Service.
 * 
 * IMPORTANT: Any changes to these weights affect both signal generation and
 * refresh scoring. Update with caution and ensure telemetry records the change.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const SCORE_WEIGHTS = Object.freeze({
  /**
   * FinalScore Composition Weights
   * 
   * Formula: finalScore = 
   *   (hybridScore × HYBRID) +
   *   (predictiveConfidence × CONFIDENCE) +
   *   (regimeWeight × REGIME) -
   *   (decayPenalty × DECAY)
   * 
   * Sum of positive weights: 0.4 + 0.3 + 0.2 = 0.9
   * Decay is subtracted, so max theoretical score = 0.9 (when decay = 0)
   */
  FINAL_SCORE: Object.freeze({
    HYBRID: 0.4,
    CONFIDENCE: 0.3,
    REGIME: 0.2,
    DECAY: 0.1
  }),
});

/**
 * Helper to get coefficient metadata for telemetry logging
 */
export function getScoreWeightsMetadata(): { weights: typeof SCORE_WEIGHTS.FINAL_SCORE } {
  return {
    weights: { ...SCORE_WEIGHTS.FINAL_SCORE }
  };
}

/**
 * Calculate FinalScore using centralized weights
 * This is the single source of truth for FinalScore computation
 */
export function calculateFinalScore(params: {
  hybridScore?: number;
  predictiveConfidence?: number;
  regimeWeight?: number;
  decayPenalty?: number;
}): number {
  const W = SCORE_WEIGHTS.FINAL_SCORE;
  
  const score = 
    (params.hybridScore ?? 0) * W.HYBRID +
    (params.predictiveConfidence ?? 0) * W.CONFIDENCE +
    (params.regimeWeight ?? 0) * W.REGIME -
    (params.decayPenalty ?? 0) * W.DECAY;
  
  return Math.max(0, Math.min(1, score));
}
