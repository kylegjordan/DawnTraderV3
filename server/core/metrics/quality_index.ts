/**
 * Signal Quality Metrics Pipeline
 *
 * Computes derived signal metrics used throughout the trading pipeline:
 * - Deterministic Confidence (Directive 12.3.3)
 * - Expected Return (risk/reward ratio)
 * - Risk Score (stop distance / ATR)
 * - Volatility (24h range)
 * - Expected Duration (estimated hold time)
 * - Profit Rate (return per time unit)
 * - FinalScore and RegimeWeight (via score-calculator)
 */

import { calculateFinalScore, calculateRegimeWeight } from '../utils/score-calculator.js';

const DEFAULT_VOLATILITY = 0.3;
const DEFAULT_HOLD_TIME_MINUTES = 60;

export const MIN_QUEUE_CONFIDENCE = 0.55;

/**
 * Clamp a value between 0 and 1
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Directive 12.3.3: Deterministic Confidence
 *
 * A deterministic confidence formula that is transparent, reproducible,
 * and free of rolling normalization artifacts.
 *
 * Formula:
 *   confidence = (strategyConfidence * 0.60) + ((1 - volatility) * 0.20) + ((1 - riskScore) * 0.20)
 *
 * This produces values in [0.0, 1.0] directly without normalization.
 *
 * @param baseConfidence - Raw signal confidence from strategy (0-1)
 * @param volatility - Market volatility factor (0-1, default 0.3)
 * @param riskScore - Risk assessment score (0-1)
 * @returns Deterministic confidence (0-1)
 */
export function calculateDeterministicConfidence(
  baseConfidence: number,
  volatility: number = DEFAULT_VOLATILITY,
  riskScore: number,
): number {
  const conf = clamp01(baseConfidence);
  const vol = clamp01(volatility);
  const risk = clamp01(riskScore);

  // Directive 12.3.3: Deterministic confidence — no rolling normalization
  const deterministicConfidence = (conf * 0.60) + ((1 - vol) * 0.20) + ((1 - risk) * 0.20);

  console.log(`[CONFIDENCE] conf=${conf.toFixed(3)} vol=${vol.toFixed(3)} risk=${risk.toFixed(3)} → confidence=${deterministicConfidence.toFixed(4)}`);

  return Math.round(clamp01(deterministicConfidence) * 10000) / 10000;
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
 * Directive A3.R8.3: Added minimum floor of 0.15 to prevent zero profit rate
 * when target ≈ entry price, which was causing VWAP signals to be rejected.
 *
 * @param expectedReturn - Expected return (0-1)
 * @param expectedDuration - Expected duration in minutes
 * @returns Normalized profit rate (0-1)
 */
export function calculateProfitRate(
  expectedReturn: number,
  expectedDuration: number,
): number {
  if (expectedDuration <= 0) {
    return 0.15; // A3.R8.3: Return floor instead of 0
  }

  const returnVal = clamp01(expectedReturn);

  const rawRate = (returnVal * 60) / expectedDuration;

  const normalizedRate = rawRate >= 0 && rawRate <= 1 ? rawRate : Math.max(0, Math.min(1, (rawRate - 0.002) / (0.80 - 0.002)));

  // Directive A3.R8.3: Apply minimum floor to prevent zero profit rate
  const flooredRate = Math.max(normalizedRate, 0.15);

  return Math.round(flooredRate * 10000) / 10000;
}

/**
 * Calculate expected return from entry/target/stop prices
 *
 * Directive A3.R8.3: Added minimum floor to prevent zero rounding when
 * target ≈ entry, which was causing VWAP signals to be rejected.
 *
 * @param entryPrice - Entry price
 * @param targetPrice - Target/take-profit price
 * @param stopPrice - Stop-loss price
 * @returns Normalized expected return (0-1)
 */
export function calculateExpectedReturn(
  entryPrice: number,
  targetPrice: number | undefined,
  stopPrice: number,
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

  const rawReturn = rrRatio / (rrRatio + 2);

  const normalizedReturn = rawReturn >= 0 && rawReturn <= 1 ? rawReturn : Math.max(0, Math.min(1, (rawReturn - 0.1) / (0.8 - 0.1)));

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
 * Calculate extended metrics for a signal (used by Signal Orchestrator)
 * Returns all derived metrics: confidence, FinalScore, RegimeWeight, ExpectedDuration, ProfitRate
 *
 * Phase 14: Deterministic confidence + FinalScore pipeline
 * 1. First compute base metrics (expectedReturn, riskScore, volatility, expectedDuration, profitRate)
 * 2. Compute confidence as deterministic blend:
 *    confidence = (baseConfidence * 0.50) + (profitRate * 0.30) + ((1-risk) * 0.20)
 * 3. Compute RegimeWeight and FinalScore using centralized score-calculator
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
  // Phase 14: Additional inputs for FinalScore/RegimeWeight computation
  hybridScore?: number;
  trendStrength?: number;
}): {
  confidence: number;
  finalScore: number;
  regimeWeight: number;
  expectedReturn: number;
  riskScore: number;
  volatility: number;
  expectedDuration: number;
  profitRate: number;
} {
  // Step 1: Compute base metrics FIRST (without NGC dependency)
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

  const expectedDuration = estimateExpectedDuration(
    volatility,
    signal.atr,
    signal.entryPrice,
    signal.historicalHoldTime
  );

  const profitRate = calculateProfitRate(expectedReturn, expectedDuration);

  // Directive 12.3.3: Deterministic confidence (replaces NGC blending)
  // Formula: confidence = (strategyConf * 0.60) + ((1-vol) * 0.20) + ((1-risk) * 0.20)
  // Then blend with profitRate for final quality metric:
  // finalConfidence = (baseConfidence * 0.50) + (profitRate * 0.30) + ((1-risk) * 0.20)
  const baseConfidence = calculateDeterministicConfidence(signal.confidence, volatility, riskScore);
  const nProfit = clamp01(profitRate);
  const nRisk = clamp01(1 - riskScore);

  // Directive 12.3.3: Deterministic blending — transparent, no rolling normalization
  const confidence = clamp01((baseConfidence * 0.50) + (nProfit * 0.30) + (nRisk * 0.20));

  console.log(`[12.3.3][CONFIDENCE] base=${baseConfidence.toFixed(3)} profit=${nProfit.toFixed(3)} risk=${nRisk.toFixed(3)} → confidence=${confidence.toFixed(3)}`);

  // Step 3: Compute RegimeWeight and FinalScore
  const regimeWeight = calculateRegimeWeight({
    trendStrength: signal.trendStrength ?? 0.5,
    volatility,
  });
  const finalScore = calculateFinalScore({
    confidence,
    hybridScore: signal.hybridScore ?? confidence,
    regimeWeight,
  });
  console.log(`[Phase14][EXTENDED_METRICS] regimeWeight=${regimeWeight.toFixed(4)} finalScore=${finalScore.toFixed(4)}`);

  return {
    confidence: Math.round(confidence * 10000) / 10000,
    finalScore,
    regimeWeight,
    expectedReturn,
    riskScore,
    volatility,
    expectedDuration,
    profitRate,
  };
}
