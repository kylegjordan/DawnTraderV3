-- #526 EXIT-LEG, v2 — three defects in my own v1 fixed (Langston, 2026-09-03), all at the object.
--  (1) v1's `live_peers = 0` WELDED TWO STATES: self-live-and-alone (1-1) and nothing-ticked-
--      including-self (0-0). The second is not a peer problem at all — it is "no fresh mark on the
--      thing we hold" (B-PRICE-AGE-TRUTH territory), and "widen the grouping" there would hand back
--      a confident peer count while our own mark is stale. Split by whether SELF was live.
--  (2) v1's population was NARROWER THAN STATED: `held` required opened_at >= t0, excluding any
--      position opened BEFORE the window and still held inside it. Fixed to overlap semantics.
--  (3) `overnight` derives from live_min, so a TOTAL-DARK minute produces no row and is excluded by
--      construction. Partial gaps are refuted; total-dark is unmeasured. Reported, not claimed away.
--  Plus: live FRACTION per sector (size vs liquidity, unidentified in v1) and NEM's own denominator.
\set ON_ERROR_STOP on
CREATE TEMP TABLE b AS SELECT timestamptz '2026-08-27 00:00+00' AS t0, timestamptz '2026-09-03 12:00+00' AS t1;
CREATE TEMP TABLE uni AS
  SELECT u.symbol, coalesce(o.sector_override, u.sector) AS sector
    FROM xstock_spot_universe u LEFT JOIN xstock_spot_universe_overrides o ON o.symbol = u.symbol;
CREATE INDEX ON uni(symbol); CREATE INDEX ON uni(sector);
CREATE TEMP TABLE live_min AS
  SELECT DISTINCT date_trunc('minute', s.captured_at) AS m, s.symbol
    FROM xstock_spot_ticker_snap s, b WHERE s.captured_at >= b.t0 AND s.captured_at < b.t1;
CREATE INDEX ON live_min(m); CREATE INDEX ON live_min(m, symbol);
CREATE TEMP TABLE overnight AS
  SELECT DISTINCT m FROM live_min
   WHERE NOT (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 6
              OR (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 0 AND (m AT TIME ZONE 'America/New_York')::time < time '20:00')
              OR (extract(dow FROM (m AT TIME ZONE 'America/New_York')) = 5 AND (m AT TIME ZONE 'America/New_York')::time >= time '20:00'))
     AND NOT ((m AT TIME ZONE 'America/New_York')::time >= time '04:00' AND (m AT TIME ZONE 'America/New_York')::time < time '20:00');
CREATE INDEX ON overnight(m);
CREATE TEMP TABLE pos AS
  SELECT symbol, opened_at, NULL::timestamptz AS closed_at FROM active_open_positions WHERE asset_class = 'xstock_spot'
  UNION ALL SELECT symbol, opened_at, closed_at FROM closed_trades WHERE asset_class = 'xstock_spot';
-- (2) OVERLAP semantics: any position open during the window, whenever opened.
CREATE TEMP TABLE held AS
  SELECT DISTINCT p.symbol, o.m FROM pos p, b, overnight o
   WHERE p.opened_at < b.t1 AND (p.closed_at IS NULL OR p.closed_at >= b.t0)
     AND o.m >= date_trunc('minute', p.opened_at)
     AND (p.closed_at IS NULL OR o.m <= date_trunc('minute', p.closed_at));
CREATE INDEX ON held(m, symbol);
CREATE TEMP TABLE live_by_sector AS
  SELECT lm.m, u.sector, count(*) AS live_in_sector FROM live_min lm JOIN uni u ON u.symbol = lm.symbol GROUP BY lm.m, u.sector;
CREATE INDEX ON live_by_sector(m, sector);
CREATE TEMP TABLE sector_size AS SELECT sector, count(*) AS n_in_sector FROM uni GROUP BY sector;
CREATE TEMP TABLE peers AS
  SELECT h.symbol, h.m, u.sector, ss.n_in_sector,
         (lm.symbol IS NOT NULL) AS self_live,
         coalesce(lbs.live_in_sector,0) - CASE WHEN lm.symbol IS NOT NULL THEN 1 ELSE 0 END AS live_peers,
         coalesce(lbs.live_in_sector,0) AS live_in_sector_incl_self
    FROM held h JOIN uni u ON u.symbol = h.symbol
    JOIN sector_size ss ON ss.sector = u.sector
    LEFT JOIN live_by_sector lbs ON lbs.m = h.m AND lbs.sector = u.sector
    LEFT JOIN live_min lm ON lm.m = h.m AND lm.symbol = h.symbol;

\echo '=== (2) POPULATION, corrected to overlap semantics ==='
SELECT count(*) AS held_symbol_minutes, count(DISTINCT symbol) AS distinct_symbols, count(DISTINCT sector) AS sectors
  FROM peers;

\echo '=== (1) THE ZERO, SPLIT INTO ITS TWO STATES ==='
SELECT CASE WHEN live_peers > 0 THEN 'has peers'
            WHEN self_live      THEN 'ZERO peers, SELF LIVE  -> thin peer cohort (peer problem)'
            ELSE                     'ZERO peers, SELF DARK  -> no fresh mark on our own holding (#951 territory)' END AS state,
       count(*) AS minutes, count(DISTINCT symbol) AS symbols,
       round(100.0*count(*)/sum(count(*)) OVER (), 2) AS pct
  FROM peers GROUP BY 1 ORDER BY 2 DESC;

\echo '=== NEM own denominator: how often was NEM blind WHILE HELD? ==='
SELECT symbol, count(*) AS held_minutes,
       count(*) FILTER (WHERE live_peers = 0) AS zero_peer_minutes,
       round(100.0*count(*) FILTER (WHERE live_peers = 0)/count(*), 2) AS pct_of_its_own_held_minutes,
       count(*) FILTER (WHERE live_peers = 0 AND NOT self_live) AS zero_and_self_dark
  FROM peers GROUP BY symbol HAVING count(*) FILTER (WHERE live_peers = 0) > 0 ORDER BY 3 DESC;

\echo '=== DRIVER: size vs liquidity — live FRACTION per sector, overnight minutes ==='
SELECT lbs.sector, ss.n_in_sector,
       round(avg(lbs.live_in_sector)::numeric, 1) AS avg_live,
       round(avg(lbs.live_in_sector)::numeric / ss.n_in_sector, 3) AS avg_live_FRACTION
  FROM live_by_sector lbs JOIN sector_size ss ON ss.sector = lbs.sector
  JOIN overnight o ON o.m = lbs.m
 GROUP BY lbs.sector, ss.n_in_sector ORDER BY avg_live_FRACTION;
