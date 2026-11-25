# B-ENTRY-GATE (`#1224`) — PROGRESS REPORT

## OPEN — three increments shipped; Step 11 observation dispositions pending

**Step 11 close gate (2026-11-25):** Conversion remains pending. CC-B owns the P6 queue-size investigation and P8 conservation investigation on B-ENTRY-GATE (CC-B list item 2, #1224). Coltrane's 10:00:06Z disposition at `674967db8` requires the registered evidence below or an explicit governed amendment. The approved P7 seed remains in service. Its overnight comparison stays OPEN on #1224, with dated alert `79f63a28-da7f-44fa-ba6e-57e686f962d4` for December 1 at 12:00Z.

**Owner:** CC-B (NEW Codex on the current increment-C verification)
**Change-class:** `architecture`
**Plan home:** CC-B pre-sprint list item 2
**Parent state:** OPEN (board column Governance) — increment A live and verified (Coltrane `56509024d`); increment B live since 2026-11-13 and verified on its 24 h read (Langston Step-8 PROCEED, Review = Approved, 2026-11-14); the xStock week read led to increment C. Increment C's 2026-11-23 first-session backend read is captured in `Change Lists/B_ENTRY_GATE_INC_C_STEP7_2026-11-23.md`: 0/21 judged xStock birth-phase outcomes refused, with 40 xStock unpriced promotion-refusal events. The 2026-11-24 Chrome-only staging smoke-check rendered Ready to Buy and both Filter Diagnostics views with populated data and no blank/error state. Coltrane independently reproduced all substantive evidence legs and PROCEEDED the corrected exact ref `65c5926e8`; the parent objective audit passed 263/263 tests and Step 10 reconciled the final governance set. Step 11 is next.

## 1. What the batch is for

`B-ENTRY-GATE` makes an entry remain faithful to the plan from birth through refresh, promotion and fill. It removes fabricated targets, refuses prices and economics that no longer support the plan, records watch-only boundaries before they are promoted, and restores the diagnostics needed to explain each decision.

The parent was split deliberately:

- **Increment A — fill-time contract:** live and verified.
- **Increment B — SQE, refresh and promotion contract:** live since `77f6fd598` (2026-11-13T21:03:55Z) and verified on its 24 h read; its xStock-only arms are read in the week to 2026-11-20.
- **Increment C — per-class birth switch and xStock promotion-age seed:** live since `6a9b6802f` (2026-11-20T23:26:05Z); backend first-session read captured 2026-11-23 and staging UI smoke-check passed 2026-11-24; Coltrane Step-8 PROCEED on corrected exact ref `65c5926e8`; parent Step 9 and Step 10 complete, Step 11 next.

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

**Shipped** (landed `9d903ea9c` after Langston's Step-4 r5 re-review of the rebase; CI `43467219963` 4/4 on the candidate branch; deployed in OLD Claude's joint deploy `77f6fd598` 2026-11-13T21:03:55Z, restart 698, CI `43505196746` 4/4 at that sha): the SQE plan gates `InvalidTarget` and `EntryWindow` (shadow at birth, enforced on the refresh, judged only for a taker-chosen plan) and `NetEVMissing`; refresh re-pricing of the fixed plan at the live ask (`repriceAtAsk`); `last_priced_at` + `consecutive_unpriced_passes` and the promotion freshness gate (at this increment-B boundary, crypto 300000 ms and xStock unseeded; increment C later seeded xStock); the stale-plan limit's reader (no row ⇒ off); the reward-to-risk/target gate moved ahead of the queue write (`#1051`); three ESM `require()` defects fixed (the TCL event trace writes again). Migration objects verified on staging after the restart.

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

The detailed evidence, controls, rotation census, Chrome-only UI smoke-check and Step-8 recipe are in `Change Lists/B_ENTRY_GATE_INC_C_STEP7_2026-11-23.md`. Coltrane independently reproduced the single-build/no-restart boundary, settings consumption, 0/21 birth result with empty/N/A cost cohort, 40-event promotion result, and the narrowed UI rendering claim. He sent back only the mutable deploy-record provenance, then PROCEEDED corrected exact ref `65c5926e81f2fa10f89afbc368caba0d40bce4a3` at 2026-11-24T15:15:47Z after that file was explicitly excluded from the reproduction recipe. Exact-ref CI `45419902706` was 4/4 green. Steps 8–10 are complete; Step 11 is next.

## 6b. Parent Step 9 — all-objectives audit (2026-11-24)

**Implementation audit:** The affected tests and setting reads below establish their stated results. The separate registered P6/P8 observation legs remain open for the parent close gate (§7). Crypto birth EntryWindow remains `shadow_off` because its taker-judged arm is unexercised, the stale-plan value remains deliberately unseeded/off because age did not separate outcomes, and the exact live `ev_reject` drift-alarm carrier remains unobserved.

The implementation-commit census from all three Step-4 records produced **47 unique `server/` or `drizzle/` paths**. Against deployed ref `e3a96a8126f0280a9568bb1823b9210783f0afe0`, **46/47 were byte-identical at this audit head**; the positive control was the one changed path, `drizzle/migrations/MANIFEST.txt`, whose only delta was two unrelated later migration names. All five B-ENTRY-GATE forward migrations remain in the manifest. The complete affected-test population was **18 files / 263 tests**: the 12 core B-ENTRY-GATE and wiring files passed **166/166**, and the six dependency/interaction files passed **97/97**.

The live `dt-sql --csv` setting read ran as `dt_reader` and returned exactly **10 `entry_gate` wildcard-key rows**: two each for worse-side `0.25`, cheaper-side `0.40`, friction coverage `1.0`, birth-live (`crypto=false`, `xstock=true`), and promotion age `300000`. The same readable population is the positive control for the deliberate absence of `rtb_plan_max_age_ms`; its reviewed limit remains off. A source census found `ENTRY_PREMIUM_BPS` absent from `server/` after an `InvalidTarget` control hit, while the complete `1.02` census still found the two unrelated route stop mocks plus test/analysis fixtures. The governed ranker/shadow/open target-fallback fence passed.

| reviewed objective | object re-checked | Step-9 result |
|---|---|---|
| 1 / 1b — worse-side window and cheaper-side shadow | boundary/kernel/engine tests, live class settings, increment-A session | exact edge and one-tick-over behavior pass; cheaper-side stays watch-only |
| 2 — SQE plan gates at birth/refresh | SQE and orchestrator tests, increment-B and increment-C live carriers | refresh enforcement remains live; xStock birth is live and non-vacuously judged; crypto remains safely shadowed pending its own reachable arm |
| 3 — fill and resting/VTS boundary | engine, lifecycle and VTS tests plus increment-A carriers | taker and VTS checks remain deciding; resting maker remains the reviewer-approved watch-only record from pre-audit A-5 |
| 4 — actual-price economics and friction coverage | pure kernel, both engine arms, exploration exception, durable carrier join | actual arm/paid price decides the economics in paper mode; the live snapshot block remains subject to #522. All 11 terminal rows retained complete preceding carriers; coverage remains watch-only |
| 5 — valid targets / no fabricated 2% targets | source fence, `InvalidTarget` tests, complete `1.02` census | three governed fallbacks remain absent; invalid targets refuse or stay out of the queue as designed |
| 6 — fixed plan, re-priced refresh | refresh/reprice tests and increment-B 24 h read | priced passes recompute at the ask; unpriced passes make no decision and change only their counters |
| 7 — priced-pass record and promotion age | priced-pass tests, live rows, increment-C 40-event carrier | new/re-issued rows cannot inherit a stamp; both classes use 300000 ms; unpriced rows remain queued rather than deleted |
| 8 — RR/target gate before queue write | orchestrator wiring tests | below-floor/invalid plans are refused before the queue writer is called. These tests establish call order; the registered live admission-conservation comparison remains open |
| 9 — refresh diagnostics write under ESM | writer tests and the already-observed dated staging trace files | transition trace and SQE rejection writers remain connected; failures remain visible |
| 10 — checkpoint-specific freshness | source/wiring tests and diagnostics carriers | each affected checkpoint retains its own age and source; promotion alone uses the new ceiling |
| 11 — stale-plan reader | reader tests, live ten-row setting population | reader and named refusal path are present; no value is seeded, so the reviewed age-since-restatement limit remains explicitly off |
| 12 — exploration-lane contract | async/sync SQE and lane tests | existing `NetEV ` prefixes remain pinned; `NetEVMissing`, `EntryWindow` and `InvalidTarget` cannot become exploration bypasses |
| 13 — registered magnitudes | increment-A session, increment-B 24 h/week reads, increment-C full session and Step-8 re-derivation | every available magnitude is reported over its named population; empty/unreachable cells remain N/A, shadowed or unverified rather than zero |

The board object was re-read after the Step-10 move: `Status=Governance`, `Owner=Claude New`, `Review=Approved`, `Blocked on=Nothing`.

## 7. Pre-registered parent close criterion

The parent may convert this file to `B_ENTRY_GATE_COMPLETION_REPORT.md` only after all of these are true:

1. increment B is landed byte-identically from its reviewed ref or re-reviewed after any difference;
2. fresh CI has TypeScript Check, Test Suite, Build and Docker Build individually green;
3. the landed ref is deployed and its identity/restart boundary is recorded;
4. the first full eligible session is read against the pre-audit's class-separated criteria, including P2's `≤25%` birth-shadow live-switch gate, P6 refresh deletion/queue-size investigation lines, priced-pass/promotion freshness, P8 pre-write conservation, and any `InvalidTarget` occurrence;
5. a failure is acted on, not renamed as delay: fix/re-run, keep a shadow off, or record the governed decision the registered criterion calls for;
6. Coltrane independently confirms the evidence at an exact pushed ref;
7. Step 9 rechecks the whole parent objective set, Step 10 reconciles governance again, and Step 11 records both the increment-B data and the action/decision taken on it.

**Status against this criterion, 2026-11-25:** (1) increment B landed after re-review. (2) Candidate and deployed CI were each 4/4, and serving build CI `44847250518` was 4/4. (3) Increment C deployed at `6a9b6802f`, with the registered session served by `c21c1502a`, restart 714. (4) The xStock week, C first-session, and Chrome rendering reads are captured. P6's exact queue-size leg and P8 live conservation remain open. (5) Increment C returned 0 birth refusals in 21 judged outcomes. Two earlier INVESTIGATE triggers fired and have the dispositions below. (6) Coltrane PROCEEDED corrected increment-C evidence ref `65c5926e8`. (7) The parent implementation audit and Tier ledger are recorded. Step 11 sign-off remains open.

- **Increment A open-rate investigation:** Equal sessions showed 18 → 3 xStock opens while the paper upstream admission count rose 246 → 324. The original Step 7 record attributed 648 of 650 failed promotion attempts to the existing maximum-total-portfolio-exposure guardrail. The missing friction carrier was corrected and Coltrane confirmed the replacement window at `56509024d`.
- **Increment B P6 investigation:** The week had 22 NetEV versus 13 RegimeWeight refresh deletions across classes. Langston accepted the NetEV deletions as the designed fresh-ask eviction stream. The separate paper ranking-pool read used only nonempty cycles. The xStock median rose 4 → 8. The crypto median fell 2 → 1, which meets the halving threshold on that proxy. Coltrane requires either the actual RTB queue median per class across all eligible cycles, including zeros, over fixed before/after populations, or a governed change to the ranking-pool measure that includes empty cycles and states whether crypto is in scope. The refresh `CYCLE_START` log counts the current bucket's class members across both modes. The live `getQueueDepth` reader counts the whole `active`/`reconfirmed` queue by class and mode. The bucket and ranking samples leave the historical whole-queue comparison open.
- **Increment B P8 conservation — INVESTIGATE:** The pre-audit registered 3,358 drops in ~14.4 days (~233/day), then investigated a larger admission fall or any strategy going to zero. The oldest retained stderr archive starts after that baseline. As a separate matched-duration diagnostic, read the four 14:30–21:00Z sessions on Nov 10–13 (prior to the 21:03:55Z Nov 13 B deploy) and Nov 16–19 (after). Each date's two adjacent stderr archives covered the session. Count exact `[reorg-B2][TARGET_GATE][active] drop` by strategy/reason and daily RTB trace records with `mode=paper, trigger=insertion, oldStatus=none, newStatus=active` by strategy. Session totals in date order: prior insertion attempts 438/399/307/334, drops 169/131/78/116, after attempts 212/93/139/230, drops 411/120/111/504. Over 26 h per side, attempts fell 1,478 → 674 (804), compared with 494 prior drops and 1,146 after drops. Two strategies went to zero post-window attempts: `inside_bar_reversal` (60 → 0) and `reverse_impulse` (29 → 0). Both also had zero post-window target drops. Other strategies supplied positive attempt controls on both sides. `strong_bull_trend` alone supplied 1,009 of 1,146 post-window drops versus 0 of 494 before. The trace excludes reissues and is emitted before the durable upsert. The warning stream does not stamp mode or class. Window duration matches, with candidate mix, deploys and opportunity populations uncontrolled. The wiring tests establish pre-write ordering.
  - **Coltrane disposition and archive cross-check:** The fall in overall attempts is smaller than the 1,146 post-window drops. Each of the two strategies going to zero still warrants investigation. Separate read of `signal_eval_archive` across the same eight 14:30–21:00Z windows, `mode=paper_sim`, for the two strategies and the known-active `strong_bull_trend`: `signal-orchestrator/admitted` recorded 60 `inside_bar_reversal` and 29 `reverse_impulse` before (both `crypto_spot`, all on November 10), and zero rows of either strategy at any archived stage after. Pre-window `rtb-refresh` also recorded 16 and 5 price-shadow events for the two strategies. The control had 828 `signal-orchestrator/admitted` records before and 290 after, with records on every sampled day. At the November 13 deploy ref `77f6fd598`, the orchestrator submits the queue write asynchronously and independently records `admitted`. The insertion trace contains time, mode, symbol and strategy and lacks a shared evaluation ID. Candidate opportunities, upstream dispositions and durable queue outcomes joined to the same evaluations still require an instrument or a governed decision accepting that opportunity and deploy mix confound the two zeros.
- **P7 seed and residual:** Langston approved 300,000 ms with overnight items 2–4 unscored. FE (7/13) and A (8/13) leaned against the proposed cost interpretation. A follow-up diagnostic read all 22 hourly xStock price-share buckets across November 23 21:00Z–November 24 08:00Z and November 24 21:00Z–November 25 08:00Z (11 crypto buckets also matched the same instrument). Nine of the 24 named symbols had at least 20 passes: NFLX 329, PLTR 655, COIN 457, MU 78, KMB 328, DUK 327, ROP 329, A 329 and T 328. The other 15 had zero recorded passes (the nine populated names are the positive control). The first overnight crossed the combined deploy and can lose a partial hour, so this read is a coverage check. CC-B will read the fixed November 24 21:00Z–December 1 08:00Z follow-up at `79f63a28-da7f-44fa-ba6e-57e686f962d4`. Keep #1224 open and manually mint the next dated alert if any of the 24 still falls short. Close only once the original predictions 2–4 can be scored unchanged, or Kyle explicitly retires or amends the residual.

`REVIEWER: pushed progress report + registered parent close criteria and cited evidence · what other states are consistent with the proposed close? · HIT: registered P6 investigation/size proxy, live P8 conservation gap, P7 residual, and paper/live distinction · re-derived y`

`REVIEWER: claim-only · P8 retained-archive and RTB-write coverage · HIT: insertion trace precedes the upsert, and admitted archive emission is independent · re-derived y`

## 8. Governance files changed so far

Increment A (2026-11-10, landed on `migration/aws-supabase` 2026-11-14 at `1bb10641b`): scope, pre-audit, increment-A change list and Step-7 evidence, this progress report, BATCH_CATALOG.md, PHASE_HISTORY.md, SPRINT_TO_LIVE_PLAN.md, CC_B_SESSION_TASK_LIST.md, SYSTEM_MANUAL.md, SYSTEM_IMPACT_MAP.md, RUNNING_ISSUES.md, CHANGES_AND_FIXES.md, ADJUSTMENT_FRAMEWORK.md, ASSET_CLASS_ONBOARDING_WORKFLOW.md, DELETED_COMPONENTS_LOG.md, GOVERNANCE_EXCEPTIONS.md, Langston's MEMORY.md (its MEMORY.md and MEMORY_CC_B.md edits were not carried: stale by landing time).
Increment B (2026-11-14): increment-B change list, `Langston Design Asks/B_ENTRY_GATE_P7_XSTOCK_PREDICTION.md` (items 6-7), this progress report, BATCH_CATALOG.md, PHASE_HISTORY.md, SPRINT_TO_LIVE_PLAN.md, CC_B_SESSION_TASK_LIST.md, SYSTEM_MANUAL.md, SYSTEM_IMPACT_MAP.md, RUNNING_ISSUES.md, CHANGES_AND_FIXES.md, ADJUSTMENT_FRAMEWORK.md, GOVERNANCE_EXCEPTIONS.md, MEMORY_CC_B.md, Langston's MEMORY.md. Ledger: §10.
Parent Step 10 (2026-11-24): this progress report, BATCH_CATALOG.md, PHASE_HISTORY.md, SPRINT_TO_LIVE_PLAN.md, CC_B_SESSION_TASK_LIST.md, SYSTEM_MANUAL.md, SYSTEM_IMPACT_MAP.md, RUNNING_ISSUES.md, CHANGES_AND_FIXES.md, ADJUSTMENT_FRAMEWORK.md, GOVERNANCE_EXCEPTIONS.md, shared MEMORY.md, MEMORY_CC_B.md and Coltrane's memory reference. Ledger: §11.

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

## 11. Tier ledger — parent Step 10 (2026-11-24)

CHANGE-CLASS: architecture

| # | document | verdict | one-line result |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Reconciled all three increments, the final evidence, and the Step-11-only remainder. |
| T1 | `PHASE_HISTORY.md` | ✅ | Added the parent verification result and preserved Step 11 as the remaining close gate. |
| T1 | active plan `SPRINT_TO_LIVE_PLAN.md` | ✅ | Updated both B-ENTRY-GATE plan representations to Step 10 complete with the final result and report link. |
| T1 | `PHASE_19_PLAN.md` | N/A | B-ENTRY-GATE has no row in PHASE_19_PLAN; its authority is the active sprint plan. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | ✅ | Added the settled entry contract to shared memory and advanced NEW's position to Step 11. |
| T1 | batch `SCOPE` | ✅ | The existing architecture scope still defines the parent objectives graded in §6b. |
| T1 | batch `PRE_AUDIT` | ✅ | The existing pre-audit still defines the split, registered observations, and reviewed safe dispositions. |
| T1 | `COMPLETION_REPORT` | ✅ | Updated this progress report in place; Step 11 owns its required rename and final completion gate. |
| T1 | Observation column | ✅ | Every registered increment window has data and a governed decision; no observation remains open. |
| T1 | four session task lists | ✅ mine / N/A ×3 | Updated CC_B_SESSION_TASK_LIST.md; CC_A, CC_C and CC_INFRA lists are not mine. |
| T1 | Coltrane memory store (reviewer-shift substitute for Langston `MEMORY.md`) | ✅ | Recorded the exact verified contract and the completion record a future review should use. |
| T2 | `SYSTEM_MANUAL.md` | ✅ | Added increment C's class-specific birth enforcement, final promotion-age values, and verified boundary. |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | Added increment C's resolver, per-class setting coupling, promotion ceiling, and final report pointer. |
| T2 | `RUNNING_ISSUES.md` | ✅ | Closed the original #1224 symptom and recorded the three-increment verification with Step 11 remaining. |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | Added the class-coupling risk and increment-C fix that prevented an unread crypto arm from being switched live. |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | The batch changes no phase-level order; its Kyle-locked sprint-plan position is unchanged. |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | ✅ | Updated the live birth-switch and promotion-age levers for both classes from the ten-row live population. |
| T2 | `AUTHORITY_BASELINE.md` | N/A | The batch changes trading admission and settings, not constitutional authority or operator powers. |
| T2 | `STORAGE_POLICY.md` | N/A | The batch changes existing settings and queue fields but no retention period or storage tier. |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | The temporary 15-minute working list was reviewed; increment C changes no VTS path or calibration assumption. |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | No new onboarding learning emerged beyond increment A's already-recorded coupled-row rule. |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | No role, workflow gate, or reusable build method changed. |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | Coltrane reviewed this shift, but no reviewer model, runtime, authorization, or read path changed. |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | No stable crew or conduct rule changed. |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | No CLAUDE.md rule was added or materially changed. |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | Re-read the existing increment-A removal record; increments B and C remove no further component. |
| T2 | `MISTAKE_PATTERNS.md` | N/A | No MISTAKE trailer was written and the weekly pass did not run in this governance turn. |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | Retired the declared-open row after all observation data and decisions landed, before alert resolution. |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | Alert state changes follow the existing resolve-after-evidence contract and change no process. |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | The card moved to an existing Governance column; no board field, column, or ownership rule changed. |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | The daily model and feature check did not run in this governance turn. |
