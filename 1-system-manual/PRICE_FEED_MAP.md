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
| **OHLC cache** | ⚠️ **TWO BRANCHES: 60-minute for crypto, 15-minute for xStock** (`scanner.ts:592-597`) | OHLCV — **history** | **5-min TTL** |
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
| **xStock / VTS** | `scanner.ts:934` → `eval-cycle.ts:304` (ONE call site, import `:740`) | ⭐ **a 15-MINUTE BAR CLOSE** — `scanner.ts:597 getOHLCDataBatch(symbolList, 15)`, read at `:909-910 latestBar.close` | **not a print** | **up to 15 min** |

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
⛔⛔ **THE 14-of-24 READING IS *UNATTRIBUTABLE*. DO NOT CITE IT — AND DO NOT CITE IT AS *REFUTED* EITHER.**
⭐ **r3 CORRECTION (Langston): “refuted” claims a fact about the WORLD; what we have is a fact about the INSTRUMENT.** The number cannot be attributed to a side defect, to drift, or to anything else — not because we tested it and it failed, but because **nothing derived from this witness can attribute magnitude to any term** (§the construction argument below, which is the ONLY leg that survives).
*(The split below is retained as DESCRIPTION. ⛔ It is NOT evidence — see the selection-effect note under it.)*

| `close_reason` | n | median pos | above ask | below bid |
|---|---|---|---|---|
| `target_hit` | 24 | **+1.791** | **20** | 0 |
| `stop_hit` | 38 | **−1.300** | 1 | **31** |

⛔⛔ **THE SIGN FLIP IS NOT A DISCRIMINATOR AND NEVER WAS — IT *CANNOT FAIL* (Langston r3, and this retires the leg I had promoted to carry §1C).**
⭐⭐ **IT IS A SELECTION EFFECT: rows enter this population BECAUSE THE DECISION PRICE CROSSED A THRESHOLD** — upward for a target, downward for a stop. ⇒ **any witness that lags AT ALL therefore sits on the pre-move side: low for targets, high for stops. Entailed by the SAMPLING RULE plus `lag > 0`, for ANY mechanism, at ANY size.** ⛔ **A test whose outcome is guaranteed by how the sample was drawn confirms nothing beyond “lag is nonzero”.**
⛔ **AND IT HAS NO POWER AGAINST THE SIDE TERM IN EITHER DIRECTION.** With NO side defect (`decision = bid`) the arms read **+1.291 / −1.800** instead of +1.791 / −1.300 — **both still flip.** ⭐ **That is exactly what §5.2 concluded for xStock, and §1C declined to conclude for crypto — two epistemic standards for one statistic, which is itself the tell.**
⛔⛔ **WITHDRAWN 2026-09-13, SAME DAY, BY ITS OWN AUTHOR: THIS PARAGRAPH CLAIMED THE MAGNITUDE MADE A SIDE ERROR “ARITHMETICALLY IMPOSSIBLE”. THAT IS A DECOMPOSITION ERROR AND THE CLAIM IS DEAD.** CC-C pulled their own bound and flagged it before this document went to Langston as final.
⭐⭐ **THE DECOMPOSITION, WHICH IS WHAT THE NUMBER ACTUALLY SAYS — CC-C, re-derived independently by Langston, and it REPLACES the “bound” wording that stood here until 2026-09-13:**
> `pos = [(bid_d + ask_d)/2 − bid_w] / S_w` = **`0.5 + Δ/S_w`**, where `Δ` is the drift between the DECISION book and the WITNESS book.
⛔⛔ **SO THE SIDE TERM IS *CONTAINED* IN THE NUMBER, AT 0.5, ADDITIVELY — IT IS NOT EXCLUDED BY IT.** A departure of `+1.8` is `0.5 + 1.3`, not “3× an impossible side error”. ✅ **The midpoint sits at exactly 0.5 ONLY IF THE TWO READS ARE CONTEMPORANEOUS — and they are not, which is the whole finding.**
⇒ ✅ **WHAT THE MAGNITUDE LICENSES: it SIZES THE DRIFT. It does not bound the side defect away.**
⛔ **AND `“Δ IS DRIFT BY DEFINITION”` WAS DEFINITIONAL SMUGGLING — STRUCK.** The algebra gives `Δ = mid_d − mid_w`, **nothing more.** On crypto the witness comes off a **SEPARATE SOCKET**, so `Δ = time drift **+** inter-channel offset` — and this section asserted **time** in one line and **“the two CHANNELS disagreeing”** four lines later. **One section, both mechanisms, stated as though each were the whole.**
✅ **WHAT THE FLIP DOES STILL ARGUE AGAINST, AND IT IS ALL IT ARGUES: a CONSTANT channel offset** — that would push both arms the same way. **It does not reduce `Δ` to time.**
*(Descriptive, no longer load-bearing: of the 24 target rows FOUR sit inside `[0,1]` — CHIP 0.421 · ACU 0.667 · DASH 0.888 · RAY 1.000 — and twenty are outside.)*
⛔⛔ **A SENTENCE STOOD HERE RESTATING THE WITHDRAWN BOUND AS A CONCLUSION** — it told the reader that neither tail could be a wrong-side error, on the ground that the departures exceeded the withdrawn half-spread limit — **bolded, and handed over as a one-line self-check.** *(The sentence is DELIBERATELY NOT QUOTED here: Langston's point was that it is the most quotable line in the section, so reproducing it verbatim inside its own retraction keeps it greppable and travelling.)* STRUCK 2026-09-13 (Langston r3: THIRD site, inside the section that claimed to have struck it, and the most quotable line in it — the one that would travel).**
⭐ **THE LESSON, RECORDED BECAUSE IT COST THREE PASSES: striking a claim's STATEMENT does not strike its CONCLUSIONS. Grep the claim's CONSEQUENCES, not its wording.**

### ⭐⭐ THE ONE LEG THAT SURVIVES EVERYTHING — AND §1C NOW RESTS ON IT **ALONE** (Langston r3)
✅ **IT WAS STRUCTURALLY UNATTRIBUTABLE FROM THE ROW ALL ALONG, AND THIS IS A CONSTRUCTION ARGUMENT THAT NEEDS NO SPLIT, NO COHORT AND NO `n`:** `exit_ticker_bid/ask` is written by the ARCHIVER off a **separate socket** — `depth-source.ts:80-97` calls it *“a lagged witness”*, cadence 5.0–9.0 s; F-G-2 measured this arm at p50 **12.33 s** (n=3, a lead not a rate). `capturedAtMs` exists at `active-execution-engine.ts:2338` but the persist payload (`:2974-2977`, `shared/schema.ts:1854-1855`) writes **only the bid/ask pair** — no capture-time column exists anywhere. ⛔ **`B_EXIT_PROVENANCE_COMPLETION_REPORT.md:101` PRE-REGISTERED THE OBLIGATION I MISSED: *“Any analysis using it must read that column.”***
⛔ **A MID SITS AT `pos = 0.5` OF ITS OWN BOOK** (`kraken-websocket-adapter.ts:1165-1166`, `:1172-1173`) — ⚠️ **but “its own book” is the load-bearing qualifier, and `pos` normalises by the WITNESS book. The null is `0.5·(S_d/S_w)`, NOT 0.5** (§5.2).
⭐⭐ **SO THE VERDICT IS THE SAME ON BOTH ASSET CLASSES, WHICH IS HOW IT SHOULD HAVE READ FROM THE START: a separately-sourced lagged snapshot with NO capture-time column cannot attribute magnitude to ANY term.** ✅ **CRYPTO CONTROL, measured: witness spreads median 14.4 bps (`stop_hit`, n=38) / 20.7 bps (`target_hit`, n=24), only 3 of 62 rows above 100 bps — no collapsed-book cohort, and crypto has no session boundary to produce one.** ⚠️ **`S_d` is NOT persisted on crypto either, so the ratio term is unbounded there too.** *(CC-C reports `metadata.fg2Shadow` may carry crypto-side stamps — unopened, not claimed.)*

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
**It also reads a MIDPOINT** — `server/services/passive-archive/equity-spot-archiver.ts:208-209` → `markKindOf(bid, ask)` (`market-data/mark-kind.ts:33`: `'mid'` when both sides are present, `'last'` otherwise).
⭐ **SAME VERDICT, DIFFERENT MECHANISM, AND THE DIFFERENCE MATTERS:** crypto gets a midpoint because the **book leg carries no trade print at all**; xStock gets one because **a two-sided ticker quote exists and we average it.** ⇒ **the crypto fix needs a different channel; the xStock fix is choosing the other side of a quote we already hold.**
✅ **AND THIS LANE ALREADY HAS A SHIPPED GUARD THE MAP DID NOT KNOW ABOUT:** `B-XSTOCK-FEED-SANITY` (`#943`) added `asset_classes/xstock_spot/book-state.ts` — a pure predicate that calls a quote `two_sided`, `hollow` or `unknown`, because at Kraken's session handoffs the bid collapses, the mid follows it down, and the stop fires on a price nobody traded at. ⛔ **It withholds a decision; it never changes the SIDE.** **The side is still the midpoint, and that is still `P2`, still open.**

### D. ENTRY MARKETABILITY — ⛔ THE ASYMMETRY IS **STALENESS**, NOT SIDE

| lane | reads | what it actually is |
|---|---|---|
| active | `aee:4038` `_gate.snapshot.asks[0].price` | **depth snapshot, ≤~30 s stale** |
| VTS / xStock | `eval-cycle.ts:956` `isMarketableAtPlacement('buy', lastPrice, …)` | ⭐ **a 15-MINUTE BAR CLOSE** — the same `latestBar.close` the levels came from |

⛔ **r1 SAID "ask vs print, biased in opposite directions". THAT IS WITHDRAWN.** It is **a ~30 s book side
against a bar up to 15 minutes old**, and **a stale bar's error is RANDOM IN SIGN** — so opposite-direction bias is
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
| **xStock / VTS birth** | **15-min bar close** | a printed price | ✅ **RIGHT KIND** |
| **xStock / VTS marketability** | **15-min bar close** | the **ASK** — ⚠️ **and xStock has NO ladder: the only ask that exists is the TICKER's top-of-book** | ⛔ **WRONG KIND** |
| **entry marketability (active)** | book **ask** | the ask | ✅ **RIGHT KIND** |
| **RTB rank** | midpoint | a midpoint (it VALUES, it does not act) | ✅ **RIGHT KIND** |
| **portfolio marking** | midpoint | a midpoint (valuation) | ✅ **RIGHT KIND** |

### Q2 — FRESH ENOUGH? *(asked ONLY of the rows that passed Q1)*

| situation | age | verdict |
|---|---|---|
| crypto pattern birth | **up to 60 min** | ⛔ **NO** |
| xStock / VTS birth | **up to 15 min** | ⛔ **NO** — *verdict unchanged; r2's number was 4× wrong* |
| entry marketability (active) | depth snapshot **≤~30 s** | ⚠️ **UNRULED — needs the age distribution** |
| RTB rank | cache cadence **60 s / 90 s p90** | ✅ adequate for a ranking |
| portfolio marking | 5 s | ✅ yes |

⚠️ **The four Q1-failing rows are NOT listed here on purpose.** Their freshness is not a separate question — **fix the kind first, then ask the age OF THE NEW FEED**, which may have a different cadence entirely. *(For the record only, so nobody re-derives it as an open item: the exit trigger's 2 s window is not its binding constraint, and the crypto quant basis is 60–90 s.)*

### Q3 — SMOOTH IT? *(asked ONLY of rows that passed Q1)*

✅ **ONE ANSWER COVERS EVERY ROW: NO.** Smoothing is applied at exactly one place today — crypto quant birth — and that row **fails Q1**, so the smoothing question there is subordinate to fixing the kind.
⛔ **AND IT MUST NEVER BE ADDED TO THE EXIT TRIGGER** — ruled explicitly so that nobody “fixes” a clock mismatch by smoothing the acting end. **A price that acts is compared, not estimated.**

### ⭐ THE WHOLE JUDGEMENT IN ONE LINE
> **FOUR JOBS READ THE WRONG KIND OF PRICE: the exit trigger, crypto quant birth, xStock/VTS marketability, and — as a mixture rather than a wrong side — the quant basis itself.**
> **FOUR READ THE RIGHT KIND: both bar-close births, active entry marketability, RTB ranking, and portfolio marking.** *(Of the right-kind rows, TWO are too old: the crypto pattern lane's **60-minute** bar close and the xStock/VTS **15-minute** one — **different intervals; r2 called both 60.**)*

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
| **6** | **The xStock EXIT trigger.** `XSTOCK_PRICING_PLAN` §P1/§P2 and `..._DECISION_PATH` §4 both cover it; **this map had no row for it at all.** | ⛔ **THE xSTOCK DOCUMENTS. A WHOLE LANE WAS MISSING.** | Now §C-ii above, re-derived at `server/services/passive-archive/equity-spot-archiver.ts:208-209` → `mark-kind.ts:33`. |
| **7** | **xStock has no order-book ladder.** `..._DECISION_PATH` §Q1 states it; this map's feed table listed *“order book”* and *“depth snapshot”* **without saying they are crypto-only**. | ✅ **THE DECISION PATH.** | The `book` channel subscription lives only in `kraken-websocket-adapter.ts`; the xStock modules carry a `book-state` **predicate over the ticker's top-of-book**, not a ladder. ⇒ ⛔ **this map's “the right kind is the ASK” for xStock must mean the TICKER'S ask — there is no other.** |
| **8** | **The 4-second archive sample — 43.6 % of marks never stored** (`XSTOCK_PRICING_PLAN` §P5). Absent from this map. | ✅ **THE PLAN, AND IT IS THE SAME CLASS AS THE DEFECT THAT REFUTED MY OWN 14-of-24.** | Not re-measured here. ⚠️ **Recorded as the reason a stored row is a LAGGED WITNESS, not the decision.** |

## 5.2 ⭐⭐ THE 59 % — **CORROBORATED ON THE HANDOFF COHORT. I HAD IT BACKWARDS TWICE.**

⛔⛔ **LANGSTON'S BLOCKER 2, 2026-09-13, AND IT IS A REVERSAL RATHER THAN A CORRECTION.** I first wrote this section as SETTLED-refuted, then as UNSETTLED after CC-C withdrew the bound under it. **Both were wrong in the same direction**, and **the map's own §C-ii contained the refutation of my refutation two sections earlier.**

### ⛔ THE PREMISE BOTH OF MY VERSIONS HID
*“A midpoint cannot exceed `pos = 0.5` by construction”* is true **only of a midpoint measured in ITS OWN book's spread units.** `pos` normalises by the **WITNESS** spread `S_w` — a different book at a different instant. The honest decomposition is
> **`pos = 0.5·(S_d/S_w) + δ/S_w`**  — `δ` = bid drift, `S_d` = the DECISION book's spread.
⛔ **NOT `0.5 + δ/S_w`** — CC-C's replacement algebra, and the version I published at `c9ed8917d`, **carries the same hidden `S_d = S_w` assumption as the bound it replaced.** ⭐⭐ **THE SIDE TERM IS BOUNDED AT HALF THE SPREAD *RATIO*, NOT AT 0.5.** ⇒ *“the only quantity that can put a price 5.5 spread-widths outside a book is TIME”* is **FALSE** — a spread ratio does it with **zero drift**.

### ✅ LANGSTON RE-DERIVED MY POPULATION AND ADDED THE COLUMN NOBODY HAD
`n=7` reproduces exactly, median `pos` +5.500. **With the witness spread beside it:**

| symbol | closed_at (UTC) | decision px | witness bid/ask | `pos` | **witness spread %** |
|---|---|---|---|---|---|
| BMNR | 08-27 **15:57:33** | 26.515 | 26.46 / 26.47 | 5.500 | **0.038** |
| WEN | 08-29 **00:15:03** | 13.310 | 7.70 / 8.36 | 8.500 | **8.571** |
| DE | 09-02 **00:15:03** | 689.435 | 676.00 / 677.50 | 8.957 | 0.222 |
| ARKK | 09-05 **00:16:31** | 92.505 | 81.04 / 86.31 | 2.176 | **6.503** |
| LI | 09-08 **00:15:04** | 12.805 | 11.70 / 12.60 | 1.228 | **7.692** |
| LMT | 09-10 **00:15:12** | 571.680 | 506.08 / 545.78 | 1.652 | **7.845** |
| CRM | 09-12 **00:16:31** | 503.500 | 235.00 / 248.40 | 20.037 | **5.702** |

⭐⭐ **SIX OF THE SEVEN CLOSED IN THE 00:15–00:16Z SESSION-HANDOFF MINUTE**, and on **five of seven the DENOMINATOR ITSELF is a 5.7–8.6 % book** — so `pos` is not a spread-width in any ordinary sense.
⛔ **CRM IS DECISIVE: its decision price is the midpoint of a ~\$7 bid against a ~\$1,000 ask.** `S_d/S_w ≈ 74` ⇒ **the side term ALONE ≈ 37**, which **OVER-EXPLAINS the observed 20.0 with no drift at all.**

### ⭐ THE VERDICT, AND IT IS THE OPPOSITE OF WHAT I PUBLISHED TWICE
✅ **ON THE HANDOFF COHORT THE DEPARTURE *IS* A SIDE ERROR — the midpoint of a COLLAPSED book — which is exactly what `XSTOCK_PRICING_PLAN` §P2 claims, and exactly what THIS MAP'S OWN §C-ii cites `#943` for:** *“the bid collapses, the mid follows it down, and the stop fires on a price nobody traded at.”* ⛔⛔ **I REFUTED IN §5.2 THE THING I DOCUMENTED IN §C-ii.**
✅ **THE HONEST SPLIT, and time-of-day is the discriminator — available NOW, no new column: 2 rows LAG** (BMNR, session body, 0.038 % witness book; plausibly DE) **· 5 rows BOOK-SHAPE.**
⇒ ✅ **DIAGNOSIS UNCHANGED FROM `3b.f-c`. The plan's §P2 stands.**

### ⭐⭐ `S_d` IS **PERSISTED** — SO THE RATIO IS MEASURABLE, NOT INFERRED (CC-C found it; CC-B ran it, 2026-09-13)
⛔ **“No column carries the decision-instant book” was WRONG, and CC-C checked precisely because they had told me they had not.** `metadata.bookState.yields[].inputs` carries **decision-instant `bid`/`ask`/`last` with their own `atMs`** — written by the `#943` guard. ⇒ **`S_d/S_w` can be COMPUTED per row.**

**Last yield per trade, of the 4 rows that carry `bookState` (the guard postdates WEN/DE/BMNR):**

| symbol | closed (UTC) | `pos` | **`S_d/S_w`** | side term alone `0.5·(S_d/S_w)` | verdict |
|---|---|---|---|---|---|
| ARKK | 09-05 00:16 | 2.176 | **4.74** | **2.37** | ✅ **BOOK-SHAPE explains it** |
| LI | 09-08 00:15 | 1.228 | 1.00 | 0.50 | ⚠️ side term too small — **drift contributes** |
| LMT | 09-10 00:15 | 1.652 | **0.26** | 0.13 | ⚠️ side term too small — **drift contributes** |
| CRM | 09-12 00:16 | 20.037 | **74.10** | **37.05** | ✅ **BOOK-SHAPE, and it OVER-explains** |

✅ **CRM REPRODUCES LANGSTON EXACTLY: decision book `bid 7.00 / ask 1000.00`, and `503.500` is PRECISELY its midpoint.** A 14,186 % spread. **The mechanism is real and it is enormous.**
⭐⭐ **BUT THE COHORT SPLIT IS NOT THE ONE INFERRED, AND THE REASON IS THE SAME ERROR ONE LEVEL DOWN: `S_d` WAS READ OFF `S_w`.** A wide WITNESS book does **not** imply a wide DECISION book — **LI and LMT have decision books NARROWER than their witness books** (`ratio` 1.00 and **0.26**), so their departures are **drift**, not side.
⇒ ✅ **MEASURED SPLIT ON WHAT CAN BE MEASURED: 2 of 4 BOOK-SHAPE (ARKK, CRM) · 2 of 4 DRIFT (LI, LMT).** **3 rows (WEN, DE, BMNR) predate the guard and carry no `bookState` — undecidable, stated as such.**
⛔ **THIS DOES NOT WEAKEN THE BLOCKER-2 VERDICT — IT CONFIRMS ITS MECHANISM AND CORRECTS ITS ARITHMETIC.** §P2 is corroborated: **a booked sale at the midpoint of a 7-against-1000 book is exactly “a price no bid ever reached”.** What changes is that **the two causes COEXIST row by row**, and only the persisted `S_d` tells them apart.
### ⭐⭐ AND THE xSTOCK SIDE DEFECT NEEDS **NO** `Δ`, NO CAPTURE TIME AND NO `pos` — IT IS DETERMINISTIC
⛔ **§5.2 READ AS THOUGH THE SIDE QUESTION WERE OPEN ON xSTOCK. IT IS NOT. ONLY THE ATTRIBUTION OF THE OBSERVED MAGNITUDE IS** (Langston r3, verified at the object).
`server/services/passive-archive/equity-spot-archiver.ts:~209` — `_mark = _kind === 'mid' ? (_bid+_ask)/2 : _last`, and `markKindOf` returns `'mid'` **iff both sides > 0**. **A long spot exit is a SELL and fills on the BID.** ⇒ ⭐⭐ **THE MARK IS FAVOURABLE BY EXACTLY `½·S` ON EVERY TWO-SIDED xSTOCK ROW, DETERMINISTICALLY — no inference, no cohort, no instrument.**
✅ **AND ITS SIZE IS MEASURABLE TODAY, from the spread distribution on the same table. MEASURED 2026-09-13, median half-spread `½·S_w`:**

| population | n | median `S_w` | **median `½·S_w`** |
|---|---|---|---|
| xStock `target_hit` (maker) | 7 | **650.3 bps** (\$1.50) | ⛔ **325.1 bps** |
| xStock `stop_hit` (taker) | 27 | 42.7 bps (\$0.96) | **21.3 bps** |
| crypto `target_hit` | 24 | 20.7 bps | 10.4 bps |
| crypto `stop_hit` | 38 | 14.4 bps | 7.2 bps |

⚠️ **AND THIS RETIRES MY OWN “Δ = 5.0 IS NOT ORDINARY” LINE AS AN ADJECTIVE ON A DIMENSIONLESS RATIO (Langston).** `pos = Δ/S` — five spread-widths on a one-cent spread is five cents. **I published no `S_w` in currency or bps anywhere, so “large enough to question” was FELT, not measured** — and a collapsed bid *widens* `S` and *shrinks* `pos` for the same `Δ`, which cuts the other way. **The table above is what that sentence should have been.**
⛔ **SO THE CORRECTION TO THE LINE BELOW: capture time is the prerequisite for `Δ` and for anything read off `pos`. IT IS **NOT** WHAT MAKES THE SIDE TERM READABLE — AND THE SIDE FIX MUST NOT BE SCHEDULED BEHIND IT.**

➕ **AND THAT RETARGETS `3n.n`: the witness capture time is NOT the only missing instrument — `S_d` already exists in metadata and is not promoted to a column. Promoting it is cheaper and decides more.**

### ⚠️ AND ON CRYPTO THE SAME TEST COMES BACK CLEAN — MEASURED, NOT ASSUMED
Witness spreads on the 62 stamped crypto rows: **median 0.14 % (`stop_hit`, n=38) / 0.21 % (`target_hit`, n=24); only 3 rows exceed 1 %.** ⇒ **no collapsed-book cohort exists there**, which is what the handoff produces on xStock and which crypto — trading 24/7 — has no session boundary to produce.
✅ **SO §1C's SIGN-FLIP LEG STANDS.** ⚠️ **RESIDUAL, STATED: `S_d` is NOT persisted on the crypto side either (`exit_book_mid` is a MID, not a pair), so the ratio term is UNBOUNDED there too — nothing merely suggests it is large.** CC-C reports `metadata.fg2Shadow` may carry crypto-side stamps; **unopened, and not claimed.**

### ⛔ AND MY ONE-CHANNEL INFERENCE WAS RIGHT IN ITS PREMISE, WRONG IN ITS CONCLUSION
`getTickerWitness` and the fill's depth-walk **do** both read `xstock_spot_ticker_snap` — ONE socket. ⛔ **But it is ONE SOCKET AT *TWO SAMPLING RATES*: the decision reads the UNTHROTTLED `latestEquityTick` (`server/services/passive-archive/equity-spot-archiver.ts:212`); the witness reads the **4,000 ms-THROTTLED** `bufferTickerSnap`.** ⭐ **AND THE DROPPED FRAMES ARE NON-RANDOMLY THE HOLLOW ONES** (CC-C: 10/10 session bodies vs 2/11 handoffs). ⇒ **the residual is NOT “time”; it is “time **OR** a different BOOK SHAPE at the decision instant” — and the table above shows which.**

### ⛔⛔ AND THE VERDICT WORD IS *UNREPRODUCED*, NOT “UNDECIDABLE” (Langston r3 — WRONG OBJECT)
“Undecidable” asserts a test was run and cannot resolve. **I ran a DIFFERENT test on a DIFFERENT population and found THAT one cannot resolve.** ⛔ **§P2's own test has never been reproduced.** ✅ **Cheapest action first: re-derive §P2's OWN population before retiring it as unknowable.**

### ⚠️ AND THE “DIFFERENT POPULATION” WAVE-OFF IS STRUCK (Langston)
§P2's ~21 rows and my 34 are **both post-2026-08-26 and they OVERLAP.** ⛔ **“A different instrument” was a reason not to look. Enumerate the overlap** — item on `3b.f-c`.

➕ **DISPOSITIONS (Langston):** the 6-of-7 handoff rate → **item on `3b.f-c`** (CC-C) — it upgrades CRM/NEM from two specimens to a RATE. The `0.5·(S_d/S_w)` correction → **item on `3n.n`** (CC-C) — it **sharpens** why that row is the precondition rather than weakening it.

## 5.3 ⭐⭐ WHICH DOCUMENT IS CANONICAL — THE RECOMMENDATION

| document | verdict |
|---|---|
| **`PRICING_DATA_ARCHITECTURE.md`** (108 KB) | ⛔ **NOT CANONICAL, AND ITS OWN BANNER SAYS SO** — *“UNDER CORRECTION”*, 14 returned corrections, one overturning its central structural claim, Parts 3–6 *“framed and not yet filled”*. **Its §3.1 master table is the same work as this map and its line numbers have drifted.** |
| **`XSTOCK_PRICING_PLAN.md`** + **`XSTOCK_PRICING_DECISION_PATH.md`** | ✅ **KEEP BOTH, UNCHANGED, AS WHAT THEY ARE: a problems→solutions→order PLAN and a decision ROUTE for one asset class.** ⛔ **Neither is a map of where prices come from, and neither claims to be.** |
| **`SYSTEM_MANUAL.md` provenance table** | ⛔ **THREE CELLS ALREADY MARKED SUPERSEDED** (2026-09-13). It must end up POINTING at the canonical map, not holding a second copy. |
| ⭐ **`PRICE_FEED_MAP.md` — THIS FILE** | ✅ **RECOMMENDED CANONICAL, ON ONE CONDITION: it absorbs differences 1, 4, 6 and 7 above — which it now has — and the architecture doc's §3.1 is retired INTO it rather than left standing beside it.** |

⛔⛔ **THE CONDITION IS NOT A FORMALITY. THE REASON TO PICK THIS FILE IS NOT THAT IT WAS RIGHT — IT WAS WRONG ON A 4× INTERVAL AND MISSING AN ENTIRE ASSET CLASS'S EXIT PATH.** It is that it is **small enough to hold one statement per job**, and that **every line in it now resolves at the ref**. ⭐ **A 108 KB document that cannot be re-verified in an afternoon cannot be the thing four sessions check themselves against.**

✅ **KYLE DECIDES.** The work to execute it is already placed: `B-PRICE-DOC-CONSOLIDATE`, owner CC-B, `PHASE_19_PLAN` after `3n`.
