-- Roll back the B-XSTOCK-BAR-AVAILABILITY aggregate layer only.
-- Raw immutable revision capture remains owned by the preceding migration.

DROP TRIGGER IF EXISTS trg_guard_xstock_snapshot_revision_link ON xstock_spot_ohlc_15m_snapshot;
DROP TRIGGER IF EXISTS trg_guard_xstock_snapshot_revision_link ON xstock_spot_ohlc_60m_snapshot;
DROP FUNCTION IF EXISTS guard_xstock_snapshot_revision_link();

ALTER TABLE xstock_spot_ohlc_15m_snapshot
  DROP CONSTRAINT IF EXISTS xstock_spot_ohlc_15m_snapshot_availability_shape,
  DROP COLUMN IF EXISTS aggregate_revision_id,
  DROP COLUMN IF EXISTS aggregate_hash,
  DROP COLUMN IF EXISTS source_revision_set_hash,
  DROP COLUMN IF EXISTS source_max_visible_by,
  DROP COLUMN IF EXISTS source_max_visible_seq,
  DROP COLUMN IF EXISTS read_observed_at,
  DROP COLUMN IF EXISTS read_observed_seq,
  DROP COLUMN IF EXISTS certificate_primary_identity,
  DROP COLUMN IF EXISTS availability_contract_version,
  DROP COLUMN IF EXISTS eligibility_state;

ALTER TABLE xstock_spot_ohlc_60m_snapshot
  DROP CONSTRAINT IF EXISTS xstock_spot_ohlc_60m_snapshot_availability_shape,
  DROP COLUMN IF EXISTS aggregate_revision_id,
  DROP COLUMN IF EXISTS aggregate_hash,
  DROP COLUMN IF EXISTS source_revision_set_hash,
  DROP COLUMN IF EXISTS source_max_visible_by,
  DROP COLUMN IF EXISTS source_max_visible_seq,
  DROP COLUMN IF EXISTS read_observed_at,
  DROP COLUMN IF EXISTS read_observed_seq,
  DROP COLUMN IF EXISTS certificate_primary_identity,
  DROP COLUMN IF EXISTS availability_contract_version,
  DROP COLUMN IF EXISTS eligibility_state;

DROP FUNCTION IF EXISTS record_xstock_bar_aggregate_revisions(jsonb, text);
DROP FUNCTION IF EXISTS record_xstock_bar_window_manifest(jsonb, text);
DROP TRIGGER IF EXISTS trg_guard_xstock_bar_window_manifest_mutation ON xstock_bar_window_manifest;
DROP FUNCTION IF EXISTS guard_xstock_bar_window_manifest_mutation();
DROP TABLE IF EXISTS xstock_bar_window_manifest;
DROP FUNCTION IF EXISTS observe_xstock_bar_read(text);
DROP TRIGGER IF EXISTS trg_guard_xstock_bar_aggregate_revision_mutation ON xstock_bar_aggregate_revision;
DROP FUNCTION IF EXISTS guard_xstock_bar_aggregate_revision_mutation();
DROP TABLE IF EXISTS xstock_bar_aggregate_revision;

DELETE FROM _migrations
WHERE name = '2026-10-14-b-xstock-bar-availability-aggregate.sql';
