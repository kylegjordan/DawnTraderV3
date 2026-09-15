# B-PRICE-SIDE-BY-JOB row `8a-P3` — CRYPTO FINISH: every crypto MAKER FILL, PLACEMENT CHECK and EXIT decided and booked on the transactable side

change-class: architecture

**Owner:** CC-C · **Plan home:** `PHASE_19_PLAN.md` row `3n.q` (`B-MAKER-FILL-TRANSACTABLE-SIDE`), crypto half — plus the VTS exit lane that `8a-P2` left out of scope by statement (`vts-runner.ts:3254` / `:4059` `triggerPrice: currentPrice`).
**Ref read:** `origin/migration/aws-supabase` @ `e22022509` (r1 cited `bef16dbee`; Langston confirmed every §1 `path:line` holds at `e22022509`).
**Rev:** r2 · **Lean run** (Kyle's weekly token budget): ONE document carries Step 1 (scope) AND Step 2 (audit + plan).
**Langston r1 ruling:** Step 1 **PROCEED WITH CONDITIONS**; Step 2 **CHANGES-NEEDED**. §2 provenance and the tier split **APPROVED and settled — unchanged in r2.** r2 changes §1 (C7, C8), §3, §4, §5. Change log at §8.

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
- **VTS crypto sides:** `priceDataMap.get` returns `{ price, bid, ask }` for crypto (`vts-runner:3104-3109`) from `priceCache.getBatch` (`:3060-3062`), the one cache `Map` (`price-cache.ts:101`, `#977`), which carries `bid`/`ask` and when they were observed (`price-cache.ts:44-59`). The VTS level lane already builds a D3 touch selection from the WS book + that cache entry (`vts-runner:1588`).
- **Paper crypto:** `_lsSel` (`aee:2309`) serves C2 as-is. C1 runs earlier (`aee:2206`, before `_bookX` at `:2223`).
- **Shared selector:** `selectTouchPrice` (`touch-price.ts:97`), reused unchanged.
- ⛔ **FALSE IN r1, CORRECTED:** (i) **C4/C7 cannot be an input change** — "not marketable" is the PERMISSIVE branch (`vts-runner:2220-2221` ⇒ `_vtsPendingMaker = true`) and a boolean cannot carry "unknown", so a third arm is new code (P5). (ii) **C1 stamps the limit, not the price that drove the fill** (`aee:1582`), so its evidence needs a stamp change (P3).

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

## 3. PLAN (r2) — every item back-references its cell and, where r2 changed it, the finding

| P | cells | change |
|---|---|---|
| **P1** *(B2)* | C1-C4, C7 | **Compile-force every site, not just the object-arg one.** `evaluatePendingMaker`: rename `currentPrice` → `transactablePrice` (object arg; reaches C1/C2/C3). **`isMarketableAtPlacement` converted to an OBJECT arg** `{ side, transactablePrice, limit }` (reaches C4, paper `aee:4660`, xStock `eval-cycle.ts:956`). **`planTwin`'s `currentMarketPrice` field renamed `placementTransactablePrice`** (reaches C7 at `vts-runner:2405` and xStock `eval-cycle.ts:1227`). `tradedThrough` stays positional — its only callers are this module and one test. Comparators unchanged. |
| **P2** | C2 | Paper exit rest passes `_lsSel !== null && _lsSel.ok ? _lsSel.quote.bid : null` for crypto; xStock passes `currentPrice` explicitly. `null` ⇒ **no fill this tick** (the rest persists; its deadline still applies). D1 untouched. `exitProvenance.decisionPrice` (`aee:2516`) then carries the bid. |
| **P3** *(F1, B6)* | C1 | **NOT a hoist.** A **dedicated** crypto touch selection inside the pending pre-pass, recorded under a NEW `LevelBasisStage` **`active_entry_fill`** with its own counters — the exit-trigger block, `recordTouchSelection({stage:'exit_trigger'})` (`:2354`) and `ladderAccepted`/`ladderViaBook` (`:2373-2374`) stay untouched, so entry selections never enter exit telemetry. Fill on the **ask**; `null` ⇒ no fill, hard-drop still fires. **The fill branch stamps `entryDecisionPrice` = the ask that drove the fill** (today: the limit, `aee:1582`) **and `entryBookAgeMs` = the quote's age when basis is `book_top`, else `null`.** ⛔ The comment at `aee:1583-1585` (*"NULL BY CONSTRUCTION… a maker fill consults NO book"*) becomes false and is **rewritten in the same commit**, with the `entry_decision_price` column comment (`shared/schema.ts:1887`). Census of that column's readers at the ref: `aee:1582` (this site), `aee:5014` (taker stamp, `signal.entryPrice` — unchanged), `schema.ts:1887`, `scripts/codex-export/export-data.sql:28` (export only). xStock explicit. |
| **P4** *(F3, B6)* | C3, C5, C6 | One pure VTS crypto touch helper (book + cache entry, as `vts-runner:1588` builds it), called once per crypto trade per resolve tick in BOTH lanes, recorded under NEW stages **`vts_exit_trigger`** and **`vts_entry_fill`**. C5 `triggerPrice` = **bid**, `null` ⇒ no decision this cycle (never a midpoint fallback). C6 `resolveVtsBookedExitPrice` gains the bid: crypto books the **bid**; **a live mark with no usable bid falls to the existing clamp arm AND increments a NEW counter `vtsBookedNoBidClamp`**, so the arm's growth beyond today's "no live mark" set is visible. C3 fills on the **ask**; VTS stamps nothing on a pending fill, so **C3's evidence is the fill log line carrying the ask** (window stated at Step 7). |
| **P5** *(B5, F2)* | C4, C7 | A NEW variable **`placementAsk`** from the P4 helper, used **ONLY** at `vts-runner:2211` and `:2405`. **`currentMarketPrice` at `:2136` is NOT repointed** — it also feeds the B53 admission guard (`:2137-2143`), an estimate (job 1/2) where Kyle's rule keeps the midpoint. **THREE ARMS:** ask usable + marketable → the existing taker-fallback / `maker_marketable_dropped` (`:2212-2218`); ask usable + not marketable → pending maker (`:2220-2221`); **ask unusable → NEW non-trade `maker_ask_unavailable`** (`setNullReason` takes any string, `null-reason-tracker.ts:9`), with its own counter. The twin gets a matching skip reason `ask_unavailable`. ⚠️ **Disclosed bias:** refusing maker opens when the ask is unusable skews the VTS corpus toward good-book moments (the `#596` representativeness class); the counter makes its size readable and Step 7 reports it as a share of maker-chosen VTS crypto opens. |
| **P6** *(F6)* | C3-C7 | Bump `calibration_epoch` vts **crypto only** (`core/metrics/calibration-epoch.ts`). OBJ-5's fill rate is measured on the **post-epoch side only**. ⚠️ The bump also cuts the `6R` replay corpus: that replay's trades are all pre-epoch. |
| **P7** | all | Fences: divergent fixtures per cell (mid on one side of the limit, the transactable side on the other — each must FAIL on today's code); an xStock class tripwire per shared site; `b-price-side-8a-p1-exit-fence` test `8h` amended **deliberately and visibly** — the VTS **exit** lane leaves the shared constants for its own (J1); the VTS **level** lane keeps them. |

---

## 4. JUDGEMENT CALLS (r2)

### J1 *(B3)* — VTS exit touch ceilings: OWN named constants, sized off the sawtooth
**`VTS_EXIT_TOUCH_MAX_AGE_MS = 60_000`.** NOT a consumer of `LEVEL_BASIS_OBSERVATION_MAX_AGE_MS`, which is sentenced (`level-basis.ts:682-685`).
- **The cadence it is sized to.** VTS crypto reads the same single cache `Map` that `B-PRICE-AGE-TRUTH` measured (`price-cache.ts:101`; `#977`). That measurement: REST-only symbols are served on a **deterministic 4-rung sawtooth, 14.3 / 29.3 / 44.3 / 59.3 s** — *n = 811 re-serves on five REST-only symbols, min 13.3 s, median 29.3 s, max 59.3 s; the one WS-fed symbol, n = 164, sits under 1 s* (`B_PRICE_AGE_TRUTH_COMPLETION_REPORT.md:102-107`). ⚠️ That population was read on the **active** lane's serves of that cache. **The rung frequency as seen by VTS's own resolve cadence is UNMEASURED**; it is measured at Step 7 from the `vts_exit_trigger` funnel cell's `acceptedAgeMs`.
- **Why 60,000 and not less.** It admits all four rungs. A tighter bound refuses whole rungs — 30 s refuses rungs 3-4, 15 s refuses rungs 2-4 — so VTS would skip most decisions on REST-priced names, and a skip is a dropped observation.
- ⛔ **WHAT IT COSTS, STATED IN THE CONSTANT'S DOCBLOCK.** Solving `t = 60·(f·stop/move60)²` (`aee:258`) at t = 60 s on the shipped cell (stop 0.926 %, move60 p90 0.4534 %): **f = 0.4534 / 0.926 ≈ 0.49** — a decision error up to about **half the tight stop distance**, against the paper lane's f = 0.10.
- **Why that is acceptable in THIS batch.** It widens nothing: VTS already acts on these same rungs today, through its mark. This batch changes **which side** VTS reads, not **which ticks** it acts on. Tightening the age is a behavioural change to VTS's tick set and belongs with the per-symbol ceiling — **HOME: `3n.o`**, carrying the f ≈ 0.49 residual.

**`VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION = 0.02` — a stated choice, not an inheritance.** At the f actually shipped, `2·D·(1+f)` = 2·0.926 %·1.49 ≈ **2.76 %**. 0.02 is tighter than that derivation allows — conservative by choice, so VTS and paper refuse the same implausible books. NOT the shared 0.50, which admits a bid at 0.75 × mid (`aee:368-369`).

### J2 *(B4)* — entry-fill ceilings: age by derivation, NO spread ceiling
- **Age.** Paper C1: **2,000 ms**. The entry error term is the ask drifting above the limit after a stale quote — the same excursion-over-`t` statistic, in the same R units, on the same held-name cell as the exit derivation. So the age carries over by derivation, not by "same loop". VTS C3: `VTS_EXIT_TOUCH_MAX_AGE_MS`, with the same J1 residual.
- **Spread: NONE on either entry leg.** A wider spread makes `ask ≤ limit` **harder**, so it cannot produce optimism on this leg; a spread ceiling would only refuse fills and hard-drop orders at `maker_max_pending_ms`. **The side swap alone removes the optimism.** Mechanism: `maxSpreadFraction: Number.POSITIVE_INFINITY`, which the `>` comparison at `level-basis.ts:237` never trips — the book-validity checks (`mid > 0`, `ask ≥ bid`) still apply.

### J3 *(B5)* — moved into P5's three-arm mechanism.
### J4 — accepted by Langston (r1 F5).

---

## 5. OBJECTIVES AND VERIFICATION (r2)

| OBJ | objective | verified by — ⛔ every criterion must FAIL on pre-deploy rows |
|---|---|---|
| **1** | Every crypto maker FILL (paper + VTS, entry + target exit) is decided on the transactable side. | **Unit:** divergent fixtures red on pre-change code, green after. **Staging, paper, population = crypto maker fills after the deploy timestamp, n stated:** C2 — `exit_decision_price` equals the bid and sits **strictly below** the mid recorded in the same provenance wherever the spread is non-zero; **pre-deploy rows equal the mid, so they fail.** C1 — `entry_decision_price` is the ask: **strictly above** the mid and ≤ the limit; **pre-deploy rows equal the limit, so they fail.** **VTS (C3):** the fill log line carries the ask ≤ limit; `out.log` over a stated window, n stated. |
| **2** | VTS crypto stops/targets are DECIDED on the bid. | **Unit:** divergent fixtures through the VTS call. **Staging:** VTS crypto exit rate per open position-hour over two equal windows either side of the epoch boundary, **plus** the `no_transactable_side` refusal count and the `vts_exit_trigger` funnel accepted/refused. The difference is reported with both windows, not a bare "non-zero". |
| **3** | VTS crypto exits are BOOKED at the bid. | **Staging:** post-epoch VTS crypto closes, spot-check n stated: booked exit price = the bid logged at decision, below that decision's mid. **Plus** `vtsBookedNoBidClamp` reported. |
| **4** | xStock is unchanged at every shared site, by statement. | Class tripwire tests; xStock VTS epoch NOT bumped. |
| **5** | The honest crypto maker fill rate is measured and handed to CC-B for `3n.v`/`3n.w`. | **Post-epoch side only**, numerator/denominator/window stated. The prior rate (60-day crypto exit rests 171 fill / 13 convert) is shown as a **different ruler**, not a baseline. |
| **6** | `maker_ask_unavailable` is visible. | Count and share of maker-chosen VTS crypto opens, Step 7. |
| **7** | UI: the Open/Closed Trades panels render the new crypto closes with sane exit prices. | Claude-in-Chrome, on those tabs. |

## 6. NOT IN THIS BATCH
xStock and **C8** (`8a-P4`: paper trigger on bid, VTS trigger + booking replacing the clamp, xStock resting fills, the hollow-book guard for VTS, the VTS taker entry booking) · the per-symbol ceiling and the J1 f ≈ 0.49 residual (`3n.o`) · decision-time bid/ask stamping on exit provenance (`P2-9`).

## 7. GOVERNANCE AT CLOSE
`SYSTEM_MANUAL` §18.0 + the B7.2c/B8.6 subsections · `SYSTEM_IMPACT_MAP` (pending-maker lifecycle `:112`, B8.6 `:134`, OBJ-5a booking `:731`, the level-basis funnel S27 for the three new stages) · `BATCH_CATALOG` · `PHASE_19_PLAN` `3n.q` progress + C8 into `8a-P4` · `RUNNING_ISSUES` `#741` · completion report (with `8a-P2`'s).

## 8. r2 CHANGE LOG — Langston r1 findings, each dispositioned
| finding | disposition |
|---|---|
| B1 — seventh cell; taker entry unstated | **Folded:** C7 added. Taker entry: paper ✅ ask walk; VTS = **C8, added to `8a-P4`**; title narrowed. |
| B2 — rename forces nothing on positional args | **Folded:** P1 converts `isMarketableAtPlacement` to an object arg and renames `planTwin`'s field. |
| B3 — J1 not derived; sentenced constant; sawtooth | **Folded:** own constants; sized off the 4-rung sawtooth; f ≈ 0.49 stated with its home at `3n.o`; spread 0.02 re-derived as a stated choice; VTS-cadence rung frequency named unmeasured, measured at Step 7. |
| B4 — entry harm has the opposite sign | **Folded:** age by derivation, no spread ceiling on either entry leg. |
| B5 — J3 needs a third arm | **Folded:** P5 three arms, `maker_ask_unavailable` + counter, bias disclosed. |
| B6 — OBJ-1 vacuous; lying comment | **Folded:** C1 stamps the ask; comment + column comment rewritten same commit; criteria rewritten to fail on pre-deploy rows; VTS half scoped to logs. |
| F1 — hoist merges populations | **Folded:** dedicated selection, stage `active_entry_fill`. |
| F2 — `:2136` also feeds B53 | **Folded:** `placementAsk` separate; the guard stays on the mid. |
| F3 — null-arm grows | **Folded:** `vtsBookedNoBidClamp`. |
| F4 — OBJ-2 non-zero is vacuous | **Folded:** two-window rate + refusal count. |
| F5 — J4 | Accepted, no change. |
| F6 — epoch side | **Folded:** OBJ-5 post-epoch only; 6R corpus cut stated. |
