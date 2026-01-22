/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.5 — Net Expectancy Gate (Profitability Validation)
 * Directive 11.7A — Unified Signal Filter Integration (VTS + SQE Parity)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Prevents low-expectancy (fee-negative) signals from entering 
 * simulation or live trade queues.
 * 
 * Directive 11.7A adds regime-aware ROI thresholds that adjust dynamically
 * based on market conditions. Shared by both VTS and SQE for parity.
 * 
 * No trade—real or simulated—proceeds if its math doesn't justify the risk.
 * 
 * Schema: v1.8.0
 * Governance: Directive 11.5 Task 1, Directive 11.7A Task 1
 * ══════════════════════════════════════════════════════════════════════════════
 */

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
 * Directive 11.7A Task 1: Unified Signal Profitability Check
 * 
 * Validates that a signal's expected ROI exceeds the regime-specific threshold.
 * Used by both VTS and SQE for parity in signal filtering.
 * 
 * @param entryPrice - Entry price for the trade
 * @param targetPrice - Target/take-profit price
 * @param regime - Current market regime for the pair
 * @returns true if signal meets minimum ROI threshold for the regime
 */
export function isSignalProfitable(entryPrice: number, targetPrice: number, regime: string): boolean {
  const roi = (targetPrice - entryPrice) / entryPrice;
  const minROI = getMinROIForRegime(regime);
  return roi >= minROI;
}

/**
 * Directive 11.7A: Get ROI details for logging
 */
export function getROIDetails(entryPrice: number, targetPrice: number, regime: string): {
  expectedROI: number;
  minROI: number;
  passedsThreshold: boolean;
  roiPercent: string;
  minROIPercent: string;
} {
  const roi = (targetPrice - entryPrice) / entryPrice;
  const minROI = getMinROIForRegime(regime);
  return {
    expectedROI: roi,
    minROI,
    passedsThreshold: roi >= minROI,
    roiPercent: (roi * 100).toFixed(2) + '%',
    minROIPercent: (minROI * 100).toFixed(2) + '%'
  };
}
