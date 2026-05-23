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
-- ════════════════════════════════════════════════════════════════════════════
-- B79.0a Migration 1 — xstock_spot data_freshness_window_ms
-- ════════════════════════════════════════════════════════════════════════════
--
-- Empirical inter-tick measurement on staging (2026-05-08, 6h window):
--   - p50 across symbols: 2.5-5.4 seconds
--   - p95: 12-37 seconds
--   - p99: 33-77 seconds (worst case 77s on EWP/USD low-liquidity country ETF)
--
-- Langston Q2 formula: value = max(p99_max + buffer, central_clock_interval).
-- p99_max ≈ 77s + 13s buffer = 90s (rounded up).
--
-- Crypto wildcard for the same key falls back via getModuleConstants
-- precedence; no explicit crypto_spot row added (out of B79.0a scope —
-- crypto path uses existing in-memory cache freshness, not this gate).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('market_data', '*', 'xstock_spot', '*', '*', 'data_freshness_window_ms', '90000'::jsonb, 'B79.0a')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO NOTHING;

-- Langston rev 1 #2: assertion includes value-not-null check.
DO $$
DECLARE row_count int;
BEGIN
  SELECT COUNT(*) INTO row_count FROM module_constants
   WHERE module_name='market_data'
     AND asset_class='xstock_spot'
     AND constant_name='data_freshness_window_ms'
     AND value IS NOT NULL
     AND value::text != 'null';
  IF row_count != 1 THEN
    RAISE EXCEPTION 'B79.0a Migration 1 assertion failed: expected 1 valid (non-null) row, found %', row_count;
  END IF;
END $$;

COMMIT;
