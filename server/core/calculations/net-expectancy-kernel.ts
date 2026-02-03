/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.8B-A — Net Expectancy Kernel (Pure Math Authority)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Single source of truth for Net EV calculation math.
 * 
 * This kernel is:
 * - Synchronous (no async)
 * - Pure (no side effects)
 * - No logging
 * - No I/O
 * - No database or telemetry access
 * 
 * All Net EV calculations in the codebase MUST either:
 * 1. Call evaluateTradeExpectancy() from expectancy.ts, or
 * 2. Call this kernel directly for high-throughput systems (DSS, RTB)
 * 
 * Mathematical Foundation:
 * - Pwin = 0.40 + (DI / 200), capped at [0.40, 0.60]
 * - Ploss = 1 - Pwin
 * - RawEV = (Pwin × DistTarget) - (Ploss × DistStop)
 * - TotalCost = fees + spread + slippage (friction)
 * - NetEV = RawEV - TotalCost
 * - NetRewardToRisk = NetEV / DistStop (if valid)
 * 
 * Schema: v1.0.0
 * Governance: Directive 11.8B-A
 * ══════════════════════════════════════════════════════════════════════════════
 */

export interface NetExpectancyKernelInput {
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  /** Total friction cost (fees + spread + slippage) - single canonical value */
  totalFriction: number;
  DI?: number;
  volNoise?: number;
}

export interface NetExpectancyKernelResult {
  netEV: number;
  rawEV: number;
  netRewardToRisk: number;
  totalCost: number;
  pWin: number;
  pLoss: number;
  distTarget: number;
  distStop: number;
}

const MIN_PWIN = 0.40;
const MAX_PWIN = 0.60;
const DI_PWIN_FACTOR = 200;

/**
 * Pure math kernel for Net Expectancy calculation.
 * 
 * This function performs ONLY the core math with zero side effects.
 * It is safe to call from high-throughput systems like DSS and RTB.
 * 
 * @param input - Trade parameters including prices, costs, and optional metrics
 * @returns NetExpectancyKernelResult with netEV, rawEV, costs, and derived values
 */
export function computeNetExpectancyKernel(input: NetExpectancyKernelInput): NetExpectancyKernelResult {
  const {
    entryPrice,
    stopPrice,
    targetPrice,
    totalFriction,
    DI = 50,
  } = input;

  const distTarget = Math.abs(targetPrice - entryPrice);
  const distStop = Math.abs(entryPrice - stopPrice);

  const pWin = Math.min(MAX_PWIN, Math.max(MIN_PWIN, MIN_PWIN + (DI / DI_PWIN_FACTOR)));
  const pLoss = 1 - pWin;

  const rawEV = (pWin * distTarget) - (pLoss * distStop);
  const netEV = rawEV - totalFriction;

  const netRewardToRisk = distStop > 0 ? netEV / distStop : 0;

  return {
    netEV,
    rawEV,
    netRewardToRisk,
    totalCost: totalFriction,
    pWin,
    pLoss,
    distTarget,
    distStop,
  };
}
