-- B-ALERT-ORPHAN-ROWS (Kyle KD-116, 2026-11-22; R-1 of #1255 B-ALERT-INSERT-CONTRACT)
--
-- Purpose: delete every operator alert (system_alerts) whose user_id matches no users.id.
-- On staging at scope time that is exactly 12 rows (ce50e56b... x10 feed_health,
-- 3ace5ebb... x2 walter_memory_limit, all dated 2025-10-24/25). Written as a predicate,
-- not a list of ids, so it is exact on staging and touches nothing on an empty database.
--
-- Why: the alert writer's upsert (server/services/alerts-service.ts, the DO UPDATE on
-- unique_global_alert) re-opens a matching row without changing its user_id, so a new
-- alert with an identical message could re-open an orphan under a user who no longer
-- exists, where the per-user action route cannot reach it. Possible, not observed.
--
-- Fence (Langston Step-2 condition C-1): refuse when users is empty while alerts exist.
-- In that state the predicate would match every alert, which is a broken users table,
-- not a set of orphans. After the delete, assert none remain and report the count.
-- Gate and delete run in one transaction.
--
-- No foreign key is added (scope O3, Langston-agreed): a database-enforced user link
-- would make the alert writer throw, the failure #1255 just removed.
--
-- Rollback: 2026-11-22-b-alert-orphan-rows-rollback.sql (the 12 rows verbatim).

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM users) = 0 AND EXISTS (SELECT 1 FROM system_alerts) THEN
    RAISE EXCEPTION 'B-ALERT-ORPHAN-ROWS gate: users is empty while system_alerts holds rows; every alert would read as orphaned. Refusing. Investigate the users table first.';
  END IF;
END $$;

DO $$
DECLARE
  deleted_count int;
  remaining int;
BEGIN
  DELETE FROM system_alerts a
   WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'B-ALERT-ORPHAN-ROWS: deleted % orphaned system_alerts rows', deleted_count;

  SELECT count(*) INTO remaining
    FROM system_alerts a
   WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'B-ALERT-ORPHAN-ROWS post-delete assertion failed: % orphaned rows remain', remaining;
  END IF;
END $$;

COMMIT;
