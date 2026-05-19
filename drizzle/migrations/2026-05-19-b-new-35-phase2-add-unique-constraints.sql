-- B-NEW-35 Phase 2 — Add UNIQUE constraint on (symbol, interval_begin) for
-- all 3 partitioned _ohlc_1m tables. Must run AFTER Phase 1 cleanup completes
-- on all 3 tables, otherwise the constraint addition would fail on existing
-- duplicates.
--
-- Per Postgres docs: UNIQUE on a partitioned table requires the partition
-- key columns to be part of the constraint. Both `symbol` and `interval_begin`
-- are present here — `interval_begin` is the partition key, so PG accepts this.
-- The constraint cascades to all existing partitions automatically.
--
-- Note: PG will internally do an index build per partition. With deduped data,
-- this is fast (~1-5 minutes per table). During the build, INSERTs queue
-- briefly but don't fail.
--
-- DEPLOY PATTERN: direct psql, then manual INSERT INTO _migrations with
-- bypass comment "B-NEW-35 bypass — ledger reconciliation pending in
-- B-NEW-36 sub-batch (a)".

BEGIN;

-- ─── xstock_spot ───────────────────────────────────────────────────────
ALTER TABLE xstock_spot_ohlc_1m
  ADD CONSTRAINT xstock_spot_ohlc_1m_symbol_interval_unique
  UNIQUE (symbol, interval_begin);

-- ─── crypto_spot ───────────────────────────────────────────────────────
ALTER TABLE crypto_spot_ohlc_1m
  ADD CONSTRAINT crypto_spot_ohlc_1m_symbol_interval_unique
  UNIQUE (symbol, interval_begin);

-- ─── xstock_perp ───────────────────────────────────────────────────────
ALTER TABLE xstock_perp_ohlc_1m
  ADD CONSTRAINT xstock_perp_ohlc_1m_symbol_interval_unique
  UNIQUE (symbol, interval_begin);

COMMIT;
