-- B-XSTOCK-BAR-AVAILABILITY, P14 phase-2 deploy-safe observation.
-- A normal deploy may cross the long capacity window only when the old writer
-- proves a complete drain and the new writer durably links to that handoff.

BEGIN;

CREATE TABLE IF NOT EXISTS xstock_bar_writer_boot_start (
  boot_id uuid PRIMARY KEY,
  predecessor_boot_id uuid NULL REFERENCES xstock_bar_writer_boot_start(boot_id),
  writer_build_sha text NOT NULL CHECK (writer_build_sha ~ '^[0-9a-f]{40}$'),
  contract_version text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (predecessor_boot_id IS NULL OR predecessor_boot_id <> boot_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_xstock_bar_writer_boot_predecessor
  ON xstock_bar_writer_boot_start (predecessor_boot_id)
  WHERE predecessor_boot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_xstock_bar_writer_boot_start_time
  ON xstock_bar_writer_boot_start (started_at, boot_id);

CREATE TABLE IF NOT EXISTS xstock_bar_writer_handoff (
  boot_id uuid PRIMARY KEY REFERENCES xstock_bar_writer_boot_start(boot_id),
  writer_build_sha text NOT NULL CHECK (writer_build_sha ~ '^[0-9a-f]{40}$'),
  contract_version text NOT NULL,
  accepted_input_frames bigint NOT NULL CHECK (accepted_input_frames >= 0),
  buffer_superseded bigint NOT NULL CHECK (
    buffer_superseded >= 0 AND buffer_superseded <= accepted_input_frames
  ),
  projection_attempts bigint NOT NULL CHECK (projection_attempts >= 0),
  repeated_payload_attempts bigint NOT NULL CHECK (
    repeated_payload_attempts >= 0 AND repeated_payload_attempts <= projection_attempts
  ),
  applied_winners bigint NOT NULL CHECK (
    applied_winners >= 0 AND applied_winners <= projection_attempts
  ),
  rejected_older_arrivals bigint NOT NULL CHECK (
    rejected_older_arrivals >= 0 AND rejected_older_arrivals <= projection_attempts
  ),
  admission_flushes bigint NOT NULL CHECK (admission_flushes >= 0),
  completion_flushes bigint NOT NULL CHECK (completion_flushes >= 0),
  handed_off_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (accepted_input_frames - buffer_superseded = projection_attempts),
  CHECK (applied_winners + rejected_older_arrivals = projection_attempts),
  CHECK (admission_flushes = completion_flushes)
);

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_writer_boot_start_mutation
  ON xstock_bar_writer_boot_start;
CREATE TRIGGER trg_guard_xstock_bar_writer_boot_start_mutation
BEFORE UPDATE OR DELETE ON xstock_bar_writer_boot_start
FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_writer_boot_start_truncate
  ON xstock_bar_writer_boot_start;
CREATE TRIGGER trg_guard_xstock_bar_writer_boot_start_truncate
BEFORE TRUNCATE ON xstock_bar_writer_boot_start
FOR EACH STATEMENT EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_writer_handoff_mutation
  ON xstock_bar_writer_handoff;
CREATE TRIGGER trg_guard_xstock_bar_writer_handoff_mutation
BEFORE UPDATE OR DELETE ON xstock_bar_writer_handoff
FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_writer_handoff_truncate
  ON xstock_bar_writer_handoff;
CREATE TRIGGER trg_guard_xstock_bar_writer_handoff_truncate
BEFORE TRUNCATE ON xstock_bar_writer_handoff
FOR EACH STATEMENT EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();

COMMENT ON TABLE xstock_bar_writer_boot_start IS
  'Append-only xStock writer boot chain used to prove deploy-safe observation continuity.';
COMMENT ON TABLE xstock_bar_writer_handoff IS
  'Append-only clean-drain proof for one xStock writer boot before a deploy or restart.';

COMMIT;
