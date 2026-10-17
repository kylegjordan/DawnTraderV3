-- B-B75-EXPORT-COMPLETENESS (#1195, CC-A; Step 2 approved by Langston 2026-10-17).
--
-- WHY: from 2026-05-06 (565b605f0) to 2026-10-16T09:45:18Z (b678ef0f6) the B75
-- exporter skipped the rest of each timestamp tie group at a page boundary and nothing
-- counted the source, so archive copies of that period may be missing rows inside each
-- day. Kyle decided 2026-10-17 (option 3): recover nothing, record the gaps everywhere.
--
-- WHAT:
--   1. data_archive_manifest.completeness_basis (four values, fail-closed default) and
--      its backfill.
--   2. CC-C's xstock_bar_archive_exact_evidence generalised into the ONE home of every
--      lane's proof: renamed data_archive_exact_evidence, the source_table and tier pins
--      dropped, cursor_contract widened to two values, every constraint and trigger
--      renamed with it (ALTER TABLE ... RENAME TO carries none of their names).
--   3. A trigger that refuses completeness_basis = 'source-count-matched' unless an
--      evidence row exists for (source_table, partition_label) — so the label can never
--      claim a proof that is not stored.
--
-- data_archive_manifest is raw SQL (defined in 2026-04-22-initial-schema.sql and
-- 2026-05-06-b75-data-lifecycle.sql); there is no shared/schema.ts entry to change.
-- Rollback: 2026-10-17-b-b75-export-completeness-rollback.sql — run it BEFORE
-- 2026-10-15-b-xstock-bar-availability-observation-rollback.sql if both are needed.

BEGIN;

-- ─── 1. The manifest column ──────────────────────────────────────────────────
ALTER TABLE data_archive_manifest
  ADD COLUMN IF NOT EXISTS completeness_basis TEXT NOT NULL DEFAULT 'unrecorded';
ALTER TABLE data_archive_manifest DROP CONSTRAINT IF EXISTS data_archive_manifest_completeness_basis_chk;
ALTER TABLE data_archive_manifest ADD CONSTRAINT data_archive_manifest_completeness_basis_chk
  CHECK (completeness_basis IN (
    'source-count-matched',      -- an evidence row stores source = exported = downloaded (enforced below)
    'gate-deployed-unrecorded',  -- exported under the in-snapshot count gate, count not stored
    'unverified-legacy',         -- exported 2026-05-06 .. 2026-10-16 with no source count
    'unrecorded'                 -- default: a writer that did not stamp (a defect signal; fails closed)
  ));

-- Backfill. created_at and verified_at agree on every row as to which side of the
-- hotfix deploy it falls (measured 2026-10-17, 572 of 572), and every row is finished
-- (active or migrated). The one placeholder created_at (2026-01-01, exit_decision_archive
-- 2026-05, contents 05-05..05-31) correctly lands in the legacy group.
UPDATE data_archive_manifest
   SET completeness_basis = 'unverified-legacy'
 WHERE completeness_basis = 'unrecorded'
   AND created_at < '2026-10-16T09:45:18Z';
UPDATE data_archive_manifest
   SET completeness_basis = 'gate-deployed-unrecorded'
 WHERE completeness_basis = 'unrecorded'
   AND created_at >= '2026-10-16T09:45:18Z';
-- A cold rotator copy is byte-identical to its warm row: it inherits that row's basis
-- (a cold row with no warm sibling is a 413-fallback original and keeps its own).
UPDATE data_archive_manifest c
   SET completeness_basis = w.completeness_basis
  FROM data_archive_manifest w
 WHERE c.tier = 'cold' AND w.tier = 'warm'
   AND c.source_table = w.source_table AND c.partition_label = w.partition_label
   AND c.completeness_basis <> w.completeness_basis;

COMMENT ON COLUMN data_archive_manifest.completeness_basis IS
  'B-B75-EXPORT-COMPLETENESS (#1195). Only source-count-matched is proven: an evidence row in data_archive_exact_evidence stores source = exported = downloaded. It proves the copy matches the table as it stood at export time, not that the table held everything it should have. unverified-legacy = exported 2026-05-06..2026-10-16 with no source count, rows may be missing inside each day (Kyle 2026-10-17: no recovery). gate-deployed-unrecorded = exported under the in-snapshot count gate before this batch stored the count. unrecorded = a writer that did not stamp.';

-- ─── 2. The evidence table, generalised ──────────────────────────────────────
ALTER TABLE xstock_bar_archive_exact_evidence RENAME TO data_archive_exact_evidence;

-- The pins come off; the contract becomes a fixed set; tier keeps a domain check.
ALTER TABLE data_archive_exact_evidence DROP CONSTRAINT xstock_bar_archive_exact_evidence_source_table_check;
ALTER TABLE data_archive_exact_evidence DROP CONSTRAINT xstock_bar_archive_exact_evidence_tier_check;
ALTER TABLE data_archive_exact_evidence DROP CONSTRAINT xstock_bar_archive_exact_evidence_cursor_contract_check;
ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT data_archive_exact_evidence_cursor_contract_check
  CHECK (cursor_contract IN (
    'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid', -- CC-C's exact lane (xstock_bar_revision_event)
    'text-ts-tiegroup-v1'                                     -- the generic lanes: text cursor, whole tie group re-read
  ));
ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT data_archive_exact_evidence_tier_check
  CHECK (tier IN ('warm', 'cold')); -- the context-bridge 413 fallback exports straight to cold

-- Every remaining name moves with the table (the pkey and unique renames carry their indexes).
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_pkey TO data_archive_exact_evidence_pkey;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_manifest_id_fkey TO data_archive_exact_evidence_manifest_id_fkey;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evid_source_table_partition_label__key TO data_archive_exact_evidence_label_tier_key;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_check TO data_archive_exact_evidence_source_eq_exported_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_check1 TO data_archive_exact_evidence_source_eq_downloaded_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_downloaded_row_count_check TO data_archive_exact_evidence_downloaded_row_count_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_exported_row_count_check TO data_archive_exact_evidence_exported_row_count_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_object_checksum_check TO data_archive_exact_evidence_object_checksum_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_producing_build_sha_check TO data_archive_exact_evidence_producing_build_sha_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT xstock_bar_archive_exact_evidence_source_row_count_check TO data_archive_exact_evidence_source_row_count_check;
ALTER TRIGGER trg_guard_xstock_bar_archive_exact_evidence_mutation ON data_archive_exact_evidence
  RENAME TO trg_guard_data_archive_exact_evidence_mutation;
ALTER TRIGGER trg_guard_xstock_bar_archive_exact_evidence_truncate ON data_archive_exact_evidence
  RENAME TO trg_guard_data_archive_exact_evidence_truncate;

COMMENT ON TABLE data_archive_exact_evidence IS
  'Append-only exact source/export/download equality evidence for EVERY archive lane (B-B75-EXPORT-COMPLETENESS #1195; created as xstock_bar_archive_exact_evidence by B-XSTOCK-BAR-AVAILABILITY). One row per exported object, keyed by manifest_id; it is never updated or deleted (guard triggers), and producing_build_sha is first-write-wins.';

-- ─── 3. The tie: the label may only claim a stored proof ─────────────────────
CREATE OR REPLACE FUNCTION data_archive_manifest_basis_requires_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.completeness_basis = 'source-count-matched' AND NOT EXISTS (
       SELECT 1 FROM data_archive_exact_evidence e
        WHERE e.source_table = NEW.source_table
          AND e.partition_label = NEW.partition_label
     ) THEN
    RAISE EXCEPTION
      'data_archive_manifest %/% (tier %): completeness_basis source-count-matched requires a data_archive_exact_evidence row for (source_table, partition_label)',
      NEW.source_table, NEW.partition_label, NEW.tier;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_data_archive_manifest_basis_requires_evidence ON data_archive_manifest;
CREATE TRIGGER trg_data_archive_manifest_basis_requires_evidence
BEFORE INSERT OR UPDATE OF completeness_basis ON data_archive_manifest
FOR EACH ROW EXECUTE FUNCTION data_archive_manifest_basis_requires_evidence();

COMMENT ON TRIGGER trg_data_archive_manifest_basis_requires_evidence ON data_archive_manifest IS
  'Keyed on (source_table, partition_label) ONLY, deliberately — not manifest_id, not tier: a cold rotator copy is a different manifest row with no evidence of its own, and it inherits the warm export''s proof because moving a copy to cold does not change what it holds. ORDERING INVARIANT for every writer that stamps source-count-matched (b75-retention-sweep archiveOneObject, context-bridge-log-ttl): insert the evidence row FIRST, in the same transaction. The cold rotator stamps by inheritance and inserts no evidence. A plain BEFORE trigger (not deferrable) so a violation fails at the offending statement.';

COMMIT;
