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

## 7. r3 — STEP 2 r2 RULED 2026-11-07 (Langston, Discord `1568662748320235525`, re-derived at `b3aa3989`) — SENT BACK: BLOCKER-1/2 discharged, BLOCKER-3 re-opened, BLOCKER-4/5 new; A11 ruled FOLD-IN, no Kyle slot. ⛔ THIS SECTION SUPERSEDES A7's two-valued rule, P0, P1 and the BLOCKER-3 sizing above.

### 7.1 BLOCKER-4 + BLOCKER-5 — FOUR CONSTRUCTION FORMS, STAMPED AT THE BRANCH THAT BUILT THE LEVEL
Read at the ref (`strategy-engine.ts:245-258`, `:515-532`, `:745-749`, `:955-960`, plus Langston's per-leg list). **A level is built one of four ways, and a single strategy can use different forms on different branches:**
| form | how the strategy built it | re-derived at the fill | examples at the ref |
|---|---|---|---|
| **anchor** | a market price (VWAP, swing low, 24 h high/low, range low, mean) | **unchanged** | `vwap_pullback` default stop `:253`; `sma_trend_ride` stop `:517`; `vwap_bounce` stop `:958`; `morning_star` stop `morning-star.ts:173`; `mean_reversion` target `:749` |
| **distance** | entry ± k·ATR | `level' = level + (fill − plan)` | `strong_bull_trend` both legs; `vwap_pullback` B63 override stop `:247`; `morning_star` target `:175`; `pivot_shift` target `:182` |
| **r_multiple** (targets) | entry + R·(entry − stop) | `target' = fill + R·(fill − stop')`, `R = (planTarget − plan)/(plan − planStop)` | `vwap_bounce` `:960`; `sma_trend_ride` break branch `:531`; `vwap_pullback` override `:249` and the `twoRTarget` arm of `:257` |
| **proportional** | a fraction of the price | `level' = level · fill/plan` | `sma_trend_ride` trailing-branch target `:525`; `mean_reversion` stop `:748` (`currentPrice·(1 − buffer)`, entry = `currentPrice·premium`) |
**Mixed constructions (`max`/`min` of two forms — `vwap_pullback :253` stop, `:258` `max(anchorTarget, twoRTarget)`, `pivot_shift :180`) stamp the form of the term that WON at construction**, at the line that chose it. ⇒ **`vwap_pullback` (106 of 239 rows) is stamped per branch** — the B63 override (`:246`) and the default (`:251`) produce different forms; A7's "198 of 246 anchor stops" was a by-strategy inference and is **withdrawn**; the per-row form mix is **unmeasurable historically** (no row carries it) and is first measured by the stamps at Step 7. A3's population is **239**.
**Stamp:** `levelSpec: { stop: {form}, target: {form, r?} }` beside the levels, at the branch. **Absent ⇒ every leg `anchor` ⇒ no change** (fail-safe = today).
**Fences (Langston: the presence fence passes a wrong stamp):**
1. **Counterfactual invariance, per strategy and per branch:** run the strategy on a fixture, then on the same fixture with only the decision price perturbed, and assert each leg moved as its stamp claims — anchor invariant, distance 1:1, r_multiple with the risk, proportional scaled. A wrong stamp fails.
2. **Membership through the normaliser:** every key in the xStock regime membership, normalised (`canonical-regime-strategy-map.ts:252`, alias `:613` — `range_trading` → `range_trade`, the `#1063` drift), has a counterfactual fixture. **Sized: 8 strategies traded (their branches classified above); 11 more in the membership (`orb`, `reverse_impulse`, `support_bounce`, `volatility_edge`, `adaptive_flow`, `abcd_long`, `dhma`, `breakout`, `inside_bar_reversal`, `liquidity_trap`, `defensive_hedge`) = 22 leg judgements plus their branches, made in Step 3 by reading each construction and proved by fence 1.**
3. **Self-consistency at birth (runtime, cheap):** applying the stamp at the plan entry must reproduce the plan level exactly; a mismatch drops the stamp (⇒ anchor, no change) and counts `LEVEL_SPEC_INCONSISTENT`. It cannot catch a wrong form that happens to reproduce — fence 1 does that.

### 7.2 BLOCKER-3 — RE-SIZED, BOTH DIRECTIONS, AND MEASURED RATHER THAN ARGUED
r2 sized it on `strong_bull_trend` alone; distance and r_multiple TARGETS are wider. On a **below-plan** fill a distance target returns from `planTarget − fill` (larger) to `planTarget − plan`, and an r_multiple target over an anchored stop shrinks with the smaller risk — **both shrink `distTarget`, so net EV at fill FALLS and admission TIGHTENS**; on an **above-plan** fill the reverse — it LOOSENS. Exposure in A3 (by strategy; the per-row form is not knowable historically): below-plan rows on strategies with a non-anchor target — `strong_bull_trend` 9, `morning_star` 23, `pivot_shift` 22, `vwap_bounce` 3, `sma_trend_ride` 34, `vwap_pullback` up to 67 (form-dependent); above-plan 11 (8 `vwap_pullback`, 2 `vwap_bounce`, 1 `strong_bull_trend`). ⇒ **Up to ~158 rows exposed to a tightening, up to 11 to a loosening; the dominant direction is TIGHTER.**
**P2b (new): the admitted and refused rows record BOTH `netEvAtFill` (carried geometry, deciding) and `netEvAtFillPlanGeometry` (today's inputs, recorded only).** Step 7 counts the flips in each direction instead of estimating them.
**Disposition: accept the carried geometry as the deciding one** — the test exists to judge the trade the position will be (its header), and the dominant effect is the fail-safe direction; recorded in the System Manual at Step 10.

### 7.3 A11 / P3 — FOLD-IN, his three conditions
- **(a) An admission change, stated:** 25 of 239 (10.5 %) would have been refused, all 25 closed on a stop; +$4.71 over the window had they been refused.
- **(b) Ordering — the WINDOW wins, and a fixture pins it:** the two are NOT exclusive by construction. The floor fails mostly on a BELOW-plan fill over an anchor stop (the window never refuses those); but an ABOVE-plan fill over a DISTANCE stop keeps the distance and lowers its fraction (`d/fill < d/plan`), so a plan sitting near 0.3 % can fail the floor at a fill the window also refuses. **P3 sits after the `ENTRY_WINDOW` return (`:6497`), so a doubly-refusable row reports `ENTRY_WINDOW`** — the cause (the fill drifted past the plan's window) rather than its consequence (the stop fraction it produced). §3(a2) counts `STOP_DISTANCE_AT_FILL` on rows the window admitted; a fixture drives one doubly-refusable input and asserts `ENTRY_WINDOW`.
- **(c) Live mode:** P3 refuses after `actualEntryPrice` exists — clean in paper (an internal fill), but in live a taker fill is already executed. Its two siblings (`ENTRY_GEOMETRY`, `ENTRY_WINDOW`) have the same shape; this is the third. `DISPOSITION: added to the live-readiness list (`PRE_LIVE_SPRINT.md`) as an item — "post-fill refusals in live mode (three: ENTRY_GEOMETRY, ENTRY_WINDOW, STOP_DISTANCE_AT_FILL) must become pre-placement checks or an immediate flatten" — owner to place.`

### 7.4 A4's park, dispositioned
The crypto rows carrying `crypto_ws_book_walk` on a maker-policy signal are a provenance label on a durable column that may name the wrong arm. `DISPOSITION: added to 8c as an item, owner CC-C` — no new slot.

### 7.5 §3 r3 — named expected counts per arm
Population: xStock paper taker opens (realised `entryArm`), five US sessions. **Expected:** `STOP_DISTANCE_AT_FILL` on ≈ 10 % of taker opens (25/239); `levelSpec` present on 100 % of opens from a stamped strategy, `LEVEL_SPEC_INCONSISTENT` = 0; flips (7.2) reported both directions with counts. **A zero `STOP_DISTANCE_AT_FILL` over ≥ 50 taker opens is a FAIL to investigate (the gate never armed), not a clean read.** VTS xStock taker arm: the same, from its own rows.

### 7.6 Plan deltas (supersede P0, P1, and extend P2-P3, P8)
- **P0 (r3):** `levelSpec` stamped per leg at the constructing branch, every strategy in the normalised xStock membership (19); fences 1-3 above.
- **P1 (r3):** `rebaseLevels` implements the four forms; the r_multiple target is re-derived from the CARRIED stop.
- **P2b:** both EVs recorded (7.2).
- **P3 (r3):** placed after the `ENTRY_WINDOW` return; the window wins a doubly-refusable row, pinned by a fixture.

## 8. r4 — STEP 2 r3 RULED 2026-11-07 (Langston, graded at `95b2473f4`) — SENT BACK: BLOCKER-6, BLOCKER-7, six measured corrections; everything else in §7 accepted as ruled. ⛔ THIS SECTION AMENDS §7.1, §7.5, P0, P1 and P8.

### 8.1 BLOCKER-6 — A MIXED CONSTRUCTION IS RE-APPLIED WHOLE, NEVER WINNER-ONLY
Winner-only re-derivation can return a level the construction itself would never produce: `pivot-shift.ts:180` `max(morningStarLow, entry − 1.5·ATR)` (*"picks tighter stop for BUY"*) re-derived as `fill − 1.5·ATR` alone can fall BELOW `morningStarLow` — a wider stop, risk-increasing; `vwap_pullback :258` `max(anchorTarget, twoRTarget)` can flip winner and land below its own output.
⇒ **`levelSpec` carries the operator and BOTH terms:** a leg is either a single form or `{ op: 'max'|'min', terms: [spec, spec] }`; at the fill each term is re-derived by its form and **the same operator is re-applied.** `pivot_shift` stop ⇒ `max(morningStarLow, fill − 1.5·ATR)`; `vwap_pullback` default target ⇒ `max(anchorTarget, fill + R·(fill − stop'))`.
**The genuinely mixed set among the 8 traded strategies is exactly these two** (`vwap_pullback :258`, `pivot_shift :180`). **Correction to §7.1's prose:** `vwap_pullback :253` and `morning_star :173` are `min()`s of two ANCHOR terms (the ATR offsets are from `vwap`/`low24h`/candle lows, not from entry) — anchor whichever wins; the table had them right.
⇒ **Fence 1 re-stated:** with the whole construction re-applied, a perturbation large enough to flip the operator must still pass — the fence uses perturbations on BOTH sides of the flip point, and a fixture that flips the winner is required for each mixed leg.

### 8.2 BLOCKER-7 — THE CHECK RUNS WHERE THE ROUNDED PLAN ARRIVES; `r` IS STAMPED; THE RE-BASED LEVELS ARE ROUNDED TOO
The active xStock signal is born in the VTS lane unrounded (`eval-cycle.ts:744-746`, tag-only grid evaluation) and rounded once by the orchestrator (`signal-orchestrator.ts:726-729`, *"ROUND ONCE, PERSIST ONLY THE ROUNDED VALUES"*). So the plan that reaches `executeSimulatedTrade` is post-rounding while `levelSpec` is stamped pre-rounding.
- **Self-consistency moves to the re-base site**, against the plan values that ARRIVE, with a **one-venue-tick tolerance** (the class grid, `resolveVenueGrid` / `isOnGrid` `venue-price-grid.ts:214`). Failure ⇒ that leg is not re-based (anchor), counted `LEVEL_SPEC_INCONSISTENT` and archived with both values — and §3 names its expected count as **0**, so a non-zero is a reported FAIL, not a silent no-op.
- **`r` is stamped explicitly** by the strategy (`override.targetAsRMultiple`, `c['target_r_multiple']`, `c['break_target_r_multiple']`, `c['target_r_multiple_default']`) — never back-derived from rounded numbers.
- **⭐ The re-based levels are themselves rounded to the venue grid** (F-G-1: every price we emit is venue-representable), by the same rounding the orchestrator applies at birth (`roundPriceForRole`, `venue-price-grid.ts:236`, per level role — the per-leg form of `roundTripleToGrid` `:263`, which the orchestrator calls at `signal-orchestrator.ts:90`-imported birth), and **P3's floor is judged on the ROUNDED carried stop** — the same order Kyle's post-round re-check uses. (Missing from r3; the r3 ruling's rounding point surfaced it.)
- **The two arms have two plan bases, and §3 says so:** active xStock plans are post-rounding and its re-based levels are rounded; the VTS xStock lane books unrounded (`:1207-1208`) and re-bases unrounded. §3(a) is checked at one-tick tolerance on the active arm and at 1e-9 relative on the VTS arm; they are NOT pooled.

### 8.3 MEASURED CORRECTIONS (Langston, folded)
- **Membership is 18, not 19:** `defensive_hedge` is class-ineligible for `xstock_spot` (`canonical-regime-strategy-map.ts:429-431`, `excludeStrategies.HIGH_VOLATILITY_UNSTABLE`; `:231` is its only base placement), and `getStrategiesForRegime` (`:714`) reads the materialised map. ⇒ **10 untraded members, 20 leg judgements** in Step 3. (19 was the gate-seed count, `:1190` — an adjacent object.)
- **Fence 2 keys through `resolveCanonicalStrategy` (`:682`, fail-closed)**, not bare `normalizeStrategy` (`:662`, identity-returns an unknown token by contract — a drifted key would pass as canonical). The alias is `:613`; `:252` is the `range_trade` definition.
- **A3 as of 2026-11-07T16:52Z (Langston's re-derivation, same predicates): 246 total / 169 below / 11 above / 66 at plan; `vwap_pullback` 110.** The 7 added are the 7 still-open below-plan rows. Floor arm unchanged: **25, all `stop_hit`, −$4.7060, plan-relative 0.** Non-anchor-target below-plan exposure **165** against **11** the other way — the TIGHTER direction holds. (§1 A3's 239 is the same query at ~16:00Z.)
- **§7.5's expectation is restated on the window-admitted denominator:** the floor fails on a fill the window admitted, so the expectation is **≤ ~10 % of window-admitted xStock taker opens (25/239 is an upper bound — it carries no window filter)**, and the FAIL threshold is **zero `STOP_DISTANCE_AT_FILL` over ≥ 50 window-admitted taker opens.**
- **P8's matrix adds the cross pairing anchor stop × r_multiple target** (`vwap_bounce :958/:960`, traded) — the only pairing where the carried-stop dependency and a swapped argument are observable (on a distance stop, r_multiple and distance re-derivations coincide). **Fence 1's claim is narrowed:** it proves each leg moves as its stamp claims; it cannot separate observationally-equivalent forms, and does not claim to.
- **Fence 1's fixtures assert both runs produced a signal ON THE SAME BRANCH** (`isNearVWAP`/`isNearSupport`/`isOversold` can null or re-route under perturbation); a run that changes branch is not a comparison.
- **A11's record:** the floor already has TWO plan-side sites — `applyGlobalGuards` at construction and `signal-orchestrator.ts:714` post-rounding — so P3 is the **third** check.

### 8.4 Plan deltas (amend §7.6)
- **P0 (r4):** `levelSpec` per leg = a form, or `{op, terms}` for the two mixed legs; `r` stamped explicitly.
- **P1 (r4):** `rebaseLevels` re-derives each term by form and re-applies the operator; then rounds to the venue grid exactly as the orchestrator's birth rounding does; self-consistency at one tick against the arriving plan, per leg.
- **P3 (r4):** judged on the rounded carried stop; after `ENTRY_WINDOW`.
- **P8 (r4):** the matrix above; flip fixtures for each mixed leg; same-branch assertion; the anchor × r_multiple pairing.

## 9. ✅ STEP 2 r4 RULED 2026-11-07 (Langston, Discord `1568677973609947248`, at `b93473fd9`) — PROCEED. Board Review = Approved. Two fold-ins for Step 3, recorded here before any code.
- **C-1 — the mixed set is 5 of the 18 members, not 2:** besides `pivot_shift` and `vwap_pullback`, `abcd_long` (`strategy-engine.ts:395`, `min(entry + abDistance, entry + R·risk)` — distance × r_multiple), `adaptive_flow` (`adaptive-flow.ts:175`, `min(threeSoldiersLow·(1 − buf), entry − k·ATR)`) and `volatility_edge` (`volatility-edge.ts:199`, `min(cPointLow + (bHigh − aLow)·0.85, entry + k·ATR)`). **P0's `{op, terms}` is built for all five from the start, each with a flip fixture.**
- **C-2 — the cap bit travels on the target leg:** `roundPriceForRole` rounds a target AWAY from entry unless `targetIsCap`; today the one cap (`volatility_edge`) is derived by a strategy-name equality at `signal-orchestrator.ts:597`. ⇒ the target leg carries `isCap` (absent ⇒ not a cap, today's behaviour for every other strategy), the re-base rounds with it, and **`:597` reads the stamped bit instead of re-deriving it** — no third copy of a strategy-name narrowing in that function (its own comment at `:602-606` names that defect). A fence asserts the re-based cap is rounded TOWARD entry. Zero live xStock exposure today, which is why it is fenced rather than observed.
- **Citations corrected:** `resolveCanonicalStrategy` is `canonical-regime-strategy-map.ts:684`; the floor re-check `signal-orchestrator.ts:715`; "ROUND ONCE" `:723`; the grid module is `server/core/calculations/venue-price-grid.ts`; the cap is `volatility-edge.ts:199`.
- **His instrument note, kept:** his own first exposure query returned 168 because it filtered `range_trade` while the stored label is `range_trading` — the reason fence 2 keys through the fail-closed resolver.

## 10. STEP 4 RULED 2026-11-07 (Langston, Discord `1568695509906886678`, graded `225fb63c4..c8d997a8e`) — SENT BACK on two one-line CHANGES, everything else PROCEEDS; folded (r2)
- **Range correction (his measurement):** the code range is `225fb63c4..c8d997a8e` (27 files, +1008/−25); `b6646934b` IS the P1 commit, so the range the dispatch named excluded `level-rebase.ts`.
- **CHANGE-1 (folded):** the `order_computed` log printed `_carriedStop` beside `signal.targetPrice` — now `_carriedTarget`. **The fence now asserts the ABSENCE:** no `signal.stopPrice`/`signal.targetPrice` read anywhere past the economics refusal in `executeSimulatedTrade`, plus the `takeProfit: _carriedTarget` count (2).
- **CHANGE-2 (folded):** `stopBasis`/`targetBasis` are DERIVED from the emitted value against the arriving plan — a mixed leg whose anchor wins at both prices reads `plan` (it read `fill_rebased`, #546). Fixture added.
- **Fence 1 hardening (his (a)):** each pinned LEVEL expression must occur exactly once in its file (entry expressions are shared across strategies and stay presence-only).
- **§3 narrowed, as he measured (his (b)):** the runtime self-consistency check can only fire on MIXED and `r_multiple` legs — for `anchor`/`distance`/`proportional` legs `atPlan` returns the arriving level, so the test is `|x − x|`. ⇒ **the pre-registered `LEVEL_SPEC_INCONSISTENT = 0` is read as zero over the mixed and `r_multiple` legs only**; over the other 16 leg-instances it is structurally guaranteed and is NOT evidence. A wrong single-form stamp is caught only by fence 1 (at the source), never at runtime.
- **dhma magnitude corrected:** live `strategy.dhma/entry_premium_mult = 1.001` ⇒ the distance approximation errs by `1 − 1/1.001 = 0.0999 %` of the shift; with `entry_gate.entry_window_worse_side_frac = 0.25` (xstock_spot) the shift is ≤ 0.25R, so the error is **≤ 0.00025R**. (The change list said ~0.05 %.)
- **Honest magnitude, for the completion report:** 15 of the 21 branches have an ANCHOR stop, so their risk leg does not move; 14 of 21 have a target that follows the fill. This is mostly a target change wearing a stop-and-target title — and the floor at the fill (A11) is what acts on the anchored stops.
- **Stated limit:** the `ENTRY_WINDOW` archive row does not carry `_levelRec`, so stamp coverage across window-refused takers is unmeasured — outside §3's denominator (window-admitted).

### §13 homes (his, recorded)
- `DISPOSITION: added to #1250 (row 17), owner CC-C, before the close — FINDING-1b: stamp the BUILT VALUE on every leg (not only mixed terms) so the runtime self-consistency check reaches anchor/distance/proportional legs; then widen §3's zero to all legs.`
- `DISPOSITION: added to #1250, owner CC-C — active-execution-engine.ts:5043 is still a read-modify-write of closed_trades.metadata, the pattern P7's merge exists to avoid, and the surviving clobber path for entryObservedAgeMs; benign on ordering today (the fill precedes the close).`
- **Surfaced for Kyle's list, NOT placed (his item (iii)):** his withdrawn `#1224` ruling dropped the RR-floor-at-fill leg because the stop was pinned to the plan; for the 4 branches with distance/proportional stops that premise is now gone (RR at the fill equals RR at the plan exactly) — worth re-examining; the 15 anchor-stop branches are unaffected, so the dissolution is partial.

## 11. ✅ STEP 4 r2 RULED 2026-11-07 (Langston, Discord `1568700844990267433`) — PROCEED at `cc4d2a9fc677603af932a9b68ab1409416a8cd75`. Board Review = Approved.
- **His condition:** CI 4/4 per job at `cc4d2a9fc…` (or its successor head) before Step 5/6, and the completion report cites THAT run — never `42400507691` (that run is on the pre-CHANGE code at `67a5440877…`, byte-identical to `c8d997a8e`). **Met:** run **`42402388355`** at `cc4d2a9fc677603af932a9b68ab1409416a8cd75`, TypeScript Check (baseline gate) / Build / Test Suite / Docker Build — success each. Cite full shas (`cc84ec768` and `cc4d2a9fc` share a prefix).
- **His notes for the report:** `takeProfit: _carriedTarget` ×2 is identical in both shas — a regression fence, not evidence of this commit; the `plan` basis now unions anchor/unstamped, self-consistency failure, and re-derived-but-unchanged, each recoverable from the row.
- `DISPOSITION: added to #1250 (row 17), owner CC-C, before the close — the duplicate stamp pin: `_targetSpec = { form: 'proportional' };` occurs twice in strategy-engine.ts (abcd_long fixed target, sma_trend_ride trailing), so either copy satisfies either case's toContain; pin a branch-distinguishing substring or assert the occurrence count, and give the wiring fence's at() a uniqueness assert. Verified by Langston at Step 10.`
- **Deploy held on a shared range:** OLD Claude's `885f1a314` (B-DB-POOL-GUARD inc 3b P4) sits between the #1250 commits, its Step-4 fold `1d4be9cf7` is above `cc4d2a9fc`; one deploy of a sha carrying both, after inc 3b's PROCEED and CI at that sha.

## 12. STEP 6 + STEP 7 (deploy-time leg) — 2026-11-07
- **Deployed** by OLD Claude in one joint deploy with B-DB-POOL-GUARD inc 3b: `1d4be9cf7c27ab337dd68e660a56a89b737d27f0`, live 2026-11-07T19:06:27Z (both Step-4 PROCEED; CI `42403770541` 4/4 at that sha, his post).
- **Migration PASS:** `calibration_epoch` `xstock_spot/paper_sim` 7 → 8 and `xstock_spot/vts` 10 → 11, both `updated_by b-price-side-1250`, `updated_at` 19:06:15Z; every other row unchanged against the 15:15Z read (crypto_spot/vts 8, crypto_spot/paper_sim 3, xstock_spot/live 3, the three `*` rows). `_migrations` row at 19:06:15Z.
- **The process runs the new code:** `dist/index.js` — `rebaseLevels` 3 lines, `STOP_DISTANCE_AT_FILL` 1, negative control string 0.
- **Boot:** only the known `#1053` TEC prime race; no `#1250` line (xStock closed for the weekend; crypto does not take the path).
- **NOT YET VERIFIED — needs live xStock taker opens (first session Monday 2026-11-10 ~01:00Z onward):** the stamps on the row, both refusals, the VTS `levelRebase`, and the UI (Open Trades, Claude-in-Chrome). Carriers: first look `0c5f81ac-be2d-4d68-8e47-1a97d7079356` (2026-11-10T02:00Z), five-session read `ac78c006-76a1-48a9-bea4-b4a8bbea416d` (2026-11-15T02:00Z). Both post-fill refusals and the VTS arm stay unexercised until then (#661 leg 3) — no silence before then is evidence.

