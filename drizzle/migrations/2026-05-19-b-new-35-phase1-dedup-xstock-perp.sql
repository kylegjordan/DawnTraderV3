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

-- ─── May 2026 (~3.3M rows, chunked — smallest of the three so this is the
-- empirical-validation candidate per Langston Q2) ──────────────────────
--
-- Initial implementation (rev1) used EXISTS self-join inside the chunked
-- LIMIT subquery; the self-join scanned the entire 3.3M-row partition
-- before LIMIT could short-circuit, exceeding Supabase 2-min
-- statement_timeout on the FIRST iteration (verified empirically on
-- xstock_perp 2026-05-19).
--
-- Rev2 fix: use ROW_NUMBER() window function (single-pass, leverages the
-- existing (symbol, interval_begin) btree index) + raise per-session
-- statement_timeout to 20 min for the heavy materialization queries.
-- ROW_NUMBER stops generating rows after LIMIT is satisfied (PG planner
-- recognizes the LIMIT-pushdown optimization for window functions).
SET statement_timeout = '20min';

DO $$
DECLARE
  deleted_count INTEGER;
  total_deleted BIGINT := 0;
  iteration INTEGER := 0;
  chunk_size INTEGER := 200000;
BEGIN
  LOOP
    iteration := iteration + 1;
    DELETE FROM xstock_perp_ohlc_1m_2026_05
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY symbol, interval_begin
                 ORDER BY id DESC
               ) AS rn
        FROM xstock_perp_ohlc_1m_2026_05
      ) ranked
      WHERE rn > 1
      LIMIT chunk_size
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;

    RAISE NOTICE '[B-NEW-35 Phase 1] xstock_perp_2026_05 iteration % deleted % rows (total %)',
      iteration, deleted_count, total_deleted;

    EXIT WHEN deleted_count = 0;
    -- Per Langston Step 2 R1: explicit COMMIT releases locks + flushes WAL
    -- + advances xmin between chunks. See xstock-spot phase1 file for
    -- detailed rationale.
    PERFORM pg_sleep(0.5);
    COMMIT;
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] xstock_perp_2026_05 COMPLETE: % iterations, % total rows deleted',
    iteration, total_deleted;
END $$;

RESET statement_timeout;

VACUUM (VERBOSE) xstock_perp_ohlc_1m_2026_05;
