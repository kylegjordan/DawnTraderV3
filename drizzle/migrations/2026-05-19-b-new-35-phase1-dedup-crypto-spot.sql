-- B-NEW-35 Phase 1 — Dedup cleanup for crypto_spot_ohlc_1m
--
-- Same shape as the xstock_spot equivalent. See header of
-- 2026-05-19-b-new-35-phase1-dedup-xstock-spot.sql for full context.
-- Crypto pipeline reads OHLC via Kraken-REST `ohlcCache` (not the archive
-- table directly), so this dedup affects only B70 backfill / replay paths.

BEGIN;

-- ─── April 2026 (27,174 rows, single-statement) ────────────────────────
DELETE FROM crypto_spot_ohlc_1m_2026_04 a
USING crypto_spot_ohlc_1m_2026_04 b
WHERE a.symbol = b.symbol
  AND a.interval_begin = b.interval_begin
  AND a.id < b.id;

COMMIT;

VACUUM (VERBOSE) crypto_spot_ohlc_1m_2026_04;

-- ─── May 2026 (~9.3M rows, chunked) ────────────────────────────────────
-- Rev2: ROW_NUMBER + raised statement_timeout per xstock-spot rationale.
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
    DELETE FROM crypto_spot_ohlc_1m_2026_05
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY symbol, interval_begin
                 ORDER BY id DESC
               ) AS rn
        FROM crypto_spot_ohlc_1m_2026_05
      ) ranked
      WHERE rn > 1
      LIMIT chunk_size
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;

    RAISE NOTICE '[B-NEW-35 Phase 1] crypto_spot_2026_05 iteration % deleted % rows (total %)',
      iteration, deleted_count, total_deleted;

    EXIT WHEN deleted_count = 0;
    -- Per Langston Step 2 R1: explicit COMMIT releases locks + flushes WAL
    -- + advances xmin between chunks. See xstock-spot phase1 file for
    -- detailed rationale.
    PERFORM pg_sleep(0.5);
    COMMIT;
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] crypto_spot_2026_05 COMPLETE: % iterations, % total rows deleted',
    iteration, total_deleted;
END $$;

RESET statement_timeout;

VACUUM (VERBOSE) crypto_spot_ohlc_1m_2026_05;
