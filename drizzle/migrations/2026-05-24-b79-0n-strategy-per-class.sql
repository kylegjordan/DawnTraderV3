-- B79.0n.STRATEGY — per-asset-class strategy_settings + xstock_spot strategy_gates seed
-- Scope ref: Claude Comms and Packages/Scope Files/B79_0n_STRATEGY_SCOPE.md (v2.1)
-- Pre-audit ref: Claude Comms and Packages/Scope Files/B79_0n_STRATEGY_PRE_AUDIT.md (v1)
-- Langston ACK: scope 8fda3666d; pre-audit 17b3ca81a; Step 3 entry approved 2026-05-23 PM
--
-- DISCIPLINE (per Langston gov flag 1 in Step 2 ACK):
--   1. DROP existing UNIQUE before CREATE new — no orphaned indexes
--   2. strategy_settings_audit gets identical asset_class treatment (audit-table parity)
--   3. Backfill UPDATE runs BEFORE NOT NULL constraint
--   4. Rollback stub at sibling file is symmetric
--
-- ATOMICITY: single BEGIN/COMMIT transaction — partial failure rolls back fully.

-- ============================================================================
-- DEPENDENCY: requires 2026-05-24a-b79-0n-strategy-enum-orb.sql to have run first
-- (adds 'orb' to strategy_type enum — split into separate file because PG enum
-- DDL cannot run in the same transaction as schema changes that reference it).
-- MANIFEST.txt ordering ensures 2026-05-24a runs before 2026-05-24.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: strategy_settings — add asset_class column, backfill, swap UNIQUE
-- ============================================================================

-- Add nullable column first (avoid NOT NULL violation on existing rows)
ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20);

-- Backfill existing rows with 'crypto_spot' (all pre-batch rows are crypto-implicit)
UPDATE strategy_settings SET asset_class = 'crypto_spot' WHERE asset_class IS NULL;

-- Now constrain NOT NULL (safe after backfill)
ALTER TABLE strategy_settings ALTER COLUMN asset_class SET NOT NULL;

-- Swap UNIQUE constraint: drop old, create new (atomicity preserved inside BEGIN/COMMIT)
DROP INDEX IF EXISTS strategy_settings_global_context_mode_strategy_idx;
CREATE UNIQUE INDEX strategy_settings_global_context_mode_strategy_asset_class_idx
  ON strategy_settings (global_context_id, mode, strategy, asset_class);

-- ============================================================================
-- Step 2: strategy_settings_audit — identical asset_class treatment (audit-table parity)
-- ============================================================================

ALTER TABLE strategy_settings_audit ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20);
UPDATE strategy_settings_audit SET asset_class = 'crypto_spot' WHERE asset_class IS NULL;
ALTER TABLE strategy_settings_audit ALTER COLUMN asset_class SET NOT NULL;

-- ============================================================================
-- Step 3: Seed strategy_gates rows for ALL 19 strategies × xstock_spot (E-2 approved)
-- ============================================================================
-- Per XSTOCK_SPOT_ENABLED_STRATEGIES (canonical-regime-strategy-map.ts SIM line 1920):
--   10 enabled: vwap_pullback, breakout, mean_reversion, range_trade, sma_trend_ride,
--               strong_bull_trend, morning_star, inside_bar_reversal, support_bounce, orb
--   9 not-yet-enabled: abcd_long, vwap_bounce, dhma, pivot_shift, reverse_impulse,
--                       defensive_hedge, adaptive_flow, volatility_edge, liquidity_trap
--
-- ORB's enabled=true row pre-exists from B79.0d migration; ON CONFLICT preserves it.
-- 18 new rows total (9 enabled=true + 9 enabled=false; ORB ON CONFLICT no-op).

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- 10 enabled=true (matching XSTOCK_SPOT_ENABLED_STRATEGIES). ORB ON CONFLICT no-op.
  ('strategy_gates', '*', 'xstock_spot', 'vwap_pullback',       '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'breakout',            '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'mean_reversion',      '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'range_trade',         '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'sma_trend_ride',      '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'strong_bull_trend',   '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'morning_star',        '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'inside_bar_reversal', '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'support_bounce',      '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'orb',                 '*', 'enabled', 'true'::jsonb,  'b79-0n-strategy'),
  -- 9 enabled=false (NOT in XSTOCK_SPOT_ENABLED_STRATEGIES; explicit per NO-SILENT-FALLBACK)
  ('strategy_gates', '*', 'xstock_spot', 'abcd_long',           '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'vwap_bounce',         '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'dhma',                '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'pivot_shift',         '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'reverse_impulse',     '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'defensive_hedge',     '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'adaptive_flow',       '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'volatility_edge',     '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy'),
  ('strategy_gates', '*', 'xstock_spot', 'liquidity_trap',      '*', 'enabled', 'false'::jsonb, 'b79-0n-strategy')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;

-- Verification queries (NOT executed by db:migrate, included as comments for Step 7):
-- SELECT COUNT(*) FROM strategy_settings WHERE asset_class = 'crypto_spot';  -- expect: pre-batch count of strategy_settings rows
-- SELECT COUNT(*) FROM module_constants WHERE module_name='strategy_gates' AND asset_class='xstock_spot' AND constant_name='enabled';  -- expect: 19 (10 true + 9 false)
-- SELECT strategy, value FROM module_constants WHERE module_name='strategy_gates' AND asset_class='xstock_spot' AND constant_name='enabled' ORDER BY strategy;  -- visual inspection
