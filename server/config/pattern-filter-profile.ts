/**
 * Pattern Filter Profile — Phase 14.5 (Batch 19 + 19C)
 *
 * Defines relaxed filter thresholds for the pattern scanning pool.
 * Pairs that fail quant metric filters but pass these thresholds
 * enter the pattern pool for evaluation by PATTERN + HYBRID strategies.
 *
 * Design decisions (three-way discussion, 2026-03-17):
 * - Merit-based: no hard concurrent cap on pattern trades
 * - sourcePool tracks active filter path (quant/pattern), separate from VTS pool
 * - Pattern sizing surfaced in Guardrails as 15% display-only
 *
 * Batch 19C: Regime-aware thresholds — FX5 selects threshold set based on
 * MCE getDominantRegime() global regime. Fallback to static defaults when
 * regime is unknown or MCE cache is cold.
 */

import type { CanonicalRegimeType } from './canonical-regime-strategy-map.js';

// --- Pattern Pool Filter Thresholds (Static Defaults) ---
// Applied to pairs that FAIL quant metric filters (LQ>=35, VN<=0.93, Vol>=$500K, DI>=55)
// These are intentionally relaxed to admit pairs where pattern/hybrid strategies can operate

export const PATTERN_POOL_THRESHOLDS = {
  MIN_VOLUME_USD: 250_000,      // vs $500K quant — patterns work at lower volumes
  LQ_MIN: 20,                   // vs 35 quant — lower liquidity OK for pattern formations
  VN_MAX: 0.98,                 // vs 0.93 quant — patterns thrive at inflection points (higher volatility)
  DI_TRENDING_MIN: 30,          // vs 55 quant — patterns don't need strong directional trends
  RSI_MIN: 15,                  // wider RSI band for reversal patterns
  RSI_MAX: 85,                  // wider RSI band for reversal patterns
};

// --- Regime-Aware Pattern Pool Thresholds (Batch 19C) ---
// Each canonical regime gets a tailored threshold set.
// Rationale per regime:
//   TREND_FRIENDLY_STABLE:    Loosen — patterns thrive in trending markets, lower barriers
//   HIGH_VOLATILITY_UNSTABLE: Tighten — raise floors to avoid noise-dominated pairs
//   RANGE_BOUND_STABLE:       Default — patterns work well in range-bound, keep relaxed
//   IMPULSE_EXPANSION:        Moderate — keep DI floor, slightly tighten VN
//   STRUCTURAL_TRANSITION:    Tighten — raise quality floors during regime transitions

export const REGIME_PATTERN_THRESHOLDS: Record<string, typeof PATTERN_POOL_THRESHOLDS> = {
  TREND_FRIENDLY_STABLE: {
    MIN_VOLUME_USD: 200_000,
    LQ_MIN: 18,
    VN_MAX: 0.96,
    DI_TRENDING_MIN: 25,
    RSI_MIN: 15,
    RSI_MAX: 85,
  },
  HIGH_VOLATILITY_UNSTABLE: {
    MIN_VOLUME_USD: 300_000,
    LQ_MIN: 25,
    VN_MAX: 0.95,
    DI_TRENDING_MIN: 35,
    RSI_MIN: 20,
    RSI_MAX: 80,
  },
  RANGE_BOUND_STABLE: {
    MIN_VOLUME_USD: 250_000,
    LQ_MIN: 20,
    VN_MAX: 0.98,
    DI_TRENDING_MIN: 20,
    RSI_MIN: 15,
    RSI_MAX: 85,
  },
  IMPULSE_EXPANSION: {
    MIN_VOLUME_USD: 250_000,
    LQ_MIN: 20,
    VN_MAX: 0.97,
    DI_TRENDING_MIN: 30,
    RSI_MIN: 15,
    RSI_MAX: 85,
  },
  STRUCTURAL_TRANSITION: {
    MIN_VOLUME_USD: 300_000,
    LQ_MIN: 22,
    VN_MAX: 0.96,
    DI_TRENDING_MIN: 30,
    RSI_MIN: 18,
    RSI_MAX: 82,
  },
};

/**
 * Get pattern pool thresholds for the current global regime.
 * Falls back to static PATTERN_POOL_THRESHOLDS if regime is unknown.
 */
export function getPatternPoolThresholds(regime: string | null | undefined): typeof PATTERN_POOL_THRESHOLDS {
  if (regime && REGIME_PATTERN_THRESHOLDS[regime]) {
    return REGIME_PATTERN_THRESHOLDS[regime];
  }
  return PATTERN_POOL_THRESHOLDS;
}

// --- Pattern Pool Guardrails ---
// Elevated quality floor compensates for lower-quality pair metrics
// Position sizing capped to reflect higher uncertainty of pattern-pool pairs

export const PATTERN_POOL_GUARDRAILS = {
  FINAL_SCORE_FLOOR: 0.45,      // elevated vs 0.35 quant — only best pattern signals pass SQE
  MAX_POSITION_PCT: 0.15,       // 15% max portfolio per trade (vs 25% quant default)
  // NO MAX_CONCURRENT — merit-based competition within normal risk limits (Kyle decision)
};

// --- Pattern Pool Strategy List ---
// Only these strategies are evaluated against pattern-pool pairs.
// Quant strategies are excluded because pattern-pool pairs lack the
// liquidity/trend characteristics quant strategies require.

export const PATTERN_POOL_STRATEGIES: string[] = [
  // PATTERN type (3 strategies)
  'morning_star',
  'inside_bar_reversal',
  'support_bounce',
  // HYBRID type (5 strategies)
  'pivot_shift',
  'reverse_impulse',
  'defensive_hedge',
  'adaptive_flow',
  'volatility_edge',
];

// --- Asset Class Default ---
// Future-proofing for xStocks, futures, etc.
export const DEFAULT_ASSET_CLASS = 'crypto_spot';

// --- Source Pool Types ---
export type SourcePool = 'quant' | 'pattern' | 'hybrid';
export type AssetClass = 'crypto_spot'; // Extend when new asset classes added
