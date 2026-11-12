# B-CRON-MISSED-CATCHUP — Step 9 objective evaluation

**Workflow step:** 9 of 11 — iterate until every approved scope objective is green

**Deployed runtime:** `4e66ea904edf690e144035c959cbd335241f7651`

**Step 8 evidence package:** `bc945a098edb5a6d807c6696a6ef20678b4ed11e`

**Step 8 record head evaluated:** `4f08acfdfbb1f41bc5ff934112d07ff2e9aabe7a`

## Runtime-object identity

The Step 9 head differs from the deployed ref in six tracked paths, which is the positive control that the comparison spans real later commits. The same exact comparison restricted to `server`, `drizzle` and `shared` returns zero changed paths. Therefore the focused test rerun below exercises the same runtime object that staging and Coltrane verified, plus record-only commits.

```powershell
$all = @(git diff --name-only 4e66ea904edf690e144035c959cbd335241f7651 4f08acfdfbb1f41bc5ff934112d07ff2e9aabe7a)
$runtime = @(git diff --name-only 4e66ea904edf690e144035c959cbd335241f7651 4f08acfdfbb1f41bc5ff934112d07ff2e9aabe7a -- server drizzle shared)
"all_changed_paths=$($all.Count)"
$all
"runtime_changed_paths=$($runtime.Count)"
$runtime
```

Observed: `all_changed_paths=6`; `runtime_changed_paths=0`.

## Fresh focused proof

```bash
npx vitest run \
  server/tests/unit/b-cron-missed-catchup.test.ts \
  server/tests/unit/b-cron-missed-catchup-alert-store.test.ts \
  server/tests/unit/b-formula-health-audit-freshness.test.ts
```

Observed on the Step 9 head: 3/3 files passed and 70/70 tests passed. The expected failure-injection logs were present for invalid schedules, refused claims, core failures, deferred locks, alert-store failures, advisory-unlock rejection/false results, audit-write failure and stale-resolve failure; those are exercised controls, not production failures.

## Objective-by-object verdict

| objective | verdict | evidence that can distinguish green from red |
|---|---|---|
| OBJ-1 — true occurrence identity | **GREEN** | The 70-test population pins node-cron missed-event ordering, previous-calendar-boundary reconstruction, UTC/non-UTC schedules, invalid expressions and the natural callback clock. Coltrane independently matched both due production `scheduled_for` boundaries to their audit rows rather than to callback start time. |
| OBJ-2 — one durable attempt per identity | **GREEN** | The focused population exercises atomic contenders, durable uniqueness, claim refusal, natural/missed collision, prior-owner `claimed` resume, prior-owner `running` indeterminate handling and terminal-write ambiguity. Staging produced one core call across the race, 13 rows / 13 identities, zero duplicate groups, zero unfinished production rows and a retained indeterminate positive control. |
| OBJ-3 — serialized, bounded recovery | **GREEN** | The approved six-job age/backlog/input-honesty matrix is enforced by FIFO, cross-job independence, feed/session guards, Q-D age refusal, backlog skips, shared auxiliary serialization and pending-alert overtaking tests. The harness retained the expected too-old/session/backlog skips and scheduled-before-manual order rather than relabeling them success. |
| OBJ-4 — all six schedules, unchanged purpose | **GREEN** | The recursive compile-driven source fence finds exactly six dormant production registrations and requires reconciliation before start. Coltrane independently found the same six executable sites, six runtime registrations, six boot arms and six boot+5-minute arms; the two schedules that became due each fired once, while the four slower schedules retained their correct future next fires. |
| OBJ-5 — truthful stale-alert recovery | **GREEN** | The focused tests require same-job/same-boundary durable success and preserve failed, skipped, indeterminate, different-occurrence and `cron_verifier_blind` refusals. Coltrane created a fresh stale alert and independently matched actor `cron-recovery`, transport `engine`, occurrence ID, policy and terminal time to the succeeded durable occurrence. |
| OBJ-6 — compatible consumers and observable schedule truth | **GREEN** | The focused 70/70 population includes the 21 Formula Health freshness/source-contract tests, audit-write failure behavior, boot/next-fire fences and exact boundary fields. The live two due jobs had matching durable and audit boundaries; the registered log window showed six boot and six boot+5-minute arms without unhandled errors. |
| OBJ-7 — deterministic, non-blocking staging proof | **GREEN** | The exact-ref harness was independently rerun by Coltrane and returned 11/11 distinct identities with the registered 6 succeeded / 3 skipped / 1 failed / 1 indeterminate distribution, seven executed-only audit rows and one race core call. Exact-ref CI was four-job green; the controlled 81,803-line log read found zero production recovery, unhandled or duplicate-registration failures against 765 collision controls; PM2 stayed online at restart 695 and exact build identity. UI remained correctly N/A. |

## Iterate decision

Every approved objective is green against the same runtime object. No repair loop, new deployment or additional observation window is required in Step 9. The Delivery Board remains `Verification / Approved / Nothing` until governance reconciliation begins.

## Next step

Step 10 reconciles the finished scheduler-recovery design, verified limits and durable evidence across every applicable governance record.

## Step-11 repair re-evaluation — 2026-11-12

**Repaired deployed runtime:** `cd2b794dec63bea0771e32b733263b7ae516e6b8`

**Independent Step-8 evidence:** Coltrane PROCEED at corrected evidence ref
`3a2097653165c240d80644886a7a1ef80a09426c`

The Step-11 repair changed only the fire-evidence verifier and its unit and
integration proof. The deployed repair-to-record comparison contains zero
changed runtime paths, so the fresh measurement below is against the same
runtime object that Coltrane verified.

The measurement that made OBJ-6 red was rerun with the same two-stream
verifier instrument at `2026-11-12T12:45:32Z`. It returned exactly six healthy
decisions across the six registered jobs. The two legacy rows were accepted
at their real callback-start timestamps (`03:00:00.023Z` and
`06:00:00.018Z`), while the current awareness rows retained exact scheduled
identity. The same pass contained zero verifier error-stream lines; the
`11:13Z` three-row stale pass is the positive control that the error stream and
filter expose a red result when one exists.

| objective | repair verdict | discriminating evidence |
|---|---|---|
| OBJ-1 — true occurrence identity | **GREEN, unchanged** | The repair changes no registry, occurrence reconstruction or natural callback path. |
| OBJ-2 — one durable attempt per identity | **GREEN, unchanged** | The repair changes no claim, uniqueness, retry or terminal-state path. |
| OBJ-3 — serialized, bounded recovery | **GREEN, unchanged** | The repair changes no queue, age, backlog or input-honesty policy. |
| OBJ-4 — all six schedules, unchanged purpose | **GREEN, unchanged** | The repair changes no job registration or job core. The fresh verifier pass found exactly six healthy registered jobs. |
| OBJ-5 — truthful stale-alert recovery | **GREEN after repair** | Coltrane found zero verifier alerts created after deployment against three pre-deploy stale rows as the positive control. All three false rows are resolved with the deployed SHA, and a fresh due-row read excluded them while returning 17 other rows. |
| OBJ-6 — compatible consumers and observable schedule truth | **GREEN after repair** | The fresh same-instrument pass accepted both real pre-boot legacy clock shapes and current exact durable evidence. Post-boot legacy-shaped and genuinely missing boundaries remain rejection controls in the production-path proof. |
| OBJ-7 — deterministic, non-blocking staging proof | **GREEN, unchanged** | The repair required no natural wait or host-clock change; exact-ref CI, deployment, live verification and independent reproduction all completed while unrelated work remained unblocked. |

### Repair iterate decision

Every approved objective is green on the repaired runtime. No further repair,
deployment or observation window is required. Step 10 must amend the existing
governance reconciliation with the legacy-clock compatibility rule, its strict
pre-boot boundary, and the independently verified outcome.
