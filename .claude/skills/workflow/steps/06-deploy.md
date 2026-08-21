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
