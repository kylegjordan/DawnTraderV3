---
name: workflow-11-completion
description: STEP 11 ONLY of the DawnTrader batch workflow - the Completion Report that closes a batch. Use when writing BATCH_N_COMPLETION_REPORT.md with the objectives checklist, the evidence and the list of governance files actually changed. NOT for updating those governance documents, which is step 10.
---

# STEP 11 — COMPLETION REPORT

**Ends when:** Langston confirms and **Kyle acknowledges**. Only then is the batch CLOSED.

## ⛔ FIRST: DOES THIS BATCH ALREADY HAVE A **PROGRESS REPORT**? THEN YOU ARE *CONVERTING*, NOT WRITING (Kyle directive 2026-08-26)

**If the batch was parked on an observation window, a soak, or evidence that had to accumulate, it already has `<BATCH-ID>_PROGRESS_REPORT.md`** — see `workflow-10-governance` for when one is written.

⛔ **DO NOT WRITE A FRESH REPORT FROM MEMORY. CONVERT THAT FILE.** Rename it to `<BATCH-ID>_COMPLETION_REPORT.md` and finish it:
1. **(a) WHAT DATA CAME IN.** The observation’s actual result, set against the criterion the progress report **PRE-REGISTERED** — **quote the criterion as written, then the outcome.**
2. **(b) WHAT DECISION OR ACTION WAS TAKEN ON IT, and by whom.** ⛔ **A report carrying (a) and not (b) has NOT closed the loop.**
   *(Split into two sub-items 2026-08-27, Langston condition 2: the merged version left "quote the criterion as written" trailing behind (b), reading as though you quote a criterion for the DECISION — and its emphasis markers were unbalanced, rendering bold from a mid-clause comma, in the file whose subject is legibility.)* — quote the criterion as written, then the outcome. ★ **A criterion chosen after seeing the window can always be made to pass. That is exactly what pre-registration prevents, and rewriting it now destroys the protection.**
3. Complete the objectives table and the governance-files-changed list.
4. ⚠️ **If the observation FAILED its criterion, the conversion RECORDS THE FAILURE — it does not become a delay.** Either the report closes the batch with a negative result and a named follow-up, or the batch reopens at the step that needs redoing.

★ **WHY CONVERSION RATHER THAN A REWRITE: the progress report captured its evidence WHILE IT WAS FRESH**, often weeks earlier. A report re-written from memory at close is the reconstruction this entire workflow exists to avoid.

---

## THE REPORT
Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`.
- **Scope objectives checklist — YES / NO / PARTIAL, each with its evidence.**
- **The list of governance files ACTUALLY changed** (including Langston's MEMORY). **If SIM or the System Manual were applicable and are absent from that list, the close is rejected.**
- **CI run ID + green status, per-job.**
- **Any scope item left open — stated at the TOP, not buried**, with its owner, dated home, closing condition and failure condition.
- **New findings**: what was turned up that was not in scope, and the investigation that settled it. **If it turned out NOT to be a defect, leave it out entirely.**
- **Honest residual.** What this batch did not establish.

## ⛔ SCAFFOLDING DECLARATION
If the batch ships scaffolding without making the capability functional, state it at the TOP, in bold, separated:
> 🚨 THIS BATCH DOES NOT MAKE \<CAPABILITY\> FUNCTIONAL. IT REMAINS INERT UNTIL \<BATCH N+x\>.

## ⛔ NUMERIC DELTAS
Any change to a previously-stated number gets surfaced as **PREVIOUSLY STATED: X. NOW: Y. REASON: <one line>.**

## THEN
Report to Kyle in the `CONDUCT.md` §6 format, move the board card, and **update your CURRENT POSITION block.**

## ⛔ EVERY DEFERRAL GETS A DATED HOME — A PHASE NAME IS NOT A HOME
**MEASURED 2026-08-21, and it is precisely what §9.4 exists to stop:** a code comment deferred a real design decision with *"paper joins in Phase 19 as a SEPARATE operator decision."* **It is Phase 19. The deferral came due and nobody noticed** — it was found months later by reading the comment, not by any tracker.
⇒ **A deferral written only into a CODE COMMENT is invisible to every process we have.** It needs a `RUNNING_ISSUES.md` entry with **a named owner and a DATE**, and the completion report must name it. **"In Phase 19", "post-launch" and "later" are not homes.**


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before the report leaves: **re-verify every objective marked YES against its evidence**, and re-read every claim asking what would have to be true for it to be wrong.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

### ★ AND FOR A LOAD-BEARING CLAIM, DO NOT SIMULATE STATELESSNESS — PRODUCE IT (Langston ruling, 2026-08-27)
⛔ **A SESSION CANNOT REVIEW ITS OWN WORK STATELESSLY, AND WILL REPORT THAT IT DID.** *(Langston: "a session verifying its own statelessness would have to compare against the state it is claiming not to have" — the instrument that cannot fail.)* ★ **What makes HIM catch things is not discipline, it is a PROCESS BOUNDARY: a fresh process holding only what it was handed.**
⇒ **For a number, a cause, or a completion that this step rests on: spawn a fresh-context reviewer and hand it ONLY THE OBJECT AND THE CLAIM.** ✅ **STANDING APPROVAL — KYLE, 2026-08-27: spawn them for load-bearing claims at ANY point in the workflow, no permission needed.** ⚠️ **This line previously read *"Kyle must approve spawning one"* — MINE, and it turned the mechanism into a request. MEASURED CONSEQUENCE: it was written into four skills and SPAWNED ZERO TIMES in two days, including on the dispatches whose errors it was built to catch.** ★ **A rule that cannot be executed without asking is worse than no rule — it reads as covered.** *(Never call it a "process boundary" to Kyle; it is "a second reader who was never in the room.")*
★★ **ASK IT ONE THING, AND NOT THE OBVIOUS ONE:** not *"does this support the claim?"* but **"WHAT OTHER STATES OF THE WORLD ARE CONSISTENT WITH THIS OBJECT?"** — handed a directory listing for *"the key was dropped"* it answers *present / absent / empty* **without needing to know the right file. The ASK reaches wrong-object; a yes/no handoff cannot.**
⛔ **SCOPE IT TO THAT ONE OUTPUT — never a disposition, never true/false.** The moment it rules on the conclusion it is guessing from a stub.
⚠️ **THE LIMIT THAT WILL BITE, and it is Langston’s own measured case: a fresh context is blind to context it NEEDS, not only to context it should ignore.** He vacated a ruling of his own because a fresh invoke could not see his three earlier ones. **Hand it your SUMMARY and it reviews your summary — the same failure one level down.**

★★ **TWO MODES, AND MODE B IS MANDATORY FOR A MECHANISM CLAIM OR AN ABSENCE CLAIM (Langston condition (ii), 2026-08-27).**
| mode | you hand it | use for |
|---|---|---|
| **A** | the **object + the claim** | *"is this number right"* — cheap, and cheap is fine here |
| **B** | ★ **THE CLAIM ALONE** — *"name the objects that would settle this, then: what other states of the world are consistent with them?"* | ⛔ **MANDATORY: any MECHANISM claim and any ABSENCE claim** |
★ **WHY B EXISTS — IT MOVES THE OBJECT SELECTION ACROSS THE BOUNDARY, WHICH IS THE HALF MODE A CANNOT REACH.** In mode A **you** still choose what to hand it, and **a fresh reviewer handed the ADJACENT object returns a clean, confident, useless verdict.** ⚠️ **Langston’s own #675 retraction is the proof: his failure was not misreading the file, it was believing that file WAS the object.** A reader given only the claim must go and find it.
★ **WHAT DOES NOT CROSS THE BOUNDARY, and it is smaller than it looks: the CLAIM FRAME** — whether that was the right question at all. **A wrongly-framed claim is on the page and auditable; a wrongly-chosen object never was.** That residual is Langston’s, as the outer boundary.

⛔⛔ **A HIT IS A LEAD; A CLEAN IS NOT EVIDENCE (Langston condition (i), and it is the asymmetry that licenses the whole mechanism).**
- **A reviewer HIT must be RE-DERIVED at the ref, with a control, before it moves anything.** Same standing as his `langston-recall` §19.
- ⛔ **A reviewer CLEAN may NEVER be cited as support for a claim — not in a scope, not in a report, not to Langston.** *"The reviewer found nothing"* **is not evidence and he will bounce it as one.** ⚠️ **This is #453: a silence is not an absence.**
- ⛔ **EVERY SPAWN LEAVES A ONE-LINE RECORD where its finding lands** (the §9.4 disposition slot is the home): **`REVIEWER: <object handed | claim-only> · <question> · <verdict> · re-derived y/n`**. ★ **WITHOUT A DENOMINATOR THE BAR CAN NEVER RISE ABOVE "one run"** — we would be arguing from anecdote in a month, **with no way to tell a mechanism that works from one that is simply not firing.** *(That is exactly how the gated version read as covered while spawning zero times.)*

⛔⛔ **AND IT IS A LOOP, NOT A ONE-SHOT (Kyle, 2026-08-27).**
> **you produce the claim → fresh reviewer → CORRECT what it calls out → hand the corrected version BACK to a fresh reviewer → repeat until IT SAYS ITS OWN CALLED-OUT ITEMS ARE SATISFIED → only then dispatch to Langston.**
★ **WHY THE SECOND ROUND IS THE POINT: THE CORRECTION IS ITSELF UNREVIEWED WORK**, written by the same session, in the same context, that produced the error. **An uninspected correction is exactly as likely to be wrong as the thing it replaced.** ⚠️ **Each round gets a FRESH reviewer** — one that has seen your earlier draft has rebuilt the memory-of-forming-the-belief the boundary exists to remove.

✅ **WHAT THE END OF THE LOOP MEANS — KYLE’S OWN WORDS, AND IT IS NARROWER THAN IT SOUNDS: *"that is the best version of what they can put forward in front of Langston."*** ⛔ **IT IS NOT A CLAIM THAT THE FINDING IS CORRECT.** The loop closes when **the reviewer’s OWN called-out items have been satisfied** — nothing wider. **Langston still pokes holes in it, and is expected to.**
⇒ ✅ **NO CONFLICT WITH THE HIT/CLEAN ASYMMETRY ABOVE:** the loop decides **WHEN YOU STOP ITERATING**; it never decides **WHETHER YOU ARE RIGHT.** ⛔⛔ **AND IT IS ENFORCED BY A DELETION TEST, NOT BY BANNING A PHRASE (Langston, 2026-08-28 — he struck my phrase ban and he is right).**
⚠️ **A PRESSURED SESSION WILL NEVER TYPE *"the reviewer agreed."* IT WILL TYPE *"three rounds, converged"* or *"high confidence after iteration"* — identical warrant, none of the banned words.** ★ **A phrase ban polices a STRING; the inference routes around strings.** *(Same shape as rule 29’s own origin: the rule fires at announce time, the failure happens before it.)*
✅ **THE TEST, and it runs in ten seconds: STRIKE EVERY MENTION OF THE LOOP FROM THE DISPATCH. If the finding still stands on its own citations — object, population, mechanism-with-line — dispatch it. If anything sags, it was never a finding.** ⛔ **The round count is not evidence either.**

⛔⛔ **TERMINATION REQUIRES AN *OBJECT* ROUND — A `claim-only` CLEAN MAY NOT CLOSE THE LOOP (Langston).** ★ **A reviewer that never reached the artifact is SILENT WITH ZERO OPPORTUNITY** — #661 leg 3, applied to a reader instead of an instrument. **The last round reads the object at the ref, or you polled rather than iterated.**

⚠️ **TWO WAYS THE LOOP FAILS:**
1. ⛔ **EROSION — AND *SHRINKAGE IS NOT THE SIGNAL* (Langston corrected my diagnostic, 2026-08-28).** ⚠️ **#675 narrowed hard under his own retraction and the disposition SURVIVED on a different mechanism — that was CORRECT narrowing.** ★ **THE DISCRIMINATOR: did each round replace a checkable assertion with a NARROWER CHECKABLE ONE, or with a HEDGE?** ⇒ **apply rule 29 to the FINAL text — object, population, and something that would falsify it. If those three survive, the narrowing was healthy however much it shrank. If not, withdraw under §9.4 disposition 5.**
2. ⛔ **A LOOP THAT WILL NOT CLOSE — CAP AT THREE ROUNDS.** ⛔ **The cap outcome is NOT NEUTRAL: send the FULL ROUND RECORD, because the unresolved disagreement is the first thing Langston rules on, before the substance.** **Iterating to agreement selects for persistence, not truth.**
**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round COUNT is the useful number — a finding that took three rounds and one that took none are not equally trustworthy.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
**Blocked on = Langston** for his sign-off → then **Blocked on = Kyle** for acknowledgement → then move to **`Complete`**. **Not before Kyle acknowledges.**
★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

11. **Completion Report** — Scope objectives checklist with YES / NO / PARTIAL + evidence. List ACTUALLY-edited governance files (including Langston's MEMORY per 10.b). Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`. Langston reviews + confirms. Batch CLOSED only after Kyle's acknowledgment.

---
