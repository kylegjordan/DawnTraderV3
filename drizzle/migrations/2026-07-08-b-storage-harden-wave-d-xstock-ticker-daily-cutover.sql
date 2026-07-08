-- ═════════════════════════════════════════════════════════════════════════════
-- B-STORAGE-HARDEN Wave D (OBJ-3) — xstock_spot_ticker_snap monthly→daily cutover
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Transitions xstock_spot_ticker_snap from MONTHLY to DAILY RANGE partitions at a
-- MONTH boundary (cutover = 2026-08-01, the first clean month-start after the
-- Wave-D deploy on 2026-07-08) so the hot window is reclaimable one DAY at a time
-- (true rolling ~30 d) instead of whole months. TRANSITION-FORWARD: the ~63 GB
-- live table is NEVER repartitioned — July-2026 and earlier stay MONTHLY and age
-- out under the existing sweep; from the cutover, NEW partitions are DAILY.
--
-- Two steps, one transaction:
--   1. Drop any EMPTY pre-created future MONTHLY partitions at/after the cutover.
--      The monthly creator's 12-month look-ahead may already have made
--      xstock_spot_ticker_snap_2026_08 (…_09, …) — those would OVERLAP the daily
--      children and break inserts (Langston Wave-D req #2, the real seam risk).
--      They are FUTURE months = empty; ABORT LOUDLY if any holds rows.
--   2. Create the first 16 DAILY partitions (2026-08-01 … 2026-08-16) so day-1 is
--      covered even before the daily creator cron (0 1 * * *) first catches up.
--
-- Bounds use the SAME bare-date convention as the monthly creator so the
-- July-monthly [.., 2026-08-01) ↔ August-daily [2026-08-01, ..) seam abuts with
-- ZERO overlap regardless of DB session timezone.
--
-- ★ DEPLOY ORDER: apply this migration in the same deploy as the code that adds
--   the monthly-creator exclusion + the daily creator. After deploy, the monthly
--   cron no longer re-creates xstock_spot_ticker_snap monthlies at/after cutover,
--   so step 1's drops are not re-introduced.
--
-- Reference: B_STORAGE_HARDEN_WAVE_D_SCOPE.md + _PRE_AUDIT.md (OBJ-3). #430.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  cutover DATE := DATE '2026-08-01';
  r       RECORD;
  yr      INT;
  mo      INT;
  mstart  DATE;
  n       BIGINT;
  d       DATE;
  dname   TEXT;
BEGIN
  -- ── Step 1: drop empty future MONTHLY partitions at/after the cutover ────────
  FOR r IN
    SELECT child.relname AS child_name
      FROM pg_inherits
      JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
      JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
     WHERE parent.relname = 'xstock_spot_ticker_snap'
       AND child.relname ~ '_[0-9]{4}_[0-9]{2}$'        -- MONTHLY shape …_YYYY_MM
       AND child.relname !~ '_[0-9]{4}_[0-9]{2}_[0-9]{2}$'  -- exclude DAILY (defensive)
  LOOP
    yr := (substring(r.child_name from '_([0-9]{4})_[0-9]{2}$'))::INT;
    mo := (substring(r.child_name from '_[0-9]{4}_([0-9]{2})$'))::INT;
    mstart := make_date(yr, mo, 1);
    IF mstart >= cutover THEN
      EXECUTE format('SELECT count(*) FROM %I', r.child_name) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION
          'Wave-D cutover ABORT: monthly partition % holds % row(s) (expected an empty future month) — manual review required before cutover',
          r.child_name, n;
      END IF;
      EXECUTE format('ALTER TABLE xstock_spot_ticker_snap DETACH PARTITION %I', r.child_name);
      EXECUTE format('DROP TABLE %I', r.child_name);
      RAISE NOTICE 'Wave-D cutover: dropped empty future monthly partition %', r.child_name;
    END IF;
  END LOOP;

  -- ── Step 2: create the first 16 DAILY partitions from the cutover ────────────
  FOR i IN 0..15 LOOP
    d := cutover + i;
    dname := 'xstock_spot_ticker_snap_' || to_char(d, 'YYYY_MM_DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF xstock_spot_ticker_snap FOR VALUES FROM (%L) TO (%L)',
      dname, d::TEXT, (d + 1)::TEXT
    );
    RAISE NOTICE 'Wave-D cutover: ensured daily partition % [%, %)', dname, d, (d + 1);
  END LOOP;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- Post-migration verification (deploy step):
--   -- No monthly partition at/after cutover remains:
--   SELECT child.relname FROM pg_inherits
--     JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
--     JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
--    WHERE parent.relname='xstock_spot_ticker_snap'
--      AND child.relname ~ '_2026_(0[8-9]|1[0-2])$';   -- expect 0 rows
--   -- 16 daily partitions exist:
--   SELECT count(*) FROM pg_inherits
--     JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
--     JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
--    WHERE parent.relname='xstock_spot_ticker_snap'
--      AND child.relname ~ '_2026_08_[0-9]{2}$';        -- expect 16
-- ═════════════════════════════════════════════════════════════════════════════
