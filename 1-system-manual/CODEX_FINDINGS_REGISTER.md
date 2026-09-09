# CODEX FINDINGS REGISTER — **EVERYTHING COLTRANE NEEDS TO DESIGN THE FIX**

> ⛔ **STATUS: DRAFT r3 (CC-C, 2026-09-09). CC-C + Langston iterate to consensus, then it goes to Coltrane.**

## ⭐⭐ WHAT THIS DOCUMENT IS FOR — **KYLE, 2026-09-09, CORRECTING THE FRAMING I HAD GIVEN IT**

> **"I don't want this to be a document where we're trying to test and catch Coltrane. Right now, I just want the intent to be that we send him a document that he can look at, agree on the things that need to be fixed, come up with a design which he then shares with you and Langston."**
> **"This is all about improving in performance, not trying to knock down another agent and test his capabilities."**

⛔⛔ **r2 OF THIS FILE WAS PARTLY ADVERSARIAL AND THAT WAS MY ERROR.** It carried a *"what did we get wrong, including any row we accepted for the wrong reason"* question and a verification posture aimed at the reviewer rather than at the work. **Struck.** ★ **The register's job is to give him what he needs, not to grade him.**
✅ **WHAT SURVIVES, because it is about OUR standard and not about him: every row still records HOW we settled it.** That is us showing our work so he can trust or challenge it — **not a trap.**

### ⭐ THE OUTCOME THE DESIGN MUST SERVE — in Kyle's terms, and every row is written against it
1. **The trading system performing at the highest possible level.**
2. **Our simulations reproducing reality as closely as possible.**
3. ⭐⭐ **BASELINE THRESHOLDS SET FOR EVERY KEY AREA — strategies, regime categories, reachability — at the best possible starting point**, so that the data we then collect is worth calibrating on. **That is Phase 25's input, and a bad baseline poisons it.**

⇒ ★ **(3) IS THE ONE I HAD NOT CAPTURED AT ALL, and it changes what "done" means for this programme:** we are not only removing defects. **We are setting the starting values the calibration phase will learn from.** A correct price that feeds a threshold nobody chose deliberately is still a bad baseline.

## ⏳ HOW THE WORK WILL BE DONE — **NOT DECIDED, AND NOT MINE TO DECIDE**
**Kyle is iterating that with Langston and Coltrane.** The idea being tested: **Coltrane writes the code in his own repository; Langston reviews it; everything is inspected before it reaches the review branch or staging; a clear rollback exists.** ⚠️ **Whether it ships as one change or in pieces is an open question Kyle has explicitly assigned to Langston and Coltrane.**
⛔⛔ **I HAVE STOPPED DECLARING WHAT WE WILL AND WILL NOT DO — KYLE'S CORRECTION, AND IT WAS FAIR.** I had ruled on gates, exclusions and sequencing before the approach itself was decided. **r2's process rulings are withdrawn from this file.** ★ **His framing: rules will be broken deliberately, it is a test, and if it does not work we roll back.**
✅ **WHAT IS SETTLED AND DOES NOT NEED RE-DECIDING: everything Coltrane produces is vetted, confirmed and verified — before implementation and after.** That is Kyle's own condition, not a gate I am adding.

---

## 0. ⛔ METHOD, AND TWO LIMITS STATED BEFORE THE CONTENT

**(1) THE DENOMINATOR IS INCOMPLETE.** This covers the **pricing-architecture review in full (14 findings)**. **Assignments 1-3 are NOT yet registered** — see §6. ⇒ ⛔ **Until that closes, this document is a complete register of ONE audit and an incomplete register of four.** **Said here rather than discovered later.**

**(2) ACCEPTING A CORRECTION IS ITSELF A CLAIM** *(Langston)*. Rule 29 binds it as it binds making one. **Every row states HOW it was settled:**
| tag | meaning |
|---|---|
| ✅ **CONFIRMED — RE-DERIVED** | we went to the code ourselves, with **our own** citation |
| ⚠️ **ACCEPTED — REPORTED FACT** | on Coltrane's citation. ⛔ **Only where the item is decision-inert** |
| ⛔ **DISPUTED — WITH CITATION** | we think it is wrong, and say why, with a line |

⭐ **SCORE SO FAR: 4 re-derived, 4 correct.**
⛔⛔ **THAT BUYS CREDIBILITY, NOT A PASS — KYLE'S RULING:** *"just because the codex got a few things right, doesn't mean we blindly accept anything… We have to validate everything."* ⚠️ **r1 of this file proposed a *correct-until-shown-otherwise* prior. STRUCK.** ★ **A track record is not evidence about the NEXT claim.**

**(3) ROUTING — every row carries one:**
| route | meaning |
|---|---|
| ⭐ **PRICING** | folds into the one sequenced pricing programme |
| ➕ **SEPARATE** | real, but not pricing — its own batch or sequence, **placed, not forgotten** |
| ⏳ **INVESTIGATE** | needs evidence before it can be dispositioned |
| ⬜ **DOC-ONLY** | our document was wrong; the system is fine |

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

### 1.4 ⛔ **A5 — xStock signals are born on 15-minute bars, not 60, and it is a bar close, not a midpoint**
**PLAIN:** Two errors in one cell. The interval is **15 minutes**; the 60 we cited belongs to a different job. And **a bar close is not a midpoint** — there are no two quote sides in it.
✅ **CONFIRMED — RE-DERIVED** at `scanner.ts:597` versus `regime-inputs.ts:143`.
⛔ **WHAT WE OWE:** correct both. ⭐ **AND THE DEEPER POINT IS THE ONE THAT MATTERS: neither "up to an hour old" nor "up to fifteen minutes old" is a freshness bound at all.** A forming bar can hold a recent trade; a capture gap can leave a very old one. **The bar's start time is not the age of the information in it.**

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

## 2. ✅ CONFIRMED — DOCUMENT CORRECTION · ⬜ **ROUTE: DOC-ONLY** *(except A8, which is `➕ SEPARATE` — it bears on go-live)*

| # | plain summary | how settled |
|---|---|---|
| **A14a** | **"REST costs one request per symbol" is wrong** — the cache and loader batch symbols, and a whole-market request exists. Our capacity comparison used the wrong unit. | ⚠️ reported fact |
| **A14b** | **The volume-floor "dial" is not wired.** We said the archive floor could be changed in the database without redeploying. The loader reads a file or an explicit option; **no database read is on that path.** ⭐ *A comment about a dial is not its wiring.* | ⚠️ reported fact |
| **A14c** | **Archive, cache and subscription sets are NOT strictly nested.** We presented them as one inside the other. They are independently selected. | ⚠️ reported fact |
| **A14d** | **The perpetual tables have another reader** — a dashboard — so our "only retention scripts read them" was too broad. **Not a pricing consumer**, so the substance stands. | ⚠️ reported fact |
| **A8** | ⛔ **A separate live engine EXISTS behind a gate, with a real exchange order call.** We claimed no separate real-order path existed. **It is not evidence the gate is on** — but it is a concrete counterexample, and it matters for go-live. | ⚠️ reported fact — ⛔ **RE-DERIVE: this touches Phase 21** |
| **A10b** | **Our withdrawn agreement conclusion is still sitting in the document beside its own withdrawal.** A canonical reader should not have to choose between two authoritative statements. | ✅ correct — remove, don't annotate |

---

## 3. ⏳ NEEDS INVESTIGATION · ⏳ **ROUTE: INVESTIGATE** — these are §6 item 4 — and the ask is which ones the DESIGN depends on

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

## 5. ⏳ THE OTHER THREE AUDITS — **NOT YET REGISTERED — THE RETRIEVAL IS §6 ITEM 2**

| assignment | subject | what we hold |
|---|---|---|
| **1** | full system audit — trading logic, maths, machinery | ⛔ **report not in our repository.** Known downstream: finding 1 → `#1006` *(repository/database schema divergence — **STILL UNHOMED, awaiting Kyle**)*; a fee-contract finding → `#1010` → `B-XSTOCK-FEE-CONTRACT`, CC-B |
| **2** | trading logic, the maths, and what to build | ⏳ not registered |
| **3** | what is stopping the system doing its job | data files present under `Claude Comms and Packages/Codex Audits/audit3/`; ⏳ findings not registered |
| ⭐ **the blind-spot delta** | *what it would have asked that we did not* | ⛔ **requested in assignment 1, not in our repository. The one artifact we cannot produce ourselves.** |

⚠️ **WE ARE NOT ASSERTING THESE WERE NEVER PRODUCED.** Coltrane writes to its own folder and our instrument does not reach there. ⇒ **§6 item 2 asks for them.**

---

## 6. ⭐ WHAT WE ARE ASKING COLTRANE FOR

> ✅ **THE ASK IS A DESIGN, NOT A VERDICT.** He has already reviewed; this is the next step. **Everything below is either something only he holds, or something his design needs from us and we should supply rather than ask for.**

**1 — THE DESIGN.** Given the confirmed findings in §1 and the objective in the header, **design the fix.** ⭐ **Not fourteen fixes — the smallest coherent design that serves all three outcomes**, including which parts must land together and which can follow.
**2 — YOUR EARLIER FINDINGS, AS A LIST.** Assignments 1-3, one line each with the disposition you would give it today. ⚠️ **We hold your pricing review in full and almost nothing from the other three** — that is a gap on our side, not a test of your recall. **Plus the blind-spot delta if it exists.**
**3 — THE BASELINE THRESHOLDS.** ⭐ **This is the outcome we most need your view on and the one our own register was weakest on.** For **strategies, regime categories and reachability** — what should the starting values be, and what makes a baseline good enough that the calibration phase can learn from the data it produces?
**4 — THE FIVE RUNTIME QUESTIONS FROM §4** — the ones needing evidence rather than a code read: context-cache staleness, the gate-time snapshot interval, maker-fill incidence, fabricated-target incidence, and the real upper bound on the book-resync gap. **Tell us which of these your design depends on**, and we will produce the evidence.
**5 — WHAT ELSE DO YOU NEED FROM US?** Data, measurements, history, intent, or a decision only Kyle can make. ✅ **Ask plainly** — anything we can supply, we will.

---

## 7. ⭐ ONE OBSERVATION WE OFFER THE DESIGNER — **NOT A PROCESS RULING**

⚠️ **r2 CARRIED FOUR PROCESS DECISIONS HERE — how to group the work, what to send, what gate to apply, when the document becomes canonical. WITHDRAWN.** ★ **Kyle has assigned the how to himself, Langston and Coltrane, and I was deciding it in a document meant to inform that decision.**

✅ **WHAT IS WORTH KEEPING IS AN OBSERVATION ABOUT THE FINDINGS THEMSELVES, which the designer can use or discard:**
**§1.1, §1.2, §1.5, §1.7 and §1.8 are all the same subsystem** — what we subscribe to, what confirms the subscription arrived, and what travels alongside the resulting price. **They read as five findings and they may be one mechanism.**
★ **THE EVIDENCE FOR THAT, and it is ours rather than a hunch: Langston re-cut his own blocker and folded three of them into a single mechanism once he saw that the missing thing was a CONFIRMED book rather than a missing one.**
⇒ **Offered as a starting observation for the design. Whether it holds is the designer's call.**

⚠️ **AND ONE THING WE OWE REGARDLESS OF THE DESIGN: `PRICING_DATA_ARCHITECTURE.md` currently carries a claim we know is wrong** — it is banner-marked NOT CANONICAL, and §1 and §2 above are the corrections it needs. **That is our repair work, not Coltrane's.**
