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
6. ⭐ **READ THE CROSS-CUTTING RUNTIME-STATE REGISTRY IN `1-system-manual/SYSTEM_IMPACT_MAP.md` BEFORE ANY CHANGE TOUCHING SHARED STATE OR A KEY SHAPE** — singletons, shared maps and liveness live there, and a key change designed without that census fixes one instance of five.

---

## 1. ✅ CONFIRMED — NEEDS A CHANGE · ⭐ **ROUTE: PRICING PROGRAMME**

### 1.1 ⛔⛔ **A1 — The order book IS subscribed for candidates in the queue, not only for positions we hold.** *(the biggest single correction)*
**PLAIN:** We wrote that the system only asks the exchange for the full order book on coins we already own. It doesn't. **When a coin enters the ready-to-buy queue, it gets subscribed right there — ticker and full book.**
✅ **CONFIRMED — RE-DERIVED** at `server/core/rtb/ready_to_buy_service.ts:2422-2431`. Its own comment, dated 2026-07-15, names two coins that died on the old behaviour.
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
✅ **CONFIRMED — RE-DERIVED** at `server/asset_classes/xstock_spot/scanner.ts:597` versus `server/core/metrics/regime-inputs.ts:143`.
⛔⛔ **AND THE FACT UNDER THE CORRECTION IS BIGGER THAN THE CORRECTION (Langston): A SIGNAL BORN ON 15-MINUTE BARS IS RE-GRADED AT REFRESH ON 60-MINUTE BARS — BOTH CLASSES.** *(`xstock_spot/scanner.ts:597` births at 15; `server/core/metrics/regime-inputs.ts:145`/`:147` inside `computeRefreshRegimeInputs` re-grades at 60.)* ★ **That is a DESIGN INPUT, not a documentation fix — the thing that admitted a signal is not the thing that keeps it.**
⛔ **WHAT WE OWE:** correct both. ⭐ **AND: neither "up to an hour old" nor "up to fifteen minutes old" is a freshness bound at all.** A forming bar can hold a recent trade; a capture gap can leave a very old one. **The bar's start time is not the age of the information in it.**

### 1.5 ⛔ **A2 — the checksum DOES exist; our "never implemented" citation is wrong**
**PLAIN:** We said the order book's integrity check was never built. It was. ⚠️ **But you still cannot tell, downstream, whether a given book passed it** — and where the instrument's precision is unknown, verification is skipped.
✅ **CONFIRMED — RE-DERIVED.**
⛔ **WHAT WE OWE:** correct the citation, **and the useful change is the one the correction reveals: make verified-status travel with the book** rather than being unknowable at the point of use.

### 1.6 ✅ **A3 — the exit simulation DOES fill beyond observed liquidity — AND IT IS A GOVERNED DESIGN DECISION, NOT AN ACCIDENT** *(re-derived 2026-09-09)*
**PLAIN:** Our criticism was aimed at the wrong half. **The ENTRY walk correctly reports running out of size.** The **EXIT** walk always completes the order: any quantity beyond the visible book is priced at the worst bid it did touch, worsened by a penalty, and blended into the average.
✅ **CONFIRMED — RE-DERIVED**, and the code states it in its own words at `server/services/execution/depth-walk.ts:75-81`:
> *"CLOSE fill (sell): walk the BID side, then **ALWAYS full-fill** (R2 — a market exit always gets out, just at a worse price in a thin book; never a phantom stuck position)… **Returns `filledQty === orderQty` always.**"*

⛔⛔ **AND THE PROVENANCE READ CHANGES THE DISPOSITION — THIS IS `rule 24` OUTCOME (2), NOT A DEFECT:**
| | |
|---|---|
| **introduced by** | **`P19-B4b.1`, `b74526dc3`, 2026-06-16** — a governed batch that closed with SIM, System Manual ch.7, `RUNNING_ISSUES` (`#295` RESOLVED, `#300`), the phase plan, catalog, history and a completion report |
| **the rationale is stated** | *"a market exit always gets out… never a phantom stuck position"* — **the alternative is a simulated position that can never be closed, which is its own falsification** |
| **the penalty is NOT a magic number** | ✅ **DB-governed and verified live: `fill_depth_gate.beyond_depth_penalty_bps = 50` for BOTH `crypto_spot` and `xstock_spot`**, written by `p19-b4b1` |
| **and that was a review condition** | the comment records it as **Langston's own Q-A condition** — he required it not be a constant |

⇒ ✅ **SO THE MECHANISM IS REAL AND THE FRAMING WAS WRONG. It is not "inventing liquidity"; it is a reviewed choice to prefer a pessimistic completed exit over an un-closable simulated position.**
⛔ **WHAT SURVIVES AS A REAL QUESTION, AND IT IS A BASELINE QUESTION — SO IT BELONGS TO ASK 2 AS MUCH AS ASK 1:** **is 50 bps the right penalty**, and **should the recorded result distinguish the OBSERVED portion of a fill from the EXTRAPOLATED portion?** ★ **Today one blended average hides which is which, so no later study can separate them.**

⭐⭐ **THIRD TIME TODAY THAT A PROVENANCE READ CHANGED A FINDING'S DISPOSITION** — after A8's dead engine and `#578`. ★ **Every one was accurate on mechanism and missing the decision behind it. That is the argument for §6's provenance condition, restated by evidence rather than by assertion.**

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
⛔⛔ **NUMBER COLLISION, CAUGHT BY LANGSTON AND SETTLED HERE: `#1006` IS ALREADY CC-B's `B-RTB-SIGNAL-IDENTITY`** (`RUNNING_ISSUES:7519`, plan row `2.4c`) — `asset_class` missing from the RTB keys. **I assigned the same number to a different batch with a different owner and a different plan row, on ADJACENT work.** ⇒ ✅ **RENUMBERED `#1022`.**
⚠️ **AND THE DEEPER QUESTION LANGSTON RAISED IS NOT MINE TO CLOSE: are these ONE batch or two?** `#1006` is the RTB table's unique index; this is the KEY SHAPE across in-memory symbol-keyed stores. **Same root cause, different surfaces, different owners.** ⛔ **Settle it before dispatch, or Coltrane designs a key-shape change straight into CC-B's in-flight batch.** *(CC-C's view: adjacent, not identical — but this is a scoping call for Langston and Kyle, not mine.)*
**HOME: `B-SYMBOL-CLASS-IDENTITY` (`#1022`), owner CC-C, `PHASE_19_PLAN` row `3b.h-4`. Objective 1 is the census, not the migration. Correctness-driven, not incident-driven — one collision has ever reached a trade.**

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

## 2b. ✅ **A8 — THE SECOND ENGINE IS A KNOWN LEGACY ARTIFACT, ALREADY KYLE-RULED AND ALREADY SCHEDULED FOR REMOVAL** · ➕ **ROUTE: SEPARATE · EXISTING ITEM**

⛔⛔ **CORRECTED 2026-09-09 AFTER THE PROVENANCE READ KYLE ORDERED. r6 PRESENTED THIS AS AN OPEN GO-LIVE RISK. IT IS A DISPOSITIONED ONE, AND THE DISPOSITION IS KYLE'S OWN.**

**WHAT COLTRANE FOUND, and he was careful about it:** the repository instantiates a second trading engine in live mode behind a feature gate, containing a real exchange order call. ✅ **He explicitly refused to claim the gate was enabled or that it trades** — his claim was narrow and it is accurate.

✅ **WHAT THE PROVENANCE READ ADDS — and it is the whole disposition:**
| | |
|---|---|
| **already filed** | ⭐ **`#578`, OPEN since 2026-07-25 (CC-A), *"THE LEGACY `TradingEngine` … IS DEAD IN BOTH MODES AND IS SCHEDULED FOR REMOVAL (rule 18)"*** — **and the ledger records the disposition as KYLE-RULED** |
| **what it is** | an older, separate engine class from the **Phase-27 era**, distinct from the current active pipeline |
| **origin** | introduced `5951a3195`, **2025-10-02** — the Replit era, before the migration |
| **why it is gated** | the `live_engine_gate` was added deliberately on **2026-06-10** (`acf683c5d`, *"switch cleave — live-engine Phase-21 gate + locks"*, Langston-approved) |
| **the plan already says so** | `PHASE_19_PLAN`: *"a `TradingEngine` that runs in neither mode (paper never starts it; live is Phase-21-gated and refuses)"* |

⛔⛔ **AND *"THE GATE IS THE CONTAINMENT"* IS FALSE — I WROTE IT, LANGSTON DISPROVED IT AT THE CODE, AND IT REACHED KYLE.** *(2026-09-09.)*
**The gate covers `.start()` ONLY.** ⛔ **`closeTrade` (`server/services/trading-engine.ts:599`) has NO `isRunning` guard, is reached from `server/routes.ts:5056` with the mode taken OFF THE REQUEST BODY, and at `:633` issues a REAL Kraken market `sell` plus two `cancelOrder` — never reading `live_engine_gate`.** *(`processSignal`/`executeTrade` ARE properly contained — `:222` guard, `executeTrade` private. `closeTrade` is not.)*
✅ **WHAT ACTUALLY CONTAINS IT TODAY: the legacy `trades` table is EMPTY — 0 rows, 0 live, 0 open, measured on staging — and only the gated engine writes it.**
⇒ ⛔⛔ **THAT IS CONTAINMENT BY *DATA*, IT IS RECORDED NOWHERE, AND IT EVAPORATES THE MOMENT ANYTHING WRITES A LIVE ROW.** ★ **Same class as `#213`, which `P19-B2` chose to DELETE rather than gate, for precisely this reason.**
➕ **COLTRANE'S ADDITION, and it raises the bar correctly:** removal must be **an explicit release blocker WITH VERIFICATION that the registered route can no longer reach legacy exchange actions.** ★ **Deleting the engine is not sufficient on its own — the route has to be shown unable to reach it.**
⛔ **SO THE REMOVAL NEEDS A HARD FLOOR: `#578` currently sits at plan row 11.5, *"re-order on Kyle's word."* ⇒ **REMOVAL LANDS BEFORE PHASE-21 GO-LIVE.** ★ **§13 disposition: a RIDER on the existing `#578`, not a new item.**

⇒ ✅ **DISPOSITION: `#578`, existing, Kyle-ruled, scheduled for removal under rule 18. NOT a new finding and NOT a new batch.** ⛔ **It must not be re-filed, and a design must not build around it — it is going away.**

➕ **ONE THING FROM THE SAME FAMILY THAT IS *NOT* COVERED BY `#578` AND STAYS OPEN:** astra finding 8 records that **the kill switch's LIVE branch logs that live flatten is future Phase-21 work rather than implementing it.** ⇒ **in paper the kill switch flattens; in live, as written, it would not.** ⚠️ **That is about the CURRENT guardrail policy, not the dead engine.** **Carried to Phase 21; not re-derived by us.**

⭐⭐ **AND THIS IS THE CASE THAT JUSTIFIES THE PROVENANCE REQUIREMENT IN §6 — IT IS NOT A CRITICISM OF THE REVIEWER.** ★ **Everything he wrote was true. What he could not know, without the history, was that we had already found it, already ruled it, and already scheduled its deletion.** ⇒ **the same finding with a provenance read attached reads *"already dispositioned as `#578`, verify it is still on track"* — which is worth something — instead of *"a concrete counterexample"*, which sends people to re-investigate a closed decision.**

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

## 4. ✅ SCOPE NARROWED — **we agree with the finding and are bounding it**

⚠️ **RENAMED from *"DISPUTED / PARTIALLY DISPUTED"* (Langston): both rows AGREE with him and merely narrow the scope. Labelling agreement as dispute is scorekeeping in a heading.**

| # | our position | citation |
|---|---|---|
| **A1 scope** | **Correct for crypto only.** xStocks take **no** queue-time warm at all, so our original claim holds there unmodified — and for a never-queued crypto name. | `server/core/rtb/ready_to_buy_service.ts:2422` is `crypto_spot`-gated |
| **A13 watchdog** | **We agree it is unarmed per-symbol** — but Codex is right that a *separate aggregate* archive watchdog exists, so the conclusion stays per-symbol and must not be read as "no watchdog." | accepted narrowing |

---

## 5. ✅ THE OTHER THREE AUDITS — **REGISTERED**

| assignment | subject | what we hold |
|---|---|---|
| **1** | full system audit — trading logic, maths, machinery | ⛔ **report not in our repository.** Known downstream: finding 1 → `#1006` *(repository/database schema divergence — **HOMED: CC-B's `B-RTB-SIGNAL-IDENTITY`, plan row `2.4c`**)*; a fee-contract finding → `#1010` → `B-XSTOCK-FEE-CONTRACT`, CC-B |
| **2** | trading logic, the maths, and what to build | ⏳ not registered |
| **3** | what is stopping the system doing its job | data files present under `Claude Comms and Packages/Codex Audits/audit3/`; ⏳ findings not registered |
| ⭐ **the blind-spot delta** | *what it would have asked that we did not* | ⛔ **requested in assignment 1, not in our repository. The one artifact we cannot produce ourselves.** |

✅ **ALL FOUR ARE NOW IN `Claude Comms and Packages/Codex Audits/`.** §6 item 2 asks him only to confirm our reading of them.

---

## 6. ⭐⭐ WHAT WE ARE ASKING COLTRANE FOR — **TWO ASKS, DELIBERATELY SEPARATE**

> ⛔ **r5 WAS ONE ASK OVER 30 FINDINGS AND 1,020 BASELINE VALUES. LANGSTON RULED THAT TOO WIDE AND HE IS RIGHT** — a single document that large gets a single shallow answer. **Split, each ask is bounded and each has its own rollback.**

---

### ⛔⛔ A CONDITION ON BOTH ASKS — **THE PROVENANCE READ. KYLE'S REQUIREMENT, 2026-09-09.**

> **"Everything that he dives into, he needs to use the provenance policy — dig into the history, look at the archival documents in the bridge canonical folder, understand the intent of what was built, understand the history of it, and then decide whether or not that intent is still relevant."**

⛔ **BEFORE PROPOSING ANY CHANGE TO A COMPONENT, ESTABLISH WHAT IT WAS BUILT TO DO AND WHY.** Then say **which of these it is** — the answer changes the design, not just the wording:
| # | disposition | meaning |
|---|---|---|
| **1** | **still relevant and correct** | leave it; the intent holds |
| **2** | **relevant but needs updating to today's intent** | fix it — the purpose survives, the implementation drifted |
| **3** | **disconnected and should be RECONNECTED** | it was meant to run and does not |
| **4** | **connected but should be REMOVED** | it runs and should not |
| **5** | **disconnected and should STAY disconnected, or be deleted** | genuinely dead — ⭐ **do not design around it** |

**WHERE THE HISTORY LIVES:**
- **`bridge/canonical/`** — the pre-governance corpus. ⚠️ **It records what we INTENDED to build then. It is NEVER current-state truth** — the architecture has changed completely. **Its value is the WHY.**
- **`1-system-manual/RUNNING_ISSUES.md`, `1-system-manual/BATCH_CATALOG.md`, and the batch completion reports** — search by **FILE and SYMBOL name**, not by symptom.
- **`git log -S "<symbol>" --reverse`, NOT path-limited** so it survives renames — then **read the introducing commit.**

⛔⛔ **WHY THIS IS A REQUIREMENT AND NOT A COURTESY:** ★ **without it, a true finding about a component we already killed reads as a live risk.** **§2b is exactly that case: a real second engine with a real order call — already found, already Kyle-ruled, already scheduled for deletion since July.** ⇒ **the finding was accurate and the disposition was missing, and the disposition is what tells us whether to act.**
⚠️ **AND AN HONEST GAP, STATED RATHER THAN PAPERED OVER (Langston's point): WE HAVE THREE WORKED EXAMPLES AND ALL THREE POINT THE SAME WAY.** `#578`'s dead engine, A3's governed exit policy, and the `#732` trailing label — **every one resolved to *already decided* or *working as designed*.** ⛔ **We do NOT yet have an instance where the provenance read said SCRAP AND REBUILD.**
★ **That is a real asymmetry in the evidence and it would be dishonest to manufacture a counter-example to balance it.** ⇒ **read the policy as Kyle wrote it, not as our three cases demonstrate it** — and if the first scrap-and-rebuild case comes from Coltrane rather than from us, **that is the policy working, not failing.**

✅ **AND IT CUTS BOTH WAYS — it is not a filter for discarding findings.** **If the original intent is no longer relevant, the answer is not "leave it": it is SCRAP AND REBUILD, or refactor.** ★ **A component doing faithfully what it was built for, in a system that has since changed, is still wrong — and only the history can tell you which of those two you are looking at.**

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
| **TOTAL of the ten families** | **206** | | | |

⚠️ **THE FILTERS ARE ADDITIONAL AND ARE NOT IN THE 206** — liquidity, volatility, the price floor (`#967`, already a Kyle decision) and the volume floor live in `server/config/crypto-universe-filter.json` and the filter services, not in `module_constants`. **Counted separately at scoping time; the 206 is the `module_constants` families only.** *(Langston: the earlier table implied they were inside the total.)*

⛔⛔ **THE PROVENANCE AXIS I FIRST GAVE WAS WRONG AND LANGSTON DISPROVED IT. RECORDED, BECAUSE IT REACHED KYLE.**
**I offered *"every setting has an author, none older than 180 days, and `strategy.dhma`'s 25 values set by ONE author on ONE day"* as the signal of *set-once-never-revisited*.** ⛔ **`updated_at` measures WHEN A BATCH LAST WROTE THE ROW, not when anyone CHOSE THE VALUE.** ★ **Measured whole-table: the top three writers are `b72-step3-commit-b` (173 rows, one day), `b5-amr` (163) and `b72-2-lever-sweep` (129) — 465 of 1,020 in THREE BULK SEEDS.** ⇒ **"one author, one day" is the ORDINARY case, not an anomaly**, and both my exemplars were written by the same bulk seed.

✅✅ **THE SUBSTANCE SURVIVES AND SHARPENS — THE DISCRIMINATOR IS `updated_by`, NOT `updated_at`: SEEDED-BY-A-BATCH-AND-NEVER-REVISITED versus SUBSEQUENTLY TUNED.** Measured across the ten families:
| status | families | settings |
|---|---|---|
| ⛔ **SEEDED, NEVER REVISITED** *(one author, one date)* | **`strategy.dhma` (25) · `strategy.range_trade` (15)** | **40** |
| ✅ **TUNED SINCE** *(multiple authors AND dates)* | `strategy_gates` 38/3 · `expectancy_gates` 29/3 · `sqe_config` 18/4 · `strategy.vwap_pullback` 18/3 · `regime_classifier` **16/5** · `volume_regime` 16/2 · `multi_tf_agreement` 16/2 · `strategy.breakout` 15/3 | **166** |

★ **`regime_classifier` — 16 values across FIVE authors and FIVE dates — is what genuine revision history looks like.** ⛔ **`strategy.dhma` and `strategy.range_trade` have not been touched since the seed that created them** — and `dhma` is independently **astra finding 2's subject** (price geometry said to mix units and not be scale-invariant). **Two routes, one file.**
⇒ ⛔ **HAND HIM THE AXIS, NOT MY ORIGINAL SIGNAL: *which values were seeded by a batch and never revisited, and is that still the right starting point?***

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

⚠️ **AND ONE THING WE OWE REGARDLESS OF THE DESIGN: `1-system-manual/PRICING_DATA_ARCHITECTURE.md` currently carries a claim we know is wrong** — it is banner-marked NOT CANONICAL, and §1 and §2 above are the corrections it needs. **That is our repair work, not Coltrane's.**
