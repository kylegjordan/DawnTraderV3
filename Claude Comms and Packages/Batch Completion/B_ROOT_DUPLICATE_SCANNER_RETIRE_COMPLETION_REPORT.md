# B-ROOT-DUPLICATE-SCANNER-RETIRE — Completion Report

**Owner:** CC-B (NEW Claude) · **change-class:** `non_architecture` · **Sprint plan row:** 2a0d, after row 2a0c · **Issue:** `#1161` (closed at Step 10; absorbs `PHASE_19_PLAN` 3n.a)
**Scope / pre-audit:** `Claude Comms and Packages/Scope Files/B_ROOT_DUPLICATE_SCANNER_RETIRE_SCOPE.md` r2, `…_PRE_AUDIT.md` · **Change list:** `Change Lists/B_ROOT_DUPLICATE_SCANNER_RETIRE_STEP4_CHANGE_LIST.md`
**Code:** `5674c012b` (Step 3) → `035d0f7e5` (r2, Langston condition 1; CI `37582589884` success) → `91407e6c9` (record fix, header prose only) · **Deployed:** in CC-C's 10-10 release `ad01f5339b558ee968a7686d719e98b66e5fd01d` (`pm_uptime` 2026-10-10T11:59:18.959Z; CI `38049753797`, 4/4 per job); the running tree since `pm_uptime` 17:05:11.443Z is `e1b37c2d5`, a descendant (CC-C's second deploy).

## 1. What it was for
An old copy of the FX5 scanner sat at the root of the repository. It subscribed to the Central Clock under the same name as the live scanner, so if anything ever loaded it, it would silently replace the live scanner's 30-second tick (`#1161`, found 2026-10-06 by Langston at the heartbeat batch's Step 2). The census around it found a second copy (`BATCH_19G_HF2`), a trading scheduler that was never started but would add its own clock fan-out if loaded, nine root test scripts that CI has never run, and three orphaned services from the Walter era.

## 2. What shipped
| item | change |
|---|---|
| removed | the root `fx5-scanner.ts`, the `BATCH_19G_HF2` copy (three files), the root `trading_scheduler.ts`, `behavioral-template.ts`, `schema-audit.ts`, `provenance-governance.ts`, and the nine root `test-*.ts` scripts — each archived as `.removed`, each with its introducing commit and intent in `DELETED_COMPONENTS_LOG` (Langston C-1) |
| left intentionally | `docs/current_state/screeners_export/backend/fx5-scanner.ts` (an export snapshot, not loadable) and `docs/audits/phase-8.8.1-8.8.2-audit.json` (a frozen audit record) — listed in the log so a later grep does not read them as a missed sweep |
| docs | four Replit-era task docs carry a header pointing at the log instead of instructions that no longer work |
| fence | `server/tests/unit/b-root-duplicate-scanner-retire.test.ts`: every `centralClock.subscribe(` in every `.ts`/`.tsx` from the repository root must be one of exactly five sites with five distinct ids; a planted twin at the root fails both assertions (r2, Langston condition 1 — at r1 it walked only `server/` and `shared/`, where neither retired copy lived) |

## 3. Objectives
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | delete the root scanner twin; live clock subscribers unchanged | **YES** | importer census zero at the ref (control `rtb-refresh-service` 8); at the running tree all 15 fence paths absent, tracked and on disk (Langston); the clock's subscribe lines after the 17:05:11.443Z restart reach `totalSubscribers=5` — FX5Scanner, MarketEventScheduler, RTBRefreshService, TCL_paper, XstockSpotScanner — and 153 later `[CentralClock][HEALTH]` lines all read `subscribers=5` with zero unsubscribes (Langston, recovered from the rotated log) |
| 2 | disposition each root test script with evidence | **YES** | the pre-audit table, one row per script (what it exercises, whether that behaviour still exists, executed or not and why); all nine retired, none executed (Step-1 C5) |
| 3 | correct the Replit-era docs | **YES** | four header notes; the phase-8.8 audit JSON left untouched by design |

## 4. Reviews
- **Step 1:** PROCEED (Langston 2026-10-07), C1-C5 carried; `PHASE_19_PLAN` 3n.a struck and absorbed.
- **Step 2:** approved with C-1..C-4.
- **Step 4:** r1 PROCEED with condition 1 (walk from the root); **APPROVED at `91407e6c9`**, recorded in the change list by CC-C at the 10-10 release.
- **Step 7:** CC-B, `Scope Files/RELEASE_DEPLOY_2026-10-10_PLAN.md` — PASS (the runtime no-change control).
- **Step 8:** **CONFIRMED** by Langston 2026-10-10 20:47Z at the running tree `e1b37c2d5`. He also checked the one oddity: `TCL_paper` subscribes twice because the TCL stops and starts once at boot (sizes 1→2→1→2→3→4→5), not because a duplicate id replaced a handler — the replace-branch message appears 0 times in 12 log rotations, against a control that the string is in the shipped bundle.

## 5. Numeric corrections
- **PREVIOUSLY STATED:** "after the 17:05:16Z restart" (Step-7 record). **NOW:** the restart is `pm_uptime` 17:05:11.443Z; 17:05:16Z is a subscribe line's timestamp. **REASON:** Langston's nit; corrected in place.
- **PREVIOUSLY STATED:** Central Clock subscribe sites "7 code sites, 1 unreachable" (heartbeat pre-audit). **NOW:** 8, 3 unreachable, 5 live — and after this batch, 5, all live. **REASON:** this batch's census found the `BATCH_19G_HF2` copy; corrected in place 2026-10-08.

## 6. New findings / dispositions
None from this batch. (Langston's drift note — that the release record does not declare the 17:05Z second deploy and its CI — is CC-C's release record, routed to CC-C by Langston; not this batch.)

## 7. Governance ledger
CHANGE-CLASS: non_architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 2a0d) | ✅ | at Step 11 with this report |
| T1 | PHASE_19_PLAN.md | N/A — no row there | 3n.a was struck and absorbed at Step 1 (`c11f2f09d`) |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | mine: position |
| T1 | the batch SCOPE | ✅ | r2 |
| T1 | the batch PRE_AUDIT | ✅ | with the per-script table and §D C-1..C-4 |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: 2a0d moved to Step 11 |
| T1 | Langston's MEMORY.md | ⏳ owed at Step 11 | Langston writes his own with his Step-11 confirm; ticked when the write lands |
| T2 | SYSTEM_MANUAL.md | N/A | no live behaviour changed — nothing removed was loaded |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | Step 10: §3.1 Central Clock — the five live subscribers named, and that no non-live copy subscribes (the fence) |
| T2 | RUNNING_ISSUES.md | ✅ | `#1161` closed |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | in-batch (`5674c012b`): the 2026-10-07 entry, with intents and the left-intentionally list |
| T2 | CHANGES_AND_FIXES.md | N/A | legacy removal of unloaded code, not a trading-system bug or risk |
| T2 | POST_AUDIT_ROADMAP.md · ADJUSTMENT_FRAMEWORK.md · AUTHORITY_BASELINE.md · STORAGE_POLICY.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · PRE_LIVE_SPRINT.md | N/A | not touched by a removal of unloaded files |
| T2 | MISTAKE_PATTERNS.md | N/A | no new instance |

## 8. Honest residual
- The fence covers `.ts`/`.tsx` files under the repository root outside directories named `node_modules`, `.git`, `dist` and `tests`. A copy placed inside one of those, or written in another language, would not be seen.
- Nothing removed was ever loaded, so the runtime evidence is a no-change control (the same five subscribers), not a before/after.
