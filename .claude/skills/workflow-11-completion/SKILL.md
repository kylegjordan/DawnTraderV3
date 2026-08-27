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
⇒ **For a number, a cause, or a completion that this step rests on: spawn a fresh-context reviewer and hand it ONLY THE OBJECT AND THE CLAIM.** ⛔ **Kyle must approve spawning one** — and never call it a "process boundary" to him; it is *"a second reader who was never in the room."*
★★ **ASK IT ONE THING, AND NOT THE OBVIOUS ONE:** not *"does this support the claim?"* but **"WHAT OTHER STATES OF THE WORLD ARE CONSISTENT WITH THIS OBJECT?"** — handed a directory listing for *"the key was dropped"* it answers *present / absent / empty* **without needing to know the right file. The ASK reaches wrong-object; a yes/no handoff cannot.**
⛔ **SCOPE IT TO THAT ONE OUTPUT — never a disposition, never true/false.** The moment it rules on the conclusion it is guessing from a stub.
⚠️ **THE LIMIT THAT WILL BITE, and it is Langston’s own measured case: a fresh context is blind to context it NEEDS, not only to context it should ignore.** He vacated a ruling of his own because a fresh invoke could not see his three earlier ones. **Hand it your SUMMARY and it reviews your summary — the same failure one level down.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
**Blocked on = Langston** for his sign-off → then **Blocked on = Kyle** for acknowledgement → then move to **`Complete`**. **Not before Kyle acknowledges.**
★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

11. **Completion Report** — Scope objectives checklist with YES / NO / PARTIAL + evidence. List ACTUALLY-edited governance files (including Langston's MEMORY per 10.b). Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`. Langston reviews + confirms. Batch CLOSED only after Kyle's acknowledgment.

---
