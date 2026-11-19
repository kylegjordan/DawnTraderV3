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

### ★ AND FOR A LOAD-BEARING CLAIM — A FRESH READER (`1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §1 · `WI-F1`)
⛔ **Read §1 of the shared contract before this step publishes a number, a cause, an absence or a completion it rests on. The rule is held there once, word for word, and that text is authoritative.** The trigger, in short: spawn a fresh reader without asking (Kyle's standing approval, 2026-08-27); hand it the object and the claim, or **the claim alone for any mechanism or absence claim (mandatory)**; one reader, one pass, then Langston; a hit is a lead to re-derive at the ref, a clean is never evidence; leave the `REVIEWER:` record; label any load-bearing claim you did not route `NOT RE-READ`.

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
**Blocked on = Langston** for his sign-off → then move to **`Complete`** (no Kyle acknowledgement, 2026-09-02).
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)
- Each objective is reported **YES / NO / PARTIAL / CLOSED-UNPROVEN**; the last carries owner, home, closing condition and failure condition.
- Run the ledger checker on the batch ledger at the ref and quote its result line. During the draft period it is reported, not gated on. The batch ledger: `scripts/crew-tooling/ledger-schema.json`, checked by `node scripts/crew-tooling/ledger-validate.mjs <ledger.json>`.

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A11`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A11`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
