# xSTOCK PRICING — THE DECISION PATH

**Created 2026-08-30 · Owner CC-C · Kyle-directed**

> **Kyle's ask, verbatim:** *"What do we need to do in order to make those decisions, and then to build the plan to implement those decisions? That's what I wanna understand. From where we are now, what do we need to do in order to make those decisions?"*
>
> ⛔ **THIS DOCUMENT CONTAINS NO FINDINGS AND NO FIXES.** It is the **route**: the open questions, what evidence each one needs, who decides it, and in what order — so that at the end there is a plan instead of another investigation.
> ★ **It exists because the investigation produced four separate-sounding problems and no obvious order. They are not four problems. They are THREE QUESTIONS, and two of them are not ours to answer.**

---

## 0. ⭐ WHY IT FELT LIKE WE KEPT MOVING THE TARGET

Four things were reported and they sounded like rival diagnoses. **They are not rivals — they sit at four different points on one path, and all four are true at once:**

| # | what was found | where it sits |
|---|---|---|
| 1 | We subscribe to `ticker` + `ohlc` and **never** to `book` for xStock | **the FEED** — what arrives |
| 2 | Every exit decision reads a **midpoint** | **the NUMBER** — what we compute |
| 3 | The archive is a **4-second sample**; 43.6% of marks never land | **the RECORD** — what we can later measure |
| 4 | Kraken **re-quotes the universe at 20:00 ET** on a different basis | **the TIMING** — when a price means what |

⇒ ⭐ **Nothing was retracted between these. They are four layers of one pipe.** The confusion was mine for reporting each as it arrived without the frame.

---

## 1. ⛔ THE THREE QUESTIONS

### Q1 — **WHICH FEED?** Do we subscribe to the xStock order book?
**Today:** crypto gets a real 10-level ladder. xStock gets one ticker row — **which is real, executable top-of-book, not a fabrication** — and nothing deeper.
**Why it is open:** a ratified 2026-06-02 decision already named *"`bid_qty`/`ask_qty` **+ the book ladder**"* as the binding liquidity constraint. **We built the first half.**
**DECIDED BY:** CC-C + Langston. **Not a risk decision** — it adds data, changes no behaviour on its own.
**⇒ MUST GO FIRST**, because Q2 cannot be answered about data we do not have.

### Q2 — **WHICH NUMBER?** For each job, which price?
**Today, xStock, from one venue frame:** the exit trigger reads an in-memory **midpoint**; the entry fill walks a ≤4-second-old **ask**; the scanner ranks on **last**. **Nothing states whether that is design or drift.**
**DECIDED BY:** ⛔ **KYLE.** It changes which trades close and at what price.
**⇒ DEPENDS ON Q1** (a real ladder changes what "the transactable side" even means) **AND ON Q3** (the right number may differ by session).

### Q3 — **WHEN?** May the exit path act during every session?
**Today:** all four Kraken sessions are treated identically. **In two of them the venue states prices come from models and index futures, not a live market.**
**DECIDED BY:** ⛔ **KYLE.** Risk envelope.
**⇒ INDEPENDENT OF Q1. Can be decided in parallel.**

---

## 2. ✅ WHAT EACH DECISION NEEDS BEFORE IT CAN BE MADE

| # | evidence needed | status | who | when |
|---|---|---|---|---|
| **Q1** | Does the `book` channel deliver a real ladder **on a live market**? | ⏳ **Subscription accepted (probed). Ladder observed once, May. Capture armed for the reopen.** | CC-C | **tonight** |
| **Q1** | What would consuming 20 levels do to the gates calibrated on top-of-book? | ⛔ **NOT STARTED** — the liquidity score is calibrated `$10K→40 … $1M→60` on top-of-book; summing levels shifts every name ~+10 | CC-C + Langston | after the capture |
| **Q2** | `OBJ-0`'s read-out: does a transactable-side trigger produce better outcomes than a midpoint? | ⛔ **HAS NOT RUN.** Pre-registered with a kill criterion; the n-floor is still unset | CC-C, then **Kyle** | after Q1 |
| **Q2** | What is each of the three numbers actually FOR? | ⛔ **NOT ANSWERED** — `#957`, filed as a review | CC-C + Langston | can start now |
| **Q3** | How much of our P&L is made in each of the four sessions? | ⛔ **NOT MEASURED** — and it is **the** number Kyle needs | CC-C | **can start now** |
| **Q3** | What are the alternatives to acting on an overnight price, and what does each cost? | ⛔ **NOT DRAFTED** | CC-C → **Kyle** | after the P&L split |

⭐ **THE TWO THINGS THAT CAN START IMMEDIATELY AND ARE NOT WAITING ON ANYTHING: the per-session P&L split (Q3) and `#957`'s "what is each number for" (Q2).**

---

## 3. ⛔ THE ORDER, AND WHY IT IS THIS ORDER

```
   Q1 FEED ──────────────► Q2 NUMBER ──────► THE PLAN
   (data)                  (Kyle)              │
                              ▲                │
   Q3 TIMING ─────────────────┘────────────────┘
   (Kyle, parallel)
```

1. **Q1 first** — you cannot choose a number from data you do not have.
2. **Q3 in parallel** — it needs no new feed, only a measurement we can take today.
3. **Q2 last** — it is the only one that changes trading behaviour, and it should be decided knowing both what data exists and which sessions we will act in.
4. **THEN the plan** — and only then, because a plan written before Q1 would be a plan for a feed we might not adopt.

⛔ **WHAT THIS ORDER DELIBERATELY REFUSES: fixing the 20:00 event by excluding that minute.** Kyle refused that shape when we did not understand the cause, **and it is a worse idea now that we do** — the cause is a four-hour session with a different pricing basis, not a bad minute. **Excluding 00:15 would leave the other 3h 59m untouched and hide the question.**
✅ *Kyle, 2026-08-30, releasing the earlier refusal: "I was saying that initially because we didn't know what the issue was… Now it seems like we understand what is happening so we can make the decision that is best for our system."* ⇒ **the decision is OPEN; what stays closed is deciding it by threshold instead of by session.**

---

## 4. ✅ WHAT IS ALREADY SETTLED — so it is not re-opened by accident

| settled | evidence |
|---|---|
| There is **exactly one source** per class; xStock has **no REST alternative in existence** | proven twice |
| The xStock quote we store is **Kraken's real executable top-of-book** | ratified decision, 2026-06-02 |
| The wide overnight spreads are **genuine symmetric widening** | n=77,060, control n=5.28M |
| Every exit decision reads a **midpoint** | 23 of 23 stamped closes |
| The 20:00 ET re-quote is **documented venue behaviour**, not a fault | Kraken's own docs |
| The archive is a **sample**, losing 43.6% of marks, biased toward fast movers | measured externally |
| A completed exit's triggering price **is recoverable** | `closed_trades.exit_decision_price` |

---

## 5. ⛔ THE HONEST LIMITS ON THIS PATH

1. **Q2's instrument has never produced a read-out** and its n-floor is unset. **Until it does, any statement about which side is better is a hypothesis** — including mine.
2. **The four-session table is a VENUE fact and venues change.** It carries a DST shift and a US-holiday calendar, and Kraken is extending a 24/7 subset. **Re-read it at the source before a decision rests on it.**
3. **We cannot currently tell which session a price came from at the point where it matters** — the session tag reaches the archive and never the decision path, and it is a boolean against a four-way distinction. **Whatever Q3 decides, plumbing the session into the exit path is work, not a flag read.**
4. ⛔ **Everything in this document that says current behaviour is unintended is UNCERTIFIED** until `B-DECIDED-INTENT-INDEX` lands — Langston's standing ruling. **The measurements are certified; the verdicts on them are not.**
