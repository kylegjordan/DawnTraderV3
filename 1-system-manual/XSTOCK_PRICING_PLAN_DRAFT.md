# xSTOCK PRICING — THE PLAN (DRAFT 1, NOT YET REVIEWED)

**Created 2026-08-30 · Owner CC-C · Kyle-directed**

> ⛔⛔ **DRAFT. NOT FOR ACTION. Kyle's instruction: *"work on it with the second reader, work on it with Langston after you and the second reader have converged, and then come back to me for what the plan is."* This has had NEITHER. It goes to a fresh reader next, then Langston, then Kyle.**

---

## 0. ⛔ TWO FRAMINGS I GOT WRONG, CORRECTED FIRST

**Q1 was ambiguous and Kyle called it out.** The question is **not** *"are we using the order book or another source?"* and **not** *"are we collecting it but not feeding it in?"*
> ✅ **THE FACT: WE DO NOT COLLECT IT AT ALL.** We open one connection and subscribe to exactly two things — **1-minute bars** and the **ticker** (a quote summary carrying bid, ask, last and sizes). **We have never opened a book subscription.** It is not arriving and being ignored; it was never requested. *(The channel exists and Kraken accepts a subscription to it — probed 2026-08-30.)*

**Q3 was framed as "which sessions may we trade in." That is NOT Kyle's question and he corrected it.** His actual position, adopted:
> ✅ **KEEP TRADING ALL FOUR SESSIONS IN PAPER.** Different sessions have different volumes and patterns and that is expected and already observed.
> ⛔ **THE PROBLEM IS THE *MOMENT*, NOT THE SESSION: the 20:15 ET event must be avoided — and any equivalent event at the other session transitions.**
> ✅ **THE TEST IS: is the price we are given a price we could actually transact at?** If yes, trade the session. **If we cannot answer that, that is the thing to research and settle — not a reason to stop trading.**
⇒ ⭐ **THIS REPLACES Q3 ENTIRELY. The new Q3 is: *how do we identify a moment whose price is not transactable, and what do we do at that moment?*** *(Kyle: "if there are any similar events in the other transitions from one session to another, then we avoid those too.")*

---

## 1. ⭐ WHAT THE OUTSIDE WORLD ALREADY DOES — Kyle-directed, and it settles the shape

> *"Let's not look at this in isolation and try and reinvent the wheel. If there's something out there that's already proven to work."*

**THREE established practices, none of ours, all directly on point:**

**(a) ⭐ VALIDATE THE TICK AT INGEST, AND HOLD THE LAST GOOD VALUE.** The standard description of robust index construction: *"detect implausible outliers and either remove the offending constituent, cap its influence, or **ignore a fresh bad print and keep the last valid value until inputs normalize.**"* And in quoting engines: *"if the underlying trades at $10 but a ticker suddenly prints at $100, a robust system **flags it as a data error** rather than adjusting quotes violently."*
⇒ ⭐⭐ **THIS IS EXACTLY OUR CASE, AND IT IS CAUSAL RATHER THAN TEMPORAL — it catches the 20:15 event AND any equivalent at the other three boundaries, without anyone having to enumerate them.** *(Which is what Kyle asked for.)*

**(b) ⭐ A SEPARATE "MARK" PRICE FOR RISK DECISIONS, DISTINCT FROM THE RAW LAST/MID — AND KRAKEN THEMSELVES PUBLISH THIS.** Their own futures documentation is titled *"Last price vs. Mark price"*: the mark is deliberately robust so that a bad print on the trade feed cannot trigger a liquidation. **We are re-deriving a concept our own venue already ships on another product.**

**(c) ⚠️ MAINSTREAM BROKERS DO NOT RUN STOPS OVERNIGHT AT ALL.** *"Market orders, stop orders, stop-limit orders, and trailing stops are **not accepted during overnight hours** to protect market integrity and manage liquidity risks"*; such orders **queue for the next regular session**.
⛔ **RECORDED AS THE CONSERVATIVE END OF THE SPECTRUM, NOT AS A RECOMMENDATION — Kyle's position is to keep trading all four sessions, and we are the trader here rather than a broker protecting retail clients.** ★ **But it establishes that the risk we found is recognised industry-wide, not something we imagined.**

**Exchange-level precedent for (a):** Eurex rejects an order whose price is outside a validation band with `STANDARD PRICE VALIDATION FAILED`; FX/CFD venues use a deviation window against a reference price and re-quote outside it. **Price-plausibility gating is ordinary infrastructure, not an invention.**

---

## 2. ⛔ WHAT IS ACTUALLY WRONG — the complete list, and nothing else

⚠️ **Kyle: *"we need to make sure that those are the only questions you need to answer."*** **This is the closed list as of 2026-08-30. Each line is a MEASUREMENT, not a judgement.**

| # | what is wrong | evidence | status |
|---|---|---|---|
| **W1** | **We never receive the order book for xStock.** Depth, spread and "the side we would sell into" all come from one top-of-book row. | zero `book` subscriptions repo-wide, positive control passes | **certain** |
| **W2** | **Every exit decision reads a midpoint** — both asset classes, both lanes. | 23 of 23 stamped closes | **certain** |
| **W3** | **A venue re-quote at each session boundary is treated as a tradeable price.** | 3 days, same minute; 3 exits inside one 688 ms burst on prices the archive does not contain | **certain** |
| **W4** | **Our price history is a 4-second sample, and it loses most where price moves fastest.** | 43.6% of distinct marks absent; static name 0%, fastest 50% | **certain** |
| **W5** | **We cannot tell which session a price came from at the point of decision.** The tag reaches the archive only, and it is a boolean against a four-way distinction. | 5 occurrences repo-wide, all archive-side | **certain** |
| **W6** | **A live route prices a real market sell with `Math.random()` and writes a table the kill switch cannot read.** | `#953` | **certain, Phase-21 gated** |

⛔ **NOT ON THE LIST, DELIBERATELY:** *"the bid is too low"* (**disproved** — symmetric widening, n=77,060 vs a 5.28 M control) · *"the wide spreads are a defect"* (**they are documented venue behaviour**) · *"we should stop trading overnight"* (**Kyle's call, and his answer is no**).

---

## 3. ✅ THE PLAN — FOUR STEPS, IN DEPENDENCY ORDER

### STEP 1 — **SEE THE TICKS.** *(fixes nothing; makes W3 and W4 diagnosable)*
Capture raw frames across a session boundary, recording `msg.type`, which the archiver never reads. **Armed and instrument-proven; fires at the reopen.**
**ANSWERS:** do the boundary frames carry a marker distinguishing them from ordinary quotes? ⇒ **decides whether W3's fix can key on the venue's own signal or must be inferred.**
**OWNER:** CC-C. **BLOCKS:** step 3.

### STEP 2 — **SUBSCRIBE TO THE BOOK.** *(fixes W1)*
Open the `book` channel for xStock alongside the existing two. **Store it; consume nothing yet.**
⛔ **CONSUMING IT IS A SEPARATE DECISION AND MUST NOT RIDE ALONG** — the liquidity score is calibrated `$10K→40 … $1M→60` on **top-of-book**, so summing 20 levels shifts every name ≈ **+10 points** and re-creates the saturation defect that module was forked to remove.
**ANSWERS:** what the real ladder looks like, continuously, rather than from one May capture.
**OWNER:** CC-C + Langston. **BLOCKS:** any depth-based change, and W2's fill side.

### STEP 3 — **A PLAUSIBILITY GATE AT INGEST.** *(fixes W3 — and W5 by making it unnecessary)*
⭐ **This is practice (a) from §1, and it is the step that does the work Kyle asked for.**
A tick whose move from the last good value is implausible for that instrument **does not become the mark**; the previous good value is held and the event is recorded and counted.
⭐⭐ **WHY THIS AND NOT A TIME FILTER: it is CAUSAL, not TEMPORAL.** It catches 20:15, **and every other boundary**, and any mid-session glitch, **without anyone enumerating them** — which is exactly what Kyle asked for. ⇒ **And it makes W5 moot: we no longer need to know the session, only whether the tick is credible.**
⛔ **THE OPEN DESIGN QUESTION, NOT PRE-JUDGED: what is "implausible"?** A fixed percentage is the naive answer and is the shape Kyle refused. **Candidates to evaluate: deviation against the last trade in the same frame · against a rolling volatility estimate · against the surviving side when one side moves alone.** ⚠️ **AND IT NEEDS A FALSE-POSITIVE BUDGET, because a gate that suppresses a real crash is worse than the defect.**
**OWNER:** CC-C, gate design reviewed by Langston, **threshold philosophy to Kyle.** **NEEDS:** step 1.

### STEP 4 — **DECIDE THE NUMBER FOR EACH JOB.** *(fixes W2)*
Name, per decision, which price it reads: **exit trigger · fill · ranking.** Today all three differ and nothing says whether that is design.
**NEEDS:** steps 2 and 3 — a trigger rule chosen on contaminated data would be measured against noise.
**OWNER:** ⛔ **KYLE**, on `OBJ-0`'s read-out.

**AND SEPARATELY, ON ITS OWN TRACK:** **W6** is Phase-21 go-live only, already placed at 21.1, and **must not be folded into this sequence** — it blocks live money, not paper trading.

---

## 4. ⚠️ WHAT THIS PLAN DOES NOT DO

1. ⛔ **It does not stop us trading any session.** Kyle's decision, adopted.
2. ⛔ **It does not exclude 00:15.** The gate is causal; a time filter would leave the other three boundaries and every mid-session glitch untouched.
3. ⛔ **It does not consume the order book.** Step 2 subscribes and stores. **Consuming it re-calibrates live gates and is its own batch.**
4. ⛔ **It does not fix the 4-second sampling (W4).** **Deliberate: W4 is a MEASUREMENT problem, not a trading one.** Once step 3 lands, the mark the engine acts on is validated, so the archive being a sample stops mattering for correctness — **it only limits what we can audit afterwards.** ⚠️ **If step 1 shows we cannot reconstruct events without it, this returns.**
5. ⛔ **It does not answer "is the machinery a refactor or a rip-out."** **That question was about the EXIT PATH and it is separate from this.** Answer stands: **large refactor, small rip-out** — and **this plan is a piece of it, not a replacement for it.**

---

## 5. ⛔ THE HONEST STATE OF THE EVIDENCE

- ✅ **W1-W6 are measurements with named populations and controls.**
- ⛔ **Every claim that current behaviour is UNINTENDED is uncertified** until `B-DECIDED-INTENT-INDEX` lands (Langston's standing ruling). **The numbers are good; the verdicts on them are not yet earned.**
- ⛔ **The per-session P&L split cannot decide anything yet** — 77% of the favourable number sits inside the contaminated window.
- ⛔ **`OBJ-0` has never produced a read-out** and its n-floor is unset. **Any statement about which side is better is a hypothesis, including mine.**
