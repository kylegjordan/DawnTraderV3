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
-- B67.3 Migration — Per-Underlying Position Limits + A/B universe split
--
-- Adds:
--   1. paper_sim_trades.pair_id_hash SMALLINT — deterministic 0/1 cohort marker
--      derived from FNV-1a(symbol) % 2 at trade open. (Scope §5.3 specifies
--      CRC32 conceptually; implementation uses FNV-1a for portability — node
--      has no built-in CRC32 and pulling a dep for one hash is overkill.
--      FNV-1a has equivalent distribution for the cohort-split purpose.)
--      Used for A/B validation of the per-underlying cap during the first
--      observation period (cohort 0 runs with limit ENABLED, cohort 1 runs
--      as control with limit DISABLED). NULL for trades opened before B67.3
--      deploy.
--
--   2. Three module_constants seed rows in the new 'per_underlying_cap' module:
--        b67_3_enabled (bool, default false initially; flip true on observation
--          period activation)
--        b67_3_max_concurrent_per_underlying (int, default 2 — max simultaneous
--          open trades per base currency)
--        b67_3_universe_split_active (bool, default true — enables the A/B
--          cohort gating; flip false after observation closes)
--
-- Per BATCH_67_SCOPE.md §5. Sub-deliverable B67.3 of B67. Deploys FIRST among
-- B67's confidence-modifying deliverables because it has zero confidence
-- dependency — pure safety net during the rollout.
--
-- Rollback: 2026-04-28-b67-3-rollback.sql

BEGIN;

ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS pair_id_hash SMALLINT;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('per_underlying_cap', '*', '*', '*', '*', 'b67_3_enabled',
   'false'::jsonb,
   'b67.3-migration'),
  ('per_underlying_cap', '*', '*', '*', '*', 'b67_3_max_concurrent_per_underlying',
   '2'::jsonb,
   'b67.3-migration'),
  ('per_underlying_cap', '*', '*', '*', '*', 'b67_3_universe_split_active',
   'true'::jsonb,
   'b67.3-migration')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;
