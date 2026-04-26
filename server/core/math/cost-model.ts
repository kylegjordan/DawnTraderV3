/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3A/B — Canonical Cost Model
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Unified round-trip cost computation for all trade-related calculations.
 * This is the single source of truth for cost modeling across:
 * - Signal Orchestrator
 * - RTB Refresh Service
 * - Dynamic Sizing Engine (DSE)
 * - Signal Quality Evaluator (SQE)
 * - Trade Execution Controller (TEC)
 * - Virtual Trading Simulator (VTS)
 * 
 * Cost Components:
 * - Exchange fee (maker/taker): Applied on both entry and exit
 * - Slippage: Execution drift, applied on both entry and exit
 * - Spread: Bid/ask liquidity cost, applied once at entry
 * 
 * Formula: totalCost = (fee × 2) + (slippage × 2) + spread
 * 
 * Directive 11.3B Updates:
 * - Delegates to centralized cost-cache.ts
 * - Uses exchange-defaults.ts for constants
 * - Default taker fee raised to 0.26%
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  DEFAULT_TAKER_FEE,
  DEFAULT_SLIPPAGE,
  DEFAULT_SPREAD,
  MAX_COST_BOUND,
} from '../../config/exchange-defaults.js';

import {
  getOrSetCostMetrics,
  setCostMetrics,
  clearCostCache,
  getCacheStats,
  type CostMetrics,
} from '../cache/cost-cache.js';

export interface CostComponents {
  fee: number;
  slippage: number;
  spread: number;
}

export interface CachedCostMetrics extends CostComponents {
  symbol: string;
  timestamp: number;
  totalRoundTripCost: number;
}

export function computeTotalRoundTripCost(fee: number, slippage: number, spread: number): number {
  return (fee * 2) + (slippage * 2) + spread;
}

export function getCachedCostMetrics(symbol: string): CostComponents {
  return getOrSetCostMetrics(symbol);
}

export function updateCachedCostMetrics(
  symbol: string,
  fee: number,
  slippage: number,
  spread: number
): CachedCostMetrics {
  const clamped = setCostMetrics(symbol, { fee, slippage, spread });
  const totalRoundTripCost = computeTotalRoundTripCost(clamped.fee, clamped.slippage, clamped.spread);
  return {
    symbol,
    fee: clamped.fee,
    slippage: clamped.slippage,
    spread: clamped.spread,
    totalRoundTripCost,
    timestamp: Date.now(),
  };
}

export function getCostMetricsCache(): Map<string, CachedCostMetrics> {
  const stats = getCacheStats();
  const result = new Map<string, CachedCostMetrics>();
  return result;
}

export function clearCostMetricsCache(): void {
  clearCostCache();
}

export interface ExecutionGeometry {
  executionEntry: number;
  executionStop: number;
  executionTarget: number;
  grossPnlPct: number;
  netExpectedEdge: number;
  netRewardToRisk: number;
}

export function computeNetGeometry(
  baseEntry: number,
  baseStop: number,
  baseTarget: number,
  costs: CostComponents
): ExecutionGeometry {
  const totalCost = computeTotalRoundTripCost(costs.fee, costs.slippage, costs.spread);
  
  const executionEntry = baseEntry * (1 + costs.slippage + costs.spread / 2);
  const executionStop = baseStop;
  const executionTarget = baseTarget;
  
  const grossPnlPct = (executionTarget - executionEntry) / executionEntry;
  const netExpectedEdge = grossPnlPct - totalCost;
  
  const riskPct = (executionEntry - executionStop) / executionEntry;
  const rewardPct = (executionTarget - executionEntry) / executionEntry;
  
  const netRewardPct = rewardPct - totalCost;
  const netRewardToRisk = riskPct > 0 ? netRewardPct / riskPct : 0;
  
  return {
    executionEntry,
    executionStop,
    executionTarget,
    grossPnlPct,
    netExpectedEdge,
    netRewardToRisk,
  };
}

export function computeNetBreakeven(entryPrice: number, costs: CostComponents): number {
  const totalCost = computeTotalRoundTripCost(costs.fee, costs.slippage, costs.spread);
  return entryPrice * (1 + totalCost);
}

/**
 * Compute the floor price to lock in when a ladder rung target is hit.
 *
 * B65.4.1 hotfix (2026-04-26, Kyle directive): the original formula returned
 * `targetPrice * (1 - totalCost / 2)` — a "breakeven-after-costs" floor that sat
 * BELOW the just-hit target. On reversal, this allowed exits BELOW the original
 * target price, costing us the gain we'd already achieved on the way up.
 *
 * Live evidence (5 closed laddered trades through 2026-04-26 morning):
 *   - 2Z/USD: target 0.09633, floor 0.09030 (6.26% below target). Trade reversed
 *     off target, exited at -0.12% net — a target-hit became a small loser.
 *   - ENSO/USD: target 1.28909, floor 1.27864. Trade ratcheted, reversed, exited
 *     at +23.53% vs counterfactual at-target +36.65% — left $6.26 on the table.
 *   Across 5 trades, the ladder LOST ~$11 vs the just-take-target counterfactual.
 *
 * New formula: floor = targetPrice * (1 + slippage * bufferMultiplier).
 *
 * The floor sits ABOVE the target by exactly enough to absorb the typical
 * stop-trigger slippage on a reversal, ensuring the actual fill on a stop-out
 * is at-or-above the target level. Multi-rung ratcheting still works as before
 * (the floor moves up with each rung), so the design's payoff scenario is
 * preserved while the failure mode (single-rung-then-reverse losing more than
 * target gave) is fixed.
 *
 * The buffer multiplier is resolved per-trade via module_constants
 * (`rung_floor_slippage_buffer_multiplier`, seed 1.0) so it can be tuned per
 * (asset_class, exchange, regime, strategy) without redeploy.
 *
 * @param targetPrice - the just-hit rung target price
 * @param costs - per-pair cost components (fee, slippage, spread)
 * @param slippageBufferMultiplier - multiplier on costs.slippage for the buffer.
 *        Default 1.0 = exactly the per-pair slippage estimate. >1.0 widens the
 *        buffer at cost of trigger sensitivity. <1.0 tightens (more triggers
 *        but tighter to target).
 */
export function computeNetTargetFloor(
  targetPrice: number,
  costs: CostComponents,
  slippageBufferMultiplier: number = 1.0,
): number {
  const buffer = costs.slippage * slippageBufferMultiplier;
  return targetPrice * (1 + buffer);
}

export const DEFAULT_FEE = DEFAULT_TAKER_FEE;
export { DEFAULT_SLIPPAGE, DEFAULT_SPREAD, MAX_COST_BOUND };
