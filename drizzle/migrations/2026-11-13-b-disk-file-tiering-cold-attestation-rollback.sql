-- ROLLBACK for 2026-11-13-b-disk-file-tiering-cold-attestation.sql (B-DISK-FILE-TIERING amendment 4 / 3a). Applied BY
-- HAND with psql; db:migrate refuses any file named *rollback*, and this file is NOT in MANIFEST.txt.
--
-- ORDER: roll the app back FIRST (an app at or after 3a writes these columns on every cold rotation), then run this.
-- It drops the four columns and the constraint — any provider_file_id / provider_sha1 recorded since 3a is LOST, so a
-- cold row rotated after 3a would be left with no record of which B2 version it is. Read those rows out first:
--   SELECT id, storage_uri, provider_file_id, provider_sha1, provider_bytes FROM data_archive_manifest
--    WHERE provider_file_id IS NOT NULL;
-- Deletes the forward file's _migrations ledger row, so a later db:migrate re-applies it.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE data_archive_manifest DROP CONSTRAINT IF EXISTS data_archive_manifest_verification_method_chk;
ALTER TABLE data_archive_manifest DROP COLUMN IF EXISTS provider_file_id;
ALTER TABLE data_archive_manifest DROP COLUMN IF EXISTS provider_sha1;
ALTER TABLE data_archive_manifest DROP COLUMN IF EXISTS provider_bytes;
ALTER TABLE data_archive_manifest DROP COLUMN IF EXISTS verification_method;

DELETE FROM _migrations WHERE name = '2026-11-13-b-disk-file-tiering-cold-attestation.sql';

COMMIT;
