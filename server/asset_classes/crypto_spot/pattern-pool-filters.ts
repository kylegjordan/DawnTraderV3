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
 * B72 (2026-05-05): RSI bounds + Pattern Pool guardrails moved to
 * module='pattern_pool_gates' (asset_class=crypto_spot, strategy=pattern).
 * Backward-compatible accessors (Object.defineProperty getters) preserve the
 * existing import shape — callers keep using `PATTERN_POOL_THRESHOLDS.RSI_MIN`
 * etc. without code change; the read goes through the cached resolver.
 */
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

const _PATTERN_KEY = { exchange: '*', assetClass: 'crypto_spot', strategy: 'pattern', regime: '*' };

export const PATTERN_POOL_THRESHOLDS = {
  get RSI_MIN(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_rsi_min', _PATTERN_KEY); },
  get RSI_MAX(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_rsi_max', _PATTERN_KEY); },
};

// --- Pattern Pool Guardrails ---
// Elevated quality floor compensates for lower-quality pair metrics
// Position sizing capped to reflect higher uncertainty of pattern-pool pairs

export const PATTERN_POOL_GUARDRAILS = {
  get FINAL_SCORE_FLOOR(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_final_score_min', _PATTERN_KEY); },
  get MAX_POSITION_PCT(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_max_position_pct', _PATTERN_KEY); },
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

// B79.0n.PATTERN-DETECT (2026-05-24) — AssetClass type unification.
// Previously this file declared `export type AssetClass = 'crypto_spot'` — a
// narrow literal that shadowed the canonical shared type and gave consumers
// (e.g. active-filter-pool.ts) a crypto-only guarantee that didn't match the
// multi-class reality. Now re-exports the canonical taxonomy from
// `@shared/asset-classes` so every importer of this file picks up the full
// AssetClass union. SourcePool stays here (semantic-aligned with pool concept).
export type { AssetClass } from '@shared/asset-classes';
