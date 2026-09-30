---
name: workflow-11-completion
description: STEP 11 ONLY of the DawnTrader batch workflow - the Completion Report that closes a batch. Use when writing BATCH_N_COMPLETION_REPORT.md with the objectives checklist, the evidence and the list of governance files actually changed. NOT for updating those governance documents, which is step 10.
---

# STEP 11 — COMPLETION REPORT

**Ends when:** Langston confirms. **Then the batch is CLOSED — Kyle does NOT acknowledge a close** (Kyle, 2026-09-02: never block on him for an ack; move the card, post the block).

## ⛔ FIRST: DOES THIS BATCH ALREADY HAVE A **PROGRESS REPORT**? THEN YOU ARE *CONVERTING*, NOT WRITING (Kyle directive 2026-08-26)

**If the batch was parked on an observation window, a soak, or evidence that had to accumulate, it already has `<BATCH-ID>_PROGRESS_REPORT.md`** — see `workflow-10-governance` for when one is written.

⛔ **DO NOT WRITE A FRESH REPORT FROM MEMORY. CONVERT THAT FILE.** Rename it to `<BATCH-ID>_COMPLETION_REPORT.md` — ⛔ **and grep the old filename across the corpus and update every reference in the same commit: a rename is a citation-drift event** (Langston, G4 2026-09-29; `B-PRICE-AGE-TRUTH`'s `git mv` left eight live references pointing at a 404) — and finish it:
1. **(a) WHAT DATA CAME IN.** The observation’s actual result, set against the criterion the progress report **PRE-REGISTERED** — **quote the criterion as written, then the outcome.** ★ **A criterion chosen after seeing the window can always be made to pass. That is exactly what pre-registration prevents, and rewriting it now destroys the protection.**
2. **(b) WHAT DECISION OR ACTION WAS TAKEN ON IT, and by whom.** ⛔ **A report carrying (a) and not (b) has NOT closed the loop.**
3. Complete the objectives table and the governance-files-changed list.
   ⛔⛔ **THE GOVERNANCE-FILES-CHANGED LIST IS *COPIED FROM STEP 10's TIER LEDGER*, NEVER WRITTEN FROM WHAT YOU REMEMBER DOING (Kyle directive 2026-08-28).** ★ **Writing it from recollection is half of the skipped-tier defect: the session that skipped a tier also writes the report, so the checklist and the report are never compared and the omission is invisible in both.** ⇒ **open the step-10 table and transcribe it, `N/A` rows included.** ⚠️ **If there is no filled table, Step 10 is not finished — go back and fill it rather than reconstructing the list here.**
4. ⚠️ **If the observation FAILED its criterion, the conversion RECORDS THE FAILURE — it does not become a delay.** Either the report closes the batch with a negative result and a named follow-up, or the batch reopens at the step that needs redoing.

★ **WHY CONVERSION RATHER THAN A REWRITE: the progress report captured its evidence WHILE IT WAS FRESH**, often weeks earlier. A report re-written from memory at close is the reconstruction this entire workflow exists to avoid.

---

## THE REPORT
Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`.
- **Scope objectives checklist — YES / NO / PARTIAL, each with its evidence.**
- **The list of governance files ACTUALLY changed** (including Langston's MEMORY). **If SIM or the System Manual were applicable and are absent from that list, the close is rejected.**
- **CI run ID + green status, per-job.**
- **Any scope item left open — stated at the TOP, not buried**, with its owner, its PLACED home (a position in the active plan — never a date, `CLAUDE.md` §9.4), closing condition and failure condition.
- **New findings**: what was turned up that was not in scope, and the investigation that settled it. **If it turned out NOT to be a defect, leave it out entirely.**
- **Honest residual.** What this batch did not establish.

## ⛔ SCAFFOLDING DECLARATION
If the batch ships scaffolding without making the capability functional, state it at the TOP, in bold, separated:
> 🚨 THIS BATCH DOES NOT MAKE \<CAPABILITY\> FUNCTIONAL. IT REMAINS INERT UNTIL \<BATCH N+x\>.

## ⛔ NUMERIC DELTAS
Any change to a previously-stated number gets surfaced as **PREVIOUSLY STATED: X. NOW: Y. REASON: <one line>.**

## THEN
Report to Kyle in the `CONDUCT.md` §6 format, move the board card, and **update your CURRENT POSITION block.**

## ⛔ EVERY DEFERRAL GETS A PLACED HOME — A PHASE NAME IS NOT A HOME
**MEASURED 2026-08-21, and it is precisely what §9.4 exists to stop:** a code comment deferred a real design decision with *"paper joins in Phase 19 as a SEPARATE operator decision."* **It is Phase 19. The deferral came due and nobody noticed** — it was found months later by reading the comment, not by any tracker.
⇒ **A deferral written only into a CODE COMMENT is invisible to every process we have.** It needs a `RUNNING_ISSUES.md` entry with **a named owner and a PLACE in the active plan — never a date** (`CLAUDE.md` §9.4; a date belongs only to a period whose length is the point), and the completion report must name it. **"In Phase 19", "post-launch" and "later" are not homes.**


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before the report leaves: **re-verify every objective marked YES against its evidence**, and re-read every claim asking what would have to be true for it to be wrong.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

### ★ AND FOR A LOAD-BEARING CLAIM, DO NOT SIMULATE STATELESSNESS — PRODUCE IT (Langston ruling, edit 9, 2026-08-27T18:57Z UTC)
⛔ **A SESSION CANNOT REVIEW ITS OWN WORK STATELESSLY, AND WILL REPORT THAT IT DID.** *(Langston: "a session verifying its own statelessness would have to compare against the state it is claiming not to have" — the instrument that cannot fail.)* ★ **What makes HIM catch things is not discipline, it is a PROCESS BOUNDARY: a fresh process holding only what it was handed.**
⇒ **For a number, a cause, or a completion that this step rests on: spawn a fresh-context reviewer and hand it ONLY THE OBJECT AND THE CLAIM.** ✅ **STANDING APPROVAL — KYLE, 2026-08-27: spawn them for load-bearing claims at ANY point in the workflow, no permission needed.** ⚠️ **This line previously read *"Kyle must approve spawning one"* — MINE, and it turned the mechanism into a request. It was written into four skills, and I know of no use of it in the 14½ hours it stood (`df368871f` → `0bc4fb0d8`) — how many load-bearing dispatches that window held was never counted, so this is not a measured zero.** ★ **A rule that cannot be executed without asking is worse than no rule — it reads as covered.** *(Never call it a "process boundary" to Kyle; it is "a second reader who was never in the room.")*
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

⛔⛔ **ONE PASS, ON LOAD-BEARING CLAIMS ONLY — AND WHAT SKIPPED IT SAYS SO (Kyle, 2026-09-30, `B-TOKEN-BURN-CUT` OBJ-4).**
★ **THIS REPLACES THE ITERATE-TO-CONSENSUS LOOP (Kyle 2026-08-27 and 2026-08-31), ON COST.** Measured 2026-09-29/30: helper agents cost $1,524 at list rates in two days, against $2-30 a day per session before, and reader rounds were a large part of it (`B_TOKEN_BURN_CUT_PRE_AUDIT.md` §0, D4).
- **WHICH CLAIMS: only one that would change WHAT GETS BUILT** — a mechanism, a cause, an absence, or a number a decision rests on. A wording, a count that changes no decision, a cosmetic slip: no reader.
- **YOU DECIDE BEFORE PUBLISHING, NOT AFTER — and any load-bearing claim you did NOT route to a reader ships labelled `NOT RE-READ`** in the dispatch, scope or report, so Langston can see which is which. ⛔ **The label is what stops "load-bearing" from being a gate that certifies itself** (Langston, 2026-09-30).
- **ONE FRESH READER, ONE PASS.** Correct what it calls out, and send the correction to Langston as it stands with the call-out named — **not to another reader round. Langston is the second pass.**
- **For a MECHANISM or an ABSENCE claim the reader gets the CLAIM ALONE** (mode B) — the object selection is where the error lives.
- **KEPT UNCHANGED:** a HIT is a lead, re-derived at the ref with a control before it moves anything; a CLEAN is never evidence, and *"the reviewer agreed"* / *"it came back clean"* may not be written in a dispatch, scope or report; the one-line `REVIEWER: <object handed | claim-only> · <question> · <verdict> · re-derived y/n` record stays where the finding lands — **it is the only way to tell a mechanism that works from one that is not firing.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
**Blocked on = Langston** for his sign-off → then move to **`Complete`** (no Kyle acknowledgement, 2026-09-02).
★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

11. **Completion Report** — Scope objectives checklist with YES / NO / PARTIAL + evidence. List ACTUALLY-edited governance files (including Langston's MEMORY per 10.b). Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`. Langston reviews + confirms. Batch CLOSED only after Kyle's acknowledgment. ⛔ **SUPERSEDED 2026-09-02 (Kyle): a close needs no acknowledgement from him — see the top of this skill.**

---
