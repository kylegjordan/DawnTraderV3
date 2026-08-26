# B-EXIT-TRANSACTABLE-SIDE (Part F item F-G) — SCOPE, PRE-DRAFT

change-class: architecture

> **STATUS: PRE-DRAFT.** This file exists because Kyle directed (2026-08-27) that the findings of the full-lane price audit be folded into F-G's scope **at the moment they were found**, rather than re-derived when the batch starts. **Objectives and verification criteria are NOT yet written; Step 1 has not been dispatched.** What follows is the AUDIT that F-G's objectives must fall out of.
>
> ⛔ **DO NOT START IMPLEMENTATION FROM THIS FILE.** It is evidence, not a plan. The `#911` gate on `B-EXIT-PROVENANCE` runs first (Phase 19 plan §1, rows 1-2); F-G is row 3.

---

## 1. THE ONE-SENTENCE CASE

**We decide our exits on a price nobody will trade with us at.** A long position is closed by SELLING, which fills on the **BID**; three of our four lane/asset-class combinations make that decision on a **MIDPOINT** instead — a price halfway between what buyers offer and what sellers ask, which is not obtainable on either side.

---

## 2. ⛔ THE FINDING THAT REFRAMES THE BATCH: F-G IS NOT A CRYPTO BATCH

**Traced in code 2026-08-27, hop by hop, not from memory.** Every cell below was read at the ref.

| lane | asset class | what the EXIT DECISION reads | is it a midpoint? |
|---|---|---|---|
| **VTS** (learning) | crypto | `priceCache` ← `updateFromWebSocket` ← `livePricingAdapter.updateCache` ← the `priceTick` event ← **`handleV2BookUpdate` book MIDPOINT** | ⛔ **YES — and it is the `#741`-contaminated one** |
| **VTS** (learning) | xStock | `xstock_spot_ticker_snap.last`, via the `DISTINCT ON (symbol)` read in the resolve loop | ✅ **NO — last traded price. The only lane that is not a midpoint.** |
| **Active paper** | crypto | `livePricingAdapter.getPriceWithFallback` ← the same adapter cache ← the same book midpoint | ⛔ **YES** |
| **Active paper** | xStock | `getLatestEquityTick` ← `equity-spot-archiver.ts:135` **`(bid + ask) / 2`** | ⛔ **YES — a different route to the same defect** |
| **Live** | both | shares the active path; **out of scope this phase**, but inherits whatever F-G lands | — |

★ **THE CHAIN FOR VTS CRYPTO, PROVEN END-TO-END** (this is the one that was easiest to assume and hardest to believe): `handleV2BookUpdate` computes `midpoint = (bestBid + bestAsk) / 2` and emits it as a `priceTick` — **the code at that line is commented `★ #741: THE CONTAMINATED PATH`** — the module-load subscriber in `live-pricing-adapter` calls `updateCache`, and `updateCache` writes **both** its own cache **and** `priceCache.updateFromWebSocket(...)`. **VTS reads `priceCache`.** ⇒ **the learning population and the paper trades were built on the same number.**

⛔ **CONSEQUENCE, LOAD-BEARING: A CRYPTO-ONLY F-G FIXES HALF THE PROBLEM AND WOULD READ AS COMPLETE.** The xStock defect is not the same code, so it will not be swept up incidentally, and its symptom is identical — which is exactly how it stayed invisible.

---

## 3. ⛔ THE MEASUREMENT — AND IT REFRAMES "WE HAVE NO WINNERS"

`stop_hit` closes, `closed_at >= 2026-07-15`, split at the observation epoch (`2026-08-22T22:01Z`). Metric: `(exit_price − stop_loss) / stop_loss × 10000` bps. **A long's stop should fill AT or slightly BELOW its level — never materially above it.**

| class | era | n | filled BELOW stop | mean bps vs stop |
|---|---|---|---|---|
| crypto | **PRE**-fix | 141 | 53.9% | **+100.8** ⛔ |
| crypto | **POST**-fix | 19 | **100.0%** | **−29.9** |
| xStock | PRE-fix | 137 | 43.1% | +56.0 |
| xStock | POST-fix | 3 | 0.0% | +207.5 ⚠️ n=3, unreadable |

★★ **A CRYPTO STOP FILLING ON AVERAGE A FULL PERCENT *BETTER* THAN ITS OWN LEVEL IS NOT A MARKET OUTCOME. It is the ghost bid.** The sell walked into a bid that did not exist, above the real market, and booked a better exit than reality would have given.
⇒ **THE POST-RESET DECLINE IS SUBSTANTIALLY THE REMOVAL OF AN OVERSTATEMENT, NOT A DETERIORATION IN THE STRATEGIES.** ⚠️ **This is NOT a claim that the strategies are sound** — it is a claim that the number which made them look sounder was fake. Those are different statements and must not be merged.
⇒ **AND IT IS THE STRONGEST AVAILABLE EVIDENCE THAT THE `#507` BOOK FIX WORKED**: the flattery vanished at exactly the epoch.

**THE POST-FIX −29.9 bps IS F-G's TARGET.** 19 of 19 crypto stops now fill below their stop. That is the real cost of deciding on a mid and filling on a bid, and it lands on **84% of all closes** (16 of 19 since the epoch went out through the stop).

⚠️ **PREVIOUSLY STATED: "all nine stop-outs filled below their stop, median 0.17%." NOW: 19 of 19 post-fix crypto, mean 29.9 bps; and the pre-fix population is 54% below, mean +100.8 bps. REASON: the earlier figure was a 9-trade sample that did not separate the eras — and the era split is the whole finding.**

---

## 4. ⛔ THE DATA F-G NEEDS ALREADY EXISTS — THIS IS A READ, NOT A COLLECTION

**Checked, not assumed** (`§1`'s does-it-already-exist rule):

- **`crypto_spot_ticker_snap` — 12,559,233 rows, EVERY ONE with non-null `bid` AND `ask`, newest write 2026-08-26T20:41Z.**
- **`xstock_spot_ticker_snap` — same shape, and it is ALREADY the source `getDepthSnapshot` reads for xStock fills.**
- **The crypto order book itself exposes both sides live** via `getBookForFill` (asks ascending, bids descending, plus `ageMs`).
- ★ **The VTS xStock resolve loop ALREADY FETCHES `bid` and `ask` alongside `last`** — and uses them **only** to compute a spread. **The transactable side is loaded into memory and thrown away one line from where the exit decision is made.**

⇒ **No new feed, no new retention, no new table.** F-G is a change to *which of several already-present numbers the decision reads*.

---

## 5. THE PROVENANCE READ — WHY IT WAS BUILT ON A MIDPOINT (TIER 1)

⚠️ **NOT YET DONE. This section is the gate on Step 1 and is deliberately left empty rather than guessed.**
Required before objectives are written, per `MANDATORY 1.b`:
- `handleV2BookUpdate`'s midpoint — introduced under the `8.9.4-Patch` marker. **Read the introducing commit and quote it.** The comment *"Calculate stable midpoint from mini-book BBO"* suggests the intent was **STABILITY** (a mid is less jumpy than a crossing bid/ask), which would make this **disposition (2) — relevant but needing an update to today's intent**: stability is a legitimate goal for a *display* or a *signal* price and the wrong goal for a *fill* price.
- `equity-spot-archiver.ts:135`'s `(bid+ask)/2` — carries the marker `P19-B8.5 xstock marks: mid from bid/ask when both sides exist, else last`. **Same question, different lane.**
- **Both must be answered before F-G proposes a change**, because if the mid was chosen deliberately for stability, F-G is not "fixing a bug" — it is **separating two uses of one number**, which is a different and larger design.

---

## 6. OPEN QUESTIONS FOR LANGSTON AT STEP 1

1. **Does the exit DECISION move to the bid, or does only the FILL move?** Deciding on the bid makes stops trigger earlier (the bid is below the mid) — that is a **behaviour change on live money paths**, not telemetry.
2. **Is the mid load-bearing anywhere it should stay?** Signal generation, regime, and display may legitimately want a stable mid. **A blanket swap is the `#546`-shaped risk here.**
3. **VTS: change it, or leave it and record the difference?** VTS is the learning population — changing its price mid-stream splits the series. **Kyle's standing rule is that VTS and paper are separate systems and must never be blended.**
4. **Sequencing against `F-E`**: F-E tiers historical fill integrity. If F-G changes exit pricing first, F-E grades a moving target.

---

## 7. KNOWN LIMITS OF THIS AUDIT, STATED

- **xStock post-fix n=3.** Nothing about xStock's post-fix stop behaviour is readable yet.
- ⛔ **CORRECTED 2026-08-27 — THE CLAIM THAT USED TO SIT HERE WAS FALSE.** It read *"the VTS archive records `exitPrice` but NOT `stopLoss`, so the §3 table cannot be reproduced on the VTS population."* **It can.** `originalStopPrice` is present on **817 of 1,018** recent records; I had read one record of the sparser of two shapes in those files. **The §3 table HAS now been reproduced on VTS, and the result is more important than the table:**

  | class | era | n | filled BELOW stop | mean bps vs stop |
  |---|---|---|---|---|
  | VTS crypto | POST | 179 | **0.0%** | **+0.0** |
  | VTS crypto | PRE | 390 | 1.5% | −2.2 |
  | VTS xStock | POST | 61 | **0.0%** | **+0.0** |
  | VTS xStock | PRE | 369 | **0.0%** | **+0.0** |

  ★★ **999 of 999 VTS stops fill at EXACTLY the stop. That is a modelling assumption, not a market outcome** — and it is the mirror image of the active population's **100% below, −29.9 bps**. **The exit DECISION is genuinely shared** (`evaluateTECExit`, imported by both lanes; its stop branch returns `exitPrice: input.stopPrice`); **the FILL MODEL is not** — VTS records that return verbatim, the active engine depth-walks the book for a real fill. ⇒ **VTS is a world where exiting is free.**
  ⚠️ **BEARING ON F-G, stated because it changes what a before/after would mean:** an F-G before/after measured on the VTS population would show **NOTHING**, because VTS has no exit slippage to remove. **F-G's effect is only observable on the active population.** ⛔ **And any VTS-derived reach or target parameter is fitted against costless exits.** *(Full entry + the disposition question: `RUNNING_ISSUES` `#914`.)*
- **Live mode was NOT audited.** It shares the active path, so it inherits the finding, but no live-specific read was done. Stated so its absence is not read as a clean bill.
