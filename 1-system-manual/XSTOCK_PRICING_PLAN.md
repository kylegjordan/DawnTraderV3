# xSTOCK PRICING — **THE PLAN**

**Owner CC-C · Kyle-directed · 2026-08-30 · supersedes `XSTOCK_PRICING_PLAN_DRAFT.md`**

> ✅ **THIS IS THE ACTIONABLE VERSION.** It came through three drafts, three independent reader rounds and two Langston rulings. **The ordering stopped moving when the costings arrived — that is the property it needed before it could be called a plan.**
> ⛔ **The DRAFT file is retained as the round record; do not act on it.**

---

## 1. ⛔ KYLE'S UNDERSTANDING — CONFIRMED, WITH TWO CORRECTIONS AND ONE HONEST GAP

**His statement (2026-08-30):** *"an event at 8:15 where the numbers are adjusting from one system providing the numbers to another … it occurs for every xStock … then it goes blank for a few minutes … then it resumes, but it's using these models as opposed to the Kraken pricing."*

| | verdict |
|---|---|
| an event where the pricing basis changes over | ✅ **CORRECT** |
| it hits every xStock at once | ✅ **CORRECT** — 422 symbols within ~700 ms |
| then a blank of a few minutes | ✅ **CORRECT** — 00:16, 00:17, 00:18 UTC empty |
| ⛔ *"models **as opposed to** the Kraken pricing"* | ⛔ **CORRECTION 1 — AND IT SUPPORTS HIS CONCLUSION** |
| the boundary is at 8:15 | ⛔ **CORRECTION 2 — the boundary is 8:00; 8:15 is 15 min AFTER it, and I cannot explain the lag** |

### ⛔ CORRECTION 1 — **IT IS STILL KRAKEN PRICING. IT IS ALWAYS KRAKEN PRICING.**
**Kraken is the venue and the source in all four sessions.** What changes at 20:00 ET is what **Kraken's market makers quote AGAINST**: during US hours, the live stock; overnight, *"ATS platforms, index futures, and internal models."*
⇒ ⭐⭐ **THE QUOTE REMAINS A REAL, EXECUTABLE KRAKEN QUOTE — a price you can actually transact at.** It is **wider**, because fewer participants will quote tightly when the underlying market is shut. **Wider is not fake.**
✅ **THIS STRENGTHENS HIS CONCLUSION, NOT WEAKENS IT: after the transition the prices are real and tradeable.**

### ⛔ CORRECTION 2 — **THE BOUNDARY IS 20:00 ET; THE EVENT IS AT 20:15**
**Kraken's published session boundary is 20:00 ET.** Our measured event is at **00:15 UTC = 20:15 ET — fifteen minutes later, on the second, every day.**
⛔ **I DO NOT KNOW WHY THE LAG IS FIFTEEN MINUTES, AND I AM NOT GOING TO INVENT A REASON.** ✅ **The nightly raw capture is armed to answer it.**

---

## 2. ⛔⛔ THE PART HIS FRAMING MISSES — AND IT IS MY FAULT FOR NOT SAYING IT PLAINLY

**His stance: *"ignore the event, and everything after returns to normal sanity."*** ⇒ ⛔ **THE SECOND HALF DOES NOT HOLD, AND IT IS NOT ABOUT THE EVENT AT ALL.**

**THE TWO LARGEST DEFECTS WE FOUND ARE NOT THE EVENT. THEY FIRE ON ORDINARY DAYS, IN EVERY SESSION:**
| | measured |
|---|---|
| ⛔ **The exit FILL walks an order book of ANY age.** The ENTRY refuses one over 15 s — same function. | **9.1% of closes filled on a book older than the entry's own limit. Worst: 25.9 MINUTES.** |
| ⛔ **A resting SELL is treated as filled when the MIDPOINT reaches the limit** — but a sell needs a BUYER, so the BID must. | **59% of xStock maker exits booked at a price no bid ever reached.** |

⛔ **AND ONE IS OVERNIGHT-SPECIFIC, WHICH IS THE ONE THAT BEARS DIRECTLY ON HIS DECISION:**
> **The spread gate emits a PASSING sentinel when it has no recent quote.** Regular hours: 476 of 486 symbols have data. ⛔ **Overnight: 315 of 486 — so 171 symbols, 35% of the universe, clear the spread check WITHOUT A SPREAD BEING CHECKED.**
⇒ ⛔⛔ **AND IT FAILS IN THE DANGEROUS DIRECTION: the same silence that makes ENTRY easier makes EXIT harder, because the exit path refuses to act on a stale mark.**

---

## 3. ✅ THE RECOMMENDATION — **KEEP TRADING OVERNIGHT. ONE CONDITION.**

> ✅ **I do NOT recommend suspending overnight trading, and neither the audit nor Langston's rulings support suspending it.**

**WHY:**
1. **The prices are real and executable** (§1). Wider is not fake.
2. **The defects are not overnight-caused.** The two largest fire in every session; suspending overnight would leave both untouched and would remove trades, not defects.
3. **Suspending would destroy the evidence.** The overnight session is where a large share of xStock activity is; stopping it stops the data that would let us calibrate it.
4. ⚠️ **And the honest counterweight, stated rather than buried: mainstream brokers do NOT accept stop orders overnight at all.** ⇒ **That is a real, external, conservative precedent. I am not following it, because we are the trader rather than a broker protecting retail clients — but Kyle should know it exists and that I considered it.**

⛔⛔ **THE ONE CONDITION: FIX THE SPREAD GATE'S FAIL-OPEN BEFORE LEANING FURTHER INTO OVERNIGHT.** It is the only defect that is **specifically worse overnight**, it lets **35%** of the universe in unchecked, and it makes entry easier exactly when we can see least. ✅ **It is Phase C below and it is small.**

---

## 4. ⭐ THE PLAN — FIVE PHASES, IN DEPENDENCY ORDER

### **PHASE A — INSTRUMENT. Ships first, changes nothing.**
Record on every close: **how old the order book was**, and **which kind of price the mark was** (mid or last).
✅ **Cannot be wrong under any later decision. Unblocks two of the three things we currently cannot measure.** *(Langston's ruling: split each step at the intent seam; instrumentation is intent-independent.)*

### **PHASE B — GIVE THE FILL THE CEILING THE ENTRY ALREADY HAS.** *(the largest defect)*
The close fetches the same snapshot through the same function and never checks its age.
⛔ **NOT PRE-JUDGED: refusing a stale book at close is NOT obviously right — `order-placer` carries the deliberate opposite rule, *"a close MUST still exit (never a stuck position)."*** ⇒ **The real question is what a close DOES when the book is cold: substitute loudly, widen, or wait. That is a risk call and it is Kyle's.**

### **PHASE C — CLOSE THE SPREAD GATE'S FAIL-OPEN.** *(the overnight condition)*
Absent data must not pass a gate. **Either the gate fails closed, or absent data is a stated, counted admission decision — not a sentinel nobody knew about.**

### **PHASE D — A PLAUSIBILITY GATE AT INGEST.** *(the event, and its siblings)*
⭐ **This is how Kyle's *"ignore that event"* gets implemented — CAUSALLY, not by clock.** A tick whose move from the last good value is implausible does not become the mark; the previous good value holds and the event is counted.
✅ **It catches 20:15 AND the other three session boundaries AND any mid-session glitch, with nobody enumerating them.** ⛔ **A time filter would catch only 20:15 and hide the rest.**
⚠️ **Needs a false-positive budget — a gate that suppresses a real crash is worse than the defect.**

### **PHASE E — DECIDE WHICH PRICE EACH JOB READS.** *(Kyle's)*
Exit trigger · fill · ranking. **Last, because it should be decided on clean data.**

---

## 5. ⚠️ WHAT IS STILL UNKNOWN, STATED PLAINLY

1. ⛔ **Why the event lags the boundary by fifteen minutes.** The capture will say.
2. ⛔ **Whether a partly-formed bar understates volatility** — and volatility sets stop and target distances. **Unmeasured.**
3. ⛔⛔ **Langston's question, and it is the largest open one: IS THE 20:15 WINDOW A SECOND REGIME RATHER THAN AN ANOMALY?** **Three separate headline figures today collapsed entirely into it.** ⇒ **If it is a regime, excluding it from every measurement is not cleaning the data — it is declining to measure a third of our xStock trades.**
4. ⚠️ **Every claim here that current behaviour is UNINTENDED is uncertified** until the decided-intent index exists. **The measurements are certified; the verdicts on them are not.**
