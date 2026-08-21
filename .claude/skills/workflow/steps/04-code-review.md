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
