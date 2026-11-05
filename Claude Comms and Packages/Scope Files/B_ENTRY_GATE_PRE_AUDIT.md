# B-ENTRY-GATE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (`#1224`) — r2

> **r2 (2026-11-05 ~10:20Z): Langston's Step-2 CHANGES on r1 (msg 1567843791597994065, read at `c47d869`; he re-derived A-2, A-4, A-6, A-7 and A-9 himself and they held).** Folded: **(B1)** P4b states what LIVE mode does: the snapshot live block is NOT retired by this batch; it stays until Kyle answers scope §6.2, and P4 refuses in both modes beside it. **(B2)** P2, P8 and P5's `InvalidTarget` get pre-registered magnitudes. **(3)** P1b gets a flip criterion with a named carrier. **(4)** P11's seeding and P3's live predicate get a named carrier. **(5)** A-4's pointer corrected (P6, not P11). **(6)** `server/services/active-execution-engine.ts` is given its full path `server/services/active-execution-engine.ts` throughout. A-4 now quotes Langston's wider corpus.

change-class: architecture

**Owner:** CC-B (NEW Claude) · **Scope:** r4 + PROCEED (`B_ENTRY_GATE_SCOPE.md`, Langston 2026-11-05 ~08:30Z, msg 1567819543483781191, graded `6faa1102c`) · **Audit read at:** `ebb5950b0` (every `path:line` below is at that sha unless marked) · **Written:** 2026-11-05

> **Two Kyle decisions are still owed (scope §6, sent to PM Claude 08:37Z, msg 1567820259568910349):** (1) a quiet xStock venue under OBJ-7; (2) the live leg of the fill's EV check. **This plan is written so neither blocks Step 3:** OBJ-7's ceiling is a DB setting whose xStock value is set after his answer, and the live leg changes no behaviour while live mode is off. Where his answer changes a plan item, the item says so.

## 0. PREVIOUSLY STATED vs NOW
| # | previously stated | now | reason |
|---|---|---|---|
| 1 | Scope §1: `entryFillShadow` at `:6118`, `refuseTakerBooking` at `:6135` (census at `9b0e830fd`) | `:6159` and `:6176` | line drift across ~40 commits; same code |
| 2 | Scope §1 (r3): the fill's EV lines `:5723`, `:5778`, `:5802` (pinned at `686d62c9e`) | `:5725`, `:5780`, `:5804` | +2 drift, as Langston noted |
| 3 | Scope OBJ-11: "the value is set at Step 2 from the measured plan-age distribution against outcomes" | **Not settable at Step 2: plan age at open is not recorded on any trade.** OBJ-11 splits into a stamp now and a value later (A-7, P7) | `closed_trades` has no queued-at, signal-id or plan-age column (A-7) |
| 4 | Scope OBJ-3: a resting maker whose ask leaves the window is cancelled, live | **The maker leg ships in SHADOW first** (A-5, P3) | the measurement Langston asked for needs a rest-by-rest ask history the system does not keep; 26 h of logs hold 7 resolved paper rests (2 filled, 5 never filled) |
| 5 | Scope OBJ-4: an absent net EV at the SQE becomes its own refusal; "Step 2 counts how many" | **0 of 129** queued rows lack it, and none can: the queue write refuses a non-finite EV | A-3 |

## 1. Sources read (the six)
| # | source | read |
|---|---|---|
| 1 | Code at `ebb5950b0` | every component in §2 below, by `git show`, not grep alone |
| 2 | Runtime logs + database | staging `out.log` and its rotations from 2026-11-04 18:02Z to 08:40Z on 11-05 (the oldest kept file starts 11-04 06:38Z); `rtb_signals`, `closed_trades`, `active_trade_logs` columns; the `rtb_signals` census at 08:39Z |
| 3 | `SYSTEM_IMPACT_MAP.md` | §4.2 SQE, §4.3 RTB, §4.4 TCL watchdog |
| 4 | `SYSTEM_MANUAL.md` | §12 SQE, §19 RTB promotion (19.0-19.3), "Net EV Gate (11.8B-A2)" (`:7061`), P19-B7.2 / B7.2c (`:530`, `:596`) |
| 5 | Ledger + reports | `RUNNING_ISSUES` `#1224`, `#1051`, `#522`, `#523`; the scope's §2 provenance rows |
| 6 | `bridge/canonical/` | **consulted, no coverage**: the entry window, the SQE NetEV gate and the maker lifecycle all postdate the 2026-01/02 governance change. `ENTRY_PREMIUM_BPS` predates it and is covered in A-9 from the spec it came from |

## 2. The audit

### A-1. Entry points — enumerated repo-wide FIRST (§9.5(a-ii))
**Who creates a queued plan:** exactly ONE writer, `queueSQESignal` (`server/core/rtb/ready_to_buy_service.ts:2075`), called from exactly ONE site, `server/services/signal-orchestrator.ts:1507`, inside `buildSizedSignalForStrategy` (`:553`). Its callers: the crypto cycles (`:2365`, `:2778`) and `dispatchExternalSignal` (`:541`), which is how xStock arrives (`server/asset_classes/xstock_spot/active-dispatch.ts:234`, from `eval-cycle.ts:1385`). **One convergence point for both classes.** Positive control: the same `git grep` finds both crypto call sites and the xStock one.
**Who schedules work against the queue:**
- the refresh, `RTBRefreshService` (`server/services/rtb-refresh-service.ts`), started unconditionally at boot (SIM §4.3), calling `refreshAndRank` (`ready_to_buy_service.ts:820`);
- promotion, `checkRtbPromotion` (`server/services/active-execution-engine.ts:5243`), from three triggers (`:1178`, `:1198`, `:1249`) plus the trailing re-run (`:5447`), serialized by the `#508` latch (System Manual §19.1);
- the resting-maker monitor, `_processPendingMaker` (`:1813`), called once per exit-monitor tick (`:2871`).
**Two or more schedulers over one queue ⇒ mutual exclusion:** promotion is latched (`#508`); the refresh and promotion are not mutually excluded today, and this batch adds no shared write between them (OBJ-7's columns are written only by the refresh and read only by promotion). Recorded, not changed.

### A-2. The births' SQE runs in shadow mode for ONE gate only
Both the birth (`signal-orchestrator.ts:1167`) and the refresh (`ready_to_buy_service.ts:1093`) call the SQE with `gateShadowMode: true`. That flag disables only the Governance sub-gate (Kyle 2026-09-12, "leave it off"); every other failure, NetEV included, is real. **So OBJ-2's "shadow at birth first" cannot reuse this flag** — it needs its own per-gate shadow (P2).

### A-3. The SQE's NetEV check is never reached with an absent EV, by construction
- Birth passes `_mtPolicyDecision.chosenNetEV` (`signal-orchestrator.ts:1160`).
- The refresh passes this tick's re-decide, else the stored value (`ready_to_buy_service.ts:1086-1087`).
- The queue write refuses a non-finite EV outright (`ready_to_buy_service.ts:2116`, the `SNAPSHOT_INVALID` throw), so no stored row can lack it.
- **Measured 08:39Z:** 129 queued rows (paper crypto 52, paper xStock 77), **0** with a null `chosen_net_ev`. *(Snapshot, single moment; the structural reason above is the evidence, the count is the control.)*
⇒ The fail-open at `signal_quality_evaluator.ts:365` / `:581` is dead in practice. Making absence a refusal (OBJ-4) changes no row today and closes the path for the future.

### A-4. The refresh SQE refusal is a queue DELETE, and today the NetEV leg of it never fires
`!sqeResult.passed` → `bulkDeletes` (`:1108`) → `deleteRtbSignalsByIds` (`:1193`); the exploration stamp is the only reprieve (`:1101-1103`). The log line is `[11.0E][SQE_REVALIDATION_FAIL] … reason=<all failures joined>` (`:1105`; `reason` is `failures.join('; ')`, `signal_quality_evaluator.ts:510`).
**Baseline:** over my window (2026-11-04 18:02Z → 11-05 08:01Z, three rotated `out.log` files) **31** refresh deletions, all `RegimeWeight < 0.3`, 0 `NetEV`; **over the whole kept corpus (all eight rotated `out__*.log` plus `out.log`, from 2026-11-04 03:31Z), Langston re-derived 41, all 41 RegimeWeight, 0 NetEV.** The 41 is the figure of record. Reason: the refresh re-decides net EV only when the geometry throttle fires, and then at the STORED plan prices (`:689-693`). **OBJ-6 creates a new eviction stream** (net EV at the fresh ask), so it gets its own pre-registered magnitude (Step 7, the P6 bullet), and the `[11.8B]` paper shadow's safety argument (refresh deletes the negatives) becomes TRUE for price moves, which it is not today.

### A-5. The resting maker: no predicate for "the market left the plan", and no history to measure one against
`evaluatePendingMaker` (`server/core/trading/pending-maker-logic.ts:48`) returns fill / drop / rest. A maker transacts at its LIMIT, the plan's entry (`server/services/active-execution-engine.ts:5970`, `_b72cLimit = signal.entryPrice`), so the price paid never leaves the plan; what moves is the chance of filling. `vwap_pullback` (76 of 161 graded opens) buys a pullback, so cancelling a resting bid because the ask ran up cuts against its thesis.
**Measured:** the logs kept (from 11-04 06:38Z) hold **7** resolved paper rests since 18:02Z: **2** `MAKER_FILLED:paper`, **5** `MAKER_NEVER_FILLED:paper`. No table records the ask during a rest. **So "how many would the cancel remove, and how many of those would have filled" cannot be answered from what exists** ⇒ P3 ships the maker leg as a recorded would-cancel, not a cancel.

### A-6. The fill's EV decision (scope §1/§2, re-read)
At `ebb5950b0`: the taker recompute `:5725` decides nothing; `_b72IsTradeable` (`:5780`) on the stored snapshot decides; `resolveEvBlockDisposition` (`:5804`, pure, `server/services/ev-block-disposition.ts`) routes SHADOW / BLOCK_EV_REJECT / BLOCK_SNAPSHOT_MISSING; the maker-marketable conversion reads the stored taker EV (`:5970-5981`). **`BLOCK_SNAPSHOT_MISSING` is unreachable:** the `POLICY_SNAPSHOT_MISSING` return (`:5770-5778`) catches every non-finite snapshot first, so the reject text at `:5839` describes a path that cannot run.

### A-7. Plan age at open is not recorded on any trade
`closed_trades` carries `opened_at`, `phase_age_seconds`, the book ages and `intended_entry_price`, but **no queued-at, signal id or plan age** (column census 08:45Z). The queue itself holds plans aged p50 **9.70 h** (crypto, n=50) and **15.00 h** (xStock, n=77), max **27.58 h** (snapshot 08:39Z). **The scope's "set the limit from plan age against outcomes" has no data to run on.** Langston's 11-04 finding (age does not separate the zero-win band) stands as the reason the limit is hygiene, not quality.

### A-8. The RR / target-reach gate sits after the queue write (scope OBJ-8, re-read)
`normalizeAndGateTarget` (`signal-orchestrator.ts:1929-1934`) runs after `queueSQESignal` (`:1507`); a drop returns `null` (`:1948`) with the row already queued. Structural fact, not a defect claim (`#1051` withdrawn 2026-09-12); the move is Kyle's decision 8. **Not only a gate: it may replace the target** (`_b2Target = _b2.targetPrice`, `:1950`), so moving it ahead of the write also means the queue stores the normalized target, which is what the fill uses today anyway.

### A-9. `ENTRY_PREMIUM_BPS` — disposition (5), delete
Declared at `server/strategies/strategy-helpers.ts:24` in `GLOBAL_CONSTANTS`; **no reader** at the ref: no `ENTRY_PREMIUM_BPS` hit outside the declaration, and no indirect read of the object (`GLOBAL_CONSTANTS[…]`, `Object.entries(GLOBAL_CONSTANTS)` and spread all return nothing). Positive control: the neighbouring `MIN_STOP_DISTANCE_BPS` returns readers in four files. **History (`git log -S`, first hit):** `aa2698233` (2026-03-03), *"Batch 12: Directive 12.3.2 (Spec Phase) — Place vetted strategy specification … Documentation only, no code changes."* The spec it placed defines `entryPrice = currentPrice x (1 + ENTRY_PREMIUM_BPS / 10000)`, "for limit entry". **The intent (a limit set a little above the price) was never built;** a dead "entry premium" beside a new entry window invites re-use. Deleted under rule 18.

### A-10. Governance gaps found
- **SIM §4.2 (SQE) does not list the NetEV admission gate** (B8.5a, 2026-07-13) among what the SQE evaluates; it still reads "FinalScore, RegimeWeight, ROI, confidence floor".
- **System Manual "Net EV Gate (11.8B-A2)" (`:7061`) is the VTS-era description** and is silent on where the deciding number is taken at the fill (the snapshot). Both are corrected at Step 10 by this batch.

### A-11. The xStock birth already has a freshness checkpoint
`dispatchXstockActiveSignal` refuses a signal whose latest tick is older than `activeFillMaxAgeMs` (`active-dispatch.ts:181-186`) and raises the "xStock active fill blocked — stale price" alert. **Those alerts are BIRTH refusals, not fill refusals,** despite the title. OBJ-10 keeps this reader and ceiling; the alert title is left as is (not this batch's surface) and noted for Step 10.

## 3. The plan
Every item names the finding it falls out of. Increments as scope §4: **A at the fill, then B in the SQE and refresh.** **A deploys after 2026-11-07T13:03:42Z** (scope §5).

### Increment A — at the fill
| # | item | from |
|---|---|---|
| **P1** | **Worse-side window at the taker fill (OBJ-1).** After the book walk, beside `refuseTakerBooking` (`:6176`): refuse when `(fill − plannedEntry) / (plannedEntry − stop) > w`, `w` = `entry_window_worse_side_frac` (DB, per class, seeded 0.25; fail-hard if absent). Archive `rejectStage: 'entry_fill'`, reason `entry_window`. Below plan is never refused by the window. | scope OBJ-1, A-6 |
| **P1b** | **Cheaper-side floor, shadow (OBJ-1b).** Record `remainingRiskFrac = (fill − stop) / (plannedEntry − stop)` and `belowFloor = remainingRiskFrac < m` (`entry_cheaper_side_floor_frac`, DB, seeded 0.40) on every taker fill below plan. Never refuses. **Flip criterion (r2, Langston 3), pre-registered:** once **30** below-floor taker fills have CLOSED, if they hold **≤ 2 target exits** and a **negative net P&L**, the live switch goes to Kyle as a decision (KD-10 made it watch-only; the switch stays his). The prior is Langston's 11-04 cohort at this boundary: 40 opens, 40 `stop_hit`, 0 winners. **Carrier:** a system alert minted at increment A's deploy (owner CC-B) that counts the closes and fires at 30. | scope OBJ-1b |
| **P4** | **The economic test at the fill REPLACES the snapshot sign check (OBJ-4).** One deciding number: net EV for the arm that fills, at the price paid, with that arm's actual fees, through the same kernel (`evaluateTradeExpectancy` at the fill price; a maker at its limit with no fill-probability weight). Missing win probability ⇒ refuse, no default. The snapshot keeps `POLICY_SNAPSHOT_MISSING` and becomes a drift ALARM in both modes. **Exploration-stamped paper opens are exempt and shadow-recorded.** The maker-marketable conversion (`:5970-5981`) uses this test at the live ask. Friction-coverage `k` (`entry_friction_coverage_k`, DB) recorded in shadow. | A-6, scope OBJ-4 |
| **P4b** | **`resolveEvBlockDisposition` re-shaped, LIVE stated (r2, Langston B1):** in PAPER the snapshot is an alarm only and P4 decides. **In LIVE the snapshot's `BLOCK_EV_REJECT` arm is NOT retired by this batch** — it is a real-money fail-safe reserved for Kyle's `#522` ratification (`server/services/ev-block-disposition.ts:6`, `server/services/active-execution-engine.ts:5836`). Until Kyle answers scope §6.2, live refuses on EITHER number (the snapshot block, unchanged, and P4); nothing lapses. If he accepts §6.2, the snapshot live arm retires in a follow-up change reviewed on its own. `BLOCK_SNAPSHOT_MISSING` and its reject text (`:5834-5841`) are deleted as unreachable (rule 18, `DELETED_COMPONENTS_LOG`); `server/tests/unit/ev-reject-shadow.test.ts:29-30` (the null arm) is rewritten to the new outcomes, not deleted. | A-6 |
| **P3** | **Resting maker: would-cancel in SHADOW (OBJ-3, changed).** On each monitor tick record whether the live ask sits above the window (`wouldCancel`, first time and count); on resolution record fill or drop. No cancel. The live predicate is decided from that record. **Carrier (r2, Langston 4):** the same deploy-time alert as P1b's, set for 7 days after increment A's deploy, which reports would-cancels against eventual fills and puts the predicate to Langston. | A-5 |
| **P3v** | **The VTS applies P1 at its entry** (it has no SQE or queue): crypto `vts-runner.ts` and xStock `eval-cycle.ts`, recorded as a VTS refusal. | scope OBJ-3 |
| **P5** | **Ride-along:** delete the three `* 1.02` target fallbacks (`ready_to_buy_service.ts:1778`, the shadow pool `:1933`, `server/services/active-execution-engine.ts:5459` promote path) and add the hard `InvalidTarget` SQE rule; reconnect the dead refresh logs (P9); delete `ENTRY_PREMIUM_BPS` (A-9). | scope OBJ-5, OBJ-9, A-9 |
| **P7a** | **Stamp plan age at open:** `planQueuedAt` and `planAgeMsAtOpen` onto the trade record (metadata, no schema change). | A-7 |

### Increment B — in the SQE and the refresh
| # | item | from |
|---|---|---|
| **P2** | **`SQEInput` gains the plan (entry, stop, target) and a priced input (price, age, source); gate `EntryWindow` joins both canonical gate-id lists.** At birth it runs with a NEW per-gate shadow (not `gateShadowMode`, A-2): it computes and records, never refuses, until the birth magnitude is known. | A-2, scope OBJ-2 |
| **P6** | **The refresh re-prices the plan at the fresh ask every priced pass:** net EV, maker/taker choice and the window AT THAT PRICE; plan prices never move; no price ⇒ no decision and never a retirement. | A-4, scope OBJ-6 |
| **P4s** | **The SQE NetEV check, both copies (`:365`, `:581`):** fed P6's re-priced EV at the refresh; an absent EV becomes its own refusal `NetEVMissing` (not the `NetEV ` prefix); the stale comments (`:119-126`, `:358-364`, `:579-580`) corrected. One test runs both copies. | A-3, scope OBJ-4 |
| **P7** | **Priced pass + promotion (OBJ-7):** new `last_priced_at` and `consecutive_unpriced_passes`, both OUT of the upsert SET; promotion needs a priced pass within `promotion_price_max_age_ms` (DB, per class). **xStock value set after Kyle's §6.1:** if he takes (b), the value covers the quiet periods measured from the refresh's priced-pass record over one week; if (a), it equals the crypto value. | scope OBJ-7 |
| **P8** | **The RR / target-reach gate moves ahead of the queue write**, and the queue stores the normalized target. | A-8, scope OBJ-8 |
| **P11** | **Stale-plan limit, value from data (OBJ-11):** `rtb_plan_max_age_ms` (DB, per class) is seeded only after P7a has stamped one week of opens; Step 2 of increment B shows the chosen value cuts no net-positive cohort. Until then the reader exists and the row is absent ⇒ the limit is OFF and says so in the log, never a silent default. **Carrier (r2, Langston 4):** a system alert minted at increment A's deploy (owner CC-B) for 7 days after it, which pulls the stamped plan-age distribution against outcomes and opens the value proposal. | A-7 |
| **P12** | **Exploration lane pins (OBJ-12):** the `NetEV ` prefix pinned at both SQE sites; `EntryWindow`, `InvalidTarget` and `NetEVMissing` pinned off it. **What the lane admits on after P6, in plain terms:** a signal whose ONLY failure is that its profit, re-priced at the current ask, is not positive. Today it is the profit at birth. | scope OBJ-12 |
| **P9** | **Dead refresh logs:** `logRtbTrace` (`:1350`) and `logSqeRejection` (`:1382`) rewritten as ESM imports with a logged catch. | scope OBJ-9 |
| **P10** | **Freshness:** each checkpoint keeps its reader and ceiling (incl. the xStock birth gate, A-11); each records the age and source it judged. | scope OBJ-10, A-11 |

### Tests (each must go red under a named mutation)
Window edges both classes (+25 % passes, one tick above refuses, any below passes); P1b at `m ± 1e-6`; P4 at net EV `0 ± 1e-9`, missing pWin refuses, an exploration open passes and is recorded, an RR floor mutation goes red; P4b matrix; P3 records and never cancels; P12 prefix pins at both sites; P4s one test over both copies; P7 never-priced not promoted, re-issue starts NULL; P8 spy proves the gate runs before the write; P11 absent row ⇒ off and logged.

### Step 7, pre-registered (magnitudes, per class, first full session after each increment)
- **Window refusals at the taker fill:** expected **3-8 %** of admitted xStock taker opens. Basis: all history 20 of 266 = 7.52 %; the 19-day sub-window to 11-05 3.11 % (Langston's numbers, his windows). Crypto ~0 % (0 of 16). **INVESTIGATE above 25 %**, or if the open rate halves.
- The `adverseR` distribution of ACCEPTED fills; P1b's below-floor count and outcomes as they close (the OBJ-1b cohort passes P4 by construction, so its outcomes are the only evidence for the watch-only floor).
- P4 refusals at the fill; the drift-alarm count; exploration opens before/after.
- P3 would-cancels and their eventual fill/drop.
- **P6 refresh deletions attributable to the re-priced EV**, per class (baseline 0 of 31 refresh deletions, A-4). **INVESTIGATE** if they exceed the RegimeWeight deletions, or if the queue's median size halves.
- The priced-pass ratio and promotion refusals for staleness.
- **P2, the birth shadow (r2, Langston B2):** per class, the share of births whose fresh ask sits outside the window (`EntryWindow` would-refuse). **Its exit gate is this number:** after one full session per class, it goes live only if the would-refuse share is **≤ 25 % of births**; above that the gate stays in shadow and the share goes to Langston, because a window that refuses most births at birth is refusing the plan's own reference price (A-2's 7.5 bps at the minimum stop). Expected: well above the fill rate, because the plan's entry is a bar close or a mid, never the ask.
- **P8, the gate moved ahead of the write:** baseline over the kept warn-log corpus (`error__*.log` + `error.log`, from 2026-10-22 00:00Z to 11-05 ~10:10Z, ~14.4 days): **3,358** `[reorg-B2][TARGET_GATE][active] drop` lines, about **233 a day**, each a row written to the queue before its drop. By reason and strategy: `rr_below_min` `reverse_impulse` 919, `inside_bar_reversal` 841, `pivot_shift` 469, `defensive_hedge` 284, `morning_star` 16, `range_trading` 3, `vwap_pullback` 1; `unreachable` `sma_trend_ride` 452, `vwap_pullback` 351, `vwap_bounce` 15, `range_trading` 6. **Expected after P8:** the same drop count, and that many fewer queue writes. **INVESTIGATE** if queue admissions fall by more than the drop count, or if any strategy's admissions go to zero.
- **P5's `InvalidTarget`:** expected **0** refusals (0 of 58 live rows had a null target, Langston, `RULED ON REPORTED FACT` in the scope). **INVESTIGATE at any refusal.**

### Doc set (architecture)
scope, this file, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_MANUAL` (§12 SQE gate list, §19 promotion, "Net EV Gate", the fill's EV), `SYSTEM_IMPACT_MAP` (§4.2 incl. the NetEV gap, §4.3, the pending-maker monitor, the exploration lane), `RUNNING_ISSUES` (`#1224`, `#1051`, `#522`), `DELETED_COMPONENTS_LOG` (fallbacks, `ENTRY_PREMIUM_BPS`, `BLOCK_SNAPSHOT_MISSING`), the plan line, the task list, memory.

## 4. In plain words
The audit found that today nothing at the moment of buying checks profit at the price actually paid, and the queue's re-check never throws a plan out for profit (31 of 31 drops yesterday were for a market-fit score). It also found two measurements the scope asked for cannot be taken yet: nothing records how old a plan was when it opened, and nothing records the market price while a limit order waits. So those two pieces ship as recorders first and switch on once a week of data exists. Everything else follows the approved scope: first the checks at the moment of buying (after Langston's study ends on November 7), then the checks inside the SQE and the queue.
