-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- COHORT LIVENESS — the design input for `#526` / `B-VENUE-QUIET-ALERTING` (owner CC-B).
--
-- ⛔ THIS REPLACES A NUMBER I HANDED OVER MISLABELLED. I offered "62.7% of tracked books are
--    well-fed off-hours" from `ir_sigma_eligibility.sql`. That query's object is THE ATTEMPTING
--    SYMBOL'S OWN tick count and its denominator is ATTEMPTS. **Attempt-weighting conditions on
--    the symbol having produced a signal, which conditions on the data being there — selection on
--    the outcome variable.** ⇒ attempts OVER-SAMPLE well-fed symbols, so 62.7% is biased in the
--    REASSURING direction for a cohort question, and sizing a thin-cohort branch against it would
--    size against an optimistic number. Langston challenged it under rule 29(a) before it was
--    built on; labelling it was enough to kill it. (Withdrawn to CC-B 2026-09-03.)
--
-- THE QUESTION THE COHORT TEST ACTUALLY ASKS: when one symbol goes quiet, how many OTHER tracked
-- symbols are still updating? That is a property of the SYMBOL SET at an INSTANT, not of attempts.
--
-- OBJECT: the number of DISTINCT tracked symbols with at least one tick in a given minute.
-- POPULATION: every minute in 2026-08-20 to 2026-09-02 inclusive falling inside the 24/5 trading
--             window (Sun 20:00 ET → Fri 20:00 ET). Holidays: none in this span (the
--             Independence-Day-to-Labor-Day gap); the FILTER itself remains holiday-blind.
-- DENOMINATOR: the tracked symbol set, COMPUTED here rather than assumed.
--
-- ⚠️ BUCKET DEFINITION DIFFERS FROM THE WITHDRAWN MEASURE — STATED, NOT SILENT (Langston).
--    `ir_sigma_eligibility.sql` used TWO buckets: `rth` = 09:30–16:00 ET, everything else
--    `off_hours`. This file uses FOUR. **So OUTPUT 2 below reports the identical two-bucket
--    rollup, and that is the one comparable to the withdrawn figure.** Without it the two are not
--    comparable and the withdrawal loses its own control.
--
-- ⚠️ THE MINUTE-BIN APPROXIMATION, AND WHAT IT IS CONSERVATIVE *TOWARD* (Langston: name the
--    direction, because conservative-for-a-ceiling and conservative-for-a-cohort-floor point
--    opposite ways). "Live in this minute" stands in for "has a tick within the prior 60 s". A
--    fixed grid rather than a trailing window UNDERSTATES liveness at bin edges ⇒ it makes the
--    cohort look **THINNER than it is** ⇒ it OVER-STATES the need for a thin-cohort branch.
--    **Conservative toward building the branch, never toward skipping it.**
--
-- ⚠️ A REGULAR TIME GRID, NOT ATTEMPT INSTANTS — that is the entire point of this file.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
set statement_timeout = 600000;

with universe as (
  select count(distinct symbol) as n_tracked
    from xstock_spot_ticker_snap
   where captured_at >= timestamptz '2026-08-27 00:00+00'
     and captured_at <  timestamptz '2026-09-03 00:00+00'
), pairs as (
  -- two-step aggregation: distinct (symbol, minute) FIRST, then count per minute. Identical
  -- quantity to count(distinct symbol) per minute, without a sort inside every group.
  select symbol, date_trunc('minute', captured_at) as m
    from xstock_spot_ticker_snap
   where captured_at >= timestamptz '2026-08-27 00:00+00'
     and captured_at <  timestamptz '2026-09-03 00:00+00'
   group by 1, 2
), per_min as (
  select m, count(*) as live_symbols from pairs group by 1
), sessioned as (
  select m, live_symbols, (m at time zone 'America/New_York') as ny from per_min
), open_min as (
  select *,
         case when ny::time >= time '09:30' and ny::time < time '16:00' then 'rth'
              when ny::time >= time '16:00' and ny::time < time '20:00' then 'after_hours'
              when ny::time >= time '04:00' and ny::time < time '09:30' then 'pre_market'
              else 'overnight' end as session4,
         case when ny::time >= time '09:30' and ny::time < time '16:00' then 'rth'
              else 'off_hours' end as session2
    from sessioned
   where not (extract(dow from ny) = 6
              or (extract(dow from ny) = 0 and ny::time <  time '20:00')
              or (extract(dow from ny) = 5 and ny::time >= time '20:00'))
)
-- ⛔ THE TAIL AS A POSITIVE STATEMENT, NOT AN ABSENCE. `minutes_under_20_live = 0` is a ZERO, and
-- rule 29(b) will not take a zero on trust. The MINIMUM and the low percentiles say the same thing
-- as a measured value that cannot be produced by a dead counter.
select o.session4,
       count(*)                                                                    as minutes,
       max(u.n_tracked)                                                            as n_tracked,
       min(o.live_symbols)                                                         as live_min,
       round(percentile_cont(0.01) within group (order by o.live_symbols)::numeric) as live_p01,
       round(percentile_cont(0.05) within group (order by o.live_symbols)::numeric) as live_p05,
       round(percentile_cont(0.50) within group (order by o.live_symbols)::numeric) as live_p50,
       round(100.0 * min(o.live_symbols) / max(u.n_tracked), 1)                    as pct_live_at_min
  from open_min o cross join universe u
 group by o.session4 order by live_min;
