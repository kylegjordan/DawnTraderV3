# B-PRICE-SIDE-BY-JOB row `8a-P4b` — PAPER xSTOCK EXITS AND FILLS ON THE TRANSACTABLE SIDE — PRE-IMPLEMENTATION AUDIT AND PLAN (Step 2)

change-class: architecture

**Scope:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4_SCOPE.md`, approved r2 by Langston at 22:01Z (`e9a6b7f68`). This document covers the paper piece, **`8a-P4b` = X1-X3 plus two label fixes**. `8a-P4c` (VTS) gets its own Step 2. **Status:** `STEP: 2 of 11` · `NEXT STEP: 3 of 11`. **Depends on `8a-P4a` being deployed first** (the guard this piece relies on must be able to release a recovered book).

**r2 — Langston r1 (22:23Z) NOT CLEARED: BLOCKER-1 (the ternaries are not class-exhaustive), BLOCKER-2 (P5 splits a live 8a-P3 series), CONDITION-3 (the in-flight xStock windows), CONDITION-4 (P2's counter), NIT-5 (stale line numbers). Each is folded in §J2b, §K and the plan table, marked *(r2)*.** ⚠️ **Line numbers below are at `055078c02`; head moved by 40 lines at `420c5ba44` (the `8a-P4a` code). They are re-anchored at implementation** (Langston NIT-5: 1543→1556 · 1898→1911 · 2072→2112 · 2267→2307 · 2564→2604 · 2866→2906 · 4760→4800).

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY:** the X0 defaulting at `vts-runner:3150`. **NOW:** `:3152-3153` (Langston). **REASON:** `:3150` is `symbol:`. (VTS; carried to `8a-P4c`.)
- **PREVIOUSLY:** "`:3139` is the only side-bearing read". **NOW:** the sides are selected at `:3137-3138`; `:3139` is the `FROM`. (`8a-P4c`.)
- **PREVIOUSLY:** X4 was listed as a paper cell. **NOW:** it is VTS. Paper's placement marketability is `aee:4743-4744`: `_b72cBestAsk = _gate.snapshot.asks[0]?.price`, **class-agnostic and already ask-derived — no paper cell was dropped** (Langston, r2).

---

## A. AUDIT

### A1. The object each paper xStock cell reads (`origin/migration/aws-supabase`, file `server/services/active-execution-engine.ts`, "aee")

**The one tick.** For an xStock position the exit loop reads `getLatestEquityTick(symbol)` (`aee:1806`), and that tick feeds two things:
- **the mark** `price` — the mid when both sides exist, else `last` (`equity-spot-archiver.ts:210-212`);
- **`raw`**, the sides of the **latest frame**, written on EVERY frame before the mark (`:199-205`).

A missing side lands `null`, and a sent `0` stays `0`. ⇒ **`raw.atMs ≥ tsMs` always:** whenever the risk-derived age ceiling (`aee:1807-1860`) admits the mark, the raw frame is at least as fresh. ⚠️ The raw frame may be NEWER than the mark and carry an absent side. That case is caught next.

**The guard.** `assessBookStateNow` (`aee:1884`) judges that raw frame:
- `!pos(bid)` ⇒ `absent_bid` ⇒ **hollow** (`book-state.ts:181-183`), and the same holds for the ask (`:185-188`). So zero and negative sides are absent.
- The exit path then **refuses** unless the state is `two_sided` AND the comparator is `validated` (`aee:2059-2069`).
- ⇒ **At every line below `aee:2072`, the raw bid and ask are present, positive, two-sided and validated.**
- But they live in a block-scoped destructure (`const { result: _r, cfg: _c, raw: _raw } = _bs`, `aee:1898`) and **are dropped**: `aee:2072` hands on `currentPrice = _eqTick.price`, the MARK.

**The three cells, all below that line:**

| cell | site | reads today | the validated side available at the site |
|---|---|---|---|
| **X1** resting entry fill | `_processPendingMaker` (`aee:1543`), called at `aee:2267` **after** the guard block (so a pending xStock position IS guarded, and its comparator advances) | `safePrice` = the mark (`aee:1565`, `:1577`) | the validated **ASK** |
| **X2** resting target-exit fill | `aee:2564` `_restFillPrice` (xStock arm) | `currentPrice` = the mark | the validated **BID** |
| **X3** stop/target trigger | `aee:2866` `triggerPrice: crypto ? triggerBid : currentPrice` | the mark | the validated **BID** |

**The guard-OFF arm.** `enabled = 0` ⇒ `_bs.ok === false`, reason `disabled`. The code falls through with no judged frame (`aee:1893-1896`, "a guard-off era must stay re-cuttable"), and exits evaluate on the mark today.
⇒ **A design call (J2 below):** with the guard off there is no validated side.

**The paper taker exit FILL is untouched** (Langston r1). `closePosition(…, currentPrice, …)` (`aee:2656`) passes the *requested* price; the fill depth-walks the bids of `xstock_spot_ticker_snap` (`depth-source.ts:47-69`, `aee:3308-3321`), and `actual_exit_price` comes from that walk. **It is already booked bid-derived.** Only the comment at `aee:2656-2658` is false, since it says the decision price *"IS the exit price … by construction"*.

**The stamps.**
- `exit_decision_price` on a taker close = `currentPrice` (`aee:2661`, the mark) — a label. On an X2 rest fill it becomes the bid, as crypto's does (`aee:2583`).
- `entry_decision_price` on an xStock maker fill is the LIMIT today (`8a-P3` §4 call 1); after X1 it is the ask, **one quantity in the column for both classes**.
- `entry_price_source` names the rung.

### A2. Census (§9.5(a))
- **The raw sides:** written only by `parseTickerSnap` (`equity-spot-archiver.ts:199-213`); one map, `latestEquityTick`. Read by the guard (`book-state-tracker.ts:319`), `aee:1806`, and `live-pricing-adapter.ts:78`. This batch adds **readers inside the exit loop only**. No new writer, no deleter, and no new schedule (the same per-tick exit loop).
- **`triggerPrice`** has one construction site for the paper lane (`aee:2866`) and one consumer (`evaluateTECExit`, `tec-evaluator.ts:317-324`), where null ⇒ `no_transactable_side`.
- **`_restFillPrice`** has one site (`aee:2564`), consumed by `evaluatePendingMaker` in the same block.
- **`fillPrice` (X1)** has one site (`aee:1577`), consumed at `:1600`.

### A3. Runtime
- **Paper xStock activity, 09-15 → 09-18:** 10 opens and 11 closes in the `8a-P3` extract window; 4 xStock positions held at 19:00Z today (ANET, AMC, LOW locked; MDB 8% above its stop). xStocks are shut for the weekend and reopen Sunday 20:00 ET.
- **The refusal rate this piece inherits** is the guard's (Langston's counts, `8a-P4a` §A2). Outside the four locked names it runs ≤ 22 frames per symbol in reach, the one-tick post-clear cost. ⇒ **X1-X3 add no new refusal**: they decide only on frames the guard already admitted.
- **Size of the effect.** A stop now fires when the **bid** reaches it, which is **half a spread earlier** than on the mid. Measured half-spreads at today's regular-hours medians (captured ticker, 09-15 → 09-18, the `8a-P4a` query): ANET 0.06% · LOW 0.04% · MDB 0.10% · AMC 0.19%. The paper xStock stop distances this week run **0.35% to 1.7% from entry** (the xStock stop-loss closes on the staging Closed Trades page, 09-15 → 09-18: SMCI 0.35% … IFF 1.7%). ⇒ **Material on the tightest stops, and that is the point:** the live fill would have happened there.

### A4. SIM / SYSTEM_MANUAL
- **SIM:** the `book-state*` entry and the xStock exit path gain *"the guard's validated sides are the decision inputs"*.
- **`SYSTEM_MANUAL` §3.5.1** — the same, plus §18.0's per-job price table for xStock.
- ⇒ **Both are required at Step 10** (the change-class is architecture).

### A5. Ledger and provenance
- The seven dated deferrals in the scope §5 (X1 `aee:1574`, X2 `aee:2563`).
- X3 inherits `8a-P2`'s crypto arm.
- `#943` created the guard with a **refuse ⇒ hold** policy (D3). This piece makes the guard's admitted frame the **only** decision input, which strengthens D3 rather than changing it.
- **No prior intent is disturbed:** the mark was the xStock input only because the side had not been wired (`8a-P3`'s *"unchanged by statement"*).

### A6. `bridge/canonical/`
Consulted by path: the equity feed and the guard both postdate the corpus. There is **no coverage**; that is recorded, not assumed.

---

## J. JUDGEMENT CALLS — attack these

- ⛔ **J2b *(r2, BLOCKER-1)* — EVERY CELL IS AN EXPLICIT THREE-WAY, WITH A NAMED DEFAULT ARM.** `ASSET_CLASS_REGISTRY` has four active classes (`crypto_spot`, `crypto_perp`, `xstock_spot`, `xstock_perp`; `shared/asset-classes.ts:67-105`), and `getActiveOpenPositions` is an unfiltered select (`storage.ts:3772-3777`), so the exit loop is class-total. r1's `crypto ? … : xsBid` would have handed a perp row `null`, which means `no_transactable_side` forever, with the TEC ratchet frozen too, since the early return sits above `tecUpdatePosition` (`tec-evaluator.ts:317`).
  ⇒ **At X1, X2 and X3:**
  - `crypto_spot` → the touch side (unchanged, `8a-P2`/`8a-P3`);
  - `xstock_spot` → `xsBid` / `xsAsk`;
  - **any other class → the mark, EXACTLY as today**, under a comment that names it out of `3n`'s scope and says a new class must be added here deliberately.
  - A fixture drives a `crypto_perp` row through each cell and asserts the mark.
  - Rejected: evidencing that no perp row can exist. An absence needs presence-grade proof, and the registry says they are active.
- ⛔⛔ **J5 *(r2 addendum, found while writing the fixtures — it was NOT in r1 or r2)* — THE xSTOCK DISCONTINUITY SENTINEL NOW RECEIVES THE BID.**
  - `evaluateTECExit` passes the SAME `triggerPrice` to `isDiscontinuityActive(symbol, triggerPrice, tickTs)` (`tec-evaluator.ts:381`, trailing path). That detector is xStock-only (`price-discontinuity-detector.ts:248-250`) and stateful: it compares each call's price with the previous one. `halt_resume_gap` = a gap over 300 s AND a move of 0.5% or more ⇒ DEFER the stop and the target-lock for a confirming tick; `corp_action` = a single-bar move of 40% or more.
  - **Until now its input was the MARK by construction.** Divergence was crypto-only, and the `8a-P1` fence test 2d exists to catch the day that ends: *"IF THIS GOES RED … Re-open the sentinel question — do NOT relax this test."* **X3 ends it, and 2d goes red, as designed.**
  - **The question, re-opened:** feed the sentinel the BID (the series the stop now fires on), or keep feeding it the MARK (the series its 0.5% / 40% thresholds were set on).
  - ⭐ **Recommendation: the BID, i.e. change nothing in `tec-evaluator`.**
    - The sentinel exists to stop a stop firing on a price discovered across a gap. It must judge **the price the stop compares**; a guard that watches the mark while the stop fires on the bid can pass the jump it exists to catch.
    - **Direction of the change:** a bid series moves by more than the mark when the spread widens, so after a >300 s gap more resumes cross 0.5% and are deferred for one confirming tick. That is the detector's own designed fail-safe-skip direction (`:36-39`, cold start). It delays a stop by one tick; it never fires one early.
    - The 40% corp-action arm is unaffected in practice: a hollow bid that could move 40% is refused by the book-state guard before it reaches here.
  - **If ruled the other way:** `TECExitInput` gains a `sentinelPrice` (the mark on xStock) and `tec-evaluator.ts:381` reads it. That is a signature change to a shared evaluator, which is why it is not the default.
  - **Fence consequence either way:** 2d is amended DELIBERATELY and VISIBLY — two classes now reach the trigger, and the sentinel question is answered here, at J5 — never relaxed quietly.

- ⛔⛔ **J5 r2 *(Langston's ruling, 22:45Z)*: the BID is the right series — but the sentinel was NOT lane-exclusive, so feeding it changes nothing in isolation.**
  - **BLOCKER-J5:** `symbolCache` was keyed by symbol alone, and three production lanes advance it for the same xStock: paper (`aee`), VTS real (`vts-runner` `evaluateTECExit`, `triggerPrice: _vtsTriggerPrice`) and VTS shadow. After X3, one machine would take bids from paper and marks from both VTS lanes. A half-spread step can then satisfy the CLEARING test (`|pctFromResume| < 0.5%`) on a still-moving price — **an EARLY stop**, so my "delays, never fires early" was false for the mixed series.
  - **J5b (pre-existing):** the 2-tick deferral was counted in CALLS across lanes.
  - **Built — (b'), lane-exclusive by KEYING:**
    - The detector state is keyed `lane|symbol` (`SentinelLane` = `paper` | `live` | `vts` | `vts_shadow` | `direct_caller`). `isDiscontinuityActive(symbol, price, ts, lane)` takes the lane as a **required** argument, and `ts` became required to allow it. `TECExitInput.sentinelLane` is **required**.
    - Callers: paper passes `this.mode`, VTS real `'vts'`, VTS shadow `'vts_shadow'`. The trailing-controller fallback (direct callers only) uses `direct_caller`.
    - Each lane has one quantity and its own deferral in its own ticks, which discharges J5b.
    - **Not observe-only:** VTS holds xStock symbols paper does not. With paper as the only advancer, those symbols would sit in cold start forever, or read another lane's stale entry.
  - **Consequence, stated: VTS xStock deferral timing changes where paper and VTS held a symbol at once. That is a composition change, so the vts/xstock epoch bump moves into this piece (J4 extended); `8a-P4c` bumps it again.**
  - Fixtures, mutation-checked:
    - separate machines keep separate `lastPrice` series;
    - VTS calls cannot clear paper's post-gap deferral;
    - the lane is a required argument, and each production caller names its own;
    - **re-keying by symbol alone turns both behavioural tests red.**
  - **Fence 2f** (numbered 2e until Step 4 r2) pins, per lane, the lane name AND the trigger quantity each caller feeds; 2d keeps the class three-way.
  - Rider (2): *"a hollow bid is refused before it reaches here"* cites `aee` REFUSE unvalidated (`:2059-2069` at the stamped ref) and the hollow-skip branch above it. Hollow and unvalidated frames `continue` before the trigger is built.
- ✅ **J5 r3 — Langston ACCEPTED (b'), lane-keyed (23:00Z), adding the stronger argument:** observe-only would also have gated VTS's xStock decisions (made on the MARK) on a machine built from paper's BID series — a cross-side leak in the other direction. His five conditions, each folded:
  1. **Non-advance, mutation-grade.** With paper `DISCONTINUITY_ACTIVE` on a symbol, the first `vts` call gets its OWN `cold_start`: not paper's halt, and not inactive. Re-keying by symbol alone turns it red, along with the two lane tests. ✅
  2. **No contradiction between `sentinelLane` and `callerMode`:** `resolveSentinelLane(callerMode, lane)` accepts paper→paper, live→live and vts→vts|vts_shadow, and THROWS on any other pair. An absent lane (untyped callers only — tsc requires it in production) is derived from `callerMode`, which can name only paper, live or the real VTS lane. Fixture-tested. ✅
  3. **`direct_caller` DELETED:** `PositionUpdate.discontinuity` is REQUIRED, the trailing controller's detector fallback is removed (the controller no longer imports the detector), and the lane union has four members. Untyped callers get the no-verdict `{active:false}` that `shouldClosePosition` has always used — never a detector machine. The one production caller, `tec-evaluator`, always passes the pre-resolved result. ✅
  4. **Each lane's call cadence, stated before the deploy** (the gap term uses CALL timestamps):
     - **paper** — the exit loop, ~1.5 s per held xStock position on every admitted tick. Refused ticks (stale, hollow, unvalidated) make no call, so the first admitted call after a refusal run longer than 300 s with a move of 0.5% or more reads `halt_resume_gap` and defers one confirming tick. That is the detector's designed behaviour, and it now also fires after a lock release.
     - **vts** — one resolve pass a minute (the `8a-P3` extract measured 720 passes in 12 h), under 300 s. Weekend-suspended trades are skipped, so the Sunday-evening reopen reads as a gap, correctly.
     - **vts_shadow** — the same pass, and a no-op while `openShadowTrades` is empty (`vts-runner.ts:4117`).
     - ⇒ **No lane's natural cadence exceeds 300 s while it is evaluating.** A false `halt_resume_gap` needs a lane to fall silent past 300 s mid-session, which is a refusal run or an outage — the fail-safe direction.
  5. **Per-lane divergence is EXPECTED BY DESIGN** (two series, same thresholds) and is stated in the detector's own header. `clearSymbolState` clears the symbol on EVERY lane. ✅
  - **Rider (2), corrected cite:** the REFUSE predicate is `aee:2072` at the stamped ref (`if (_r.state !== 'two_sided' || _bs.comparatorValidated !== true)`, `unvalidatedRefusals++` at `:2073`). ⚠️ **It is CONDITIONAL:** with the guard on, a hollow or unvalidated frame never reaches the trigger. **With the guard OFF (the J2 `raw_unguarded` arm) nothing refuses**, so *"a hollow bid is refused first"* is true guard-on and false guard-off. With the guard off, the unjudged raw bid reaches the sentinel.

- **J4 extended:** the migration bumps `calibration_epoch` `xstock_spot` **`paper_sim` AND `vts`** by +1 (both rows asserted present, every other row asserted unchanged). The rollback bumps both again.

**Existing fences this piece amends deliberately (each pinned the old xStock = mark statement):** `b-price-side-8a-p1-exit-fence` 2d (J5); `b-price-side-8a-p3-crypto-finish` "paper C2" (the three-way `_restFillPrice`); `b-exit-provenance-fence` OBJ-9 (`_fillSource` gains the xStock rung before the `provenance.source` fallback).

- **J2c — guard-off frame source (Langston, NIT-5 rider).** On the guard-off arm `_bs` is the `ok:false` union and carries **no** `raw`, so the only frame in scope is `_eqTick.raw` — the frame the mark came from. It is used there and nowhere else, which keeps J2 from turning into the unjudged re-read that J1 forbids.

- **J1 — carry the validated sides out of the guard block, not re-read them.** Two `let` variables are declared before the block (`xsBid`, `xsAsk`) and set on the ONE line that has passed validation (just above `aee:2072`). **A re-read of `getLatestEquityTick` at X1/X2/X3 is refused:** a later frame may have arrived and would be unjudged — the guard would then have validated one frame while the decision reads another.
- **J2 — guard OFF (`enabled = 0`) ⇒ the raw sides UNJUDGED, if two-sided; else null.**
  - "Guard off" is an operator choice not to judge the book. Refusing every xStock exit because of it would turn a diagnostics knob into a trading halt.
  - The row is stamped `exit_book_state` NULL (already the guard-off label), and the **price-source stamp names the rung `raw_unguarded`**. That is a new value in an existing column, not a new column.
  - **Rejected alternative:** fall back to the mark. That is the midpoint the rule forbids.
- **J3 — the X2/X3 decision stamps.**
  - `exit_decision_price` on an X2 rest fill = the validated bid.
  - On a taker close it stays the mark (the label A1 names), with the comment corrected, rather than moving a column mid-series.
  - `entry_decision_price` on an X1 fill = the ask.
  - The cutover is identified by `entry_price_source` form, as in `8a-P3`.
- **J4 — calibration epoch paper_sim/xstock_spot +1**, with delta asserts on every other row (the `8a-P3` migration shape). VTS/xStock is NOT bumped here (`8a-P4c`).

## B. PLAN — every item names its finding

| # | from | item |
|---|---|---|
| **P1** | A1, J1 | `let xsBid, xsAsk: number \| null = null` before the guard block. Set them from `_raw` on the validated arm, and on the guard-off arm per J2. |
| **P2** | A1 X3, J2b, *(r2 CONDITION-4)* | Three-way per J2b: `crypto_spot ? triggerBid : xstock_spot ? xsBid : currentPrice`. `null` ⇒ `no_transactable_side`, which the evaluator already handles. **The counter is `_noTriggerRefusals`, kept as the TOTAL** (the EVAL_EXIT residual arithmetic depends on it) and **split ADDITIVELY by class, printed per leg with its own denominator**: `exitEvalInvoked` and `noTriggerRefusals` each as crypto / xstock / other. It is a breakdown of the same fact, not a second counter (`#641`). |
| **P3** | A1 X2, J2b | `_restFillPrice` three-way: crypto → the touch bid (unchanged); xStock → `xsBid`; other → `currentPrice`. `exitProvenance.decisionPrice` carries it. |
| **P4** | A1 X1, J2b | The pre-pass call passes `xsAsk`. `_processPendingMaker` fills three-way: crypto → the touch ask (unchanged); xStock → `xsAsk`; other → `safePrice` (the mark, unchanged). For xStock, `entryDecisionPrice` is the ask and `entryPriceSource` names the rung (`kraken_equities_ws:raw_ask` or `…:raw_ask_unguarded`). |
| **P5** *(r2, BLOCKER-2)* | `8a-P3` §5d | **Do NOT move the `[8a-P3][MAKER_RESTED:${mode}]` line** — it is the live denominator of `8a-P3` OBJ-6 (*rests attempted*), and moving it below the insert would change it to *rests placed* mid-series, the same move J3 refuses for `exit_decision_price`. **ADD** `[8a-P4b][MAKER_PLACED:${mode}] <symbol> (<class>): limit=… ask=…` after the insert commits (both classes). ⇒ The `8a-P3` series does not split; placements become a NEW series from the `8a-P4b` deploy; the difference between the two is the `#1063`-class failures, readable per window. |
| **P6** | A1 | Correct the `aee:2656-2658` comment: the taker decision stamp is the mark, and the booked price is the bid walk (`aee:3308-3321`). |
| **P7** | J4 | Epoch migration + rollback + MANIFEST line. |
| **P8** | scope OBJ-1/2/3/4 | Fixtures, each red on today's code: the mark above a stop with the validated bid below it ⇒ fires (X3); the mark ≥ a rested limit with the bid below ⇒ no fill (X2); the mark ≤ an entry limit with the ask above ⇒ no fill (X1); a hollow frame never reaches a decision; guard off ⇒ unguarded sides; crypto fixtures from `8a-P3` unmodified; no clock term. |
| **P9** | A4 | SIM, SYSTEM_MANUAL §3.5.1 and §18.0, and `XSTOCK_PRICING_PLAN` P6 (stating what P6 still governs) — at Step 10. |

## K. *(r2, CONDITION-3)* THE IN-FLIGHT WINDOWS THIS PIECE TOUCHES — stated before the deploy

| window | owner | what it reads | does `8a-P4b` move it? | disposition |
|---|---|---|---|---|
| **`B-XSTOCK-FEE-CONTRACT` P8** (`#1010`), opened `b597f1bf2` 2026-09-11 20:09:47Z — xStock maker share ≤ 1.0% at n ≥ 300, zero class-(iii) | CC-B | *(r3, the object named)* the frozen p0 is **maker share among `maker_taker` DECISIONS** (n = 114, `null_mode` broken out) | **Not on its numerator:** a decision is taken at placement, and X1 changes only whether a placed rest FILLS. It would move a CLOSES-based maker share (fewer maker fills, so lower, biasing toward PASS). **CC-B must read P8 on the decisions object as frozen, or treat the deploy as a split if the object is ever re-cut to fills.** | **The `8a-P4b` deploy instant SPLITS P8.** A P8 verdict may use only one side of it. Which side, and whether to restart, is CC-B's call; one post to CC-B at the deploy names the instant. |
| **`#1010` Arm B** — EV-gate admission | CC-B | the admission decision at the EV gate | **Not by X1-X3** (but by P7 — next row). Admission is decided before any fill or exit; X1 changes how a rest fills, and X2/X3 change exits. None of them touches the gate's inputs. | Insensitive, argued here. ⚠️ Indirect path, stated: a changed exit changes which positions are held, and so the concurrency slots free at the next admission. That changes WHICH signals reach the gate, not how the gate judges them. |
| **F-G-2 xStock decision legs** | CC-C | — | — | **HELD** — `F_G_2_PROGRESS_REPORT.md:135` (§4e, *"The HELD xStock decision-side leg"*) and `:162` (*"xStock legs still held"*), so nothing is running to split. Stated rather than omitted. *(r3: `:62` DOES carry it — verbatim, "xStock decision-side legs are HELD (§7.4 rows 1-2)" — and my r2 parenthetical saying it did not was a false absence, struck; `:135`/`:162` corroborate.)* |
| **`8a-P3` OBJ-6** (`MAKER_RESTED`) | CC-C | rest lines, crypto only | no — P5 no longer moves the line | none |
| ⛔ **P7 itself — the `paper_sim`/`xstock_spot` epoch bump** *(r3, Langston CONDITION-3)* | CC-B's windows | `#1010`'s own Condition C: an epoch bump **resets every xStock learning aggregate** (`outcome-feedback-store.ts:358`), a store the signal orchestrator imports (`signal-orchestrator.ts:222`) | **YES — for Arm B as well.** It is a second corpus reset inside Arm B's three-week window: the confound the fee contract pre-registered. My r2 "insensitive" argued only from X1-X3's mechanics and missed it. | **The `8a-P4b` deploy instant SPLITS Arm B too.** P7 still lands: the xStock paper rows change meaning, and pooling across the change would be the worse confound. Which side each Arm-B verdict reads is CC-B's call; the one post at the deploy names both splits. |

**UNAUDITED:** none.


## L. *(Step 8 BLOCKER-1, 2026-09-19)* THE SYMMETRIC-BLOWOUT FALSE STOP — FINDING, CENSUS, MEASUREMENT, AND THE CONTAINMENT GATE

**The finding (Langston Step 8, 00:20Z; mechanism re-derived by both at the ref).** MDB/USD closed `stop_hit` at 00:15:00.777Z with `EXIT_TRIGGER … trigger=335.12 mark=400.06`, stop 354.79 — 11.3% clear on the mark. `trigger=` is `xsBid` = `_raw.bid` of the frame the guard judged two_sided at 00:15:00.592Z; the same frame made the mark, so its ask was 465.00 (derived: 2 × 400.06 − 335.12; ⚠️ **no instrument logs a two_sided verdict's frame or its comparator, so the frame and the 385.00/386.79 prior are INFERRED** — the 00:13:45.595Z snap is 385.00/386.79, the 00:15:00.338Z snap 369.01/415.00). **Why the guard said two_sided:** arm (i) (`book-state.ts` single-side departure) is conjunctive on the OTHER side holding (0.5%); arm (iii) needs `|midDep| > D` (5%) AND not both-moved-together. A symmetric outward widening holds neither side and keeps the mid near fair (midDep 3.67%), so all three arms pass at every threshold — only a new estimand (the spread) reaches it. `spreadFrac` and `trailingMedianSpreadFrac` are already computed into `inputs` and read by nothing (Langston: the third unused discriminator in this file). **Context (Langston):** at 00:15Z (20:15 ET) 269 of 422 quoting names went past a 5% spread in one minute — a market-wide close collapse, not an MDB event. **Outcome (1), introduced by `8a-P4b`:** on the mark a symmetric widening was harmless; X3 made the bid decision-bearing and this admission load-bearing. My J cells examined hollow and crossed books, never a symmetric widening.

**Direction of each cell under a blowout (why only X3's STOP leg is exposed):** X1 fills a buy when the ASK ≤ limit — a widening raises the ask ⇒ fewer fills. X2 fills a resting sell when the BID ≥ limit — a widening lowers the bid ⇒ fewer fills. X3 TARGET needs bid ≥ target ⇒ fires less. **X3 STOP needs bid ≤ stop ⇒ a stub bid FIRES it.** One leg, one direction.

**Exposure, bounded to what is evidenced:** exit lane — `EVAL_EXIT xstock:0/0` since ~00:20Z (AMC mark past its 300 s ceiling, alert `a8430d63`; ANET refused unvalidated, alert `7e7a4935` — the new `8a-P4a` named alert, minting correctly after the key re-arm). Entry lane — **0** xStock rows opened since the restart (`closed_trades` ∪ `active_open_positions`, `opened_at ≥ 00:02:33Z`). The two `routes.ts` readers and `aee:3527` write LABELS only. Durable residue: MDB's row carries `exit_decision_price 400.06` (the mark label, `#1064`) and a `stop_hit` reason on a +$2.88 close. **Next exposure: the Sunday 20:00 ET reopen (Mon 00:00Z).**

**Census of the guard's readers at `323ae2776` (reconciled — SIM S25 is stale):** `aee:725` entry gate (refuses on `hollow`) · `aee:1953` exit path · `aee:3527` close-fill label · `routes.ts:13010`, `:13142` close labels. ⚠️ **S25 also lists `active-portfolio-manager.ts:685`: that reader was REMOVED by CC-B's `51e35b195` (deployed today; close-all now goes through the canonical close, i.e. `aee:3527`).** `git log -S assessBookStateNow -- active-portfolio-manager.ts` = `3b2c4966c` (added) and `51e35b195` (removed); control: the same grep counts 5 in `aee`. S25's line numbers are all stale; its refresh is owed at Step 10.

**Measurement — one day (2026-09-17) of captured ticker frames, every xStock symbol with a paper close in the last 30 days (68 symbols, 579,045 frames).** Scripts and data on staging: `/home/deploy/8ap4b_br_sim.py`, `/home/deploy/8ap4b_br_cap.py`, `/home/deploy/8ap4b_br_0917.csv`. ⚠️ Proxy: snapshots (~4-5 s), not the guard's own frames (~1.5 s). Rule simulated: refuse when `spread > max(kRel × median(last 20 admitted spreads), floor)` = `max(3 × median, 1%)` — the arm-(i) threshold.
- **Positive control:** MDB 09-18 22:00Z → 00:15Z replayed: the 00:12:56 and 00:13:45 frames admitted (spreads 0.72%, 0.46%, threshold 1.12%); the 00:15:00.338 snap (11.7%) and the engine's 00:15:00.592 frame (32.5%) both refused.
- **(V) the verdict arm — `spread_blown` ⇒ `hollow`, through the hollow skip / yield / implausible reseed / `8a-P4a` escape:** RTH 131 of 333,434 frames not decided (0.04%); off-hours 1.9%; worst RTH refusal 24 frames / 977 s (NTES, a pre-open yield carried into the open).
- **(A) capture-side + writer-side refusal (the guard verdict unchanged; the blown frame gives no X1-X3 input and never enters the ring):** 13:30-13:45Z open **73 of 5,891 (1.24%), 6 of 68 symbols**; rest of RTH **21 of 327,540 (0.006%)**; off-hours **4,685 of 245,614 (1.9%), 59 of 68**. ⛔ **But the ring is anchored to the daytime spread, so a legitimately wider OVERNIGHT book is refused until RTH: 25 of 68 symbols have an off-hours run longer than 1 h in which every captured frame is refused (SYY 13.5 h, LOW 11.1 h, MOH 8.3 h).**
- **Langston's writer-only refusal (refuse the ADVANCE, keep the verdict):** preserves the reference but does **not** stop the MDB stop — the frame still reads two_sided and X3 still reads the stub bid. Its comparator-age effect: `priorAtMs` freezes at the last admitted frame and nothing compares it to the frame time (`assessBookStateNow` reads no clock), so the prior ages silently — an age term would be owed.

**THE CONTAINMENT GATE (before Mon 00:00Z) — recommendation: (C1) return the xStock X3 TRIGGER to the mark, exactly the pre-`8a-P4b` quantity; keep X1 and X2 on the sides.** Reasons: (1) it is the reviewed, lived-with behaviour — no new mechanism, no new blast radius; (2) X1/X2 are safe under a blowout (above), so the sides stay where they cannot misfire; (3) (A) introduces a NEW HOLD POLICY — multi-hour overnight exit refusals on a live, transactable (if wide) book — which goes beyond Kyle's 2026-09-03 ruling (that one covers a price we cannot SEE, not a book we can see and choose not to trade) and is his risk call, not ours to ship in a hotfix; (4) the J5 lane keying stays (independent of which quantity the trigger reads). **Cost, stated:** until the verdict half lands, xStock stops/targets trigger on the mid again — the half-spread error `3n` exists to close, for one class, on its trigger only.
**The bid trigger comes back as its own placed row** with Langston's three conditions: (1) the would-refuse rate at the threshold during RTH and at the 13:30Z open (the numbers above are the first cut; the sustained-overnight cost is the open question); (2) a false-HOLLOW instrument; (3) the reseed → escape chain driven through the decision site to a terminal row. **Plus an instrument now:** X3's `EXIT_TRIGGER` line for xStock carries the frame's bid/ask/spread and the guard's threshold, so a trigger is attributable from the log alone.

**RULED 2026-09-19 00:40Z (Langston): C1, not (A), with six conditions.** The deciding argument is the file's own fence: `book-state.ts` states that catching a book broken before we looked *"needs an ABSOLUTE plausibility test, which changes exit behaviour and is therefore a separate, gated decision"* — (A) is that test, so it is a placed row (`3n.q7`), not a containment. **The stronger form of the X1/X2 argument (his):** it is not that a widening makes fills rarer — **both cells BOOK AT THE LIMIT by construction** (`makerFillPrice` returns the limit exactly; the X2 close is `closePosition(…, _exitRestLimit, …)`), **so a corrupt side can only suppress a fill, never book a bad price.** X3 is the only cell where a corrupt side both triggers and hands off to a separate booking walk. Live corroboration of (A)'s cost: alert `748f2ba6` (LOW hollow-yield, one of the 25 >1 h symbols) and `7e7a4935` (ANET, bid 150.99 against a 193.66 stop, held back by comparator validation, not by the arms).
**The six conditions, as built:** (1) X3 only — the call site passes the crypto ladder bid alone (`null` for xStock by construction) and the evaluator's explicit xStock arm is `currentPrice`; X1/X2 unchanged. (2) `xstock_spot`/`paper_sim` +1 (`2026-09-19-b-price-side-8a-p4b-c1-paper-xstock-epoch.sql`); **`vts` NOT bumped** — the revert does not touch `_vtsTriggerPrice`, and J5's lane keying stays. The migration also sets `updated_at = now()` on the moved row (FINDING-1's forward fix lands here first; `8a-P4c` keeps it). (3) Fence 2d amended back, deliberately, with the re-land pointer; J5's invariant holds (the sentinel is fed the series the stop compares — the mark). `symbolCache` (`price-discontinuity-detector.ts:148`) is a module-level in-memory `Map`, emptied by the restart, so no post-C1 call compares a mark against a stored bid. (4) The instrument: every xStock `EXIT_TRIGGER` line carries `bid= ask= spread= thr= bidWouldFire=`; and — beyond the letter of the condition, because the EXIT_TRIGGER line only prints when the MARK fires — a `X3_BID_DIVERGENCE_START/END` pair for each run where the bid would fire and the mark does not (the MDB-shaped population the re-land must price). Log only: a fence pins that none of it enters the evaluator input. ⚠️ Would-have-fired is judged against the static stop/target, not a ratcheted one. (5) Enumerated, not exemplified: `#1065` (two closes; one affected). (6) `#1065` names MDB's row.
**His instrument note, recorded because it bites this batch:** `dt-review grep` returned zero `xsBid` hits in `.ts` while `aee` carries 12 — its output cap was consumed by `.md` hits. Truncation wearing absence; cross-read anything load-bearing.
**C1 DEPLOYED 2026-09-19:** `dt-deploy 084e6605ff9fc32bcd13843b610d22b3cec6f146 --by cc-c`, restart `pm_uptime` **00:54:06.306Z** (the new anchor for the epoch-6 window), migration applied 00:54:05.836Z; read back: `xstock_spot/paper_sim` 5 → **6** with `updated_at` 00:54:05.776Z, `xstock_spot/vts` 8 unchanged, the other six unchanged. CI run `35410627494` 4/4 per-job on the graded head. Langston APPROVED at 00:53Z (all six conditions re-derived by him).
**THE FIRST POST-C1 OBSERVATION — `#1066`, a different mechanism:** ANET/USD false-stopped 12 s after the C1 restart because the restart emptied the guard's reference during the blowout and the first frame (32% spread) seeded vacuously (the r6 hole). It fired on the mark and would have on the bid. ⇒ **C1's criterion is "the stub-bid trigger class is closed", never "no more false `stop_hit` rows".** Its fix is row `3n.q8` (`B-BOOK-STATE-RESTART-DURABLE`, placed before `3n.q7`). No staging restart for the rest of the weekend: AMC's stale mark is the only thing preventing the same outcome on the last open xStock position.
