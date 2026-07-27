# B-EXPLORATION-ANNEAL-CLOSED-FIX — COMPLETION REPORT

**Owner:** Claude Analyst (CC-C) · Kyle-directed (scratch list A4) · Closed: 2026-07-27 · change-class: **non_architecture** (Langston-ruled)
**Head at Step-4:** `1c63c07da` · CI 4-green (run `30307924933`) · No migration · Deployed with B-EXPLORATION-LANE-MARKER in one window (branch head `1c63c07da`), HTTP 200, engine online.
**Scope:** `Scope Files/B_EXPLORATION_ANNEAL_CLOSED_FIX_SCOPE.md` · **Langston Step-4: APPROVED** (code verified correct, isolation confirmed, test guard sound; change-class **ruled non_architecture** — query-correctness restoring his own 2026-07-15 two-denominator intent, direction is toward *more* exploration).

## Objective (bug-taxonomy bucket 1 — real defect)
`closedExplorationCount` (`exploration-lane.ts:111`, the anneal driver) counted `closed_trades` exploration rows with only the `never_filled` exclusion. But `closed_trades` holds an **at-open row (closed_at NULL) per position**, so still-open + orphaned exploration rows were credited with an outcome, tightening the exploration floor prematurely. The anneal's justification is "subsidy expires as EDGE-evidence accumulates" = *closed* outcomes only.

## Objectives checklist
| # | Verdict | Evidence |
|---|---|---|
| 1 — anneal counts only closed | **YES** | `closedExplorationCount` now carries `AND closed_at IS NOT NULL`. Anneal formula untouched — changed *which rows count*, not the math. |
| 2 — isolation (budget counter untouched) | **YES** | `usedBudgetToday`'s 3-term conservation count keys on `opened_at` and is unchanged (it wants opened-today lifecycle). Only the anneal driver needed the filter. |
| 3 — regression guard | **YES** | Test mock poison-guard extended: fails if the anneal SQL drops `closed_at` (mirrors the `never_filled` guard; budget query routed via `rtb_signals` first so the guard lands on the anneal query only). 6/6 green. |

## Verification
- tsc: no new errors in the 2 files. `p19-b8-5-exploration-lane.test.ts` 6/6 (guard proves the deployed SQL carries the filter).
- **Measured (live staging DB, pre-deploy):** crypto exploration `191` counted vs `187` with `closed_at IS NOT NULL`. The 4 extras = the 3 known orphans MET/ETH/AVAX (A5 close-path) + 1 open ONDO. Fix excludes all four.
- No UI surface (internal anneal counter behind the exploration floor) — verified via CI-green + the test poison-guard + the DB delta; not a §9.3 UI item.

## Review trail
Langston Step-4 APPROVED. Honesty note (his): he took the 191→187 measurement as reported fact (did not re-run the staging query); the fix's correctness does not depend on the exact counts.

## Governance files changed (this close)
BATCH_CATALOG.md · PHASE_HISTORY.md · PHASE_19_PLAN.md (§5 row) · SYSTEM_IMPACT_MAP.md (brief banner: anneal driver `closed_at` requirement + the A2 adapter carry) · this report · scope file · MEMORY_CC_C.md (+ mirror). **SYSTEM_MANUAL.md: N/A** — the exploration lane / anneal is not a System-Manual-documented subsystem (its semantics live in the P19-B8.5 completion report + the `exploration-lane.ts` code comment; a query-correctness fix introduces no architecture the manual covers). **Minor surfaced doc-gap (noted, not scoped):** the exploration lane/anneal admission mechanism is undocumented in the System Manual — a pre-existing gap from P19-B8.5, low priority, would be its own doc pass, not this fix's scope. RUNNING_ISSUES: N/A (scratch-list item).

## Related
A5 (crypto orphan close-path — the source of 3 of the 4 over-counted rows) — separate batch, next.
