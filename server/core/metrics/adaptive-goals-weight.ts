/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H Task 5 — Goals Engine Adaptive Weighting
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides adaptive, volatility-sensitive weighting for the Goals Engine.
 * Caps total ML contribution at 40% to prevent AI confidence dominance.
 * 
 * Formula:
 *   aiWeight = min(baseWeight * (1 - volatilityFactor), getAIWeightCap())
 * 
 * Where:
 *   - baseWeight: The configured ML confidence weight (from SCORE_WEIGHTS)
 *   - volatilityFactor: Market volatility 0-1 (higher = more volatile)
 *   - getAIWeightCap(): Maximum allowed ML contribution (0.40)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SCORE_WEIGHTS } from '../../config/score-weights.config.js';
// B72 (2026-05-05): getAIWeightCap() from module='goals_weighting'.
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

function getAIWeightCap(): number {
  return getCachedNumberRequired('goals_weighting', 'ai_weight_cap',
    { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
}

/**
 * @deprecated B72: live runtime callers should use `getAIWeightCap()`. This
 * exported constant exists for non-runtime tooling (e.g. audit scripts that
 * run before module_constants is warmed) — its value matches the seeded
 * migration row 2026-05-05-b72-lever-sweep.sql, but if the DB row changes
 * this constant will NOT update. Keep in sync manually if you tune the row.
 */
export const AI_WEIGHT_CAP = 0.40;

export interface AdaptiveWeightResult {
  hybridWeight: number;
  confidenceWeight: number;
  regimeWeight: number;
  decayPenalty: number;
  totalPositive: number;
  mlContribution: number;
  volatilityFactor: number;
  cappedMlWeight: boolean;
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Directive 11.4H Task 5: Compute adaptive weights with volatility sensitivity
 * Directive 11.4H.1 Task 5: Enhanced with proper weight normalization and validation
 * 
 * @param volatility - Current market volatility 0-1 (e.g., from dailyRange/price)
 * @param baseConfidenceWeight - Optional override for base ML confidence weight
 * @returns Adaptive weights with ML contribution capped at 40%
 */
export function computeAdaptiveGoalsWeights(
  volatility: number,
  baseConfidenceWeight?: number
): AdaptiveWeightResult {
  const baseWeight = baseConfidenceWeight ?? SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE;
  
  // Directive 11.4H.1 Task 5: Clamp volatility to prevent negative weights
  const volatilityFactor = clamp(volatility, 0, 1);
  
  // Reduce ML weight in high volatility conditions
  // High volatility = less predictable = lower ML reliance
  const adjustedMlWeight = baseWeight * (1 - volatilityFactor);
  const cappedMlWeight = clamp(Math.min(adjustedMlWeight, getAIWeightCap()), 0, getAIWeightCap());
  
  // Check if we had to cap
  const wasCapped = adjustedMlWeight > getAIWeightCap();
  
  // Adjust other weights to maintain total of ~1.0 (0.9 positive + 0.1 decay)
  // When ML weight is reduced, redistribute to hybrid and regime
  const mlReduction = baseWeight - cappedMlWeight;
  const hybridBoost = mlReduction * 0.6; // 60% to hybrid
  const regimeBoost = mlReduction * 0.4; // 40% to regime
  
  let finalHybridWeight = clamp(SCORE_WEIGHTS.FINAL_SCORE.HYBRID + hybridBoost, 0, 1);
  let finalRegimeWeight = clamp(SCORE_WEIGHTS.FINAL_SCORE.REGIME + regimeBoost, 0, 1);
  const finalDecayWeight = SCORE_WEIGHTS.FINAL_SCORE.DECAY;
  
  // Directive 11.4H.2 Task 3: Normalize positive weights to 1.0 (not 0.9)
  const totalPositive = finalHybridWeight + cappedMlWeight + finalRegimeWeight;
  if (totalPositive > 0 && totalPositive !== 1.0) {
    // Normalize positive weights to exactly 1.0
    const normalizer = 1.0 / totalPositive;
    finalHybridWeight *= normalizer;
    finalRegimeWeight *= normalizer;
  }
  
  const normalizedTotal = finalHybridWeight + cappedMlWeight + finalRegimeWeight;
  
  // Directive 11.4H.1 Task 5: Validation log
  console.debug(`[GoalsEngine] Weights normalized → ML=${cappedMlWeight.toFixed(2)}, Hybrid=${finalHybridWeight.toFixed(2)}, Regime=${finalRegimeWeight.toFixed(2)}`);
  
  return {
    hybridWeight: finalHybridWeight,
    confidenceWeight: cappedMlWeight,
    regimeWeight: finalRegimeWeight,
    decayPenalty: finalDecayWeight,
    totalPositive: normalizedTotal,
    mlContribution: cappedMlWeight,
    volatilityFactor,
    cappedMlWeight: wasCapped,
  };
}

/**
 * Directive 11.4H Task 5: Validate that weights sum to expected total
 * Directive 11.4H.2 Task 3: Updated to validate sum = 1.0
 * @returns true if weights are valid (totalPositive ≈ 1.0)
 */
export function validateWeightIntegrity(weights: AdaptiveWeightResult): boolean {
  const expectedTotal = 1.0; // Directive 11.4H.2: Positive weights should sum to 1.0
  const tolerance = 0.01;
  
  const isValid = Math.abs(weights.totalPositive - expectedTotal) <= tolerance;
  
  if (!isValid) {
    console.error(`[11.4H.2][Goals] Weight integrity check FAILED: total=${weights.totalPositive.toFixed(3)}, expected=${expectedTotal}`);
  }
  
  return isValid;
}

/**
 * Directive 11.4H Task 5: Get weight summary for logging/reporting
 */
export function getWeightSummary(weights: AdaptiveWeightResult): string {
  return `Hybrid=${(weights.hybridWeight * 100).toFixed(1)}% ML=${(weights.confidenceWeight * 100).toFixed(1)}% Regime=${(weights.regimeWeight * 100).toFixed(1)}% Decay=${(weights.decayPenalty * 100).toFixed(1)}% (vol=${weights.volatilityFactor.toFixed(2)}, capped=${weights.cappedMlWeight})`;
}

/**
 * Directive 11.4H Task 5: Calculate FinalScore with adaptive weights
 */
export function calculateAdaptiveFinalScore(
  hybridScore: number,
  predictiveConfidence: number,
  regimeWeight: number,
  decayPenalty: number,
  volatility: number
): { finalScore: number; weights: AdaptiveWeightResult } {
  const weights = computeAdaptiveGoalsWeights(volatility);
  
  const finalScore = 
    hybridScore * weights.hybridWeight +
    predictiveConfidence * weights.confidenceWeight +
    regimeWeight * weights.regimeWeight -
    decayPenalty * weights.decayPenalty;
  
  return { finalScore: clamp(finalScore, 0, 1), weights };
}
