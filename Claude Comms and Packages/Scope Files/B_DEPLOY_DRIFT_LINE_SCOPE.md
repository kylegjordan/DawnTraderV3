# B-DEPLOY-DRIFT-LINE — SCOPE (Step 1), **r4**

**change-class: non_architecture**
> ⚠️ **CLASS NOTE:** a scheduled Helsinki job plus a staging observation runner. **No trading-path file, no schema, no formula.** ⛔ **`sim` is CONDITIONAL for this class (`config.mjs:134`) and Langston has RULED IT INCLUDED** — see OBJ-6. The diff is the evidence.

**owner:** CC-A · **issue:** `#1002` · **plan row:** `PHASE_19_PLAN` 4.55 · **origin:** `#1001`
**Langston:** r2 **SENT BACK, r3 required** — 2 blockers, 3 questions ruled, 1 fold-in ordered. **r3 rewrites the body; it does not stack a correction on top of wrong text, which is what he asked for.**

---

## 0. WHAT THIS BATCH IS FOR

**Every deploy check we own compares the deployment against ITSELF.** `dt-deploy.sh:191` gates the deploy EVENT on branch membership; `daily_deploy_check.sh` compares `record.sha` to `dist/BUILD_SHA` and to the staging clone's local `HEAD`. **The review branch is not an operand of any of them**, so none can see the branch advancing after a deploy. This batch makes that distance visible on a real schedule, and reaches people without interrupting them.

**⭐ LANGSTON'S OWN LIVE MEASUREMENT, taken at `a373dea7f` from Helsinki with no clone and no fetch** — deployed `a4bcbe3c1` vs branch head: **39 commits, 52 files, 8 runtime non-test files, oldest undeployed commit `2026-09-04T19:42:55Z` = 11.5 h**, including `signal-orchestrator.ts`, `ready_to_buy_service.ts` and `eval-cycle.ts`, **with paper trading live.** That is the live instance **as at that ref**. ⛔ **STAMPED, NOT ASSERTED AS CURRENT — a reader caught this paragraph committing the exact freeze-at-mint failure OBJ-3(a) rules out for alert bodies.** Read the current value the way he took it (§5a); do not quote these numbers forward.

---

## 1. ⛔ WHAT I GOT WRONG BEFORE r2, KEPT BECAUSE IT SHAPES THE DESIGN

**`#1002` proposed *"one line in the daily check."* THAT FIX WOULD HAVE RUN ROUGHLY NEVER.**

| I assumed | the object says |
|---|---|
| the daily check runs daily, on cron | ⛔ **NO ON-BOX SCHEDULER RUNS IT.** A claim-only reader named **17** mechanisms against my 3 and swept them: the cron family (spool `/var/spool/cron/crontabs/` holds exactly one file, `root`), **systemd by ExecStart grep rather than unit name** — my own `list-timers` grep filtered on NAMES and would have missed a timer called anything else — user timers, the `at` queue, PM2 `cron_restart`. ⚠️ **RESIDUALS: an off-box scheduler cannot be excluded from that box, and `node-cron` in the BUILT output was not traced.** `RULED ON REPORTED FACT` by Langston; nothing below rests on it. |
| it runs daily | **WEEKLY, AND BY DECISION.** The **original 2026-08-06 alert body** already says *"daily for the first two weeks, then re-mint weekly"* — the rule predates the 26-day hole by a month. **The hole is decay (`#942`, already in the ledger, NOT re-filed); the cadence is a decision.** |
| nothing compares the deployed sha to anything | ⚠️ **Wrong as stated** — it compares `record.sha` to `dist/BUILD_SHA` and to local `HEAD`. **Every operand is the deployment itself.** |

**AND THE r1 MECHANISM WAS WITHDRAWN ON TWO GROUNDS, both re-derived at the ref and both CONFIRMED by Langston independently:**
- **`dt-push-notice.sh:62` — the early exit when the head has not moved.** Cron is `*/2`, but the body runs **only when the branch head moves**. So "continuously" was false of the object, and **a DEPLOY does not move the branch — the one event that CLOSES the gap would never re-report it.**
- **`cc-wake-filter.py`'s `_ROUTINE_PUSH` is anchored to the end of the body.** Appending a number makes it stop matching ⇒ **DELIVERED ⇒ it wakes every session**, the exact thing the objective forbade. **And my r1 VERIFY could not have failed:** the escalated path is gated on the changed-file list matching the rules paths, which a drift number cannot reach.

---

## 2. MANDATORY 1.a — ARCHITECTURAL READ **(r3: BLOCKER-1 — the table was r1-shaped and is REPLACED)**

⛔ **BLOCKER-1, in Langston's words: no r2 objective modifies `dt-push-notice.sh`, yet it was still my only Tier-1 and only HIGH row — while the batch's PRINCIPAL DELIVERABLE had no row and no disposition at all.**

| component | what it is | blast radius |
|---|---|---|
| ⭐ **THE NEW SCHEDULED JOB** (Helsinki) — reads staging's `BUILD_SHA` over SSH, the branch head over the GitHub API, and **WRITES TO THE ALERT STORE FROM A THIRD HOST** | the batch's principal deliverable; did not exist before | ⛔⛔ **HIGH, AND IT IS THE ONE THAT NEEDED NAMING.** **A NEW WRITER TO THE ALERT STORE, FROM A HOST THAT HAS NEVER WRITTEN TO IT.** ⇒ **it lands directly on `#647` / `B-ALERT-QUEUE-INTEGRITY` (lock-free append + lossy rewrite; CC-B, plan row 2.4b).** **INTERACTION STATED: a third-host writer raises the concurrent-write surface that batch exists to fix, so this job must write through the supported CLI path and NEVER by appending to the file itself** — and if that is not possible from Helsinki, **the batch stops and says so** rather than adding a second unlocked writer. |
| `scripts/batch-verify/dt-deploy-observation/daily_deploy_check.sh` (+ sibling `daily_deploy_close.sh`, the actual chain mechanism, itself unscheduled) | staging, hand-run off a self-chained alert, weekly | **LOW** — read-only today. ⚠️ **OBJ-5 would add a `git fetch`, which writes the clone's object store and remote-tracking refs.** ⭐ **CORRECTED BY LANGSTON: that makes `dt-deploy.sh:191`'s ancestor gate MORE PERMISSIVE IN THE CORRECT DIRECTION** — a stale `origin` ref **refuses legitimately-reviewed shas.** *(My r2 wording — "confirm nothing depends on it being stale" — had the risk backwards.)* **It is CC-B's instrument.** |
| `comms-infra/discord/dt-push-notice.sh` | Helsinki `/usr/local/bin/`, cron `*/2` | ⚠️ **MEDIUM, and ONLY because of the FOLD-IN (OBJ-4).** ⛔ **NOT a drift-measurement vehicle any more** — see §1. |
| `scripts/dt-deploy.sh` · the deploy record | the deploy path and its record | **NONE — read only, not modified.** |
| `cc-wake-filter.py` | the wake path for all sessions | ⭐ **DELIBERATELY OUT OF SCOPE, and that is the point of choosing an alert** — the r2 design needed no change to it, and r3 keeps that property. |

---

## 3. MANDATORY 1.b — PROVENANCE READ **(r3: re-pointed at what the batch actually changes)**

**TIER 1 — behaviour this batch changes.**

**The alert store and its CLI** — `server/services/system-alerts.ts`, the dispatcher, and the `#340` closure guarantee (`B-ALERT-PROTOCOL`, 2026-06-23): re-surface is **delivery-gated**, the back-off widens, and `resolved` never re-surfaces. **`ALERT_ACTORS` was made canonical 2026-09-02 (`#987`), so this job needs a canonical actor identity, not free text.**
⇒ **DISPOSITION (1) — still relevant and correct.** ⛔ **The batch ADDS A PRODUCER to a mechanism whose CONSUMER contract is settled; it must not alter the contract.**

**`comms-infra/discord/dt-push-notice.sh`** — introduced by me this week (`d971f9d81`, `#995` OBJ-9) after Langston blocked the batch for editing an object he could not read. The System Impact Map records its purpose: *"one line to `#general` when the branch head moves… Deliberately carries the sha and nothing else (Kyle directive)."*
⇒ **DISPOSITION (2) — relevant, needs updating**, and **only for the fold-in.** ⚠️ **A second reader noted the live object already diverges from that sentence (three names, two sentences, a conditional block). Treat the directive as being about not narrating WHAT was pushed — the header comment's own Kyle quote — rather than about line length.**

**TIER 2 — read or called.** `dt-deploy.sh` (`B-DEPLOY-LOCK` `#649`/`#140`, `354ace0ca`; gate at `:191`, branch at `:40`) — **DISPOSITION (1), not touched.** · `daily_deploy_check.sh` (`0e3662f15`, alert `7814ebc5`) — **DISPOSITION (1): correct for auditing the machine against its own record; it was never meant to watch the branch, so its silence is not a defect in it.**

---

## 4. DOES IT ALREADY EXIST / WAS IT ALREADY DECIDED (§9.5(b-ii))

Searched `RUNNING_ISSUES`, `BATCH_CATALOG`, `CHANGES_AND_FIXES`, `PHASE_19_PLAN`, `SYSTEM_IMPACT_MAP`, `DELETED_COMPONENTS_LOG`, `GOVERNANCE_EXCEPTIONS` and the completion reports, for the **capability** rather than a name I would give it.
✅ **No prior decision that this should not exist.** `#649` scoped itself to the deploy EVENT deliberately.
⛔ **Already owned, NOT re-filed and NOT fixed here:** `#942` (alert-chain rot) · `#1004` (`dt-deploy` does not install itself, `P19-B12`) · `#982` (no unack verb) · `#647` / `B-ALERT-QUEUE-INTEGRITY` (CC-B, 2.4b).

---

## 5. OBJECTIVES — r4

**OBJ-1 — THE PREDICATE IS ⭐ AGE, NOT COUNT (Langston, Q2).**
**Primary: hours since the OLDEST UNDEPLOYED COMMIT touching a runtime path** (`server/`, `client/`, `shared/`, excluding tests). Commit count, file count and the file list ride in the body **as context, never as the trigger**.
> ⛔ **WHY, and it is his measurement not mine: count is NON-MONOTONE and undefendable as a threshold.** I measured 55 → 0 → 27; he measured **39 commits but THE SAME 8 RUNTIME FILES as the morning before** — the file count did not move across a day and 12 commits, while the age grew monotonically. **`#1001` was never *"many files"*; it was *"engine files undeployed for days while paper trading was live."*** **Age is monotone between deploys and resets to zero on deploy — the property the threshold needs.**
> ⛔ **AND IT RETROSPECTIVELY CONFIRMS MY r1 VERIFY WAS VOID: a hardcoded 8 would have passed it.**

**OBJ-2 — LEVEL, RE-ASSERTED EVERY RUN, CLEARED ON RETURN TO ZERO (Langston, Q2).** Not an edge trigger.
> ⛔ **An edge trigger that is missed is indistinguishable from no drift (`#661` leg 3) — and edge-triggering is exactly the r1 failure I already retracted.**

**OBJ-3 — IT IS AN ALERT, WITH TWO CONDITIONS LANGSTON ATTACHED (Q1: ALERT confirmed).**
> ⭐ **His reason is stronger than mine.** I argued no-wake; **he ruled it because the alert store is the only path that reaches HIM by construction** — his per-turn read enumerates active, unacked and due straight off the store.
> ⛔ **CONDITION (a) — THE BODY FREEZES ITS MAGNITUDE AT MINT TIME.** A re-surfaced alert replays its mint-time snapshot: **measured, `03fad8a4` showed 67.8% for eight days while the live gauge read 76.9%.** Drift moves hourly ⇒ a minted number is wrong on nearly every surfacing. **PICK ONE, IN THIS SCOPE: the body carries NO number and names where to read the current one, OR the job resolve-and-re-mints when the value materially changes.** ⇒ ✅ **CHOSEN: carry no magnitude in the body; name the reader.** The re-mint path is reserved for condition (b), where it is doing different work.
> ⭐ **AND THE READER IS NAMED, WHICH r3 FAILED TO DO (reader hit — "the chosen option is half-executed"): the job writes its full reading to its own log on Helsinki on every run, and the alert body points at that log.** ⛔ **An instruction to "name the reader" that names no reader is the pointer-to-nothing failure — same class as rule 24's pointer left aimed at a deleted file.**
> ⛔ **CONDITION (b) — `#982` IS HANDLED BY THE JOB, NOT BY A NEW VERB.** Each run reads the row back; **if it has been acknowledged, resolve-and-re-mint.** ⇒ **an ack becomes a snooze-until-next-run.** ★ **Ack-silences-it stops being a defect this batch lives with** — strictly better than the "known cost" r2 accepted.
> ⛔ **Identity: a canonical actor value (`#987`), never free text.**

**OBJ-4 — ⭐ FOLD-IN, ORDERED BY LANGSTON, AND IT IS A LIVE WAKE DEFECT IN CODE I SHIPPED YESTERDAY.**
**Re-site my `#995` drift check onto OBJ-2's clock.** ⛔ **Do NOT re-implement it — its subject is different (uncommitted live-file content vs deployed-vs-branch distance), so it is not redundant with OBJ-1.**
> ⛔⛔ **THE PART r2 DID NOT NAME, AND I RE-DERIVED IT AT `origin/migration/aws-supabase` BEFORE WRITING IT DOWN:** the drift text is interpolated into the notice body at **`:134`** — so **whenever that check fires, the body stops matching the routine-push suppression and WAKES EVERY SESSION.** Worst case is the **blind-oracle warning at `:101-106`**, which fires whenever the backup mirror has not fetched for over two hours ⇒ **a wake to every session on EVERY push, for as long as the puller stays down.** ★ **A wake storm on an infrastructure condition, in the file `B-WAKE-QUIET` closed yesterday.**
> ✅ **MEASURED NOW: latent, not firing — mirror fetch age 0 min against a 120-min threshold.** ⚠️ **Latent is not fixed.**
> ⇒ **Moving it fixes the cadence AND the wake in one move.**

**OBJ-5 — THE WEEKLY OBSERVATION GETS THE BRANCH COMPARISON.** One line in `daily_deploy_check.sh` after a `git fetch`. ⚠️ **NOT the primary fix — weekly. OFFERED TO CC-B FIRST** (their instrument, alert `7814ebc5`); if they take it, the batch ships **OBJ-1/2/3/4/6 AND OBJ-7** alone. *(r3 wrote "OBJ-1/2/3/4/6", silently dropping OBJ-7 — which is not conditional on CC-B and corrects this batch's own issue entry.)*

**OBJ-6 — ⭐ THE SYSTEM IMPACT MAP ENTRY, RULED INCLUDED BY LANGSTON, AND HIS REASON IS THIS BATCH'S OWN §1.** *"Nobody knew `daily_deploy_check.sh` had no scheduler. A new scheduled instrument that isn't recorded where someone looks becomes the next one."*
> **The entry names: HOST · TRIGGER + CADENCE · OPERANDS · dedupe key · FAILURE MODE.**

**OBJ-7 — CORRECT `#1002`'s TEXT**, which proposes a fix that would have run roughly never, and record that the `main` arm is measured-not-fired.

---

## 5a. ⛔ BLOCKER-2 — THREE OUTCOMES, NEVER TWO

**This batch exists because an instrument compared a thing to itself. It must not ship one that reports zero when it could not see.**
⇒ **`distance measured` · `distance zero` · `MEASUREMENT FAILED` — and the third NEVER renders as the second.** ⛔ **An exit code of zero means the command ran, nothing more.**
- ⭐ **AND IT NEEDS A DESTINATION, WHICH r3 DID NOT GIVE IT (reader hit).** **`MEASUREMENT FAILED` mints its own alert**, distinct from the drift alert and naming which operand could not be read. ⛔ **Forbidding a misrender is not the same as making the third outcome visible** — an unroutable outcome is silence wearing a verdict's clothes, which is this batch's own subject.
- ⭐ **THE CHEAP WAY OUT WAS ALREADY IN MY OWN OBJECT (Langston):** `dt-push-notice.sh:123` already uses the **GitHub compare API**. ⇒ **remote ref read + compare + ONE `ssh` read of `BUILD_SHA` needs no fetch, no clone, no working copy.** **That deletes the stale-ref risk BY CONSTRUCTION** and makes OBJ-5's fetch correction irrelevant to the primary arm. **It is how he took the numbers in §0.** Rate limit 60/hr unauthenticated; **hourly cadence is fine.**
- ⛔ **IF `dist/BUILD_SHA` AND THE DEPLOY RECORD DISAGREE, THE DISTANCE IS UNDEFINED (`#546`).** **Publish WHICH TWO SHAS DISAGREE — never a number derived from an ambiguous operand.**
- ⛔ **BOTH ARMS REPORT DIRECTION EXPLICITLY (`--left-right A...B`).** A bare *"27 commits"* carries no direction, **and direction is the whole meaning.**

## 5b. THE `main` ARM (Q3 — RULED)

**KEEP IT: measure it, log it, ⛔ NEVER FIRE ON IT.** Deployed-vs-`main` is a **governance-backlog** number, not a runtime-risk number, and firing on it **desensitises the alert we actually need.**
★ **This satisfies plan row 4.55 rather than silently dropping it — which is what r1 did, and what the object round caught.**

## 5c. FRESH-READER + REVIEW RECORD

`REVIEWER r1: claim-only (mode B) · "what would settle: nothing schedules this script" · 17 mechanisms vs my 3; five alternative states closed, two left open · re-derived: yes`
`REVIEWER r2: OBJECT (scope at rest) · "what other states are consistent with this document" · FOUR hits — the early exit, the anchored regex, the missing main arm, two VERIFYs that could not fail · re-derived: yes, at the ref, before rewriting`
`LANGSTON r1 (Step 1, at a373dea7f): SENT BACK — 2 blockers, 3 questions ruled, 1 fold-in ordered. He re-read the scope, dt-push-notice.sh:52-157, cc-wake-filter.py:47-60 and the checker config himself, and took his own live drift measurement. He tagged the scheduler sweep, dt-deploy.sh:191/:40 and the alert-chain history RULED ON REPORTED FACT and rested no ruling on them.`
`REVIEWER r3: OBJECT (r3 against Langston's ruling, clause by clause) · "is each requirement MET or merely MENTIONED" · SIX hits mine to fix (no sink for MEASUREMENT FAILED, the unnamed reader, OBJ-7 dropped from the fallback list, a frozen magnitude in §0, self-grading in §7, the API rate-limit arithmetic) and THREE CONFLICTS INSIDE THE RULINGS THEMSELVES · re-derived: yes, its line citations checked at the objects`
⛔ **A CLEAN IS NOT EVIDENCE. Only hits moved this document.**

---

## 5d. ⛔⛔ THREE CONFLICTS **INSIDE THE RULINGS THEMSELVES** — PUT BACK TO LANGSTON, NOT RESOLVED SILENTLY

★ **A fresh reader checked r3 against his ruling clause by clause and found three places where two of his own instructions cannot both be implemented. I am not choosing between them on my own — picking one and not saying so is how a reviewer ends up ratifying something he did not rule.**

**CONFLICT 1 — `--left-right` REQUIRES A CLONE; THE SAME BULLET BLOCK FORBIDS ONE.**
BLOCKER-2 mandates *"no fetch, no clone, no working copy"* and, three lines later, *"`--left-right A...B` on both arms."* ⛔ **`--left-right` is a `git rev-list` flag and needs a local repository holding both commits. The GitHub compare API returns `ahead_by`/`behind_by`, not left-right marks.**
★ **MY READ: the INTENT is satisfied — `ahead_by`/`behind_by` IS direction, expressed differently, and it is what you used yourself to get 39.** ⚠️ **But the flag is named as a requirement, so I am confirming the intent rather than substituting for it.**

**CONFLICT 2 — Q1(a) SAYS NO MAGNITUDE IN THE BODY; Q2 PUTS COUNT AND FILE LIST IN THE BODY.**
Q1(a): *"the body carries NO number and names where to read the current one."* Q2: *"count and file list go in the body as context."* ⛔ **Counts and file lists ARE magnitudes and they freeze at mint exactly like the 67.8%-for-eight-days case Q1(a) cites as its whole reason.**
★ **MY READ: Q1(a) governs, and the context belongs in the log the body points at.** ⚠️ **Ruling needed, because a body with no context at all may be too thin to act on — which is the opposite failure.**

**CONFLICT 3 — Q1(b) ALTERS THE `ack` CONTRACT THAT §3 FORBIDS ALTERING, AND COLLIDES WITH THE DEDUPE KEY.**
§3 (mine, and I still believe it): *"the batch ADDS A PRODUCER to a mechanism whose CONSUMER contract is settled; it must not alter the contract."* ⛔ **`ALERT_HANDLING_PROTOCOL` defines ack = OWNED.** Q1(b) makes ack mean *snooze-until-next-run* — so **a session that acks to CLAIM the work has the row resolved and re-minted underneath them**, which is the opposite of owning it. **And resolve-and-re-mint on every acked run produces a NEW ROW each cycle**, against OBJ-6's required dedupe key and `#340`'s re-surface/back-off contract, which both assume a persisting row.
★ **MY READ: this needs a THIRD state, not a redefinition of ack** — which is exactly the `held`/`hold` design already owed to you on `#982`. ⚠️ **If you want Q1(b) as written, say so and I will implement it, but the protocol change should be recorded as one rather than arriving as a side effect of a drift job.**

---

## 5e. ⛔ A FEASIBILITY QUESTION THE READER RAISED THAT COULD SINK OBJ-1's PREDICATE

**The age predicate needs the oldest undeployed commit TOUCHING A RUNTIME PATH.** ⛔ **The GitHub compare API returns an AGGREGATE file list for the range, not per-commit file lists** — so identifying WHICH commit is the oldest runtime-touching one may need **one call per undeployed commit**. At your own measured 39 commits that is up to 39 calls per run, against a **60/hr unauthenticated budget already being spent from the same host by `dt-push-notice.sh` on a `*/2` cron.**
★ **NOT presented as a refutation — there may be a cheaper formulation** (e.g. walk newest-first and stop at the first runtime-touching commit, or authenticate the calls). ⚠️ **But r3 asserted *"hourly cadence is fine"* as settled arithmetic, and it is not settled until the per-commit cost is counted. Stated rather than discovered at Step 3.**

⛔ **AND ONE FEASIBILITY GATE HAS NO STEP THAT ASKS IT:** §2 says the job *"must write through the supported CLI path and never by appending to the file itself"*, and that the batch **stops** if that is impossible from Helsinki — **but no objective ever determines whether it IS possible.** The supported path is an `npm run system-alerts` invocation on staging. ⇒ **Step 2 answers this FIRST; the principal deliverable has no legal write path until it does.**

---

## 6. WHAT THIS BATCH DELIBERATELY DOES NOT DO
- ⛔ **It does not deploy anything and does not change `dt-deploy.sh`.** Closing the gap is the owning session's call — a deploy restarts the engine (rule 15).
- ⛔ **It does not fix `#942`, `#1004`, `#982` or `#647`.** All have homes. ★ **`#982` is WORKED AROUND by OBJ-3(b), not fixed.**
- ⛔ **It does not add a second unlocked writer to the alert store.** If the supported CLI path cannot be used from Helsinki, **the batch stops and says so** (§2, `#647`).
- ⛔ **It does not decide what an acceptable distance is.** The threshold is a reporting trigger, not a policy.

## 7. STEP-1 STATE
**r3**, body rewritten per BLOCKER-1 rather than corrected on top of wrong text. **Both blockers ANSWERED and all three rulings ADOPTED — stated as what was attempted, not as a grade.** ⛔ **r3 said "addressed", which is me marking my own homework before the reviewer sees it (reader hit).** The fold-in is accepted and its wake defect re-derived at the ref. Card in `Scope`; `Blocked on = Langston` on re-dispatch.
