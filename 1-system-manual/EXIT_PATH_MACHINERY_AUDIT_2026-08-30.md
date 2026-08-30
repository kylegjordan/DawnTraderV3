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


### 5.2 ⛔⛔ THE PROVENANCE KYLE SUPPLIED — AND IT IS THE PART NO ARTIFACT HOLDS

**Kyle, 2026-08-30, verbatim in substance:** *"I did make the decision to turn off the ratcheting exits… a lot of it had to do with the breakevens exiting, causing us to exit trades before we could see how they were gonna actually finish. And, therefore, we weren't learning anything from them. **And that was when we were just using the VTS, not even using the paper trading system.**"*

⇒ ★★ **THE PREMISE WAS A LEARNING-DATA PREMISE, NOT A RISK PREMISE.** Break-even was truncating trades before their outcome was observable, which destroyed the very thing the VTS existed to produce. **On a pure learning lane that is a correct call.**
⇒ ⛔⛔ **AND THE CONDITION IT RESTED ON NO LONGER HOLDS. We are not VTS-only any more.** Paper trading is live, it models fills, and it is the surface we intend to take to live mode in Phase 21. **A protective stop that truncates a learning sample is a cost; a missing protective stop on a lane headed for real capital is a different question entirely.**

**THE GATE IS NAMED AND IT HAS NOT MOVED.** `trailing-exit-controller.ts:1119-1122` says xStock BE *"flips after B79.4 ablation evidence per RUNNING_ISSUES #80."* **`#80` reads: *"B79.4 — extend B73 exit-strategy ablation to xstock_spot… Currently blocking per-asset-class TEC config decisions for xstock_spot. OPEN — NEAR-TERM."*** ⚠️ **Its sequencing precondition was met 2026-05-08 and it has been OPEN and "near-term" since 2026-05-11 — sixteen weeks.**

⇒ ⛔ **SO THE LIVE STATE IS: break-even off on all four asset classes; the premise for switching it off has expired; and the evidence that would settle turning it back on has not been collected in four months.** ★ **571 of 705 stops never moved from where they were placed.**

**RULE-24 OUTCOME (2) — WORKING AS CONFIGURED, DECISION MISSING.** ⛔ **NOT a defect and NOT to be flipped unilaterally: it is a risk-posture call and it is Kyle's.** ✅ **What this audit adds is that the question is now RIPE — the original reason is spent, and Phase 21 makes it consequential.**

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

---

## 8. ⛔ THE PROVENANCE READ — WHAT WAS BUILT, AND WHY (Kyle-directed 2026-08-30)

> **CORPUS: all 14 files of `bridge/canonical/`** plus recovered git history, read by two independent fresh readers whose load-bearing claims are **re-derived at the ref below, with positive controls.**
> **Kyle's instruction:** *"read up on the intent of all these pieces that were built and have been slapped together. Let's understand what was built and why."*
> ⚠️ **This corpus is INTENT, never current-state truth.** Where it and today's code disagree, that gap IS the finding.

### 8.0 ⛔ PREMISE CORRECTION — THE CORPUS IS **NOT** FROZEN, AND OUR OWN RULES SAY IT IS

`workflow-01-scope/SKILL.md:23` and `:56` describe `bridge/canonical/` as **"never edited"** / **"NEVER edited (frozen historical record)"**.

**MEASURED AT THE REF.** `git log -- bridge/canonical/` returns governance-era commits touching it — `69b3ed8f2` (B-NEW-34 closure), `af99bd5dd` (B79.0n.STRATEGY), `8ef70628d` (B-4.7). Per-file last-commit dates run from **2025-12-13** (`..._Invariants_...md`, genuinely frozen) to **2026-06-11** (`..._Regime_Strategy_Mapping.md`).

⇒ **A session told "frozen pre-governance corpus" dates everything here to Dec 2025 – Feb 2026 and is wrong by four months on the regime mapping.**

And the editing left the corpus self-contradictory:
- `..._Execution_Flow.md:299` — *"**Note (2026-05-15):** previous wording \"5-minute intervals = ~2.5 days\" was doc drift; the canonical bar interval has always been 60 minutes… B-NEW-34 … corrected this doc."*
- `..._Current_State_Reference.md:174` — **still reads** *"721 candles per symbol (5-minute intervals)"*.

**The correction landed in one file and not its sibling.** A session consulting the second reads a known-wrong value as original intent.

**DISPOSITION (§9.4 #3): own batch — `B-CANONICAL-FREEZE`, owner CC-C, placed in `PHASE_19_PLAN` after the exit-path redesign.** Either the corpus is frozen (move the three edits to a dated addendum) or the rule is wrong (say so, and stamp every edited file with its edit date). **Ledger: `#948`.**

---

### 8.1 ⛔⛔ THE HEADLINE: **THE FOUNDING ARCHITECTURE NEVER SAID WHICH PRICE DRIVES A TRADE**

**RE-DERIVED ACROSS ALL 14 FILES, WITH POSITIVE CONTROLS:**

| term | files |  | control term | files |
|---|---|---|---|---|
| `midpoint` · `mid-price` · `mark price` · `last trade` | **0 · 0 · 0 · 0** | | `price` | **10** |
| `tick size` · `venue` · `rounding` · `representable` | **0 · 0 · 0 · 0** | | `bid` / `ask` | **4 / 6** |
| `staleness` · `max age` · `quote age` | **0 · 0 · 0** | | `spread` / `slippage` | **6 / 9** |

★ **The instrument finds the vocabulary it is looking for. The eleven terms are genuinely absent.**

The cache struct carries all three prices and **defines the relationship between none of them** — `..._Execution_Flow.md:276-288`:
```
interface CachedPrice { symbol; price; ask; bid; volume24h; high24h; low24h;
                        lastSource: 'kraken_ws' | 'kraken_rest'; lastUpdatedAt; }
```
`price` sits beside `ask` and `bid` with **no stated relationship to them**, and `price` is never defined as last-trade, mid, or anything else. Every exit description in the corpus says only *"live price"* or *"currentPrice"*. **`bid` and `ask` appear corpus-wide in exactly two places — the two struct lines — and are never consumed by anything.**

Spread enters **only on the entry side**, in the profitability gate (`:542`): `const totalCost = (feeRate × 2) + (spread × 1.1) + slippage;` — **it never enters the exit path at all.**

⇒ ★★ **THIS REFRAMES §4 OF THIS AUDIT. The eight price representations are NOT drift away from a specification — THERE WAS NO SPECIFICATION.** Every layer that needed "the price" invented its own answer, in isolation, and each was individually defensible. **That is the mechanism behind Kyle's "pieces of two or three different intended designs fighting against each other."**
⇒ ★ **AND IT REFRAMES F-G-1: the venue price grid was not repairing a regression. The intent that a price must be venue-representable NEVER EXISTED** — prices were treated as continuous real numbers throughout.

---

### 8.2 ⛔⛔ THE ORIGINAL EXIT WAS A **STATIC BRACKET**, AND IT WAS **DELETED ON 2026-01-18** — NOT AMENDED

Recovered from git at `485699a2f^:bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md`. **This section exists in NO file on disk today.** Verbatim:

```
4. Evaluate exit conditions:
   ├─ currentPrice <= stopLoss   → Stop-loss triggered
   └─ currentPrice >= takeProfit → Take-profit triggered
```

⛔⛔ **AND THE FILL WAS AT THE *LEVEL*, NOT AT THE OBSERVED PRICE** (`§6.2`, verbatim):
```
triggerPrice = 98.00 (stop-loss hit)
STEP 1: Apply Exit Slippage (0.15%)
  actualExitPrice = triggerPrice × (1 - 0.0015) = 97.85
exitSlippage = |triggerPrice - actualExitPrice| × quantity
```

★★ **READ THAT AGAIN, BECAUSE IT IS THE SINGLE MOST CONSEQUENTIAL LINE IN THE WHOLE PROVENANCE READ.** The trade was **DECIDED** on `currentPrice` crossing the level, but **FILLED** at the *pre-declared level* degraded by a constant — **never at the price that triggered it.** A modern reader assumes fill = the observed price. **The founding design says the opposite.**

⇒ ★★ **THIS IS THE ORIGIN OF §1's VTS-vs-ACTIVE SPLIT, AND IT INVERTS WHICH ONE IS "BROKEN."** VTS books the level (999/999 stops fill at exactly the stop — `#914`). **VTS IS NOT A DEFECT. VTS IS DESIGN 1, PRESERVED UNCHANGED.** The active path's depth-walked VWAP is the *newer* answer, added without anything ever reconciling the two. **The Phase-25 lanes measure two different worlds because one lane never left 2025.**
⚠️ **This does not make VTS *right* — a fill model with no book is still a world where exiting is free. It means "fix VTS to match active" is the wrong framing: this is a DECISION about which model we want, not a bug.**

**AND AFTER THE DELETION, THE CORPUS CONTAINS NO SURVIVING STATEMENT OF WHAT TRIGGERS AN EXIT AT ALL.** `targetPrice` survives only as an input to the entry-side profitability gate; `stopPrice` only as an input to position sizing (`Phase_8:352`). **The only statement of exit-trigger logic in the entire founding corpus was deleted seven months ago and never replaced.**

---

### 8.3 ⛔ FIVE SUCCESSIVE EXIT DESIGNS, AND THE PIVOT IS DATABLE TO ONE DAY

| # | design | first appears | evidence |
|---|---|---|---|
| **1** | **Static bracket**, fill at `triggerPrice × (1−0.0015)` | 2025-12-12 | deleted §6, `485699a2f^` |
| **2** | **Trend-slope trailing** — `TrailingStop = BaseStop × (1 + Acceleration × TrendSlope)`, `BaseStop = 1.5%`, `Acceleration = 0.002 × slope(EMA20)` | 2026-01-08 `ea958bffe` | Math Arch §10.2 |
| **3** | **Regime-volatility trailing + two-stage latch** — `stopDistance = baseDistance × (1 + volatilityFactor × regime.volatility)` | 2026-01-18 `485699a2f` | Exec Flow §10.3 |
| **4** | **APR-SLE** — "Adaptive Profit Realization & Stop-Loss Evolution" | 2026-01-18 `1dbc8c187` | Core Files `:163` |
| **5** | **Per-strategy exit geometry** — ATR stops, R-multiple targets | 2026-06-11 `8ef70628d` | Regime Mapping `:23,:110` |

⛔ **DESIGNS 2 AND 3 ARE TWO DIFFERENT FORMULAS FOR ONE NAMED MECHANISM.** Design 2 is driven by **trend slope**; design 3 by **regime volatility**. Both are canonical, both survive in the corpus today, **and neither was ever reconciled against the other.**

⛔⛔ **DESIGN 4 WAS NEVER DESIGNED IN A DOCUMENT.** `apr-sle-engine.ts` appears **exactly once corpus-wide**, as an inventory row: *"| `server/services/apr-sle-engine.ts` | Adaptive Profit Realization & Stop-Loss Evolution |"*. It entered the record as a **catalogue entry**, listed adjacently to `trailing-exit-controller.ts` — **no formula, no rationale, no statement of how the two relate or which is authoritative. Two exit engines side by side, one of them entirely undocumented.** Neither is in `DELETED_COMPONENTS_LOG.md`.

⇒ ★★ **THIS IS THE DIRECT ANCESTOR OF THIS AUDIT'S §0 VERDICT.** The audit found **four exit designs resident in the code at once**. The provenance shows **five in the documents**, arriving the same way each time: **added OVER the previous one, never INSTEAD of it, with no reconciliation and — twice — no design text at all.** The code did not decay into this state. **It was built this way, one undocumented addition at a time.**

---

### 8.4 ⛔ BREAK-EVEN AND MAKER/TAKER: **NEVER DESIGNED. NOT ONCE.**

**RE-DERIVED, WITH CONTROLS:**

| absence | files | ✅ control | files |
|---|---|---|---|
| `breakeven` · `break-even` · `break even` | **0 · 0 · 0** | `trailing` | **4** |
| `ratchet` | **0** | `stop-loss` | **5** |
| `maker` · `post-only` · `resting` · `limit order` · `order type` | **0 · 0 · 0 · 0 · 0** | `take-profit` | **3** |
| `exit_reason` · `close_reason` | **0 · 0** | `taker` · `latch` | **1 · 1** |

⛔ **BREAK-EVEN HAS NO FOUNDING DESIGN.** No latch, no enable, no concept. ⚠️ **`CLAUDE.md` rule 15 names "BE enable" as a per-asset-class knob and cites a "BE-latch origin" — that origin is not in this corpus.** ⇒ **§5's finding stands and strengthens: Kyle's decision to switch it off was a decision about a mechanism that never had a stated purpose to begin with.**

⛔ **TAKER WAS ASSUMED, NEVER DECIDED.** `taker` appears twice, both in one fee table — *"Entry Fee 0.10% Kraken taker fee | Exit Fee 0.10% Kraken taker fee"* — and `maker` appears **zero times corpus-wide.** There is no order-type model anywhere. **The exit was modelled purely as an instantaneous price event plus a constant haircut.** `Complete_Project_History.md:44` names a layer *"[Order Management + Adaptive Sizing + Trailing Exits]"* — **"Order Management" is never described anywhere in the corpus.**
⇒ ★★ **THIS IS WHY §1's MAKER-EXIT-ON-A-MID FINDING HAS NO GOVERNING RULE TO CITE. Resting orders were never in the design.** The maker exit is a later capability bolted onto a fill model that assumed you always cross.

⛔ **AND THE REAL TRADE TABLES WERE NEVER DESIGNED TO RECORD *WHY* A POSITION EXITED.** `paper_sim_trades` / `live_trades` (`Exec Flow §14.1`) carry no exit-reason field; the only `resultType?: 'take_profit' | 'stop_loss' | 'timeout'` in the corpus is on the **VTS simulator's in-memory record** (`Phase_11:223`). ⇒ **A timeout exit was designed for the simulator and never for the real path.**

---

### 8.5 ✅ WHAT *WAS* SPECIFIED — AND THE ONE THAT IS STILL BINDING

`..._Invariants_Design_Guarantees.md` (2025-12-13, the genuinely frozen file) declares 42 invariants. The four that bear on this audit:

- **T1** *"Every trade MUST have a stop-loss price below the entry price… There are no exceptions to this rule."* ⚠️ **T1 constrains the stop ONLY AT ENTRY, relative to entry price. NOTHING IN THE CORPUS CONSTRAINS HOW A STOP MAY MOVE AFTERWARDS** — which is precisely the gap `#923` (the trailing exit ratcheting stops off-grid) sits in.
- **F4** *"Slippage MUST always work against the trader… There is no 'positive slippage' in the simulation model."* ✅ Still right.
- **F7** *"Production trading decisions MUST use only real market data… If no real price is available, the operation must fail or wait… 'no_reliable_price' is an explicit failure state, not a fallback."* ✅ **STILL LIVE, STILL CORRECT — and §1's force-close finding VIOLATES IT** by bypassing the venue-source gate.
  ⚠️ **BUT F7 WAS UNSATISFIABLE AS WRITTEN.** It requires provenance traceable to **four** sources; the struct's own field can represent **two** (`'kraken_ws' | 'kraken_rest'`). **Binance and CoinGecko prices were designed to be reachable and unstampable.** ★ **That is the direct ancestor of §1's non-determinism finding: the gate reads a `source` tag that never had enough values to carry the answer.**
- **A8** *"Position monitoring MUST run at least every 2 seconds… Slower monitoring risks missing exit triggers."* ✅ Still right.

⛔ **AND A STRUCTURAL TENSION INSIDE THE FOUNDING DOCUMENT ITSELF.** **P5** states *"Trading parameters belong in `guardrails_v2`… **Magic numbers are prohibited**."* But `guardrails_v2` as documented has **six parameters — risk-per-trade, max position, max open, cooldown, daily-loss kill-switch, max exposure — and NOT ONE of them is an exit parameter.** Meanwhile `BaseStop = 1.5%` and `Acceleration = 0.002` sit as literals in a document.
⇒ ★★ **EVERY GOVERNED RISK PARAMETER IS ENTRY-SIDE. THE EXIT PATH WAS NEVER BROUGHT UNDER CONFIGURATION GOVERNANCE AT ALL.** That is not a drift; it is the founding state, and it explains why exit behaviour today is spread across code literals, a `/tmp` file and four engines.

⛔ **THERE IS NO FRESHNESS INVARIANT.** Freshness exists only as bucket refresh *parameters* (2s / 15s / 30s / 60s) and one test criterion. `Phase_8:401` says *"REST API fallback **if cache stale**"* — **and "stale" is never defined anywhere.** The only numeric bar was a validation target that **failed by a factor of 62**: *"Feed Latency < 100ms"* vs measured *"6233 ms ❌"*.
⇒ ★ **§1's "signal generation is ungated on bar age" is not a rule someone removed. No such rule was ever written.**

---

### 8.6 ⛔ THE ORDER BOOK WAS A VOCABULARY THE MATH BORROWED, NOT A FEED ANYONE DESIGNED

The Market Data Layer enumerates every feed and **depth is not among them** (`Exec Flow:45-46`): *"Kraken REST **(OHLC, Ticker)** … Kraken WebSocket **(Real-time Ticks)** … Binance/CoinGecko (Fallback) … OHLC Cache."*

Yet **LQ — an IMF hard gate — is defined three mutually incompatible ways, two of which need book data**: `LQ = bidVolume / askVolume` (`Math Arch:61`) · `log10(bidVolume × askVolume)` (`:450`) · `log10(volume24h × price) × 10` (`Exec Flow:338`). **Same symbol, same threshold `LQ ≥ 40`, three different quantities — and only the third is computable from the feeds the architecture specifies.** A fourth phantom, *"Depth Imbalance > 1.4"* (`Regime_Strategy_Mapping:89,173`), is a **live regime trigger with no formula, no source and no ingestion anywhere.**

⇒ **In the FOUNDING corpus, no order-book ingestion was ever designed for either asset class** — the synthesised ladder was the only thing buildable to satisfy metrics whose definitions assumed a feed that was never specified.

⛔⛔ **BUT THE BATCH RECORD REFUTES THE COMFORTABLE VERSION OF THAT STORY, AND THIS IS THE HARDEST FINDING IN THE WHOLE PROVENANCE READ — SEE §8.7.** *(Corrected before dispatch: an earlier draft of this section concluded "no order-book ingestion was ever designed" full stop. True of `bridge/canonical/`. **False of the batch record**, which contains the question, the empirical answer, and a named objective to plumb it.)*

---

---

### 8.7 ⛔⛔ THE xSTOCK ORDER BOOK: **ASKED, ANSWERED, OBJECTIVE-ASSIGNED — AND STILL NOT SUBSCRIBED TO**

**This is the sharpest finding of the provenance read, and it is a four-step chain every link of which is verified at the ref.**

**STEP 1 — THE QUESTION WAS WRITTEN DOWN.** `BATCH_79_SCOPE.md:508` lists what crypto already has: *"- Order book depth (top N levels)"*. The xStock column, `:523-525`, verbatim:
```
- Bid/ask spread:   TBD — does Kraken xStocks WS publish bid/ask? Or only mid?
- Order book depth: TBD — is the Kraken Equities WS book channel exposed?
- Min order size, lot size, price tick: TBD — ... but tick size?
```
⇒ **At the moment xStocks entered the system (2026-05-07), the order book was an open question in the scope. Neither planned nor ruled out.**

**STEP 2 — IT WAS ANSWERED, EMPIRICALLY, AND THE ANSWER WAS YES.** `B_XSTOCK_GLOBAL_FILTER_SCOPE.md:79` (batch **B-XSTOCK-CALIB / B.1.5**; Langston's condition 1 required exactly this method), verbatim:
> *"**O0 PRELIMINARY FINDING (2026-05-28, read-only `book`-channel capture, no order placed):** the ws-equities `book` channel returns a FULL 20-level depth ladder (price+qty) for both TSLA/USD AND thin GLD/USD → **execution venue is a CLOB, not RFQ.** Depth IS the binding gate… MM depth is real even on thin names (TSLA 787@-few-cents; GLD 1,100-3,300/level)."*

**STEP 3 — PLUMBING IT WAS A NAMED OBJECTIVE OF THAT BATCH.** Same file, `:81`: *"**O2 — Order-book depth plumbing** (R2). *Verify:* depth visible in Filter Diagnostics; gate fires on thin depth."* And Langston's condition 2 specified the home: *"R3 = a SEPARATE `xstock_spot/imf-liquidity.ts` module."*

**STEP 4 — AND TODAY NOTHING SUBSCRIBES TO IT.** Verified at the ref, `equity-spot-archiver.ts:237-247`:
```js
ws.send(JSON.stringify({ method:'subscribe', params:{ channel:'ohlc', symbol:state.symbols, interval:1 }}));
ws.send(JSON.stringify({ method:'subscribe', params:{ channel:'ticker', symbol:state.symbols }}));
```
**`ohlc` and `ticker`. That is the complete subscription list. A repo-wide search for a `book` channel subscription across the market-data and passive-archive services returns ZERO.**

★★ **AND THE MODULE THAT LANGSTON NAMED AS THE HOME CARRIES THE CONFIRMATION AS A COMMENT WHILE READING A ONE-LEVEL LADDER.** `xstock_spot/imf-liquidity.ts:18-22` records *"verified via the `ws-equities` `book` channel = a real CLOB depth ladder"* — and §3 of this audit found the depth it actually consumes is **one row of `xstock_spot_ticker_snap` synthesised into a single level.**

⛔ **THE GOVERNANCE RECORD NOW CONTRADICTS ITSELF ON WHETHER THE CHANNEL EXISTS:**
- `P19_B4b_1_SCOPE.md:76` — *"A real xStock depth feed (**if Kraken equities ever exposes a book channel**…) is a future item"*
- `MULTI_ASSET_VTS_EXPANSION_PLAN.md:172` — *"the execution venue is a real CLOB (**20-level depth ladder confirmed**)"*

**Two of our own governance documents assert opposite things about the same channel** — the #641 two-copies shape, on the single question that decides whether our liquidity gate is measuring anything real.

⚠️ **AND THE RESEARCH KYLE COMMISSIONED SAID TO USE IT.** `X-Stocks Volume Feed Research - Multi LLM.md:86`: *"The **live Level-2 order book** (`book` channel): sum the resting market-maker depth within whatever slippage band you'll tolerate… The ticker already hands you top-of-book `bid_qty`/`ask_qty`; the `book` channel gives the full ladder."*
**What shipped instead was the declaration at `B_2_LQ_SWEEP_RESULTS.md:57`: *"DEPTH is the correct, permanent liquidity screen for xStocks"* — using top-of-book, with the full-ladder question already answered and unconsumed.**

⇒ ★★ **THIS REWRITES §3 AND §6 OF THIS AUDIT.** The xStock non-book is **not** an unavoidable consequence of a feed we never had. **We confirmed we have the feed, assigned an objective to plumb it, and shipped the one-level synthesis anyway.** ⇒ **And it is the strongest available lead on §6's unresolved low bid: a synthesised one-level ladder built from a ticker row we never discriminate by frame type is exactly the instrument that would produce an impossible bid — and the real ladder that could contradict it is one subscription line away.**
**DISPOSITION (§9.4 #3):** own batch — **`B-XSTOCK-BOOK-LADDER`**, owner CC-C, placed in `PHASE_19_PLAN` at row **3b.d**, **BEFORE `F-G-2`** and alongside `B-XSTOCK-FEED-SANITY`. **A PREREQUISITE, not a successor. Ledger: `#949`.**

---

### 8.8 ⛔ THE VTS AND PAPER TRADING WERE **NEVER MEANT TO RUN AT THE SAME TIME**

**The corpus is unambiguous and it is the opposite of today's system.** `..._Execution_Flow.md:562` — *"VTS operates when trading engine is **STOPPED**"*. `..._Current_State_Reference.md:304` — *"Triggered when engine is STOPPED"*. `Phase_11:265` — *"**Passive Learning Mode**: VTS runs automatically when trading engines are stopped"*, and `:271` — *"VTS is the **sole source** of telemetry writes during passive learning."* The architecture diagram draws them as two forks off one scanner: *"PASSIVE LEARNING PATH (Engine Stopped) | ACTIVE TRADING PATH (Engine Running)."*

⇒ ★★ **THEY WERE THE SAME SLOT, TIME-MULTIPLEXED. VTS was what ran INSTEAD OF trading, so the system never sat idle learning nothing. There was no design in which both produce trades at once.**
**Concurrency is a deliberate June-2026 reversal** (`ITEM_4`), not the original plan — and our own investigation recorded the old behaviour as still live at the time: *"VTS genuinely STOPS when active trading turns on… you cannot turn on active-paper today without going dark on VTS learning."*

**AND THREE MORE INVERSIONS IN THE SAME FAMILY:**
1. ⛔ **VTS WAS THE *ONLY* CALIBRATION SURFACE, BY DESIGN.** `Phase_10:323` — *"MLCalibrationService | Strategy calibration from VTS"*; the shipped weights artifact carries `"source": "VTS"`. **Today the same arrangement is filed as a defect** — *"predictive weights are simulator-locked today; paper outcomes never reach them."*
2. ⛔ **VTS WAS ORIGINALLY PRICE-ISOLATED** — *"Uses isolated cache bucket (vtsSimulation)"*, *"VTS data is completely isolated."* **Today's compute-once-fan-out is the deliberate opposite.**
3. ⛔⛔ **THE 42-INVARIANT CONSTITUTION NEVER NAMES THE VTS.** It has a dedicated *"Paper Trading Specific Invariants"* section and **no VTS invariant, no isolation guarantee, no contamination guarantee** — for the lane that generates most of the trades. ★ **The one parity guarantee that exists is paper↔live only** (`Phase_9:87`, *"Ensure paper simulation and live trading use identical mathematical models"*). **THERE HAS NEVER BEEN A VTS↔PAPER PARITY TEST** — which is precisely the gap §1's "VTS books the level, active depth-walks" sits in, unnoticed for the system's whole life.

---

### 8.9 ⛔ THE xSTOCK FEED WAS BUILT AS A **PASSIVE ARCHIVE THAT NOTHING WAS TO CONSUME** — AND THEN BECAME THE LIVE TRADING FEED WITHOUT ANYONE DECIDING SO

`BATCH_74_SCOPE.md:37` (2026-04-30) — the feed was scoped **before xStocks were a trading asset class**, as an archive: *"Persistent WebSocket subscription on `wss://ws-equities.kraken.com` covering all 128 xStocks, persisting 1-min OHLC + per-update ticker snapshots."* Two channels, `ohlc` and `ticker`, and **`:93` made non-consumption explicit: *"Subscribe via separate WebSocket connections (**no shared state** with FX5 / signal-orchestrator / VTS)."***

**Then B79.0a wired the live scanner to read the archive table:** *"a live xstock_spot scanner… **reads xstock prices from the `equity_spot_ticker_snap` database table** every 30 seconds."*

⇒ ★★ **CRYPTO READS THE EXCHANGE; xSTOCK READS OUR OWN ARCHIVE.** The cause is real and forced — Kraken has **no public REST for xStocks** (`AssetPairs` returns zero xStock pairs; empirically closed B79.0k, re-verified 2026-05-15). **But the inversion itself — an archive explicitly built to share no state with the trading path becoming the trading path's price source — is nowhere declared as a design decision. It happened between two batches.**

⚠️ **AND B79 FLAGGED IT AT SCOPE TIME AND IT WAS NEVER CLOSED.** `BATCH_79_SCOPE.md:391`: *"**Currently archiver is passive-only.** Does VTS need real-time xStock prices, or is 1m archive lookup sufficient? **Critical question — if VTS needs real-time, we need to build/extend a live-pricing-adapter for the equities WS endpoint.**"* — with `:135` naming the batch: *"**B79.5** — live-pricing adapter for `wss://ws-equities.kraken.com` — TRIGGERED by Phase 19 active-trading prerequisite."*
⇒ ⛔ **PHASE 19 ACTIVE TRADING IS ON. THE TRIGGER FIRED. B79.5 IS NOT IN THE BATCH RECORD.** The named prerequisite for exactly the state we are now in was scoped, triggered, and never built — and §1's stale-mark and §6's low-bid findings both live on the path it would have replaced.
**DISPOSITION (§9.4 #3): own batch — `B-XSTOCK-LIVE-FEED`, owner CC-C, placed in `PHASE_19_PLAN` immediately after `B-XSTOCK-FEED-SANITY`, which must characterise the defect first. Ledger: `#950`.**

★ **AND THE ASSET-CLASS DIVERGENCE ITSELF WAS DELIBERATE AND WELL-ARGUED** — hours (24/5), volatility (0.5-2% vs 2-8% ATR), microstructure, macro inputs, failure modes, sector correlation, tokenization-vs-underlying — under an explicit doctrine: *"**Centralize the dispatcher; share the methods; vary only the DATA — never fork LOGIC.**"* ⇒ **The asymmetries §3 found are not all drift. Some are the doctrine working. The ones that are NOT — a synthesised book, an archive-as-feed — are the ones that forked logic while claiming to vary only data.**

### 8.10 ⛔ SIX MORE ABSENCES, EACH ONE LOAD-BEARING

1. **Time-based exit.** The stated philosophy is *"Day Trading | Positions closed within defined holding periods"* — **those holding periods are never defined anywhere.** No max-hold in `guardrails_v2` or any doc.
2. **Manual close.** Named twice as an exit path, **never designed anywhere.**
3. **`Complete_Project_History.md`** — the 23 KB *"For New Engineering Leadership"* narrative — **contains ZERO occurrences of "exit", "stop-loss", "trailing" or "take-profit."** The document written to explain the system to a newcomer never says how a position is closed.
4. **Long-only is load-bearing and mostly unstated.** T1 and F4 both silently assume it. A later reader adding shorts finds both inverted and no guidance.
5. **Where stop and target VALUES come from is silent.** The signal object is never defined; Trade Safety only validates that a stop was *supplied*.
6. ⚠️ **THE SYSTEM HAS FORM HERE.** `Phase_11:800`: *"Directive 11.6 addresses contaminated trade and ML data caused by the **random exit bug** in VTS simulation."* All pre-2026-01-21 VTS trades were purged. **The corpus never says what the random exit logic actually was** — and §1 of this audit found a live route that still prices an exit with `Math.random()`.

---

### 8.11 ✅ WHAT THE PROVENANCE READ CHANGES — REVISED DISPOSITIONS

| audit finding | before the read | after |
|---|---|---|
| **§0 four exit designs resident** | accumulated decay | ⛔ **BUILT THIS WAY** — five designs in the docs, each added OVER the last, two with no design text at all |
| **§4 eight price representations** | drift from a design | ⛔ **no design existed** — rule-24 outcome **(3)**: legacy that never fit. Needs a DECISION, not a fix |
| **§3 the xStock non-book** | an implementation shortcut | ⛔ **the only thing buildable** — outcome **(3)** |
| **§1 VTS books level / active depth-walks** | a divergence to fix | ✅ **VTS IS DESIGN 1, UNCHANGED; the active path is the later answer.** Reconcile deliberately — do NOT "fix" VTS |
| **§1 maker exit on a mid** | a defect | ⛔ **no order-type model was ever designed** — outcome **(3)**, and the mid it reads is §8.1's undefined `price` |
| **§1 non-deterministic exit price** | a defect | ⛔ **still a defect** — and F7's two-value tag shows the gate never *could* carry the answer |
| **§1 ungated bar age** | a missing check | ⛔ **never specified** — outcome **(2)**: a DECISION is missing, not code |
| **§1 force-close bypasses the venue gate** | a defect | ⛔ **a defect AND an invariant violation** — F7 is binding and explicit |
| **§5 the ratchet is off** | a setting with an expired reason | ⛔ **and the mechanism never had a stated purpose in the first place** |
| **F-G-1 the venue price grid** | repairing a regression | ✅ **NEW intent, correctly added** — the corpus has no concept of a representable price |
| **§3 the xStock non-book** *(revised again by §8.7)* | never designed | ⛔⛔ **CONFIRMED TO EXIST 2026-05-28, OBJECTIVE ASSIGNED, NEVER SUBSCRIBED TO.** Outcome **(1)** — a real defect, and a **prerequisite of F-G-2**. `#949` |
| **§1 VTS vs active fill model** *(revised again by §8.8)* | a divergence | ⛔ **there has NEVER been a VTS↔paper parity test** — the only parity guarantee ever written is paper↔live |
| **§6 the low bid** | unresolved, stored data cannot settle it | ⛔ **unchanged — but §8.7 supplies the missing instrument.** The real ladder is one subscription line away |
| **the xStock price source** | not previously a finding | ⛔ **an archive built to share NO state with trading BECAME the trading feed**, and its named replacement (`B79.5`) was triggered and never built. `#950` |

⚠️ **COVERAGE, STATED HONESTLY: this section is `bridge/canonical/` + git history ONLY.** The wider archive layer (`1-system-manual/_archive/`, `Archived Reports - Pre-Phase 12 Governance Implementation/`, root-level review docs) and the new-governance batch reports were **still being swept when this section was written — treat that layer as UNEXAMINED, not as empty.**

---

## 9. ✅ THE SECOND INDEPENDENT AUDIT — CONVERGENCE, DIVERGENCE, AND WHAT IT ADDED (Kyle-directed 2026-08-30)

> **Kyle's instruction:** *"another independent audit run on the same exact system to make sure that the findings come up consistent."*
> **METHOD:** two fresh readers, each given **only a question** — *"when the system decides to close a position, what price does it use and where does it come from?"* and *"what market data do we actually receive for tokenized equities, and what do we compute from it?"* — and **forbidden from opening this audit or the F-G-2 / feed-sanity scopes.** Neither was told any finding. Each was required to produce a positive control for every absence claim.
> ⚠️ **INDEPENDENCE IS PARTIAL AND THE READER DISCLOSED IT ITSELF:** the xStock reader's final step searched governance docs and surfaced `RUNNING_ISSUES` `#949`, which is derived from this audit. **Its §1-§5 were established from code before any governance file was opened (tool-call order confirms); its governance-contradiction section is NOT independent.** Recorded rather than glossed — the disclosure is why the rest can be trusted.

### 9.1 ✅ CONVERGED — reached from code, with controls, without sight of this document

| finding | this audit | independent reader | status |
|---|---|---|---|
| **Every exit decision reads a computed MIDPOINT — both classes, both lanes.** No exit path compares against a traded price, and none against the **bid**, which is the side a long actually sells into | §1, §4 | **CONFIRMED and quantified: of 23 stamped closes, 14 `kraken_ws_book_mid` + 9 `kraken_equities_ws` mid; ZERO from any last-trade producer** | ✅ **This is F-G-2's entire premise, independently re-derived** |
| xStock subscribes to bars + ticker **only** — no `book` | §3 | **CONFIRMED with positive control** (the same search finds `book` 4× and `instrument` 1× in the crypto adapter) | ✅ |
| The xStock "book" is one ticker row inflated to a single level | §3 | **CONFIRMED, traced end-to-end** | ✅ |
| The equities ingestion never reads the frame type; **crypto does, 600 lines away** | §6 (leading hypothesis for the low bid) | **CONFIRMED** — and the crypto side added it **after a measured incident** | ✅ **My hypothesis now has a precedent, see 9.3** |
| `is_extended_hours` is stored and never read | §6 | **CONFIRMED and quantified** — 709,792 extended-hours quotes in one day, carrying **≈4.4× the spread and ≈⅕ the depth** | ✅ **stronger than my version** |
| The fourth exit implementation is **dead** | FINDING A1 / plan 3h.b | **CONFIRMED independently** — one grep line, the definition; controls returned 3 and 5 hits for live siblings | ✅ |
| Break-even off on all four asset classes | §5 | **CONFIRMED from the live DB** — *and the reader self-corrected an earlier sweep that had read the migration seed instead of the live row* | ✅ |
| Two producers write one price slot under one tag; **the actionability gate reads the tag, not the producer** | §1 | **CONFIRMED, with a live collision observed** (`SPX/USD` written twice in one second at different values) | ✅ |
| VTS and the active path price the same decision differently | §1, §8.2 | **CONFIRMED and quantified — see 9.4** | ✅ |

⇒ ★★ **NINE INDEPENDENT CONFIRMATIONS, INCLUDING EVERY FINDING THIS AUDIT CALLS DECISION-CHANGING. The findings come up consistent.**

### 9.2 ⛔ DIVERGED — ONE CLAIM REFUTED, AND IT WAS THE MOST ALARMING ONE

**THE READER CLAIMED:** *"the daily-loss budget is blind to every close except the monitor-loop one"* — reasoning that only one site emits the trade-closed event while five other paths write a close.

**THE OBSERVATION IS TRUE. THE CONSEQUENCE IS FALSE, AND I RE-DERIVED BOTH HALVES AT THE REF.**
- ✅ **TRUE:** `emitTradeClosed` has exactly **one** producer call site (`active-execution-engine.ts:2590`); the definition at `event-bus.ts:186` is the only other hit. Control: the same search shape returned many live `TRADE_CLOSED` sites, so it discriminates.
- ⛔ **REFUTED:** **the daily-loss budget does not listen to that event — it queries the database.** `daily-loss-budget.ts:131` calls `storage.getRealizedPnlSince(mode, windowStart)`, which at `storage.ts:3280-3290` sums realised P&L **`.from(closedTradesTable)`** filtered on `closedAt IS NOT NULL` and the mode. ⇒ **A close written by ANY of the six sinks is counted. The kill switch is not blind.**

⇒ ★★ **THE RISK-ENVELOPE ALARM DOES NOT HOLD, AND IT WAS NOT RELAYED.** What survives is narrower and real: **five close paths do not write to the exit-decision archive and do not emit the event** ⇒ a **forensics gap** (the archive undercounts exits, so any population drawn from it is biased toward monitor-loop closes) and a **promotion-latency** effect, itself backstopped by the periodic sweep at `active-execution-engine.ts:419`.
⚠️ **RECORD THIS AS THE MECHANISM, NOT THE ANECDOTE: a fresh reader's HIT is a LEAD. This one was confidently argued, internally coherent, and wrong at the consequence — and repeating it would have sent the crew at the kill switch.** *(`workflow-02`: a HIT must be re-derived at the ref before it moves anything.)*

### 9.3 ⛔⛔ WHAT THE READERS ADDED — FOUR THINGS THIS AUDIT DID NOT HAVE

**(a) THE "CLEAN TICKER PRINT" DOES NOT EXIST — AND TWO CODE COMMENTS SAY IT DOES.**
`kraken-v2-translator.ts:52-58` overwrites the v1 `c` field — nominally *last trade closed* — with `(bid+ask)/2`, falling back to `last` only when a side is zero. The consuming variable is named `lastPrice`. **But `live-pricing-adapter.ts:47-49` describes the pair as *"a ghost-contaminated book MIDPOINT and a clean ticker PRINT"*, and `kraken-websocket-adapter.ts:943-944` asserts the same.**
⇒ ★★ **THE REAL DIFFERENCE BETWEEN THE TWO CRYPTO PRICE PRODUCERS IS *WHICH BBO THE MIDPOINT CAME FROM* — NOT MIDPOINT-VERSUS-PRINT.** **Any analysis that used the ticker leg as a trade-print control was comparing two midpoints and could not have detected what it was looking for.** ⚠️ **This is a control-validity defect in the instrument, not merely a stale comment — same class as `control-enumerates-the-observed`.** **Filed `#952`.**

**(b) A RATE-LIMITER BRANCH LAUNDERS A CACHED PRICE INTO A "FRESH VENUE READ" — RE-DERIVED BY ME, VERBATIM.**
`live-pricing-adapter.ts:582-586`: when the per-symbol REST cooldown blocks, the function **returns `cached?.price`** — a bare number with no age. The caller at `:496-505` then stamps it `source:'kraken_rest'`, `producer:'kraken_rest_poller'`, **`observedAt: Date.now()`**, beside the inline comment **`// a genuine venue read: observed now`** — **which is false on that branch.** And `kraken_rest` passes the engine's venue-source actionability gate.
⇒ ⛔ **AN ARBITRARILY OLD PRICE HAS ITS AGE RESET TO ZERO AND IS THEN TREATED AS ACTIONABLE. Every staleness guard downstream is reading a timestamp that was manufactured.**
⚠️ **POPULATION, STATED: the reader measured 995 blocked against 264 allowed over a busy 25-minute window. I did NOT reproduce that ratio** — my own scan of 10,613 live log lines on a **closed-market Saturday** found **6 blocked / 5 allowed**, which establishes the branch is live and frequently taken but is far too small, and from too quiet a period, to carry the proportion. **The CODE defect is re-derived and certain; the RATE is the reader's and is not re-derived.** **Filed `#951`.**

**(c) THE ONE-LEVEL LADDER PASSES ITS OWN WARMTH CHECK BY CONSTRUCTION.** The depth gate's `min_levels` is seeded at **1 for xstock_spot** against **3 for crypto**, and `warmth_max_age_ms` at **15,000 ms against 5,000** — on a feed throttled to **one row per 4 seconds** and flushed in 5-second batches. ⇒ ★★ **ANY `min_levels` ABOVE 1 WOULD BLOCK EVERY xSTOCK FILL PERMANENTLY, because the snapshot it grades can never contain a second level. The gate cannot fail, which means it is not a gate.** *(`CONDUCT` §6b step 2: a check that cannot come out differently does not discriminate.)* **Folds into `B-XSTOCK-BOOK-LADDER` (plan 3b.d).**

**(d) THE CRYPTO SIDE ALREADY SUFFERED THE FAILURE I HYPOTHESISED FOR xSTOCK, AND FIXED IT.** `kraken-websocket-adapter.ts:804-806` records that a **snapshot was merged as a delta**, producing measured crossed books on **2026-08-22 — ONDO +10.8%, XRP +24.9%, ZEC +33%** — and `:825-830` now replaces state on `message.type === 'snapshot'`. **The equities archiver never reads `msg.type` at all.**
⇒ ★★ **§6's low-bid hypothesis is no longer only a hypothesis about a mechanism — the identical mechanism is on this codebase's record, with measured damage, one asset class over.** It remains unproven *for xStock* until raw frames are captured; **but the prior is now strong and the fix pattern already exists in-repo.**

### 9.4 ⛔ THE LIVE NUMBER THAT MAKES THE WHOLE THING CONCRETE

Last snapshot before the weekend close, 2026-08-29 12:42:24:

| symbol | bid | ask | last trade | midpoint | **what the engine recorded as the price** |
|---|---|---|---|---|---|
| **PLTR/USD** | 171.00 | 190.00 | 185.46 | **180.50** | **180.50000000** |
| **BABA/USD** | 112.00 | 132.00 | 118.63 | **122.00** | **122.00000000** |

★★ **THE ENGINE'S MARK MATCHES THE MIDPOINT TO THE DIGIT — 2.67% BELOW the last trade on one name and 2.84% ABOVE it on the other, opposite directions, from the same widening.** Two hours earlier BABA quoted **118.62 / 118.63** — a one-cent spread. **The book widening alone moved the exit-decision price by 2.8% with no trade occurring**, and BABA's take-profit sits at 124.5567 against a midpoint that reached 122.00.
⇒ ★ **THIS IS §6's "LOW BID" AND F-G-2's PREMISE IN ONE ROW: the decision price is a midpoint, the midpoint follows whichever side collapses, and nothing on the exit path is looking at the side we would actually trade on.**

### 9.5 ✅ AND THE ONE FACT I ASSERTED WITHOUT RE-CHECKING — NOW PROBED LIVE

**§8.7 rests on a `book`-channel capture from 2026-05-28. The reader correctly flagged that nobody had re-probed it since.** I ran a **read-only** subscription (no credentials, no order, no capital) at **2026-08-30T03:55:29Z**:

```
ACK: {"method":"subscribe","result":{"channel":"book","snapshot":true,"symbol":"TSLA/USD"},"success":true,...}
ACK: {"method":"subscribe","result":{"channel":"book","snapshot":true,"symbol":"GLD/USD"},"success":true,...}
```

✅ **THE CHANNEL EXISTS AND ACCEPTS THE SUBSCRIPTION TODAY, `success:true` on both a liquid and a thin name** ⇒ **`P19_B4b_1_SCOPE.md:76`'s *"if Kraken equities EVER exposes a book channel"* is refuted at the venue, not merely by an old document.**
⛔⛔ **BUT ZERO BOOK FRAMES ARRIVED IN 25 SECONDS, AND THAT IS NOT EVIDENCE OF ANYTHING — IT WAS SATURDAY 03:55 UTC AND xSTOCKS ARE CLOSED (24/5, Friday 20:00 ET).** ★ **A silent instrument on a shut market has zero opportunity to speak** (`#661` leg 3). **The May capture observed the 20-level ladder; I have NOT.**
⇒ **OWED, AND IT IS A WINDOW WHOSE TIMING IS THE CONTENT: re-run this probe after the Sunday 20:00 ET reopen (2026-08-31T00:00Z) and record the observed level count.** Until then `B-XSTOCK-BOOK-LADDER` carries *"subscription accepted; ladder depth confirmed May, not re-observed"* — **not *"a 20-level ladder is available."***
