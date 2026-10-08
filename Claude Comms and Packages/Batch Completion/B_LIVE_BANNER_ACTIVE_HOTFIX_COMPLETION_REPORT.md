# B-LIVE-BANNER-ACTIVE-HOTFIX — Completion note (hotfix)

**Owner:** CC-B (NEW Claude) · **change-class:** `hotfix` · **Issue:** `#1160`, the ACTIVE half (the view-default half stays Kyle's decision; the entry stays open for it) · **Plan row:** 2a0h · **Assigned by:** Kyle, 2026-10-07 (traced by CC-INFRA)
**Scope:** `Claude Comms and Packages/Scope Files/B_LIVE_BANNER_ACTIVE_HOTFIX_SCOPE.md` · **Fixes log:** `CHANGES_AND_FIXES.md` FIX-2026-10-07-A
**Code:** `e2b5a84a4` · **CI:** run `37543361562`, 4/4 · **Deployed:** `0c8ef5da2582e03effd21070fb09b9ad5715ed77`, 2026-10-07T15:56:00Z (CI run `37566679783` on that sha, 4/4)

## What broke
The Live Trading page's banner read *"Live Trading Mode • Real capital at risk | ACTIVE"* while the live engine was stopped and only paper ran. The server's `active` flag means "any engine is running"; the banner, the paper start/stop toggle and the filter-health widget read it as though it meant "this mode's engine is running".

## What was done
A shared helper, `shared/engine-active.ts` `isEngineActiveForMode`, answers the per-mode question. The trading hook's per-mode flags come from it, and the mode-agnostic `isTradingActive` was removed from the hook. The banner, the paper toggle and the filter-health widget read the per-mode flag. Test `server/tests/unit/b-live-banner-active-hotfix.test.ts` (8): the measured case, live-only, none, first paint, and fences on the three sites, which fail against the pre-fix client.
⚠️ **Behaviour change beyond the banner:** the filter-health widget now shows paper as running only when the paper engine runs. Before, it showed that whenever any engine ran.

## Langston
Hotfix gate **APPROVED** 2026-10-07 at `e2b5a84a4`. His FINDING-1 (the WebSocket payload carries the same mode-agnostic flag) is homed as `#1164`, row 2a0i.

## How it was verified (Claude-in-Chrome, Kyle's session, 2026-10-07 15:58Z, using the banner itself, the instrument that showed the fault)
| check | verdict | evidence |
|---|---|---|
| Live Trading banner reads STOPPED while paper runs | **YES** | zoomed banner: *"Live Trading Mode • Real capital at risk \| STOPPED"* |
| Paper Trading banner reads ACTIVE; toggle shows running | **YES** | *"Paper Trading Mode … ACTIVE"*; the Paper Trading toggle on, "● ACTIVE" |
| Main Dashboard | **YES** | banner now *"Paper Trading Mode — ACTIVE"*. At 07:34Z the same day, before the deploy, it read *"Live Trading Mode — ACTIVE"* |

## Left open, with its homes
- The view-default half of `#1160` (a fresh browser opens on the live view): Kyle's decision; `#1160` stays open for it.
- The WebSocket payload: `#1164`, row 2a0i (CC-B).
- The main Dashboard showing 0 trades and $0 while the Paper page shows the real counts is a separate question: Stage 4 of the pre-sprint plan (CC-B). It is not this fix.

## Governance ledger
CHANGE-CLASS: hotfix

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | one entry |
| T1 | PHASE_HISTORY.md | N/A | hotfix — judged; the catalog entry and the fixes log carry it |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 2a0h) | ✅ | deployed, verified, closes on Langston's confirm, with this note |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the row is sprint row 2a0h |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | mine: position |
| T1 | the batch SCOPE | ✅ | written at the hotfix step |
| T1 | the batch PRE_AUDIT | N/A | hotfix — the audit is the scope's §2 |
| T1 | COMPLETION_REPORT | ✅ | this note |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: the 2a0h row leaves the open table at close |
| T1 | Langston's MEMORY.md | **OWED** | one close line, written after his confirm |
| T2 | SYSTEM_MANUAL.md | N/A | no architecture, strategy, regime, filter, pipeline or math change |
| T2 | SYSTEM_IMPACT_MAP.md | N/A | client display only; no component added, removed or re-keyed (one shared pure helper; the server payload is unchanged) |
| T2 | RUNNING_ISSUES.md | ✅ | `#1160` annotated: ACTIVE half fixed, entry open for the view-default half |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-07-A, with the filter-health widget behaviour change |
| T2 | POST_AUDIT_ROADMAP.md · ADJUSTMENT_FRAMEWORK.md · AUTHORITY_BASELINE.md · STORAGE_POLICY.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · DELETED_COMPONENTS_LOG.md · MISTAKE_PATTERNS.md · PRE_LIVE_SPRINT.md | N/A | none touched by a client display fix (`isTradingActive` is removed from a hook's return, not a component deletion) |

## Honest residual
- The fence proves the three sites read the per-mode flag; it does not see a new display that reads the server's `active` directly.
- The live arm was verified only in its stopped state. A running live engine has not occurred and cannot until live mode (Phase 21).
