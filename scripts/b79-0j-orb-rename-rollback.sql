-- ============================================================================
-- B79.0j ROLLBACK — restore risk_reward_ratio name
-- ============================================================================
--
-- Reverses the rename in `b79-0j-orb-rename-risk-reward-to-target-range-multiple.sql`.
-- Use ONLY if forward apply needs to be reverted alongside `git revert` of the
-- code commit. The `?? 2.0` fallback in the renamed code means the rollback
-- itself doesn't break behavior — same value either way.
-- ============================================================================

BEGIN;

UPDATE module_constants
SET constant_name = 'risk_reward_ratio',
    updated_at = NOW(),
    updated_by = 'b79.0j-rollback'
WHERE module_name = 'strategy.orb'
  AND asset_class = 'xstock_spot'
  AND constant_name = 'target_range_multiple';

-- Expect: UPDATE 1

COMMIT;
