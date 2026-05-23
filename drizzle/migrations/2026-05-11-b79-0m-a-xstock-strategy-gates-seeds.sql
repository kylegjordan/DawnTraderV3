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
-- B79.0m.a — Migrate XSTOCK_SPOT_ENABLED_STRATEGIES from code constant to DB rows.
--
-- Per Langston Step 1 R1: delete the code constant entirely; DB is authoritative.
-- Default-open semantic for asset classes with NO strategy_gates rows preserved
-- (crypto_spot, crypto_perp, etc.). For xstock_spot we seed explicit rows for
-- ALL 19 strategies — 10 enabled, 9 disabled — so the allowlist is fully
-- explicit and queryable (no "missing row = denied" inference).
--
-- 19 total rows: 10 enabled (matching previous code constant) + 9 disabled
-- (matching previous Set-non-membership).
-- ORB already has its row from B79 seed (enabled=true). Other 18 rows below.

BEGIN;

-- Enabled (matching previous XSTOCK_SPOT_ENABLED_STRATEGIES whitelist; 9 rows
-- — orb already seeded by B79)
INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'vwap_pullback',      NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'breakout',           NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'mean_reversion',     NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'range_trade',        NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'sma_trend_ride',     NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'vwap_bounce',        NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'inside_bar_reversal',NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'morning_star',       NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'true'::jsonb,  'xstock_spot', '*', '*', 'pivot_shift',        NOW(), 'b79.0m.a'),

  -- Explicitly disabled for xstock_spot (matches previous Set-non-membership
  -- semantic; preserves intent of conservative ship + adapts naturally to
  -- B82+ ablation evidence by UPDATEing rows instead of editing code).
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'strong_bull_trend',  NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'abcd_long',          NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'dhma',               NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'liquidity_trap',     NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'volatility_edge',    NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'defensive_hedge',    NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'reverse_impulse',    NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'support_bounce',     NOW(), 'b79.0m.a'),
  ('strategy_gates', 'enabled', 'false'::jsonb, 'xstock_spot', '*', '*', 'adaptive_flow',      NOW(), 'b79.0m.a')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;
