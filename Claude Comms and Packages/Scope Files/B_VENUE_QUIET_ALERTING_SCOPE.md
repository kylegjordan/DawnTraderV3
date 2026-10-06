# B-VENUE-QUIET-ALERTING — SCOPE (Step 1, r1a)

change-class: non_architecture

**Issues:** `#526` + Kyle's `#994` (folded by Langston 2026-09-03) · proposed fold-in `#638` (row 166a) · **Plan row:** `SPRINT_TO_LIVE_PLAN` 3a1, **paired with 3a `B-FEED-HEALTH-GRADE-ARM`**, both moved up behind 2a0b (Kyle 2026-10-06: *"take it and pair it with row 3a"*) · **Owner:** CC-B · **Card:** `PVTI_lAHODmulEM4BfQP4zg-_ZdI`
**The design record this scope builds on — read it, it is not repeated here:** `PHASE_19_PLAN.md` row 3b.f-d (Langston + CC-B, 2026-09-03) and `B_XSTOCK_FEED_SANITY_COMPLETION_REPORT.md` §2d/§2f.

## 0. The decision being implemented (Kyle, 2026-09-03, `#994`, verbatim)
*"xStocks will not be as fresh in off hours when the underlying stocks are not trading during regular US hours… our system is designed to protect us from exiting on bad data. So I don't think that should be an alert… If the data is stale because there's an issue with our system, that's different."* Same day: the freshness standard does **not** loosen. ⇒ **Alert economics only — nothing about when we trade or how fresh a mark must be.**

## 1. What happens today (measured 2026-10-06)
1. **The rail and its alert:** `_recordPriceSkip` (`active-execution-engine.ts:~805-845`) counts consecutive untrusted ticks per position; at `exit_integrity / max_consecutive_price_skips` (40, both classes, seeded and prefetched) it raises a `breakage`/`warning` system alert, dedupe `price-skip-<mode>-<symbol>`, titled *"Exit checks skipped — mark older than ceiling"* for the staleness branch.
2. **It fires on the market closing.** 2026-10-06: 15 of these in the first hour after the 16:00 ET close, with 19 xStock positions held after the 15:53Z reset; per-symbol ticker updates fell 3-4× on mid-size names (ALB ~660 → ~190/h; CAG ~800 → ~200/h) while large names barely thinned (NVDA ~890 → ~775/h). Before today: 2 since 09-22 (few xStocks were held into after-hours). All-time (Infra, 09-03): **177 of 178 fired outside US regular hours**.
3. **It never clears — `#638`.** The streak resets on the first venue price (`:2411`, `_priceSkipStreak.delete`) and resolves nothing, so the row stays active until a human resolves it, and an unresolved row blocks the same key's next mint.
4. **A hard-coded fallback on a DB-governed setting:** `let threshold = 40; // fail-safe default if the knob is cold` (`:~816`). The module is prefetched and seeded, so the branch is reached only if a per-class row goes missing — but it is the silent-substitution shape Kyle has ruled out.
5. **Provenance (TIER 1):** the rail is `P19-B8.5` (venue-only pricing, Langston condition 1: *"skipping a tick when the venue quotes nothing is correct… must not fail silently"*); the staleness-vs-absence copy split is 2026-07-22 (Analyst + Langston); the per-symbol ceiling is `P19-B8.5e` (`#548`). **Disposition (2): relevant, needs updating to today's intent** — the rail stays; its DELIVERY changes (`#994`), and it gains a clear path (`#638`).

## 2. Objectives
1. **Keep the emit, cut the page for a quiet market** (`#994`; Langston's binding constraint 1 — *"what changes is DELIVERY, not emission"*). The per-position skip record and its log line stay. When a position's staleness is the MARKET (its cohort is quiet too), it does **not** raise a `breakage` alert; it is counted into ONE standing per-class *"xStock venue quiet"* record per quiet window (count of positions skipping, oldest mark age, skip rate beside its budget), which RESOLVES itself when the venue resumes.
2. **Still page when it is US** — a symbol stale while its cohort keeps ticking (a lost subscription, a stuck book). **The discriminator is the COHORT comparison designed in 3b.f-d** (the other symbols on the same socket are the control: a quiet market slows the universe together; our fault stalls this symbol while the rest tick), plus row 3a's feed-level grade for the whole-feed case. **The thin-cohort branch is a live path** (3b.f-d: overnight minimum 88 of 479, a sample minimum over ordinary sessions only) — Step 2 states what happens when the comparison set is thin, and **the default when it cannot tell is to page**, not to stay quiet.
3. **Escalate a position that stays unpriceable into liquid hours** (3b.f-d option 3) — the genuinely alarming case; the session boundary read from the session table, not the `is_extended_hours` flag (3b.f-d / System Manual).
4. **Clear what it raises** (`#638` folded in, proposed): when the streak resets on a venue price, resolve that position's `price-skip-*` alert (lifecycle `resolve`, **never `ack`** — Langston constraint 2, `#982`).
5. **Remove the hard-coded threshold fallback** — an unreadable knob raises its own config alert and fails toward escalating, never toward a silent 40.
6. **The entry leg is decided explicitly, not swept in** (3b.f-d): `xstock-stale-fill-block` (one global key, an ENTRY refused, already self-batching) — stays out unless Step 2 shows its trigger and resolve condition match.
*Verify (all):* unit tests for each branch (quiet market ⇒ no breakage row, the standing record updates and resolves; one stale symbol among a ticking cohort ⇒ breakage row; thin cohort ⇒ breakage row; streak reset ⇒ the row resolves; cold knob ⇒ config alert); on staging, the next US close with xStocks held shows ZERO `price-skip-*` breakage rows for quiet names, one standing quiet record that resolves at the open, and the per-position skip log intact.

## 3. Depends on
Row 3a armed (the feed-level grade) — the whole-feed failure must still page before the per-symbol page is narrowed.

## 4. Out of scope
The freshness standard, the ceilings, entries, exits, any trading behaviour (Kyle, 09-03). `#572` (alert-body semantics drift) — adjacent, folds in only if the standing record re-renders a long-lived row's body (3b.f-d condition 4).

## 5. Questions for Langston (Step 1)
1. Fold `#638` (row 166a) here — it is the same alert's clear path.
2. Objective 2's default-to-page when the cohort cannot discriminate.
3. Objective 5 — remove the 40 default in this batch (it is the same function).

## 6. Added while at Step 1 (r1a, 2026-10-07 — §9.4 disposition 2, items added to this batch; Langston's triage of the 2026-10-06 after-hours rows)
1. **ALERT-REACH GAP — the longest staleness is the least reported.** `_recordPriceSkip` mints on strict `streak === threshold`, so one unbroken streak alerts exactly once, and a resolved row re-arms only on a NEW streak. Measured by Langston 2026-10-06: `HUT/USD`'s position row last stamped 20:48:32Z, its only two mints (20:16Z, 20:17Z) both resolved, nothing since while the mark stayed stale — 2 h 46 m, zero rows. ⇒ **Objective 1's standing per-class record must carry each skipping position's current staleness (not only a count), and objective 3's escalation fires on DURATION, not on the count crossing the threshold once.** *Verify:* a unit test where one streak runs far past the threshold with its row resolved mid-streak still surfaces in the standing record and escalates on duration.
2. **HYPOTHESIS, labelled (rule 29(c), not measured): the ceiling may amplify the volume.** PDD's stated ceiling moved 128 s → 78 s between the 21:54Z and 23:08Z rows. If the σ-derived ceiling (`P19-B8.5e`, `#548`) tightens as the quiet-hours sample narrows, the ceiling itself raises the mint rate. **Step 2 reads the ceiling's input window before any notify cut is sized** — and if it is so, it is a finding for the ceiling's owner, not a threshold change here (the freshness standard does not move, Kyle 09-03).
3. **Re-dispatching a resolved row is notify churn.** `price-skip-paper-PDD/USD` minted 7 times on 2026-10-06 and a row Langston had already resolved (`d5f259c9`, 21:59Z) was dispatched again. Step 2 traces where a resolved row is re-routed and whether the standing record removes it.
4. **Recorded rulings (Langston, row 3a Step-1 r1, 2026-10-07):** `#638` folds here (Ask 3 APPROVED). **Class fix:** before this batch closes, grep for every `getActive*AlertId()` recovery predicate whose setter is only ever called with null, and state what the grep returned (row 3a removes the feed-health one).
5. **Constraints that travel with it (Langston, 2026-10-06):** keep the EMIT, cut only the NOTIFY; do not ack these rows while this batch is in flight (an acked same-key row blocks every future occurrence, `system-alerts.ts` dedupe on non-resolved state); the exit freshness standard is unchanged round the clock.
