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

export function computeNetTargetFloor(targetPrice: number, costs: CostComponents): number {
  const totalCost = computeTotalRoundTripCost(costs.fee, costs.slippage, costs.spread);
  return targetPrice * (1 - totalCost / 2);
}

export const DEFAULT_FEE = DEFAULT_TAKER_FEE;
export { DEFAULT_SLIPPAGE, DEFAULT_SPREAD, MAX_COST_BOUND };
