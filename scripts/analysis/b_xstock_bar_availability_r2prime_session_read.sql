-- B-XSTOCK-BAR-AVAILABILITY Step 9 R2' round 2 (CC-C, 2026-11-22): the session read behind the weekday disposition.
-- Read-only. Run through dt-sql on staging: ssh root@188.245.193.8 "dt-sql" < this file.
-- Query 1: per ET session (Sun-Thu start; Sunday opens 20:15 ET, others 20:00 ET; ends next day 20:00 ET)
-- head / tail / max internal gap in seconds over flushes that carried at least one revision. Pass = all three <= 60.
-- Result at the time of the read: 26 sessions (ET 10-15 .. 11-19), 21 pass, 5 fail (10-20, 10-28, 11-03, 11-09, 11-15).
WITH et_days AS (
  SELECT d::date AS et_date FROM generate_series('2026-10-15'::timestamp, '2026-11-21'::timestamp, interval '1 day') g(d)
), bounds AS (
  SELECT et_date,
         (et_date + CASE WHEN extract(isodow FROM et_date)=7 THEN time '20:15' ELSE time '20:00' END) AT TIME ZONE 'America/New_York' AS s,
         (et_date + 1 + time '20:00') AT TIME ZONE 'America/New_York' AS e
  FROM et_days WHERE extract(isodow FROM et_date) IN (7,1,2,3,4)
), adm AS (
  SELECT DISTINCT a.admitted_at
  FROM xstock_bar_projection_flush_admission a
  JOIN xstock_bar_projection_flush_completion c USING (flush_id)
  WHERE cardinality(c.revision_ids) > 0 AND a.admitted_at >= '2026-10-15' AND a.admitted_at < '2026-11-22'
), per AS (
  SELECT b.et_date, b.s, b.e, x.admitted_at,
         lag(x.admitted_at) OVER (PARTITION BY b.et_date ORDER BY x.admitted_at) AS prev
  FROM bounds b JOIN adm x ON x.admitted_at >= b.s AND x.admitted_at < b.e
)
SELECT et_date, to_char(et_date,'Dy') dow,
       round(extract(epoch FROM min(admitted_at)-min(s))) head_s,
       round(extract(epoch FROM min(e)-max(admitted_at))) tail_s,
       round(max(extract(epoch FROM admitted_at-prev))) maxgap_s,
       count(*) n
FROM per GROUP BY et_date ORDER BY et_date;

-- Query 2: every gap > 60 s between non-empty flushes since 10-15, with empty flushes and revision events inside it.
-- empty_flushes_in_gap = 0 in every row: the writer did not record empty flushes, so venue-quiet and writer-dead cannot be told apart.
WITH f AS (
  SELECT a.admitted_at, cardinality(c.revision_ids) AS nrev
  FROM xstock_bar_projection_flush_admission a
  JOIN xstock_bar_projection_flush_completion c USING (flush_id)
  WHERE a.admitted_at >= '2026-10-15T00:00:00Z'
), nz AS (SELECT admitted_at FROM f WHERE nrev > 0),
g AS (SELECT admitted_at, lag(admitted_at) OVER (ORDER BY admitted_at) AS prev FROM nz)
SELECT to_char(g.prev AT TIME ZONE 'America/New_York','Dy MM-DD HH24:MI:SS') AS gap_start_et,
       to_char(g.admitted_at AT TIME ZONE 'America/New_York','HH24:MI:SS') AS gap_end_et,
       round(extract(epoch FROM g.admitted_at - g.prev)) AS gap_s,
       (SELECT count(*) FROM f WHERE f.admitted_at > g.prev AND f.admitted_at < g.admitted_at) AS empty_flushes_in_gap,
       (SELECT count(*) FROM xstock_bar_revision_event e WHERE e.arrived_at > g.prev AND e.arrived_at < g.admitted_at) AS events_arrived_in_gap
FROM g WHERE g.admitted_at - g.prev > interval '60 seconds'
ORDER BY g.prev;
