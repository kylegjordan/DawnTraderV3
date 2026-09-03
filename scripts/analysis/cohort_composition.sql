-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- COHORT COMPOSITION — the design input that decides `#526`'s thin-cohort branch TRIGGER.
--
-- CC-B's framing, and it is why this is load-bearing rather than interesting: the branch is
-- going in regardless, so this does not decide WHETHER. It decides the TRIGGER.
--   · If the overnight live set is COMPOSITION-STABLE and covers the names that actually signal
--     overnight ⇒ a COUNT threshold is sufficient.
--   · If liveness is CONCENTRATED in the same names ⇒ the trigger must test the PEER SET of the
--     symbol under evaluation rather than the aggregate — a materially different piece of code.
--
-- ⛔ THE LIMIT THAT CARRIES OVER FROM `cohort_liveness.sql` AND IS NOT REPAIRED HERE: this is
--    seven consecutive ORDINARY sessions. No US market holiday, no half-day, no venue incident.
--    Every minimum below is a SAMPLE minimum, never a population floor. **"A state seven ordinary
--    sessions could not have shown me" — never "a state that did not occur".**
--
-- OUTPUT A — CONCENTRATION. OBJECT: per symbol, the share of OVERNIGHT minutes in which that
--   symbol has at least one tick. POPULATION: the 479 tracked symbols × the overnight minutes of
--   2026-08-27 to 2026-09-02 inclusive inside the 24/5 window. **This is the discriminator:
--   concentrated liveness ⇒ a few symbols near 100% and a long tail near 0%; spread liveness ⇒
--   most symbols clustered near the aggregate share.**
--
-- OUTPUT B — COVERAGE, and it is the one that decides the trigger. OBJECT: at each overnight
--   minute, the number of live symbols DRAWN FROM `S` — the set of symbols that actually produced
--   an overnight dispatch attempt in the window. POPULATION: those overnight minutes; DENOMINATOR
--   `|S|`, reported. ⭐ **A cohort of 366 unrelated books is not 366 comparators. Restricting to
--   the names that actually signal overnight is the closest available proxy for a peer set, — ⛔ SEE THE ASSERTED-ABSENCE BANNER BELOW: a grouping DOES exist.**
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- ⛔⛔⛔ READ THIS BEFORE USING `S` FOR ANYTHING: `S` CHARACTERISES THE **ENTRY** LEG ONLY, AND IT
--     IS **DISJOINT** FROM THE EXIT LEG — NOT MERELY IMPERFECT FOR IT (CC-B, 2026-09-03, measured).
--
--     `S` is built from overnight DISPATCH ATTEMPTS, i.e. positions OPENED overnight. The fan-out
--     leg `#526` exists for is the **EXIT-skip alarm**, which fires on any position HELD overnight
--     **whenever it was opened**.
--     ⇒ **MEASURED: none of the five live alert symbols is in `S`.**
--        `S` = BE, BTGO, CRM, MRVL, MSTR, PCG, STRK, STX, XPEV
--        alerts = MDT, NEM, CTVA, LI, RIOT
--     ⇒ **AND THE MECHANISM, from the open times rather than inferred:** MDT opened 09-01 08:40 ET,
--        CTVA 09-02 09:50, NEM 09-02 10:32 — all in regular or extended hours, so they **cannot
--        enter `S` by construction whatever the window**, because `S` requires an overnight OPEN.
--        LI opened 09-02 21:53 ET, genuinely overnight, absent only because it falls just past the
--        window. RIOT was an entry BLOCK and opened no position at all.
--     ⇒ **THE MODAL SHAPE OF THE FAN-OUT LEG — opened in the session, held overnight, exit-checked
--        overnight — IS INVISIBLE TO `S` BY CONSTRUCTION.**
--
--  ⚠️ MY LABEL WAS ACCURATE AND MY FRAMING WAS NOT. I wrote "symbols that actually produced an
--     overnight dispatch attempt", which is exactly what `S` is, and then offered it as *the*
--     peer-set proxy for a design covering BOTH legs. **A correct label does not make a figure
--     transferable, and I did not state what `S` excludes by construction.** I had flagged the
--     proxy as imperfect (limit 1); DISJOINT is a different and stronger fact.
--  ⇒ **These numbers are evidence about the ENTRY leg's peer environment. The EXIT leg's is
--     UNMEASURED. CC-B is measuring it on its own population — positions open during an overnight
--     exit-check — as his batch and his design decision.**
--
-- ⛔⛔ ASSERTED ABSENCE, REFUTED BY ME 2026-09-03 — AND IT REACHED ANOTHER SESSION'S DESIGN.
--    I stated, twice and in writing, that "no sector or liquidity grouping exists to key on
--    today", and used that to justify `S` (symbols that signalled overnight) as the peer-set
--    proxy. **I NEVER SEARCHED FOR ONE.** Langston flagged it as a `#453` risk — an absence that
--    hardens into a fact nobody checked. Searched, and it is false:
--      `xstock_spot_universe`           → `sector`, `crypto_adjacent`, `adr`, `source_chain`
--      `xstock_spot_universe_overrides` → `sector_override`, `crypto_adjacent_override`, …
--    AND IT IS POPULATED, which was the discriminating check (a declared-but-empty grouping
--    would be worse than none): 496 universe rows, 473 live, **sector populated on ALL 496**,
--    15 distinct sectors, 10 `crypto_adjacent`, 27 `adr`.
--  ⇒ **A peer set should key on `sector` and/or `crypto_adjacent`, NOT on who signalled.** Both
--    are A PRIORI, which also dissolves the post-hoc-`S` objection: a curated attribute is known
--    before the trigger fires, where `S` was drawn from the same week as the figures.
--  ⚠️ **I SEARCHED THE CODE FIRST AND THE DB LAST, AND THE ANSWER WAS ONLY EVER IN THE DB** —
--    `shared/asset-classes.ts` even says so in a comment I had read: manual edits are no longer
--    the pattern, add/remove via the DB tables. Corpora searched, on the record: `shared/schema.ts`
--    (market-cap fields only), `shared/asset-classes.ts` (registry loads from DB, no grouping in
--    code), `information_schema` (where it was).
--
--  ✅ **THE EXIT LEG HAS NOW BEEN MEASURED ON ITS OWN POPULATION — CC-B, 2026-09-03, `0bce9ebea`.
--     DO NOT RE-DERIVE IT FROM HERE, AND DO NOT TRANSFER THESE NUMBERS TO IT.**
--     Population: HELD-symbol-minutes — every (symbol, overnight minute) with an xStock position
--     OPEN, so an exit-check runs. n=4,834 · 15 held symbols · 7 sectors. Peers keyed on
--     `xstock_spot_universe.sector`.
--     **RESULT: min 0 · p05 1 · median 33 · max 78. ZERO live sector peers on 79 held-symbol-
--     minutes (1.63%); under three peers on 557 (11.52%).**
--   ⇒ ⛔ **THE TWO LEGS DISAGREE IN THE DIRECTION THAT MATTERS: on the ENTRY leg the peer set is
--     never empty (min 3 over 17 events); on the EXIT leg EMPTY IS ROUTINE.** So the zero-peer
--     fallback is a REQUIRED behaviour for an OBSERVED state, not a guard against a hypothetical
--     — which is where Langston's rule-of-three bound on MY entry data pointed, and the exit
--     measurement turned that bound into an observation.
--   ⇒ **And the entry-derived band does NOT transfer: a threshold of 3 would put 11.5% of
--     exit-check minutes into the thin branch.**
--   ★ **Sector keying is vindicated as the key: median 33 peers against `S`'s 5, with a real tail
--     to zero the design must handle.** That is the grouping I wrongly said did not exist.
--
-- ⛔⛔⛔ THE MINUTE POPULATION EXCLUDES TOTALLY-DARK MINUTES BY CONSTRUCTION, AND THAT BREAKS THE
--     HEADLINE CLAIM. `per_min` GROUPS the tick table, so a minute in which NO symbol ticked has
--     NO ROW and is silently absent. **MEASURED against a generated minute grid, 2026-08-27 to
--     09-02 inside the 24/5 window: overnight has 2,400 minutes and only 2,387 were observed —
--     13 TOTAL-DARK MINUTES (0.54%). RTH, pre-market and after-hours: zero dark.**
--   ⇒ ⛔ **"THE COMPARISON SET NEVER WENT THIN — THE WORST MINUTE HAD 88 LIVE BOOKS" IS WRONG.
--     88 is the minimum AMONG MINUTES IN WHICH AT LEAST ONE SYMBOL TICKED. THE TRUE OVERNIGHT
--     MINIMUM IS ZERO, on 13 minutes.**
--   ★ **FOUND BY APPLYING LANGSTON'S POINT ABOUT CC-B'S DENOMINATOR TO MY OWN** — he noted that a
--     rate derived from live-minutes excludes the total-dark minutes, making it a LOWER BOUND
--     rather than a rate. Same defect, my instrument, one level over.
--   ✅ **THE ENTRY-LEG RESULT IS UNAFFECTED, AND NOW VERIFIED RATHER THAN ASSUMED:** a dispatch in
--     a dark minute would `coalesce` to 0 peers and be COUNTED as a zero-peer event, and
--     `events_with_zero_peers = 0` says none of the 17 fell in one.
--   ⇒ **IT ALSO STRENGTHENS CC-B'S EXIT-LEG FINDING RATHER THAN COMPETING WITH IT: empty is not
--     merely routine on the exit leg, it occurs feed-wide too, and my instrument was blind to it.**
--   Instrument: `scripts/analysis/cohort_dark_minutes.sql`.
--
set statement_timeout = 600000;

with bounds as (
  select timestamptz '2026-08-27 00:00+00' as t0, timestamptz '2026-09-03 00:00+00' as t1
),
-- distinct (symbol, minute) FIRST, then everything else counts over it (the cheap shape)
pairs as (
  select symbol, date_trunc('minute', captured_at) as m
    from xstock_spot_ticker_snap, bounds
   where captured_at >= bounds.t0 and captured_at < bounds.t1
   group by 1, 2
),
tagged as (
  select p.*, (p.m at time zone 'America/New_York') as ny from pairs p
),
overnight_pairs as (
  select symbol, m from tagged
   where not (extract(dow from ny) = 6
              or (extract(dow from ny) = 0 and ny::time <  time '20:00')
              or (extract(dow from ny) = 5 and ny::time >= time '20:00'))
     and not (ny::time >= time '04:00' and ny::time < time '20:00')   -- overnight = 20:00–04:00 ET
),
overnight_minutes as (select distinct m from overnight_pairs),
n_min as (select count(*)::numeric as n from overnight_minutes),
universe as (
  select count(distinct symbol)::numeric as n_tracked
    from xstock_spot_ticker_snap, bounds
   where captured_at >= bounds.t0 and captured_at < bounds.t1
),
-- ── OUTPUT A: per-symbol share of overnight minutes live ──────────────────────────────────────
per_symbol as (
  select symbol, count(*)::numeric as live_minutes from overnight_pairs group by 1
),
shares as (
  select ps.symbol, ps.live_minutes / n_min.n as share from per_symbol ps cross join n_min
),
-- ── S = symbols that ACTUALLY produced an overnight dispatch attempt ──────────────────────────
sig_symbols as (
  select distinct v.symbol
    from vts_open_trades v, bounds
   where v.asset_class = 'xstock_spot'
     and v.inserted_at >= bounds.t0 and v.inserted_at < bounds.t1
     and not ((v.inserted_at at time zone 'America/New_York')::time >= time '04:00'
              and (v.inserted_at at time zone 'America/New_York')::time < time '20:00')
),
-- ── OUTPUT B: live symbols drawn from S, per overnight minute ─────────────────────────────────
peer_live as (
  select om.m, count(op.symbol) as live_in_s
    from overnight_minutes om
    left join overnight_pairs op
      on op.m = om.m and op.symbol in (select symbol from sig_symbols)
   group by om.m
)
select 'A concentration' as output,
       'symbols live in >=90% / 50-90% / 10-50% / <10% of overnight minutes' as detail,
       (select count(*) from shares where share >= 0.90)::text as a,
       (select count(*) from shares where share >= 0.50 and share < 0.90)::text as b,
       (select count(*) from shares where share >= 0.10 and share < 0.50)::text as c,
       (select count(*) from shares where share <  0.10)::text as d,
       (select round(n_tracked) from universe)::text as denom
union all
select 'A share percentiles',
       'p10 / p50 / p90 of the per-symbol overnight live share',
       (select round(percentile_cont(0.10) within group (order by share)::numeric, 3) from shares)::text,
       (select round(percentile_cont(0.50) within group (order by share)::numeric, 3) from shares)::text,
       (select round(percentile_cont(0.90) within group (order by share)::numeric, 3) from shares)::text,
       null, (select round(n) from n_min)::text
union all
select 'B peer-set coverage',
       'live symbols drawn from S, per overnight minute: min / p05 / p50',
       (select min(live_in_s) from peer_live)::text,
       (select round(percentile_cont(0.05) within group (order by live_in_s)::numeric) from peer_live)::text,
       (select round(percentile_cont(0.50) within group (order by live_in_s)::numeric) from peer_live)::text,
       null,
       (select count(*) from sig_symbols)::text
order by 1;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RESULT — run 2026-09-03, against the criterion in the header above, unedited.
--
-- A · CONCENTRATION (479 tracked symbols × 2,387 overnight minutes)
--     live in >=90% of overnight minutes:  51      per-symbol share  p10 0.041
--     live in 50-90%:                      61                        p50 0.144
--     live in 10-50%:                     175                        p90 0.911
--     live in  <10%:                      192
--   ⇒ THE MEDIAN SYMBOL IS LIVE IN 14.4% OF OVERNIGHT MINUTES WHILE THE TOP DECILE IS LIVE 91%,
--     AND 192 OF 479 ARE LIVE IN UNDER A TENTH. **CONCENTRATED, NOT SPREAD.**
--
-- B · PEER-SET COVERAGE — the number that decides the trigger
--     |S| = 9 symbols produced an overnight dispatch attempt in the window
--     live symbols from S per overnight minute:  min 3  ·  p05 5  ·  p50 6
--   ⇒ ⛔⛔ **THE RELEVANT COMPARISON SET AT A TYPICAL OVERNIGHT MINUTE IS SIX, NOT 366.**
--
-- ⭐ THE DECISION: an AGGREGATE count threshold would read ~131 live books, call the feed
--    healthy, and be reasoning from names with nothing to do with the symbol under evaluation.
--    **The trigger must test the PEER SET of the symbol being evaluated.** The measurement chose
--    the harder code path.
--
-- ⛔ AND IT RETIRES A CLAIM OF MINE: "one-against-88 is comfortable" was wrong in exactly the way
--    Langston predicted — **a COUNT is not a COHORT**, and the aggregate hid this completely.
--
-- THREE LIMITS, STATED:
--  1. |S| = 9 IS SMALL and output B rests on those nine. That thinness is itself a finding — very
--     few names signal overnight at all — but a tenth entrant would move B materially.
--  2. S IS A PROXY FOR A PEER SET, NOT A PEER SET. No sector or liquidity grouping exists to key
--     on. If the design keys peers on something else, RE-DERIVE against that grouping.
--  3. ⚠️ **RESTRICTING TO S CONDITIONS ON HAVING PRODUCED A SIGNAL, WHICH CONDITIONS ON THE DATA
--     BEING THERE — the same selection-on-the-outcome-variable that killed the 62.7%, one level
--     down.** ⇒ output B is if anything OPTIMISTIC about peer liveness; the true peer set at a
--     quiet moment may be thinner than 6. It does not change the direction of the conclusion,
--     which is already "test the peer set". Flagged to Langston rather than left to sit.
--  4. Sample minimum, not a floor: seven consecutive ORDINARY sessions, no holiday, no half-day,
--     no venue incident. `min 3` is what seven ordinary sessions could show.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
