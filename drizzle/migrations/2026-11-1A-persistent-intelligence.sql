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
-- ══════════════════════════════════════════════════════════════════════════════
-- Directive 11.1A — Persistent Intelligence: SQL-based Telemetry Persistence
-- ══════════════════════════════════════════════════════════════════════════════
-- Schema Version: v1.5.2
-- Directive: 11.1A
-- Date: January 2026
--
-- Purpose:
-- Establishes durable, SQL-backed telemetry persistence with market regime tagging
-- and checksum validation. Replaces file-based JSON persistence to prevent
-- split-brain storage scenarios.
--
-- Key Changes:
-- 1. Creates market_regime ENUM for regime classification
-- 2. Creates telemetry_history table with regime, checksum, and persisted_at columns
-- 3. Adds indexes for efficient regime-based and symbol-based queries
--
-- Governance:
-- - JSON file persistence (telemetry_history.json) is deprecated and must be deleted
-- - All telemetry writes and reads now use the SQL repository layer
-- - Market Regime tagging is mandatory for every telemetry record
-- - The FORCE_PERSIST flag may only be used in non-production environments
-- ══════════════════════════════════════════════════════════════════════════════

-- Create market regime enum
DO $$ BEGIN
  CREATE TYPE market_regime AS ENUM (
    'EXTREME_NOISE',
    'BULL_STABLE',
    'BULL_VOLATILE',
    'BEAR_STABLE',
    'BEAR_VOLATILE',
    'LOW_VOL_CHOP'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create telemetry_history table
CREATE TABLE IF NOT EXISTS telemetry_history (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  mode trading_mode NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  regime market_regime NOT NULL,
  final_score DECIMAL(5,4) NOT NULL,
  hybrid_score DECIMAL(5,4),
  regime_weight DECIMAL(5,4),
  predictive_confidence DECIMAL(5,4),
  success_rate DECIMAL(5,4),
  sample_count INTEGER DEFAULT 1,
  timeframe VARCHAR(10),
  checksum VARCHAR(64),
  metadata JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  persisted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS telemetry_history_regime_idx 
  ON telemetry_history(regime);

CREATE INDEX IF NOT EXISTS telemetry_history_symbol_idx 
  ON telemetry_history(symbol);

CREATE INDEX IF NOT EXISTS telemetry_history_mode_timestamp_idx 
  ON telemetry_history(mode, timestamp);

-- Add comments for documentation
COMMENT ON TABLE telemetry_history IS 'Directive 11.1A: SQL-backed telemetry persistence with market regime tagging';
COMMENT ON COLUMN telemetry_history.regime IS 'Market regime at time of telemetry capture (ENUM)';
COMMENT ON COLUMN telemetry_history.checksum IS 'SHA-256 checksum for integrity validation';
COMMENT ON COLUMN telemetry_history.persisted_at IS 'Timestamp when record was persisted to database';

-- ══════════════════════════════════════════════════════════════════════════════
-- Schema Version Audit Trail
-- ══════════════════════════════════════════════════════════════════════════════
-- v1.5.2: Persistent Intelligence - SQL-based Telemetry Persistence (11.1A)
-- v1.5.1: Schema Integrity & Telemetry Validation Hardening (11.0G)
-- v1.5.0: Legacy Data Purge & Schema Finalization (11.0F)
-- v1.4.6: FinalScore Transition Phase (11.0E)
-- ══════════════════════════════════════════════════════════════════════════════
