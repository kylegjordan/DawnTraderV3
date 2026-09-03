-- Mechanism check: were the exit-skip symbols' positions OPENED during regular hours?
-- If so, they can never enter S (which requires an overnight open), and the two populations
-- are disjoint BY CONSTRUCTION rather than by coincidence.
SELECT symbol,
       to_char(opened_at AT TIME ZONE 'America/New_York', 'MM-DD HH24:MI') AS opened_ny,
       CASE WHEN (opened_at AT TIME ZONE 'America/New_York')::time >= time '04:00'
             AND (opened_at AT TIME ZONE 'America/New_York')::time <  time '20:00'
            THEN 'REGULAR/EXTENDED (cannot enter S)' ELSE 'overnight (would enter S)' END AS bucket,
       state
  FROM active_open_positions
 WHERE symbol IN ('MDT/USD','NEM/USD','CTVA/USD','LI/USD','RIOT/USD')
UNION ALL
SELECT symbol, to_char(opened_at AT TIME ZONE 'America/New_York','MM-DD HH24:MI'),
       CASE WHEN (opened_at AT TIME ZONE 'America/New_York')::time >= time '04:00'
             AND (opened_at AT TIME ZONE 'America/New_York')::time <  time '20:00'
            THEN 'REGULAR/EXTENDED (cannot enter S)' ELSE 'overnight (would enter S)' END,
       'closed'
  FROM closed_trades
 WHERE symbol IN ('MDT/USD','NEM/USD','CTVA/USD','LI/USD','RIOT/USD')
   AND opened_at >= timestamptz '2026-08-27 00:00+00'
 ORDER BY 2;
