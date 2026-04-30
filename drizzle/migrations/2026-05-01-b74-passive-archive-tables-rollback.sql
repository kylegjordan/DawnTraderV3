-- Rollback for 2026-05-01-b74-passive-archive-tables.sql
--
-- DROP TABLE CASCADE on each parent table also drops all child partitions.
-- Safe because no other live table has FKs into these (per Langston-approved
-- B70 archival contract).

BEGIN;

DROP TABLE IF EXISTS equity_spot_ohlc_1m       CASCADE;
DROP TABLE IF EXISTS equity_perp_ohlc_1m       CASCADE;
DROP TABLE IF EXISTS crypto_spot_ohlc_1m       CASCADE;
DROP TABLE IF EXISTS equity_spot_ticker_snap   CASCADE;
DROP TABLE IF EXISTS equity_perp_ticker_snap   CASCADE;
DROP TABLE IF EXISTS crypto_spot_ticker_snap   CASCADE;

DELETE FROM module_constants
WHERE module_name = 'passive_archive'
  AND constant_name IN (
    'b74_equity_capture_enabled',
    'b74_perp_capture_enabled',
    'b74_crypto_capture_enabled',
    'b74_crypto_min_volume_24h_usd',
    'b74_ws_reconnect_max_backoff_sec',
    'b74_ticker_snapshot_min_interval_ms',
    'b74_partition_lookhead_months'
  );

COMMIT;
