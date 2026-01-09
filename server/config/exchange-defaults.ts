/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3B — Centralized Exchange Default Constants
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Single source of truth for exchange fee/cost parameters.
 * All cost-sensitive modules import from here only.
 * Future exchange adapters will override these values here.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export const DEFAULT_TAKER_FEE = 0.0026;    // 0.26% - Kraken taker fee (conservative)
export const DEFAULT_MAKER_FEE = 0.0016;    // 0.16% - Kraken maker fee
export const DEFAULT_SLIPPAGE = 0.0005;     // 0.05% - Execution price drift
export const DEFAULT_SPREAD = 0.0010;       // 0.10% - Bid/ask liquidity cost
export const MAX_COST_BOUND = 0.01;         // 1.00% - Maximum allowed cost component

export const DEFAULT_COST_BUNDLE = {
  fee: DEFAULT_TAKER_FEE,
  slippage: DEFAULT_SLIPPAGE,
  spread: DEFAULT_SPREAD,
};

export function computeDefaultTotalCost(): number {
  return (DEFAULT_TAKER_FEE * 2) + (DEFAULT_SLIPPAGE * 2) + DEFAULT_SPREAD;
}
