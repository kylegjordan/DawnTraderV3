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
-- B-PHASE-A2 — xstock_dbs_backfill table (component-aware DBS history).
--
-- Phase A.2 of xStock Calibration Plan, sub-task E.
--
-- Captures per-bar DBS components (slope, return, EMA) alongside the final
-- score, per scope rev2 D11 + Langston C8 (Step 1 review): A.3 distribution
-- comparison reads this to diagnose where xStock and crypto DBS distributions
-- diverge at the component level (slope vs return vs ema), and Phase B
-- per-asset-class category-threshold retune is informed by component-level
-- distributions, not final-score alone.
--
-- Idempotent ON CONFLICT DO NOTHING per scope rev2 D12 — backfill script can
-- be re-run safely across cold-start windows.

BEGIN;

CREATE TABLE IF NOT EXISTS xstock_dbs_backfill (
  symbol TEXT NOT NULL,
  sector TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  final_score DOUBLE PRECISION NOT NULL,
  slope_component DOUBLE PRECISION NOT NULL,
  return_component DOUBLE PRECISION NOT NULL,
  ema_component DOUBLE PRECISION NOT NULL,
  sentinel_zero BOOLEAN NOT NULL,
  atr DOUBLE PRECISION,
  -- Langston Step 4 ask (2026-05-17): keep volume for future global-DBS replay.
  -- Component analysis alone wouldn't need this; volume captures the weight that
  -- a global weighted-median replay would use. Nullable because some pairs may
  -- have missing volume data during historical thin-data windows.
  volume_24h_usd DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, ts)
);

-- Index for sector-grouped queries during A.3 verification.
CREATE INDEX IF NOT EXISTS idx_xstock_dbs_backfill_sector_ts
  ON xstock_dbs_backfill (sector, ts);

-- Index for time-range queries (Phase B calibration replay reads this).
CREATE INDEX IF NOT EXISTS idx_xstock_dbs_backfill_ts
  ON xstock_dbs_backfill (ts);

COMMIT;
