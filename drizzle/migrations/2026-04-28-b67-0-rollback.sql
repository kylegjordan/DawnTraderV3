-- B67.0 Rollback — undo regime-factor-alternates table + module_constants seeds
--
-- Drops the regime_factor_alternates table and removes the 3 module_constants
-- entries seeded by 2026-04-28-b67-0-regime-factor-alternates.sql.
--
-- Use only if B67.0 deploy needs to be backed out. Captures the entire B67.0
-- schema delta. Does NOT delete downstream consumers (factor-ablation-emitter.ts,
-- replay-ablation.ts, etc.) — those should be removed via git revert separately.

BEGIN;

DROP INDEX IF EXISTS regime_factor_alternates_pair_time_idx;
DROP INDEX IF EXISTS regime_factor_alternates_pending_replay_idx;
DROP INDEX IF EXISTS regime_factor_alternates_vts_trade_idx;
DROP INDEX IF EXISTS regime_factor_alternates_signal_idx;
DROP INDEX IF EXISTS regime_factor_alternates_factor_time_idx;

DROP TABLE IF EXISTS regime_factor_alternates;

DELETE FROM module_constants
WHERE module_name = 'ablation_framework'
  AND constant_name IN (
    'b67_0_ablation_emit_enabled',
    'b67_0_alternates_retention_days',
    'b67_0_paper_replay_capital_threshold_pct'
  );

COMMIT;
