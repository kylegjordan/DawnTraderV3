# B-MEASURE-GATE leg 2 — OBJ-6b RESULT: the tool-distribution gate

**Owner:** CC-A · 2026-08-31 · Step 3 · change-class `architecture`
**`r2` — the `r1` version's headline finding was REFUTED by a second reader and re-derived here as refuted. Nothing is silently swapped; the retraction is the record.**

---

# ⛔⛔ THE HEADLINE, AND IT IS A RETRACTION OF MY OWN

**`r1` reported the erroring windows to be Bash-enriched by +11.1 pp over other activity, and argued from that: *"the enrichment is what makes the result mean something."*** ⛔ **THAT IS WRONG. AGAINST A PROPER CONTROL THE ENRICHMENT IS `+0.3 pp`.**

★★ **AND THE BRANCH THAT ACTUALLY OBTAINS IS THE ONE MY OWN SCRIPT WAS WRITTEN TO DETECT, WHOSE TEXT I HAD ALREADY TYPED:**
> *"`wrong-object` is mostly Bash" is TRUE AND NEARLY VACUOUS — everything is mostly Bash, so the matcher is aimed at the right tool for a trivial reason. The population test PASSES but it is NOT evidence that a Bash-scoped hook catches the class.*

**The script printed the other branch because the comparison I fed it was contaminated, and I took the printout.**

---

## 1. ⛔ HOW THE `+11.1 pp` WAS MANUFACTURED — TWO CONFOUNDS, BOTH MEASURED

**THE CONTROL THAT SETTLES IT: windows of the SAME SHAPE (60 min, ending at a commit) in the SAME ERA, around commits carrying NO mistake trailer at all.**

| window population, era-gated at `2026-08-20T14:52:55` | n calls | Bash |
|---|---|---|
| **`wrong-object`** (88 commits) | 4,110 | **89.5%** |
| other-slug `MISTAKE` (85) | 3,981 | 88.1% |
| ⭐ **NO-trailer commits (496)** | 7,512 | **89.3%** |
| ALL era activity | 7,927 | 89.4% |

⇒ ⛔ **ENRICHMENT vs no-trailer commits in the same era: `+0.3 pp`. There is no effect.**

**CONFOUND (i) — PERIOD, and it is provable at the object.** Three of the six sampled transcripts contribute **ZERO** calls to the era:

| transcript | span | era calls |
|---|---|---|
| `4dfcc10e` · `0fe1c46a` · `66dbb030` | → 2026-08-31 | 5,715 · 181 · 2,031 |
| ⛔ `f9ed24c3` · `3ce652e6` · `7f66d970` | **all end 2026-07-24** | **0 · 0 · 0** |

**The first `wrong-object` commit is 2026-08-20.** ⇒ **my "non-window baseline" was largely May–July activity compared against August windows. I measured a PERIOD, not an ERROR.**

⛔⛔ **THIS IS EXACTLY THE DEFECT LANGSTON CORRECTED IN THIS BATCH'S OWN `[R1-3]` MEASUREMENT ONE WEEK AGO — *"a control from a different population than the measurement is not a control."* SAME ERROR, SAME BATCH, IN THE OBJECTIVE BUILT TO CATCH IT.**

**CONFOUND (ii) — WINDOW SHAPE.** **Every window ENDS AT A COMMIT, and committing IS Bash** (`git add` / `commit` / `push`). **Any** window terminating at a commit is Bash-enriched whether or not an error occurred — which is precisely what the 89.3% no-trailer row shows. **My window definition guaranteed the finding.**

⚠️ **`r1` also compared the windows against a baseline that CONTAINED them.** I caught and corrected that one myself (+9.9 → +11.1). ★ **Correcting the small confound while the two large ones stood is the more instructive failure: a visible arithmetic fix reads as diligence and can leave the design error untouched.**

---

## 2. THE POPULATION — reproduces, with a declaration `r1` did not make

| | |
|---|---|
| ref | `origin/migration/aws-supabase` @ `a758ce6f3` |
| commits walked, `--no-merges` | 9,831 |
| **`%b` (body only)** | **189 trailers · 44 slugs · `wrong-object` 90** |
| **`%B` (subject + body)** | **190 trailers · 44 slugs · `wrong-object` 91** |

⛔ **THE FIELD CHOICE MOVES THE TOTAL, AND `r1` DID NOT DECLARE WHICH IT USED.** One trailer lives in a commit **subject** line. **Neither field is wrong; an undeclared one is** — a reader re-deriving with `%B` gets different numbers and cannot tell whether they have found an error. **Declared: `%b`.**

⛔⛔ **AND `r1` SAID "90 wrong-object COMMITS". IT IS 90 TRAILERS ON 87 COMMITS** — three commits carry two each. **Trailers and commits are two different objects and I named the wrong one, in the objective about naming the wrong object.**

⚠️ **THE `MISTAKE: none` EXCLUSION IS EFFECTIVELY A NO-OP, AND `r1` GAVE IT A TABLE ROW.** The single literal occurrence is `0690fa25d`'s *"MISTAKE: none new."* — **no `[batch]`, no dash, so no well-formed matcher ever admitted it.** My permissive regex caught and excluded it. ⇒ **the exclusion protected nothing; presenting it as material overstated the denominator's fragility.** *(The underlying lesson from `[r4]` stands: state your exclusions. This one was stated and was empty.)*

---

## 3. ⛔ THE COVERAGE CHECK CARRIES NO INFORMATION — THE THIRD LAYER OF ONE ERROR

`r1` replaced a corpus-**HULL** test with a **per-commit** test and said so proudly. **Measured: all 88 windows are covered by exactly the same four intervals. There is ONE distinct covering-set.**

> `windows by number of covering intervals: {4: 88}` · `distinct covering-SETS: 1`

⛔⛔ **A TEST THAT RETURNS THE IDENTICAL ANSWER FOR EVERY MEMBER OF THE POPULATION CANNOT DISCRIMINATE. The per-commit test was the hull test again at finer granularity** — those four transcripts each span the whole `wrong-object` era, so an interval test against them returns *covered* for any commit in that month whether or not a single event occurred in the hour.

✅ **COVERAGE IS NEVERTHELESS REAL, ON EVIDENCE THAT DOES DISCRIMINATE: every window contains actual `tool_use` EVENTS — 4,110 calls across 88 windows, minimum 5, median 93.** ⇒ **the conclusion survives; the check that `r1` offered for it does not.**

⚠️ **AND A REACH LIMIT `r1` MISSED: 64 of 88 windows contain activity from two or more transcripts**, so for most commits the objects do **not** identify which session produced the error.

---

## 4. INSTRUMENT 1 — commit-body attribution *(unchanged from `r1`, and it was never the disputed part)*

| bucket | n | share |
|---|---|---|
| BASH-only signals | 42 | 46.7% |
| non-Bash-only | 4 | 4.4% |
| both (ambiguous) | 4 | 4.4% |
| ⛔ **UNATTRIBUTED — instrument SILENT** | **40** | **44.4%** |

**On what it can attribute: 42 of 46 = 91% Bash.** ⚠️ **Biased in a known direction — a shell command is quotable and gets quoted; *"I asserted it from memory"* often is not.**

---

## 5. ✅ THE VERDICT — THE GATE PASSES ON THE LETTER, AND ONLY ON THE LETTER

**Langston's gate: *"if the population is not predominantly Bash, the matcher is mis-aimed."*** ✅ **It IS predominantly Bash — 89.5% of tool calls in erroring windows, 91% of attributable commit-body signals.** ⇒ ✅ **OBJ-6c AND OBJ-6d ARE CLEARED TO BUILD.**

⛔⛔ **BUT THE AFFIRMATIVE CASE IS GONE, AND THE DIFFERENCE MATTERS FOR WHAT THE COMPLETION REPORT MAY CLAIM:**
- ✅ what is established: **the matcher is not MIS-aimed.**
- ⛔ what is NOT established, and what `r1` claimed: **that `Bash` is where this error class DISTINCTIVELY lives.** It is where *everything* lives. **89.4% of all era activity is Bash.**

⇒ **Scoping to `Bash` is correct because there is nowhere else to look, NOT because the evidence points there.**

---

## 6. ⛔ THE CEILINGS — one restated as a RANGE, because `r1` gave a number it could not support

**`r1`: *"8 rows carry an explicit no-instrument signature ⇒ ~16% out of reach."*** ⚠️ **8 is ONE DEFENSIBLE CODING AND NO RUBRIC WAS RECORDED.** A coding that treats *reading the wrong artifact* as *no instrument* yields ~13; one demanding an explicit assertion verb yields ~5.
⛔ **AND THE DEEPER LIMIT: these trailers are the author's RECONSTRUCTION, written after the fact — not a record of what instrument was used.** The transcripts would settle it; **no such derivation exists.**

⇒ ✅ **STATED HONESTLY: ROUGHLY 5–13 OF 50 ATTRIBUTABLE INSTANCES (≈10–26%) INVOLVE NO TOOL CALL AT ALL AND ARE BLIND TO ANY `PostToolUse` HOOK BY CONSTRUCTION.** Second ceiling, alongside §5 falsifier 3.

---

## 7. ⛔ WHAT THIS RESULT MAY NOT BE CITED AS

- ⛔ **NOT** *"erroring windows are Bash-enriched."* **Refuted: `+0.3 pp` against a same-era, same-shape control.**
- ⛔ **NOT** *"89.5% of `wrong-object` errors are caused by Bash."* This is **ambient tool use in a window**, not the erroring read — and the window ends at a commit, which is itself a Bash operation.
- ⛔ **NOT** a coverage figure for 6c/6d. What is cleared is the **AIM**, nothing about hit rate.
- ⛔ **NOT** transferable to another tool, event, era or corpus.

---

## 8. ★ WHAT THIS COST AND WHAT IT BOUGHT

**The gate reached the right verdict through a refuted argument.** Had the second reader not run, `B-MEASURE-GATE` would have shipped carrying *"erroring windows are Bash-enriched by 11 points"* — **a manufactured effect, in the batch whose entire subject is manufactured effects, published as its justification.**

★★ **AND THE MECHANISM IS THE ONE THIS BATCH EXISTS TO MECHANISE: I HAD THE CORRECT CONCLUSION PRE-WRITTEN IN THE SCRIPT AND ARGUED PAST IT BECAUSE THE NUMBER CAME OUT THE OTHER WAY.** The `else` branch of `obj6b_tools.py` states the vacuity finding almost verbatim. **A predicate that fires on the shape of a comparison — a control drawn from a different period than the measurement — would have caught this before the number was ever read.** ⇒ **that is OBJ-6c's job, and this is now its worked example.**
