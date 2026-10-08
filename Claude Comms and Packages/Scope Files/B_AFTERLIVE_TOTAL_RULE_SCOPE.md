# B-AFTERLIVE-TOTAL-RULE — SCOPE (Step 1, r1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1x**, after row 1w · **Issue:** `#1180` · **Placed by:** Langston (`B-LEDGER-TAIL-DISPOSITION` Step 4, §13), §9.4 disposition 3.

## 0. WHY
`Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md`'s heading `## After live — 218 after live (+6 moved …)` disagrees with its own theme headings, and nothing re-counts it. **Recounted at `b0efd6f89` by the file's own rule** (`:29`: *"every `- ` line under this heading, less the lines marked ➡️ MOVED to the sprint and the struck-through lines … The theme headings below use the same rule"*), reading every `- ` line between `## After live` and the next `## `:

| theme heading | stated | lines | ➡️ MOVED | struck `~~` | by the rule |
|---|---|---|---|---|---|
| AMR and machine learning | 25 (+6 moved) | 32 | 6 | 1 | 25 ✅ |
| Break-even, trailing and moonbag exits | 6 | 6 | 0 | 0 | 6 ✅ |
| Crew, reviewer, governance and alert tooling | 72 (+3 struck) | 76 | 0 | 3 | **73** ✗ |
| Legacy and dead-code cleanup | 21 | 22 | 0 | 0 | **22** ✗ |
| Other (research, UI, refactors) | 78 | 78 | 0 | 0 | 78 ✅ |
| Perpetual futures | 5 | 6 | 0 | 0 | **6** ✗ |
| Storage, database and production hardening | 14 | 14 | 0 | 0 | 14 ✅ |
| **headline** | **218** | 234 | 6 | 4 | **224** ✗ |
The stated themes sum to 221; the rule gives 224; the headline says 218. Three themes each drifted by +1 (lines added without bumping the heading), and the headline drifted separately. The `:29` line also says *"struck-through lines … (3)"* — there are 4 now (an AMR line at `:56`).

## 1.a ARCHITECTURAL READ
The file is the after-live list (`CLAUDE.md` §9.4: work that waits for live is placed here). Readers: the census (`census.mjs` `parseAfterLive`, placement and owners) — it reads the lines, not the counts; nothing reads or checks the counts. The sprint plan's equivalent, §6, is checked by `recountS6` (`census.mjs:536`) and reported on the census body's (g) line. No trading component; System Manual N/A; SIM: the census table if the census gains a check.

## 1.b PROVENANCE READ
- **The counts — TIER 1.** Introduced with the file (the 2026-09-28 Phase-19 → sprint move, `sort.py`); the counting rule was re-stated 2026-09-30 (`:29`, *"Recounted 2026-09-30: 221 − 6 − 3 = 212"*). Every later edit bumped a number by hand (e.g. `9763073f7` 215 → 217; mine `45a442b0d` 217 → 218). **Disposition (2): relevant, needs updating** — a hand-kept count with no check drifts, the §6 lesson.
- **`recountS6` — TIER 2** (`B-PLAN-CURRENCY-CHECK`, mine): the model for the check — disposition (1).

## 2. OBJECTIVES
| # | objective | check |
|---|---|---|
| **OBJ-1** | The headline and every theme heading state the count the file's rule gives | a recount script at the close commit: 0 mismatches; the `:29` struck count corrected (4) |
| **OBJ-2** | The census checks it from now on | a pure `recountAfterLive(text)` in `census.mjs` (the rule: `- ` lines, less `➡️ MOVED`, less `- ~~` struck) returning per-theme and headline `{stated, recount}`; reported on the census body's (g) line beside the §6 recount (`after-live recount agrees` / `… disagrees: <heading> stated N, rule M`). Tests with a positive control (a planted off-by-one is reported) and the struck/moved exclusions. **Measured on the live file before it ships:** 4 disagreements at `b0efd6f89`, 0 after OBJ-1. |
| **OBJ-3** | No other number in the file is silently changed | the diff touches only the four count cells and the `:29` struck count |

## 3. JUDGEMENT CALLS
1. **Report, not alert** — a disagreement rides the existing weekly census body (g) line, like §6; no new alert key.
2. The rule is read as written (`- ` lines; `➡️ … MOVED`; a line STARTING `- ~~`). A line struck only in part is counted.

## 4. OUT OF SCOPE
The sprint plan's own §6 (already checked); the snapshot counts at the top of the file (`:5`, `:9`, `:13-19` — labelled snapshots of 2026-09-28, not live counts).

## 5. OBSERVATION
None — graded at the close commit; the W42 census reports it.
