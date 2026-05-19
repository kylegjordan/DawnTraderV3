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
-- ~15M rows. Chunked at 200K rows per pass with WAL-flush pauses + per-
-- chunk COMMIT. Loop continues until no more duplicates exist.
--
-- Rev2 fix: use ROW_NUMBER() window function instead of EXISTS self-join
-- (which hit Supabase 2-min statement_timeout on FIRST iteration during
-- xstock_perp empirical validation 2026-05-19). ROW_NUMBER is single-pass
-- and leverages the existing (symbol, interval_begin) btree index. Plus
-- raise per-session statement_timeout to 20 min for the heavy queries.
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
    -- ROW_NUMBER() partitioned by (symbol, interval_begin) ordered by id
    -- DESC: rn=1 is the keeper (highest id = latest write); rn>1 are
    -- duplicates to delete. LIMIT short-circuits after chunk_size matches.
    DELETE FROM xstock_spot_ohlc_1m_2026_05
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY symbol, interval_begin
                 ORDER BY id DESC
               ) AS rn
        FROM xstock_spot_ohlc_1m_2026_05
      ) ranked
      WHERE rn > 1
      LIMIT chunk_size
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;

    RAISE NOTICE '[B-NEW-35 Phase 1] xstock_spot_2026_05 iteration % deleted % rows (total %)',
      iteration, deleted_count, total_deleted;

    EXIT WHEN deleted_count = 0;

    -- Per Langston Step 2 R1: explicit COMMIT inside the DO block releases
    -- row locks, flushes WAL incrementally, advances xmin horizon, and
    -- allows autovacuum to interleave with the loop. Without COMMIT, the
    -- entire 10-30 min loop runs in one implicit transaction; pg_sleep
    -- yields CPU but does NOT release locks or flush WAL.
    --
    -- PG 11+ supports COMMIT inside DO blocks at top-level (this file is
    -- run via psql -f as a top-level command, so this is valid).
    PERFORM pg_sleep(0.5);
    COMMIT;
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] xstock_spot_2026_05 COMPLETE: % iterations, % total rows deleted',
    iteration, total_deleted;
END $$;

RESET statement_timeout;

VACUUM (VERBOSE) xstock_spot_ohlc_1m_2026_05;
