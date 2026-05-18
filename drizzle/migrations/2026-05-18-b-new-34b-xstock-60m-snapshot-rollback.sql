-- B-NEW-34b rollback — drop xstock_spot_ohlc_60m_snapshot.
--
-- Safe to run: this table is a derived/derivable artifact. The underlying
-- 1-min source data in xstock_spot_ohlc_1m is unaffected. Dropping the
-- snapshot table reverts the cache to live-aggregation-only behavior.
-- The cache code in server/services/xstock-ohlc-cache.ts must be reverted
-- as part of the same rollback, otherwise the cache will throw on snapshot
-- read.

BEGIN;

DROP INDEX IF EXISTS idx_xstock_spot_ohlc_60m_snapshot_symbol_ts_desc;
DROP TABLE IF EXISTS xstock_spot_ohlc_60m_snapshot;

COMMIT;
