# Pricing Decisions — consensus record (FINAL, r3)

**Kyle, 2026-09-11:** these decisions are not his. CC-C, Langston and Coltrane iterate to consensus on the open pricing decisions, do only what is needed to settle them, then implement. No new batches or sub-batches. Move quickly.

**The test for every decision (Kyle, 2026-09-03):** fidelity to live trading, not better-looking results.

## ✅ CONSENSUS REACHED — 2026-09-11, two rounds

| round | Coltrane | Langston |
|---|---|---|
| **1** | 14:37Z | 14:40Z |
| **2** | 14:46Z — **AGREE ALL**, plus one wording fix to D3 | 14:52Z — **AGREE on every item**, plus a ranking rider and three factual conditions on D10 and on implementation |

- **Reads:** every round read the document at its pushed ref — r1 at `be206ffa2`, r2 at `df9f03128`.
- **Changes:** all changes from both reviewers are written into the text below.
- **Late wording:** Coltrane's `venue_close` wording and Langston's conditions arrived in the same round, so neither reviewer saw the other's. Both are mechanical: a label, a factual correction, an ordering constraint and an alert. Neither reopens a decision.

---

## Measured fact — Kraken's best-bid/offer ticker trigger (`#1017`)

The probe was `scripts/analysis/bbo_trigger_ack_probe.mjs`, run 2026-09-11 at 14:28Z against public endpoints only.
- **Crypto v2:** `event_trigger: bbo` was **accepted**. The control without it echoed `trades`, confirming the default.
- **xStock endpoint:** the field was **rejected** — *"Unsupported field: 'event_trigger' for params type: 'ticker'"*. The default xStock ticker was live, and its snapshot carried no timestamp field.
- ⚠️ **Acceptance, not rate.** The update counts came from different symbols, so they are not a rate comparison. The rate check is in D3.

---

## D1. Exit side for long positions

- Engine-managed long exits are our own triggers, in paper and in live — not Kraken native stop orders.
- **A stop triggers when the valid bid ≤ stop. A taker target triggers when the valid bid ≥ target.**
- A market sell walks valid bid depth for our quantity. Where depth is missing, completion is modelled under D8.
- Maker exits follow D2.

*Why:*
- The level-basis rule, ruled 2026-09-04, requires a price we could actually transact at.
- AU3 Stage B: a taker liquidation is most faithful on the current bid and depth.
- Since 22 August, 24 of 24 stop-outs filled below their stop (median 0.166%).

## D2. Maker and taker fill evidence

- **Taker entries** walk valid asks.
- **Maker orders:** once a maker order is resting, a simulated full fill at the limit (under the retained baseline) needs one of two things:
  - a valid opposite quote reaching the limit — the ask at or below a buy limit, or the bid at or above a sell limit;
  - a later trade **strictly through** the limit.
- **A midpoint touch does not qualify.**
- **Marketable-at-placement handling is preserved.**
- **Scope:** this supports a simulation assumption, not proof of queue execution. Queue position is unknowable, so a trade *at* the limit does not qualify. Live fills come from execution reports.

## D3. Ticker or order book — chosen by job

- **Touch price** — for triggers, spread checks and marks:
  - Use the order book's top where the book is valid (checksum passed, in sync) and fresh.
  - Otherwise use the ticker sides, but only if they are valid for that instrument and within D6's age policy.
  - **If neither qualifies, refuse the price-dependent action.** For an exit, that means a hold, per D6.
- **Price basis is a field.** Every level, trigger and mark records its actual source basis beside the price:
  - `book_top`, `ticker_bbo` or `ticker_default`, for quote-derived observations;
  - `venue_close`, for D4's retained bar lanes.

  These populations are never pooled.

  **AMENDED 2026-09-11 at Step 4 (Langston, chunk 1 of the OBJ-7 review), so the code and this record agree.** The implemented basis set (`server/services/market-data/price-basis.ts`) adds four values, each necessary and approved on its merits, and the never-pooled rule covers every one:
  - `rest_ticker` — a REST ticker read (the adapter's poller, or the engine's direct fallback);
  - `book_depth` — a walk over the maintained book's levels: a fill estimate for a size, never a touch price;
  - `archive_ticker_snap` — a walk over the throttled xStock ticker snapshot table: also a fill estimate;
  - `not_an_observation` — a re-serve, seed, mock, reused price or no price: never a live basis.

  **Era boundary for `ticker_bbo`:** crypto ticker rows are best-bid/offer-triggered only from the OBJ-7 deploy; rows before it came from the default trade-triggered ticker. **Deploy sha and UTC: `b597f1bf210a954e1031e75eb939e5f75483237e`, `dt-deploy --by cc-c` invoked no earlier than 2026-09-11T20:05Z, recorded here before the restart; the deploy record's `deployed_at` is the exact boundary and is added here after the restart.**
- **Ticker trigger:** crypto moves its ticker to the best-bid/offer trigger. xStock keeps the default ticker.
- **xStock 20-level book** for held and queued xStocks (`#949`).
  - ⛔ **Precondition in the landing.** Today `unsubscribeFromSymbols` sends `channel: 'ticker'` only, so cleared book streams stay live at Kraken and re-subscribes stack on top of them.
  - So either fix the book unsubscribe, or prove the subscribed set is bounded.
- **Fill estimate for our size:** walk the book's depth. Missing depth is unsupported quantity under D8. The ticker's size at the touch never stands in for depth beyond that size.
- **Disagreement alert:** the book-versus-ticker alert is armed in the landing, not after it. It compares aligned observations from healthy feeds, with a threshold that tolerates ordinary asynchronous delivery.
- **Step 8 check for the best-bid/offer switch:** message rate and event-loop lag, before and after, at the live subscription count, with a named revert.

## D4. Where the midpoint stays, and how levels are built

- **The midpoint is for valuation and features only:** indicators, regime inputs, ranking features, spread denominators. It is never a level, a trigger, a fill or a booked result.
- **Crypto quant levels take execution intent explicitly, leg by leg:**
  - taker entry → **ask**;
  - resting maker entry → **bid**, which is where the order rests;
  - long stop and target → **bid**.

  Each carries its age, stated at the site. Structural geometry is preserved, and spread is counted exactly once.
- **The bar lanes** keep their accepted printed-price bases (`venue_close`), carrying their age.

D4 builds the level; D2 supplies the fill evidence. Neither claims the other's job.

## D5. Booking results

- **Active paper** books the simulated fill, unchanged.
- **VTS crypto exits** move to the D1 rule in the same landing.
  - This is the **second VTS epoch boundary since 2026-09-02**, keyed through `calibration-epoch.ts`.
  - The pre-switch era is labelled mid-triggered, so later consumers can discount it.
- **VTS xStock clamps** stay until `#943`'s acceptance passes (see D10). Until then they are a stated model limitation.

## D6. How fresh a price must be, and which clock

- **Exits:** keep the risk-derived ceiling (Kyle, 2026-09-03). A stale price holds the exit; the position, its exposure and its pending intent are kept.
- **Entries:** keep the flat 15 s limit.
- **Clock basis is a field.**
  - Venue-clock age applies where the message carries a timestamp (the crypto ticker).
  - Receipt-clock age applies otherwise — today, every xStock price.
  - The two are never pooled, and receipt age is never a claim of known source freshness.
- **A re-served cached price keeps its original age.**
- ⚠️ **Knife-edge — corrected at Step 4 (Langston, chunk 3, 2026-09-11).** This note first paired the crypto re-serve sawtooth with `active_fill_max_age_ms` (15,000). That named the wrong gate.
  - That knob has exactly two consumers, both xStock (`active-dispatch.ts:182`, `:184`). It measures the xStock archive table's latest capture: a different class, a different table and a different clock.
  - The 14.3 / 29.3 / 44.3 / 59.3 s sawtooth (`#951` progress report §3) measures against the crypto exit path's 2 s `cachedAt` window. It passes that window by construction, because a re-serve is written back with a fresh `cachedAt` while its `observedAt` stays honest.
  - The refusal is OBJ-8's crypto age check (scope 8g). Once D7 keeps the original age, the rungs become visible to that check, and a change in its refusal rate is not read as a market effect.
  - Checked with one query (P-7f): 0 of 109 closed trades since 2026-08-26 entered on the re-serve producer; positive control, one `kraken_rest_poller` entry.

## D7. Price caches and refresh timing

- **Keep both caches.**
- **Open positions** get enrolled in the 2-second refresh lane (`#977`).
- **Queued and held symbols** carry their own subscription reasons.
- **The rate limiter** goes on the direct REST call path.
- **Re-serves:** a cache re-serve or a failed refresh never renews observation age or advances smoothing, and every action rechecks the retained observation against D6.
  - Reusing a still-valid observation is legitimate. The defect was age laundering, not re-serving.
  - This replaces r1's blanket refusal.
- **The true last trade** is stored separately (`#952`).
- **The smoothed estimator** advances once per new observation. Its state either survives a restart or re-warms explicitly (SIM S26).

## D8. Simulated exits

- Full completion is kept, as ratified in P19-B4b.1.
- Walked versus extrapolated quantity is recorded on every close path.
- A missing config is recorded as an invalid estimate, not as zero slippage.
- Live accounting never assumes completion.
- Revisit at Phase 21.

## D9. Pairs not quoted in US dollars

- **New admission is refused**, with a specific reason, for any pair not quoted in USD, until a timestamped currency conversion exists (`#966`).
- **Open positions keep their exits.** Their triggers are denominated in the quote currency and need no conversion.
- **Their USD P&L is marked unavailable, not estimated**, until the conversion exists.

## D10. The three observation windows

**Closing a window never closes its defect.** Langston runs the closing reads, not CC-C, which owns the batches those windows judge. Each read has an armed alert, owner `langston`, left active until the read lands.

- **F-G-2**
  - Retired as a deploy gate; its VOID status is kept.
  - Its before-record is the **24 of 24 post-fix stop-outs filled below the stop (median 0.166%)**. The OBJ-0 shadow run banked nothing.
  - The question of how much of that record to distrust converts into D5's epoch label.
- **`#951`**
  - Not closed at landing.
  - Alert `0db25f1d` fires on 2026-09-16, carrying the binding stopping rule: an empty arm at that point *is* the result.
  - Then retire it with the reason stated, or re-point the assertion onto the producer that is exercised.
- **`#943`** — *corrected in r3, Langston condition 1*
  - Its fixes **already deployed**: `3ad89b699` reached staging through `f8870022f` on 2026-09-04 at 19:27Z, and is an ancestor of the live head `29cce1076`.
  - Its re-anchored two-handoff window has **already run**, on 09-08 and 09-09 plus two more on 09-11.
  - **The reads are owed now.** They do not gate the landing.
  - ⛔ **Ordering (Langston condition 2):** the `#943` reads land **before** OBJ-7's feed-and-plumbing deploy. D3's xStock book subscription changes `book-state-tracker.ts`, the instrument `#943` measures, so that deploy would otherwise split a completed window.

---

## Other items

| item | decision |
|---|---|
| **$0.25 minimum price** (`#967`) | **Keep** (Kyle, 2026-09-11). The `strong_trend` exception (`min_price 0.001`) stays. Revisit only if data argues for it |
| **DHMA** | Stays shelved, outside this landing |
| **Ranking objective** (after reachability) | **Measure:** incremental expected net portfolio wealth versus cash, under fixed notional and existing caps, including pending reservations, non-fills and unresolved holdings. **Horizon:** a common evaluation horizon, **recorded as a number with the shadow** (Langston rider). **Method:** starts as a prospective shadow, scored against the incumbent ranker on the same population before it changes anything. No dividing by a guessed holding time |

---

## Implementation

1. **One pricing batch** at 3n `B-PRICE-SIDE-BY-JOB`, in one workflow. CC-C implements and Langston reviews. Coltrane takes part in bounded decision rounds only.
2. **Before anything deploys:** the `#943` window reads land (D10 ordering), and the close-gate alerts for the `#943` and F-G-2 reads are armed.
3. **Commit 1, the feed-and-plumbing layer:** D3's subscriptions and unsubscribe fix, plus D7's enrolment, limiter, true last trade and smoothing. It lands and is proven live.
4. **Commit 2, the decision layer:** D1, D2, D4 and D5 switch on. Step 2 decides whether commits 1 and 2 are one deploy or two.
5. **Then xStock fees:** CC-B's `B-XSTOCK-FEE-CONTRACT` (2.4-FEE, Step 1 at Langston 2026-09-11). Startup validation accepts verified, applicable signed fees, rebates included, and rejects invalid contracts.
6. **Then reachability:** row 4 `F-5`, the reachability ceilings per strategy.

---

## Consensus record

| item | Langston r1 | Coltrane r1 | Langston r2 | Coltrane r2 | final |
|---|---|---|---|---|---|
| D1 | CHANGE | CHANGE | — | AGREE | ✅ DECIDED |
| D2 | AGREE | CHANGE | AGREE | AGREE | ✅ DECIDED |
| D3 | CHANGE | CHANGE | AGREE | CHANGE (`venue_close` label) | ✅ DECIDED |
| D4 | CHANGE | CHANGE | AGREE | AGREE | ✅ DECIDED |
| D5 | CHANGE | AGREE | — | AGREE | ✅ DECIDED |
| D6 | CHANGE | AGREE | — | AGREE | ✅ DECIDED |
| D7 | AGREE | CHANGE | AGREE | AGREE | ✅ DECIDED |
| D8 | AGREE | AGREE | — | AGREE | ✅ DECIDED |
| D9 | CHANGE | AGREE | — | AGREE | ✅ DECIDED |
| D10 | CHANGE | CHANGE | conditions 1-3 | AGREE | ✅ DECIDED, with conditions applied |
| floor | AGREE | AGREE | — | AGREE | ✅ DECIDED |
| DHMA | AGREE | AGREE | — | AGREE | ✅ DECIDED |
| ranking | AGREE | CHANGE | AGREE + rider | AGREE | ✅ DECIDED |
| implementation | AGREE + commit boundary | CHANGE | conditions 2-3 | AGREE | ✅ DECIDED |
