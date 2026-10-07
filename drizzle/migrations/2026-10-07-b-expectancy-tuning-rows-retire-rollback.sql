-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 2026-10-07-b-expectancy-tuning-rows-retire.sql
-- B-EXPECTANCY-TUNING-ROWS-RETIRE (row 4a2, #1156). NOT listed in MANIFEST.txt (rollbacks never are).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Restores the three rows with the values read on staging 2026-10-06 (0.4 / 0.5 / 0.6, scope (*,*,*,*)).
-- ⛔ RUN THIS BEFORE rolling code back past d4c688b88 (B-VTS-TELEMETRY-AGGREGATES): that older code prefetches
-- 'expectancy_tuning' at boot and b72-warmup.ts refuses to start on a module with zero rows.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('expectancy_tuning', '*', '*', '*', '*', 'winrate_floor_low',        '0.4'::jsonb, 'b-expectancy-tuning-rows-retire-rollback'),
  ('expectancy_tuning', '*', '*', '*', '*', 'winrate_threshold_medium', '0.5'::jsonb, 'b-expectancy-tuning-rows-retire-rollback'),
  ('expectancy_tuning', '*', '*', '*', '*', 'winrate_threshold_high',   '0.6'::jsonb, 'b-expectancy-tuning-rows-retire-rollback');

-- The forward file's `_migrations` row goes with it (column `name`, scripts/db-migrate.ts), so a later redeploy applies
-- the forward file again instead of skipping it over restored rows (the inc2a precedent).
DELETE FROM _migrations WHERE name = '2026-10-07-b-expectancy-tuning-rows-retire.sql';

COMMIT;
