# CODEX FINDINGS REGISTER — **EVERYTHING COLTRANE NEEDS TO DESIGN THE FIX**

> **STATUS: r6 (CC-C + Langston, 2026-09-09).** Langston ruled on r5; this carries his corrections.

## ⭐⭐ THE OUTCOME THE DESIGN MUST SERVE
1. **The trading system performing at the highest possible level.**
2. **Our simulations reproducing reality as closely as possible.**
3. ⭐ **Baseline thresholds set at the best possible starting point** — strategies, the regime ranges, the regime→strategy admission, reachability, the filters and the gates — **so the data Phase 25 calibrates on is worth having.** ★ **A correct price feeding a threshold nobody chose is still a bad baseline.**

> ★ **KYLE'S BRIEF, and it is the instruction rather than an aside:** *"We've gotten really deep in the weeds in Phase 19, and I just fear that we're missing the bigger picture, and that's why I've involved Coltrane."*
> ✅ **THIS IS NOT A TEST OF THE REVIEWER.** *"This is all about improving in performance, not trying to knock down another agent."* **The register shows our working so he can challenge it — that is all the settlement tags are for.**

## ⏳ HOW THE WORK WILL BE DONE — **KYLE'S, WITH LANGSTON AND COLTRANE. NOT SETTLED, AND NOT OURS.**
The idea being tested: **Coltrane writes code in his own repository; Langston reviews it; everything is inspected before the review branch or staging; a clear rollback exists.** Whether it ships as one change or in pieces is open.

---

## 0. ⛔ METHOD, AND TWO LIMITS STATED BEFORE THE CONTENT

**(1) THE DENOMINATOR IS INCOMPLETE.** This covers the **pricing-architecture review in full (14 findings)**. **Assignments 1-3 are NOT yet registered** — see §6. ⇒ ⛔ **Until that closes, this document is a complete register of ONE audit and an incomplete register of four.** **Said here rather than discovered later.**

**(2) ACCEPTING A CORRECTION IS ITSELF A CLAIM** *(Langston)*. Rule 29 binds it as it binds making one. **Every row states HOW it was settled:**
| tag | meaning |
|---|---|
| ✅ **CONFIRMED — RE-DERIVED** | we went to the code ourselves, with **our own** citation |
| ⚠️ **ACCEPTED — REPORTED FACT** | on Coltrane's citation. ⛔ **Only where the item is decision-inert** |
| ⛔ **DISPUTED — WITH CITATION** | we think it is wrong, and say why, with a line |

⛔⛔ **EVERY FINDING IS VALIDATED REGARDLESS OF SOURCE — KYLE'S RULING:** *"just because the codex got a few things right, doesn't mean we blindly accept anything… We have to validate everything."* ★ **An aggregate score was struck from this file on Langston's ruling: a scoreboard reads as grading however it is captioned. The PER-ROW settlement tags are what show our work.**

**(3) ROUTING — every row carries one:**
| route | meaning |
|---|---|
| ⭐ **PRICING** | folds into the one sequenced pricing programme |
| ➕ **SEPARATE** | real, but not pricing — its own batch or sequence, **placed, not forgotten** |
| ⏳ **INVESTIGATE** | needs evidence before it can be dispositioned |
| ⬜ **DOC-ONLY** | our document was wrong; the system is fine |

---

## 0b. ⛔⛔ THE INVARIANTS A DESIGN MAY NOT BREAK — **these are not findings; they are the fences**

> ★ **Langston's condition on r5, and he is right that the §1 rows state OUTCOMES while a designer needs the CONSTRAINTS.**

1. ⛔ **FAIL LOUD ON AN ABSENT INPUT. Never `?? 0`, never a silent default** (`#546`). A missing value is a fault, not a zero.
2. ⛔ **NO HARDCODED FALLBACK FOR A DATABASE-GOVERNED SETTING.** If it should come from the database, an empty database must REFUSE — not substitute.
3. ⛔ **VTS EXITS ARE MARK-BOOKED, NOT TRANSACTABLE.** Crypto VTS rows book the observed mark at exit. **Do not read them as executable fills.**
4. ⛔ **`F-G-2`'s SHADOW WINDOW MUST NOT BE SPLIT** — it is mid-observation.
5. ⛔ **RISK LIMITS ARE BOUNDARIES, NOT DIALS.** No design may loosen a risk control to improve returns. **If growth and risk tolerance conflict, risk tolerance wins.**
6. ⭐ **READ THE CROSS-CUTTING RUNTIME-STATE REGISTRY IN `SYSTEM_IMPACT_MAP.md` BEFORE ANY CHANGE TOUCHING SHARED STATE OR A KEY SHAPE** — singletons, shared maps and liveness live there, and a key change designed without that census fixes one instance of five.

---

## 1. ✅ CONFIRMED — NEEDS A CHANGE · ⭐ **ROUTE: PRICING PROGRAMME**

### 1.1 ⛔⛔ **A1 — The order book IS subscribed for candidates in the queue, not only for positions we hold.** *(the biggest single correction)*
**PLAIN:** We wrote that the system only asks the exchange for the full order book on coins we already own. It doesn't. **When a coin enters the ready-to-buy queue, it gets subscribed right there — ticker and full book.**
✅ **CONFIRMED — RE-DERIVED** at `ready_to_buy_service.ts:2422-2431`. Its own comment, dated 2026-07-15, names two coins that died on the old behaviour.
⛔ **WHAT WE OWE:** the document's central structural claim, and everything resting on it, must be rewritten. ⭐ **AND WE MUST NOT BUILD IT AGAIN** — a proposal to "add queue-time subscription" would duplicate a fix that has existed since July.
★ **THE SURVIVING PROBLEM, which is not the one we described:** *a subscribe request is not a book.* The call returns nothing and its failure is swallowed into a log line. **The real gap is a CONFIRMED book, not a missing one.**

### 1.2 ⛔ **A1-tail / A13 — a queued coin is not restored after a reconnect**
**PLAIN:** Three different things can decide a coin should be subscribed. **Only one of them is used to restore subscriptions after a dropped connection: open positions.** A coin that was queued but never bought comes back only if it happens to be re-queued.
✅ **CONFIRMED — RE-DERIVED** *(and independently by Langston)*.
⛔ **WHAT WE OWE — ONE MECHANISM, NOT THREE:** the desired subscription set becomes **durable, confirmed, and re-asserted on reconnect.** ⭐ **This absorbs what were three separate blockers.**

### 1.3 ⛔ **A7 — position size does not depend on the stop, so our sizing argument was false**
**PLAIN:** We argued that moving the stop to the other side of the spread would shrink every position. **It wouldn't.** Size is a fixed share of the portfolio divided by the entry price; the stop is checked for validity and then plays no part.
✅ **CONFIRMED — RE-DERIVED.** The code says it: `quantity = bufferedMaxNotional / entryPrice`, with a comment recording that the old stop-based form was deliberately removed, and a log line reading `Invalid fixed-notional quantity`.
⛔ **WHAT WE OWE:** strike the argument. **And the honest consequence is the opposite of comfortable — moving the ENTRY to the ask DOES change size, through the entry-price denominator. A different mechanism, still real.** ⚠️ **This is not a reason to loosen any limit; the exposure bounds must be re-verified against the quantity actually executed.**
➕ **FOR THE DESIGNER (Langston): the docblock at `server/services/active-position-sizing.ts:123-131` STILL DESCRIBES THE RETIRED RISK-BASED ALGORITHM, ninety lines above the body that contradicts it.** ★ **Anyone reading the top of that file gets the wrong model of how we size.**

### 1.4 ⛔ **A5 — xStock signals are born on 15-minute bars, not 60, and it is a bar close, not a midpoint**
**PLAIN:** Two errors in one cell. The interval is **15 minutes**; the 60 we cited belongs to a different job. And **a bar close is not a midpoint** — there are no two quote sides in it.
✅ **CONFIRMED — RE-DERIVED** at `scanner.ts:597` versus `regime-inputs.ts:143`.
⛔⛔ **AND THE FACT UNDER THE CORRECTION IS BIGGER THAN THE CORRECTION (Langston): A SIGNAL BORN ON 15-MINUTE BARS IS RE-GRADED AT REFRESH ON 60-MINUTE BARS — BOTH CLASSES.** *(`xstock_spot/scanner.ts:597` births at 15; `server/core/metrics/regime-inputs.ts:145`/`:147` inside `computeRefreshRegimeInputs` re-grades at 60.)* ★ **That is a DESIGN INPUT, not a documentation fix — the thing that admitted a signal is not the thing that keeps it.**
⛔ **WHAT WE OWE:** correct both. ⭐ **AND: neither "up to an hour old" nor "up to fifteen minutes old" is a freshness bound at all.** A forming bar can hold a recent trade; a capture gap can leave a very old one. **The bar's start time is not the age of the information in it.**

### 1.5 ⛔ **A2 — the checksum DOES exist; our "never implemented" citation is wrong**
**PLAIN:** We said the order book's integrity check was never built. It was. ⚠️ **But you still cannot tell, downstream, whether a given book passed it** — and where the instrument's precision is unknown, verification is skipped.
✅ **CONFIRMED — RE-DERIVED.**
⛔ **WHAT WE OWE:** correct the citation, **and the useful change is the one the correction reveals: make verified-status travel with the book** rather than being unknowable at the point of use.

### 1.6 ⛔ **A3 — the exit simulation invents liquidity that was never seen**
**PLAIN:** Our criticism was aimed at the wrong half. The **entry** walk correctly reports running out of size. **The exit walk fills the remainder at a made-up worse price using a configured penalty** — so a simulated exit can complete beyond anything observed.
⚠️ **ACCEPTED — REPORTED FACT**, with a probe cited. ⛔ **MUST BE RE-DERIVED BEFORE ANY EDIT — it is a mechanism claim and it bears on whether our simulated results are honest.**
⛔ **WHAT WE OWE:** name the policy explicitly and separate observed fill from extrapolated fill in what we record.

### 1.7 ⛔ **A9 / A10 — the price cache loses provenance, and one counter mislabels transport**
**PLAIN:** Confirms our own finding and extends it. Two writers store different kinds of number under one label; a WebSocket update can **invent both quote sides from a single price**, which cannot show a real spread. And a counter we read as "WebSocket versus REST" **counts a REST-sourced result as WebSocket**, so it cannot establish the mix.
⚠️ **ACCEPTED — REPORTED FACT** on the counter; ✅ the provenance half matches our own measurement.
⛔ **WHAT WE OWE:** provenance and kind travel with every cached price, **and asset class belongs in the key.**

### 1.8 ⛔ **A14 — my subscription census could not have found the futures feed**
**PLAIN:** I told you we had a "fourth feed nobody listed." **The reason nobody listed it is worse than an oversight:** our census searched for one spelling of the subscribe call, and **the futures archiver uses a different one, so the search structurally could not return it.**
⚠️ **ACCEPTED — REPORTED FACT**, and it matches the shape of three other misses today.
⛔ **WHAT WE OWE:** re-run the feed census by capability rather than by literal.

---

### 1.9 ⭐⭐ **THE SAME TICKER IN TWO ASSET CLASSES IS ONE IDENTITY — AND IT HAS ALREADY TRADED** *(Kyle-ruled 2026-09-09)*
**PLAIN:** A crypto coin and an xStock can share a ticker. **The system treats them as the same thing** — the stored symbol strings are byte-identical (`crypto_spot | INJ/USD` versus `xstock_spot | LMT/USD`, same shape), and the shared price cache is keyed by symbol alone (`server/services/price-cache.ts:101`, `Map<string, CachedPrice>`).
✅ **MEASURED, ALL-TIME: `DASH/USD` has FOUR closed trades across BOTH asset classes** — Dash the cryptocurrency and DoorDash the equity, under one identity. **`rtb_signals`: zero collisions, ever. `active_open_positions`: none currently colliding.**
⚠️ **TWO FIGURES OF MINE WERE WRONG AND BOTH REACHED KYLE, so they are recorded rather than dropped:** *"13 base-ticker collisions in 7 days"* was measured on the **passive ticker archive** — a different population from anything that trades — and *"we hold a DASH position right now"* was **false, taken from memory of an earlier session's read.** ★ **The finding stands on the one collision that actually traded; my supporting numbers did not.** *(Caught by Langston.)*
✅✅ **KYLE'S RULING: different asset classes are DIFFERENT ASSETS, both tradeable, identity = `(symbol, asset_class)`.** Langston: no reasons against.
⛔⛔ **AND THE CAUTION THAT SIZES IT (Langston): THIS IS NOT A SCHEMA EDIT — IT IS A KEY-SHAPE CHANGE ACROSS EVERY SYMBOL-KEYED STORE.** `price-cache`, `ohlc-cache`, `market-context-engine`, `market-data` and `market-volume-cache` all declare `Map<string, …>` at the ref. ⇒ **census first, or we fix the one instance a reviewer happened to name.**
**HOME: `B-SYMBOL-CLASS-IDENTITY` (`#1006`), owner CC-C, `PHASE_19_PLAN` row `3b.h-4`. Objective 1 is the census, not the migration. Correctness-driven, not incident-driven — one collision has ever reached a trade.**

## 2. ✅ CONFIRMED — DOCUMENT CORRECTION ONLY · ⬜ **ROUTE: DOC-ONLY**

✅ **A8 WAS MOVED OUT OF THIS SECTION — see §2b.** ★ **Langston's ruling and he is right: a live engine with a real exchange order call behind a gate is not a document correction, and it must not be discoverable only by reading past a banner that says it is.**

| # | plain summary | how settled |
|---|---|---|
| **A14a** | **"REST costs one request per symbol" is wrong** — the cache and loader batch symbols, and a whole-market request exists. Our capacity comparison used the wrong unit. | ⚠️ reported fact |
| **A14b** | **The volume-floor "dial" is not wired.** We said the archive floor could be changed in the database without redeploying. The loader reads a file or an explicit option; **no database read is on that path.** ⭐ *A comment about a dial is not its wiring.* | ⚠️ reported fact |
| **A14c** | **Archive, cache and subscription sets are NOT strictly nested.** We presented them as one inside the other. They are independently selected. | ⚠️ reported fact |
| **A14d** | **The perpetual tables have another reader** — a dashboard — so our "only retention scripts read them" was too broad. **Not a pricing consumer**, so the substance stands. | ⚠️ reported fact |
| **A10b** | **Our withdrawn agreement conclusion is still sitting in the document beside its own withdrawal.** A canonical reader should not have to choose between two authoritative statements. | ✅ correct — remove, don't annotate |

---

## 2b. ⛔⛔ **A8 — A SECOND TRADING ENGINE EXISTS, WITH A REAL EXCHANGE ORDER CALL, BEHIND A GATE** · ➕ **ROUTE: SEPARATE · PHASE 21 (GO-LIVE)**

**PLAIN:** We said no separate real-order path existed. **One does.** The repository instantiates a second trading engine in live mode, reachable through a registered route behind a feature gate, **and it contains a real exchange order call followed by modelled partial-fill handling.**
⚠️ **THIS IS NOT EVIDENCE THE GATE IS ON OR THAT IT TRADES.** It is a counterexample to a whole-repository claim we made.
⛔ **WHY IT IS ITS OWN SECTION AND NOT A DOCUMENT FIX:** the accurate statement is that **the active order-placer seam has no live implementation, legacy live order code exists behind a gate, and paper/live equivalence has NOT been demonstrated.** ⇒ **before live is enabled, engine ownership must be settled and execution-report handling verified. Changing only the order destination is insufficient.**
➕ **AND FROM THE SAME FAMILY (astra finding 8): the kill switch's LIVE branch logs that live flatten is future Phase-21 work rather than implementing it.** ⇒ **in paper the kill switch flattens; in live, as written, it would not.**
⚠️ **NOT RE-DERIVED BY US.** ⛔ **Both belong to Phase 21 and must not be inherited silently by whoever opens go-live.**

---

## 3. ⏳ NEEDS INVESTIGATION · ⏳ **ROUTE: INVESTIGATE** — these are §6 ASK 1 item (c) — the question is which ones the DESIGN depends on

| # | the question we cannot answer from code alone | why it needs evidence |
|---|---|---|
| **A6** | **Does the market-context cache hand back an earlier caller's price?** Its key does not distinguish lane, input price or bar interval, and a probe returned a stale value when called with a new one. | **A mechanism claim.** Establishes *potential* divergence; the price actually consumed on a cache hit depends on call order and history — **runtime evidence, not a code read.** |
| **A4** | **Is the paper entry priced off a stale snapshot?** The ladder is captured at the gate and reused after asynchronous work; the recorded book age also comes from the gate. | Needs the real interval between gate and placement in production. |
| **A12** | **How often does a maker exit fill on a midpoint no buyer was at?** | The mechanism is shown; **frequency is not**, and frequency is what decides whether it distorts our results. |
| **A11** | **How many candidates are actually ranked on the invented 2% target?** The fallback exists but a later step can overwrite it. | Our claim that all such candidates rank on 2% is **overstated**; incidence needs the originating route. |
| **A2b** | **What is the real upper bound on the book-resync gap?** We called it "500 ms plus snapshot latency, known and bounded." | **The code establishes no finite bound on the second part.** |

---

## 4. ⛔ DISPUTED / PARTIALLY DISPUTED

| # | our position | citation |
|---|---|---|
| **A1 scope** | **Correct for crypto only.** xStocks take **no** queue-time warm at all, so our original claim holds there unmodified — and for a never-queued crypto name. | `ready_to_buy_service.ts:2422` is `crypto_spot`-gated |
| **A13 watchdog** | **We agree it is unarmed per-symbol** — but Codex is right that a *separate aggregate* archive watchdog exists, so the conclusion stays per-symbol and must not be read as "no watchdog." | accepted narrowing |

---

## 5. ✅ THE OTHER THREE AUDITS — **REGISTERED**

| assignment | subject | what we hold |
|---|---|---|
| **1** | full system audit — trading logic, maths, machinery | ⛔ **report not in our repository.** Known downstream: finding 1 → `#1006` *(repository/database schema divergence — **STILL UNHOMED, awaiting Kyle**)*; a fee-contract finding → `#1010` → `B-XSTOCK-FEE-CONTRACT`, CC-B |
| **2** | trading logic, the maths, and what to build | ⏳ not registered |
| **3** | what is stopping the system doing its job | data files present under `Claude Comms and Packages/Codex Audits/audit3/`; ⏳ findings not registered |
| ⭐ **the blind-spot delta** | *what it would have asked that we did not* | ⛔ **requested in assignment 1, not in our repository. The one artifact we cannot produce ourselves.** |

✅ **ALL FOUR ARE NOW IN `Claude Comms and Packages/Codex Audits/`.** §6 item 2 asks him only to confirm our reading of them.

---

## 6. ⭐⭐ WHAT WE ARE ASKING COLTRANE FOR — **TWO ASKS, DELIBERATELY SEPARATE**

> ⛔ **r5 WAS ONE ASK OVER 30 FINDINGS AND 1,020 BASELINE VALUES. LANGSTON RULED THAT TOO WIDE AND HE IS RIGHT** — a single document that large gets a single shallow answer. **Split, each ask is bounded and each has its own rollback.**

---

### ⭐ ASK 1 — **THE DESIGN, OVER THE CONFIRMED SET ONLY**
**Given §1's confirmed findings and the invariants in §0b: design the fix.**
- **(a)** ⛔ **The smallest coherent design, not nine fixes.** §7 offers the observation that five of them may be one mechanism — **use it or discard it, but say which.**
- **(b)** **State what must land together and what can follow**, and what the rollback is for each piece.
- **(c)** **Of the five open runtime questions in §3, tell us which ones your design DEPENDS on** — we will produce that evidence. **Do not design around them silently.**
✅ **BOUNDED: nine confirmed findings, one subsystem, one rollback story.**

---

### ⭐ ASK 2 — **THE BASELINES — AND WE ARE HANDING YOU ~206 VALUES, NOT 1,020**
> ⛔ **The full config is 1,020 settings across 99 surfaces. Handing you all of it would make it unreviewable, which is the same failure as handing you nothing.** ⇒ **this is the set Kyle actually named, and it is where a bad baseline poisons Phase 25.**

| family | settings | last changed | authors | what it governs |
|---|---|---|---|---|
| `strategy_gates` | **38** | 2026-07-14 | 3 | ⭐ **which strategies a signal may be routed to — Kyle's "regime categories"** |
| `expectancy_gates` | **29** | 2026-06-27 | 3 | the expected-value gate that admits or refuses a trade |
| ⚠️ `strategy.dhma` | **25** | **2026-05-05** | **1** | ⛔ **set on ONE DAY by ONE AUTHOR and untouched for four months** |
| `strategy.vwap_pullback` | 18 | 2026-06-05 | 3 | per-strategy parameters |
| `sqe_config` | 18 | 2026-05-26 | 4 | the signal-quality gate *(5 asset classes)* |
| `regime_classifier` | 16 | 2026-06-04 | 5 | ⭐ **the regime RANGES themselves** |
| `volume_regime` | 16 | 2026-05-25 | 2 | ⭐ regime ranges |
| `multi_tf_agreement` | 16 | 2026-05-25 | 2 | ⭐ regime ranges |
| ⚠️ `strategy.range_trade` | **15** | **2026-05-05** | **1** | ⛔ **same shape as `dhma` — one author, one day, untouched** |
| `strategy.breakout` | 15 | 2026-06-05 | 3 | per-strategy parameters |
| **plus the filters** | — | — | — | liquidity, volatility, the price floor (`#967`, a Kyle decision), the volume floor |
| **TOTAL** | **206** | | | |

✅✅ **AND THE PROVENANCE LANGSTON ASKED FOR EXISTS — measured, whole table:**
- **Every setting carries an author. Zero are unattributed.**
- **654 of 1,020 (64%) have not been changed in 90 days.**
- ⭐ **NOT ONE is older than 180 days** ⇒ **the entire configuration was established inside a single ~6-month window**, which is exactly the period the system's own architecture changed underneath it.

⇒ ⛔ **SO THE QUESTION IS ANSWERABLE, AND IT IS NOT "IS THIS VALUE WRONG". IT IS:**
> **Was this value CHOSEN for the system as it is now, or inherited from the system as it was when it was set — and is it a good place to START collecting data from?**
★ **`strategy.dhma` is the sharpest case: 25 values, one author, one day in May, untouched since.** ⚠️ **And note it is also astra finding 2's subject — that same strategy's price geometry is said to MIX UNITS and not be invariant to nominal price scale. Two independent routes to the same file.**

⛔ **DELIBERATELY EXCLUDED FROM ASK 2, AND SAID OUT LOUD RATHER THAN OMITTED:** the `amr_*` families (**136 settings**) and `trailing_exit` (**52 settings behind an off switch**). ★ **They are a later question. Including them is precisely what made 1,020 unreviewable.**

---

### ➕ SUPPORTING, IN EITHER ASK
- **Confirm or correct our reading of your earlier findings** — §5 registers all four audits. **Which do you still stand behind, which would you withdraw, which are overtaken?**
- **What else do you need from us?** Data, measurement, history, intent, or a decision only Kyle can make. ✅ **Ask plainly; anything we can supply, we will.**
- ⚠️ **Citations in this register name files without full paths in places.** **Read at the stamped sha and tell us where a path is ambiguous** — two of five checked needed a probe.

---

## 7. ⭐ ONE OBSERVATION WE OFFER THE DESIGNER — **NOT A PROCESS RULING**

⚠️ **r2 CARRIED FOUR PROCESS DECISIONS HERE — how to group the work, what to send, what gate to apply, when the document becomes canonical. WITHDRAWN.** ★ **Kyle has assigned the how to himself, Langston and Coltrane, and I was deciding it in a document meant to inform that decision.**

✅ **WHAT IS WORTH KEEPING IS AN OBSERVATION ABOUT THE FINDINGS THEMSELVES, which the designer can use or discard:**
**§1.1, §1.2, §1.5, §1.7 and §1.8 are all the same subsystem** — what we subscribe to, what confirms the subscription arrived, and what travels alongside the resulting price. **They read as five findings and they may be one mechanism.**
★ **THE EVIDENCE FOR THAT, and it is ours rather than a hunch: Langston re-cut his own blocker and folded three of them into a single mechanism once he saw that the missing thing was a CONFIRMED book rather than a missing one.**
⇒ **Offered as a starting observation for the design. Whether it holds is the designer's call.**

⚠️ **AND ONE THING WE OWE REGARDLESS OF THE DESIGN: `PRICING_DATA_ARCHITECTURE.md` currently carries a claim we know is wrong** — it is banner-marked NOT CANONICAL, and §1 and §2 above are the corrections it needs. **That is our repair work, not Coltrane's.**
