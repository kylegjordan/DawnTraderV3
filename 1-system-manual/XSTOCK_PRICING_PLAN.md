# xSTOCK PRICING — **THE FULL PLAN**

**Owner CC-C · Kyle-directed · 2026-08-30**

> ⛔ **Kyle: *"I want the full plan. I wanna understand what you have identified as our problems, the solutions, and the plan [to] get our problems resolved."*** ✅ **This document is problems → solutions → order. Nothing is a fragment.**

---

## 1. ⛔ THE PROBLEMS, AND WHAT EACH ONE COSTS

| # | the problem, in one sentence | what it costs, measured |
|---|---|---|
| **P1** | **We exit on an order book of ANY age.** The entry refuses one older than 15 seconds; the close fetches the same thing through the same function and never checks. | **9.1% of closes** used a book older than the entry's own limit. **Worst: 25.9 MINUTES.** |
| **P2** | **A resting sell is treated as filled when the MIDPOINT reaches our price** — but a sell needs a **buyer**, so the **bid** must. | **59% of xStock resting exits** booked at a price **no bid ever reached.** |
| **P3** | **The entry spread check passes when it has NO price at all** — absent data emits a placeholder that clears the gate. | **Overnight: 171 of 486 symbols — 35% of the universe.** In daytime: 10 of 486. |
| **P4** | **At the daily 20:00 ET session boundary the venue re-quotes every symbol at once**, and we act on those prices. | **27% of all xStock stop-outs** fire in that one minute. |
| **P5** | **We only save a price every 4 seconds**, but decisions use every price that arrives — so the record cannot show what a decision saw. | **43.6% of the prices the engine used never reach storage**, and the loss is **worst on the fastest-moving names.** |
| **P6** | **Three different numbers are called "the price"** — the exit reads a mid, the fill reads a bid from storage, the ranking reads a 15-minute bar close. | The ranking number sits **0.24% from live on average, 2.9% at worst** — small for ranking, **not small for the stop distance it also sets.** |

⚠️ **AND ONE THING THAT IS *NOT* A PROBLEM, MEASURED AND CLOSED: the wide overnight bids.** They are a **genuine, symmetric, two-sided widening** — real, executable Kraken quotes, just wider because fewer participants quote tightly when the underlying market is shut. **n=77,060 against a 5.28M-row control.** ⛔ **Do not re-open this.**

---

## 2. ✅ KYLE'S THREE QUESTIONS, ANSWERED

### **Q: How fresh does an exit price need to be?**
> ✅ **RECOMMENDATION: 15 SECONDS — the same number the entry already uses.**

**Three independent reasons, and they converge:**
1. ⭐ **PHYSICS FIRST — anything tighter is unachievable.** Our feed **only writes a price every 4 seconds.** Measured against 236 closes: a **2-second** guard would block **134 of them (57%)** — not because they are stale, but because **the data cannot physically be fresher.** A **5-second** guard blocks 27 (11.4%).
2. ⭐ **THE DISTRIBUTION HAS A KNEE, AND 15 s SITS PAST IT.** p50 **2.33 s** · p90 **8.40 s** · p95 **65.20 s**. ⇒ **Between 5 s and 60 s the blocked count only moves from 27 to 14** — so there is a **hard core of ~15-20 genuinely stale closes** and everything else is under 5 seconds. **15 s blocks 20 of 236 (8.5%), and those are the pathological ones.**
3. ⭐ **THE INDUSTRY PRINCIPLE TRANSFERS EVEN THOUGH THE NUMBER DOES NOT.** Execution venues reject stale quotes at **50-100 ms** — because their feeds are millisecond feeds. **The rule is *reject beyond a few ticks of your own feed's cadence.*** Ours is 4 s. **15 ÷ 4 ≈ 3.75 ticks.** ⇒ **The entry's 15 s was already the right shape; we simply never applied it to the exit.**
✅ **And symmetry is worth something on its own: one number, not two, and no second constant to drift.**

⛔ **WHAT HAPPENS WHEN IT BLOCKS — and this is Kyle's own answer, adopted verbatim: *"we hold until we get the pricing that we need."*** **Do not exit this tick; re-evaluate next tick.** ✅ **This is not new behaviour — the exit monitor already skips with a named reason when the MARK is stale. We are extending an existing rule to the book.**
⚠️ **THE RISK, NAMED: holding means not exiting.** If the feed is dark and price is moving against us, we hold an unmanaged position. ⇒ ⛔ **THE KILL SWITCH AND FORCE-CLOSE MUST STAY EXEMPT — they are a different caller, and `order-placer` already carries the rule *"a close MUST still exit (never a stuck position)."*** **Evaluation waits; a forced flatten does not.**

### **Q: When we sell we take the bid, but bidders may improve. Do we model that?**
> ✅ **RECOMMENDATION: NO. Stay conservative — use the bid.**

**Because we already have a written rule that says so.** Founding invariant **F4**: *"Slippage MUST always work against the trader… **There is no 'positive slippage' in the simulation model**."*
⭐ **And the reasoning is stronger now than when it was written:** we are in **paper mode building calibration data.** **Modelling a favourable counterparty response means assuming an improvement we cannot verify — and every such assumption inflates our results in exactly the direction that has already contaminated them.** ⇒ **Conservative is not caution here; it is the only unbiased choice.**
*(In live mode the question dissolves: you get the fill you get.)*

### **Q: Is the spread-gate hole the same as the placeholder?**
> ⚠️ **RELATED, BUT THEY FAIL IN OPPOSITE DIRECTIONS — and your principle fixes both.**
- **ENTRY:** no recent quote → a placeholder → ⛔ **the gate PASSES.** *(fails open — lets us in blind)*
- **EXIT:** stale mark → ✅ **refuses.** *(fails closed — already correct)*
⇒ ⭐ **Your rule — *"we don't use some backup price that may or may not be applicable; we hold until we get the pricing we need"* — applied to the ENTRY means: NO DATA ⇒ NO ENTRY.** ✅ **That is P3's fix, and it is the same principle already governing the exit.**
⛔ **And to answer what I left ambiguous: the placeholder is NOT more accurate and it does NOT help us. It is a fallback, and you are right that we do not allow those.** **It is rare in daytime (10 of 486) and common overnight (171 of 486) — but rarity is not a defence, it is just a smaller blast radius.**

---

## 3. ✅ THE SOLUTIONS — ONE PER PROBLEM

| # | solution | notes |
|---|---|---|
| **P1** | **Call the freshness check the entry already calls, on the close, at 15 s. On failure: hold and re-evaluate next tick.** | ⛔ **Kill switch and force-close EXEMPT.** |
| **P2** | **A resting sell fills when the BID reaches the limit, not the mid.** | ⛔ **Must NOT collapse the `D1` rule — a Langston-approved marker forbids same-tick place-and-fill. Timing stays; only the SIDE changes.** |
| **P3** | **Absent data fails the entry gate.** No placeholder, no silent pass. | ⚠️ **This will reduce overnight entries. That is the intended effect, not a side effect.** |
| **P4** | **A plausibility check at ingest: a price whose move from the last good one is implausible does not become the mark; the last good value holds and the event is counted.** | ⭐ **CAUSAL, not clock-based — catches 20:15 AND the other three boundaries AND mid-session glitches, with nobody enumerating them.** ⚠️ **Needs a false-positive budget: a check that suppresses a real crash is worse than the defect.** |
| **P5** | **Record the book's age and the mark's kind on every close.** | ⚠️ **Kyle is right that this is not needed for the P1 fix — the age is already computed. It makes the FINDING readable instead of reconstructed, and it is the only way P5 and the laundering question can ever be measured.** ⇒ **Useful, not blocking.** |
| **P6** | **Name, per decision, which price it reads.** | ⛔ **KYLE'S CALL. Last, because it should be decided on clean data.** |

---

## 4. ⭐ THE ORDER, AND WHY

1. ⭐ **P1 — the freshness guard.** Largest, simplest, and the fix is calling a function that already exists three lines from where the snapshot is fetched. **Not session-specific.**
2. ⭐ **P2 — the resting-sell side.** Second largest, already-established as the batch's premise, and **not** session-specific.
3. **P3 — the entry gate's fail-open.** ⚠️ **Third and not first, deliberately: it is the only fix that REDUCES trading, and P1 and P2 are the ones bleeding.** ✅ **But it is the condition on leaning further into overnight.**
4. **P4 — the plausibility check.** After 1-3, because it is the one with a false-positive budget to design and the one whose absence is best understood.
5. **P5 — the instrumentation.** ⚠️ **Demoted from first to fifth on Kyle's correction.** Anywhere; it blocks nothing.
6. **P6 — decide the number per job.** **Kyle's, on clean data.**

⛔ **NOTHING HERE STOPS OVERNIGHT TRADING. Recommendation stands: keep trading all four sessions.** The prices are real; the defects are mostly not session-specific; and stopping would remove trades rather than defects — **and destroy the data we need to calibrate.**

---

## 5. ⛔ WHAT THIS PLAN DELIBERATELY DOES NOT DO
1. **It does not exclude 20:15 by the clock.** P4 is causal, so it also catches the boundaries we have not looked at.
2. **It does not subscribe to the order book.** Separate, costed, and it re-calibrates two live gates.
3. **It does not model favourable fills.** F4, and §2.
4. **It does not touch the kill switch or force-close.** They must always be able to flatten.

## 6. ⚠️ WHAT IS STILL UNKNOWN
1. **Why the event lags the session boundary by 15 minutes.** Capture armed nightly.
2. **Whether a partly-formed bar understates volatility** — and volatility sets stop distance. **Unmeasured.**
3. ⛔⛔ **Whether 20:15 is a SECOND REGIME rather than an anomaly.** **Three separate headline figures collapsed entirely into it.** ⇒ **If it is a regime, excluding it is not cleaning the data — it is declining to measure a third of our xStock trades.**
4. ⚠️ **Every claim that current behaviour is UNINTENDED is uncertified** until the decided-intent index exists. **The measurements are certified; the verdicts are not.**
