-- ROLLBACK for 2026-11-14-b-disk-file-tiering-cold-retry.sql (B-DISK-FILE-TIERING amendment 4 / 3b item 1). Applied BY
-- HAND with psql; db:migrate refuses any file named *rollback*, and this file is NOT in MANIFEST.txt.
--
-- ORDER: roll the app back FIRST — an app at or after 3b refuses at loadConfig without the four data_lifecycle rows,
-- and writes the failure table on a failed cold upload. Then run this.
-- It drops data_archive_cold_upload_failure: any recorded failure (a cold name that may hold an unrecorded B2 version)
-- is LOST. Read open rows out first:
--   SELECT source_table, partition_label, path, sha1, bytes, failure_count, last_failed_at
--     FROM data_archive_cold_upload_failure WHERE resolved_at IS NULL;
-- Deletes the forward file's _migrations ledger row, so a later db:migrate re-applies it.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS data_archive_cold_upload_failure;

DELETE FROM module_constants
 WHERE module_name = 'data_lifecycle'
   AND constant_name IN ('cold_upload_setup_ms', 'cold_body_min_bytes_per_s',
                         'cold_rotator_max_candidates_per_run', 'cold_rotator_run_deadline_ms');

DELETE FROM _migrations WHERE name = '2026-11-14-b-disk-file-tiering-cold-retry.sql';

COMMIT;
