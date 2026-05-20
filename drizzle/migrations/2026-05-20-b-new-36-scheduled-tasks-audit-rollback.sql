-- B-NEW-36 sub-batch (b) — ROLLBACK for scheduled_tasks_audit.
--
-- Operator-only. NOT applied by the migration runner. Drops the table
-- and its index.

BEGIN;

DROP INDEX IF EXISTS idx_scheduled_tasks_audit_name_status_fired;
DROP TABLE IF EXISTS scheduled_tasks_audit;

COMMIT;
