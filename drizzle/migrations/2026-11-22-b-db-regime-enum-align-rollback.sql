-- Rollback for 2026-11-22-b-db-regime-enum-align.sql (B-DB-REGIME-ENUM-ALIGN, #1263).
-- ⚠️ PostgreSQL cannot drop a value from an enum type; removing these five would mean rebuilding market_regime and
-- rewriting telemetry_history.regime and adaptive_learning.regime after changing every row that holds one. That is
-- deliberately NOT done here (precedent: 2026-11-05-b-balance-session-pairing-block-reasons-rollback.sql). Leaving
-- the values is safe on every earlier sha: older code's writer is gated off in paper mode, and the database
-- accepting five more labels breaks nothing. This rollback therefore only clears the ledger row, so a later
-- redeploy re-runs the (idempotent) forward file.
BEGIN;
DELETE FROM _migrations WHERE name = '2026-11-22-b-db-regime-enum-align.sql';
COMMIT;
