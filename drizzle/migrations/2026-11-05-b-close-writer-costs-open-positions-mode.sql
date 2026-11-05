-- B-CLOSE-WRITER-COSTS (Kyle KD-17, KD-24, KD-25) increment 2 — open positions carry their mode (scope OBJ-3; pre-audit P-5).
-- Scope:     Claude Comms and Packages/Scope Files/B_CLOSE_WRITER_COSTS_SCOPE.md
-- Pre-audit: Claude Comms and Packages/Scope Files/B_CLOSE_WRITER_COSTS_PRE_AUDIT.md (P-5, amended (e), riders (i)-(iii))
--
-- WHAT: active_open_positions gets `mode` (the existing `trading_mode` enum, as closed_trades and 44 other tables
-- carry it — B-BALANCE-TRUTH's migration 2026-08-21 named this table as one of the three gaps), and its one
-- uniqueness rule moves from (symbol, side) to (symbol, mode): one position per symbol PER MODE (KD-24/25).
--
-- WHY THE DEFAULT, AND WHY IT IS TEMPORARY (pre-audit P-5 (e)): dt-deploy runs db:migrate BEFORE pm2 restart, so for
-- that interval the OLD process still inserts without `mode`. Only the paper engine runs, so 'paper' is right for
-- every insert it can make. The new code names `mode` on every insert from this same deploy. MIGRATION 2, in the
-- NEXT deploy, drops the default. It is a window bridge, not a fallback.
-- THE BACKFILL CONSTANT: live mode has never been enabled, so every existing row is paper by necessity (the same
-- argument as 2026-08-21-b-balance-truth-closed-trades-mode.sql). ADD COLUMN ... DEFAULT fills existing rows.
--
-- REFUSES unless the table's non-primary uniqueness rules are EXACTLY `unique_symbol_side` = UNIQUE (symbol, side)
-- (measured on staging and created by 2026-04-22-initial-schema.sql for CI). A different set means the database is
-- not the one this was written against — stop rather than guess.
-- Rider (i): lock_timeout 5 s, so a wedged migration fails the deploy (dt-deploy then does not restart) instead of
-- stalling opens behind an ACCESS EXCLUSIVE lock.
-- Rollback: 2026-11-05-b-close-writer-costs-open-positions-mode-rollback.sql — CODE FIRST, then this (rider (iii)).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $guard$
DECLARE
  uniq text[];
  def  text;
BEGIN
  SELECT array_agg(ic.relname::text ORDER BY ic.relname) INTO uniq
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
   WHERE i.indrelid = 'public.active_open_positions'::regclass
     AND i.indisunique AND NOT i.indisprimary;
  IF uniq IS DISTINCT FROM ARRAY['unique_symbol_side']::text[] THEN
    RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-5 refused: expected exactly one non-primary unique rule (unique_symbol_side) on active_open_positions, found %', uniq;
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.active_open_positions'::regclass AND c.conname = 'unique_symbol_side';
  IF def IS DISTINCT FROM 'UNIQUE (symbol, side)' THEN
    RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-5 refused: unique_symbol_side is %, expected UNIQUE (symbol, side)', def;
  END IF;
END $guard$;

ALTER TABLE active_open_positions ADD COLUMN mode trading_mode NOT NULL DEFAULT 'paper';
ALTER TABLE active_open_positions DROP CONSTRAINT unique_symbol_side;
ALTER TABLE active_open_positions ADD CONSTRAINT unique_symbol_mode UNIQUE (symbol, mode);

DO $check$
DECLARE
  uniq text[];
  n    integer;
BEGIN
  SELECT array_agg(ic.relname::text ORDER BY ic.relname) INTO uniq
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
   WHERE i.indrelid = 'public.active_open_positions'::regclass
     AND i.indisunique AND NOT i.indisprimary;
  IF uniq IS DISTINCT FROM ARRAY['unique_symbol_mode']::text[] THEN
    RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-5: after the swap the unique set is %, expected exactly unique_symbol_mode', uniq;
  END IF;
  SELECT count(*) INTO n FROM active_open_positions;
  -- A presence figure, not a proof (rider (ii)): how many rows took the backfill. ⚠️ NOT DELIVERED by db-migrate, which has
  -- no notice listener (Langston inc-2 record item) — it shows only when this file is run by hand in psql. The staging
  -- count before the deploy was read separately (20 rows, 2026-11-05).
  RAISE NOTICE 'B-CLOSE-WRITER-COSTS P-5: % open position row(s) now carry mode=paper', n;
END $check$;

COMMIT;
