-- B-DISK-FILE-TIERING amendment 4, increment 3c — the cold meter and the budgeted read-back (pre-audit "3c Step 2"
-- r1, "3c plan r2", "3c plan r3"; Langston PROCEED, Discord 1571165004999426089).
--
-- WHAT:
--   1. data_archive_cold_meter — one row per b75-cold-audit run: the bucket totals by owner class (upload versions
--      only), the `_proof/` file ids this run saw (C-1: "the same id in two consecutive runs" reads the previous row),
--      the set-reconcile counts (C-2), and the read-back counters N is measured from (C-3). Written after the meter leg
--      and updated with the read-back counters at the end of the run, so a read-back crash still leaves the meter row.
--   2. data_archive_cold_readback — one row per read-back attempt: ok | mismatch | budget_exhausted | error, the
--      cause of a leg-ending refusal (C-4), and at most 2,048 bytes of a non-JSON refusal body (#1117's rule).
--      Measured bound (plan r3 edit 4): <= max_objects + 1 rows a day, <= 22.5 KB of captured body a day.
--   3. The nine data_lifecycle rows b75-cold-audit reads through reqNum (no hard-coded default anywhere).
--
-- lock_timeout 5 s: a wedged DDL fails the deploy (dt-deploy then does not restart) instead of stalling.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS data_archive_cold_meter (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at           timestamptz NOT NULL,
  versions         integer     NOT NULL CHECK (versions >= 0),
  bytes            bigint      NOT NULL CHECK (bytes >= 0),
  bytes_by_owner   jsonb       NOT NULL,
  proof_ids        text[]      NOT NULL DEFAULT '{}',
  untracked        integer     NOT NULL DEFAULT 0,
  missing          integer     NOT NULL DEFAULT 0,
  size_mismatch    integer     NOT NULL DEFAULT 0,
  in_flight        integer     NOT NULL DEFAULT 0,
  skipped_unbound  integer     NOT NULL DEFAULT 0,
  due              integer,
  bytes_due        bigint,
  read_count       integer,
  bytes_read       bigint,
  deferred_budget  integer,
  readback_ok      integer,
  readback_failed  integer,
  budget_stop      text CHECK (budget_stop IS NULL OR budget_stop IN ('none', 'own', 'cap', 'time', 'disk')),
  budget_cause     text,
  finished_at      timestamptz,
  CONSTRAINT data_archive_cold_meter_owner_object_chk CHECK (jsonb_typeof(bytes_by_owner) = 'object')
);

CREATE INDEX IF NOT EXISTS data_archive_cold_meter_run_idx ON data_archive_cold_meter (run_at DESC);

CREATE TABLE IF NOT EXISTS data_archive_cold_readback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id    uuid        NOT NULL,
  file_id        text        NOT NULL,
  at             timestamptz NOT NULL,
  bytes          bigint,
  result         text        NOT NULL CHECK (result IN ('ok', 'mismatch', 'budget_exhausted', 'error')),
  sha256_seen    text,
  cause          text CHECK (cause IS NULL OR cause IN ('download_cap_exceeded', 'transaction_cap_exceeded', 'throttled_429_unidentified')),
  retry_after_ms integer,
  cause_detail   text CHECK (cause_detail IS NULL OR octet_length(cause_detail) <= 2048),
  error          text
);

CREATE INDEX IF NOT EXISTS data_archive_cold_readback_manifest_idx ON data_archive_cold_readback (manifest_id, at DESC);

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'cold_meter_warn_bytes',                           '100000000000'::jsonb, 'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_meter_tokenwatch_growth_warn_bytes_per_day', '350000000'::jsonb,    'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_meter_liveness_growth_warn_bytes',           '10000000'::jsonb,     'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_readback_daily_bytes',                       '500000000'::jsonb,    'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_readback_min_interval_days',                 '30'::jsonb,           'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_readback_stall_days',                        '3'::jsonb,            'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_readback_max_age_days',                      '90'::jsonb,           'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_readback_max_objects_per_run',               '10'::jsonb,           'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_audit_run_deadline_ms',                      '2400000'::jsonb,      'b-disk-file-tiering')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

DO $check$
DECLARE n_rows integer; n_tbl integer;
BEGIN
  SELECT count(*) INTO n_tbl FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('data_archive_cold_meter', 'data_archive_cold_readback');
  IF n_tbl <> 2 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING 3c postcondition: % of 2 cold-audit tables present', n_tbl;
  END IF;
  SELECT count(*) INTO n_rows FROM module_constants
   WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND constant_name IN ('cold_meter_warn_bytes', 'cold_meter_tokenwatch_growth_warn_bytes_per_day',
                           'cold_meter_liveness_growth_warn_bytes', 'cold_readback_daily_bytes',
                           'cold_readback_min_interval_days', 'cold_readback_stall_days', 'cold_readback_max_age_days',
                           'cold_readback_max_objects_per_run', 'cold_audit_run_deadline_ms')
     AND jsonb_typeof(value) = 'number' AND (value)::text::numeric > 0;
  IF n_rows <> 9 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING 3c postcondition: % of 9 data_lifecycle cold-audit rows present and positive', n_rows;
  END IF;
  RAISE NOTICE 'B-DISK-FILE-TIERING 3c: 2 cold-audit tables present; 9 data_lifecycle rows seeded';
END $check$;

COMMIT;
