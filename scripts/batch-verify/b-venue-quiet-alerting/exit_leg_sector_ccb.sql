-- Staged form of the exit-leg sector measurement (the single-statement version times out).
\set ON_ERROR_STOP on
CREATE TEMP TABLE b AS SELECT timestamptz '2026-08-27 00:00+00' AS t0, timestamptz '2026-09-03 12:00+00' AS t1;

CREATE TEMP TABLE uni AS
  SELECT u.symbol, coalesce(o.sector_override, u.sector) AS sector
    FROM xstock_spot_universe u
    LEFT JOIN xstock_spot_universe_overrides o ON o.symbol = u.symbol;
CREATE INDEX ON uni(symbol); CREATE INDEX ON uni(sector);

-- live (minute, symbol) pairs in window
CREATE TEMP TABLE live_min AS
  SELECT DISTINCT date_trunc('minute', s.captured_at) AS m, s.symbol
    FROM xstock_spot_ticker_snap s, b
   WHERE s.captured_at >= b.t0 AND s.captured_at < b.t1;
CREATE INDEX ON live_min(m); CREATE INDEX ON live_min(m, symbol);

-- overnight minutes only
CREATE TEMP TABLE overnight AS
  SELECT DISTINCT m FROM live_min
   WHERE NOT (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 6
              OR (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 0
                  AND (m AT TIME ZONE 'America/New_York')::time <  time '20:00')
              OR (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 5
                  AND (m AT TIME ZONE 'America/New_York')::time >= time '20:00'))
     AND NOT ((m AT TIME ZONE 'America/New_York')::time >= time '04:00'
              AND (m AT TIME ZONE 'America/New_York')::time <  time '20:00');
CREATE INDEX ON overnight(m);

CREATE TEMP TABLE pos AS
  SELECT symbol, opened_at, NULL::timestamptz AS closed_at FROM active_open_positions WHERE asset_class = 'xstock_spot'
  UNION ALL
  SELECT symbol, opened_at, closed_at FROM closed_trades WHERE asset_class = 'xstock_spot';

CREATE TEMP TABLE held AS
  SELECT DISTINCT p.symbol, o.m
    FROM pos p, b, overnight o
   WHERE p.opened_at >= b.t0 AND p.opened_at < b.t1
     AND o.m >= date_trunc('minute', p.opened_at)
     AND (p.closed_at IS NULL OR o.m <= date_trunc('minute', p.closed_at));
CREATE INDEX ON held(m, symbol);

CREATE TEMP TABLE live_by_sector AS
  SELECT lm.m, u.sector, count(*) AS live_in_sector
    FROM live_min lm JOIN uni u ON u.symbol = lm.symbol
   GROUP BY lm.m, u.sector;
CREATE INDEX ON live_by_sector(m, sector);

CREATE TEMP TABLE sector_size AS SELECT sector, count(*) AS n_in_sector FROM uni GROUP BY sector;

CREATE TEMP TABLE peers AS
  SELECT h.symbol, h.m, u.sector,
         coalesce(lbs.live_in_sector,0) - CASE WHEN lm.symbol IS NOT NULL THEN 1 ELSE 0 END AS live_peers,
         ss.n_in_sector - 1 AS sector_peers_total
    FROM held h
    JOIN uni u ON u.symbol = h.symbol
    JOIN sector_size ss ON ss.sector = u.sector
    LEFT JOIN live_by_sector lbs ON lbs.m = h.m AND lbs.sector = u.sector
    LEFT JOIN live_min lm ON lm.m = h.m AND lm.symbol = h.symbol;

SELECT count(*) AS held_symbol_minutes, count(DISTINCT symbol) AS distinct_held_symbols,
       count(DISTINCT sector) AS sectors_touched, min(sector_peers_total) AS smallest_sector_peers,
       min(live_peers) AS min_live_peers,
       percentile_disc(0.05) WITHIN GROUP (ORDER BY live_peers) AS p05,
       percentile_disc(0.50) WITHIN GROUP (ORDER BY live_peers) AS median,
       max(live_peers) AS max_live_peers,
       count(*) FILTER (WHERE live_peers = 0) AS n_zero,
       round(100.0*count(*) FILTER (WHERE live_peers = 0)/count(*),2) AS pct_zero,
       count(*) FILTER (WHERE live_peers < 3) AS n_under_3,
       round(100.0*count(*) FILTER (WHERE live_peers < 3)/count(*),2) AS pct_under_3,
       count(*) FILTER (WHERE live_peers < 10) AS n_under_10_control
  FROM peers;
