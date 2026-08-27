# B-EXIT-TRANSACTABLE-SIDE (Part F item F-G) — SCOPE, PRE-DRAFT

change-class: architecture

> **STATUS: STEP 1, r1 — objectives written 2026-08-27 after the provenance gate (§5) was discharged.** The audit in §2-§4 is what the objectives fall out of; §5 is what reframed them.
>
> ⛔ **THIS IS NOT A BUG FIX AND THE SCOPE MUST NOT BE READ AS ONE.** §5.1 establishes from the introducing directive that the midpoint was built **deliberately, for stability, for the UI and analytics.** It is doing its job. **What went wrong is that a second consumer — the exit decision — started reading a number built for the screen.** ⇒ **F-G SEPARATES TWO USES OF ONE NUMBER.** Framing it as a defect invites a blanket swap, which is the `#546`-shaped risk here.
>
> ⛔ **SEQUENCING: `#911` on `B-EXIT-PROVENANCE` runs first** (Phase 19 plan §1 rows 1-2 — wired and deployed `ed86a758e`, awaiting one real close). F-G is row 3, Kyle's order of 2026-08-27.

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

## 4b. ⛔⛔ THE LAST-TRADED PRICE IS **NOT** LOST — IT IS ARCHIVED, FOR BOTH CLASSES, AND IT IS REAL

**This is the load-bearing correction to §4 and it arrived AFTER the r1 dispatch. Kyle's instruction: *"we've hit these points before where we thought we were throwing away data… please check all of our data archiving before you assume."* He was right — the sweep changed the answer.**

**THE ENGINE PATH GENUINELY LOSES IT.** Both directives write a midpoint into the last-trade field, so no live engine reader can see a traded price. That part of §5 stands.

**BUT THE ARCHIVER NEVER GOES THROUGH THE TRANSLATOR.** `crypto-spot-archiver.ts:133` and `equity-spot-archiver.ts:149` both persist `data.last` **straight off Kraken's raw message** into `*_ticker_snap.last`. **The substitution is in the translator; the archiver does not call it.** Two paths off one feed — one loses the traded price, one keeps it.

**PROVEN AT THE OBJECT, NOT INFERRED — live rows, and the control is built in: if `last` were the substituted midpoint these columns would be IDENTICAL. They are not.**

| symbol | `last` | bid | ask | `last` vs mid |
|---|---|---|---|---|
| BTC/USD | 79464.80 | 79464.70 | 79464.80 | **+0.01 bps** |
| SOL/USDC | 104.26 | 104.23 | 104.26 | **+1.44 bps** |
| CFG/USD | 0.1390 | 0.1389 | 0.1392 | **−3.60 bps** |
| HON/USD (xStock) | 219.21 | 218.80 | 221.50 | **−42.88 bps** |
| PANW/USD (xStock) | 356.80 | 353.00 | 357.01 | **+50.31 bps** |

**Values fall on BOTH sides of the midpoint and vary by two orders of magnitude — the signature of a real print, not a derived average.**

⇒ **CONSEQUENCE: F-G SHRINKS AGAIN. It is a READ, not a recovery.** No change to either directive, no touching the translator, no new capture. **The number a resting sell needs to know it was filled already exists, per symbol, timestamped, for both classes.**

⚠️ **THE HONEST COST, STATED RATHER THAN DISCOVERED AT STEP 4:** the archive is written on its own cadence, so a read at close time is **seconds behind live** (measured 2026-08-27: xStock ~4 s; crypto 5.0–9.0 s). **For deciding whether a resting order actually filled, a slightly-late record of a REAL trade beats an instantaneous midpoint that never happened** — but it is not free, and the staleness must be stamped on the row, not assumed away (the `#911` discipline).

## 5. THE PROVENANCE READ (MANDATORY 1.b) — ✅ DONE 2026-08-27. **IT CHANGES WHAT THIS BATCH IS.**

### 5.1 CRYPTO — TIER 1. **Disposition (2): relevant, needs updating to today's intent.**

**Introducing commit `4beae06ed`, 2025-12-30, Replit-era Agent commit** — *"Improve trading platform stability with stateful mini-book handling… for stable mid-price computation."* It carries its own directive, and the directive is decisive.

**`attached_assets/Pasted--4-Directive-8-9-4-Patch-Mini-Book-Safety-Upgrade-Targe_1767128713788.txt`, QUOTED VERBATIM (not summarised, per the evidence standard):**

> **"Objective — Replace stateless 'last message' logic with a stateful in-memory mini-book that tracks top-of-book bids/asks and ensures stable mid-price computation."**
>
> **"Mirror the same logic in `market-data-ws.ts` so that analytics (Cortex, StrategyBob) also read stable mid-prices."**
>
> Outcome table: **"Prone to Depth-Jumping → Depth-stable mid-prices"** · **"High false volatility → Smooth, continuous pricing"** · **"Inconsistent between Cortex & UI → Unified price source"**
>
> Verification: **"Confirm no 'flash-crash' artifacts in UI."** · **"Compare midpoint with Kraken REST (b+a)/2 — should match within ±0.1%."**

⛔⛔ **THE FINDING, AND IT REFRAMES THE BATCH: THE MIDPOINT WAS BUILT DELIBERATELY, FOR STABILITY, AND ITS NAMED CONSUMERS ARE *DISPLAY AND ANALYTICS* — the UI, Cortex, StrategyBob. THE DIRECTIVE NEVER CONTEMPLATED THIS PRICE DRIVING A FILL OR AN EXIT DECISION.** Every stated goal is about smoothness and cross-surface consistency; every verification step is a display check or a sanity check against REST.

⇒ **F-G IS THEREFORE NOT "FIXING A BUG". It is SEPARATING TWO USES OF ONE NUMBER** that were merged later, when the exit path began reading the price built for the screen. **A stable mid is the RIGHT answer for a chart and the WRONG answer for a fill**, and both of those are true at the same time — which is why a blanket swap is the wrong shape and why §6 Q2 exists.
★ **AND THE DIRECTIVE SPECIFIED THE CHECK THAT WOULD HAVE CAUGHT `#741`:** *"Compare midpoint with Kraken REST (b+a)/2 — should match within ±0.1%."* A crossed book fails that test trivially. **The check was written down on day one and never ran** — the same shape as MBIM (built `92e9c15fc`, the same day, wired to a manual route and never to boot). **Two independent alarms for this defect were specified in December and neither was live until August.**

### 5.2 xSTOCK — TIER 1. **Disposition: `INFERRED-FROM-CODE`. Intent is NOT recoverable.**

**Introducing commit `184c41881`, 2026-07-16, P19-B8.5** — governance-era, and its subject records *"Langston design-APPROVED + Step-4 APPROVED"*. The BATCH's purpose is documented at length: Kraken spot REST carries no tokenized equities, five open xStock positions had no marks, so the exit monitor's venue leg became the equities WS tick.

⛔ **BUT THE MID-VS-LAST CHOICE ITSELF HAS NO WRITTEN JUSTIFICATION ANYWHERE.** The only record is the code comment asserting *what* it does — `// P19-B8.5 xstock marks: mid from bid/ask when both sides exist, else last` — never *why* a mid was chosen over the last traded price, which is what the VTS xStock lane uses for the same instrument.

**ASSERTED ABSENCE, WITH PRESENCE-EVIDENCE (rule 22) — the instrument was proved before the absence was claimed, and THREE distinct search terms were run at Langston's r1 instruction** (*"`mid from bid/ask` is the CODE COMMENT's phrasing; a design note in other words is out of its reach — run a second term before the absence is final"*). **Terms run: `"mid from bid/ask"`, `"last traded"|"mark price"|"markPrice"`, and `xstock.{0,40}mark`. All three return NOTHING on the mid-vs-last decision.** The first returns exactly ONE hit, this scope file. The same corpus contains **`P19-B8.5` 13× in the System Manual, 10× in the System Impact Map, 11× in `BATCH_CATALOG`** — so the batch is richly documented and the search plainly reaches it. **The gap is specific to this decision, not to the search.**

⚠️ **CONSEQUENCE FOR THE BATCH:** the crypto change can be argued from the directive's own words. **The xStock change cannot be argued from provenance at all** — there is nothing to argue with. It must be justified on today's evidence, and F-G's scope must say so rather than implying a symmetry that does not exist.

### 5.3 TIER 2 — one-line intent notes
- `getBookForFill` — fill-grade accessor added for the depth-walked paper fill and the depth gate; returns both sides best-first plus `ageMs`. Not touched by F-G.
- `assessSufficiency` / `getDepthSnapshot` — the open-seam depth gate. Not touched by F-G; its unread bid side is Roadmap 21.4, deliberately deferred by Kyle 2026-08-27.
- `evaluateTECExit` — the SHARED exit decision, imported by both the VTS runner and the active engine. **F-G must not fork it** (the `B-EPOCH-KEYING-PARITY` lesson: a decided rule needs ONE home plus a parity test).

### 5.4 `bridge/canonical/` — CONSULTED, per the recording rule
The crypto midpoint **predates the 2026-01/02 governance change**, so the pre-governance corpus was consulted. ⚠️ **It has NO coverage of the mini-book or the mid-price decision** — that decision lives only in the `8.9.4-Patch` directive quoted above, which is an `attached_assets` artifact rather than part of the canonical corpus. **Recorded as a finding, per the rule, not as an absence of obligation.**

## 5b. OBJECTIVES + VERIFICATION CRITERIA

⛔ **READ OBJ-0 FIRST. IT IS THE ONE THAT CAN SINK THE BATCH.**

| # | objective | verification criterion |
|---|---|---|
| **OBJ-0** | ⛔ **MEASURE THE BEHAVIOUR CHANGE BEFORE SHIPPING IT — SHADOW FIRST, SWITCH SECOND.** Deciding on the transactable side **moves when trades exit**, in OPPOSITE directions for the two exit types: for a long, **stops fire EARLIER and targets fire LATER**. Not telemetry — it changes the trade population. | ⛔ **PRE-REGISTRATION REWRITTEN AT r2 — the r1 version was NOT FALSIFIABLE and Langston holed it on three counts, all correct.** (a) **WRONG SIDE:** stops firing earlier **is the intended behaviour**, so a rise in stop count is EXPECTED and is not evidence of harm — gating on it would reject the batch for succeeding. (b) **ONE METRIC ON A TWO-SIDED CHANGE:** targets firing later needs its OWN read-out or OBJ-0 measures half the change. (c) **NO n-FLOOR AND NO WINDOW RULE** (`#661` leg 2: window span ÷ the phenomenon's period ≥ 1, or a zero is unreadable). ⇒ **PRE-REGISTERED, DIRECTIONS STATED BEFORE DATA: ① THE DISCORDANT CELL IS THE KILL CRITERION** — a trade the NEW rule stops out that the OLD rule rode back to `target_hit`. **That is the only cell where the change destroys value**, and it is what sinks the batch. ② **BOTH exit types reported separately**, never netted. ③ **n-floor and window span both set at Step 2 from the exit-rate, before the shadow runs.** ④ **Every cell of the 2×2 (old-rule × new-rule outcome) is published, including the ones that favour the change.** |
| **OBJ-1** | **The exit DECISION for a long reads the BID, not the mid** — the side we actually transact on. Applies to stop, target and trailing evaluation alike. | Every post-deploy exit evaluation records which side it decided on; a fence asserts the decision price is the bid-derived value on every long-exit branch, and that **no exit branch reads a mid**. |
| **OBJ-2** | ⛔⛔ **THE LABEL MUST BECOME HONEST — and Langston's r1 reading is sharper than mine, so this objective is rewritten around it.** The `8.9.4-Patch` directive ships `const safeData = { a:[bestAsk], b:[bestBid], c:[midpoint] }`, and **in Kraken's ticker schema `c` IS THE LAST-TRADE FIELD.** `8.9.1` does the identical substitution in the translator (`c: [markPrice]`). ⇒ **THE MIDPOINT WAS PUBLISHED UNDER THE NAME OF A TRADED PRICE, TWICE, BY TWO DIRECTIVES.** So **no downstream reader was misbehaving** — every one of them read `c` correctly and got a mislabelled value. ⚠️ **The variable at `kraken-websocket-adapter.ts:681` is STILL NAMED `lastPrice` while holding a mid.** | ⛔ **THE FENCE ASSERTS THE LABEL, NOT THE CONSUMER SET.** A field named for a traded price must carry a traded price, or be renamed to what it holds. **Consumer-counting is the weaker test and would pass a correctly-read wrong value** — which is exactly how this survived eight months. ★ **AND THE MID LEGITIMATELY SURVIVES** for charts and smoothed series — under an honest name. ⚠️ **Kyle's correction, taken (r2):** anything that becomes a price we **TRANSACT** at — signal-time entry, stop, target, trigger — needs the transactable side. **My r1 claim that "the mid stays for signal generation" was WRONG:** a signal priced at a mid we can never pay makes the whole trade's geometry optimistic at birth. |
| **OBJ-3** | **BOTH ASSET CLASSES.** crypto via the WS book's bid; xStock via the equities tick's bid. §2 establishes three of four lane/class combinations decide on a mid, by two different routes. | Post-deploy exits on both classes record a bid-derived decision. ⚠️ **A crypto-only change fixes half and would read as complete** — the xStock defect is different code with an identical symptom. |
| **OBJ-4** | **DO NOT FORK THE SHARED EXIT DECISION.** `evaluateTECExit` is imported by both the VTS runner and the active engine. The side-selection must live in ONE place with a parity test, not be re-implemented per lane. | A test asserts both lanes resolve the exit side through the same function. ★ **This is the `B-EPOCH-KEYING-PARITY` lesson applied in advance: a decided rule needs ONE home plus a parity test, or it ships into one reader of four.** |
| **OBJ-5** | **VTS DISPOSITION IS DECIDED AND WRITTEN DOWN — not left implicit.** VTS and paper are separate systems and must never be blended (Kyle, standing). Changing VTS mid-stream splits its series; leaving it means the two lanes price exits differently, which must then be a *stated* difference. | The scope names the choice and its consequence explicitly. ⚠️ **`#914` is the live precedent for what happens when a lane difference is real but unrecorded.** |
| **OBJ-6** | **The change is measurable after the fact.** `B-EXIT-PROVENANCE` now stamps the decision price, its producer and an independent witness on every close. | A before/after read on stamped rows is possible **on the active population**. ⛔ **NOT on VTS** — `#914`: VTS has no exit slippage to remove, so an F-G before/after measured there would show nothing and would read as "no effect". |

**CHANGE-CLASS: `architecture`.** It alters which price drives a live admission/exit decision on both asset classes — a risk-envelope edit, not telemetry.

**OUT OF SCOPE, each with its home:** the unread bid side of the OPEN depth gate → Roadmap 21.4 (Kyle deferred, 2026-08-27) · the `:1272` `ageMs` mislabel → `#913` · historical row correction → F1+F2 · the VTS fill model → `#914`.

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
