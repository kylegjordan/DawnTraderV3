# B-DISAGREEMENT-FINDER — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**Owner:** CC-A · **Opened:** 2026-08-30 · **Scope:** `B_DISAGREEMENT_FINDER_SCOPE.md` @ `1ceeaf0b2` (Step-1 APPROVED r2, four conditions + two corrections)
**For:** Langston. **The AUDIT comes first; the PLAN falls out of it. Every plan item back-references its finding.**

---

## ⛔ PREVIOUSLY-STATED-VS-NOW

> **PREVIOUSLY STATED: 1,946 markdown files. NOW: 1,948. REASON: the corpus drifted between my HEAD and Langston's review ref inside a day; the population is now PINNED to `e4425782` per his condition C-2, and the derived counts (556/151/405/142/9) reproduce IDENTICALLY across that drift.**
> **PREVIOUSLY STATED: the enforcement point is `/home/deploy/dawntrader/scripts/governance-checker/`. NOW: `/opt/governance-checker/DawnTraderV3`. REASON: my first citation named the APP DEPLOY clone; the systemd unit's `WorkingDirectory` names the checker's own self-advancing clone (his C-1). Re-derived at the unit by me.**
> **PREVIOUSLY STATED (in my Kyle-facing report): "27% multi-homing" as a single duplication figure. NOW: 94% true multi-homing + 6% namespace collision. REASON: testing Kyle's objection split one number into two phenomena with opposite correct treatments.**

---

# PART A — ⛔⛔ THE PRE-REGISTERED KILL TEST (Langston condition 3)

> ★★ **THIS SECTION IS COMMITTED BEFORE A SINGLE SAMPLED PAIR HAS BEEN READ. That is the whole point of it, and the commit timestamp is the evidence.**
> ⛔ **Falsifier 2 says: the 96% figure measures TERM OVERLAP, not IMPORTANCE. If the disagreements are overwhelmingly trivial, the corpus disagrees with itself harmlessly and NO ALERT SHOULD SHIP.** **This is the cheapest kill point the batch has and it runs before any code exists.**

## A.1 THE CRITERION — WRITTEN FIRST, AND IT IS NOT MINE TO APPLY

**Each sampled pair is classified into exactly one of three buckets.**

| bucket | test |
|---|---|
| ⛔ **SUBSTANTIVE** | **The two homes would lead a reader to a DIFFERENT ACTION or a DIFFERENT FACT.** Concretely: a different **disposition** (open vs closed vs withdrawn), a different **owner**, a different **status**, a different **mechanism or cause**, a different **number** that is load-bearing, a different **home/placement**, or a direct **contradiction** about what was decided. |
| ✅ **TRIVIAL** | **Same claim, differing only in expression.** Wording, formatting, emphasis, tense, length, punctuation, ordering; one being a shorter restatement of the other; added context that does not change the claim, the action or the fact. |
| ⚠️ **DETECTOR ERROR** | **One or both "homes" is not a home** — it is a citation that happens to sit in a heading or a bolded lead, or the two IDs are not the same proposition at all. ★ **This bucket exists so a CLASSIFIER failure cannot be scored as a corpus finding.** |

⛔⛔ **LANGSTON APPLIES THIS, NOT ME, AND NOT THE OVERLAP NUMBER.** ★ **Falsifier 2 exists precisely because overlap ≠ importance — so using overlap to decide triviality would be circular, and my own reading of my own corpus is the belief the process boundary exists to remove.**

## A.2 THE THRESHOLD — HIS, STATED BEFORE HE SAW A SINGLE PAIR

| result | outcome |
|---|---|
| **≤ 2 substantive** of 20 | ⛔ **THE CORPUS DISAGREES HARMLESSLY. REPORT IT AND STOP.** The batch does not ship. |
| **≥ 5 substantive** | ✅ **PROCEED.** |
| **3–4 substantive** | **One more sample of 20**, same method. |

⚠️ **`DETECTOR ERROR` pairs are reported and are NOT counted toward either side** — they are a finding about the classifier, and they feed OBJ-1/OBJ-4, not this threshold. **If they dominate the sample, that is its own result and I will say so rather than resampling until the number looks right.**

## A.3 THE SAMPLING METHOD — STATED BEFORE DRAWING

- **Frame:** the **142** `(a)`-classified IDs at the pinned ref `e4425782` — true multi-homing only. ⛔ **The 9 namespace collisions are EXCLUDED: they are the never-touch class and scoring them would inflate the substantive count with pairs nobody proposes to reconcile.**
- **Draw:** 20 without replacement, **`random.Random(20260830)`** — seed stated so the draw is reproducible and cannot be re-rolled.
- **Presentation:** **BOTH texts IN FULL**, home heading to the next same-or-higher-level heading, **verbatim, no truncation** — the same output rule the tool itself will have. **If a home is enormous, it is emitted whole and flagged.**
- **Order:** **by ID number.** ⛔ **NOT by overlap** — ordering is a gloss, and ordering by overlap would assert the very claim falsifier 2 says overlap cannot carry.
- **The overlap figure is printed** beside each pair **with its method**, and **orders nothing and filters nothing.**

⇒ **PART B (the audit proper) and PART C (the plan) are written AFTER this test returns. If the test kills the batch, there is no PART C, and that is a successful outcome for this document.**
