-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 2026-09-30-b-sizing-inc2e-retire-split-and-pattern-cap.sql
-- B-SIZING-DEC-RESTORE increment 2e (#698). NOT listed in MANIFEST.txt (rollbacks never are).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Re-inserts the three rows exactly as staging held them on 2026-09-30 (values and updated_by read there).
-- ⛔ ROLL 2e's CODE BACK FIRST — the pre-2e code reads these rows fail-hard, and this rollback runs BEFORE the rollbacks of
-- the increments beneath it (2c, then 2a).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('per_underlying_cap','*','*','*','*','b67_3_universe_split_active','true'::jsonb,'b67.3-migration'),
  ('pattern_pool_gates','*','crypto_spot','*','*','pattern_max_position_pct','0.0667'::jsonb,'p19-b8-5-sizing-tune-3'),
  ('pattern_pool_gates','*','xstock_spot','*','*','pattern_max_position_pct','0.0667'::jsonb,'p19-b8-5-sizing-tune-3')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- The forward file's `_migrations` row goes with it, so a later redeploy applies the forward file again.
DELETE FROM _migrations WHERE name = '2026-09-30-b-sizing-inc2e-retire-split-and-pattern-cap.sql';

COMMIT;
