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
DO $$
DECLARE
  deleted_count INTEGER;
  total_deleted BIGINT := 0;
  iteration INTEGER := 0;
  chunk_size INTEGER := 200000;
BEGIN
  LOOP
    iteration := iteration + 1;
    WITH duplicates AS (
      SELECT a.id
      FROM xstock_perp_ohlc_1m_2026_05 a
      WHERE EXISTS (
        SELECT 1 FROM xstock_perp_ohlc_1m_2026_05 b
        WHERE a.symbol = b.symbol
          AND a.interval_begin = b.interval_begin
          AND a.id < b.id
      )
      LIMIT chunk_size
    )
    DELETE FROM xstock_perp_ohlc_1m_2026_05
    WHERE id IN (SELECT id FROM duplicates);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;

    RAISE NOTICE '[B-NEW-35 Phase 1] xstock_perp_2026_05 iteration % deleted % rows (total %)',
      iteration, deleted_count, total_deleted;

    EXIT WHEN deleted_count = 0;
    PERFORM pg_sleep(0.5);
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] xstock_perp_2026_05 COMPLETE: % iterations, % total rows deleted',
    iteration, total_deleted;
END $$;

VACUUM (VERBOSE) xstock_perp_ohlc_1m_2026_05;
