---
name: workflow-04-code-review
description: STEP 4 ONLY of the DawnTrader batch workflow - Langston's code review of the git diff at the graded ref origin/migration/aws-supabase, after the push to the review branch and before main advances. Use when dispatching a change list for review. NOT for Langston's second-pass staging verification, which is step 8.
---

# STEP 4 — CODE REVIEW (LANGSTON)

**Ends when:** Langston clears the diff **at the graded ref** — a code-level review, never a high-level gloss.

## ⛔ THE REF IS THE POINT
He reviews **`origin/migration/aws-supabase` — i.e. AFTER the push to the review branch and BEFORE it advances to `main`.** He has **no working copy**; he reads at a ref. **An unpushed diff is a file that does not exist for him.** So: **commit and push BEFORE dispatching.**
**The gate is the advance to `main`, not the push to the review branch.**

## DO
- Write the change list to `Claude Comms and Packages/Change Lists/`.
- **Embed the load-bearing diff snippets INLINE** — NEW/MODIFIED/DELETED with 5-20 line BEFORE/AFTER blocks — rather than making him navigate.
- **State the ref, correctly.** A mis-stated READY-AT sends the reviewer to the wrong object.
- **Name the judgement calls you want attacked.** A review that only confirms is a review you wasted.

## ⛔⛔ THE DISPATCH HEADER — THREE FIELDS, EVERY TIME, OR HE CANNOT RULE ON WHAT IS ABSENT

★★ **MEASURED, AND IT IS THE ARGUMENT: `B-WAKE-QUIET` WAS APPROVED AT STEP 4 WHILE HAVING NO STEP 2 AT ALL.** No pre-audit existed; the workflow ran **1 → 3**. Nobody noticed for two days, and it was caught at Step 10 by the tier ledger's own pre-audit row (`#1005`), not by the reviewer and not by the owner.
⇒ ⛔ **THE DISPATCH WAS A CHANGE LIST AND DIFF SNIPPETS. NOTHING IN IT SAID WHAT THE DOCUMENT SET SHOULD HAVE BEEN — so the absence was not something he read past, it was something he could not see.** *(CC-A's framing, and Langston accepted it as factually right about that dispatch while refusing it as a discharge: §16's 2026-06-16 amendment puts the doc-set check on him at Step 2 AND Step 4, unconditionally. He could have asked and did not. **Both true; the structural half is the one worth building, because "remember to ask" is an instruction to a session that has never seen the last one.**)*

**EVERY STEP-4 DISPATCH CARRIES THESE THREE, AT THE TOP:**

| # | field | what it must say |
|---|---|---|
| **i** | **DECLARED CHANGE-CLASS** | the class from the scope header, verbatim — `architecture` \| `non_architecture` \| `sub_batch` \| `hotfix` |
| **ii** | **THAT CLASS'S DOC SET, ROW BY ROW** | each required document marked **present** (with its path), **absent**, or **judged N/A with the reason**. ⛔ **A row you leave off is the failure this exists to prevent — the list must be COMPLETE for the declared class, not a list of what you happen to have.** |
| **iii** | **THE STEP-2 REFERENCE** | the pre-audit's path at the ref — **or the literal line `NO STEP 2 — <reason>`.** ⭐ **There is no third option, and no blank.** A dispatch that simply does not mention Step 2 is exactly the one that shipped. |

★ **WHY A FIELD LIST AND NOT A NEW RULE (Langston's own reasoning, and it satisfies `#998`): this is a shape requirement on an artifact you are already writing, living in the step file that governs writing it. It adds nothing to any always-loaded file, so it does not spend the budget that every added rule takes from the risk rules.**
⚠️ **HONEST LIMIT, STATED RATHER THAN GLOSSED: NOTHING CHECKS THIS.** It is a field list a session fills in, and a session that skipped Step 2 can write `NO STEP 2 — n/a` just as easily as the truth. ⇒ **what it buys is that the ABSENCE BECOMES VISIBLE TO THE REVIEWER rather than invisible** — he can rule on a stated `NO STEP 2` and cannot rule on a silence. **The enforcing predicate belongs in the checker; it is homed at `B-GATE-GUARD` (`#744`).**
⛔ **AND IT BINDS THE DISPATCH THAT PROPOSED IT: the `B-LANGSTON-CONTEXT` Step-4 dispatch did not carry these fields either. That is the argument, not a criticism** — the requirement was written because its own author did not think to supply them.

## ⛔ HE IS STATELESS PER-INVOKE (`1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §3 · `WI-S1`)
He has **no memory of his own prior turns**: anything multi-turn carries its context in the prompt or a committed file. The rule is held in the contract §3.

## FOLLOW THROUGH — "DISPATCHED" ≠ "REVIEWED"
Watch for his pickup. **No engagement in ~8-10 min → re-poke. Escalate after 2-3 tries.** Do not go idle reporting status to Kyle instead of chasing the review.
**Iterate to consensus.** Read his feedback, decide per point (agree / partially agree / disagree), respond with reasoning. **Escalate to Kyle only on true deadlock (2-3 rounds, not converging), an architectural call he owns, or a risk/authority boundary.**

## ⛔ CONFIRM THE DISPATCH ARRIVED WHOLE — AND SILENCE IS NOT CONSENT
- **He may be mid-review with ANOTHER session.** His queue is not yours. **No reply does not mean no objection**, and it certainly does not mean approval.
- **A review that returns with NO questions at all is a signal to check DELIVERY, not a compliment.** A long dispatch is reassembled before his gate — but **only** for a post that LEADS with his name, and only above the size threshold; everything else splits and the pieces after the first are discarded. **If his reply engages only your opening section, he probably received only that.**
- ⛔ **THE CHANGE SET MUST INCLUDE UNTRACKED FILES.** `git diff HEAD` omits them and says nothing about the omission. A dispatch built that way once shipped a review missing the batch's single most load-bearing file. **Cross-check `git status --porcelain` for `??` before calling any diff the change set.**


## ⛔⛔ ONE GATE PER DISPATCH — HIS INVOCATION HAS A HARD 15-MINUTE CEILING AND EXCEEDING IT FAILS **SILENTLY**
**`CLAUDE_TIMEOUT = 900` (`discord-langston-bridge.py:68`).** One invocation, 900 seconds, then the bridge logs `bridge error … **suppressed in channel**`, re-fires twice, and **PARKS the item.** ⛔ **THE FAILURE IS NEVER POSTED, so from your side it is INDISTINGUISHABLE FROM HIM BEING BUSY** — and the natural response to a busy reviewer (wait, re-poke politely) **re-triggers the identical timeout.**
**MEASURED 2026-08-23 (#741):** a Step-4 dispatch asking for four things in one invocation failed three times at ~15-minute intervals and was parked. I waited 47 minutes reading it as his queue.

★ **IT IS NOT PROMPT LENGTH — IT IS HOW MUCH WORK THE ASK IMPLIES.** Same hour, measured: CC-C’s single-gate asks invoke at ~3,850 chars and complete; my four-part ask timed out; the re-split single question invoked at 3,251 chars and was accepted at once. **A short prompt saying *"review these fifteen files"* will time out. A longer one saying *"rule on this ONE question, evidence below"* will not.**

**SO:**
1. **ONE GATE PER DISPATCH.** A diff review is one ask. A design ruling is another. A promotion judgement is a third. **Never bundle.**
2. **SEND THE CHEAPEST FIRST** — anything answerable without reading the repo. It returns fast and confirms the channel is working.
3. **PUT THE EVIDENCE IN THE MESSAGE.** Every file he must open is minutes off the ceiling. Inline the load-bearing hunks; stage long context as a FILE in `/home/langston/inbox/<BATCH-ID>/` and name the path.
4. ⛔ **A DISPATCH IS NOT "SENT" UNTIL YOU HAVE SEEN IT COMPLETE.** If a reply is slow, **read the bridge log before re-poking** — `journalctl -u discord-langston-bridge.service | grep -iE 'invoking claude|bridge error|PARK'`. `invoking claude (prompt=N chars)` means it started; `bridge error … suppressed` means it died and **he never saw your message at all.**

## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). Before dispatching: **re-derive every figure in the change list at the ref.** Langston will, and a number he refutes costs him a trace and you a round.
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

### ★ AND FOR A LOAD-BEARING CLAIM — A FRESH READER (`1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §1 · `WI-F1`)
⛔ **Read §1 of the shared contract before this step publishes a number, a cause, an absence or a completion it rests on. The rule is held there once, word for word, and that text is authoritative.** The trigger, in short: spawn a fresh reader without asking (Kyle's standing approval, 2026-08-27); hand it the object and the claim, or **the claim alone for any mechanism or absence claim (mandatory)**; one reader, one pass, then Langston; a hit is a lead to re-derive at the ref, a clean is never evidence; leave the `REVIEWER:` record; label any load-bearing claim you did not route `NOT RE-READ`.

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
The card **STAYS in `Implementation`**; set **Blocked on = Langston**. ⚠️ **On a SENT-BACK verdict the card does NOT move** — only the `Review` field changes, and **LANGSTON sets `Review` himself**, not you.
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A04`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A04`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
