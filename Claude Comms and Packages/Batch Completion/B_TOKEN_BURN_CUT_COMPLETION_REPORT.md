# B-TOKEN-BURN-CUT — COMPLETION REPORT

**Batch:** `B-TOKEN-BURN-CUT` · **Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1h** (pre-sprint, Kyle 2026-09-30) · **Issue:** `#1127` · **change-class:** `non_architecture`
**Scope:** `Claude Comms and Packages/Scope Files/B_TOKEN_BURN_CUT_SCOPE.md` + `B_TOKEN_BURN_CUT_AMENDMENT_1.md` · **Pre-audit:** `B_TOKEN_BURN_CUT_PRE_AUDIT.md` · **Change list:** `Change Lists/B_TOKEN_BURN_CUT_CHANGE_LIST.md` · **Verification:** `Change Lists/B_TOKEN_BURN_CUT_STEP7_VERIFICATION.md` + `B_TOKEN_BURN_CUT_STEP8_AUDIT_RAW.md`
**Steps:** 1-6 on 2026-09-30, amendment 1 Steps 3-6 the same day; Step 7 on 10-01 (four Langston-approved filter installs); Step 8 CONFIRMED by Langston 2026-10-01 ~22:35Z, his one condition discharged ("Review = Approved"); Step 9 had nothing to iterate.

## OPEN AT CLOSE — none in scope

Every scope objective is met. The work this batch surfaced and did not do has placed homes:

| item | home | owner |
|---|---|---|
| **One watcher per session, enforced, not instructed** | `B-WAKE-ARM-EXCLUSIVE` (`#1140`), row **1o**, immediately after 1h; Step 1 approved | CC-A |
| A lost alert routing reaches someone who can act | `B-WAKE-OWNER-LOSS-VISIBLE` (`#1142`), row **1p**, after 1o | CC-A |
| Each alert's owner on the alert record, not re-guessed per reply | `B-ALERT-OWNER-ON-ROW` (`#1137`), row **1l** | CC-A |
| A feature-watch finding that changes operations gets a disposition the day it lands | `B-FEATURE-WATCH-ROUTING` (`#1128`), row **1i** | CC-A |
| Langston's alert prompt offers every owner | `#1035`, homed in Infra Claude's `#1026` work | Infra Claude |

## OBJECTIVES

| # | objective | | evidence |
|---|---|---|---|
| **OBJ-1** | A session is woken only by a wake-worthy event | **YES** | (a) Empty wakes per session: 45-76 Monitor expiries on 2026-09-29 → **0 on 2026-10-01** (CC-A 7 wakes, CC-B 8, CC-C 10, Infra 9; zero empty, zero unreadable, zero Monitor). CC-A's 23 h idle stretch (09-30 21:29Z → 10-01 20:37Z) held one notification, a timer of its own. The heartbeat showed every watcher alive at every observation from 01:14Z, with a three-hour gap when the laptop was offline. (b) Planted controls T1-T3: each woke exactly the named sessions. |
| **OBJ-2** | No event is lost between wakes | **YES** | T4 (posted while no CC-A watcher ran) arrived exactly once on re-arm; CC-B mid-turn delivery exactly once, in order (NEW Claude's report); the resume-from-position legs of `test-wake-filter-cuts.py` pass. |
| **OBJ-3** | The arm procedure is updated everywhere and every session runs it | **YES** | A census at the ref of every `Monitor` mention found three stale session-memory lines, all fixed by their owners (`f6b269089`, `3a9619b62`/`4648be70e`, Infra's line 71); Langston re-derived it at Step 8 ("no stale arm line survives"). A process census found exactly one event-only watcher per alias, all four sessions. |
| **OBJ-4** | The fresh-reader check is one pass, on load-bearing claims only | **YES** | Zero loop references in the five step skills at the ref, and all five carry the one-pass text and the `NOT RE-READ` clause (Langston, positive-controlled). |
| **OBJ-5** | A Langston reply wakes only its addressee | **YES** | Filter case table at the ref (`test-wake-filter-cuts.py`, 28 cases; Langston ran it on POSIX: ALL PASS, the 3 Windows-only held-file legs SKIP with the reason printed). |
| **OBJ-6** | Each session sees only its own alerts | **YES — mechanism; effect limited, see residual** | `test-alert-split.mjs` 22/0 (Langston ran it). The per-turn hook shows "yours / routed elsewhere / not yet routed", fail-open. |

⚠️ **TAG, carried as Langston required:** the empty-wake counts, the process census, T1-T4 delivery and CC-B's mid-turn delivery are **RULED ON REPORTED FACT** — unreachable by construction, since they live on the laptop and he reads from Helsinki. This is not a re-derivation he skipped. The derivation is committed (`scripts/analysis/b-token-burn-cut-wake-audit.py`, raw output in `B_TOKEN_BURN_CUT_STEP8_AUDIT_RAW.md`).

## WHAT STEP 7 AND THE REVIEW CAUGHT (all fixed, each with a test whose control fails on the old filter)

1. **A save refused on Windows** while another process held the state file (`WinError 5`, measured on NEW Claude): retried ~5 s (`5336bd770`). That a double arm produced that particular error stays RULED ON REPORTED FACT (Langston); the retry does not depend on it.
2. **A held alert-owner record dropped the wake on the same line** (the per-line handler swallowed the raise): the save retries, and a final failure names the lost routing and delivers the wake (`ecabf7a47`).
3. **A watcher that could not save still reported itself alive**: `.alive` is now written only after a good save. Stale is no longer proof of dead, so every read-site counts first (`~/.claude/cc-wake-count.sh`), and the heartbeat reports STUCK separately from DEAD — and the filter delivers STUCK (`cfe70f92c`, `ecabf7a47`, `f4cd43e3d`).
4. **A seed that hit a failed save would still mark itself seeded**: it now exits 4, unmarked (`a89a90138`).

## GOVERNANCE — CHANGE-CLASS: non_architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry added (`2ec01088b`), flipped to CLOSED with this report |
| T1 | `PHASE_HISTORY.md` | ✅ | entry added (`2ec01088b`), flipped to CLOSED with this report |
| T1 | `SPRINT_TO_LIVE_PLAN.md` — row 1h | ✅ | status CLOSED with this report linked (this commit); rows 1i, 1l, 1o, 1p placed during the batch |
| T1 | `PHASE_19_PLAN.md` | N/A — no row there | not a `P19-*` batch, and no row in flight there |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ | 4.5 arm command + count-first + per-session alert rule; my position block at every step |
| T1 | the batch `SCOPE` | ✅ | `B_TOKEN_BURN_CUT_SCOPE.md` + amendment 1 |
| T1 | the batch `PRE_AUDIT` | ✅ | `B_TOKEN_BURN_CUT_PRE_AUDIT.md` (Langston cleared, conditions C6-C10) |
| T1 | `COMPLETION_REPORT` | ✅ | this file |
| T1 | the `Observation` column | N/A | no observation window: every objective was measured before close |
| T1 | session task lists | ✅ mine / N/A — not mine ×3 | CC_A's in-flight and slotted section added (1h, 1o, 1p, 1l, 1i, 1j, 1k, 1n), this batch flipped to closed with this report |
| T1 | Langston's `MEMORY.md` | ✅ | STUCK read-site line (`ca861caf…`, net −11 B); close line with this report |
| T2 | `SYSTEM_MANUAL.md` | N/A | comms tooling; nothing under architecture, strategy, regime, filter, pipeline or math changed |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Discord Comms Fabric: two stale lines corrected, B-TOKEN-BURN-CUT block added (`07f8d7fa3`) |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1127` closed; `#1128`, `#1137`, `#1140`, `#1142` opened and placed |
| T2 | `CHANGES_AND_FIXES.md` | N/A | no trading-system bug or risk entry; the four filter defects are recorded here and in the change list |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level change |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no parameter-adjustment change |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no table or retention change |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | not a B78-B81 item |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no asset-class learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method's roles and gates are unchanged; the watcher's delivery form is project tooling, recorded in the SIM and runbook |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | his model, runtime, invocation, read path and files are unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | ✅ / N/A | `CLAUDE.md` §6/§6.9 arm mechanics (`a89c72d6b`) and §10.5 step 2 (`e1d6e13db`); `CONDUCT.md` untouched |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | ✅ | both changes entered, old wording quoted from the diffs (`2ec01088b`) — owed since Step 6, caught at Step 10 |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | `langston-alert-invokes.log` source (Step 3) and the never-registered `wake-watcher-heartbeat-cc-a` (`07f8d7fa3`) |
| T2 | `MISTAKE_PATTERNS.md` | N/A | trailers written in commits (`instrument-too-narrow` ×2, `wrong-object` ×2); the weekly pass harvests them from commits |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | no exception granted |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | ✅ | six-way owner set incl. Langston, the NAMES invariant for session owners only, the FYI fallback (`e4859d684` and amendment 1) |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | no column, field or ownership change |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | ✅ | the 2026-09-15 finding (CC 2.1.271: every Monitor now expires within 30 min) entered in the ledger (Step 6, `a89c72d6b`) |
| — | `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md`, `COMMS_BRIDGE_RUNBOOK.md`, `SEARCH_SURFACES.md`, five step skills, `session-reminder.mjs`, `alert-split.mjs`, `inject-due-alerts.mjs`, heartbeat skill | ✅ | arm procedure, count-first, STUCK, one-pass reader, per-session alerts |

**CI:** see the closing commit's run (per-job, quoted in the Step-11 dispatch). The filter and its tests are Python outside the CI jobs; the tests ran on Windows (CC-A) and POSIX (Langston).

## HONEST RESIDUAL

- **One watcher per session is still enforced only by instruction.** The count-first rule and the heartbeat's STUCK report make a duplicate visible; they do not prevent it. `#1140` is next.
- **OBJ-6 works as built but narrows less than it should:** Langston's owner markers churn (alert `d9caf6f5` changed owner 46 times in a day), and a churned owner reads as unrouted in every session — fail-open by design. The structural fix is `#1137`.
- **Laptop-only evidence** (above) cannot be re-derived by the reviewer; it is committed as derivation and raw output.
- **The filter, count script and heartbeat skill are hand-installed** (`#1004` class), each verified by sha256 against its blob at install.
