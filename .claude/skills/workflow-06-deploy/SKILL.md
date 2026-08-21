---
name: workflow-06-deploy
description: STEP 6 ONLY of the DawnTrader batch workflow - Staging Deploy. Use when releasing a reviewed, CI-green 40-character commit sha to the Hetzner staging server using dt-deploy. NOT for pushing to GitHub, NOT for checking that the deployed change works.
---

# STEP 6 — STAGING DEPLOY

**Ends when:** `dt-deploy` records the sha and asserts ENGINE RESUMED.

## THE ONLY DEPLOY PATH
```
ssh root@188.245.193.8 "su - deploy -c 'dt-deploy <FULL-40-CHAR-SHA> --by <session>'"
```
⛔ **NEVER the raw git-pull/build/restart chain.** `dt-deploy` locks against concurrent deploys, refuses a dirty worktree, runs `db:migrate` in-chain, conditionally `npm ci`s on a lockfile change, and **asserts sha-identity + ENGINE RESUMED before recording.**
⛔ **The sha is the FULL 40 characters of the REVIEWED commit.** `--pre-restart '<npm script>'` for batch-specific steps.

## BEFORE YOU DEPLOY
- **A deploy restarts live trading.** It is deliberate and manual, owned by the session that owns the batch.
- **"This batch needs no deploy" is NOT "this branch needs no deploy."** Another session's runtime change may be sitting on the branch undeployed. Check the compare range, and if it is theirs, **tell them** rather than deploying their work.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

6. **Staging Deploy** — `ssh root@188.245.193.8 "su - deploy -c 'dt-deploy <full-40-char-sha> --by <session>'"` (**B-DEPLOY-LOCK #649: `dt-deploy` is THE deploy path — NEVER the raw git-pull/build/restart chain.** It locks against concurrent deploys, refuses a dirty worktree, runs `db:migrate` in-chain per the SYSTEM_MANUAL invariant, conditionally `npm ci`s on a lockfile change, and asserts sha-identity + ENGINE RESUMED before recording. `--pre-restart '<npm script>'` for batch-specific steps. **The sha is the FULL 40-char reviewed commit — #621.**)
