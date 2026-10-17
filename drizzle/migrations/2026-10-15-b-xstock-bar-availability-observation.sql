-- B-XSTOCK-BAR-AVAILABILITY, P14 phase 2 observation support.
-- Migration-first: B75 refuses a registered table without its lifecycle key.
-- Admission and completion are separate append-only facts: an accepted flush
-- remains visible even when its projection transaction permanently fails.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS xstock_bar_projection_flush_admission (
  flush_id uuid PRIMARY KEY,
  writer_boot_id uuid NOT NULL,
  writer_build_sha text NOT NULL CHECK (writer_build_sha <> ''),
  contract_version text NOT NULL,
  accepted_input_frames integer NOT NULL CHECK (accepted_input_frames > 0),
  buffer_superseded integer NOT NULL CHECK (
    buffer_superseded >= 0 AND buffer_superseded < accepted_input_frames
  ),
  expected_projection_attempts integer NOT NULL CHECK (expected_projection_attempts > 0),
  population_hash text NOT NULL CHECK (population_hash ~ '^[0-9a-f]{64}$'),
  admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (accepted_input_frames - buffer_superseded = expected_projection_attempts)
);

CREATE TABLE IF NOT EXISTS xstock_bar_projection_flush_completion (
  flush_id uuid PRIMARY KEY REFERENCES xstock_bar_projection_flush_admission(flush_id),
  writer_boot_id uuid NOT NULL,
  writer_build_sha text NOT NULL CHECK (writer_build_sha <> ''),
  contract_version text NOT NULL,
  accepted_input_frames integer NOT NULL CHECK (accepted_input_frames > 0),
  buffer_superseded integer NOT NULL CHECK (
    buffer_superseded >= 0 AND buffer_superseded < accepted_input_frames
  ),
  projection_attempts integer NOT NULL CHECK (projection_attempts > 0),
  repeated_payload_attempts integer NOT NULL CHECK (
    repeated_payload_attempts >= 0 AND repeated_payload_attempts <= projection_attempts
  ),
  applied_winners integer NOT NULL CHECK (
    applied_winners >= 0 AND applied_winners <= projection_attempts
  ),
  rejected_older_arrivals integer NOT NULL CHECK (
    rejected_older_arrivals >= 0 AND rejected_older_arrivals <= projection_attempts
  ),
  revision_ids uuid[] NOT NULL CHECK (cardinality(revision_ids) = projection_attempts),
  population_hash text NOT NULL CHECK (population_hash ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (accepted_input_frames - buffer_superseded = projection_attempts),
  CHECK (applied_winners + rejected_older_arrivals = projection_attempts)
);

CREATE INDEX IF NOT EXISTS idx_xstock_bar_projection_flush_admission_time
  ON xstock_bar_projection_flush_admission (admitted_at, flush_id);
CREATE INDEX IF NOT EXISTS idx_xstock_bar_projection_flush_completion_time
  ON xstock_bar_projection_flush_completion (completed_at, flush_id);

-- The generic manifest is a mutable lifecycle row. Preserve the exact xStock
-- export proof separately so source/export/download equality remains auditable
-- after the hot partition has been dropped.
-- B-B75-EXPORT-COMPLETENESS (#1195, 2026-10-17): this table was renamed
-- data_archive_exact_evidence by 2026-10-17-b-b75-export-completeness.sql. Each
-- statement about it below is guarded to do nothing once the new name exists, so
-- re-running THIS file can never re-create an empty old-name table beside the
-- real one (two homes for one proof). A fresh database replayed in order is
-- unchanged: this file creates the old name, the 10-17 file renames it.
DO $guard$
BEGIN
  IF to_regclass('data_archive_exact_evidence') IS NULL THEN
    CREATE TABLE IF NOT EXISTS xstock_bar_archive_exact_evidence (
      manifest_id uuid PRIMARY KEY REFERENCES data_archive_manifest(id),
      source_table text NOT NULL CHECK (source_table = 'xstock_bar_revision_event'),
      partition_label text NOT NULL,
      tier text NOT NULL CHECK (tier = 'warm'),
      source_row_count bigint NOT NULL CHECK (source_row_count >= 0),
      exported_row_count bigint NOT NULL CHECK (exported_row_count >= 0),
      downloaded_row_count bigint NOT NULL CHECK (downloaded_row_count >= 0),
      cursor_contract text NOT NULL CHECK (
        cursor_contract = 'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid'
      ),
      producing_build_sha text NOT NULL CHECK (producing_build_sha ~ '^[0-9a-f]{40}$'),
      object_checksum text NOT NULL CHECK (object_checksum <> ''),
      verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CHECK (source_row_count = exported_row_count),
      CHECK (source_row_count = downloaded_row_count),
      UNIQUE (source_table, partition_label, tier)
    );
  END IF;
END $guard$;

-- Supports the exact B75 native (timestamptz, uuid) keyset cursor without a
-- per-page full sort. Only returned cursor values use text transport.
CREATE INDEX IF NOT EXISTS idx_xstock_bar_revision_event_archive_cursor
  ON xstock_bar_revision_event (arrived_at, revision_id);

CREATE OR REPLACE FUNCTION guard_xstock_bar_projection_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'xStock projection flush evidence is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_projection_admission_mutation
  ON xstock_bar_projection_flush_admission;
CREATE TRIGGER trg_guard_xstock_bar_projection_admission_mutation
BEFORE UPDATE OR DELETE ON xstock_bar_projection_flush_admission
FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();
DROP TRIGGER IF EXISTS trg_guard_xstock_bar_projection_admission_truncate
  ON xstock_bar_projection_flush_admission;
CREATE TRIGGER trg_guard_xstock_bar_projection_admission_truncate
BEFORE TRUNCATE ON xstock_bar_projection_flush_admission
FOR EACH STATEMENT EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_projection_completion_mutation
  ON xstock_bar_projection_flush_completion;
CREATE TRIGGER trg_guard_xstock_bar_projection_completion_mutation
BEFORE UPDATE OR DELETE ON xstock_bar_projection_flush_completion
FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();
DROP TRIGGER IF EXISTS trg_guard_xstock_bar_projection_completion_truncate
  ON xstock_bar_projection_flush_completion;
CREATE TRIGGER trg_guard_xstock_bar_projection_completion_truncate
BEFORE TRUNCATE ON xstock_bar_projection_flush_completion
FOR EACH STATEMENT EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();

-- (guarded — see the B-B75-EXPORT-COMPLETENESS note on the CREATE TABLE above)
DO $guard$
BEGIN
  IF to_regclass('data_archive_exact_evidence') IS NULL THEN
    DROP TRIGGER IF EXISTS trg_guard_xstock_bar_archive_exact_evidence_mutation
      ON xstock_bar_archive_exact_evidence;
    CREATE TRIGGER trg_guard_xstock_bar_archive_exact_evidence_mutation
    BEFORE UPDATE OR DELETE ON xstock_bar_archive_exact_evidence
    FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();
    DROP TRIGGER IF EXISTS trg_guard_xstock_bar_archive_exact_evidence_truncate
      ON xstock_bar_archive_exact_evidence;
    CREATE TRIGGER trg_guard_xstock_bar_archive_exact_evidence_truncate
    BEFORE TRUNCATE ON xstock_bar_archive_exact_evidence
    FOR EACH STATEMENT EXECUTE FUNCTION guard_xstock_bar_projection_evidence_mutation();
  END IF;
END $guard$;

-- Idempotent admission. A retry after an ambiguous admission COMMIT reuses the
-- same flush ID and verifies that it names the same immutable population.
CREATE OR REPLACE FUNCTION admit_xstock_bar_projection_flush(
  p_flush_id uuid,
  p_writer_boot_id uuid,
  p_writer_build_sha text,
  p_contract_version text,
  p_accepted_input_frames integer,
  p_buffer_superseded integer,
  p_expected_projection_attempts integer,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  admitted xstock_bar_projection_flush_admission%ROWTYPE;
  computed_population_hash text;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) IS DISTINCT FROM p_expected_projection_attempts THEN
    RAISE EXCEPTION 'xStock flush % admission rows do not match expected population', p_flush_id;
  END IF;
  computed_population_hash := encode(digest(convert_to(p_rows::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO xstock_bar_projection_flush_admission (
    flush_id, writer_boot_id, writer_build_sha, contract_version, accepted_input_frames,
    buffer_superseded, expected_projection_attempts, population_hash
  ) VALUES (
    p_flush_id, p_writer_boot_id, p_writer_build_sha, p_contract_version, p_accepted_input_frames,
    p_buffer_superseded, p_expected_projection_attempts, computed_population_hash
  )
  ON CONFLICT (flush_id) DO NOTHING;

  SELECT * INTO STRICT admitted
  FROM xstock_bar_projection_flush_admission
  WHERE flush_id = p_flush_id;

  IF admitted.writer_boot_id IS DISTINCT FROM p_writer_boot_id
     OR admitted.writer_build_sha IS DISTINCT FROM p_writer_build_sha
     OR admitted.contract_version IS DISTINCT FROM p_contract_version
     OR admitted.accepted_input_frames IS DISTINCT FROM p_accepted_input_frames
     OR admitted.buffer_superseded IS DISTINCT FROM p_buffer_superseded
     OR admitted.expected_projection_attempts IS DISTINCT FROM p_expected_projection_attempts
     OR admitted.population_hash IS DISTINCT FROM computed_population_hash THEN
    RAISE EXCEPTION 'xStock flush % admission replay does not match original population', p_flush_id;
  END IF;
END $$;

-- Serialize every attempt for one admitted ID on its admission row. If a prior
-- projection COMMIT was acknowledged ambiguously, return its exact event set;
-- do not invoke the projection function again and do not create extra arrivals.
CREATE OR REPLACE FUNCTION apply_xstock_bar_revision_flush(
  p_rows jsonb,
  p_writer_boot_id uuid,
  p_writer_build_sha text,
  p_contract_version text,
  p_flush_id uuid
)
RETURNS TABLE (
  revision_id uuid,
  arrived_at timestamptz,
  projection_applied boolean,
  projection_generation bigint,
  supersedes_revision_id uuid,
  observed_winner_revision_id uuid,
  payload_hash text,
  payload_repeated_from_winner boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  admitted xstock_bar_projection_flush_admission%ROWTYPE;
  completed xstock_bar_projection_flush_completion%ROWTYPE;
  computed_population_hash text;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'xStock flush % projection payload is not an array', p_flush_id;
  END IF;
  computed_population_hash := encode(digest(convert_to(p_rows::text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO admitted
  FROM xstock_bar_projection_flush_admission
  WHERE flush_id = p_flush_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'xStock flush % has no durable admission', p_flush_id;
  END IF;
  IF admitted.writer_boot_id IS DISTINCT FROM p_writer_boot_id
     OR admitted.writer_build_sha IS DISTINCT FROM p_writer_build_sha
     OR admitted.contract_version IS DISTINCT FROM p_contract_version
     OR admitted.expected_projection_attempts IS DISTINCT FROM jsonb_array_length(p_rows)
     OR admitted.population_hash IS DISTINCT FROM computed_population_hash THEN
    RAISE EXCEPTION 'xStock flush % projection does not match durable admission', p_flush_id;
  END IF;

  SELECT * INTO completed
  FROM xstock_bar_projection_flush_completion
  WHERE flush_id = p_flush_id;
  IF FOUND THEN
    RETURN QUERY
    SELECT e.revision_id, e.arrived_at, e.projection_applied,
           e.projection_generation, e.supersedes_revision_id,
           e.observed_winner_revision_id, e.payload_hash,
           e.payload_repeated_from_winner
    FROM unnest(completed.revision_ids) WITH ORDINALITY saved(revision_id, ordinal)
    JOIN xstock_bar_revision_event e ON e.revision_id = saved.revision_id
    ORDER BY saved.ordinal;
    RETURN;
  END IF;

  RETURN QUERY
  WITH attempts AS MATERIALIZED (
    SELECT *
    FROM apply_xstock_bar_revision_events(p_rows, p_writer_boot_id, p_contract_version)
  ), completion AS (
    INSERT INTO xstock_bar_projection_flush_completion (
      flush_id, writer_boot_id, writer_build_sha, contract_version, accepted_input_frames,
      buffer_superseded, projection_attempts, repeated_payload_attempts,
      applied_winners, rejected_older_arrivals, revision_ids, population_hash
    )
    SELECT
      p_flush_id, p_writer_boot_id, p_writer_build_sha, p_contract_version,
      admitted.accepted_input_frames, admitted.buffer_superseded,
      count(*)::integer,
      count(*) FILTER (WHERE attempts.payload_repeated_from_winner)::integer,
      count(*) FILTER (WHERE attempts.projection_applied)::integer,
      count(*) FILTER (WHERE NOT attempts.projection_applied)::integer,
      array_agg(attempts.revision_id ORDER BY attempts.revision_id),
      admitted.population_hash
    FROM attempts
    RETURNING 1
  )
  SELECT a.* FROM attempts a CROSS JOIN completion;
END $$;

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by
)
VALUES (
  'data_lifecycle', '*', '*', '*', '*',
  'xstock_bar_revision_event.hot_retention_days', '8'::jsonb,
  'b-xstock-bar-availability-p14-phase2'
)
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

-- Starts after the first post-deploy UTC partition boundary. The final gate is
-- scheduled after eight full UTC days and before the 2026-10-25 02:15 sweep:
-- Oct-15 can prove archive/drop while every graded Oct-16+ event remains hot.
INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by
)
VALUES (
  'xstock_bar_availability', '*', '*', '*', '*',
  'graded_window_start', to_jsonb('2026-10-16T00:05:00Z'::text),
  'b-xstock-bar-availability-p14-phase2'
)
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime,
  constant_name, value, updated_by
)
VALUES (
  'xstock_bar_availability', '*', '*', '*', '*',
  'venue_session_max_gap_seconds', '60'::jsonb,
  'b-xstock-bar-availability-p14-phase2'
)
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

COMMENT ON TABLE xstock_bar_projection_flush_admission IS
  'Append-only xStock logical flush population admitted before projection.';
COMMENT ON TABLE xstock_bar_projection_flush_completion IS
  'Append-only xStock projection completion committed atomically with immutable revision events.';
-- (guarded — see the B-B75-EXPORT-COMPLETENESS note on the CREATE TABLE above)
DO $guard$
BEGIN
  IF to_regclass('data_archive_exact_evidence') IS NULL THEN
    COMMENT ON TABLE xstock_bar_archive_exact_evidence IS
      'Append-only exact source/export/download equality evidence retained after xStock revision hot-partition deletion.';
  END IF;
END $guard$;

COMMIT;
