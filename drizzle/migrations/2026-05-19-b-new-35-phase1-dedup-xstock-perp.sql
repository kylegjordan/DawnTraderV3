-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.5 (2026-05-23): skip-marker added. Contains
-- VACUUM and DO $$ ... COMMIT patterns that require top-level psql -f
-- execution (incompatible with db-migrate.ts's simple-query batch).
-- Already applied on staging via external psql -f; no-op on fresh empty
-- PG (no rows to dedup). db-migrate ledger-records this file as applied
-- without running the SQL. See scripts/db-migrate.ts SKIP_MARKER comment.
-- B-NEW-35 Phase 1 — Dedup cleanup for xstock_perp_ohlc_1m
--
-- Same shape as the xstock_spot equivalent. See header of
-- 2026-05-19-b-new-35-phase1-dedup-xstock-spot.sql for full context.
-- xstock_perp is dormant today; dedup is for cleanup-of-record + IO budget
-- recovery + readiness for when xstock_perp scanner wires up (future).

BEGIN;

-- ─── April 2026 (81,510 rows, single-statement) ────────────────────────
DELETE FROM xstock_perp_ohlc_1m_2026_04 a
USING xstock_perp_ohlc_1m_2026_04 b
WHERE a.symbol = b.symbol
  AND a.interval_begin = b.interval_begin
  AND a.id < b.id;

COMMIT;

VACUUM (VERBOSE) xstock_perp_ohlc_1m_2026_04;

-- ─── May 2026 (~3.3M rows, per-symbol iteration) ──────────────────────
--
-- Rev1 (EXISTS self-join chunked) hit Supabase 2-min statement_timeout on
-- first iteration — full-partition scan was the bottleneck.
-- Rev2 (ROW_NUMBER window-function chunked + SET statement_timeout=20min)
-- ALSO hit 2-min cap — Supabase role-level statement_timeout overrides
-- session SET (verified empirically 2026-05-19 on xstock_perp).
--
-- Rev3 fix: PER-SYMBOL iteration via index seek. The (symbol, interval_begin)
-- btree index lets PG seek directly to one symbol's rows. Per-symbol data
-- is ~22K rows (3.3M / ~150 symbols), self-join within that is fast (~1-2s).
-- 150 symbols × 2s = ~5 min total wallclock. Each per-symbol DELETE has its
-- own COMMIT — per-chunk-COMMIT semantic preserved per Langston R1.
--
-- Step 1: materialize the unique-symbol list ONCE.
-- Step 2: iterate symbol-by-symbol; per-symbol DELETE + COMMIT.
--
-- Rev4 fix: SELECT DISTINCT symbol over 3.3M rows hit 2-min statement_timeout
-- (PG planner picked sequential scan instead of index-only scan on the
-- (symbol, interval_begin) btree, possibly due to stale stats). Replace
-- with a recursive CTE that walks the btree index — each iteration is a
-- single index seek (~1ms), so 150-265 symbols complete in <1 second total.
-- This is the standard "loose index scan" / "skip scan" workaround for
-- PostgreSQL's DISTINCT planner gap.

CREATE TEMP TABLE perp_symbols_2026_05 ON COMMIT PRESERVE ROWS AS
WITH RECURSIVE symbol_walk AS (
  (SELECT symbol FROM xstock_perp_ohlc_1m_2026_05 ORDER BY symbol LIMIT 1)
  UNION ALL
  (
    SELECT (
      SELECT symbol FROM xstock_perp_ohlc_1m_2026_05
      WHERE symbol > s.symbol
      ORDER BY symbol LIMIT 1
    ) AS symbol
    FROM symbol_walk s
    WHERE s.symbol IS NOT NULL
  )
)
SELECT symbol FROM symbol_walk WHERE symbol IS NOT NULL;

DO $$
DECLARE
  sym TEXT;
  deleted_count INTEGER;
  total_deleted BIGINT := 0;
  iteration INTEGER := 0;
BEGIN
  FOR sym IN SELECT symbol FROM perp_symbols_2026_05 ORDER BY symbol LOOP
    iteration := iteration + 1;
    -- Rev5 fix: per-symbol self-join DELETE was still O(N²) within one
    -- symbol's ~330K rows (xstock_perp has only 10 symbols → 3.3M / 10 each)
    -- and hit 2-min timeout. Use ROW_NUMBER single-pass instead.
    -- WHERE symbol = sym uses index seek into the symbol's range.
    -- PARTITION BY interval_begin (no need for symbol in PARTITION since
    -- already filtered) + ORDER BY id DESC → rn>1 are duplicates.
    DELETE FROM xstock_perp_ohlc_1m_2026_05
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY interval_begin
                 ORDER BY id DESC
               ) AS rn
        FROM xstock_perp_ohlc_1m_2026_05
        WHERE symbol = sym
      ) ranked
      WHERE rn > 1
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    RAISE NOTICE '[B-NEW-35 Phase 1] xstock_perp_2026_05 symbol % (#%) deleted % rows (total %)',
      sym, iteration, deleted_count, total_deleted;
    -- Per Langston Step 2 R1: per-symbol COMMIT releases locks + flushes WAL.
    COMMIT;
    -- Brief inter-symbol pause to give Supabase IO budget room.
    PERFORM pg_sleep(0.2);
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] xstock_perp_2026_05 COMPLETE: % symbols processed, % total rows deleted',
    iteration, total_deleted;
END $$;

DROP TABLE perp_symbols_2026_05;

VACUUM (VERBOSE) xstock_perp_ohlc_1m_2026_05;
