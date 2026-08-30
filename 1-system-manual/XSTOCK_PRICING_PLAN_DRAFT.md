# xSTOCK PRICING — **THE MECHANISM INVENTORY, WITH EIGHT UNCOSTED ROWS**

> ⛔⛔ **THIS IS NOT "THE PLAN" AND MUST NOT BE CALLED ONE — Langston's ruling, 2026-08-30.** It is a **stable mechanism inventory** in which **eight of thirteen rows have no measured consequence.** ★ **Naming it accurately is the point: Kyle asked whether these are the only items, and the honest answer is *"no — and here are the eight I have not costed,"* NOT *"I cannot know."***

**Owner CC-C · Kyle-directed · Draft 1 → 2 → 3, all 2026-08-30**

> ✅ **PROCESS COMPLETE: two reader rounds + LANGSTON HAS RULED (2026-08-30).** His verdict: **not fit as “the plan” — but my REASON was wrong, and that matters more than the verdict.** See the reframing directly below. **Every figure here is `RULED ON REPORTED FACT`; his ruling rests on none of them, and he re-derived four mechanisms himself.**
> ⭐⭐ **LANGSTON'S RULING ON THE ROUND RECORD, AND IT INVERTS WHAT I READ INTO IT.** I asked whether the surface is unbounded. **It is not, and the record proves the opposite.**
> **NOT ONE ROUND FOUND A NEW MECHANISM.** R1 found an unmeasured comparison between two reads **already in the inventory**; R2 found an **un-disaggregated population** (rule 29); R3 found **two consequences of mechanisms already on the list**, one of them my own audit §1.2. ⇒ ⭐ **The mechanism inventory has been STABLE for three drafts. Only the magnitude ordering moves.**
⇒ ⛔ **SO THE NEXT ROUND'S HEADLINE IS ALREADY SITTING IN THE EIGHT UNCOSTED ROWS BELOW — AND THERE ARE EIGHT, NOT AN UNKNOWN NUMBER.** ★ **That converts *"how many more rounds?"* into *"do the eight measurements"* — hours, not rounds.**
⛔ **AND THE SELF-DIAGNOSIS I GOT RIGHT AND THEN DID NOT APPLY: I stop at provenance and do not measure. I said so about `#962` — and left eight other rows in the same table in exactly that state.**

---

## 0. ⛔⛔ WHAT ACTUALLY MATTERS — AND IT IS NOT WHAT DRAFT 2 LED WITH

**Two defects, both OUTSIDE the 00:15 burst, both firing on ordinary days.**

### ⛔ **A. THE EXIT FILL WALKS A BOOK OF UNBOUNDED AGE. THE ENTRY REFUSES ONE OLDER THAN 15 SECONDS — THROUGH THE SAME FUNCTION.** `#961`
- **ENTRY** (`active-execution-engine.ts:251-253`): `getDepthSnapshot` → **`assessWarmth`** → refuses if `ageMs > 15 s`.
- **CLOSE** (`:1996-2003`): fetches the **same object**, resolves the **same config**, takes only the penalty from it — **`assessWarmth` is never called; `ageMs` is computed and discarded.** ✅ *Control: `assessWarmth` has exactly one call site repo-wide.*
- **MEASURED, 243 xStock closes: p50 2.32 s · p90 11.5 s · p99 245 s · max 1,554.9 s. ⛔ 22 of 243 (9.1%) filled on a book older than the entry gate's own limit.**
- ⛔ **WORST: `OMC/USD` `stop_hit` booked at 82.13 on a bid captured 25.9 MINUTES earlier — while the trigger that fired it was bound by a ceiling capped at 300 s.**
⇒ ⭐ **One read has a ceiling, fails closed and is instrumented. The other has none.**

### ⛔ **B. A RESTING MAKER SELL IS DECLARED FILLED WHEN THE *MIDPOINT* REACHES THE LIMIT — 59% OF THEM BOOK AT A PRICE NO BID EVER REACHED.** `#962`
`:1507-1508` compares the limit against `currentPrice`, which on xStock is the **mid**; the log even says the mid *"traded through"* the limit. `:1991` books **at** the limit, `:1993` sets slippage to **zero by construction**.
**MEASURED with the MAXIMUM bid in a ±15 s window — maximally generous: 52 of 88 xStock maker exits (59%) booked at a limit no bid ever reached.** Mean shortfall **4.842%**, max **26.559%**. `MOH` booked **219.84** against **bid 198.23 / ask 207.00 — above even the ask.**
⛔⛔ **AND THIS IS MY OWN AUDIT §1.2, WHICH I DEMOTED THIS MORNING.** I proved nobody ever decided which side it reads — and stopped there. **I never measured the consequence.** *"An undocumented convention"* and *"59% of maker exits book fills that never happened"* are the same fact at two levels of diligence.

### ⚠️ **AND DRAFT 2's HEADLINE IS DEMOTED — ITS NUMBER WAS THE BURST**
Draft 2 led with a 14.038% trigger-vs-fill gap. **Disaggregated: burst rows n=5 at 25.21%; NON-burst xStock n=4 at 0.068% — a THIRD of the crypto control's 0.209%.** ⇒ **Outside the burst there is essentially no divergence; the magnitude belongs to `#943`, not the exit path.** Also: **5 of those 9 rows are maker exits that never touch the fill path draft 2 named**, and the `+17.16%` figure has **n=4, not 9** — **rule 29 failed in my own headline table.**
✅ **WHAT SURVIVES AND IS SEPARABLE: the TRANSMISSION claim — the divergence is *why* a bad print books a GAIN rather than a loss.** That is a row, not a headline.

---

## 1. ⛔ WHAT IS WRONG — REVISED AGAIN

| # | what is wrong | status |
|---|---|---|
| ⛔ **W1** | **The exit fill has no staleness ceiling; the entry does** (§0A). `#961` | **certain · largest · not the burst** |
| ⛔ **W2** | **The maker exit fills on a midpoint and books the limit at zero slippage** (§0B). `#962` | **certain · not the burst** |
| **W3** | **Every exit *trigger* reads a midpoint**, both classes, both lanes. | ✅ **COSTED (§1b): +0.060% vs the bid on ordinary days; the 3.9% was the burst** |
| **W4** | **A venue re-quote at each session boundary reaches the decision path.** | event certain · ⛔ **CONSEQUENCE UNMEASURED** *("treated as tradeable" is unearned — `#958`'s own words)* |
| **W5** | **The 4-second sampling is a TRADING defect** — it is σ's denominator (ceiling capped 300 s), it feeds both fills, and it drives the spread and depth gates. ⚠️ *The fail-open bias clause is `#958`'s measurement, cited not re-asserted: 43.6% of marks lost, 0% on static names → 50% on the fastest.* | certain |
| **W6** | **The ranking price is a 15-minute aggregated bar close, not the ticker `last`** — and `last` is selected at `scanner.ts:641` and consumed nowhere. ⚠️ **Draft 2 called this "four definitions, not three." Wrong: a dead column is not a definition. There are still THREE live ones; what changed is WHICH the third is.** | mechanism certain · ⛔ **CONSEQUENCE UNMEASURED** |
| **W7** | **An xStock instance of the `#951` laundering on the exit path** — `:1239` preserves the honest age, `:1244` republishes it as observed-now, and it passes the venue gate. | mechanism certain · ⛔ **CONSEQUENCE UNMEASURED** |
| **W8** | ⚠️ **NARROWED: not "we cannot tell which session."** The session flag **is** archived and read by nothing; the precise defect is that **the exit path cannot see it, because the in-memory tick carries only `{price, tsMs}`.** | mechanism certain · ⛔ **CONSEQUENCE UNMEASURED** |
| ➕ **W9** | **The fill's forensic columns are NULL BY CONSTRUCTION on xStock** — `bookMid`/`bookAgeMs` (crypto 15/78 populated, **xStock 0/26**), so the age W1 needs is not in `closed_trades` and must be reconstructed. | certain |
| ➕ **W10** | **The spread gate reads a quote up to 30 MINUTES old and FAILS OPEN** — absent data emits a sentinel that passes. ⇒ ⛔ **Absent price data makes ENTRY easier while making EXIT impossible.** | mechanism certain · ⛔ **CONSEQUENCE UNMEASURED — and Langston flags it as risk-moving with no number** |
| ➕ **W11** | **The newest 15-minute bar can be a one-minute stub** — partial buckets are emitted by design, and `source_bar_count`, which would say so, is written and read by nothing. | mechanism certain · ⛔ **CONSEQUENCE UNMEASURED** |
| ➕ **W12** | **The mark silently changes definition** — mid **or** `last`, untagged; **and σ bounds a MID's staleness using the dispersion of `last`.** | ✅ **COSTED (§1b): fallback fired 0 times in 373,450 rows across both sessions — LATENT, not live** |
| ➕ **W13** | **The feed's subscription list is frozen at process boot** while the universe refreshes daily. `#960` | mechanism certain, **consequence untested** |

⛔ **`#953` — REMOVAL RE-ARGUED, BECAUSE DRAFT 2's REASONING WAS PARTLY FALSE AND SKIPPED MY OWN RULE.** It is genuinely off the xStock price path *(it reads a REST endpoint carrying zero xStock pairs)*, and that is the **only** valid ground. ⛔ **"Phase-21 gated" was FALSE for two of its four defects — the paper branch books a random haircut and writes the legacy table in BOTH modes.** ⛔ **And I struck it without doing what `#954` — my own entry, two above it — requires: enumerate what the row was the sole record of.** ✅ **CARRIED: the kill-switch blindness, and the amendment to the audit's §9.2 clearance (*"naming a population is not proving it complete"*), both now belong to `B-LEGACY-LIVE-EXIT-PATH`.** ⚠️ **And that issue currently has two homes under two batch names across three documents — fix before it is worked.**

---

---

## 1b. ✅ **COSTING THE EIGHT — MEASUREMENTS TAKEN 2026-08-30. TWO DONE, AND BOTH COLLAPSE.**

### ✅ **W12 — CONSEQUENCE MEASURED AT ZERO. DOWNGRADED.**
The mark is `(bid+ask)/2` when both sides exist, **else `last`** — untagged, so a reader cannot tell which it holds. **How often does the fallback fire?**
| window | rows | fell back to `last` |
|---|---|---|
| regular hours, 2026-08-28 14:00-15:00 UTC | **333,535** | **0** |
| ⭐ **overnight, 2026-08-28 00:30-01:30 UTC** | **39,915** | **0** |
⇒ ✅ **ZERO IN BOTH SESSIONS. The untagged fallback has not fired.** ⛔ **DOWNGRADED to a LATENT HAZARD: the mechanism is real and the ambiguity would be undetectable if it did fire — but it is not a live defect and must not be costed as one.**
*(The overnight window was run deliberately: a collapsed side is the case that would trigger it, and stubs concentrate outside regular hours. One window would not have settled it.)*

### ⛔⛔ **W3 — CONSEQUENCE MEASURED, AND IT IS THE BURST FOR THE THIRD TIME. THIS ONE BEARS ON `F-G-2`.**
**The question W3 exists to answer: how far is the MID the trigger reads from the BID we would actually sell into?**
| cohort | n | mean mid-above-bid | max |
|---|---|---|---|
| ⛔ **xStock, 00:15 burst** | 3 | **+7.782%** | **72.86%** |
| ✅ **xStock, ORDINARY** | 3 | **+0.060%** | 0.21% |
| ✅ **crypto (control)** | 11 | **+0.114%** | 0.87% |
⇒ ⭐⭐ **OUTSIDE THE BURST THE TRIGGER'S MID SITS 0.060% ABOVE THE BID — BELOW THE CRYPTO CONTROL, AND EFFECTIVELY NOTHING.** The 3.921% pooled figure was the burst.

⛔⛔ **AND THIS IS LOAD-BEARING ON `F-G-2`, WHOSE CRYPTO LEG LANGSTON RELEASED.** F-G-2's core change is moving the exit trigger from the midpoint to the transactable side. ⇒ **On this evidence that change moves the trigger by ~0.06% on xStock and ~0.11% on crypto on ordinary days.** ⚠️ **It does NOT refute F-G-2 — `OBJ-0` measures OUTCOMES, not price gaps, and a tenth of a percent at the stop can still flip a trade. But it bounds the expected effect, and F-G-2's case has never carried that bound.**
⚠️ **n=3 / n=3 / n=11. Far too small to decide anything. Stated as a direction with its population, not as a result.** ⇒ **DISPATCHED TO LANGSTON, because it touches a leg he released.**

⭐⭐ **AND THE PATTERN IS NOW THREE FOR THREE: `#959`'s 14.038%, W3's 3.921%, and the overnight P&L's +157.52 ALL COLLAPSED INTO THE 00:15 BURST WHEN DISAGGREGATED.** ⇒ ⛔ **STANDING RULE FOR THE REMAINING SIX: every consequence figure gets the burst split BEFORE it is written down, not after someone asks.**

## 2. ⭐ WHAT THE OUTSIDE WORLD ALREADY DOES *(neither round faulted this)*
**(a) Validate the tick at ingest and hold the last good value.** **(b) A separate mark price for risk — Kraken publish it themselves.** **(c) Mainstream brokers do not run stops overnight** — recorded, **not** recommended; Kyle's call is to keep trading all four sessions.

---

## 3. ✅ THE PLAN — REORDERED BY ROUND 2

### ⭐ **STEP 1 — GIVE THE FILL THE CEILING THE ENTRY ALREADY HAS.** *(W1)*
**The fix is calling a function that already exists, three lines from where the snapshot is fetched.** Blocked on nothing.
⛔ **NOT PRE-JUDGED: refusing a stale book at close is NOT obviously right** — `order-placer.ts:110-115` carries the deliberate opposite rule, *"a close MUST still exit (never a stuck position)."* ⇒ **The question is what a close does when the book is cold: substitute loudly, widen, or wait. That is a risk call.**

### ⭐ **STEP 2 — DECIDE WHAT A RESTING SELL FILLS ON.** *(W2)*
Today: the **mid**. A sell needs a **buyer**, so the honest comparator is the **bid**.
⛔ **THE FIRST QUESTION IS PROVENANCE, NOT CODE:** `BATCH_65` ruled that the two lanes keep **different fill conventions on purpose.** **Search that record before calling this wrong.** ⚠️ **And note the trap: a parity check comparing trigger to fill on the maker leg agrees with itself by construction (`:1993` sets slippage to zero), so half the population would pass by definition.**

### **STEP 3 — SEE THE TICKS.** *(makes W4 earnable)*
✅ **Capture re-armed DAILY** after round 1 caught it pointed at **Monday — where the cohort has ZERO events in 65.**
⭐ **And it is not the only instrument: the `ohlc` channel is already archived and carries `trade_count`.** Specimen: `INTU` booked a target at **374.96** while the venue printed **3 trades, all at 350.51**.
⛔ **DRAFT 2's SECOND SPECIMEN IS WITHDRAWN — `AMZN` points the OTHER WAY** (a resting sell 2.6% *below* a bar with 787 prints is maximally transactable). **The test is sign-blind, and the control already conceded it flags 52.7% of crypto exits.**

### **STEP 4 — A PLAUSIBILITY GATE AT INGEST.** *(W4)*
⛔ **It protects exactly ONE consumer — the exit trigger.** The fills, σ, the scanner gates and the ranking channel all bypass it.
⛔ **AND DRAFT 2's INSTRUCTION WAS BACKWARDS: *"must not drop the archive row — that is the forensic trace."* FOR THE BURST THE ARCHIVE ROW DOES NOT EXIST** — the frame that set the mark was dropped by the 4-second throttle. **The trace it was told to preserve was already destroyed.**
⚠️ **AND THE RAMP FAILURE MODE IS WITHDRAWN:** `WEN`'s archive shows a **one-step ask jump of +128%** (`7.57 / 19.05`, mid **13.31** exactly) — **the specimen cited to prove a per-tick gate is blind is the one it catches.** ✅ **Four failure modes survive, including that refreshing the held timestamp re-creates `#951` as the fix for W4.**

### **STEP 5 — SUBSCRIBE TO THE BOOK, STORE IT, CONSUME NOTHING.** *(W2-feed)*
⚠️ **MOVED LAST.** Storing it means a new table beside one already writing **930-958 MB/day** into a **26 GB monthly partition**, with **no order-book table anywhere in the schema** and a batch writer whose time-based drop is **coherent for a snapshot and corrupting for a delta.** ⭐ **And round 2's point: the restraint argument against *consuming* a ladder applies equally to *storing* it.**

### **STEP 6 — DECIDE THE NUMBER FOR EACH JOB.** *(W3, W6)*
⛔ **STILL NOT STARTABLE, AND DRAFT 2's CLAIM THAT IT WAS IS WITHDRAWN AS A HEDGE** — it named a new blocker and declared it already cleared in the same breath. **The inventory is still incomplete: no maker booked price, no 30-minute spread read, no partial-bar composition (W10, W11).**

---


---

## 3b. ⭐⭐ STEP 0 — **INSTRUMENTATION, AND IT SHIPS NOW** *(Langston's ruling, 2026-08-30)*

> **THE INDEX QUESTION, ANSWERED: `B-DECIDED-INTENT-INDEX` does NOT become step 0. SPLIT EACH STEP AT THE INTENT SEAM.**
> - **A DEFECT claim is intent-independent** — *"an age is computed and discarded"*, *"a mid clears a sell"* — **and those are certain.**
> - **A BEHAVIOUR CHANGE is not.** It waits for the index, **or** for a decided-intent citation at the site.

✅ **SO STEP 0 IS: RECORD `bookAgeMs` AND `bookMid` ON THE CLOSE.**
**It commits code, decides nothing, and CANNOT BE WRONG UNDER ANY INTENT VERDICT.** ⭐ **And it kills a real dependency: `W9` says those columns are NULL BY CONSTRUCTION on xStock, which is why `W1`'s 22-of-243 is RECONSTRUCTED rather than read.** ⇒ **Ship it and the largest finding stops resting on a reconstruction.**

---

## 3c. ⛔⛔ AND A DECIDED-INTENT MARKER I MISSED — WHICH INVALIDATES MY SEARCH, NOT MY FINDING

**`active-execution-engine.ts:1501-1505`, three lines above the comparator `#962` is about, verbatim:**
> *"**D1 (Langston-approved INTENTIONAL divergence from entry semantics)**: entries route a marketable order to the stored-taker check; the exit RESTS the marketable price and requires a LATER venue tick at/through the limit — same-tick place-and-fill is prohibited as an optimistic touch-fill. **Do not "fix" this into entry-parity.**"*

✅ **`#962` SURVIVES IT: D1 rules on TIMING (no same-tick touch-fill), NOT on SIDE.**
⛔ **BUT ANY STEP-2 CHANGE THAT COLLAPSES D1 INTO ENTRY-PARITY RE-OPENS A DECIDED QUESTION — and the comment says so in terms.**

⛔⛔ **THE METHOD POINT IS BIGGER THAN THE CITATION, AND IT IS MINE.** I searched `P19-B7.2c`'s **scope, pre-audit and completion report**, found **0** hits for `bid`/`ask`/`midpoint`/`which side` against a **positive control of 26 for `maker`** — and concluded *"nobody decided which side it reads."*
⇒ ★★ **MY CONTROL PROVED THE SEARCH WORKED ON THAT CORPUS. IT DID NOT PROVE THE CORPUS COULD CONTAIN THE ANSWER — AND IT STRUCTURALLY CANNOT, BECAUSE THE DECISION LIVES IN A CODE COMMENT.** **That is leg-1 instrument reach: I reported a silence as an absence from a corpus that had zero opportunity to speak.** *(Exactly the failure `#956` exists to record — committed while writing the entry about it.)*

⇒ ⭐ **A SCOPE-DEFINING REQUIREMENT FOR `#956` / `B-DECIDED-INTENT-INDEX`, folded in: ITS CORPUS MUST INCLUDE IN-CODE DECIDED-INTENT MARKERS, OR IT CERTIFIES NOTHING.** **Completion reports, scope files AND code headers/comments — the `D1` marker is the worked example.**

---

## 3d. ⚠️ THE FIVE HE WOULD RE-DERIVE BEFORE ANYONE BUILDS — carried verbatim, not paraphrased

1. ⛔ **`W1`'s distribution is RECONSTRUCTED, not read** (`W9`). **State the join key and the coverage denominator.**
2. ⛔⛔ **`W2`'s 52/88 IS AN UPPER BOUND, AND THE INSTRUMENT'S BIAS RUNS THE SAME DIRECTION AS THE FINDING.** *"Max bid in ±15 s"* is measured **through the throttled snap stream that `W5` says loses 43.6% of frames — and a DROPPED BID MAKES "no bid reached it" MORE LIKELY.** ➕ **And crypto REST computes a mid too, so crypto maker exits are an UNMEASURED ADJACENT POPULATION for `#962`.**
3. **`W6`'s *"`last` consumed nowhere"* is an ASSERTED ABSENCE** (`#453`) — **needs a whole-tree census stated as one.**
4. **`W10` moves risk and has no number.**
5. ⭐ **`W13` is a candidate CONFOUNDER for `W1`'s age distribution, not merely an independent row** — a frozen subscription list would itself produce stale books.

⛔ **AND A HOUSEKEEPING GATE HE SET: fix `#953`'s TWO HOMES under TWO batch names across THREE documents BEFORE it is worked. That is the `#641` shape and I named it myself.**

## 4. ⛔⛔ THE BIGGEST RISK — DRAFT 2 NAMED THE WRONG ONE

⛔ **DRAFT 2 SAID: step 3's gate would hide the evidence for the trigger/fill divergence. REFUTED BY MY OWN POPULATION** — strip the burst, which is exactly what the gate does, and non-burst divergence is **0.068%** against a crypto control of 0.209%. **There is no residual for the gate to hide.**

✅ **THE REAL RISK IS THE MIRROR OF IT, AND IT IS WORSE:** the ingest gate touches **neither W1 nor W2** — **9.1% and 59% of closes, on ordinary days, outside the burst entirely.** ⇒ ⛔ **Ship the gate first and the burst stops producing the visible absurdities that made those two findable, while both remain — immediately before Phase 25 calibrates on this population.** ✅ **That is why W1 and W2 are now steps 1 and 2 and the gate is step 4.**

⛔ **AND THE STRUCTURAL RISK STANDS, UNCHANGED AND UNANSWERED:** every *"this is unintended"* verdict here is **uncertified** until `B-DECIDED-INTENT-INDEX` lands, and steps 1, 2 and 4 commit code. **Each step states, before it ships, which record it searched for a prior decision.** ⭐ **Point it at the maker leg first — `BATCH_65` already rules on fill conventions.**

---

## 5. ⚠️ WHAT THIS PLAN STILL DOES NOT DO
1. It does not stop us trading any session. **Kyle's decision.**
2. It does not exclude 00:15. **The gate is causal.**
3. It does not consume the order book.
4. It does not fix the sampling — it fixes what the sampling feeds, one consumer at a time.
5. ⛔ **It does not settle W13's consequence, and does not pretend to.**
