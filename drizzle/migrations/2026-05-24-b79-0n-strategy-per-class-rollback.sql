-- B79.0n.STRATEGY ROLLBACK — symmetric reverse of 2026-05-24-b79-0n-strategy-per-class.sql
-- NOT auto-run by db:migrate; manual execution if Step 7 verification fails.
--
-- Reverses (per Langston gov flag 1 in Step 2 ACK symmetric-rollback requirement):
--   1. 18 strategy_gates.xstock_spot rows seeded by this batch (set_by filter preserves ORB)
--   2. strategy_settings_audit asset_class column
--   3. strategy_settings UNIQUE constraint + asset_class column (restore original UNIQUE)
--
-- Data NOT removed: strategy_settings rows added by strategy-sync (4 crypto + 38 xstock).
-- Those are inert until UI flips enabled=true; if rollback needed for those, separate
-- DELETE statements scoped by (strategy IN ('strong_bull_trend','orb') AND asset_class='crypto_spot')
-- OR (asset_class='xstock_spot') would be added — but data-rollback is rarely the right move
-- (the rows are inert and removable later via UI).

BEGIN;

-- Step 1: Reverse strategy_gates xstock_spot rows seeded by this batch
-- (set_by='b79-0n-strategy' filter preserves the pre-existing ORB row from B79.0d)
DELETE FROM module_constants
WHERE module_name = 'strategy_gates'
  AND asset_class = 'xstock_spot'
  AND set_by = 'b79-0n-strategy';

-- Step 2: Reverse strategy_settings_audit schema
ALTER TABLE strategy_settings_audit DROP COLUMN IF EXISTS asset_class;

-- Step 3: Reverse strategy_settings schema (restore original UNIQUE, drop column)
DROP INDEX IF EXISTS strategy_settings_global_context_mode_strategy_asset_class_idx;
CREATE UNIQUE INDEX IF NOT EXISTS strategy_settings_global_context_mode_strategy_idx
  ON strategy_settings (global_context_id, mode, strategy);
ALTER TABLE strategy_settings DROP COLUMN IF EXISTS asset_class;

COMMIT;
