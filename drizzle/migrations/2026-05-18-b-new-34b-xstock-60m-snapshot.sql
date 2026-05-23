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
-- B-NEW-34b — xStock 60-min OHLC snapshot table for cold-start recovery
-- + weekly weekend pre-warm.
--
-- Context (RUNNING_ISSUES #118): The B-NEW-34a hotfix attempted to handle
-- the xStock weekend session gap (Fri 8PM ET → Sun 8PM ET = 48 wall-clock
-- hours during which the live-aggregator's lookback window contains no
-- bar-producing minutes) by widening the live aggregator's lookback. Three
-- iterations (60h → 240h → 168h → 120h) all either failed the 24-bar floor
-- on Mon-morning (60h) or hit per-cycle SCAN_TIMEOUT (240h/168h, and 120h
-- unverified) because the DISTINCT ON dedup over B74's 18-56× duplicated
-- source rows scales with the window width and saturates the budget.
--
-- B-NEW-34b pivots to a snapshot architecture: pre-aggregate the historical
-- 60-min buckets ONCE per symbol (slow query, one-off) and store them in
-- this table. The hot scanner-cycle path then reads pre-aggregated rows
-- here (cheap indexed PK scan) plus a NARROW (24h) live overlay for the
-- recent tail. Net per-cycle DB IO drops by ~80% vs the 120h live path
-- because the wide DISTINCT ON is replaced by a small PK-indexed scan.
--
-- Schema:
--   - PK (symbol, bucket_ts) enforces idempotent UPSERTs from the pre-warm
--     script and the cache's write-back-on-miss path.
--   - source_bar_count tracks how many 1m rows fed this bucket (forensic;
--     also surfaces underfilled buckets without re-querying source).
--   - captured_at records when this snapshot row was last refreshed (cache
--     write-back updates this; pre-warm script writes NOW()).
--   - DESC index on (symbol, bucket_ts) supports the "most recent 60 per
--     symbol" hot read shape.
--
-- Lifecycle:
--   1. B-NEW-34b deploy + one-off pre-warm: populates with last 60 buckets
--      per symbol from xstock_spot_ohlc_1m (14-day wide window).
--   2. Hot scanner cycles read this table + 24h live overlay on cache miss.
--   3. Cache write-back-on-miss path UPSERTs the most-recent 5 buckets per
--      symbol so the snapshot stays ≤5 min stale during active scanning.
--   4. B-NEW-36 (Off-hours session-lifecycle controller, next batch):
--      Fri 8PM ET shutdown runs the pre-warm script again to capture
--      closing-week bars; Sun 8PM ET startup runs it once more before
--      scanner subscribes to centralClock so cold start reads fresh rows.
--
-- Reference: MULTI_ASSET_VTS_EXPANSION_PLAN.md row 2026-05-18 evening;
--            MEMORY.md "IMMEDIATE POST-COMPACT ACTION" Step A.

BEGIN;

CREATE TABLE IF NOT EXISTS xstock_spot_ohlc_60m_snapshot (
  symbol             VARCHAR(32)     NOT NULL,
  bucket_ts          TIMESTAMPTZ     NOT NULL,
  open               NUMERIC(20, 8)  NOT NULL,
  high               NUMERIC(20, 8)  NOT NULL,
  low                NUMERIC(20, 8)  NOT NULL,
  close              NUMERIC(20, 8)  NOT NULL,
  volume             NUMERIC(28, 8)  NOT NULL DEFAULT 0,
  source_bar_count   INTEGER         NOT NULL DEFAULT 0,
  captured_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, bucket_ts)
);

-- Hot read shape: "give me the last 60 buckets per symbol".
-- The PK already covers (symbol, bucket_ts ASC); adding the DESC variant
-- so ORDER BY bucket_ts DESC LIMIT 60 is a backward index scan with no sort.
CREATE INDEX IF NOT EXISTS idx_xstock_spot_ohlc_60m_snapshot_symbol_ts_desc
  ON xstock_spot_ohlc_60m_snapshot (symbol, bucket_ts DESC);

COMMENT ON TABLE xstock_spot_ohlc_60m_snapshot IS
  'B-NEW-34b (2026-05-18): Pre-aggregated 60-min OHLC buckets per xStock symbol. '
  'Cache reads on cold-start to satisfy min_ohlc_history_bars floor without '
  'live DISTINCT ON aggregation over xstock_spot_ohlc_1m duplicate rows. '
  'Refreshed by one-off pre-warm script + cache write-back-on-miss + (future '
  'B-NEW-36) weekly Fri-night/Sun-night session-lifecycle pre-warm.';

COMMENT ON COLUMN xstock_spot_ohlc_60m_snapshot.source_bar_count IS
  'Number of distinct 1-min source rows aggregated into this bucket (post-DISTINCT-ON dedup). '
  'Forensic: surfaces underfilled buckets without re-querying xstock_spot_ohlc_1m.';

COMMENT ON COLUMN xstock_spot_ohlc_60m_snapshot.captured_at IS
  'When this snapshot row was last refreshed. Pre-warm script writes NOW(); cache '
  'write-back path updates on every miss. Use to detect stale rows in operations.';

COMMIT;
