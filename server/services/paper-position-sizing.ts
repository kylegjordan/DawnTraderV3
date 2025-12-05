/**
 * Phase 8.8.3-J7/AJ9: Paper-Mode Position Sizing Helper
 * 
 * Pure function for calculating position sizes during signal generation (P2).
 * This helper does NOT access the database or make any network calls.
 * All inputs must be provided by the caller.
 * 
 * Constraints:
 * - Paper mode only
 * - No legacy risk modules
 * - Uses guardrailsV2 configuration
 * 
 * AJ9 Addition:
 * - MAX_POSITION_BUFFER_FACTOR (0.97) provides 3% wiggle room below max position cap
 * - This prevents legitimate trades from being blocked by MAX_POSITION due to
 *   price changes between RTB sizing and execution
 */

import type { GuardrailsV2 } from '@shared/schema';
import { b5SizingAudit } from './b5-sizing-audit.js';

/**
 * AJ9: Buffer factor for max position sizing.
 * Size positions at 97% of max to provide 3% wiggle room for price fluctuations.
 * This prevents trades from being blocked by MAX_POSITION during execution.
 */
const MAX_POSITION_BUFFER_FACTOR = 0.97;

export type StrategyType = 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout' | 'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap' | 'dhma';

export interface PaperPositionSizingParams {
  portfolioValue: number;
  guardrails: GuardrailsV2 | null | undefined;
  entryPrice: number;
  stopPrice: number;
  symbol: string;
  strategy: StrategyType;
}

export interface PaperPositionSizingResult {
  quantity: number;
  estimatedValue: number;
  sizingDetails?: {
    portfolioValue: number;
    riskPerTradePct: number;
    riskAmount: number;
    stopDistance: number;
    maxPositionPct: number;
    maxNotional: number;
    bufferedMaxNotional: number;
    wasClamped: boolean;
  };
}

/**
 * Calculate paper-mode position size for a signal.
 * 
 * Pure function - no DB calls, no network calls.
 * 
 * Logic:
 * 1. Calculate risk amount: portfolioValue × (portfolioRiskPerTradePct / 100)
 * 2. Calculate stop distance: |entryPrice - stopPrice|
 * 3. Calculate raw quantity: riskAmount / stopDistance
 * 4. Clamp by maxPositionPercentPct if needed
 * 5. Return quantity and estimatedValue
 * 
 * Returns { quantity: 0, estimatedValue: 0 } for any invalid input
 * (NaN, zero, negative values, malformed data)
 */
export function sizePaperPositionForSignal(params: PaperPositionSizingParams): PaperPositionSizingResult {
  const { portfolioValue, guardrails, entryPrice, stopPrice, symbol, strategy } = params;
  
  // Default return for invalid cases
  const invalidResult: PaperPositionSizingResult = { quantity: 0, estimatedValue: 0 };
  
  // Validate inputs
  if (!Number.isFinite(portfolioValue) || portfolioValue <= 0) {
    console.log(`[J7][SIZING] Invalid portfolioValue (${portfolioValue}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    console.log(`[J7][SIZING] Invalid entryPrice (${entryPrice}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  if (!Number.isFinite(stopPrice) || stopPrice <= 0) {
    console.log(`[J7][SIZING] Invalid stopPrice (${stopPrice}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  // Calculate stop distance
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance === 0 || !Number.isFinite(stopDistance)) {
    console.log(`[J7][SIZING] Invalid stopDistance (${stopDistance}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  // Extract guardrail values with safe defaults
  const riskPerTradePct = parseFloat(String(guardrails?.portfolioRiskPerTradePct || '1.50'));
  const maxPositionPct = parseFloat(String(guardrails?.maxPositionPercentPct || '10.00'));
  
  // Validate guardrail values
  const safeRiskPct = Number.isFinite(riskPerTradePct) && riskPerTradePct > 0 ? riskPerTradePct : 1.50;
  const safeMaxPositionPct = Number.isFinite(maxPositionPct) && maxPositionPct > 0 ? maxPositionPct : 10.00;
  
  // Step 1: Calculate risk amount
  const riskAmount = (portfolioValue * safeRiskPct) / 100;
  
  // Step 2: Calculate raw quantity based on risk
  let quantity = riskAmount / stopDistance;
  
  // Validate quantity
  if (!Number.isFinite(quantity) || quantity <= 0) {
    console.log(`[J7][SIZING] Invalid quantity (${quantity}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  // Step 3: Calculate max notional from maxPositionPercentPct
  const maxNotional = (portfolioValue * safeMaxPositionPct) / 100;
  
  // AJ9: Apply buffer factor to max notional for sizing (3% below max cap)
  // This provides wiggle room for price changes between RTB sizing and execution
  const bufferedMaxNotional = maxNotional * MAX_POSITION_BUFFER_FACTOR;
  
  let estimatedValue = quantity * entryPrice;
  let wasClamped = false;
  
  // Step 4: Clamp quantity if notional exceeds buffered max position
  // Use buffered value for sizing, but MAX_POSITION check at execution uses full max
  if (estimatedValue > bufferedMaxNotional) {
    wasClamped = true;
    quantity = bufferedMaxNotional / entryPrice;
    estimatedValue = quantity * entryPrice;
  }
  
  // Final validation
  if (!Number.isFinite(quantity) || !Number.isFinite(estimatedValue)) {
    console.log(`[J7][SIZING] Final validation failed for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  // Log sizing details (AJ9: includes buffer info)
  console.log(`[AJ9][SIZING]`, {
    symbol,
    strategy,
    portfolioValue: portfolioValue.toFixed(2),
    riskPct: safeRiskPct.toFixed(2),
    riskAmount: riskAmount.toFixed(2),
    stopDistance: stopDistance.toFixed(8),
    quantity: quantity.toFixed(8),
    estimatedValue: estimatedValue.toFixed(2),
    maxPositionPct: safeMaxPositionPct.toFixed(2),
    maxNotional: maxNotional.toFixed(2),
    bufferedMaxNotional: bufferedMaxNotional.toFixed(2),
    bufferFactor: MAX_POSITION_BUFFER_FACTOR,
    wasClamped
  });
  
  // B5: Log sizing call to diagnostic service
  b5SizingAudit.logSizingCalled({
    strategy: strategy,
    symbol,
    entryPrice,
    rawNotional: null,
    sizedQuantity: quantity,
    sizedNotional: estimatedValue,
    riskPct: safeRiskPct,
    maxPositionUsd: maxNotional,
    bufferFactor: MAX_POSITION_BUFFER_FACTOR,
  });
  
  return {
    quantity,
    estimatedValue,
    sizingDetails: {
      portfolioValue,
      riskPerTradePct: safeRiskPct,
      riskAmount,
      stopDistance,
      maxPositionPct: safeMaxPositionPct,
      maxNotional,
      bufferedMaxNotional,
      wasClamped
    }
  };
}

/**
 * Validate that a portfolio value is usable for sizing.
 * Returns the value if valid, throws if not.
 */
export function validatePaperPortfolioValue(balance: string | number | null | undefined, source: string): number {
  if (balance === null || balance === undefined) {
    console.error(`[J7][PORTFOLIO_ERROR] No portfolio balance found from ${source}`);
    throw new Error(`Paper portfolio value not found. Cannot size positions.`);
  }
  
  const parsed = typeof balance === 'number' ? balance : parseFloat(String(balance));
  
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`[J7][PORTFOLIO_ERROR] Invalid portfolio balance: ${balance} from ${source}`);
    throw new Error(`Invalid paper portfolio value: ${balance}. Cannot size positions.`);
  }
  
  return parsed;
}
