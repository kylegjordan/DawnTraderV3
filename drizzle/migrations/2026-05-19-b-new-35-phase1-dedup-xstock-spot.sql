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

-- ─── May 2026 partition (15M rows, per-symbol iteration) ──────────────
--
-- Rev3 approach: per-symbol iteration via index seek (empirically validated
-- on xstock_perp). The (symbol, interval_begin) btree lets PG seek per-
-- symbol; self-join within ~57K rows-per-symbol (15M/265) is fast.
-- 265 symbols × ~3-5s/symbol = ~15-20 min total wallclock. Per-symbol
-- COMMIT per Langston R1.

-- Rev4: recursive CTE skip-scan to enumerate unique symbols. SELECT DISTINCT
-- hit 2-min timeout on the 3.3M-row xstock_perp partition; same pattern would
-- fail worse on this 15M-row partition. See xstock-perp file for rationale.
CREATE TEMP TABLE spot_symbols_2026_05 ON COMMIT PRESERVE ROWS AS
WITH RECURSIVE symbol_walk AS (
  (SELECT symbol FROM xstock_spot_ohlc_1m_2026_05 ORDER BY symbol LIMIT 1)
  UNION ALL
  (
    SELECT (
      SELECT symbol FROM xstock_spot_ohlc_1m_2026_05
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
  FOR sym IN SELECT symbol FROM spot_symbols_2026_05 ORDER BY symbol LOOP
    iteration := iteration + 1;
    -- Rev5: per-symbol ROW_NUMBER single-pass; see xstock-perp file for rationale.
    DELETE FROM xstock_spot_ohlc_1m_2026_05
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY interval_begin
                 ORDER BY id DESC
               ) AS rn
        FROM xstock_spot_ohlc_1m_2026_05
        WHERE symbol = sym
      ) ranked
      WHERE rn > 1
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    RAISE NOTICE '[B-NEW-35 Phase 1] xstock_spot_2026_05 symbol % (#%) deleted % rows (total %)',
      sym, iteration, deleted_count, total_deleted;
    COMMIT;
    PERFORM pg_sleep(0.2);
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] xstock_spot_2026_05 COMPLETE: % symbols processed, % total rows deleted',
    iteration, total_deleted;
END $$;

DROP TABLE spot_symbols_2026_05;

VACUUM (VERBOSE) xstock_spot_ohlc_1m_2026_05;
