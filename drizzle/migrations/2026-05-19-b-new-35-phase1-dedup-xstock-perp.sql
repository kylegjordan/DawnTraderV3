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
-- Step 1: materialize the unique-symbol list ONCE (cheap with the index).
-- Step 2: iterate symbol-by-symbol; per-symbol DELETE + COMMIT.

CREATE TEMP TABLE perp_symbols_2026_05 ON COMMIT PRESERVE ROWS AS
SELECT DISTINCT symbol FROM xstock_perp_ohlc_1m_2026_05;

DO $$
DECLARE
  sym TEXT;
  deleted_count INTEGER;
  total_deleted BIGINT := 0;
  iteration INTEGER := 0;
BEGIN
  FOR sym IN SELECT symbol FROM perp_symbols_2026_05 ORDER BY symbol LOOP
    iteration := iteration + 1;
    DELETE FROM xstock_perp_ohlc_1m_2026_05 a
    USING xstock_perp_ohlc_1m_2026_05 b
    WHERE a.symbol = sym
      AND b.symbol = sym
      AND a.interval_begin = b.interval_begin
      AND a.id < b.id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    RAISE NOTICE '[B-NEW-35 Phase 1] xstock_perp_2026_05 symbol % (#%) deleted % rows (total %)',
      sym, iteration, deleted_count, total_deleted;
    -- Per Langston Step 2 R1: per-symbol COMMIT releases locks + flushes WAL.
    COMMIT;
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] xstock_perp_2026_05 COMPLETE: % symbols processed, % total rows deleted',
    iteration, total_deleted;
END $$;

DROP TABLE perp_symbols_2026_05;

VACUUM (VERBOSE) xstock_perp_ohlc_1m_2026_05;
