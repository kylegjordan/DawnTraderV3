-- ═════════════════════════════════════════════════════════════════════════════
-- B-NEW-53 — Decision-provenance capture (RUNNING_ISSUES #206, roadmap 19-20)
-- ═════════════════════════════════════════════════════════════════════════════
-- Forward-only capture of each signal-eval decision's EXACT replay inputs, so
-- every future calibration study (entry-trigger sweep, geometry reconstruction,
-- RI-a stop-anchor) becomes exact-replayable instead of backward-reconstructed
-- (which caps at ~80% parity — W2.0a Mode-A / RI-a / W2.0b all hit this wall).
--
-- LEAN DESIGN: settled 15m bars are ALREADY persisted in
-- xstock_spot_ohlc_15m_snapshot → referenced, not duplicated. Net-new per
-- decision = the in-progress FORMING bar (by value) + a constants HASH (the
-- resolved set is static — see B_NEW_53_PRE_AUDIT.md §2.4) + a settled bar-set
-- reference + the resolved stop/target LEVELS (the RI-a self-verifying checksum).
--
-- Additive, telemetry-only, active trading OFF. Best-effort: a provenance write
-- failure must never block the decision or the base signal_eval_archive row.
--
-- Langston Step-2 gate conditions baked in:
--   C1  base + provenance are INDEPENDENT drop-oldest buffers → can desync →
--       provenance-coverage% is reported SEPARATELY from parity% (consumer side).
--   C2  link id is drawn from signal_eval_archive_id_seq (no separate namespace),
--       amortized app-side (block allocation) + sequence CACHE bump below.
--   C3  xStock-only at launch (crypto OFF), 90-day retention (co-aligns with the
--       archive's own b70_postgres_retention_days=90 → no retention divergence).
-- ═════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. signal_eval_provenance — 1:1 sibling of signal_eval_archive (by archive_id)
-- ───────────────────────────────────────────────────────────────────────────
-- PK (captured_at, archive_id): captured_at is the partition key (required in
-- any unique constraint on a partitioned table); archive_id is the base row's
-- bigint id. UNIQUE by construction → at-most-one provenance row per base row
-- (C1: coverage may be <100% under burst; it is never >1).
-- NOTE: no enforced cross-table FK — a literal FK to signal_eval_archive.id
-- alone is impossible (the parent is partitioned; its only unique constraint is
-- the 4-col composite). 1:1 is enforced here by the PK + app-level coupling.
CREATE TABLE IF NOT EXISTS signal_eval_provenance (
  captured_at          TIMESTAMPTZ    NOT NULL,
  archive_id           BIGINT         NOT NULL,
  -- self-describing (avoids an 8M×8M join back to the base row for study queries)
  symbol               TEXT           NOT NULL,
  strategy             TEXT           NOT NULL,
  asset_class          TEXT           NOT NULL,
  -- the in-progress FORMING bar the engine evaluated, captured BY VALUE at the
  -- detect site (the irreducible ~20% gap that backward replay cannot recover)
  forming_open         NUMERIC(20, 10),
  forming_high         NUMERIC(20, 10),
  forming_low          NUMERIC(20, 10),
  forming_close        NUMERIC(20, 10),
  forming_volume       NUMERIC(24, 8),
  forming_bar_ts       BIGINT,                              -- forming bucket epoch (ms)
  -- settled bar-set REFERENCE (the bars are already in *_ohlc_15m_snapshot)
  settled_bucket_ts    TIMESTAMPTZ,                         -- as-of newest settled bucket
  settled_bar_count    SMALLINT,                            -- how many settled bars the engine saw
  bar_interval_sec     INTEGER,                             -- 900 for 15m; for replay + settle math
  -- resolved module_constants the gate used → hash references module_constants_version
  constants_hash       TEXT,
  -- RI-a unification: the resolved stop/target LEVELS = self-verifying checksum
  resolved_stop_price   NUMERIC(20, 10),
  resolved_target_price NUMERIC(20, 10),
  PRIMARY KEY (captured_at, archive_id)
) PARTITION BY RANGE (captured_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. module_constants_version — hash → resolved-set snapshot (upsert-on-novel)
-- ───────────────────────────────────────────────────────────────────────────
-- Tiny: the resolved strategy constant set is static (B_NEW_53_PRE_AUDIT §2.4 —
-- only ~6 distinct change-timestamps across 241 strategy rows / month). A row is
-- written only when a NOVEL hash first appears. If this table ever grows ~1:1
-- with decisions, that loudly surfaces a non-static assumption violation.
CREATE TABLE IF NOT EXISTS module_constants_version (
  constants_hash       TEXT           PRIMARY KEY,
  module_name          TEXT           NOT NULL,             -- e.g. 'strategy.vwap_pullback'
  asset_class          TEXT           NOT NULL,
  strategy             TEXT           NOT NULL,
  resolved_set         JSONB          NOT NULL,             -- the full {constantName: value} map
  first_seen_at        TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_constants_version_strat
  ON module_constants_version (strategy, asset_class);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Pre-create monthly partitions for signal_eval_provenance (2026-06 → 2027-06)
-- ───────────────────────────────────────────────────────────────────────────
-- The b70-create-monthly-partitions self-heal extends this forward 12 months;
-- this seeds the initial range so writes land from day one.
DO $$
DECLARE
  month_start DATE;
  month_end DATE;
  partition_name TEXT;
  i INTEGER;
BEGIN
  FOR i IN 0..12 LOOP
    month_start := DATE '2026-06-01' + (i || ' months')::INTERVAL;
    month_end   := month_start + INTERVAL '1 month';
    partition_name := 'signal_eval_provenance_' || TO_CHAR(month_start, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      partition_name, 'signal_eval_provenance', month_start, month_end
    );
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Amortize the link-id source (C2) — bump the existing sequence's CACHE
-- ───────────────────────────────────────────────────────────────────────────
-- App-side block allocation is the primary amortization; this CACHE bump is
-- belt-and-suspenders so the DB-default (crypto / block-empty) inserts also
-- amortize sequence access. Gaps are fine for a telemetry id.
ALTER SEQUENCE signal_eval_archive_id_seq CACHE 50;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Per-asset-class capture flag (C3 + §5 per-asset-class-config corollary)
-- ───────────────────────────────────────────────────────────────────────────
-- Fail-closed: global default false; xStock ON at launch; crypto OFF (enable
-- after a week of observed prod cost). Resolved most-specific-wins by asset_class.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_archive', '*', '*',           '*', '*', 'b_new_53_provenance_capture_enabled', 'false'::jsonb, 'b-new-53'),
  ('data_archive', '*', 'xstock_spot', '*', '*', 'b_new_53_provenance_capture_enabled', 'true'::jsonb,  'b-new-53'),
  ('data_archive', '*', 'crypto_spot', '*', '*', 'b_new_53_provenance_capture_enabled', 'false'::jsonb, 'b-new-53')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;
