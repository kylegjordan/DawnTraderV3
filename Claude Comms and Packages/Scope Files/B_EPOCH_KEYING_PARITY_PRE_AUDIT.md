# B-EPOCH-KEYING-PARITY — PRE-IMPLEMENTATION AUDIT + IMPLEMENTATION PLAN

> **Owner:** Claude Analyst (CC-C) · **change-class: non_architecture** · **Deployed `30808c6c0`**
> ⛔ **WRITTEN AFTER IMPLEMENTATION, 2026-08-24.** The governance checker raised
> `Missing required governance doc: pre_audit` and it was **correct**. Recorded, not backdated.

---

## 1. THE AUDIT THAT DID HAPPEN, AND IT IS THE CENSUS THE PREVIOUS BATCH SKIPPED

This batch exists **because `B-OBSERVATION-EPOCH` never ran a consumer census.** So the first thing done
here was that census, run properly — and it is what the pre-audit for the earlier batch should have been.

**CENSUS QUESTION (§9.5(a)): who READS an observation epoch, or resolves a scoring window?**
Repo-wide, tests excluded. **FOUR consumers, not one:**

| # | reader | keying it used | correct? |
|---|---|---|---|
| 1 | `computeRollingEarnings` — `dashboard-metrics.ts` | both-leg | ✅ |
| 2 | `getLifetimeScoreboard` — `storage.ts` (SQL) | `closed_at` only | ❌ |
| 3 | `/active-engine/trades/analytics` window filter — `routes.ts` | none at all | ❌ |
| 4 | the same route's empty-window early return | none, over the **FULL** valid set | ❌ |

**MEASURED AGAINST THE LIVE SYSTEM before writing code** — three figures on ONE card at ONE moment
(2026-08-24T10:26Z): Earnings **−$4.91 / 6** · Lifetime **+$5.76 / 13** · win rate **66.7% / 9**.
**Re-derived independently in SQL** against the live epoch: close-keyed **13 / +5.76**, both-leg
**6 / −4.91**, all-time **534 / −68.35**. ⇒ **the readers disagree IN SIGN.**

## 2. ⛔ THE ROOT CAUSE IS A PLACEMENT, NOT A MISSING CLAUSE

Reader 3 had no epoch term **because the value did not exist at that line.** `getLifetimeScoreboard` was
called **~180 lines below** the window filter, next to the lifetime block. ⇒ **the fix is to move the
resolution ABOVE the filter, not to add a second resolution beside it** — a second call is a second
thing that can disagree.

## 3. WHY THE FOUR EXISTING TESTS COULD NOT HAVE CAUGHT THIS

`B-OBSERVATION-EPOCH` pinned both-leg keying with **four passing tests.** They all still passed while the
card showed three answers. **They tested the FUNCTION; the defect was in the PARITY between readers.**
⇒ **"we tested it" is not evidence when the rule has copies.** The design consequence: the predicate must
have **ONE HOME**, exported, with a test that asserts agreement **across implementations**.

## 4. BLAST RADIUS

**Display readers only.** No order path, no sizing, no gate, no schema change. The numbers shown to Kyle
change — **and they get WORSE, which is the correct direction**: win rate 66.7% → 50.0%, Avg Net R
1.81R → −0.25R, Profit Factor 2.51 → 0.78, because the straddlers' ghost-book entries were flattering
the record.

⚠️ **ONE COST INTRODUCED KNOWINGLY:** resolving the epoch above the filter means `getLifetimeScoreboard`
is now called on **every** request to that route, including the zero-trade early return. **Necessary —
the branch cannot scope without the value — but it is a real added query on a hot endpoint**, stated
rather than discovered later.

## 5. SIM / SYSTEM MANUAL — BOTH JUDGED NOT APPLICABLE, OUT LOUD

**SIM:** no component added, removed or re-keyed; the shared predicate lives inside an existing module.
**SYSTEM MANUAL:** display-reader keying is not architecture, strategy logic, regime, filter, pipeline or
math. **Judged explicitly per the §9 anti-pattern, not skipped by default.**

## 6. ⚠️ WHAT THIS AUDIT STILL MISSED — LANGSTON FOUND IT AT STEP-4

**The census in §1 enumerated readers of the RULE. It never asked how many resolutions of the VALUE exist.**
Langston measured it: the SQL keys on the **explicit `module_constants` row only**, while every TS reader
takes `explicit ?? first_trade` (`storage.ts:3455`). **Remove the explicit row and SQL admits 534 while the
TS predicate admits 530 — a 4-row, 0.75% divergence.** Inert today, pre-dates this batch — **but this
batch propagated it from one reader to three.** Filed `#901`.

★ **AND THE FENCE THIS BATCH SHIPPED IS NECESSARY BUT NOT SUFFICIENT, for the same reason:** it asserts
parity between a function and its own caller, **both TypeScript**, while reader 2 is a second
implementation **in SQL with no test at all.** Filed `#900`; the sufficient shape already exists at
`b-phantom-fill-reconstruct-fence.test.ts:147` (row-by-row SQL↔JS).
⇒ **THE PATTERN, twice in two batches: a census is only as good as the QUESTION it asks.** The first
batch asked none; this one asked about the rule and not the value.
