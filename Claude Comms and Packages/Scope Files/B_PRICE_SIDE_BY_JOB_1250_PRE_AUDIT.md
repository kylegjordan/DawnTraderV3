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

### A7 — THE RULE IS PER LEVEL CLASS, NOT PER ASSET CLASS (r2 — Langston BLOCKER-1, accepted)
⛔ **r1 picked a distance-preserving re-base for every level on a premise true for one strategy in eight.** Langston's census at the ref (rows = A3's population): **anchor-defined stops on 198 of 246** — `vwap_pullback` (`min(vwap − k·ATR, low24h + k·ATR)`, target `high24h − k·ATR`, `strategy-engine.ts:253-254`), `sma_trend_ride` (`min(priorSwingLow·m, sma·m)`, `:517`), `morning_star` (`min(c2Low, c1Low)·(1−buf)`, `morning-star.ts:173` — the very example r1 cited), `vwap_bounce` (`vwap·m`, `:958`), `range_trading` (`rangeLow − k·ATR`, `:856`); **mixed** — `pivot_shift` (`max(morningStarLow, entry − 1.5·ATR)`, `pivot-shift.ts:180`), `mean_reversion` (stop distance `:748`, target `meanValue·m` `:749`); **distance on both legs — `strong_bull_trend` only** (`entry ∓ k·ATR`, `strong-bull-trend.ts:152-153`).
**THE RULE, per leg:**
- **A DISTANCE-defined level is re-based by its distance from the transacted entry:** `stop' = fill − (plan − stop)`, `target' = fill + (target − plan)`. The strategy chose a distance; the distance stays in force from the price paid.
- **An ANCHOR-defined level keeps its PRICE.** The strategy chose an invalidation price (below the swing low, below VWAP); the distance is an output. A cheaper fill at the same invalidation is a better entry with a smaller R — **rule 24 outcome (2), working as designed**; moving it would carry the stop through the structure the strategy bought a buffer to stay outside of.
- **A MIXED level (`max`/`min` of an anchor and a distance) is classed by the term that BOUND at construction**, reported by the strategy itself — never inferred later from prices.
⇒ **Declaration, not inference:** each strategy stamps, beside the levels it builds, `levelClass: { stop: 'anchor'|'distance', target: 'anchor'|'distance' }` (mixed legs stamp the binding term). **Absent ⇒ anchor ⇒ no re-base** (today's behaviour — the fail-safe direction). A fence enumerates every strategy in the xStock regime membership (`getStrategiesForRegime('xstock_spot', *)`) and fails on any that does not stamp both legs.
⇒ **The population #1250 actually re-bases shrinks to distance legs:** `strong_bull_trend` 13 rows since 10-20 (9 below plan, mean room lost **0.512**, the worst of any strategy), plus `pivot_shift`/`mean_reversion` on the rows where the distance term bound (unknown until stamped).

### A11 — ⭐ THE ANCHORED CASE STILL HAS A DEFECT — THE PLAN'S OWN STOP-DISTANCE FLOOR IS NEVER RE-CHECKED AT THE FILL (r2)
Every strategy's levels pass `applyGlobalGuards` (`strategy-helpers.ts:404`), whose `validateStopDistance` (`:347-349`) refuses a plan with the stop closer than `MIN_STOP_DISTANCE_BPS` = **30 (0.3 %)** (`:26`, *"GUARD-1, Batch 18J: 20 → 30 per 4-LLM consensus"*) — **judged at the PLAN entry only.** A cheaper fill moves the entry toward an anchored stop and nothing re-checks the floor.
**Measured (A3's population, n = 239): the fill-relative stop was under 0.3 % on 25 rows; the plan-relative stop on 0. All 25 closed on a stop; combined P&L −$4.71.**
**Provenance and precedent:** Kyle's own F-G-1 P2 (`signal-orchestrator.ts:708-722`): after price-grid rounding moves the levels, the floor is re-checked — *"THE POST-ROUND RE-CHECK (Kyle's, and it is a CORRECTNESS requirement rather than a precaution) … `MIN_STOP_DISTANCE_BPS` is the ONE check with no downstream re-run."* A fill that moves the entry is the same event one step later. **Rule 24 outcome (1) for this leg: a real defect — a validity guard applied to the plan and not to the trade carried.**
⇒ **Fix:** re-check `validateStopDistance(fill, carriedStop)` on every xStock taker open and on the VTS xStock taker (crypto taker re-check is `8c`'s to adopt, recorded there), refusing as `STOP_DISTANCE_AT_FILL`. It never moves a level.
⚠️ `MIN_STOP_DISTANCE_BPS` is a code constant, not a DB-governed setting — read as-is; its governance is not this item's.

### A8 — OBJ-3: THE MAKER-FILL AGE (Langston's answer adopted)
`kraken_equities_ws_mid` rows: `entry_book_age_ms` NULL 18/18, `entry_observed_at_ms` non-null 18/18 (Langston). The maker fill path stamps `entryObservedAtMs: provenance.observedAtMs` (`:1975`). **Plan: a new metadata field `entryObservedAgeMs` = fill instant − `entryObservedAtMs`, computed at the maker fill seam** (the fill instant is known there and nowhere else durably). `entry_book_age_ms` keeps its NULL-by-intent (option (b) refused).

### A9 — SIM / SYSTEM MANUAL
- **SIM:** `executeSimulatedTrade` and the VTS xStock write are not separate SIM components; S27 (the level-basis funnel) is untouched. Step 10 adds the re-base to the open-path entry and the `entryObservedAgeMs` stamp to the provenance stamps row.
- **System Manual:** `:731` documents crypto only and `:750` names the xStock gap — Step 10 writes A1 and the re-base rule there.

### A10 — LEDGER CHECK (§9.5(b-ii))
`RUNNING_ISSUES` searched for `stopPrice`, `stop_loss`, `decision price`, `re-base`, `entry_decision_price`: `#1250` itself and `#1235` (the window). No prior decision to keep decision-referenced levels. `KD-36` (trailing/BE off) holds ⇒ the re-based stop is the operative exit.
REVIEWER: claim-only · "what other states are consistent with: xStock taker stops are written from the decision price on every taker open" · NOT RUN — `NOT RE-READ`, the mechanism is cited at two write lines; Langston is the second pass.

## 2. THE PLAN (r2) — every item back-references its finding
| # | item | from |
|---|---|---|
| **P0** | Each strategy in the xStock regime membership stamps `levelClass` beside its levels (mixed legs: the binding term); it rides the signal metadata through dispatch → RTB → `processSignal` (Step 3 traces and fences every hop; a hop that drops metadata is fixed in the same item). Absent ⇒ anchor. Fence: every member stamps both legs. | A7 |
| **P1** | Pure helper `core/trading/level-rebase.ts`: distance legs by rule, anchor legs unchanged; refuses non-finite or inverted output. | A7 |
| **P2** | **(BLOCKER-2) In `executeSimulatedTrade`, compute the carried levels into LOCALS before `computeFillEconomics` (`:6440`); `signal.*` is never mutated.** Gate `!_b72cPendingMaker && _openClass === 'xstock_spot'`. Arguments per call site: the shadow, the window and `refuseTakerBooking` keep `signal.stopPrice`/`signal.targetPrice` (A6 — they judge the plan); **`computeFillEconomics` receives the carried locals in its `stopPrice`/`targetPrice` keys** (BLOCKER-3 below); the two durable writes, the `[8.8.3-F][OPEN]` log and the admitted-row archive write the carried locals. `_fillEconRec` stays where it is, so the ENTRY_WINDOW refusal archive keeps it (`:6494`). | A2, A6, A7 |
| **P3** | **The floor at the fill:** after `refuseTakerBooking`, `validateStopDistance(actualEntryPrice, carriedStop)` false ⇒ refuse `STOP_DISTANCE_AT_FILL`, archived and counted like its siblings, before any write. | A11 |
| **P4** | Stamp on the row (`closed_trades.metadata`): `planEntryPrice`, `planStopLoss`, `planTakeProfit`, `levelClass`, `levelBasis: 'fill_rebased' or 'plan'` (absent ⇒ written before this deploy). | OBJ-4 |
| **P5** | **VTS xStock (A5, ruled in):** the taker arm (`_xPendingMaker` false) at `eval-cycle.ts:1206-1208` applies the same helper and the same floor re-check, and stamps the same plan fields on the VTS row, so §3's VTS leg is runnable (Langston condition (b)). | A5 |
| **P6** | Epochs: `calibration_epoch` `xstock_spot/paper_sim` +1 and `xstock_spot/vts` +1, the KD-19 template. | OBJ-4 |
| **P7** | Maker fill seam stamps `entryObservedAgeMs`. | A8 |
| **P8** | Tests: the helper per leg class and per side (below/at/above plan); **an ARGUMENT-PROVENANCE fence per call site** — the window, shadow and `refuseTakerBooking` receive `signal.*`, `computeFillEconomics` and both writes receive the carried locals (an order fence would pass a swapped argument); the floor refusal both arms; the gate fence (xStock maker and every crypto path write plan levels, no re-base, no floor-at-fill); a mutation reverting a write to `signal.stopPrice` turns it red; the `levelClass` membership fence. | all |
| **P9** | Step 10: System Manual `:731`/`:750` (A1, the per-leg rule, the floor at fill), SIM, `RUNNING_ISSUES` `#1250`; the crypto floor-at-fill noted on `8c`. | A9 |

### BLOCKER-3 — the fill-economics change, NAMED AND SIZED (r2)
**It is an admission change and is stated as one.** On a distance-re-based leg, `fill − stop' ≡ plan − planStop` and `target' − fill ≡ planTarget − plan`, so the kernel's `distStop`/`distTarget` (`fill-economics.ts:120-125`) equal the plan's and only friction scales with price: the test judges **the trade the position carries**, its header's stated job (*"the economic test at the price actually paid"*) — but it no longer penalises an above-plan fill's geometry. **Anchor legs are unchanged** (their carried levels ARE the plan levels). **Size, historical (A3, 239 rows):** distance-leg rows = `strong_bull_trend` 13 (9 below, 1 above, 3 at plan); mixed legs unknown until stamped ⇒ at most **1 above-plan row** in the window would be judged more leniently than today. **Disposition: accept, recorded here and in the System Manual at Step 10;** the entry window still bounds how far above plan a taker may fill (`entry_window_worse_side_frac`, inc A).

### Smaller (r2)
- **A2's maker row — the stronger answer:** a resting xStock maker pays its limit EXACTLY: `_b72cLimit = signal.entryPrice` (`:6202`) and the resting fill seam rewrites provenance only, never the entry price (`:1952-1954`). C-2's maker question is discharged by construction.
- **A6's `where` column** reads the call sites: shadow `:6437`, window `:6438`, economics `:6440`, `refuseTakerBooking` `:6461`.
- **A10's negative claim** stays `NOT RE-READ` / ruled on reported fact; nothing rests on it.

## 3. PRE-REGISTERED STEP-7 READ (written before the data)
Window: the first 5 US sessions after the deploy (xStock trades Sun 8pm ET – Fri 8pm ET). Population: xStock paper opens whose admitted row's realised `entryArm` is `taker` (C-2). **PASS (r2):** (a) every such open carries `levelClass` and `levelBasis`; each DISTANCE leg reads `stop_loss = entry_price − (planEntryPrice − planStopLoss)` / `take_profit = entry_price + (planTakeProfit − planEntryPrice)` within 1e-9 relative, each ANCHOR leg equals its plan level; (a2) zero opens with a fill-relative stop under 0.3 %, and every `STOP_DISTANCE_AT_FILL` refusal archived; (a3) the VTS xStock taker rows carry the same stamps and satisfy (a) and (a2); (b) every xStock maker open and every crypto open carries the plan levels and no `levelBasis`; (c) `entryObservedAgeMs` non-null on every xStock maker fill; (d) the epoch row(s) moved by exactly +1; (e) zero `LEVEL_REBASE_INVALID`, or each one explained. **FAIL:** any taker row with a plan-referenced stop after the deploy, or any non-xStock-taker row re-based.

## 4. HONEST LIMITS
- A4's crypto "walk producer on a maker-policy row" is unexplained and parked; it does not bear on this item.
- A3 is a cross-deploy mixture: it sizes the problem, it is not a baseline rate. The baseline is the pre-deploy population under C-3/C-4.
- The re-base changes xStock paper P&L; it does not change entry admission except through the fill-economics inputs (P2).

## 5. Plain-language summary
xStock plans are built off a 15-minute price bar, so by the time we actually buy, the price paid is usually lower. Since October 20, 162 of 239 xStock taker buys paid less than planned, and on those the stop sat on average 31 % closer than intended. The plan moves the stop and the target to the price actually paid, keeping the same distances the strategy chose, while the checks that judge "did the fill drift too far from the plan" keep looking at the plan. The audit also found the VTS has the same problem, and proposes fixing it in the same change.

## 6. ✅ STEP 2 r1 RULED 2026-11-07 (Langston, Discord `1568658974448812234`, at `43c66f16b`) — SENT BACK, three blockers; folded (r2)
- **BLOCKER-1** (rule (i) on a premise false for ~80 % of rows): A7 rewritten per level class; declared, not inferred; absent ⇒ anchor. **It surfaced A11** — the anchored case's real defect is the stop-distance floor never re-checked at the fill (25 of 239 under 0.3 %, all stopped, −$4.71).
- **BLOCKER-2** (no insertion point; order is not the invariant): carried levels computed into locals before `:6440`; P8 fences argument provenance per call site; `_fillEconRec` placement untouched.
- **BLOCKER-3** (P2 loosens a live refusal unnamed): named and sized above; accepted with its direction stated.
- **A5 ruled in**, conditions met: P5 inherits the per-leg rule; the VTS row carries the plan fields, so §3's VTS leg is runnable.
- **His confirmations recorded:** A3 exact to the row (and 7/7 still-open rows below plan); A1's chain; A2's census complete by construction (`private`).
