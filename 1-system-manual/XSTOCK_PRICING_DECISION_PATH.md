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
**⇒ INDEPENDENT OF Q1** — but ⛔ **NOT independent of `3b.b`: its first evidence is taken (§2b) and it DISQUALIFIED ITSELF. 77% of the favourable number sits inside the contaminated window.** *(Corrected same-day by its own measurement.)*

---

## 2. ✅ WHAT EACH DECISION NEEDS BEFORE IT CAN BE MADE

| # | evidence needed | status | who | when |
|---|---|---|---|---|
| **Q1** | Does the `book` channel deliver a real ladder **on a live market**? | ⏳ **Subscription accepted (probed). Ladder observed once, May. Capture armed for the reopen.** | CC-C | **tonight** |
| **Q1** | What would consuming 20 levels do to the gates calibrated on top-of-book? | ⛔ **NOT STARTED** — the liquidity score is calibrated `$10K→40 … $1M→60` on top-of-book; summing levels shifts every name ~+10 | CC-C + Langston | after the capture |
| **Q2** | `OBJ-0`'s read-out: does a transactable-side trigger produce better outcomes than a midpoint? | ⛔ **HAS NOT RUN.** Pre-registered with a kill criterion; the n-floor is still unset | CC-C, then **Kyle** | after Q1 |
| **Q2** | What is each of the three numbers actually FOR? | ⛔ **NOT ANSWERED** — `#957`, filed as a review | CC-C + Langston | can start now |
| **Q3** | How much of our P&L is made in each of the four sessions? | ✅ **MEASURED 2026-08-30 — see §2b. It inverts the intuitive answer AND then disqualifies itself as a decision input.** | CC-C | ✅ **done** |
| **Q3** | ⛔ **A DE-CONTAMINATED per-session P&L** — the same split with the burst cohort identified and removed | ⛔ **BLOCKED ON `3b.b`** — nothing else can identify that cohort | CC-C | after 3b.b |
| **Q3** | What are the alternatives to acting on an overnight price, and what does each cost? | ⛔ **NOT DRAFTED** | CC-C → **Kyle** | after the de-contaminated split |

⭐ **UPDATE 2026-08-30: the per-session P&L split IS NOW DONE (§2b) — and its result moved Q3 BEHIND `3b.b` rather than beside it.** ⇒ ✅ **The one thing still startable immediately and waiting on nothing is `#957` — *what is each of the three numbers actually FOR?***

---

---

## 2b. ⭐⭐ Q3's FIRST EVIDENCE — **MEASURED 2026-08-30. IT INVERTS THE OBVIOUS ANSWER, AND THEN DISQUALIFIES ITSELF.**

**P&L by Kraken session, xStock closes, honest-P&L (`COALESCE(reconstructed_net_pnl, pnl)` — the same expression the kill switch uses), bounded to the post-2026-07-28 fee-denominator epoch so only one basis is in play:**

| session (ET) | trades | total P&L | avg | win % | stops |
|---|---|---|---|---|---|
| Pre-market 04:00-09:30 | 25 | **−67.50** | −2.70 | 40.0% | 15 |
| Market open 09:30-16:00 | 55 | **+10.78** | +0.20 | 45.5% | 29 |
| ⛔ After-hours 16:00-20:00 | 14 | **−83.84** | −5.99 | **21.4%** | 11 |
| ⭐ **Overnight 20:00-04:00** | **49** | **+157.52** | **+3.21** | **59.2%** | 25 |

⇒ ⭐⭐ **THE OVERNIGHT SESSION — THE ONE WHOSE PRICES KRAKEN SAYS COME FROM MODELS AND INDEX FUTURES — IS OUR BEST SESSION BY A DISTANCE. AFTER-HOURS, WHICH PRICES OFF A REAL EXTENDED-HOURS MARKET, IS OUR WORST.**
⛔ **HAD WE GONE STRAIGHT TO THE INTUITIVE FIX — *"stop evaluating exits overnight, the prices are model-based"* — WE WOULD HAVE CUT OUR MOST PROFITABLE SESSION.**

### ⛔⛔ AND THEN THE CONTROL THAT DISQUALIFIES IT AS A DECISION INPUT

**A false stop firing ABOVE entry books a WIN.** So the very defect under investigation **inflates** the bucket it lives in. Splitting overnight on the burst window:

| cohort | trades | total P&L | avg | win % |
|---|---|---|---|---|
| ⛔ **the 00:15 burst window** | **36** | **+121.87** | +3.39 | 61.1% |
| rest of overnight | **13** | **+35.65** | +2.74 | 53.8% |

⇒ ⛔⛔ **73% OF OVERNIGHT'S TRADES AND 77% OF ITS PROFIT SIT INSIDE THE CONTAMINATED WINDOW.** The favourable number is concentrated **precisely** where the defect is.
✅ **NOT PURELY AN ARTIFACT, HONESTLY STATED: strip the burst cohort and the remainder is still positive — but it is `n=13`, which is nowhere near decision-grade.**

⇒ ⛔ **THEREFORE: THE P&L SPLIT CANNOT DECIDE Q3 ON ITS OWN, AND I AM NOT PRESENTING IT AS IF IT COULD.** It needs the contaminated trades **identified and removed** — which is exactly `B-XSTOCK-FEED-SANITY`'s (3b.b) job. ⇒ ⭐ **Q3's dependency has changed: it is NOT independent of 3b.b after all.** *(Corrected in §3's ordering.)*

### ⚠️ AND A CONSEQUENCE LARGER THAN Q3, SURFACED HERE BECAUSE THIS MEASUREMENT IS WHERE IT BECAME VISIBLE

**If a material share of xStock exits fire on session-transition re-quotes, then our xStock paper results are SYSTEMATICALLY BIASED — and those results are the calibration substrate Phase 25 is built on.** ⛔ **This is not about a few trades; it is about whether the population we intend to calibrate from is representative.**
**DISPOSITION (§9.4 #2): added as an item to `B-XSTOCK-FEED-SANITY` (3b.b) — the batch that will identify the affected cohort is the only one that can size this.** ⛔ **NOT a new finding and NOT re-litigating Phase 25: it is a named question for the batch that can answer it.**

## 3. ⛔ THE ORDER, AND WHY IT IS THIS ORDER

```
   Q1 FEED ──────────────► Q2 NUMBER ──────► THE PLAN
   (data)                  (Kyle)              │
                              ▲                │
   3b.b ──► Q3 TIMING ────────┘────────────────┘
   (identify the       (Kyle)
    contaminated
    cohort FIRST)
```

1. **Q1 first** — you cannot choose a number from data you do not have.
2. **Q3 in parallel on the FEED, but NOT independent after all** — its first evidence is taken (§2b) and it **disqualified itself**: 77% of the favourable number sits inside the contaminated window. ⇒ ⛔ **Q3 now DEPENDS on 3b.b identifying that cohort.** *(Corrected 2026-08-30, same day, by its own measurement.)*
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
