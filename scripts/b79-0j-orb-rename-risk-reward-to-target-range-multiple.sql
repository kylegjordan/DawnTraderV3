-- ============================================================================
-- B79.0j — Rename ORB module_constant: risk_reward_ratio → target_range_multiple
-- ============================================================================
--
-- Resolves RUNNING_ISSUES #90 (Langston B79.0d Step 4 F1 finding).
--
-- Pure rename. Same value 2.0, same scope, same all other columns. Only
-- the constant_name column changes.
--
-- The renamed code at server/strategies/orb.ts:196 reads `target_range_multiple`
-- with `?? 2.0` fallback, so the deploy-window bridge state is safe regardless
-- of SQL/code ordering — same value either way.
--
-- Apply BEFORE code deploy (preferred) so the new key is resolvable from first
-- ORB fire (Monday 2026-05-11 14:30 UTC).
--
-- Verification post-apply:
--   SELECT constant_name FROM module_constants
--   WHERE module_name='strategy.orb' AND asset_class='xstock_spot'
--     AND constant_name IN ('risk_reward_ratio','target_range_multiple');
--   -- Expect: one row, target_range_multiple. Zero rows for risk_reward_ratio.
-- ============================================================================

BEGIN;

UPDATE module_constants
SET constant_name = 'target_range_multiple',
    updated_at = NOW(),
    updated_by = 'b79.0j-rename'
WHERE module_name = 'strategy.orb'
  AND asset_class = 'xstock_spot'
  AND constant_name = 'risk_reward_ratio';

-- Expect: UPDATE 1

COMMIT;
