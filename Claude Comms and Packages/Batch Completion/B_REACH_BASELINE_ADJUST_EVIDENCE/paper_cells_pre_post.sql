SET default_transaction_read_only = on;
WITH d AS (SELECT timestamptz '2026-09-20 21:19:40+00' AS dep, now() AS nw),
w AS (SELECT 'pre' AS win, dep - (nw - dep) AS a, dep AS b FROM d UNION ALL SELECT 'post', dep, nw FROM d),
ct AS (SELECT c.strategy_name::text AS s, c.asset_class::text AS ac, c.actual_entry_price, c.net_pnl_percent, c.net_pnl, w.win FROM closed_trades c JOIN w ON c.opened_at >= w.a AND c.opened_at < w.b WHERE coalesce(c.mode::text,'paper') <> 'live'),
op AS (SELECT o.strategy_name::text AS s, o.asset_class::text AS ac, w.win FROM active_open_positions o JOIN w ON o.opened_at >= w.a AND o.opened_at < w.b),
tagged AS (
  SELECT CASE WHEN (s,ac) IN (('strong_bull_trend','crypto_spot'),('strong_bull_trend','xstock_spot'),('vwap_pullback','crypto_spot'),('vwap_bounce','crypto_spot'),('vwap_pullback','xstock_spot')) THEN s||'/'||ac ELSE 'ALL OTHERS/'||ac END AS cell, * FROM ct),
tagop AS (
  SELECT CASE WHEN (s,ac) IN (('strong_bull_trend','crypto_spot'),('strong_bull_trend','xstock_spot'),('vwap_pullback','crypto_spot'),('vwap_bounce','crypto_spot'),('vwap_pullback','xstock_spot')) THEN s||'/'||ac ELSE 'ALL OTHERS/'||ac END AS cell, win FROM op)
SELECT t.cell, t.win, count(*) AS closed_rows,
  count(*) FILTER (WHERE actual_entry_price IS NOT NULL) AS filled,
  round(avg(net_pnl_percent) FILTER (WHERE actual_entry_price IS NOT NULL)::numeric,2) AS avg_net_pct,
  count(*) FILTER (WHERE actual_entry_price IS NOT NULL AND net_pnl_percent>0) AS winners,
  round(sum(net_pnl)::numeric,2) AS sum_net_usd,
  (SELECT count(*) FROM tagop o WHERE o.cell=t.cell AND o.win=t.win) AS still_open
FROM tagged t GROUP BY t.cell, t.win ORDER BY t.cell, t.win DESC;
