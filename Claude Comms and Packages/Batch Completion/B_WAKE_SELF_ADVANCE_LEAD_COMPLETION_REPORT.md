# B-WAKE-SELF-ADVANCE-LEAD (#1177) — COMPLETION REPORT

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 1v (after row 1s) · **change-class:** `non_architecture` · **Scope** r2 `68af4ccbf` (r1 APPROVED with two conditions) · **Pre-audit** `103a99e24` (APPROVED with two conditions) · **Code** reviewed `34e51a966`, landed `f1030945d` + `34fa9e330` · **Install** Langston's bridge 2026-10-08 04:55Z · **Step 8** CONFIRMED by Langston 2026-10-08 · ⏳ **closes on Langston's Step-11 confirm**

## OPEN AT CLOSE — stated first
**OBJ-4 is open and carried by an alert, at Langston's Step-8 ruling:** `3668b78b-30df-4621-82be-78332bc9040e` (`verification`, `info`, dedupe `b-wake-self-advance-lead-obj4`), first check-in 2026-10-09T09:00Z. It is a self-rescheduling event-wait: the window is a QUANTITY of one — the first self-advance reply after the restart — so `triggers_at` is a check-in cadence, not a deadline. **Pre-registered:** PASS = that reply opens with its queue item's requester (the lead name, not the `(self-advance)` marker); FAIL = it opens `self-advance —` or another name. Resolved with the quoted lead name, **never acked**. When it resolves, its result and what was done are written into this report (alert-gated closure, `workflow-10-governance`).
**Langston's reach, stated by him:** the laptop filter's installed copy and Infra Claude's preamble leg are reported fact to him; the server install, CI and both suites are his own.

## WHAT IT DID
A reply Langston posts from his own review queue now opens with the name of the session that asked. The queue's re-invoke task carries the author LABEL `self-advance` (the breaker and the prompt key on it), and the bridge led the reply with that label. Before `6f14d6a12` (2026-09-30) the wake filter matched a name anywhere, so those replies still woke their requester when they named it; after the filter was anchored to the opening name, they woke nobody — 2 of 2 since, one a Step-4 send-back read ~15 h late.
- `langston_queue.recipient_name(task, kyle_id)` — the one resolution site: `addressee` → `Kyle` by id (only when `kyle_id` is set) → display name.
- `langston_queue.lead_with_addressee(text, task, kyle_id)` — the posted text; `(self-advance)` only when the bridge leads with a real addressee; no requester ⇒ byte-identical to before.
- The bridge stores the RESOLVED name as the queue item's `requester` (a Kyle item stores `Kyle`, Langston Step-1 condition 2) and carries it to the self-advance task as `addressee`.

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (`#1177` as filed): 35 replies named a session and none woke it. NOW: 33 of the 35 woke** (the filter matched a name anywhere until 2026-09-30); **since then 2 of 2 could not.** REASON: Langston, Step 1 condition 1.
- **PREVIOUSLY STATED (scope r2): the recipient rule stays in the bridge. NOW: in `langston_queue.py`.** REASON: the bridge loads tokens at import, so no test can import it.

## OBJECTIVES
| obj | result | evidence |
|---|---|---|
| OBJ-1 a self-advance reply opens with the requester | PASS | CI step "Langston queue tests": 90/0 (the suite's first CI run); mutations 86/4 and 89/1, reproduced by Langston |
| OBJ-2 the unchanged filter wakes the addressee | PASS | CI "Wake filter tests": the new form wakes CC-A; the pre-batch form wakes nobody (control); another session's lead is silent |
| OBJ-3 the installed bridge is the reviewed blob | PASS | idle-gated install; pre-restart `ls-remote` as `langston` → `34fa9e330`; sha256 = blobs (bridge `90e196b4…`, queue `29c06022…`); restart 04:55Z; a reply came back (inbox line 26868); Infra Claude verified his leg (#1023). Laptop filter `c4478115…` = blob |
| OBJ-4 live: the first self-advance reply wakes its requester | ⏳ OPEN — alert `3668b78b` | see OPEN AT CLOSE |
| OBJ-5 docs | PASS | System Impact Map fabric row; wake-watcher runbook §4; filter comments (`:185`, `:1085`) |

## CI (per job)
Run `37728879498` at `34fa9e330`: TypeScript Check ✅ · Test Suite ✅ · Build ✅ · Docker Build ✅. Review-branch run `37726402568` at `34e51a966`: 4/4.

## GOVERNANCE FILES CHANGED
CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what it does, tests, install, the open alert |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 1v) | ✅ | status Step 11, this report in the report column |
| T1 | PHASE_19_PLAN.md | N/A | the batch's row is sprint row 1v; no row there |
| T1 | shared MEMORY.md + MEMORY_CC_A.md | ✅ | mine: position; shared: §4.5 describes no Langston-reply routing to correct |
| T1 | the batch SCOPE | ✅ | r2 with both Step-1 conditions |
| T1 | the batch PRE_AUDIT | ✅ | approved, both conditions folded |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the Observation column | ✅ | OBJ-4: the first self-advance reply after the restart, on alert `3668b78b` |
| T1 | the four session task lists | ✅ mine / N/A — not mine ×3 | CC-A: row 1v closing |
| T1 | Langston's MEMORY.md | ✅ | via `langston-memory-write`: closed-batches line covers #1177 |
| T2 | SYSTEM_MANUAL.md | N/A | nothing under server/, client/ or shared/ changed |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | the Discord fabric bridge row: the lead rule's home and the self-advance case |
| T2 | RUNNING_ISSUES.md | ✅ | `#1177` corrected (33 of 35 woke) and done note |
| T2 | CHANGES_AND_FIXES.md | N/A | no trading-system bug or risk |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase item |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no parameter |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional change |
| T2 | STORAGE_POLICY.md | N/A | no storage changed |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | no VTS code |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no asset-class learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role or gate changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his model, runtime and invocation are unchanged by this batch; the read-path change that rode the install is Infra Claude's, recorded on #1023 |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no rule changed |
| T2 | CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed |
| T2 | MISTAKE_PATTERNS.md | ✅ | wrong-object #14 (named replies counted as lost wakes) |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | process unchanged |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | board unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | no daily check in this batch |
| — | CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md | ✅ | §4: a Langston reply wakes only on its opening name, and queue replies now carry it |

## REVIEW RECORD
Step 1: approved with two conditions (the magnitude with its cut; a Kyle item must resolve to Kyle). Step 2: approved with two (name what rides on the install and gate it before restart; the size in §A). Step 4: approved, no blockers; one comment added (why the filter suite duplicates the string). Step 8: confirmed; OBJ-4 to an alert, not a progress report.
