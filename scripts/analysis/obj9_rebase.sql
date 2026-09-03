-- B-XSTOCK-FEED-SANITY / OBJ-9 RE-BASE (Kyle's option-(D) ruling, 2026-09-03).
-- OBJECT: the age a fresh xStock quote actually reaches at the CURRENT 4 s capture throttle, measured
-- in US REGULAR HOURS only — the same population the 15 s limit was originally derived from at a
-- ~1.8 s throttle (fill-safety-config.ts:19-22), so the comparison is like-for-like.
-- POPULATION: consecutive-frame gaps per symbol, xstock_spot_ticker_snap, 13:30-20:00 UTC, Mon-Fri,
-- 2026-08-20 -> 2026-09-03. The gate compares NOW() - MAX(captured_at), so the frame GAP is the
-- quantity that determines how old the newest row can be when an entry is attempted.
-- ⛔ NO per-session value is produced here and none may be: Kyle's ruling is ONE limit at every hour.
set statement_timeout = 300000;

with g as (
  select symbol,
         extract(epoch from (captured_at - lag(captured_at) over (partition by symbol order by captured_at))) as gap_s
    from xstock_spot_ticker_snap
   where captured_at >= timestamptz '2026-08-20 00:00+00'
     and captured_at <  timestamptz '2026-09-03 00:00+00'
     and captured_at::time >= time '13:30'
     and captured_at::time <  time '20:00'
     and extract(dow from captured_at) between 1 and 5
)
select count(*)                                                                as n_gaps,
       count(distinct symbol)                                                  as symbols,
       round(percentile_cont(0.50)  within group (order by gap_s)::numeric, 2) as p50_s,
       round(percentile_cont(0.90)  within group (order by gap_s)::numeric, 2) as p90_s,
       round(percentile_cont(0.99)  within group (order by gap_s)::numeric, 2) as p99_s,
       round(percentile_cont(0.999) within group (order by gap_s)::numeric, 2) as p999_s,
       round(max(gap_s)::numeric, 1)                                           as max_s,
       round((100.0 * count(*) filter (where gap_s > 15)  / count(*))::numeric, 3) as pct_over_15s,
       round((100.0 * count(*) filter (where gap_s > 20)  / count(*))::numeric, 3) as pct_over_20s,
       round((100.0 * count(*) filter (where gap_s > 30)  / count(*))::numeric, 3) as pct_over_30s
  from g
 where gap_s is not null and gap_s > 0;
