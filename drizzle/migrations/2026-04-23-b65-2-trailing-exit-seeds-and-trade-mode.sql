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
-- B65.2 Migration — Trailing-exit seeds + trade_mode column on paper_sim_trades
--
-- Part 1: Append module_constants rows for the moonbag qualifier, duration cap,
--   concurrency cap, and the migrated max_position_risk that used to live in
--   the now-deleted execution-config.ts. All rows idempotent via ON CONFLICT.
--
-- Part 2: Add trade_mode column to paper_sim_trades so closed simulated trades
--   preserve whether the trade ended in TARGET or TRAILING_TAKE mode. Backfill
--   all existing rows to 'TARGET' (no trade has ever been in trailing mode
--   because the engine has been dormant).
--
-- Rollback: 2026-04-23-b65-2-rollback.sql

BEGIN;

-- ============================================================================
-- Part 1: module_constants seeds for trailing_exit + risk_sizing modules
-- ============================================================================

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  -- B65.2 moonbag qualifier: which strategies enter trailing mode on target hit
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_qualifying_strategies',
   '["strong_bull_trend","sma_trend_ride","vwap_pullback","breakout"]'::jsonb,
   'b65.2-migration'),

  -- B65.2 moonbag qualifier refinement: strategies that only qualify in specific source pools
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_qualifying_source_pools',
   '{"vwap_pullback":["quant-strong_trend"]}'::jsonb,
   'b65.2-migration'),

  -- B65.2 moonbag duration cap: 4 hours in trailing mode max before auto-close
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_max_duration_ms',
   '14400000'::jsonb,
   'b65.2-migration'),

  -- B65.2 moonbag concurrency cap mode (default for paper + live)
  -- VTS override is enforced in service-layer logic (regime='vts_override' is
  -- a placeholder for a future mode dimension we don't add in this batch).
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_cap_mode',
   '"reserved_slots"'::jsonb,
   'b65.2-migration'),

  -- B65.2 moonbag reserved slots: leave at least this many slots free for fresh setups
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_reserved_slots',
   '1'::jsonb,
   'b65.2-migration'),

  -- B65.2 risk sizing module: promoted from execution-config.ts::MAX_POSITION_RISK
  -- before deletion. 2% of balance is the absolute cap on any single position.
  ('risk_sizing', '*', '*', '*', '*', 'max_position_risk',
   '0.02'::jsonb,
   'b65.2-migration')

ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ============================================================================
-- Part 2: trade_mode column on paper_sim_trades
-- ============================================================================

ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS trade_mode VARCHAR(20) NOT NULL DEFAULT 'TARGET';

-- Backfill: every historical row closes in TARGET mode (trailing engine has
-- been dormant across the entire trade history).
UPDATE paper_sim_trades
   SET trade_mode = 'TARGET'
 WHERE trade_mode IS NULL;

-- Explicit value domain. Named constraint so it can be dropped cleanly in rollback.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'paper_sim_trades_trade_mode_chk'
  ) THEN
    ALTER TABLE paper_sim_trades
      ADD CONSTRAINT paper_sim_trades_trade_mode_chk
      CHECK (trade_mode IN ('TARGET', 'TRAILING_TAKE'));
  END IF;
END $$;

COMMENT ON COLUMN paper_sim_trades.trade_mode IS
  'B65.2 (2026-04-23): preserves the trailing-exit mode the trade ended in. TARGET = closed at static target (or stop/timeout); TRAILING_TAKE = entered moonbag (trailing) mode and closed via trailing_stop_hit or moonbag_timeout.';

COMMIT;
