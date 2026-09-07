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

### ⏳ STILL TO READ
The old batch and directive reports from before the 2026-01/02 governance change; `Phase_8/9/10/11_Implementation_History.md`; the batch reports that introduced the order book and the midpoint. **STATUS: IN PROGRESS — nothing further asserted yet.**

---

## 3. ⏳ WHERE WE USE PRICING — NOT YET FILLED

**To be established by audit, in code and runtime logs, for EVERY consumption site.** For each: which of the three feeds is the input today, and which *should* be, with the reason.

⛔ **THE TABLE MUST BE CUT THREE WAYS, PER KYLE: by JOB, by TRADING LANE (VTS · paper · live), and by ASSET CLASS** — because the asset classes are scanned by different scanners with different data available to them.

**Jobs to enumerate:** signal generation (where the levels are SET) · ranking · entry trigger · exit trigger (stop and target separately) · fill simulation · position marking · booking the result · sizing · the scanner sweep.

**STATUS: NOT YET VERIFIED. Nothing is asserted here yet.**

---

## 4. ⏳ WHERE THE PRICE IS TRANSFORMED BEFORE USE — NOT YET FILLED

⛔ **Kyle: *"where our pricing is being manipulated one way or another, such as the midpoint stuff, that needs to be highlighted."***
**Known entry point for the audit (verified previously, to be re-verified here): the v2→v1 translator overwrites the `last` field with a computed midpoint, at the FEED layer — so every downstream consumer inherits it whether or not a midpoint is the right input for that consumer.**

**STATUS: NOT YET FILLED.**

---

## 5. ⏳ WHERE WE HAVE TROUBLE GETTING THE DATA — NOT YET FILLED

To cover: coverage gaps by symbol and by asset class · API rate limits · silent stalls (an open socket delivering nothing) · restart behaviour · retention reach of each store.

**STATUS: NOT YET FILLED.**

---

## 6. ⏳ THE TARGET STATE — NOT YET FILLED

**The recommendation: which feed serves which job, in which lane, for which asset class — and WHY, in terms of what makes that data more trustworthy for that job.** Including whether any job should draw on a **mix** of two or three feeds.

⛔ **This section is written LAST and only after Parts 2-4 are verified.** Writing it first would be the piecemeal habit this document exists to end.

**STATUS: NOT YET FILLED.**
