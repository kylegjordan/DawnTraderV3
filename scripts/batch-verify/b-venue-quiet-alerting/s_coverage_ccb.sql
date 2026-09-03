-- B-VENUE-QUIET-ALERTING (#526): is S the right peer proxy for the leg that produces the NOISE?
-- S is built from overnight DISPATCH attempts (entry side). The fan-out leg this batch exists for
-- is the EXIT-skip alarm (price-skip-paper-<symbol>, 228 rows / 79 symbols). Those fire for symbols
-- we HOLD, which need not have dispatched overnight at all.
-- OBJECT: membership of the four live exit-skip symbols in S. POPULATION: S over the same window.
WITH bounds AS (SELECT timestamptz '2026-08-27 00:00+00' AS t0, timestamptz '2026-09-03 00:00+00' AS t1),
sig_symbols AS (
  SELECT DISTINCT v.symbol
    FROM vts_open_trades v, bounds
   WHERE v.asset_class = 'xstock_spot'
     AND v.inserted_at >= bounds.t0 AND v.inserted_at < bounds.t1
     AND NOT ((v.inserted_at AT TIME ZONE 'America/New_York')::time >= time '04:00'
              AND (v.inserted_at AT TIME ZONE 'America/New_York')::time < time '20:00')
),
live_alert_symbols(sym) AS (VALUES ('MDT/USD'), ('NEM/USD'), ('CTVA/USD'), ('LI/USD'), ('RIOT/USD'))
SELECT l.sym,
       (l.sym IN (SELECT symbol FROM sig_symbols)) AS in_S_overnight_dispatchers
  FROM live_alert_symbols l
UNION ALL
SELECT '--- |S| ---', NULL FROM (SELECT 1) x
UNION ALL
SELECT (SELECT count(*)::text FROM sig_symbols), NULL
UNION ALL
SELECT '--- S members ---', NULL
UNION ALL
SELECT string_agg(symbol, ', ' ORDER BY symbol), NULL FROM sig_symbols;
