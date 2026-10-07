# B-DASHBOARD-STATS-BLANK — Completion note (hotfix)

**Owner:** CC-B (NEW Claude) · **change-class:** `hotfix` · **Issue:** `#903` (closed by this batch) · **Reported by:** Kyle, 2026-10-04
**Scope:** `Claude Comms and Packages/Scope Files/B_DASHBOARD_STATS_BLANK_SCOPE.md` · **Fixes log:** `CHANGES_AND_FIXES.md` FIX-2026-10-04-A
**Deployed:** `3576d39810fa7428501b68ce341ee46533c24935` (deploy B, 2026-10-06T15:45:04Z)

## What broke
Two figures on the staging dashboards were blank.
1. **Paper Trading → Earnings, lifetime rows** showed "—" whenever the selected window held no trades. The analytics route's empty-window return never carried `lifetime`; `567385eae` (B-BALANCE-TRUTH OBJ-4) added it to the main return only.
2. **Main Dashboard → Portfolio Value** never loaded. Three client call sites fetched the token-gated `/api/portfolio/overview` with a bare `fetch`, which sends no `Authorization` header, so it returned 401 on every load. `#903` had diagnosed a race; it is deterministic.

## What was done
`lifetime: _lifetime` added to the empty-window return; `apiFetch` at the three call sites; fence test `server/tests/unit/b-dashboard-stats-blank.test.ts` (fails with the three sources reverted, passes with the fix).

## Langston
Hotfix gate **APPROVED** 2026-10-04 10:54Z at `8e165d1d6`, re-derived at the ref, two conditions met in the follow-up commit: (1) the lifetime check counts only on an EMPTY window — otherwise it is NOT YET RUN, never a pass; (2) the fence's reach stated beside it. CI 4/4 per job, run `37196644270`.

## How it was verified (Claude-in-Chrome, Kyle's session, the same instruments that showed the fault)
| objective | verdict | evidence |
|---|---|---|
| Portfolio Value renders | **YES** | 2026-10-06 15:55Z: $820.00 / 100 % cash; `/api/portfolio/overview?mode=paper` → **200** (was 401) |
| Lifetime rows present on an empty window (condition 1) | **YES** | 2026-10-07 07:34Z: `range=1h` → `totalOpened: 0` and `lifetime` present (`netPnl −29.42`, `timeWeightedReturnPct −3.53`, `tradeCount 30`, epoch `2026-10-06T15:52:57.213Z`). This is the empty-window return — the branch that carried no `lifetime` before. Control: `4h`/`12h`/`24h` (main return) carry the same object |
| The Earnings card shows the rows | **YES** | "Day" view: Lifetime Net P/L **−$29.42**, Lifetime return **−3.5 %** |

⚠️ **Stated, not hidden:** condition 1 was written against `range=24h`. At check time the 24-hour window held 30 opens, so it went through the main return and could not test the fix. It was met on `range=1h` instead: the same early return, which fires for any range with no trades.

## Left open, with its home
The other bare fetches to token-gated routes (17 found, a floor) stay with **row 175 `B-DASHBOARD-AUTH-RACE`, Infra Claude** (§9.4 disposition 2, set at scope time).

## Governance ledger
CHANGE-CLASS: hotfix

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | one entry: what broke, the fix, the result, what row 175 keeps |
| T1 | PHASE_HISTORY.md | N/A | hotfix — judged; the catalog entry and the fixes log carry it |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 175) | ✅ | the hotfix's state: deployed, verified, closed, with this note |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the batch's home is sprint row 175 |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | mine: position; nothing shared changed |
| T1 | the batch SCOPE | ✅ | written at the hotfix step (2026-10-04) |
| T1 | the batch PRE_AUDIT | N/A | hotfix — judged; the audit is the scope's §2-§3 |
| T1 | COMPLETION_REPORT | ✅ | this note |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: the OPEN AND STALLED table rebuilt to today (it named 2 batches; I hold 12); held checks brought current |
| T1 | Langston's MEMORY.md | ✅ | one close line through `langston-memory-write`; two stale CC-B blocks collapsed to pay for it: 105,658 → 104,835 B, ledger 32 = 32, retractions 14 = 14 |
| T2 | SYSTEM_MANUAL.md | N/A | no architecture, strategy, regime, filter, pipeline or math change |
| T2 | SYSTEM_IMPACT_MAP.md | N/A | no component added or re-keyed; one response key, three call sites switched to the existing helper |
| T2 | RUNNING_ISSUES.md | ✅ | `#903` closed in place with the result |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-04-A: verification result appended |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase item changed |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no parameter |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional change |
| T2 | STORAGE_POLICY.md | N/A | no table or retention |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | N/A | no VTS or xStock code |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no asset-class learning |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role or gate changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build untouched |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no rule changed |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed |
| T2 | MISTAKE_PATTERNS.md | N/A | no pattern instance |
| T2 | PRE_LIVE_SPRINT.md | N/A | nothing for after live |

## Honest residual
- The fence proves the three files no longer bare-fetch the overview and that every analytics return carrying `earnings` carries `lifetime`. It does not see a later `lifetime` key placed below an early return and before the next return (Langston condition 2, stated in the scope).
- Only these two figures were checked. The other blank-looking cards on the paper dashboard were not re-audited here.
