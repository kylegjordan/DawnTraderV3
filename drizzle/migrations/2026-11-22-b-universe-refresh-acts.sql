-- B-UNIVERSE-REFRESH-ACTS (#1018, KD-26; pre-audit Part C P8 + P9, Langston Step-2 PROCEED on r3)
--
-- 1. crypto_universe_refresh_runs: one row per daily crypto spot universe refresh run. It is the whole record of
--    what the refresh computed, what it applied to the running recorder and why it refused; the refresh
--    (server/services/crypto-universe-refresh.ts) is its only writer. Drizzle: cryptoUniverseRefreshRuns.
-- 2. Three knobs, read with no fallback (a missing row throws):
--      crypto_spot.universe_refresh_max_drop_share          0.30  arm (b): the largest share of the running set one
--                                                                  run may drop without a confirming second run
--      crypto_spot.universe_refresh_confirm_max_diff_share  0.50  how far a confirming run's computed list may differ
--                                                                  from the baseline's (|C_new delta C_stored| / |C_stored|)
--      passive_archive.b74_crypto_ws_shard_size             300   symbols per recorder connection (read by
--                                                                  crypto-spot-archiver.ts since P3)
--    ON CONFLICT DO NOTHING: an existing row is never overwritten. The count assertion then proves each exists.
--
-- Rollback: 2026-11-22-b-universe-refresh-acts-rollback.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS crypto_universe_refresh_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id           uuid NOT NULL,
  trigger_source          text NOT NULL,
  started_at              timestamptz(6) NOT NULL,
  finished_at             timestamptz(6) NOT NULL,
  outcome                 text NOT NULL,
  refusal_reason          text,
  confirmable             boolean NOT NULL,
  confirm_diff_share      double precision,
  confirm_max_diff_share  double precision NOT NULL,
  bounded_step            double precision,
  count_before            integer NOT NULL,
  count_after             integer NOT NULL,
  computed_count          integer NOT NULL,
  computed_symbols        jsonb NOT NULL,
  added                   jsonb NOT NULL,
  dropped                 jsonb NOT NULL,
  pinned                  jsonb NOT NULL,
  rejected_adds           jsonb NOT NULL,
  unconfirmed_adds        jsonb NOT NULL,
  batches                 jsonb NOT NULL,
  volumes                 jsonb NOT NULL,
  floor_usd               double precision,
  drop_share              double precision,
  max_drop_share          double precision NOT NULL,
  running_set_age_hours   double precision NOT NULL,
  consecutive_refusals    integer NOT NULL,
  CONSTRAINT crypto_universe_refresh_runs_outcome_chk
    CHECK (outcome IN ('noop', 'applied', 'applied_confirmed', 'refused')),
  CONSTRAINT crypto_universe_refresh_runs_reason_chk
    CHECK ((outcome = 'refused') = (refusal_reason IS NOT NULL)
           AND (refusal_reason IS NULL OR refusal_reason IN ('incomplete_fetch', 'degenerate', 'drop_share'))),
  CONSTRAINT crypto_universe_refresh_runs_trigger_chk
    CHECK (trigger_source IN ('cron', 'missed_catchup'))
);

CREATE INDEX IF NOT EXISTS crypto_universe_refresh_runs_started_at_idx
  ON crypto_universe_refresh_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS crypto_universe_refresh_runs_occurrence_idx
  ON crypto_universe_refresh_runs (occurrence_id);

INSERT INTO module_constants (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('crypto_spot',     'universe_refresh_max_drop_share',         '0.30'::jsonb, '*', '*', '*', '*', NOW(), 'b-universe-refresh-acts'),
  ('crypto_spot',     'universe_refresh_confirm_max_diff_share', '0.50'::jsonb, '*', '*', '*', '*', NOW(), 'b-universe-refresh-acts'),
  ('passive_archive', 'b74_crypto_ws_shard_size',                '300'::jsonb,  '*', '*', '*', '*', NOW(), 'b-universe-refresh-acts')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE asset_class = '*' AND exchange = '*' AND regime = '*' AND strategy = '*'
     AND ((module_name = 'crypto_spot' AND constant_name IN ('universe_refresh_max_drop_share', 'universe_refresh_confirm_max_diff_share'))
       OR (module_name = 'passive_archive' AND constant_name = 'b74_crypto_ws_shard_size'));
  IF n <> 3 THEN
    RAISE EXCEPTION 'B-UNIVERSE-REFRESH-ACTS seed assertion failed: expected 3 global knob rows, found %', n;
  END IF;
END $$;

COMMIT;
