-- B-DISK-FILE-TIERING 3d, the lifecycle-proof window (Langston, Discord 1571878313008439418, point 2).
--
-- WHAT: data_lifecycle cold_meter_liveness_max_versions 2 -> 3 for the arm-2 window ONLY.
-- WHY (corrected at Langston's Step-4 read, Discord 1571884596465770547, C-1): HEADROOM, not a firing ceiling.
--   The meter's own record (data_archive_cold_meter.versions_by_owner, liveness) reads 0, 0, 1, 1 over its four runs to
--   11-16 12:57:49Z. The canary is WEEKLY (0 4 * * 1), so the next upload is 11-23, after this window. 3d step 4's
--   deliberately-unhidden arm-2 throwaway (12:58:18Z, until its 11-20 day-4 re-list) takes the count to 2 (entailed by
--   mechanism, not yet measured), and 2 > 2 is false: at 2 the ceiling does NOT fire in 11-17..11-20. The design worst
--   case is 2 (a canary version plus one lagging daily sweep); arm 2 adds 1 on top of it, so at 2 a second lingering
--   canary version would page and occupy the one key (cold-meter-liveness-ceiling). 3 is that headroom. The arm-1/arm-2
--   re-lists are the direct liveness test over exactly this window, so the detector being looser here costs nothing.
-- ⚠️ ONE CONSTANT, TWO PAGE KEYS (C-2): b75-cold-audit.ts:289-292 checks _liveness/ AND _proof/ against this same
--   value (keys cold-meter-liveness-ceiling and cold-meter-proof-ceiling). _proof/ is loosened 2 -> 3 as a side effect;
--   versions_by_owner.proof is 0 on all four runs and nothing schedules a proof, so it costs nothing in this window.
-- ⛔ DO NOT APPLY BY HAND (C-4): it is in MANIFEST, so a hand psql run leaves no _migrations row, and the next
--   db:migrate then hits $pre$ with the row at 3, RAISEs, and fails every later deploy's migrate step. It ships only
--   through dt-deploy. If no deploy lands before the window ends, the ceiling stayed at 2 and that is what step 5 says.
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
   WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND constant_name = 'cold_meter_liveness_max_versions' AND value = '3'::jsonb;
  IF n <> 1 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING arm-2 ceiling postcondition: % rows at 3 (want 1)', n;
  END IF;
  RAISE NOTICE 'B-DISK-FILE-TIERING arm-2 window: cold_meter_liveness_max_versions 2 -> 3 (revert at 3d step 5)';
END $post$;

COMMIT;
