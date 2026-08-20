-- P19-B-PERPFEED HOTFIX (#704): crypto_perp_ohlc_1m was created WITHOUT the
-- (symbol, interval_begin) UNIQUE constraint its three siblings carry (added for
-- them by B-NEW-35, 2026-05-20). The B74 OHLC batch writer upserts with
-- ON CONFLICT (symbol, interval_begin); with no matching constraint every flush
-- threw "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" and DROPPED the batch — 368,841 bars scanned, 0 rows landed,
-- visible only in stderr (out.log carried no trace). Measured at post-deploy
-- verification 2026-08-20T12:2xZ.
--
-- The constraint includes the partition key (interval_begin), which PostgreSQL
-- requires for a UNIQUE on a partitioned parent; it cascades to every existing
-- and future daily child. The ticker table needs no equivalent: its writer does
-- not upsert (verified — crypto_perp_ticker_snap has been landing rows normally
-- throughout, 926k+ at the time of the finding).
ALTER TABLE crypto_perp_ohlc_1m
  ADD CONSTRAINT crypto_perp_ohlc_1m_symbol_interval_unique UNIQUE (symbol, interval_begin);
