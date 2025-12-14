/**
 * Phase 8.8.4-B: Confidence-Weighted Quality Index (CWQI)
 * 
 * CWQI combines multiple signal quality factors into a single ranking metric.
 * Higher CWQI = higher trade priority for the Ready-to-Buy queue.
 * 
 * Formula:
 *   CWQI = (confidence * 0.5) + ((1 - riskScore) * 0.3) + (expectedReturn * 0.2)
 * 
 * All components are normalized between 0 and 1:
 * - confidence: Signal confidence (0 = no confidence, 1 = max confidence)
 * - riskScore: Risk assessment (0 = low risk, 1 = high risk)
 * - expectedReturn: Expected return potential (0 = low, 1 = high)
 */

export interface CWQIComponents {
  confidence: number;    // 0.0 to 1.0
  riskScore: number;     // 0.0 to 1.0 (lower is better)
  expectedReturn: number; // 0.0 to 1.0
}

export interface CWQIResult {
  cwqi: number;
  components: CWQIComponents;
  breakdown: {
    confidenceContribution: number;
    riskContribution: number;
    returnContribution: number;
  };
}

const CONFIDENCE_WEIGHT = 0.5;
const RISK_WEIGHT = 0.3;
const RETURN_WEIGHT = 0.2;

/**
 * Clamp a value between 0 and 1
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Calculate the Confidence-Weighted Quality Index (CWQI)
 * 
 * @param components - The quality components to evaluate
 * @returns CWQIResult with the calculated index and breakdown
 */
export function calculateCWQI(components: CWQIComponents): CWQIResult {
  const confidence = clamp01(components.confidence);
  const riskScore = clamp01(components.riskScore);
  const expectedReturn = clamp01(components.expectedReturn);
  
  const confidenceContribution = confidence * CONFIDENCE_WEIGHT;
  const riskContribution = (1 - riskScore) * RISK_WEIGHT;
  const returnContribution = expectedReturn * RETURN_WEIGHT;
  
  const cwqi = confidenceContribution + riskContribution + returnContribution;
  
  return {
    cwqi: Math.round(cwqi * 10000) / 10000, // 4 decimal precision
    components: {
      confidence,
      riskScore,
      expectedReturn,
    },
    breakdown: {
      confidenceContribution: Math.round(confidenceContribution * 10000) / 10000,
      riskContribution: Math.round(riskContribution * 10000) / 10000,
      returnContribution: Math.round(returnContribution * 10000) / 10000,
    },
  };
}

/**
 * Calculate expected return from entry/target/stop prices
 * Normalized to 0-1 scale based on risk/reward ratio
 * 
 * @param entryPrice - Entry price
 * @param targetPrice - Target/take-profit price
 * @param stopPrice - Stop-loss price
 * @returns Normalized expected return (0-1)
 */
export function calculateExpectedReturn(
  entryPrice: number,
  targetPrice: number | undefined,
  stopPrice: number
): number {
  if (!targetPrice || targetPrice <= entryPrice || stopPrice >= entryPrice) {
    return 0.3; // Default moderate return expectation
  }
  
  const potentialGain = targetPrice - entryPrice;
  const potentialLoss = entryPrice - stopPrice;
  
  if (potentialLoss <= 0) {
    return 0.3;
  }
  
  const rrRatio = potentialGain / potentialLoss;
  
  // Normalize R:R ratio to 0-1 scale
  // R:R of 1:1 = 0.25, 2:1 = 0.5, 3:1 = 0.625, 4:1+ = approaching 0.8
  const normalizedReturn = Math.min(0.8, rrRatio / (rrRatio + 2));
  
  return Math.round(normalizedReturn * 10000) / 10000;
}

/**
 * Calculate risk score from stop distance and ATR
 * Higher stop distance relative to ATR = higher risk
 * 
 * @param entryPrice - Entry price
 * @param stopPrice - Stop-loss price
 * @param atr - Average True Range (optional)
 * @returns Normalized risk score (0-1, lower is better)
 */
export function calculateRiskScore(
  entryPrice: number,
  stopPrice: number,
  atr?: number
): number {
  const stopDistance = Math.abs(entryPrice - stopPrice);
  const stopPercent = (stopDistance / entryPrice) * 100;
  
  // Base risk on stop distance percentage
  // < 1% = low risk, 1-3% = moderate, 3-5% = high, > 5% = very high
  let baseRisk = Math.min(1, stopPercent / 5);
  
  // Adjust by ATR if available
  if (atr && atr > 0) {
    const atrMultiple = stopDistance / atr;
    // 1x ATR = low risk, 2x = moderate, 3x+ = high
    const atrRisk = Math.min(1, atrMultiple / 3);
    // Blend ATR risk with percentage risk
    baseRisk = (baseRisk * 0.4) + (atrRisk * 0.6);
  }
  
  return Math.round(baseRisk * 10000) / 10000;
}

/**
 * Calculate all CWQI components from signal data
 */
export function calculateCWQIFromSignal(signal: {
  confidence: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  atr?: number;
}): CWQIResult {
  const expectedReturn = calculateExpectedReturn(
    signal.entryPrice,
    signal.targetPrice,
    signal.stopPrice
  );
  
  const riskScore = calculateRiskScore(
    signal.entryPrice,
    signal.stopPrice,
    signal.atr
  );
  
  return calculateCWQI({
    confidence: signal.confidence,
    riskScore,
    expectedReturn,
  });
}

/**
 * Compare two CWQI values for sorting (descending - higher first)
 */
export function compareCWQI(a: number, b: number): number {
  return b - a;
}

/**
 * Get CWQI ranking tier
 */
export function getCWQITier(cwqi: number): 'excellent' | 'good' | 'moderate' | 'poor' {
  if (cwqi >= 0.7) return 'excellent';
  if (cwqi >= 0.5) return 'good';
  if (cwqi >= 0.3) return 'moderate';
  return 'poor';
}

/**
 * Minimum CWQI threshold for queue eligibility
 */
export const MIN_QUEUE_CWQI = 0.4;

/**
 * Minimum confidence threshold for queue eligibility
 */
export const MIN_QUEUE_CONFIDENCE = 0.6;
