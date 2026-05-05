-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-05-05 — B70.3 Path B momentum gate (replaces B68.5 slope gate)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Per Kyle directive 2026-05-05 + Langston cc-inbox #901:
-- 7-day calibration data showed `b68_5_dbs_slope_min` (default 0.0) was
-- producing -2.0pp predictive lift + -0.4480 avg shift in the chain. The
-- slope-derivative gate was binary-suppressing winning signals.
--
-- B70.3 swaps the gate to `mom > b68_5_path_b_momentum_min` (default 0.002 =
-- 0.2% momentum). Momentum is a forward-looking direct measurement of "is
-- this pair still actually moving" rather than a derivative-based "is the
-- DBS reading still rising" check.
--
-- Old constant `b68_5_dbs_slope_min` is retained (not deleted) for back-compat
-- with the ablation counterfactual builder during transition. It has no
-- runtime effect; the classifier reads `b68_5_path_b_momentum_min`.
--
-- Reference: Langston code-level review cc-inbox #901
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by
) VALUES (
  'path_b_sustainability', '*', '*', '*', 'TREND_FRIENDLY_STABLE',
  'b68_5_path_b_momentum_min', '0.002'::jsonb, 'b70-3-path-b-momentum-gate'
)
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

COMMIT;
