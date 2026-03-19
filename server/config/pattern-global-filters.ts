/**
 * Pattern Global Filters — Phase 14.5 (Batch 19F)
 *
 * Separate global filter thresholds for the pattern scanning path.
 * These are applied in collectAdaptiveBatch() as a second pass
 * alongside the standard quant global filters.
 *
 * Research basis (Session 7, 2026-03-18):
 * - Patterns work at lower volumes than quant strategies
 * - Patterns tolerate wider spreads (target larger moves)
 * - Patterns need less history (form in 1-3 candles)
 */

export const PATTERN_GLOBAL_FILTERS = {
  MIN_VOLUME_USD: 250_000,      // vs $500K quant — patterns work at lower volumes
  MAX_BID_ASK_SPREAD: 1.0,     // vs 0.5% quant — patterns target larger moves
  MIN_HISTORY_DAYS: 14,         // vs 30-90d quant — patterns form on short timeframes
  // MIN_PRICE: Same as quant (inherited from screener_filters)
  // EXCLUDE_STABLECOINS: Same as quant (always true)
};

// VTS Pattern Global Filters (passive learning)
export const VTS_PATTERN_GLOBAL_FILTERS = {
  MIN_VOLUME_USD: 250_000,      // Same as active — patterns need minimum volume regardless
  MAX_BID_ASK_SPREAD: 1.5,     // Slightly more relaxed for VTS exploration
  MIN_HISTORY_DAYS: 14,         // Same as active
};
