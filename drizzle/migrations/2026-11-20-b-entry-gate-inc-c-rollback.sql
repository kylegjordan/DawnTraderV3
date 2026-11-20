-- ROLLBACK for 2026-11-20-b-entry-gate-inc-c.sql (B-ENTRY-GATE #1224 increment C). Run by hand only.
-- Deletes both switch rows: EntryWindow returns to SHADOW at birth for both classes (logged once per class per process).
BEGIN;
DELETE FROM module_constants
 WHERE module_name = 'entry_gate' AND constant_name = 'entry_window_birth_live' AND updated_by = 'b-entry-gate-inc-c';
COMMIT;
