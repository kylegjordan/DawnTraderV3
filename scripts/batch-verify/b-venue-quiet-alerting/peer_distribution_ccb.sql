-- B-VENUE-QUIET-ALERTING (#526): the DISTRIBUTION of peer-set liveness, not the median.
-- Langston, 2026-09-03: "what fraction of overnight minutes put the evaluated symbol's peer set
-- at < 3, and what fraction at 0. Those two numbers decide whether the branch needs a floor or a
-- fallback, and they're different designs."
--
-- S is INHERITED VERBATIM from CC-C's committed cohort_composition.sql (symbols that produced an
-- overnight xstock dispatch attempt in the window) so the population is his, stated not assumed.
-- The COUNTING is mine.
--
-- NOTE ON THE OBJECT: the symbol under evaluation is STALE at evaluation time (that is why the
-- discriminator runs), so it is not among the live — `live_in_s` is already the PEER count for a
-- stale evaluated symbol drawn from S. Reported both raw and excluding-self for the case where the
-- evaluated symbol IS live in that minute.
WITH bounds AS (SELECT timestamptz '2026-08-27 00:00+00' AS t0, timestamptz '2026-09-03 00:00+00' AS t1),
pairs AS (
  SELECT DISTINCT date_trunc('minute', captured_at) AS m, symbol
    FROM xstock_spot_ticker_snap, bounds
   WHERE captured_at >= bounds.t0 AND captured_at < bounds.t1
),
tagged AS (SELECT p.*, (p.m AT TIME ZONE 'America/New_York') AS ny FROM pairs p),
in_window AS (
  SELECT symbol, m, ny FROM tagged
   WHERE NOT (extract(dow FROM ny) = 6
              OR (extract(dow FROM ny) = 0 AND ny::time <  time '20:00')
              OR (extract(dow FROM ny) = 5 AND ny::time >= time '20:00'))
),
overnight_pairs AS (   -- overnight = outside 04:00-20:00 ET, matching his bucketing
  SELECT symbol, m FROM in_window
   WHERE NOT (ny::time >= time '04:00' AND ny::time < time '20:00')
),
overnight_minutes AS (SELECT DISTINCT m FROM overnight_pairs),
sig_symbols AS (
  SELECT DISTINCT v.symbol
    FROM vts_open_trades v, bounds
   WHERE v.asset_class = 'xstock_spot'
     AND v.inserted_at >= bounds.t0 AND v.inserted_at < bounds.t1
     AND NOT ((v.inserted_at AT TIME ZONE 'America/New_York')::time >= time '04:00'
              AND (v.inserted_at AT TIME ZONE 'America/New_York')::time < time '20:00')
),
peer_live AS (
  SELECT om.m, count(op.symbol) AS live_in_s
    FROM overnight_minutes om
    LEFT JOIN overnight_pairs op
      ON op.m = om.m AND op.symbol IN (SELECT symbol FROM sig_symbols)
   GROUP BY om.m
)
SELECT (SELECT count(*) FROM sig_symbols)                                   AS s_size,
       count(*)                                                             AS overnight_minutes,
       min(live_in_s)                                                       AS min_peers,
       percentile_disc(0.05) WITHIN GROUP (ORDER BY live_in_s)              AS p05,
       percentile_disc(0.50) WITHIN GROUP (ORDER BY live_in_s)              AS median,
       -- THE TWO NUMBERS THAT DECIDE FLOOR-vs-FALLBACK:
       round(100.0 * count(*) FILTER (WHERE live_in_s < 3) / count(*), 2)   AS pct_minutes_under_3,
       round(100.0 * count(*) FILTER (WHERE live_in_s = 0) / count(*), 2)   AS pct_minutes_zero,
       count(*) FILTER (WHERE live_in_s < 3)                                AS n_minutes_under_3,
       count(*) FILTER (WHERE live_in_s = 0)                                AS n_minutes_zero
  FROM peer_live;
