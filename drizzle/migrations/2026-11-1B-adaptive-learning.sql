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
-- Directive 11.1B: Adaptive Learning Weight Persistence
-- Schema Version: v1.5.3
-- Date: January 2026
-- 
-- Creates adaptive_learning table for persisting strategy weights
-- with timestamp propagation for time-based decay on rehydration.
-- Decay formula: exp(-0.05 * ageDays) ~ 5% per day

CREATE TABLE IF NOT EXISTS adaptive_learning (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id VARCHAR(50) NOT NULL,
  mode trading_mode NOT NULL,
  regime market_regime NOT NULL,
  weights JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS adaptive_learning_strategy_mode_idx 
  ON adaptive_learning(strategy_id, mode);

CREATE INDEX IF NOT EXISTS adaptive_learning_regime_idx 
  ON adaptive_learning(regime);

CREATE INDEX IF NOT EXISTS adaptive_learning_updated_at_idx 
  ON adaptive_learning(updated_at);

-- Documentation comments
COMMENT ON TABLE adaptive_learning IS 'Directive 11.1B: Adaptive learning weight persistence with timestamp propagation';
COMMENT ON COLUMN adaptive_learning.strategy_id IS 'Unique identifier for the strategy';
COMMENT ON COLUMN adaptive_learning.weights IS 'AdaptiveWeights JSON object';
COMMENT ON COLUMN adaptive_learning.updated_at IS 'Timestamp for time-based decay calculation';
