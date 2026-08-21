---
name: workflow-05-ci
description: STEP 5 ONLY of the DawnTrader batch workflow - GitHub Push and CI. Use when confirming all four GitHub Actions jobs are green on the branch head: TypeScript Check, Test Suite, Build, Docker Build. NOT for deploying to staging, NOT for any verification of behaviour.
---

# STEP 5 — GITHUB PUSH + CI

**Ends when:** all four jobs are green, **verified per-job**.

## THE FOUR JOBS
**TypeScript Check (baseline gate) · Test Suite · Build · Docker Build.**

## DO
```
gh run list --branch migration/aws-supabase --limit 1
gh run watch <run-id> --exit-status      # if queued or in_progress
```
⛔ **VERIFY PER-JOB, NOT THE RUN-LEVEL `conclusion`.** A cancelled job has read as not-green at the run level before. Pull `jobs[].conclusion` and check all four.
⛔ **NEVER PUSH ON TOP OF RED CI.**
**The completion report must cite the run ID and its green status.**

## THE BASELINE GATE
Errors **vanishing** from files your push did **not** touch is the signature of **tsc not seeing the code** — a partial parse failure, an excluded directory, a moved file — **not of a fix**. That exact misreading put a broken parse on staging.
**The discriminator:** if other errors in that file are still reported, tsc IS reading it and the drop is genuine. **Check before regenerating**, and if the cause is another session's work, **it is theirs to acknowledge, not yours** — the acknowledgement IS the explanation.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

5. **GitHub Push + CI** — Push to GitHub. CI runs 4 jobs: TypeScript Check, Test Suite, Build, Docker Build. **All 4 must be GREEN.** Do not push on top of red CI.
