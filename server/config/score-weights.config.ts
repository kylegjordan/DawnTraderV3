/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.9A — Score Weights Configuration (Purified)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Central, immutable source of truth for all scoring coefficients used across
 * DawnTrader's math stack. This ensures mathematical consistency between the
 * Signal Orchestrator and Ready-to-Buy Refresh Service.
 * 
 * IMPORTANT: This file contains CONSTANTS ONLY - no runtime logic.
 * Any changes to these weights affect both signal generation and
 * refresh scoring. Update with caution and ensure telemetry records the change.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Directive 10.9A: Version tracking for telemetry auditing
 * Increment version when weights change
 */
export const SCORE_WEIGHTS_VERSION = "v1.0.1";

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
export const SCORE_WEIGHTS = Object.freeze({
  FINAL_SCORE: Object.freeze({
    HYBRID: 0.4,
    CONFIDENCE: 0.3,
    REGIME: 0.2,
    DECAY: 0.1
  }),
});

/**
 * Helper to get coefficient metadata for telemetry logging
 * Returns a copy of weights plus version for audit trail
 */
export function getScoreWeightsMetadata(): { 
  version: string;
  weights: typeof SCORE_WEIGHTS.FINAL_SCORE;
} {
  return {
    version: SCORE_WEIGHTS_VERSION,
    weights: { ...SCORE_WEIGHTS.FINAL_SCORE }
  };
}
