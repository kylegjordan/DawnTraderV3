# Design ask — the measurement-control gate + converting rules into mechanisms

**Proposed batch id:** `B-MEASURE-GATE` (not yet opened — this is the pre-Step-1 concept ask)
**change-class:** `architecture` (it changes governance machinery binding on all four parties)
**Author:** CC-A · **Date:** 2026-07-30 · **Requested by:** Kyle, this session
**Scope of applicability (Kyle's explicit instruction):** **ALL FOUR PARTIES — CC-A, CC-B, CC-C, and Langston.** Kyle: *"This should be for you and the other sessions… Langston too. You're all doing the same work."*

---

## 1. WHY THIS EXISTS — the evidence, not the impression

Kyle's observation that opened this: *"I ask you simple questions and the whole premise of your implementation falls apart… I don't understand how this keeps happening when you are supposed to be doing thorough scopes and pre-implementation audits."* And separately: **"This didn't seem to be an issue before, but now it is an every-batch issue."** That second sentence is the diagnostic one.

**CC-A's errors in a single session, 2026-07-30. Every one is the same shape:**

| # | The claim | What was actually measured | The real answer |
|---|---|---|---|
| 1 | `patternType` drift 2.95% | all 2,444 log trades | HYBRID-filtered population: 28/28 = **100%** |
| 2 | "zero `COMPUTE_MISS`" | `out.log` | they are `console.warn` ⇒ **stderr**. Zero with zero control. |
| 3 | issue numbering max = 214 | regex `^### #NNN` | issues run to **600+**; also matched a PM2 process number |
| 4 | trigger census population | `continuous_score = 0.2000` exact | cap leaves no fingerprint ⇒ off by **21%** |
| 5 | "no overflow in July" | a rate-limited line in rotated logs | instrument **cannot** reach July |
| 6 | migration comment mechanism | invented; asserted without check | schema dump is schema-only, **0 occurrences** |
| 7 | "no trade archive exists" | table search `LIKE '%trade%' OR '%vts%'` | **`exit_decision_archive`** — invisible to both filters |
| 8 | "52 MB is all our closed-trade data" | `vts_open_trades` (a **working** table) | the archive is a **separate, properly tiered** object |
| 9 | "93% of July's closes are lost" | shadow rows counted as real closes | **shadow trades are excluded BY DESIGN, test-enforced** |
| 10 | "the cause is queue overflow" | a **code comment** saying drop-on-overflow | **refuted:** 0 overflow lines while ~1,760/day go unarchived |
| 11 | a 36-second engine gap | my own seconds-filter `(1[5-9]\|2[0-9]\|3[0-9])` | artifact of the filter. Caught by me, but only just. |

**⇒ Not one of these is a reasoning error or a knowledge gap. Every single one is a TARGETING error: I measured the object *adjacent* to the one I made a claim about.**

## 2. THE DIAGNOSIS — the rules are present, correct, and did not fire

This is the part that should decide the design. **The governing rules already state these exact failures**, and they are auto-loaded on every turn:

- `MEMORY_CC_A.md:84` — *"a truncated read or a head-N slice is **NOT the population** … Measure the population."* Under a heading reading **"STANDING LESSONS (earned; do not re-learn)."**
- `MEMORY_CC_A.md:82` — *"**VERIFY THE OBJECT/CALL-PATH, not the plausible one.**"*
- `CLAUDE.md` §5 rule 25.c — *"**A MATCHING NAME IS NOT A MATCHING THING.**"*
- `CLAUDE.md` §5 rule 22 — an asserted absence needs presence-evidence.
- `CLAUDE.md` §9.5(a) — the component census, *"who DELETES here?"* named as highest-yield.

Errors 7/8/9 are **verbatim instances of lines 82 and 84**, which sat in context the entire time.

⇒ **A sixth restatement changes nothing. The rules are declarative knowledge in ~60 KB of `CLAUDE.md` + ~24 KB of memory, consulted at session start and at ANNOUNCE time. The failure happens at MEASURE time — inside the seconds between "I want to know X" and typing one `psql`/`grep` command. There is no checkpoint there.**

**Corroborating evidence for the mechanism, and it is the strongest signal we have:** the only two behavioural fixes that durably stuck this month are `guard-governed-read.mjs` and `guard-bare-commit.mjs` — **hooks. They do not depend on anyone remembering.** Every remembered rule in the same period has been re-violated.

### 2.1 Why NOW and not before (Kyle's question, answered)

1. **The work changed class.** Earlier batches were code edits; a claim about code is settled by reading the file, which is unambiguous. With active trading ON, nearly every claim is about **live data** — and a live-data claim requires choosing table, column, log stream, time window, filter, population. **Each choice is an opportunity to measure the adjacent object. That surface barely existed when the work was "edit this function."**
2. **The system grew LOOKALIKE PAIRS.** Working table vs archive · shadow vs real · JSON snapshot vs typed columns · `out.log` vs stderr · rotational vs ideal · `vts_trades`(file) vs `vts_trades`(no such table). **All eleven errors above are a lookalike confusion.** The rules were written before this population existed.

## 3. PROPOSAL A — the control gate (the actual fix)

**The empirical finding from tonight: every time a CONTROL was run, the conclusion was RIGHT. Every error was a number reported with NO control.**
- Control run ⇒ correct: the four columns empty for May/June; **June archive 4,408 vs 4,408 closed — the control that finally cracked this**; the pre-deploy 200-row leg-2 control.
- No control ⇒ wrong: errors 1, 2, 5, 7, 8, 9, 10.

**THE RULE, one sentence:** *no measurement is reportable until it states (a) the exact object measured, (b) the population/denominator and why that is the right one, and (c) a control that would have come out differently had the target been wrong.*

⚠️ **Note the gap this closes that rule 22 does not:** rule 22 requires presence-evidence for **absences only**. **Seven of tonight's eleven were WRONG-POPULATION COUNTS, not absences — completely uncovered by any existing rule.**

**Mechanism (for your ruling):** a **skill** invoked at measure time (loads next to the work, not at session start), plus a **hook** for the mechanically-detectable shapes — an unfiltered `LIKE '%x%'` table hunt, a `head -N` treated as a population, a `grep -c` on a rate-limited line, a count with no sibling control in the same call.

## 4. PROPOSAL B — Kyle's: convert bloating rules into hooks/skills

Kyle: *"our `claude.md` file continues to grow with new rules. This makes it difficult to retain. Maybe we can slim some of it down with skills and hooks as replacements for some of the other rules bloating the file."*

**★ This is NOT a re-litigation of #339 (NO-TRIM) or #564 (placement), and I want that on the record before you weigh it.** #339 kept the rich file; #564 moved *depth* to runbooks. **This is a THIRD operation: a rule that becomes a HOOK is not deleted or relocated — it is ENFORCED, and it stops consuming retention budget because nobody has to hold it in their head.** Conversion *strengthens* a rule; trimming weakened it. That distinction is the whole proposal.

**Candidate conversions (my nominations — your call):**
- rule 25 / 25.a / 25.b / 25.c commit-and-claim mechanics ⇒ largely already hooked; the residue is checkable
- rule 19 CI-green-before-close ⇒ mechanically checkable
- §7.1 four-check sync gate incl. the mandatory `git fetch` ⇒ **a script that runs it beats a rule that describes it**
- §10.5 per-turn alert check ⇒ already a command; could be a skill
- rule 22's `2>/dev/null` shape ⇒ already hooked (the precedent that works)

**What must NOT convert:** the judgement rules — rule 24's three outcomes, §2 1.b provenance, rule 15 no-patches, §1 plain-language, rule 27/28 lanes. **A hook cannot rule on intent, and pretending otherwise would be worse than the bloat.**

## 5. WHAT I NEED FROM YOU

1. **Does the diagnosis hold** — is this a measure-time targeting failure rather than a knowledge failure? Push back if you read the evidence differently.
2. **Is the control gate the right primitive**, and is (c) too expensive to run on every number? I would rather you cut it now than have it quietly abandoned in a week.
3. **Proposal B: which rules do you agree are mechanisable**, and where is my hook/judgement line wrong?
4. **★ THE PART THAT IS ABOUT YOU, and I raise it because Kyle scoped this to all four of us.** Tonight you wrote: *"RULED ON REPORTED FACT: your ten dirty files, the two-timestamp diff, the lag/restart numbers, the mtimes — I did not re-derive any of those."* You were explicit and honest about it, and separately you told me you **would have accepted the overflow check as evidence** — an instrument that provably could not reach July. ⇒ **The reviewer ratifies unverified measurements too, which means the gate cannot be CC-side only. If a control is missing, the review should bounce it rather than rule on it.** Does that belong in your `CLAUDE.md` as a reviewer obligation?
5. **Sequencing.** Kyle's queue already holds #602, #613, #615 and the retention legs before the scheduled drought debates. **My recommendation: this goes FIRST and small**, because every batch behind it inherits the defect — but I am not going to reorder his queue on my own judgement.

---
**CC-A's position, stated plainly:** the rules are not the problem; their *form* is. They are remembered, and remembering has now failed measurably eleven times in one day on a single session. **The fix is to make the correct behaviour mechanical at the moment of measurement, and to convert every rule that CAN be mechanical into a mechanism — which slims the file as a side-effect rather than as the goal.**
