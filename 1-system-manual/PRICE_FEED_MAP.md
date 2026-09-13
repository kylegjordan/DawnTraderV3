# PRICE FEED MAP — WHERE EVERY PRICE IN THE SYSTEM COMES FROM

**Kyle-directed · CC-B · r5.**

> ## ⛔⛔ DERIVED-AT STAMP — **READ THIS BEFORE CITING ANY LINE BELOW**
> **EVERY `path:line`, COUNT AND VERDICT IN THIS DOCUMENT WAS DERIVED AT:**
> ### `7f645a6f9c677d75523a1fc7dfba0aa30ef10eed`
> **THE SHA IS AUTHORITATIVE; NO DATE IS GIVEN, DELIBERATELY.** ⚠️ *r4 carried a date beside this sha that was one day AHEAD of the commit it names (`2026-09-13T19:57:38Z`) — **a wrong value on the one line the whole recommendation rests on, wrong within hours of being typed.** A sha cannot drift; a date can, and did. The wrong value is deliberately not restated here.*
> ⭐⭐ **THIS STAMP IS THE DOCUMENT'S WHOLE CLAIM TO BEING CANONICAL, AND IT DECAYS ON THE NEXT COMMIT (Langston's condition, r3).** The map is nominated canonical for ONE reason — *every line resolves at the ref* — and **that is a property of a MOMENT, not of the file.**
> ⚠️ **THE FAILURE THIS GUARDS IS ALREADY ON THE RECORD IN §5.1 DIFFERENCE #1: a 4× wrong interval, read off a STALE COMMENT sitting thirty lines above the live call.** That comment was true when written. **Without a stamp and a trigger this file becomes the sixth stale pricing document inside a month.**
>
> ### ⛔ THE RE-DERIVATION TRIGGER — **DERIVED MECHANICALLY FROM THIS DOCUMENT'S OWN CITATIONS**
> ⛔⛔ **r4's TRIGGER LIST WAS HAND-NAMED AND SCORED FALSE-CLEAN. LANGSTON ENUMERATED IT: 21 distinct `.ts` files cited, **11 outside every trigger row**, and **SIX of those carry LIVE VERDICTS** — including `equity-spot-archiver.ts`, which holds §C-ii's ENTIRE xStock exit verdict AND §5.2's deterministic `½·S` argument.** ⭐ **Trigger 1 named `mark-kind.ts` and MISSED the archiver's own `_kind === 'mid' ? (_bid+_ask)/2 : _last` one frame up.**
> ⭐⭐ **THAT IS `enumerator-blind-spot` FROM `MISTAKE_PATTERNS` — A HAND-NAMED LIST IS BLIND TO A MEMBER CLASS AND REPORTS CLEAN. SO THE LIST IS NO LONGER HAND-NAMED.**
>
> ✅ **THE RULE, WHICH IS THE FIX: THE TRIGGER SET *IS* THE SET OF FILES THIS DOCUMENT CITES.** Adding a citation adds a trigger, automatically and by construction.
> ⛔⛔ **AND THE SUBTRACTION UNIT IS A *CITATION*, NOT A *FILE* — THIS SENTENCE IS THE RULE, AND r5 GOT IT WRONG (Langston, confirm round).** ⭐⭐ **A FILE IS A TRIGGER IF *ANY* OF ITS CITATIONS BEARS A VERDICT, EVEN WHEN ITS OTHER CITATIONS ARE §2-UNMAPPED.**
> ⚠️ **MEASURED: applied to FILES the rule yields 14 and SILENTLY DROPS TWO VERDICT-BEARING MEMBERS** — `depth-source.ts` (§2 lists it, **and `:80-97` carries the *“lagged witness”* construction argument that is §1C's ONLY surviving leg**) and `vts-runner.ts` (§2 lists its LIFECYCLE reads, **and difference #4's zero-`getSmoothedPrice` POSITIVE CONTROL is a different citation of the same file** — §2 says so itself: *“distinct from the `:1553/:1587` birth reads”*).
> ⭐⭐ **THAT IS `enumerator-blind-spot` AGAIN, ONE LEVEL UP: the RULE was blind to the PARTIALLY-UNMAPPED member class and reported clean — exactly why the hand-named list had to go, reproduced in its replacement.** ⛔ **A future session applying the file-level reading gets 14, drops both, and sees no error.**
> ✅ **SO, PRECISELY — AND THE EXCLUSION IS THE WHOLE OF THIS STAMP BLOCK, NOT JUST THE TABLE ROWS:**
> **(1) extract every `*.ts` reference in the document, EXCLUDING everything inside this derived-at stamp block** *(nothing in here is a verdict about pricing — it is all machinery, and a mechanism that cites its own members re-adds them for ever)*; **(2) subtract a file only if EVERY remaining citation of it is §2-unmapped.**
> ⚠️ **THE NARROWER “exclude the TABLE ROWS” VERSION WAS TRIED AND FAILED ON THE NEXT RUN: the note explaining WHY two files had been removed cited them, so the extractor re-added them. ⭐ THE CIRCULARITY MOVES OUT ONE LEVEL UNLESS THE WHOLE BLOCK IS EXCLUDED.**
> ⛔⛔ **THE RULE AND THE TABLE MUST AGREE, AND A DISAGREEMENT IS *INVESTIGATED*, NOT RESOLVED BY ASSUMING EITHER ONE WINS.** ⚠️ **r6 FIRST WROTE *“if they disagree the RULE is wrong, not the TABLE”* — AND THAT WAS FALSIFIED BY RUNNING IT, MINUTES LATER.** The corrected rule yielded **14** against a 16-row table, and **the two extra rows were the TABLE's fault, not the rule's**: `kraken-v2-translator.ts` and `price-basis.ts` were **survivors of the r4 HAND-NAMED list, cited NOWHERE ELSE in this document** — so the mechanical extraction found them **in the table itself** and kept them. ⭐⭐ **A TABLE THAT CITES ITS OWN MEMBERS JUSTIFIES THEM CIRCULARLY.** Both removed: **no line of this document rests on either, so a change to them cannot invalidate one.** ✅ **If a future revision cites them, the rule re-adds them automatically — which is the whole point.**
> ⭐ **RUN THE CHECK; DO NOT ASSERT IT. It has now caught a defect on BOTH sides in two consecutive passes** — Langston caught the rule under-including two files, and running the corrected rule caught the table over-including two others.
>
> **DERIVED 14 2026-09-13 — A COMMIT TOUCHING ANY OF THESE INVALIDATES THE STAMP:**
> | file (verdict-bearing citations only) |
> |---|
> | `active-execution-engine.ts` |
> | `active-portfolio-manager.ts` |
> | `book-state.ts` |
> | `depth-source.ts` |
> | `equity-spot-archiver.ts` |
> | `eval-cycle.ts` |
> | `kraken-websocket-adapter.ts` |
> | `mark-kind.ts` |
> | `price-cache.ts` |
> | `rtb-refresh-service.ts` |
> | `scanner.ts` |
> | `schema.ts` |
> | `signal-orchestrator.ts` |
> | `vts-runner.ts` |
>
> ➕ **PLUS THREE NON-FILE TRIGGERS:** an **OHLC interval argument** changing anywhere *(difference #1 was exactly that and went unnoticed three months)* · **`shared/schema.ts`** gaining or losing an `exit_*`/`entry_*` provenance column · **`B-PRICE-SIDE-BY-JOB` (`3n`) landing any side change.**
> ✅ **ON A TRIGGER: re-derive, re-stamp, and record what MOVED. ⛔ A re-stamp with no diff is valid ONLY if the lines were actually re-read — re-stamping on faith is the defect this table exists to prevent.**
> ➕ **HOME: `B-PRICE-DOC-CONSOLIDATE`, owner CC-B — the rule is written here and NOTHING AUTOMATES IT.**

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
✅ **IT WAS STRUCTURALLY UNATTRIBUTABLE FROM THE ROW ALL ALONG, AND THIS IS A CONSTRUCTION ARGUMENT THAT NEEDS NO SPLIT, NO COHORT AND NO `n`:** `exit_ticker_bid/ask` is written by the ARCHIVER off a **separate socket** — `depth-source.ts:80-97` calls it *“a lagged witness”*, cadence 5.0–9.0 s; F-G-2 measured this arm at p50 **12.33 s** (n=3, a lead not a rate). `capturedAtMs` exists at `active-execution-engine.ts:2338` but the persist payload (`:2974-2977`, `shared/schema.ts:1854-1855`) writes **only the bid/ask pair** into a COLUMN.
⛔⛔ **BUT “NO CAPTURE-TIME EXISTS ANYWHERE” IS FALSE AND IS STRUCK 2026-09-13 — IT IS IN `metadata`, ON BOTH CLASSES (CC-C).** Crypto: `metadata.fg2Shadow.witnessAtBidExit.capturedAtMs` beside the decision's own `atMs`. xStock: `metadata.bookState.yields[].inputs` with its own `atMs` (§5.2). ⭐ **Both keys are named in `active-execution-engine.ts:1848-1850`'s OWN DOCBLOCK** — CC-C quoted that docblock twice without following it, and I asserted the absence without looking. **`fix-follows-pointer`, on a pointer already written down.**
✅ **FIRST REAL ROW (CC-C, DASH/USD `stop_hit`): decision `atMs` 1788840806077 vs witness `capturedAtMs` 1788840778019 — THE WITNESS IS 28 SECONDS OLDER.** ⚠️ **That is 3–5× the documented 5.0–9.0 s archiver cadence, on `n=1`.** ⛔ **NOT a rate, NOT generalised, and it does not by itself settle the crypto question — it shows the separation is RECOVERABLE where I wrote that it was not.**
⇒ ✅ **CONSEQUENCE FOR THE VERDICT ABOVE, STATED HONESTLY: the CONSTRUCTION argument still stands (a lagged snapshot cannot attribute magnitude), but ‘UNATTRIBUTABLE’ is now ‘UNATTRIBUTED, WITH THE INSTRUMENT IN HAND AND UNRUN’.** ➕ **HOME: measure the decision-vs-witness lag distribution from `metadata` on both classes — item on `B-PRICE-SIDE-BY-JOB` (`3n.n`), owner CC-C, and it is now RUNNABLE ON EXISTING ROWS rather than blocked on a new column.** ⛔ **`B_EXIT_PROVENANCE_COMPLETION_REPORT.md:101` PRE-REGISTERED THE OBLIGATION I MISSED: *“Any analysis using it must read that column.”***
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

### Q4 — ⭐⭐ **WHAT IS RECORDED, AND WHAT HAPPENS WHEN THERE IS NO PRICE** *(NEW IN r4 — the two columns this map did not have)*

⛔⛔ **LANGSTON'S SHARPEST POINT IN THREE ROUNDS, AND IT IS DIAGNOSTIC RATHER THAN TIDYING: “RECORD is the column you have nothing for — which is precisely how §5.2 went wrong.”** Had every row carried **what is persisted, sampled how, at which instant**, the 4-second-throttled witness sitting against an unthrottled decision would have been **on the face of the table** instead of taking three rounds to find.
⛔⛔ **AND THE SECOND COLUMN IS A WHOLE MISSING AXIS, NOT A MISSING ROW: EVERY ROW ABOVE SILENTLY ASSUMES A PRICE EXISTS.** A gate that PASSES on a placeholder (`XSTOCK_PRICING_PLAN` §P3: **171 of 486 symbols overnight**) is the **`#546` absent-as-valid shape — an absent value wearing a plausible number's clothes.**

| situation | **RECORDED?** (what, sampled how, which instant) | **NO PRICE → what happens** |
|---|---|---|
| **crypto exit trigger** | `exit_decision_price` + `exit_price_producer`; witness pair `exit_ticker_bid/ask` from a **separate socket**; capture time **in `metadata.fg2Shadow`, NOT a column** | ⚠️ **UNTRACED** |
| **xStock exit trigger** | same columns; witness and fill read the **SAME table**, decision **unthrottled** vs witness **4,000 ms-throttled**; decision-instant sides in `metadata.bookState.yields[]` | ✅ **`hollow` / `unknown` verdict WITHHOLDS the decision** (`#943`), bounded by `hollow_skip_cap`, then YIELDS |
| **crypto quant birth** | no per-read record; kind only in a 60 s HEALTH counter that is an **UPPER BOUND** | ⚠️ **UNTRACED** |
| **crypto pattern birth** | ⛔ **appears in NEITHER census field** (`price-cache.ts:599-601`) | ⚠️ **UNTRACED** |
| **xStock / VTS birth** | bar close; **no freshness GATE at all** — gated only by `min_ohlc_history_bars` | ✅ **insufficient history ⇒ SKIP the pair** (`scanner.ts:900-902`) |
| **entry marketability (active)** | depth snapshot age persisted as `entry_book_age_ms` | ⚠️ **UNTRACED** |
| **xStock entry spread gate** | — | ⛔⛔ **THE GATE *PASSES*. A placeholder clears it — 171 of 486 symbols overnight, 10 of 486 in daytime.** ✅ **Kyle's rule applies and is not implemented: *we do not use some backup price that may or may not be applicable; we hold until we get the pricing we need.*** |
| **RTB rank** | not persisted per read | ⚠️ **UNTRACED** |
| **portfolio marking** | not persisted per read | ⚠️ **UNTRACED** |

⚠️ **SIX OF NINE “NO PRICE” CELLS READ `UNTRACED`, AND THAT IS THE HONEST STATE — NOT A FORMATTING PLACEHOLDER.** ⛔ **An `UNTRACED` cell may NOT be read as “it fails safe”.** ➕ **Tracing them is an item on `B-PRICE-DOC-CONSOLIDATE`, owner CC-B.**

### ✅ AND THE FRESHNESS NUMBER THE MAP OWED — IMPORTED *WITH* ITS DERIVATION, NOT JUST ITS CONCLUSION
§Q2 rules entry marketability **UNRULED — needs the age distribution**. `XSTOCK_PRICING_PLAN` §2 **HAS the distribution**, and its number beats my refusal:
> **15 SECONDS — the same figure the entry already uses.** ⭐ **PHYSICS FIRST, and this is the part that makes it not arbitrary: the feed only WRITES a price every 4 s, so a 2 s guard would block 134 of 236 closes (57 %) — NOT for being stale, but because the data CANNOT BE FRESHER.** A 5 s guard blocks 27 (11.4 %). Distribution p50 **2.33 s** · p90 **8.40 s** · p95 **65.20 s** ⇒ between 5 s and 60 s the blocked count moves only 27→14, so there is a **hard core of ~15-20 genuinely stale closes** and everything else is under 5 s. **15 s blocks 20 of 236 (8.5 %), and those are the pathological ones.**
⭐ **THE TRANSFERABLE RULE, WHICH IS WHAT TO KEEP: *reject beyond a few ticks of your OWN feed's cadence.* 15 ÷ 4 ≈ 3.75 ticks.** ⚠️ **`RULED ON REPORTED FACT` — xStock population, `XSTOCK_PRICING_PLAN` §2; I have NOT re-derived it and the crypto cadence differs, so the NUMBER does not transfer to crypto even though the RULE does.**

### ⭐ THE WHOLE JUDGEMENT IN ONE LINE
> **FOUR JOBS READ THE WRONG KIND OF PRICE: the exit trigger, crypto quant birth, xStock/VTS marketability, and — as a mixture rather than a wrong side — the quant basis itself.**
> **FOUR READ THE RIGHT KIND: both bar-close births, active entry marketability, RTB ranking, and portfolio marking.** *(Of the right-kind rows, TWO are too old: the crypto pattern lane's **60-minute** bar close and the xStock/VTS **15-minute** one — **different intervals; r2 called both 60.**)*

## 4. ⛔ FIVE PARALLEL DOCUMENTS — the response to "we lose sight of the system" cannot be a fifth narrative
`PRICING_DATA_ARCHITECTURE.md` (108 KB, **banner-marked NOT CANONICAL / UNDER CORRECTION**) · the
SysManual provenance table · `ACTIVE_PATH_FLOW.md` · the exit-path audit · **this**.
⛔⛔ **THE RULING ON ALL FIVE IS §5.3 — IT IS NOT REPEATED HERE, AND THAT IS DELIBERATE.** ⭐ **A section that both ENUMERATES the parallel documents and RULES on them is itself the two-copies shape this section exists to name.** ⇒ **this section KEEPS THE CENSUS; §5.3 HOLDS THE VERDICT.**
✅ **KEPT HERE BECAUSE §5.3 DOES NOT NAME THEM: `ACTIVE_PATH_FLOW.md` and the exit-path audit are the FOURTH and FIFTH parallel sources, and neither was part of Kyle's three-way comparison** — so **neither has been compared, and neither is ruled on.** ⚠️ **That is an OPEN GAP, not an omission.**
➕ **HOME: `B-PRICE-DOC-CONSOLIDATE`, owner CC-B, `PHASE_19_PLAN` after `3n`** — which also carries the `SYSTEM_MANUAL` `:655`/`:668` correction. **That correction is already MARKED in place and is not deferrable; what the batch owes is the structural decision.**

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
| **7** | **xStock has no order-book LADDER** — and this map's feed table listed *“order book”* / *“depth snapshot”* without saying they are crypto-only. | ⚠️ **BOTH DOCUMENTS RIGHT ON THE LADDER; MY *CONSEQUENCE* WAS WRONG AND LANGSTON STRUCK IT (r4 confirm).** | The `book` channel lives only in `kraken-websocket-adapter.ts`; the xStock `book-state` modules are a predicate over the ticker's top-of-book. ⛔⛔ **BUT r4 CONCLUDED “the ASK must mean the ticker's ask — there is no other” AS THOUGH THAT WERE A LIMITATION. IT IS NOT.** ✅ **VERIFIED AT THE OBJECT: the xStock feed carries `bid`, `ask` AND BOTH TOUCH SIZES, and the scanner ALREADY READS ALL FOUR** — `scanner.ts:657` `row.ask`; `:686-691` `ask * ask_qty` / `bid * bid_qty` gated on `bid_qty > 0 AND ask_qty > 0`; threaded as `bidAskSpreadPct` (`eval-cycle.ts:312`) and `askDepthUsd`/`bidDepthUsd` (`:325-326`) **into the very function whose `:956` marketability check is handed the 15-minute bar close instead.** ⭐⭐ **THE ASK IS ONE FRAME UP, IN THE CALLER — NOT BEHIND A PURCHASE. So this row is the SAME CLASS as every other: a side-and-source change, no feed decision.** ⛔ **THE REAL LIMIT, STATED AS ITSELF: what xStock lacks is DEPTH BEYOND THE TOUCH — so marketability there can be tested AT THE TOUCH but never FOR OUR FULL QUANTITY.** |
| **8** | **The 4-second archive sample — 43.6 % of marks never stored** (`XSTOCK_PRICING_PLAN` §P5). Absent from this map. | ⚠️ **`RULED ON REPORTED FACT` — I DID NOT RE-DERIVE IT** (Langston r3: mark it or re-derive it; do not import it bare). | ⛔ **NOT re-measured. It is imported from §P5 and carries §P5's population, not one of mine.** ✅ **What it is used for here is QUALITATIVE and survives either way: it is the reason a stored row is a LAGGED WITNESS rather than the decision.** ⛔ **Do not cite 43.6 % as a measured figure of this document.** |

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

## 5.3 ⭐⭐ THE CANONICAL DOCUMENT — **LANGSTON'S RULING, r3**

> **Kyle's question:** *“is there other information in those documents that can be PAIRED with the map to become our canonical governance document?”*
⛔⛔ **LANGSTON'S ANSWER: PAIR IT WITH *NOTHING NARRATIVE*.** *“The failure you're exiting is five documents each holding a partial copy of one table; a prose companion rebuilds it.”*
⚠️ **MY FIRST ANSWER WAS TOO QUICK AND MY SECOND WAS TOO BROAD.** I first dismissed the architecture document on its banner alone; then, having read its structure, I proposed importing six of its sections wholesale. **Neither was right.**

### ✅ (a) THE MAP STAYS THE SPINE — THE FOUR LAYERS BECOME **COLUMNS**
**A reader arrives holding a JOB, not a layer.** A layer-first spine makes you visit four sections to answer one question — **which is how we got five narratives.** ✅ **But FEED / NUMBER / RECORD / TIMING maps cleanly onto the Q1/Q2/Q3 chain already here: FEED→NUMBER *is* Q1; TIMING *is* Q2.** ⭐⭐ **AND `RECORD` WAS THE COLUMN WITH NOTHING IN IT — now §Q4, and it is precisely how §5.2 went wrong.**

### ✅ (b) THE BANNER EXCLUDES ITS **VERDICTS**, NOT ITS **EVIDENCE**
| from `PRICING_DATA_ARCHITECTURE` | ruling |
|---|---|
| **§2 provenance** · **§5 cost** · **§5b operational reach** | ✅ **TAKE THEM.** Commits, Kraken's published docs, measured stalls and retention — **facts about the world, whose truth does not depend on the structural claim that was overturned.** |
| **§3.1 master table** | ⛔ **RETIRE IT INTO THE MAP, DO NOT MERGE IT** — same work as §Q1, and already measured wrong (*“SMOOTHED MID”*). |
| **§6 target state** | ✅ **TAKE THE *SHAPE*, RE-DERIVE THE CELLS.** |
| **§3.0 axes** (*the `live` lane is a mode label with no separate code*) | ⭐ **STRONGER THAN MY LINE AND I WOULD RATHER HAVE IT** — ⛔ **but it does not cross on the document's word. KEEP MY WEAKER LIVE-LANE LINE UNTIL SOMEONE OPENS THE CODE.** |

⛔⛔ **THE IMPORT RULE, BINDING: EVERY IMPORTED LINE IS RE-DERIVED AT THE REF AND CARRIES ITS OWN CITATION. ANYTHING NOT RE-DERIVABLE COMES ACROSS MARKED `INFERRED-FROM-DOC`, NEVER STATED FLAT.** ⭐ **Because I do not know which of its 14 corrections landed where — and neither does it.**

### ✅ (c) THE NO-PRICE AXIS IS REAL, AND I UNDERSTATED IT
Langston: it is **a THIRD COLUMN ON EVERY ROW** — what this job does when the price is **absent, stale, or hollow** — now §Q4. ⭐ **And CRM is the same class in BOOKED MONEY: a “price” of 503.50 that no market ever offered.**
✅ **SPLIT FROM THE POLICY: the PER-ROW BEHAVIOUR belongs in this map; Kyle's HOLD-DON'T-SUBSTITUTE rule and the F4 no-positive-slippage invariant belong in the target-state / settled section.**

### ⛔ (d) WHAT MUST **NOT** COME ACROSS
1. ⛔ **The 59 % in EITHER direction** — §5.2 is `UNREPRODUCED`; importing it now would import a refutation that is itself wrong.
2. ⛔ **The 14-correction history** — that lives in `RUNNING_ISSUES`. **A canonical document carrying its own retraction log becomes the 108 KB problem.**
3. ⛔⛔ **ANY CAUSAL SENTENCE FROM ANY OF THE FOUR DOCUMENTS. IMPORT MEASUREMENTS AND CITATIONS; RE-DERIVE MECHANISMS** (rule 29(c)).

### ⭐ (e) THE SETTLED REGISTER — *“the most valuable single section”*
Adopt `XSTOCK_PRICING_DECISION_PATH` §4's shape, with three conditions: **every entry carries WHO settled it and the CITATION that settles it** · **it is the ONLY place a “settled” claim lives** · ⛔ **nothing enters on a reviewer's say-so — Langston's included.**

### ✅ THE PAIRING, IN ONE LINE
> **THE MAP HOLDS *WHAT IS TRUE*. `PHASE_19_PLAN` `3n` + `RUNNING_ISSUES` HOLD *WHAT WE ARE DOING*. THE TWO xSTOCK DOCUMENTS STAY UNCHANGED AS A CLASS-SCOPED PLAN AND ROUTE, AND STOP CARRYING THEIR OWN COPY OF THE TABLE.**
⭐⭐ **FACTS AND DECISIONS ROT ON DIFFERENT CLOCKS, AND SHARING A FILE IS HOW THE ARCHITECTURE DOCUMENT REACHED 108 KB.**

⛔ **AND THE CONDITION THE WHOLE RECOMMENDATION RESTS ON IS THE DERIVED-AT STAMP AT THE HEAD OF THIS FILE.** ⭐ **The reason to pick this file is NOT that it was right — it was wrong on a 4× interval, missing an entire asset class's exit path, and carried a withdrawn claim through three sites. It is that it is small enough that every line can be re-checked in an afternoon — and the stamp is what keeps that true.**

✅ **KYLE DECIDES.** Execution is placed: `B-PRICE-DOC-CONSOLIDATE`, owner CC-B, `PHASE_19_PLAN` after `3n`.
