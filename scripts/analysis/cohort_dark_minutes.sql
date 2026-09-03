-- Does my cohort instrument's minute population EXCLUDE totally-dark minutes?
-- `per_min` groups the tick table, so a minute in which NO symbol ticked has NO ROW and is
-- silently absent — the same shape Langston named on CC-B's denominator. If total-dark minutes
-- exist inside the 24/5 window, my "minimum 88 live symbols" is conditioned on at least one tick
-- and UNDERSTATES the tail, which is the direction that matters for a thin-cohort claim.
-- OBJECT: minutes in the window, from a generated grid, classified as observed vs dark.
set statement_timeout = 600000;
with grid as (
  select generate_series(timestamptz '2026-08-27 00:00+00',
                         timestamptz '2026-09-02 23:59+00', interval '1 minute') as m
), obs as (
  select distinct date_trunc('minute', captured_at) as m
    from xstock_spot_ticker_snap
   where captured_at >= timestamptz '2026-08-27 00:00+00'
     and captured_at <  timestamptz '2026-09-03 00:00+00'
), tagged as (
  select g.m, (o.m is not null) as observed, (g.m at time zone 'America/New_York') as ny
    from grid g left join obs o on o.m = g.m
), open_min as (
  select * from tagged
   where not (extract(dow from ny) = 6
              or (extract(dow from ny) = 0 and ny::time <  time '20:00')
              or (extract(dow from ny) = 5 and ny::time >= time '20:00'))
)
select case when ny::time >= time '09:30' and ny::time < time '16:00' then 'rth'
            when ny::time >= time '16:00' and ny::time < time '20:00' then 'after_hours'
            when ny::time >= time '04:00' and ny::time < time '09:30' then 'pre_market'
            else 'overnight' end as session,
       count(*)                                as minutes_in_window,
       count(*) filter (where observed)        as minutes_with_ticks,
       count(*) filter (where not observed)    as TOTAL_DARK_minutes,
       round(100.0*count(*) filter (where not observed)/count(*), 2) as pct_dark
  from open_min group by 1 order by 1;
