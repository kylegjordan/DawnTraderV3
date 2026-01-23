/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.5 — Net Expectancy Gate (Profitability Validation)
 * Directive 11.7A — Unified Signal Filter Integration (VTS + SQE Parity)
 * Directive 11.7B — Predictive Learning Telemetry Enhancement
 * Directive 11.7C — Dynamic ROI Thresholding via PredictiveConfidence
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Prevents low-expectancy (fee-negative) signals from entering 
 * simulation or live trade queues.
 * 
 * Directive 11.7A adds regime-aware ROI thresholds that adjust dynamically
 * based on market conditions. Shared by both VTS and SQE for parity.
 * 
 * Directive 11.7B integrates VTS telemetry for adaptive expectancy based on
 * historical simulation performance per regime × strategy.
 * 
 * Directive 11.7C adds:
 * - Dynamic ROI scaling based on PredictiveConfidence (bounded 1-4%)
 * - Friction-aware profitability validation (fees + slippage floor)
 * - Unified logic for VTS, SQE, DSS, and RTB
 * 
 * No trade—real or simulated—proceeds if its math doesn't justify the risk.
 * 
 * Schema: v2.0.0
 * Governance: Directive 11.5 Task 1, Directive 11.7A Task 1, Directive 11.7B Task 4, Directive 11.7C Tasks 2-3
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { getRegimePerformance, checkConfidenceDrift } from '../logging/vts-telemetry';
import { 
  ROI_FLEX_MULTIPLIER, 
  ROI_MIN, 
  ROI_MAX, 
  DEFAULT_FEE, 
  DEFAULT_SLIPPAGE,
  FRICTION_SAFETY_BUFFER 
} from '../../config/adaptive-thresholds';

export interface ExpectancyParams {
  entry: number;
  target: number;
  spread: number;
  slippage: number;
  fee: number;
}

/**
 * Directive 11.5 Task 1: Net Expectancy Gate
 * 
 * Validates that projected gross profit exceeds total trading costs.
 * Total cost = (fee × 2) + (spread × 1.1) + slippage
 * 
 * @param entry - Entry price
 * @param target - Target/take-profit price
 * @param spread - Current spread (as decimal, e.g., 0.002 for 0.2%)
 * @param slippage - Expected slippage (as decimal)
 * @param fee - Trading fee per side (as decimal)
 * @returns true if trade is mathematically profitable
 */
export function isMathematicallyProfitable(
  entry: number,
  target: number,
  spread: number,
  slippage: number,
  fee: number
): boolean {
  const grossProfit = Math.abs(target - entry) / entry;
  const totalCost = (fee * 2) + (spread * 1.1) + slippage;
  
  return grossProfit > totalCost;
}

/**
 * Directive 11.5: Calculate net expectancy value
 * 
 * @returns Net expectancy as a decimal (positive = profitable)
 */
export function calculateNetExpectancy(params: ExpectancyParams): number {
  const { entry, target, spread, slippage, fee } = params;
  
  const grossProfit = Math.abs(target - entry) / entry;
  const totalCost = (fee * 2) + (spread * 1.1) + slippage;
  
  return grossProfit - totalCost;
}

/**
 * Directive 11.5: Get detailed expectancy breakdown for logging
 */
export function getExpectancyBreakdown(params: ExpectancyParams): {
  grossProfit: number;
  totalCost: number;
  netExpectancy: number;
  isProfitable: boolean;
  breakdown: {
    fees: number;
    spreadCost: number;
    slippage: number;
  };
} {
  const { entry, target, spread, slippage, fee } = params;
  
  const grossProfit = Math.abs(target - entry) / entry;
  const fees = fee * 2;
  const spreadCost = spread * 1.1;
  const totalCost = fees + spreadCost + slippage;
  const netExpectancy = grossProfit - totalCost;
  
  return {
    grossProfit,
    totalCost,
    netExpectancy,
    isProfitable: netExpectancy > 0,
    breakdown: {
      fees,
      spreadCost,
      slippage
    }
  };
}

/**
 * Directive 11.7A Task 1: Regime-Aware ROI Thresholds
 * 
 * Returns minimum ROI threshold for a given market regime.
 * These thresholds ensure signals are only executed when expected
 * returns justify the regime-specific risk.
 * 
 * @param regime - Market regime (BULL_STABLE, BEAR_VOLATILE, etc.)
 * @returns Minimum ROI threshold as decimal (e.g., 0.0125 = 1.25%)
 */
export function getMinROIForRegime(regime: string): number {
  switch (regime) {
    case 'BULL_STABLE':
      return 0.0125;      // 1.25% - Lower threshold in stable uptrend
    case 'BEAR_VOLATILE':
      return 0.0250;      // 2.50% - Higher threshold due to elevated risk
    case 'LOW_VOL_CHOP':
      return 0.0175;      // 1.75% - Moderate threshold for choppy conditions
    case 'HIGH_VOL_IMPULSE':
      return 0.0300;      // 3.00% - Highest threshold for volatile impulse moves
    case 'TRANSITION':
      return 0.0200;      // 2.00% - Default for transitional regimes
    default:
      return 0.0200;      // 2.00% - Safe default for unknown regimes
  }
}

/**
 * Directive 11.7C Task 2: Dynamic ROI Helper
 * 
 * Calculates dynamic ROI threshold based on regime baseline and PredictiveConfidence.
 * Higher confidence = lower threshold (more permissive), bounded within [1%, 4%].
 * 
 * Formula: dynamicROI = base × (1 - (confidence - 0.5) × ROI_FLEX_MULTIPLIER)
 * 
 * @param regime - Market regime for baseline threshold
 * @param predictiveConfidence - Confidence score from VTS telemetry [0.0, 1.0]
 * @returns Dynamic ROI threshold bounded within ROI_MIN and ROI_MAX
 */
export function getDynamicROIThreshold(regime: string, predictiveConfidence: number): number {
  const base = getMinROIForRegime(regime);
  const boundedConfidence = Math.min(Math.max(predictiveConfidence, 0.0), 1.0);
  const dynamicROI = base * (1 - (boundedConfidence - 0.5) * ROI_FLEX_MULTIPLIER);
  return Math.min(Math.max(dynamicROI, ROI_MIN), ROI_MAX);
}

/**
 * Directive 11.7C Task 3: Friction-Aware Profitability Gate
 * 
 * Validates that a signal's expected ROI exceeds both:
 * 1. The dynamic confidence-adjusted threshold
 * 2. The friction floor (fees + slippage) with safety buffer
 * 
 * Used by both VTS and SQE for parity in signal filtering.
 * 
 * @param entryPrice - Entry price for the trade
 * @param targetPrice - Target/take-profit price
 * @param regime - Current market regime for the pair
 * @param predictiveConfidence - Optional confidence score [0.0, 1.0], defaults to 0.5
 * @param fee - Trading fee per side (defaults to 0.1%)
 * @param estimatedSlippage - Expected slippage (defaults to 0.15%)
 * @returns true if signal meets required ROI threshold
 */
export function isSignalProfitable(
  entryPrice: number, 
  targetPrice: number, 
  regime: string,
  predictiveConfidence: number = 0.5,
  fee: number = DEFAULT_FEE,
  estimatedSlippage: number = DEFAULT_SLIPPAGE
): boolean {
  const roi = (targetPrice - entryPrice) / Math.max(entryPrice, 1e-8);
  
  const dynamicROI = getDynamicROIThreshold(regime, predictiveConfidence);
  
  // Directive 11.7C: Friction floor = (fee×2) + slippage×1.1 (apply buffer only to slippage)
  const frictionFloor = (fee * 2) + (estimatedSlippage * FRICTION_SAFETY_BUFFER);
  const requiredROI = Math.max(dynamicROI, frictionFloor);
  
  return roi >= requiredROI;
}

/**
 * Directive 11.7C: Get ROI details for logging (enhanced with friction awareness)
 */
export function getROIDetails(
  entryPrice: number, 
  targetPrice: number, 
  regime: string,
  predictiveConfidence: number = 0.5,
  fee: number = DEFAULT_FEE,
  estimatedSlippage: number = DEFAULT_SLIPPAGE
): {
  expectedROI: number;
  minROI: number;
  dynamicROI: number;
  frictionFloor: number;
  requiredROI: number;
  passesThreshold: boolean;
  roiPercent: string;
  minROIPercent: string;
  predictiveConfidence: number;
} {
  const roi = (targetPrice - entryPrice) / Math.max(entryPrice, 1e-8);
  const minROI = getMinROIForRegime(regime);
  const dynamicROI = getDynamicROIThreshold(regime, predictiveConfidence);
  // Directive 11.7C: Friction floor = (fee×2) + slippage×1.1 (apply buffer only to slippage)
  const frictionFloor = (fee * 2) + (estimatedSlippage * FRICTION_SAFETY_BUFFER);
  const requiredROI = Math.max(dynamicROI, frictionFloor);
  
  return {
    expectedROI: roi,
    minROI,
    dynamicROI,
    frictionFloor,
    requiredROI,
    passesThreshold: roi >= requiredROI,
    roiPercent: (roi * 100).toFixed(2) + '%',
    minROIPercent: (requiredROI * 100).toFixed(2) + '%',
    predictiveConfidence
  };
}

/**
 * Directive 11.7B Task 4: Get Adaptive Expectancy from VTS Telemetry
 * 
 * Retrieves historical performance metrics for a regime × strategy combination
 * from VTS telemetry to inform adaptive expectancy calculations.
 * 
 * @param regime - Market regime (e.g., BULL_STABLE)
 * @param strategy - Strategy name (e.g., momentum_breakout)
 * @returns Performance metrics or null if not available
 */
export function getAdaptiveExpectancy(regime: string, strategy: string): {
  winRate: number;
  avgPnL: number;
  skipRatio: number;
  confidence: number;
  source: 'VTS';
} | null {
  const perf = getRegimePerformance(regime, strategy);
  if (!perf) {
    console.debug(`[11.7B][Expectancy] No telemetry for ${regime}/${strategy}`);
    return null;
  }
  
  const confidence = Math.max(0, Math.min(1, perf.winRate * (1 - perf.skipRatio)));
  
  return {
    winRate: perf.winRate,
    avgPnL: perf.avgPnL,
    skipRatio: perf.skipRatio,
    confidence,
    source: 'VTS'
  };
}

/**
 * Directive 11.7B Task 4: Adjusted ROI Threshold
 * 
 * Adjusts the base ROI threshold based on historical VTS performance.
 * If a regime × strategy combination has poor historical performance,
 * the threshold is increased to require higher expected returns.
 * 
 * @param regime - Market regime
 * @param strategy - Strategy name
 * @returns Adjusted minimum ROI threshold
 */
export function getAdjustedMinROI(regime: string, strategy: string): number {
  const baseROI = getMinROIForRegime(regime);
  const adaptive = getAdaptiveExpectancy(regime, strategy);
  
  if (!adaptive) {
    return baseROI;
  }
  
  if (adaptive.winRate < 0.4) {
    return baseROI * 1.3;
  }
  if (adaptive.winRate < 0.5) {
    return baseROI * 1.15;
  }
  if (adaptive.winRate > 0.6) {
    return baseROI * 0.9;
  }
  
  return baseROI;
}

/**
 * Directive 11.7B Task 5: Check and log confidence drift
 * 
 * Wrapper for drift detection to be used by scoring systems.
 * Returns true if drift exceeds ±0.05 threshold.
 */
export function checkExpectancyDrift(currentConfidence: number, baseline: number = 0.5): boolean {
  return checkConfidenceDrift(currentConfidence, baseline);
}

/**
 * Directive 11.7C Task 8: Regression Guard
 * 
 * Validates that dynamic ROI thresholds remain within expected bounds.
 * Used for testing and runtime safety to ensure the adaptive system
 * doesn't produce extreme values that would break trading logic.
 * 
 * @param regime - Market regime for threshold calculation
 * @param confidence - PredictiveConfidence value (0-1)
 * @returns Object with validation result and details
 */
export function validateROIThresholdBounds(
  regime: string,
  confidence: number
): {
  isValid: boolean;
  threshold: number;
  minBound: number;
  maxBound: number;
  error?: string;
} {
  const threshold = getDynamicROIThreshold(regime, confidence);
  
  const result = {
    isValid: true,
    threshold,
    minBound: ROI_MIN,
    maxBound: ROI_MAX,
    error: undefined as string | undefined
  };
  
  if (threshold < ROI_MIN) {
    result.isValid = false;
    result.error = `Threshold ${(threshold * 100).toFixed(2)}% below minimum ${(ROI_MIN * 100).toFixed(2)}%`;
    console.warn(`[11.7C][RegressionGuard] VIOLATION: ${result.error}`);
  }
  
  if (threshold > ROI_MAX) {
    result.isValid = false;
    result.error = `Threshold ${(threshold * 100).toFixed(2)}% above maximum ${(ROI_MAX * 100).toFixed(2)}%`;
    console.warn(`[11.7C][RegressionGuard] VIOLATION: ${result.error}`);
  }
  
  if (!isFinite(threshold) || isNaN(threshold)) {
    result.isValid = false;
    result.error = `Threshold is not a finite number: ${threshold}`;
    console.error(`[11.7C][RegressionGuard] CRITICAL: ${result.error}`);
  }
  
  return result;
}

/**
 * Directive 11.7C Task 8: Batch validation for all regimes
 * 
 * Runs regression guard against all known regimes at varying confidence levels.
 * Useful for startup verification and unit testing.
 * 
 * @returns Array of validation results for each regime/confidence combo
 */
export function runRegressionGuardSuite(): Array<{
  regime: string;
  confidence: number;
  isValid: boolean;
  threshold: number;
}> {
  const REGIMES = ['BULL_STABLE', 'BEAR_VOLATILE', 'LOW_VOL_CHOP', 'HIGH_VOL_IMPULSE', 'TRANSITION'];
  const CONFIDENCE_LEVELS = [0.0, 0.25, 0.5, 0.75, 1.0];
  const results: Array<{ regime: string; confidence: number; isValid: boolean; threshold: number }> = [];
  
  for (const regime of REGIMES) {
    for (const confidence of CONFIDENCE_LEVELS) {
      const validation = validateROIThresholdBounds(regime, confidence);
      results.push({
        regime,
        confidence,
        isValid: validation.isValid,
        threshold: validation.threshold
      });
    }
  }
  
  const failures = results.filter(r => !r.isValid);
  if (failures.length > 0) {
    console.warn(`[11.7C][RegressionGuard] Suite completed with ${failures.length} failures`);
  } else {
    console.log(`[11.7C][RegressionGuard] Suite passed - all ${results.length} combinations valid`);
  }
  
  return results;
}
