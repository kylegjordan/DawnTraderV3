-- B-DISK-FILE-TIERING 3d, the lifecycle-proof window (Langston, Discord 1571878313008439418, point 2).
--
-- WHAT: data_lifecycle cold_meter_liveness_max_versions 2 -> 3 for the arm-2 window ONLY.
-- WHY: 3d step 4 (2026-11-16 12:58Z) left ONE deliberately-unhidden throwaway under _liveness/ until its
--   2026-11-20 day-4 re-list. That is a standing +1 on the _liveness/ upload-version count, so every 04:10Z
--   cold audit would trip the ceiling (> 2) on the normal envelope - and the single page key
--   (cold-meter-liveness-ceiling) would then be OCCUPIED, so a genuinely dead _liveness/ rule inside the window
--   would land on a row already open and say nothing. At 3, the normal envelope plus arm 2 stays quiet and a dead
--   rule still pages at 4, one day later than at 2.
-- REVERTED at 3d step 5 (after both re-lists pass), back to 2, by a migration of its own. Recorded in the change
--   list ("3d steps 3 + 4") and DEPLOY_WINDOWS.jsonl.
-- Refuses unless the current value is exactly 2 (so it cannot overwrite a value someone else set).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $pre$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND constant_name = 'cold_meter_liveness_max_versions' AND value = '2'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING arm-2 ceiling: expected exactly one cold_meter_liveness_max_versions row at 2, found %', n;
  END IF;
END $pre$;

UPDATE module_constants
   SET value = '3'::jsonb, updated_by = 'b-disk-file-tiering-arm2-window', updated_at = NOW()
 WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
   AND constant_name = 'cold_meter_liveness_max_versions';

DO $post$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'data_lifecycle' AND constant_name = 'cold_meter_liveness_max_versions' AND value = '3'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING arm-2 ceiling postcondition: % rows at 3 (want 1)', n;
  END IF;
  RAISE NOTICE 'B-DISK-FILE-TIERING arm-2 window: cold_meter_liveness_max_versions 2 -> 3 (revert at 3d step 5)';
END $post$;

COMMIT;
