-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B-NEW-36 sub-batch (b) — scheduled_tasks_audit forensic table.
--
-- One row per scheduled-task fire from the off-hours session-lifecycle
-- controller (Fri 8PM ET weekend-shutdown, Sun 8PM ET weekend-restart),
-- plus one row per server boot from the boot-state reconciliation pass.
--
-- Forensic-only: no downstream code reads this table. Surfaces task
-- execution history for operations. Bounded growth (2 timers × ~52 weeks
-- + N boots/year ≈ low hundreds of rows/year); safe to leave unbounded.
--
-- Reference: Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md §2;
--            Claude Comms and Packages/Scope Files/B_NEW_36_PRE_AUDIT.md §3.10

BEGIN;

CREATE TABLE IF NOT EXISTS scheduled_tasks_audit (
  id              SERIAL        PRIMARY KEY,
  task_name       VARCHAR(64)   NOT NULL,
  scheduled_for   TIMESTAMPTZ   NOT NULL,
  fired_at        TIMESTAMPTZ,
  status          VARCHAR(32)   NOT NULL,
  error_message   TEXT,
  meta            JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_audit_name_status_fired
  ON scheduled_tasks_audit (task_name, status, fired_at DESC);

COMMENT ON TABLE scheduled_tasks_audit IS
  'B-NEW-36 (2026-05-20): forensic record of scheduled-task fires from the '
  'off-hours session-lifecycle controller. task_name values: weekend_shutdown | '
  'weekend_restart | boot_state_reconciliation. status values: pending | success | error.';

COMMENT ON COLUMN scheduled_tasks_audit.scheduled_for IS
  'When this task was supposed to fire. For boot_state_reconciliation rows '
  'this is server boot time (= fired_at = created_at).';

COMMENT ON COLUMN scheduled_tasks_audit.meta IS
  'JSONB with task-specific context (snapshot row counts, suspended trade '
  'counts, computed inside-weekend-window state, etc.).';

COMMIT;
