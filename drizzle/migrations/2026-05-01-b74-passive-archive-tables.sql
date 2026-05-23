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
-- 2026-05-01 — B74 Passive OHLC Archive Pipeline (Equity + Crypto)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Six new tables for continuous 1-min OHLC + ticker-snapshot capture across
-- three asset universes:
--   * equity_spot   — 128 xStocks via wss://ws-equities.kraken.com
--   * equity_perp   — 10 PF_*XUSD perps via Kraken Futures WS
--   * crypto_spot   — USD/USDT/USDC pairs ≥ $10k 24h volume (~400-600 pairs)
--
-- All tables are MONTH-RANGE PARTITIONED on the time column so B70 archival
-- can DROP entire monthly partitions cheaply once cold-storage export lands.
-- 12 forward partitions pre-created here; cron at server/scripts/b74-create-
-- monthly-partitions.ts extends the runway monthly.
--
-- Self-describing rows: every row carries `symbol`, `universe`, and a
-- `metadata` JSONB containing `schema_version` (=1 for B74) so B70's cold-
-- storage reader can handle schema evolution across months.
--
-- NO foreign-key constraints to live tables (trading_signals, paper_sim_trades,
-- regime_factor_alternates, exit_strategy_alternates, etc.) — rows must be
-- cold-archivable standalone per Langston cc-inbox #867 + #869.
--
-- Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
-- Langston-approved Steps 1+2 cc-inbox #867 + #869.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. equity_spot_ohlc_1m  — 128 xStocks 1-min OHLC bars
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equity_spot_ohlc_1m (
  id              BIGSERIAL,
  symbol          TEXT           NOT NULL,
  universe        TEXT           NOT NULL DEFAULT 'equity_spot',
  interval_begin  TIMESTAMPTZ    NOT NULL,
  open            NUMERIC(20, 8) NOT NULL,
  high            NUMERIC(20, 8) NOT NULL,
  low             NUMERIC(20, 8) NOT NULL,
  close           NUMERIC(20, 8) NOT NULL,
  volume          NUMERIC(28, 8) NOT NULL,
  vwap            NUMERIC(20, 8),
  trade_count     INTEGER,
  metadata        JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  captured_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  PRIMARY KEY (interval_begin, symbol, id)
) PARTITION BY RANGE (interval_begin);

CREATE INDEX IF NOT EXISTS equity_spot_ohlc_1m_sym_time
  ON equity_spot_ohlc_1m (symbol, interval_begin DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. equity_perp_ohlc_1m — 10 PF_*XUSD perp 1-min OHLC bars
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equity_perp_ohlc_1m (
  id              BIGSERIAL,
  symbol          TEXT           NOT NULL,
  universe        TEXT           NOT NULL DEFAULT 'equity_perp',
  interval_begin  TIMESTAMPTZ    NOT NULL,
  open            NUMERIC(20, 8) NOT NULL,
  high            NUMERIC(20, 8) NOT NULL,
  low             NUMERIC(20, 8) NOT NULL,
  close           NUMERIC(20, 8) NOT NULL,
  volume          NUMERIC(28, 8) NOT NULL,
  vwap            NUMERIC(20, 8),
  trade_count     INTEGER,
  metadata        JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  captured_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  PRIMARY KEY (interval_begin, symbol, id)
) PARTITION BY RANGE (interval_begin);

CREATE INDEX IF NOT EXISTS equity_perp_ohlc_1m_sym_time
  ON equity_perp_ohlc_1m (symbol, interval_begin DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. crypto_spot_ohlc_1m — ~400-600 USD/USDT/USDC pairs 1-min OHLC bars
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crypto_spot_ohlc_1m (
  id              BIGSERIAL,
  symbol          TEXT           NOT NULL,
  universe        TEXT           NOT NULL DEFAULT 'crypto_spot',
  interval_begin  TIMESTAMPTZ    NOT NULL,
  open            NUMERIC(20, 8) NOT NULL,
  high            NUMERIC(20, 8) NOT NULL,
  low             NUMERIC(20, 8) NOT NULL,
  close           NUMERIC(20, 8) NOT NULL,
  volume          NUMERIC(28, 8) NOT NULL,
  vwap            NUMERIC(20, 8),
  trade_count     INTEGER,
  metadata        JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  captured_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  PRIMARY KEY (interval_begin, symbol, id)
) PARTITION BY RANGE (interval_begin);

CREATE INDEX IF NOT EXISTS crypto_spot_ohlc_1m_sym_time
  ON crypto_spot_ohlc_1m (symbol, interval_begin DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. equity_spot_ticker_snap — 128 xStocks ticker snapshots
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equity_spot_ticker_snap (
  id                BIGSERIAL,
  symbol            TEXT           NOT NULL,
  universe          TEXT           NOT NULL DEFAULT 'equity_spot',
  captured_at       TIMESTAMPTZ    NOT NULL,
  bid               NUMERIC(20, 8),
  bid_qty           NUMERIC(28, 8),
  ask               NUMERIC(20, 8),
  ask_qty           NUMERIC(28, 8),
  last              NUMERIC(20, 8),
  volume_24h        NUMERIC(28, 8),
  vwap_24h          NUMERIC(20, 8),
  high_24h          NUMERIC(20, 8),
  low_24h           NUMERIC(20, 8),
  open_24h          NUMERIC(20, 8),
  prev_day_close    NUMERIC(20, 8),
  prev_day_volume   NUMERIC(28, 8),
  is_extended_hours BOOLEAN,
  open_interest     NUMERIC(28, 8),
  funding_rate      NUMERIC(12, 8),
  metadata          JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  PRIMARY KEY (captured_at, symbol, id)
) PARTITION BY RANGE (captured_at);

CREATE INDEX IF NOT EXISTS equity_spot_ticker_snap_sym_time
  ON equity_spot_ticker_snap (symbol, captured_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. equity_perp_ticker_snap — 10 PF_*XUSD perp ticker snapshots
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equity_perp_ticker_snap (
  id                BIGSERIAL,
  symbol            TEXT           NOT NULL,
  universe          TEXT           NOT NULL DEFAULT 'equity_perp',
  captured_at       TIMESTAMPTZ    NOT NULL,
  bid               NUMERIC(20, 8),
  bid_qty           NUMERIC(28, 8),
  ask               NUMERIC(20, 8),
  ask_qty           NUMERIC(28, 8),
  last              NUMERIC(20, 8),
  volume_24h        NUMERIC(28, 8),
  vwap_24h          NUMERIC(20, 8),
  high_24h          NUMERIC(20, 8),
  low_24h           NUMERIC(20, 8),
  open_24h          NUMERIC(20, 8),
  prev_day_close    NUMERIC(20, 8),
  prev_day_volume   NUMERIC(28, 8),
  is_extended_hours BOOLEAN,
  open_interest     NUMERIC(28, 8),
  funding_rate      NUMERIC(12, 8),
  metadata          JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  PRIMARY KEY (captured_at, symbol, id)
) PARTITION BY RANGE (captured_at);

CREATE INDEX IF NOT EXISTS equity_perp_ticker_snap_sym_time
  ON equity_perp_ticker_snap (symbol, captured_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. crypto_spot_ticker_snap — ~400-600 crypto pair ticker snapshots
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crypto_spot_ticker_snap (
  id                BIGSERIAL,
  symbol            TEXT           NOT NULL,
  universe          TEXT           NOT NULL DEFAULT 'crypto_spot',
  captured_at       TIMESTAMPTZ    NOT NULL,
  bid               NUMERIC(20, 8),
  bid_qty           NUMERIC(28, 8),
  ask               NUMERIC(20, 8),
  ask_qty           NUMERIC(28, 8),
  last              NUMERIC(20, 8),
  volume_24h        NUMERIC(28, 8),
  vwap_24h          NUMERIC(20, 8),
  high_24h          NUMERIC(20, 8),
  low_24h           NUMERIC(20, 8),
  open_24h          NUMERIC(20, 8),
  prev_day_close    NUMERIC(20, 8),
  prev_day_volume   NUMERIC(28, 8),
  is_extended_hours BOOLEAN,
  open_interest     NUMERIC(28, 8),
  funding_rate      NUMERIC(12, 8),
  metadata          JSONB          NOT NULL DEFAULT '{"schema_version": 1}'::jsonb,
  PRIMARY KEY (captured_at, symbol, id)
) PARTITION BY RANGE (captured_at);

CREATE INDEX IF NOT EXISTS crypto_spot_ticker_snap_sym_time
  ON crypto_spot_ticker_snap (symbol, captured_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Pre-create 12 monthly partitions per table (72 partitions total)
-- ───────────────────────────────────────────────────────────────────────────
-- Spans 2026-05 through 2027-04. Cron at server/scripts/b74-create-monthly-
-- partitions.ts extends the runway one month at a time on the 28th.
DO $$
DECLARE
  table_name TEXT;
  month_start DATE;
  month_end DATE;
  partition_name TEXT;
  six_tables TEXT[] := ARRAY[
    'equity_spot_ohlc_1m',
    'equity_perp_ohlc_1m',
    'crypto_spot_ohlc_1m',
    'equity_spot_ticker_snap',
    'equity_perp_ticker_snap',
    'crypto_spot_ticker_snap'
  ];
  i INTEGER;
BEGIN
  FOREACH table_name IN ARRAY six_tables LOOP
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
-- 8. Module-constants seeds for B74 — passive_archive module
-- ───────────────────────────────────────────────────────────────────────────
-- Per Langston cc-inbox #867 (Step 1) + #869 (Step 2). All resolution-scope
-- wildcards because these are global capture-pipeline knobs.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('passive_archive', '*', '*', '*', '*', 'b74_equity_capture_enabled',         'true'::jsonb,    'b74-passive-archive'),
  ('passive_archive', '*', '*', '*', '*', 'b74_perp_capture_enabled',           'true'::jsonb,    'b74-passive-archive'),
  ('passive_archive', '*', '*', '*', '*', 'b74_crypto_capture_enabled',         'true'::jsonb,    'b74-passive-archive'),
  ('passive_archive', '*', '*', '*', '*', 'b74_crypto_min_volume_24h_usd',      '10000'::jsonb,   'b74-passive-archive'),
  ('passive_archive', '*', '*', '*', '*', 'b74_ws_reconnect_max_backoff_sec',   '30'::jsonb,      'b74-passive-archive'),
  ('passive_archive', '*', '*', '*', '*', 'b74_ticker_snapshot_min_interval_ms','1000'::jsonb,    'b74-passive-archive'),
  ('passive_archive', '*', '*', '*', '*', 'b74_partition_lookhead_months',      '12'::jsonb,      'b74-passive-archive')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

COMMIT;
