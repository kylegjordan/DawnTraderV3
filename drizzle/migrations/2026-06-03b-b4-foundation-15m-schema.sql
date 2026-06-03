-- B.4 foundation (Step-3 chunk A) — 15-minute bar SCHEMA plumbing.
--
-- Part of the xStock 60-min -> 15-min evaluation-bar switch (scope
-- B_4_FOUNDATION_SCOPE.md v2; pre-audit B_4_FOUNDATION_PRE_AUDIT.md; Langston
-- Step-1 + Step-2 approved). Active trading OFF. xStock-scoped; crypto untouched.
--
-- This migration is the SCHEMA-only first increment. It creates the parallel
-- 15-minute snapshot store and the DBS substrate-stamp column. It does NOT
-- move any data and does NOT change any read path — current 60-min behavior is
-- fully preserved until the later chunks (aggregator 15m branch, per-class
-- lookbacks, DBS recompute) land and the supervised one-shot recompute swaps
-- the DBS substrate. Seeding of the per-class time-anchored lookback constants
-- and the recalibrated regime/VN-DI thresholds ships in the later chunks.
--
-- ── (1) xstock_spot_ohlc_15m_snapshot ──────────────────────────────────────
-- Mirrors xstock_spot_ohlc_60m_snapshot (B-NEW-34b) exactly in shape; the only
-- semantic difference is bucket_ts granularity (15-min buckets vs hourly). The
-- hot read shape is "most recent N buckets per symbol" where N is sized to the
-- DEEPEST 15m consumer = DBS lookback 192 bars + margin (Langston Step-2
-- must-fix #1; the cache MAX_BARS_15M constant, set in the aggregator chunk,
-- is >= ~224). Bounded ~265 syms x ~224 buckets ~= 60k rows. PK enforces
-- idempotent UPSERT from the prewarm script + cache write-back-on-miss.
--
-- ── (2) xstock_dbs_backfill.bar_interval_minutes ───────────────────────────
-- Epoch/substrate stamp (Langston Step-2: recompute PLUS stamp PLUS retain 60m
-- archive). Existing rows are 60-min substrate -> DEFAULT 60 stamps them
-- correctly. The supervised one-shot recompute (later chunk) snapshots the
-- current 60m rows into xstock_dbs_backfill_60m_archive (read-only), clears the
-- live table, and inserts fresh rows stamped 15 -> so the live table is
-- 15m-ONLY and downstream ML can distinguish native-15m from the 60m archive.
-- The mixed-substrate Step-4 proof (no consumer reads mixed rows) keys off this
-- column. Default 60 here preserves current behavior until the recompute runs.

BEGIN;

-- (1) Parallel 15-minute snapshot table (mirror of the 60-min snapshot).
CREATE TABLE IF NOT EXISTS xstock_spot_ohlc_15m_snapshot (
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

-- "most recent N buckets per symbol" hot read = backward index scan, no sort.
CREATE INDEX IF NOT EXISTS idx_xstock_spot_ohlc_15m_snapshot_symbol_ts_desc
  ON xstock_spot_ohlc_15m_snapshot (symbol, bucket_ts DESC);

COMMENT ON TABLE xstock_spot_ohlc_15m_snapshot IS
  'B.4 foundation (2026-06-03): pre-aggregated 15-min OHLC buckets per xStock '
  'symbol. Parallel to xstock_spot_ohlc_60m_snapshot; populated by the prewarm '
  'script + cache write-back-on-miss on the 15-min cold-read path. Cap sized to '
  'DBS-192 + margin (~224 buckets/symbol). xStock-scoped; crypto unaffected.';

-- (2) DBS backfill substrate stamp. DEFAULT 60 stamps existing rows as 60-min.
ALTER TABLE xstock_dbs_backfill
  ADD COLUMN IF NOT EXISTS bar_interval_minutes INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN xstock_dbs_backfill.bar_interval_minutes IS
  'B.4 foundation (2026-06-03): bar substrate the DBS row was computed on. '
  'Existing rows = 60 (default). The supervised one-shot 15-min recompute '
  'archives the 60m rows to xstock_dbs_backfill_60m_archive, clears the live '
  'table, and inserts rows stamped 15 -> live table is 15m-only thereafter. '
  'Mixed-substrate guard: consumers filter on this column (Langston Step-4 proof).';

COMMIT;
