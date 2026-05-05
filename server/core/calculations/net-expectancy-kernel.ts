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
  // B63: Path-aware pWin inputs for quant-strong_trend sourcePool.
  // When sourcePool='quant-strong_trend', pWin is derived from |DBS| instead of DI
  // (DBS supersedes DI for strong trends — matches the filter-layer philosophy).
  sourcePool?: string;
  dbsScore?: number;
  // B72 (2026-05-05): caller-injected pWin parameters. Optional for backward
  // compatibility — when omitted, the kernel uses the static seed defaults
  // (matching the module_constants 'expectancy_kernel' / 'directional_integrity'
  // seeded values exactly). Live runtime callers SHOULD inject these from
  // module_constants via getCachedNumberRequired() to enable DB tuning without
  // code redeploy. Kernel itself stays pure-math: no DB access, no I/O.
  minPWin?: number;
  maxPWin?: number;
  diPWinFactor?: number;
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

// B72 (2026-05-05): caller-injection refactor. The defaults here are SEED
// values matching the module_constants 'expectancy_kernel' / 'directional_integrity'
// rows. Callers may override via input.minPWin/maxPWin/diPWinFactor to use the
// DB-tunable values; kernel stays pure-math (no DB access, no I/O).
// See LEVER_INVENTORY.md §11 — Slice 4.
const DEFAULT_MIN_PWIN = 0.40;
const DEFAULT_MAX_PWIN = 0.60;
const DEFAULT_DI_PWIN_FACTOR = 200;

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
    sourcePool,
    dbsScore,
    minPWin = DEFAULT_MIN_PWIN,
    maxPWin = DEFAULT_MAX_PWIN,
    diPWinFactor = DEFAULT_DI_PWIN_FACTOR,
  } = input;

  const distTarget = Math.abs(targetPrice - entryPrice);
  const distStop = Math.abs(entryPrice - stopPrice);

  // B63: Path-aware pWin. Strong-trend pairs get a DBS-magnitude based pWin because
  // DI is no longer a reliable proxy for win probability for those pairs (filter-layer
  // philosophy: DBS supersedes DI for strong trends). Same min/max bounds preserved.
  let pWin: number;
  if (sourcePool === 'quant-strong_trend') {
    const absDbs = Math.abs(dbsScore ?? 0);
    pWin = Math.min(maxPWin, Math.max(minPWin, minPWin + (absDbs / 2)));
  } else {
    pWin = Math.min(maxPWin, Math.max(minPWin, minPWin + (DI / diPWinFactor)));
  }
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
