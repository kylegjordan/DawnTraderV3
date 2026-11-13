-- B-CLOSE-WRITER-COSTS P-14b (Kyle KD-17) — no money, class or mode value is left to a column default.
-- Scope:     Claude Comms and Packages/Scope Files/B_CLOSE_WRITER_COSTS_SCOPE.md
-- Pre-audit: Claude Comms and Packages/Scope Files/B_CLOSE_WRITER_COSTS_PRE_AUDIT.md ("AMENDMENT — P-14b" + "P-14b r2")
--
-- WHAT: drops 16 column defaults —
--   closed_trades:          fees, slippage, entry_fee, exit_fee, total_fee, entry_slippage, exit_slippage, total_cost,
--                           gross_pnl, net_pnl, net_pnl_percent (all 0), asset_class ('crypto_spot').
--   active_open_positions:  entry_fee, entry_slippage (0), asset_class ('crypto_spot'), mode ('paper' — the P-5
--                           one-deploy bridge of 2026-11-05-b-close-writer-costs-open-positions-mode.sql).
-- WHY NOW: P-14's code — every writer names these values — has been live since d01da3d86 (2026-11-07T16:23:40Z), and
-- dt-deploy runs db:migrate BEFORE pm2 restart, so this file could not reach the branch until that code was deployed.
-- EFFECT: an OPEN trade record (closed_at IS NULL) holds NULL instead of an invented 0 in its exit-side money columns;
-- a writer that omits asset_class or mode now fails at the insert instead of being filed as crypto / paper; a position
-- written without entry_fee / entry_slippage cannot close (the close and the restore refuse — intended, KD-17).
--
-- KEPT (every other default on the two tables), checked UNCHANGED below by (table, column) pair — never by name.
-- This includes calibration_state on BOTH tables (TEXT NOT NULL DEFAULT 'pre_calibration_xstock_2026_05', added by
-- 2026-06-14-p19-b4a-c6-paper-sim-calibration-state.sql under the tables' former names). schema.ts does not declare it
-- and, by the writer census, no insert names it — so its DEFAULT is the only thing filling a NOT NULL column: dropping
-- THAT default would fail every insert into both tables. It is kept, and the postcondition proves it unchanged.
--
-- GUARD: each of the 16 targets either has NO default (already dropped — a re-run is a no-op) or has a default that
-- EVALUATES to the expected value; any other value means this is not the database the file was written for — stop.
-- Matching by evaluated value, not by text, because CI's schema-from-migrations and staging spell the same default
-- differently ('0'::numeric vs 0).
-- lock_timeout 5 s: a wedged ALTER fails the deploy (dt-deploy then does not restart) instead of stalling opens.
--
-- ⛔ ROLLBACK ORDER IS THE REVERSE OF THE DEPLOY ORDER (Langston, P-14b C-4). Forward: code first, then this. Backward:
--   asset_class and mode are NOT NULL, so RUN THE ROLLBACK SCRIPT FIRST
--   (2026-11-13-b-close-writer-costs-drop-defaults-rollback.sql, by hand, not in MANIFEST), THEN roll the app back.
--   After this migration the app cannot go back past d01da3d86 until that script has run.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _p14b_before ON COMMIT DROP AS
  SELECT table_name::text AS t, column_name::text AS c, column_default::text AS d
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('closed_trades', 'active_open_positions')
     AND column_default IS NOT NULL;

CREATE TEMP TABLE _p14b_targets (t text, c text, want text) ON COMMIT DROP;
INSERT INTO _p14b_targets VALUES
  ('closed_trades', 'fees', '0'), ('closed_trades', 'slippage', '0'), ('closed_trades', 'entry_fee', '0'),
  ('closed_trades', 'exit_fee', '0'), ('closed_trades', 'total_fee', '0'), ('closed_trades', 'entry_slippage', '0'),
  ('closed_trades', 'exit_slippage', '0'), ('closed_trades', 'total_cost', '0'), ('closed_trades', 'gross_pnl', '0'),
  ('closed_trades', 'net_pnl', '0'), ('closed_trades', 'net_pnl_percent', '0'), ('closed_trades', 'asset_class', 'crypto_spot'),
  ('active_open_positions', 'entry_fee', '0'), ('active_open_positions', 'entry_slippage', '0'),
  ('active_open_positions', 'asset_class', 'crypto_spot'), ('active_open_positions', 'mode', 'paper');

DO $guard$
DECLARE
  r       record;
  got     text;
  present integer := 0;
BEGIN
  IF (SELECT count(*) FROM _p14b_targets) <> 16 THEN
    RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-14b refused: the target list is not 16 pairs';
  END IF;
  FOR r IN SELECT x.t, x.c, x.want, b.d FROM _p14b_targets x LEFT JOIN _p14b_before b ON b.t = x.t AND b.c = x.c LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = r.t AND column_name = r.c) THEN
      RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-14b refused: column %.% does not exist', r.t, r.c;
    END IF;
    IF r.d IS NOT NULL THEN
      EXECUTE format('SELECT (%s)::text', r.d) INTO got;
      IF got IS DISTINCT FROM r.want THEN
        RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-14b refused: %.% default is % (evaluates to %), expected %',
          r.t, r.c, r.d, got, r.want;
      END IF;
      present := present + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'B-CLOSE-WRITER-COSTS P-14b: % of 16 targeted defaults present before the drop (0 = already applied)', present;
END $guard$;

ALTER TABLE closed_trades ALTER COLUMN fees            DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN slippage        DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN entry_fee       DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN exit_fee        DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN total_fee       DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN entry_slippage  DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN exit_slippage   DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN total_cost      DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN gross_pnl       DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN net_pnl         DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN net_pnl_percent DROP DEFAULT;
ALTER TABLE closed_trades ALTER COLUMN asset_class     DROP DEFAULT;
ALTER TABLE active_open_positions ALTER COLUMN entry_fee      DROP DEFAULT;
ALTER TABLE active_open_positions ALTER COLUMN entry_slippage DROP DEFAULT;
ALTER TABLE active_open_positions ALTER COLUMN asset_class    DROP DEFAULT;
ALTER TABLE active_open_positions ALTER COLUMN mode           DROP DEFAULT;

DO $check$
DECLARE
  n_target  integer;
  n_kept    integer;
  n_changed integer;
  n_new     integer;
  n_open    integer;
BEGIN
  SELECT count(*) INTO n_target
    FROM information_schema.columns ic JOIN _p14b_targets x ON x.t = ic.table_name AND x.c = ic.column_name
   WHERE ic.table_schema = 'public' AND ic.column_default IS NOT NULL;
  IF n_target <> 0 THEN
    RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-14b postcondition: % targeted default(s) remain', n_target;
  END IF;
  -- every kept pair is byte-identical to its state before the drop, and no default appeared from nowhere
  SELECT count(*) INTO n_kept FROM _p14b_before b
   WHERE NOT EXISTS (SELECT 1 FROM _p14b_targets x WHERE x.t = b.t AND x.c = b.c);
  SELECT count(*) INTO n_changed FROM _p14b_before b
   WHERE NOT EXISTS (SELECT 1 FROM _p14b_targets x WHERE x.t = b.t AND x.c = b.c)
     AND (SELECT ic.column_default FROM information_schema.columns ic
           WHERE ic.table_schema = 'public' AND ic.table_name = b.t AND ic.column_name = b.c) IS DISTINCT FROM b.d;
  SELECT count(*) INTO n_new FROM information_schema.columns ic
   WHERE ic.table_schema = 'public' AND ic.table_name IN ('closed_trades', 'active_open_positions')
     AND ic.column_default IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM _p14b_before b WHERE b.t = ic.table_name AND b.c = ic.column_name);
  IF n_changed <> 0 OR n_new <> 0 THEN
    RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-14b postcondition: % kept default(s) changed, % appeared', n_changed, n_new;
  END IF;
  SELECT count(*) INTO n_open FROM closed_trades WHERE closed_at IS NULL;
  RAISE NOTICE 'B-CLOSE-WRITER-COSTS P-14b: 16 defaults dropped; % kept unchanged; % open trade record(s) present (a presence figure only)',
    n_kept, n_open;
END $check$;

COMMIT;
