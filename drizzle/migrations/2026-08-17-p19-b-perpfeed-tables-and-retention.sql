-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-08-17 — P19-B-PERPFEED: crypto_perp capture tables (born daily) +
--              the signal_eval_archive retention/daily-cutover fold-in
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Scope: Claude Comms and Packages/Scope Files/P19_B_PERPFEED_SCOPE.md (r10,
-- Langston-approved). Four pieces:
--
--   1. crypto_perp_ohlc_1m + crypto_perp_ticker_snap — column shape of the
--      xstock_perp twins (CURRENT shape: asset_class + exchange per B69),
--      DAILY-RANGE partitioned FROM BIRTH (DAILY_PARTITION_CUTOVERS cutover
--      '2026-08-01'; no monthly era ever). The migration pre-creates deploy-day
--      forward daily children only — NEVER a monthly child (a monthly child
--      would overlap the daily creator's ranges).
--   2. hot_retention_days seeds for both new tables: 30 (HOT residency only —
--      data_lifecycle.default_warm_retention_days = 365 preserves in warm,
--      then cold rotation; "30" is NOT total retention).
--   3. The crypto-perp universe governance constants: the cap is a SANITY
--      BOUND (400, above any plausible universe) — Kyle's mid-Step-4 directive
--      2026-08-17 set the SCOPE to ALL classified crypto perps (~257 on the
--      venue), superseding the earlier N=20 budget instantiation; the honest
--      standing cost (~27 GB/month resident at 10s pacing) is in scope OBJ-1.
--      Per-class throttle seeded 10000ms (Kyle space-first; one UPDATE to change),
--      and the fail-closed capture kill-switch (EXPLICIT false row — deploying
--      this migration must not start the writer; scope §4 gate).
--   4. signal_eval_archive daily cutover (2026-09-01): DROP the ELEVEN empty
--      pre-created future monthlies (2026_09 .. 2027_07 — the count is stated
--      so a partial drop is visible) + pre-create the first SEVEN September
--      daily children (defense if the daily cron stalls at the seam). Existing
--      monthly partitions (May..Aug) are NEVER touched — they age out under
--      the sweep. The retention constant itself (90→75→30) is the OBJ-7a
--      STAGED live-config sequence, executed outside this migration (step 1
--      landed 2026-08-17T08:57:47Z; step 2 lands after May's observed sweep).
--
-- Rollback: 2026-08-17-p19-b-perpfeed-tables-and-retention-rollback.sql
-- (kept OUT of the repo per migration policy).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Step-4 note (Langston): pin the session timezone so the born-daily children's
-- bare-date bounds are UTC-interpreted exactly like the daily creator's
-- (Date.UTC) — otherwise a non-UTC session TZ shifts the seam day.
SET LOCAL TimeZone = 'UTC';

-- ───────────────────────────────────────────────────────────────────────────
-- 1a. crypto_perp_ohlc_1m — parent (daily-partitioned from birth)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crypto_perp_ohlc_1m (
  id              BIGSERIAL,
  symbol          TEXT           NOT NULL,
  asset_class     TEXT           NOT NULL DEFAULT 'crypto_perp',
  exchange        TEXT           NOT NULL DEFAULT 'kraken-futures',
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

CREATE INDEX IF NOT EXISTS crypto_perp_ohlc_1m_sym_time
  ON crypto_perp_ohlc_1m (symbol, interval_begin);

-- ───────────────────────────────────────────────────────────────────────────
-- 1b. crypto_perp_ticker_snap — parent (daily-partitioned from birth)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crypto_perp_ticker_snap (
  id                BIGSERIAL,
  symbol            TEXT           NOT NULL,
  asset_class       TEXT           NOT NULL DEFAULT 'crypto_perp',
  exchange          TEXT           NOT NULL DEFAULT 'kraken-futures',
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

CREATE INDEX IF NOT EXISTS crypto_perp_ticker_snap_sym_time
  ON crypto_perp_ticker_snap (symbol, captured_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 1c. Born-daily children: deploy-day forward, 14 days (the daily creator's
--     lookahead takes over from its next 01:00Z run). Bare-date bounds, same
--     convention as b74-create-daily-partitions.ts. NEVER a monthly child.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  d DATE := CURRENT_DATE;
  i INT;
  day_name TEXT;
BEGIN
  FOR i IN 0..13 LOOP
    day_name := 'crypto_perp_ohlc_1m_' || to_char(d + i, 'YYYY_MM_DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF crypto_perp_ohlc_1m FOR VALUES FROM (%L) TO (%L)',
      day_name, to_char(d + i, 'YYYY-MM-DD'), to_char(d + i + 1, 'YYYY-MM-DD')
    );
    day_name := 'crypto_perp_ticker_snap_' || to_char(d + i, 'YYYY_MM_DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF crypto_perp_ticker_snap FOR VALUES FROM (%L) TO (%L)',
      day_name, to_char(d + i, 'YYYY-MM-DD'), to_char(d + i + 1, 'YYYY-MM-DD')
    );
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Retention constants for the new tables (data_lifecycle) — 30-day HOT.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'crypto_perp_ohlc_1m.hot_retention_days',    '30'::jsonb, 'p19-b-perpfeed-obj2'),
  ('data_lifecycle', '*', '*', '*', '*', 'crypto_perp_ticker_snap.hot_retention_days', '30'::jsonb, 'p19-b-perpfeed-obj2')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Universe governance constants (passive_archive).
--    max_symbols = 400: a SANITY BOUND above any plausible universe — Kyle
--    2026-08-17: scan ALL classified crypto perps. The monthly re-derivation
--    (scope OBJ-1a) now REPORTS budget consumed rather than capping scope.
--    The kill-switch row is EXPLICIT false — fail-closed until the §4 gate
--    discharges; switch-on is a deliberate flip of this row, never a deploy.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('passive_archive', '*', '*',           '*', '*', 'crypto_perp_universe.max_symbols',    '400'::jsonb,   'p19-b-perpfeed-obj1-kyle-all-in'),
  ('passive_archive', '*', 'crypto_perp', '*', '*', 'ticker_snapshot_min_interval_ms',     '10000'::jsonb, 'p19-b-perpfeed-obj8-440-takeover'),
  ('passive_archive', '*', '*',           '*', '*', 'crypto_perp_capture_enabled',         'false'::jsonb, 'p19-b-perpfeed-gate-fail-closed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. signal_eval_archive daily cutover (2026-09-01), per the Wave-D pattern:
--    drop the ELEVEN empty pre-created future monthlies; refuse (abort) if any
--    holds rows — an empty-partition drop must never become a data drop.
--    Then pre-create the first SEVEN September daily children.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  part TEXT;
  cnt BIGINT;
  dropped INT := 0;
  expected TEXT[] := ARRAY[
    'signal_eval_archive_2026_09', 'signal_eval_archive_2026_10',
    'signal_eval_archive_2026_11', 'signal_eval_archive_2026_12',
    'signal_eval_archive_2027_01', 'signal_eval_archive_2027_02',
    'signal_eval_archive_2027_03', 'signal_eval_archive_2027_04',
    'signal_eval_archive_2027_05', 'signal_eval_archive_2027_06',
    'signal_eval_archive_2027_07'
  ];
BEGIN
  FOREACH part IN ARRAY expected LOOP
    IF to_regclass(part) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %I', part) INTO cnt;
      IF cnt > 0 THEN
        RAISE EXCEPTION 'P19-B-PERPFEED cutover: % holds % rows — expected EMPTY future monthly; aborting (never drop data)', part, cnt;
      END IF;
      EXECUTE format('DROP TABLE %I', part);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'P19-B-PERPFEED cutover: dropped % of 11 expected empty future monthlies', dropped;
  IF dropped <> 11 THEN
    RAISE WARNING 'P19-B-PERPFEED cutover: dropped % <> 11 — a partial drop is VISIBLE by design; reconcile against the live partition list before relying on the cutover', dropped;
  END IF;

  FOR i IN 0..6 LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF signal_eval_archive FOR VALUES FROM (%L) TO (%L)',
      'signal_eval_archive_' || to_char(DATE '2026-09-01' + i, 'YYYY_MM_DD'),
      to_char(DATE '2026-09-01' + i, 'YYYY-MM-DD'),
      to_char(DATE '2026-09-01' + i + 1, 'YYYY-MM-DD')
    );
  END LOOP;
END $$;

COMMIT;
