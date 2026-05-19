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

-- ─── May 2026 (~9.3M rows, per-symbol iteration) ──────────────────────
-- Rev3 approach: per-symbol iteration via index seek per xstock-spot
-- rationale. Crypto universe has ~445 symbols (more than xstocks), but
-- per-symbol data is smaller (~21K rows/symbol). Expected wallclock
-- 10-15 min.

CREATE TEMP TABLE crypto_symbols_2026_05 ON COMMIT PRESERVE ROWS AS
SELECT DISTINCT symbol FROM crypto_spot_ohlc_1m_2026_05;

DO $$
DECLARE
  sym TEXT;
  deleted_count INTEGER;
  total_deleted BIGINT := 0;
  iteration INTEGER := 0;
BEGIN
  FOR sym IN SELECT symbol FROM crypto_symbols_2026_05 ORDER BY symbol LOOP
    iteration := iteration + 1;
    DELETE FROM crypto_spot_ohlc_1m_2026_05 a
    USING crypto_spot_ohlc_1m_2026_05 b
    WHERE a.symbol = sym
      AND b.symbol = sym
      AND a.interval_begin = b.interval_begin
      AND a.id < b.id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    RAISE NOTICE '[B-NEW-35 Phase 1] crypto_spot_2026_05 symbol % (#%) deleted % rows (total %)',
      sym, iteration, deleted_count, total_deleted;
    COMMIT;
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] crypto_spot_2026_05 COMPLETE: % symbols processed, % total rows deleted',
    iteration, total_deleted;
END $$;

DROP TABLE crypto_symbols_2026_05;

VACUUM (VERBOSE) crypto_spot_ohlc_1m_2026_05;
