-- B-XSTOCK-FEED-SANITY / OBJ-9 — THE DECISION-RELEVANT QUANTITY, and the frame-count view is the WRONG OBJECT.
-- The gate compares NOW() - MAX(captured_at) at the instant an entry is attempted. An entry attempt lands
-- at a uniformly-random moment, so what matters is the share of TIME the newest row is older than the limit
-- — NOT the share of GAPS longer than it. Long gaps occupy disproportionate time (length-biased sampling):
-- a session whose gaps are 27% over-15s can still spend the large majority of its clock inside those gaps.
-- Per gap of length g, the time spent with staleness > L is max(0, g - L). Summed over gaps and divided by
-- total elapsed time, that is exactly the probability a uniformly-timed entry attempt is refused.
set statement_timeout = 300000;

with g as (
  select case
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
       count(*)                                                                       as n_gaps,
       round(sum(gap_s)::numeric / 3600, 0)                                           as symbol_hours,
       round((100.0 * sum(greatest(gap_s - 15, 0)) / sum(gap_s))::numeric, 1)         as pct_time_stale_over_15s,
       round((100.0 * sum(greatest(gap_s - 26, 0)) / sum(gap_s))::numeric, 1)         as pct_time_stale_over_26s,
       round((100.0 * sum(greatest(gap_s - 60, 0)) / sum(gap_s))::numeric, 1)         as pct_time_stale_over_60s,
       round((100.0 * sum(greatest(gap_s - 300, 0)) / sum(gap_s))::numeric, 1)        as pct_time_stale_over_300s
  from g
 -- gaps beyond 6h are session/weekend boundaries, not quoting behaviour: excluded, and the exclusion is stated.
 where gap_s is not null and gap_s > 0 and gap_s <= 21600
 group by session
 order by session;
