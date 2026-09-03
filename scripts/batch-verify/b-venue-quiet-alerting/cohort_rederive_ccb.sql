-- CC-B independent re-derivation of the ONE number load-bearing on B-VENUE-QUIET-ALERTING's
-- design: the WORST-CASE cohort size overnight. Written from the stated object/population,
-- not copied from the handed-over script.
-- OBJECT: distinct tracked symbols with >=1 tick in a given minute.
-- POPULATION: minutes 2026-08-27..2026-09-02 inclusive inside the 24/5 window (Sun 20:00 ET -> Fri 20:00 ET).
WITH per_min AS (
  SELECT date_trunc('minute', captured_at) AS m,
         count(DISTINCT symbol)            AS live
    FROM xstock_spot_ticker_snap
   WHERE captured_at >= timestamptz '2026-08-27 00:00+00'
     AND captured_at <  timestamptz '2026-09-03 00:00+00'
   GROUP BY 1
), sessioned AS (
  SELECT m, live,
         (m AT TIME ZONE 'America/New_York')                       AS ny,
         extract(dow  FROM (m AT TIME ZONE 'America/New_York'))    AS dow,
         extract(hour FROM (m AT TIME ZONE 'America/New_York'))    AS hr
    FROM per_min
), in_window AS (   -- 24/5: drop Sat, drop Sun before 20:00, drop Fri after 20:00
  SELECT * FROM sessioned
   WHERE dow <> 6
     AND NOT (dow = 0 AND hr < 20)
     AND NOT (dow = 5 AND hr >= 20)
), bucketed AS (
  SELECT live,
         CASE WHEN hr >= 9  AND hr < 16 THEN 'regular'
              WHEN hr >= 4  AND hr < 9  THEN 'pre-market'
              WHEN hr >= 16 AND hr < 20 THEN 'after-hours'
              ELSE 'overnight' END AS session
    FROM in_window
)
SELECT session,
       count(*)                                            AS minutes,
       min(live)                                           AS min_live,
       percentile_disc(0.01) WITHIN GROUP (ORDER BY live)  AS p01,
       percentile_disc(0.50) WITHIN GROUP (ORDER BY live)  AS median
  FROM bucketed GROUP BY session
UNION ALL
SELECT 'ALL OFF-HOURS (non-regular)', count(*), min(live),
       percentile_disc(0.01) WITHIN GROUP (ORDER BY live),
       percentile_disc(0.50) WITHIN GROUP (ORDER BY live)
  FROM bucketed WHERE session <> 'regular'
UNION ALL
-- POSITIVE CONTROL: a known-live regular-hours minute must come back near the full universe.
SELECT 'CONTROL 2026-09-02 14:00Z (10:00 ET Wed)', 1, live, live, live
  FROM per_min WHERE m = timestamptz '2026-09-02 14:00+00';
