-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- COHORT LIVENESS — the design input for `#526` / `B-VENUE-QUIET-ALERTING` (owner CC-B).
--
-- ⛔ THIS REPLACES A NUMBER I HANDED OVER MISLABELLED. I offered "62.7% of tracked books are
--    well-fed off-hours" from `ir_sigma_eligibility.sql`. That query's object is THE ATTEMPTING
--    SYMBOL'S OWN tick count and its denominator is ATTEMPTS — and attempts are not a random
--    sample of symbols, because a symbol only attempts when it produced a signal, which requires
--    recent data. ⇒ attempts OVER-SAMPLE well-fed symbols, so 62.7% is biased in the REASSURING
--    direction for a cohort question. Langston challenged it under rule 29(a) before it was built
--    on. (Withdrawn to CC-B 2026-09-03.)
--
-- THE QUESTION THE COHORT TEST ACTUALLY ASKS: when one symbol goes quiet, how many OTHER tracked
-- symbols are still updating? That is a property of the SYMBOL SET at an INSTANT, not of attempts.
--
-- OBJECT: the number of DISTINCT tracked symbols with at least one tick in a given minute.
-- POPULATION: every minute in 2026-08-20 to 2026-09-02 inclusive that falls inside the 24/5
--             trading window (Sun 20:00 ET -> Fri 20:00 ET). Holidays: none in this span.
-- DENOMINATOR: the tracked symbol set, computed here rather than assumed.
-- ⚠️ APPROXIMATION, STATED: "live in this minute" stands in for "has a tick within the prior 60 s".
--    A minute bin is a fixed grid rather than a trailing window, so it slightly UNDERSTATES
--    liveness at bin edges — the conservative direction for a thin-cohort claim.
-- ⚠️ A regular time grid, NOT attempt instants — that is the whole point of this file.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
set statement_timeout = 600000;

with universe as (
  select count(distinct symbol) as n_tracked
    from xstock_spot_ticker_snap
   where captured_at >= timestamptz '2026-08-20 00:00+00'
     and captured_at <  timestamptz '2026-09-03 00:00+00'
), per_min as (
  select date_trunc('minute', captured_at) as m,
         count(distinct symbol)            as live_symbols
    from xstock_spot_ticker_snap
   where captured_at >= timestamptz '2026-08-20 00:00+00'
     and captured_at <  timestamptz '2026-09-03 00:00+00'
   group by 1
), sessioned as (
  select m, live_symbols,
         (m at time zone 'America/New_York') as ny
    from per_min
), open_min as (
  select *,
         case when ny::time >= time '09:30' and ny::time < time '16:00' then 'rth'
              when ny::time >= time '16:00' and ny::time < time '20:00' then 'after_hours'
              when ny::time >= time '04:00' and ny::time < time '09:30' then 'pre_market'
              else 'overnight' end as session
    from sessioned
   where not (extract(dow from ny) = 6
              or (extract(dow from ny) = 0 and ny::time <  time '20:00')
              or (extract(dow from ny) = 5 and ny::time >= time '20:00'))
)
select o.session,
       count(*)                                                                as minutes,
       u.n_tracked,
       min(o.live_symbols)                                                     as live_min,
       round(percentile_cont(0.10) within group (order by o.live_symbols)::numeric) as live_p10,
       round(percentile_cont(0.50) within group (order by o.live_symbols)::numeric) as live_p50,
       max(o.live_symbols)                                                     as live_max,
       -- the share of the tracked set that is live, at the 10th percentile minute and the median
       round(100.0 * percentile_cont(0.10) within group (order by o.live_symbols)::numeric
             / u.n_tracked, 1)                                                 as pct_live_p10,
       round(100.0 * percentile_cont(0.50) within group (order by o.live_symbols)::numeric
             / u.n_tracked, 1)                                                 as pct_live_p50,
       -- ⛔ the thin-cohort tail the design must handle: minutes with fewer than 20 live symbols
       count(*) filter (where o.live_symbols < 20)                             as minutes_under_20_live
  from open_min o cross join universe u
 group by o.session, u.n_tracked
 order by o.session;
