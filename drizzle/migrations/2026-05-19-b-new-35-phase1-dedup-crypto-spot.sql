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

-- Rev4: recursive CTE skip-scan to enumerate unique symbols. See xstock-perp
-- file for rationale (SELECT DISTINCT hit 2-min timeout on 3.3M-row table;
-- this 9.3M-row crypto partition has more symbols and would fail worse).
CREATE TEMP TABLE crypto_symbols_2026_05 ON COMMIT PRESERVE ROWS AS
WITH RECURSIVE symbol_walk AS (
  (SELECT symbol FROM crypto_spot_ohlc_1m_2026_05 ORDER BY symbol LIMIT 1)
  UNION ALL
  (
    SELECT (
      SELECT symbol FROM crypto_spot_ohlc_1m_2026_05
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
  FOR sym IN SELECT symbol FROM crypto_symbols_2026_05 ORDER BY symbol LOOP
    iteration := iteration + 1;
    -- Rev5: per-symbol ROW_NUMBER single-pass; see xstock-perp file for rationale.
    DELETE FROM crypto_spot_ohlc_1m_2026_05
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY interval_begin
                 ORDER BY id DESC
               ) AS rn
        FROM crypto_spot_ohlc_1m_2026_05
        WHERE symbol = sym
      ) ranked
      WHERE rn > 1
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    RAISE NOTICE '[B-NEW-35 Phase 1] crypto_spot_2026_05 symbol % (#%) deleted % rows (total %)',
      sym, iteration, deleted_count, total_deleted;
    COMMIT;
    PERFORM pg_sleep(0.2);
  END LOOP;

  RAISE NOTICE '[B-NEW-35 Phase 1] crypto_spot_2026_05 COMPLETE: % symbols processed, % total rows deleted',
    iteration, total_deleted;
END $$;

DROP TABLE crypto_symbols_2026_05;

VACUUM (VERBOSE) crypto_spot_ohlc_1m_2026_05;
