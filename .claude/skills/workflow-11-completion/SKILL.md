---
name: workflow-11-completion
description: STEP 11 ONLY of the DawnTrader batch workflow - the Completion Report that closes a batch. Use when writing BATCH_N_COMPLETION_REPORT.md with the objectives checklist, the evidence and the list of governance files actually changed. NOT for updating those governance documents, which is step 10.
---

# STEP 11 — COMPLETION REPORT

**Ends when:** Langston confirms and **Kyle acknowledges**. Only then is the batch CLOSED.

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

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
**Blocked on = Langston** for his sign-off → then **Blocked on = Kyle** for acknowledgement → then move to **`Complete`**. **Not before Kyle acknowledges.**
★ **YOU move the card; LANGSTON sets `Review`.** *(Kyle 2026-08-03 — his approval gates the move but is not the move, or the board freezes every time he is mid-review.)*
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

11. **Completion Report** — Scope objectives checklist with YES / NO / PARTIAL + evidence. List ACTUALLY-edited governance files (including Langston's MEMORY per 10.b). Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`. Langston reviews + confirms. Batch CLOSED only after Kyle's acknowledgment.

---
