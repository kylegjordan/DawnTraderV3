---
name: workflow
description: The 11-step DawnTrader batch workflow. Use when starting, resuming or closing ANY batch, or before working any step - scope, pre-implementation audit and implementation plan, implementation, code review, CI, deploy, verification, iterate, governance, completion report.
---

# THE DAWNTRADER BATCH WORKFLOW — INDEX

⛔ **READ THE STEP FILE FOR THE STEP YOU ARE ON. This index is the map, not the instructions.**
A batch is **NOT done** until every numbered scope objective is verifiably achieved in the staging UI and confirmed by **both** CC and Langston.

## HOW TO USE THIS
Find your step below, then **read its file** — `steps/NN-name.md` in this skill's own directory. Each file is self-contained and deliberately NOT short: correctness matters more than brevity inside a step. Only the step you are on needs reading.

| # | step | file | ends when |
|---|---|---|---|
| 1 | Planning + Scope | `steps/01-scope.md` | Langston approves the scope |
| 2 | **Pre-Implementation Audit AND Implementation Plan** | `steps/02-audit-and-plan.md` | Langston signs off ONCE, on both |
| 3 | Implementation | `steps/03-implementation.md` | code written, committed, pushed |
| 4 | Code Review | `steps/04-code-review.md` | Langston clears the diff **at the graded ref** |
| 5 | GitHub Push + CI | `steps/05-ci.md` | **4/4 jobs green, verified PER-JOB** |
| 6 | Staging Deploy | `steps/06-deploy.md` | `dt-deploy` records the sha + ENGINE RESUMED |
| 7 | First-Pass Verification (CC) | `steps/07-verify-cc.md` | evidence captured, **UI navigated** |
| 8 | Second-Pass Verification (Langston) | `steps/08-verify-langston.md` | he confirms independently |
| 9 | Iterate | `steps/09-iterate.md` | every objective green |
| 10 | Governance Updates | `steps/10-governance.md` | every applicable Tier-1/Tier-2 doc landed |
| 11 | Completion Report | `steps/11-completion.md` | Langston confirms; Kyle acknowledges |

## THE RULES THAT BIND EVERY STEP
- ⛔ **Never push on red CI.** Never skip a step. If tempted to skip, say so rather than skipping.
- ⛔ **Report at a STEP BOUNDARY only**, in the `CONDUCT.md` §6 format — then **continue to the next step in the same turn**. Do not wait to be told to proceed. Stop only for a decision that is genuinely Kyle's.
- ⛔ **Update your `CURRENT POSITION` block at every step boundary** — batch, step, blocked-on, next. A stale marker reads as current and is worse than none.
- ⛔ **A found bug is a hypothesis** — three outcomes, never collapsed. See `CONDUCT.md` §9.
- ⛔ **Name the object and the population** for every number, and **run the positive control first**. `CONDUCT.md` §10.
- ⛔ **Search the ledger before filing anything as a finding** — `RUNNING_ISSUES.md` + `BATCH_CATALOG.md` + completion reports. A deliberate, Kyle-approved decision reported as a defect is worse than no finding.
- ⛔ **Every "fix it later" gets a named home at the moment of agreement** — a named batch, a numbered roadmap item, or a dated task.

## WHY YOU WERE TOLD TO COME HERE
`CLAUDE.md` §0.a carries a deliberately loud pointer to this skill because **auto-invocation of skills is measured-unreliable** — Anthropic has multiple open issues on it, and the failure is worst for skills that overlap trained behaviour, which is every step above. **That pointer and this skill's description are two independent legs, neither sufficient alone.** If you arrived here by either, you are in the right place; read your step's file.
