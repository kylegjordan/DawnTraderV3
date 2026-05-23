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
-- Directive 11.3: Predictive Risk & Cost Modeling - Dynamic Sizing Engine
-- Schema v1.5.6
-- Adds position_size and size_multiplier columns to telemetry_history

ALTER TABLE telemetry_history
  ADD COLUMN IF NOT EXISTS position_size DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS size_multiplier DOUBLE PRECISION;

-- Comments for documentation
COMMENT ON COLUMN telemetry_history.position_size IS 'Directive 11.3: DSE computed trade size';
COMMENT ON COLUMN telemetry_history.size_multiplier IS 'Directive 11.3: DSE scaling multiplier (0.3-1.2)';
