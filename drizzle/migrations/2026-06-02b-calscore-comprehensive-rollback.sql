-- Rollback for 2026-06-02b-calscore-comprehensive.sql
-- Drops the two added columns. (The comprehensive rows remain; the table itself
-- rolls back via 2026-06-02-b-calscore-ledger-rollback.sql.)
BEGIN;
ALTER TABLE calibration_ledger DROP COLUMN IF EXISTS display_order;
ALTER TABLE calibration_ledger DROP COLUMN IF EXISTS category;
COMMIT;
