-- #526 EXIT-LEG v3 — the minute grid is GENERATED, not derived from the tick table.
-- v2 built `overnight` from live_min, so a TOTAL-DARK minute (nothing ticked anywhere) produced no
-- row and never entered the population. I flagged that as "excluded by construction, unmeasured";
-- CC-C then measured 13 total-dark overnight minutes in the same window, so it is no longer
-- hypothetical. This version generates every minute and classifies FOUR states, not three.
\set ON_ERROR_STOP on
CREATE TEMP TABLE b AS SELECT timestamptz '2026-08-27 00:00+00' AS t0, timestamptz '2026-09-03 12:00+00' AS t1;
CREATE TEMP TABLE uni AS
  SELECT u.symbol, coalesce(o.sector_override, u.sector) AS sector
    FROM xstock_spot_universe u LEFT JOIN xstock_spot_universe_overrides o ON o.symbol = u.symbol;
CREATE INDEX ON uni(symbol);
CREATE TEMP TABLE live_min AS
  SELECT DISTINCT date_trunc('minute', s.captured_at) AS m, s.symbol
    FROM xstock_spot_ticker_snap s, b WHERE s.captured_at >= b.t0 AND s.captured_at < b.t1;
CREATE INDEX ON live_min(m); CREATE INDEX ON live_min(m, symbol);
-- GENERATED grid: every minute in the window, whether or not anything ticked.
CREATE TEMP TABLE grid AS
  SELECT g AS m FROM b, generate_series(b.t0, b.t1 - interval '1 minute', interval '1 minute') g;
CREATE TEMP TABLE overnight AS
  SELECT m FROM grid
   WHERE NOT (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 6
              OR (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 0 AND (m AT TIME ZONE 'America/New_York')::time < time '20:00')
              OR (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 5 AND (m AT TIME ZONE 'America/New_York')::time >= time '20:00'))
     AND NOT ((m AT TIME ZONE 'America/New_York')::time >= time '04:00' AND (m AT TIME ZONE 'America/New_York')::time < time '20:00');
CREATE INDEX ON overnight(m);
CREATE TEMP TABLE pos AS
  SELECT symbol, opened_at, NULL::timestamptz AS closed_at FROM active_open_positions WHERE asset_class = 'xstock_spot'
  UNION ALL SELECT symbol, opened_at, closed_at FROM closed_trades WHERE asset_class = 'xstock_spot';
CREATE TEMP TABLE held AS
  SELECT DISTINCT p.symbol, o.m FROM pos p, b, overnight o
   WHERE p.opened_at < b.t1 AND (p.closed_at IS NULL OR p.closed_at >= b.t0)
     AND o.m >= date_trunc('minute', p.opened_at)
     AND (p.closed_at IS NULL OR o.m <= date_trunc('minute', p.closed_at));
CREATE INDEX ON held(m, symbol);
CREATE TEMP TABLE live_by_sector AS
  SELECT lm.m, u.sector, count(*) AS live_in_sector FROM live_min lm JOIN uni u ON u.symbol = lm.symbol GROUP BY lm.m, u.sector;
CREATE INDEX ON live_by_sector(m, sector);
CREATE TEMP TABLE live_total AS SELECT m, count(*) AS live_marketwide FROM live_min GROUP BY m;
CREATE INDEX ON live_total(m);

\echo '=== TOTAL-DARK overnight minutes in the generated grid (CC-C re-derived on my window) ==='
SELECT count(*) AS overnight_minutes_in_grid,
       count(*) FILTER (WHERE lt.m IS NOT NULL) AS observed,
       count(*) FILTER (WHERE lt.m IS NULL)     AS total_dark,
       round(100.0*count(*) FILTER (WHERE lt.m IS NULL)/count(*), 2) AS pct_dark
  FROM overnight o LEFT JOIN live_total lt ON lt.m = o.m;

\echo '=== FOUR STATES over the CORRECTED population (grid-based) ==='
WITH peers AS (
  SELECT h.symbol, h.m, u.sector,
         (lm.symbol IS NOT NULL) AS self_live,
         coalesce(lt.live_marketwide, 0) AS live_marketwide,
         coalesce(lbs.live_in_sector,0) - CASE WHEN lm.symbol IS NOT NULL THEN 1 ELSE 0 END AS live_peers
    FROM held h JOIN uni u ON u.symbol = h.symbol
    LEFT JOIN live_by_sector lbs ON lbs.m = h.m AND lbs.sector = u.sector
    LEFT JOIN live_min lm ON lm.m = h.m AND lm.symbol = h.symbol
    LEFT JOIN live_total lt ON lt.m = h.m
)
SELECT CASE WHEN live_marketwide = 0 THEN 'D. TOTAL-DARK: nothing quoting anywhere (invisible to v2)'
            WHEN live_peers > 0      THEN 'A. has peers'
            WHEN self_live           THEN 'B. zero peers, self LIVE  -> thin peer cohort'
            ELSE                          'C. zero peers, self DARK  -> no fresh mark on our holding (#951)' END AS state,
       count(*) AS held_symbol_minutes, count(DISTINCT symbol) AS symbols,
       round(100.0*count(*)/sum(count(*)) OVER (), 2) AS pct
  FROM peers GROUP BY 1 ORDER BY 1;
