# PRICE FEED MAP — WHERE EVERY PRICE IN THE SYSTEM COMES FROM

**Kyle-directed, 2026-09-13 (CC-B), r2 after joint review by Langston + CC-C.**
Read at `origin/migration/aws-supabase`.

> ## ⭐⭐ THE ONE RULE THIS WHOLE MAP PRODUCES (Langston, 2026-09-13)
> ### **A PRICE THAT *VALUES* MAY BE A MIDPOINT. A PRICE THAT *ACTS* MUST BE THE SIDE THAT TRANSACTS.**
> **Portfolio marking is the ONLY job on this map whose answer is already right.**

⛔ **THIS DOCUMENT CONTRADICTS THE SYSTEM MANUAL ON ITS MOST LOAD-BEARING CELL, AND THE MANUAL IS WRONG.**
`SYSTEM_MANUAL.md:655` says the book mid drives *"NOT the trigger"*; `:668` says *"BOTH the entry levels
and the exit trigger use the ticker BBO midpoint."* **The all-time `exit_price_producer` census is
`kraken_ws_book_mid` 61 · ticker 0.** The exit trigger has **never once** read a ticker mark on crypto.
**Correcting the manual is not optional and not deferrable** (Langston).

---

## 0. THE FEEDS, AND WHAT EACH ACTUALLY CARRIES

| feed | what it is | what it carries | freshness |
|---|---|---|---|
| **OHLC cache** | 60-minute candles | OHLCV — **history** | **5-min TTL** |
| **price cache** | a per-symbol mark | one number + **`markKind`** `'mid'`\|`'last'` (`:107`) **+ `lastTradePrice`** (`:102-103`) | WS + REST poller |
| **order book** | the resting ladder | bid/ask **and sizes** | live stream |
| **depth snapshot** | book side for marketability | `asks[0].price` | ⚠️ **≤~30 s stale — its own comment calls it a "documented approximation"** (`aee:4030`) |

⭐ **WE DO RECEIVE A TRADE PRINT, AND THIS REMOVES A COST.** *(Langston correction — my r1 said "no site
can see the trade tape", which was TOO STRONG.)* The ticker frame carries the venue's own last trade and
we already propagate it: `kraken-websocket-adapter.ts:912 lastTradePrice: safeData.lastTrade`, stored at
`price-cache.ts:102-103`. **We cannot see EVERY print; we do receive A print.**
⇒ ⛔ **NO FEED PURCHASE IS REQUIRED TO COMPARE AGAINST A TRADE.**

⛔ **THE BOOK LEG HAS NO LAST-TRADE ARM.** `kraken-websocket-adapter.ts:1202-1210` —
`producer:'kraken_ws_book_mid'`, `lastTradePrice: null, // a book update carries no trade print`.
⇒ **anything reading the book leg gets a midpoint BY CONSTRUCTION.**
*(r1 cited `:908-918`/`:945` — a prior ref; that now lands on the ticker emit. The same drift exists in
the manual at `:929`, `:684`, `:1096`, `:1485`.)*

---

## 1. THE MAP

### A. SIGNAL BIRTH — ⛔ THERE ARE **THREE** LEVEL BASES, NOT ONE

| lane / class | site | basis | kind | freshness |
|---|---|---|---|---|
| **crypto QUANT** | `signal-orchestrator.ts:2407` → `:2429` → `:2454` | price cache → **smoother** | ⚠️ **`last` share is an UPPER BOUND** (below) | cache cadence **60 s median / 90 s p90** |
| **crypto PATTERN** | `signal-orchestrator.ts:2224` → `patternToTradeSignal:2269` | ⭐ **a 60-minute BAR CLOSE** | **never smoothed, never a midpoint** | **up to 60 min old** |
| **xStock / VTS** | `eval-cycle.ts:346/:349/:381`, param at `:304` | ⭐ **a 60-min BAR CLOSE** (`xstock_spot/scanner.ts:909-910`, `latestBar.close`) | **not a print** | up to 60 min |

⚠️ **THE `85–90 % last` FIGURE IS AN UPPER BOUND AND MUST NEVER BE QUOTED BARE.** `price-cache.ts:575-578`
— Langston's own ruling, in the code — says `levelReadKind` is *"an UPPER BOUND on level-setting reads …
the true level-setting mixture is likely MORE midpoint-heavy."* **Population is the crypto QUANT lane
only, not "level reads".** CC-C to re-derive with the bound stated.
⛔ **The PATTERN lane reads no cache row at all and appears in NEITHER census field** (`price-cache.ts:599-601`).

**THE SMOOTHER** (`getSmoothedPrice`, `:2429`): ⚠️ **not a Kalman filter** (`SysManual:699`) — an adaptive
EMA, ER-driven scale-free gain, **no measured noise model**, sensitivity from 60-min OHLC closes
(`:2417-2419`) not from the price stream.
⛔ **THREE FIGURES WITHDRAWN, IN THIS DOC FOR ONE COMMIT (`71336a584`) — DO NOT CITE FROM ANY COPY:**
"87.3 % of freshness survives" (**UNMEASURED — and so is its negation**; arms differed by seed, not
attenuation) · "constant offset p50 = 1.000" (**degenerate** — the arm was `mid+(ask−bid)/2` ≡ `ask`) ·
"7–10 bps vs 3.5 bps" (**both unevidenced**).
✅ **SURVIVES ON THE ANALYTIC ARGUMENT ALONE:** `x ← x + K(z−x)` has a fixed point at `x = z` — unity DC
gain ⇒ **a constant offset is tracked, never removed.**

### B. RTB POOL REFRESH
`rtb-refresh-service.ts:433 getBatch` — **price cache only** (`:12`). Side-age probe at `:435` is shadow-only.

### C. OPEN-TRADE MONITOR — the exit trigger
`active-execution-engine.ts:1652 getPriceWithFallback(symbol, 2000)` → ⛔ **`kraken_ws_book_mid`, a
MIDPOINT, structurally.**
⛔⛔ **THIS BOOKS SALES WITH NO BUYER.** A resting **sell** fills when a **BUYER** pays our price — when
the **BID** arrives. We compare the **MIDPOINT**, which can cross while the bid never does.
✅ **MEASURED (Langston): 14 of 24 checkable booked maker target-exit fills did not cross by half the
spread** — median 6.0 bps through against a 20.7 bps median spread. **58 %–100 % unsupported; lead with 58 %.**
⭐ **POPULATION, NAMED 2026-09-13 (CC-B, and it is now load-bearing):** `closed_trades` rows carrying BOTH
`exit_decision_price` AND `exit_ticker_bid`, **`asset_class='crypto_spot'`, `close_reason='target_hit'` —
n = 24 EXACTLY.** ✅ **NO xStock row is in it** (xStock `target_hit` with both stamps is a separate 7), so
Langston's contamination concern does NOT apply — an xStock `exit_ticker_bid` would have been a
*consistency* record rather than corroboration (`depth-source.ts:89-93`, the fill's own depth-walk reads
the same table). Read 2026-09-13. Disjoint from F-G-2's stop-outs: crypto `stop_hit` with both stamps is 38.
⛔⛔ **AND THIS IS NOW THE *ONLY* SUPPORT FOR FIX-THE-SIDE-FIRST.** The clearance probe that was its second
support is ladder-derived and **UNEVIDENCED** (CC-C's `applyDelta` never evicts out-of-window levels ⇒
inverted books on 4 of 7 symbols, two above 90 %). **Not refuted — unevidenced.** ⚠️ **Kyle should hear
“fix-the-side now rests on a single measurement whose population we have just named”, NOT “untouched”.**
✅ **NOT A PRODUCTION DEFECT:** production maintains its own eviction (`kraken-websocket-adapter.ts:3639-3654
`truncateBook`), fixed under `#507` (pre-fix: 32.03 % of book states crossed) and instrumented via
`getBookIntegrityCounters()`. ⚠️ **A zero `crossedDetections` is not unconditionally clean — read
`mismatches`/`attempts` beside it, or the zero is unreadable.**

> ### THE COMPARATOR, PLAINLY
> `evaluatePendingMaker` asks each tick **"is the price at my limit yet?"** — for a resting buy,
> `price <= limit`. **The comparator is that test plus the price fed into it.** Today: a **midpoint**.
> It must be the **side that would transact** — **bid** for a resting sell, **ask** for a resting buy.
> ⭐ **A change of INPUT, not of machinery.**

### D. ENTRY MARKETABILITY — ⛔ THE ASYMMETRY IS **STALENESS**, NOT SIDE

| lane | reads | what it actually is |
|---|---|---|
| active | `aee:4038` `_gate.snapshot.asks[0].price` | **depth snapshot, ≤~30 s stale** |
| VTS / xStock | `eval-cycle.ts:956` | ⭐ **a 60-MINUTE BAR CLOSE** — not a print |

⛔ **r1 SAID "ask vs print, biased in opposite directions". THAT IS WITHDRAWN.** It is **a ~30 s book side
against an hour-old bar**, and **a stale bar's error is RANDOM IN SIGN** — so opposite-direction bias is
**not established**. ⇒ **the cross-lane confound is STALENESS, and it is far larger than a side offset.**

### E. PORTFOLIO MARKING — a whole SITUATION missing from r1
`active-portfolio-manager.ts:308`, `:631` — `getPriceWithFallback(symbol, 5000)`, a midpoint.
✅ **CORRECT AS-IS** — marking is a **valuation**, not a transaction.
⛔ **BUT: if any risk gate — daily-loss, exposure, kill-switch — fires off marked equity, a MIDPOINT IS
MAKING A LIQUIDATION DECISION.** Untraced; needs tracing before it gets a verdict.

---

## 2. STILL UNMAPPED — stated as gaps, not omissions
`routes.ts` (7) · `vts-runner.ts:3061/:3993/:4719` (**lifecycle** reads, distinct from the `:1553/:1587`
birth reads) · `execution/depth-source.ts` (4) · `trading-state-sync.ts:296` · `metrics-core.ts:103` ·
`active-engine-service.ts:337` · `routes/vts-audit.ts` · and r1's six: `market-scanner`, `fx5-scanner`,
`multi-timeframe-scanner`, `regime-inputs`, `stage-b-validator`, `cost-metrics`.
⛔ **Live mode is unexercised (Phase 21); its column is the paper path by inheritance, unverified.**

## 3. THE JUDGEMENT — RULED BY LANGSTON, 2026-09-13

| situation | right feed? | fresh enough? | smooth? |
|---|---|---|---|
| **crypto quant birth** | ⛔ **NO** — REST-last/WS-mid mixture, unstated per symbol | ⛔ **NO, and the defect is RELATIVE:** a 60–90 s basis feeding a 2 s trigger ⇒ **realised distance ≠ intended distance** (`SysManual:701`) | ⛔⛔ **NO — REMOVE IT.** Unity DC gain removes no side error, costs ~10 observations of lag, re-seeds cold every restart. **A/B measured, not flipped** |
| **crypto pattern birth** | ✅ qualifies (a printed close) | ⛔ **NO** — up to 60 min old | ✅ correctly not smoothed |
| **xStock / VTS birth + marketability** | ⛔ **NO** — an hour-old bar close is neither side nor current | ⛔ **NO** | n/a |
| **RTB rank** | ✅ midpoint is the right KIND for a valuation | ✅ yes | ⛔ **NO** |
| **exit trigger** | ⛔ **NO — SETTLED. Transactable side.** | ✅ 2 s is not the binding constraint — **side is** | ⛔⛔ **NEVER.** Ruled explicitly so nobody "fixes" the clock mismatch by smoothing this end |
| **entry marketability (active)** | ✅ right side, right instrument | ⚠️ **UNRULED — snapshot age distribution needed first** | never |
| **portfolio marking** | ✅ **midpoint is CORRECT** — a valuation | ✅ yes | ✅ no |

## 4. ⛔ FIVE PARALLEL DOCUMENTS — the response to "we lose sight of the system" cannot be a fifth narrative
`PRICING_DATA_ARCHITECTURE.md` (108 KB, **banner-marked NOT CANONICAL / UNDER CORRECTION**) · the
SysManual provenance table · `ACTIVE_PATH_FLOW.md` · the exit-path audit · **this**.
> `HOME: B-PRICE-DOC-CONSOLIDATE, owner CC-B, PHASE_19_PLAN after 3n` — this map either **supersedes** the
> SysManual provenance table with the manual pointing at it, or **folds into** it. **It does not ship as a
> fifth source.** The `:655`/`:668` correction rides the same batch and is **not deferrable**.
