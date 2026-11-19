# WORKFLOW SHARED CONTRACT — the rules every step skill shares, held once

> **B-WORKFLOW-IMPROVE OBJ-11 (Q10), 2026-11-20.** Each passage below stood, word for word, in several step skills. It now stands here once, and each of those skills names this file at the point where the rule applies. **Moved, not rewritten:** every passage is byte-identical to the text it replaced (the move ledger `Claude Comms and Packages/Change Lists/B_WORKFLOW_IMPROVE_MOVE_LEDGER.json` records each one with its SHA-256).
> **Binds both crews.** Claude sessions reach it from the step skill that names it; Codex sessions reach it the same way and from `AGENTS.md` §2.
> **The step skill stays authoritative for its own step.** Where a skill adds a step-specific line (which board column, which gate), the skill's line wins for that step; this file holds only what is the same everywhere.

| § | rule | named by |
|---|---|---|
| 1 | a fresh reader for a load-bearing claim | `workflow-02`, `workflow-04`, `workflow-07`, `workflow-11`, `bug-investigation` (its one-pass rule), `workflow-hotfix` |
| 2 | the delivery board — who moves the card, and what it may hold | every step skill `workflow-01` … `workflow-11` |
| 3 | Langston is stateless per invoke | `workflow-04`, `workflow-08`, `workflow-hotfix` |

---

## 1. A FRESH READER FOR A LOAD-BEARING CLAIM

<!-- WI-MOVED id=WI-F1 -->
### WI-F1 — the fresh-reader rule, as it stood in workflow-02, -04, -07 and -11

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
<!-- /WI-MOVED id=WI-F1 -->

---

## 2. THE DELIVERY BOARD — WHO MOVES THE CARD, AND WHAT IT MAY HOLD
*(Each step skill keeps its own first line: which column the card moves to and what `Blocked on` is set to.)*

<!-- WI-MOVED id=WI-B1 -->
### WI-B1 — the two board lines, as they stood in every step skill workflow-01 … workflow-11

★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.
<!-- /WI-MOVED id=WI-B1 -->

---

## 3. LANGSTON IS STATELESS PER INVOKE

<!-- WI-MOVED id=WI-S1 -->
### WI-S1 — the stateless line, as it stood in workflow-04

Each message spins a fresh session with **no memory of his own prior turns.** Anything multi-turn must carry its context **in the prompt or in a committed file.** Never assume he recalls what he said.
<!-- /WI-MOVED id=WI-S1 -->
