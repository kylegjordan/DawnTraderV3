# B-MEASURE-GATE leg 2 — OBJ-6b RESULT: the tool-distribution gate

**Owner:** CC-A · 2026-08-31 · Step 3 · pinned ref `a758ce6f3` · change-class `architecture`

---

## ⛔ WHAT THIS GATE IS FOR, AND WHY IT RAN FIRST

**Langston, Q1 ruling:** OBJ-6b *"is a **GATE**. It runs first and it can kill the matcher."*
⇒ **If `wrong-object` instances were not predominantly produced through `Bash`, a `PostToolUse` hook scoped to `Bash` is MIS-AIMED, and OBJ-6c and OBJ-6d do not get built.**

★★ **THE POINT IS THAT IT COULD HAVE COME OUT THE OTHER WAY.** The scope's own `[R2-A]` correction records that *"all eight instances were Bash"* was a **fabricated mechanism claim, withdrawn** — the attribution it rested on was never recorded. **This objective exists because that claim was made without evidence, and it is run so the design does not rest on it a second time.**

---

## 1. THE POPULATION, PINNED — one ref, one walk

| | |
|---|---|
| **ref** | `a758ce6f32bebfb3ce39129ada114f224d70988b` |
| commits walked (branch ancestry, `--no-merges`) | **9,831** |
| well-formed `MISTAKE:` trailers | **189** across **44** slugs |
| ⛔ `MISTAKE: none` rows **EXCLUDED** | **1** |
| **`wrong-object`** | **90 · 47.6% · 6.0× second place** |

⛔ **THE EXCLUSION IS STATED HERE BECAUSE ITS SILENCE WAS A DEFECT ONCE ALREADY.** A declared *no-mistake* is not a mistake, so it does not belong in the denominator — but the pre-audit's `[r4]` records that this exclusion was previously applied **without being written down**, which made the published denominator unreproducible from the document. **Now it is a row in the table.**

⚠️ **One sha carries TWO trailer lines**, so the sha-set is 89 while the instance count is 90. Stated rather than smoothed.

---

## 2. TWO INSTRUMENTS, CHOSEN BECAUSE THEY FAIL DIFFERENTLY

★ **My own standing lesson, and the reason this is not one measurement run twice: TWO INSTRUMENTS AGREEING IS NOT A CONTROL — A CONTROL IS ONE THAT WOULD FAIL DIFFERENTLY.**

| | instrument | what it sees | ⛔ how it fails |
|---|---|---|---|
| **1** | **commit-body attribution** | the instrument the author named in prose | ⛔ **depends on somebody having written the command down** — Langston's `[R2-A]`: attribution is *incidental, never systematic* |
| **2** | **transcript tool distribution** | every tool call actually made | ⛔ **attributes AMBIENTLY, not causally** — it sees the hour, not the read |

⇒ **Neither carries the gate alone. Their blind spots do not overlap, which is the whole design.**

---

## 3. INSTRUMENT 1 — commit-body attribution

| bucket | n | share |
|---|---|---|
| **BASH-only signals** | **42** | 46.7% |
| non-Bash-only signals | **4** | 4.4% |
| both (ambiguous) | 4 | 4.4% |
| ⛔ **UNATTRIBUTED — the instrument is SILENT** | **40** | **44.4%** |

⛔⛔ **THE SILENCE IS THE HEADLINE, NOT A GAP TO PAPER OVER: THIS INSTRUMENT CANNOT SPEAK TO 44% OF THE POPULATION.**
✅ **Restated on what it CAN attribute: 42 of 46 = 91% Bash-only, 4 of 46 = 9% non-Bash.**
⚠️ **AND THAT CONDITIONAL RATE IS BIASED IN A KNOWN DIRECTION: attributability is not random.** A shell command is quotable and gets quoted; *"I asserted it from memory"* often is not. **Same shape as the 5-of-8 selection bias Langston made me pre-register — a set selected on *written down*.** ⇒ **instrument 2 is not optional.**

**The four non-Bash rows are listed rather than counted**, because they are the ones that would kill the matcher: `179f7667e` · `c6770d73a` · `42abd1a5f` · `d613ea775`.

---

## 4. INSTRUMENT 2 — transcript tool distribution

**REACH ESTABLISHED BEFORE USE (rule 29(b)).** 36 transcript intervals; **every one of the 90 commits has a transcript covering its window** (commit time minus a 60-minute lookback, since the erroring read precedes the commit). **Summed transcript wall-clock is 470% of the 138-day hull** — four sessions overlap — so coverage is genuine, not a hull artefact.

⚠️ **A PRIOR VERSION OF THIS CHECK ASKED THE WRONG QUESTION AND PASSED.** It tested whether each commit fell inside the corpus's `min(first)..max(last)` **HULL**, and reported *"100% inside the transcript span."* **A hull is not coverage** — most transcripts cover minutes, and a commit can sit inside the hull with nothing covering its moment. ★ **The per-commit test replaced it and happens to give the same answer, which is exactly why it had to be run: the wrong check and the right check agreed, and only one of them was evidence.**

**Sampling stated: 6 of 36 files, largest first, 383,545 lines streamed.** Not a full census.

| | Bash share |
|---|---|
| **erroring windows** (the hour before a `wrong-object` commit), n=4,055 | **89.6%** |
| **non-window activity**, n=33,385 | **78.5%** |
| ✅ **ENRICHMENT** | **+11.1 pp** |

⚠️ **CORRECTED IN THE RUN: I first reported +9.9 pp against a baseline that CONTAINED the windows.** A subset compared against a superset that includes it is dragged toward it, so that figure understated the effect. **The contrast above is windows vs NON-window.**

---

## 5. ✅ THE GATE PASSES — AND IT IS NOT VACUOUS

**Both instruments agree the population is Bash-dominant, and they reach it by different routes with non-overlapping blind spots:**
- **instrument 1:** 91% of what it can attribute;
- **instrument 2:** 89.6% of tool calls in erroring windows, **enriched +11.1 pp over everything else**.

★★ **THE ENRICHMENT IS WHAT MAKES THE RESULT MEAN SOMETHING.** Had the windows merely matched baseline, *"wrong-object is mostly Bash"* would be **true and nearly vacuous** — everything is mostly Bash, and the matcher would be right for a trivial reason. **It is not: erroring windows are measurably more Bash-heavy than ordinary work.**

⇒ ✅ **OBJ-6c AND OBJ-6d ARE CLEARED TO BUILD.**

---

## 6. ⛔ THE CEILING NEITHER INSTRUMENT CAN LIFT — STATED NOW, BEFORE ANY CODE

**8 rows carry an explicit *"no instrument — recalled / asserted from memory"* signature.**
⛔⛔ **A `PostToolUse` HOOK IS BLIND TO THESE BY CONSTRUCTION. THERE IS NO TOOL RESULT TO INSPECT.** A claim asserted without ever running a command produces no event at any hook point in the design.

⇒ **≈16% of the attributable population (8 of 50) is OUT OF REACH OF THE ENTIRE OBJECTIVE, and the completion report must say so.** ★ **This is pre-registered now precisely so it cannot be discovered later and reported as a shortfall in the implementation rather than a property of the approach.**

⚠️ **AND IT IS THE SECOND STATED CEILING ON THIS BATCH.** §5 falsifier 3 already holds the first: *"grounding checks REDUCE this class; they do not eliminate it — a model can still misread what it genuinely retrieved."* **Neither is a reason not to build; both are reasons not to claim a coverage figure the design cannot support.**

---

## 7. WHAT THIS RESULT MAY NOT BE CITED AS

- ⛔ **NOT** *"89.6% of `wrong-object` errors are caused by Bash."* Instrument 2 measures **ambient tool use in a window**, not the erroring read.
- ⛔ **NOT** a coverage figure for OBJ-6c/6d. **What is cleared is the AIM of the matcher, nothing about its hit rate** — that is 6d's bar, and the completion report is already pre-registered as forbidden from claiming *"catches N%"*.
- ⛔ **NOT** transferable to another tool or event. One tool scope, one corpus, one ref.
