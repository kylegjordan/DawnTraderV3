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
-- Directive 11.0G — Schema Hardening Migration
-- Schema Version: v1.5.0 → v1.5.1
-- Date: January 2026
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Purpose:
-- This migration formally records the schema changes made in Directives 11.0E-11.0F
-- and provides deprecation markers for historical reference.
--
-- Changes Applied in 11.0F (documented here for audit trail):
-- 1. Added hybrid_score column to rtb_signals table
-- 2. Added decay_penalty column to rtb_signals table
-- 3. Deprecated cwqi, ngc, profit_rate columns (not formally dropped to preserve history)
--
-- This migration serves as a formal record of the schema state at v1.5.1

-- Ensure FinalScore-era columns exist (idempotent)
ALTER TABLE rtb_signals
  ADD COLUMN IF NOT EXISTS hybrid_score DECIMAL(5, 4),
  ADD COLUMN IF NOT EXISTS decay_penalty DECIMAL(5, 4);

-- Create index on final_score if not exists (primary ranking metric)
CREATE INDEX IF NOT EXISTS rtb_signals_final_score_idx ON rtb_signals(final_score);

-- Deprecated columns for historical reference (kept as comments for audit trail)
-- These columns were removed in Directive 11.0F and should NOT be recreated:
-- ALTER TABLE rtb_signals DROP COLUMN IF EXISTS cwqi;
-- ALTER TABLE rtb_signals DROP COLUMN IF EXISTS ngc;
-- ALTER TABLE rtb_signals DROP COLUMN IF EXISTS profit_rate;

-- Deprecated indexes (kept as comments for audit trail)
-- These indexes were removed in Directive 11.0F:
-- DROP INDEX IF EXISTS rtb_signals_cwqi_idx;

-- ══════════════════════════════════════════════════════════════════════════════
-- Schema Version Update Record
-- ══════════════════════════════════════════════════════════════════════════════
-- Version: v1.5.1
-- Directive: 11.0G
-- Metric Engine: v1.0 (Canonical)
-- Applied: 2026-01-08
-- ══════════════════════════════════════════════════════════════════════════════
