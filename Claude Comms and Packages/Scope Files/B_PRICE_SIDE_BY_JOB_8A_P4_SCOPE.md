# B-PRICE-SIDE-BY-JOB row `8a-P4` — xSTOCK EXITS AND FILLS ON THE TRANSACTABLE SIDE — SCOPE (Step 1)

change-class: sub_batch

**Owner:** CC-C. **Plan row:** `3n.q2`. **The xStock half** of the exit/fill-side work; the crypto half is `8a-P3` (`Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md`, Step 9). **One batch, one completion report, when both halves land** (Kyle, 2026-09-15).
**Status:** `STEP: 1 of 11` · `NEXT STEP: 2 of 11`. **Its first item, `8a-P4a` (the book-state reseed escape), has its own scope and is at Step 2.**

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
| **X4** placement marketability | paper | `xstock_spot/eval-cycle.ts:957` | the mark | **ASK** |
| **X5** resting entry fill | VTS | `vts-runner:3217` `_pFillPrice = currentPrice` | ticker **`last`** | **ASK** |
| **X6** placement marketability | VTS | `vts-runner:2258` `placementAsk` (xStock arm) | `currentMarketPrice` | **ASK** |
| **X7** stop/target trigger | VTS | `vts-runner:3322-3328` `_vtsTriggerPrice = currentPrice` | ticker **`last`** | **BID** |
| **X8** exit booking | VTS | `vts-exit-booking.ts` `clamp_class_seam` | the clamp | **BID** |
| **X9** twin placement | VTS | `xstock_spot/eval-cycle.ts:1235` | the mark | **ASK** |
| **C8** taker entry booking | VTS | the signal level (both classes) | the level | **ASK** |

**Sources.** Paper xStock reads the equity WebSocket tick, which carries **raw bid/ask** (`getLatestEquityTick().raw`) and is already gated by the book-state guard (two-sided AND validated) before the mark is used. VTS xStock reads the **latest `xstock_spot_ticker_snap` row** per symbol (`vts-runner:3127-3150`, query at `:3139`: `last`, `bid`, `ask`; the same table is also read at `:4150` and `:6054`, both censused at Step 2) and has **NO book-state guard** at all.

## 2. THE HAZARD THAT ORDERS THE WORK

**A bid-trigger without a hollow-book guard reintroduces `#567`:** at a session handoff the BID collapses while the ask and `last` hold. The paper lane has the guard; VTS does not.
⇒ **X7 and X8 ship WITH a VTS hollow-book guard, or not at all.**
And the paper guard is only trustworthy once `8a-P4a` lands — today it can lock a recovered book indefinitely.

## 3. SEQUENCE — three pieces, one completion report

| piece | cells | depends on |
|---|---|---|
| **`8a-P4a`** | the reseed escape (own scope) | — |
| **`8a-P4b` — paper xStock** | X1-X4; the `MAKER_RESTED` line after the insert (both classes); the `aee:2656-2658` decision-price comment; paper_sim/xStock calibration epoch +1 | `8a-P4a` deployed |
| **`8a-P4c` — VTS xStock** | **first an INSTRUMENT** (xStock VTS no-decision volume has none since `8a-P3` deploy 2 — Langston's C2); then the VTS hollow-book guard; X5-X9; C8 (both classes); the no-decision rail keyed on the **trade id** with an automatic re-arm (`#994`: keep the emit, cut the notify off-hours); the no-ask placement policy on both lanes; the twin `ask=` formatting nit; vts/xStock epoch +1 | `8a-P4b` live |

## 4. OBJECTIVES — each must FAIL on today's code

| OBJ | objective | verified by |
|---|---|---|
| **1** | Every xStock trigger, resting fill and booking reads the transactable side in both lanes; a null side ⇒ no decision or fill. | Divergent fixtures per cell (mark on one side of the level, the transactable side on the other). Staging: stamped decision prices below the mid on SELLs and above it on BUYs, with the pre-deploy control failing. |
| **2** | No stop fires on a collapsed bid in either lane. | The hollow fixtures through BOTH lanes. Staging: every xStock stop in the window has `exit_book_state` two-sided (paper) or a VTS guard verdict (VTS). |
| **3** | Crypto unchanged except C8 and the rail. | Class tripwires; crypto fixtures from `8a-P3` unmodified. |
| **4** | The off-hours standard does not loosen (Kyle, 2026-09-03). | No clock term; source fence. |
| **5** | UI: xStock closes render with sane exit prices. | Claude-in-Chrome, Closed Trades. |

## 5. PROVENANCE (1.b) — to be completed at Step 2 for every Tier-1 site
- **Tier 1** (behaviour changes): X1-X9, C8, the VTS xStock price read (`vts-runner:3127-3150`) and the new VTS guard.
- **Precedent carried:** the `8a-P2` and `8a-P3` records each deferred xStock here explicitly ("xStock: the mark, explicitly (`8a-P4`)", `vts-runner:3320`).
- `B-XSTOCK-FEED-SANITY` (`#943`) and the `8a` r3-r6 commits govern the guard. `XSTOCK_PRICING_PLAN` P1-P6 carry the xStock feed problems.
- ⚠️ **One open question Step 2 must answer at the object:** the VTS ticker snapshot's age and cadence. It is a stored row, so how old can its bid be when the trigger reads it?

## 6. NOT IN THIS BATCH
- Signal-level and ranking prices (jobs 1-2 keep the midpoint).
- The ABCD enum (`#1063`, CC-B).
- `B-VTS-NO-DECISION-VALVE` (`3n.q3`).
- `B-EXIT-LINE-IDENTITY` (`3n.q4`).
