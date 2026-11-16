-- ROLLBACK for 2026-11-16-b-disk-file-tiering-liveness-ceiling-arm2.sql. Applied BY HAND with psql; db:migrate refuses
-- any file named *rollback*, and this file is NOT in MANIFEST.txt.
-- Restores cold_meter_liveness_max_versions to 2 and deletes the forward file's _migrations ledger row, so a later
-- db:migrate re-applies it. The normal close of the window is NOT this file: 3d step 5 ships a forward migration back to 2.

BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE module_constants
   SET value = '2'::jsonb, updated_by = 'b-disk-file-tiering-arm2-window-rollback', updated_at = NOW()
 WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
   AND constant_name = 'cold_meter_liveness_max_versions';

DELETE FROM _migrations WHERE name = '2026-11-16-b-disk-file-tiering-liveness-ceiling-arm2.sql';

COMMIT;
