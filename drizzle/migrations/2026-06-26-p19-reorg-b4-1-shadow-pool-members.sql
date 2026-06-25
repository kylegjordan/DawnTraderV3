-- P19 reorg-B4.1 (#shadow per-cycle pool membership, 2026-06-26)
-- The EVENT-grain companion to rtb_shadow_pairings (the trade-entity grain): one
-- row per (promotion cycle × pool member), capturing that signal's rank +
-- promoted-flag AT THAT CYCLE + the decision-time score snapshot + an FK to the
-- resolving shadow trade (where the outcome lives once, in rtb_shadow_pairings).
-- Makes the "did the ranker pick the best at cycle N?" view reconstructable.
-- ★ ISOLATION: NO learning consumer reads it — pure B5/B6 analysis sink.
-- ★ pool_size is the SSOT for "N candidates this cycle" (a tolerated member-write
--   skip can leave fewer rows than the pool had → never COUNT(*) the members).
-- Idempotent (CREATE TABLE IF NOT EXISTS). Mirrors shared/schema.ts rtbShadowPoolMembers.

CREATE TABLE IF NOT EXISTS rtb_shadow_pool_members (
  id               varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_key        varchar(80) NOT NULL,
  mode             varchar(16) NOT NULL,
  asset_class      varchar(32) NOT NULL,
  signal_id        varchar,
  shadow_trade_id  varchar NOT NULL,
  symbol           varchar(20) NOT NULL,
  strategy         varchar(50) NOT NULL,
  promotion_rank   integer NOT NULL,
  promoted         boolean NOT NULL DEFAULT false,
  pool_size        integer NOT NULL,
  final_score      decimal(10, 6),
  hybrid_score     decimal(10, 6),
  confidence       decimal(10, 6),
  regime_weight    decimal(10, 6),
  decay_penalty    decimal(10, 6),
  ranking_score    decimal(10, 6),
  di_at_queue      decimal(8, 4),
  dbs_score_at_queue decimal(8, 4),
  sqe_verdict      varchar(32),
  regime           varchar(50),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rtb_shadow_pool_members_mode_asset_cycle_idx ON rtb_shadow_pool_members (mode, asset_class, cycle_key);
CREATE INDEX IF NOT EXISTS rtb_shadow_pool_members_shadow_trade_idx ON rtb_shadow_pool_members (shadow_trade_id);
CREATE INDEX IF NOT EXISTS rtb_shadow_pool_members_cycle_key_idx ON rtb_shadow_pool_members (cycle_key);

-- Verification: confirm the table + the 3 indexes exist.
DO $$
DECLARE
  tbl_ok boolean;
  idx_n  integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rtb_shadow_pool_members') INTO tbl_ok;
  SELECT count(*) FROM pg_indexes WHERE tablename = 'rtb_shadow_pool_members' INTO idx_n;
  IF NOT tbl_ok THEN RAISE EXCEPTION 'reorg-B4.1: rtb_shadow_pool_members table missing after migration'; END IF;
  RAISE NOTICE 'reorg-B4.1: rtb_shadow_pool_members present, % indexes', idx_n;
END $$;
