# PRICING DATA ARCHITECTURE — what we collect, what we use it for, and what we should use instead

> **⛔ STATUS: IN PROGRESS. PART 1 IS VERIFIED; PARTS 2-5 ARE FRAMED AND NOT YET FILLED.**
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

### ⛔ 1.2 WHAT IS COLLECTED BUT NEVER READ
**`ohlc` is subscribed, parsed and stored — and NOTHING IN THE LIVE TRADING PATH READS IT.** Verified: the only production consumer of the stored candles is `server/scripts/b70-b62-relabel-runner.ts`, an **offline re-labelling script**. ⇒ **the candles are collected and archived for retrospective analysis only.**

### ⭐ 1.3 WHAT IS MISSING FROM WHAT WE COLLECT
| gap | status |
|---|---|
| **The venue's own timestamp on the TICKER** | ⛔ **The archive stamps `capturedAt: new Date()` — OUR clock.** Kraken sends `timestamp` on the ticker frame and we did not read it. **Now captured on the LIVE path** (deployed 2026-09-06) and **measured present on 100% of frames**; ⛔ **the ARCHIVE side still stamps our clock and needs a migration.** |
| **The venue's own timestamp on the BOOK** | Sent per MESSAGE (not per price level — a venue fact, not a parsing gap). Captured on the live path; **not archived, because the book is not archived at all.** |
| **The venue's own timestamp on OHLC** | ✅ **ALREADY CORRECT** — `parseOhlcBar` stores `intervalBegin` from the venue's `interval_begin`. **The one feed that always got this right.** |
| **Any durable record of the order book** | ⛔ **NONE.** No table, no archiver, no retention policy. |

---

## 2. ⏳ WHERE WE USE PRICING — NOT YET FILLED

**To be established by audit, in code and runtime logs, for EVERY consumption site.** For each: which of the three feeds is the input today, and which *should* be, with the reason.

⛔ **THE TABLE MUST BE CUT THREE WAYS, PER KYLE: by JOB, by TRADING LANE (VTS · paper · live), and by ASSET CLASS** — because the asset classes are scanned by different scanners with different data available to them.

**Jobs to enumerate:** signal generation (where the levels are SET) · ranking · entry trigger · exit trigger (stop and target separately) · fill simulation · position marking · booking the result · sizing · the scanner sweep.

**STATUS: NOT YET VERIFIED. Nothing is asserted here yet.**

---

## 3. ⏳ WHERE THE PRICE IS TRANSFORMED BEFORE USE — NOT YET FILLED

⛔ **Kyle: *"where our pricing is being manipulated one way or another, such as the midpoint stuff, that needs to be highlighted."***
**Known entry point for the audit (verified previously, to be re-verified here): the v2→v1 translator overwrites the `last` field with a computed midpoint, at the FEED layer — so every downstream consumer inherits it whether or not a midpoint is the right input for that consumer.**

**STATUS: NOT YET FILLED.**

---

## 4. ⏳ WHERE WE HAVE TROUBLE GETTING THE DATA — NOT YET FILLED

To cover: coverage gaps by symbol and by asset class · API rate limits · silent stalls (an open socket delivering nothing) · restart behaviour · retention reach of each store.

**STATUS: NOT YET FILLED.**

---

## 5. ⏳ THE TARGET STATE — NOT YET FILLED

**The recommendation: which feed serves which job, in which lane, for which asset class — and WHY, in terms of what makes that data more trustworthy for that job.** Including whether any job should draw on a **mix** of two or three feeds.

⛔ **This section is written LAST and only after Parts 2-4 are verified.** Writing it first would be the piecemeal habit this document exists to end.

**STATUS: NOT YET FILLED.**
