-- ROLLBACK for 2026-11-14-b-disk-file-tiering-cold-key-step1.sql (B-DISK-FILE-TIERING amendment 4 / 3d step 1). Applied
-- BY HAND with psql; db:migrate refuses any file named *rollback*, and this file is NOT in MANIFEST.txt.
--
-- ORDER: roll the app back FIRST to a release before 3d step 1 — a 3d-step-1 cold audit refuses without
-- cold_meter_liveness_max_versions and cold_residue_kept_file_ids, and a 3c cold audit refuses without
-- cold_meter_liveness_growth_warn_bytes (restored below at its 3c value). Then run this.
-- Drops the two meter columns: the per-owner version history and the kept counts are LOST.
-- ⚠️ cold_residue_kept_file_ids holds Kyle's recorded keep decisions — read it out first:
--   SELECT value FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = 'cold_residue_kept_file_ids';
-- Deletes the forward file's _migrations ledger row, so a later db:migrate re-applies it.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE data_archive_cold_meter DROP COLUMN IF EXISTS versions_by_owner, DROP COLUMN IF EXISTS kept;

DELETE FROM module_constants
 WHERE module_name = 'data_lifecycle'
   AND constant_name IN ('cold_meter_liveness_max_versions', 'cold_residue_kept_file_ids');

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'cold_meter_liveness_growth_warn_bytes', '10000000'::jsonb, 'b-disk-file-tiering-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

DELETE FROM _migrations WHERE name = '2026-11-14-b-disk-file-tiering-cold-key-step1.sql';

COMMIT;
