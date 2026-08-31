# B-DISAGREEMENT-FINDER — SCOPE

> ⛔⛔ **DO NOT READ THE PAIRS BELOW AS FINDINGS. THIS BATCH CLOSED ON A NEGATIVE RESULT 2026-08-31 AND ITS DETECTOR WAS WRONG MOST OF THE TIME.**
> **Langston’s verdicts: the 20-pair sample scored 15 DETECTOR ERROR / 3 SUBSTANTIVE / 2 TRIVIAL. The 9-pair census scored 7 DETECTOR ERROR / 2 SUBSTANTIVE / 0 TRIVIAL** — and it still fails at **5 of 9** under the most generous repair available, so the frame fails without leaning on the instrument bug.
> ★ **ONLY TWO PAIRS IN THIS ENTIRE BATCH WERE REAL: `#732` (fixed — a stale guard in `MISTAKE_PATTERNS.md`) and `#651` (filed as `#974`, owner Infra Claude).** Everything else here is a candidate that did not survive review.
> ⛔ **AND THE AXIS ITSELF WAS WRONG:** this asks *"do two copies DISAGREE?"* while the costly failure is **every copy AGREEING and all of them lagging** — consensus staleness, which a disagreement-detector is blind to by construction.
> ✅ **NOTHING WAS INSTALLED.** No detector code exists in this repository, nothing is scheduled, and the live governance checker was never modified — `OBJ-5` is recorded NOT DONE. **These files are a RECORD of a batch that stopped at its gate, nothing more.**
> → **The verdicts, the reasoning and the follow-up ranking are in `Claude Comms and Packages/Batch Completion/B_DISAGREEMENT_FINDER_COMPLETION_REPORT.md`.**

---


change-class: non_architecture

**Owner:** CC-A · **Opened:** 2026-08-30 · **Directive:** Kyle, 2026-08-30 — *"Go ahead and scope that as the disagreement finder."*
**Placement:** `PHASE_19_PLAN.md` §governance queue, **immediately after `B-INSTRUMENTS-OVER-RULES`** — it consumes that batch's multi-homing measurement, and Langston's Step-1 ruling made the measurement the gate: *"If it's large, THEN we scope single-home + ID-citation."* **It came back large.**
**Gate:** Langston — ✅ **STEP 1 APPROVED (r2, 2026-08-30), FOUR CONDITIONS + TWO CORRECTIONS, all applied below and marked `[L-r2]`.**

> ⛔⛔ **THIS IS A DETECTOR, NOT A CONSOLIDATOR. IT DELETES NOTHING, MERGES NOTHING, AND DECIDES NOTHING.**
> ★ **THE SCOPE CHANGED SHAPE BECAUSE KYLE KILLED THE OBVIOUS VERSION.** Langston's ruling anticipated a *single-home consolidation* batch. Kyle's objection, verbatim: *"How do we make sure that condensing down these decision numbers doesn't overwrite something that was similar but different from another decision … we end up losing real decisions that were made that were slightly different than the ones that we kept."*
> ⇒ ⛔ **HE IS RIGHT, AND IT IS MEASURED BELOW AT 96%. CONSOLIDATION IS OFF THE TABLE.**

---

## 1. WHY — THE MEASUREMENT, AND THE ERROR IT CAUGHT IN MY OWN REPORTING

**Population:** **1,948 tracked `.md` at the PINNED MEASUREMENT REF `e4425782` — `[L-r2 C-2]`.** ⛔ **PINNED BECAUSE A MOVING OBJECT CANNOT BE A GATE: 1,946 at my HEAD vs 1,948 at Langston’s review ref, drifted in under a day.** ★ **AND THE COUNTS ARE STABLE ACROSS THAT DRIFT — 556/151/405/142/9 reproduce IDENTICALLY at the pinned ref**, which is the strongest thing the re-run could have shown. **Method:** an ID in a DEFINITIONAL position (a heading, or a bolded lead) counts as a *home*; anything else is a citation. **Lexical and exact — zero semantic matching, per Langston's ruling that prose has no compiler and therefore no constructible identity relation.**

| | |
|---|---|
| distinct IDs with a findable home | **556** |
| ⛔ **multi-homed** | **151 = 27%** |
| ✅ **POSITIVE CONTROL — single-homed** | **405** *(a detector that matched everything would show zero)* |
| mean homes per ID | **1.35** |
| mean files CITING a given ID | **8.6** |
| IDs cited somewhere with **no home found at all** | ⚠️ **228** |

### ⛔⛔ KYLE'S RISK, QUANTIFIED — AND IT IS THE DOMINANT CASE, NOT THE EDGE CASE
**Of the 125 multi-homed IDs whose two homes carry enough text to compare: 120 — 96% — share LESS THAN HALF their distinctive terms.** *(26 too short to judge, reported rather than dropped.)*
⇒ ★★ **A MERGE-ON-SIMILARITY PASS WOULD BE CHOOSING, UNAIDED, BETWEEN TWO MATERIALLY DIFFERENT TEXTS — 96% OF THE TIME.** **That is the loss Kyle described, as the normal case.**
⛔ **And it would use the one method we have measured as unreliable: FOUR increasingly clever matchers failed in one day (`#946`). Using similarity to decide what to DELETE is the worst available application of it.**

### ★ AND CHECKING HIS WORRY CORRECTED MY OWN HEADLINE — TWO PHENOMENA ARE MIXED IN THE 27%

| | | |
|---|---|---|
| **(a) TRUE MULTI-HOMING** — `1-system-manual/RUNNING_ISSUES.md` is one of the homes | **142 = 94%** | the same decision, stated twice, drifted |
| **(b) NAMESPACE COLLISION** — the register is NOT a home | **9 = 6%** | ⛔ **not duplication at all** |

⛔ **(b) IS THE ONE THAT WOULD HAVE DESTROYED DATA.** Per-document LOCAL numbered lists collide with global issue numbers. **Measured example: `#10` is *"TELEMETRY — per-asset-class telemetry buckets"* in `B79_0n_UMBRELLA…` and *"#10 (BLOCKER): kraken-websocket-adapter ↔ live-pricing-adapter"* in `BATCH_78_SCOPE.md`. Term overlap 0.00. Two unrelated things wearing one number.**
★ **Median ID number: 92 in the collisions, 415 in true multi-homing** — the collisions are early-era, from before the global register grew past the local lists. ⇒ **a bounded, historical class.**
⚠️ **I REPORTED 27% AS DUPLICATION BEFORE RUNNING THIS SPLIT. It is 94% duplication and 6% something that must never be touched.** ★ **The correction came from testing Kyle's objection, not from re-reading my own work — `CONDUCT.md` §6b, working exactly as written.**

### THE PRECEDENT THAT PROVES THE CLASS IS EXPENSIVE
**`#641` — `latchTriggerPrice`: THIRTEEN-PLUS SITES, ALL ONE BRANCH TOO WIDE, ALL COPIED FROM ONE SOURCE COMMENT.** Found **BY HAND**, by Langston, and it needed its own batch (`B-LATCH-DOC-DIVERGENCE`, owner CC-B). ⇒ **the disagreement class is real, costly and currently detected only by a human noticing.**

---

## 2. MANDATORY 1.a — ARCHITECTURAL READ

**Read:** `SYSTEM_IMPACT_MAP.md` §*Session-Instruction Loading Estate* `:985`; `scripts/governance-checker/` (`checker.mjs`, `poller.mjs`, `config.mjs`); `SYSTEM_MANUAL.md` — **judged NOT APPLICABLE, stated explicitly: no architecture, strategy, regime, filter, pipeline or math is touched.**

⛔⛔ **THE ENFORCEMENT POINT EXISTS AND IS PROVEN LIVE — THIS IS THE WHOLE REASON THIS BATCH IS BUILDABLE AND THE DELETED GUARD (`#756`) WAS NOT.**
⛔⛔ **`[L-r2 C-1]` MY FIRST CITATION NAMED THE WRONG CLONE — AN ADJACENT OBJECT, IN A SCOPE ABOUT ADJACENT OBJECTS.** I cited `/home/deploy/dawntrader/scripts/governance-checker/`; **that is the APP DEPLOY clone.** **RE-DERIVED AT THE UNIT MYSELF, not taken from his summary:** `WorkingDirectory=/opt/governance-checker/DawnTraderV3`, `ExecStart=/usr/bin/node scripts/governance-checker/poller.mjs` — relative, so it runs from **the checker’s OWN clone**, confirmed present and on `migration/aws-supabase`.
★★ **AND THE FACT IS STRONGER THAN I CLAIMED: the unit carries `ExecStartPre git fetch` AND `merge --ff-only origin/migration/aws-supabase`, so THE CLONE SELF-ADVANCES.** ⇒ **`#449`’s *"there is no deploy path to the checker at all"* is RETIRED ON EVIDENCE, not assertion.** Timer last fired 19:25:56 UTC.
✅ **AND IT IS PROVEN TO REACH A HUMAN: it raised `a25799c8` — *"Missing required governance doc: phase_history for B-CLAUDEMD-SLIM"* — against MY OWN batch on 2026-08-29, which I then fixed.** ⇒ **detector → alert → owner is a path that has demonstrably carried a real finding to a real fix.**
⚠️ **`#449` ONCE RECORDED *"THERE IS NO DEPLOY PATH TO THE CHECKER AT ALL"* (2026-07-10). That is STALE — the timers above refute it. Checked deliberately, because building onto a checker with no deploy path is precisely the guard mistake.**

> ⚠⚠ **`[L-r2 C-1 RIDER]` BOTH `ExecStartPre` LINES ARE `-`-PREFIXED — FAILURES ARE IGNORED.** **A failed fetch means the checker silently grades the LAST SUCCESSFULLY MERGED STATE, and reports it with full confidence.** ★ **My new check INHERITS that.**
> ✅ **CONDITION, ADOPTED: THE REPORT PRINTS THE REF IT GRADED AT**, so a stale run is legible instead of confident. ⇒ **DISPOSITION (§9.4): the underlying silent-fetch tolerance is NOT mine to fix here — `HOME: B-CHECKER-FETCH-VISIBILITY`, owner = the checker owner, placed in the governance queue after this batch.**

---

## 3. MANDATORY 1.b — PROVENANCE READ

**Corpora searched, named:** `RUNNING_ISSUES.md` · `BATCH_CATALOG.md` · `PHASE_19_PLAN.md` · completion reports · `SYSTEM_IMPACT_MAP.md` · `scripts/governance-checker/README.md`. **Searched by capability and by symbol.**

**TIER 1 — behaviour this batch changes: `scripts/governance-checker/`.**
**Original intent:** grade a batch's governance doc-set against its declared change-class and raise a system alert on a miss. **DISPOSITION (2) — RELEVANT, NEEDS EXTENDING TO TODAY'S INTENT.** ★ **It already answers *"is a required document ABSENT?"* This batch adds *"do two documents DISAGREE?"* — the same harness, the same alert path, a different question.** ⛔ **It is NOT a new artifact, and that is deliberate: a new artifact is what `#756` was.**

**TIER 2 — read or cited, one line each:**
- **`#641`** — the hand-found `latchTriggerPrice` divergence; homed to `B-LATCH-DOC-DIVERGENCE`, CC-B. **DISPOSITION (1). ⛔ NOT this batch's to fix — this batch would only have made it findable.**
- **`#452`** — *a true quotation with a false gloss produces a confident wrong ruling carrying the reviewer's authority.* **DISPOSITION (1).** ★ **The reason the output must SHOW BOTH TEXTS and never summarise them: a gloss of a disagreement is itself a paraphrase, and would reintroduce the defect inside the tool built to find it.**
- **`#339` NO-TRIM** — nothing is deleted or made unfindable. **DISPOSITION (1), and it BINDS OBJ-3.**

---

## 4. OBJECTIVES

### **OBJ-1 — THE DETECTOR: EXACT IDs ONLY, NEVER SIMILARITY**
Walk the tracked `.md` corpus; for every ID in a definitional position, record its homes. **Emit every ID with ≥2 homes.**
⛔⛔ **IT MUST NEVER COMPUTE "ARE THESE THE SAME?" — that relation does not exist over prose and constructing it IS the paraphrase problem (Langston, 2026-08-30).**
**VERIFICATION `[L-r2 C-2]`: reproduces at the PINNED REF `e4425782` — 556 homed · 151 multi-homed · 405 single-homed.** ⛔ **THE GATE IS THE PINNED REF, NEVER IMPLEMENTATION-TIME HEAD.** A second pass at HEAD is a **DRIFT REPORT ONLY** and may never fail the batch — otherwise falsifier 1 fires on a non-defect and *"do not retune until it agrees"* deadlocks. ★ **405 is the positive control: a detector matching everything returns zero.**

### **OBJ-2 — SEPARATE THE TWO PHENOMENA BEFORE ANY HUMAN SEES THEM**
Classify each multi-homed ID as **(a) true multi-homing** (the register is a home) or **(b) namespace collision** (it is not).
⛔ **They must never appear in one list: (a) wants reconciling, (b) must NEVER be touched.**
**VERIFICATION:** the split reproduces **142 / 9**, and **`#10` lands in (b)** — the measured case whose two texts share **0.00** of their terms.

### **OBJ-3 — THE OUTPUT IS A DISAGREEMENT REPORT. IT DECIDES NOTHING.**

⛔⛔ **`[L-r2 #4]` THREE AMENDMENTS, ALL OF THEM §452 APPLIED TO THE TOOL ITSELF:**
1. ⛔ **DO NOT SORT BY OVERLAP. ORDERING IS A GLOSS** — ascending-overlap silently asserts *"lowest overlap = most important"*, **the exact claim falsifier 2 says overlap cannot carry. Sort INERT: by ID number or by path.**
2. ⛔ **TEXT EXTENT IS DEFINED AND TRUNCATION IS FORBIDDEN:** from the home heading to **the next same-or-higher-level heading, VERBATIM.** **If a home is enormous, EMIT IT AND SAY SO.** ★ *"A clipped quotation is a gloss made with scissors"* — and `#339` binds.
3. ✅ **The overlap FIGURE is allowed** — it is a measurement with a stated method, not a paraphrase — **provided the method prints beside it and it NEVER orders or filters the report.**

⛔⛔ **`[L-r2 #2]` THE OUTPUT MUST NOT READ AS A CENSUS.** **The header AND the alert text state the instrument’s reach VERBATIM: *ID-carrying propositions only; ID-less copied prose is outside this detector.*** ★ **Otherwise a clean run reads as *"our records agree"* — the `#546` absent-as-valid shape.**
For each (a) pair: **both texts, in full, side by side, with their file paths and the overlap figure.** ⛔ **NO recommendation, NO merge, NO summary of either text** (`#452`). **Three outcomes, and a HUMAN or LANGSTON picks:**
| | outcome | action |
|---|---|---|
| 1 | substantively the same | one becomes the home; the other becomes a POINTER — **the superseded text is ARCHIVED, never deleted (`#339`)** |
| 2 | ⛔ **they differ** | **A FINDING, NOT A MERGE** — either one is stale, or two decisions share a number. **Both need a person; both are worth knowing.** |
| 3 | cannot tell | ⛔ **LEAVE IT ENTIRELY ALONE.** ★ **A duplicate costs a confusing search. A lost decision costs the decision.** |

### **OBJ-4 — ⛔⛔ THE SAFETY CHECK MUST BE PROVEN TO FIRE, OR IT IS NOT A SAFETY CHECK**
**Before the detector runs on the real corpus, feed it a pair KNOWN to be two different decisions sharing a number — `#10`'s telemetry-vs-blocker pair — and prove it lands in (b) and is never offered for reconciliation.**
⛔⛔ **`[L-r2]` IT NEEDS ITS SECOND ARM, AND THE REASON IS THAT MY VERSION HAD A DEGENERATE PASS: A CLASSIFIER THAT PUTS *EVERYTHING* IN (b) ALSO PASSES IT** — and (b) is the never-touch bucket, **so the degenerate case reads as MAXIMALLY SAFE while detecting nothing.**
✅ **THE PRE-RUN GATE IS A DISCRIMINATION PAIR: a known-(b) that must land in (b) AND a known-(a) that must land in (a) — and FLIP the register-is-a-home predicate to show BOTH move.** Same principle as OBJ-1’s 405.
★ **THIS IS THE MUTATION TEST, AND IT IS NON-NEGOTIABLE: a guard that has never been shown to fire reads as a guard that passed.** *(Three checks that could not fail were mistaken for checks that passed in one session — `#730` and the two beside it.)*

### **OBJ-5 — ATTACH TO THE LIVE CHECKER**
A new check inside `scripts/governance-checker/`, on the existing timer, raising a system alert through the existing dispatcher. ⛔ **NO new service, NO new schedule, NO new alert channel.**
**VERIFICATION:** the check appears in a real timer run, and a deliberately-planted divergence produces a real alert with a real owner.

⛔⛔ **`[L-r2 #1]` (c) DOES NOT FAIL — BUT IT IS INCOMPLETE IN TWO PLACES WITH MEASURED HISTORY HERE. BOTH ARE STEP-2 ITEMS:**
- **(i) OWNER DERIVATION.** The existing alert routes to a **batch** owner. **A corpus-wide divergence between `RUNNING_ISSUES` and a 2026-05 completion report has NO BATCH and therefore NO OWNER.** OBJ-5 says *"a real owner"* and never says how one is derived. ⛔ **An ownerless alert ROTS — that is `#447`, 249/249.**
- **(ii) FIRST-RUN VOLUME.** **142 pairs on a 30-minute timer, against dedupe semantics where ack is NON-TERMINAL, is 142 rows re-raising forever.** ✅ **THE FIRST RUN EMITS *ONE* ALERT POINTING AT THE REPORT, AND THE CADENCE IS NOT THE 30-MINUTE TIMER.**

### **OBJ-6 — GOVERNANCE** *(change-class matrix, `d8d4999bb`)*
`SYSTEM_IMPACT_MAP.md` marked **REQUIRED BY JUDGEMENT** though `judged` for this class — the checker is a documented component and this changes what it does.

---

## 5. ⛔ WHAT THIS BATCH EXPLICITLY DOES NOT DO

1. ⛔ **It does not consolidate, merge or delete anything.** Kyle's objection is measured at 96% and is dispositive.
2. ⛔ **It does not touch namespace collisions.** Bounded, historical, and the class most likely to lose real content.
3. ⛔ **It does not fix `#641`** — that is `B-LATCH-DOC-DIVERGENCE`, CC-B's.
4. ⛔⛔ **IT CANNOT SEE THE `#641` CLASS AT ALL, AND THIS IS THE HONEST CEILING ON THE WHOLE BATCH.** `#641` is **copied prose carrying NO ID** — thirteen sites of duplicated comment text. **The detector follows IDs; text with no ID is invisible to it.** ⇒ **it covers ID-carrying propositions ONLY, and the largest measured divergence we have ever found would NOT have been caught by it.** ★ **Stated here rather than discovered at Step 7.**
✅ **`[L-r2 #2]` NOT FATAL, AND LANGSTON IS EXACT ABOUT WHY: I compared a MEASURED 142 against a class represented by ONE hand-found instance. `#641` is dramatic; it is n=1 and the ID-less class HAS NEVER BEEN SIZED.** ⛔ **Concluding *"aimed at the wrong half"* from that would be inflating an UNMEASURED magnitude — the exact failure my own standing rules warn about.** ⇒ **DISPOSITION (§9.4): sizing the ID-less class is a REAL SEPARATE QUESTION and gets its own home, not a caveat — `HOME: B-IDLESS-DIVERGENCE-SIZING`, owner CC-A, placed after this batch.**
5. ⛔ **It does not address the 228 cited-but-unhomed IDs.** Real, measured, and a separate question — *is a thing cited everywhere and defined nowhere?*

---

## 5.5 ✅ `[L-r2 #3]` FALSIFIER 2 IS JUDGED AT STEP 2 ON A SAMPLE, BEFORE ANY CODE — **PRE-REGISTERED HERE, NOW**

★★ **THE CHEAPEST KILL POINT WE HAVE, AND IT IS PRE-REGISTERED SO IT CANNOT BE MOVED AFTER THE DATA IS SEEN.**

| | condition |
|---|---|
| **sample** | **20 pairs, drawn RANDOMLY from the 142, WITH THE METHOD STATED** — not chosen |
| **criterion** | **the trivial-vs-substantive test is WRITTEN DOWN BEFORE ANY PAIR IS READ** |
| **presentation** | **BOTH TEXTS IN FULL** for every sampled pair — the same output rule the tool will have |
| **judge** | ⛔⛔ **LANGSTON JUDGES, NOT THE OVERLAP NUMBER.** ★ *Falsifier 2 exists BECAUSE overlap ≠ importance, so using overlap to decide triviality is CIRCULAR.* |
| **threshold, stated by him before seeing a single pair** | **≤2 substantive ⇒ the corpus disagrees HARMLESSLY — REPORT IT AND STOP.** **≥5 ⇒ proceed.** **3–4 ⇒ one more sample of 20.** |

---

## 6. WHAT WOULD FALSIFY THIS BATCH

1. **If the (a)/(b) split does not reproduce**, the classifier is unstable and nothing built on it is trustworthy. **Say so; do not retune until it agrees.**
2. **If the disagreements turn out to be overwhelmingly trivial** — formatting, tense, a date — then the corpus disagrees with itself harmlessly and this is not worth an alert. ⇒ **report that and STOP.** ★ **The 96% figure measures term overlap, NOT importance, and those are different things.**
3. **If OBJ-4's mutation test cannot be made to fire**, the batch does not ship. No exceptions.
