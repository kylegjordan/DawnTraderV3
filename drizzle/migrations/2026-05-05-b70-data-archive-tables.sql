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
-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-05-05 — B70 Data Archive Pipeline (Pair Scan + Signal Eval + Exit + Macro)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Five new tables for unified data capture across VTS / paper-sim / live modes.
-- All five tables carry both a `mode` column (system-state, derived from the
-- run-mode-controller `getCurrentMode()` accessor) AND a `source` column (per-
-- hook origin, hardcoded at the call site). Per Langston cc-inbox #896 refine-
-- ment, this two-column discriminator decouples system mode from hook origin
-- for the VTS-always-on edge case where VTS and paper-sim could run concurrently.
--
-- Tables:
--   1. pair_scan_archive       — per-pair × per-cycle MCE scan-state snapshot
--   2. signal_eval_archive     — per-strategy × per-pair admit + reject row
--   3. exit_decision_archive   — per closed-trade exit snapshot (parallel to B73 counterfactual)
--   4. macro_feed_archive      — B67.1 macro snapshot timeseries
--   5. b62_retroactive_labels  — one-shot Mar 6 - Apr 16 VTS re-labeling
--
-- All tables MONTH-RANGE PARTITIONED so retention sweep can DROP whole
-- partitions cheaply. 12 forward partitions pre-created (2026-05 → 2027-04).
-- Cron at server/scripts/b70-create-monthly-partitions.ts will extend.
--
-- Self-describing rows: every JSONB blob carries `schema_version: 1` (per
-- D.3 refinement). Bump on breaking shape changes.
--
-- B69 schema-uniformity: every row carries `asset_class` + `exchange` columns.
-- Per Kyle directive 2026-05-03, these are first-class fields, not metadata.
--
-- Reference: BATCH_70_SCOPE.md + BATCH_70_PRE_AUDIT.md
-- Langston-approved Steps 1+2 cc-inbox #893 + #894 + #895 + #896.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. pair_scan_archive — per-pair × per-cycle MCE scan-state snapshot
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pair_scan_archive (
  id                  BIGSERIAL,
  captured_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  symbol              TEXT           NOT NULL,
  exchange            TEXT           NOT NULL,
  asset_class         TEXT           NOT NULL,
  mode                TEXT           NOT NULL,            -- 'vts' | 'paper_sim' | 'live'
  source              TEXT           NOT NULL,            -- hook origin: 'mce-cycle'
  -- Flat columns for the 80%-query basics (D.2 hybrid design)
  regime_label        TEXT,
  regime_confidence   NUMERIC(8, 6),
  dbs_score           NUMERIC(10, 6),
  dbs_category        TEXT,
  atr_pct             NUMERIC(12, 8),
  confidence_modulated NUMERIC(8, 6),
  -- JSONB heavy columns (D.3: schema_version embedded inside)
  features            JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  modulators          JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  scan_stage_decision JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  PRIMARY KEY (captured_at, symbol, id)
) PARTITION BY RANGE (captured_at);

CREATE INDEX IF NOT EXISTS pair_scan_archive_sym_time
  ON pair_scan_archive (symbol, captured_at DESC);
CREATE INDEX IF NOT EXISTS pair_scan_archive_mode_time
  ON pair_scan_archive (mode, captured_at DESC);
CREATE INDEX IF NOT EXISTS pair_scan_archive_asset_class_time
  ON pair_scan_archive (asset_class, captured_at DESC);
-- GIN partial index on the most-queried JSONB key
CREATE INDEX IF NOT EXISTS pair_scan_archive_scan_stage_gin
  ON pair_scan_archive USING GIN ((scan_stage_decision -> 'stage'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. signal_eval_archive — per-strategy × per-pair admit + reject row
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signal_eval_archive (
  id                  BIGSERIAL,
  captured_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  symbol              TEXT           NOT NULL,
  exchange            TEXT           NOT NULL,
  asset_class         TEXT           NOT NULL,
  mode                TEXT           NOT NULL,
  source              TEXT           NOT NULL,            -- 'vts-runner' | 'signal-orchestrator'
  strategy            TEXT           NOT NULL,
  -- Flat columns for the 80%-query basics
  regime_label        TEXT,
  reject_stage        TEXT           NOT NULL,            -- 'admitted' | 'pre_filter' | 'sqe' | 'rtb' | 'tcl' | 'strategy_internal'
  final_score         NUMERIC(8, 6),
  confidence_modulated NUMERIC(8, 6),
  -- JSONB heavy columns
  features            JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  modulators          JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  gate_decision       JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  PRIMARY KEY (captured_at, symbol, strategy, id)
) PARTITION BY RANGE (captured_at);

CREATE INDEX IF NOT EXISTS signal_eval_archive_sym_strat_time
  ON signal_eval_archive (symbol, strategy, captured_at DESC);
CREATE INDEX IF NOT EXISTS signal_eval_archive_reject_stage_time
  ON signal_eval_archive (reject_stage, captured_at DESC);
CREATE INDEX IF NOT EXISTS signal_eval_archive_mode_time
  ON signal_eval_archive (mode, captured_at DESC);
CREATE INDEX IF NOT EXISTS signal_eval_archive_asset_class_time
  ON signal_eval_archive (asset_class, captured_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. exit_decision_archive — per closed-trade exit snapshot
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exit_decision_archive (
  id                  BIGSERIAL,
  captured_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  trade_id            TEXT           NOT NULL,
  symbol              TEXT           NOT NULL,
  exchange            TEXT           NOT NULL,
  asset_class         TEXT           NOT NULL,
  mode                TEXT           NOT NULL,
  source              TEXT           NOT NULL,            -- 'vts-runner' | 'paper-execution-engine' | 'live-trading-service'
  strategy            TEXT,
  -- Flat columns
  exit_reason         TEXT           NOT NULL,            -- 'BE_stop' | 'SL_hit' | 'TP_target_hit' | 'TRAIL_hit' | 'time_stop' | 'regime_flip'
  entry_price         NUMERIC(20, 10),
  exit_price          NUMERIC(20, 10),
  pnl_pct             NUMERIC(12, 6),
  r_multiple          NUMERIC(12, 6),
  duration_min        NUMERIC(12, 4),
  regime_at_entry     TEXT,
  regime_at_exit      TEXT,
  dbs_at_entry        NUMERIC(10, 6),
  dbs_at_exit         NUMERIC(10, 6),
  atr_at_exit         NUMERIC(20, 10),
  -- JSONB heavy snapshot
  state_snapshot      JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  PRIMARY KEY (captured_at, trade_id, id)
) PARTITION BY RANGE (captured_at);

CREATE INDEX IF NOT EXISTS exit_decision_archive_trade
  ON exit_decision_archive (trade_id);
CREATE INDEX IF NOT EXISTS exit_decision_archive_sym_time
  ON exit_decision_archive (symbol, captured_at DESC);
CREATE INDEX IF NOT EXISTS exit_decision_archive_reason_time
  ON exit_decision_archive (exit_reason, captured_at DESC);
CREATE INDEX IF NOT EXISTS exit_decision_archive_mode_time
  ON exit_decision_archive (mode, captured_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. macro_feed_archive — B67.1 macro snapshot timeseries
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS macro_feed_archive (
  id                  BIGSERIAL,
  captured_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  source              TEXT           NOT NULL,            -- 'coingecko-global' | 'binance-funding'
  -- Flat columns for the macro inputs
  btc_dominance_pct   NUMERIC(10, 6),
  mcap_momentum       NUMERIC(12, 8),
  funding_rate        NUMERIC(12, 8),
  modifier_value      NUMERIC(8, 6),
  fallback_active     BOOLEAN        NOT NULL DEFAULT FALSE,
  -- Full snapshot for forensic analysis
  snapshot            JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  PRIMARY KEY (captured_at, source, id)
) PARTITION BY RANGE (captured_at);

CREATE INDEX IF NOT EXISTS macro_feed_archive_source_time
  ON macro_feed_archive (source, captured_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. b62_retroactive_labels — one-shot Mar 6 - Apr 16 VTS re-labeling
-- ───────────────────────────────────────────────────────────────────────────
-- NOT partitioned (small one-shot fill, ~3-5k rows total, never grows).
CREATE TABLE IF NOT EXISTS b62_retroactive_labels (
  id                              BIGSERIAL PRIMARY KEY,
  trade_id                        TEXT           NOT NULL UNIQUE,
  symbol                          TEXT           NOT NULL,
  asset_class                     TEXT           NOT NULL,
  trade_opened_at                 TIMESTAMPTZ    NOT NULL,
  original_label                  TEXT,
  retroactive_label               TEXT,
  label_diff_flag                 BOOLEAN        NOT NULL,
  classifier_version_original     TEXT,
  classifier_version_retroactive  TEXT,
  retroactive_inputs              JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  labeled_at                      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS b62_retroactive_labels_diff
  ON b62_retroactive_labels (label_diff_flag, retroactive_label);
CREATE INDEX IF NOT EXISTS b62_retroactive_labels_opened
  ON b62_retroactive_labels (trade_opened_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Pre-create 12 monthly partitions per partitioned table (4 × 12 = 48)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  table_name TEXT;
  month_start DATE;
  month_end DATE;
  partition_name TEXT;
  partitioned_tables TEXT[] := ARRAY[
    'pair_scan_archive',
    'signal_eval_archive',
    'exit_decision_archive',
    'macro_feed_archive'
  ];
  i INTEGER;
BEGIN
  FOREACH table_name IN ARRAY partitioned_tables LOOP
    FOR i IN 0..11 LOOP
      month_start := DATE '2026-05-01' + (i || ' months')::INTERVAL;
      month_end   := month_start + INTERVAL '1 month';
      partition_name := table_name || '_' || TO_CHAR(month_start, 'YYYY_MM');
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        partition_name, table_name, month_start, month_end
      );
    END LOOP;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Module-constants seeds — data_archive module
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_archive', '*', '*', '*', '*', 'b70_pair_scan_capture_enabled',           'true'::jsonb,    'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_signal_eval_capture_enabled',         'true'::jsonb,    'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_signal_eval_pre_filter_capture',      'true'::jsonb,    'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_exit_decision_capture_enabled',       'true'::jsonb,    'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_macro_feed_capture_enabled',          'true'::jsonb,    'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_parquet_export_enabled',              'false'::jsonb,   'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_partition_lookhead_months',           '2'::jsonb,       'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_postgres_retention_days',             '90'::jsonb,      'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_retention_sweep_batch_size',          '10000'::jsonb,   'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_retention_sweep_pause_ms',            '100'::jsonb,     'b70-data-archive'),
  ('data_archive', '*', '*', '*', '*', 'b70_archive_writer_queue_max',            '50000'::jsonb,   'b70-data-archive')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

COMMIT;
