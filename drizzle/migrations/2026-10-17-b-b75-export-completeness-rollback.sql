-- B-B75-EXPORT-COMPLETENESS (#1195) rollback.
--
-- ORDER: run this BEFORE 2026-10-15-b-xstock-bar-availability-observation-rollback.sql
-- if both are needed — it restores the table's old name, which that file comments on.
--
-- Evidence is deliberately RETAINED (CC-C's convention in the 2026-10-15 file): every
-- evidence row stays. The forward file drops the pins with IF EXISTS, so it can be
-- re-applied after either branch of this rollback. Langston Step-1 condition 2: the source_table / tier / single-value
-- contract pins are restored ONLY if no row violates them. Once the sweep has written
-- other lanes' evidence, restoring them would fail and this rollback could not run, so
-- in that case they are left off and a NOTICE says so.
--
-- Code must be reverted with this file: the sweep, the context-bridge lane, the rotator,
-- the rehydrate CLI and the capacity gate all name data_archive_exact_evidence and
-- completeness_basis after this batch.

BEGIN;

DROP TRIGGER IF EXISTS trg_data_archive_manifest_basis_requires_evidence ON data_archive_manifest;
DROP FUNCTION IF EXISTS data_archive_manifest_basis_requires_evidence();
ALTER TABLE data_archive_manifest DROP CONSTRAINT IF EXISTS data_archive_manifest_completeness_basis_chk;
ALTER TABLE data_archive_manifest DROP COLUMN IF EXISTS completeness_basis;

ALTER TRIGGER trg_guard_data_archive_exact_evidence_mutation ON data_archive_exact_evidence
  RENAME TO trg_guard_xstock_bar_archive_exact_evidence_mutation;
ALTER TRIGGER trg_guard_data_archive_exact_evidence_truncate ON data_archive_exact_evidence
  RENAME TO trg_guard_xstock_bar_archive_exact_evidence_truncate;

ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_pkey TO xstock_bar_archive_exact_evidence_pkey;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_manifest_id_fkey TO xstock_bar_archive_exact_evidence_manifest_id_fkey;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_label_tier_key TO xstock_bar_archive_exact_evid_source_table_partition_label__key;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_source_eq_exported_check TO xstock_bar_archive_exact_evidence_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_source_eq_downloaded_check TO xstock_bar_archive_exact_evidence_check1;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_downloaded_row_count_check TO xstock_bar_archive_exact_evidence_downloaded_row_count_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_exported_row_count_check TO xstock_bar_archive_exact_evidence_exported_row_count_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_object_checksum_check TO xstock_bar_archive_exact_evidence_object_checksum_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_producing_build_sha_check TO xstock_bar_archive_exact_evidence_producing_build_sha_check;
ALTER TABLE data_archive_exact_evidence RENAME CONSTRAINT data_archive_exact_evidence_source_row_count_check TO xstock_bar_archive_exact_evidence_source_row_count_check;

ALTER TABLE data_archive_exact_evidence DROP CONSTRAINT IF EXISTS data_archive_exact_evidence_cursor_contract_check;
ALTER TABLE data_archive_exact_evidence DROP CONSTRAINT IF EXISTS data_archive_exact_evidence_tier_check;

DO $$
DECLARE
  foreign_rows bigint;
BEGIN
  SELECT count(*) INTO foreign_rows
    FROM data_archive_exact_evidence
   WHERE source_table <> 'xstock_bar_revision_event'
      OR tier <> 'warm'
      OR cursor_contract <> 'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid';
  IF foreign_rows = 0 THEN
    ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT xstock_bar_archive_exact_evidence_source_table_check
      CHECK (source_table = 'xstock_bar_revision_event');
    ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT xstock_bar_archive_exact_evidence_tier_check
      CHECK (tier = 'warm');
    ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT xstock_bar_archive_exact_evidence_cursor_contract_check
      CHECK (cursor_contract = 'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid');
  ELSE
    -- Keep every row; keep the widened checks under the old names so the table still
    -- refuses an unknown contract or tier.
    ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT xstock_bar_archive_exact_evidence_cursor_contract_check
      CHECK (cursor_contract IN ('jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid', 'text-ts-tiegroup-v1'));
    ALTER TABLE data_archive_exact_evidence ADD CONSTRAINT xstock_bar_archive_exact_evidence_tier_check
      CHECK (tier IN ('warm', 'cold'));
    RAISE NOTICE 'B-B75-EXPORT-COMPLETENESS rollback: % evidence row(s) violate the restored pins (another lane, a cold tier, or the widened contract); they are KEPT, and the source_table / single-tier / single-contract pins are NOT restored (they would fail).', foreign_rows;
  END IF;
END $$;

ALTER TABLE data_archive_exact_evidence RENAME TO xstock_bar_archive_exact_evidence;

COMMENT ON TABLE xstock_bar_archive_exact_evidence IS
  'Append-only exact source/export/download equality evidence retained after xStock revision hot-partition deletion (name restored by the B-B75-EXPORT-COMPLETENESS rollback; it may hold other lanes'' rows written while that batch was live).';

COMMIT;
