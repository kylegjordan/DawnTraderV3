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
-- B73 — Exit-Strategy Ablation Framework
--
-- Observation-only framework that records what 12 BE-stop / trailing-stop
-- variants WOULD have done on every closed trade. No exit-behavior changes.
--
-- Triggered by Kyle's review of 7d closed-trades CSV showing 509 BE_STOP
-- (44%) vs only 22 take-profit-target hits (2%) — long winning streaks gone.
-- Counterfactual analysis on n=87 trades suggested ~+1.2% per-trade gain
-- from removing BE-stop, but n too small to act on. B73 builds the
-- multi-week observation framework.
--
-- See BATCH_73_SCOPE.md + BATCH_73_PRE_AUDIT.md for full design.

BEGIN;

CREATE TABLE IF NOT EXISTS exit_strategy_alternates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id VARCHAR NOT NULL,
  trade_source VARCHAR NOT NULL CHECK (trade_source IN ('paper', 'vts')),
  variant_id VARCHAR NOT NULL,
  variant_name VARCHAR NOT NULL,
  virtual_exit_price NUMERIC(20, 8),
  virtual_exit_reason VARCHAR NOT NULL,
  virtual_exit_time TIMESTAMPTZ,
  virtual_pnl_pct NUMERIC(10, 4),
  virtual_duration_min INT,
  baseline_pnl_pct NUMERIC(10, 4),
  regime TEXT,
  strategy TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exit_strategy_alternates_unique UNIQUE (trade_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_exit_strategy_alternates_variant_created
  ON exit_strategy_alternates (variant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_exit_strategy_alternates_regime_variant
  ON exit_strategy_alternates (regime, variant_id);

-- B73: 13 module_constants for variant params + global config in new
-- exit_strategy_replay module. See BATCH_73_PRE_AUDIT.md §B.1.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_baseline_be_trigger_r',         '1.0'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_baseline_trail_distance_atr',   '1.0'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_b_be_atr_pad',          '0.5'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_c_be_trigger_r',        '1.5'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_h_trail_distance_atr',  '0.5'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_i_trail_distance_atr',  '2.0'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_variant_e_vol_p75_threshold',   '0.020'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_max_hold_ms',                   '604800000'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_ohlc_buffer_ms',                '3600000'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_min_n_total',                   '200'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_min_n_per_regime',              '50'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_replay_enabled',                'true'::jsonb, 'b73-exit-ablation'),
  ('exit_strategy_replay', '*', '*', '*', '*', 'b73_replay_async_timeout_ms',       '5000'::jsonb, 'b73-exit-ablation')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

COMMIT;
