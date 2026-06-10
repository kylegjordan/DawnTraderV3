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

// B-4.5 (2026-06-11): FEES ARE DB-GOVERNED. DEFAULT_TAKER_FEE / DEFAULT_MAKER_FEE /
// DEFAULT_COST_BUNDLE / computeDefaultTotalCost() are RETIRED — fee rates live in
// module_constants module 'fee_model' (per asset_class, Kraken cross-platform
// Tier 1: taker 0.008 / maker 0.004 decimal), warmed at boot (b72-warmup,
// fail-hard) and merged at the SINGLE site cost-model.getFrictionForAssetClass.
// The old 0.0026/0.0016 here corresponded to ~Tier 6 (~$100K 30-day volume) —
// a silently optimistic model at this account's Tier-1 standing (B-4.5 scope).
export const DEFAULT_SLIPPAGE = 0.0005;     // 0.05% - Execution price drift
export const DEFAULT_SPREAD = 0.0010;       // 0.10% - Bid/ask liquidity cost
// B-4.5: raised 0.01 -> 0.02. This per-COMPONENT sanity ceiling (enforced at
// cost-cache.setCostMetrics) must clear the Tier-1 taker fee 0.008 with real
// headroom while still catching fat-fingered DB values; 0.01 left ZERO headroom
// above 0.008 and would silently clamp any DB-set value >1%.
export const MAX_COST_BOUND = 0.02;         // 2.00% - Maximum allowed cost component
