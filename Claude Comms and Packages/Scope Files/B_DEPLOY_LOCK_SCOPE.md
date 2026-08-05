# B-DEPLOY-LOCK — Step-1 scope (#649) — **rev 3**

**change-class: `non_architecture`**
**Owner:** CC-B · **Date:** 2026-08-04 (rev 2: 2026-08-05, incorporating Langston Step-1 F1–F4 + CC-A's third-category attack)
**Sequence:** Kyle-directed, top of the backlog.
**Rev history:** rev 1 `f75b98eea` → CHANGES-NEEDED (F1-F4; his first live board write) → rev 2 `1c4bad763` → CHANGES-NEEDED (the row-55 mis-homing + F5) → rev 3 `21417d1d2` → CHANGES-NEEDED (F5/stale-200 in prose but not in the GRADED OBJECTIVES; wrong citation range) → this rev.

---

## 1. ★ PROVENANCE READ (§2 1.b + rule 24.0) — AND IT CHANGES THE BATCH

**Corpora searched, named:** `CLAUDE.md` §2 step 6 + §7, `CHANGES_AND_FIXES.md`, repo-wide grep for any lock/flock/deploy-guard, direct listing of staging executables. **Langston independently re-derived §1 at his review, with a positive control** (his `*deploy*`-on-PATH sweep returned zero while the same loop found `pm2` twice — the instrument reaches).

★★ **THE FINDING: THERE IS NO DEPLOY PATH TO PUT A LOCK INTO.**
- **No deploy SCRIPT exists on staging.** ⛔ *(rev 2 population fix — Langston's nit, rule 29(a) binds true claims too: rev 1 said `/home/deploy/` "holds those two and nothing else," which is false as written — the directory also holds ~30 `.sql`/`.txt` files. The claim is about SCRIPTS: exactly two `.sh` files, `add_alert.sh` and `watch_xstock.sh`, neither deploy-related, and zero `*deploy*` executables anywhere on `$PATH`.)*
- **Every deploy is an ad-hoc SSH command line** typed by hand, copied out of the docs.
- **Repo-wide grep for an existing lock: nothing relevant.**

⇒ **The batch is: CREATE the sanctioned path, then lock it.**
★ **Disposition — rule 24 outcome (2):** nothing is broken; the ad-hoc line was correct when ONE session deployed. Three concurrent sessions is the condition never decided for.

⛔ **F1 FINDING (Langston, rev 2) — THE TWO LIVE DOCS ALREADY DISAGREE, AND REV 1 INHERITED THE WRONG ONE.** `SYSTEM_MANUAL.md:12734` states a deploy-ordering **INVARIANT** *(rev 2 cited `:12733` — a blank line; the wrong number originated in Langston's rev-1 review and he corrected it against himself at rev 2's)*: `npm run db:migrate` runs **between `build` and `pm2 restart`**. `CLAUDE.md:72`/`:431` — the line rev 1 modelled `dt-deploy` on — **omits it**. ⇒ rev 1's sequence would have made every migration batch and every batch-specific backfill **unable to use `dt-deploy` at all**, sending exactly those sessions back to hand-typing — **the enforcement failing on the batches that most need it** (a migration deploy is the highest-stakes deploy we have). **`dt-deploy` therefore chains migrate in, plus a `--pre-restart '<npm script>'` hook for batch-specific steps** (e.g. the B79.0n backfill pattern).
⛔ **F5 (Langston, rev 3) — THE FOUR LIVE SITES PRESCRIBE THREE DISTINCT CHAINS, and rev 2 nearly repeated F1's mistake on a different step.** `POST_REPLIT_WORKFLOW.md:162` is the ONLY site that installs dependencies (`npm ci`); rewriting it to a `dt-deploy` without one would **silently delete dependency installation from the one doc that prescribes it** — a lockfile-changing batch then deploys against stale `node_modules` **and every post-condition still passes** (HEAD, process-online and HTTP 200 all hold). ⇒ **`dt-deploy` runs `npm ci` CONDITIONALLY: when `package-lock.json` differs between the currently-deployed sha and the target sha** (the common no-change case stays fast; the correctness case is automatic; no doc-favouritism — which is exactly how rev 1 went wrong on migrate).
★ **§13 HOME FOLDED IN (Langston-directed): `RUNNING_ISSUES` #140 — deploy-procedure step ordering, Tier-3, open since 2026-05-25 — is HOMED HERE. This batch is its home; nothing else will ever be.**

## 2. The failure being prevented — and rev 2's sharper statement of who gets hurt

**THE UNCOVERED CASE:** two sessions deploy close together; the second silently replaces the first's running code **mid-verification**. Every §9.3 check and live-evidence claim in that window is then about code that is no longer running, **and nothing says so**. Same class as #647: **the loser is not told they lost.**

⛔ **F4 FINDING (Langston, rev 2) — REV 1's OBJECTIVES PROTECTED THE WRONG PARTY.** Refusing the *second* invocation protects the second deployer — but §2's harm lands on the **FIRST** (their evidence silently invalidated). And the accepted residual (hand-typed bypass) hits precisely that unprotected first party, making a sha record **worse than absent: authoritative-looking and wrong**. ⇒ **rev 2 adds the detection half:** record the deployed sha **plus the pm2 `restart_time` counter** — ⛔ **NOT monotonic (Langston, correcting his own rev-2 premise at Step-2): `pm2-deploy.service` is `pm2 resurrect` from `dump.pm2`, which carried 357 against a live 543 — a boot can move the counter BACKWARD.** ⇒ the comparison is **"DIFFERS", never "increased"**, read on THREE branches: **sha drift = overwrite (the #647 signal) · restart_time HIGHER = crash-restart · restart_time LOWER = boot-resurrect** *(resurrect-restores-counter is his hypothesis; the 357-vs-543 divergence is measured; one `pm2 save`-and-compare at Step-3 settles it)*, and **Step-7/8 verification MUST compare recorded vs live before making any evidence claim.** Divergence = *the code under you changed*. **The residual stops being silent — which was the actual §2 defect.**

⛔ **WHY THE DELIVERY BOARD CANNOT DO THIS** (Kyle hoped it could): rule 25.b — the board *"REPORTS, it does not BLOCK."* Measured: four collisions in one evening WITH a claim convention in place, two silently destructive.

★★ **THE THIRD CATEGORY (CC-A's attack, rev 2 — and it reshapes the design principle).** Rev 1's model was a dichotomy: *unaware collision* vs *deliberate override*. **CC-A evidenced a third from his own week: AWARE, COMPLIANT, AND WRONG** — the session holds the convention, follows it, and the write still lands as a no-op, on the wrong target, or over someone else's state, with a success code either way. **No lock touches that category. A POST-CONDITION does:** *after any write, read the object back and assert it reached the intended state* — not "did the command return 0," not "did I hold the lock." ⇒ **`dt-deploy` ends by ASSERTING its post-conditions at the objects** — running HEAD equals the requested sha (read from the clone, not from the script's belief), service online, HTTP 200 — **and writes its sha/restart_time record ONLY after those assertions pass.** A deploy that cannot prove its post-condition **fails loudly and records nothing**.
★ **This is NOT new ceremony (Langston, rev 3): `POST_REPLIT_WORKFLOW.md:166-171` has prescribed this exact evidence list in prose since post-Replit** — deployed commit hash confirmed, PM2 online, HTTP 200 at :170, and **:171 — "the staging site is serving the INTENDED BUILD" — the strongest pre-existing support for the build-identity assertion** — **and nobody runs it.** *(rev 3 first cited :163-168 — a fence line and a range that EXCLUDED the two load-bearing lines; an off-by-a-few in the rev correcting an off-by-a-few. A range citation needs the same enumerate-and-match treatment as a line citation — Langston.)* The post-condition is the existing rule, finally mechanized.**
⚠️ **One screw tightened (Langston): the HTTP 200 assertion must hit an endpoint that REFLECTS THE NEW BUILD, not a static health route — a stale process serves 200 perfectly well, and "aware, compliant, and wrong" is exactly the session that would accept it.** Implementation detail resolved at Step-3: assert on a response that carries the running build's identity (e.g. a version/sha endpoint), not on liveness alone.

★ **Governing principle unchanged: "prefer IMPOSSIBLE over INTERCEPTED" (Langston; §7.1's disabled-push-URL precedent).**

## 3. Objectives (rev 3)

| # | objective |
|---|---|
| OBJ-1 | One sanctioned `dt-deploy` on staging: fetch → **fail loud on dirty worktree (F3)** → reset to a **NAMED sha** → **conditional `npm ci` — runs when `package-lock.json` differs between deployed and target sha (F5), BEFORE build** → build → **`db:migrate` (F1 — the SYSTEM_MANUAL:12734 invariant, restored)** → optional `--pre-restart '<npm script>'` (F1) → restart → **post-condition assertions (CC-A): live HEAD == requested sha (read from the clone), process online, and an HTTP response that CARRIES THE RUNNING BUILD'S IDENTITY — never a bare 200 from a static health route (the stale-200 case)** |
| OBJ-2 | Exclusive lock for the duration; a second concurrent invocation **REFUSED, not queued** |
| OBJ-3 | Refusal names **holder + sha + since-when** |
| OBJ-4 | Stale lock broken **only** via the #540 tier-3 protocol, **stated in the refusal text itself** |
| OBJ-5 | **The FIVE live-prescriptive sites of the raw command are rewritten to point at `dt-deploy` (F2):** `CLAUDE.md:72` · `CLAUDE.md:431` · `SYSTEM_MANUAL.md:12734-12742` · `LEVER_INVENTORY.md:511` · `Claude Comms and Packages/POST_REPLIT_WORKFLOW.md:162` *(rev 1 counted 2 — Langston's whole-tree sweep at `3430238` found 5; the sweep completeness is load-bearing on §4's argument)*. ⛔ **EXPLICIT EXCLUSION: historical records are NOT rewritten** — completion reports, `PHASE_HISTORY`, `CHANGES_AND_FIXES`, past design asks, `_archive/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md:88` are records of what happened; rewriting them falsifies the record. **Live-prescriptive swept; historical untouched; this line is why the survivors are not a missed sweep.** |
| OBJ-6 | Deployed **sha + pm2 `restart_time`** recorded on success (F4); **Step-7/8 asserts recorded-vs-live on THREE branches before any evidence claim: sha drift = overwrite · counter higher = crash-restart · counter LOWER = boot-resurrect (the counter is NOT monotonic — Step-2)** |
| OBJ-8 | **DELETE `.github/workflows/deploy-staging.yml` (F-B, DECIDED at Step-2, rule 18):** dormant EC2-era deployer, zero runs ever, prescribing the dead chain — removed in this batch, logged in `DELETED_COMPONENTS_LOG`. |
| OBJ-7 | ⛔ **NEVER `git reset --hard` through a dirty worktree (F3).** Measured at review: the deploy clone was dirty **right then** (modified `bridge/canonical/mapping-regime-strategy.json` + 9 untracked files). Today's `git pull` REFUSES on that; rev 1's `reset --hard` would have **silently discarded it**. `dt-deploy` must not introduce a destructive failure mode the ad-hoc line doesn't have. |

## 4. ⚠️ The honest limit — enforcement, not prevention (held, with F2 closing its gap)

**A session hand-typing the raw sequence still bypasses the lock.** Langston accepted the accidental-not-adversarial model and both rejected alternatives (post-merge hook: adds a failure mode to every legitimate pull, misses build/restart; shell restriction: disproportionate) — **conditional on F2's sweep being complete**: rev 1 left the raw command in the System Manual, one grep from a session mid-deploy, which hollowed the argument. Rev 2's OBJ-5 sweeps all five live sites. **And F4/OBJ-6 converts what the lock can't prevent into something detection catches.**

## 5. Out of scope
Board-checker integration (Kyle deferred) · `main`-advance locking (already gated) · trading engine (untouched). **#140 is IN scope (F1) — homed here.**

## 6. Verification posture — three provoked cases, no silence read as success

1. **Concurrent refusal:** hold the lock, attempt a second deploy → REFUSED, holder + sha + since-when named.
2. **Dirty worktree (F3):** dirty the clone deliberately → `dt-deploy` refuses loudly, discards nothing.
3. **Stale lock (OBJ-4):** plant a dead-holder lock → refusal text prints the #540 tier-3 protocol.

Plus the post-condition assertions run on every real deploy by construction (CC-A). **Absence of a collision proves nothing; #594 and #637 both nearly closed on exactly that silence.**
