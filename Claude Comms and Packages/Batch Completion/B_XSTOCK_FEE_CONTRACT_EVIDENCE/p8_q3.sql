SET default_transaction_read_only = on;
SET statement_timeout = '600s';
\pset pager off
\echo === columns of the linkage tables ===
SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_name IN ('active_open_positions','closed_trades','rtb_signals') AND table_schema='public'
GROUP BY 1;
\echo === rtb_shadow_pairings: is promoted_trade_id ever populated (xStock, post-deploy)? ===
SELECT count(*) AS n, count(promoted_trade_id) AS with_trade_id, count(*) FILTER (WHERE promoted) AS promoted,
       count(signal_id) AS with_signal_id
FROM rtb_shadow_pairings WHERE asset_class='xstock_spot' AND created_at >= timestamptz '2026-09-11 20:09:47+00';
\echo === xStock paper positions opened post-deploy: entry mode x entry_fee_rate (context for the buckets) ===
SELECT 'closed_trades' AS src, mode::text, chosen_entry_mode, entry_fee_rate, count(*) FROM closed_trades
WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:09:47+00' GROUP BY 1,2,3,4
UNION ALL
SELECT 'active_open_positions', mode::text, chosen_entry_mode, entry_fee_rate, count(*) FROM active_open_positions
WHERE asset_class='xstock_spot' AND opened_at >= timestamptz '2026-09-11 20:09:47+00' GROUP BY 1,2,3,4
ORDER BY 1,2,3,4;
