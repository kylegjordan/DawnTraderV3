# B-PRICE-SIDE-BY-JOB row `8a-P3` — CRYPTO FINISH: every crypto MAKER FILL, PLACEMENT CHECK and EXIT decided and booked on the transactable side

change-class: architecture

**Owner:** CC-C · **Plan home:** `PHASE_19_PLAN.md` row `3n.q` (`B-MAKER-FILL-TRANSACTABLE-SIDE`), crypto half — plus the VTS exit lane that `8a-P2` left out of scope by statement (`vts-runner.ts:3254` / `:4059` `triggerPrice: currentPrice`).
**Ref read:** `origin/migration/aws-supabase` @ `35710a5b7` (r1 cited `bef16dbee`, r2 `e22022509`; Langston confirmed every §1 `path:line` holds at `35710a5b7`).
**Rev:** r4 · **Lean run** (Kyle's weekly token budget): ONE document carries Step 1 (scope) AND Step 2 (audit + plan).
**Langston r1:** Step 1 **PROCEED WITH CONDITIONS**; Step 2 **CHANGES-NEEDED**; §2 provenance **APPROVED and settled — unchanged since.** **Langston r2:** Step 2 **CHANGES-NEEDED** on J1 only (two blockers, two findings, two conditions); everything else accepted. **r3 changed J1, P3, P4, P5, OBJ-6.** **Langston r3:** both r2 blockers discharged; one blocker on J2, one condition, one finding. **r4 changes J1 (pre-registration), J2, P3, OBJ-5.** Change logs at §8 (r2), §9 (r3), §10 (r4).

---

## 0. THE DIRECTIVE

Kyle, 2026-09-15, on learning that `8a-P2` covered one cell: *"My understanding of what we just did in that last batch was to make sure that we were not using midpoint prices to exit, whether that was for the stop or for the target. And that that was for crypto X stock, VTS, paper mode, live mode. So if any of that is wrong, then we need to finish the batch."* Then, on the proposed split: *"I'm fine with your cheap way to finish."* ⇒ **crypto now (`8a-P3`); xStock after the Friday budget reset (`8a-P4`).**

**The rule being applied is not new:** job 3 (TRIGGERING — including a resting order FILLING) and job 4 (BOOKING) take the transactable side. A SELL is judged and booked on the **BID**; a BUY on the **ASK** (`SYSTEM_MANUAL` §18.0; Langston's `#741` bucket-2 ruling, `RUNNING_ISSUES.md:3795`).

---

## 1. THE CELLS — WHAT EACH CRYPTO SITE USES TODAY (audit, read at the ref)

| # | site | job | today | after `8a-P3` |
|---|---|---|---|---|
| **C1** | paper resting ENTRY buy fill — `aee:2206` → `_processPendingMaker` → `evaluatePendingMaker` (`aee:1554`) | fill | `currentPrice` = the mark (midpoint) | **ask ≤ limit** |
| **C2** | paper resting TARGET-EXIT sell fill — `aee:2498` | fill | `currentPrice` (midpoint) | **bid ≥ limit** |
| **C3** | VTS resting ENTRY buy fill — `vts-runner:3153` (shared by the xStock lane) | fill | `priceData.price` (midpoint) | **ask ≤ limit** (crypto rows) |
| **C4** | VTS placement marketable check — `vts-runner:2211`, fed `currentMarketPrice = priceData.price` (`:2136`) | trigger | midpoint | **ask** |
| **C5** | VTS stop/target decision — `vts-runner:3254` (real) and `:4059` (shadow) | trigger | `triggerPrice: currentPrice` (midpoint) | **bid** (crypto rows) |
| **C6** | VTS exit booking — `resolveVtsBookedExitPrice` (`vts-exit-booking.ts:22`), both lanes | booking | observed mark (midpoint) | **bid** (crypto rows) |
| **C7** *(r2, Langston B1)* | VTS TWIN placement check — `maybeOpenTwin` (`vts-runner:2405`) → `planTwin` → `isMarketableAtPlacement('buy', params.currentMarketPrice, params.limitPrice)` (`pending-maker-logic.ts:136`); shared with xStock (`eval-cycle.ts:1227`). Not marginal: F-G-2's pre-audit puts crypto twins at 439 of 564 maker-entry rows. | trigger | midpoint | **ask** (crypto rows) |

**Already transactable — NO CHANGE (tier 2):** paper crypto stop/target trigger (`8a-P2`, `triggerBid`); paper placement marketable check reads the book's best ask (`aee:4660`); paper taker close walks the live bid snapshot (`closePosition`, the `_closeFill` depth walk); **paper crypto TAKER entry fill walks the ask book** through the depth-walked OrderPlacer port.
**C8 — NAMED, NOT FIXED HERE (Langston B1, taker-entry line):** the VTS **taker** entry books the signal's level, `strategySignal.entryPrice` (`vts-runner:1693`), with spread modelled as friction — not an observed ask. It is the same lane-wide VTS entry-booking question on both classes, so **HOME: added to `8a-P4`** (§9.4 disposition 2). The title is narrowed accordingly: this batch does not claim "every crypto fill".
**xStock:** C1/C2/C3/C7 are shared with xStock and C5/C6 have xStock twins. **xStock keeps its current price BY STATEMENT** (an explicit class predicate, fenced — the `8a-P2` pattern), and moves in `8a-P4`.

### 1a. What already exists — and the two places r1's "no new plumbing" was false
- **VTS crypto sides:** the price cache carries `bid`/`ask` with their own capture stamp `sidesCapturedAtMs` (`price-cache.ts:63`), separate from the mark's `lastUpdatedAt` (`:51`). The VTS level lane already builds a D3 touch selection from the WS book + `priceCache.getCachedPrice(symbol)` (`vts-runner:1588`).
- **Paper crypto:** `_lsSel` (`aee:2309`) serves C2 as-is. C1 runs earlier (`aee:2206`, before `_bookX`).
- **Shared selector:** `selectTouchPrice` (`touch-price.ts:97`), reused unchanged.
- ⛔ **FALSE IN r1, CORRECTED:** (i) **C4/C7 cannot be an input change** — "not marketable" is the PERMISSIVE branch (`vts-runner:2220-2221` ⇒ `_vtsPendingMaker = true`) and a boolean cannot carry "unknown", so the no-ask arm is new code (P5). (ii) **C1 stamps the limit, not the price that drove the fill** (`aee:1582`), so its evidence needs a stamp change (P3).

---

## 2. PROVENANCE (1.b) — APPROVED r1, UNCHANGED

Corpora searched: `PHASE_19_PLAN` `3n.q`; `RUNNING_ISSUES` `#741` (`:3795`); `SYSTEM_IMPACT_MAP` `:112`, `:134`, `:731`; `SYSTEM_MANUAL` §18.0 (`:5601`) and the B7.2c/B8.6 subsections (`:577-597`); `git log` of `pending-maker-logic.ts` (4 commits). `bridge/canonical/`: **not consulted — every component here was introduced July-September 2026, after the governance change.**

**TIER 1 — behaviour changes:**

| component | introducing commit, VERBATIM | disposition |
|---|---|---|
| `pending-maker-logic.ts` (C1, C3, C4, C7) | `b48aef51f` *"maker-chosen promotion -> PENDING open trade holding a slot; fills ONLY on honest side-aware trade-through"*; file header: *"FILL: honest side-aware trade-through of the REAL price — a resting BUY fills iff price ≤ limit; a resting SELL iff price ≥ limit. Never optimistic."* | **(2)** — the intent (honest, never optimistic) STANDS; its input does not meet it. "The REAL price" was the mark, which is the feed midpoint. |
| paper exit rest (C2) | `06560c299` *"exit-rest lifecycle in the paper exit monitor — place at target-touch (D1: fill requires a LATER venue tick at/through the limit)"* | **(2)** — D1 is kept verbatim; only the input changes. |
| `vts-exit-booking.ts` (C6) | `d3e643032` *"VTS books realistic exits and honest maker fees"*; file header: *"Kyle 2026-09-02: the learning system learns off REALISTIC exits."* | **(2)** — a midpoint is not a price a seller receives. |
| VTS TEC call (C5) | `8a-P2` passed `triggerPrice: currentPrice` with an explicit out-of-scope comment | **(2)** — the scope boundary is what this batch closes. |

**TIER 2 — read or called:** `selectTouchPrice` (D3 ladder, reused) **(1)** · price-cache sides **(1)** · `evaluateTECExit` (`triggerPrice` input already exists) **(1)**.

---

## 3. PLAN — every item back-references its cell and, where a review changed it, the finding

| P | cells | change |
|---|---|---|
| **P1** *(B2)* | C1-C4, C7 | **Compile-force every site.** `evaluatePendingMaker`: rename `currentPrice` → `transactablePrice` (object arg; reaches C1/C2/C3). **`isMarketableAtPlacement` converted to an OBJECT arg** `{ side, transactablePrice, limit }` (reaches C4, paper `aee:4660`, xStock `eval-cycle.ts:956`). **`planTwin`'s `currentMarketPrice` field renamed `placementTransactablePrice`** (reaches C7 at `vts-runner:2405` and xStock `eval-cycle.ts:1227`). `tradedThrough` stays positional — its only callers are this module and one test. Comparators unchanged. |
| **P2** | C2 | Paper exit rest passes `_lsSel !== null && _lsSel.ok ? _lsSel.quote.bid : null` for crypto; xStock passes `currentPrice` explicitly. `null` ⇒ **no fill this tick** (the rest persists; its deadline still applies). D1 untouched. `exitProvenance.decisionPrice` (`aee:2516`) then carries the bid. |
| **P3** *(F1, B6, r3 CONDITION-1)* | C1 | **NOT a hoist.** A **dedicated** crypto touch selection inside the pending pre-pass, recorded under a NEW `LevelBasisStage` **`active_entry_fill`** with its own counters — the exit-trigger block, `recordTouchSelection({stage:'exit_trigger'})` (`:2354`) and `ladderAccepted`/`ladderViaBook` (`:2373-2374`) stay untouched. **Rungs (r4):** book rung = `krakenWebSocketAdapter.getBookForFill(symbol)`, an **in-memory** read of the WS mini-book (`kraken-websocket-adapter.ts:3560-3566`, `this.orderBooks.get`) — a new LOCAL read per pending crypto position per tick, **not a venue call**, so `book_top` is reachable wherever a WS book exists; ticker rung = `priceCache.getCachedPrice(symbol)` sides. Fill on the **ask**; `null` ⇒ no fill, hard-drop still fires. **CONDITION-1 (r4): the stamp names the rung** — crypto fills after the cutover stamp `entryPriceSource` = `${basis}:${producer}`, and `entryBookAgeMs` only on the book rung; the column comment states that `null` after the cutover means the ticker rung carried the fill, and before it means no book was consulted. **The fill branch stamps `entryDecisionPrice` = the ask that drove the fill** (today: the limit, `aee:1582`) **and `entryBookAgeMs` = the quote's age when basis is `book_top`, else `null`.** ⛔ The comment at `aee:1583-1585` (*"NULL BY CONSTRUCTION… a maker fill consults NO book"*) becomes false and is **rewritten in the same commit**, with the `entry_decision_price` column comment (`shared/schema.ts:1887`) — ⛔ **which names the CUTOVER (deploy sha + timestamp) and states that maker rows before it hold the limit**, so a later reader is not handed two quantities under one name. Readers censused at the ref: `aee:1582`, `aee:5014` (taker stamp, unchanged), `schema.ts:1887`, `scripts/codex-export/export-data.sql:28` (export only). xStock explicit. |
| **P4** *(F3, B6, r3 FINDING-2)* | C3, C5, C6 | One pure VTS crypto touch helper fed **directly from `priceCache.getCachedPrice(symbol)` and the WS book, exactly as `vts-runner:1588` does** — ⛔ **never from `priceDataMap`**, which returns `{ price, bid, ask }` and drops every stamp (`vts-runner:3104-3109`), so `buildLevelBasis` would refuse `age_unknown` (`level-basis.ts:222`) on every decision. Called once per crypto trade per resolve tick in BOTH lanes, recorded under NEW stages **`vts_exit_trigger`** and **`vts_entry_fill`**. C5 `triggerPrice` = **bid**, `null` ⇒ no decision this cycle (never a midpoint fallback). C6 `resolveVtsBookedExitPrice` gains the bid: crypto books the **bid**; **a live mark with no usable bid falls to the existing clamp arm AND increments a NEW counter `vtsBookedNoBidClamp`.** C3 fills on the **ask**; VTS stamps nothing on a pending fill, so **C3's evidence is the fill log line carrying the ask** (window stated at Step 7). |
| **P5** *(B5, F2, r3 FINDING-1)* | C4, C7 | A NEW variable **`placementAsk`** from the P4 helper, used **ONLY** at `vts-runner:2211` and `:2405`. **`currentMarketPrice` at `:2136` is NOT repointed** — it also feeds the B53 admission guard (`:2137-2143`), an estimate (job 1/2) where Kyle's rule keeps the midpoint. **ARMS — r3 MATCHES PAPER:** ask usable + marketable → the existing taker-fallback / `maker_marketable_dropped` (`:2212-2218`); ask usable + not marketable → pending maker (`:2220-2221`); **ask unusable → pending maker, the SAME permissive arm paper takes** (`aee:4660` guards `_b72cBestAsk != null &&` and falls through to the resting branch). r2's refusal would have put opposite policies on one seam in the lane whose job is to model paper. ⚠️ **The permissive arm is the optimistic direction and is NAMED, not fixed:** a `⛔ do not "fix" into a refusal on one lane only` comment at both sites, a NEW counter **`makerPlacedNoAsk`** on each lane, and the policy question for BOTH lanes **added to `8a-P4`**. The twin follows the same arm. |
| **P6** *(F6)* | C3-C7 | Bump `calibration_epoch` vts **crypto only** (`core/metrics/calibration-epoch.ts`). OBJ-5's fill rate is measured on the **post-epoch side only**. ⚠️ The bump also cuts the `6R` replay corpus: that replay's trades are all pre-epoch. |
| **P7** | all | Fences: divergent fixtures per cell (mid on one side of the limit, the transactable side on the other — each must FAIL on today's code); an xStock class tripwire per shared site; `b-price-side-8a-p1-exit-fence` test `8h` amended **deliberately and visibly** — the VTS **exit** lane leaves the shared constants for its own (J1); the VTS **level** lane keeps them. |

---

## 4. JUDGEMENT CALLS

### J1 *(B3; r3 BLOCKER-1, BLOCKER-2, CONDITION-2)* — VTS exit touch ceilings: OWN named constants
**`VTS_EXIT_TOUCH_MAX_AGE_MS = 90_000`** — NOT a consumer of the sentenced `LEVEL_BASIS_OBSERVATION_MAX_AGE_MS` (`level-basis.ts:682-685`).
- ⛔ **WHICH STAMP IT GATES — written into the docblock:** `selectTouchPrice` ages the ticker leg by `venueObservedAtMs ?? sidesCapturedAtMs` (`touch-price.ts:177`) — **the SIDES, not the mark.** r2 sized the ceiling off the mark-re-serve sawtooth, which dates `lastUpdatedAt` (`price-cache.ts:51`): the wrong field. **Withdrawn.**
- **THE SIDES' PRODUCERS, censused at the ref:** `refreshBucket` (`price-cache.ts:239`, stamp `:263`) for the `vtsSimulation` bucket, nominal **60,000 ms** (`:134`); `getBatch`'s own fetch for symbols whose MARK has gone stale (`:536`); `updateFromWebSocket` with sides (`live-pricing-adapter.ts:1171`) for WS-subscribed names. `updateFromRest` (`live-pricing-adapter.ts:897`) advances the mark and carries the sides forward. ⇒ The extra producers can only make sides **fresher**, and because `getBatch` judges freshness by the MARK, a REST mark write can hold a symbol "fresh" while its sides age — **so the sides' worst-case age is set by the `vtsSimulation` pass interval.** *(Langston named `refreshBucket` as the only producer; it is the binding one, not the only one.)*
- **MEASURED FIRST — the pass interval:** `[PriceCache][vtsSimulation] refreshed N symbols` in staging `out.log`, 2026-09-15 06:55:48 → 10:22:59 Z; a pass = the first line after a gap of more than 5 s. **207 intervals: min 60 s · p50 60 s · p99 61 s · max 61 s; 11 at 61 s; none above 61 s.** ⚠️ **Limits:** 1-second log granularity; ONE ~3.5 h weekday-morning window, so the busiest hours are not in it — **re-measured over a full day at Step 7.**
- **WHY 90,000.** 60,000 is the production period with zero headroom: every overrun refuses, and the refusals are correlated across a whole pass — a VTS-wide exit blackout exactly when the refresh loop is busiest. 90,000 = 1.5× nominal, **29 s above the measured maximum.** **PRE-REGISTERED, as a pair (r4, FINDING-1): refusal rate ≈ 0 AND bucket size 157-159 symbols per pass** (Langston's per-pass sums 157×112 / 158×18 / 159×85; `HEALTH vts=159` at 10:39 Z). The interval is a function of bucket size — `BATCH_SIZE` 100 per chunk, all four buckets serialised behind one flag — and VTS membership is unbounded, so Step 7 re-measures interval against size; the per-pass sum, not the interval alone, is the instrument that sees a partial pass. Every `vts_exit_trigger` age refusal is therefore a pass overrun beyond 90 s — counted and reported as a feed-impairment signal, not a trading event.
- ⛔ **WHAT IT COSTS, AND ON WHICH POPULATION — in the docblock.** From `t = 60·(f·stop/move60)²` (`aee:258`), `f = (move60/stop)·√(t/60)`. On the **held-name** cell (move60 p90 0.4534 %, 68 symbols; stop p10 0.926 %, n = 147): **f ≈ 0.60 at 90 s.** ⛔ **That cell is NOT this lane's population** — `aee:258-290` forbids the pool for exactly this reason, and VTS IS the pool. On that docblock's own "+41 % on the pool" the direction is **f ≥ 0.85**, and the stop term is also the wrong corpus for VTS's strategy mix. **Neither is a VTS-corpus derivation:** both are labelled as such, and **the VTS-corpus derivation is carried to `3n.o`.**
- **Why accept it in THIS batch:** the bid is the only price a seller receives, the age cost is now stated rather than hidden, and tightening the age changes which ticks VTS acts on — a separate behavioural decision homed at `3n.o`. *(r2's "widens nothing" is withdrawn: it was an argument about the tick set, and both blockers stand independently of it.)*

**`VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION = 0.02` — a stated choice, not an inheritance.** `2·D·(1+f)` at the pool-direction f ≥ 0.85 allows ≥ 3.42 %; 0.02 is tighter — conservative by choice, so VTS and paper refuse the same implausible books. NOT the shared 0.50 (a bid at 0.75 × mid, `aee:368-369`).

### J2 *(B4, accepted r2)* — entry-fill ceilings: age by derivation, NO spread ceiling
- **Age — r4: the r3 figure of 2,000 ms is WITHDRAWN; it was never measured.** C1's ticker rung reads cache sides for a symbol the engine holds, and `P-7g` (`aee:1633-1650`, `0314c00e4`, in the deployed tree) reconciles every held crypto row into the 2-second `openTrade` lane — pending rows included, since `getActiveOpenPositions` has no state filter (`storage.ts:3772-3776`).
- **MEASURED — the `openTrade` pass interval**, `[PriceCache][openTrade] refreshed` in staging `out` logs 2026-09-12 06:33 → 2026-09-15 04:37 Z (1-second log granularity), per file: **p50 2 s · p90 3 s · p99 3 s · p99.9 3-4 s · max 3-7 s; share of intervals above 2 s ≈ 10-12 %.** Two outliers named rather than dropped: one 22 s interval (the 09-14 08:20-14:56 file) and one 16,607 s gap (09-14 14:56-23:46) — the latter is the lane having **no members** (no crypto held), not an overrun. No crypto is held in today's window, so the lane is correctly empty now (`HEALTH open=0`; three xStock positions held).
- ⇒ **2,000 ms sat at the lane's nominal period with zero headroom** — the flaw J1 had at 60 s: about one interval in nine runs past it, and a refused fill rests until `maker_max_pending_ms` and can hard-drop. **C1 takes a named `ENTRY_FILL_TOUCH_MAX_AGE_MS = 8_000`:** above every normal-operation maximum measured (7 s) and 2× the p99.9. **PRE-REGISTERED: refusal rate ≈ 0 while the lane is healthy;** a refusal is an overrun beyond 8 s, counted. **Cost, stated:** f = (move60/stop)·√(t/60) ≈ **0.18 at 8 s** on the held-name cell, which IS this population.
- **VTS C3:** `VTS_EXIT_TOUCH_MAX_AGE_MS`, with J1's stated cost — VTS names are not in the `openTrade` lane, so J1's producer binds.
- **What the log cannot show, read at Step 7:** the rung mix on pending crypto positions (none in today's window — its one pending line is an xStock, `MRVL/USD`), from the new `active_entry_fill` funnel cell's `acceptedLeg` and `acceptedAgeMs`.
- **Spread: NONE on either entry leg.** A wider spread makes `ask ≤ limit` **harder**, so it cannot produce optimism on this leg; a spread ceiling would only refuse fills and hard-drop orders. **The side swap alone removes the optimism.** `maxSpreadFraction: Number.POSITIVE_INFINITY`, inert at the `>` comparison at `level-basis.ts:237`; the book-validity checks still apply.

### J3 — moved into P5. · J4 — accepted by Langston (r1 F5).

---

## 5. OBJECTIVES AND VERIFICATION

| OBJ | objective | verified by — ⛔ every criterion must FAIL on pre-deploy rows |
|---|---|---|
| **1** | Every crypto maker FILL (paper + VTS, entry + target exit) is decided on the transactable side. | **Unit:** divergent fixtures red on pre-change code, green after. **Staging, paper, population = crypto maker fills after the deploy timestamp, n stated:** C2 — `exit_decision_price` equals the bid and sits **strictly below** the mid recorded in the same provenance wherever the spread is non-zero; **pre-deploy rows equal the mid, so they fail.** C1 — `entry_decision_price` is the ask: **strictly above** the mid and ≤ the limit; **pre-deploy rows equal the limit, so they fail.** **VTS (C3):** the fill log line carries the ask ≤ limit; `out.log` over a stated window, n stated. |
| **2** | VTS crypto stops/targets are DECIDED on the bid. | **Unit:** divergent fixtures through the VTS call. **Staging:** VTS crypto exit rate per open position-hour over two equal windows either side of the epoch boundary, **plus** the `no_transactable_side` refusal count and the `vts_exit_trigger` funnel accepted/refused, **plus** the age-refusal count against J1's pre-registered ≈ 0. |
| **3** | VTS crypto exits are BOOKED at the bid. | **Staging:** post-epoch VTS crypto closes, spot-check n stated: booked exit price = the bid logged at decision, below that decision's mid. **Plus** `vtsBookedNoBidClamp` reported. |
| **4** | xStock is unchanged at every shared site, by statement. | Class tripwire tests; xStock VTS epoch NOT bumped. |
| **5** | The honest crypto maker fill rate is measured and handed to CC-B for `3n.v`/`3n.w`. | ⛔ **Beside the C1 and C3 age-refusal counts (r4)** — a refusal delays a fill and can turn it into a hard drop, so without them the rate measures the ceiling, not the market. **Post-epoch side only**, numerator/denominator/window stated. The prior rate (60-day crypto exit rests 171 fill / 13 convert) is shown as a **different ruler**, not a baseline. |
| **6** | The permissive no-ask placement arm is sized on both lanes. | *(Restated at Step 4 r3 — the r1 counter was replaced by a per-event line.)* Per lane, crypto only, over a stated window: **numerator** = `MAKER_RESTED` lines with `ask=none`; **denominator A (all rests)** = all `MAKER_RESTED` lines; **denominator B (all maker-chosen opens)** = `MAKER_RESTED` + `MARKETABLE_TAKER_FALLBACK` + `MAKER_MARKETABLE_DROPPED` lines — the fallback and dropped arms never log a rest, so A alone is not "share of maker-chosen opens". Twins: `TWIN_OPENED … ask=none`. Step 7. |
| **7** | UI: the Open/Closed Trades panels render the new crypto closes with sane exit prices. | Claude-in-Chrome, on those tabs. |

## 6. NOT IN THIS BATCH
xStock and **C8** (`8a-P4`: paper trigger on bid, VTS trigger + booking replacing the clamp, xStock resting fills, the hollow-book guard for VTS, the VTS taker entry booking, **the no-ask placement policy on both lanes**) · the per-symbol ceiling and the J1 VTS-corpus `f` derivation (`3n.o`) · decision-time bid/ask stamping on exit provenance (`P2-9`).

## 7. GOVERNANCE AT CLOSE
`SYSTEM_MANUAL` §18.0 + the B7.2c/B8.6 subsections · `SYSTEM_IMPACT_MAP` (pending-maker lifecycle `:112`, B8.6 `:134`, OBJ-5a booking `:731`, the level-basis funnel S27 for the three new stages) · `BATCH_CATALOG` · `PHASE_19_PLAN` `3n.q` progress + C8 and the no-ask policy into `8a-P4`, the VTS `f` derivation into `3n.o` · `RUNNING_ISSUES` `#741` · completion report (with `8a-P2`'s).

## 8. r2 CHANGE LOG — Langston r1 findings, each dispositioned
| finding | disposition |
|---|---|
| B1 — seventh cell; taker entry unstated | **Folded:** C7 added. Taker entry: paper ✅ ask walk; VTS = **C8, added to `8a-P4`**; title narrowed. |
| B2 — rename forces nothing on positional args | **Folded:** P1 converts `isMarketableAtPlacement` to an object arg and renames `planTwin`'s field. |
| B3 — J1 not derived; sentenced constant; sawtooth | **Folded in r2, reworked in r3** (§9). |
| B4 — entry harm has the opposite sign | **Folded:** age by derivation, no spread ceiling on either entry leg. |
| B5 — J3 needs a third arm | **Folded in r2; the arm's direction reversed in r3** (§9, FINDING-1). |
| B6 — OBJ-1 vacuous; lying comment | **Folded:** C1 stamps the ask; comment + column comment rewritten same commit; criteria rewritten to fail on pre-deploy rows; VTS half scoped to logs. |
| F1 — hoist merges populations | **Folded:** dedicated selection, stage `active_entry_fill`. |
| F2 — `:2136` also feeds B53 | **Folded:** `placementAsk` separate; the guard stays on the mid. |
| F3 — null-arm grows | **Folded:** `vtsBookedNoBidClamp`. |
| F4 — OBJ-2 non-zero is vacuous | **Folded:** two-window rate + refusal count. |
| F5 — J4 | Accepted, no change. |
| F6 — epoch side | **Folded:** OBJ-5 post-epoch only; 6R corpus cut stated. |

## 9. r3 CHANGE LOG — Langston r2 findings, each dispositioned
| finding | disposition |
|---|---|
| BLOCKER-1 — the ceiling gates the sides; the sawtooth dates the mark | **Folded:** J1 gates `sidesCapturedAtMs`; sides' producers censused (four; `refreshBucket(vtsSimulation)` binds); pass interval measured first (n = 207, max 61 s, one window, limits stated); ceiling 90,000 ms with 29 s headroom; refusal rate pre-registered ≈ 0. |
| BLOCKER-2 — `f` computed on the population its source forbids | **Folded:** held-name f ≈ 0.60 labelled as such; pool direction ≥ 0.85; VTS-corpus derivation carried to `3n.o`. r2's "widens nothing" withdrawn. |
| FINDING-1 — P5's refusal breaks parity with paper | **Folded:** VTS matches paper's permissive arm; named, fenced, counted on both lanes; the policy for both added to `8a-P4`. |
| FINDING-2 — the helper must not read `priceDataMap` | **Folded:** P4 reads `getCachedPrice` directly. |
| CONDITION-1 — the column comment names the cutover | **Folded:** P3. |
| CONDITION-2 — the docblock names the gated stamp | **Folded:** J1. |

## 10. r4 CHANGE LOG — Langston r3 findings, each dispositioned
| finding | disposition |
|---|---|
| BLOCKER-1 — J2's age unmeasured; C1's book rung unreachable | **Folded:** the book read is in-memory, not a venue call — C1 gains a local read and `book_top` is reachable; 2,000 ms withdrawn; the ticker-rung producer (the 2 s `openTrade` lane, which holds pending rows) measured over three days first; `ENTRY_FILL_TOUCH_MAX_AGE_MS` = 8,000 ms with refusal ≈ 0 pre-registered and f ≈ 0.18 stated; rung mix read at Step 7. |
| CONDITION-1 — `entry_book_age_ms = null` gains a second meaning | **Folded:** `entryPriceSource` carries `basis:producer`; the column comment states both null meanings and the cutover. |
| FINDING-1 — headroom is a function of bucket size | **Folded:** bucket size pre-registered with J1's ceiling; Step 7 re-measures interval against size via the per-pass sum. |
| OBJ-5 — age-refusal counts beside the fill rate | **Folded.** |
