-- Rollback for 2026-06-11b-b45-sysctx-fee-residue.sql (operator-only;
-- auto-skipped by db-migrate). Pairs with reverting the shared/schema.ts
-- .default() removals — restoring one side alone recreates drift.

BEGIN;
ALTER TABLE system_context ALTER COLUMN maker_fee_pct SET DEFAULT 0.0016;
ALTER TABLE system_context ALTER COLUMN taker_fee_pct SET DEFAULT 0.0026;
UPDATE system_context SET maker_fee_pct = 0.0016 WHERE maker_fee_pct IS NULL;
UPDATE system_context SET taker_fee_pct = 0.0026 WHERE taker_fee_pct IS NULL;
COMMIT;
