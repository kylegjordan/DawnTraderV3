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
-- Directive 11.2 R1: Adaptive Scanning Fairness - Pool Tracking
-- Schema Version: v1.5.5
-- Date: January 2026

-- Add tracking for source pool (ideal vs rotational)
ALTER TABLE telemetry_history
  ADD COLUMN IF NOT EXISTS pool TEXT DEFAULT 'ideal';

-- Index for regime/pool queries used by AdaptiveRatioManager
CREATE INDEX IF NOT EXISTS idx_telemetry_history_regime_pool
  ON telemetry_history (regime, pool);

-- Comment for documentation
COMMENT ON COLUMN telemetry_history.pool IS 'Directive 11.2 R1: Source pool (ideal or rotational) for segmented performance tracking';
