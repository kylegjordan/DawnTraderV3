-- B-DB-SIZE-RELIEF OBJ-4 — the PRE-CUTOVER REVERSAL of 2026-11-08-b-db-size-relief-daily-cutover.sql. HELD.
--
-- ⛔ THIS FILE LIVES IN drizzle/migrations/held/ ON PURPOSE (pre-audit r4 C-6). scripts/db-migrate.ts enforces a
--   bijection between the forward *.sql files in drizzle/migrations/ (a NON-recursive readdir, :115) and MANIFEST.txt:
--   in the top-level directory without a MANIFEST line it would fail EVERY deploy; with one it would apply itself at
--   the next deploy. held/ is invisible to that readdir. It is tracked with `git add -f` (.gitignore:47 is *.sql).
-- ⛔ TO USE IT: ONE commit that (1) `git mv`s this file to drizzle/migrations/, (2) appends its MANIFEST.txt line, and
--   (3) reverts the six B-DB-SIZE-RELIEF entries in server/services/data-archive/daily-partition-cutover.ts — then ONE
--   dt-deploy. NEVER apply it alone: dailies without the registry entries are silent (archival health and the daily
--   creator stop iterating them, and the 16-day runway expires into "no partition of relation found for row"); the
--   registry entries without the dailies collide with the monthlies this restores.
-- ⛔ VALID ONLY BEFORE THE CUTOVER: it refuses on or after 2026-12-01, and refuses if any daily it would drop holds a row.
--   After the cutover the way back is a forward migration of its own design.
-- ⛔ NON-REPLAYABLE FORWARD: after this runs, the cutover file's _migrations row survives, so re-landing the cutover
--   needs a THIRD dated file.
-- ABORT RECOVERY (pre-audit C-7/C-8): decide from the PARTITION CATALOG, not _migrations — dailies at/after the
--   cutover present and monthlies absent ⇒ this did NOT apply (reset the worktree to the pre-reversal sha so the
--   registry entries match the daily DB, then retry); monthlies present and dailies absent ⇒ it applied (re-run
--   `dt-deploy <same sha>`; this file is idempotent).
-- TEST HOOK: the date check reads the session setting b_db_size_relief.as_of when set (the integration test pins it),
--   else CURRENT_DATE. Nothing in the app sets it.

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  cutover DATE := DATE '2026-12-01';
  months INT := 11;   -- _2026_12 … _2027_10: what the cutover dropped, and the monthly creators' forward window
  parents TEXT[] := ARRAY['signal_eval_provenance', 'pair_scan_archive', 'crypto_spot_ticker_snap',
                          'xstock_perp_ticker_snap', 'macro_feed_archive', 'exit_decision_archive'];
  as_of DATE := COALESCE(NULLIF(current_setting('b_db_size_relief.as_of', true), '')::DATE, CURRENT_DATE);
  p TEXT;
  r RECORD;
  has_row BOOLEAN;
  m DATE;
  mname TEXT;
  n INT;
BEGIN
  IF as_of >= cutover THEN
    RAISE EXCEPTION 'B-DB-SIZE-RELIEF reversal REFUSED: today (%) is on or after the cutover (%) — the dailies hold live rows; the way back is a forward migration of its own design',
      as_of, cutover;
  END IF;

  -- Guard every daily at/after the cutover before anything is dropped.
  FOREACH p IN ARRAY parents LOOP
    FOR r IN
      SELECT child.relname AS child_name, child.oid AS child_oid
        FROM pg_inherits
        JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
        JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
       WHERE parent.relname = p
         AND child.relname ~ ('^' || p || '_[0-9]{4}_[0-9]{2}_[0-9]{2}$')
         AND to_date(substring(child.relname from '_([0-9]{4}_[0-9]{2}_[0-9]{2})$'), 'YYYY_MM_DD') >= cutover
    LOOP
      IF pg_relation_size(r.child_oid) <> 0 THEN
        RAISE EXCEPTION 'B-DB-SIZE-RELIEF reversal REFUSED: daily % holds % heap bytes', r.child_name, pg_relation_size(r.child_oid);
      END IF;
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I LIMIT 1)', r.child_name) INTO has_row;
      IF has_row THEN
        RAISE EXCEPTION 'B-DB-SIZE-RELIEF reversal REFUSED: daily % returned a row to a LIMIT 1 probe', r.child_name;
      END IF;
    END LOOP;
  END LOOP;

  -- Drop the dailies, then restore the monthlies (bare-date bounds, the monthly creators' convention).
  FOREACH p IN ARRAY parents LOOP
    FOR r IN
      SELECT child.relname AS child_name
        FROM pg_inherits
        JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
        JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
       WHERE parent.relname = p
         AND child.relname ~ ('^' || p || '_[0-9]{4}_[0-9]{2}_[0-9]{2}$')
         AND to_date(substring(child.relname from '_([0-9]{4}_[0-9]{2}_[0-9]{2})$'), 'YYYY_MM_DD') >= cutover
    LOOP
      EXECUTE format('ALTER TABLE %I DETACH PARTITION %I', p, r.child_name);
      EXECUTE format('DROP TABLE %I', r.child_name);
    END LOOP;
    FOR i IN 0..(months - 1) LOOP
      m := (cutover + make_interval(months => i))::DATE;
      mname := p || '_' || to_char(m, 'YYYY_MM');
      EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                     mname, p, m::TEXT, (m + make_interval(months => 1))::DATE::TEXT);
    END LOOP;
  END LOOP;

  -- Postcondition: no daily at/after the cutover survives, and the 11 monthlies exist, for every parent.
  FOREACH p IN ARRAY parents LOOP
    SELECT count(*) INTO n
      FROM pg_inherits
      JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
      JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
     WHERE parent.relname = p
       AND child.relname ~ ('^' || p || '_[0-9]{4}_[0-9]{2}_[0-9]{2}$');
    IF n <> 0 THEN
      RAISE EXCEPTION 'B-DB-SIZE-RELIEF reversal postcondition: % still has % daily child(ren)', p, n;
    END IF;
    SELECT count(*) INTO n
      FROM pg_inherits
      JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
      JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
     WHERE parent.relname = p
       AND child.relname IN (SELECT p || '_' || to_char((cutover + make_interval(months => g))::DATE, 'YYYY_MM')
                               FROM generate_series(0, months - 1) g);
    IF n <> months THEN
      RAISE EXCEPTION 'B-DB-SIZE-RELIEF reversal postcondition: % has % of % restored monthlies', p, n, months;
    END IF;
  END LOOP;

  RAISE NOTICE 'B-DB-SIZE-RELIEF reversal: dailies at/after % dropped and % monthlies restored per table', cutover, months;
END $$;

COMMIT;
