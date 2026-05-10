-- B79.0e rollback — reverse-rename xstock_*→equity_*.

BEGIN;

ALTER TABLE xstock_spot_ohlc_1m       RENAME TO equity_spot_ohlc_1m;
ALTER TABLE xstock_spot_ticker_snap   RENAME TO equity_spot_ticker_snap;
ALTER TABLE xstock_perp_ohlc_1m       RENAME TO equity_perp_ohlc_1m;
ALTER TABLE xstock_perp_ticker_snap   RENAME TO equity_perp_ticker_snap;

ALTER INDEX xstock_spot_ohlc_1m_sym_time     RENAME TO equity_spot_ohlc_1m_sym_time;
ALTER INDEX xstock_spot_ticker_snap_sym_time RENAME TO equity_spot_ticker_snap_sym_time;
ALTER INDEX xstock_perp_ohlc_1m_sym_time     RENAME TO equity_perp_ohlc_1m_sym_time;
ALTER INDEX xstock_perp_ticker_snap_sym_time RENAME TO equity_perp_ticker_snap_sym_time;

COMMIT;
