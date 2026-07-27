# B-EXPLORATION-ANNEAL-CLOSED-FIX — PRE-AUDIT (Step 2)

change-class: non_architecture
**Owner:** Claude Analyst (CC-C) · Scope: `B_EXPLORATION_ANNEAL_CLOSED_FIX_SCOPE.md` (which also carried this analysis inline; split into this file per the workflow's Step-1/Step-2 doc convention).

## SIM / System Manual consultation
- **SIM:** `server/services/execution/exploration-lane.ts` is a signal-admission-adjacent component. The anneal driver `closedExplorationCount` feeds the exploration floor. This change narrows ONE read query — no added/removed component, no cross-cutting runtime-state change. (SIM banner added at close.)
- **System Manual:** the exploration lane / anneal is **not** a System-Manual-documented subsystem (pre-existing gap from P19-B8.5; the anneal semantics live in the P19-B8.5 completion report + the code comment). No architecture/strategy/regime/filter/signal-pipeline/math change — a query-correctness fix. N/A, and the gap is noted (not scoped) in the completion report.

## Component census (§9.5 — who reads/writes the affected state)
- **`closedExplorationCount` (`exploration-lane.ts:111`)** — the anneal driver. Reads `closed_trades` WHERE `admissionBasis='exploration'` with only a `never_filled` exclusion. THE change site.
- **`usedBudgetToday` (`:80`)** — the SEPARATE daily-budget conservation counter. Reads rtb_signals + active_open_positions + closed_trades keyed on `opened_at`. **UNCHANGED** — it deliberately wants the full opened-today lifecycle, not outcomes. No collision.
- **Writers of `closed_trades.closed_at`** — the close/exit paths finalize it on close; `createClosedTrade` writes the row AT OPEN with `closed_at NULL`. ⇒ `closed_trades` holds an at-open row per position, so the unfiltered anneal read credits still-open + orphaned exploration rows with an outcome.
- **Consumers of the anneal count** — the exploration floor `baseFloor + stepPct·floor(closed/stepTrades)`. A too-high count over-tightens the floor prematurely (the "exploration winding down too fast" concern).

## Blast radius
Single-line SQL narrowing (`AND closed_at IS NOT NULL`) on ONE query + a test poison-guard. `usedBudgetToday` untouched. No schema/migration, no client surface, no decision-formula change. tsc-clean; `p19-b8-5-exploration-lane.test.ts` 6/6.

## Live verification (staging DB, pre-deploy)
crypto exploration: **191** counted vs **187** with `closed_at IS NOT NULL`; the 4 extras = the 3 orphans MET/ETH/AVAX + 1 open ONDO. The fix excludes all four.
