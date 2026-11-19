---
name: workflow-05-ci
description: STEP 5 ONLY of the DawnTrader batch workflow - GitHub Push and CI. Use when confirming all four GitHub Actions jobs are green on the branch head - TypeScript Check, Test Suite, Build, and Docker Build. NOT for deploying to staging, NOT for any verification of behaviour.
---

# STEP 5 — GITHUB PUSH + CI

**Ends when:** all four jobs are green, **verified per-job**.

## THE FOUR JOBS
**TypeScript Check (baseline gate) · Test Suite · Build · Docker Build.**

## DO
Push the reviewed commit to GitHub (`migration/aws-supabase`), then read CI at that head:
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

## ⛔ A GATE THAT REFUSES IS NOT AUTOMATICALLY RIGHT — AND YOU STILL DO NOT ROUTE AROUND IT
**Measured 2026-08-21:** the push guard refused every push with *the tsc baseline comparator is missing* while that file was present **both locally and at origin**. It resolved the path relative to its own working directory, so a hook process started elsewhere could never find it. **A fail-closed gate refusing on a FALSE absence is the exact error the gate exists to prevent, aimed at itself.**
**SO, IN ORDER:** (1) **verify the refusal is real** — go and look for the thing it says is missing, at the path AND at the ref; (2) if the gate is wrong, **FIX THE GATE**, and say so; (3) **never work around it, never disable it, never re-run until it happens to pass.**
⚠️ **A gate that blocks correct work teaches people to route around gates — and that is how a real regression eventually gets waved through.**


## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`CI + Deploy`**. While CI runs, **Blocked on = External**.
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A05`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A05`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
