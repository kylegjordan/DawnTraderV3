# B-ENTRY-GATE (`#1224`) — PROGRESS REPORT

## OPEN — increments A/B live; increment C backend read captured, UI and Step 8 open

**Owner:** CC-B (NEW Codex on the current increment-C verification)
**Change-class:** `architecture`
**Plan home:** CC-B pre-sprint list item 2
**Parent state:** OPEN (board column Verification) — increment A live and verified (Coltrane `56509024d`); increment B live since 2026-11-13 and verified on its 24 h read (Langston Step-8 PROCEED, Review = Approved, 2026-11-14); the xStock week read led to increment C. Increment C's 2026-11-23 first-session backend read is captured in `Change Lists/B_ENTRY_GATE_INC_C_STEP7_2026-11-23.md`: 0/21 judged xStock birth-phase outcomes refused, with 40 xStock unpriced promotion-refusal events. Step 7 still owes the staging UI smoke-check, then Coltrane's Step 8.

## 1. What the batch is for

`B-ENTRY-GATE` makes an entry remain faithful to the plan from birth through refresh, promotion and fill. It removes fabricated targets, refuses prices and economics that no longer support the plan, records watch-only boundaries before they are promoted, and restores the diagnostics needed to explain each decision.

The parent was split deliberately:

- **Increment A — fill-time contract:** live and verified.
- **Increment B — SQE, refresh and promotion contract:** live since `77f6fd598` (2026-11-13T21:03:55Z) and verified on its 24 h read; its xStock-only arms are read in the week to 2026-11-20.
- **Increment C — per-class birth switch and xStock promotion-age seed:** live since `6a9b6802f` (2026-11-20T23:26:05Z); backend first-session read captured 2026-11-23, UI and Step 8 open.

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

## 6. Increment B — what shipped and what its first 24 h showed

**Shipped** (landed `9d903ea9c` after Langston's Step-4 r5 re-review of the rebase; CI `43467219963` 4/4 on the candidate branch; deployed in OLD Claude's joint deploy `77f6fd598` 2026-11-13T21:03:55Z, restart 698, CI `43505196746` 4/4 at that sha): the SQE plan gates `InvalidTarget` and `EntryWindow` (shadow at birth, enforced on the refresh, judged only for a taker-chosen plan) and `NetEVMissing`; refresh re-pricing of the fixed plan at the live ask (`repriceAtAsk`); `last_priced_at` + `consecutive_unpriced_passes` and the promotion freshness gate (crypto 300000 ms; xStock unseeded); the stale-plan limit's reader (no row ⇒ off); the reward-to-risk/target gate moved ahead of the queue write (`#1051`); three ESM `require()` defects fixed (the TCL event trace writes again). Migration objects verified on staging after the restart.

**Step 7 — the 24 h read** (2026-11-13T21:03:55Z → 11-14T21:04:00Z; object `/root/b-entry-gate-incb-step7-interim-20261114/window-24h.txt`, 355 lines, sha256 `a920643a…5b87`; record `Change Lists/B_ENTRY_GATE_STEP4_INC_B_CHANGE_LIST.md`, commits `7d1ab3919`, `d59215892`, `0c4a50402`), against the change list's pre-registered list:
| registered measurement | result |
|---|---|
| P6 eviction stream (refresh deletions failing only `NetEV ` at the ask, vs A-4's 41 RegimeWeight deletions) | **0** on 325 priced passes (0 unpriced); refresh deletions of any kind 1 (RegimeWeight). On crypto the ask has no decision authority by configuration (below). |
| P2 EntryWindow with full denominator | birth crypto 553 outcomes, 0 judged; birth xStock 5, 1 judged (pass); refresh crypto 325, 0 judged. No refusal in the whole window; "judged 0" on crypto holds by entailment. |
| P2 InvalidTarget | refresh 0; birth 0 failures in 558 checks (carrier control: 180 all-retention rows, both classes). |
| P7 crypto unpriced refusals | 42 on 20 newborn rows, each lasting ≤ 60 s until its first refresh priced it; the 300 s ceiling never bound. |
| P7 xStock week | owed — alert `7de9caf9`, 2026-11-20. |
| P9 TCL trace | `logs/tcl_event_trace_<date>.log` exists and grows (4,642 B by 20:54Z on 11-14); OLD Claude told. |

**Window integrity:** one build across five processes (four deploys in the window, none touching an increment-B file); hour lines print lazily, so hours with no line were empty, and the tallies lost at restarts are named in the record. A sixth deploy (`7c5b45c67`, 21:15Z) fell after the window and changes no increment-B file.

**Step 8:** Langston re-derived the read, sent back four record edits (all folded), and gave PROCEED on the increment (msg 1571289502301814885); Review = Approved on the board.

**What this window does not establish:**
- ⚠️ **Crypto runs `maker_taker.entry_fill_policy = maker_only`, so EntryWindow's judged arm and P6's at-ask taker test cannot be reached on crypto at all.** Both are xStock-only today. Whether crypto stays `maker_only` is Kyle's decision; Langston proposes it for his list (not placed).
- The xStock promotion ceiling is unseeded; its value is decided by the week's record against the prediction filed before it.
- **Increment A carry:** the three inc-A resting-maker watch-only lines in the window (`MAKER_WOULD_CANCEL`, all `outcome=fill`) include UAI at `max_adverse_r = 0.9763` — a fill nearly a full planned risk adverse — recorded for the parent's close.

## 6a. Increment C — first full xStock session

Increment C made the birth EntryWindow switch class-specific (`xstock_spot=true`, `crypto_spot=false`) and seeded xStock promotion-price freshness at 300,000 ms. The authoritative deploy-window amendment registered one full session, 2026-11-23 01:00Z–21:00Z; the alert title's older 11-22 start is superseded by that amendment.

The complete recorded backend population ran on one build, `c21c1502a`, with no app-process or paper-engine restart. The xStock birth tally judged **21 birth-phase outcomes**: **21 passed and 0 refused (0.0%)**, below the >25% INVESTIGATE line. No refusal means no cost cohort: the promised later-open test is N/A, not zero. Crypto remained shadowed and emitted zero live refusal lines. C-4 recorded **40** xStock unpriced promotion-refusal events over **19** distinct RTB rows: **37 events / 17 rows** before 14:30Z and **3 events / 2 rows** during the regular session; all 40 carrier lines paired to their separate unpriced-claim line.

The detailed evidence, controls, rotation census and Step-8 recipe are in `Change Lists/B_ENTRY_GATE_INC_C_STEP7_2026-11-23.md`. Step 7 remains open only for the staging UI smoke-check required by the Codex handover; after that, Coltrane receives the exact pushed ref.

## 7. Pre-registered parent close criterion

The parent may convert this file to `B_ENTRY_GATE_COMPLETION_REPORT.md` only after all of these are true:

1. increment B is landed byte-identically from its reviewed ref or re-reviewed after any difference;
2. fresh CI has TypeScript Check, Test Suite, Build and Docker Build individually green;
3. the landed ref is deployed and its identity/restart boundary is recorded;
4. the first full eligible session is read against the pre-audit's class-separated criteria, including P2's `≤25%` birth-shadow live-switch gate, P6 refresh deletion/queue-size investigation lines, priced-pass/promotion freshness, P8 pre-write conservation, and any `InvalidTarget` occurrence;
5. a failure is acted on, not renamed as delay: fix/re-run, keep a shadow off, or record the governed decision the registered criterion calls for;
6. Coltrane independently confirms the evidence at an exact pushed ref;
7. Step 9 rechecks the whole parent objective set, Step 10 reconciles governance again, and Step 11 records both the increment-B data and the action/decision taken on it.

**Status against this criterion, 2026-11-23:** (1) ✅ increment B landed after re-review; (2) ✅ candidate and deployed CI were each 4/4, and the single build serving increment C's session has CI `44847250518` 4/4; (3) ✅ increment C deployed at `6a9b6802f`, with the full registered session served by `c21c1502a`, restart 714; (4) ✅ the xStock week read and increment-C backend first-session read are captured, including the class-separated birth denominator and promotion-freshness result; (5) ✅ no registered failure fired — xStock birth refusals were 0/21; (6) ◑ Coltrane's increment-C second pass waits on the UI smoke-check and pushed evidence ref; (7) open.

## 8. Governance files changed so far

Increment A (2026-11-10, landed on `migration/aws-supabase` 2026-11-14 at `1bb10641b`): scope, pre-audit, increment-A change list and Step-7 evidence, this progress report, BATCH_CATALOG.md, PHASE_HISTORY.md, SPRINT_TO_LIVE_PLAN.md, CC_B_SESSION_TASK_LIST.md, SYSTEM_MANUAL.md, SYSTEM_IMPACT_MAP.md, RUNNING_ISSUES.md, CHANGES_AND_FIXES.md, ADJUSTMENT_FRAMEWORK.md, ASSET_CLASS_ONBOARDING_WORKFLOW.md, DELETED_COMPONENTS_LOG.md, GOVERNANCE_EXCEPTIONS.md, Langston's MEMORY.md (its MEMORY.md and MEMORY_CC_B.md edits were not carried: stale by landing time).
Increment B (2026-11-14): increment-B change list, `Langston Design Asks/B_ENTRY_GATE_P7_XSTOCK_PREDICTION.md` (items 6-7), this progress report, BATCH_CATALOG.md, PHASE_HISTORY.md, SPRINT_TO_LIVE_PLAN.md, CC_B_SESSION_TASK_LIST.md, SYSTEM_MANUAL.md, SYSTEM_IMPACT_MAP.md, RUNNING_ISSUES.md, CHANGES_AND_FIXES.md, ADJUSTMENT_FRAMEWORK.md, GOVERNANCE_EXCEPTIONS.md, MEMORY_CC_B.md, Langston's MEMORY.md. Ledger: §10.

## 9. Tier ledger — increment A (2026-11-10)

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

## 10. Tier ledger — increment B (2026-11-14)

CHANGE-CLASS: architecture

| # | document | verdict | one-line result |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Added what increment B shipped and verified, and re-stated why the parent is open. |
| T1 | `PHASE_HISTORY.md` | ✅ | Added the plain-language increment-B entry. |
| T1 | active plan `SPRINT_TO_LIVE_PLAN.md` | ✅ | Row 2 of the CC-B list now names increment B live and the 11-20 read. |
| T1 | `PHASE_19_PLAN.md` | N/A | B-ENTRY-GATE has no row in PHASE_19_PLAN; the sprint plan is its authority. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | ✅ | Updated my position block; the shared file sits 32 B under its 24,576 B cap, so no line was added there. |
| T1 | batch `SCOPE` | ✅ | Unchanged; objectives 2, 5-8, 11-12 are increment B's and are graded in §6. |
| T1 | batch `PRE_AUDIT` | ✅ | Unchanged; its increment-B addendum (r10-r13) defines P2, P6-P11. |
| T1 | `COMPLETION_REPORT` | ✅ | This progress report updated in place: §6 rewritten, §7 status, §8, §10. |
| T1 | four session task lists | ✅ mine / N/A ×3 | Updated CC_B_SESSION_TASK_LIST.md; CC_A, CC_C and CC_INFRA lists are not mine. |
| T1 | Langston `/home/langston/MEMORY.md` | ✅ | Replaced the increment-A line with one covering both increments; loaded set 143,407 → 143,394 B (ceiling 143,856). |
| T2 | `SYSTEM_MANUAL.md` | ✅ | Added the increment-B section and three SQE gate rows (InvalidTarget, EntryWindow, NetEVMissing). |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Added increment-B bullets to the orchestrator, SQE and RTB entries (new columns, readers, couplings). |
| T2 | `RUNNING_ISSUES.md` | ✅ | Annotated `#1224` with increment B live, the 24 h result and the 11-20 home. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | Registered FIX-2026-11-13-A (gate after queue write, no live-price re-check, dead fail-open, ESM requires). |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | No phase-level order changed. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | ✅ | Registered `promotion_price_max_age_ms` and `rtb_plan_max_age_ms` and their absent-row-means-off rule. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | Admission gating only; no constitutional authority or operator power changed. |
| T2 | `STORAGE_POLICY.md` | N/A | Two new columns on an existing queue table; no retention or tier changed. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | Reviewed the 15-minute working list; increment B touches no VTS path. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No new onboarding learning; the per-class promotion row follows increment A's coupled-row learning. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role or gate changed. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | No reviewer runtime, model, auth or read path changed. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | No CLAUDE.md rule changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | Increment B removes no module, function, route or type: the SQE's fail-open branch was replaced in place by the `NetEVMissing` refusal (`d37269559`), and the three `require()` calls became imports. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | Three `MISTAKE: wrong-object` trailers written (`7d1ab3919`, `d59215892`, `0c4a50402`) for CC-A's weekly pass; wrong-object is already §13 item 1. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | Re-justified the open row for the 11-20 read and recorded that this report was stranded on a side branch until `1bb10641b`. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | No alert process changed. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | No board field or rule changed. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily check did not run in this turn. |
