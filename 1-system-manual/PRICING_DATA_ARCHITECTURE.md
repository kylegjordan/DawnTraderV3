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

### ⇒ THE CONSEQUENCE, AND IT IS THE MOST IMPORTANT LINE IN PART 1
⛔⛔ **THE ORDER BOOK COVERS ONLY WHAT WE ALREADY HOLD, SO IT STRUCTURALLY CANNOT INFORM WHAT WE ARE CHOOSING BETWEEN.** Signal generation, ranking and promotion all act on symbols we do NOT yet hold — **by construction the book is absent for every one of them.** ⇒ **any design that puts the book under signal-time level-setting is not a tuning change; it requires changing what we subscribe to.**
⚠️ **AND THE SAME NARROWNESS APPLIES TO THE WS TICKER** — it shares the list. The broad ticker coverage we do have is REST-polled, which is why §1.1's cadence findings and this section are the same fact seen from two ends.

⚠️ **NOT ESTABLISHED HERE: whether subscribing the book more widely is affordable** (connection limits, rate limits, message volume). That is §5's question and no claim is made about it yet.

---

---

## 2. ⏳ THE HISTORY — WHAT EACH FEED WAS ORIGINALLY FOR *(IN PROGRESS)*

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

### ⛔ A DEAD MECHANISM THAT SHOULD BE STRIPPED OUT — kept SHORT deliberately

**`Phase 8.8.3-I7-WS-G (G3)`, `kraken-websocket-adapter.ts:316-318` + `:2602-2611`.** A ticker→book channel switch *"for low-liquidity pairs"*, driven by a **hardcoded list of four symbols**, with a companion `low_liquidity` list of seven that nothing reads.

⛔ **IT CANNOT FIRE. The predicate tests a SLASHED canonical symbol against a DE-SLASHED hint** — `'TIA/USD'.includes('TIAUSD')` is `false`, permanently *(Langston, verified at the object)*. It is also unreachable for two further reasons: the four are not subscribed, and none is held.
⇒ ⛔⛔ **AND THAT IS EXACTLY WHY `CHANNEL_SWITCH = 0` PROVES NOTHING — three independent sufficient causes. STANDING RULE FOR THIS DOCUMENT: an over-determined zero is not evidence for any one of its causes; cite the mechanism.**

★ **HISTORICAL VALUE, WHICH IS THE ONLY REASON IT IS HERE:** it is a **third independent artefact** of one design intent — alongside the architecture's *"book: BBO updates, continuous for illiquid pairs"* and the trade-triggered ticker (§2). **The system knew the ticker goes quote-blind on cold names and built a compensation three times over. All three are inert.**

⇒ **DISPOSITION: `rule 18` / `§15` — delete through the workflow with a blast-radius check and a `DELETED_COMPONENTS_LOG` entry. It rides with whatever the `event_trigger` decision yields; NOT its own batch.**

### ⏳ STILL TO READ
The old batch and directive reports from before the 2026-01/02 governance change; `Phase_8/9/10/11_Implementation_History.md`; the batch reports that introduced the order book and the midpoint. **STATUS: IN PROGRESS — nothing further asserted yet.**

---

## 3. ⏳ WHERE WE USE PRICING — NOT YET FILLED

**To be established by audit, in code and runtime logs, for EVERY consumption site.** For each: which of the three feeds is the input today, and which *should* be, with the reason.

⛔ **THE TABLE MUST BE CUT THREE WAYS, PER KYLE: by JOB, by TRADING LANE (VTS · paper · live), and by ASSET CLASS** — because the asset classes are scanned by different scanners with different data available to them.

**Jobs to enumerate:** signal generation (where the levels are SET) · ranking · entry trigger · exit trigger (stop and target separately) · fill simulation · position marking · booking the result · sizing · the scanner sweep.

**STATUS: NOT YET VERIFIED. Nothing is asserted here yet.**

---

## 4. ✅ WHERE THE PRICE IS TRANSFORMED BEFORE USE — **VERIFIED 2026-09-07**

> ⛔ **Kyle: *"where our pricing is being manipulated one way or another, such as the midpoint stuff, that needs to be highlighted."***

### ⛔⛔ 4.1 THE ONE THAT REACHES EVERYTHING — THE FEED-LAYER MIDPOINT OVERWRITE
**`server/services/market-data/kraken-v2-translator.ts`.** The v2→v1 translator's own comment states it, and it is quoted rather than summarised:
> *"`c` is nominally 'last trade closed' and this function **OVERWRITES it with a midpoint whenever both sides exist** (`#952`), so **every consumer downstream was reading a mid under a print's name** — including a variable literally called `lastPrice`."*

⇒ ★★ **THIS HAPPENS AT THE FEED LAYER, WHICH IS WHY IT REACHES EVERY CONSUMER.** Crypto and xStock, paper and VTS, entry and exit all inherit it — nobody downstream opted in, and the field's NAME says the opposite of its contents.
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
2. ⭐ **THE BIAS DIRECTION IS KNOWN AND IT MAKES 4,400 AN OVERESTIMATE:** the archive's ticker is **throttled at 4 s per symbol**, which compresses busy symbols more than quiet ones ⇒ the six's TRUE activity share is **higher** than 5.06% ⇒ the true multiplier is **lower** than 19.8×.

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
