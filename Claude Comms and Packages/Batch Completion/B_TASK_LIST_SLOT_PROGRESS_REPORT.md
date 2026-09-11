# B-TASK-LIST-SLOT — PROGRESS REPORT — OPEN: waiting on the next three completion reports (P5)

**change-class: non_architecture · owner CC-A · `#1009` · Phase 19 plan row 4.57**
**Window shape: a set QUANTITY — the next three completion reports first added after `2026-09-11T15:45:41Z`** (the first checker tick running the approved code). The criterion is pre-registered in §3 and was written into the pre-audit at Step 2, before any of this data existed.

---

## 1. WHAT THE BATCH IS FOR, AND WHAT SHIPPED

Kyle's rule (2026-09-05): every session keeps a task list, and it is updated at every batch close. **Measured at Step 1: of the three completion reports since the rule landed, one carried the task-list row — and that one only because Kyle asked.** The mechanism (pre-audit Finding B): a session writing a completion report copies the previous report rather than opening the skill, so a row added to the skill reaches nobody.

**What shipped — a CHECK, not another instruction** (Langston's Step-2 ruling: the checker only, no second gate):
- **P1** — the staging governance checker grades each batch's completion report for the Tier-1 task-list ledger row and raises `gov-ledgerrow` when it is missing (`scripts/governance-checker/`, code at `ddadab429`).
- **P3** — task lists live in `1-system-manual/` (`workflow-10-governance` Tier-1 row); `CC_A_SESSION_TASK_LIST.md` moved.
- **P4** — the row states each list LEADS with `OPEN AND STALLED`; `SYSTEM_IMPACT_MAP.md` gains a *Session Task Lists* entry.
- **P2** (the slot-time placement check) is its own batch: plan row 4.8 `B-SLOT-PLACEMENT-CHECK`.

## 2. STEPS COMPLETED, WITH EVIDENCE

| step | evidence |
|---|---|
| **1** scope | `B_TASK_LIST_SLOT_SCOPE.md`; Langston approved at `340836b0a` with four conditions, applied at `40a1ae5aa` |
| **2** pre-audit + plan | `B_TASK_LIST_SLOT_PRE_AUDIT.md` r3 `3144f1141`; Langston APPROVED WITH TEN CONDITIONS (2026-09-09T19:37Z), all applied and re-derived at the object |
| **3** implementation | P1 `83fb5c47f` → `0b2e396aa` → `e2e715980` → `ad38011f2` → `18a8b29b6`; P3/P4 `33b62ee16`. Three fresh-context object rounds, 20 misjudged shapes found and fixed, each reproduced as a failing test first |
| **4** code review | Langston **APPROVED** at `9a1ab64fb` with four conditions (he ran the matcher on all four real reports: 4/4 pass). Conditions applied at `ddadab429`: rows that do not render no longer count; leadless GFM rows accepted; `na-skip` namespace fenced by a test; the `git log` failure direction stated |
| **5** CI | `34617169179` at `a5273ad6d` (contains `ddadab429`): TypeScript Check · Test Suite · Build · Docker Build all `success`, per job. *(Two earlier runs on heads containing the fix were CANCELLED by newer pushes, not failed.)* ⚠️ CI does not run `poller.test.mjs`; locally **165 passed, 0 failed**; backtest `OBJ-11 GATE: PASS`; 15 mutants each caught |
| **6** deploy | The checker is not deployed by `dt-deploy`: its unit pulls the review branch before every tick. **Read back:** the `15:45:41Z` tick ran deployed HEAD `4e7f584b5`, which contains `ddadab429`; `git diff ddadab429 4e7f584b5 -- scripts/governance-checker/` is EMPTY, so the running checker is exactly the reviewed code |
| **7** verification | §2a |

### 2a. STEP 7 — VERIFIED LIVE, BOTH DIRECTIONS, ON REAL REPORTS

| when (UTC) | what happened | what it proves |
|---|---|---|
| **13:45:41** | first tick with the check: `opened=2` — **exactly the two alerts pre-registered offline before the push** (`B-DRIFT-RUNTIME-PREDICATE`, `B-EXIT-BOOK-AGE-STAMP`), nothing else | it flags real omissions and nothing else |
| **14:08 → 14:15** | CC-C added its row (`ca842c27b`); the next tick graded that real row present | a row written by another session, in its own shape, passes |
| **15:15:51** | after I added my row (`33b62ee16`), the checker **resolved alert `8ff33397` itself** — `resolved_by_claimed=governance-checker`, evidence `18a8b29b6` | the resolve path works with no manual step |
| **15:45:41** | tick on the approved code: **zero ledger-row alerts open** | steady state on the reviewed ref |
| offline | `ledger-rows-preview.mjs` over every completion report the check grades: **4 of 4 PASS**; Langston independently ran the matcher on the same four: 4/4 | nothing would be wrongly flagged today |

**UI (§9.3):** Claude-in-Chrome, `https://188.245.193.8.sslip.io/system-alerts` (2026-09-11 15:47Z) renders the checker's open governance alerts (e.g. *"Change-class undeclared for B-LANGSTON-CONTEXT"*); **no `gov-ledgerrow` alert is listed, which matches the store — all three have been resolved.** ⚠️ **Not captured: the page while a ledger-row alert was OPEN.** The store shows them created at 13:45:49Z as `scheduled` / `warning`; the rendered row for that state was not screenshotted at the time. Stated rather than inferred.

## 3. ⛔ THE PRE-REGISTERED CLOSE CRITERION — P5, AS WRITTEN AT STEP 2 (pre-audit r3)

> **Baseline:** close-time = **1 of 3**.
> **PRIMARY:** of the next three completion reports first-added after the deploy, the row is present AT CLOSE in all three — the checker's purpose is that no omission survives.
> **SECONDARY:** present in the report's FIRST pushed version — measures whether sessions write it unprompted, not only after an alert. Reported, not gated.
> ⛔ **FAIL:** the primary does not reach 3 of 3 ⇒ the checker is not closing the gap, and the batch says so.
> **Measured the same way, on the P1 population, at the ref.**

**Operationalised now, before the data:**
- **"after the deploy"** = first added after `2026-09-11T15:45:41Z` (the first tick on the approved code).
- **Population** = files whose basename matches the checker's own `completion_report` pattern (`/COMPLETION|COMPLETE/i`), first-add read with the checker's path-limited `--diff-filter=A` (a converted progress report counts from its conversion). **This batch's own completion report is EXCLUDED** — a batch grading its own delivery is not a measurement.
- **"present AT CLOSE"** = the checker has no open `gov-ledgerrow` alert for that batch 30 minutes (one tick) after the report's LAST commit that closes the batch; **"present in FIRST pushed version"** = `ledgerRowInText` true on the blob at the report's first-add commit.
- **Instrument:** `ledger-rows-preview.mjs` plus `git show <first-add>:<report>` through the shipped `ledgerRowInText`, and the alert store for open/resolved state.
- **Result recorded as three rows** (batch · first-add sha · first-version verdict · at-close verdict), then the decision.

## 4. WHAT IS UNPROVEN

- **Whether the rate moves.** Everything above shows the check works; P5 is the test of whether it closes the gap.
- **Slot-time placement** — not built here (row 4.8).
- **`tick()` has no unit test**; dropping the orphan-verifier argument at its call site is uncaught (the doc-gap wiring shares the exposure).
- **CI does not run the checker's suite** — it runs by hand.
- **Inherited:** the batch-id filename match can pull in a neighbour batch's report.
- **Other sessions' lists:** CC-B's and CC-INFRA's lists are not yet in `1-system-manual/` (their owners move them).

## 5. GOVERNANCE FILES CHANGED SO FAR

`B_TASK_LIST_SLOT_SCOPE.md` · `B_TASK_LIST_SLOT_PRE_AUDIT.md` · `B_TASK_LIST_SLOT_CHANGE_LIST.md` · this progress report · `PHASE_19_PLAN.md` (rows 4.57, 4.8; row 3.5 and 4.58 from findings in this session) · `RUNNING_ISSUES.md` (`#1009` Step-2 note; the moved-list pointer) · `SYSTEM_IMPACT_MAP.md` (*Session Task Lists*) · `workflow-10-governance` skill (Tier-1 task-list row: folder, shape, what the checker grades) · `CC_A_SESSION_TASK_LIST.md` (moved and updated) · `MEMORY_CC_A.md` · `B_DRIFT_RUNTIME_PREDICATE_COMPLETION_REPORT.md` (the row the check found missing) · `scripts/governance-checker/README.md`. **Still owed at Step 10:** `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, shared `MEMORY.md`, Langston's `MEMORY.md`, `CHANGES_AND_FIXES.md` (judged), the four session task lists row.
