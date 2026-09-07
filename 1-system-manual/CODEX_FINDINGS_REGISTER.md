# CODEX FINDINGS REGISTER — every finding, in plain language, with what we owe it

> ⛔ **STATUS: DRAFT r1 (CC-C, 2026-09-08). NOT FINAL — awaiting Langston's review rounds, then Kyle.**
> **Kyle's directive, 2026-09-07:** a plain-language list of every finding from every Codex audit — *"whether or not the finding is correct and means we need to make changes to the system and what that change is, whether the finding needs investigating, whether the finding was wrong and how we know it was wrong"* — finalised with Langston, documented, then sent back to Codex for **designs** on confirmed items and **follow-up questions** on investigation items.
> ⭐ **HIS BINDING SENTENCE, and it is the test every row is written against:** *"if we believe findings are real and will lead to meaningful improvements, then we have to capitalize on the opportunity to make those improvements."*

---

## 0. ⛔⛔ TWO LIMITS ON THIS REGISTER, STATED BEFORE THE CONTENT

**(1) THE DENOMINATOR IS INCOMPLETE AND I WILL NOT PRETEND OTHERWISE.** This register covers the **pricing-architecture review in full (14 findings)**. The three earlier assignments are **NOT yet covered**: assignment 3's measurement outputs are in the repository, but **assignment 1's `FULL_SYSTEM_AUDIT_2026-09-05.md` is referenced in our ledger by name and the document itself is not in our repository.** ⇒ ⛔ **A register that silently omitted them would be a register of the findings we happened to keep.** **Retrieval is requested; §5 holds the placeholder.**

**(2) ACCEPTING A CORRECTION IS ITSELF A CLAIM** *(Langston's ruling, and it shapes every row)*. Rule 29 binds it exactly as it binds making one. **So every row states HOW it was settled, not merely what was decided.** Three dispositions:
| tag | meaning |
|---|---|
| ✅ **CONFIRMED — RE-DERIVED** | we went to the code ourselves, at the pinned ref, with **our own** citation |
| ⚠️ **ACCEPTED — REPORTED FACT** | taken on Codex's citation. ⛔ **Permitted ONLY where the item is decision-inert** — never for anything a recommendation rests on |
| ⛔ **DISPUTED — WITH CITATION** | we think it is wrong, and the row says why, with a line |

⭐ **RUNNING SCORE, and it is the most decision-relevant number here: OF THE FOUR FINDINGS WE HAVE RE-DERIVED SO FAR, CODEX IS RIGHT ON FOUR.** ⇒ **the working prior is that a Codex finding is CORRECT until shown otherwise.** ⚠️ **That does NOT license accepting the rest unverified — it raises the cost of the ones we get wrong, because a wrong acceptance now inherits our confidence.**

---

## 1. ✅ CONFIRMED — NEEDS A CHANGE

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

## 2. ✅ CONFIRMED — NO SYSTEM CHANGE, DOCUMENT CORRECTION ONLY

| # | plain summary | how settled |
|---|---|---|
| **A14a** | **"REST costs one request per symbol" is wrong** — the cache and loader batch symbols, and a whole-market request exists. Our capacity comparison used the wrong unit. | ⚠️ reported fact |
| **A14b** | **The volume-floor "dial" is not wired.** We said the archive floor could be changed in the database without redeploying. The loader reads a file or an explicit option; **no database read is on that path.** ⭐ *A comment about a dial is not its wiring.* | ⚠️ reported fact |
| **A14c** | **Archive, cache and subscription sets are NOT strictly nested.** We presented them as one inside the other. They are independently selected. | ⚠️ reported fact |
| **A14d** | **The perpetual tables have another reader** — a dashboard — so our "only retention scripts read them" was too broad. **Not a pricing consumer**, so the substance stands. | ⚠️ reported fact |
| **A8** | ⛔ **A separate live engine EXISTS behind a gate, with a real exchange order call.** We claimed no separate real-order path existed. **It is not evidence the gate is on** — but it is a concrete counterexample, and it matters for go-live. | ⚠️ reported fact — ⛔ **RE-DERIVE: this touches Phase 21** |
| **A10b** | **Our withdrawn agreement conclusion is still sitting in the document beside its own withdrawal.** A canonical reader should not have to choose between two authoritative statements. | ✅ correct — remove, don't annotate |

---

## 3. ⏳ NEEDS INVESTIGATION — send Codex a follow-up question

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

## 5. ⏳ EARLIER AUDITS — **NOT YET REGISTERED, RETRIEVAL REQUESTED**

| assignment | subject | status |
|---|---|---|
| **1** | full system audit — trading logic, maths, machinery | ⛔ **report not in our repository.** Known: finding 1 → `#1006` (schema/database divergence, **still unhomed, awaiting Kyle**); a fee-contract finding → `#1010`, placed with CC-B |
| **2** | trading logic, the maths, and what to build | ⏳ not registered |
| **3** | what is stopping the system doing its job — spread/tick, holding period, cost hurdle | data files present in `Claude Comms and Packages/Codex Audits/audit3/`; ⏳ findings not registered |
| ⭐ **the blind-spot delta** | *what it would have asked that we did not* | ⛔ **requested in assignment 1, not in our repository. The single artifact we cannot produce ourselves.** |

---

## 6. ⭐ WHAT WE PROPOSE TO DO WITH IT — for Langston's and Kyle's amendment

1. ⛔ **GROUP CONFIRMED ITEMS INTO DESIGN UNITS BEFORE COMMISSIONING ANY DESIGN.** §1.1, §1.2, §1.5, §1.7 and §1.8 are **all the same subsystem** — what we subscribe to, what confirms it, and what travels with the resulting price. **Commissioned finding-by-finding they would return overlapping mechanisms that each look reasonable alone.** ★ *Precedent: Langston's own re-cut folded three blockers into one mechanism.*
2. **Send Codex the grouped units for design, and §3 as questions** — not fourteen separate asks.
3. **Answer its evidence requests under our own gate** — object, population, positive control on every number we hand an outside reviewer.
4. ⛔ **The document is NOT canonical until §1 and §2 land as edits to the body** — not as an errata block, because canonical documents are read from the top.
