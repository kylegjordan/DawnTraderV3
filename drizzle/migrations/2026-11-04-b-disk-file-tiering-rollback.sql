-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 2026-11-04-b-disk-file-tiering.sql (B-DISK-FILE-TIERING #1233).
--
-- REFUSES (raises) if any disk-file manifest or evidence row exists: narrowing the
-- CHECKs under those rows would fail anyway, and deleting them would orphan files
-- that already left the server's disk. Rehydrate them first (b75-rehydrate.ts
-- --disk-file), or keep this migration.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM data_archive_manifest WHERE format = 'file.gz' OR source_table LIKE 'disk\_file.%')
     OR EXISTS (SELECT 1 FROM data_archive_exact_evidence WHERE cursor_contract = 'disk-file-lines-v1') THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING rollback refused: disk-file archive rows exist (their files have left the server disk)';
  END IF;
END $guard$;

ALTER TABLE data_archive_manifest DROP CONSTRAINT IF EXISTS data_archive_manifest_format_chk;
ALTER TABLE data_archive_manifest ADD CONSTRAINT data_archive_manifest_format_chk
  CHECK (format IN ('jsonl.gz', 'parquet'));

ALTER TABLE data_archive_exact_evidence DROP CONSTRAINT IF EXISTS data_archive_exact_evidence_cursor_contract_check;
ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT data_archive_exact_evidence_cursor_contract_check
  CHECK (cursor_contract IN (
    'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid',
    'text-ts-tiegroup-v1'
  ));

DELETE FROM module_constants
 WHERE module_name = 'data_lifecycle'
   AND constant_name IN ('disk_file_hot_days', 'disk_file_run_cap_bytes',
                         'disk_file_backlog_free_bytes', 'disk_file_free_floor_bytes');

COMMIT;
