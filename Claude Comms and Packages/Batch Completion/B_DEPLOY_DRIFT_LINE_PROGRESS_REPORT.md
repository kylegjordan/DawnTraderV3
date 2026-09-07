# B-DEPLOY-DRIFT-LINE — PROGRESS REPORT

# ⛔ OPEN — FIRST TRUE POSITIVE RETURNED (criteria 1+2 PASS); CRITERIA 3 AND 4 UNEXERCISED

**Batch:** `B-DEPLOY-DRIFT-LINE` · **owner:** CC-A · **issues:** `#1002`, folds `#1008` · **plan row:** `PHASE_19_PLAN` 4.55
**change-class:** `non_architecture` · **installed:** 2026-09-07, hourly on Helsinki
**Langston:** Step 1 APPROVED `25f64f93c` · Step 2 ACCEPTED `6a33848dd` · Step 4 APPROVED `02e2e78d2` (after r2→r7) · **Step 8 CONFIRMED `5e9296ebf`, re-derived on his own commands with controls**
**CI:** run `34025649938`, 4/4 green **verified per job**

---

## 1. WHAT THE BATCH IS FOR

**Every deploy check we owned compared the deployment against ITSELF.** `dt-deploy.sh:191` gates the deploy *event* on branch membership; `daily_deploy_check.sh` compares `record.sha` to `dist/BUILD_SHA` and to the staging clone's local `HEAD`. **The review branch is not an operand of any of them**, so nothing could see the branch advancing after a deploy.

That is how staging sat **55 commits behind with `active-execution-engine.ts` and `signal-orchestrator.ts` undeployed while paper trading was live** — with every existing check reporting healthy (`#1001`).

## 2. WHAT SHIPPED

**`comms-infra/discord/dt-deploy-drift.sh`** — Helsinki, hourly at `:17`, running as `langston`. Reads the deployed sha over ssh, the branch head via `git ls-remote`, the range via the GitHub compare API. **No clone, no fetch, no working copy** — which removes stale-ref risk by construction rather than by remembering to fetch.

- **Predicate: the AGE of the oldest undeployed commit**, gated on the range touching a runtime path. Rungs at **4 / 8 / 24 / 72 h**, escalate-only, on the dedupe key; **return to zero resolves every rung** by itself.
- **`info` + `health_check`** — `health_check` is not in `ALWAYS_DELIVER_CATEGORIES`, so nothing posts to `#general` and nobody is woken. ⚠️ **But an active row injects into every session's every prompt until someone deploys. That is a standing nag on exactly the party who can clear it — it is not a free channel.**
- **Three outcomes, never two:** measured · zero · `MEASUREMENT FAILED`, the third minting its own alert naming the failed operand and read off the **exit status**, never an HTTP code.
- **Actor `deploy-drift-monitor`, tag `machine`** (`system-alerts.ts:215`) — an hourly robot must not claim a session identity.

**`comms-infra/discord/dt-push-notice.sh`** (`#1008`) — the rules-changed alarm's file list is paginated, exit-status checked, and **says so** when truncated or unreadable instead of reading as a clean absence. Its blob-drift oracle now watches **every executable the estate installs**, not only itself.

**`comms-infra/discord/deploy.sh`** — installs the job, its log and its state directory, and adds the cron.

## 3. ⛔ THE PRE-REGISTERED CLOSE CRITERION — WRITTEN NOW, BEFORE ANY DATA

> **WINDOW SHAPE: a set QUANTITY — the first qualifying observation — with a set-period backstop of 21 days.**

**PASS** requires **all four**, on the first drift episode where the gap crosses 4 h *and* the range touches a runtime path:
1. **The alert FIRES** at the correct rung for the measured age, within one hourly cycle of the threshold being crossed.
2. **Its body's magnitudes match an independent re-derivation** — commit count, runtime-file count and oldest-commit timestamp, each checked against `git` at the two shas the body names.
3. **It escalates** to the next rung if the gap survives into the next band, as a NEW key rather than an edit.
4. **A deploy clears every rung on the next run**, resolved by `deploy-drift-monitor`, with no row left open.

**FAIL** is any one of:
- the alert does not fire on a qualifying gap (a false negative — the failure this batch exists to prevent);
- a magnitude in the body disagrees with the independent re-derivation;
- a deploy leaves any `deploy-drift-*` row unresolved;
- the job reports `zero` on a run where a gap demonstrably existed.

⛔ **NEITHER PASS NOR FAIL: no qualifying gap occurs inside 21 days.** That means the window did not exercise the path — **NOT that the job works.** In that case **EXTEND the window and say so; do not pass it.** *(A silent instrument with zero opportunity is not evidence — `#661` leg 3.)*

## 3a. ⭐ FIRST QUALIFYING EPISODE — 2026-09-07, **CRITERIA 1 AND 2 PASS**

**Alert `81135510`, `deploy-drift-rung-2`, fired `2026-09-07T20:23:32Z`, reading as at `20:17:01Z`.** Operands: deployed `17a1024776e55eb5b708ff5406d4de7307b8e8ad` vs head `0c9e2b5e81a305e280c48027084bbc3b7bd5283f`.

**⭐ CRITERION 1 — FIRES AT THE CORRECT RUNG WITHIN ONE HOURLY CYCLE: PASS.**
⚠️ **AND IT ONLY PASSES ONCE YOU MEASURE THE RIGHT CLOCK, WHICH IS NOT THE OBVIOUS ONE.** The oldest undeployed commit crossed **8 h at `15:50:56Z`** and the alert fired at `20:23Z` — **4½ hours later, which reads as a fail.** ⇒ **It is not, because the RUNG is age-driven but the FIRING is GATE-driven:** the range held no runtime path until `06e59701e` landed at **`19:55:45Z`**. **The gate opened at 19:55; the very next hourly run — `:17` — fired it.** ★ **The two clocks are separate by design and the criterion is about the gate's.**
★ **Rung 2 is correct, and the escalate-only design shows here: it did NOT walk up from rung 1.** At the moment the gate opened the age was already 12 h, so it minted straight into the right band. **Rung 1 never fired and should not have.**

**⭐ CRITERION 2 — MAGNITUDES MATCH AN INDEPENDENT RE-DERIVATION: PASS, ALL FOUR.** Re-derived with `git` at the two shas the body names — **a different instrument from the compare API the job uses**, which is the point.

| body claims | `git` at the two shas | |
|---|---|---|
| commits behind **34** | `rev-list --count` → **34** | ✅ |
| oldest undeployed **`2026-09-07T07:50:56Z`** | `log --reverse --format=%cI` → **`2026-09-07T11:50:56+04:00`** = `07:50:56Z` | ✅ |
| runtime files **1 — `server/services/market-scanner.ts`** | `diff --name-only … -- server client shared` → **exactly that one file** | ✅ |
| last deploy `2026-09-07T07:50:22Z` | deploy record `migrate_ran_at=2026-09-07T07:50:10Z`, `deployed_by_claimed=cc-c` | ✅ |

**AND THE TWO ASSUMPTIONS §4 FLAGS WERE BOTH CHECKED RATHER THAN ASSUMED ON:** `rev-list --merges` over the range = **0**, and the **ancestrally-first commit IS the date-oldest** (`sort | head -1` returns the same timestamp) — so `commits[0]` was the right operand *on this range*. ★ **That is a check of the assumption, not a proof of it for all time.**
**The gate also DISCRIMINATED rather than passing everything through: 24 files changed in the range, 1 of them runtime.** The 23 governance files did not open the gate — which is the whole reason the batch's earlier ungated firing was withdrawn.

**⛔ CRITERIA 3 AND 4 ARE NOT YET EXERCISED, AND NEITHER IS A PASS.** Escalation to rung 3 needs the gap to survive to `2026-09-08T07:50:56Z`; clearing needs a deploy. **The row is `active` and stays open.**

### 🟨 AND THE EPISODE PRODUCED A FINDING AGAINST THE GATE — **IT OVER-REPORTS, FROM THE OPPOSITE SIDE TO `#1016`**
⛔ **THE ONE "RUNTIME" FILE IN THE RANGE IS A COMMENT-ONLY CHANGE: two line-anchor corrections, `:820` → `:855`, `2 insertions / 2 deletions`, ZERO executable change.** A deploy of this range would restart live trading to ship two comments.
★ **THIS IS `#1016`'S PREDICATE FAILING IN THE OTHER DIRECTION, and it is worth as much as the first half.** `#1016` says a **directory convention** cannot see `drizzle/migrations/**` — it **under**-reports. **This episode shows the same convention cannot tell executable code from a comment — it OVER-reports.** ⇒ **both faults have one cause: the gate asks WHERE a file lives, never WHAT CHANGED IN IT.**
⚠️ **Over-reporting is the cheaper fault and must stay that way** — a false nag costs attention, a missed migration costs a schema. **`B-DRIFT-RUNTIME-PREDICATE` must not trade the second for the first.**
**DISPOSITION: added to `#1016` / `B-DRIFT-RUNTIME-PREDICATE`, plan row 4.56 — no new issue.**

## 4. WHAT IS UNPROVEN, STATED AS UNPROVEN

✅ **CORRECTED 2026-09-07 — THIS SECTION LED WITH *"THE JOB HAS NEVER FIRED A CORRECT ALERT IN PRODUCTION"*, AND §3a IS THAT SENTENCE BEING RETIRED BY DATA.** It is left visible rather than deleted: it was true when written, and the whole design of §3 was that the criterion be fixed BEFORE the observation arrived.

⛔ **STILL UNPROVEN, AND THESE ARE THE REAL RESIDUALS: THE JOB HAS NEVER ESCALATED A RUNG IN PRODUCTION, AND HAS NEVER BEEN CLEARED BY A DEPLOY.** Criteria 3 and 4 have had **zero opportunity**, not zero failures — `#661` leg 3, and the distinction is the point. **One correct firing licenses the DETECT path only.**

⚠️ **AND ONE TRUE POSITIVE IS NOT A FALSE-NEGATIVE RATE.** The failure this batch exists to prevent is the alert that DOESN'T fire on a qualifying gap, and a single positive episode says nothing about it. **The gate has now been observed discriminating once** — 23 governance files did not open it, 1 runtime file did.

⚠️ **`commits[0]` is the ancestrally-first commit, not necessarily the date-oldest.** They coincide on a fast-forward-only branch, and `git rev-list --merges` over the tested range returned 0. **That is an assumption about the branch's shape, re-checkable but not proved for all time.**

⚠️ **Ages are committer dates, which a rebase rewrites.** The body publishes **both** that age and time-since-last-deploy, which a rebase cannot rewrite, so a rewrite shows up as a *disagreement between the two* rather than as a quiet under-statement.

⛔ **KNOWN GAP — `#1016` / `B-DRIFT-RUNTIME-PREDICATE`, plan row 4.56 (Langston, Step 8).** The gate defines "runtime" as `server/ client/ shared/` — a directory convention — while `dt-deploy` **also** runs `npm ci` on a `package-lock.json` diff, `npm run build` over four config files, and **`db:migrate` over `drizzle/migrations/**`**. **An undeployed schema migration is the highest runtime risk we carry and this gate cannot see it.** Measured **latent, not live**: of the last 400 commits, 3 touch a deploy-executed path and **all 3 also carry `server/` files**.

## 5. EVERY STEP, WITH ITS EVIDENCE

| step | outcome |
|---|---|
| 1 Scope | APPROVED `25f64f93c` after **r1→r5**. Two fresh-reader rounds killed the original mechanism; Langston then ruled three conflicts **inside his own instructions** and withdrew two of them. |
| 2 Audit + Plan | ACCEPTED `6a33848dd`. **Both gates run first, as he ordered:** the write path proved by minting a throwaway alert end-to-end, and the truncation probe. |
| 3 Implementation | `0723ecdf1`. Proved offline on real inputs before anything was installed; `--dry-run` and a write-forbidden `--base` added so the job is testable at all. |
| 4 Code review | APPROVED `02e2e78d2` after **six revisions**. See §6. |
| 5 CI | Run `34025649938`, **4/4 green per job**. My own run was *cancelled* by a concurrent push — cancelled is neither pass nor fail, and the superseding run covers my commit. |
| 6 Deploy | ⭐ **NOT NEEDED.** CC-C's 09:30 deploy carried the one server-side line. **I asked before deploying and withdrew when it proved unnecessary** — their four in-flight files stayed where they were. |
| 7 Verification | The job fired in production and **revealed its own defect** (§6). UI verified in Claude-in-Chrome: `deploy-drift-monitor (machine)` renders in the alerts page's actor list. |
| 8 Second pass | **CONFIRMED `5e9296ebf`** — all five re-derived on his commands with controls, including a hash control that discriminates and a whole-file crontab read. |
| 10 Governance | `c599e429b`. Full tier ledger in that commit message and in §7. |

## 6. ⛔ WHAT THE REVIEWS AND THE PRODUCTION RUN ACTUALLY CAUGHT

**Eleven defects, and the pattern across them is the batch's most durable output.**

**Found by RUNNING, not reading:**
- ⛔ **A 404 from the compare API RENDERED AS ZERO DRIFT.** Its **error body carries its own `status` field**, so `if status is None` never fired; `total_commits` was absent, `or 0` made the zero test true, and **an instrument that could not see the repository at all reported all-clear.** It survived my review, an object round and two of Langston's. **Thirty seconds of running the failure case found it.**
- **`mint_alert` receiving zero arguments** — a comment between a line-continuation and its arguments ends the logical line. **`bash -n` exits 0 on that.** Every `MEASUREMENT FAILED` path was store-silent.
- **`ssh` without `-n` eating the resolve loop's stdin** — measured 1 of 3 rows resolved, 3 of 3 with it.
- **`log()` returning 1**, so a run that measured, minted and logged correctly **exited 1 — indistinguishable from a blind one**, by the very mechanism the file's own header prescribes.
- **The runtime-path gate did not exist.** The alert body described it as though it did.

**Found by reading:** the trailing-window pagination; a `||` binding to a pipeline's status; three surviving absent-as-valid paths; a permanently unclearable actor design; a guard I deleted believing it a duplicate.

⇒ ★★ **THE RULE, filed as a two-clause rider on `#744`:** *any guard written against an EXTERNAL contract is exercised against a REAL response from that contract, and the branch exercised is the FAILURE branch* — **and** *a control states its expected output before it runs*. ⚠️ **The second clause exists because the failure branch WAS run first and still returned a pass-shaped result from a control that had processed nothing.**

## 7. GOVERNANCE FILES CHANGED SO FAR

**Batch Catalog · Phase History · Phase 19 Plan · System Impact Map · Running Issues · Changes and Fixes · Mistake Patterns · Alert Handling Protocol · Build Method Playbook · the shared memory file and my own · Langston's memory · this batch's Scope, Pre-Audit and Change List · the CC-A session task list.**

**Judged not applicable and stated rather than skipped:** System Manual (the only `server/` change is one row appended to the actor table — no architecture, strategy, regime, filter, pipeline or maths) · Post-Audit Roadmap · Adjustment Framework · Authority Baseline · Storage Policy · Multi-Asset VTS Plan · Asset Class Onboarding Workflow · Langston Architecture · CLAUDE.md and CONDUCT.md · the rule-history archive · Deleted Components Log · Governance Exceptions · Delivery Board Protocol.
**Feature Watch:** rows landed for 2026-09-06 and 09-07, by the scheduled task itself.

## 8. ON CONVERSION

⛔ **This report BECOMES `B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md` when the data is in AND a decision has been taken on it — both halves.** The window elapsing is not a close. The conversion records **what the observation actually returned, quoted against §3's criterion as written**, and **what was decided or done about it, and by whom.**

**Card:** `Observation`. **`#1002` stays OPEN.**
