# B-DEPLOY-DRIFT-LINE — SCOPE (Step 1)

**change-class: non_architecture**
> ⚠️ **CLASS NOTE:** the batch changes a Helsinki cron script and possibly a staging observation runner. **No trading-path file, no schema, no formula.** Same declaration as `B-WAKE-QUIET` and `B-MEASURE-GATE` leg 2, and for the same reason — `#985` records that infrastructure work has no change-class that fits it. The diff is the evidence.

**owner:** CC-A · **issue:** `#1002` · **plan row:** `PHASE_19_PLAN` 4.55 · **origin:** `#1001`, raised at `B-WAKE-QUIET` Step 6
**Kyle, 2026-09-05:** *"slot it after this batch"* — and confirmed again today as the next batch.

---

## 0. WHAT THIS BATCH IS FOR, IN ONE PARAGRAPH

**Nothing tells us how far the running system has fallen behind the reviewed branch.** The deploy is gated when it happens, and the machine is audited against its own record — but the moment a deploy finishes, the branch keeps moving and **no instrument measures the growing distance.** This batch makes that distance visible, continuously, without adding another interruption to anyone's day.

---

## 1. ⛔ STEP-1 CORRECTION TO MY OWN FRAMING — THE "ONE LINE IN THE DAILY CHECK" PROPOSAL IS DEAD, AND READING THE OBJECT IS WHAT KILLED IT

**`#1002` as I filed it proposed: *"one line in the daily check — `git rev-list --count <record.sha>..origin/migration/aws-supabase`."* ⛔ THAT FIX WOULD HAVE RUN ROUGHLY NEVER, AND I DID NOT KNOW IT WHEN I PROPOSED IT.**

| what I assumed | what the object says |
|---|---|
| the daily check runs daily, on cron | ⛔ **NO ON-BOX SCHEDULER RUNS IT.** `/home/deploy/daily_deploy_check.sh` is executable and inert. ★ **My first pass checked only three mechanisms; a fresh reader named seventeen and swept them.** CLOSED by that sweep: the whole cron family (`/etc/crontab`, `/etc/cron.d`, the four `run-parts` dirs, **the spool `/var/spool/cron/crontabs/` which holds exactly one file, `root` — so no third user's crontab**, no anacron, no alternative cron daemon); **systemd — and decisively by grepping ExecStart rather than unit NAMES: `grep -rl daily_deploy_check /etc/systemd /lib/systemd /usr/lib/systemd /run/systemd` returns nothing**, and all seven project timers were read individually; user-level timers (`/home/deploy/.config/systemd/user` absent, linger empty); the `at` queue (`atd` ACTIVE but `atq` empty for both users); PM2 (`cron_restart = None`, no auto-pull). ⚠️ **TWO RESIDUALS, STATED NOT GLOSSED: (a) an OFF-BOX scheduler SSHing in cannot be excluded by any command run on that box** — only run-timestamps in the script's own output would show it; **(b) `node-cron` IS in `package.json` and "cron" appears 173× in `dist/index.js`, and nobody traced whether the app shells out to this script.** |
| — | ✅ **Its scheduler is a SELF-CHAINED ALERT that a session runs by hand.** Alert body: *"CLI IGNORES RECURRENCE - re-mint tomorrow's on resolve."* |
| it runs daily | ⛔ **WEEKLY — AND DELIBERATELY SO, WHICH MY FIRST DRAFT GOT WRONG BY IMPLYING DECAY.** The successor alert is TITLED **"Weekly dt-deploy observation (self-chained)"** (`ca0e211c`, `triggers_at 2026-09-10T07:00:00Z`, state `scheduled`) and the close script's own text says the cadence went weekly after 2026-08-21. Chain: `2026-08-07`, `2026-08-08`, **a 26-day hole**, `2026-09-03`, next `2026-09-10`. ★ **The hole is decay (`#942`); the weekly cadence is a decision.** |
| nothing compares the deployed sha to anything | ⚠️ **Wrong as stated.** It already compares `record.sha` against `dist/BUILD_SHA` **and** against the staging clone's local `git HEAD`. |

⇒ ★★ **THE GAP IS REAL BUT IT IS NARROWER AND SHARPER THAN `#1002` SAYS: what is missing is a comparison against `origin/migration/aws-supabase` — the REVIEW BRANCH — and every existing check compares the deployment against ITSELF.** `record` vs `BUILD_SHA` catches an overwrite; `record` vs local `HEAD` catches a clone that moved without a deploy. **Neither can see the branch advancing, because the branch is not one of their operands.**
⇒ ⛔ **AND CADENCE IS NOW A FIRST-CLASS REQUIREMENT, NOT AN AFTERTHOUGHT.** The measured distance went **55 → 0 → 27 commits inside about ten hours.** A weekly hand-run instrument cannot describe a quantity that moves hourly; it would report a single arbitrary sample and read as authoritative.

**★ ALREADY IN THE LEDGER — NOT RE-FILED (§9.5(b-ii)).** The 26-day hole is **`#942`**, and the commit that re-armed the chain says so in its own subject: *"#942 corroboration (c) -- the rot suspended a recurring mechanism for 25 days."* **I nearly filed it as a new finding; it is a known one with a home.**

---

## 2. MANDATORY 1.a — ARCHITECTURAL READ

**Corpora read: `SYSTEM_IMPACT_MAP.md` ("Discord Comms Fabric", "Claude Code Hook Layer"), `PHASE_19_PLAN.md`, `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, the `B-DEPLOY-LOCK` and `B-DEPLOY-ACTOR-ALLOWLIST` completion reports, and the three live objects themselves.**

| component | what it is | blast radius |
|---|---|---|
| `comms-infra/discord/dt-push-notice.sh` | Helsinki `/usr/local/bin/`, **cron `*/2`**, already does `git ls-remote` on the review branch and posts one line to `#general` | ⛔ **HIGH-FREQUENCY AND USER-FACING.** A defect here reaches Kyle every two minutes — measured this week when a bad predicate alarmed for ~30 minutes, and once when a syntax error reached the live job. |
| `daily_deploy_check.sh` **+ its sibling `daily_deploy_close.sh`** (which resolves the alert and re-mints the successor — **found by the fresh reader; it is the actual chain mechanism and it is itself unscheduled**) | staging, hand-run off a self-chained alert | **LOW** — read-only, and it currently runs weekly at best. ⚠️ **It is CC-B's instrument** (alert `7814ebc5` was acked by `cc-b`). |
| `scripts/dt-deploy.sh` | the only deploy path | ⛔ **NOT MODIFIED BY THIS BATCH.** Read only, to establish what it already gates. |
| Helsinki → staging SSH | `sudo -u langston ssh staging` | ✅ **VERIFIED WORKING THIS SESSION** — returned `REACHED` and read `dist/BUILD_SHA` = `a4bcbe3c1…`, matching the sha measured independently from the staging clone. |

---

## 3. MANDATORY 1.b — PROVENANCE READ, AND THE DISPOSITION FOR EACH

**TIER 1 — behaviour this batch changes.**

**`dt-push-notice.sh`** — introduced into the repository by **me, this week** (`d971f9d81`, `B-WAKE-QUIET` OBJ-9) after Langston blocked the batch for editing an object he could not read. Before that it existed only on the Helsinki box, unversioned. Its original purpose is recorded in the System Impact Map: *"one line to `#general` when the branch head moves… Deliberately carries **the sha and nothing else** (Kyle directive)."*
⇒ **DISPOSITION (2) — relevant, needs updating to today's intent.** ⛔ **AND THE KYLE DIRECTIVE IN THAT SENTENCE IS A CONSTRAINT ON THIS BATCH, NOT A DETAIL:** the routine notice was deliberately kept to the sha alone. **Anything this batch adds must not turn that line back into a paragraph.**

**TIER 2 — read or called, one line each.**

- **`scripts/dt-deploy.sh`** — `B-DEPLOY-LOCK` (`#649`/`#140`), introduced `354ace0ca` 2026-08-05. Its branch gate is `dt-deploy.sh:191`: `git merge-base --is-ancestor "$SHA" "$BRANCH" || fail "sha $SHA is not on $BRANCH — staging deploys only reviewed refs (§7.1)"`, with `BRANCH="origin/migration/aws-supabase"` at `:40`. ⇒ **it already knows about the review branch, but only at the instant of a deploy.** **DISPOSITION (1) — still relevant and correct; not touched.**
- **`daily_deploy_check.sh`** — introduced `0e3662f15` 2026-09-03, for alert `7814ebc5`. **DISPOSITION (1) — correct for what it was built to do**, which is auditing the machine against its own record. ⚠️ **It was never intended to watch the branch, so its silence on drift is not a defect in it.**
- **`/home/deploy/dawntrader-deploy.record`** — the deploy record; `deployed_by_claimed` made canonical 2026-09-04 by `B-DEPLOY-ACTOR-ALLOWLIST`. Read only.

---

## 4. DOES IT ALREADY EXIST / WAS IT ALREADY DECIDED (§9.5(b-ii))

**Searched:** `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, `CHANGES_AND_FIXES.md`, `PHASE_19_PLAN.md`, `SYSTEM_IMPACT_MAP.md`, `DELETED_COMPONENTS_LOG.md`, `GOVERNANCE_EXCEPTIONS.md` and the Batch Completion reports, for the **capability** (deployed-vs-branch distance) rather than for a name I would give it.
- ✅ **No prior decision found that this should NOT exist.** `#649` deliberately scoped itself to the deploy EVENT and the record; nothing declined a distance measure.
- ⛔ **`#942` already owns the alert-chain rot** — not re-filed here, and this batch must not be read as fixing it.
- ⛔ **`#1004` already owns *`dt-deploy` does not install itself*** — a different class (provenance), homed at `P19-B12`. **Not this batch.**

---

## 5. OBJECTIVES — **r2. THE r1 MECHANISM IS WITHDRAWN; A FRESH READER KILLED IT ON TWO INDEPENDENT GROUNDS**

⛔⛔ **WHAT r1 PROPOSED AND WHY IT CANNOT WORK — both re-derived by me at the ref, not accepted on report.**

**(a) THE VEHICLE DOES NOT RUN AT THE CADENCE I ATTRIBUTED TO IT.** `dt-push-notice.sh:62` is `[ "$SHA" = "$PREV" ] && exit 0`. The cron is `*/2`, but **the body executes ONLY when the branch head has moved.** ★ **So "measure the distance continuously" was false of the object** — and worse: **a DEPLOY does not move the branch, so the one event that CLOSES the gap would never re-report it.** The number would stick at its last push-time value and read as current. ⚠️ **My own `#995` drift check sits below that same line and inherits the property; noted, not fixed here.**

**(b) THE SUPPRESSION IS `$`-ANCHORED, SO RIDING THE ROUTINE NOTICE GUARANTEES THE WAKE IT FORBIDS.** `cc-wake-filter.py`'s `_ROUTINE_PUSH` ends anchored, and its own comment says it *"FAILS SAFE BY CONSTRUCTION: we suppress ONLY a body that reduces to the known routine sentence."* ⇒ **appending a drift number makes the body stop matching, so it is DELIVERED — it wakes every session.** ⛔ **OBJ-2 as written proposed a mechanism whose own safety property defeats it, and `cc-wake-filter.py` was not in my blast radius, not in my provenance read, and in no objective.**
★ **AND THE r1 VERIFY WOULD NOT HAVE CAUGHT IT:** *"a positive control showing the escalated path is not taken"* is gated on the changed-file list matching the rules paths. **A drift number cannot reach that branch under any implementation — the control could not have failed.**

---

### ⭐ r2 — USE THE MECHANISM THAT ALREADY EXISTS: **THIS IS AN ALERT, NOT A CHANNEL MESSAGE**

**OBJ-1 — A DRIFT ALERT, RAISED BY A JOB THAT ACTUALLY RUNS.** Compute, on a fixed schedule independent of whether anyone pushed: the deployed sha (staging `dist/BUILD_SHA`, over the **verified** Helsinki→staging path), the review-branch head **after a fetch**, the commit count, **and the count of undeployed non-test files under `server/`, `client/`, `shared/`** — the operative number, because a gap made only of governance commits carries no runtime risk. Raise a **system alert** when the file count crosses the threshold; resolve it when it returns to zero.
> ★ **WHY AN ALERT AND NOT A POST — it satisfies the no-wake requirement BY CONSTRUCTION rather than by wording.** The alert system already has **state, dedupe, a widening back-off and ack/resolve**, and the due-alert hook surfaces alerts **to every session on its next prompt with NO WAKE.** ⇒ **the cheapest signal that is still noticed, built from what exists** — and it needs no change to `cc-wake-filter.py` at all.
> ⚠️ **KNOWN COST, NAMED: acking an alert SILENCES it (`#982`) and there is no unack verb.** A drift alert acked once stops speaking. **The batch must state whether it resolves-on-zero and re-mints, or is left permanently active. Do not leave that to the implementation.**
> **VERIFY — and it must DISCRIMINATE, which r1's did not:** run the arm against **two shas whose expected file sets differ, one non-zero and one ZERO**, and show both answers. ⛔ **r1's "must return the same 8 files" was not a test: it fails if anyone legitimately deploys before verification, and it passes if a broken arm hardcodes 8.** Also **define "non-test" explicitly** — today the path prefix `server/tests/` and the filename pattern give the same answer, so today's data cannot tell the two rules apart.

**OBJ-2 — NAME THE SCHEDULE AND PROVE IT FIRES.** ⛔ **A first-class objective now, because this batch's own §1 finding is that an unscheduled instrument reads exactly like a scheduled one.** Whatever runs OBJ-1 gets a real trigger (Helsinki cron is the candidate — it is where the verified SSH path originates), and the batch proves the trigger fired **from the object, not from the install command**.
> **VERIFY:** the job's own log shows runs at the expected cadence across a window containing **a period with no pushes at all** — the exact condition under which the r1 vehicle would have been silent.

**OBJ-3 — THE `main` ARM, WHICH r1 DROPPED WITHOUT SAYING SO.** Plan row 4.55 specifies the count against the review branch *"and the same against `main`."* **r1's objectives omitted it and §6 did not name it as excluded** — an omission wearing a decision's clothes. **Included, or struck in §6 with a reason.**

**OBJ-4 — GIVE THE WEEKLY OBSERVATION THE BRANCH COMPARISON TOO.** One line in `daily_deploy_check.sh`, after a `git fetch`.
> ⚠️ **CORRECTION TO §2's BLAST RADIUS: this makes that script NOT read-only.** A fetch writes the staging clone's object store and remote-tracking refs — and `dt-deploy.sh:191` gates on `origin/migration/aws-supabase` **on that same clone.** Still safe, but §2's *"LOW — read-only"* is wrong as stated, and the batch must confirm nothing depends on that ref being stale.
> ⚠️ **NOT the primary fix; it runs weekly. AND IT IS CC-B's INSTRUMENT** — offered to them first; if they would rather own it, this objective is theirs and the batch ships OBJ-1/2/3 alone.

**OBJ-5 — CORRECT `#1002`'s OWN TEXT**, which proposes a fix that would have run roughly never, and record whether the `main` arm stands.

---

## 5c. ⭐ FRESH-READER ROUND RECORD

`REVIEWER r1: claim-only (mode B) · "name the objects that would settle: nothing schedules this script" · 17 mechanisms named against my 3; five alternative states closed at the objects, two left open · re-derived: yes`
`REVIEWER r2: OBJECT (the scope file at rest) · "what other states of the world are consistent with this document" · FOUR load-bearing hits — the line-62 early exit, the anchored suppression regex, the missing main arm, and two VERIFYs that could not fail · re-derived: yes, both mechanism hits confirmed by me at origin/migration/aws-supabase before rewriting`
✅ **LOOP CLOSED ON AN OBJECT ROUND, as required. Two rounds; the cap was not reached.**

★ **r2 ALSO RETURNED THREE THINGS IN THE SCOPE'S FAVOUR, recorded so the record is not only adverse:** the 8-file figure reproduces independently (12 changed files, 4 under `server/tests/`); the Helsinki→staging check is a genuine positive control that would have failed had the path been broken; and all four provenance commits resolve to what §3 claims.
⛔ **A CLEAN IS NOT EVIDENCE, and neither round is cited as support for anything** — only the hits moved the document.

★ **ONE BETTER CITATION IT HANDED ME, ADOPTED:** §1 argued *"weekly is a decision, not decay"* from the **successor's** title — written the same day, by the session that had just found the hole, so the post-hoc-regularisation reading stayed live. **The ORIGINAL 2026-08-06 alert body already says "daily for the first two weeks, then re-mint weekly" — the cadence rule predates the hole by a month.** The claim was right; my evidence for it was the weaker of the two available.

---

## 6. WHAT THIS BATCH DELIBERATELY DOES NOT DO

- ⛔ **It does not deploy anything and does not change `dt-deploy.sh`.** Closing the gap is the owning session's call — a deploy restarts the engine (rule 15: 1-5 minute cold start), so "deploy sooner" is not free.
- ⛔ **It does not fix the alert-chain rot (`#942`), the self-install gap (`#1004`), or the missing unack verb (`#982`).** All three have homes; OBJ-1 must live with `#982` rather than fix it.
- ⛔ **It does not fix the line-62 property in my own `#995` drift check**, now that r2 has surfaced it. ★ **If Langston wants that folded in, say so at Step 1 — it is a small move and folding it later is worse.**
- ⛔ **It does not decide what an acceptable distance is.** It makes the number visible; the threshold is a reporting trigger, not a policy.

---

## 7. FOR LANGSTON — THE THREE THINGS I WANT RULED ON

1. **The alert-versus-post choice.** An alert costs nothing in wakes and inherits `#982`'s ack-silences-it defect. A post costs a wake unless the wake filter is amended, which widens the blast radius onto the very file `B-WAKE-QUIET` closed yesterday. **I recommend the alert and want that contested if it is wrong.**
2. **The threshold, and whether it should be a state CHANGE rather than a level.** A level re-fires; a change fires once and can be missed.
3. **Whether the `main` arm is worth its cost**, given `main` advances only at batch close, so its distance is expected to be large and uninformative most of the time.

## 8. STEP-1 STATE

Scope at **r2**, rewritten after two fresh-reader rounds, the second on the object. **Both mechanism hits re-derived at the ref before acting.** Delivery board card created and in `Scope`. **Next: dispatch to Langston.**
