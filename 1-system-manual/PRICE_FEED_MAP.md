# PRICE FEED MAP — WHERE EVERY PRICE IN THE SYSTEM COMES FROM

**Kyle-directed, 2026-09-13 (CC-B). THE THING HE HAS ASKED FOR REPEATEDLY AND NOT RECEIVED.**
Read at `origin/migration/aws-supabase`. **This is a CURRENT-STATE map, not a recommendation** — the
"is this the right feed" judgement is a separate column and is deliberately left `UNJUDGED` wherever
nobody has ruled.

> ⛔ **THE RULE THIS MAP EXISTS TO SERVE:** a price does four jobs — **setting a level**, **ranking**,
> **triggering an action**, and **booking a record**. `#952`/`#941`: we use the midpoint for all four,
> and it is built at the FEED layer so every lane inherits it.

---

## 0. THE THREE FEEDS, AND WHAT EACH ACTUALLY CARRIES

| feed | what it is | what it carries | freshness |
|---|---|---|---|
| **OHLC cache** (`ohlc-cache.ts`) | 60-minute candles | open/high/low/close/volume — **history, not a live price** | **5-minute TTL** |
| **price cache** (`price-cache.ts`) | a per-symbol mark | ONE number + a **`markKind`** of `'mid'` or `'last'` (`:107`) | written by WS + a REST poller |
| **order book** (Kraken `book` channel) | the resting ladder | bid/ask prices **and sizes**, both sides | live stream |

⭐ **`markKind` IS THE CENTRAL FACT OF THIS WHOLE MAP.** The price cache **self-describes** whether its
mark is a midpoint or a last trade (`:89-93`, `:107`). Three writers stamp `'last'` (`:271`, `:425`,
`:544`). A counter at `:605-608` records what LEVEL READS actually got.

⚠️ **`null` means the writer could not state the kind — NOT that it is a midpoint.** The docblock at
`:93` is explicit that `bid === ask === price` would wrongly answer `'mid'` for a last trade, which is
why the field is stamped by the writer rather than inferred.

⛔ **AND THE ORDER BOOK HAS NO LAST-TRADE ARM AT ALL.** `kraken-websocket-adapter.ts:908-918` —
`if (bestBid <= 0 || bestAsk <= 0) continue` → `:945 producer:'kraken_ws_book_mid'`. **Anything reading
the book leg gets a midpoint BY CONSTRUCTION; there is no other value it can produce.**

⛔ **WE DO NOT SUBSCRIBE TO A TRADE FEED.** Channels are `['ticker','book']` only
(`kraken-websocket-adapter.ts:1591`; the channel type at `:322`/`:1684` is literally `'ticker' | 'book'`).
**So no site below can see the actual trade tape.**

---

## 1. THE MAP — EVERY DECISION SITE

### A. SIGNAL BIRTH — setting entry, stop and target

| lane / class | site | feed | kind | freshness | judged? |
|---|---|---|---|---|---|
| **crypto, active** | `signal-orchestrator.ts:2407` → `:2429` → `:2454` | **price cache**, then the **smoother** | **~85–90 % `last`, 10–15 % `mid`** (measured, `:605` counter) | cache row cadence — **median 60 s, p90 90 s** (measured, 83 symbols) | ⛔ **NO** |
| crypto, active | `signal-orchestrator.ts:2224`, `:2398` | OHLC cache | candles | **5-min TTL** | supplies **indicators/ATR**, not the price |
| **xStock** | `eval-cycle.ts:346`, `:349`, `:381` | `lastPrice` passed in | `last` | per eval cycle | ⛔ **NO** |
| **VTS** | `vts-runner.ts:1553`, `:1587` | price cache | per `markKind` | cache cadence | ⛔ **NO** |

⛔ **THE LEVEL PRICE IS THEN SMOOTHED** (`adaptive-kalman.ts`, via `getSmoothedPrice` at `:2429`).
⚠️ **It is NOT a Kalman filter and the System Manual (`:699`) forbids calling it one** — an adaptive EMA
with an ER-driven, scale-free gain and **no measured noise model**. Its sensitivity comes from
**60-minute OHLC closes** (`signal-orchestrator.ts:2417-2419`), **not from the price stream**, so it
cannot down-weight a dirty input or reward a clean one.
⛔⛔ **THREE FIGURES THAT STOOD HERE ARE WITHDRAWN — CC-C RETRACTED THEM, LANGSTON BLOCKED THEM, AND THEY
WERE IN THIS DOCUMENT FOR ONE COMMIT (`71336a584`). DO NOT CITE THEM FROM ANY COPY.**
1. ⛔ *“87.3 % of a freshness advantage survives the smoother”* — **WITHDRAWN.** The arms started one
   input-gap apart on freshly-seeded filters over ~9.4 instants each, so it measured **how long two
   differently-seeded filters retain their seed difference**, not attenuation. Phase set the seed gap;
   the replicates averaged over a nuisance parameter. ✅ **The claim is UNMEASURED — AND SO IS ITS
   NEGATION.** Re-run under way.
2. ⚠️ *“constant side offset passes at p50 = 1.000”* — **the NUMBER is withdrawn as degenerate**: the
   “constant offset” arm was `mid + (ask−bid)/2` off the same row, which **is exactly `ask`** — there was
   never a constant-offset arm. ✅ **THE CONCLUSION STANDS ON THE ANALYTIC ARGUMENT ALONE and needs no
   experiment:** `x ← x + K(z−x)` has a fixed point at `x = z` — unity DC gain for any gain ⇒ **a
   constant offset is tracked, never removed.**
3. ⛔ *“side error ≈ 7–10 bps vs freshness ≈ 3.5 bps — 2–3×”* — **BOTH SIDES UNEVIDENCED.** The 3.5
   derives from the withdrawn 87.3 %; the 7–10 travels with **no object and no population at the point
   of use** (rule 29a), its provenance a 0.199 % median crypto spread carried from memory and halved.
⛔⛔ **THEREFORE THE RANKING OF SIDE-ERROR AGAINST FRESHNESS-ERROR IS UNEVIDENCED AND MUST NOT BE STATED
AS SETTLED** — pending both figures being restated with their populations.
✅ **WHAT SURVIVES AND IS SAFE TO ACT ON:** the smoother does not remove a constant offset (analytic),
and the SIDE defect in §1C is measured independently of any of this.

### B. RTB POOL REFRESH

| lane | site | feed | kind | freshness |
|---|---|---|---|---|
| all | `rtb-refresh-service.ts:433` `priceCache.getBatch` | **price cache only** (`:12` — *"All pricing sourced exclusively from unified price-cache.ts"*) | per `markKind` | cache cadence |

### C. OPEN-TRADE MONITOR — exits, and maker-fill adjudication

| lane | site | feed | kind | freshness | judged? |
|---|---|---|---|---|---|
| **crypto, paper active** | `active-execution-engine.ts:1652` `getPriceWithFallback(symbol, 2000)` | WS → REST → **skip tick** | ⛔ **`kraken_ws_book_mid` — MIDPOINT, structurally** | **2,000 ms window** | ⛔ **NO — this is the defect** |
| portfolio sweep | `active-execution-engine.ts:917` | same, **5,000 ms** | midpoint | 5 s | ⛔ NO |

⛔⛔ **THIS IS THE SITE THAT BOOKS SALES WITH NO BUYER.** A resting maker **sell** is filled when a **BUYER**
pays our price — i.e. when the **BID** reaches it. We instead compare the **MIDPOINT** to the limit.
**The midpoint can cross while the bid never arrives.**
✅ **MEASURED (Langston): 14 of 24 checkable booked maker target-exit fills did not cross by half the
spread** — median through 6.0 bps against a median book spread of 20.7 bps. **58 %–100 % unsupported;
lead with 58 %.** All-time `exit_price_producer` census: the crypto arm has **exactly one value ever**,
`kraken_ws_book_mid`.

> ### ⛔ THE COMPARATOR, NAMED PLAINLY
> `evaluatePendingMaker` asks, each tick: **is the price at my limit yet?** — for a resting buy,
> `price <= limit`. **The comparator is that test plus the price fed into it.**
> **TODAY it is fed a MIDPOINT. It should be fed the SIDE THAT WOULD TRANSACT** — the **bid** for a
> resting sell, the **ask** for a resting buy. ⭐ **That is the fix. It is a change of INPUT, not of
> machinery, and the book we already subscribe to carries both sides.**

### D. ENTRY PLACEMENT — the maker/taker decision

| site | feed | note |
|---|---|---|
| `active-execution-engine.ts:4043/:4045` | **`bestAsk`** — the book, correct side for a buy | ✅ **the ONE site already using a transactable side** |
| `eval-cycle.ts:956` (VTS/xStock) | **`lastPrice`** — a print, not the resting book | ⛔ **WRONG INSTRUMENT for a post-only decision, which is decided by the RESTING book** |

⛔ **THE TWO LANES ARE BIASED IN OPPOSITE DIRECTIONS UNDER ONE LABEL:** `lastPrice <= limit` fires more
often than `bestAsk <= limit`, so **VTS under-rests makers and the active lane over-rests them.** Any
cross-lane maker-rate comparison is confounded by the comparator, not by behaviour.

---

## 2. ⛔ WHAT IS NOT MAPPED, STATED AS A GAP RATHER THAN OMITTED

- **The ENTRY side has no book column at all** — `entryBookAgeMs: null` *"BY CONSTRUCTION"*
  (`active-execution-engine.ts:1207`), and **no `entry_ticker_bid`/`ask` exists**. ⇒ the entry-side
  fill decision **cannot be audited after the fact**, and it carries **82 `never_filled`** rows with
  **zero corroboration**.
- **Live mode** is not exercised (Phase 21), so its column is the paper path by inheritance, unverified.
- Sites in `market-scanner`, `fx5-scanner`, `multi-timeframe-scanner`, `regime-inputs`,
  `stage-b-validator`, `cost-metrics` are **NOT traced here** — they read prices but no ruling has been
  made on them. **Their absence from §1 is a gap in this map, not evidence they are correct.**

## 3. THE ONE-LINE ANSWER PER JOB (the `#952` framing)

| job | what we use today | what it should be | status |
|---|---|---|---|
| **set a level** | smoothed cache mark, mostly `last` | UNJUDGED. ⚠️ **Do NOT rank this against the trigger fix — that ranking is withdrawn (see §1A).** The 60 s cadence and the smoothing question are both OPEN and both UNMEASURED. | open, `3n` |
| **rank** | cache mark | UNJUDGED | open |
| **trigger** (maker fill) | ⛔ **MIDPOINT** | ⭐ **the transactable side — bid for a resting sell, ask for a resting buy** | **THE FIX, owner CC-C + Langston, `3n` job 5** |
| **book** | fill at the limit | limit is correct once the trigger is | follows the trigger |
