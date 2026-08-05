# B-DEPLOY-LOCK — Pre-Implementation Audit (#649, absorbs #140)

**Owner:** CC-B · **change-class:** `non_architecture` · **Date:** 2026-08-05
**Scope:** `B_DEPLOY_LOCK_SCOPE.md` rev 4 (`7f7132e23d…`, Langston Step-1 APPROVED after 4 revs)
**Kyle's directive for this audit, verbatim intent:** review ALL recent governance systems + the repo-commit-push flow, establish each one's intent, prove no conflicts — *"this is where the value is found and protected,"* not a step to get through.

---

## 1. §9.5(a) CENSUS — who can DEPLOY, RESTART, PULL or LOCK on staging

| actor | what it does | interaction with `dt-deploy` |
|---|---|---|
| **The three sessions' ad-hoc SSH deploy lines** | the only deployers of `/home/deploy/dawntrader` today | **The thing being replaced.** After OBJ-5, no doc prescribes the raw line. |
| **governance-checker `ExecStartPre`** (every 30 min) | `git fetch` + `merge --ff-only` **on ITS OWN clone** `/opt/governance-checker/DawnTraderV3`, then runs the poller — **never touches the app clone, never restarts pm2** | **No overlap.** The lock does not cover it and does not need to. Its self-deploy-unreviewed exposure is **#621, owner CC-A** — explicitly NOT absorbed here. |
| **pm2 itself** | crash-restart of a failed process + **`pm2-deploy.service`** boot-resurrect | ⚠️ **AUDIT FINDING F-A (new): both bump the `restart_time` counter WITHOUT a deploy.** OBJ-6's recorded-vs-live comparison must therefore discriminate: **sha drift = the code changed under you (the #647-class event); `restart_time` drift alone = a crash/boot restart — investigate, but it is NOT the overwrite signal.** Without this distinction the comparison cries wolf on every crash-restart and gets ignored — the fate of every noisy guard this month. |
| **The 8 cron jobs** (02:15 sweep, rotators, partition creators, health) | data jobs | **None restarts pm2, none touches the app clone's git state** (crontab read in full 2026-08-01, re-confirmed). No interaction. |
| **`.github/workflows/deploy-staging.yml`** | ⚠️ **AUDIT FINDING F-B (new): a DORMANT FOURTH DEPLOYER the scope's census missed.** EC2-era TEMPLATE: triggers on a `staging` branch that doesn't exist, secrets unset, **zero runs ever** (verified via the runs API, not the file header). | **Inert today — but it prescribes a `git pull`-based deploy chain that contradicts `dt-deploy`, and a future `staging` branch + secrets would wake it silently.** **Rule-18 disposition required at Step-3/4: recommend DELETE** (we are on Hetzner, not EC2; the template documents infrastructure we will never provision). Not left lingering. |
| **`crew push-begin`** (B-CREW-COORD) | advisory one-at-a-time serialization **of GitHub pushes** | **Adjacent act, no overlap — boundary stated in §2.** |

## 2. Per-system INTENT + conflict check (the heart of Kyle's directive)

| system (batch) | its intent | conflict with dt-deploy? |
|---|---|---|
| **Governance checker** (B-GOV/-2/-4, INTEGRITY-0/1) | grade every batch's doc-set at the review ref, unattended | **NONE.** dt-deploy's commits carry the `B-DEPLOY-LOCK` batch-id; docs land at close per workflow. The checker grades GitHub state; dt-deploy changes staging state. Disjoint objects. |
| **Dead-man heartbeat** (B-GOV-HEARTBEAT-REPAIR, mine) | detect a silently dead checker | **NONE.** dt-deploy restarts the APP process; the checker + heartbeat are separate systemd units it never touches. |
| **Alert protocol** (B-ALERT-PROTOCOL + interim resolve-never-ack) | pull-side surfacing; ack=owned, resolve=fixed | **NONE, one deliberate non-feature:** a stale-lock break could raise a `breakage` alert — **not scoped**, because the refusal text already reaches the human at the point of action, and OBJ-4 makes the break procedure explicit there. Recorded so its absence reads as a decision, not a miss. |
| **Crew coordination board** (B-CREW-COORD, rules 25.a/25.b) | **advisory** pre-edit path claims + `push-begin` for GitHub pushes; *"reports, does not block"* | **COMPLEMENTARY, boundary now explicit: crew covers EDITS and PUSHES (advisory); dt-deploy covers the DEPLOY act (enforcing).** dt-deploy is precisely the escalation 25.b anticipates for the one act where advisory failed us. It does NOT replace `push-begin`; `push-begin` does NOT cover deploys. |
| **Delivery board** (B-DELIVERY-BOARD) | status legible at a glance; owner moves cards; board holds NO evidence | **NONE mechanically.** Card sits in `CI + Deploy` while dt-deploy runs — a display of the act, never a gate on it. |
| **Commit guards** (#540 bare-commit hook, #22 governed-read hook) | intercept dangerous session-side git shapes | **NONE.** They are Claude-session PreToolUse hooks; `dt-deploy` is a bash script on staging invoked over SSH — outside their firing surface, and it performs no commits. |
| **§7.1 one-direction flow** + `REPO_TOPOLOGY` runbook | GitHub is truth; staging is **TERMINAL — receives, never sends** | **COMPLIANT BY CONSTRUCTION:** dt-deploy = staging *receiving* (fetch + reset to a named sha). **It contains no push and never will** — stated here so a future "convenience" push from staging has to argue against a written invariant. |
| **CC-A's B-RULES-1a** (CLAUDE.md slim + skills extraction, IN FLIGHT) | move depth out of the always-loaded rules file | ⚠️ **THE ONE LIVE CONFLICT — CONFIRMED, MITIGATION SET:** OBJ-5 rewrites `CLAUDE.md:72`/`:431` while he is restructuring the same file; his slim WILL move those lines. **At Step-3: `crew claim` CLAUDE.md first · locate the two deploy lines BY CONTENT, never by number · sequence with him directly (whose edit lands first) — my sweep is two surgical line replacements and trivially rebases over his slim, so DEFAULT: he lands first unless his timing says otherwise.** |
| **Analyst's three batches** (earnings/trade-history reader fix · fee-ladder rung 1 · ~$150 sizing) | all three will DEPLOY to staging when ready | ⚠️ **TIMING interaction, not a design conflict — Kyle directed direct consensus with Analyst, no third parties: asked on Discord (see §4).** Two questions: no deploy mid-window while dt-deploy itself deploys + docs sweep; and confirmation the post-OBJ-5 path (`dt-deploy` + named sha) fits their batches — all three look standard (no migration, `--pre-restart` available if the recalibration needs a seed script). |

## 3. Risks + dispositions

| risk | disposition |
|---|---|
| F-A: crash-restart bumps `restart_time` → false overwrite alarm | **Fold into OBJ-6 wording at Step-3:** sha drift = overwrite signal; restart_time-only drift = crash-restart, different investigation. Cheap: one comparison branch. |
| F-B: dormant CI deployer wakes later | **Rule-18: recommend DELETE at Step-4** with this audit as the census; if kept, it must at minimum be rewritten to call `dt-deploy` — a dormant doc prescribing the dead chain is OBJ-5's failure in a file OBJ-5 didn't sweep. |
| CLAUDE.md collision with CC-A | Mitigation in §2 — claim, content-match, he-lands-first default. |
| Lock file location/ownership | Step-3 detail: `/home/deploy/dawntrader-deploy.lock` (deploy-user-writable, OUTSIDE the repo so a `reset --hard` can never touch the lock protecting it). |
| Analyst deploy timing | ✅ **CONSENSUS REACHED 2026-08-05 (direct, Kyle-directed, no third parties): NO Analyst deploy lands inside the implementation window** — all three of their batches are gated behind Kyle decisions not yet taken, and they are at end-of-context besides. Q2 (path fit) raised no objection. **They become a first user of `dt-deploy` when their gates open.** Exchange on Discord; recorded here per the agreement. |

## 4. Background execution + SIM/SysManual

`dt-deploy` runs only when invoked (no timer, no daemon). The lock exists only for the duration of a run. **SIM:** applicable at close (new component: staging deploy path + lock, its census row, the F-B deletion if approved). **System Manual:** NOT applicable — judged explicitly (§9): operational tooling, no trading architecture/strategy/regime/filter/pipeline/math change.

## 5. Verification posture (unchanged from scope §6)
Three provoked cases — concurrent refusal · dirty-worktree refusal · stale-lock refusal printing the #540 tier-3 text — plus post-conditions on every real run. Silence proves nothing here and will not be read as anything.
