# B-DEPLOY-LOCK — Step-1 scope (#649)

**change-class: `non_architecture`**
**Owner:** CC-B · **Date:** 2026-08-04
**Sequence:** Kyle-directed, queued at the TOP of the backlog ahead of the cleanup work — it protects the correctness of every verification claim we make.

---

## 1. ★ PROVENANCE READ (§2 1.b + rule 24.0) — AND IT CHANGES THE BATCH

**Corpora searched, named:** `CLAUDE.md` §2 step 6 + §7 (the documented deploy command), `CHANGES_AND_FIXES.md`, a repo-wide grep for any existing lock/flock/deploy-guard, and a direct listing of executables on the staging box.

★★ **THE FINDING: THERE IS NO DEPLOY PATH TO PUT A LOCK INTO.**
- **No deploy script exists on staging.** `/home/deploy/` holds `add_alert.sh` and `watch_xstock.sh` and nothing else; there is no `*deploy*` executable anywhere on `PATH`.
- **Every deploy is an ad-hoc SSH command line** that each session types by hand, copied out of `CLAUDE.md`: `ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && git pull … && npm run build && pm2 restart dawntrader'"`.
- **Repo-wide grep for an existing lock: nothing.** The three hits are unrelated (retention sweep, QD probe, bridge sync).

⇒ **The issue as filed says "put a lock in the deploy path." There is no deploy path. So the batch is: CREATE the sanctioned path, then lock it.** ⚠️ **That is a bigger change than #649 implies and it is stated here rather than discovered at implementation.**

★ **DISPOSITION — rule 24 outcome (2), working-as-designed-but-UNADDRESSED.** Nothing is broken. The ad-hoc command was correct when one session deployed; **three concurrent sessions is the condition that was never decided for.**

## 2. The failure being prevented — and why the board cannot prevent it

**THE UNCOVERED CASE:** two sessions run the deploy sequence close together. The second `git reset`/`pull` + `build` + `pm2 restart` **silently replaces the first session's running code, mid-verification.**
⚠️ **Every §9.3 UI check, every log reading and every live-evidence claim made in that window is then about code that is no longer running — AND NOTHING SAYS SO.** ★ **The loser is not told they lost.** That is the same class as the lost-update defect (#647): a concurrent write that destroys another's work while both parties believe they succeeded.

⛔ **WHY THE DELIVERY BOARD CANNOT DO THIS, stated because Kyle hoped it could:** rule 25.b already settles it — the crew board *"REPORTS, it does not BLOCK. A green board is not a guarantee."* **Measured, not theoretical:** on 2026-07-31/08-01 three sessions collided on the same alert rows **four times in one evening WITH a claim convention already in place**, and two collisions **silently destroyed each other's writes**. ⇒ **an advisory mechanism does not stop a concurrent actor.**

★ **THE GOVERNING PRINCIPLE — "prefer IMPOSSIBLE over INTERCEPTED" (Langston; §7.1's precedent is the backup remote's deliberately invalid push URL: *"a push from it fails at git, not at somebody's memory"*).**

## 3. Objectives

| # | objective |
|---|---|
| OBJ-1 | A single sanctioned deploy command on staging (`dt-deploy`) that performs the whole sequence — fetch, reset to a NAMED sha, build, restart, verify HTTP 200 |
| OBJ-2 | It takes an **exclusive lock** for the duration; a second concurrent invocation is **REFUSED, not queued and not warned** |
| OBJ-3 | The refusal names **who holds it, which sha they are deploying, and since when** — so nobody has to ask in the channel |
| OBJ-4 | **A stale lock is never broken automatically** — only via the #540 tier-3 protocol (no live process across several samples + mtime frozen ≥60s), stated in the refusal message itself |
| OBJ-5 | `CLAUDE.md` §2 step 6 and §7 are rewritten so the raw command **no longer appears anywhere** — sessions copy what the docs show |
| OBJ-6 | The lock records the deployed sha, so "what is actually running on staging" is answerable without inference |

## 4. ⚠️ The honest limit — this is enforcement, not prevention

**A session that types the raw `git pull && npm run build && pm2 restart` by hand STILL BYPASSES THE LOCK.** We cannot make that literally impossible without measures out of proportion to the risk.
★ **WHY THAT IS ACCEPTABLE, AND THE REASONING SHOULD BE CHALLENGED IF WRONG: the failure mode is ACCIDENTAL, not adversarial.** Every collision this project has had came from two sessions **unaware of each other**, never from one deliberately overriding another. **Removing the raw command from the documentation removes the thing sessions actually copy.**
⇒ **THEREFORE OBJ-5 IS NOT COSMETIC — it is the enforcement.** A lock in a script nobody is pointed at is precisely the advisory mechanism this batch exists to replace.
**Considered and rejected as disproportionate:** a `post-merge` hook in the staging clone (catches a raw `git pull` but not `build`/`restart`, and adds a failure mode to every legitimate pull); restricting the `deploy` user's shell.

## 5. Out of scope
- The delivery-board checker integration (**Kyle deferred it 2026-08-03**: see how the board is used first).
- `main`-advance locking — different act, already gated by review + Kyle's acknowledgement.
- Anything touching the trading engine.

## 6. Verification posture
⚠️ **Absence of a collision proves nothing** — collisions are rare and we would be reading silence. ⇒ **the PROVOKED case is the evidence: hold the lock, attempt a second deploy, and confirm it is REFUSED with the holder named.** **Same discipline as #594 and #637**, both of which would have closed on a meaningless green had the failing case not been forced.
