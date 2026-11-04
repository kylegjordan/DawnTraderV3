-- ═════════════════════════════════════════════════════════════════════════════
-- B-DISK-FILE-TIERING (#1233) — business-data files on the staging disk join the
-- B75 warm/cold tiers. Pre-audit P1 (Langston PROCEED 2026-11-04, r4).
--
-- Exactly three changes, nothing else:
--   1. data_archive_manifest.format gains 'file.gz' — the ORIGINAL file's bytes,
--      gzipped whole (the hourly aggregates and VTS eval files are single JSON
--      documents, not lines, so 'jsonl.gz' would be a false label).
--   2. data_archive_exact_evidence.cursor_contract gains 'disk-file-lines-v1' —
--      source = exported = downloaded NEWLINE count of the file, plus a byte-
--      identical round trip (sha256 of the original = sha256 of the inflated
--      download), checked by the job before the evidence row is written.
--   3. module_constants data_lifecycle gains the job's four governed settings
--      (fail-hard if absent — no code default):
--        disk_file_hot_days                 35  (Drift Dashboard rolling_30d + 1 day for
--                                                its day-granular selection + cadence slack)
--        disk_file_run_cap_bytes            2 GiB of originals per run while free space
--                                                is under the backlog threshold
--        disk_file_backlog_free_bytes       15 GiB — under this, the per-run cap applies
--        disk_file_free_floor_bytes         5 GiB — a run stops before free space would
--                                                fall under this
--
-- source_table has no CHECK or FK (Langston, Step 2), so the 'disk_file.<folder>'
-- family needs no change; UNIQUE (source_table, partition_label, tier) already
-- admits the warm + cold pair the rotator writes.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE data_archive_manifest DROP CONSTRAINT IF EXISTS data_archive_manifest_format_chk;
ALTER TABLE data_archive_manifest ADD CONSTRAINT data_archive_manifest_format_chk
  CHECK (format IN ('jsonl.gz', 'parquet', 'file.gz'));

ALTER TABLE data_archive_exact_evidence DROP CONSTRAINT IF EXISTS data_archive_exact_evidence_cursor_contract_check;
ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT data_archive_exact_evidence_cursor_contract_check
  CHECK (cursor_contract IN (
    'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid', -- CC-C's exact lane (xstock_bar_revision_event)
    'text-ts-tiegroup-v1',                                    -- the generic table lanes
    'disk-file-lines-v1'                                      -- B-DISK-FILE-TIERING: a file's newline count + byte round trip
  ));

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'disk_file_hot_days',           '35'::jsonb,          'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'disk_file_run_cap_bytes',      '2147483648'::jsonb,  'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'disk_file_backlog_free_bytes', '16106127360'::jsonb, 'b-disk-file-tiering'),
  ('data_lifecycle', '*', '*', '*', '*', 'disk_file_free_floor_bytes',   '5368709120'::jsonb,  'b-disk-file-tiering')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

COMMIT;

-- Verify:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN
--     ('data_archive_manifest_format_chk', 'data_archive_exact_evidence_cursor_contract_check');
--   SELECT constant_name, value FROM module_constants
--    WHERE module_name = 'data_lifecycle' AND constant_name LIKE 'disk_file_%' ORDER BY 1;
--   -- Expected: 4 rows (35, 2147483648, 16106127360, 5368709120)
