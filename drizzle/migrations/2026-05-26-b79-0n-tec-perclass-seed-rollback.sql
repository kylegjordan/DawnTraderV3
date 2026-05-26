-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.TEC Migration 1 — ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- Removes the 32 rows inserted by 2026-05-26-b79-0n-tec-perclass-seed.sql.
-- Scoped to `updated_by='B79.0n.TEC'` so an operator can't accidentally
-- remove a hand-crafted operator-flip row.
-- Manual-only; not auto-run by deploy. Run via:
--   ssh staging 'cd /home/deploy/dawntrader && psql $DATABASE_URL -f \
--     drizzle/migrations/2026-05-26-b79-0n-tec-perclass-seed-rollback.sql'

BEGIN;

DELETE FROM module_constants
 WHERE module_name='trailing_exit' AND updated_by='B79.0n.TEC';

-- Verify cleanup
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM module_constants
   WHERE module_name='trailing_exit' AND updated_by='B79.0n.TEC';
  IF remaining != 0 THEN
    RAISE EXCEPTION 'B79.0n.TEC rollback assertion failed: % rows still present after DELETE', remaining;
  END IF;
END $$;

COMMIT;
