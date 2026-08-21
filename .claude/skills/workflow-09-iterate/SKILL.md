---
name: workflow-09-iterate
description: STEP 9 ONLY of the DawnTrader batch workflow - Iterate. Use when a scope objective was not met and the fix-review-push-deploy-verify loop must run again. NOT for the initial implementation, NOT for writing governance documents.
---

# STEP 9 — ITERATE

**Ends when:** every scope objective is green.

If any objective is not met: **fix → Langston reviews → push → CI → deploy → verify.** Repeat until all green.
⛔ **Do not close with an objective silently unmet.** An open item is disclosable — a **named owner, a dated home, and BOTH a closing condition and a failure condition written before the fact.** What disqualifies a close is an objective *claimed* on evidence nobody can read.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

9. **Iterate** — If any scope objective not met: fix → Langston reviews → push → deploy → verify. Repeat until all green.
