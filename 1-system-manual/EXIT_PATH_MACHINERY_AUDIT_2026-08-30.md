# EXIT-PATH MACHINERY AUDIT — 2026-08-30

**Kyle-directed.** *"Look at the machinery that is executing the trade… what data it's pulling in… is this how I would build it, or a machine built over top of broken code with pieces of two or three different intended designs fighting each other?"*

**Method:** three independent fresh-context readers on the code at `origin/migration/aws-supabase`, plus direct verification by CC-C of every load-bearing claim before it was recorded here. **A reader HIT is a lead; nothing below is recorded unless it was re-derived at the ref or against the live database.**

**Scope note:** this audit is about the MACHINERY, not the trade outcomes. That was the point of the directive — prior F-G work looked at results, and results cannot show you a second design still wired in.

---

## 0. THE VERDICT

**It is not one design. Four are resident at once, all still wired to something:**

1. **An original REST-polled, strategy-aware exit** — `trading-engine.ts` + `strategy-engine.ts`. Monitor orphaned; one close route still live.
2. **A WS-mid pricing layer that redefined "last" as "mid" and renamed nothing** — `kraken-v2-translator.ts` + the ticker handler.
3. **A book-based layer added alongside it**, writing the same cache slot under the same tag — `handleV2BookUpdate`.
4. **A venue-only, depth-walked, provenance-stamped design** (P19-B8.5 / B-EXIT-PROVENANCE) — the most careful of the four.

**Layer 4 is well built and honest about its own limits. Its problem is that it was added OVER the others rather than INSTEAD of them.**

---

## 1. ⛔ CAN CHANGE A TRADING DECISION

### 1.1 THE CRYPTO EXIT PRICE IS NON-DETERMINISTIC BETWEEN TWO FEEDS

**Two producers write the same cache slot with the same `source` tag:**
- `kraken-websocket-adapter.ts:700` — ticker leg, `producer:'kraken_ws_ticker'`, value = `c[0]` which `kraken-v2-translator.ts:52-58` has already overwritten with `(bid+ask)/2`
- `kraken-websocket-adapter.ts:945` — book leg, `producer:'kraken_ws_book_mid'`, value = the mini-book BBO mid

**The engine's actionability gate reads `source`, never `producer`** — `active-execution-engine.ts:1269` `isKrakenVenueSource(priceResult.source)`.

⇒ **Which number a stop is compared against depends on which socket message arrived last.** The `PriceProducer` union exists precisely to tell these apart (`live-pricing-adapter.ts:55-99`) — it was built, documented, and then not consulted at the one place it would change a decision.

### 1.2 THE MAKER EXIT RESTS ON A MID — AND THAT IS THIS BATCH'S OWN SUBJECT

`active-execution-engine.ts:1507` evaluates a resting sell via `tradedThrough('sell', currentPrice, limit)` = `currentPrice >= limit` (`pending-maker-logic.ts:23`), then books the fill **at the limit with the maker fee**.

⛔ **A resting sell only fills when a BUYER LIFTS IT — i.e. when the BID reaches the limit.** Triggering on a mid fires while `bid < limit <= ask` — **roughly half a spread early — and records a maker fill that may never have happened.**
★ **The module header calls its model *"never optimistic."* With a mid as the input it is optimistic by construction.** ⚠️ **The book is available at that exact point in the loop (`:1381-1383`) and is not consulted.**

### 1.3 FORCE-CLOSE BYPASSES THE VENUE-ONLY RULE — VERIFIED AT THE REF

`active-portfolio-manager.ts:307` calls `getPriceWithFallback(symbol, 5000)` and rejects only `no_reliable_price` (`:311`). **It never applies `isKrakenVenueSource`.**
⇒ **A force-close can exit a real position at `last_known_good`, `entry_seed` or `mock`** — exactly the sources P19-B8.5 removed from the exit monitor as not actionable. **One actuator has the strict gate; two do not.**

### 1.4 VTS AND THE ACTIVE ENGINE BOOK DIFFERENT EXIT PRICES FOR THE SAME SIGNAL

`evaluateTECExit` returns `exitPrice` — the **level**, clamped to the stop or target (`tec-evaluator.ts:273`, `:282`).
- **VTS reads it and books it** (`vts-runner.ts:3238`, `:3915`) with a flat friction cost.
- **The active engine never reads it** — every branch substitutes `price: currentPrice` and then depth-walks it.

⇒ **On a stop, the level is BY DEFINITION better than the price that breached it.** **These two lanes are the Phase-25 calibration inputs and they are not measuring the same quantity.**

### 1.5 A LIVE ROUTE PRICES AN EXIT WITH `Math.random()`

`POST /api/trades/:id/close` → `trading-engine.ts:658` → `marketPrice * (1 - Math.random()*0.05/100)`, against a REST last trade, on a different table (`trades`). **Live on both paper and live engines.**
⚠️ **It may throw before reaching that line** (an unmapped symbol goes straight to the REST `pair` param, `kraken.ts:259-262`) — **which means the lane has rotted rather than merely diverged.** Either way it is reachable code pricing an exit with a random number.

### 1.6 SIGNAL GENERATION IS UNGATED ON BAR AGE — THE REAL VERSION OF THE SNAPSHOT CONCERN

⛔ **`xstock-ohlc-cache.ts:381-395` (`readSnapshotBars`) has NO time bound at all** — it ranks by `bucket_ts DESC` and takes the top N. The prewarm that fills those tables reads a **14-day** window (`b-new-34b-prewarm-snapshot.ts:144`).
**`scanner.ts:909-910` then takes `ohlc[ohlc.length-1].close` as `price`**, and `scanner.ts:567-572` states the position outright: *"No freshness GATE — OHLC bar history is the source of truth, gated only by `min_ohlc_history_bars`"* — **a bar COUNT, not a bar AGE.**
⇒ **A stale bar close can price a NEW ENTRY.** ★ **Kyle's instinct about the reopen was right and aimed one object across: the restore path does NOT touch prices; the SIGNAL path is the ungated one.**

---

## 2. ✅ WHAT THE REOPEN ACTUALLY DOES — the snapshot theory, resolved

**`runWeekendRestartCore` (`session-lifecycle-controller.ts:417-465`) does exactly three things:** prewarm OHLC bars (14-day lookback), resume the scanner, and flip `weekend_suspended` → `open`.

✅ **It does NOT touch `entry_price`, `stop_loss` or `take_profit`.** All four `UPDATE vts_open_trades` sites in the codebase write only `state`/`closed`/`updated_at` (`vts-trade-persistence.ts:192`, `:203`, `:238`, `:281`).
⇒ **There is no price snapshot seeding positions at the reopen.** The 48-hour figure in the code is DBS's lookback depth (192 × 15m), not a snapshot window.
⚠️ **BUT:** `latestEquityTick` (`equity-spot-archiver.ts:112`) is **never cleared, has no TTL, and `stopEquitySpotArchiver` has zero callers** — so Friday's last tick sits in memory until Sunday's first tick overwrites it. **Every current reader enforces an age bound; the gate is on the reader, not the writer.**

---

## 3. ⛔ THE xSTOCK "ORDER BOOK" IS NOT A BOOK

**We subscribe to `ohlc` and `ticker` only** (`equity-spot-archiver.ts:237-247`). **We never subscribe to `book`.**
**Everything downstream that thinks it is asking a book is answered by a single ticker row:** `depth-source.ts:49-70` does `SELECT ask, ask_qty, bid, bid_qty FROM xstock_spot_ticker_snap … ORDER BY captured_at DESC LIMIT 1` and synthesises a one-level ladder.

⛔⛔ **AND OUR OWN CODE RECORDS THAT A REAL BOOK EXISTS AND IS NOT CONSUMED** — `imf-liquidity.ts:18-22`: *"verified via the `ws-equities` `book` channel = a real CLOB depth ladder."*
⇒ ★ **Every xStock spread, depth and "bid we would sell into" is inferred from one row of a channel that is not a book.** **This is the clearest instance of the layered-design problem: a component built for one purpose is being consulted by another that needs something it cannot provide.**

---

## 4. ⛔ EIGHT PRICE REPRESENTATIONS, THREE SILENT CONVERSIONS

| # | number | where |
|---|---|---|
| 1 | ticker BBO mid | `kraken-v2-translator.ts:56` |
| 2 | book BBO mid (locally reconstructed) | `kraken-websocket-adapter.ts:922` |
| 3 | REST ticker mid — **or last trade, same variable, same branch** | `active-execution-engine.ts:1305` |
| 4 | `last_known_good` re-serve | `live-pricing-adapter.ts:1088-1094` |
| 5 | equities ticker mid | `equity-spot-archiver.ts:134` |
| 6 | `xstock_spot_ticker_snap.last` — a real last trade, read by VTS | `vts-runner.ts:2937` |
| 7 | depth-walk VWAP — the recorded fill | `depth-walk.ts:45` |
| 8 | `position.avgPrice` — force-close with no feed | `active-portfolio-manager.ts:315` |

**THE SILENT ONES:**
- **`last` becomes a mid and keeps the name.** The consumer reads it into a variable named `lastPrice`, logs it as `price=`, and stamps it `kraken_ws_ticker` — a token the provenance vocabulary describes as *"a clean ticker PRINT."* **It is not a print.**
- **One cache field alternates meaning by writer.** `price-cache.ts` `CachedPrice.price` is a REST **last trade** on a bucket refresh (`:177`) and the **WS mid** on `updateFromWebSocket` (`:402-415`) — and that writer carries the previous record's `bid`/`ask` forward untouched (`:407-408`). **VTS reads its crypto exit price from exactly this cache.**
- **`observedAt` is a receipt clock on every live leg**, while `active-execution-engine.ts:1237` calls it *"A REAL venue observation stamp."* The distinction the column names does not exist in the data.

---

## 5. ✅ THE RATCHET — MEASURED, AND IT IS A SETTING NOT A BREAK

**Kyle: *"The ratcheting functionality for trailing exits has been off for the majority of the time we've been in paper mode."* CONFIRMED, with numbers.**

**Measured on staging `/tmp/trailing-states.json`, 705 states:**
- `breakEvenLatched` true: **0 of 705 — never once**
- `tradeMode`: **`TARGET` on all 705** — not one has entered `TRAILING_TAKE`
- stop moved above entry: **134**, all of them `targetLatched` — i.e. target-lock, not ratchet

**THE CAUSE IS A LIVE DB SETTING, deliberately made:**

| asset class | `break_even_enabled` | `updated_by` |
|---|---|---|
| crypto_spot | **false** | `B79.TEC.hostile_sim_restore` (2026-05-08) |
| **xstock_spot** | **false** | **`kyle-directive-2026-05-21-disable-xstock-be`** |
| crypto_perp / xstock_perp | false | `B79.TEC` (2026-05-08) |

⇒ **RULE-24 OUTCOME (2): working as configured. Off since early May — the whole of paper mode.** The code comment says xStock *"flips after B79.4 ablation evidence per RUNNING_ISSUES #80"*; `#80` is routed to Phase 25. **The decision is waiting on evidence that may never have been collected.**
⚠️ **CONSEQUENCE: with break-even off, a winning trade never protects its entry. 571 of 705 stops sat exactly where they started.**

### 5.1 A HYPOTHESIS I CHASED AND DROPPED
I suspected `/tmp/trailing-states.json` was being wiped, losing ratchets. **REFUTED: `/tmp` is on rootfs, the box has not rebooted since 2026-03-30, and the file is live with 705 states.** *(systemd does age-clean `/tmp` at 30d, but the file is written continuously so its mtime never ages.)*
⚠️ **A real fragility does remain: the ratcheted stop is NEVER persisted to the database.** It lives in memory plus that one file; `vts_open_trades` keeps the **original** stop, so anything reading positions from the DB sees the unratcheted level unless the file is also read.

---

## 6. ⛔ THE LOW BID: STILL UNRESOLVED, AND THE EVIDENCE CANNOT SETTLE IT

**I previously told Kyle *"the feed is correct, the writer is correct, the arithmetic is correct."* THE FIRST CLAIM IS WITHDRAWN — I could not have known it.**

**Verified:** between `JSON.parse` and the `INSERT`, the bid is a **verbatim pass-through** — no arithmetic, default, clamp or carry-forward (`equity-spot-archiver.ts:145`, `ticker-batch-writer.ts:110-138`). A repo-wide search finds **exactly one writer** to that table.
⛔ **BUT THE STORED ROW CANNOT CORROBORATE THE WIRE.** `parseTickerSnap` computes the engine's mark **and** builds the DB row **from the same parsed object in the same call**. They are **siblings, not witnesses** — their agreement proves internal consistency and nothing about fidelity to the venue. **No raw frame is retained anywhere.**

★★ **A THIRD POSSIBILITY, NOW THE LEADING ONE: `handleMessage:227` does not read `msg.type`.** Snapshot vs update is not discriminated and **no column records which** — so a partial, auction-state or session-boundary frame whose `bid` is not a live two-sided quote **would be archived as an ordinary quote and be indistinguishable afterwards.**

**SUPPORTING EVIDENCE, from a flag we already store:**

| `is_extended_hours` | snaps | stub books | rate |
|---|---|---|---|
| false (regular hours) | 10,734,150 | 85 | **0.001%** |
| **true (extended)** | 3,842,871 | **39,172** | **1.019%** |

⇒ **A THOUSANDFOLD separation.** The venue marks the session on every row, and **nothing in the pricing path reads it.**

⇒ ⛔ **THE ONLY INSTRUMENT THAT SETTLES KRAKEN-VS-US IS A RAW-FRAME CAPTURE at `equity-spot-archiver.ts:221`, before the parse, correlated to a stub row.** Nothing stored today can do it.

---

## 7. ⛔ WHAT THIS DOES TO F-G-2 — THE FIX WOULD MAKE IT WORSE

**F-G-2 replaces the midpoint with the bid. On a stub book the bid is the collapsed side.**

| | our bid | true last | mid vs last | **bid vs last** | |
|---|---|---|---|---|---|
| NOW/USD | 92.50 | 143.20 | −17.1% | **−35.4%** | ⛔ WORSE |
| TGT/USD | 48.45 | 163.18 | −35.0% | **−70.3%** | ⛔ WORSE |
| WEN/USD | 7.57 | 8.21 | +62.1% | −7.8% | better (ask was broken) |

⇒ **On two of three the fix reads a price roughly TWICE as far from the true last trade as the midpoint it replaces** — and a long's stop fires on a LOWER price, so a collapsed bid triggers it MORE readily.
⇒ ⛔⛔ **BOOK QUALITY IS A PREREQUISITE OF F-G-2, NOT A PARALLEL CONCERN.** *"Read the transactable side"* only helps if the transactable side is real.

★ **AND KYLE'S FRAMING CORRECTION WAS THE RIGHT ONE:** I proposed preferring the last trade when the spread is absurd. **That treats the symptom.** His position — *"we shouldn't be having any ridiculous spreads; root out the issue"* — is the correct one, and §6 is where that root-cause work now sits.
