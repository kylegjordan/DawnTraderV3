-- P19-B5c — Continuous Q-D (Quote-Depth) friction-evidence probe → NEW table
-- `xstock_qd_probe_history` + module_constants seed (RUNNING_ISSUES #86).
--
-- WHAT: an always-on (every-5-min) probe records, per active xStock symbol, a
-- COMPACT DERIVED on-venue friction row (bid/ask spread + top-of-book depth +
-- freshness) read from the internal `xstock_spot_ticker_snap` archive. The raw
-- tick archive already holds bid/ask, but B75 prunes + cold-offloads it, so it
-- is not a stable long-horizon series; this table is the retention-tuned,
-- query-ready friction-distribution surface (mean/p95/skew over hours→weeks)
-- that downstream friction-extraction (per-pair overrides, B81/Phase-25) will
-- consume. CAPTURE-NOW / BUILD-LATER: this batch makes the PROBE functional; it
-- does NOT make per-pair friction modeling functional.
--
-- DESIGN LOCKS (Langston Step-1/Step-2 ACK):
--   D5: bucket_start = the PROBE-FIRE time floored to the cadence grid (NOT
--       captured_at). captured_at stays the real snap timestamp (staleness
--       source). UNIQUE(symbol,bucket_start)+ON CONFLICT DO NOTHING → regular
--       one-row-per-symbol-per-bucket grid, correct idempotency, and an honest
--       stale row per bucket during a feed gap.
--   A1: raw bid/ask/qty always stored; mid/spread/depth computed only when
--       valid; degenerate quotes flagged via quote_quality (NULL derived).
--   Index swap (Langston Step-2 catch 1): the UNIQUE constraint already indexes
--       (symbol,bucket_start); the dedicated index is on (bucket_start) ALONE so
--       the B75 plain-table age-delete (WHERE bucket_start < cutoff) is indexed.
--
-- Rollback: 2026-06-16-p19-b5c-qd-probe-history-rollback.sql

BEGIN;

CREATE TABLE IF NOT EXISTS xstock_qd_probe_history (
  id                 bigserial   PRIMARY KEY,
  symbol             text        NOT NULL,
  asset_class        text        NOT NULL DEFAULT 'xstock_spot',  -- forward-proof; xstock_spot-only this batch
  bucket_start       timestamptz NOT NULL,                         -- ★D5: fire-time floored to cadence grid (dedup key)
  captured_at        timestamptz,                                  -- the real snap timestamp (staleness source); NULL if no snap
  recorded_at        timestamptz NOT NULL DEFAULT now(),           -- write time
  bid                numeric(20,8),
  ask                numeric(20,8),
  bid_qty            numeric(28,8),
  ask_qty            numeric(28,8),
  mid                numeric(20,8),                                -- (bid+ask)/2 when price-valid
  spread_abs         numeric(20,8),                                -- ask-bid when price-valid
  spread_bps         numeric(12,4),                                -- (ask-bid)/mid*1e4 when price-valid; NULL on degenerate
  bid_depth_notional numeric(28,8),                                -- bid*bid_qty when depth-valid
  ask_depth_notional numeric(28,8),                                -- ask*ask_qty when depth-valid
  snap_age_ms        bigint,                                       -- (fire time) - captured_at; NULL if no snap
  stale              boolean     NOT NULL DEFAULT false,           -- snap_age_ms > freshness_ceiling_ms
  quote_quality      text        NOT NULL DEFAULT 'ok',            -- ok|crossed|zero_bid|zero_ask|nonpositive_mid|zero_depth|no_snap
  metadata           jsonb       NOT NULL DEFAULT '{"schema_version":1}'::jsonb,
  CONSTRAINT xstock_qd_probe_history_symbol_bucket_uniq UNIQUE (symbol, bucket_start)
);

-- ★Langston Step-2 catch 1: index on bucket_start ALONE (the UNIQUE already
-- indexes (symbol,bucket_start)); serves the B75 age-delete + time-range scans.
CREATE INDEX IF NOT EXISTS xstock_qd_probe_history_bucket_idx
  ON xstock_qd_probe_history (bucket_start);

-- ── module_constants seed ────────────────────────────────────────────────────
-- Retention (read by the B75 plain-table pass) lives under data_lifecycle to
-- match the existing *.hot_retention_days convention. Probe runtime knobs
-- (cadence, freshness ceiling) live under module_name='qd_probe'.
-- A2 (Langston): freshness_ceiling_ms is seeded ≥ 2× cadence — at a 5-min
-- (300s) cadence a snap up to ~5 min old is NORMAL, not stale; 600000ms (10 min,
-- 2× cadence; also aligns with the existing 600s freshness "stale" threshold)
-- keeps the stale flag meaningful instead of flagging every row. Changing
-- cadence is a constant bump (+ a service restart to re-arm the cron grid).
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_at, updated_by)
VALUES
  ('data_lifecycle', '*', '*',           '*', '*', 'xstock_qd_probe_history.hot_retention_days', '90'::jsonb,     NOW(), 'p19-b5c'),
  ('qd_probe',       '*', 'xstock_spot', '*', '*', 'cadence_minutes',                            '5'::jsonb,      NOW(), 'p19-b5c'),
  ('qd_probe',       '*', 'xstock_spot', '*', '*', 'freshness_ceiling_ms',                       '600000'::jsonb, NOW(), 'p19-b5c')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;
