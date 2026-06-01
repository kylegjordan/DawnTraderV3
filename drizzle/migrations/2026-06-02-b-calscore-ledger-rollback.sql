-- Rollback for 2026-06-02-b-calscore-ledger.sql
-- Drops the calibration_ledger table (and its indexes via CASCADE-of-table).
BEGIN;
DROP TABLE IF EXISTS calibration_ledger;
COMMIT;
