# B-PRICE-SIDE-BY-JOB #1250 — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture (the batch's declared class; unchanged)
**Scope:** `Scope Files/B_PRICE_SIDE_BY_JOB_1250_SCOPE.md` (r2, Langston Step-1 PROCEED with six conditions, Discord `1568653381650874472`). **Owner:** CC-C. **Read at:** `origin/migration/aws-supabase` after `843eb6e32`; staging runs `6c39f14cb`.

## 0. PREVIOUSLY STATED / NOW
- **PREVIOUSLY STATED: 9 of 10 below plan (one strategy, stop_hit only). NOW: 33 of 38 (four strategies, post-`#1235`, Langston) and 162 of 239 since 2026-10-20 (this audit, A3). REASON:** the first figure was a strategy-and-exit subset; the subject is every xStock taker open.
- **PREVIOUSLY STATED (scope OBJ-5): crypto taker levels are `8c`'s. NOW: unchanged, and the boundary is MEASURED (A4) — the crypto rows that read as "taker" are maker-priced limits; no crypto decision-vs-fill gap appears in them.**
- **NEW, not in the scope: the VTS xStock lane has the same gap (A5).** Proposed disposition 1 (fold into this item) for Langston to rule.

## 1. THE AUDIT

### A1 — THE xSTOCK LEVEL BASIS, TRACED (closes the `SYSTEM_MANUAL.md:750` gap at Step 10)
`asset_classes/xstock_spot/eval-cycle.ts`: the cycle passes `lastPrice` — **the 15-minute bar close** (`:354`, *"the 15-minute bar close (`lastPrice`, which stays the EV/geometry input)"*) — to `mce.computeContext(symbol, ohlc, lastPrice, …)` (`:412`); the detect indicators are built from that context (`:423`) and each strategy forms its levels from `currentPrice` (e.g. `strategies/morning-star.ts:78` → `:168` `entryPrice = currentPrice * 1.001`, stop/target = entry ∓/± k·ATR). So **the xStock plan is a 15-minute bar close (plus a per-strategy premium), up to 15 minutes old at decision, with ATR-distance levels around it.** The same `entryPrice`/`stopPrice`/`targetPrice` go to the active dispatch (`:1393-1398`) and to the VTS (A5). Unlike crypto quant, there is no adaptive smoothing on this basis.
⇒ **Why the fill sits below plan so often:** the plan carries a premium over a stale close; the taker walks the live ask.

### A2 — THE ONE OPEN METHOD AND ITS PATHS (Langston C-5)
`executeSimulatedTrade` (`active-execution-engine.ts:5783`). **Entry points into it** (census, tests excluded): **exactly one call site, `processSignal` (`:7475`)**, which the RTB promotion drives for both classes; the xStock active dispatch reaches it through that same promotion (`active-dispatch.ts:10`: *"`dispatchExternalSignal` (which sizes → SQE → queues to RTB internally)"*). **Exactly one method writes both durable rows** (`createClosedTrade` `:6692-6693`, `createActiveOpenPosition` `:6813-6814`).
**Paths through it, with the level basis each should carry after this item:**
| path | condition | today | after |
|---|---|---|---|
| xStock taker (direct) | `!_b72cPendingMaker`, class `xstock_spot` | decision levels | **re-based to the walked fill** |
| xStock taker (maker→taker conversion, `consumptionArm='maker_to_taker'`) | same, converted | decision levels | **re-based** (it paid a walked fill) |
| xStock maker (rests) | `_b72cPendingMaker` (`:6342`), falls through to the writes with `actualEntryPrice = _b72cLimit` (`:6343`) | decision levels at the limit | **unchanged** — it pays its limit or better (Langston fold 1) |
| crypto taker / maker | class `crypto_spot` | decision levels | **unchanged** — `8c` (A4) |
⇒ **The gate is `!_b72cPendingMaker && _openClass === 'xstock_spot'`, and that gate IS the blast radius.** No flatten/reopen path writes levels (the close paths read them).

### A3 — THE POPULATION, MEASURED AT THE OBJECT
`closed_trades`, mode paper, closed, opened ≥ 2026-10-20, `entry_price_producer` = the taker walk, plan above stop (staging, 2026-11-07 ~16:00Z): **xStock `xstock_ticker_snap_walk` n = 239: 162 below plan, 11 above, 66 at plan; mean stop room lost on below-plan rows 0.310, max 0.999; 81 lost over a quarter.** Same column caveat as Langston's (C-2): on these taker rows `entry_decision_price` is the plan (`:6732`). Window spans deploys ⇒ direction and order of magnitude, not a rate.

### A4 — THE CRYPTO BOUNDARY HOLDS, AND WHY
The same query on `crypto_ws_book_walk`: **n = 15, fill = plan on 15/15.** Read at the object (TREAD/USD 07:58Z): `[P19-B7.2][MAKER_TAKER] … chose maker policy=maker_only`, `entry_price=1.0932`, promoted, filled at 1.0932 — **a maker-priced limit, not a taker walk off a stale plan.** ⚠️ **NOT ESTABLISHED:** why those rows carry the walk producer while the policy line says maker (a marketable-maker conversion is the candidate); it does not bear on #1250 because none of them shows a gap. Crypto's level basis is `8c`'s.

### A5 — ⭐ FINDING: THE VTS xSTOCK LANE HAS THE SAME GAP
`eval-cycle.ts:1206-1208`: the VTS xStock trade books `entryPrice: _xBookedEntry` (*"a taker at the guarded ask; a maker at its limit"*, `8a-P4c` 3b P9) beside `stopLoss` / `takeProfit` built on the bar-close plan (`:695-697`). **So VTS xStock taker trades carry the identical decision-vs-fill stop compression** — in the learning population, which is what calibration reads. Kyle's test for this batch is fidelity: a VTS that diverges from paper here mislearns stop distances.
`DISPOSITION: proposed 1 — fold into this item (the same rule at both write sites), for Langston to rule; it adds one write site and one epoch row.`

### A6 — THE GATES, PER GATE (OBJ-2, Langston C-6 provenance in the scope §6)
| gate | where | judges today | after | reason |
|---|---|---|---|---|
| entry window + cheaper floor | `entry-window.ts` via `:6437-6438` | plan risk (`adverseR` in plan units) | **plan — unchanged** | it measures the plan-vs-fill gap itself; re-basing first would make it read 0 |
| `refuseTakerBooking` | `entry-booking.ts:34`, `:6346` | plan stop/target | **plan — unchanged** | a fill at/through the PLAN's stop means the setup failed between decision and fill; re-based levels would hide it |
| fill economics | `fill-economics.ts`, `:6322` | plan stop/target at the fill price | **re-based** | built to price *"the arm that fills at the price it pays"* — the trade carried is the re-based one; on the distance-preserving rule (P1) its geometry is the plan's distances at the fill, so the EV it admits on is the EV of the position |
| `entryFillShadow` (`rrFill`, `adverseR`) | `:6313` | plan | **plan — unchanged** | it is the shadow of the plan-vs-fill record |

### A7 — THE RE-BASE RULE (OBJ-1) — one choice, and why
Two candidates. **(i) Distance-preserving:** `stop' = fill − (plan − stop)`, `target' = fill + (target − plan)` — the strategy's ATR geometry, measured from what was paid. **(ii) Role-priced re-derivation** via `priceForLevelRole` (stop/target on the bid). (ii) answers a different question — *which side of the book a level is measured against at trigger* — which the xStock exit already answers with the bid trigger (`8a-P4b`, C1: back on the mark, per `#994`/row 2). **Recommendation: (i).** It is the only form that keeps the strategy's intended risk and reward in force, it is what `fill-economics` already assumes, and `8c`'s per-leg rule is about level CONSTRUCTION side, which (i) does not touch — so the two compose rather than diverge. ⚠️ **To attack:** whether (i) should apply on ABOVE-plan fills too (11 of 239 — inside the window, it moves the stop UP, tightening nothing relative to the fill; recommended yes, symmetric).

### A8 — OBJ-3: THE MAKER-FILL AGE (Langston's answer adopted)
`kraken_equities_ws_mid` rows: `entry_book_age_ms` NULL 18/18, `entry_observed_at_ms` non-null 18/18 (Langston). The maker fill path stamps `entryObservedAtMs: provenance.observedAtMs` (`:1975`). **Plan: a new metadata field `entryObservedAgeMs` = fill instant − `entryObservedAtMs`, computed at the maker fill seam** (the fill instant is known there and nowhere else durably). `entry_book_age_ms` keeps its NULL-by-intent (option (b) refused).

### A9 — SIM / SYSTEM MANUAL
- **SIM:** `executeSimulatedTrade` and the VTS xStock write are not separate SIM components; S27 (the level-basis funnel) is untouched. Step 10 adds the re-base to the open-path entry and the `entryObservedAgeMs` stamp to the provenance stamps row.
- **System Manual:** `:731` documents crypto only and `:750` names the xStock gap — Step 10 writes A1 and the re-base rule there.

### A10 — LEDGER CHECK (§9.5(b-ii))
`RUNNING_ISSUES` searched for `stopPrice`, `stop_loss`, `decision price`, `re-base`, `entry_decision_price`: `#1250` itself and `#1235` (the window). No prior decision to keep decision-referenced levels. `KD-36` (trailing/BE off) holds ⇒ the re-based stop is the operative exit.
REVIEWER: claim-only · "what other states are consistent with: xStock taker stops are written from the decision price on every taker open" · NOT RUN — `NOT RE-READ`, the mechanism is cited at two write lines; Langston is the second pass.

## 2. THE PLAN — every item back-references its finding
| # | item | from |
|---|---|---|
| **P1** | In `executeSimulatedTrade`, after the taker fill and AFTER `refuseTakerBooking`, the entry window and the shadow (they keep the plan), and BEFORE `computeFillEconomics`: on `!_b72cPendingMaker && _openClass === 'xstock_spot'`, compute `rebasedStop/Target` by rule (i) in a pure helper (`core/trading/level-rebase.ts`), refuse (non-finite, stop ≥ fill, target ≤ fill) through the existing non-filled path with code `LEVEL_REBASE_INVALID`. | A2, A6, A7 |
| **P2** | `computeFillEconomics` takes the re-based stop/target on that arm. | A6 |
| **P3** | Both durable writes, the `[8.8.3-F][OPEN]` log and the admitted-row archive carry the re-based levels; `closed_trades.metadata` carries `planStopLoss`, `planTakeProfit`, `levelBasis: 'fill_rebased'` (absent ⇒ written before this deploy, never "plan"). | A2, OBJ-4 |
| **P4** | **(if Langston rules A5 in)** the VTS xStock write (`eval-cycle.ts:1206-1208`) applies the same helper on its taker arm (`_xPendingMaker` false), with the same stamp. | A5 |
| **P5** | Epoch: `calibration_epoch` `xstock_spot/paper_sim` +1 (and `xstock_spot/vts` +1 if P4), the KD-19 migration template (exactly-these-rows check, `updated_by` named). | OBJ-4 |
| **P6** | The maker fill seam stamps `entryObservedAgeMs` (metadata). | A8 |
| **P7** | Tests: the helper (below/at/above plan, invalid), the gate (a fence that the xStock maker and every crypto path write the plan levels unchanged), a mutation reverting to `signal.stopPrice` turns the engine fence red, the ordering fence (window/geometry before the re-base, economics after). | all |
| **P8** | Step 10: System Manual `:731`/`:750` (A1 + the rule), SIM, `RUNNING_ISSUES` `#1250`. | A9 |

⛔ `UNAUDITED`: nothing.

## 3. PRE-REGISTERED STEP-7 READ (written before the data)
Window: the first 5 US sessions after the deploy (xStock trades Sun 8pm ET – Fri 8pm ET). Population: xStock paper opens whose admitted row's realised `entryArm` is `taker` (C-2). **PASS:** (a) every such open carries `levelBasis='fill_rebased'` and `stop_loss = entry_price − (planEntry − planStop)` and `take_profit = entry_price + (planTarget − planEntry)` within 1e-9 relative; (b) every xStock maker open and every crypto open carries the plan levels and no `levelBasis`; (c) `entryObservedAgeMs` non-null on every xStock maker fill; (d) the epoch row(s) moved by exactly +1; (e) zero `LEVEL_REBASE_INVALID`, or each one explained. **FAIL:** any taker row with a plan-referenced stop after the deploy, or any non-xStock-taker row re-based.

## 4. HONEST LIMITS
- A4's crypto "walk producer on a maker-policy row" is unexplained and parked; it does not bear on this item.
- A3 is a cross-deploy mixture: it sizes the problem, it is not a baseline rate. The baseline is the pre-deploy population under C-3/C-4.
- The re-base changes xStock paper P&L; it does not change entry admission except through the fill-economics inputs (P2).

## 5. Plain-language summary
xStock plans are built off a 15-minute price bar, so by the time we actually buy, the price paid is usually lower. Since October 20, 162 of 239 xStock taker buys paid less than planned, and on those the stop sat on average 31 % closer than intended. The plan moves the stop and the target to the price actually paid, keeping the same distances the strategy chose, while the checks that judge "did the fill drift too far from the plan" keep looking at the plan. The audit also found the VTS has the same problem, and proposes fixing it in the same change.
