# B-EXIT-TRANSACTABLE-SIDE (Part F item F-G) — SCOPE, PRE-DRAFT

change-class: architecture

> **STATUS: STEP 1, r3 — COMPLETE. Every objective and every point discussed with Kyle is now IN THIS FILE (Kyle-directed 2026-08-27: *"send the full batch with all objectives and points discussed… no point in having him do this piecemeal"*).**
>
> ⛔ **WHAT CHANGED r2 → r3, so a re-reader is not hunting a diff:** **`OBJ-7`** (venue price grid — NEW, and it ships FIRST) · **`OBJ-7b`** (what happens when a rounded signal stops clearing its gates — NEW) · **`OBJ-8`** (the exit-fill INSTRUMENT, re-keyed from the ticker archive to the 1-minute OHLC bar — this SUPERSEDES §4/§4b, which are marked stale IN PLACE rather than rewritten) · **`OBJ-9`** (the bar writer's silent dropped batches, Kyle-directed into this batch, all asset classes) · **§6 rewritten** — the r1 questions are marked SETTLED rather than deleted, and seven live questions replace them.
>
> ⚠️ **THE BATCH HAS GROWN THREE TIMES SINCE r1 AND THAT IS WORTH SAYING OUT LOUD.** It began as *replace the midpoint at the exit*. It is now that **plus** making our prices venue-representable at all, **plus** deciding what a simulated fill even means, **plus** a data-loss fix. **Each addition is load-bearing on the one before it — but if you judge the batch has become too large to review or ship as one unit, say so: splitting it is a legitimate outcome of this review.**
>
> **r1 objectives were written 2026-08-27 after the provenance gate (§5) was discharged.** The audit in §2-§4 is what the objectives fall out of; §5 is what reframed them.
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

⚠️⚠️ **CORRECTION AT r3 — THIS SECTION IS PARTLY STALE AND THE STALENESS IS LOAD-BEARING, SO IT IS MARKED RATHER THAN QUIETLY REWRITTEN.** §4 and §4b were written when the exit-fill instrument was the **ticker archive**. **`OBJ-8` SUPERSEDES that: the instrument is now the 1-minute OHLC bar**, because Langston holed the ticker read on two independent counts (a print is not a fill; a point sample is decimated, not merely lagged). **What §4 still gets RIGHT and is unchanged:** the *transactable side* (`bid`/`ask`) genuinely already exists on both classes, so `OBJ-1` really is a read. **What it now gets WRONG:** *"no new retention"* no longer holds across the whole batch — **`OBJ-7` needs the per-pair grid RETAINED** (crypto's is fetched at startup today and then discarded; xStock's must be DERIVED and stored, since Kraken publishes none), and **`OBJ-9` is a code fix to the bar writer, not a read at all.** ★ **Kept visible rather than edited away because §4b's finding — that the archiver bypasses the translator and keeps a REAL traded price — is still true and still load-bearing for `OBJ-2`. Deleting the section would take the evidence with it.**

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

⛔ **AND OBJ-7 SHIPS FIRST IN IMPLEMENTATION ORDER — it is a PREREQUISITE, not an addition (Kyle-directed 2026-08-27).** OBJ-1's improvement is *require the market to trade THROUGH our price, not merely touch it*. **That test cannot discriminate while our prices are not prices the venue accepts** — measured at **2.7% of stops** and **9.9% of targets** on the real published grid. **Ship OBJ-1 without OBJ-7 and the batch reports a success that changed nothing.** ★ It is also the half that matters for LIVE: an off-grid price is rejected or silently re-priced by the venue, so **paper and live would diverge at the exact moment this batch exists to make faithful.**


| # | objective | verification criterion |
|---|---|---|
| **OBJ-0** | ⛔ **MEASURE THE BEHAVIOUR CHANGE BEFORE SHIPPING IT — SHADOW FIRST, SWITCH SECOND.** Deciding on the transactable side **moves when trades exit**, in OPPOSITE directions for the two exit types: for a long, **stops fire EARLIER and targets fire LATER**. Not telemetry — it changes the trade population. | ⛔ **PRE-REGISTRATION REWRITTEN AT r2 — the r1 version was NOT FALSIFIABLE and Langston holed it on three counts, all correct.** (a) **WRONG SIDE:** stops firing earlier **is the intended behaviour**, so a rise in stop count is EXPECTED and is not evidence of harm — gating on it would reject the batch for succeeding. (b) **ONE METRIC ON A TWO-SIDED CHANGE:** targets firing later needs its OWN read-out or OBJ-0 measures half the change. (c) **NO n-FLOOR AND NO WINDOW RULE** (`#661` leg 2: window span ÷ the phenomenon's period ≥ 1, or a zero is unreadable). ⇒ **PRE-REGISTERED, DIRECTIONS STATED BEFORE DATA: ① THE DISCORDANT CELL IS THE KILL CRITERION** — a trade the NEW rule stops out that the OLD rule rode back to `target_hit`. **That is the only cell where the change destroys value**, and it is what sinks the batch. ② **BOTH exit types reported separately**, never netted. ③ **n-floor and window span both set at Step 2 from the exit-rate, before the shadow runs.** ④ **Every cell of the 2×2 (old-rule × new-rule outcome) is published, including the ones that favour the change.** |
| **OBJ-1** | **The exit DECISION for a long reads the BID, not the mid** — the side we actually transact on. Applies to stop, target and trailing evaluation alike. | Every post-deploy exit evaluation records which side it decided on; a fence asserts the decision price is the bid-derived value on every long-exit branch, and that **no exit branch reads a mid**. |
| **OBJ-2** | ⛔⛔ **THE LABEL MUST BECOME HONEST — and Langston's r1 reading is sharper than mine, so this objective is rewritten around it.** The `8.9.4-Patch` directive ships `const safeData = { a:[bestAsk], b:[bestBid], c:[midpoint] }`, and **in Kraken's ticker schema `c` IS THE LAST-TRADE FIELD.** `8.9.1` does the identical substitution in the translator (`c: [markPrice]`). ⇒ **THE MIDPOINT WAS PUBLISHED UNDER THE NAME OF A TRADED PRICE, TWICE, BY TWO DIRECTIVES.** So **no downstream reader was misbehaving** — every one of them read `c` correctly and got a mislabelled value. ⚠️ **The variable at `kraken-websocket-adapter.ts:681` is STILL NAMED `lastPrice` while holding a mid.** | ⛔ **THE FENCE ASSERTS THE LABEL, NOT THE CONSUMER SET.** A field named for a traded price must carry a traded price, or be renamed to what it holds. **Consumer-counting is the weaker test and would pass a correctly-read wrong value** — which is exactly how this survived eight months. ★ **AND THE MID LEGITIMATELY SURVIVES** for charts and smoothed series — under an honest name. ⚠️ **Kyle's correction, taken (r2):** anything that becomes a price we **TRANSACT** at — signal-time entry, stop, target, trigger — needs the transactable side. **My r1 claim that "the mid stays for signal generation" was WRONG:** a signal priced at a mid we can never pay makes the whole trade's geometry optimistic at birth. |
| **OBJ-3** | **BOTH ASSET CLASSES.** crypto via the WS book's bid; xStock via the equities tick's bid. §2 establishes three of four lane/class combinations decide on a mid, by two different routes. | Post-deploy exits on both classes record a bid-derived decision. ⚠️ **A crypto-only change fixes half and would read as complete** — the xStock defect is different code with an identical symptom. |
| **OBJ-4** | **DO NOT FORK THE SHARED EXIT DECISION.** `evaluateTECExit` is imported by both the VTS runner and the active engine. The side-selection must live in ONE place with a parity test, not be re-implemented per lane. | A test asserts both lanes resolve the exit side through the same function. ★ **This is the `B-EPOCH-KEYING-PARITY` lesson applied in advance: a decided rule needs ONE home plus a parity test, or it ships into one reader of four.** |
| **OBJ-5** | **VTS DISPOSITION IS DECIDED AND WRITTEN DOWN — not left implicit.** VTS and paper are separate systems and must never be blended (Kyle, standing). Changing VTS mid-stream splits its series; leaving it means the two lanes price exits differently, which must then be a *stated* difference. | The scope names the choice and its consequence explicitly. ⚠️ **`#914` is the live precedent for what happens when a lane difference is real but unrecorded.** |
| **OBJ-6** | **The change is measurable after the fact.** `B-EXIT-PROVENANCE` now stamps the decision price, its producer and an independent witness on every close. | A before/after read on stamped rows is possible **on the active population**. ⛔ **NOT on VTS** — `#914`: VTS has no exit slippage to remove, so an F-G before/after measured there would show nothing and would read as "no effect". |
| **OBJ-7** | ⛔⛔ **THE PRICES WE SET MUST BE PRICES THE VENUE ACCEPTS — AND THIS OBJECTIVE SHIPS *FIRST*, because OBJ-1's whole improvement is INERT without it.** Kraken publishes a per-pair `tick_size`; **1,437 pairs, 11 distinct values, all powers of ten.** ⛔ **MEASURED 2026-08-27 on 406 closed crypto trades matched to their REAL published tick: entry 80.8% representable, STOP **2.7%**, TARGET **9.9%**.** Entries inherit validity from an observed print; **stops and targets are ATR-derived floats and are ~97% / ~90% prices that CANNOT EXIST on the venue.** ⇒ **`high > limit` is only "through by a tick" when `limit` is ON the grid. At 2.7% it is a PLACEBO — it would measure as a success and change nothing** (Langston's r2 catch, now quantified). ★ **Round at SIGNAL GENERATION, to NEAREST** (Kyle's call 2026-08-27). ⛔ **NOT to the unfavourable side: biasing the price re-writes the trade's RR and net-EV BEFORE the EV gate judges it. Pessimism belongs in the FILL MODEL, never in the price.** | ① Every `entry_price` / `stop_loss` / `take_profit` written for **crypto_spot** is an exact multiple of that pair's published `tick_size` — asserted on live rows, not on a helper's unit test. ② **xStock takes the DERIVED grid and the derivation is stated as a FLOOR, not a tick** — Kraken's public `AssetPairs` does NOT index xStocks at all (documented, `symbol-canonicalizer.ts` KNOWN_NONEXISTENT_NAMES, B-NEW-36 sub-batch (c)), so the venue's true tick is **UNKNOWABLE from any endpoint we have.** **MEASURED 2026-08-26, one full partition: prices are HARD-CAPPED at 4 decimals — 0 observations beyond, 445 of 476 symbols reaching 4dp, spanning $1.20–$2,993 with NO price-tiering.** A hard cap is the signature of a real grid; an arithmetic mean would not cap. ⛔ **BUT OBSERVED PRECISION IS A LOWER BOUND ON FINENESS, NEVER THE TICK** — a symbol showing 3dp may simply not have printed a 4dp value that day. ⇒ **round xStock to the COARSEST well-observed precision: guaranteed-valid even if the true tick is finer, at the cost of granularity. Rounding FINER than reality places invalid prices; rounding COARSER cannot.** ③ **Kyle's re-check, ACCEPTED AS A TAIL GUARD** — after rounding, re-assert the signal still clears its gates. **MEASURED against the RIGHT object (stop DISTANCE, not price): median shift 0.347%, p95 2.343%, WORST 12.96%; 62 of 406 move >1%, 3 move >5%.** ⚠️ **The first cut of this measurement used % OF PRICE (median 0.0056%) and read as unarguably negligible — the WRONG DENOMINATOR. Stop distance is what sets position size and RR.** The guard is justified by the TAIL, not the median — state that, do not oversell it. ④ ⛔ **A FENCE MUST FAIL ON AN OFF-GRID PRICE, mutation-proved** — not a helper test that rounds a literal. |
| **OBJ-7b** | ⛔⛔ **WHAT HAPPENS WHEN A ROUNDED SIGNAL NO LONGER CLEARS ITS GATES — Kyle's question 2026-08-27, and OBJ-7 was UNDERSPECIFIED without it.** ★ **TWO GENUINELY DIFFERENT FAILURES, and the second was missed until this question forced the census:** **(i) VENUE-IMPOSSIBLE** — rounding the QUANTITY to the venue's lot precision drops it below `ordermin`/`costmin`, so the order cannot be placed at all. ⚠️ **OBJ-7 r1 specified PRICE rounding only; the venue quantises SIZE too (`lot_decimals`, `ordermin`, `costmin`, all already retained on `AutoMappingEntry`). A rounded price on an unroundable quantity is still an invalid order.** **(ii) GATE-MARGINAL** — the order is placeable, but the changed geometry no longer clears our OWN min-RR / net-EV / sizing gate. ⇒ **BOTH REJECT. NO RE-ROUND.** ⛔ **Rounding to nearest is DETERMINISTIC — there is exactly one nearest valid price, so "round again" can only mean rounding the OTHER way, and choosing the direction that lets the trade through is SHOPPING FOR A PASS.** It is the same shape as setting a threshold after seeing the result — **the exact defect Langston holed `OBJ-0` on.** ★ **AND THE REJECTION IS NOT A LOSS: a signal that flips on a rounding-sized change was sitting INSIDE the rounding noise of its own gate boundary. It was never admissible — we could not see that because we were measuring against a price the market does not offer.** | ① **A rounding rejection is its own `reject_stage` in `signal_eval_archive` — NO new table.** ⛔ **Verified at the LIVE table, not the schema file:** it carries `reject_stage` (text) + `gate_decision`/`features` (jsonb) and is written at volume — **~7.0M rows in 3 days across BOTH classes**, stages `pre_filter` / `strategy_internal` / `sqe` / `tcl` / `admitted`. ⚠️ **`shared/schema.ts` does NOT declare this table and its `sqeRejectReason` at `:2142` belongs to `rtb_shadow_pairings`, NOT to the archive — reading the schema file for this table's shape returns the WRONG OBJECT.** ② **The two kinds are recorded SEPARATELY, never pooled** — they mean opposite things: many (i) ⇒ our sizing is too small for the venue; many (ii) ⇒ **our gates are tuned finer than the market's actual resolution, i.e. we have been admitting marginal trades on a precision that does not exist.** ③ Each row carries **the geometry BEFORE and AFTER rounding, which gate failed, and by how much** — so the question is re-askable without a re-run. ④ **A RATE is published: rounding rejections ÷ otherwise-admitted signals** (denominator measured: **2,037 admits in 3 days — 1,818 crypto / 219 xStock**). ⛔ **DO NOT pre-commit a threshold for what counts as "too many" — that is the volume-floor lesson. Record it, review after a stated N, then decide.** ⑤ ⛔ **A fence proves a rounding-rejected signal DOES NOT TRADE and IS recorded — mutation-proved.** A silent drop and a recorded reject are indistinguishable downstream, which is the `#568` absent-as-valid shape. |
| **OBJ-8** | ⛔⛔ **HOW WE DECIDE A SIMULATED EXIT FILLED — THE INSTRUMENT. This is the objective the batch was ORIGINALLY scoped around and it is still the hardest.** ⛔ **WE CAN NEVER PROVE A PAPER FILL — no counterparty exists.** ★ **Kyle's framing, and it is the one that makes the question answerable: that limit is GLOBAL to paper AND VTS, so it applies to every candidate equally and DOES NOT DISCRIMINATE between them. The question is which ESTIMATOR is least wrong, and whether it is LABELLED honestly.** ★ **INSTRUMENT = the 1-MINUTE OHLC BAR's `high`, plus `volume`/`trade_count`.** ⚠️ **This SUPERSEDES the ticker-archive instrument in §4/§4b** — Langston holed that on two counts, neither of which is lag: **① a PRINT is not a FILL** (`last >= P` proves the market traded there, not that WE did — no side, no size, no queue ⇒ **biases OPTIMISTIC, the same direction as the bug this batch exists to kill**); **② the ticker snap is DECIMATED, not lagged** — a point sample of a continuously-overwritten field, so a spike that reverts inside the interval leaves NO ROW. **They bias in OPPOSITE directions, so they do not net — they widen the error bar both ways.** An interval AGGREGATE cannot miss an intra-interval touch, which is exactly the point sample's failure mode. ★ **Langston VERIFIED the premise himself rather than taking it: the bars are VENUE-aggregated from Kraken's own OHLC channel (upsert last-wins on `EXCLUDED.high`), NOT built by us from ticker samples.** | ① **THROUGH, NOT TOUCH** — the named industry standard (TradingView `backtest_fill_limits_assumption`: *"simulates an order queue… your order doesn't have a good position in the book"*). ⛔ **DEPENDS ON `OBJ-7`: at 2.7% on-grid it is a PLACEBO** — see OBJ-7. ② ⛔ **NAME IT WHAT IT PROVES — `traded_through_at`, NEVER `fill_confirmed`.** Writing "filled" on trade-through evidence is `OBJ-2`'s own mislabelling in a new costume, inside the batch that exists to end it. ③ ⛔ **SHIP IT AS A DOCUMENTED CONSERVATIVE PROXY — Langston's ruling stands: through-not-touch NARROWS his objection (1), it does not CLOSE it.** Queue position is size-ahead-of-us vs size-traded-through, and *"N ticks through"* measures neither. **Do NOT let "industry standard" do the work of "measured."** ④ **RECORD THE VOLUME RATIO (bar notional ÷ our notional) — DO NOT THRESHOLD IT.** MEASURED, 195 matched crypto exits: **median 18.1× · p10 0.4× · p90 1001×.** ⚠️ **A $100k floor was proposed and WITHDRAWN — it was a number chosen only so as not to be zero.** Langston agrees to record-not-threshold **on ONE condition: a recorded number with no re-ask is a column nobody queries** ⇒ named owner + trigger. ★ **KYLE: the trigger is N TRADES, NOT A DATE.** ⑤ **POPULATION = PAPER ONLY, and this was CONFIRMED not assumed.** `vts-runner.ts:3752` states the shadow resolver reuses the SAME `evaluateTECExit` — **but VTS has NO FILL LAYER AT ALL (`#914`: 999/999 stops fill at exactly the stop price), and the shadow resolver has its OWN price fetch.** ⇒ **measuring fill realism on a population that assumes perfect fills would measure nothing.** ⚠️ **Shadows are LIVE despite a code comment saying they are dormant — 47,500 pairings, newest 2026-08-27.** ⑥ ⚠️ **CONSERVATIVE-DIRECTION DEFECT, NOTED AND DELIBERATELY NOT FIXED HERE:** the bar writer has no re-entrancy guard and overwrites `high` rather than taking `GREATEST`, so an out-of-order flush can bias a high DOWN ⇒ **fewer fills, never more.** Record it; do not widen this batch. |
| **OBJ-9** | ⛔⛔ **THE BAR WRITER IS SILENTLY DROPPING BATCHES — FIX IT HERE, ALL ASSET CLASSES (Kyle-directed 2026-08-27: *"if we are using the bars as our price, then we definitely need to include this drop fixed. I want that included in this batch, not postponed… We fix it now and for all of the asset classes."*).** **MEASURED across the FULL retained error logs (2026-08-14 → 08-27): 5,897 failed flushes, 962,386 rows dropped.** By class: **crypto_perp 5,889 · crypto_spot 6 · xstock_spot 2.** Sample: *"crypto_spot flush failed (13 rows dropped): deadlock detected"* — **a POSTGRES error, so this is OURS, not Kraken's.** **MECHANISM:** the buffer is spliced **BEFORE** the `try` (`ohlc-batch-writer.ts` ~`:100`/`:185`) ⇒ **on a throw the rows are already gone from memory and there is nothing left to retry with.** ⛔ **THIS IS `#705`, FILED 2026-08-20, AND I MIS-SIZED IT.** I argued the OHLC instance was the *recoverable* one — bars can be re-fetched — and treated it as the lesser half. **That argument dies the moment `OBJ-8` uses a bar to decide whether a trade filled: a missing bar is then a decision made WRONG AT THE TIME, permanently, not a gap to backfill.** ★ **The carry: a defect's severity is set by its CONSUMER, and #705's consumer changed.** | ① **Splice AFTER a successful write, not before** — a failed flush must leave the rows retryable. ② **Bounded retry + a bounded buffer**, so a persistent failure degrades loudly instead of growing without limit. ③ **ALL classes in one fix** — the writer is shared; a per-class fix would be the fork this batch's `OBJ-4` forbids elsewhere. ④ ⚠️ **STATED PLAINLY SO IT IS NOT OVERSOLD: this does NOT explain the missing exit minutes.** The two TRADED classes lost **8 batches in two weeks**; the 5,889 are `crypto_perp`, which we do not trade. **The bar instrument was sound before this fix and is sound after it** — OBJ-9 is a real defect found while validating OBJ-8's instrument, **not a repair the instrument depended on.** ⑤ ⚠️ **MY FIRST TEST OF THIS RETURNED ZERO AND WAS WRONG** — I grepped only the current `error.log` immediately after being told retention was ~14 days; the rotated files hold the population. **Fourth absence-claim reversal in one session. The instrument's REACH is stated in the fence, not assumed.** |

**CHANGE-CLASS: `architecture`.** It alters which price drives a live admission/exit decision on both asset classes — a risk-envelope edit, not telemetry.

**OUT OF SCOPE, each with its home:** the unread bid side of the OPEN depth gate → Roadmap 21.4 (Kyle deferred, 2026-08-27) · the `:1272` `ageMs` mislabel → `#913` · historical row correction → F1+F2 · the VTS fill model → `#914`.

## 6. OPEN QUESTIONS FOR LANGSTON — r3

⚠️ **The r1 list is kept below as SETTLED, not deleted — an open question that quietly vanishes is indistinguishable from one that was answered.**

### ✅ SETTLED SINCE r1 — do not re-litigate

1. **~~Does the exit DECISION move, or only the FILL?~~** **SETTLED: the DECISION moves.** Changing only the fill is already built — `tec-evaluator` clamps to the level and the engine depth-walks from there; the residual is trigger timing, which is the whole defect.
2. **~~Is the mid load-bearing where it should stay?~~** **SETTLED by Kyle:** anything that becomes a price we **TRANSACT** at — signal-time entry, stop, target, trigger — needs the transactable side. **Only charts and smoothed series keep a mid.** ⚠️ My r1 claim that *"the mid stays for signal generation"* was **WRONG**: a signal priced at a mid we can never pay is optimistic at birth.
3. **~~VTS: change it or leave it?~~** → now `OBJ-5`, and informed by `#914`: **VTS has no fill layer at all** (999/999 stops fill at exactly the stop price), so it is not a calibration surface for this.
4. **~~Sequencing against `F-E`?~~** **SETTLED: F-G adds a THIRD era**, so the boundary is stamped in F-G's completion report for F-E to key on. F-E needs no new trades — it grades the closed trades already in hand.

### ⛔ LIVE QUESTIONS — r3

**Q1 — `OBJ-7`, and it is the one that changes the batch's shape.** Does **2.7% of stops on-grid** close your r2 placebo objection the way I have read it — i.e. is grid rounding a **PREREQUISITE** for `OBJ-1` rather than a parallel improvement? **If you disagree, `OBJ-7` should not ship first and the ordering is wrong.**

**Q2 — rounding NEAREST vs the unfavourable side. The judgement I am least sure of.** My reasoning: biasing the price re-writes the trade's RR and net-EV **before the EV gate judges it**, so the gate would be judging a geometry we bent; pessimism belongs in the **fill model**, where it is explicit and measurable. **Is that right?**

**Q3 — `OBJ-7b`, and please attack the second half specifically.** Both failure kinds reject, no re-round, because choosing the rounding direction that lets a trade through is shopping for a pass. **The further claim: a signal that flips on a rounding-sized change was sitting INSIDE the rounding noise of its own gate boundary, so it was never admissible and rejecting it is not a loss. If THAT is wrong, the whole disposition is wrong.**

**Q4 — the xStock grid asymmetry.** Kraken publishes no xStock tick (documented, `#120`/B-NEW-36 — not re-opened), so we derive a **FLOOR** from observed precision and round to the **COARSEST** well-observed value. The argument is one-directional: **rounding coarser than the true tick still emits valid prices; rounding finer emits invalid ones.** **Does that hold, or is there a case where a coarser-than-tick price is itself rejected?**

**Q5 — `#917` sequencing.** I am deleting the orphaned `asset-capabilities` service **after** F-G closes, not inside it, so `OBJ-7` first establishes where the live grid is read from — your own §9.5(a-ii) shape. **Over-cautious? Folding it in would save a batch.**

**Q6 — `OBJ-8`④, your own condition.** You required an **owner and a trigger** for the recorded volume ratio. Owner is CC-C. **Kyle has ruled the trigger must be N TRADES, not a date — what N?** I am deliberately not choosing it myself after the volume-floor lesson.

**Q7 — `OBJ-9` scope discipline.** The flush fix is Kyle-directed into this batch. **I have stated in the objective that it does NOT explain the missing exit minutes and that the instrument was sound without it.** Is that the honest framing, or am I under-claiming a real dependency?

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
