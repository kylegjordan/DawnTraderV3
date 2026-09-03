-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- COHORT COMPOSITION — OUTPUT B, BRACKETED. Folds Langston's biases (2) and (3), 2026-09-03.
--
-- `cohort_composition.sql` output B reported min 3 / p05 5 / p50 6 and I called it "optimistic".
-- ⛔ THAT SIGN CLAIM IS WITHDRAWN: there are THREE biases and they do not point the same way.
--
--  (1) UPWARD — mine, confirmed. `S` conditions on having signalled, which conditions on having
--      had data. Against a sector- or liquidity-keyed peer set, B overstates peer liveness.
--  (2) DOWNWARD — and it was in the SQL, not the framing. `peer_live` left-joined over EVERY
--      overnight minute, but the trigger only ever runs at a minute where a DISPATCH occurred,
--      and those are exactly the minutes when the tape is alive. The reported figure is
--      P(k live in S | ANY overnight minute); the OPERATIONAL quantity is
--      P(k live in S | A DISPATCH OCCURRED THIS MINUTE), almost certainly larger.
--  (3) UPWARD — unnamed by me. `count(op.symbol)` counted THE SUBJECT SYMBOL, which is in `S`
--      and live by construction at any minute it dispatches. **So "p50 6" was at most 5 PEERS**,
--      and at |S| = 9 that is not a rounding detail.
--
-- ⇒ (1) and (2) oppose, neither was measured, so **the sign of the original figure is UNKNOWN.**
--   This file measures (2) and (3) directly — one predicate each — so the true number is
--   BRACKETED rather than argued about.
--
-- OBJECT: for each (overnight minute, subject symbol) at which that subject dispatched, the
--   number of OTHER symbols in `S` live in that same minute. **Self excluded, by name.**
-- POPULATION: overnight minutes 2026-08-27 to 2026-09-02 inclusive inside the 24/5 window in
--   which at least one xStock dispatch occurred. DENOMINATOR: |S|, reported.
--
-- ⚠️ ON LANGSTON'S POINT (4), THE SOURCE-WORDING QUESTION — RESOLVED AT THE REF, NOT ASSERTED.
--   `S` is drawn from `vts_open_trades`. `eval-cycle.ts:1179` `registerOpenVtsTrade` sits
--   UNCONDITIONALLY, with no branch, immediately above `:1185 dispatchXstockActiveSignal`, and
--   `dispatchXstockActiveSignal` has exactly ONE non-test caller — that line. ⇒ every dispatch
--   has a VTS row and every VTS row is followed by a dispatch call, so `S` is COMPLETE for
--   dispatch attempts and "produced an overnight dispatch attempt" is the correct wording.
--   **What a VTS row does NOT establish is that the attempt passed the gates ABOVE the freshness
--   check** — that is the separate denominator limit already carried in the estimand.
--
-- ⛔ THE SAMPLE-MINIMUM LIMIT CARRIES OVER UNREPAIRED: seven consecutive ORDINARY sessions, no
--   holiday, no half-day, no venue incident. Every minimum here is a sample minimum.
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
set statement_timeout = 600000;

with bounds as (
  select timestamptz '2026-08-27 00:00+00' as t0, timestamptz '2026-09-03 00:00+00' as t1
),
pairs as (
  select symbol, date_trunc('minute', captured_at) as m
    from xstock_spot_ticker_snap, bounds
   where captured_at >= bounds.t0 and captured_at < bounds.t1
   group by 1, 2
),
overnight_pairs as (
  select p.symbol, p.m
    from pairs p, lateral (select (p.m at time zone 'America/New_York') as ny) x
   where not (extract(dow from x.ny) = 6
              or (extract(dow from x.ny) = 0 and x.ny::time <  time '20:00')
              or (extract(dow from x.ny) = 5 and x.ny::time >= time '20:00'))
     and not (x.ny::time >= time '04:00' and x.ny::time < time '20:00')
),
-- every overnight DISPATCH, with its symbol and its minute
dispatches as (
  select v.symbol, date_trunc('minute', v.inserted_at) as m
    from vts_open_trades v, bounds
   where v.asset_class = 'xstock_spot'
     and v.inserted_at >= bounds.t0 and v.inserted_at < bounds.t1
     -- the ET overnight band …
     and not ((v.inserted_at at time zone 'America/New_York')::time >= time '04:00'
              and (v.inserted_at at time zone 'America/New_York')::time < time '20:00')
     -- ⛔ … AND the 24/5 window, which this CTE previously OMITTED (Langston, 2026-09-03).
     --    Without it an out-of-window dispatch coalesces to 0 live peers and is scored a
     --    DEGENERATE EVENT rather than excluded from the population. It did not bite on the
     --    first run — and the only thing that told us so was `events_with_zero_peers = 0`,
     --    which was doing double duty as a finding AND as the window-consistency check.
     --    ⇒ the next reader of a non-zero degenerate count must rule out "out of window" FIRST.
     and not (extract(dow from (v.inserted_at at time zone 'America/New_York')) = 6
              or (extract(dow from (v.inserted_at at time zone 'America/New_York')) = 0
                  and (v.inserted_at at time zone 'America/New_York')::time <  time '20:00')
              or (extract(dow from (v.inserted_at at time zone 'America/New_York')) = 5
                  and (v.inserted_at at time zone 'America/New_York')::time >= time '20:00'))
),
sig_symbols as (select distinct symbol from dispatches),
-- (2) conditioned on a DISPATCH MINUTE · (3) SELF EXCLUDED by name
-- ⚠️ EXECUTION SHAPE CHANGED, QUANTITY IDENTICAL: the per-event correlated subquery approached the
--    statement timeout. Pre-aggregate the live-in-S count ONCE per minute, then join and subtract
--    the subject if the subject itself was live that minute. ⛔ The subtraction is CONDITIONAL and
--    must stay so: a symbol can dispatch in a minute WITHOUT having ticked in it — that is the
--    whole staleness case — so an unconditional "minus one" would understate peers exactly on the
--    events the trigger fires for.
s_live_per_min as (
  select op.m, count(*) as live_in_s
    from overnight_pairs op
   where op.symbol in (select symbol from sig_symbols)
   group by op.m
),
peers as (
  select d.symbol as subject, d.m,
         coalesce(l.live_in_s, 0)
           - (case when exists (select 1 from overnight_pairs op
                                 where op.m = d.m and op.symbol = d.symbol)
                   then 1 else 0 end) as live_peers
    from dispatches d
    left join s_live_per_min l on l.m = d.m
)
select 'B2 operational (dispatch minutes, self excluded)' as output,
       count(*)                                                                  as dispatch_events,
       (select count(*) from sig_symbols)                                        as s_size,
       min(live_peers)                                                           as peers_min,
       -- ⛔ p05 REMOVED: at n=17 `percentile_cont(0.05)` interpolates inside the first two
       --    order statistics — it is `min` wearing a percentile's clothes (Langston).
       round(percentile_cont(0.50) within group (order by live_peers)::numeric)   as peers_p50,
       max(live_peers)                                                           as peers_max,
       count(*) filter (where live_peers = 0)                                    as events_with_zero_peers
  from peers;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RESULT — run 2026-09-03. Biases (2) and (3) are now MEASURED, not argued.
--
-- THE OPERATIONAL QUANTITY (dispatch minutes, SELF EXCLUDED — what the trigger actually sees):
--     dispatch events 17  ·  |S| 9  ·  peers min 3  ·  p50 5  ·  max 7
--     events with ZERO live peers: 0
--
-- DECOMPOSITION, both variants on dispatch minutes:
--     with self:     min 4  ·  p50 6  ·  max 8
--     without self:  min 3  ·  p50 5  ·  max 7
--   ⇒ **BIAS (3), self-inclusion, is EXACTLY +1 ACROSS THE BOARD — the subject was live in ALL 17
--     dispatch minutes.** Which stands to reason: a minute in which a symbol produces a signal is
--     usually a minute in which it ticked. Langston's "at most 5 peers" was right to the unit.
--   ⇒ **BIAS (2), conditioning on dispatch minutes, is REAL BUT SMALL: it lifts the FLOOR from 3
--     to 4 and leaves the MEDIAN at 6.** Against the original all-minutes figure (min 3, p50 6).
--   ⇒ **BIAS (1), the upward one from S conditioning on having signalled, REMAINS UNMEASURED** and
--     is not repaired here. It needs a peer set keyed on something other than signalling.
--
-- ⭐ THE NUMBER THAT MATTERS TO THE DESIGN, and it is smaller than the count discussion suggested:
--    **ONLY 17 OVERNIGHT DISPATCH EVENTS IN THE ENTIRE WEEK.** The trigger fires on the order of
--    two or three a night. At every one of them the peer set held between 3 and 7 live names,
--    median 5, and **never zero** — so a peer-set test is viable and never degenerate here.
--
-- ⛔⛔ THE ZERO IS QUANTIFIABLE AND IT BINDS THE DESIGN (Langston, 2026-09-03). Rule of three:
--    0 degenerate events in 17 puts the 95% upper bound on the TRUE degenerate rate at
--    ≈ 3/17 ≈ **18%** — **roughly one degenerate night in six is fully compatible with this
--    evidence.** ⇒ *"a peer-set test is viable and never degenerate here"* IS supported;
--    ⛔ **"it needs no defined behaviour at |peers| = 0" IS NOT. That requirement SURVIVES this
--    measurement** and is a scope input, not a closed question.
--
-- ⚠️ `S` IS POST-HOC — nine symbols drawn from the same week the figures come from. At trigger
--    time it must be A PRIORI. That sits inside bias (1) and is a further reason no sign is
--    claimed for the residual.
--
-- ✅ RE-RUN AFTER THE THREE FIXES BELOW: IDENTICAL — 17 · 9 · min 3 · p50 5 · max 7 · zero
--    degenerate. So the missing 24/5 predicate on `dispatches` did NOT bite, and that is now
--    VERIFIED by the numbers being unchanged rather than INFERRED from the degenerate count.
--
-- ⛔ SAMPLE-MINIMUM LIMIT UNREPAIRED: seven consecutive ORDINARY sessions, no holiday, no
--    half-day, no venue incident. `min 3` and `zero degenerate events` are what those sessions
--    could show, never floors. **And n=17 is a thin operational base in its own right.**
-- ═══════════════════════════════════════════════════════════════════════════════════════════
