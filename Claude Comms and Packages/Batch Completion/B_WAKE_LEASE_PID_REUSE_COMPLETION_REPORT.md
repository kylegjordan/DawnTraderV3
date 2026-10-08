# B-WAKE-LEASE-PID-REUSE (#1179) — COMPLETION REPORT

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 1w (after row 1u) · **change-class:** `non_architecture` · **Scope** `c31d13ed9` (APPROVED with C1-C6) · **Pre-audit** `ab4bbaa45` (APPROVED with six in-commit conditions) · **Code** reviewed `2bfe98d4d`, landed `01ba50771` + `8734c0acc` · **Install** laptop filter 2026-10-08 07:15Z · **Step 8** CONFIRMED by Langston 2026-10-08 · ⏳ **closes on Langston's Step-11 confirm**

## OPEN AT CLOSE — stated first
**No scope objective is open.** Two stated bounds: (1) **reach** — the filter file is shared on the laptop, but each of the other three sessions decides on the pre-fix rule until its next re-arm; only CC-A's re-arm is evidenced. (2) **not a live reproduction** — the fix was not exercised on a real reused pid; pid 4 stands in, as in the ruled OBJ-6 case. Langston's reach: the Windows suite and the installed file are reported fact to him; the decision is CI-graded and the wiring is code he read.

## WHAT IT DID
The one-watcher-per-session lease (`B-WAKE-ARM-EXCLUSIVE`, `#1140`) decides whether its holder (the session's bash arm loop) is still alive. It treated every unreadable process as alive (*"an unreadable process is not a dead one"*), keyed on the holder's creation time against pid reuse. **Live 2026-10-08 ~05:50Z:** CC-A's loop (pid 5448) ended; Windows gave 5448 to `svchost.exe`; `OpenProcess` returned error 5; the creation-time check was skipped (no time could be read); every arm refused `WATCHER-STAND-DOWN`, and `WATCHER-STUCK` would have named the service to stop. Recovered by hand (~11 min unwoken).
- `_proc` → `(alive, created, denied)`, `denied` = error **5 exactly** (Langston C1: one measured cause, one predicate).
- `holder_verdict(alive, created, loop_created, denied)` — pure: not alive → dead · **denied + recorded `loop_created` → dead** (the lease proves the holder was ours and openable; it does not become unopenable to the same user at the same integrity level) · creation unreadable → alive (fail-safe) · nothing recorded → alive (OBJ-6, ruled) · equal → alive, else dead.
- `WATCHER-STUCK` says "stop it" only for a **confirmed** holder (`created == loop_created`); otherwise it names the `tasklist` check. `WATCHER-STAND-DOWN` keeps one wording (it directs no action on a pid) — a decision.
- `_lease_create` warns when it cannot record a creation time (C6); the runbook carries the recovery.
- **Behaviour change at `_lease_ours`** (Langston Step-4 condition 2): in exactly the #1179 case an old `--once` arm now proceeds as the reader instead of refusing — the right direction; it takes no lease.
- **Direction of failure (C3):** the fix turns a refusal into a takeover in one case; wrong that way is a duplicate watcher (announces itself), wrong the old way is a lost wake (silent). `WATCHER-ORPHAN` is not a backstop here — its census counts `python.exe --once` readers, not the bash loop. **Declared limit (C4):** a holder armed elevated is refused to a non-elevated newcomer while alive → a duplicate.

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope): "the probe cannot read the creation time" ⇒ not the holder. NOW: "`OpenProcess` refused with error 5" ⇒ not the holder.** REASON: Langston C1 — `created is None` had two producers.
- **PREVIOUSLY STATED (change list r1): `_lease_ours` unchanged in behaviour. NOW: it changes in the #1179 case.** REASON: Langston Step-4 condition 2.

## OBJECTIVES
| obj | result | evidence |
|---|---|---|
| OBJ-1 a recorded-creation lease whose pid is now refused is taken over | PASS | Windows suite; FAILS on the pre-fix filter (control); pid 4 refused with error 5 asserted |
| OBJ-2 the ruled fail-safe is unchanged | PASS | OBJ-6 cases pass; the CI table carries OBJ-6 and the producer-B row |
| OBJ-3 STUCK never says "stop" for an unconfirmed process | PASS | unconfirmed wording + confirmed control (setup asserted) |
| OBJ-4 installed = reviewed | PASS | `~/.claude/cc-wake-filter.py` sha256 `a0fa0fd4…` = the blob at `1276bccc1` (Langston: the same blob at `2bfe98d4d`, `01ba50771`, `1276bccc1` and `681a2c7b4`); CC-A re-armed |
| OBJ-5 docs | PASS | runbook (`fd7034da5`), System Impact Map wake block |

## CI (per job)
Review branch `37740328699` at `2bfe98d4d`: 4/4. Landed `37742165456` at `1276bccc1`: TypeScript Check ✅ · Test Suite ✅ (step "Wake lease verdict tests (pid reuse)": 29 passed, 0 failed) · Build ✅ · Docker Build ✅.

## GOVERNANCE FILES CHANGED
CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what it does, tests, install, the home placed |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md | ✅ | row 1w status Step 11 + this report; row 1w1 placed (Infra Claude); §6 295 |
| T1 | PHASE_19_PLAN.md | N/A | the batch's row is sprint row 1w; no row there |
| T1 | shared MEMORY.md + MEMORY_CC_A.md | ✅ | mine: position; shared: §4.5's first-word vocabulary is unchanged (no new word) |
| T1 | the batch SCOPE | ✅ | approved with C1-C6 |
| T1 | the batch PRE_AUDIT | ✅ | approved with six in-commit conditions |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the Observation column | N/A | no window: graded by the suites at close (scope §5) |
| T1 | the four session task lists | ✅ mine / N/A — not mine ×3 | CC-A: 1w closing |
| T1 | Langston's MEMORY.md | ✅ | closed-batches line covers #1179 |
| T2 | SYSTEM_MANUAL.md | N/A | nothing under server/, client/ or shared/ changed |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | wake block: the holder decision and the STUCK identity rule |
| T2 | RUNNING_ISSUES.md | ✅ | #1179 done note; #1181 filed |
| T2 | CHANGES_AND_FIXES.md | N/A | crew tooling, no trading-system bug |
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
| T2 | MISTAKE_PATTERNS.md | N/A | no MISTAKE trailer in this batch |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | process unchanged |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | board unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | no daily check in this batch |
| — | CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md | ✅ | the reused-pid recovery, both residual paths, and the STUCK identity check |

## REVIEW RECORD
Step 1: approved with C1-C6 (key on refused not unknown; branch STUCK; state the failure direction; integrity level; prove `--loop` is a Windows pid; a CI-reachable truth table). Step 2: approved with six in-commit conditions (error 5 exactly; assert the observed code; the docstring; repo copy vs laptop; a pre-stated control; announce a lease with no creation time). Step 4: approved at `2bfe98d4d` with two conditions (the runbook before Step 11; the `_lease_ours` claim) and two record items; he found `#1181`. Step 8: confirmed, two record items (stale labels; the reach bound), folded above.
