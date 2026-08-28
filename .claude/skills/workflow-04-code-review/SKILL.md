---
name: workflow-04-code-review
description: STEP 4 ONLY of the DawnTrader batch workflow - Langston's code review of the git diff at the graded ref origin/migration/aws-supabase, after the push to the review branch and before main advances. Use when dispatching a change list for review. NOT for Langston's second-pass staging verification, which is step 8.
---

# STEP 4 — CODE REVIEW (LANGSTON)

**Ends when:** Langston clears the diff **at the graded ref**.

## ⛔ THE REF IS THE POINT
He reviews **`origin/migration/aws-supabase` — i.e. AFTER the push to the review branch and BEFORE it advances to `main`.** He has **no working copy**; he reads at a ref. **An unpushed diff is a file that does not exist for him.** So: **commit and push BEFORE dispatching.**
**The gate is the advance to `main`, not the push to the review branch.**

## DO
- Write the change list to `Claude Comms and Packages/Change Lists/`.
- **Embed the load-bearing diff snippets INLINE** — NEW/MODIFIED/DELETED with 5-20 line BEFORE/AFTER blocks — rather than making him navigate.
- **State the ref, correctly.** A mis-stated READY-AT sends the reviewer to the wrong object.
- **Name the judgement calls you want attacked.** A review that only confirms is a review you wasted.

## ⛔ HE IS STATELESS PER-INVOKE
Each message spins a fresh session with **no memory of his own prior turns.** Anything multi-turn must carry its context **in the prompt or in a committed file.** Never assume he recalls what he said.

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
The card **STAYS in `Implementation`**; set **Blocked on = Langston**. ⚠️ **On a SENT-BACK verdict the card does NOT move** — only the `Review` field changes, and **LANGSTON sets `Review` himself**, not you.
★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

4. **Code Review** — Langston reviews the actual `git diff` **AT THE GRADED REF (`origin/migration/aws-supabase`) — i.e. AFTER the push to the REVIEW branch, and BEFORE it advances to `main`.** Code-level, not high-level gloss. Change list in `Claude Comms and Packages/Change Lists/`. **(Corrected 2026-07-23 — Kyle: "Langston reviews the review branch on GitHub, so it's already been pushed." The old "BEFORE push" wording contradicted §6.5's own instruction to commit-and-push before dispatching, and contradicted reality: he reads at a ref, so an unpushed diff is a file that does not exist for him. The review gate is the advance to `main`, not the push to the review branch.)**
