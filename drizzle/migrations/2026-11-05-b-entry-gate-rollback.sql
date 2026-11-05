-- ROLLBACK for 2026-11-05-b-entry-gate.sql (not in MANIFEST).
-- Roll back the CODE first: with the code still deployed, removing these rows makes every taker open throw at the
-- entry-window read (getCachedNumberRequired).
BEGIN;
DELETE FROM module_constants WHERE updated_by = 'b-entry-gate';
COMMIT;
