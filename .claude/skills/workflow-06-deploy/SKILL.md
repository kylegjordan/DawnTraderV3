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

## ⛔ WHAT `dt-deploy` ACTUALLY DOES — SO YOU KNOW WHAT IT HAS AND HAS NOT PROVEN
**The chain, in order, all in one command so no step can be forgotten:** take the lock → fetch → confirm the sha is ON the branch → **fail loud on a dirty worktree** (it refuses; it does not destroy) → reset to the NAMED sha → `npm ci` **only if the lockfile changed** → build (writes `dist/BUILD_SHA`) → `db:migrate` → optional `--pre-restart` → `pm2 restart` → **assert the post-conditions AT THE OBJECTS** → write the record.
★ **THE RECORD IS WRITTEN ONLY AFTER THE ASSERTIONS PASS**, so a record’s existence means the deploy actually took — `/home/deploy/dawntrader-deploy.record`.
★ **IT ASSERTS THE RUNNING CODE’S OWN IDENTITY AND THAT THE ENGINE RESUMED — never a bare "the server responded."** A 200 from a process running last week’s build is not a deploy.

## ⛔ THE LOCK — IT REFUSES, IT NEVER QUEUES
`/home/deploy/dawntrader-deploy.lock`, **deliberately OUTSIDE the repo so the deploy’s own reset cannot destroy the lock protecting it.** A second invocation is **REFUSED**, naming the holder, their sha and how long they have held it. **That refusal is the system working — go and talk to the holder.**
⛔ **A stale lock is broken ONLY under the #540 tier-3 protocol** — reported-blocking AND no live process across several samples AND mtime frozen ≥60s — and **`dt-deploy` will never break its own.** *(Origin: the moment two agents could deploy to one box, a hand-typed chain became a race where the second deploy silently replaced the first mid-verification and the loser was never told.)*

## ⛔ `--by <session>` IS REQUIRED, AND IT IS RECORDED AS A CLAIM
**Every session reaches this box as the SAME unix identity** (root → `su deploy`), so the observed identity **structurally cannot** attribute a deploy to a session. The flag is **refuse-not-guess**: no `--by`, no deploy. It is recorded as **`deployed_by_claimed`** — explicitly a CLAIM — with the observed identity kept alongside as `deployed_via`. ★ **Never dress a claim as proven** (#447/#656).

## ⛔ WHAT IT DELIBERATELY DOES **NOT** DO
- **It never pushes.** Staging is TERMINAL (§7.1) — the script contains no push and never will.
- **It does not `pm2 save`** (#652, homed to P19-B12 — not absorbed here).
- **It does not break its own stale lock.**
⇒ **ROLLBACK IS A DEPLOY, NOT A COMMAND.** There is no rollback flag: you deploy the previous good sha, by the same path, with the same `--by`, and you verify it the same way. **Know that sha BEFORE you deploy** — read the record.

## BEFORE YOU DEPLOY
- **A deploy restarts live trading.** It is deliberate and manual, owned by the session that owns the batch.
- **"This batch needs no deploy" is NOT "this branch needs no deploy."** Another session's runtime change may be sitting on the branch undeployed. Check the compare range, and if it is theirs, **tell them** rather than deploying their work.

## ⛔⛔ A DEPLOY WIPES EVERY IN-MEMORY ROLLING WINDOW — PLAN THE VERIFICATION AROUND IT
**A restart is not neutral.** Anything held in a plain in-process structure — rolling windows, warm-up counters, ring buffers, caches, latches — **is emptied, and the component then reports its COLD behaviour while presenting as normal.**
**MEASURED 2026-08-21, after being invisible for days:** the AMR's EV-gap window is an in-memory `Map` with **no persistence**, against **571 recorded restarts**. From 17–21 August it held **ZERO observations across ~2,878 cycles per day**, so the input-completeness clamp fired on 99.9% of them and the AMR was input-blind through the strongest trading days of the month. **Nothing announced it.** *(Contrast: the macro feed's rolling baseline was DELIBERATELY made restart-durable. Same class of state, opposite treatment — that asymmetry is what made it findable at all.)*
⇒ **BEFORE deploying, ask what warm state this restart destroys and how long it takes to return.**
⇒ **AFTER deploying, a warm-up-dependent reading is NOT verifiable until it re-warms** — and *it reads cold* is not *it is broken*. **State the warm-up window in the verification instead of measuring through it.**


## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
The card is already in **`CI + Deploy`** from Step 5. Leave it there until the deploy is verified.
★ **YOU move the card; LANGSTON sets `Review`.** *(Kyle 2026-08-03 — his approval gates the move but is not the move, or the board freezes every time he is mid-review.)*
⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT, PRESERVED VERBATIM
> This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**

6. **Staging Deploy** — `ssh root@188.245.193.8 "su - deploy -c 'dt-deploy <full-40-char-sha> --by <session>'"` (**B-DEPLOY-LOCK #649: `dt-deploy` is THE deploy path — NEVER the raw git-pull/build/restart chain.** It locks against concurrent deploys, refuses a dirty worktree, runs `db:migrate` in-chain per the SYSTEM_MANUAL invariant, conditionally `npm ci`s on a lockfile change, and asserts sha-identity + ENGINE RESUMED before recording. `--pre-restart '<npm script>'` for batch-specific steps. **The sha is the FULL 40-char reviewed commit — #621.**)
