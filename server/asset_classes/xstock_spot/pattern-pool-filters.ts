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
 *   - pattern_max_position_pct = 0.50   (was: max_position_pct  — renamed)
 *
 * Elevated relative to quant path (~0.35 floor) because pattern-pool
 * relaxations shift more responsibility to scoring quality. The 0.50
 * position cap is higher than crypto's 0.15 cap by intentional design (xStock
 * sizing band per B79.0m.b2 — verified during xstock pattern path
 * commissioning).
 */
export const XSTOCK_PATTERN_POOL_GUARDRAILS = {
  get FINAL_SCORE_FLOOR(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_final_score_min', _PATTERN_KEY); },
  get MAX_POSITION_PCT(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_max_position_pct', _PATTERN_KEY); },
  // NO MAX_CONCURRENT — merit-based competition within normal risk limits
  // (same posture as crypto-side guardrails).
};

// ════════════════════════════════════════════════════════════════════════════
// Legacy literal exports — DEPRECATED SHIM (Phase 16 removal target)
// ════════════════════════════════════════════════════════════════════════════
// Zero importers verified at B79.0n.PATTERN-DETECT Step 2 pre-audit §-0 grep
// (full corpus: server/, shared/, scripts/). These const exports were the
// pre-batch file's only public surface and remain here as belt-and-suspenders
// forward-load per Langston Step 2 ACK. Future Phase 16 cleanup deletes
// alongside other userId-coupled legacy. RUNNING_ISSUES #136 (u).

/** @deprecated B79.0n.PATTERN-DETECT — use XSTOCK_PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR. Phase 16 removal. */
export const XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR = 0.45;

/** @deprecated B79.0n.PATTERN-DETECT — use XSTOCK_PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT. Phase 16 removal. */
export const XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT = 0.50;

/** @deprecated B79.0n.PATTERN-DETECT — use XSTOCK_PATTERN_POOL_GUARDRAILS. Phase 16 removal. */
export const XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS = Object.freeze({
  finalScoreFloor: XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR,
  maxPositionPct: XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT,
});
