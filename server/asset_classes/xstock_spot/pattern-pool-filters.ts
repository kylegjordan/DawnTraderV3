/**
 * B79 — Xstock-spot pattern-pool guardrails.
 *
 * Companion to `server/asset_classes/crypto_spot/pattern-pool-filters.ts`
 * (the canonical reference shape). Per scope §-2.3 + Langston rev 7
 * acceptance: xstock_spot inherits the crypto_spot pattern-pool guardrail
 * VALUES until Layer 3 shadow-mode evidence drives equity-specific tuning.
 *
 * The DB-backed module_constants seeds (committed in
 * 2026-05-07-b79-xstock-module-constants.sql) hold the runtime-tunable
 * authoritative values:
 *   - pattern_pool_gates.xstock_spot.*.final_score_floor = 0.45
 *   - pattern_pool_gates.xstock_spot.*.max_position_pct = 0.50
 *
 * This TS module exports the SAME defaults as fallback for code paths
 * that read TS constants (tests, type definitions, audit scripts) before
 * module_constants warmup completes. Production callers should resolve
 * via `getCachedNumberRequired()` to get the live DB value.
 *
 * NO IMPORTS at this leaf level (matches crypto_spot/pattern-pool-filters.ts).
 */

/**
 * Minimum final_score (post regime-weighting + cost-model gating) required
 * for a pattern-path candidate to admit. ELEVATED relative to quant path
 * (~0.35) because pattern-pool relaxations shift more responsibility to
 * scoring quality.
 */
export const XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR = 0.45;

/**
 * Cap on portfolio position size for any pattern-pool candidate, expressed
 * as a fraction of the per-asset-class base allocation. Pattern signals
 * are lower-confidence by design; the sizing cap protects against
 * over-allocation to noisy fires.
 */
export const XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT = 0.50;

/** Combined guardrail bundle, frozen for safe pass-through. */
export const XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS = Object.freeze({
  finalScoreFloor: XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR,
  maxPositionPct: XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT,
});
