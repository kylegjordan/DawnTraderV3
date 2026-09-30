-- B-XSTOCK-BID-TRIGGER-RELAND (row 3n.q7) increment 2 P5 — the snapshot export `xs_frame_false_hollow.py --snaps` reads.
-- One row per xStock ticker snapshot in the window: symbol, epoch seconds, last, volume_24h. The classifier derives a
-- PRINT from a strict volume_24h rise between consecutive snapshots (the table has no trade timestamp).
-- Run on staging, bounded by time AND by the held symbols (all symbols is ~1,100 rows a minute, ~35M over 21 days):
--   psql "$DATABASE_URL" -At -q -v from="'2026-10-02 20:10+00'" -v to="'2026-10-24 00:00+00'" \
--     -v syms="'MDB/USD,LOW/USD'" -f xs_frame_false_hollow_snaps.sql > snaps.csv
-- Widen `to` by 30 min past the last frame so the +30 min sensitivity horizon is covered; `syms` = the distinct symbols
-- in the XS_FRAME corpus.
SET statement_timeout = '600s';
COPY (SELECT symbol, extract(epoch FROM captured_at), last, volume_24h FROM xstock_spot_ticker_snap WHERE captured_at >= (:from)::timestamptz AND captured_at < (:to)::timestamptz AND symbol = ANY(string_to_array(:syms, ',')) ORDER BY symbol, captured_at) TO STDOUT WITH CSV
