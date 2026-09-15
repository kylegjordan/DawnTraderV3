# B-PRICE-SIDE-BY-JOB row `8a-P3` — CRYPTO FINISH: every crypto FILL and EXIT decided and booked on the transactable side

change-class: architecture

**Owner:** CC-C · **Plan home:** `PHASE_19_PLAN.md` row `3n.q` (`B-MAKER-FILL-TRANSACTABLE-SIDE`), crypto half — plus the VTS exit lane that `8a-P2` left out of scope by statement (`vts-runner.ts:3254` / `:4059` `triggerPrice: currentPrice`).
**Ref read:** `origin/migration/aws-supabase` @ `bef16dbee`. Every `path:line` below is at that ref.
**Rev:** r1 · **Lean run** (Kyle's weekly token budget): this ONE document carries Step 1 (scope) AND Step 2 (audit + plan, §3-§4). Langston is asked for both rulings on it; if he wants them split, they split.

---

## 0. THE DIRECTIVE

Kyle, 2026-09-15, on learning that `8a-P2` covered one cell: *"My understanding of what we just did in that last batch was to make sure that we were not using midpoint prices to exit, whether that was for the stop or for the target. And that that was for crypto X stock, VTS, paper mode, live mode. So if any of that is wrong, then we need to finish the batch."* Then, on the proposed split: *"I'm fine with your cheap way to finish."* ⇒ **crypto everywhere now (`8a-P3`); xStock after the Friday budget reset (`8a-P4`).**

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

**Already transactable — NO CHANGE (tier 2):** paper crypto stop/target trigger (`8a-P2`, `triggerBid`); paper placement marketable check reads the book's best ask (`aee:4660`); paper taker close walks the live bid snapshot (`closePosition`, the `_closeFill` depth walk).
**xStock:** C1/C2/C3 are shared with xStock and C5/C6 have xStock twins. **xStock keeps its current price BY STATEMENT** (an explicit class predicate, fenced — the `8a-P2` pattern), and moves in `8a-P4`.

### 1a. The sides already exist — no new plumbing
- **VTS crypto:** `priceDataMap.get` returns `{ price, bid, ask }` for crypto (`vts-runner:3104-3109`) from the price cache, which carries `bid`/`ask` and when they were observed (`price-cache.ts:44-59`). The VTS level lane already builds a D3 touch selection from the WS book + that cache entry (`vts-runner:1588`, row `8c` shadow).
- **Paper crypto:** `_lsSel` (`aee:2309`) is already computed per position per tick for the exit trigger — but **AFTER** the pending pre-pass (`aee:2206`) and after `_bookX` (`aee:2223`). ⇒ C2 can read it as-is; C1 needs the crypto touch read **hoisted above `:2206`**.
- **Shared selector:** `selectTouchPrice` (`core/calculations/touch-price.ts:97`) — book top, else ticker sides within age, else refuse. Reused unchanged.

---

## 2. PROVENANCE (1.b) — corpora searched: `PHASE_19_PLAN` `3n.q`; `RUNNING_ISSUES` `#741` (`:3795`); `SYSTEM_IMPACT_MAP` `:112`, `:134`, `:731`; `SYSTEM_MANUAL` §18.0 (`:5601`) and the B7.2c/B8.6 subsections (`:577-597`); `git log` of `pending-maker-logic.ts` (4 commits). `bridge/canonical/`: **not consulted — every component here was introduced July-September 2026, after the governance change.**

**TIER 1 — behaviour changes:**

| component | introducing commit, VERBATIM | disposition |
|---|---|---|
| `pending-maker-logic.ts` (C1, C3, C4) | `b48aef51f` *"maker-chosen promotion -> PENDING open trade holding a slot; fills ONLY on honest side-aware trade-through"*; file header: *"FILL: honest side-aware trade-through of the REAL price — a resting BUY fills iff price ≤ limit; a resting SELL iff price ≥ limit. Never optimistic."* | **(2)** — the intent (honest, never optimistic) STANDS; its input does not meet it. "The REAL price" was the mark, which is the feed midpoint. |
| paper exit rest (C2) | `06560c299` *"exit-rest lifecycle in the paper exit monitor — place at target-touch (D1: fill requires a LATER venue tick at/through the limit)"* | **(2)** — D1 is kept verbatim; only the input changes. |
| `vts-exit-booking.ts` (C6) | `d3e643032` *"VTS books realistic exits and honest maker fees"*; file header: *"Kyle 2026-09-02: the learning system learns off REALISTIC exits."* | **(2)** — a midpoint is not a price a seller receives. |
| VTS TEC call (C5) | `8a-P2` passed `triggerPrice: currentPrice` with an explicit out-of-scope comment | **(2)** — the scope boundary is what this batch closes. |

**TIER 2 — read or called:** `selectTouchPrice` (D3 ladder, reused) **(1)** · price-cache sides **(1)** · `evaluateTECExit` (`triggerPrice` input already exists) **(1)**.

---

## 3. PLAN — every item back-references its cell

| P | cells | change |
|---|---|---|
| **P1** | C1-C4 | In `pending-maker-logic.ts`, rename the price input `currentPrice` → `transactablePrice` on `evaluatePendingMaker` (object arg ⇒ **compile-forces every caller to be re-read**) and on `tradedThrough` / `isMarketableAtPlacement`. The comparators are unchanged; what a caller passes is the change. Header updated to name the side per leg. |
| **P2** | C2 | Paper exit rest passes `_lsSel !== null && _lsSel.ok ? _lsSel.quote.bid : null` for crypto; xStock passes `currentPrice` explicitly. `null` ⇒ **no fill this tick** (the rest persists; its deadline still applies). D1 untouched. |
| **P3** | C1 | Hoist the crypto touch read above the pending pre-pass (`aee:2206`) so one selection per position per tick serves the pre-pass AND `_lsSel`. Crypto pending entry passes the **ask**; `null` ⇒ no fill, hard-drop still fires. xStock explicit. |
| **P4** | C3, C5, C6 | One pure VTS crypto touch helper (book + cache entry, exactly as `vts-runner:1588` builds it), called once per crypto trade per resolve tick in BOTH lanes. C3 fill on **ask**; C5 `triggerPrice` = **bid**, `null` ⇒ no decision this cycle (the `8a-P2` rule, never a midpoint fallback); C6 `resolveVtsBookedExitPrice` gains the bid: crypto books the **bid**, `null` bid ⇒ its existing null-arm. |
| **P5** | C4 | VTS placement passes the cache **ask** (age/spread-checked by the same helper). |
| **P6** | C3-C6 | Bump `calibration_epoch` vts **crypto only** (`core/metrics/calibration-epoch.ts`). VTS crypto rows before and after mean different things and must never be pooled. |
| **P7** | all | Fences: divergent fixtures per cell (mid on one side of the limit, the transactable side on the other — each must FAIL on today's code); an xStock class tripwire per shared site; `b-price-side-8a-p1-exit-fence` test `8h` amended **deliberately and visibly** (see J1). |

---

## 4. JUDGEMENT CALLS — PLEASE ATTACK THESE

**J1 — VTS exit ceilings. PROPOSED: age 60,000 ms, spread 0.02.** The paper exit ceilings (2,000 ms / 0.02) are derived for HELD names on the WS book. VTS crypto trades are mostly REST-priced on a ~60 s cadence (`#977` am. 3+4), so 2,000 ms would refuse nearly every VTS decision and VTS would effectively stop exiting. **Age:** 60,000 ms = the shared observation constant (`level-basis.ts:687`), i.e. no looser than the mark VTS already acts on. **Spread:** 0.02, NOT the shared 0.50 — the harm here is the same as paper's (booking a bid nobody could fill), and 0.50 admits a bid at 0.75 × mid. ⚠️ This moves `8h`'s premise ("VTS keeps the shared constants") for the VTS **exit** lane only; the VTS **level** lane keeps them.

**J2 — Paper pending-entry ceilings. PROPOSED: the paper exit-lane ceilings (2,000 ms / 0.02).** Same engine loop, same tick cadence, and the name is being held.

**J3 — VTS placement with no usable ask. PROPOSED: do not open as maker this cycle.** Without the ask we cannot tell whether a post-only would be accepted. Treating an unknown as "not marketable" is the optimistic direction. Cost: a small drop in VTS crypto maker opens, measured at Step 7.

**J4 — Is this `3n.q` or `8a`?** Both, deliberately. `3n.q`'s placement ("AFTER `8a-P2`, BEFORE `3n.o`") is satisfied — `8a-P2` is deployed. Langston's reason for NOT folding `3n.q` into `8a-P2` (the comparator is shared with entries) is honoured by scoping the entry legs here explicitly (C1, C3, C4).

---

## 5. OBJECTIVES AND VERIFICATION

| OBJ | objective | verified by |
|---|---|---|
| **1** | Every crypto maker FILL (paper + VTS, entry + target exit) is decided on the transactable side. | Unit: divergent fixtures red on the pre-change code, green after. Staging, over a stated window: every crypto maker fill since deploy has its recorded decision price on the correct side of its limit (**n stated; population = crypto maker fills after the deploy timestamp**). |
| **2** | VTS crypto stops/targets are DECIDED on the bid. | Unit: D-style divergent fixtures through the VTS call. Staging: VTS crypto `stop_hit`/`target_hit` counts non-zero after deploy (reach), with a refusal count beside them. |
| **3** | VTS crypto exits are BOOKED at the bid. | Staging: VTS crypto closes after the new epoch have exit price = the bid observed at decision (spot-check n stated), never the midpoint. |
| **4** | xStock is unchanged at every shared site, by statement. | Class tripwire tests; xStock VTS epoch NOT bumped. |
| **5** | The honest crypto maker fill rate is measured and handed to CC-B for the `6R` replay (`3n.v`/`3n.w`). | Rate with numerator, denominator and window, beside the prior rate (60-day crypto exit rests 171 fill / 13 convert — `B_GEOMETRY_REACH_BASELINE_WORKING_RECORD.md`). |
| **6** | UI: the Open/Closed Trades panels render the new crypto closes with sane exit prices. | Claude-in-Chrome, on those tabs. |

## 6. NOT IN THIS BATCH
xStock (`8a-P4`: paper trigger on bid, VTS trigger + booking replacing the clamp, xStock resting fills, the hollow-book guard for VTS) · the per-symbol ceiling (`3n.o`) · decision-time bid/ask stamping on exit provenance (`P2-9`).

## 7. GOVERNANCE AT CLOSE
`SYSTEM_MANUAL` §18.0 + the B7.2c/B8.6 subsections · `SYSTEM_IMPACT_MAP` (pending-maker lifecycle `:112`, B8.6 `:134`, OBJ-5a booking `:731`) · `BATCH_CATALOG` · `PHASE_19_PLAN` `3n.q` progress · `RUNNING_ISSUES` `#741` · completion report (with `8a-P2`'s).
