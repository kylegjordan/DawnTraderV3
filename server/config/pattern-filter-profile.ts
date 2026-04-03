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
 * @deprecated Batch 19G: Static defaults moved to DB (screener_filters, filterPath='active_pattern').
 * Retained only for guardrails/strategies export and RSI defaults not yet in DB.
 */
export const PATTERN_POOL_THRESHOLDS = {
  MIN_VOLUME_USD: 250_000,      // DB: screener_filters.min_volume where filterPath='active_pattern'
  LQ_MIN: 20,                   // DB: screener_filters.lq_min where filterPath='active_pattern'
  VN_MAX: 0.98,                 // DB: screener_filters.vn_max where filterPath='active_pattern'
  DI_TRENDING_MIN: 5,           // DB: screener_filters.di_min where filterPath='active_pattern'
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
export type SourcePool = 'quant-trend' | 'quant-reversal' | 'quant-breakout' | 'quant-oscillation' | 'pattern' | 'hybrid';
export type AssetClass = 'crypto_spot'; // Extend when new asset classes added
