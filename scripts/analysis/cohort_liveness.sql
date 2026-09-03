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
-- ⛔⛔ TWO LIMITS ON THE *CONCLUSION*, NOT ON THE MEASUREMENT (Langston, 2026-09-03 — folded in
--    the same turn, and the first one corrects a sentence I had already sent to CC-B).
--
--  (1) THE MINIMUM IS A *SAMPLE* MINIMUM, NEVER A POPULATION FLOOR. The 14→7-day narrowing is
--      "the same quantity by construction" for the AGGREGATION and NOT for the WINDOW. Seven
--      consecutive ordinary sessions contain no US market holiday, no half-day and no venue
--      incident — exactly the states that would produce a genuinely thin cohort. If the thin
--      state recurs monthly-or-rarer the window holds ZERO EXPECTED OCCURRENCES and the minimum
--      is unreadable as a floor (`#661` leg 2: window span against the phenomenon's period).
--      ⇒ ⛔ **WRITE IT AS "a state seven ordinary sessions could not have shown me", NEVER as
--        "a state that did not occur".** The second is a claim about the world; only the first
--        is a claim this sample can support.
--
--  (2) ⭐ THIS IS A *COUNT*, NOT A *COHORT*, AND THE DIFFERENCE IS THE WHOLE DESIGN QUESTION.
--      One-against-N is comfortable only if those N are usable COMPARATORS for the symbol under
--      test. If overnight liveness is CONCENTRATED — the same names live every night — a symbol
--      signalling at 03:00 while its own peer set is dark has an effective cohort far below the
--      aggregate, and this instrument cannot see that. **Composition-stability of the overnight
--      live set, and its overlap with the symbols that actually produce overnight signals, is
--      UNMEASURED — stated as unmeasured, assumed in neither direction.** A cohort SIZE does not
--      establish cohort RELEVANCE (`#596` shape).
--      ⇒ **CC-B's thin-cohort branch STAYS IN until the population question is settled.**
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
-- ═══ OUTPUT 0 — POSITIVE CONTROL, and it MUST be read before any tail number (rule 29(b)) ═══
-- A known-live minute: 2026-09-02 14:00 UTC = 10:00 ET on a WEDNESDAY, mid-session, when the
-- feed is unambiguously delivering. ⛔ IT CAN FAIL, which is the point: if the timezone
-- conversion or the 24/5 filter is wrong, this row comes back in the WRONG session bucket, or
-- with a near-zero count, or absent entirely — and any thin-tail number below would then be an
-- artefact of the filter rather than an observation of the feed.
-- EXPECT: session4 = 'rth', session2 = 'rth', live_symbols in the hundreds, present = true.
select 'CONTROL' as output,
       m::text            as bucket,
       session4,
       session2,
       live_symbols::text as live_p50,
       null::text         as pct_live_p50,
       null::text         as minutes_under_20_live
  from open_min
 where m = timestamptz '2026-09-02 14:00+00'

union all
-- ═══ OUTPUT 1 — the four-bucket view ═══
select 'BY SESSION (4)', o.session4, null, null,
       round(percentile_cont(0.50) within group (order by o.live_symbols)::numeric)::text,
       round(100.0 * percentile_cont(0.50) within group (order by o.live_symbols)::numeric
             / max(u.n_tracked), 1)::text,
       count(*) filter (where o.live_symbols < 20)::text
  from open_min o cross join universe u
 group by o.session4

union all
-- ═══ OUTPUT 2 — the TWO-bucket rollup, identical to the withdrawn measure's definition ═══
--     This is the row that is comparable to the 62.7% figure it replaces.
select 'BY SESSION (2, comparable)', o.session2, null, null,
       round(percentile_cont(0.50) within group (order by o.live_symbols)::numeric)::text,
       round(100.0 * percentile_cont(0.50) within group (order by o.live_symbols)::numeric
             / max(u.n_tracked), 1)::text,
       count(*) filter (where o.live_symbols < 20)::text
  from open_min o cross join universe u
 group by o.session2

union all
select 'UNIVERSE', 'tracked symbols', null, null, u.n_tracked::text, null, null
  from universe u
 order by 1, 2;
