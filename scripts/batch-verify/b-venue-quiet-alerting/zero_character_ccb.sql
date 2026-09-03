-- #526: CHARACTERISING THE ZEROS (Langston, 2026-09-03) — two objections, both settled here.
--   (1) A zero has TWO possible causes: a genuinely thin sector, OR the feed going dark across all
--       peers at once (an outage prints as a thin sector — the adjacent-object shape). The earlier
--       control proved only that the counter counts. DISCRIMINATOR: total live symbols marketwide
--       in that same minute. Feed gap => marketwide live is also ~0. Thin sector => marketwide high.
--   (2) MINUTES ARE NOT INDEPENDENT. 79 zero-minutes could be ONE 79-minute episode on ONE symbol.
--       Report EPISODES (contiguous runs per symbol) beside the minute percentages.
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
CREATE TEMP TABLE held AS
  SELECT DISTINCT p.symbol, o.m FROM pos p, b, overnight o
   WHERE p.opened_at >= b.t0 AND p.opened_at < b.t1 AND o.m >= date_trunc('minute', p.opened_at)
     AND (p.closed_at IS NULL OR o.m <= date_trunc('minute', p.closed_at));
CREATE INDEX ON held(m, symbol);
CREATE TEMP TABLE live_by_sector AS
  SELECT lm.m, u.sector, count(*) AS live_in_sector FROM live_min lm JOIN uni u ON u.symbol = lm.symbol GROUP BY lm.m, u.sector;
CREATE INDEX ON live_by_sector(m, sector);
CREATE TEMP TABLE live_total AS SELECT m, count(*) AS live_marketwide FROM live_min GROUP BY m;
CREATE INDEX ON live_total(m);
CREATE TEMP TABLE peers AS
  SELECT h.symbol, h.m, u.sector,
         coalesce(lbs.live_in_sector,0) - CASE WHEN lm.symbol IS NOT NULL THEN 1 ELSE 0 END AS live_peers,
         coalesce(lt.live_marketwide,0) AS live_marketwide
    FROM held h JOIN uni u ON u.symbol = h.symbol
    LEFT JOIN live_by_sector lbs ON lbs.m = h.m AND lbs.sector = u.sector
    LEFT JOIN live_min lm ON lm.m = h.m AND lm.symbol = h.symbol
    LEFT JOIN live_total lt ON lt.m = h.m;

\echo '=== (1) DISCRIMINATOR: are the zeros thin sectors, or feed gaps? ==='
SELECT CASE WHEN live_peers = 0 THEN 'ZERO peers' WHEN live_peers < 3 THEN '1-2 peers' ELSE '3+ peers' END AS bucket,
       count(*) AS minutes,
       min(live_marketwide) AS min_marketwide, round(avg(live_marketwide)) AS avg_marketwide, max(live_marketwide) AS max_marketwide,
       count(*) FILTER (WHERE live_marketwide < 20) AS minutes_with_marketwide_under_20
  FROM peers GROUP BY 1 ORDER BY 1;

\echo '=== (2) EPISODES: contiguous runs of ZERO-peer minutes, per symbol ==='
WITH z AS (
  SELECT symbol, m, sector, live_marketwide,
         row_number() OVER (PARTITION BY symbol ORDER BY m) AS rn,
         (extract(epoch FROM m)/60)::bigint AS minute_idx
    FROM peers WHERE live_peers = 0
), grp AS (SELECT z.*, minute_idx - rn AS island FROM z)
SELECT symbol, sector, count(*) AS run_minutes,
       to_char(min(m) AT TIME ZONE 'America/New_York', 'MM-DD HH24:MI') AS start_ny,
       to_char(max(m) AT TIME ZONE 'America/New_York', 'MM-DD HH24:MI') AS end_ny,
       min(live_marketwide) AS min_marketwide_in_run
  FROM grp GROUP BY symbol, sector, island ORDER BY run_minutes DESC, start_ny;

\echo '=== (2b) EPISODES for the <3-peer set: how many distinct runs / symbols? ==='
WITH t AS (
  SELECT symbol, m, row_number() OVER (PARTITION BY symbol ORDER BY m) AS rn,
         (extract(epoch FROM m)/60)::bigint AS minute_idx
    FROM peers WHERE live_peers < 3
), grp AS (SELECT t.*, minute_idx - rn AS island FROM t)
SELECT count(*) AS episodes, count(DISTINCT symbol) AS symbols,
       min(len) AS shortest, round(avg(len)) AS avg_len, max(len) AS longest
  FROM (SELECT symbol, island, count(*) AS len FROM grp GROUP BY symbol, island) e;
