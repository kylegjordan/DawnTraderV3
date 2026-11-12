-- B-CRON-MISSED-CATCHUP (#691) — durable scheduled-occurrence admission.
--
-- scheduled_tasks_audit remains best-effort terminal fire evidence.  This
-- table is the correctness boundary: one durable identity per real schedule
-- boundary, with explicit claim/start/terminal state and no routine delete.

BEGIN;

CREATE TABLE IF NOT EXISTS scheduled_job_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  scheduled_for timestamptz(6) NOT NULL,
  first_source text NOT NULL,
  policy_version text NOT NULL,
  status text NOT NULL,
  claimed_at timestamptz(6) NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz(6),
  completed_at timestamptz(6),
  lag_ms bigint NOT NULL,
  reason text,
  error_message text,
  attempt_id uuid,
  owner_instance_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT scheduled_job_occurrences_identity_unique UNIQUE (job_name, scheduled_for),
  CONSTRAINT scheduled_job_occurrences_source_check
    CHECK (first_source IN ('natural', 'missed_catchup')),
  CONSTRAINT scheduled_job_occurrences_status_check
    CHECK (status IN ('claimed', 'running', 'succeeded', 'failed', 'skipped', 'indeterminate')),
  CONSTRAINT scheduled_job_occurrences_lag_check CHECK (lag_ms >= 0),
  CONSTRAINT scheduled_job_occurrences_state_shape_check CHECK (
    (status = 'claimed' AND started_at IS NULL AND completed_at IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'succeeded' AND started_at IS NOT NULL AND completed_at IS NOT NULL)
    OR (status = 'failed' AND started_at IS NOT NULL AND completed_at IS NOT NULL AND error_message IS NOT NULL)
    OR (status = 'skipped' AND started_at IS NULL AND completed_at IS NOT NULL AND reason IS NOT NULL)
    OR (status = 'indeterminate' AND completed_at IS NOT NULL AND reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS scheduled_job_occurrences_job_boundary_idx
  ON scheduled_job_occurrences (job_name, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS scheduled_job_occurrences_unfinished_idx
  ON scheduled_job_occurrences (status, claimed_at)
  WHERE status IN ('claimed', 'running');

COMMENT ON TABLE scheduled_job_occurrences IS
  'B-CRON-MISSED-CATCHUP: durable admission and decision ledger; scheduled_tasks_audit remains terminal fire evidence.';
COMMENT ON COLUMN scheduled_job_occurrences.scheduled_for IS
  'The true cron calendar boundary, never callback arrival time.';
COMMENT ON COLUMN scheduled_job_occurrences.first_source IS
  'The source that first won durable admission: natural or missed_catchup.';

COMMIT;
