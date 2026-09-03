-- B-XSTOCK-FEED-SANITY / OBJ-9 — the OTHER half of the re-base read: does restoring the RTH headroom
-- open the off-hours door Kyle has ruled must stay shut?
-- OBJECT: the same consecutive-frame gaps, split by ET session, xstock_spot, 2026-08-20 -> 2026-09-03,
-- weekdays. If both 15 s and a restored ~26 s refuse essentially the same (near-total) share of
-- off-hours frames, then the re-base is an RTH-only correction and does not relax off-hours entry.
set statement_timeout = 300000;

with g as (
  select symbol,
         captured_at,
         case
           when (captured_at at time zone 'America/New_York')::time >= time '09:30'
            and (captured_at at time zone 'America/New_York')::time <  time '16:00' then 'rth'
           when (captured_at at time zone 'America/New_York')::time >= time '16:00'
            and (captured_at at time zone 'America/New_York')::time <  time '20:00' then 'after_hours'
           when (captured_at at time zone 'America/New_York')::time >= time '04:00'
            and (captured_at at time zone 'America/New_York')::time <  time '09:30' then 'pre_market'
           else 'overnight'
         end as session,
         extract(epoch from (captured_at - lag(captured_at) over (partition by symbol order by captured_at))) as gap_s
    from xstock_spot_ticker_snap
   where captured_at >= timestamptz '2026-08-20 00:00+00'
     and captured_at <  timestamptz '2026-09-03 00:00+00'
)
select session,
       count(*)                                                                as n_gaps,
       round(percentile_cont(0.50) within group (order by gap_s)::numeric, 2)  as p50_s,
       round(percentile_cont(0.99) within group (order by gap_s)::numeric, 2)  as p99_s,
       round((100.0 * count(*) filter (where gap_s > 15) / count(*))::numeric, 2) as pct_refused_at_15s,
       round((100.0 * count(*) filter (where gap_s > 26) / count(*))::numeric, 2) as pct_refused_at_26s,
       round((100.0 * count(*) filter (where gap_s > 60) / count(*))::numeric, 2) as pct_refused_at_60s
  from g
 where gap_s is not null and gap_s > 0
 group by session
 order by session;
