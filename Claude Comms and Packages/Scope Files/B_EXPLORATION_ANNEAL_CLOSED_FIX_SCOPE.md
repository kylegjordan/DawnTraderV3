# B-EXPLORATION-ANNEAL-CLOSED-FIX — SCOPE + PRE-AUDIT

change-class: non_architecture

**Owner:** Claude Analyst (CC-C) · Kyle-directed (2026-07-27, scratch list item A4). Crew board: claim id 44. **⚠️ Admission-adjacent — Langston please rule the change-class in review (it corrects a NUMBER feeding the exploration floor; it is a query-correctness fix, NOT a design/formula change, hence non_architecture — but it touches a live admission path, so flagging for your judgment per B-GOV-2).**

## OBJECTIVE (bug-taxonomy bucket 1 — real defect)
`closedExplorationCount` (`exploration-lane.ts:111`) is the anneal driver — it counts INFORMATIVE closed exploration trades, and the anneal tightens the exploration floor as that count rises. It counts `closed_trades` rows with only a `never_filled` exclusion, but **`closed_trades` holds an AT-OPEN row (closed_at NULL) for every position** — so still-open and orphaned exploration rows are counted as if they carried an outcome, tightening the floor prematurely (the exact "exploration winding down too fast" concern, item C5).

## PRE-AUDIT — verified in code + live DB (2026-07-27)
- The anneal's own justification (code comment, P19-B8.5 Langston-approved 2026-07-15): "the subsidy expires as EDGE-evidence accumulates." Edge-evidence = **closed outcomes**. A still-open row has no outcome → must not count.
- Live measurement (`closed_trades`, `admissionBasis='exploration'`): crypto **191 counted** vs **187 with `closed_at IS NOT NULL`**. The 4 extras: the 3 known orphans MET/ETH/AVAX (A5 close-path bug, closed_at never filled) + 1 legitimately-open ONDO (07-27 16:27). The fix correctly excludes all four.
- Isolated: `usedBudgetToday`'s three-term conservation count DELIBERATELY counts opened-today across rtb/open/closed (unchanged — that counter WANTS the full lifecycle). Only the anneal driver needs the `closed_at` filter.

## CHANGE (one-line SQL + test guard; tsc-clean; tests 6/6)
1. `exploration-lane.ts` `closedExplorationCount` — add `AND closed_at IS NOT NULL` to the query; doc comment records why + the measured evidence.
2. `p19-b8-5-exploration-lane.test.ts` — extend the anneal-query mock guard: poison the count if the SQL ever drops `closed_at` (mirrors the existing `never_filled` poison-guard). 6/6 green.

## VERIFICATION
- tsc: no new errors in the 2 files ✅; exploration-lane test 6/6 ✅ (the guard proves the SQL carries the filter).
- **Post-deploy (backend):** re-query `closedExplorationCount`-shape SQL on staging; confirm the crypto anneal count drops to the `closed_at IS NOT NULL` value (~187, minus any that close between now and deploy). No UI surface — this is a counter behind the exploration floor.

## GOVERNANCE
Tier-1 at close: BATCH_CATALOG, PHASE_HISTORY, completion report, PHASE_19_PLAN row. SIM: brief note (anneal driver now requires closed_at). System Manual: a one-line note in the exploration-lane / anneal section (the counting semantics of the anneal driver). No RUNNING_ISSUES entry (scratch-list item). Related: A5 (the orphan close-path that produced 3 of the 4 extras) — separate batch.
