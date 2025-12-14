/**
 * Phase 8.8.4-B.1: Confidence-Weighted Quality Index (CWQI) with NGC Integration
 * 
 * This module implements the complete signal quality metrics pipeline:
 * 1. NGC (Normalized Global Confidence) - Combines base confidence with volatility and risk
 * 2. ExpectedDuration - Estimates hold time based on signal characteristics
 * 3. ProfitRate - Expected return per unit time
 * 4. CWQI - Comprehensive quality index for signal ranking
 * 
 * New CWQI Formula (B.1):
 *   CWQI = (NGC * 0.40) + ((1 - Risk) * 0.25) + (ExpectedReturn * 0.20) + (ProfitRate * 0.15)
 * 
 * NGC Formula:
 *   NGC = normalize(base_confidence * (1 - volatility) * (1 - risk))
 */

export interface CWQIComponents {
  confidence: number;      // Base confidence 0.0 to 1.0
  riskScore: number;       // 0.0 to 1.0 (lower is better)
  expectedReturn: number;  // 0.0 to 1.0
  volatility?: number;     // 0.0 to 1.0 (optional, defaults to 0.3)
}

export interface ExtendedCWQIComponents extends CWQIComponents {
  ngc: number;             // Normalized Global Confidence 0.0 to 1.0
  expectedDuration: number; // Expected hold time in minutes
  profitRate: number;      // Normalized profit per time unit 0.0 to 1.0
}

export interface CWQIResult {
  cwqi: number;
  ngc: number;
  components: ExtendedCWQIComponents;
  breakdown: {
    ngcContribution: number;
    riskContribution: number;
    returnContribution: number;
    profitRateContribution: number;
  };
}

const NGC_WEIGHT = 0.40;
const RISK_WEIGHT = 0.25;
const RETURN_WEIGHT = 0.20;
const PROFIT_RATE_WEIGHT = 0.15;

const DEFAULT_VOLATILITY = 0.3;
const DEFAULT_HOLD_TIME_MINUTES = 60;

/**
 * Clamp a value between 0 and 1
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Calculate Normalized Global Confidence (NGC)
 * 
 * NGC combines the base signal confidence with market conditions (volatility, risk)
 * to produce a more robust confidence measure that accounts for adverse conditions.
 * 
 * Formula: NGC = normalize(base_confidence * (1 - volatility) * (1 - risk))
 * 
 * @param baseConfidence - Raw signal confidence from strategy (0-1)
 * @param volatility - Market volatility factor (0-1, default 0.3)
 * @param riskScore - Risk assessment score (0-1)
 * @returns Normalized global confidence (0-1)
 */
export function calculateNGC(
  baseConfidence: number,
  volatility: number = DEFAULT_VOLATILITY,
  riskScore: number
): number {
  const conf = clamp01(baseConfidence);
  const vol = clamp01(volatility);
  const risk = clamp01(riskScore);
  
  const rawNGC = conf * (1 - vol) * (1 - risk);
  
  const ngc = clamp01(rawNGC / 0.7);
  
  return Math.round(ngc * 10000) / 10000;
}

/**
 * Estimate expected hold duration for a trade
 * 
 * Duration is influenced by:
 * - Strategy type (some strategies have shorter hold times)
 * - Volatility (higher volatility = shorter expected duration)
 * - ATR-based momentum (larger ATR = faster price movement)
 * - Historical average hold time
 * 
 * @param volatility - Market volatility (0-1)
 * @param atr - Average True Range (optional)
 * @param entryPrice - Entry price for ATR normalization
 * @param historicalHoldTime - Historical average hold time in minutes
 * @returns Expected duration in minutes
 */
export function estimateExpectedDuration(
  volatility: number = DEFAULT_VOLATILITY,
  atr?: number,
  entryPrice?: number,
  historicalHoldTime: number = DEFAULT_HOLD_TIME_MINUTES
): number {
  const vol = clamp01(volatility);
  
  let baseDuration = historicalHoldTime;
  
  const volatilityFactor = 1 - (vol * 0.5);
  baseDuration *= volatilityFactor;
  
  if (atr && entryPrice && entryPrice > 0) {
    const atrPercent = (atr / entryPrice) * 100;
    const atrFactor = Math.max(0.5, 1 - (atrPercent / 10));
    baseDuration *= atrFactor;
  }
  
  const minDuration = 5;
  const maxDuration = 240;
  
  return Math.round(Math.max(minDuration, Math.min(maxDuration, baseDuration)));
}

/**
 * Calculate Profit Rate (expected return per unit time)
 * 
 * ProfitRate = normalize(ExpectedReturn / ExpectedDuration)
 * 
 * Higher profit rate means better risk-adjusted returns over time.
 * 
 * @param expectedReturn - Expected return (0-1)
 * @param expectedDuration - Expected duration in minutes
 * @returns Normalized profit rate (0-1)
 */
export function calculateProfitRate(
  expectedReturn: number,
  expectedDuration: number
): number {
  if (expectedDuration <= 0) {
    return 0;
  }
  
  const returnVal = clamp01(expectedReturn);
  
  const rawRate = (returnVal * 60) / expectedDuration;
  
  const normalizedRate = clamp01(rawRate / 2);
  
  return Math.round(normalizedRate * 10000) / 10000;
}

/**
 * Calculate the Confidence-Weighted Quality Index (CWQI)
 * 
 * New B.1 Formula:
 *   CWQI = (NGC * 0.40) + ((1 - Risk) * 0.25) + (ExpectedReturn * 0.20) + (ProfitRate * 0.15)
 * 
 * @param components - The quality components to evaluate
 * @returns CWQIResult with the calculated index and breakdown
 */
export function calculateCWQI(components: CWQIComponents): CWQIResult {
  const confidence = clamp01(components.confidence);
  const riskScore = clamp01(components.riskScore);
  const expectedReturn = clamp01(components.expectedReturn);
  const volatility = clamp01(components.volatility ?? DEFAULT_VOLATILITY);
  
  const ngc = calculateNGC(confidence, volatility, riskScore);
  
  const expectedDuration = estimateExpectedDuration(volatility);
  
  const profitRate = calculateProfitRate(expectedReturn, expectedDuration);
  
  const ngcContribution = ngc * NGC_WEIGHT;
  const riskContribution = (1 - riskScore) * RISK_WEIGHT;
  const returnContribution = expectedReturn * RETURN_WEIGHT;
  const profitRateContribution = profitRate * PROFIT_RATE_WEIGHT;
  
  const cwqi = ngcContribution + riskContribution + returnContribution + profitRateContribution;
  
  return {
    cwqi: Math.round(cwqi * 10000) / 10000,
    ngc: ngc,
    components: {
      confidence,
      riskScore,
      expectedReturn,
      volatility,
      ngc,
      expectedDuration,
      profitRate,
    },
    breakdown: {
      ngcContribution: Math.round(ngcContribution * 10000) / 10000,
      riskContribution: Math.round(riskContribution * 10000) / 10000,
      returnContribution: Math.round(returnContribution * 10000) / 10000,
      profitRateContribution: Math.round(profitRateContribution * 10000) / 10000,
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
    return 0.3;
  }
  
  const potentialGain = targetPrice - entryPrice;
  const potentialLoss = entryPrice - stopPrice;
  
  if (potentialLoss <= 0) {
    return 0.3;
  }
  
  const rrRatio = potentialGain / potentialLoss;
  
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
  
  let baseRisk = Math.min(1, stopPercent / 5);
  
  if (atr && atr > 0) {
    const atrMultiple = stopDistance / atr;
    const atrRisk = Math.min(1, atrMultiple / 3);
    baseRisk = (baseRisk * 0.4) + (atrRisk * 0.6);
  }
  
  return Math.round(baseRisk * 10000) / 10000;
}

/**
 * Estimate volatility from price data
 * 
 * @param high24h - 24-hour high price
 * @param low24h - 24-hour low price
 * @param currentPrice - Current price
 * @returns Volatility score (0-1)
 */
export function estimateVolatility(
  high24h?: number,
  low24h?: number,
  currentPrice?: number
): number {
  if (!high24h || !low24h || !currentPrice || currentPrice <= 0) {
    return DEFAULT_VOLATILITY;
  }
  
  const range = high24h - low24h;
  const rangePercent = (range / currentPrice) * 100;
  
  const volatility = Math.min(1, rangePercent / 15);
  
  return Math.round(volatility * 10000) / 10000;
}

/**
 * Calculate all CWQI components from signal data with full B.1 metrics
 */
export function calculateCWQIFromSignal(signal: {
  confidence: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  atr?: number;
  volatility?: number;
  high24h?: number;
  low24h?: number;
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
  
  const volatility = signal.volatility ?? estimateVolatility(
    signal.high24h,
    signal.low24h,
    signal.entryPrice
  );
  
  return calculateCWQI({
    confidence: signal.confidence,
    riskScore,
    expectedReturn,
    volatility,
  });
}

/**
 * Calculate extended metrics for a signal (used by Signal Orchestrator)
 * Returns all derived metrics: NGC, ExpectedDuration, ProfitRate, CWQI
 */
export function calculateExtendedSignalMetrics(signal: {
  confidence: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  atr?: number;
  volatility?: number;
  high24h?: number;
  low24h?: number;
  historicalHoldTime?: number;
}): {
  ngc: number;
  expectedReturn: number;
  riskScore: number;
  volatility: number;
  expectedDuration: number;
  profitRate: number;
  cwqi: number;
  cwqiResult: CWQIResult;
} {
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
  
  const volatility = signal.volatility ?? estimateVolatility(
    signal.high24h,
    signal.low24h,
    signal.entryPrice
  );
  
  const ngc = calculateNGC(signal.confidence, volatility, riskScore);
  
  const expectedDuration = estimateExpectedDuration(
    volatility,
    signal.atr,
    signal.entryPrice,
    signal.historicalHoldTime
  );
  
  const profitRate = calculateProfitRate(expectedReturn, expectedDuration);
  
  const cwqiResult = calculateCWQI({
    confidence: signal.confidence,
    riskScore,
    expectedReturn,
    volatility,
  });
  
  return {
    ngc,
    expectedReturn,
    riskScore,
    volatility,
    expectedDuration,
    profitRate,
    cwqi: cwqiResult.cwqi,
    cwqiResult,
  };
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
 * Phase 8.8.4-B.1 SQE Thresholds
 * These are the filtering thresholds for Signal Quality Evaluator
 */
export const SQE_THRESHOLDS = {
  MIN_NGC: 0.40,
  MAX_RISK: 0.70,
  MIN_PROFIT_RATE: 0.25,
  MIN_CWQI: 0.50,
};

/**
 * Minimum CWQI threshold for queue eligibility (updated for B.1)
 */
export const MIN_QUEUE_CWQI = 0.50;

/**
 * Minimum confidence threshold for queue eligibility
 * Note: This now refers to NGC, not raw confidence
 */
export const MIN_QUEUE_CONFIDENCE = 0.40;
