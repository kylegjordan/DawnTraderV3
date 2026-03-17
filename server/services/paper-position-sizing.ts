/**
 * Phase 8.8.3-J7/AJ9/B6: Paper-Mode Position Sizing Helper
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
 * 
 * B6 Refactor:
 * - maxNotional is now derived from exposure budget (portfolioValue × maxTotalExposurePct)
 * - This aligns sizing with the MAX_TOTAL_EXPOSURE guardrail check
 * - Formula: exposureBudget = portfolioValue × (maxTotalExposurePct / 100)
 *            maxNotional = exposureBudget × (maxPositionPercentPct / 100)
 */

import type { GuardrailsV2 } from '@shared/schema';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { getScalingFactor } from './risk-concentration.js';
// Phase 14.5: Pattern pool position sizing guardrails
import { PATTERN_POOL_GUARDRAILS } from '../config/pattern-filter-profile.js';

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
    maxTotalExposurePct: number;
    exposureBudget: number;
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
 * B6 Logic:
 * 1. Calculate risk amount: portfolioValue × (portfolioRiskPerTradePct / 100)
 * 2. Calculate stop distance: |entryPrice - stopPrice|
 * 3. Calculate raw quantity (risk-based): riskAmount / stopDistance
 * 4. Calculate exposure budget: portfolioValue × (maxTotalExposurePct / 100)
 * 5. Calculate maxNotional: exposureBudget × (maxPositionPercentPct / 100)
 * 6. Apply buffer factor to maxNotional
 * 7. Clamp quantity if risk-based notional exceeds bufferedMaxNotional
 * 8. Return quantity and estimatedValue
 * 
 * Returns { quantity: 0, estimatedValue: 0 } for any invalid input
 * (NaN, zero, negative values, malformed data)
 */
export function sizePaperPositionForSignal(params: PaperPositionSizingParams): PaperPositionSizingResult {
  const { portfolioValue, guardrails, entryPrice, stopPrice, symbol, strategy } = params;
  
  const invalidResult: PaperPositionSizingResult = { quantity: 0, estimatedValue: 0 };
  
  if (!Number.isFinite(portfolioValue) || portfolioValue <= 0) {
    console.log(`[B6][SIZING] Invalid portfolioValue (${portfolioValue}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    console.log(`[B6][SIZING] Invalid entryPrice (${entryPrice}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  if (!Number.isFinite(stopPrice) || stopPrice <= 0) {
    console.log(`[B6][SIZING] Invalid stopPrice (${stopPrice}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance === 0 || !Number.isFinite(stopDistance)) {
    console.log(`[B6][SIZING] Invalid stopDistance (${stopDistance}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  const riskPerTradePct = parseFloat(String(guardrails?.portfolioRiskPerTradePct || '1.50'));
  const maxPositionPct = parseFloat(String(guardrails?.maxPositionPercentPct || '10.00'));
  
  const guardrailsAny = guardrails as any;
  const maxTotalExposurePctRaw = guardrailsAny?.maxTotalExposurePct;
  const maxTotalExposurePct = maxTotalExposurePctRaw != null 
    ? parseFloat(String(maxTotalExposurePctRaw)) 
    : 100;
  
  const safeRiskPct = Number.isFinite(riskPerTradePct) && riskPerTradePct > 0 ? riskPerTradePct : 1.50;
  const safeMaxPositionPct = Number.isFinite(maxPositionPct) && maxPositionPct > 0 ? maxPositionPct : 10.00;
  const safeMaxTotalExposurePct = Number.isFinite(maxTotalExposurePct) && maxTotalExposurePct > 0 ? maxTotalExposurePct : 100;
  // Phase 14.5: Pattern pool signals use reduced position sizing (15% vs 25%)
  const signalSourcePool = (signal as any)?.metadata?.sourcePool || 'quant';
  let effectiveMaxPositionPct = safeMaxPositionPct;
  if (signalSourcePool === 'pattern') {
    const patternMaxPct = PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT * 100; // 15
    if (effectiveMaxPositionPct > patternMaxPct) {
      effectiveMaxPositionPct = patternMaxPct;
      console.log(`[14.5][SIZING] Pattern pool signal — capping position at ${patternMaxPct}% (vs ${safeMaxPositionPct}% quant)`);
    }
  }
  
  const riskAmount = (portfolioValue * safeRiskPct) / 100;
  
  let quantity = riskAmount / stopDistance;
  
  if (!Number.isFinite(quantity) || quantity <= 0) {
    console.log(`[B6][SIZING] Invalid risk-based quantity (${quantity}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  const exposureBudget = portfolioValue * (safeMaxTotalExposurePct / 100);
  const maxNotional = exposureBudget * (effectiveMaxPositionPct / 100);
  const bufferedMaxNotional = maxNotional * MAX_POSITION_BUFFER_FACTOR;
  
  let riskBasedNotional = quantity * entryPrice;
  let estimatedValue = riskBasedNotional;
  let wasClamped = false;
  
  if (riskBasedNotional > bufferedMaxNotional) {
    wasClamped = true;
    quantity = bufferedMaxNotional / entryPrice;
    estimatedValue = quantity * entryPrice;
  }

  const correlationScale = getScalingFactor(symbol);
  if (correlationScale < 1) {
    quantity = quantity * correlationScale;
    estimatedValue = quantity * entryPrice;
    console.log(`[9.4][SIZE] ${symbol} scaled ${correlationScale.toFixed(2)}× due to covariance`);
  }
  
  if (!Number.isFinite(quantity) || !Number.isFinite(estimatedValue)) {
    console.log(`[B6][SIZING] Final validation failed for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  console.log(`[B6][SIZING]`, {
    symbol,
    strategy,
    portfolioValue: portfolioValue.toFixed(2),
    riskPct: safeRiskPct.toFixed(2),
    riskAmount: riskAmount.toFixed(2),
    stopDistance: stopDistance.toFixed(8),
    maxTotalExposurePct: safeMaxTotalExposurePct.toFixed(2),
    exposureBudget: exposureBudget.toFixed(2),
    maxPositionPct: safeMaxPositionPct.toFixed(2),
    maxNotional: maxNotional.toFixed(2),
    bufferedMaxNotional: bufferedMaxNotional.toFixed(2),
    riskBasedNotional: riskBasedNotional.toFixed(2),
    quantity: quantity.toFixed(8),
    estimatedValue: estimatedValue.toFixed(2),
    bufferFactor: MAX_POSITION_BUFFER_FACTOR,
    wasClamped
  });
  
  b5SizingAudit.logSizingCalled({
    strategy: strategy,
    symbol,
    entryPrice,
    rawNotional: riskBasedNotional,
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
      maxTotalExposurePct: safeMaxTotalExposurePct,
      exposureBudget,
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
    console.error(`[B6][PORTFOLIO_ERROR] No portfolio balance found from ${source}`);
    throw new Error(`Paper portfolio value not found. Cannot size positions.`);
  }
  
  const parsed = typeof balance === 'number' ? balance : parseFloat(String(balance));
  
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`[B6][PORTFOLIO_ERROR] Invalid portfolio balance: ${balance} from ${source}`);
    throw new Error(`Invalid paper portfolio value: ${balance}. Cannot size positions.`);
  }
  
  return parsed;
}

/**
 * Directive 11.3 — Dynamic Sizing Engine Integration
 * 
 * Applies DSE multiplier to position sizing result.
 * DSE multiplier range: 0.3 to 1.2
 * 
 * This wrapper function takes a standard position sizing result and applies
 * the DSE multiplier to scale the position based on:
 * - Strategy performance (expected edge)
 * - Market volatility (normalized ATR)
 * - Transaction costs (spread + slippage)
 * - Adaptive learning confidence
 */
export interface DSEAdjustedResult extends PaperPositionSizingResult {
  dseMultiplier?: number;
  dseAdjusted?: boolean;
  originalQuantity?: number;
}

export function applyDSEMultiplier(
  result: PaperPositionSizingResult,
  dseMultiplier: number,
  symbol: string
): DSEAdjustedResult {
  if (result.quantity <= 0 || !Number.isFinite(dseMultiplier)) {
    return { ...result, dseAdjusted: false };
  }

  const clampedMultiplier = Math.min(1.2, Math.max(0.3, dseMultiplier));
  const originalQuantity = result.quantity;
  const adjustedQuantity = result.quantity * clampedMultiplier;
  const adjustedValue = adjustedQuantity * (result.estimatedValue / result.quantity);

  console.log(`[11.3][DSE_SIZING] ${symbol} quantity=${originalQuantity.toFixed(8)} → ${adjustedQuantity.toFixed(8)} (×${clampedMultiplier.toFixed(3)})`);

  return {
    ...result,
    quantity: adjustedQuantity,
    estimatedValue: adjustedValue,
    dseMultiplier: clampedMultiplier,
    dseAdjusted: true,
    originalQuantity,
  };
}
