-- B-DB-SIZE-RELIEF OBJ-1 ROLLBACK — signal_eval_archive hot window back to 30 days.
--
-- Apply BY HAND with psql (scripts/db-migrate.ts refuses any file whose name contains "rollback"), and BEFORE any
-- code revert. It changes one value and deletes nothing: the six reaffirmed keys stay at 30, and a key must never be
-- removed, because a missing data_lifecycle key aborts the whole night's sweep (b75-retention-sweep.ts reqNum).
-- Dailies already moved to warm stay in warm; widening the window again does not re-hydrate them (b75-rehydrate.ts does).

BEGIN;

UPDATE module_constants
   SET value = '30'::jsonb, updated_by = 'b-db-size-relief-obj1-rollback', updated_at = NOW()
 WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
   AND constant_name = 'signal_eval_archive.hot_retention_days';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND constant_name = 'signal_eval_archive.hot_retention_days' AND value = '30'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'B-DB-SIZE-RELIEF OBJ-1 rollback: signal_eval_archive.hot_retention_days is not 30 after the update (found % rows)', n;
  END IF;
END $$;

COMMIT;
