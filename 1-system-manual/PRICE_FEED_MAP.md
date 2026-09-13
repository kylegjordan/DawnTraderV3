# PRICE FEED MAP — WHERE EVERY PRICE IN THE SYSTEM COMES FROM

**Kyle-directed, 2026-09-13 (CC-B), r2 after joint review by Langston + CC-C.**
Read at `origin/migration/aws-supabase`.

> ## ⭐⭐ THE ONE RULE THIS WHOLE MAP PRODUCES (Langston, 2026-09-13)
> ### **A PRICE THAT *VALUES* MAY BE A MIDPOINT. A PRICE THAT *ACTS* MUST BE THE SIDE THAT TRANSACTS.**
> **Portfolio marking is the ONLY job on this map whose answer is already right.**

⛔ **THIS DOCUMENT CONTRADICTS THE SYSTEM MANUAL ON ITS MOST LOAD-BEARING CELL, AND THE MANUAL IS WRONG.**
`SYSTEM_MANUAL.md:655` says the book mid drives *"NOT the trigger"*; `:668` says *"BOTH the entry levels
and the exit trigger use the ticker BBO midpoint."* **The all-time `exit_price_producer` census is
`kraken_ws_book_mid` **73** · `kraken_ws_ticker_mid` **1** — **of only 111 STAMPED rows out of 755, because the stamp column only began writing 2026-08-26**.** The exit trigger has **never once** read a ticker mark on crypto.
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

⚠️ **MEASURED 2026-09-13 FROM THE LIVE COUNTER, AND IT IS AN UPPER BOUND THAT MUST NEVER BE QUOTED BARE.** 400 consecutive HEALTH lines (≈400 min): **level reads `mid` 1,996 · `last` 28,772 · `unknown` 0 — 93.5 % `last`**; whole-cache rows **`mid` 3,301 · `last` 50,154 — 93.8 % `last`**. *(r2 said “85–90 %” with no population; this replaces it.)* ⛔ **The two fields are DIFFERENT POPULATIONS and are never read as numerator and denominator** (`price-cache.ts:569-572`). `price-cache.ts:575-578`
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
⛔⛔ **WITHDRAWN 2026-09-13, SAME DAY, BY ITS OWN AUTHOR: THIS PARAGRAPH CLAIMED THE MAGNITUDE MADE A SIDE ERROR “ARITHMETICALLY IMPOSSIBLE”. THAT IS A DECOMPOSITION ERROR AND THE CLAIM IS DEAD.** CC-C pulled their own bound and flagged it before this document went to Langston as final.
⭐⭐ **THE DECOMPOSITION, WHICH IS WHAT THE NUMBER ACTUALLY SAYS — CC-C, re-derived independently by Langston, and it REPLACES the “bound” wording that stood here until 2026-09-13:**
> `pos = [(bid_d + ask_d)/2 − bid_w] / S_w` = **`0.5 + Δ/S_w`**, where `Δ` is the drift between the DECISION book and the WITNESS book.
⛔⛔ **SO THE SIDE TERM IS *CONTAINED* IN THE NUMBER, AT 0.5, ADDITIVELY — IT IS NOT EXCLUDED BY IT.** A departure of `+1.8` is `0.5 + 1.3`, not “3× an impossible side error”. ✅ **The midpoint sits at exactly 0.5 ONLY IF THE TWO READS ARE CONTEMPORANEOUS — and they are not, which is the whole finding.**
⇒ ✅ **WHAT THE MAGNITUDE LICENSES: it SIZES THE DRIFT. It does not bound the side defect away.**
✅ **THE CRYPTO REFUTATION DOES NOT DEPEND ON IT — IT RESTS ON THE SIGN FLIP, WHICH THE DECOMPOSITION STRENGTHENS RATHER THAN WEAKENS.** A PURE side defect puts **BOTH** arms at **exactly 0.5** (`Δ = 0`). Observed: `target_hit` **+1.791**, `stop_hit` **−1.300** — **opposite sides of 0.5, moving WITH the direction of travel.** That is `Δ` changing sign, and `Δ` is drift by definition.
*(Descriptive, no longer load-bearing: of the 24 target rows FOUR sit inside `[0,1]` — CHIP 0.421 · ACU 0.667 · DASH 0.888 · RAY 1.000 — and twenty are outside.)*
⇒ **NEITHER TAIL CAN BE A WRONG-SIDE ERROR. A reader can check this in one line without re-running anything: no side error exceeds half a spread, and these are three to four spreads.**

✅ **AND IT WAS STRUCTURALLY UNDECIDABLE FROM THE ROW ALL ALONG:** `exit_ticker_bid/ask` is written by the ARCHIVER off a **separate socket** — `depth-source.ts:80-97` calls it *“a lagged witness”*, cadence 5.0–9.0 s; F-G-2 measured this arm at p50 **12.33 s** (n=3, a lead not a rate). `capturedAtMs` exists at `active-execution-engine.ts:2338` but the persist payload (`:2974-2977`, `shared/schema.ts:1854-1855`) writes **only the bid/ask pair** — no capture-time column exists anywhere. ⛔ **`B_EXIT_PROVENANCE_COMPLETION_REPORT.md:101` PRE-REGISTERED THE OBLIGATION I MISSED: *“Any analysis using it must read that column.”***
⛔ **AND A MID SITS AT `pos = 0.5` OF ITS OWN BOOK BY CONSTRUCTION** (`kraken-websocket-adapter.ts:1165-1166`, `:1172-1173`) ⇒ **the side defect's null is 0.5, never 0 and never 1. Any departure is the two CHANNELS disagreeing, not a side.**

✅ **WHAT SURVIVES, AND IT IS NOT NOTHING:** the exit trigger DOES read a book midpoint (census `kraken_ws_book_mid` **73** · `kraken_ws_ticker_mid` **1**, of the **111 STAMPED rows out of 755** — our own column, independent of any of this. ⚠️ **r2 carried `61 · 0` HERE while the header said `73 · 1` — the same document disagreeing with itself, which is exactly what Kyle caught.**), and **a resting SELL is filled by a BUYER, so a midpoint is the wrong KIND of price for a transaction.** That is an argument FROM CONSTRUCTION and it stands.
⛔⛔ **WHAT FALLS: the claim that we have MEASURED the harm.** “We book sales with no buyer” and “recent paper results are flattered” are **UNEVIDENCED** — withdrawn, not restated. The urgency ordering that rested on them reverts to open.
➕ **HOME for the missing instrument:** persist `exit_ticker_captured_at_ms` beside the pair — item on `B-PRICE-SIDE-BY-JOB` (row `3n`), owner CC-C.

> ### THE COMPARATOR, PLAINLY
> `evaluatePendingMaker` asks each tick **"is the price at my limit yet?"** — for a resting buy,
> `price <= limit`. **The comparator is that test plus the price fed into it.** Today: a **midpoint**.
> It must be the **side that would transact** — **bid** for a resting sell, **ask** for a resting buy.
> ⭐ **A change of INPUT, not of machinery.**

### C-ii. ⛔⛔ THE **xSTOCK** EXIT TRIGGER — **A WHOLE LANE r2 OMITTED**, FOUND BY COMPARING AGAINST `XSTOCK_PRICING_PLAN`

⚠️ **r2's §C described the CRYPTO exit only and never said so.** The xStock exit is a separate path with its own basis, and leaving it out made the map read as complete when it covered one of two classes.
**It also reads a MIDPOINT** — `equity-spot-archiver.ts:208-209` → `markKindOf(bid, ask)` (`market-data/mark-kind.ts:33`: `'mid'` when both sides are present, `'last'` otherwise).
⭐ **SAME VERDICT, DIFFERENT MECHANISM, AND THE DIFFERENCE MATTERS:** crypto gets a midpoint because the **book leg carries no trade print at all**; xStock gets one because **a two-sided ticker quote exists and we average it.** ⇒ **the crypto fix needs a different channel; the xStock fix is choosing the other side of a quote we already hold.**
✅ **AND THIS LANE ALREADY HAS A SHIPPED GUARD THE MAP DID NOT KNOW ABOUT:** `B-XSTOCK-FEED-SANITY` (`#943`) added `asset_classes/xstock_spot/book-state.ts` — a pure predicate that calls a quote `two_sided`, `hollow` or `unknown`, because at Kraken's session handoffs the bid collapses, the mid follows it down, and the stop fires on a price nobody traded at. ⛔ **It withholds a decision; it never changes the SIDE.** **The side is still the midpoint, and that is still `P2`, still open.**

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

## 3. THE JUDGEMENT — ASKED IN DEPENDENCY ORDER

⛔⛔ **RESTRUCTURED 2026-09-13 ON KYLE'S CORRECTION. r2 ASKED THREE QUESTIONS IN PARALLEL AND THAT WAS INCOHERENT:** *“freshness is not anything we need to worry about if we don't have the right feed.”* ✅ **He is right — the questions are DEPENDENT, not parallel.** A 2-second-fresh price of the WRONG KIND is not better than a 60-second-old one; it is wrong faster. **So Q1 gates Q2 and Q3.**

### Q1 — IS THIS THE RIGHT *KIND* OF PRICE FOR THIS JOB? *(everything else is moot until this is yes)*

| situation | kind today | right kind | verdict |
|---|---|---|---|
| **exit trigger** | book **midpoint** | the **BID** (a resting sell is filled by a buyer) | ⛔ **WRONG KIND** |
| **crypto quant birth** | mixture: REST `last` + WS `mid`, **unstated per symbol** | one stated kind | ⛔ **WRONG — and “unstated” is the defect, not the mixture** |
| **crypto pattern birth** | 60-min **bar close** (a printed trade) | a printed price | ✅ **RIGHT KIND** |
| **xStock / VTS birth** | 60-min **bar close** | a printed price | ✅ **RIGHT KIND** |
| **xStock / VTS marketability** | 60-min **bar close** | the **ASK** (post-only is decided by the resting book) | ⛔ **WRONG KIND** |
| **entry marketability (active)** | book **ask** | the ask | ✅ **RIGHT KIND** |
| **RTB rank** | midpoint | a midpoint (it VALUES, it does not act) | ✅ **RIGHT KIND** |
| **portfolio marking** | midpoint | a midpoint (valuation) | ✅ **RIGHT KIND** |

### Q2 — FRESH ENOUGH? *(asked ONLY of the rows that passed Q1)*

| situation | age | verdict |
|---|---|---|
| crypto pattern birth | **up to 60 min** | ⛔ **NO** |
| xStock / VTS birth | **up to 60 min** | ⛔ **NO** |
| entry marketability (active) | depth snapshot **≤~30 s** | ⚠️ **UNRULED — needs the age distribution** |
| RTB rank | cache cadence **60 s / 90 s p90** | ✅ adequate for a ranking |
| portfolio marking | 5 s | ✅ yes |

⚠️ **The four Q1-failing rows are NOT listed here on purpose.** Their freshness is not a separate question — **fix the kind first, then ask the age OF THE NEW FEED**, which may have a different cadence entirely. *(For the record only, so nobody re-derives it as an open item: the exit trigger's 2 s window is not its binding constraint, and the crypto quant basis is 60–90 s.)*

### Q3 — SMOOTH IT? *(asked ONLY of rows that passed Q1)*

✅ **ONE ANSWER COVERS EVERY ROW: NO.** Smoothing is applied at exactly one place today — crypto quant birth — and that row **fails Q1**, so the smoothing question there is subordinate to fixing the kind.
⛔ **AND IT MUST NEVER BE ADDED TO THE EXIT TRIGGER** — ruled explicitly so that nobody “fixes” a clock mismatch by smoothing the acting end. **A price that acts is compared, not estimated.**

### ⭐ THE WHOLE JUDGEMENT IN ONE LINE
> **FOUR JOBS READ THE WRONG KIND OF PRICE: the exit trigger, crypto quant birth, xStock/VTS marketability, and — as a mixture rather than a wrong side — the quant basis itself.**
> **FOUR READ THE RIGHT KIND: both bar-close births, active entry marketability, RTB ranking, and portfolio marking.** *(Of the right-kind rows, TWO are too old: both 60-minute bar closes.)*

## 4. ⛔ FIVE PARALLEL DOCUMENTS — the response to "we lose sight of the system" cannot be a fifth narrative
`PRICING_DATA_ARCHITECTURE.md` (108 KB, **banner-marked NOT CANONICAL / UNDER CORRECTION**) · the
SysManual provenance table · `ACTIVE_PATH_FLOW.md` · the exit-path audit · **this**.
> `HOME: B-PRICE-DOC-CONSOLIDATE, owner CC-B, PHASE_19_PLAN after 3n` — this map either **supersedes** the
> SysManual provenance table with the manual pointing at it, or **folds into** it. **It does not ship as a
> fifth source.** The `:655`/`:668` correction rides the same batch and is **not deferrable**.

---

# 5. ⭐⭐ THE THREE-WAY COMPARISON — KYLE-DIRECTED, 2026-09-13

> **His instruction:** *“compare this map to the pricing data architecture… the x stock pricing plan, the pricing decision path… see where there are differences, and then those differences need to be reverified. So once we have all those comparisons done, and verified what is correct, then we can pick which document we use as our canonical governance document.”*

**Every row below was re-derived at `origin/migration/aws-supabase` in the same turn it was written.**

## 5.1 THE DIFFERENCES, AND WHO WAS RIGHT

| # | the difference | who was right | how it was re-verified |
|---|---|---|---|
| **1** | **Bar interval for the xStock lane.** This map said **60-minute**; `XSTOCK_PRICING_PLAN` §P6 said **15-minute**. | ⛔ **THE PLAN. THIS MAP WAS WRONG BY 4×.** | `scanner.ts:597` passes **15** to `getOHLCDataBatch`; the header comment 30 lines above it still says *“60-min bar parity with crypto”* and is **stale** — the flip landed 2026-06-04 (`B.4 FOUNDATION ACTIVATION`). ⭐ **I read the comment, not the call.** The eval lane has **ONE** call site (`scanner.ts:934`), so nothing else supplies bars. |
| **2** | **Crypto pattern lane interval.** | ✅ **THIS MAP.** | `signal-orchestrator.ts:2224` passes **60**. **The two lanes genuinely differ — 60 for crypto, 15 for xStock — and r2 collapsed them into one number.** |
| **3** | **Which price the crypto quant lane is built on.** `PRICING_DATA_ARCHITECTURE` §3.1 says **“SMOOTHED MID”**; this map said **“~85–90 % `last`”**. | ⛔ **NEITHER. BOTH OVERSTATE.** | The only instrument that exists reads **93.5 % `last`** over 400 health lines — but `price-cache.ts:569-572` rules it an **UPPER BOUND** with **no stated tightness**, so it cannot name the mixture either. ⭐ **The architecture doc's flat “MID” is REFUTED; this map's “85–90 %” had no population and is REPLACED.** ✅ **The JUDGEMENT survives unchanged: the defect is that the basis is UNSTATED per symbol.** |
| **4** | **VTS vs active split.** `PRICING_DATA_ARCHITECTURE` has one; this map had none. | ✅ **THE ARCHITECTURE DOC.** | Positive control: `vts-runner.ts` has **ZERO** `getSmoothedPrice` references; `signal-orchestrator.ts` has **2**. **Crypto VTS reads the raw cache price; crypto active reads the smoothed one.** |
| **5** | **Line numbers.** | ✅ **THIS MAP.** | Theirs have drifted — their `:2404` is blank, `:2417` is a comment, `:2442` parses volume. Mine resolve exactly at the ref. |
| **6** | **The xStock EXIT trigger.** `XSTOCK_PRICING_PLAN` §P1/§P2 and `..._DECISION_PATH` §4 both cover it; **this map had no row for it at all.** | ⛔ **THE xSTOCK DOCUMENTS. A WHOLE LANE WAS MISSING.** | Now §C-ii above, re-derived at `equity-spot-archiver.ts:208-209` → `mark-kind.ts:33`. |
| **7** | **xStock has no order-book ladder.** `..._DECISION_PATH` §Q1 states it; this map's feed table listed *“order book”* and *“depth snapshot”* **without saying they are crypto-only**. | ✅ **THE DECISION PATH.** | The `book` channel subscription lives only in `kraken-websocket-adapter.ts`; the xStock modules carry a `book-state` **predicate over the ticker's top-of-book**, not a ladder. ⇒ ⛔ **this map's “the right kind is the ASK” for xStock must mean the TICKER'S ask — there is no other.** |
| **8** | **The 4-second archive sample — 43.6 % of marks never stored** (`XSTOCK_PRICING_PLAN` §P5). Absent from this map. | ✅ **THE PLAN, AND IT IS THE SAME CLASS AS THE DEFECT THAT REFUTED MY OWN 14-of-24.** | Not re-measured here. ⚠️ **Recorded as the reason a stored row is a LAGGED WITNESS, not the decision.** |

## 5.2 ⛔⛔ THE 59 % — **UNSETTLED, AND NOW FOR A PRECISE REASON**

`XSTOCK_PRICING_PLAN` §P2: **“59 % of xStock resting exits booked at a price no bid ever reached.”** I wrote this section as UNSETTLED because I had not run the discriminating split on xStock. ✅ **I then ran it — it needed no new capture and no new column, because the test keys on `close_reason`, which is on every row.**

**POPULATION, STATED FIRST: 34 xStock closes carrying BOTH `exit_ticker_bid/ask` AND `exit_decision_price`, `closed_at` 2026-08-27 → 2026-09-12** — out of **274 all-time xStock closes since 2026-07-16**. ⚠️ **12.4 % coverage, because the witness column only began writing 2026-08-27 (`#911`).** `pos = (decision − bid)/(ask − bid)`:

| `close_reason` | `exit_fee_mode` | n | median pos | above ask | below bid | inside |
|---|---|---|---|---|---|---|
| `target_hit` | **maker** | **7** | **+5.500** | **7** | 0 | 0 |
| `stop_hit` | **taker** | **27** | **−0.550** | 0 | **19** | 8 |

### ⛔ THE CONFOUND, NAMED BEFORE THE CONCLUSION — AND IT KILLS THE ARGUMENT I WOULD HAVE LED WITH
**Direction of travel and fill mode are PERFECTLY COLLINEAR in this population: every target is a `maker` exit, every stop is a `taker` exit — 34 of 34, no crossover.** ⇒ ⛔ **the sign-flip argument that carried the crypto refutation CANNOT be run on xStock.** I cannot tell “rising vs falling” apart from “resting vs crossing” here, and I am not going to pretend the flip means on xStock what it meant on crypto.

### ⛔⛔ AND THE LEG I RESTED IT ON IS **DEAD** — SO §5.2 GOES BACK TO **UNSETTLED**
⚠️ **I published this section resting on “a midpoint cannot exceed `pos = 0.5` by construction”. CC-C had WITHDRAWN that bound hours earlier as a decomposition error and told me before Langston ruled.** ⛔ **On xStock the sign-flip leg is confounded away (above), so the bound was carrying the WHOLE section — and it carries nothing.**
⭐⭐ **THE DECOMPOSITION, WHICH IS WHAT THE NUMBER ACTUALLY SAYS — CC-C, re-derived independently by Langston, and it REPLACES the “bound” wording that stood here until 2026-09-13:**
> `pos = [(bid_d + ask_d)/2 − bid_w] / S_w` = **`0.5 + Δ/S_w`**, where `Δ` is the drift between the DECISION book and the WITNESS book.
⛔⛔ **SO THE SIDE TERM IS *CONTAINED* IN THE NUMBER, AT 0.5, ADDITIVELY — IT IS NOT EXCLUDED BY IT.** A departure of `+1.8` is `0.5 + 1.3`, not “3× an impossible side error”. ✅ **The midpoint sits at exactly 0.5 ONLY IF THE TWO READS ARE CONTEMPORANEOUS — and they are not, which is the whole finding.**
⇒ ✅ **WHAT THE MAGNITUDE LICENSES: it SIZES THE DRIFT. It does not bound the side defect away.**
⇒ ⛔ **`+5.500` IS `0.5 + 5.0`. It does not exclude a side defect; it says the DRIFT is ten times the side term.** ✅ **CC-C's own ruling, quoted so it is not softened: *“the magnitude bound cannot carry §5.2 alone — and NOT because n=7 is small. n is not what sinks it. The bound itself is void, so it would not carry at n=700.”***

### ✅ WHAT I CAN STILL SAY, AND IT IS LESS THAN I SAID AN HOUR AGO
**On xStock the decision price and the witness come from the SAME table** (§below), so a departure **cannot** be two feeds disagreeing — it can only be **one feed read at two times**. ⇒ **`Δ` is a time drift, and drift is what the number is dominated by.**
⛔⛔ **BUT THAT MAKES THE 59 % UNDECIDABLE ON THESE ROWS, NOT REFUTED.** The side term is **present at 0.5 in every row and is not separable from `Δ` without knowing the witness's capture time** — which **no column on either class records.**
⚠️ **AND `Δ = 5.0` SPREAD-WIDTHS IN A ~4 s ARCHIVER GAP IS ITSELF LARGE ENOUGH TO QUESTION** — it is consistent with the session-handoff re-quote `XSTOCK_PRICING_PLAN` §P4 measures (27 % of xStock stop-outs in one minute) and with the `hollow` books `B-XSTOCK-FEED-SANITY` ships a guard for. **I am not attributing it; I am recording that the drift is not ordinary.**
✅ **NET: I neither cite the 59 % nor strike it — the position I started at.** ⭐ **WHAT IS GAINED IS THE REASON: it is not “a test I have not run”, it is that THIS INSTRUMENT CANNOT SEPARATE THE TWO TERMS.**
### ⚠️ WHAT I AM AND AM NOT SAYING
⛔ **NOT SAYING the plan's measurement was wrong about what IT measured** — it was written 2026-08-30 against a different, earlier instrument (the ~21 rows carrying `exit_decision_price`, per `book-state.ts:16`). **I did not reproduce its population and I am not claiming to have.**
⛔ **AND `n=7` IS SMALL — but per CC-C, `n` is NOT what sinks this leg; the bound is void at any `n`. Stated so nobody “rescues” §5.2 by collecting more rows on the same instrument.**
➕ **AND THAT PROMOTES THE `3n` ITEM FROM NICE-TO-HAVE TO PREREQUISITE: persisting the witness capture time is the ONLY thing that makes `Δ` estimable and the side term readable — on EITHER class.**

### ⭐ CC-C's STRUCTURAL POINT, RE-DERIVED AT THE REF AND IT STANDS
`depth-source.ts:89-93` + `shared/schema.ts:1846-1848`: **on xStock the witness is NOT independent** — the fill's own depth-walk reads `xstock_spot_ticker_snap`, **the same table** `getTickerWitness` reads. ⇒ **it is a CONSISTENCY record, not corroboration against a second feed**, and *“do NOT treat agreement here as confirmation”*. ⭐ **AND THAT CUTS BOTH WAYS, WHICH IS THE USEFUL HALF: with only ONE channel, an xStock departure CANNOT be ‘two feeds disagreeing’ — it can only be the archiver's own ~4 s write cadence and the price moving inside it.** The lag reading is therefore BETTER supported on xStock than on crypto, not worse.

⛔ **THE COLUMN CC-C HOPED FOR IS THE WRONG INSTANT.** `exit_fill_depth_age_ms` **is** populated on xStock, but `schema.ts:1817` says plainly these are **THREE DIFFERENT INSTANTS**: it is the age of the depth the **FILL** walked, not the age of the **WITNESS** row. **No witness-age column exists on either class.** ➕ **That gap is unchanged and still homed: persist the witness capture time — item on `B-PRICE-SIDE-BY-JOB` (row `3n`), owner CC-C.**
➕ **NEW ITEM, from the confound above: the xStock arm needs a population where direction and fee mode are NOT collinear before any direction-based test can run there.** Same home, same owner.

## 5.3 ⭐⭐ WHICH DOCUMENT IS CANONICAL — THE RECOMMENDATION

| document | verdict |
|---|---|
| **`PRICING_DATA_ARCHITECTURE.md`** (108 KB) | ⛔ **NOT CANONICAL, AND ITS OWN BANNER SAYS SO** — *“UNDER CORRECTION”*, 14 returned corrections, one overturning its central structural claim, Parts 3–6 *“framed and not yet filled”*. **Its §3.1 master table is the same work as this map and its line numbers have drifted.** |
| **`XSTOCK_PRICING_PLAN.md`** + **`XSTOCK_PRICING_DECISION_PATH.md`** | ✅ **KEEP BOTH, UNCHANGED, AS WHAT THEY ARE: a problems→solutions→order PLAN and a decision ROUTE for one asset class.** ⛔ **Neither is a map of where prices come from, and neither claims to be.** |
| **`SYSTEM_MANUAL.md` provenance table** | ⛔ **THREE CELLS ALREADY MARKED SUPERSEDED** (2026-09-13). It must end up POINTING at the canonical map, not holding a second copy. |
| ⭐ **`PRICE_FEED_MAP.md` — THIS FILE** | ✅ **RECOMMENDED CANONICAL, ON ONE CONDITION: it absorbs differences 1, 4, 6 and 7 above — which it now has — and the architecture doc's §3.1 is retired INTO it rather than left standing beside it.** |

⛔⛔ **THE CONDITION IS NOT A FORMALITY. THE REASON TO PICK THIS FILE IS NOT THAT IT WAS RIGHT — IT WAS WRONG ON A 4× INTERVAL AND MISSING AN ENTIRE ASSET CLASS'S EXIT PATH.** It is that it is **small enough to hold one statement per job**, and that **every line in it now resolves at the ref**. ⭐ **A 108 KB document that cannot be re-verified in an afternoon cannot be the thing four sessions check themselves against.**

✅ **KYLE DECIDES.** The work to execute it is already placed: `B-PRICE-DOC-CONSOLIDATE`, owner CC-B, `PHASE_19_PLAN` after `3n`.
