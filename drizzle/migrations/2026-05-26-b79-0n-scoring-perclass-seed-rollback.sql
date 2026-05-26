-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.SCORING Migration 1 — ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- Removes the 8 rows inserted by 2026-05-26-b79-0n-scoring-perclass-seed.sql.
-- Scoped to `updated_by='B79.0n.SCORING'` stamp.
-- Manual-only; not auto-run by deploy.

BEGIN;

DELETE FROM module_constants
 WHERE module_name='sqe_config' AND updated_by='B79.0n.SCORING';

DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining FROM module_constants
   WHERE module_name='sqe_config' AND updated_by='B79.0n.SCORING';
  IF remaining != 0 THEN
    RAISE EXCEPTION 'B79.0n.SCORING rollback assertion failed: % rows still present after DELETE', remaining;
  END IF;
END $$;

COMMIT;
