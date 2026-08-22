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

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

4. **Code Review** — Langston reviews the actual `git diff` **AT THE GRADED REF (`origin/migration/aws-supabase`) — i.e. AFTER the push to the REVIEW branch, and BEFORE it advances to `main`.** Code-level, not high-level gloss. Change list in `Claude Comms and Packages/Change Lists/`. **(Corrected 2026-07-23 — Kyle: "Langston reviews the review branch on GitHub, so it's already been pushed." The old "BEFORE push" wording contradicted §6.5's own instruction to commit-and-push before dispatching, and contradicted reality: he reads at a ref, so an unpushed diff is a file that does not exist for him. The review gate is the advance to `main`, not the push to the review branch.)**
