-- B-XSTOCK-SNAPSHOT-RETENTION rollback.
--
-- Hot rows already moved to warm storage stay there.  The mutation switch is
-- forced off.  Snapshot evidence is append-only: selector columns and the
-- widened cursor contract are removed only when no snapshot proof depends on
-- them; otherwise they are retained and a NOTICE makes that explicit.

BEGIN;

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by, updated_at
) VALUES (
  'data_lifecycle', '*', '*', '*', '*',
  'xstock_snapshot_retention.mutation_enabled', 'false'::jsonb,
  'b-xstock-snapshot-retention-rollback', NOW()
)
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = 'false'::jsonb, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

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

DO $$
DECLARE snapshot_proofs bigint;
BEGIN
  SELECT count(*) INTO snapshot_proofs
    FROM data_archive_exact_evidence
   WHERE cursor_contract = 'xstock-snapshot-jsonb-v1:symbol+bucket_ts';

  IF snapshot_proofs = 0 THEN
    ALTER TABLE data_archive_exact_evidence
      DROP CONSTRAINT IF EXISTS data_archive_exact_evidence_snapshot_selector_check;
    ALTER TABLE data_archive_exact_evidence
      DROP CONSTRAINT IF EXISTS data_archive_exact_evidence_cursor_contract_check;
    ALTER TABLE data_archive_exact_evidence
      ADD CONSTRAINT data_archive_exact_evidence_cursor_contract_check CHECK (cursor_contract IN (
        'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid',
        'text-ts-tiegroup-v1',
        'disk-file-lines-v1'
      ));
    ALTER TABLE data_archive_exact_evidence
      DROP COLUMN IF EXISTS selector_contract,
      DROP COLUMN IF EXISTS selector_version,
      DROP COLUMN IF EXISTS frozen_cutoff_at,
      DROP COLUMN IF EXISTS ranking_observed_at,
      DROP COLUMN IF EXISTS keep_floor_rows,
      DROP COLUMN IF EXISTS day_start,
      DROP COLUMN IF EXISTS day_end,
      DROP COLUMN IF EXISTS ordered_key_sha256,
      DROP COLUMN IF EXISTS full_row_sha256;
  ELSE
    RAISE NOTICE 'B-XSTOCK-SNAPSHOT-RETENTION rollback: % snapshot evidence row(s) retained; selector columns and widened cursor contract remain because deleting proof is forbidden.', snapshot_proofs;
  END IF;
END $$;

COMMIT;
