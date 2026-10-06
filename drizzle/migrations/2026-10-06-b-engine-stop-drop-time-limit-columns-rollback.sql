-- ROLLBACK for 2026-10-06-b-engine-stop-drop-time-limit-columns.sql (B-ENGINE-STOP-DURATION-COLUMN, #1067).
-- Re-adds both columns, nullable and EMPTY (the dropped values were elapsed durations, derivable from
-- started_at / stopped_at), and clears the migration's ledger row so a re-deploy re-applies the forward file.
-- Revert the CODE first or together: the forward commit's code neither reads nor writes these columns.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE active_engine_sessions
  ADD COLUMN IF NOT EXISTS run_for_ms integer,
  ADD COLUMN IF NOT EXISTS ends_at timestamp with time zone;

DELETE FROM _migrations WHERE name = '2026-10-06-b-engine-stop-drop-time-limit-columns.sql';

COMMIT;
