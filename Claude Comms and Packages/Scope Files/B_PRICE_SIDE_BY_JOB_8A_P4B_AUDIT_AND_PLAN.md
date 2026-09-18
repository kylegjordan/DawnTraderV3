# B-PRICE-SIDE-BY-JOB row `8a-P4b` — PAPER xSTOCK EXITS AND FILLS ON THE TRANSACTABLE SIDE — PRE-IMPLEMENTATION AUDIT AND PLAN (Step 2)

change-class: architecture

**Scope:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4_SCOPE.md`, approved r2 by Langston at 22:01Z (`e9a6b7f68`). This document covers the paper piece, **`8a-P4b` = X1-X3 plus two label fixes**. `8a-P4c` (VTS) gets its own Step 2. **Status:** `STEP: 2 of 11` · `NEXT STEP: 3 of 11`. **Depends on `8a-P4a` being deployed first** (the guard this piece relies on must be able to release a recovered book).

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
- **Size of the effect.** A stop now fires when the **bid** reaches it, which is **half a spread earlier** than on the mid. Measured half-spreads at today's regular-hours medians (captured ticker, 09-15 → 09-18, the `8a-P4a` query): ANET 0.06% · LOW 0.04% · MDB 0.10% · AMC 0.19%. The paper xStock stop distances this week run **0.35% to 1.7% from entry** (the 11 closes above). ⇒ **Material on the tightest stops, and that is the point:** the live fill would have happened there.

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

- **J1 — carry the validated sides out of the guard block, not re-read them.** Two `let` variables are declared before the block (`xsBid`, `xsAsk`) and set on the ONE line that has passed validation (just above `aee:2072`). **A re-read of `getLatestEquityTick` at X1/X2/X3 is refused:** a later frame may have arrived and would be unjudged — the guard would then have validated one frame while the decision reads another.
- **J2 — guard OFF (`enabled = 0`) ⇒ the raw sides UNJUDGED, if two-sided; else null.**
  - "Guard off" is an operator choice not to judge the book. Refusing every xStock exit because of it would turn a diagnostics knob into a trading halt.
  - The row is stamped `exit_book_state` NULL (already the guard-off label) and a new `decision_side_basis=raw_unguarded`.
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
| **P2** | A1 X3 | `aee:2866` → `triggerPrice: crypto ? triggerBid : xsBid`. `null` ⇒ `no_transactable_side`, which the evaluator already handles. The EXIT_EVAL counters gain an xStock `noTransactableSide`. |
| **P3** | A1 X2 | `aee:2564` xStock arm → `xsBid`; `exitProvenance.decisionPrice` carries it. |
| **P4** | A1 X1 | The pre-pass call (`aee:2267`) passes `xsAsk`, and `_processPendingMaker`'s xStock arm fills on it. `entryDecisionPrice` = the ask; `entryPriceSource` names the rung (`kraken_equities_ws:raw_ask` or `…:raw_ask_unguarded`). |
| **P5** | `8a-P3` §5d | Move the `[8a-P3][MAKER_RESTED:${mode}]` line (`aee:4760`) to after the position insert succeeds (both classes), so a line means a placement. |
| **P6** | A1 | Correct the `aee:2656-2658` comment: the taker decision stamp is the mark, and the booked price is the bid walk (`aee:3308-3321`). |
| **P7** | J4 | Epoch migration + rollback + MANIFEST line. |
| **P8** | scope OBJ-1/2/3/4 | Fixtures, each red on today's code: the mark above a stop with the validated bid below it ⇒ fires (X3); the mark ≥ a rested limit with the bid below ⇒ no fill (X2); the mark ≤ an entry limit with the ask above ⇒ no fill (X1); a hollow frame never reaches a decision; guard off ⇒ unguarded sides; crypto fixtures from `8a-P3` unmodified; no clock term. |
| **P9** | A4 | SIM, SYSTEM_MANUAL §3.5.1 and §18.0, and `XSTOCK_PRICING_PLAN` P6 (stating what P6 still governs) — at Step 10. |

**UNAUDITED:** none.
