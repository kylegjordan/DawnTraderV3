-- Rollback for 2026-11-24-b-db-regime-enum-align-telemetry-columns.sql (#1263 Step 9).
--
-- Forward-only by design. Every app ref since the 2026-03-05 writer change declares and may insert
-- these fields, including the pre-#1263 rollback build. Dropping them would recreate the production
-- writer failure. The additions are nullable/backward-compatible, so rollback clears only the ledger
-- row and permits the idempotent migration to run again.
BEGIN;
DELETE FROM _migrations WHERE name = '2026-11-24-b-db-regime-enum-align-telemetry-columns.sql';
COMMIT;
