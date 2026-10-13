# B-CODEX-FAILOVER — Completion Report (sprint row 1y) — ✅ CLOSED 2026-10-13 (Coltrane Step-11 CONFIRMED)

**Owner:** CC-A / OLD Codex · **change-class:** `non_architecture` · **Sprint plan row:** 1y · **Issue:** `#1192`
**Scope / pre-audit:** `Claude Comms and Packages/Scope Files/B_CODEX_FAILOVER_SCOPE.md` and `B_CODEX_FAILOVER_PRE_AUDIT.md` — both retrospective and explicitly non-gating · **Change list:** `Claude Comms and Packages/Change Lists/B_CODEX_FAILOVER_CHANGE_LIST.md`
**Reviewed implementation:** `25d7bcf2e9a546730ba994c93a2bea4271bc9ff4` · **Governance:** `7268da41f90d57768a8ae96fda2dfb3f825895c9`

> ⚠️ **OPEN WORK OUTSIDE THIS BATCH'S SCOPE:** automatic Codex wake/alert delivery, hook-equivalent safeguards, actor-bound handover receipts, reviewer-control wake suppression and first-class Codex/Coltrane board identities remain manual or absent. Owner CC-A; placed at `B-CODEX-FAILOVER-AUTOMATION`, issue `#731`, sprint row **1z**, after row 1y. Closing condition: the automatic paths supply the measured guarantees now provided by manual instructions, a receipt carries evidence of which session supplied it, and the board and reviewer-control path name the Codex-shift actors without false wakes. Failure condition: any Claude-only automatic guarantee is claimed for Codex without a measured replacement, a root caller can still supply another session's unauthenticated receipt, or a reviewer-control command still wakes the reviewer.

## 1. What it was for

When Kyle's weekly Claude allowance runs out, DawnTrader needs a temporary crew that can continue the same governed work without competing checkouts, unowned actions or an ambiguous hand-back. This batch gives each Claude folder one Codex stand-in, makes the stand-ins and Coltrane canonical actors, and adds one durable switch for the whole crew, one session or Langston.

## 2. What shipped

| item | delivered result |
|---|---|
| identities | `codex-a`, `codex-b`, `codex-c`, `codex-infra` and `coltrane` are canonical alert actors; deploy attribution is derived from that registry and accepts both word orders for the human-facing aliases |
| stand-in rules | `AGENTS.md` maps each Codex session to its existing Claude folder, bans worktrees, supplies the manual guard duties and routes review to Coltrane during a Codex shift |
| durable switching | Helsinki `crew-switch` persists crew, per-session and Langston orders in one state file; missing named handover receipts are chased and escalated; a retained completed order accepts an idempotent late incoming receipt without reopening |
| reviewer state | a whole-crew switch to Codex stops and disables the Discord Langston bridge and reads back both states; Kyle's explicit `LANGSTON ON` is an intentional override, and Coltrane remains available by name |
| live proof | switch S1 closed after four of four named outgoing Claude receipts, retained `closed_as=complete`, then recorded `OLD Codex` at `2026-10-13T19:36:58Z`; the reverse-order duplicate did not replace that receipt or reopen the order |

## 3. Objectives

| # | objective | verdict | evidence |
|---|---|---|---|
| OBJ-1 | Codex sessions load the crew rules and resume from the counterpart POSITION block | **YES** | `AGENTS.md` is the Codex entry point; S1 puts all four Codex sessions on duty, and OLD Codex resumed this batch from `.claude/memory/MEMORY_CC_A.md` rather than a separate worktree |
| OBJ-2 | Codex sessions and Coltrane use their own canonical names for deploy and alert attribution | **YES — capability verified; a Codex-attributed app deploy was not needed** | `ALERT_ACTORS` contains the five actors; the deployment set is derived from its non-machine entries; the actor allowlist and deploy-parity tests passed. The installed staging record still names `cc-a` because the application deploy preceded this Codex shift |
| OBJ-3 | one Discord line switches the crew, one session or Langston; every outgoing session must confirm; misses are re-sent and escalated | **PARTIAL AS WRITTEN; intended escape paths are explicit** | 41/41 Helsinki tests; S1 contains four of four named outgoing receipts, `never_confirmed=[]`, `closed_as=complete`, plus one late incoming receipt. A superseding order or the 24-hour expiry closes an incomplete order with `never_confirmed` populated, and `ack` records a supplied canonical name rather than authenticating the invoking session. T3 proves the 15-minute chase in the fake environment; S1 completed in about 11 minutes with `last_nag_t=null`, so the live switch did not exercise a reminder |
| OBJ-4 | Langston is stopped and disabled during a Codex shift, with both states read back | **PARTIAL AS WRITTEN; the whole-crew default passed** | S1's `SWITCH TO CODEX` set `discord-langston-bridge.service` inactive/disabled and the direct Step-11 read-back still matched. Kyle's explicitly scoped `LANGSTON ON` command can intentionally leave that bridge active/enabled while crew mode remains Codex; `crew-switch` controls this Discord bridge, not every root-callable Langston invocation path |

## 4. Reviews and verification

- Langston reviewed the initial design and imposed the fail-loud service and handover conditions folded into the implementation.
- Coltrane returned **BLOCKED** at `47e83709a` because the order message required an incoming confirmation after the final outgoing confirmation had already made `ack` refuse the closed order.
- The correction accepts late incoming receipts only against completed history, never expired or superseded history, and keeps duplicates idempotent. Coltrane returned **PROCEED** at exact shared ref `25d7bcf2e9a546730ba994c93a2bea4271bc9ff4` after re-running the 41-test suite and mutation-proving the completed-history predicate.
- CI `38453885686` at the reviewed implementation: **TypeScript Check — success; Test Suite — success; Build — success; Docker Build — success.**
- CI `38458566092` at governance ref `7268da41f90d57768a8ae96fda2dfb3f825895c9`: **TypeScript Check — success; Test Suite — success; Build — success; Docker Build — success.**
- CI `38460376485` at the report ref `b4f6fbc66952cbee3d7f65028d874a62ff11377b`: **TypeScript Check — success; Test Suite — success; Build — success; Docker Build — success.**
- The installed Helsinki `crew-switch` and the reviewed blob both hashed `aca7b58107da44dc55c065aff7fc944812b29e669ce1292f3e3b813d89f45c42`; its watcher was active and enabled at the Step-11 read.
- Coltrane **CONFIRMED Step 11** at exact ref `b4f6fbc66952cbee3d7f65028d874a62ff11377b`: he independently reran 41/41 tests, inverted the completed-history predicate and reproduced the former refusal, checked the four CI jobs, counted the nine-message S1 transcript, and found no remaining blocker. His mechanism review also named bounded-history eviction, failed-post states, unauthenticated names and later service drift; the material limits are stated above or placed in row 1z.

## 5. Numeric deltas

- **PREVIOUSLY STATED: 35 passed, 0 failed. NOW: 41 passed, 0 failed. REASON:** the Step-8 correction added the completed-history late-receipt and duplicate-alias regression cases before final review.
- **PREVIOUSLY STATED: 844,262 loaded Langston-memory bytes. NOW: 844,222. REASON:** Step 10 replaced one older mechanics line with the failover invariant; the loaded sum decreased by 40 bytes and the memory composer remained clean.

## 6. New findings and dispositions

- **Incoming confirmation after close was impossible.** Coltrane reproduced it at the exact ref; the completed-history receipt path fixed it inside this batch and the live S1 receipt exercised the correction.
- **A handover receipt names a session but does not authenticate it.** The Discord watcher positively checks Kyle's `author_id`, proving the code has an identity-bearing input where intended; `ack()` accepts a root CLI name and records no caller identity, pushed ref or POSITION evidence. **DISPOSITION:** added to `B-CODEX-FAILOVER-AUTOMATION`, issue `#731`, owner CC-A, sprint row 1z after row 1y.
- **The scope used absolutes where the reviewed mechanism has deliberate escape paths.** Incomplete orders can close as `expired` or `superseded`, an old complete history row can age out, and Kyle can override Langston ON during Codex mode. Those are fail-loud or expressly requested behaviours, not silent guarantees; this report narrows the claims instead of treating the clean S1 path as proof of the absolutes.
- **The Codex automatic safety layer is not equivalent to Claude's.** Manual queue reads and guard duties make this first shift operable, but they are not automatic wake, alert or hook coverage. **DISPOSITION:** own batch `B-CODEX-FAILOVER-AUTOMATION`, issue `#731`, owner CC-A, sprint row 1z after row 1y.
- The push-guard subfolder refusal, canonical generated-file churn and single-slot deploy provenance were pre-existing classes. Their homes remain `#926` / `B-TSC-GUARD-CWD`, `#733` / Phase 19 row 3n.e, and `#1004` / `P19-B12`; this batch did not reopen or enlarge them.

`REVIEWER: claim-only · name the objects that settle the durable-switch / receipt / Langston-state mechanism and the other states consistent with them · HIT — expiry/supersession, manual Langston override, unauthenticated named receipts, unexercised live nag and bridge-only shutdown narrowed above · re-derived yes (reviewed source + tests, Kyle-author check as the authentication control, live S1 state and direct service read-back)`

## 7. Governance ledger

Copied from the filled Step-10 tier ledger in commit `7268da41f`; N/A rows are retained.

| tier | document | verdict |
|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ Added the row 1y index and detailed delivered/verified/boundary record. |
| T1 | PHASE_HISTORY.md | ✅ Added the 2026-10-13 Codex failover milestone and its separated automation residual. |
| T1 | SPRINT_TO_LIVE_PLAN.md | ✅ Moved row 1y to Governance and placed #731 as queued row 1z. |
| T1 | PHASE_19_PLAN.md | N/A — B-CODEX-FAILOVER has no row in PHASE_19_PLAN.md. |
| T1 | shared MEMORY.md + MEMORY_CC_A.md | ✅ Added the live failover invariant and moved the owner position to Step 10/next Step 11 while keeping both files under 24,576 bytes. |
| T1 | B_CODEX_FAILOVER_SCOPE.md | ✅ Corrected the reviewer/evidence state, added explicit residual homes and recorded that no observation window exists. |
| T1 | B_CODEX_FAILOVER_PRE_AUDIT.md | ✅ Added the required retrospective audit with a first-line warning that it did not gate implementation. |
| T1 | B_CODEX_FAILOVER_COMPLETION_REPORT.md | ✅ This Step-11 report; its governance list is transcribed from the committed Step-10 ledger. |
| T1 | Observation column | N/A — the scope names no observation window; S1 is a completed discrete live event. |
| T1 | CC_A/CC_B/CC_C/CC_INFRA session task lists | ✅ CC_A_SESSION_TASK_LIST.md records row 1y and row 1z; N/A — the other three lists are not mine. |
| T1 | Langston `/home/langston/MEMORY.md` | ✅ Replaced one mechanics line with the failover invariant; loaded sum decreased 844,262 to 844,222 bytes and composer state is clean. |
| T2 | SYSTEM_MANUAL.md | N/A — B-CODEX-FAILOVER changes no trading architecture, strategy, regime, filter, signal pipeline or quantitative math. |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ Added the actor registry, `AGENTS.md` surface, `crew-switch` component, shared-state ordering and blast radius. |
| T2 | RUNNING_ISSUES.md | ✅ Replaced #1192's stale scaffolding state and opened #731 with owner and row 1z home. |
| T2 | CHANGES_AND_FIXES.md | ✅ Recorded the completed-order/incoming-receipt defect and its verified correction. |
| T2 | POST_AUDIT_ROADMAP.md | N/A — the batch changes sprint crew tooling and adds no phase-level roadmap item. |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A — no governed parameter, threshold or adjustment process changed. |
| T2 | AUTHORITY_BASELINE.md | N/A — no constitutional trading authority or decision ownership changed. |
| T2 | STORAGE_POLICY.md | N/A — no table, writer, cadence or retention tier changed. |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | ✅ Reviewed the temporary xStock calibration list and recorded no status change on a crew-tooling-only diff. |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A — no asset class, dispatcher or onboarding contract changed. |
| T2 | BUILD_METHOD_PLAYBOOK.md | ✅ Added the portable temporary-crew role, identity, reviewer-separation and persisted-handover method. |
| T2 | LANGSTON_ARCHITECTURE.md | ✅ Added the Codex-shift Coltrane overlay, model/build boundary, before/after record and known limits. |
| T2 | CLAUDE.md / CONDUCT.md | N/A — neither stable Claude rule file is changed by the Step-10 diff; Codex rules already live in `AGENTS.md`. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A — `CLAUDE.md` receives no rule add or material change. |
| T2 | DELETED_COMPONENTS_LOG.md | N/A — no component is removed by this batch. |
| T2 | MISTAKE_PATTERNS.md | ✅ Added the second fixture-not-process instance from the live-service-name test incident. |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A — the retrospective documents are now present and no checker open, class override or N/A-skip exception is created. |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A — actor membership changed but acknowledgement/resolution semantics and the alert process did not. |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A — the row 1y card uses existing status, review and blocked-on fields; no board field, column or ownership rule changed. |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A — no daily model/feature check ran and no feature-watch ledger state changed. |

## 8. Honest residual

- The scope and pre-audit were written after implementation. They document the boundary but did not protect the design; neither is cited as a pre-implementation gate.
- Codex automatic wake, alert and hook coverage is not shipped. The current shift relies on the manual duties in `AGENTS.md`; row 1z owns the automatic replacement.
- S1 completed before the first reminder interval, so production nag delivery remains unexercised; T3 verifies the reminder path only against the fake sender and fake service.
- A handover acknowledgement is a canonical name supplied to a root CLI, not authenticated proof that the named session performed the push and POSITION work. Row 1z owns an actor-bound receipt.
- “Langston OFF” in this batch means the Discord bridge is inactive and disabled. Root-callable direct invocation tooling remains possible, and Kyle's explicit `LANGSTON ON` command intentionally overrides the crew-mode default.
- No application deploy has yet been recorded under a Codex actor. The allowlist and parity wiring are verified, while the current staging deployment record remains `cc-a` from before the Codex shift.
- The board cannot name OLD Codex or Coltrane in its current identity fields. That representation gap is part of row 1z.

## 9. Step-11 close state

Coltrane CONFIRMED at the exact pushed report ref `b4f6fbc66952cbee3d7f65028d874a62ff11377b`. Row 1y, issue #1192, the batch catalog, phase history, task list, board card and CURRENT POSITION are CLOSED / Complete. No Kyle acknowledgement is required.
