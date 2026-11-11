-- B-XSTOCK-SNAPSHOT-RETENTION (#1194) — ranked snapshot archive proof.
--
-- The live cache and prewarm cap their reads/writes, but the snapshot tables keep
-- every historical primary key.  These settings retain 30 complete UTC days plus
-- the newest 240/60 rows per symbol.  Mutation starts disabled: Step 7 first runs
-- the exact dry read, then enables the supervised backlog explicitly.
--
-- Snapshot objects use the existing manifest/evidence state machine.  The new
-- nullable evidence columns are required as one complete group only for the
-- snapshot cursor contract; every pre-existing archive lane remains unchanged.

BEGIN;

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by, updated_at
) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'xstock_spot_ohlc_15m_snapshot.hot_retention_days', '30'::jsonb,  'b-xstock-snapshot-retention', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'xstock_spot_ohlc_15m_snapshot.keep_floor_rows',     '240'::jsonb, 'b-xstock-snapshot-retention', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'xstock_spot_ohlc_60m_snapshot.hot_retention_days', '30'::jsonb,  'b-xstock-snapshot-retention', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'xstock_spot_ohlc_60m_snapshot.keep_floor_rows',     '60'::jsonb,  'b-xstock-snapshot-retention', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'xstock_snapshot_retention.mutation_enabled',        'false'::jsonb, 'b-xstock-snapshot-retention', NOW())
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM module_constants
   WHERE module_name = 'data_lifecycle'
     AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND ((constant_name = 'xstock_spot_ohlc_15m_snapshot.hot_retention_days' AND value = '30'::jsonb)
       OR (constant_name = 'xstock_spot_ohlc_15m_snapshot.keep_floor_rows' AND value = '240'::jsonb)
       OR (constant_name = 'xstock_spot_ohlc_60m_snapshot.hot_retention_days' AND value = '30'::jsonb)
       OR (constant_name = 'xstock_spot_ohlc_60m_snapshot.keep_floor_rows' AND value = '60'::jsonb)
       OR (constant_name = 'xstock_snapshot_retention.mutation_enabled' AND value = 'false'::jsonb));
  IF n <> 5 THEN
    RAISE EXCEPTION 'B-XSTOCK-SNAPSHOT-RETENTION: expected five exact wildcard lifecycle rows, found %', n;
  END IF;

  SELECT count(*) INTO n
    FROM module_constants
   WHERE module_name = 'data_lifecycle'
     AND constant_name IN (
       'xstock_spot_ohlc_15m_snapshot.hot_retention_days',
       'xstock_spot_ohlc_15m_snapshot.keep_floor_rows',
       'xstock_spot_ohlc_60m_snapshot.hot_retention_days',
       'xstock_spot_ohlc_60m_snapshot.keep_floor_rows',
       'xstock_snapshot_retention.mutation_enabled'
     );
  IF n <> 5 THEN
    RAISE EXCEPTION 'B-XSTOCK-SNAPSHOT-RETENTION: expected one row per lifecycle key at every scope, found %', n;
  END IF;
END $$;

ALTER TABLE data_archive_exact_evidence
  ADD COLUMN IF NOT EXISTS selector_contract text,
  ADD COLUMN IF NOT EXISTS selector_version integer,
  ADD COLUMN IF NOT EXISTS frozen_cutoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS ranking_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS keep_floor_rows integer,
  ADD COLUMN IF NOT EXISTS day_start timestamptz,
  ADD COLUMN IF NOT EXISTS day_end timestamptz,
  ADD COLUMN IF NOT EXISTS ordered_key_sha256 text,
  ADD COLUMN IF NOT EXISTS full_row_sha256 text;

ALTER TABLE data_archive_exact_evidence
  DROP CONSTRAINT IF EXISTS data_archive_exact_evidence_cursor_contract_check;
ALTER TABLE data_archive_exact_evidence
  ADD CONSTRAINT data_archive_exact_evidence_cursor_contract_check CHECK (cursor_contract IN (
    'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid',
    'text-ts-tiegroup-v1',
    'disk-file-lines-v1',
    'xstock-snapshot-jsonb-v1:symbol+bucket_ts'
  ));

ALTER TABLE data_archive_exact_evidence
  DROP CONSTRAINT IF EXISTS data_archive_exact_evidence_snapshot_selector_check;
ALTER TABLE data_archive_exact_evidence
  ADD CONSTRAINT data_archive_exact_evidence_snapshot_selector_check CHECK (
    (cursor_contract <> 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'
      AND selector_contract IS NULL
      AND selector_version IS NULL
      AND frozen_cutoff_at IS NULL
      AND ranking_observed_at IS NULL
      AND keep_floor_rows IS NULL
      AND day_start IS NULL
      AND day_end IS NULL
      AND ordered_key_sha256 IS NULL
      AND full_row_sha256 IS NULL)
    OR
    (cursor_contract = 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'
      AND source_table IN ('xstock_spot_ohlc_15m_snapshot', 'xstock_spot_ohlc_60m_snapshot')
      AND selector_contract = 'xstock-snapshot-ranked-day/v1'
      AND selector_version = 1
      AND frozen_cutoff_at = date_trunc('day', frozen_cutoff_at)
      AND ranking_observed_at IS NOT NULL
      AND keep_floor_rows > 0
      AND day_start = date_trunc('day', day_start)
      AND day_end = day_start + interval '1 day'
      AND day_end <= frozen_cutoff_at
      AND ordered_key_sha256 ~ '^[0-9a-f]{64}$'
      AND full_row_sha256 ~ '^[0-9a-f]{64}$')
  );

CREATE OR REPLACE FUNCTION data_archive_manifest_basis_requires_evidence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.completeness_basis = 'source-count-matched' AND NOT EXISTS (
       SELECT 1
         FROM data_archive_exact_evidence e
        WHERE e.source_table = NEW.source_table
          AND e.partition_label = NEW.partition_label
          AND (
            NEW.source_table NOT IN ('xstock_spot_ohlc_15m_snapshot', 'xstock_spot_ohlc_60m_snapshot')
            OR (
              e.cursor_contract = 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'
              AND e.selector_contract = 'xstock-snapshot-ranked-day/v1'
              AND e.selector_version = 1
              AND e.frozen_cutoff_at IS NOT NULL
              AND e.ranking_observed_at IS NOT NULL
              AND e.keep_floor_rows IS NOT NULL
              AND e.day_start IS NOT NULL
              AND e.day_end IS NOT NULL
              AND e.ordered_key_sha256 IS NOT NULL
              AND e.full_row_sha256 IS NOT NULL
            )
          )
     ) THEN
    RAISE EXCEPTION
      'data_archive_manifest %/% (tier %): completeness_basis source-count-matched requires complete exact evidence',
      NEW.source_table, NEW.partition_label, NEW.tier;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON COLUMN data_archive_exact_evidence.selector_contract IS
  'B-XSTOCK-SNAPSHOT-RETENTION: ranked selector identity. NULL for generic archive lanes.';
COMMENT ON COLUMN data_archive_exact_evidence.ordered_key_sha256 IS
  'B-XSTOCK-SNAPSHOT-RETENTION: SHA-256 of the ordered length-framed (symbol,bucket_ts UTC-microsecond text) key stream.';
COMMENT ON COLUMN data_archive_exact_evidence.full_row_sha256 IS
  'B-XSTOCK-SNAPSHOT-RETENTION: SHA-256 of the exact uncompressed canonical JSONL bytes.';

COMMIT;
