-- #1250 booking item -> #961 (CC-C, 2026-11-21): how old is the book an active xStock taker exit books against?
-- Population: the 16 active xStock paper taker r_multiple closes opened 2026-11-15T04:22:48Z .. 2026-11-21T01:00Z (same as b1250_step9_reread.sql cell C).
-- The trigger-side bid (the bid that fired the exit) is NOT in the table: it is the [3n.q7][XS_FRAME] <SYMBOL>/USD line in the PM2 logs
-- at the close second (out.log and error.log under /var/log/dawntrader/; grep symbol + close time).
-- Run: ssh root@188.245.193.8 "dt-sql" < this file
\pset footer off
\echo == A. booked price vs the snapshot row the close walked: age and warmth label
select symbol, to_char(closed_at,'MM-DD HH24:MI:SS.MS') closed, close_reason cr, exit_decision_price xd, exit_ticker_bid xb, exit_price x, actual_exit_price aep,
 round(extract(epoch from closed_at-exit_ticker_captured_at)::numeric,1) ticker_age_s, exit_fill_depth_age_ms fill_depth_age_ms,
 exit_fill_book_warmth warm, exit_fill_arm arm, exit_price_producer prod
from closed_trades where opened_at >= '2026-11-15T04:22:48Z' and opened_at < '2026-11-21T01:00:00Z' and asset_class='xstock_spot' and mode='paper' and chosen_entry_mode='taker'
 and metadata->'levelSpec'->'target'->>'form'='r_multiple' order by closed_at;
\echo == B. summary: booked = row bid, and how many booked on a book older than the entry ceiling (15000 ms)
select count(*) n, count(*) filter (where exit_price = exit_ticker_bid) booked_eq_row_bid,
 min(exit_fill_depth_age_ms) min_age_ms, max(exit_fill_depth_age_ms) max_age_ms,
 count(*) filter (where exit_fill_depth_age_ms > 15000) older_than_entry_ceiling,
 count(*) filter (where exit_fill_arm = 'walk_stale') walk_stale
from closed_trades where opened_at >= '2026-11-15T04:22:48Z' and opened_at < '2026-11-21T01:00:00Z' and asset_class='xstock_spot' and mode='paper' and chosen_entry_mode='taker'
 and metadata->'levelSpec'->'target'->>'form'='r_multiple';
