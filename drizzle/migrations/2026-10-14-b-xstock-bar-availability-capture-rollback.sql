-- Rollback for B-XSTOCK-BAR-AVAILABILITY capture layer.
-- Roll application code back before this migration.  This deliberately removes only the additive
-- availability objects; the pre-existing compact xStock OHLC rows and vendor labels remain.

DROP FUNCTION IF EXISTS certify_xstock_bar_revision_events(uuid[], text);
DROP FUNCTION IF EXISTS apply_xstock_bar_revision_events(jsonb, uuid, text);
DROP TRIGGER IF EXISTS trg_guard_xstock_projection_revision_link ON xstock_spot_ohlc_1m;
DROP FUNCTION IF EXISTS guard_xstock_projection_revision_link();
DROP TRIGGER IF EXISTS trg_guard_xstock_bar_revision_event_mutation ON xstock_bar_revision_event;
DROP FUNCTION IF EXISTS guard_xstock_bar_revision_event_mutation();
DROP TABLE IF EXISTS xstock_bar_revision_event CASCADE;
DROP TRIGGER IF EXISTS trg_guard_xstock_bar_contract_activation ON xstock_bar_clock_guard;
DROP FUNCTION IF EXISTS guard_xstock_bar_contract_activation();
DROP TABLE IF EXISTS xstock_bar_clock_guard;
DROP SEQUENCE IF EXISTS xstock_bar_visible_seq;

ALTER TABLE xstock_spot_ohlc_1m
  DROP COLUMN IF EXISTS winning_revision_id,
  DROP COLUMN IF EXISTS winning_payload_hash,
  DROP COLUMN IF EXISTS projection_generation;
