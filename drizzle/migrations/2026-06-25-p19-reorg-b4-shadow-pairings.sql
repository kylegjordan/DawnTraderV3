-- P19 reorg-B4 (#shadow-trade telemetry layer, 2026-06-25)
-- The SELECTION-QUALITY SINK: one row per RTB-pool member per promotion cycle
-- (promoted pick + every non-promoted alternative), decision-time ranking inputs
-- snapshotted at promotion + realized shadow outcome filled at close.
-- ★ ISOLATION: NO learning consumer (ranker / outcomeFeedbackStore / telemetry /
-- ML / expectancy / regime stats) EVER reads this table — pure B5/B6 analysis sink.
-- Idempotent (CREATE TABLE IF NOT EXISTS). Mirrors shared/schema.ts rtbShadowPairings.

CREATE TABLE IF NOT EXISTS rtb_shadow_pairings (
  id               varchar PRIMARY KEY,
  cycle_key        varchar(80) NOT NULL,
  mode             varchar(16) NOT NULL,
  asset_class      varchar(32) NOT NULL,
  regime           varchar(50),
  promotion_rank   integer,
  promoted         boolean NOT NULL DEFAULT false,
  promoted_trade_id varchar,
  signal_id        varchar,
  symbol           varchar(20) NOT NULL,
  strategy         varchar(50) NOT NULL,
  entry_price      decimal(20, 8),
  stop_price       decimal(20, 8),
  target_price     decimal(20, 8),
  final_score      decimal(10, 6),
  hybrid_score     decimal(10, 6),
  confidence       decimal(10, 6),
  regime_weight    decimal(10, 6),
  decay_penalty    decimal(10, 6),
  ranking_score    decimal(10, 6),
  source_pool      varchar(32),
  di_at_queue      decimal(8, 4),
  dbs_score_at_queue decimal(8, 4),
  sqe_verdict      varchar(32),
  sqe_reject_reason varchar(64),
  gross_pnl        decimal(20, 8),
  net_pnl          decimal(20, 8),
  r_multiple       decimal(10, 4),
  close_reason     varchar(40),
  exit_price       decimal(20, 8),
  holding_ms       integer,
  closed           boolean NOT NULL DEFAULT false,
  opened_at        timestamptz DEFAULT now(),
  closed_at        timestamptz,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rtb_shadow_pairings_cycle_key_idx ON rtb_shadow_pairings (cycle_key);
CREATE INDEX IF NOT EXISTS rtb_shadow_pairings_mode_asset_class_idx ON rtb_shadow_pairings (mode, asset_class);
CREATE INDEX IF NOT EXISTS rtb_shadow_pairings_closed_idx ON rtb_shadow_pairings (closed);

-- Verification: confirm the table + the 3 indexes exist.
DO $$
DECLARE
  tbl_ok boolean;
  idx_n  integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rtb_shadow_pairings') INTO tbl_ok;
  SELECT count(*) FROM pg_indexes WHERE tablename = 'rtb_shadow_pairings' INTO idx_n;
  IF NOT tbl_ok THEN RAISE EXCEPTION 'reorg-B4: rtb_shadow_pairings table missing after migration'; END IF;
  RAISE NOTICE 'reorg-B4: rtb_shadow_pairings present, % indexes', idx_n;
END $$;
