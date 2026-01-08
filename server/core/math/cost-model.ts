/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3A — Canonical Cost Model
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
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

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

const costMetricsCache = new Map<string, CachedCostMetrics>();
const CACHE_TTL_MS = 60_000;

const DEFAULT_FEE = 0.0025;
const DEFAULT_SLIPPAGE = 0.0005;
const DEFAULT_SPREAD = 0.001;

export function computeTotalRoundTripCost(fee: number, slippage: number, spread: number): number {
  return (fee * 2) + (slippage * 2) + spread;
}

export function getCachedCostMetrics(symbol: string): CostComponents {
  const cached = costMetricsCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      fee: cached.fee,
      slippage: cached.slippage,
      spread: cached.spread,
    };
  }
  return {
    fee: DEFAULT_FEE,
    slippage: DEFAULT_SLIPPAGE,
    spread: DEFAULT_SPREAD,
  };
}

export function updateCachedCostMetrics(
  symbol: string,
  fee: number,
  slippage: number,
  spread: number
): CachedCostMetrics {
  const totalRoundTripCost = computeTotalRoundTripCost(fee, slippage, spread);
  const metrics: CachedCostMetrics = {
    symbol,
    fee,
    slippage,
    spread,
    totalRoundTripCost,
    timestamp: Date.now(),
  };
  costMetricsCache.set(symbol, metrics);
  return metrics;
}

export function getCostMetricsCache(): Map<string, CachedCostMetrics> {
  return new Map(costMetricsCache);
}

export function clearCostMetricsCache(): void {
  costMetricsCache.clear();
  console.log('[11.3A][CostModel] Cache cleared');
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
  
  // Directive 11.3A: Net Reward-to-Risk = (gross reward - total cost) / risk
  // This correctly computes the net profit potential per unit of risk
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

export { DEFAULT_FEE, DEFAULT_SLIPPAGE, DEFAULT_SPREAD };
