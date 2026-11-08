-- B-DB-SIZE-RELIEF OBJ-4 (Kyle KD-60; absorbs #688) — six 30-day tables cut over from MONTHLY to DAILY partitions at
-- 2026-12-01, so the hot window is reclaimed one day at a time instead of one whole month at a time.
-- Pre-audit: Claude Comms and Packages/Scope Files/B_DB_SIZE_RELIEF_PRE_AUDIT.md (P4; r2 C-1/C-2; r3 C-4/C-5;
-- r4 C-6/C-7; Step-2 close C-8). Shape: the Wave-D precedent (2026-07-08-b-storage-harden-wave-d-xstock-ticker-daily-cutover.sql).
--
-- ONE transaction, three passes, for all six parents:
--   1. GUARD every monthly child at/after the cutover: empty by heap (pg_relation_size = 0) AND by a LIMIT 1 probe
--      (an empty partition still carries 16-57 kB of index, so a total-size test would refuse every target).
--   2. DETACH + DROP each of them (the count the catalog lists: 66 for a 2026-12-01 cutover, _2026_12 … _2027_10 x 6).
--   3. Pre-create the dailies cutover … cutover+15 per table, bare-date bounds (the creators' convention).
-- Then a POSTCONDITION: no monthly at/after the cutover survives, and all 16 dailies exist, for every parent.
--
-- IDEMPOTENT (C-8): a second run lists no monthlies at/after the cutover, drops none, creates no daily that exists,
-- and passes the postcondition. So a COMMITTED-but-UNLEDGERED run (killed between db-migrate.ts:192's COMMIT and its
-- :193-195 ledger INSERT) is healed by re-running `dt-deploy <same sha>`: the re-run applies this file again harmlessly
-- and writes the ledger row. No hand step is needed.
--
-- ⛔ DEPLOY ORDER: ships in the SAME dt-deploy as the six DAILY_PARTITION_CUTOVERS entries
--   (server/services/data-archive/daily-partition-cutover.ts). A registry entry live in the worktree WITHOUT this
--   migration collides: from 2026-11-17 the daily creator (cron 0 1 * * *) reaches 12-01 and its CREATE overlaps the
--   surviving monthly _2026_12. A dropped monthly WITHOUT the registry entry collides the other way, on the 28th
--   (monthly creators, cron 0 2 28 and 30 2 28). The abort-recovery branches on the PARTITION CATALOG (pre-audit C-8).
-- ⛔ DEPLOY WINDOW: not between 02:15Z and the sweep's DONE line (the sweep DETACHes the same parents).
-- ⛔ WAY BACK before 2026-12-01: drizzle/migrations/held/2026-11-08-b-db-size-relief-cutover-reversal.sql, a FORWARD
--   migration moved in with its MANIFEST line and the registry revert in ONE commit. After a reversal, re-landing this
--   cutover needs a THIRD dated file (this file's _migrations row survives the reversal).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  cutover DATE := DATE '2026-12-01';
  daily_days INT := 16;
  parents TEXT[] := ARRAY['signal_eval_provenance', 'pair_scan_archive', 'crypto_spot_ticker_snap',
                          'xstock_perp_ticker_snap', 'macro_feed_archive', 'exit_decision_archive'];
  p TEXT;
  r RECORD;
  mstart DATE;
  has_row BOOLEAN;
  listed INT := 0;
  dropped INT := 0;
  d DATE;
  dname TEXT;
  n INT;
BEGIN
  -- ── Pass 1: guard every monthly child at/after the cutover, before anything is dropped ─────────────────────
  FOREACH p IN ARRAY parents LOOP
    IF to_regclass(p) IS NULL THEN
      RAISE EXCEPTION 'B-DB-SIZE-RELIEF cutover ABORT: parent table % does not exist', p;
    END IF;
    FOR r IN
      SELECT child.relname AS child_name, child.oid AS child_oid
        FROM pg_inherits
        JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
        JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
       WHERE parent.relname = p
         AND child.relname ~ ('^' || p || '_[0-9]{4}_[0-9]{2}$')
    LOOP
      mstart := make_date(substring(r.child_name from '_([0-9]{4})_[0-9]{2}$')::INT,
                          substring(r.child_name from '_[0-9]{4}_([0-9]{2})$')::INT, 1);
      CONTINUE WHEN mstart < cutover;
      listed := listed + 1;
      IF pg_relation_size(r.child_oid) <> 0 THEN
        RAISE EXCEPTION 'B-DB-SIZE-RELIEF cutover ABORT: future monthly % holds % heap bytes (expected an empty month)',
          r.child_name, pg_relation_size(r.child_oid);
      END IF;
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I LIMIT 1)', r.child_name) INTO has_row;
      IF has_row THEN
        RAISE EXCEPTION 'B-DB-SIZE-RELIEF cutover ABORT: future monthly % returned a row to a LIMIT 1 probe', r.child_name;
      END IF;
    END LOOP;
  END LOOP;

  -- ── Pass 2: drop them ────────────────────────────────────────────────────────────────────────────────────────
  FOREACH p IN ARRAY parents LOOP
    FOR r IN
      SELECT child.relname AS child_name
        FROM pg_inherits
        JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
        JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
       WHERE parent.relname = p
         AND child.relname ~ ('^' || p || '_[0-9]{4}_[0-9]{2}$')
    LOOP
      mstart := make_date(substring(r.child_name from '_([0-9]{4})_[0-9]{2}$')::INT,
                          substring(r.child_name from '_[0-9]{4}_([0-9]{2})$')::INT, 1);
      CONTINUE WHEN mstart < cutover;
      EXECUTE format('ALTER TABLE %I DETACH PARTITION %I', p, r.child_name);
      EXECUTE format('DROP TABLE %I', r.child_name);
      dropped := dropped + 1;
      RAISE NOTICE 'B-DB-SIZE-RELIEF cutover: dropped empty future monthly %', r.child_name;
    END LOOP;
  END LOOP;
  IF dropped <> listed THEN
    RAISE EXCEPTION 'B-DB-SIZE-RELIEF cutover ABORT: listed % future monthlies but dropped % — nothing is committed; re-read the catalog',
      listed, dropped;
  END IF;

  -- ── Pass 3: pre-create the first 16 dailies per table from the cutover ─────────────────────────────────────
  FOREACH p IN ARRAY parents LOOP
    FOR i IN 0..(daily_days - 1) LOOP
      d := cutover + i;
      dname := p || '_' || to_char(d, 'YYYY_MM_DD');
      EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                     dname, p, d::TEXT, (d + 1)::TEXT);
    END LOOP;
  END LOOP;

  -- ── Postcondition, per parent ────────────────────────────────────────────────────────────────────────────────
  FOREACH p IN ARRAY parents LOOP
    SELECT count(*) INTO n
      FROM pg_inherits
      JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
      JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
     WHERE parent.relname = p
       AND child.relname ~ ('^' || p || '_[0-9]{4}_[0-9]{2}$')
       AND make_date(substring(child.relname from '_([0-9]{4})_[0-9]{2}$')::INT,
                     substring(child.relname from '_[0-9]{4}_([0-9]{2})$')::INT, 1) >= cutover;
    IF n <> 0 THEN
      RAISE EXCEPTION 'B-DB-SIZE-RELIEF cutover postcondition: % still has % monthly child(ren) at/after %', p, n, cutover;
    END IF;
    SELECT count(*) INTO n
      FROM pg_inherits
      JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
      JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
     WHERE parent.relname = p
       AND child.relname IN (SELECT p || '_' || to_char(cutover + g, 'YYYY_MM_DD') FROM generate_series(0, daily_days - 1) g);
    IF n <> daily_days THEN
      RAISE EXCEPTION 'B-DB-SIZE-RELIEF cutover postcondition: % has % of % pre-created dailies', p, n, daily_days;
    END IF;
  END LOOP;

  RAISE NOTICE 'B-DB-SIZE-RELIEF cutover: % future monthlies dropped, % dailies ensured per table, cutover %',
    dropped, daily_days, cutover;
END $$;

COMMIT;
