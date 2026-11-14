-- B-DISK-FILE-TIERING amendment 4, increment 3b, item 1 (pre-audit "3b plan r4" / "r5"; Langston PROCEED, Discord
-- 1571069933687799881 and 1571071271633031169).
--
-- WHAT:
--   1. data_archive_cold_upload_failure — the durable record of a cold upload that failed all its attempts (plan r4
--      1c). Its own table, NOT data_archive_manifest, for three measured reasons: the manifest's state check admits no
--      failure state; UNIQUE (source_table, partition_label, tier) with the rotator's ON CONFLICT would overwrite the
--      attempt history; and the candidate query excludes any warm row having ANY tier='cold' row, so a failure row there
--      would retire the partition from every future run. One row per partition; attempts append; a later success
--      resolves it. Readers: archival-health (pages while unresolved), the next rotator run (logs prior failures,
--      resolves on success), and 3b's bucket listing (reconciles these names against B2 versions — a failed attempt may
--      have left a stored version).
--   2. The four data_lifecycle rows the rotator now reads through reqNum (Langston's Step-3 condition 1: seeded in the
--      SAME migration, so the rotator never runs a release whose rows are missing). None existed before this.
--
-- lock_timeout 5 s: a wedged DDL fails the deploy (dt-deploy then does not restart) instead of stalling.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS data_archive_cold_upload_failure (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table     text        NOT NULL,
  partition_label  text        NOT NULL,
  bucket           text        NOT NULL,
  path             text        NOT NULL,
  sha1             text,
  bytes            bigint      NOT NULL,
  attempts         jsonb       NOT NULL,
  first_failed_at  timestamptz NOT NULL,
  last_failed_at   timestamptz NOT NULL,
  failure_count    integer     NOT NULL CHECK (failure_count > 0),
  resolved_at      timestamptz,
  CONSTRAINT data_archive_cold_upload_failure_partition_uq UNIQUE (source_table, partition_label),
  CONSTRAINT data_archive_cold_upload_failure_attempts_array_chk CHECK (jsonb_typeof(attempts) = 'array')
);

CREATE INDEX IF NOT EXISTS data_archive_cold_upload_failure_open_idx
  ON data_archive_cold_upload_failure (last_failed_at) WHERE resolved_at IS NULL;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'cold_upload_setup_ms',                '60000'::jsonb,    'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_body_min_bytes_per_s',           '1048576'::jsonb,  'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_rotator_max_candidates_per_run', '6000'::jsonb,     'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_rotator_run_deadline_ms',        '72000000'::jsonb, 'b-disk-file-tiering')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

DO $check$
DECLARE n_rows integer; n_tbl integer;
BEGIN
  SELECT count(*) INTO n_tbl FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'data_archive_cold_upload_failure';
  IF n_tbl <> 1 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING 3b postcondition: data_archive_cold_upload_failure missing';
  END IF;
  SELECT count(*) INTO n_rows FROM module_constants
   WHERE module_name = 'data_lifecycle'
     AND constant_name IN ('cold_upload_setup_ms', 'cold_body_min_bytes_per_s',
                           'cold_rotator_max_candidates_per_run', 'cold_rotator_run_deadline_ms')
     AND jsonb_typeof(value) = 'number' AND (value)::text::numeric > 0;
  IF n_rows <> 4 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING 3b postcondition: % of 4 data_lifecycle limit rows present and positive', n_rows;
  END IF;
  RAISE NOTICE 'B-DISK-FILE-TIERING 3b: failure table present; 4 data_lifecycle limit rows seeded';
END $check$;

COMMIT;
