# B-PRICE-SIDE-BY-JOB row `8a-P4` — xSTOCK EXITS AND FILLS ON THE TRANSACTABLE SIDE — SCOPE (Step 1)

change-class: architecture

**Owner:** CC-C. **Plan row:** `3n.q2`. **The xStock half** of the exit/fill-side work; the crypto half is `8a-P3` (`Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md`, Step 9). **One batch, one completion report, when both halves land** (Kyle, 2026-09-15).
**Status:** `STEP: 1 of 11` · `NEXT STEP: 2 of 11`. **Its first item, `8a-P4a` (the book-state reseed escape), has its own scope and is at Step 2.**
**r2** — Langston r1 (21:35Z) CHANGES-NEEDED: BLOCKER-1 (X4 is VTS, the twin of X9), BLOCKER-2 (sides defaulted to zero), BLOCKER-3 (change-class), and the §5 provenance owed at Step 1. Each is folded below and marked *(r2)*. **Change-class re-declared `architecture`** — this adds a NEW component (the VTS xStock side guard, SIM-scope) and changes exit-decision math for a whole asset class on both lanes, the same reasoning `8a-P2` used when it re-declared itself up.

---

## 0. THE DIRECTIVE

- **Kyle, 2026-09-15:** exits stop using the midpoint *"for crypto, X stock, VTS, paper mode, live mode."*
- **Kyle, 2026-09-19:** *"please proceed with the xstock exit fixes."*
- **The rule** (`3n`; delegated to CC-C + Langston by Kyle on 2026-09-03). Whatever **fires an action** or **is recorded** reads the transactable side:
  - a SELL reads the **BID**;
  - a BUY reads the **ASK**;
  - no usable side ⇒ **no decision or fill this tick, never a midpoint fallback.**
  ⛔ `XSTOCK_PRICING_PLAN.md` (2026-08-30) row P6 calls "which price per job" Kyle's call, and that **predates the 09-03 delegation**. For triggers, fills and bookings it is superseded, and it is updated at Step 10.

## 1. THE CELLS — what each xStock site reads today (at `origin/migration/aws-supabase`)

| cell | lane | site | reads today | target |
|---|---|---|---|---|
| **X1** resting entry fill | paper | `aee:1577` `fillPrice = safePrice` | the mark | **ASK** ≤ limit |
| **X2** resting target-exit fill | paper | `aee:2564` `_restFillPrice` (xStock arm) | the mark | **BID** ≥ limit |
| **X3** stop/target trigger | paper | `aee:2866` `triggerPrice: crypto ? triggerBid : currentPrice` | the equity-WS mark (`kind` mid or last) | **BID** |
| **X4** placement marketability *(r2: VTS, not paper)* | **VTS** | `xstock_spot/eval-cycle.ts:957`, inside `evaluateXstockPairForVTS` (`:301`), the chosen leg of the pair whose twin is X9 | the mark (`lastPrice`) | **ASK** |
| **X5** resting entry fill | VTS | `vts-runner:3217` `_pFillPrice = currentPrice` | ticker **`last`** | **ASK** |
| **X6** placement marketability | VTS | `vts-runner:2258` `placementAsk` (xStock arm) | `currentMarketPrice` | **ASK** |
| **X7** stop/target trigger | VTS | `vts-runner:3322-3328` `_vtsTriggerPrice = currentPrice` | ticker **`last`** | **BID** |
| **X8** exit booking | VTS | `vts-exit-booking.ts` `clamp_class_seam` | the clamp | **BID** |
| **X9** twin placement | VTS | `xstock_spot/eval-cycle.ts:1235` | the mark | **ASK** |
| **C8** taker entry booking | VTS | the signal level (both classes) | the level | **ASK** |
| ⭐ **X0** the VTS xStock SIDE READ *(r2, Langston BLOCKER-2)* | VTS | `vts-runner:3150-3153` `bid: parseFloat(r.bid) \|\| 0, ask: parseFloat(r.ask) \|\| 0` | **a missing side becomes ZERO** — `price` is guarded (`:3148`), the sides are not; a SELL comparator on `bid = 0` fires every stop it reads | **`number \| null`**, and every cell branches on `null` — not a `> 0` bolted onto nine sites |

**Sources — per cell, which OBJECT it reads and which GUARD binds it *(r2)*:**
- **Paper X1-X3** read the equity WebSocket tick (`getLatestEquityTick()`, raw bid/ask), which the book-state guard **enforces** (two-sided AND validated) before the mark is used.
- **The paper taker exit FILL is a different object:** it depth-walks `xstock_spot_ticker_snap` (`depth-source.ts:47-69`), where book state is **recorded, not enforced** (`aee:3295-3300`, *"a flatten must close"*). `closePosition(…, currentPrice, …)` at `aee:2656` passes a *requested* price; `aee:3308-3321` walks the bids, and `actual_exit_price` comes from that fill. ⇒ **A paper xStock taker exit is already BOOKED bid-derived; there is no missing booking cell.** The `aee:2656-2658` comment fix says so, so no later reader adds one.
- **VTS X0/X4-X9** read the **latest `xstock_spot_ticker_snap` row** per symbol (`vts-runner:3127-3153`). `:3139` is the only read that carries sides; `:4150` and `:6054` select `last` only. **No book-state guard at all.**
- ⚠️ **Age:** that row is bounded at `captured_at > NOW() - INTERVAL '5 minutes'` (`vts-runner:3140`), i.e. **300,000 ms, against the crypto exit lane's 2,000 ms** — a 150× asymmetry. Step 2 derives the xStock ceiling from risk, as `8a-P2` did; it does **not** inherit 5 minutes by default.

## 2. THE HAZARD THAT ORDERS THE WORK

**A side read without a hollow-book guard reintroduces `#567`:** at a session handoff the BID collapses while the ask and `last` hold, and a hollow ASK is the symmetric hazard for X4-X6/X9 *(r2)*. The paper lane has the guard; VTS does not.
⇒ **The guard covers the VTS xStock SIDE READ (bid and ask), and every VTS side cell ships with it or not at all.**
And the paper guard is only trustworthy once `8a-P4a` lands — today it can lock a recovered book indefinitely.

## 3. SEQUENCE — three pieces, one completion report

| piece | cells | depends on |
|---|---|---|
| **`8a-P4a`** | the reseed escape (own scope) | — |
| **`8a-P4b` — paper xStock** | **X1-X3** *(r2: X4 moved)*; a NEW `MAKER_PLACED` line after the insert, both classes (*PREVIOUSLY: "the `MAKER_RESTED` line after the insert". NOW: `MAKER_RESTED` stays where it is, because it is the live `8a-P3` OBJ-6 denominator, and placements are a new series. REASON: Langston, `8a-P4b` r1 BLOCKER-2*); the `aee:2656-2658` comment (the paper taker exit is booked from the bid walk); paper_sim/xStock calibration epoch +1 | `8a-P4a` deployed |
| **`8a-P4c` — VTS xStock** | **first an INSTRUMENT** (xStock VTS no-decision volume has none since `8a-P3` deploy 2 — Langston's C2); **X0** (sides `number \| null`); the VTS side guard; **X4 with X9 together** (chosen leg and twin move in one commit, as crypto's did at `vts-runner:2255`, or the twins stop being comparable); X5-X8; C8 (both classes); the no-decision rail keyed on the **trade id** with an automatic re-arm (`#994`: keep the emit, cut the notify off-hours); the no-ask placement policy on both lanes; the twin line's **`ask=` label, which prints the MARK for xStock (`vts-runner:4704`)** — a mislabel, self-clearing when X9 moves; vts/xStock epoch +1 | `8a-P4b` live |

## 4. OBJECTIVES — each must FAIL on today's code

| OBJ | objective | verified by |
|---|---|---|
| **1** | Every xStock trigger, resting fill and booking reads the transactable side in both lanes; a null side ⇒ no decision or fill. | Divergent fixtures per cell (mark on one side of the level, the transactable side on the other). Staging: stamped decision prices below the mid on SELLs and above it on BUYs, with the pre-deploy control failing. |
| **2** | No stop fires on a collapsed bid in either lane. | The hollow fixtures through BOTH lanes. Staging: every xStock stop in the window has `exit_book_state` two-sided (paper) or a VTS guard verdict (VTS). |
| **3** | Crypto unchanged except C8 and the rail. | Class tripwires; crypto fixtures from `8a-P3` unmodified. |
| **4** | The off-hours standard does not loosen (Kyle, 2026-09-03). | No clock term; source fence. |
| **5** | UI: xStock closes render with sane exit prices. | Claude-in-Chrome, Closed Trades. |

## 5. PROVENANCE (1.b) — Tier 1, recorded now *(r2: this was deferred to Step 2, which the step-1 rule forbids)*
**Corpora:** the cells' own dated deferrals at the ref, `git log -S` on X0, the `8a-P2`/`8a-P3` records, `#943`, `XSTOCK_PRICING_PLAN`.
**Every price cell carries a dated deferral to this batch, verbatim at `origin/migration/aws-supabase`:**
- `aee:1574` (X1): *"xSTOCK: the mark, EXPLICITLY — unchanged by statement; it moves in `8a-P4`."*
- `aee:2563` (X2): *"xStock: the mark, EXPLICITLY — unchanged by statement; it moves in `8a-P4`."*
- `vts-runner:2257` (X6): *"Crypto only; any other class passes its mark explicitly (`8a-P4`)."*
- `vts-runner:3216` (X5): *"xStock passes its mark explicitly — unchanged by statement (`8a-P4`)."*
- `vts-runner:3320` (X7/X8): *"xStock: the mark, explicitly (`8a-P4`)."*
- `eval-cycle.ts:956` (X4): *"`8a-P3`: xStock passes its mark EXPLICITLY — unchanged by statement; it moves in `8a-P4`."*
- `eval-cycle.ts:1235` (X9): *"`8a-P3`: xStock mark, explicit (`8a-P4`)."*
- **X3** has no marker; its crypto arm is `8a-P2` (`aee:2866`), whose record homed xStock here.
- **X0** was introduced by `c0a69fb7d` (2026-05-11, *"B79.0m.b2: exit-path price routing + pre-open gates for xstock VTS"*): *"xstock leg queries xstock_spot_ticker_snap directly for the most-recent tick per symbol (5-min window…). Without this dispatch, xstock trades would never see a non-null currentPrice."* Its intent was a **price**, and the sides rode along unused.

**Dispositions:**
- **X1-X9 and C8 — (2) relevant, needs updating to today's intent** (`3n`; Kyle 09-15/09-19). Each deferral above says so in its own words.
- **X0 — (2)** as well: harmless while nothing read the sides; this batch makes them decision inputs, so they must carry absence.
- **The paper taker exit fill — (1) still correct** (already bid-derived); only its comment changes.
- **The VTS side guard is NEW** — no prior intent. `#943`'s paper guard and the `8a` r3-r6 constraints (no clock term; a reference cannot judge its own seed) bind it.

## 6. NOT IN THIS BATCH
- Signal-level and ranking prices (jobs 1-2 keep the midpoint). ⚠️ **`XSTOCK_PRICING_PLAN` P6's Step-10 edit must say what P6 STILL governs — signal levels and ranking — or the next reader takes it as superseded wholesale** *(r2, Langston)*.
- The ABCD enum (`#1063`, CC-B).
- `B-VTS-NO-DECISION-VALVE` (`3n.q3`).
- `B-EXIT-LINE-IDENTITY` (`3n.q4`).
