/**
 * B79 — Xstock-spot pattern-pool guardrails.
 *
 * Companion to `server/asset_classes/crypto_spot/pattern-pool-filters.ts`
 * (the canonical reference shape).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * B79.0n.PATTERN-DETECT (2026-05-24) — file rewrite
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Pre-batch shape: 44-line constants-only leaf with hardcoded TS literals
 * (`XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR = 0.45` + `XSTOCK_SPOT_PATTERN_MAX_
 * POSITION_PCT = 0.50`). Zero production importers — pure forward-load
 * scaffolding from the B79_inherit_crypto era. Comments referred to a DB
 * naming convention that drifted: rows seeded as `final_score_floor` /
 * `max_position_pct` on xstock_spot while crypto-side used the
 * `pattern_final_score_min` / `pattern_max_position_pct` convention.
 *
 * Post-batch shape: mirrors crypto-side `Object.defineProperty` getter
 * pattern from `crypto_spot/pattern-pool-filters.ts`. RSI bounds + Pattern
 * Pool guardrails all resolve through `getCachedNumberRequired` against the
 * `pattern_pool_gates` module with `assetClass='xstock_spot'` scoping. The
 * DB rows were renamed in `2026-05-24b-b79-0n-pattern-detect-naming-
 * converge.sql` to match crypto's convention — so the resolver-key shapes
 * are byte-identical across asset classes (only the `assetClass` field of
 * `_PATTERN_KEY` differs).
 *
 * Langston Step 1 ACK Q-C (Option a): xstock RSI bounds seeded with crypto
 * defaults (15 / 85). Layer-3 xStock-specific tuning deferred until
 * shadow-mode evidence accumulates.
 *
 * Legacy literal exports kept as `@deprecated` shim for back-compat (zero
 * importers verified at Step 2 pre-audit §-0 grep). Delete in Phase 16 per
 * RUNNING_ISSUES #136 (u) — the shim is pure belt-and-suspenders per
 * Langston Step 2 ACK §-0.
 *
 * NO IMPORTS at the leaf type level — but the getters require the resolver,
 * so the import-of-resolver is intentional and matches the crypto-side file.
 */

import { getCachedNumberRequired } from '../../services/module-constants-service.js';

const _PATTERN_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: 'pattern', regime: '*' };

/**
 * B79.0n.PATTERN-DETECT — xstock RSI bounds for pattern pool (mirrors
 * crypto-side `PATTERN_POOL_THRESHOLDS`). Reads through cached resolver.
 *
 * Day-1 values: pattern_rsi_min=15 + pattern_rsi_max=85 (cloned from
 * crypto). Layer-3 calibration will tune these from xStock-specific
 * pattern signal-quality evidence.
 */
export const XSTOCK_PATTERN_POOL_THRESHOLDS = {
  get RSI_MIN(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_rsi_min', _PATTERN_KEY); },
  get RSI_MAX(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_rsi_max', _PATTERN_KEY); },
};

/**
 * B79.0n.PATTERN-DETECT — xstock pattern-pool guardrails (mirrors crypto-side
 * `PATTERN_POOL_GUARDRAILS`).
 *
 * Day-1 values (post-rename migration):
 *   - pattern_final_score_min  = 0.45   (was: final_score_floor — renamed)
 *
 * Elevated relative to quant path (~0.35 floor) because pattern-pool
 * relaxations shift more responsibility to scoring quality. (The pattern-list position
 * size cap, `pattern_max_position_pct`, was removed in B-SIZING-DEC-RESTORE 2e, Kyle 2026-09-30.)
 */
export const XSTOCK_PATTERN_POOL_GUARDRAILS = {
  get FINAL_SCORE_FLOOR(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_final_score_min', _PATTERN_KEY); },
  // NO MAX_CONCURRENT — merit-based competition within normal risk limits
  // (same posture as crypto-side guardrails).
};

// (The three `@deprecated` XSTOCK_SPOT_PATTERN_* literal exports — a Phase-16 removal shim with zero importers —
// were deleted in B-SIZING-DEC-RESTORE 2e, rule 18: touched, so deleted, not left. DELETED_COMPONENTS_LOG.)
