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
-- B65.1 Migration 3 of 3 — Create module_constants table + seed TEC defaults
--
-- Purpose: create the central 5-dimensional constants table that will hold all
-- tunable parameters promoted out of source code in B66 and future batches.
-- Resolution hierarchy is MOST-SPECIFIC-WINS per MODULARIZATION_SYNTHESIS §3.3.
--
-- Dimensions: (module_name, exchange, asset_class, strategy, regime, constant_name)
-- Wildcards: '*' means "applies to all values of this dimension."
-- Primary key is the full 6-tuple so same (module, constant) can have specific
-- overrides per (exchange, asset_class, strategy, regime) combination.
--
-- Seeded at migration time with current TEC (trailing-exit-controller) defaults
-- per Langston Phase 2 Q2 direction (defensive — B66 becomes pure value-tuning
-- instead of value-insertion; service works from day 1 without empty-table
-- fallback paths).
--
-- B66 will add entries for the 6 P1 formula constants (SCORE_WEIGHTS + RW
-- coefficients) once promotion is scoped.
--
-- Rollback: see 2026-04-23-b65-rollback-module-constants.sql

BEGIN;

CREATE TABLE IF NOT EXISTS module_constants (
  module_name   TEXT NOT NULL,
  exchange      TEXT NOT NULL DEFAULT '*',
  asset_class   TEXT NOT NULL DEFAULT '*',
  strategy      TEXT NOT NULL DEFAULT '*',
  regime        TEXT NOT NULL DEFAULT '*',
  constant_name TEXT NOT NULL,
  value         JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    TEXT,
  PRIMARY KEY (module_name, exchange, asset_class, strategy, regime, constant_name)
);

COMMENT ON TABLE module_constants IS
  'B65 (2026-04-23): Central tunable-parameter table. 5-dimensional keying per (exchange, asset_class, strategy, regime, constant_name) under a module_name. Resolution hierarchy is most-specific-wins with ''*'' as wildcard. Reads go through moduleConstantsService.ts with 60s cache.';

-- Index for reverse lookup: "what constants exist for this (exchange, asset_class) combo?"
CREATE INDEX IF NOT EXISTS idx_module_constants_exchange_asset
  ON module_constants (exchange, asset_class);

-- ── Seed TEC defaults (trailing_exit module) ────────────────────────────────
-- These values match the current hardcoded defaults in trailing-exit-controller.ts
-- and analysis-utils.ts. Wildcards on exchange/asset_class/strategy/regime mean
-- they apply universally until someone adds a more-specific override.

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- Break-even trigger: at how many R is break-even stop activated?
  ('trailing_exit', '*', '*', '*', '*', 'break_even_trigger_r', '1.0'::jsonb, 'B65-migration'),
  -- Target-lock trigger: at how many R is trailing take activated?
  ('trailing_exit', '*', '*', '*', '*', 'target_lock_r', '1.5'::jsonb, 'B65-migration'),
  -- Trail distance multiplier (× ATR) once trailing is active
  ('trailing_exit', '*', '*', '*', '*', 'trail_distance_atr_multiplier', '1.0'::jsonb, 'B65-migration'),
  -- Persistence debounce: write interval for mode persistence (ms)
  ('trailing_exit', '*', '*', '*', '*', 'persistence_debounce_ms', '5000'::jsonb, 'B65-migration')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ── Verification (manual post-migration) ────────────────────────────────────
-- SELECT COUNT(*) FROM module_constants;
-- Expect: 4 rows (the TEC seeds above).
-- SELECT module_name, constant_name, value FROM module_constants WHERE module_name='trailing_exit';

COMMIT;
