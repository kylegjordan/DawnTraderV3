# B-GOV-INTEGRITY-0 — Scope (governance-checker repair; Kyle directive 2026-07-10 "finish fixing the governance system")

change-class: non_architecture

**Batch:** B-GOV-INTEGRITY-0 — repair the governance checker so it grades against the real rulebook and can never again silently fall behind. Checker/infra tooling only (`scripts/governance-checker/`); NO strategy / regime / signal-pipeline / filter / EV-math / trading-engine change — hence `non_architecture`. Emergency-directed by Kyle after the 2026-07-10 investigation; Step-1 scope declared here retroactively-honestly (the work is real and reviewed).

## Objectives
1. **F0 (#449 root cause) — DONE + VERIFIED IN PRODUCTION.** `poller.mjs loadExceptions()` reads GOVERNANCE_EXCEPTIONS.md at the graded ref (`git show ${BRANCH}:…`), not the stale working tree, and FAILS LOUD on an empty/unreadable rulebook (raises a critical alert + refuses to grade) rather than silently returning `{}`. Proven: poller.test.mjs 64/64; Langston negative test (worktree 1 na-skip vs origin 10 → 6 false alarms suppressed, 0 regression); real enforcing tick exit 0, 0 false alarms in the live store, real gaps kept-not-silenced. Commit 3745e48a3.
2. **F9 (recurrence guard, #490) — drift canary DONE (this batch).** Each tick, `checkerCodeDrift()` compares the deployed checker code subtree (`HEAD:scripts/governance-checker`) to origin's and raises a warning `gov-code-drift` alert on divergence, auto-resolving when matched. Scoped to the checker's OWN code (not the repo), so doc pushes never trip it. Commit f17b5370c. Remaining under F9: a redeploy trigger so a push reaches the box.
3. **OBJ-1 seam (`--evidence` on the checker's resolve calls)** — sequenced BEHIND OLD Claude's B-GOV-INTEGRITY-1 Layer-A (generic CLI must accept + shape-check `--evidence-kind`/`--evidence-ref` first). The checker's Layer-B verifies its own evidence at the ref before resolving (doc-commit → cat-file + path-present-at-ref; na-skip → row parsed at origin) and never resolves unverifiable. Lands as its own diff after Layer-A.

## Verification criteria
- Checker grades against origin's rulebook while a stale worktree is present (negative test) — MET.
- Real enforcing tick runs clean, false #449 alarms absent from the live store — MET.
- Drift canary fires on forced `GOV_BRANCH=<older-checker-ref>` and clears on a current tick — in live verification.
- All four CI jobs green on each push — MET per commit.
- Langston Step-4 on every diff — MET (F0, F9 canary).
