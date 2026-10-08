# B-AFTERLIVE-TOTAL-RULE — SCOPE (Step 1, r2 — r1 `299305f57` SENT BACK by Langston 2026-10-08: two blockers, conditions; folded below)

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
The stated themes sum to 221; the rule gives 224; the headline says 218. **And a SIXTH wrong cell (Langston BLOCKER-2):** `:5` reads *"After live: 212"* — a count under the same rule, not a labelled snapshot (the `(snapshot 2026-09-28)` label attaches to the sprint's 198, and `:9`'s SNAPSHOT paragraph names only that population). Langston re-derived the recount at `b0efd6f89` cell for cell (block `:27-286`; 0 indented bullets, 0 partial strikes, 0 misclassified MOVED lines). Three themes each drifted by +1 (lines added without bumping the heading), and the headline drifted separately. The `:29` line also says *"struck-through lines … (3)"* — there are 4 now (an AMR line at `:56`).

## 1.a ARCHITECTURAL READ
The file is the after-live list (`CLAUDE.md` §9.4: work that waits for live is placed here). Readers: the census (`census.mjs` `parseAfterLive`, placement and owners) — it reads the lines, not the counts; nothing reads or checks the counts. The sprint plan's equivalent, §6, is checked by `recountS6` (`census.mjs:536`), reported on the census body's (g) line and with an alert decision (`s6AlertDecision` `:557`); the census body is itself an alert row (owner CC-A, do-not-ack, week-keyed dedupe). ⛔ **The body has no room (Langston BLOCKER-1, measured):** `CENSUS_BODY_MAX = 1000` (`config.mjs:396`); the P45 maximum-size fixture already makes a 992-character body, and adding a 28-character clause made `censusAlert` throw (*"the body is over 1000 characters with every example dropped — refusing"*, `census.mjs:736`) — killing the whole weekly census. The counts are never dropped (`:733`). No trading component; System Manual N/A; SIM: the census table if the census gains a check.

## 1.b PROVENANCE READ
- **The counts — TIER 1.** Introduced with the file (the 2026-09-28 Phase-19 → sprint move, `sort.py`); the counting rule was re-stated 2026-09-30 (`:29`, *"Recounted 2026-09-30: 221 − 6 − 3 = 212"*). Every later edit bumped a number by hand (e.g. `9763073f7` 215 → 217; mine `45a442b0d` 217 → 218). **Disposition (2): relevant, needs updating** — a hand-kept count with no check drifts, the §6 lesson.
- **`recountS6` — TIER 2** (`B-PLAN-CURRENCY-CHECK`, mine): the model for the check — disposition (1).

## 2. OBJECTIVES
| # | objective | check |
|---|---|---|
| **OBJ-1** | Every count in the file states what the file's rule gives: the headline, the seven theme headings, **and `:5`'s "After live"**; the `:29` struck count (4); and the theme parentheticals made consistent — each names its excluded lines where there are any (`(+6 moved to the sprint, +1 struck through)` on AMR, as Crew already does) | **proved by OBJ-2's own `recountAfterLive`** run on the file at the close commit (one implementation of the rule — Langston: two would be the `#641` class): 0 disagreements |
| **OBJ-2** | The census checks it from now on | a pure `recountAfterLive(text)` in `census.mjs`: the rule as written (`- ` lines between `## After live` and the next `## `; less `➡️ … MOVED`; less lines STARTING `- ~~`; MOVED and struck mutually exclusive, so a line that is both is subtracted once), returning per-theme and headline (and `:5`) `{stated, recount}` plus a **partial-strike count** (a `~~` not at the line start — counted as live, printed so the permissive blindness is visible; 0 today). **Delivery, sized to the body cap:** an unconditional count key `al` (disagreements) in `censusCounts`; the per-heading detail and the partial-strike count in `metadata.lists` and the box file; any prose on the (g) line is a clause the ladder may drop. **No new dedupe key — it rides the week-keyed census row** (and no same-commit suppression is ported: there is no separate alert flag). Tests: a planted off-by-one is reported (positive control); MOVED, struck and both-at-once exclusions; a partial strike counted and reported; **the P45 maximum-size fixture re-run with the new key, its body length printed in the change list** (and `census.test.mjs`'s ≤ 1000 assertion green). **Measured on the live file before it ships:** 5 disagreements at `b0efd6f89` (headline, three themes, `:5`), 0 after OBJ-1. |
| **OBJ-3** | No other number in the file is changed | the diff touches only the six count cells, the `:29` struck count and the AMR parenthetical |

## 3. JUDGEMENT CALLS
1. **No new dedupe key: it rides the week-keyed census row** (Langston's wording — the census body IS an alert row; its key rotates weekly, so it cannot rot the way a persistent key does, `#982`). A disagreement surfaces as the `al` count on that row.
2. The rule is read as written (`- ` lines; `➡️ … MOVED`; a line STARTING `- ~~`) — practised 4/4 today. A line struck only in part is counted as live AND reported as a partial strike, so that blindness is a visible number.

## 4. OUT OF SCOPE
The sprint plan's own §6 (already checked); the labelled sprint snapshot at the top of the file (`:5`'s "In the sprint (snapshot 2026-09-28): 198", `:9`, `:13-19`) — `:5`'s "After live" figure is IN scope (BLOCKER-2).

## 5. OBSERVATION
None — graded at the close commit; the W42 census reports it.
