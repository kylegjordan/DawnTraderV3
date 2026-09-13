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
⛔⛔ **THE 14-of-24 READING IS REFUTED BY THE DISCRIMINATING TEST, AND IT WAS MINE TO AMPLIFY. DO NOT CITE IT.**
Langston's test, run by CC-B 2026-09-13, needing no new instrumentation — split the population by `close_reason` and read `pos_in_spread = (decision − bid)/(ask − bid)`:

| `close_reason` | n | median pos | above ask | below bid |
|---|---|---|---|---|
| `target_hit` | 24 | **+1.791** | **20** | 0 |
| `stop_hit` | 38 | **−1.300** | 1 | **31** |

⭐⭐ **THE SIGN FLIPS WITH THE DIRECTION OF TRAVEL — THAT IS THE LAG SIGNATURE, NOT A SIDE DEFECT.** Rising into a target leaves the older witness LOW (`pos > 1`); falling into a stop leaves it HIGH (`pos < 0`). **A genuine side error would push the SAME way in both** — a midpoint is above the bid whether price rises or falls. ⇒ **we measured the ARCHIVER'S LAG.**
⭐⭐ **AND THE MAGNITUDE BOUND IS STRONGER THAN THE SIGN ARGUMENT — IT MAKES A SIDE ERROR ARITHMETICALLY IMPOSSIBLE (CC-C).** **The LARGEST side error that can exist is 0.5** — the whole distance from the mid to the bid. Observed departures are **1.3–1.8 spread-widths beyond the book, 3–4× the largest possible side error.** Of the 24 target rows only **FOUR** sit inside `[0,1]` at all (CHIP 0.421 · ACU 0.667 · DASH 0.888 · RAY 1.000); **twenty are outside**, and the stops are outside on the opposite side at median −1.300.
⇒ **NEITHER TAIL CAN BE A WRONG-SIDE ERROR. A reader can check this in one line without re-running anything: no side error exceeds half a spread, and these are three to four spreads.**

✅ **AND IT WAS STRUCTURALLY UNDECIDABLE FROM THE ROW ALL ALONG:** `exit_ticker_bid/ask` is written by the ARCHIVER off a **separate socket** — `depth-source.ts:80-97` calls it *“a lagged witness”*, cadence 5.0–9.0 s; F-G-2 measured this arm at p50 **12.33 s** (n=3, a lead not a rate). `capturedAtMs` exists at `active-execution-engine.ts:2338` but the persist payload (`:2974-2977`, `shared/schema.ts:1854-1855`) writes **only the bid/ask pair** — no capture-time column exists anywhere. ⛔ **`B_EXIT_PROVENANCE_COMPLETION_REPORT.md:101` PRE-REGISTERED THE OBLIGATION I MISSED: *“Any analysis using it must read that column.”***
⛔ **AND A MID SITS AT `pos = 0.5` OF ITS OWN BOOK BY CONSTRUCTION** (`kraken-websocket-adapter.ts:1165-1166`, `:1172-1173`) ⇒ **the side defect's null is 0.5, never 0 and never 1. Any departure is the two CHANNELS disagreeing, not a side.**

✅ **WHAT SURVIVES, AND IT IS NOT NOTHING:** the exit trigger DOES read a book midpoint (census `kraken_ws_book_mid` **61** · ticker **0**, all-time, our own column — independent of any of this), and **a resting SELL is filled by a BUYER, so a midpoint is the wrong KIND of price for a transaction.** That is an argument FROM CONSTRUCTION and it stands.
⛔⛔ **WHAT FALLS: the claim that we have MEASURED the harm.** “We book sales with no buyer” and “recent paper results are flattered” are **UNEVIDENCED** — withdrawn, not restated. The urgency ordering that rested on them reverts to open.
➕ **HOME for the missing instrument:** persist `exit_ticker_captured_at_ms` beside the pair — item on `B-PRICE-SIDE-BY-JOB` (row `3n`), owner CC-C.

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
