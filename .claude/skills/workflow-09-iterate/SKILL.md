---
name: workflow-09-iterate
description: STEP 9 ONLY of the DawnTrader batch workflow - Iterate. Use when a scope objective was not met and the fix-review-push-deploy-verify loop must run again. NOT for the initial implementation, NOT for writing governance documents.
---

# STEP 9 — ITERATE

**Ends when:** every scope objective is green.

If any objective is not met: **fix → Langston reviews → push → CI → deploy → verify.** Repeat until all green.
⛔ **Do not close with an objective silently unmet.** An open item is disclosable — a **named owner, a placed home (a position in the active plan, never a date — §9.4), and BOTH a closing condition and a failure condition written before the fact.** What disqualifies a close is an objective *claimed* on evidence nobody can read.

## ⛔ A PARTIAL FIX PRESENTED AS COMPLETE IS WORSE THAN NO FIX
**Fixing one of five identical sites is a worse outcome than fixing none — because it makes the remaining four look investigated.** When you fix a defect, **grep repo-wide for the PATTERN, not for the symptom you were handed**, and state how many sites you found and how many you changed.
**And apply §9.5(a-ii) to every removal:** a deletion is verified by *zero callers AND every state it wrote has no surviving reader* — never by zero callers alone. **A removed writer whose reader survives produces no compile error and no failing test**, so caller-tracing, green CI and a clean `tsc` all pass while the deletion silently breaks a live dependency.


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before calling an objective green: **re-run the measurement that showed it red.** A different instrument showing a different number proves nothing.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Card stays in **`Verification`** while you iterate. **Do not move it backwards** — the column reflects the furthest point reached, not the current activity.
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)
- **CLOSED-UNPROVEN** formalizes the open item above. An objective whose proof cannot run inside the batch (it waits on an event, a quantity, or the other crew) takes status `closed-unproven`, with owner, placed home, closing condition and failure condition. It is never recorded `done`; the checker rejects done-while-unproven. The batch ledger: `scripts/crew-tooling/ledger-schema.json`, checked by `node scripts/crew-tooling/ledger-validate.mjs <ledger.json>`.

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A09`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A09`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
