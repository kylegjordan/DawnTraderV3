/**
 * Pattern Filter Profile — Phase 14.5 (Batch 19)
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
 * Batch 48: Regime-aware pattern thresholds (Batch 19C) REMOVED per Kyle directive.
 * DB screener_filters is the sole authority for all IMF thresholds.
 * No code-driven regime overrides for any filter thresholds.
 */

// --- Pattern Pool Filter Thresholds (Static Defaults) ---
// Applied to pairs that FAIL quant metric filters (LQ>=35, VN<=0.93, Vol>=$500K, DI>=55)
// These are intentionally relaxed to admit pairs where pattern/hybrid strategies can operate

/**
 * B54 Fix 4: All numeric filter thresholds (LQ_MIN, VN_MAX, DI_TRENDING_MIN, MIN_VOLUME_USD)
 * removed — DB screener_filters is sole authority. Only RSI bounds retained (not yet in DB).
 * No code anywhere imports the removed values; this object is kept only for RSI defaults.
 */
export const PATTERN_POOL_THRESHOLDS = {
  RSI_MIN: 15,                  // Not yet in DB — stays hardcoded
  RSI_MAX: 85,                  // Not yet in DB — stays hardcoded
};

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
// B63: Added 'quant-strong_trend' for Path D (|DBS| >= 0.35 LONG-only routing).
// Note: scanner generates sourcePool as `quant-${family}` — family name is 'strong_trend' (underscore).
// The 'quant-oscillation' entry appears to be a pre-existing typo (scanner generates 'quant-oscillator').
// Not fixing that pre-existing inconsistency here; following the scanner's actual output naming for the new entry.
export type SourcePool = 'quant-trend' | 'quant-reversal' | 'quant-breakout' | 'quant-oscillation' | 'quant-strong_trend' | 'pattern' | 'hybrid';
export type AssetClass = 'crypto_spot'; // Extend when new asset classes added
