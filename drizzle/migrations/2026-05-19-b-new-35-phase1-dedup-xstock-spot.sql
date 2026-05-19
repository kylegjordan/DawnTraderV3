-- B-NEW-35 Phase 1 — Dedup cleanup for xstock_spot_ohlc_1m
--
-- Removes duplicate rows from the WS-archived OHLC table. The B74 archiver
-- has been writing 18-56× duplicate rows per (symbol, interval_begin) since
-- B74 shipped — every Kraken WS bar-update fires a fresh INSERT instead of
-- upserting one row per minute. This cleanup keeps the highest-id row per
-- (symbol, interval_begin) within each partition (latest write wins, matches
-- the UPSERT semantic in B-NEW-35 Phase 3).
--
-- Per Langston Step 1 ACK Q1: this script runs in PARALLEL with the crypto
-- and xstock_perp cleanup scripts (different tables, zero contention).
--
-- Per Langston Step 1 ACK Q2: chunked DELETE for the May 2026 partition
-- (15M rows). Single-statement DELETE for April 2026 (4,213 rows, instant).
-- Empirical validation step in operator playbook: test single-statement on
-- one partition first, monitor archiver flush latency, decide chunked-vs-
-- single for the rest.
--
-- Per Langston Step 1 ACK Q3: regular VACUUM (NOT FULL) per partition
-- immediately after each DELETE — reclaims space for reuse without exclusive
-- lock that would pause the archiver.
--
-- DEPLOY PATTERN (per RUNNING_ISSUES #119 + Langston Q7):
--   This file is run via direct psql, NOT npm run db:migrate. After
--   completion, a manual INSERT INTO _migrations is performed by the
--   operator with comment "B-NEW-35 bypass — ledger reconciliation pending
--   in B-NEW-36 sub-batch (a)".

BEGIN;

-- ─── April 2026 partition (small, single-statement DELETE) ─────────────
-- 4,213 rows. ~95% expected reduction post-dedup.
-- Self-join keeping highest id per (symbol, interval_begin).
DELETE FROM xstock_spot_ohlc_1m_2026_04 a
USING xstock_spot_ohlc_1m_2026_04 b
WHERE a.symbol = b.symbol
  AND a.interval_begin = b.interval_begin
  AND a.id < b.id;

COMMIT;

-- VACUUM cannot run inside a transaction.
VACUUM (VERBOSE) xstock_spot_ohlc_1m_2026_04;

-- ─── May 2026 partition (large, chunked DELETE) ────────────────────────
-- ~15M rows. Chunked at 200K rows per pass with WAL-flush pauses. Loop
-- continues until no more duplicates exist.
DO $$
DECLARE
  deleted_count INTEGER;
  total_deleted BIGINT := 0;
  iteration INTEGER := 0;
  chunk_size INTEGER := 200000;
BEGIN
  LOOP
    iteration := iteration + 1;
    -- Find duplicate IDs to delete, capped at chunk_size.
    WITH duplicates AS (
      SELECT a.id
      FROM xstock_spot_ohlc_1m_2026_05 a
      WHERE EXISTS (
        SELECT 1 FROM xstock_spot_ohlc_1m_2026_05 b
        WHERE a.symbol = b.symbol
          AND a.interval_begin = b.interval_begin
          AND a.id < b.id
      )
      LIMIT chunk_size
    )
    DELETE FROM xstock_spot_ohlc_1m_2026_05
    WHERE id IN (SELECT id FROM duplicates);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;

    RAISE NOTICE '[B-NEW-35 Phase 1] xstock_spot_2026_05 iteration % deleted % rows (total %)',
      iteration, deleted_count, total_deleted;

    EXIT WHEN deleted_count = 0;

    -- Brief WAL-flush pause between chunks. PostgreSQL pg_sleep yields the
    -- transaction so checkpointer + writer processes can drain.
    PERFORM pg_sleep(0.5);
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] xstock_spot_2026_05 COMPLETE: % iterations, % total rows deleted',
    iteration, total_deleted;
END $$;

VACUUM (VERBOSE) xstock_spot_ohlc_1m_2026_05;
