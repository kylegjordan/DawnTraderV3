-- B67.0 Migration — Regime Factor Alternates table for replay-ablation framework
--
-- Creates the table that captures, on every signal evaluation, the real classifier
-- decision plus N alternate decisions (one per B67/B68 factor). Each alternate is
-- computed as "what would I have decided if this factor were absent?" The nightly
-- replay-ablation.ts job replays each alternate against the trade's actual price
-- path to compute the counterfactual outcome.
--
-- Architecture per BATCH_67_SCOPE.md §4 + BATCH_67_PRE_AUDIT.md §6.4 (V2). The
-- table is a SIBLING to trading_signals/paper_sim_trades, not a replacement —
-- the real decision continues to flow through existing tables. This table only
-- stores the counterfactual deltas.
--
-- Each row represents ONE (signal, factor) combination. A single signal
-- evaluation produces N rows in this table — one per confidence-modifying factor
-- that has been deployed (B67.1 macro, B67.2 phase, B67.4 outcome feedback,
-- B68.1 multi-TF, B68.2 volume regime, B68.3 pair correlation, B68.4 regime age,
-- B68.5 Path B sustainability).
--
-- B67.3 (per-underlying limits) is admission-gating, not confidence-modifying,
-- and uses a separate universe-split A/B mechanism (pair_id_hash on the trade
-- record) — NOT this table.
--
-- Storage: ~1k rows/day at current VTS scale, growing linearly with factor count.
-- Retention: 90 days raw + permanent rolled-up daily aggregates (managed by the
-- replay job + downstream aggregator).
--
-- Rollback: 2026-04-28-b67-0-rollback.sql

BEGIN;

CREATE TABLE IF NOT EXISTS regime_factor_alternates (
  id              SERIAL PRIMARY KEY,
  -- source_type discriminates the active-trading path (writes to trading_signals
  -- table, has signal_id) from the VTS path (no trading_signals row, has its own
  -- trade-record id). Exactly one of signal_id / vts_trade_id is populated; the
  -- other is NULL. CHECK constraint enforces XOR semantics.
  source_type     TEXT NOT NULL CHECK (source_type IN ('active_signal', 'vts_trade')),
  signal_id       INTEGER,
  vts_trade_id    TEXT,
  pair_symbol     TEXT NOT NULL,
  evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  factor_name     TEXT NOT NULL,
  factor_state    TEXT NOT NULL CHECK (factor_state IN ('alternate_disabled', 'alternate_enabled')),
  real_decision   JSONB NOT NULL,
  alternate_decision JSONB NOT NULL,
  replay_outcome  JSONB,
  replay_completed_at TIMESTAMPTZ,
  CONSTRAINT regime_factor_alternates_source_xor CHECK (
    (source_type = 'active_signal' AND signal_id IS NOT NULL AND vts_trade_id IS NULL)
    OR
    (source_type = 'vts_trade' AND signal_id IS NULL AND vts_trade_id IS NOT NULL)
  )
);

-- Time-series queries by factor (dashboard "real WR vs alternate WR for factor X over window")
CREATE INDEX IF NOT EXISTS regime_factor_alternates_factor_time_idx
  ON regime_factor_alternates (factor_name, evaluated_at DESC);

-- Join to trading_signals (active-trading path)
CREATE INDEX IF NOT EXISTS regime_factor_alternates_signal_idx
  ON regime_factor_alternates (signal_id) WHERE signal_id IS NOT NULL;

-- Join to VTS trade records (passive-learning path)
CREATE INDEX IF NOT EXISTS regime_factor_alternates_vts_trade_idx
  ON regime_factor_alternates (vts_trade_id) WHERE vts_trade_id IS NOT NULL;

-- Find rows pending replay (replay job query)
CREATE INDEX IF NOT EXISTS regime_factor_alternates_pending_replay_idx
  ON regime_factor_alternates (replay_completed_at)
  WHERE replay_completed_at IS NULL;

-- Pair-level grouping (per-pair counterfactual queries)
CREATE INDEX IF NOT EXISTS regime_factor_alternates_pair_time_idx
  ON regime_factor_alternates (pair_symbol, evaluated_at DESC);

-- Module_constants seed rows for B67.0
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('ablation_framework', '*', '*', '*', '*', 'b67_0_ablation_emit_enabled',
   'true'::jsonb,
   'b67.0-migration'),
  ('ablation_framework', '*', '*', '*', '*', 'b67_0_alternates_retention_days',
   '90'::jsonb,
   'b67.0-migration'),
  ('ablation_framework', '*', '*', '*', '*', 'b67_0_paper_replay_capital_threshold_pct',
   '0.80'::jsonb,
   'b67.0-migration')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;
