# B-ENTRY-GATE (`#1224`) — PROGRESS REPORT

## OPEN — increment B remains reviewed but unlanded

**Owner:** CC-B / NEW Codex (`codex-b`)
**Change-class:** `architecture`
**Plan home:** CC-B pre-sprint list item 2
**Parent state:** OPEN — increment A is live and verified; increment B still requires landing, deployment, its registered first-full-session read, review and closure.

## 1. What the batch is for

`B-ENTRY-GATE` makes an entry remain faithful to the plan from birth through refresh, promotion and fill. It removes fabricated targets, refuses prices and economics that no longer support the plan, records watch-only boundaries before they are promoted, and restores the diagnostics needed to explain each decision.

The parent was split deliberately:

- **Increment A — fill-time contract:** live and verified.
- **Increment B — SQE, refresh and promotion contract:** Step-4 reviewed at `20404d0a4`, deliberately unlanded until increment A completed its first-full-session evidence and governance boundary.

## 2. Increment A — what shipped

Deployed correction ref: `957b13fde2fdb9b9c12791699b8fabeaa3a9afed`, 2026-11-10T07:48:04Z.

| item | shipped state |
|---|---|
| Worse-side entry window | Active takers refuse when `(fill − planned entry) / (planned entry − stop) > entry_window_worse_side_frac`; exact live value is 0.25 for each class. A cheaper fill never refuses on this rule. |
| Cheaper-side floor | `remainingRiskFrac` is recorded against exact live value 0.40 per class; watch-only, never an admission decision. |
| Resting maker | Would-cancel state is recorded against the same plan window and resolved at fill/drop; watch-only, never cancels the rest. |
| VTS parity | Crypto VTS, its taker twin and xStock VTS use the same entry-window primitive. |
| Fill economics | The realised maker/taker arm is evaluated at the price paid with its actual friction; a non-exploration row requires `netEvAtFill > 0`. |
| Snapshot disposition | Paper retains the old snapshot rejection as a drift alarm; live retains its block pending `#522`; the unreachable missing-snapshot arm is deleted. |
| Friction coverage | A dedicated carrier records probability-free net reward, complete round-trip friction, their ratio and watch-only `k=1` result before later exits can erase the population. |
| Missing targets | Three `entry × 1.02` substitutions are deleted; target-less rows rank last, skip the shadow simulation, or refuse at promoted open. The SQE `InvalidTarget` rule remains increment B. |
| Diagnostics | RTB transition and SQE-rejection writers use ESM imports and surface failed writes. |
| Dead constant | `ENTRY_PREMIUM_BPS` is deleted; it had no runtime reader. |

The live `module_constants` population was re-read on 2026-11-10 before governance: exactly six `entry_gate` rows, one of each constant per class, with `entry_window_worse_side_frac=0.25`, `entry_cheaper_side_floor_frac=0.40`, and `entry_friction_coverage_k=1.0` for both `crypto_spot` and `xstock_spot`.

## 3. Workflow evidence through increment A

| step | evidence |
|---|---|
| 1 — scope | `Scope Files/B_ENTRY_GATE_SCOPE.md`, architecture class; Langston Step-1 PROCEED after revision. |
| 2 — pre-audit | `Scope Files/B_ENTRY_GATE_PRE_AUDIT.md`; plan separates fill-time increment A from SQE/refresh increment B and pre-registers per-class magnitudes. |
| 3 — implementation | Increment-A code and migrations landed before the correction; the friction-coverage correction begins at `fce00c474` and is preserved at deployed ref `957b13fde`. |
| 4 — code review | Langston PROCEED on increment A after the r3 conditions; Coltrane later returned CHANGES on the first session because the promised friction carrier was absent, then the correction was independently reviewed and deployed. |
| 5 — CI | Correction CI `42740349578`: TypeScript Check, Test Suite, Build and Docker Build each succeeded. |
| 6 — deploy | `957b13fde` deployed 2026-11-10T07:48:04Z; exact class rows installed and process identity verified. |
| 7 — verify | Frozen first-full-session window 2026-11-10T14:30:00Z–21:00:00Z: 11/11 complete carriers, 11/11 terminal matches 145–254 ms later, 0/11 below `k=1`; no restart or ref movement. |
| 8 — second pass | Coltrane CONFIRMED exact evidence ref `56509024d`; a 100 ms mutation found 0/11 terminal matches and proved the registered join turns red. |
| 9 — objectives | 8/8 targeted files and 130/130 tests passed; governed runtime/test files were byte-identical to deployed `957b13fde`; three target fallbacks stayed absent with unrelated positive controls. |
| 10 — governance | This progress report and the filled Tier ledger below record the open parent state. |

## 4. First-full-session result against the registered criterion

The registered carrier gate required complete finite fields, exact class settings, no archive-failure line, a same-symbol/same-arm carrier within the preceding 60 seconds for every terminal fill-economics row, and no restart or code movement inside the window. Zero carriers would have been unavailable, not a pass.

**Outcome: PASS for increment A's carrier gate.** The frozen window contained 11 dedicated carriers and 11 terminal admitted rows. All carriers were complete; all terminals matched 145–254 ms earlier; no carrier fell below watch-only `k=1`; both settings rows remained exact; `ARCHIVE_FAILED=0` with log-stream controls; and staging HEAD, liveness ref and process start stayed fixed. Coltrane independently reproduced the result and the 100 ms red mutation.

| asset class | arm | carriers / complete | below `k=1` | ratio range |
|---|---:|---:|---:|---:|
| crypto | maker | 1 / 1 | 0 / 1 | 5.000233 |
| crypto | taker | 0 / 0 | unavailable — no population | unavailable |
| xStock | maker | 5 / 5 | 0 / 5 | 16.979228–31.646783 |
| xStock | taker | 5 / 5 | 0 / 5 | 2.723994–16.727528 |

The `ev_reject` drift-event cell is **UNVERIFIED**, not zero or pass. The session had no exact-path live event, and adjacent `maker_taker` / `sqe_shadow` sink rows do not prove the active-engine-to-`ev_reject` producer path.

## 5. Calibration impact

Increment A changes which fills enter the paper/VTS outcome populations, so it has a named calibration impact. No calibration epoch was bumped: this is an explicit entry-policy boundary, not a retuning of a learned estimator, and every evidence window is split at the deploy. Increment B receives a new post-deploy session of its own; no pre/post population is blended across either boundary.

## 6. Increment B — unproven and required before parent close

Increment B remains at reviewed ref `20404d0a4`. It has not been landed, deployed or observed, so none of the following is claimed live:

- the SQE birth `EntryWindow` shadow and its class-separated would-refuse share;
- refresh re-pricing of net EV, maker/taker choice and the fixed plan;
- priced-pass state and promotion freshness;
- target normalisation/reachability before the queue write;
- the SQE `InvalidTarget` and `NetEVMissing` rules;
- the stale-plan limit and exploration-prefix pins;
- the additional ESM diagnostic writers.

## 7. Pre-registered parent close criterion

The parent may convert this file to `B_ENTRY_GATE_COMPLETION_REPORT.md` only after all of these are true:

1. increment B is landed byte-identically from its reviewed ref or re-reviewed after any difference;
2. fresh CI has TypeScript Check, Test Suite, Build and Docker Build individually green;
3. the landed ref is deployed and its identity/restart boundary is recorded;
4. the first full eligible session is read against the pre-audit's class-separated criteria, including P2's `≤25%` birth-shadow live-switch gate, P6 refresh deletion/queue-size investigation lines, priced-pass/promotion freshness, P8 pre-write conservation, and any `InvalidTarget` occurrence;
5. a failure is acted on, not renamed as delay: fix/re-run, keep a shadow off, or record the governed decision the registered criterion calls for;
6. Coltrane independently confirms the evidence at an exact pushed ref;
7. Step 9 rechecks the whole parent objective set, Step 10 reconciles governance again, and Step 11 records both the increment-B data and the action/decision taken on it.

## 8. Governance files changed so far

Scope, pre-audit, increment-A and increment-B change lists, Step-7 evidence, this progress report, BATCH_CATALOG.md, PHASE_HISTORY.md, SPRINT_TO_LIVE_PLAN.md, MEMORY.md, MEMORY_CC_B.md, CC_B_SESSION_TASK_LIST.md, SYSTEM_MANUAL.md, SYSTEM_IMPACT_MAP.md, RUNNING_ISSUES.md, CHANGES_AND_FIXES.md, ADJUSTMENT_FRAMEWORK.md, ASSET_CLASS_ONBOARDING_WORKFLOW.md, DELETED_COMPONENTS_LOG.md and GOVERNANCE_EXCEPTIONS.md.

## 9. Tier ledger

CHANGE-CLASS: architecture

| # | document | verdict | one-line result |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Added the open parent with increment-A delivery, evidence and increment-B remainder. |
| T1 | `PHASE_HISTORY.md` | ✅ | Added the plain-language increment-A result while naming the open parent. |
| T1 | active plan `SPRINT_TO_LIVE_PLAN.md` | ✅ | Updated both B-ENTRY-GATE plan representations to verified increment A and unlanded increment B. |
| T1 | `PHASE_19_PLAN.md` | N/A | B-ENTRY-GATE has no row in PHASE_19_PLAN; its authority is the active sprint plan. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | ✅ | Recorded verified increment A, the UNVERIFIED drift cell and the Step-11/open-parent handoff. |
| T1 | batch `SCOPE` | ✅ | Existing architecture scope defines the two-increment parent and the fill-to-refresh contract. |
| T1 | batch `PRE_AUDIT` | ✅ | Existing pre-audit defines P1–P12, the split and registered session criteria. |
| T1 | `COMPLETION_REPORT` | ✅ | Created this progress report because the parent cannot truthfully close before increment B. |
| T1 | Observation column | ✅ | Increment A's full-session window is decided; increment B still owes its separately registered first-full-session read. |
| T1 | four session task lists | ✅ mine / N/A ×3 | Updated CC_B_SESSION_TASK_LIST.md; CC_A, CC_C and CC_INFRA lists are not mine. |
| T1 | Langston `/home/langston/MEMORY.md` | ✅ | Replaced the closed Formula Health mechanics line with increment-A state; loaded set fell 143108→143038 bytes. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | Added the fill-time entry-window, paid-price economics, target and carrier contract. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Added the entry-gate components, consumers, class-row coupling and critical blast radius. |
| T2 | `RUNNING_ISSUES.md` | ✅ | Annotated `#1224` with verified increment A and the exact increment-B remainder. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | Registered the unbounded fill, stale economics, fabricated targets and restored diagnostics fix. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | This batch changes no phase-level order; its existing sprint-plan row remains the authority. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | ✅ | Registered the three per-class entry-gate levers and their live/watch-only promotion rules. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | Increment A changes trading admission, not constitutional authority or operator powers. |
| T2 | `STORAGE_POLICY.md` | N/A | The carrier uses existing signal_eval_archive storage and changes no retention or tier. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | Reviewed the temporary 15-minute working list; this batch changes entry parity, not its calibration/reset assumptions. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | ✅ | Added the learning that coupled required rows remain mandatory even when some consumers are watch-only. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role, workflow gate or reusable build method changed. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | Coltrane reviewed this shift, but no reviewer runtime, model, auth or read path changed. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable crew or conduct rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | No CLAUDE.md rule was added or materially changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | The batch already records the three target fallbacks, dead premium and unreachable snapshot removals. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | No MISTAKE trailer was written and the weekly pass did not run. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | Updated the declared-open row from Step 7 to verified increment A and the parent-close condition. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | No ack, resolve, routing or alert-lifecycle process changed. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | No board field, column or ownership rule changed. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily model/feature check did not run in this governance turn. |
