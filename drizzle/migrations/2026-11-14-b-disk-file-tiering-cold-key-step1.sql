-- B-DISK-FILE-TIERING amendment 4, increment 3d, step 1 (pre-audit "3d Step 2" r1, "3d plan r2", "3d plan r3";
-- Langston on r2, Discord 1571201605842509860).
--
-- Runs AFTER 2026-11-14-b-disk-file-tiering-cold-audit.sql (3c), which creates data_archive_cold_meter.
--
-- WHAT:
--   1. data_archive_cold_meter gains versions_by_owner (UPLOAD versions per owner class — the `_liveness/` and `_proof/`
--      count ceiling reads it, r3 C-3) and kept (untracked objects on Kyle's kept-residue allowlist, reported, not paged).
--   2. data_lifecycle: cold_meter_liveness_max_versions = 2 (the envelope a WORKING lifecycle rule leaves: the Monday
--      canary's version plus one lagging daily sweep) REPLACES cold_meter_liveness_growth_warn_bytes (a 10 MB byte delta
--      that 104-byte weekly canaries would take ~1,900 years to trip); cold_residue_kept_file_ids = '[]' (seeded so a
--      MISSING row refuses the cold audit rather than defaulting; written only on Kyle's recorded decision).
--
-- lock_timeout 5 s: a wedged DDL fails the deploy (dt-deploy then does not restart) instead of stalling.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE data_archive_cold_meter
  ADD COLUMN IF NOT EXISTS versions_by_owner jsonb,
  ADD COLUMN IF NOT EXISTS kept integer NOT NULL DEFAULT 0;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'cold_meter_liveness_max_versions', '2'::jsonb,  'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_residue_kept_file_ids',       '[]'::jsonb, 'b-disk-file-tiering')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

DELETE FROM module_constants
 WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
   AND constant_name = 'cold_meter_liveness_growth_warn_bytes';

DO $check$
DECLARE n_cols integer; n_max integer; n_kept integer; n_old integer;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'data_archive_cold_meter' AND column_name IN ('versions_by_owner', 'kept');
  IF n_cols <> 2 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING 3d step 1 postcondition: % of 2 cold-meter columns present', n_cols;
  END IF;
  SELECT count(*) INTO n_max FROM module_constants
   WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND constant_name = 'cold_meter_liveness_max_versions' AND jsonb_typeof(value) = 'number' AND (value)::text::numeric > 0;
  SELECT count(*) INTO n_kept FROM module_constants
   WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND constant_name = 'cold_residue_kept_file_ids' AND jsonb_typeof(value) = 'array';
  SELECT count(*) INTO n_old FROM module_constants
   WHERE module_name = 'data_lifecycle' AND constant_name = 'cold_meter_liveness_growth_warn_bytes';
  IF n_max <> 1 OR n_kept <> 1 OR n_old <> 0 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING 3d step 1 postcondition: max_versions % (want 1), kept_ids % (want 1), old byte-delta row % (want 0)', n_max, n_kept, n_old;
  END IF;
  RAISE NOTICE 'B-DISK-FILE-TIERING 3d step 1: cold-meter columns added; liveness ceiling and kept-residue allowlist seeded';
END $check$;

COMMIT;
