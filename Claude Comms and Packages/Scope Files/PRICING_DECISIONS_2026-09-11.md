# Pricing Decisions — consensus record (r2)

**Kyle, 2026-09-11:** these decisions are not his. CC-C, Langston and Coltrane iterate to consensus on the open pricing decisions, do only what is needed to settle them, then implement. No new batches or sub-batches. Move quickly.

**The test for every decision (Kyle, 2026-09-03):** fidelity to live trading, not better-looking results.

**Status of r2:**
- **Round 1 is in from both reviewers:** Coltrane at 14:37Z and Langston at 14:40Z, both reading r1 at `be206ffa2`. Every change from either reviewer is accepted by CC-C and written into the text below.
- **Round 2 asks each reviewer one thing:** accept the integrated text, or name only the items still in dispute.
- **Status tags:** items marked **DECIDED** had matching or compatible answers from both. Items marked **CONFIRM** carry a change from one reviewer that the other has not yet seen.

---

## Measured fact — Kraken's best-bid/offer ticker trigger (`#1017`)

The probe was `scripts/analysis/bbo_trigger_ack_probe.mjs`, run 2026-09-11 at 14:28Z against public endpoints.
- **Crypto v2:** `event_trigger: bbo` was **accepted**. The control with no trigger echoed `trades`, confirming the default.
- **xStock endpoint:** the field was **rejected** — *"Unsupported field: 'event_trigger' for params type: 'ticker'"*. The default xStock ticker was live, and its snapshot carried no timestamp field.
- ⚠️ **Limits:** this proves **acceptance, not rate** (Langston). The update counts came from different symbols, so they are not a rate comparison. The rate check sits in D3.

---

## D1. Exit side for long positions — **DECIDED**

- Engine-managed long exits are our own triggers, in paper and in live — not Kraken native stop orders.
- **A stop triggers when the valid bid ≤ stop. A taker target triggers when the valid bid ≥ target.**
- A market sell walks valid bid depth for our quantity. Where depth is missing, completion is modelled under D8.
- Maker exits follow D2.

*Why:* the level-basis rule ruled on 2026-09-04 requires a price we could transact at. AU3 Stage B finds a taker liquidation most faithful on the current bid and depth. Since 22 August, 24 of 24 stop-outs filled below their stop (median 0.166%).

## D2. Maker and taker fill evidence — **CONFIRM** (Langston)

- **Taker entries** walk valid asks.
- **Resting maker orders:** once a maker order is resting, a simulated full fill at the limit, under the retained baseline, needs one of these:
  - a valid opposite quote reaching the limit — the ask at or below a buy limit, or the bid at or above a sell limit;
  - a later trade **strictly through** the limit.
- **A midpoint touch does not qualify.**
- **Marketable-at-placement handling** is preserved.
- **Scope:** this supports a simulation assumption, not proof of queue execution. Live fills come from execution reports.

## D3. Ticker or order book — chosen by job — **CONFIRM** (both, on each other's riders)

- **Touch price** (for triggers, spread checks and marks):
  - Use the order book's top where the book is valid (checksum passed, in sync) and fresh.
  - Otherwise use the ticker sides, but only if they are valid for that instrument and within D6's age policy.
  - **If neither qualifies, refuse the price-dependent action.** For an exit, that means a hold, per D6.
- **Price basis is a field.** Every level, trigger and mark records its basis beside the price — `book_top`, `ticker_bbo` or `ticker_default` — and those populations are never pooled.
- **Crypto** moves its ticker to the best-bid/offer trigger. **xStock** keeps the default ticker.
- **xStock 20-level book** for held and queued xStocks (`#949`). ⛔ **Precondition in the landing:** today `unsubscribeFromSymbols` sends `channel: 'ticker'` only. Cleared book streams therefore stay live at Kraken, and re-subscribes stack on top of them. Fix the book unsubscribe, or prove the subscribed set is bounded.
- **Fill estimate for our size** walks the book's depth. Missing depth is unsupported quantity under D8. The ticker's size at the touch never stands in for depth beyond that size.
- **The book-versus-ticker disagreement alert is armed in the landing, not after it.** It compares aligned observations from healthy feeds, with a threshold that tolerates ordinary asynchronous delivery.
- **Step-8 condition for the best-bid/offer switch:** message rate and event-loop lag measured before and after, at the live subscription count, with a named revert.

## D4. Where the midpoint stays, and how levels are built — **CONFIRM** (Langston)

- The midpoint is used only for valuation and features: indicators, regime inputs, ranking features and spread denominators. It is never a level, a trigger, a fill or a booked result.
- **Crypto quant levels take execution intent explicitly, per leg:**
  - a taker entry anchors on the **ask**;
  - a resting maker entry anchors on the **bid**, where the order rests;
  - a long stop and target anchor on the **bid**.

  Each level carries its age, stated at the site. Structural geometry is preserved, and spread is accounted for exactly once.
- The bar lanes keep their accepted printed-price bases (venue closes), carrying their age.

## D5. Booking results — **DECIDED**

- **Active paper** books the simulated fill, unchanged.
- **VTS crypto exits** move to the D1 rule in the same landing.
  - This is the **second VTS epoch boundary since 2026-09-02**, keyed through `calibration-epoch.ts`.
  - The pre-switch era is labelled mid-triggered, so future consumers can discount it.
- **VTS xStock clamps stay** until `#943`'s window on the corrected build passes (D10). Until then they are a stated model limitation.

## D6. How fresh a price must be, and which clock — **DECIDED**

- **Exits:** the risk-derived ceiling stays (Kyle, 2026-09-03). A stale price holds the exit; the position, its exposure and its pending intent are kept.
- **Entries:** the flat 15 s limit stays.
- **Clock basis is a field.**
  - Venue-clock age applies where the message carries a timestamp (the crypto ticker).
  - Receipt-clock age applies otherwise — which today is every xStock price.
  - The two are never pooled, and receipt age is never a claim of known source freshness.
- **A re-served cached price keeps its original age.**
- ⚠️ **Knife-edge, checked inside the batch with one query:** `active_fill_max_age_ms` is live at 15000, and the re-serve sawtooth's densest rung is at 14.3 s.
  - If entry fill-age reads the re-served cache, a small shift in refresh timing would flip admissions wholesale.
  - So a change in the refusal rate after landing is not read as a market effect.

## D7. Price caches and refresh timing — **CONFIRM** (Langston)

- **Keep both caches.**
- **Enrol open positions in the 2-second refresh lane** (`#977`).
- **Queued and held symbols carry their own subscription reasons.**
- **Put the rate limiter on the direct REST call path.**
- **A cache re-serve, or a failed refresh, never renews observation age or advances smoothing.** Every action rechecks the retained observation against D6. Reusing a still-valid observation is legitimate. *(This replaces r1's "stop re-served prices from triggering actions".)*
- **Store the true last trade separately** (`#952`).
- **The smoothed estimator** advances once per new observation. Its state survives a restart, or explicitly re-warms (SIM S26).

## D8. Simulated exits — **DECIDED**

- Full completion is kept, as ratified in P19-B4b.1.
- Walked versus extrapolated quantity is recorded on every close path.
- A missing config is recorded as an invalid estimate, not as zero slippage.
- Live accounting never assumes completion.
- Revisit at Phase 21.

## D9. Pairs not quoted in US dollars — **DECIDED**

- Refuse new admission, with a specific reason, for any pair not quoted in USD, until a timestamped currency conversion exists (`#966`).
- **Open positions keep their exits.** Their triggers are denominated in the quote currency and need no conversion. **Their USD P&L is marked unavailable, not estimated,** until the conversion exists.

## D10. The three observation windows — **DECIDED** (Langston's ruling) · **CONFIRM** (Coltrane)

- **F-G-2** is retired as a deploy gate, and keeps its VOID status.
  - Its before-record is the **24 of 24 post-fix stop-outs filled below the stop (median 0.166%)**. The OBJ-0 shadow run banked nothing.
  - The question of how much of the record to distrust converts into D5's epoch label.
- **`#951`** is **not** closed at landing.
  - Alert `0db25f1d` fires on 2026-09-16 carrying the binding stopping rule: an empty arm at that fire *is* the result.
  - Then either close it as a retirement, with the reason stated, or re-point the assertion onto the producer that is actually exercised.
  - D7's limiter makes that arm less likely to be exercised, which weakens any reading of a zero as a pass.
- **`#943`** is **not** closed at landing.
  - `B-XSTOCK-FEED-SANITY`'s own fixes deploy with the landing, and its two-handoff window runs on the corrected build. That is a set quantity, and it does not gate the landing.
  - If the window is inconclusive, apply one bounded stopping rule.
- **Closing a window never closes its defect.**
- **Langston runs the closing reads on all three**, not CC-C, which owns the batches those windows judge.

---

## Other items

| item | decision | status |
|---|---|---|
| **$0.25 minimum price** (`#967`) | Keep it (Kyle, 2026-09-11). The `strong_trend` exception (`min_price 0.001`) stays. Revisit only if data argues for it | DECIDED |
| **DHMA** | Stays shelved, outside this landing | DECIDED |
| **Ranking objective** (after reachability) | Incremental expected net portfolio wealth versus cash, under fixed notional, existing caps and a common evaluation horizon — including pending reservations, non-fills and unresolved holdings. Starts as a prospective shadow. No dividing by a guessed holding time | CONFIRM (Langston) |

---

## Implementation — **CONFIRM** (Coltrane: commit boundary · Langston: running the window reads)

- **One pricing batch** at 3n `B-PRICE-SIDE-BY-JOB`, in one workflow. CC-C implements and Langston reviews.
- **A named commit boundary inside the batch:**
  1. **Feed and plumbing first:** D3's subscriptions and the unsubscribe fix, plus D7's enrolment, limiter, true last trade and smoothing. This part lands and is proven live first.
  2. **Decision layer second:** D1, D2, D4 and D5 switch on.

  Step 2 decides whether that is one deploy or two.
- **Coltrane** takes part in bounded decision rounds only, not in every step.
- **Then:**
  1. **xStock fees** — CC-B's `B-XSTOCK-FEE-CONTRACT` (2.4-FEE). Startup validation accepts verified, applicable signed fees, rebates included, and rejects invalid contracts.
  2. **Reachability** — row 4 `F-5`, reachability ceilings per strategy.

---

## Consensus record

| item | Langston r1 | Coltrane r1 | r2 |
|---|---|---|---|
| D1 | CHANGE (target direction) | CHANGE (same, plus depth → D8) | **DECIDED** |
| D2 | AGREE | CHANGE (after resting; strictly through) | CONFIRM — Langston |
| D3 | CHANGE (basis field; alert in landing; unsubscribe precondition; rate check) | CHANGE (age-qualified fallback; refuse if none; depth → D8) | CONFIRM — both |
| D4 | CHANGE (per leg: sells on bid) | CHANGE (per leg, plus resting maker entry on bid) | CONFIRM — Langston (maker entry on bid) |
| D5 | CHANGE (second epoch since 09-02; clamp condition) | AGREE | **DECIDED** |
| D6 | CHANGE (clock basis field; 15 s knife-edge) | AGREE | **DECIDED** |
| D7 | AGREE | CHANGE (re-serve never renews age; recheck against D6) | CONFIRM — Langston |
| D8 | AGREE | AGREE | **DECIDED** |
| D9 | CHANGE (exits need no conversion; USD P&L unavailable) | AGREE | **DECIDED** |
| D10 | CHANGE (#951 waits for 09-16; #943 window on corrected build; before-record named; he runs the reads) | CHANGE (window ≠ defect; close on acceptance) | DECIDED (Langston) · CONFIRM — Coltrane |
| floor | AGREE | AGREE | **DECIDED** |
| DHMA | AGREE | AGREE | **DECIDED** |
| ranking | AGREE | CHANGE (net wealth vs cash, common horizon, shadow) | CONFIRM — Langston |
| implementation | AGREE + commit boundary; closing reads by Langston or Coltrane | CHANGE (no routine role for Coltrane; fee wording) | CONFIRM — Coltrane (boundary), Langston (runs the reads) |
