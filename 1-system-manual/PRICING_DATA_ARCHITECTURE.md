# PRICING DATA ARCHITECTURE — what we collect, what we use it for, and what we should use instead

> **⛔ STATUS: IN PROGRESS. PART 1 IS VERIFIED (with one same-day correction, recorded in place); PART 2 IS STARTED; PARTS 3-6 ARE FRAMED AND NOT YET FILLED.**
> **Owner: CC-C, co-authored with Langston. Reviewed afterwards by the ChatGPT Codex reviewer.**
> **Created 2026-09-07 on Kyle's directive.**

---

## 0. WHY THIS DOCUMENT EXISTS — KYLE'S FRAMING, RECORDED BECAUSE IT IS THE BAR

> *"We are just fixing pieces and then sometimes going back and looking at that piece and saying, no, this is not the right thing to do — forgetting that we have just updated it. We're not getting to a final design state that is the best possible setup for our system."*

⛔⛔ **AND THE TRUST CONDITION, WHICH IS THE REASON FOR THE EVIDENCE RULE BELOW:**
> *"I can't trust what you're telling me because I'm ready for you to retract it two messages from now saying, oh, I made a mistake, and this is actually what's happening."*

★ **THE PURPOSE, in Kyle's words:** signals must be generated with **the best possible price data**, and simulated entries and exits — target *and* stop — must use **the best possible price for the most realistic simulation comparable to live mode.**

### ⛔ THE EVIDENCE RULE FOR THIS DOCUMENT — NON-NEGOTIABLE
**Every factual claim here carries the command or the `file:line` that establishes it, verified in CODE or RUNTIME LOGS on the date stated.** ⛔ **Nothing is carried over from an older document, a headline, or recollection.** Where something is not verified, it says **`NOT YET VERIFIED`** and is not asserted. Where a number is a measurement, it names its object, its population and its instrument's reach.
⚠️ **A claim without its citation is a defect in this document, not a detail.**

---

## 1. ✅ WHAT WE COLLECT — THE THREE FEEDS, VERIFIED 2026-09-07

**Kraken offers three price-bearing channels that we take. This is what each carries, read from our own parsers.**

| feed | what it carries | granularity | our parser |
|---|---|---|---|
| **`ticker`** | **best bid · best ask · the SIZE at each of those two prices** (`bid_qty`, `ask_qty`) · last traded price · 24 h volume, vwap, high, low, open | top of book ONLY — nothing behind the best price | `crypto-spot-archiver.ts` `parseTickerSnap` |
| **`book`** | **ten levels of depth on each side** — price + quantity per level | the queue behind the best price | `kraken-websocket-adapter.ts` `handleV2BookUpdate` |
| **`ohlc`** | open · high · low · close · volume · vwap · trade count, per **1-minute** interval, **carrying the venue's own `interval_begin`** | one bar per minute | `crypto-spot-archiver.ts` `parseOhlcBar` |

★ **THE TICKER CARRIES SIZE AT THE TOUCH, WHICH IS EASY TO MISS AND MATTERS:** `bid_qty` and `ask_qty` are parsed and stored. **So the ticker is not price-without-size — it is price-with-size-at-the-touch-only.** The book's contribution is the *queue behind* the touch, not the existence of size.

### ✅ 1.1 THE SUBSCRIPTION MAP — WHO SUBSCRIBES TO WHAT
**Verified by enumerating every `method: 'subscribe'` in `server/`, tests excluded (9 sites, 4 files).**

| component | `ticker` | `book` | `ohlc` | `instrument` |
|---|---|---|---|---|
| **`kraken-websocket-adapter.ts`** — THE LIVE TRADING PATH | ✅ `:1430` (snapshot) | ✅ `:1446` **depth 10** (+ a depth-1 switch at `:2642`) | ⛔ **NO** | ✅ `:1440` |
| **`crypto-spot-archiver.ts`** — THE DURABLE ARCHIVE | ✅ `:177` | ⛔ **NO** | ✅ `:173` interval 1 | — |
| **`equity-spot-archiver.ts`** — THE DURABLE ARCHIVE (xStock) | ✅ `:288` | ⛔ **NO** | ✅ `:284` interval 1 | — |
| **`xstock-universe-discoverer.ts`** | ✅ `:206` | — | — | — |

⇒ ⛔⛔ **THE STRUCTURAL FACT THIS TABLE ESTABLISHES, AND IT IS THE ONE TO CARRY INTO EVERY LATER SECTION:**
- **THE LIVE TRADING PATH SUBSCRIBES TO `ticker` + `book`, AND NEVER TO `ohlc`.**
- **THE DURABLE ARCHIVE SUBSCRIBES TO `ticker` + `ohlc`, AND NEVER TO `book`.**
⇒ ★ **WHAT WE STORE IS NOT WHAT WE TRADE ON, AND WHAT WE TRADE ON IS NOT STORED.** The order book exists only in memory, only while the process runs, and only for the symbols it is subscribed for; the candles are archived and never reach anything that trades.

⚠️ **ON THE DEPTH-1 SUBSCRIPTION (`:2642`): it does NOT produce a 1-level book.** The code's own comment records that **Kraken REJECTS `depth: 1`** (*"Subscription depth not supported"*) so the depth-10 stream keeps flowing, and depth is recorded from the subscribe **ACK** (`result.depth`) — what Kraken GRANTED, not what we asked for. ⇒ **in practice there is ONE book depth: 10.**

### ⛔ 1.2 THE CANDLES — AND THE TWO ASSET CLASSES DO **OPPOSITE** THINGS WITH THEM

⚠️⚠️ **THIS SECTION FIRST SAID *"NOTHING IN THE LIVE TRADING PATH READS THE STORED CANDLES."* THAT WAS WRONG FOR xSTOCK AND IS CORRECTED HERE THE SAME DAY.** I grepped the **crypto** table only and generalised to both classes — a wrong-object of exactly the kind this document's evidence rule exists to stop. ★ **It was caught by the historical read Kyle directed**, which recorded that the xStock bars are *"locally aggregated from `xstock_spot_ohlc_1m` because Kraken has no equities REST API."*

| | crypto_spot | xstock_spot |
|---|---|---|
| **where 60-min bars come from** | **Kraken REST, on demand** — `services/ohlc-cache.ts:103` → `krakenService.getOHLCData`, 5-min TTL | **the STORED 1-minute WS archive**, rolled up — `xstock_spot/ohlc-aggregator.ts` → `services/xstock-ohlc-cache.ts` |
| **is the stored WS candle archive read live?** | ⛔ **NO** — only production consumer is `scripts/b70-b62-relabel-runner.ts`, an **offline re-labelling script** | ✅ **YES — IT IS THE ONLY SOURCE** |
| **why** | Kraken publishes a REST OHLC endpoint for crypto | ⛔ **Kraken has NO equities REST API**, so the archive is the only history that exists |

⇒ ★★ **THE SAME FEED HAS OPPOSITE STATUS IN THE TWO CLASSES: for crypto the WS candle archive is write-only; for xStock it is load-bearing.** Both converge at `core/metrics/regime-inputs.ts:141-149`, which branches on asset class and hands 60-minute bars to regime detection either way.
⇒ ⛔ **ANY STATEMENT ABOUT "THE CANDLES" THAT DOES NOT NAME THE ASSET CLASS IS WRONG ABOUT ONE OF THEM.** This is why Kyle required the document be cut by asset class, and the requirement had already earned itself before Part 2 was written.

### ⭐ 1.3 WHAT IS MISSING FROM WHAT WE COLLECT
| gap | status |
|---|---|
| **The venue's own timestamp on the TICKER** | ⛔ **The archive stamps `capturedAt: new Date()` — OUR clock.** Kraken sends `timestamp` on the ticker frame and we did not read it. **Now captured on the LIVE path** (deployed 2026-09-06) and **measured present on 100% of frames**; ⛔ **the ARCHIVE side still stamps our clock and needs a migration.** |
| **The venue's own timestamp on the BOOK** | Sent per MESSAGE (not per price level — a venue fact, not a parsing gap). Captured on the live path; **not archived, because the book is not archived at all.** |
| **The venue's own timestamp on OHLC** | ✅ **ALREADY CORRECT** — `parseOhlcBar` stores `intervalBegin` from the venue's `interval_begin`. **The one feed that always got this right.** |
| **Any durable record of the order book** | ⛔ **NONE.** No table, no archiver, no retention policy. |

### ✅ 1.4 DO THE TICKER AND THE ORDER BOOK AGREE? — MEASURED 2026-09-07, THE COMPARISON KYLE ASKED FOR

⛔ **IT COULD ONLY BE TAKEN IN-PROCESS: the book is never persisted, so no pair of stored rows exists to compare.** Both feeds read at the same instant at the level-construction site, deployed `17a102477`. Three reads, growing sample; the largest is reported and the smaller two agree with it.

| | crypto_spot, n = 3,427 level evaluations |
|---|---|
| **both feeds present** | **232 — 6.8%** |
| **ticker present, NO book** | **3,195 — 93.2%** |
| book present, no ticker | **0** |
| neither | 0 |

**WHERE BOTH EXIST, THEY AGREE ALMOST EXACTLY:**
| | result |
|---|---|
| ⛔ **CROSSED against each other** (ticker bid ≥ book ask, or ticker ask ≤ book bid) | ✅ **0** |
| **exact match, both sides** | **231 of 232 — 99.6%** |
| the single disagreement | bid **2.41 bp**, ask **1.79 bp** |
| max difference observed | **2.41 bp** |


⛔⛔ **BLOCKER, ADDED 2026-09-07 AFTER THE ABOVE WAS WRITTEN — THE CONCLUSION IMMEDIATELY BELOW IS WITHDRAWN. THIS COMPARISON IS, AT LEAST IN PART, THE BOOK COMPARED AGAINST ITSELF.** *(Langston, traced at the object; the mechanism is his, the instrument was mine.)*
**The "ticker" arm of this instrument does NOT read the ticker feed. It reads `_agCache?.bid/.ask` (`signal-orchestrator.ts:2609-2610`) — the SHARED CACHE.** And **`kraken-websocket-adapter.ts:1093-1096` emits `bid: bestBid, ask: bestAsk` — the SAME top-of-book values the book arm reads — which flow through `live-pricing-adapter.ts:1095` into exactly those cache fields.**
⇒ ★★ **231 of 232 EXACT between two INDEPENDENT feeds would be remarkable. Between a STORE AND ITS OWN WRITER it is FORCED.** The REST full-ticker writer also sets those sides, so **the sample is a mixture of the two writers in an unknown proportion, and the instrument records nothing that separates them.**
⇒ ⛔ **THEREFORE WITHDRAWN: *"the ticker's two sides ARE the book's two sides."* It is unsupported by its own instrument.**
⇒ ⛔ **AND `bookOnly = 0` FOLLOWS FROM THE WRITE PATH, NOT FROM COVERAGE** — an over-determined zero, inside the very document that made that rule.
✅ **WHAT SURVIVES UNTOUCHED: THE COVERAGE FACT.** A book exists on **6.8%** of level evaluations and the ticker-fed cache has a price on **100%** of them. **That is a subscription fact (§1.5), independent of which writer filled the fields**, and it is the finding this section is actually carrying.
✅ **CHEAP FIX, and it is the right one: carry `producer`/`source` onto `FeedAgreementSample` and re-run, so the two writers can be told apart.** **DISPOSITION: added as an item to `B-PRICE-SIDE-BY-JOB` (row `3n`).**

⇒ ✅ **NO INVERSION, NO MATERIAL DISAGREEMENT.** On the population where the comparison is possible, the ticker's two sides ARE the book's two sides.

⇒ ⛔⛔ **AND THE PRE-REGISTERED READING HOLDS: THIS IS *INCONCLUSIVE*, NOT A LICENCE — and the measurement now says exactly how narrow it is.** The check was possible on **6.8%** of evaluations, and those are by construction the hot names, which is where the two would agree anyway. **It says nothing about the 93.2%.**

★★ **THE 93.2% IS THE ACTUAL FINDING, AND IT IS A COVERAGE FACT, NOT AN AGREEMENT FACT:**
- **A level built from the ORDER BOOK would have no price at all on 93.2% of evaluations.**
- **A level built from the TICKER has a price on 100% of them — and on 93.2% there is no second feed to check it against.**
- ★ **`bookOnly = 0`: there is never a book without a ticker. The book's coverage is a STRICT SUBSET of the ticker's.**

⚠️ **WHAT THIS DOES NOT SETTLE:** it compares the two feeds' *top-of-book prices*. **It says nothing about DEPTH** — the book's ten levels have no ticker counterpart beyond `bid_qty`/`ask_qty` at the touch — and nothing about whether either is fresh (§5).

---

### ✅✅ 1.5 WHY THE BOOK IS ABSENT ON 93% — **IT IS NEVER SUBSCRIBED, NOT POLLED-AND-MISSED** *(Kyle's question, traced 2026-09-07)*

**Kyle asked the exact right question about §1.4: is the book missing because we do not subscribe to it, or because we ask and fail?** ⇒ ⭐ **NEITHER OF MY EARLIER FRAMINGS. WE NEVER SUBSCRIBE, AND HIS RECOLLECTION — *"it's only the signals that are open as trades"* — IS CORRECT.**

**THE TRACE, end to end, all at the object:**
1. `kraken-websocket-adapter.ts:1443-1450` — **`ticker` and `book` are subscribed with the SAME `krakenSymbols` list, on the same socket, in the same call.** ⇒ **the book is never the narrower of the two; whatever the ticker gets on the WS, the book gets.**
2. **The only public entry point is `subscribeToSymbols` (`:1380`)** — one method, and its only EXTERNAL caller is a manual diagnostic endpoint (`routes.ts:10131`). Live coverage is therefore set from INSIDE the adapter.
3. The two bulk internal drivers are **`i8cSubscribeAllOpenPositions` (`:2854`)** and **`i8cResubscribeAllOpenPositions` (`:2892`)** — both read `this.i8cOpenPositionsProvider()`.
4. ⭐ **That provider is registered at `active-execution-engine.ts:626` and it returns `storage.getActiveOpenPositions(mode)`, filtered to `crypto_spot`.**

⇒ ⛔⛔ **THE WEBSOCKET SUBSCRIPTION SET IS *OPEN POSITIONS*. Not the scan universe, not the ready-to-buy pool, not the candidates being ranked.** Every other symbol's ticker arrives via **REST polling**, and **REST has no order-book equivalent in our code at all.**
⇒ ★★ **SO THE 93% IS ARITHMETIC, NOT FAILURE: a symbol we do not hold has a REST ticker and cannot have a book, because nothing ever asked for one.**


⚠⚠ **QUALIFIED 2026-09-07 — THIS IS A CLAIM ABOUT *OUR BOOKKEEPING*, NOT ABOUT THE VENUE'S STATE.** *(Langston, D2.)*
**`unsubscribeFromSymbols:1480` sends `channel: 'ticker'` ONLY — the code says so itself at `:3542`.** ⇒ **`clearAllSubscriptions:2024` leaves BOOK streams live at Kraken while clearing our local state, and `refreshChannel:3212` re-issues a book subscribe with no cancel.**
⇒ ★ **THE DIVERGENCE CAN ONLY RUN ONE WAY: THE VENUE MAY BE SENDING US MORE THAN WE THINK.** Nothing here can make coverage narrower than stated — only wider.
⛔ **AND IT PUTS §5.2's DENOMINATOR IN QUESTION:** the ≈37 book frames/sec/symbol is divided by **6**, our believed subscription count. **If the venue is streaming books we no longer track, the true per-symbol rate is LOWER and §5.3's 4,400 inherits the error.**
**HOME: `B-WS-UNSUB-CHANNEL-PARITY`, owner CC-C, placed in `PHASE_19_PLAN` after row `3n`.** ⛔ **It GATES any book-widening decision** — we should not widen a subscription set we cannot reliably narrow.

### ⇒ THE CONSEQUENCE, AND IT IS THE MOST IMPORTANT LINE IN PART 1
⛔⛔ **THE ORDER BOOK COVERS ONLY WHAT WE ALREADY HOLD, SO IT STRUCTURALLY CANNOT INFORM WHAT WE ARE CHOOSING BETWEEN.** Signal generation, ranking and promotion all act on symbols we do NOT yet hold — **by construction the book is absent for every one of them.** ⇒ **any design that puts the book under signal-time level-setting is not a tuning change; it requires changing what we subscribe to.**
⚠️ **AND THE SAME NARROWNESS APPLIES TO THE WS TICKER** — it shares the list. The broad ticker coverage we do have is REST-polled, which is why §1.1's cadence findings and this section are the same fact seen from two ends.

⚠️ **NOT ESTABLISHED HERE: whether subscribing the book more widely is affordable** (connection limits, rate limits, message volume). That is §5's question and no claim is made about it yet.

---

---

## 2. ✅ THE HISTORY — WHAT EACH FEED WAS ORIGINALLY FOR **(BOTH ASSET CLASSES, VERIFIED 2026-09-07)**

> ⛔ **KYLE'S REASON FOR THIS SECTION, AND IT IS NOT DECORATION:** *"so that we could understand intent, and then show how that intent is no longer relevant in the system that we want to build… that's why we need to change this or improve on that."*
> ★ **IT HAS ALREADY PAID FOR ITSELF: the passage quoted below is what caught the wrong claim now corrected in §1.2.**
> **Sources: `bridge/canonical/` (the pre-governance corpus), the old batch and directive reports, and the phase implementation histories.** ⚠️ **The canonical corpus records what we INTENDED to build then. It is NEVER current-state truth — `DawnTrader_System_Architecture_Execution_Flow.md` names `server/core/cache/ohlc-cache.ts`, a path that no longer exists.**

### ✅ THE ORIGINAL DESIGN — `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md`
**The MARKET DATA LAYER had four boxes: Kraken REST (OHLC, Ticker) · Kraken WebSocket (Real-time Ticks) · Binance/CoinGecko (Fallback) · OHLC Cache (721 candles).**
⇒ ⛔⛔ **THERE IS NO ORDER BOOK IN THE ORIGINAL ARCHITECTURE AT ALL.** The WebSocket adapter's own description is *"Real-time ticker subscriptions"* — nothing else. **The book was added later; the system was designed as candles-for-analysis plus ticker-for-current-price.**

**What each feed was FOR, in the original design:**
| feed | original purpose, verbatim |
|---|---|
| **OHLC** | *"Used for IMF calculations and regime detection"* — 721 candles at **60-minute** intervals, *"1-hour candles = ~30 days of swing-tradable history"* |
| **ticker (WS)** | *"Real-time ticks"* — the current price |
| **book** | ⛔ **ABSENT** |

★ **AND THE SCAN LOOP'S ORIGINAL SHAPE:** *"Fetch OHLC history (721 candles) → Calculate indicators → Determine market regime → Check macro-state → Select compatible strategies."* **Candles drove analysis; the ticker supplied the live price.**

### ✅✅ THE OPEN-TRADE PRICE PATH — **KYLE'S MEMORY IS CORRECT IN FULL, AND MY FIRST ANSWER WAS ABOUT THE WRONG MECHANISM**

⛔ **I was asked whether a REST-too-weak → subscribe-to-WebSocket mechanism exists and still runs. I found the hardcoded four-symbol `prefer_book` hint list, reported it as the answer, and it is NOT the mechanism.** Kyle pushed back with a specific observation — *"I could see whether a trade was being updated based on REST or on the WebSocket, and it was happening back and forth for many pairs"* — and he is right on every point.

**THE ACTUAL MECHANISM, THREE PARTS, ALL LIVE:**

**(1) THE PER-TICK RESOLUTION CHAIN — `active-execution-engine.ts:1478-1520`, stated in the code's own words:**
> `kraken_ws → kraken_rest → SKIP-THIS-TICK`

Each open position, each cycle: try the WS cache (freshness window 2,000 ms, venue-source predicate) ⇒ `withWsPrice++` and `[I7-WS-D][ENGINE_WS_PRICE]`. Otherwise a **direct Kraken REST ticker call** ⇒ `[I7][REST_FALLBACK]` and `withRestPrice++`. Otherwise the position is **skipped this tick**, with a consecutive-skip escalation rail. ⇒ ★ **THIS IS THE PER-PAIR BACK-AND-FORTH KYLE WATCHED IN THE OPEN-TRADES TABLE.**

**(2) THE SUBSCRIPTION AUDIT — `i8cRunSubscriptionAudit`, every 5,000 ms (`I8C_AUDIT_INTERVAL_MS`).** For every open position it checks subscription state AND tick age, and **resubscribes on either failure**:
- `!isSubscribed` ⇒ `[I8C-AUDIT][FIX] reason=missing_subscription` ⇒ resubscribe
- `isStale` ⇒ resubscribe. ⭐ **`I8C_STALE_THRESHOLD_MS = 30000`.**
- ⭐ **AND THE TUNING IS THE PART THAT CONFIRMS THE INTENT — `Phase 8.8.3-I8E`, verbatim:** *"Only truly stale (>30s) should trigger resubscription. Low-volume pairs (5-25s without tick) are expected and should NOT resubscribe."* **A quiet pair is deliberately distinguished from a broken one.**

⇒ ★★ **THAT IS EXACTLY KYLE'S DESCRIPTION: not enough pricing updates arriving ⇒ resubscribe to the WebSocket.** It is not a hint list; it is a live 5-second health loop over open positions.

**(3) LIVE STATE, MEASURED 2026-09-07 11:47Z:** `[I8C-AUDIT][SUMMARY] total_positions=6 subscribed=6 low_volume=0 missing=0 stale=0`, firing every 5 s. **`ENGINE_WS_PRICE` 19,842 · `REST_FALLBACK` 0 · audit `FIX` events 0.**
⇒ **The mechanism is not absent — it is healthy and therefore idle.** The fallback exists and is currently never needed for the 6 held positions.

### ⛔⛔ AND THIS RECONCILES THE APPARENT CONTRADICTION WITH §1.5 — TWO POPULATIONS, TWO ANSWERS
| population | how it is priced | evidence |
|---|---|---|
| **the 6 OPEN POSITIONS** | ⭐ **100% WebSocket**, audited every 5 s, **zero REST fallbacks** | `ENGINE_WS_PRICE` 19,842 vs `REST_FALLBACK` 0 |
| **the shared price cache** | ⭐ **~96% REST-sourced** | **OBJECT:** `lastSource` on each `CachedPrice` entry — *the source of that entry's most recent WRITE*, not a share of traffic. **POPULATION:** every entry resident in the cache at one instant, 2026-09-07, n=217 — **209 `kraken_rest` vs 8 `kraken_ws`**. ⚠️ **A SNAPSHOT, single-moment, NOT decision-grade** (rule 13); the earlier read was n=170 (161/9). ⛔ **It excludes symbols never cached at all, and says nothing about read frequency.** |
⇒ ⛔ **MY EARLIER "93% REST-SOURCED" WAS NUMERICALLY RIGHT AND MISLEADING ABOUT THE OPEN-TRADE PATH, WHICH IS THE PATH THE QUESTION WAS ABOUT.** The broad cache is REST because those symbols are **never WS-subscribed at all** (§1.5); the held positions are WS because they **are** subscribed, and audited into staying so.
★ **Kyle observed the back-and-forth BEFORE Phase 8 closed — which is precisely why `I8C` ("subscription reliability") was built. The behaviour he remembers was the problem; the audit is the fix; the fix is working, so the fallback no longer fires.**

⚠️ **AND IT REVISES A CITATION OF MINE ELSEWHERE:** `B-EXIT-BOOK-AGE-STAMP`'s V4 cited `withRestPrice=0` as the reason the REST-fallback producer cannot appear on a close. **The zero is real but its CAUSE is a healthy WS subscription, not a dead code path** — a distinction that matters if subscriptions ever degrade.


### ✅✅ THE ARCHIVE'S ORIGINAL INTENT — **IT WAS BUILT TO BE WRITE-ONLY, AND SAYS SO IN ITS OWN INTRODUCING COMMIT**

⛔ **Everything above this point is CRYPTO history. The document is required to be cut by asset class, and §1.2's error was caused by exactly that omission — so the archive and the xStock side get their own provenance here.**

**`ce4a7e408`, 2026-05-01, "B74: Passive OHLC + ticker archive pipeline (Equity + Crypto)" — quoted verbatim, not summarised:**
> *"Continuous 1-min OHLC + ticker-snapshot capture across three asset universes, persisted to month-partitioned dump tables for B70 archival takeover later. **NO signal-pipeline impact, NO admission gates, NO consumers in v1 — pure passive accumulation.**"*

⇒ ★★ **THE CRYPTO ARCHIVE BEING WRITE-ONLY IS NOT NEGLECT AND NOT DRIFT — IT IS THE DESIGN, DISCHARGED EXACTLY AS WRITTEN.** ⛔ **This is `rule 24` outcome (2), not outcome (1): the system is doing what it was built to do. What is missing is a DECISION about whether that is still what we want — which is a scope call, never a unilateral fix.**

⭐ **AND THE UNIVERSE SIZE WAS SPECIFIED IN ADVANCE, IN THAT SAME COMMIT:** *"crypto_spot — USD/USDT/USDC pairs ≥ $10k 24h volume **(~400-600)**"*. ⇒ **today's 388-469 range (§5b.1) sits inside the band the design predicted four months ago.** ★ **The number nobody could explain this morning was written down before it was ever measured.**

⚠️ **ONE FEED IN THAT ORIGINAL SET IS NOW ABSENT FROM THIS DOCUMENT ENTIRELY:** the commit names **three** universes — `equity_spot`, `crypto_spot`, and **`equity_perp` — 10 `PF_*XUSD` perpetuals via the Kraken Futures WebSocket.** **Perpetuals are not in §1's feed table, are not in the subscription map, and play no part in any pricing path described here.** ⇒ **DISPOSITION: recorded as an open question for Part 6, not a finding** — whether that universe is still captured, and whether it should be, is a target-state question and neither of us has established its current state.

### ✅✅ WHY THE TWO ASSET CLASSES DIVERGED — **A VENUE FACT, STATED IN THE CODE'S OWN WORDS**

**`server/asset_classes/xstock_spot/ohlc-aggregator.ts`, header, verbatim:**
> *"mirroring crypto's `ohlcCache` consumer pattern but **sourcing from local DB instead of Kraken REST (because Kraken has no public equities REST endpoint** — see BATCH_79_0k investigation + B-NEW-34 design ask Round 2 §0)."*

⇒ ★★ **THE ASYMMETRY IN §1.2 IS NOT AN INCONSISTENCY WE DRIFTED INTO. IT IS THE ONLY AVAILABLE ANSWER TO A VENUE CONSTRAINT.** Kraken publishes a REST OHLC endpoint for crypto and none for equities ⇒ crypto pulls history on demand; **xStock has no history except the one we captured ourselves.**
⇒ ⛔⛔ **AND THAT IS WHY THE SAME ARCHIVE HAS OPPOSITE STATUS IN THE TWO CLASSES: for crypto it remains the write-only store B74 designed; for xStock it was PROMOTED to load-bearing by B-NEW-34, because nothing else exists.** ★ **The promotion is a real departure from the original intent — a deliberate, reviewed one, and the kind of change this history section exists to make visible.**

⚠️ **THE CONSEQUENCE FOR RELIABILITY, WHICH FOLLOWS DIRECTLY AND IS NOT COMFORTABLE:** ⛔ **for xStock, a gap in our own capture is a permanent hole in the record — there is no endpoint to backfill from.** For crypto the same gap is recoverable with a REST call. ⇒ **the two classes have different worst cases from the same failure, and only one of them is repairable.**

★ **THE RENAME THAT HIDES THIS HISTORY FROM A NAIVE SEARCH:** these tables were `equity_*` until **`aca52acdc`, 2026-05-10 (B79.0e)**, which renamed 4 parents, 52 partitions and 112 indexes to `xstock_*`. ⛔ **A provenance search on today's name returns NOTHING written before that date** — the former-filename rule, and it is why B74's own origin was nearly missed here.


### ⛔ A DEAD MECHANISM THAT SHOULD BE STRIPPED OUT — kept SHORT deliberately

**`Phase 8.8.3-I7-WS-G (G3)`, `kraken-websocket-adapter.ts:316-318` + `:2602-2611`.** A ticker→book channel switch *"for low-liquidity pairs"*, driven by a **hardcoded list of four symbols**, with a companion `low_liquidity` list of seven that nothing reads.

⛔ **IT CANNOT FIRE. The predicate tests a SLASHED canonical symbol against a DE-SLASHED hint** — `'TIA/USD'.includes('TIAUSD')` is `false`, permanently *(Langston, verified at the object)*. It is also unreachable for two further reasons: the four are not subscribed, and none is held.
⇒ ⛔⛔ **AND THAT IS EXACTLY WHY `CHANNEL_SWITCH = 0` PROVES NOTHING — three independent sufficient causes. STANDING RULE FOR THIS DOCUMENT: an over-determined zero is not evidence for any one of its causes; cite the mechanism.**

★ **HISTORICAL VALUE, WHICH IS THE ONLY REASON IT IS HERE:** it is a **third independent artefact** of one design intent — alongside the architecture's *"book: BBO updates, continuous for illiquid pairs"* and the trade-triggered ticker (§2). **The system knew the ticker goes quote-blind on cold names and built a compensation three times over. All three are inert.**

⇒ **DISPOSITION: `rule 18` / `§15` — delete through the workflow with a blast-radius check and a `DELETED_COMPONENTS_LOG` entry. It rides with whatever the `event_trigger` decision yields; NOT its own batch.**

### ⏳ STILL TO READ
The old batch and directive reports from before the 2026-01/02 governance change; `Phase_8/9/10/11_Implementation_History.md`; the batch reports that introduced the order book and the midpoint. **STATUS: IN PROGRESS — nothing further asserted yet.**

---

## 3. ✅ WHERE WE USE PRICING — EVERY READ SITE, BY JOB × LANE × ASSET CLASS **(LANGSTON, VERIFIED AT `54533d0a`)**

> **Author: Langston. Written 2026-09-07 for `1-system-manual/PRICING_DATA_ARCHITECTURE.md` §3. Drop in verbatim; CC-C owns the commit.**
>
> ⛔ **EVERY CLAIM BELOW WAS RE-DERIVED BY ME AT THE GRADED REF `54533d0a99b643e61f97f4c730252e869e6421bc`, IN THE CODE, TODAY. Nothing here is `RULED ON REPORTED FACT`** — where I lean on a measurement of CC-C's rather than a code read, the row says so and names it.
>
> ⚠️ **ONE INSTRUMENT HAZARD, STATED BECAUSE IT BIT ME MID-AUDIT:** `dt-review grep` pulls the branch head, and during this audit the head moved to `8965fc036`. Two of my greps returned line numbers stamped at that newer sha. **Every line number printed in this section was re-pinned by `curl`-ing the file at `54533d0a` and grepping the downloaded copy** — none is carried over from a `dt-review` result. A reader at a later ref must expect drift and re-pin; the existing `SYSTEM_MANUAL.md:642` citation of `signal-orchestrator.ts:2387` is already 17 lines stale and is corrected below.

---

## 3.0 THE AXES — AND ONE OF THE THREE IS NOT WHAT THE FRAMING ASSUMED

Kyle asked for the cut by **job × lane × asset class**. Two of those axes are real and load-bearing. The third needs a correction before the table can be read honestly.

### ⛔⛔ THE `live` LANE DOES NOT EXIST AS A PRICE-CONSUMPTION PATH. IT IS A MODE LABEL ON THE ACTIVE PATH, WITH NO SEPARATE CODE.
**Measured, whole-file, at the ref:** `active-execution-engine.ts` contains **exactly three** occurrences of a live-mode test — `:1886` (a config key name, `enabled_live` vs `enabled_paper`), `:2007` and `:2075` (a `callerMode` string stamped onto telemetry). **There is no live branch in the price-resolution chain, the fill, the mark or the booking.** And the port that would carry one is unimplemented: `server/services/execution/order-placer.ts` is 123 lines and defines **`PaperOrderPlacer` only** — its own header calls the live implementation *"the live-swap seam"*, i.e. a seam, not a limb.

⇒ ★ **THE LANE AXIS IS THEREFORE `VTS` vs `ACTIVE`, and `paper` / `live` is a MODE flag riding on the active lane.** Every "paper" row below is *also* the live row as the code stands today, and the only thing Phase 21 changes is the **destination of the order**, not the price the decision was made on.
⇒ ⛔ **THIS IS A FINDING, NOT A CAVEAT.** The whole premise of paper mode is sim-to-live parity. Parity is currently trivially satisfied on the pricing axis because there is only one implementation — **but that also means no design decision in this document has ever been tested against a second consumer, and the first time a live arm is written it will be written against whatever §3 describes.** That is an argument for settling §6 *before* the live arm exists, not after.

⚠️ **The columns are still printed as `VTS` / `paper (active)` / `live` below**, because the *table* is the deliverable Kyle asked for and a missing column reads as an oversight. The `live` column says `— same code` wherever that is the verified answer, which is everywhere.

### THE JOBS, AS THE CODE ACTUALLY SEPARATES THEM
Kyle's list was: signal generation · ranking · entry trigger · exit trigger (stop and target separately) · fill simulation · position marking · booking · sizing · the scanner sweep. **Two of those turn out not to be independent price consumers, and saying so is more useful than inventing rows for them:**
- ⭐ **SIZING READS NO PRICE FEED AT ALL.** `active-position-sizing.ts:137` destructures `{ portfolioValue, guardrails, entryPrice, stopPrice, … }` and every downstream arithmetic (`:156` stop distance, `:229` quantity, `:236` notional) is expressed in those two **levels** plus the portfolio value. **Sizing inherits whatever basis the levels carry and adds no basis of its own.** ⇒ any error in the level's basis is multiplied by the position, never corrected by it.
- ⭐ **STOP AND TARGET ARE NOT SEPARATE PRICE CONSUMERS AT THE TRIGGER.** Both are compared against **one** mark, resolved once per position per tick, well above the comparison. Splitting the row would imply a choice that is not in the code. **They ARE separate at BIRTH** (§3.1 row 1) **and at BOOKING** (row 7), and that is where the split is drawn.

---

## 3.1 ⛔ THE MASTER TABLE — WHICH PRICE EACH JOB READS, AND WHAT THAT PRICE ACTUALLY IS

**Legend for the BASIS column, and the distinction is the whole point of the section:**
`MID` = a midpoint of two sides · `PRINT` = a price the venue reports as traded · `BAR` = a venue-published candle close · `WALK` = a size-weighted walk of a real depth ladder · `LEVEL` = not a market read at all, but a number this system wrote earlier.

### ROW 1 — SIGNAL GENERATION (where entry, stop and target are SET)

| lane | crypto_spot | xstock_spot |
|---|---|---|
| **VTS** | `vts-runner.ts:1429` `mce.computeContext(symbol, ohlcData, priceData.price, …)` — **the RAW cache price, NOT smoothed** — read back at `:1595` as `mceContext.indicators.currentPrice` into the detect indicators. **BASIS: RAW MID (mixture — see §3.2 F1).** | `scanner.ts:910` `const price = latestBar.close` → threaded as `lastPrice` into `evaluateXstockPairForVTS` (`eval-cycle.ts:304`), which hands it to the global filter (`:346`), the pattern filter (`:349`) and MCE (`:381`). **BASIS: BAR — the close of the most recent locally-aggregated 60-minute bar.** |
| **paper (active)** | `signal-orchestrator.ts:2404` `priceCache.getCachedPrice(symbol)` → `:2405` `const rawPrice = cachedPrice?.price \|\| 0` → `:2417` `getSmoothedPrice(...)` → `:2442` `const currentPrice = smoothedPrice` → the 19-strategy dispatch. **BASIS: SMOOTHED MID (mixture).** | ⭐ **THE SAME BAR CLOSE.** The xStock active lane is not a second evaluation: `eval-cycle.ts` detects on `lastPrice`, builds entry/stop/target there, and `active-dispatch.ts:137 dispatchXstockActiveSignal` routes the **already-formed** signal onto the shared active pipeline. **BASIS: BAR.** |
| **live** | — same code | — same code |

⛔ **CORRECTION TO AN EXISTING GOVERNED DOC, OWED HERE:** `SYSTEM_MANUAL.md:642` cites this chain at `signal-orchestrator.ts:2387`. At the graded ref the read is at **`:2404`**. The Manual's *description* is right; its anchor has drifted 17 lines. Fix it in the same commit as this section or it will be re-cited stale.

⛔⛔ **AND A LANE SPLIT INSIDE ONE CLASS THAT I DO NOT THINK ANYONE HAS WRITTEN DOWN: CRYPTO VTS AND CRYPTO ACTIVE DO NOT BUILD LEVELS ON THE SAME NUMBER.** The active lane smooths (`signal-orchestrator.ts:2417` → `:2442` → `:2467 computeContext(…, currentPrice, …)`); the VTS lane does not (`vts-runner.ts:1429 computeContext(…, priceData.price, …)`). **MCE does not smooth internally — it passes the argument straight through** (`market-context-engine.ts:1434`), and its own parameter doc admits the ambiguity in as many words: `:1218` *"@param currentPrice - Smoothed current price (from Kalman filter or raw)"*.
⇒ ★ **A parameter contract that accepts "smoothed or raw" is not a contract.** The consequence is concrete: **the VTS corpus we train selection on and the active path we trade on are anchored on two different prices for the same symbol at the same instant** — the smoothed one lags, the raw one does not. **Every VTS-vs-active comparison anyone has drawn carries this difference silently.**

★★ **THIS ROW IS THE ASSET-CLASS TRAP KYLE KEEPS GETTING CAUGHT BY, AND IT IS THE STARKEST IN THE DOCUMENT.** Crypto levels are born on a **smoothed midpoint of a live quote**. xStock levels are born on a **venue-published bar close that can be up to an hour old**. These are not variants of one design — they are different *kinds* of number, with opposite failure modes: the crypto anchor is fresh and untransactable, the xStock anchor is transactable-in-principle and potentially very stale. ⇒ **any sentence in §6 of the form "levels should use X" is wrong about one class unless it names both.**

### ROW 2 — RANKING (which candidate wins the slot)

| lane | crypto_spot | xstock_spot |
|---|---|---|
| **VTS** | n/a — VTS does not rank; it opens everything that passes its floor. | n/a — same. |
| **paper (active)** | ⭐ **NO MARKET READ.** `ready_to_buy_service.ts:1690-1699` and `:1756` parse `signal.entryPrice` / `signal.stopLoss` off the queued row. **BASIS: LEVEL.** The ranker is comparing this system's own earlier arithmetic against itself. | same — the queue is class-agnostic at this hop. |
| **live** | — same code | — same code |

⛔ **AND THE ONE FABRICATION IN THIS ROW IS REAL AND ALREADY FILED (`#927`):** `ready_to_buy_service.ts:1949` `const targetPrice = num(s.targetPrice) ?? entryPrice * 1.02` — and again at `:1794` for the shadow-sim path, each with the comment *"mirror `executePromotedSignal`'s default"*. **A missing target becomes a 2% target.** That is `#546` exactly: an absent value wearing a plausible number's clothes, inside the ranking key.

### ROW 3 — ENTRY TRIGGER (does the queued signal become a position)

| lane | crypto_spot | xstock_spot |
|---|---|---|
| **VTS** | opens on the eval-cycle's own admit gate; no second price read. **BASIS: LEVEL.** ⚠️ Except the maker bifurcation: `eval-cycle.ts:956` `isMarketableAtPlacement('buy', lastPrice, entryPrice)` — compares the level against the **bar close** (xStock) / the smoothed mid (crypto). | as left. |
| **paper (active)** | ⭐ **THE ONE JOB THAT READS A REAL BOOK.** `active-execution-engine.ts:3790` `_evaluateOpenDepthGate(...)` → `depth-source.ts:43-45` `krakenWebSocketAdapter.getBookForFill(symbol)`, `source: 'crypto_ws_book'` — the live 10-level WS mini-book. The marketable-at-placement test at `:3833` reads `_gate.snapshot.asks[0]?.price` — **a real best ask.** **BASIS: BOOK (ask side).** | `depth-source.ts:47-69` — the latest **`xstock_spot_ticker_snap` top-of-book row, one level**, `source: 'xstock_ticker_snap'`, plus the class-only liveness gate at `active-execution-engine.ts:3787-3796`. **BASIS: ARCHIVED TOP-OF-BOOK, one level.** |
| **live** | — same code | — same code |

★ **This is the only job in the whole table whose crypto arm uses the order book, and §1.5 of this document explains why it is also the only one that *can*: the book is subscribed for open positions and for nothing else, so it is available at the moment we are about to hold a symbol and unavailable at every moment we are choosing between symbols.**

### ROW 4 — FILL SIMULATION (what price the position actually opens at)

| lane | crypto_spot | xstock_spot |
|---|---|---|
| **VTS** | ⛔ **NO FILL MODEL.** VTS opens at the level. **BASIS: LEVEL.** | ⛔ same. |
| **paper (active)** | `active-execution-engine.ts:3940` passes `bookAsks: _gate.snapshot.asks` to the placer → `:3967` `actualEntryPrice = _openFill.fillPrice`, `:3969` `totalSlippage = _openFill.slippageQuote`. **BASIS: WALK** — a size-weighted walk of the real ask ladder, no flat slippage constant (`:115-116`, retired at P19-B4b.1). ⚠️ **Maker arm: `:3936` `totalSlippage = 0` and the fill is the resting limit — correct by construction, not a modelling gap.** | **BASIS: WALK over a ONE-LEVEL ladder.** The same placer, fed a snapshot that has exactly one level per side. A walk over one level is a walk that cannot express depletion — it will report a clean fill at the touch for any size the top level can nominally cover. **This is the sharpest silent asymmetry in the table and I do not think it has been stated anywhere as a sentence.** |
| **live** | — same code (the placer's live sibling is not written) | — same code |

⚠️ **AND ONE PAPER-ONLY LEG THAT IS NOT A PRICE READ BUT BELONGS IN THE PICTURE:** `active-execution-engine.ts:3852-3862` sends every paper open to Kraken `AddOrder validate=true` before filling internally. It vets **well-formedness**, never price. It is explicitly paper-only by construction.

### ROW 5 — POSITION MARKING & EXIT TRIGGER (the mark stops and targets are compared against)

| lane | crypto_spot | xstock_spot |
|---|---|---|
| **VTS** | `vts-runner.ts:3037` `priceCache.getBatch('vtsSimulation', cryptoSymbolList)`. **BASIS: MID (mixture).** ⚠️ And the bucket is a **cadence**, not a partition — `getCachedPrice` takes no bucket argument, so the active lane and VTS read the same single map (`RUNNING_ISSUES:6649`). | ⭐⭐ **THE ONLY NON-MIDPOINT LANE IN THE ENTIRE SYSTEM.** `vts-runner.ts:3050` — `SELECT DISTINCT ON (symbol) … last::text AS price FROM xstock_spot_ticker_snap … INTERVAL '5 minutes'` (real lane); the shadow lane's twin is at `:3977`. **BASIS: PRINT.** |
| **paper (active)** | `active-execution-engine.ts:1473` `livePricingAdapter.getPriceWithFallback(symbol, 2000)`; accepted only if `isKrakenVenueSource` (`:1493`), else the direct-REST leg at `:1531-1532` `currentPrice = _restKind === 'mid' ? (ask + bid) / 2 : lastTrade`, else **skip the tick.** **BASIS: MID (mixture), with a stated `markKind` on the REST leg only.** | `:1265` `getLatestEquityTick(position.symbol)` → `:1445` `currentPrice = _eqTick.price`, which `equity-spot-archiver.ts:173-174` builds as `markKindOf(bid,ask) === 'mid' ? (bid+ask)/2 : last`. **BASIS: MID, and it CARRIES ITS KIND** (`:131` `kind: 'mid' \| 'last'`). ⛔ **Freshness is BLOCKING and risk-derived** (`:1296-1340`, `computeStalenessCeiling`); **no REST fallback exists for this class and cannot** (Kraken publishes no equities REST). |
| **live** | — same code | — same code |

★ **Kyle's exit-freshness ruling of 2026-09-03 lands here and nowhere else, and it resolves to *change nothing on the exit side*: `mark-staleness.ts` carries no session term, so the standard is already the same round the clock.** The inconsistency he was pointed at is on the **entry** side — `active_fill_max_age_ms` is a flat 15,000 ms while the exit ceiling is risk-derived per symbol. Same document, different job, different row.

### ROW 6 — EXIT FILL (what price the exit executes at)

| lane | crypto_spot | xstock_spot |
|---|---|---|
| **VTS** | ⛔ **MARK-BOOKED, and F-G-2 OBJ-5 changed exactly this.** `vts-exit-booking.ts:22-29 resolveVtsBookedExitPrice` — crypto now books **the mark the evaluator actually saw**, not the TEC clamp. **BASIS: MID.** ⛔ **"Mark-booked" is not "transactable": the booked mark is still the cache mid, favourable by ~half a spread.** | ⛔ **STILL THE CLAMP, DELIBERATELY.** `:26` `if (assetClass !== 'crypto_spot') return clampPrice` — every xStock VTS stop books at exactly the stop and every target at exactly the target. **BASIS: LEVEL.** The seam is on the BOOKING only, never the decision, and its removal is owed to `B-XSTOCK-FEED-SANITY` (plan row 3b.b). |
| **paper (active)** | `active-execution-engine.ts:2454` `actualExitPrice = _closeFill.fillPrice` — a depth walk of the **bid** ladder. **BASIS: WALK.** Maker exit arm `:2415-2425`: fills at the resting limit, maker fee, **slippage 0 by construction.** | same seam, one-level ladder (row 4). |
| **live** | — same code | — same code |

### ROW 7 — BOOKING THE RESULT (what the learning corpus and the P&L record)

| lane | crypto_spot | xstock_spot |
|---|---|---|
| **VTS** | `vts-runner.ts:3355` / `:4047` both call `resolveVtsBookedExitPrice`; P&L at `:3370` `(exitPrice - trade.entryPrice) / trade.entryPrice`. **BASIS: MID vs LEVEL** — the exit is a market read, the entry is not. | **BASIS: LEVEL vs LEVEL.** ⇒ ★ **an xStock VTS trade is scored entirely on numbers this system wrote itself**, with the market entering only through the *decision* to close. |
| **paper (active)** | `:2376` `avgPrice` (the walked entry) vs `:2454` `actualExitPrice` (the walked exit), with explicit and implicit costs separated at `:2490-2492`. **BASIS: WALK vs WALK — the only end-to-end honest pair in the table.** | same construction, one-level ladders both ends. |
| **live** | — same code | — same code |

### ROW 8 — SIZING
**No price read, either class, either lane.** `active-position-sizing.ts:137` — see §3.0.

### ROW 9 — THE SCANNER SWEEP (what gets into the universe at all)

| lane | crypto_spot | xstock_spot |
|---|---|---|
| **both** | `market-scanner.ts:850` (quant) and `:1063` (pattern) — `const currentPrice = parseFloat(ticker.c[0])` from `krakenService.getTicker()`. ⭐ **This is a RAW REST call** — `kraken.ts:258-261 makePublicRequest('Ticker')`, **no translator** — so `c[0]` here is Kraken's own **last trade closed**. **BASIS: PRINT.** Drives the min/max-price gates and, at `:855` / `:1066` (`volume24hCoins * currentPrice`), the 24-h dollar-volume gate. ⚠️ **The file's own comment at `:699` cites that multiplication as `:820`, which is stale by 35 lines** — a small thing, but it is the citation a reader of `#966` follows. | `scanner.ts:910` bar close (row 1) plus a **separate** two-sided enrichment read from `xstock_spot_ticker_snap` for the spread gate (`:646`, a 30-minute window) and a **rolling-median** top-of-book depth-USD (`:688`, a 20-minute window). **BASIS: BAR for the price gates, ARCHIVED QUOTE for the liquidity gates.** |

---

## 3.2 ⛔ WHAT THE TABLE ESTABLISHES — EIGHT FINDINGS, IN DESCENDING ORDER OF HOW MUCH THEY CHANGE §6

### ⛔⛔ F1 — "THE MIDPOINT REACHES EVERY CONSUMER" IS TOO STRONG, AND THE TRUE STATEMENT IS WORSE
§4.1 of this document says the feed-layer midpoint overwrite *"happens at the feed layer, which is why it reaches every consumer."* **Traced to the writers, that is not what happens.** `priceCache` has **three** writers and they do not agree:

| writer | what it writes as `price` | tag it lands under |
|---|---|---|
| `price-cache.ts:215`, `:323`, `:438` — the cache's own REST poller | `parseFloat(ticker.c?.[0])` from the **raw REST `Ticker` endpoint** (`kraken.ts:258-261`, no translator) ⇒ **the venue's LAST TRADE** | `kraken_rest` |
| `live-pricing-adapter.ts:831` → `:843 updateFromRest(normalized, midpoint)` | `markKindOf(bid,ask) === 'mid' ? (ask+bid)/2 : lastTrade` ⇒ **a MIDPOINT computed from REST sides** | `kraken_rest` |
| `live-pricing-adapter.ts:1095 updateFromWebSocket(...)` | the adapter's `price`, which is `translateV2ToV1`'s `markPrice` (`kraken-v2-translator.ts:72-73`) ⇒ **a MIDPOINT** | `kraken_ws` |

⇒ ★★ **TWO WRITERS WITH DIFFERENT BASES SHARE ONE TAG, AND `CachedPrice` DOES NOT RECORD WHICH.** Measured, whole-file, with a positive control: **`grep -c markKind price-cache.ts` = 0; the same grep on `kraken-v2-translator.ts` = 6.** The `markKind` mitigation §4.1 credits — *"consumers can now TELL, if they look"* — **does not reach the shared price cache at all.** `lastSource` answers *which transport*, never *which quantity*.

⇒ ⛔ **SO THE HONEST FORM IS: the crypto signal-birth price is a MIXTURE of a last trade and a midpoint, in an unknown and time-varying ratio, and the field that would tell you which is not stored.** That is strictly worse than a uniform midpoint, because a uniform bias can be reasoned about and a mixture cannot. ⇒ **§4.1 needs the amendment; §6 cannot specify "the mark" for crypto without first making the basis readable at the read site.**
⚠️ **NOT MEASURED HERE: the ratio.** CC-C's §2 snapshot (n=217, 209 `kraken_rest` / 8 `kraken_ws`) splits by **transport**, not by basis, and cannot answer this. **The instrument to settle it does not exist yet — that is the finding, not a gap in my search.**

### ⛔ F2 — THE BOOK IS AVAILABLE ONLY WHERE WE ARE NOT CHOOSING
Read down the table: the order book appears in **exactly one job** (row 3/4, crypto active) and it is the job that happens *after* the choice is made. §1.5 already established the mechanism — the subscription set is open positions. **Row 1 is where that constraint bites: no crypto level in this system has ever been built from a book, and none can be without changing what we subscribe to.** The shadow arm at `signal-orchestrator.ts:2614 buildLevelBasis(...)` is measuring precisely this, and its result is recorded and discarded (`:2628 recordLevelBasisOutcome`) — telemetry, not a level. **That is the correct current state and it must not be misread as "the level basis is live."**

### ⛔ F3 — SIX OF THE NINE JOBS NEVER READ A MARKET PRICE
Ranking, sizing, VTS entry, VTS fill, the xStock VTS exit booking, and the whole entry side of every P&L are **LEVEL** rows. They consume numbers this system wrote earlier. ⇒ ★ **the leverage of getting row 1 right is far higher than the table's shape suggests: one basis decision at signal birth propagates, uncorrected, through six downstream jobs and into the learning corpus.**

### ⛔ F4 — THE TWO CLASSES DISAGREE ON THE ONE THING §6 MUST DECIDE
Crypto: fresh, untransactable, smoothed, mixed-basis. xStock: transactable-in-principle, unsmoothed, single-basis, **up to an hour old**. Every one of Kyle's four `B-PRICE-SIDE-BY-JOB` jobs sits on top of that split. **The by-job cut and the by-side cut are the same jobs on two axes — and this table says the two axes are not independent, because for xStock the "side" question is partly moot: a bar close has no side.**

### ⛔ F5 — THE xSTOCK ONE-LEVEL LADDER
Row 4. The fill machinery is shared and correct; the *input* to it is one level for xStock and ten for crypto. A depth walk over one level cannot model depletion. **I have not measured what this costs** — that needs a comparison of walked-fill vs top-of-book fill on xStock opens, which nothing currently records. **Stated as a structural fact, not priced.**

### ⭐ F6 — THE xSTOCK MARK IS BETTER-LABELLED THAN THE CRYPTO ONE
`EquityTick` carries `kind: 'mid' | 'last'` (`equity-spot-archiver.ts:131`); `CachedPrice` carries nothing (F1). **The class with the worse feed has the more honest data structure.** Whatever §6 concludes, the label belongs on both.

### ⛔ F7 — THE SMOOTHING IS A **LANE** PROPERTY, NOT A SYSTEM PROPERTY
Row 1. Crypto active smooths before building levels; crypto VTS does not; MCE accepts either without discriminating (`market-context-engine.ts:1218`, `:1434`). ⇒ **the training lane and the trading lane are anchored differently, by construction, and nothing in the data records which.** This is the same defect shape as F1 one layer up: **a value whose basis varies is stored in a field whose name asserts it does not.** ⇒ **§6 must state the smoothing decision per lane, not once.**

### ⭐ F8 — VTS xSTOCK IS THE ONLY LANE READING A PRINT, AND IT IS THE LANE WE LEARN FROM
Row 5. `xstock_spot_ticker_snap.last`. ⇒ **the learning corpus for one class is built on a different quantity than the trading decision for that same class.** Not necessarily wrong — but it is a cross-basis comparison sitting inside the training data, and it is invisible unless the table is laid out this way.

---

## 3.3 ⛔ WHAT I DID **NOT** ESTABLISH — STATED SO THE GAPS ARE VISIBLE, NOT IMPLIED

1. **The mixture ratio in F1.** No instrument exists. Naming the instrument is a scope decision, not a fix.
2. **Whether `getBookForFill`'s ladder is checksum-valid.** `#507` (CRC32 never implemented) is open and I did not re-derive it.
3. **The cost of F5.** Unmeasured.
4. **Non-midpoint transformations.** §4.2 already flags this gap for smoothing, clamping, tick-rounding and last-known-good re-serves; **I did not close it, and row 1's `getSmoothedPrice` is squarely inside it** — the Kalman filter is a transformation this section names but does not characterise.
5. **The UI/API read sites.** `routes.ts:4634`, `routes/vts-audit.ts:91`, `trading-state-sync.ts:296` all read `getCachedPrice` unbounded. **They are display and reconciliation, not decisions, so they are out of this section's scope by design** — but they are not out of the *system's* scope and someone should say which document owns them.
6. **Whether the xStock 60-minute bar's age is bounded in practice.** `#559` recorded a uniform ~15.7-minute archive-write lag on the newest bar and stated it should be measured before acting. **It still should. I did not measure it, and row 1's honesty depends on it.**

---

## 3.4 THE HOOK INTO §6 — THE ROWS THIS SECTION HANDS FORWARD

Per CC-C's coupling point, adopted: §6 builds **one** matrix from these rows, feed and side on the same axes. The nine jobs above are the row keys. **Three constraints this section imposes on that matrix before it is written:**
- ⛔ **A cell may not name a feed the job's lane can reach.** Row 1 crypto cannot name the book without a subscription change (F2). Row 5 xStock cannot name REST at all.
- ⛔ **A cell that names a midpoint must also name where the KIND is recorded** — because F1 proves the label does not currently travel with the number.
- ⛔ **`live` cells must be filled deliberately, not by inheritance.** Today they inherit because there is no live code. The first live arm will be written against this matrix, which makes §6 a specification rather than a description.

---

## 4. ✅ WHERE THE PRICE IS TRANSFORMED BEFORE USE — **VERIFIED 2026-09-07**

> ⛔ **Kyle: *"where our pricing is being manipulated one way or another, such as the midpoint stuff, that needs to be highlighted."***

### ⛔⛔ 4.1 THE ONE THAT REACHES EVERYTHING — THE FEED-LAYER MIDPOINT OVERWRITE
**`server/services/market-data/kraken-v2-translator.ts`.** The v2→v1 translator's own comment states it, and it is quoted rather than summarised:
> *"`c` is nominally 'last trade closed' and this function **OVERWRITES it with a midpoint whenever both sides exist** (`#952`), so **every consumer downstream was reading a mid under a print's name** — including a variable literally called `lastPrice`."*

⇒ ★★ **THIS HAPPENS AT THE FEED LAYER, WHICH IS WHY IT REACHES EVERY CONSUMER *THAT GOES THROUGH THE TRANSLATOR*.** ⛔ **THE UNQUALIFIED FORM OF THIS SENTENCE IS WITHDRAWN — SEE THE CORRECTION BELOW; THE REST-CACHE PATH DOES NOT GO THROUGH IT, AND THAT IS WORSE, NOT BETTER.** Crypto and xStock, paper and VTS, entry and exit all inherit it — nobody downstream opted in, and the field's NAME says the opposite of its contents.

⛔⛔ **CORRECTED 2026-09-07 — *"IT REACHES EVERY CONSUMER"* IS TOO STRONG, AND THE TRUE STATEMENT IS WORSE THAN THE ONE IT REPLACES.** *(Langston, §3 F1, with a positive control.)*
**`priceCache` has THREE writers, and two of them share ONE TAG while carrying DIFFERENT BASES:**
- **`price-cache.ts:215` / `:323` / `:438` write raw REST `ticker.c[0]` — a LAST TRADE** (`kraken.ts:258-261`; **no translator on that path, so no midpoint overwrite**).
- **`live-pricing-adapter.ts:843` writes a MIDPOINT.**
- ⛔ **BOTH LAND AS `kraken_rest`.**
✅ **POSITIVE CONTROL, so the absence is evidenced rather than asserted: `grep -c markKind price-cache.ts` = **0**, against **6** in the translator.** ⇒ **the field that would say WHICH basis a cached price carries is not stored on this path at all.**

⇒ ★★ **SO THE CRYPTO SIGNAL-BIRTH PRICE IS A *MIXTURE* OF A PRINT AND A MID, IN AN UNKNOWN RATIO, WITH NOTHING RECORDING WHICH.** ⛔ **THAT IS STRICTLY WORSE THAN A UNIFORM BIAS.** A uniform midpoint bias is wrong in a known direction by a known amount and can be corrected; **a mixture in an unknown ratio cannot be corrected at all, and it makes two runs of the same measurement non-comparable.**
⚠️ **AND §2's `lastSource` split (n=217, 209 `kraken_rest` vs 8 `kraken_ws`) CANNOT SETTLE THE RATIO — it splits by TRANSPORT, not by BASIS.** ⇒ ⛔ **The instrument does not exist. That is the finding, not a gap in the search.**
**DISPOSITION: folded into `B-PRICE-SIDE-BY-JOB` (row `3n`) with F7 — both are basis-per-job questions and that is the batch that owns them.**

✅ **PARTIALLY MITIGATED, AND THE MITIGATION IS A LABEL RATHER THAN A REMOVAL:** `markKind: 'mid' | 'last'` now travels beside it, **REQUIRED not optional** — *"an optional field lets a future producer omit it, and that absence is indistinguishable from a missed stamp."* ⛔ **The overwrite still happens; consumers can now TELL, if they look.**
⚠️ **AND THE COMMENT CARRIES ITS OWN WARNING AGAINST THE OBVIOUS SHORTCUT:** *"Do NOT re-derive this from `a`/`b` at a consumer. It round-trips exactly TODAY because both are written from the same locals below, but that is an unstated invariant of a function neither end owns."*

### ✅ 4.2 THE OTHER MIDPOINT COMPUTATIONS — CENSUSED, AND MOST ARE LEGITIMATE
**The batch's own rule decides each one: a price that ESTIMATES VALUE may be a midpoint; a price that BECOMES A LEVEL, FIRES an action, or is RECORDED must be the side we could transact at.**

| site | what it computes | verdict under the rule |
|---|---|---|
| `kraken-websocket-adapter.ts:1063,:1093` | book best-bid/best-ask → `kraken_ws_book_mid`, emitted as a price tick | ⛔ **BECOMES A MARK** — inherits the same issue as 4.1 |
| `active-execution-engine.ts:1532` | REST fallback: `_restKind === 'mid' ? (ask+bid)/2 : lastTrade` | ⛔ **BECOMES AN EXIT-EVALUATION MARK** — but note it is `markKind`-aware, so the KIND is stated |
| `xstock_spot/book-state.ts:169` | `midNow` for book-state comparison | ✅ **ESTIMATE** — used to judge book shape, never a level |
| `xstock_spot/qd-probe-metrics.ts:110` | mid as a spread denominator | ✅ **ESTIMATE** — correct use |
| `xstock_spot/scanner.ts:661` | `((ask-bid)/((ask+bid)/2))*100` — spread percent | ✅ **ESTIMATE** — a spread needs a midpoint denominator by definition |

⇒ ★ **THE PATTERN IS CLEAN: every midpoint used as a DENOMINATOR or a SHAPE JUDGEMENT is correct. Every midpoint used as a MARK is the defect.** The three marks all trace to the same decision — mid-as-default at the point the price is built.

⚠️ **NOT YET CENSUSED, STATED SO THE GAP IS VISIBLE: non-midpoint transformations** — smoothing, clamping, rounding-to-tick, last-known-good re-serves, and the entry/exit slippage adjustments. **Only midpoints were enumerated here. `#743`'s last-known-good re-serve and the venue price grid's tick rounding are known to exist and are NOT yet placed in this table.**



⛔ **Kyle: *"where our pricing is being manipulated one way or another, such as the midpoint stuff, that needs to be highlighted."***
**Known entry point for the audit (verified previously, to be re-verified here): the v2→v1 translator overwrites the `last` field with a computed midpoint, at the FEED layer — so every downstream consumer inherits it whether or not a midpoint is the right input for that consumer.**

**STATUS: NOT YET FILLED.**

---


### ⛔ 4.3 THE xSTOCK DEPTH WALK RUNS OVER A ONE-LEVEL LADDER — **A WALK THAT CANNOT EXPRESS DEPLETION** *(Langston §3 F5)*
**`xstock_spot/depth-source.ts:47-69` builds the ladder the fill walks, and it has exactly ONE level.** ⇒ ⛔ **A depth walk over a single level can never report that an order exhausted the available size — the one thing a depth walk exists to detect.** It will always report the touch, whatever the order size.
**HOME: `B-XSTOCK-DEPTH-LADDER-FIDELITY`, owner CC-C, placed in `PHASE_19_PLAN` after row `3b.b`** — it depends on the feed-sanity seam that batch establishes. No date.


## 5. ✅ WHAT WOULD IT COST TO SUBSCRIBE THE BOOK BROADLY? — **MEASURED 2026-09-07**

> **Kyle's directive: establish the resource cost and feasibility FIRST, and only then ask which feed we would prefer if resources were no object.** This section is the first half. **It makes no recommendation.**

### ✅ 5.1 THE VENUE'S SIDE — READ FROM KRAKEN'S OWN DOCUMENTATION, NOT INFERRED
⛔ **Read the operator's docs before instrumenting — my own `vendor-docs-unread` lesson, applied.**

| question | Kraken's published answer |
|---|---|
| **max simultaneous connections** | **No number published.** Only: *"The WebSocket API limits the maximum number of simultaneous connections to provide protection against misuse."* |
| **can one connection carry many subscriptions?** | ✅ **YES, and they state the consequence explicitly:** *"it is possible to stream all available market data for all currency pairs without reaching the WebSocket connection limits."* |
| **symbol limit on the `book` channel** | ⛔ **NONE STATED.** Multiple symbols per subscription are supported. *(The 200-symbol figure that has been cited before belongs to the **level3** page, NOT `book`.)* |
| **book depth options** | `10` · `25` · `100` · `500` · `1000`, default `10`. ⚠️ **We already use 10 — the MINIMUM. There is no headroom below us.** |
| **message rate limit** | **No number.** *"will vary depending upon the load on the system"*; exceeding it returns `{"Error": "Exceeded msg rate"}`. |

⇒ ★★ **KRAKEN DOES NOT PUBLISH A BARRIER TO THIS, AND STATES THE ALL-PAIRS CASE IS POSSIBLE. THE BINDING CONSTRAINT IS THEREFORE OURS — MESSAGE VOLUME AND WHAT IT COSTS US TO PROCESS — NOT A VENUE CAP.**

### ✅ 5.2 OUR SIDE — THE MEASURED RATE
**Two timed samples of the per-channel frame counters, 120 s apart, live:**
| channel | frames in 120 s | rate |
|---|---|---|
| **`book`** | **26,735** | **222.8 / sec** |
| `ticker` | 191 | 1.6 / sec |

**Denominator, measured not assumed: the subscription set is 6 crypto open positions** — `DASH/USD`, `LINK/EUR`, `LINK/USD`, `LINK/USDC`, `ZEC/EUR`, `ZEC/USD`. ⇒ **≈ 37 book frames/sec per subscribed symbol.**
★ **THE BOOK IS ~139× THE TICKER'S FRAME RATE ON THE SAME SYMBOLS.** That ratio is the cost of depth.

### ⛔ 5.3 THE EXTRAPOLATION — AND WHY THE NAIVE ONE IS WRONG
⛔ **A linear 6 → 465 scaling gives ~17,000 frames/sec and IS NOT CREDIBLE: the six symbols are ones we CHOSE TO HOLD, i.e. selected for liquidity.** Scaling from a selected sample to the population is the wrong-population error this document keeps catching.
✅ **BETTER, USING THE ACTIVITY DISTRIBUTION (24 h, `crypto_spot_ticker_snap`, 465 symbols, 346,019 snapshots):**
- **The six account for 17,521 snapshots = 5.06% of all activity.**
- Per-symbol activity is heavily skewed: **p25 = 74 · p50 = 207 · p75 = 798 · p95 = 3,351 · max = 12,788** (`BTC/USD`). The six average 2,920 — **between p75 and p95, active but NOT the busiest; we do not hold BTC, ETH or SOL.**
⇒ **222.8 / 0.0506 ≈ 4,400 book frames/sec for the full 465-symbol universe.**

⚠️ **TWO STATED LIMITS ON THAT NUMBER:**
1. **ASSUMPTION: book frame rate scales with ticker activity.** Plausible — both are driven by market events — **but NOT verified.** It is an estimate, not a measurement.
2. ⛔⛔ **CORRECTED 2026-09-07 — THE BIAS DIRECTION IS *NOT* ESTABLISHED, AND I STATED IT AS IF IT WERE.** *(Langston.)* **Book frames are QUOTE-driven; the ticker share I scaled by is TRADE-triggered and quote-blind on cold names (§2, `#1017`) ⇒ that biases the estimate DOWN on the quiet tail — the OPPOSITE direction to the throttle bias below.** ⇒ **Two biases of opposite sign and unknown magnitude, so no single direction can be claimed.** ✅ **AND A SMALL EXPERIMENT REPLACES THE WHOLE EXTRAPOLATION: subscribe `book` for a few p25/p50 names and measure.** ⚠️ **The throttle bias, which I originally gave as decisive, is only one of the two:** the archive's ticker is **throttled at 4 s per symbol**, which compresses busy symbols more than quiet ones ⇒ the six's TRUE activity share is **higher** than 5.06% ⇒ the true multiplier is **lower** than 19.8×.

### ⚠️ 5.4 WHAT SCALING WOULD ALSO RAISE, STATED NOT COSTED
- ⛔ **Book integrity is NOT validated today — `#507`: the CRC32 checksum was never implemented.** At 6 symbols an undetected corrupt book is one position; at 465 it is the whole selection surface. **Scaling the subscription without the checksum scales the blast radius of a defect we already know is open.**
- **Per-symbol memory is small** (10 levels × 2 sides) and is not the constraint; **CPU per frame and the event loop are.** Not measured here.
- ★ **AND THE SET MAY NOT NEED TO BE "ALL 465":** signal-time levels are only needed for symbols actually being RANKED. **The candidate set is far smaller than the universe and larger than the 6 we hold — that middle option is unmeasured and is the obvious thing to size next.**

**⇒ NO RECOMMENDATION IS MADE HERE. §6 asks the preference question separately, per Kyle's ordering.**

---

## 5b. ✅ OTHER DATA-ACQUISITION PROBLEMS — **VERIFIED 2026-09-07**

### ✅✅ 5b.1 WHY WE ARCHIVE ~450 CRYPTO PAIRS AND NOT ~1,400 — **KYLE'S QUESTION, AND HIS PREMISE NEEDS CORRECTING IN TWO PLACES**

> **Kyle's question, twice: *"why are we only archiving four hundred and sixty five coins… are they still possible trade options… do we have a mechanism built in so that we can check on these nine hundred and sixty one?"*** and his own hypothesis: *"I'm guessing we put this snapshot limitation in in order to try and conserve either storage space or rate limit calls."*

⛔⛔ **CORRECTION 1 — IT IS NOT A LIMIT WE IMPOSED TO CONSERVE ANYTHING. THERE IS NO CAP, NO QUOTA AND NO CEILING IN THE CONFIG.** `server/config/crypto-universe-filter.json` contains exactly two criteria: **`allowedQuotes: ["USD","USDT","USDC"]`** and **`minVolume24hUsd: 10000`**. Its own comment states the purpose — *"Filters out dead pairs and stablecoin/stablecoin degenerates."* ⇒ **the number that comes out is a RESULT, not a setting.** Neither storage nor rate limits appear anywhere in the decision.

⛔⛔ **CORRECTION 2 — "465" IS A SINGLE-DAY SNAPSHOT OF A NUMBER THAT MOVES EVERY DAY, AND WE HAVE BOTH BEEN QUOTING IT AS IF IT WERE FIXED.** The universe is recomputed daily. **Last ten runs: 469 · 388 · 440 · 413 · 442 · 427 · 449 · 455 · 417 · 443.** ⇒ ★ **RANGE 388-469 — an 81-pair swing, ~18% of the universe, with no configuration change at all.** *(Rule 13, on our own metric: a snapshot is not the rolling window.)*
⚠️ **AND THE "465" ITSELF WAS A DIFFERENT OBJECT FROM THE ONE WE THOUGHT.** Measured today: **464 distinct symbols written over 24 h**, but **428 in the last hour**, against a computed universe of **443**. ⇒ **the 465 was a 24-HOUR DISTINCT COUNT — it includes pairs dropped part-way through the day. It was never the subscription size.**

#### ⭐ THE DECOMPOSITION — WHERE THE OTHER ~950 ACTUALLY GO *(2026-09-07 run; the shape is stable across the 130 runs on file)*
| bucket | count | what it means |
|---|---|---|
| **wrong quote currency** | **661** | ⛔ **THE BIGGEST BUCKET, AND IT IS NOT 661 MISSING COINS.** These are pairs quoted in EUR, GBP, BTC, ETH etc. **Largely THE SAME COINS we already carry on a USD quote.** Excluding `SOL/EUR` does not exclude SOL. |
| **below the volume floor ("dead")** | **287** | Under **$10,000** of 24 h volume. ★ **THE ONLY GENUINELY DISCRETIONARY EXCLUSION — the only one that is a policy choice rather than a duplicate or a venue fact.** |
| **offline at the venue** | **55** | **Kraken itself says the pair is not trading.** Not our decision. |
| ✅ **archived** | **443** | |

⇒ ★★ **SO THE ANSWER TO *"ARE THE OTHER ~961 STILL POSSIBLE TRADE OPTIONS?"* IS: MOSTLY THEY ARE NOT A SEPARATE SET AT ALL.** Roughly two-thirds are the same assets on a quote currency we do not trade, and 55 are shut at the venue. **The real question is only about the ~287 below the floor.**

#### ✅ AND YES — THERE IS A DAILY RE-CHECK MECHANISM, AND IT HAS RUN 130 TIMES
**`server/scripts/b74-refresh-universe.ts`, invoked from ROOT'S CRONTAB at 03:00 UTC daily** — re-queries Kraken's `AssetPairs`, recomputes the universe, and logs exactly which pairs joined and dropped versus yesterday.
✅ **MEASURED REACH: 130 runs, `2026-05-01T03:00:02Z` → `2026-09-07T03:00:02Z`.** **Today: 58 added, 32 dropped, 385 kept.** ⇒ **the long tail is re-examined every single day, and roughly 90 pairs change side on a normal day.**
⚠️ **NEAR-MISS RECORDED, because it is the exact error this document is built to catch: the cron is NOT in `/etc/cron.d/` and NOT in `deploy`'s crontab, and a grep of those two would have returned nothing.** It lives in **root's crontab**. **The log proved it had run ten hours earlier.** ⇒ **an asserted absence needs presence-evidence — I had the false absence in hand and the log refuted it.**

#### ⛔⛔ THE ONE REAL GAP HERE — **THE RE-CHECK RECOMPUTES BUT DOES NOT ACT**
**The script's own docstring, verbatim:** *"Does NOT modify the running archiver subscriptions (those happen at next full PM2 restart, which is rare). The daily refresh is informational."*
⇒ ⛔ **A pair that crossed the $10k floor this morning is IN today's computed universe and NOT in the running archiver's subscription until the process next restarts.** ★ **The mitigation is accidental rather than designed: we deploy often, and every deploy restarts the process — so the assumption "restarts are rare", true when it was written, is now false in the direction that happens to help us.** ⚠️ **Depending on an accident is not the same as having a mechanism, and the drift is invisible while it is small.**
⇒ **DISPOSITION: own batch — `B-UNIVERSE-REFRESH-ACTS`, owner CC-C, placed in `PHASE_19_PLAN` after `B-TICKER-BBO-TRIGGER`.** No date.

#### ⭐ AND THE FLOOR IS A LIVE, TUNABLE POLICY NUMBER — NOT A CONSTANT
**`module_constants.passive_archive.b74_crypto_min_volume_24h_usd` overrides the file at runtime, no redeploy.** ✅ **LIVE VALUE CONFIRMED FROM THE RUN ITSELF: the refresh line prints `floor=$10000`** — read from the running resolution, not from the config file. **The config's own comment records Langston's standing view that $10k is conservative and $5k would still filter garbage.** ⇒ **the ~287 excluded pairs are excluded by a dial we can turn, and turning it is a decision about how thin a market we are willing to trade — Kyle's, not ours.**

### ⚠️ 5b.2 THE COVERAGE ASYMMETRY BETWEEN WHAT WE ARCHIVE AND WHAT WE TRADE ON
**Three different symbol sets, and they are routinely confused:**
| set | size today | what it is |
|---|---|---|
| **archived** | **~443** | the passive OHLC + ticker capture universe (this section) |
| **in the live price cache** | **~185** | what the trading path has a current price for |
| ⛔ **WebSocket-subscribed** | **6** | **open crypto positions only** (§1.5) |

⇒ ⛔ **EACH IS A STRICT SUBSET OF THE ONE ABOVE, AND A CLAIM TRUE OF ONE IS ROUTINELY FALSE OF THE OTHERS.** ★ **This is the single most common wrong-object in this whole area** — including in earlier drafts of this document.

### ⚠️ 5b.3 RATE LIMITS — THE ASYMMETRY THAT SHAPES THE WHOLE DESIGN
**A REST price poll costs one request PER SYMBOL. A WebSocket subscription carries MANY symbols on one connection** — Kraken states plainly that *"it is possible to stream all available market data for all currency pairs without reaching the WebSocket connection limits"* (§5.1).
⇒ ★ **The venue charges us per REQUEST on REST and effectively per CONNECTION on WebSocket.** That asymmetry is why broad coverage is REST-polled at a slow cadence while the WebSocket is reserved for the few symbols we hold — **and it is also why widening the WebSocket set is cheaper than it intuitively sounds** (§5).
⚠️ **NOT ESTABLISHED: our actual REST request rate against Kraken's counter, or how close we run to it.** Unmeasured, and named here rather than assumed comfortable.
⛔ **AND WE HAVE RATE-LIMITED *OURSELVES* — `#1014`:** repeated logins to our own staging API returned **429**, which the reading script rendered as a generic read failure. **A rate limit that surfaces as "no data" rather than "slow down" is an instrument that lies about the world.**

### ⚠️ 5b.4 SILENT STALLS — AN OPEN SOCKET DELIVERING NOTHING
**The dangerous failure is not a dropped connection — that is loud. It is a connection that stays open and stops carrying a given symbol.** ✅ **There IS a defence: a subscription audit runs every 5 seconds over open positions and reports `subscribed / missing / stale`.** ⚠️ **Its scope is OPEN POSITIONS — the same 6-symbol set as the subscription itself.** ⇒ ⛔ **nothing audits per-symbol liveness across the ~443 archived or ~185 cached symbols.**
⛔⛔ **AND THE DISCRIMINATOR THAT MATTERS IS NOT RECENCY — IT IS A DISTINCT-SYMBOL COUNT.** One chatty pair keeps a feed-wide freshness gauge green while a hundred quiet ones have gone silent. *(Carried from `#994`: staleness because a market is SHUT must not raise a breakage alert; staleness because OUR feed is impaired must — and the rest of the feed is the control that tells them apart.)*

### ⚠️ 5b.5 RESTART BEHAVIOUR — WHAT A DEPLOY DESTROYS
- ⛔ **The order book is IN-MEMORY ONLY. A restart empties it completely** and it refills only as updates arrive for the symbols we hold.
- ⛔ **Rolling in-memory windows are wiped and then report their COLD behaviour while presenting as normal.** **Measured precedent: the AMR's EV-gap window held ZERO observations across ~2,878 cycles/day for five days after restarts, and nothing announced it.**
- ⇒ ⛔⛔ **ANY MEASUREMENT TAKEN SHORTLY AFTER A DEPLOY IS READING A COLD SYSTEM.** ★ **This produced at least three retracted numbers during this work alone** — including a price-age percentile read 2.5 minutes after a restart that read completely differently 246 seconds later. **Read the INTERVAL between two samples of a monotone counter, never the running total.**

### ⚠️ 5b.6 RETENTION REACH — HOW FAR BACK EACH STORE CAN ACTUALLY ANSWER
| store | reach | ⛔ the trap |
|---|---|---|
| **`crypto_spot_ticker_snap` / the OHLC archives** | months; partitioned monthly, swept by a nightly retention job | the durable record — **and the ONLY one that can answer a question about last week** |
| ⛔ **the order book** | **NONE — never persisted** | **no historical book question can be answered, ever.** Any book comparison must be taken live, in-process |
| **application log `out.log`** | ⚠️ **~18 hours** — a live file rotating every ~1-1.5 h **PLUS 14 retained archives** | ⛔⛔ **`retain 14` IS A FILE COUNT, NOT A DURATION. I read the live file alone, called it "3 hours", and declared a batch criterion unevaluable that the archives already answered.** *(`B-EXIT-BOOK-AGE-STAMP` §11.)* |
| **`error.log`** | same rotation, **separate stream** | ⛔ **`console.warn`/`console.error` NEVER appear in `out.log`.** Every exit-path skip and refusal line is on this stream — **a one-file grep manufactures a zero.** |

⇒ ★★ **THREE SEPARATE WRONG-REACH ERRORS IN THIS WORK, ALL IN THE SAME DIRECTION: making a real answer look unavailable.** ⛔ **STATE AN INSTRUMENT'S REACH BEFORE READING ITS SILENCE AS EVIDENCE — and for a rotating log, count the archives.**

---

## 6. ⏳ THE TARGET STATE — NOT YET FILLED

**The recommendation: which feed serves which job, in which lane, for which asset class — and WHY, in terms of what makes that data more trustworthy for that job.** Including whether any job should draw on a **mix** of two or three feeds.

⛔ **This section is written LAST and only after Parts 2-4 are verified.** Writing it first would be the piecemeal habit this document exists to end.

**STATUS: NOT YET FILLED.**
