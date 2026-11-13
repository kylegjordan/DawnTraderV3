-- B-DISK-FILE-TIERING amendment 4, increment 3a (= amendment 1's AP-4 + the attestation; Langston PROCEED on plan r2).
-- Pre-audit: Claude Comms and Packages/Scope Files/B_DISK_FILE_TIERING_PRE_AUDIT.md, "AMENDMENT 4" r1/r2.
--
-- WHAT: four columns on data_archive_manifest for the cold upload's attestation (Coltrane 3, cold-archive plan §4):
--   provider_file_id     the exact B2 file VERSION stored (B2 names are versioned; a by-name read can return another)
--   provider_sha1        the SHA-1 B2 verified on receipt (X-Bz-Content-Sha1) and re-read by b2_get_file_info
--   provider_bytes       the stored length B2 reports
--   verification_method  what `verified_at` means for the row: 'b2-sha1-attested' (new rotations) or
--                        'sha256-roundtrip' (a whole-object re-download compared by SHA-256 — every cold row before 3a)
-- `verified_at` must not silently keep meaning "SHA-256 round-trip" once the round-trip is gone (Coltrane 3).
-- BACKFILL: the cold rows that exist today (4 on staging, 2026-11-13) were verified by the old re-download, so they are
-- labelled 'sha256-roundtrip'; their file ids are bound in increment 3b (b2_list_file_versions), not here.
-- Warm rows keep NULL in all four (they are Supabase objects; the columns describe a B2 version).
-- lock_timeout 5 s: a wedged ALTER fails the deploy (dt-deploy then does not restart) instead of stalling the archive jobs.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE data_archive_manifest ADD COLUMN IF NOT EXISTS provider_file_id    text;
ALTER TABLE data_archive_manifest ADD COLUMN IF NOT EXISTS provider_sha1       text;
ALTER TABLE data_archive_manifest ADD COLUMN IF NOT EXISTS provider_bytes      bigint;
ALTER TABLE data_archive_manifest ADD COLUMN IF NOT EXISTS verification_method text;

DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_archive_manifest_verification_method_chk') THEN
    ALTER TABLE data_archive_manifest ADD CONSTRAINT data_archive_manifest_verification_method_chk
      CHECK (verification_method IS NULL OR verification_method IN ('b2-sha1-attested', 'sha256-roundtrip'));
  END IF;
END $c$;

UPDATE data_archive_manifest SET verification_method = 'sha256-roundtrip'
 WHERE tier = 'cold' AND verification_method IS NULL AND verified_at IS NOT NULL;

DO $check$
DECLARE n_cols integer; n_unlabelled integer; n_labelled integer;
BEGIN
  SELECT count(*) INTO n_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'data_archive_manifest'
     AND column_name IN ('provider_file_id', 'provider_sha1', 'provider_bytes', 'verification_method');
  IF n_cols <> 4 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING 3a postcondition: % of 4 attestation columns present', n_cols;
  END IF;
  SELECT count(*) INTO n_unlabelled FROM data_archive_manifest
   WHERE tier = 'cold' AND verified_at IS NOT NULL AND verification_method IS NULL;
  IF n_unlabelled <> 0 THEN
    RAISE EXCEPTION 'B-DISK-FILE-TIERING 3a postcondition: % verified cold row(s) carry no verification_method', n_unlabelled;
  END IF;
  SELECT count(*) INTO n_labelled FROM data_archive_manifest WHERE verification_method = 'sha256-roundtrip';
  RAISE NOTICE 'B-DISK-FILE-TIERING 3a: 4 attestation columns present; % cold row(s) labelled sha256-roundtrip', n_labelled;
END $check$;

COMMIT;
