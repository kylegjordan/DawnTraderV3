# B-EXPLORATION-LANE-MARKER — COMPLETION REPORT

**Owner:** Claude Analyst (CC-C) · Kyle-directed (scratch list A2) · Closed: 2026-07-27 · change-class: **non_architecture**
**Head at Step-4:** `c753339e9` · CI 4-green (run `30307200206`) · No migration · Deployed with B-EXPLORATION-ANNEAL-CLOSED-FIX in one window (branch head `1c63c07da`), HTTP 200, engine online.
**Scope:** `Scope Files/B_EXPLORATION_LANE_MARKER_SCOPE.md` · **Langston Step-4: APPROVED** (independently re-verified all 3 files at the ref; honest-null mapping correct; shared-table internals unchanged; change-class confirmed).

## Objective
Surface the already-stored `admissionBasis` ('exploration' vs normal net-EV lane) as a **"Lane"** marker column on the paper Open + Closed trade tables. Display-only; removable when exploration mode ends.

## Objectives checklist
| # | Verdict | Evidence |
|---|---|---|
| 1 — Adapter carries `admissionBasis` | **YES** | `paper-trade-adapter.ts`: added to `AdaptedOpenTrade`/`AdaptedClosedTrade`; mapped `metaStr(meta,"admissionBasis") ?? null` in both adapt fns (honest-null). Adapter tests 15/15. |
| 2 — Open tab Lane column | **YES — §9.3 verified** | `paper-open-trades-tab.tsx` Lane `<th>` in extraHeaders + EXPL/em-dash cell. **Staging Open tab:** ONDO/USD (exploration) renders amber **EXPL**; GM/CL/SPGI/TGT (normal) render **—**. |
| 3 — Closed tab Lane column | **YES — §9.3 verified** | `trade-history-tab.tsx` extraHeaders+renderExtraCells on the ClosedTradesTable mount. **Staging Closed tab:** Lane header + EXPL on UNI/LINK/AAVE/USELESS/NEAR/WLD (exploration); non-exploration render —. |
| 4 — VTS tabs untouched | **YES** | Uses the shared tables' default-OFF append props; only the paper mounts pass them (Langston-verified). |

## §9.3 UI verification
Claude-in-Chrome, authenticated staging (`https://188.245.193.8.sslip.io/paper-trading`): Open tab — ONDO EXPL badge + others em-dash, cross-checked vs `metadata->>'admissionBasis'`. Closed tab — EXPL on 6 named exploration rows via the Lane column + tooltip. Both tables render correctly.

## Review trail
Langston Step-4 APPROVED (one non-blocking note: shared closed table empty-state `colSpan={32}` doesn't count the appended Lane column → a no-trades render is one column short; pre-existing shared-table behavior, cosmetic; recorded as a follow-on).

## Bench + tests
tsc: no new errors in the 3 files. `paper-trade-adapter.test.ts` 15/15 green.

## Governance files changed (this close)
BATCH_CATALOG.md · PHASE_HISTORY.md · PHASE_19_PLAN.md (§5 row) · SYSTEM_IMPACT_MAP.md (brief: adapter now carries `admissionBasis` to the client display shape) · this report · scope file · MEMORY_CC_C.md (+ mirror). System Manual: N/A (display-plumbing only). RUNNING_ISSUES: N/A (scratch-list item).

## Open follow-ons (named homes)
- Shared closed-table empty-state colSpan doesn't count appended columns → cosmetic, only on a no-trades render. Home: a one-line fix whenever that empty state is next touched (Langston's noted follow-up).
