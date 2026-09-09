# B-DEPLOY-DRIFT-LINE — PROGRESS REPORT

# ✅ CLOSED 2026-09-09 — ALL FOUR CRITERIA PASS. Langston: *“CRITERION 4 PASSES. Take it to Step 11.”*
> ⚠️ **The header below is the PROGRESS-REPORT title this file carried while the window was open. Kept, not overwritten — the conversion is the record of how it closed, not a re-telling.**
> ~~⛔ OPEN — FIRST TRUE POSITIVE RETURNED (criteria 1+2 PASS); CRITERIA 3 AND 4 UNEXERCISED~~

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

## 3b. ⭐ CRITERION 3 — **ESCALATION: PASS**, 2026-09-08T08:24:13Z

**The criterion, as pre-registered:** *"It escalates to the next rung if the gap survives into the next band, as a NEW key rather than an edit."*

**OUTCOME.** The oldest undeployed commit (`2026-09-07T07:50:56Z`) crossed the **24 h** band at `2026-09-08T07:50:56Z`. The **`08:17:01Z` run is the first hourly run after that crossing** — the `07:17` run preceded it — and the job logged `RUNG=3 age=24h total=64 runtime=1 capped=0`. **Within one hourly cycle.**

| | |
|---|---|
| **rung 2** `81135510` | `deploy-drift-rung-2`, fired `2026-09-07T20:23:32Z` — **still `active`, UNTOUCHED** |
| **rung 3** `aaa13da0` | `deploy-drift-rung-3`, fired `2026-09-08T08:24:13Z` — **a NEW id under a NEW dedupe key** |

★ **That is escalation as a NEW ROW, not an edit to the existing one — which is precisely what the criterion asked for**, and it is what the escalate-only design on the dedupe key is supposed to produce.

**Magnitudes re-derived independently with `git` at the two shas the body names** (criterion 2's method, applied again to this firing): commits behind **64 = 64**; oldest committer date `2026-09-07T11:50:56+04:00` = **`07:50:56Z`**; runtime files **1 — `server/services/market-scanner.ts`**. All three match.

⛔ **CRITERION 4 IS THE ONLY ONE LEFT, AND IT IS CURRENTLY BLOCKED — WHICH IS WORTH STATING PLAINLY RATHER THAN LOGGING AS A DELAY.** It requires *"a deploy clears every rung on the next run, resolved by `deploy-drift-monitor`, with no row left open."* **The next deploy is being REFUSED** by `#402`'s daily bridge churn (`dt-deploy.sh:194-196`, exit 3) — the defect this batch's successor surfaced. ⇒ **`B-CANONICAL-BRIDGE-CHURN` (row 4.56a) is now on the critical path to closing this window**, not merely adjacent to it.

★ **STATUS: criteria 1, 2 and 3 PASS; criterion 4 unexercised. The batch stays OPEN** — three of four is not a close, and the window's own terms say so.

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


---

# ✅ CONVERSION TO COMPLETION REPORT — 2026-09-09

## A. WHAT DATA CAME IN — THE CRITERION QUOTED AS WRITTEN, THEN THE OUTCOME

> **CRITERION 4, verbatim from §3 above, written before any data:**
> *"4. **A deploy clears every rung on the next run**, resolved by `deploy-drift-monitor`, with no row left open."*

**OUTCOME: PASS, 2026-09-09T09:17:01Z, UNATTENDED.**
```
2026-09-09T09:17:01Z NO_RUNTIME_PATHS age=0h total=4 — the range touches no runtime file … Not reported.
2026-09-09T09:17:01Z NO_RUNTIME_PATHS resolved=2 failed=0
```
| clause of the criterion | evidence |
|---|---|
| *a deploy clears every rung* | deploy `c52c577fd` at 08:46:50Z; the next run cleared both open rows |
| *on the next run* | 09:17:01Z — the first `:17` tick after the deploy |
| *resolved by `deploy-drift-monitor`* | both rows carry `resolved_by_claimed=deploy-drift-monitor` |
| *with no row left open* | ⭐ **Langston enumerated rather than counted: ALL 7 `deploy-drift-*` rows ever minted are `resolved`; STILL-OPEN = 0** |

⭐ **UNATTENDED, CONFIRMED INDEPENDENTLY OF MY SAY-SO** (Langston, at the object): run stamps `07:17:01 · 08:17:01 · 09:17:01` — three clean cron ticks with **zero off-pattern runs after my 06:55 test cluster** — against `crontab: 17 * * * * /usr/local/bin/dt-deploy-drift.sh`.
⭐ **AND IT TOOK A REPAIRED EXIT, NOT THE ONE THAT ALREADY WORKED.** The evidence string reads `NO_RUNTIME_PATHS at …`, not `ZERO at …`. **That distinction is only legible because Langston required each resolve to name its condition** — without it, a post-`#1021` run and a pre-`#1021` run are indistinguishable in the record. It earned its keep on its first live firing.
⭐ **ONE OF THE TWO ROWS WAS `acknowledged` AND STILL CLEARED** — which he ruled REQUIRED rather than merely acceptable: a skipped acked row would sit non-terminal forever and **block every future re-mint of that key**, which is `#1021`'s own shape with the ack as the freezer.

⚠️ **AND A PREDICTION OF MINE FAILED FIRST, RECORDED BECAUSE THE INSTRUMENT WAS RIGHT AND I WAS NOT.** I predicted the 07:17 run would clear. It logged `RUNG=2 age=11h runtime=1` and cleared nothing — **correctly**, because `server/services/system-alerts.ts`, my own one-line edit, was undeployed. Langston verified at the object that the 06:17 rung-2 body names `runtime files undeployed: 1 — server/services/system-alerts.ts`. **I had built the expectation from a `--base` dry-run that FORCED a docs-only range instead of from the real state. A forced-base rehearsal is not the population.**

## B. WHAT DECISION WAS TAKEN, AND BY WHOM

**Langston, 2026-09-09, having re-derived every clause himself rather than reading my report:** *"CRITERION 4 PASSES. Take it to Step 11."* Board card `Review = Approved`, set and read back, census asserted 84/84 with no truncation.
**Action taken by CC-A:** the `#1021` fix was installed to `/usr/local/bin/dt-deploy-drift.sh` at 06:57:22Z — piped from the reviewed blob (never a worktree copy), digest verified **at a temp path before any swap**, atomic `mv`, twenty minutes clear of the `:17` tick so cron could not read a half-written script. Post-install digest `67b719338f4bad16d4fff76cb8e6ab3ff8b3587466af6099d2c3e65220e8a9e4`, 59,483 B.

## C. OBJECTIVES

| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | Measure deployed-sha vs branch-head distance and report it | ✅ **YES** | hourly on Helsinki since 2026-09-07; first true positive 09-07T20:23Z |
| 2 | Alert at the correct rung within one hourly cycle | ✅ **YES** | criterion 1, §3a |
| 3 | Magnitudes independently re-derivable | ✅ **YES** | criterion 2 — all four re-derived with `git` at the two shas the body names |
| 4 | Escalate as a new key when the gap worsens | ✅ **YES** | criterion 3 — rung 2 (09-07T20:17) → rung 3 (09-08T08:17), one episode, +12h |
| 5 | A deploy clears every rung, no row left open | ✅ **YES** | §A above; 7 of 7 rows resolved, still-open = 0 |

## D. GOVERNANCE FILES CHANGED — TRANSCRIBED FROM THE STEP-10 TIER LEDGER, `N/A` ROWS INCLUDED
**CHANGE-CLASS: `non_architecture`** (declared in the scope header at Step 1).

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry present and updated across the batch's life |
| T1 | `PHASE_HISTORY.md` | ✅ | narrative entry |
| T1 | `PHASE_19_PLAN.md` | ✅ | row 4.55 — re-opened at Step 3 for `#1021`, then criterion 4 recorded as satisfied |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ | position block updated at each step boundary; the drift-line status line pruned once superseded |
| T1 | the batch `SCOPE` | ✅ | `B_DEPLOY_DRIFT_LINE_SCOPE.md`, change-class declared |
| T1 | the batch `PRE_AUDIT` | ✅ | `B_DEPLOY_DRIFT_LINE_PRE_AUDIT.md` |
| T1 | `COMPLETION_REPORT` | ✅ | **this file** — converted from the progress report, not rewritten |
| T1 | the four session task lists | ✅ **mine** / `N/A` ×3 | `CC_A_SESSION_TASK_LIST.md` updated; the other three are not mine to touch |
| T1 | Langston's `/home/langston/MEMORY.md` | ✅ | stale drift-line paragraph REPLACED (it predated `#1021` entirely); backup taken first |
| T2 | `SYSTEM_MANUAL.md` | **N/A** | no architecture, strategy, regime, filter, pipeline or maths change — this is a monitoring shell script |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | INSTALLED-PATH row for the drift job |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1002`, `#1008`, `#1021` filed and annotated |
| T2 | `CHANGES_AND_FIXES.md` | ✅ | `FIX-2026-09-07-A` and `FIX-2026-09-09-A` |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | `shell-mangled-text` new sub-shape + first mechanism candidate; `line-endings` section created |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | the `class-override` row |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | ✅ | referenced for the resolve-not-ack discipline |
| T2 | `DELETED_COMPONENTS_LOG.md` | **N/A** | nothing removed |
| T2 | `POST_AUDIT_ROADMAP.md` | **N/A** | no roadmap-level change |
| T2 | `CLAUDE.md` / `CONDUCT.md` | **N/A** | no stable rule changed |
| T2 | every other ledger row | **N/A** | not touched |

**CI:** run `34322702494`, **4/4 GREEN VERIFIED PER JOB** at `c52c577fd` — Test Suite, Build, TypeScript Check (baseline gate), Docker Build. *(Per-job, never the run-level conclusion: with three sessions pushing, runs cancel each other and a `cancelled` job reads as not-green.)*

## E. ⛔ OPEN AT CLOSE — STATED AT THE TOP OF WHAT REMAINS, NOT BURIED

**HOME for all three: `P19-B12`, owner CC-A, alongside `#1004` and `#652`.**
⭐ **THESE ARE STATED RESIDUALS ON A PASSING WINDOW, NOT GATES — and Langston named why that distinction is load-bearing: §3 pre-registered FOUR criteria, and adding a fifth after seeing the data is exactly the failure pre-registration exists to prevent.**

1. ⛔ **`BELOW_FLOOR`'s deploy-record corroboration gate has NEVER been exercised live.** Construction and dry-run only. ⚠️ **PREVIOUSLY STATED: I bundled this with `ZERO` as "two untested paths". NOW: only this one is genuinely never-exercised. REASON: Langston corrected me at the object — see 2.**
2. ⚠️ **`ZERO` HAS FIRED LIVE, ATTENDED — my residual list was wrong.** It cleared `81135510` and `aaa13da0` at `2026-09-08T19:52:24Z`, both carrying `ZERO at …` evidence. **What it has never done is fire UNATTENDED.** It is also the one path that always worked pre-`#1021`, so it is the **lowest**-value residual. *(Re-derived by me at the alert store before accepting the correction.)*
3. ⭐ **A STALE TWIN OF THIS VERY JOB — the `#1004` shape, found by Langston.** `/opt/discord-bridges/dt-deploy-drift.sh` is `ad45948a…` / 41,535 B / Sep 8, while the live `/usr/local/bin/` copy is `67b71933…` / 59,483 B / Sep 9. **Nothing references the `/opt` copy** (checked across cron, `/usr/local/bin` and the bridges directory). **Re-derived by me on Helsinki; both digests read from the same surface.** An editable stale duplicate of the drift monitor, sitting where the bridge estate lives, is precisely how `#1004` bites.

## F. HONEST RESIDUAL — WHAT THIS BATCH DID NOT ESTABLISH

- **It did not establish that the job is correct on a CAPPED range.** At the 300-file cap the runtime gate is UNDECIDABLE by construction, `NO_RUNTIME_PATHS` is unreachable, and the `file-gate-undecidable` row clears **only** on `deployed == head`. The job's own reachability note says the cap is hit *exactly when a deploy has stalled* — i.e. the long doc-only stall. **Stated in the alert body; not exercised.**
- **It did not establish behaviour under a force-push that rewrites the range.** Langston's reading is that `behind`/`diverged` routes to ANOMALY before any clearing exit, and that the three-dot compare makes `files[]` a statement about TREES — **argued and read at the object, not observed.**
- **The measurement-failure path now takes the instrument offline HOURLY on one permanently-malformed line** (correct direction), and that row is `health_check`/`info`, so it reaches nobody through Discord and surfaces only in a §10.5 sweep. **The `#647` class; left there deliberately.**
