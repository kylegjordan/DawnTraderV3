# B-WAKE-STATE-UNSAVED-LOUD (#1151) — COMPLETION REPORT

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 1r · **change-class:** `non_architecture` · **Scope** r2 `806ddea1b` · **Pre-audit** r1 `793cbf6fe` · **Code** landed `6cb848b22` · **Step 8** CONFIRMED by Langston 2026-10-07

## OPEN AT CLOSE — stated first
**No scope objective is open.** One propagation, not an objective: the other three sessions run the filter they armed with until their next re-arm (every wake re-arms). Not measured at close.

## WHAT IT DOES
The wake watcher keeps its read position in `~/.claude/cc-wake-state/<ALIAS>.json`.
- **A failed save** — at the `--positions` stale reset, the stale-resume notice, `#@CAUGHTUP` after a delivery, end of input, or the keepalive — now prints `WATCHER-STATE-UNSAVED: <dir> errno <n> (<reason>) — <what it means>`. After a delivery the run exits on what it delivered (0), so the session is told and the next pass re-delivers the same message — a self-announcing duplicate, where it used to exit 1 into a silent 30 s retry loop. At the stale reset the line carries the time to sweep the inbox from, and the filter exits 1 so the arm's `|| break` ends the task with it.
- **A file that exists but cannot be read or parsed** (permissions, a directory at its path, or an empty, truncated or undecodable body) refuses with `WATCHER-STATE-UNREADABLE:` and exit 1. Only a MISSING file is a fresh start. Before, a damaged file silently restarted every source at its newest message and lost the saved time, so the 12 h "you were away" notice could not fire either.
- `.alive` keeps its one writer (the keepalive, after a successful save). The residual is pinned by OBJ-4: a run that delivers and then fails to save exits with `.alive` still fresh from its last keepalive — up to 15 minutes in which the heartbeat cannot see that no watcher runs; the session is told directly by the task ending.

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope r1): three unguarded save sites. NOW: four.** REASON: r1 enumerated the `_checkpoint()` wrapper; Langston enumerated `save_state` and found the direct call in `--positions` (`MISTAKE_PATTERNS` enumerator-blind-spot n=18).
- **PREVIOUSLY STATED (Step-4 r1): an unparseable state returns `{}` (judgement call 1). NOW: it refuses.** REASON: Langston measured the silent tail resume on three damaged bodies.

## OBJECTIVES
| obj | result | evidence |
|---|---|---|
| OBJ-1 a failed save after a delivery ends the run and says so | PASS | suite (CI uid 1001; Linux uid 65534; Windows) |
| OBJ-2 writable: saves, no re-delivery | PASS | suite |
| OBJ-3 stale-resume and end-of-input | PASS (line twice / exit 3 diagnostic) | suite |
| OBJ-4 the residual pinned | PASS (exit 0, `.alive` at its keepalive mtime) | suite |
| OBJ-5 the comment states the new rule | both retired strings grep 0; `_replace_retrying` present (Langston at the ref) | file |
| OBJ-6 docs, and the installed file is the reviewed one | MEMORY §4.5, runbook, SIM; installed sha256 = blob `101d646b…` (Langston verified the blob half) | Step-7 doc |
| OBJ-7 no regression | filter-cuts (P4 now asserts exit 0), follow: ALL PASS; CI 4/4 | suite, CI |
| OBJ-8 `--positions` stale reset | PASS + restored control PASS | suite |
| C1 unreadable/unparseable refuses | PASS ×5 (directory, intact control, zero-length, truncated, undecodable) | suite |
**Controls:** the pre-fix filter fails all 6 failure cases; `87552a8e3` fails the 3 unparseable bodies. Root is a stated SKIP (measured on Linux as root: 2 pass, 5 SKIP). Langston showed from the arithmetic alone that CI's "12 passed" admits no skip.

## HONEST RESIDUAL
- Windows behaviour and the installed laptop file are reported fact for Langston; the CI leg and the blob sha are his own.
- An empty position file after a host crash (rename without fsync) now stops the watcher until it is deleted by hand — the chosen direction (announced stop over silent loss), written into the runbook.

## CI (per job)
Run `37590389291` at `6cb848b22`: TypeScript Check ✅ · Test Suite ✅ (step "Wake filter tests (position save and read failures)": 12 passed, 0 failed, 0 skipped, uid 1001) · Build ✅ · Docker Build ✅.

## GOVERNANCE FILES CHANGED
CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what it does, tests, install |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 1r) | ✅ | status Step 11 + this report in the report column |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the batch's row is sprint row 1r |
| T1 | shared MEMORY.md + MEMORY_CC_A.md | ✅ | shared §4.5: the `WATCHER-STATE-*` vocabulary (24,559 B, under the cap); mine: position |
| T1 | the batch SCOPE | ✅ | r2 with the send-back folded |
| T1 | the batch PRE_AUDIT | ✅ | r1, approved with C1-C3 |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the Observation column | N/A | no window: every objective is a test at close |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-A: row 1r closing |
| T1 | Langston's MEMORY.md | ✅ | my closed-batches line now covers 1r; 104,835 → 104,825 B |
| T2 | SYSTEM_MANUAL.md | N/A | nothing under server/, client/ or shared/ |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | the wake block: failed save/read is said and the run ends |
| T2 | RUNNING_ISSUES.md | ✅ | `#1151` ruling and home recorded; closes at Step 11 |
| T2 | CHANGES_AND_FIXES.md | N/A | no trading-system bug or risk |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase item |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no parameter |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional change |
| T2 | STORAGE_POLICY.md | N/A | laptop-local state only |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | no VTS code |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no asset-class learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role or gate changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build untouched |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no rule changed |
| T2 | CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed |
| T2 | CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md | ✅ | the two lines, what to do, the crash → hand-delete clause |
| T2 | MISTAKE_PATTERNS.md | ✅ | enumerator-blind-spot n=18 (the wrapper, not the callee) |

## REVIEW RECORD
Design: Langston's option (a), six conditions (`#1151`). Step 1: sent back r1 (the fourth save site), approved r2 with two conditions (a write-deny control inside every test; OBJ-4 must be able to fail). Step 2: approved with three conditions (fold `load_state`; name the deny per platform; root is a stated SKIP). Step 4: r1 sent back (an unparseable file must refuse), r2 approved with two nits and a runbook item. Step 8: confirmed, with the CI leg re-derived by him.
