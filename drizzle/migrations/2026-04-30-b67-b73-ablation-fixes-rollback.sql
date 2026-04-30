-- Rollback for 2026-04-30-b67-b73-ablation-fixes.sql
DROP INDEX IF EXISTS regime_factor_alternates_natural_key_idx;
ALTER TABLE regime_factor_alternates DROP COLUMN IF EXISTS strategy;
-- Note: deleted exit_strategy_alternates rows are not recoverable.
