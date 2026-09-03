-- B-XSTOCK-FEED-SANITY / OBJ-9 — RE-DERIVATION after a fresh reader refuted the
-- "widening the threshold buys almost nothing" reading of obj9_timeweighted.sql.
--
-- TWO DEFECTS IT NAMED IN THE EARLIER INSTRUMENT, BOTH REAL:
--   (a) CALENDAR CONTAMINATION. obj9_timeweighted.sql buckets purely on NY time-of-day and
--       never excludes the weekend, so a Saturday 10:00 lands in 'rth'. xStocks trade 24/5
--       (Sun 20:00 ET -> Fri 20:00 ET), so the closed weekend was being counted as staleness.
--   (b) DURATION-WEIGHTING ANSWERS THE WRONG QUESTION. sum(max(0,gap-L))/sum(gap) is
--       P(stale | uniformly random INSTANT). A gate experiences P(refused | an ATTEMPT), which
--       is EVENT-weighted. The duration estimator is mechanically dominated by the longest
--       gaps, so "long gaps dominate the numerator" is close to guaranteed and says little
--       about refusals. The COUNT columns below are the event-side view.
--
-- OPEN-WINDOW PREDICATE: both ends of a gap must sit inside the 24/5 trading window, so a
-- weekend- or session-spanning gap is dropped rather than charged to whichever bucket it ended in.
set statement_timeout = 600000;

with r as (
  select symbol,
         captured_at,
         (captured_at at time zone 'America/New_York')                        as ny,
         lag(captured_at) over (partition by symbol order by captured_at)     as prev
    from xstock_spot_ticker_snap
   where captured_at >= timestamptz '2026-08-20 00:00+00'
     and captured_at <  timestamptz '2026-09-03 00:00+00'
), o as (
  select r.*,
         (lag(captured_at) over (partition by symbol order by captured_at)) is not null as has_prev,
         (prev at time zone 'America/New_York')                              as ny_prev
    from r
), f as (
  select symbol, ny, ny_prev,
         extract(epoch from (ny - ny_prev)) as gap_s,
         case when ny::time >= time '09:30' and ny::time < time '16:00' then 'rth'
              when ny::time >= time '16:00' and ny::time < time '20:00' then 'after_hours'
              when ny::time >= time '04:00' and ny::time < time '09:30' then 'pre_market'
              else 'overnight' end as session
    from o
   where ny_prev is not null
     -- both ends inside the 24/5 window
     and not (extract(dow from ny)      = 6
              or (extract(dow from ny)      = 0 and ny::time      <  time '20:00')
              or (extract(dow from ny)      = 5 and ny::time      >= time '20:00'))
     and not (extract(dow from ny_prev) = 6
              or (extract(dow from ny_prev) = 0 and ny_prev::time <  time '20:00')
              or (extract(dow from ny_prev) = 5 and ny_prev::time >= time '20:00'))
)
select session,
       count(*)                                                              as n_gaps,
       round(sum(gap_s)::numeric/3600, 0)                                    as symbol_hours,
       -- EVENT view: how many individual stale episodes each threshold removes
       count(*) filter (where gap_s > 15)                                    as n_over_15,
       count(*) filter (where gap_s > 26)                                    as n_over_26,
       count(*) filter (where gap_s > 60)                                    as n_over_60,
       count(*) filter (where gap_s > 300)                                   as n_over_300,
       round((100.0*count(*) filter (where gap_s > 15)/count(*))::numeric,3) as pct_gaps_over_15,
       -- DURATION view, recomputed on the cleaned population
       round((100.0*sum(greatest(gap_s- 15,0))/sum(gap_s))::numeric,1)       as t_over_15,
       round((100.0*sum(greatest(gap_s- 26,0))/sum(gap_s))::numeric,1)       as t_over_26,
       round((100.0*sum(greatest(gap_s- 60,0))/sum(gap_s))::numeric,1)       as t_over_60,
       round((100.0*sum(greatest(gap_s-300,0))/sum(gap_s))::numeric,1)       as t_over_300
  from f
 where gap_s > 0
 group by session order by session;
