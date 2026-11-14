# B-CRON-MISSED-CATCHUP — Step 11 claim-only reader repair

**APPLICATION IMPLEMENTATION OBJECT:** `636937627`.

**PRODUCTION-PATH PROOF OBJECT:** `555ef3abe`.

**REVIEW REF:** the dispatch names the exact branch-tip commit on
`review/b-cron-missed-catchup-step8-r9-codex`. That exact ref contains the
current-evidence provenance repair, the expanded real-Postgres fence, and this
review package.

**One gate:** review the Step-11 repair diff against the approved architecture
and return `APPROVED` or `SENT BACK` with one consolidated list. Deployment,
runtime proof, governance re-reconciliation and completion are later gates.

## Required dispatch header

### i — DECLARED CHANGE-CLASS

`architecture` — verbatim from
`Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_SCOPE.md`.

### ii — COMPLETE `architecture` DOC SET, ROW BY ROW

| document row | repair-review state |
|---|---|
| scope | **present** — `Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_SCOPE.md`; Step-10 reconciliation exists and will be amended after repair verification |
| pre-audit | **present** — `Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_PRE_AUDIT.md`; Step-10 reconciliation exists and will be amended after repair verification |
| completion report | **absent at the review ref by design** — a local draft is withheld after the claim-only reader found the exact-evidence defect; Step 11 will correct and commit it only after this repair completes Steps 4–10 |
| `BATCH_CATALOG.md` | **present** with the prior Step-10-pending lifecycle record; repair outcome is absent until governance re-reconciliation |
| `PHASE_HISTORY.md` | **present** with the prior Step-10-pending lifecycle record; repair outcome is absent until governance re-reconciliation |
| `SYSTEM_MANUAL.md` | **present** with the original recovery architecture; durable retry, one-shot exact alerts and successful-boundary verification are absent until governance re-reconciliation |
| `SYSTEM_IMPACT_MAP.md` | **present** with the original six-job topology; the repaired alert/verifier contracts are absent until governance re-reconciliation |
| `CHANGES_AND_FIXES.md` | **present** with the prior shipped-fix record; repair findings are absent until governance re-reconciliation |
| `RUNNING_ISSUES.md` | **present** with `#691` still open through Step 11; repair evidence is absent until governance re-reconciliation |
| `POST_AUDIT_ROADMAP.md` | **judged N/A** — no phase-level roadmap or sequencing decision changes |
| `DELETED_COMPONENTS_LOG.md` | **judged N/A** — no component or tracked path is deleted |
| `PHASE_19_PLAN.md` | **judged N/A** — this is not a `P19-*` batch and has no row there |
| `ADJUSTMENT_FRAMEWORK.md` | **judged N/A** — no strategy, regime, filter or calibration parameter changes |

### iii — STEP-2 REFERENCE

`Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_PRE_AUDIT.md`.
Coltrane approved the corrected Step-2 object at
`0ad8a49b0fd52b0c3338f75cb531e9e7b1f6712c`, an ancestor of the repair ref.

Date: 2026-11-12
Owner: ANALYST Codex (CC-C stand-in)
Status: Step 3 completion-reader repair complete; return to Step 4 review
Base deployed runtime: `cd2b794dec63bea0771e32b733263b7ae516e6b8`

## Why completion stopped

The required claim-only Step 11 reader was given only the completion claim and
asked to name alternate states consistent with the proposed proof. The reader
found four concrete states in which the claim could be false. Each was
re-derived against the implementation and repaired before any completion report
was allowed to leave the draft stage.

## Re-derived defects and structural repairs

1. **Exact stale-alert resolution could be lost.** A successful occurrence now
   records a durable pending-resolution marker, whether it arrived naturally or
   through catch-up. Every scheduled, auxiliary and startup lock holder retries
   an alert-store failure. The verifier's final history read and alert mint now
   run under the same cross-process job lock as execution, so an empty resolve is
   an honest terminal `no_open_alert` outcome rather than either a leaking marker
   or a window in which a stale read can mint afterward. Exact calendar-boundary
   alerts remain one-shot; interval-fallback keys remain reusable after resolve.
   If alert resolution succeeds but the occurrence provenance write fails, the
   retry now distinguishes an already-resolved alert from a key that never
   existed. A contradictory nonterminal row after an empty resolve keeps the
   durable retry carrier instead of recording a false terminal outcome.
2. **The verifier could certify the wrong evidence.** It used the latest start
   time without requiring success, so an error or an older boundary starting
   late could make a missed boundary appear healthy. Its ten-minute latency
   grace now selects the newest calendar boundary whose evidence window has
   elapsed. The audit and occurrence stores are queried for success at that
   exact immutable identity in both the initial read and locked recheck; neither
   an older nor a later success can certify the missed boundary. The latest
   successful boundary is retained only for diagnostics and interval fallback.
3. **Eligibility could expire before core work began.** The catch-up policy was
   decided before lock wait and pre-run work, and an earlier repair still left
   one awaited durable transition after its final check. It is now decided
   under the job lock, checked before admission, and checked again after that
   transition returns with no later await before core entry. An occurrence that
   ages out is converted from its exact admission attempt to an explicit skip;
   the durable row preserves both check times and never enters the job core.
4. **Q-D's business clock had changed accidentally.** The wrapper passed the
   historical scheduled boundary into a job that reads current snapshots. Q-D
   now uses actual start time for market state, freshness and bucketing while
   retaining the scheduled boundary as the durable occurrence identity.

## Verification at the repair boundary

- Focused runner, alert-store, verifier and Formula Health suites: 4 files,
  102 tests passed, including retry, natural-success cleanup, empty-resolve
  termination, split-store provenance retry, contradictory-state refusal,
  separate-runner lock ordering, fail-once verifier recovery, stopped-lane
  independence, delayed-running-transition expiry, mature five-minute
  boundaries, later-success refusal and fallback recurrence branches.
- TypeScript baseline gate: 324 current known errors versus 324 baseline errors;
  no new or changed error.
- New controls exercise temporary resolution failure, alert-mint ordering,
  start-time expiry, exact successful-boundary identity, both five-minute
  production schedules and the Q-D clock split.
- `git diff --check`: clean.

## Honest residual carried forward

The deterministic staging race proves one core execution inside one process;
the new separate-runner control proves that verifier work waits behind a core
through the shared lock contract. It still does not imitate a second operating-
system process losing its database-lock session while the core is already
running. That destructive fault is not required by the registered scope and
will be stated as a proof limit rather than represented as covered.

## Claim-only reader record

`REVIEWER: claim-only · name the objects and alternate states consistent with the completion mechanism · HIT — durable stale-resolve retry absent; verifier used fired-at/error-compatible evidence; eligibility not rechecked at start; Q-D business clock regressed to scheduled boundary; staging race did not establish separate-process/mid-core-lock-loss behavior · re-derived yes`

`REVIEWER: claim-only · name the objects and alternate states consistent with successful exact-alert cleanup · HIT — alert resolution could commit before the occurrence outcome write, and the retry would mislabel that history as no alert existing; persistent dependency failure correctly remains pending rather than falsely terminal · re-derived yes`

The reader record identifies the challenge; every defect and repair above was
independently re-derived from the code before implementation.

## Step-4 review history carried into this request

Coltrane sent the third repair back at exact implementation
`52f176e5fa7435b1c740acc8ff776395023faaac` with one blocker. The verifier's
locked recheck used the execution lane's `runAuxiliary` path. A transient
lock/session failure permanently stops that lane, so every later verifier pass
could be rejected by the stopped-lane guard and then collapsed to a false
`{ ok: true, stale: [] }`. This repair keeps the shared advisory-lock race
closure but gives verifier work a retryable path that does not read or mutate
the stopped execution-lane state. A failed pass is returned as explicit
`locked_recheck_fail` blindness, and the next pass retries the lock normally.

Coltrane sent the fourth repair back at exact implementation
`4956ea1f4b0551a33d09a3c8532a7ed6c455727b` with one blocker. The claimed
actual-start guard still ran before the awaited durable running transition, so
that transition could stall across an age, next-boundary or market guard. The
fifth repair rechecks after the transition returns. If eligibility expired, it
terminalizes that exact attempt as skipped, clears the running-only fields to
retain the table's state-shape contract, and never calls the core. The new
control advances Q-D across its age ceiling inside the running transition and
proves the terminal skip and zero core calls.

Coltrane sent the fifth repair back at exact implementation
`bbdb7592ad7d81b200ebe260c5011058505eab63` with one blocker. The verifier chose
the occurrence immediately before each check and then skipped it whenever it
was inside the ten-minute latency grace. A job running every five minutes could
therefore never reach an evidence judgement, and subtracting grace from the
evidence floor could also let the prior five-minute success certify a missed
boundary. The sixth repair selects the newest occurrence at or before the
grace cutoff and prevents an older boundary from certifying it. Red/green
controls cover both five-minute production jobs and the prior every-minute
grace-blind case.

Coltrane sent the sixth repair back at exact implementation
`e716c815b4e64e99510ae06c02ea205cb4be4187` with one blocker. Because the query
retained only `MAX(scheduled_for)` and accepted that value at or after the mature
boundary, an ordinary 14:55 success could hide a missing 14:50 occurrence. The
seventh repair queries exact candidate-boundary existence in both the initial
and locked reads. For both five-minute production jobs, a present 14:55 with an
absent 14:50 now mints the 14:50 alert; exact 14:50 success is healthy.

## Repair change-set census

Across the repair range from the parent of
`49de4df1d3bb506fc6beb3c25894649beb53b5f3` through implementation object
`e505f76a595b6d2dbba72334fd098355f6f0db4b`, exactly ten tracked paths changed:
one new repair record and nine modified paths; zero tracked paths were deleted.
`.claude/launch.json` remains an unrelated untracked file and is not in the
review ref.

### NEW

- `Claude Comms and Packages/Change Lists/B_CRON_MISSED_CATCHUP_STEP11_REPAIR.md`

### MODIFIED

- `.claude/memory/MEMORY_CC_C.md` — repair workflow boundary only
- `server/scripts/b-cron-missed-catchup-harness.ts`
- `server/services/cron-occurrence-runner.ts`
- `server/services/cron-fire-evidence-verifier.ts`
- `server/services/system-alerts.ts`
- `server/services/xstock-qd-probe-cron.ts`
- `server/tests/unit/b-cron-missed-catchup.test.ts`
- `server/tests/unit/b-cron-missed-catchup-alert-store.test.ts`
- `server/tests/unit/cron-fire-evidence-verifier.test.ts`

### DELETED

None.

## Load-bearing diff snippets

### 1. MODIFIED — exact recovery resolution becomes durable and one-shot

Before, a successful occurrence attempted resolution once and swallowed a
failure:

```ts
if (result.status === 'succeeded' && result.occurrenceId) {
  try {
    await this.deps.resolveByKey(
      `cron_stale:${result.jobName}:${result.scheduledFor.toISOString()}`,
      CRON_RECOVERY_ACTOR, evidence, 'engine',
    );
  } catch (err) {
    console.error('[CRON-RECOVERY][STALE_RESOLVE_FAIL]', err);
  }
}
```

After, every successful scheduled occurrence installs a durable carrier. Every
job lock holder retries it; the terminal record distinguishes an open row that
was resolved from an empty result that is now safe because minting uses the same
lock:

```ts
...(status === 'succeeded' ? { stale_resolve_pending: true } : {}),

const resolved = await this.deps.resolveByKey(
  key, CRON_RECOVERY_ACTOR, evidence, 'engine',
);
let outcome;
if (resolved.length > 0) {
  outcome = 'resolved_open_alert';
} else {
  const alertState = this.deps.dedupeStateByKey(key);
  if (alertState === 'nonterminal') continue; // keep the retry carrier
  outcome = alertState === 'resolved'
    ? 'already_resolved_alert'
    : 'no_open_alert';
}
await store.markStaleResolvePersisted(
  row.id,
  this.now(),
  outcome,
);
```

The verifier performs its final history recheck and alert mint in the runner's
cross-process job lock. Only a parsed calendar boundary is marked one-shot:

```ts
await cronOccurrenceRunner.runVerifierLocked(job.name, async () => {
  const lockedRead = await queryLastFires([job.name]);
  // re-evaluate under the lock, then mint only if the boundary is still stale
  await emitStaleAlert(/* exact occurrence */, true);
});

await emitStaleAlert(/* interval fallback */, false);
```

### 2. MODIFIED — verifier health requires the exact successful identity

Before:

```sql
SELECT task_name, MAX(fired_at) AS last_fired_at
FROM scheduled_tasks_audit
GROUP BY task_name
```

After:

```sql
WITH candidates(task_name, candidate_scheduled_for) AS (
  VALUES ('feed_integrity_cron', '2026-06-02T14:50:00Z'::timestamptz)
), successful_boundaries AS (
  SELECT task_name, scheduled_for FROM scheduled_tasks_audit
   WHERE status = 'success'
  UNION ALL
  SELECT job_name AS task_name, scheduled_for FROM scheduled_job_occurrences
   WHERE status = 'succeeded'
)
SELECT candidates.task_name,
       MAX(successful_boundaries.scheduled_for) AS last_scheduled_for,
       COALESCE(BOOL_OR(
         successful_boundaries.scheduled_for = candidates.candidate_scheduled_for
       ), false) AS candidate_succeeded
FROM candidates
LEFT JOIN successful_boundaries
  ON successful_boundaries.task_name = candidates.task_name
GROUP BY candidates.task_name, candidates.candidate_scheduled_for
```

### 3. MODIFIED — eligibility is rechecked after durable admission

Before, the policy decision preceded the database lock and pre-run work. The
first repair added a pre-admission check but still awaited the durable running
transition afterward. Now the runner checks again after that await; there is no
later await before core entry. If eligibility expired, that exact running
attempt is converted to the schema-valid skipped shape and the core is never
called:

```ts
const decisionAt = this.now();
let policy = this.evaluatePolicy(job, item, lane, decisionAt);
// durable claim and pre-run work
const admissionAt = this.now();
const startPolicy = this.evaluatePolicy(job, item, lane, admissionAt);
if (!startPolicy.eligible) {
  await store.markSkipped(claim.row.id, admissionAt, startPolicy.reason, {
    rechecked_before_start: true,
    initial_lag_ms: policy.lagMs,
  });
  return { status: 'skipped', reason: startPolicy.reason, /* identity */ };
}

await store.markRunning(claim.row.id, admissionAt, attemptId, ownerInstanceId);
const firedAt = this.now();
const coreStartPolicy = this.evaluatePolicy(job, item, lane, firedAt);
if (!coreStartPolicy.eligible) {
  await store.markAdmissionExpired(
    claim.row.id, attemptId, firedAt, coreStartPolicy.reason,
    { rechecked_after_running_transition: true, /* both lag samples */ },
  );
  return { status: 'skipped', reason: coreStartPolicy.reason, /* identity */ };
}
```

### 4. MODIFIED — Q-D separates occurrence identity from business time

Before:

```ts
await runQdProbeOnce(context.scheduledFor, config);
```

After:

```ts
await runQdProbeOnce(context.firedAt, config);
```

The occurrence ledger and fire audit still receive `scheduledFor`; Q-D uses
`firedAt` only for its current snapshots, market state, freshness and bucket.

### 5. MODIFIED — verifier lock retry is independent of execution-lane stop

The verifier still uses the occurrence store's per-job advisory lock, so it
cannot mint while a natural or catch-up core owns that lock. It no longer enters
the in-process execution FIFO or reads `stoppedLanes`. A lock/session failure
rejects only that verifier pass; contention retries, and a later pass can obtain
a fresh pooled session. The report distinguishes blindness from health:

```ts
const outcome = await cronOccurrenceRunner.runVerifierLocked(job.name, async () => {
  // final history read and exact alert mint under the shared advisory lock
});
if (outcome === 'blind') blind.push(job.name);

if (blind.length > 0) {
  return { ok: false, stale, skipped: 'locked_recheck_fail', blind };
}
```

The fail-once control first receives that explicit blind report, then restores
the lock session and proves the next pass mints the exact stale alert. The
runner control also proves its own lock failure is retryable and that a
separately stopped execution lane does not block later verifier locking.

### 6. MODIFIED — mature boundaries require exact evidence

Before, the verifier always selected the occurrence immediately before `now`
and skipped it if it was less than ten minutes old. Every five-minute job was
therefore permanently inside grace. It also subtracted grace from the evidence
floor, which admitted the prior five-minute success. A second repair still
accepted any later success. Now both the candidate read and locked recheck
select the newest boundary whose evidence window has elapsed and query whether
that exact immutable identity succeeded:

```ts
const matureOccurrence = computePrevFire(
  job.expression,
  job.timezone,
  new Date(now - FIRE_LATENCY_GRACE_MS + 1),
);

const isStale = !evidence.candidateSucceeded;
```

For feed integrity and Q-D at 15:00, the mature five-minute boundary is 14:50.
A 14:45 success and a later 14:55 success both leave 14:50 stale; only exact
14:50 success is healthy. The same calendar selection and exact-identity query
are repeated under the shared job lock before minting.

### 7. MODIFIED — legacy callback-time evidence remains readable

The first verifier pass on deployed R7 correctly judged the current five-minute
boundaries, but falsely minted three stale alerts for slower jobs. Their
successful pre-deploy audit rows were at `03:00:00.023`, `06:00:00.020` and
`06:00:00.018`; before this batch, every wrapper passed one callback-start
timestamp as both `scheduled_for` and `fired_at`, despite the writer contract
already naming `scheduled_for` as the intended calendar boundary.

R8 preserves both clock contracts without weakening current identity. Exact
equality is sufficient for a durable occurrence row, or for a scheduled audit
row that carries its occurrence identity. A row may use the legacy
compatibility arm only when the candidate predates this process boot,
the evidence is a successful audit row with `trigger_source=cron` and no
`occurrence_id`, and its callback timestamp lies in the half-open calendar
partition `[candidate, next candidate)`. The strict upper bound means a success
at the next boundary still cannot certify the earlier candidate. The same
classification runs in the initial read and the recheck under the job lock.

The live six-job population contains 67,464 successful legacy cron rows without
an occurrence ID; all 67,464 store `scheduled_for=fired_at`, all 67,464 fall
inside their derived half-open calendar partition, and their observed offsets
are 6 ms through 33.408 s. The exact production query maps the three false-stale
rows and a current exact row to success, while a genuine missing 2026-05-30
feed-integrity boundary remains false even though the same job has many later
successes.

The new real-Postgres integration fence distinguishes nine states: legacy
inside-window, exactly-next-boundary, non-cron, error, legacy-disabled, current
exact/nonexact and durable exact/later. It is registered to run against the
migrated CI database; the local run skipped honestly because no test database
was reachable. Six focused unit files passed 123/123, the TypeScript gate is
324 current / 324 baseline, and the production build passed.

`REVIEWER: claim-only · asked which objects settle the legacy-clock compatibility claim and what other states remain consistent · identified callback delay, historical schedule drift, alternate writers and ambiguous legacy identity; the repair was narrowed to pre-boot cron rows inside a strict half-open calendar partition and re-derived against the full live population · re-derived y`

### 8. MODIFIED — the process-start classification is behaviorally pinned

Coltrane's R8 review found that the SQL integration fence supplied
`allowLegacyWindow` directly, while the unit fence only counted the two source
comparisons. Reversing both production comparisons could therefore satisfy
every submitted assertion while rejecting the pre-boot legacy rows and
admitting post-boot legacy-shaped rows.

The production-path unit fixture now derives its candidate result from the
actual boolean embedded by `runVerification`. It proves three distinct paths:
pre-boot legacy evidence succeeds in the initial read; a stale initial read is
recovered by pre-boot legacy evidence in the locked recheck; and post-boot
legacy-shaped evidence is rejected by both reads and mints the exact stale key.
The controls also assert the initial/locked query counts and the boolean passed
to each query, so one read cannot silently cover for the other.

Mutation proof reversed both process-start comparisons from `<` to `>`. All
three new behavioral controls failed in the required opposite directions; the
initial and locked pre-boot cases became stale, while the post-boot case became
healthy. Restoring the production comparison returned the verifier file to
24/24 and the six focused files to 123/123.

## 9. STEP 7 LIVE VERIFICATION — legacy and current clocks both pass

The landed ref `cd2b794dec63bea0771e32b733263b7ae516e6b8` passed CI run
`43215462342` in all four jobs and was deployed by `codex-c` at
`2026-11-12T12:15:34Z` (restart 697). The deploy record asserted that exact
running identity and `ENGINE RESUMED`. The verifier's own startup line followed
at `2026-11-12T12:15:32Z` with its registered 900-second interval.

The same two-stream runtime log instrument provides the before/after
discriminator. The `11:13:00Z` pass judged all three valid rows stale:

- `formula_audit_cron`: mature `03:00:00.000Z`, success `03:00:00.023Z`;
- `xstock_universe_discovery_cron`: mature `06:00:00.000Z`, success
  `06:00:00.018Z`;
- `awareness_reflection_cron`: mature `06:00:00.000Z`, success
  `06:00:00.020Z`.

At `12:13:00Z`, the last pre-deploy pass judged only universe discovery and
Formula Health stale (2 of 6 registered jobs). Awareness reflection was no
longer in that population because its exact current `12:00:00.000Z` durable
occurrence already existed. The three-row positive control is therefore the
`11:13:00Z` pass; the `12:13:00Z` pass is the two-row transition state.

The durable-row read independently confirmed those legacy audit shapes. It
also found the post-repair current awareness occurrence at exactly
`12:00:00.000Z` in both the audit and occurrence ledgers, with an occurrence ID
and scheduled provenance.

The first automatic post-restart verifier pass at `12:30:33Z` judged all six
registered jobs healthy. Its three load-bearing rows were:

- universe discovery: success `06:00:00.018Z` certified mature
  `06:00:00.000Z` through the pre-boot legacy partition;
- Formula Health: success `03:00:00.023Z` certified mature
  `03:00:00.000Z` through the pre-boot legacy partition;
- awareness reflection: current exact success `12:00:00.000Z` certified exact
  mature `12:00:00.000Z`, without legacy compatibility.

The same pass logged six healthy decisions and no verifier skip or unhandled
error. This proves the running process, not merely the deployed file, accepts
the two real legacy shapes while retaining exact current identity.

Alerts `7e07b671-159d-49b1-879e-ecfea53a50ef`,
`475e1e6e-b133-4d2b-8a22-84028520ff86` and
`faf3be74-940e-4187-9026-2632db6ed0b2` were then resolved by `codex-c` at
`12:30:59Z`–`12:31:00Z`, each with the landed SHA as evidence. The direct
readback showed all three `resolved`; the due-queue re-read still found 16
other due rows (positive control) and found none of these three.

**UI judgement:** this repair changes only the background verifier's evidence
classification and alert state; it adds or changes no page, panel, field,
layout or interactive behavior. The existing alert presentation consumes the
same alert records without a changed rendering contract, so there is no
affected UI surface to navigate for this repair. The checkable surface is the
running verifier log plus the durable audit, occurrence and alert records read
above.

### Step 8 reproduction commands

Run these on staging as `deploy` from `/home/deploy/dawntrader` after loading
the environment where needed:

```bash
cat /home/deploy/dawntrader-deploy.record

for stream in out error; do
  grep -h '2026-11-12 11:13:00.*CRON-FIRE-VERIFIER' \
    "/var/log/dawntrader/${stream}.log"
done
for stream in out error; do
  grep -h '2026-11-12 12:13:00.*CRON-FIRE-VERIFIER' \
    "/var/log/dawntrader/${stream}.log"
done
for stream in out error; do
  grep -h '2026-11-12 12:30:33.*CRON-FIRE-VERIFIER' \
    "/var/log/dawntrader/${stream}.log"
done

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off <<'SQL'
SELECT task_name, status, scheduled_for, fired_at,
       meta->>'occurrence_id' AS occurrence_id,
       meta->>'trigger_source' AS trigger_source
FROM scheduled_tasks_audit
WHERE task_name IN (
  'formula_audit_cron',
  'xstock_universe_discovery_cron',
  'awareness_reflection_cron'
)
AND scheduled_for >= '2026-11-12T00:00:00Z'
ORDER BY task_name, scheduled_for;

SELECT job_name, status, scheduled_for, first_source, id
FROM scheduled_job_occurrences
WHERE job_name IN (
  'formula_audit_cron',
  'xstock_universe_discovery_cron',
  'awareness_reflection_cron'
)
AND scheduled_for >= '2026-11-12T00:00:00Z'
ORDER BY job_name, scheduled_for;
SQL

npm run -s system-alerts -- list --state resolved | grep -E \
  '7e07b671|475e1e6e|faf3be74'
```

From a repo clone at the evidence ref, the due-queue read is:

```bash
ssh deploy@188.245.193.8 'python3 -' < scripts/due-alerts.py \
  | grep -E '1ae9a06b|7e07b671|475e1e6e|faf3be74|^COUNT'
```

The expected positive control is the still-due `1ae9a06b` row plus a nonzero
`COUNT`; none of the three resolved target IDs may appear.

## 10. STEP 8 INDEPENDENT STAGING VERIFICATION — PROCEED

Coltrane returned PROCEED at corrected evidence ref
`3a2097653165c240d80644886a7a1ef80a09426c` and deployed ref
`cd2b794dec63bea0771e32b733263b7ae516e6b8` at
`2026-11-12T12:45:14Z`. He independently reproduced the corrected `11:13Z`
three-of-six stale positive control, the `12:13Z` two-of-six transition state,
and the post-deploy six-of-six healthy outcome. His fresh authenticated
readback confirmed exact running identity and engine liveness; all three
target alerts remained resolved with the deployed SHA, a fresh due-row read
returned 17 other rows while excluding all three targets, and a complete
four-state alert read returned zero verifier alerts created after deployment
against the three `11:13Z` rows as its positive control.

The independent package check matched 29,113 bytes and SHA-256
`b185456e0a483a6500b6e8cde4b49a1f162975f76f3feca418fc7716c2b3870b`.
Coltrane confirmed there is no affected UI contract and rendered the existing
System Alerts surface successfully.

## 11. STEP 11 FRESH-READER SEND-BACK — exact legacy-shaped bypass closed

The required claim-only completion reader found that exact equality sat outside
the provenance checks. An audit row at the exact candidate timestamp could
therefore certify a current candidate even when it had no occurrence identity,
or when it came from a non-scheduled source. Re-derivation at the deployed code
confirmed both bypasses.

The repair now treats exact current evidence as valid only when it is either a
succeeded durable occurrence or a successful audit row carrying an occurrence
identity from a scheduled or missed-catch-up run. The pre-boot compatibility
arm remains separately limited to a successful legacy cron row without an
occurrence identity inside the strict candidate partition. The real-database
fence now distinguishes twelve states, adding exact legacy-shaped refusal,
exact non-scheduled refusal, and exact missed-catch-up acceptance.

**BEFORE — exact timestamp bypassed provenance:**

```sql
AND (
  successful_boundaries.scheduled_for = candidates.candidate_scheduled_for
  OR (
    candidates.allow_legacy_window
    AND successful_boundaries.evidence_source = 'audit'
    AND successful_boundaries.occurrence_id IS NULL
    AND successful_boundaries.trigger_source = 'cron'
  )
)
```

**AFTER — exact current proof and legacy proxy are separate arms:**

```sql
AND (
  (
    successful_boundaries.scheduled_for = candidates.candidate_scheduled_for
    AND (
      successful_boundaries.evidence_source = 'occurrence'
      OR (successful_boundaries.evidence_source = 'audit'
          AND successful_boundaries.occurrence_id IS NOT NULL
          AND successful_boundaries.trigger_source IN ('cron', 'missed_catchup'))
    )
  )
  OR (candidates.allow_legacy_window /* existing strict legacy partition */)
)
```

The reader also correctly identified the limit of historical evidence: an
in-partition pre-ledger row is proxy evidence for one successful callback in
that calendar partition, not proof of the exact historical occurrence. The
batch keeps that approved compatibility design and narrows its closing claim;
the observed 2026-05-30 miss remains false because its partition contains no
accepted proxy, but the mechanism does not claim to distinguish all alternate
histories inside a populated old partition.

`REVIEWER: claim-only · asked which objects settle whether legacy-shaped or later rows can certify current or genuinely missing candidates, and what alternate states fit those objects · HIT — exact legacy/non-scheduled audit rows bypassed the current provenance gate, and populated pre-ledger partitions remain proxy evidence rather than exact historical identity · re-derived y`

**Bug taxonomy:** outcome 1, real defect in the R8 current-identity predicate;
root cause fixed at the shared evidence classifier. The historical ambiguity is
working as the explicitly approved compatibility design and is reported as a
limit, not “fixed” into false certainty.

## Judgement calls to attack

1. Can any transient alert-store failure, marker-write failure or verifier/resolve
   ordering still leave an exact successful occurrence open or re-created now
   that both sides use the same cross-process job lock, and does a split write
   preserve whether an alert was resolved earlier or never existed?
2. Is `one_shot` correctly limited to immutable scheduled-boundary identities,
   without changing ordinary recurring alert behavior?
3. Does the successful-boundary union reject error rows and late starts while
   retaining truth when the failure-safe audit write is missing, and does the
   mature-boundary grace remain judgeable for every cadence shorter than ten
   minutes without accepting either a prior or later boundary?
4. Can lock wait, pre-run work or the durable running transition still let a
   catch-up enter core after its age/session guard has expired, and is the
   post-admission expiry record truthful and schema-valid?
5. Does Q-D now retain both truths: scheduled identity for provenance and actual
   start for current-snapshot business logic?
6. Is the same-process deterministic race, separate-runner lock-order control
   and database uniqueness proof an honest sufficient scope close while the
   operating-system-process/mid-core-lock-loss behavior remains explicitly
   unclaimed?
7. Can a verifier lock/session failure still poison later passes or be reported
   as healthy, and does bypassing the stopped execution lane preserve the same
   cross-process advisory-lock exclusion against core execution?
8. Does the legacy compatibility arm preserve the approved readable-history
   objective without letting an exactly-next-boundary row, a non-cron/error row,
   a current nonexact row or any post-boot legacy-shaped row certify a candidate?
9. Can either production process-start comparison be inverted or bypassed
   without making the initial-read and locked-recheck behavioral controls fail?

## 12. STEP 7 LIVE VERIFICATION OF THE STEP-11 REPAIR — PASS (CC-C, 2026-11-13)

**Deployed object.** Joint deploy by `cc-a`: `dt-deploy 77f6fd5984aeb42a2c3a319dba32b116ca49b28b`
at `2026-11-13T21:03:55Z`, restart 698, `ENGINE RESUMED`, identity asserted
(`/home/deploy/dawntrader-deploy.record`; `dist/BUILD_SHA` reads the same sha).
`git merge-base --is-ancestor` confirms both `1251fb8e4` and the repair landing
`b4edaf089` are ancestors of the deployed sha. The running build carries the
repaired arm: `dist/index.js` holds the line
`successful_boundaries.trigger_source IN ('cron', 'missed_catchup')` (1 line) and
`successful_boundaries.evidence_source = 'occurrence'` (1 line), matching
`server/services/cron-fire-evidence-verifier.ts:159-162` at the deployed sha.
**Process, not file:** PM2 `pm_uptime` = `2026-11-13T21:03:45Z` (pid 3264025,
restart 698), after the build; the verifier's own line
`Started; interval=900s, grace_multiplier=1.5x` follows at `21:03:53Z`.

**Pre-registered prediction (written from the durable read before the pass):**
all six registered jobs healthy on the first post-restart pass, every certifying
boundary an exact current occurrence or identified audit row, zero STALE / skip /
error verifier lines, zero new cron alerts.

**Durable population (read about 21:06Z, before the pass, all `scheduled_for >= 2026-11-13T00:00Z`).**
`scheduled_tasks_audit`, the six jobs: 536 rows, every one `success` with an
occurrence id and `trigger_source = 'cron'` — feed_integrity 254 and qd_probe 254
(00:00 → 21:05, every five-minute slot), awareness_state_update 22 (00:00 → 21:00,
every hour), awareness_reflection 4, formula_audit 1, universe_discovery 1.
`scheduled_job_occurrences` holds `succeeded`, `first_source = natural` rows for
formula_audit 03:00, universe_discovery 06:00 and awareness_reflection
00/06/12/18:00. So today's population contains no legacy-shaped or
non-scheduled exact row.

**Result — first post-restart pass, `2026-11-13 21:18:53Z` (out stream):** six of
six `healthy`:

| job | last_successful_boundary | mature_occurrence |
|---|---|---|
| xstock_universe_discovery_cron | 06:00:00.000Z | 06:00:00.000Z |
| xstock_qd_probe_cron | 21:15:00.000Z | 21:05:00.000Z |
| formula_audit_cron | 03:00:00.000Z | 03:00:00.000Z |
| feed_integrity_cron | 21:15:00.000Z | 21:05:00.000Z |
| awareness_state_update_cron | 21:00:00.000Z | 21:00:00.000Z |
| awareness_reflection_cron | 18:00:00.000Z | 18:00:00.000Z |

Error stream: **zero** verifier lines since the restart. **Positive control:**
the same stream holds verifier STALE lines when they happen
(`error__2026-11-13_00-00-00.log`, e.g. `2026-11-12 21:30:32 … job=feed_integrity_cron STALE …`).
Alert store (`system-alerts.jsonl`, whole file, merged by id): 68 cron-keyed rows
all-time (positive control), **0 created since `21:03:55Z`**.

**What this does and does not prove.** It proves the running process on the
repaired predicate still certifies every real current boundary (no regression,
no false page) across all six jobs. **It does not exercise the repair's refusal
arms live:** today's population holds no exact legacy-shaped or non-scheduled
row, so the exact-legacy refusal, exact non-scheduled refusal and exact
missed-catch-up acceptance remain proven by the twelve-state real-database fence
only, as stated in §11. Stated, not claimed.

**UI judgement:** unchanged from §9 — the repair changes only the background
verifier's evidence classification; no page, panel or rendering contract moves.

`NOT RE-READ` by a second reader before Langston.

**Reproduce (staging, as `deploy`, in `/home/deploy/dawntrader`):**

```bash
cat /home/deploy/dawntrader-deploy.record; cat dist/BUILD_SHA
grep -c "successful_boundaries.trigger_source IN ('cron', 'missed_catchup')" dist/index.js
for s in out error; do grep -h 'CRON-FIRE-VERIFIER' /var/log/dawntrader/$s.log \
  | grep -E '^2026-11-13 21:(0[4-9]|[1-5][0-9])'; done
grep -h 'CRON-FIRE-VERIFIER' /var/log/dawntrader/error__2026-11-13_00-00-00.log | tail -1
```

**STEP: 7 of 11 COMPLETE · NEXT STEP: 8 of 11** (Langston's second pass on this restart).

## 13. STEP 8 PROCEED, AND STEP 9 — LANGSTON'S TWO CARRIES FOLDED (CC-C, 2026-11-13)

Langston ruled **Step 8 PROCEED** at 21:42Z (Discord `1570916733307461712`),
re-deriving every number himself: build `77f6fd598`, verifier file
byte-identical to the graded ref, 548 rows for the six jobs (all `success`, 0
null `occurrence_id`, `trigger_source` = `cron` only), all six certified
through the **repaired** exact arm (four had `allowLegacyWindow=true`, but
today's partitions hold no `occurrence_id IS NULL` row for any registered job),
and a second clean pass at 21:33:53Z. His silence control was stronger than
§12's: four non-cron alerts minted inside 21:05→21:19Z, so the store was
accepting writes while the cron class stayed silent. The refusal arms remain
fence-only, by design: exercising them live would mean writing fabricated
evidence into production.

### Carry 1 — the fire row's identity is no longer overridable (code)

`cron-occurrence-runner.ts` spread `...beforeMeta, ...resultMeta` **after**
`occurrence_id` and `trigger_source`, and `ScheduledJobAuditMeta.trigger_source`
admitted `'poll' | 'boot'`, which is wider than the verifier's exact-arm accept
set. No registered recovery emits either key today (latent), but after the
Step-11 repair a job returning one would silently void its own evidence and
page STALE.

**BEFORE** (`cron-occurrence-runner.ts`, the audit write):

```ts
meta: {
  trigger_source: item.source === 'natural' ? 'cron' : 'missed_catchup',
  duration_ms: completedAt.getTime() - firedAt.getTime(),
  occurrence_id: claim.row.id,
  lag_ms: policy.lagMs,
  policy_version: CRON_RECOVERY_POLICY_VERSION,
  ...beforeMeta,
  ...resultMeta,
},
```

**AFTER:**

```ts
meta: {
  duration_ms: completedAt.getTime() - firedAt.getTime(),
  lag_ms: policy.lagMs,
  policy_version: CRON_RECOVERY_POLICY_VERSION,
  ...beforeMeta,
  ...resultMeta,
  trigger_source: item.source === 'natural' ? 'cron' : 'missed_catchup',
  occurrence_id: claim.row.id,
},
```

`scheduled-jobs-audit.ts`: `trigger_source?: 'cron' | 'missed_catchup'`
(was `| 'poll' | 'boot'`). **Caller census:** the runner is the only
production caller of `writeFireRow` (`git grep` at the ref, tests excluded;
the harness wraps the same function). Poll and boot rows come from
`session-lifecycle-controller.ts` through its own `AuditMeta` type, untouched.
`duration_ms`, `lag_ms` and `policy_version` stay before the spreads: no
consumer reads them as identity, and moving them would change what an
existing job's own `duration_ms` (if it reports one) means.

**Fence:** a new test in `b-cron-missed-catchup.test.ts` has both
`beforeRun` and `run` return `trigger_source` (`'boot'`, `'poll'`) and a forged
`occurrence_id`; the fire row must still carry `cron` and the durable
occurrence id, and keep the job's own `proof` field. **Mutation-proved:** with
the old runner restored it fails (`expected 'poll' to be 'cron'`); with the fix
it passes. Both suites: 59 of 59. `tsc --noEmit`: 324 errors before and after
(the repo baseline), none in the three touched files.

### Carry 2 — the declared-open row, and the second `#744` instance (governance)

Re-derived before filing: `GOVERNANCE_EXCEPTIONS.md` held 0 rows naming this
batch (positive control 11 for `B-PRICE-SIDE-BY-JOB`); the alert store's 443
governance rows (merged by id, non-null fields kept) name it 0 times while the
two open-checker families name 26 distinct batches (corrected in §14: the 28
first stated here was the `open > 48h` family's ROW count). Filed: the declared-`open` row in `GOVERNANCE_EXCEPTIONS.md`, and
a ➕ instance on `#744` (owner CC-A) in `RUNNING_ISSUES.md`. The cause is
recorded as a hypothesis.

**This carry-1 code change needs its own Step 4 (Langston, at the ref), CI,
and a deploy before Step 10.** It rides the next deliberate deploy; nothing
restarts for it alone.

**STEP: 9 of 11 — fix landed, NEXT: Langston's Step 4 on the carry-1 diff.**

## 14. STEP 4 PROCEED ON CARRY 1, AND ITS THREE NOTES FOLDED (CC-C, 2026-11-13)

Langston ruled **Step-4 PROCEED** on carry 1 at `7ddaadb83` (Discord
`1570923179759771802`), re-reading the patch, the verifier's exact and legacy
arms and the `writeFireRow` caller census himself. Three notes, none blocking,
all folded here for the same deploy:

1. **All five runner-authored keys are written last, and reserved on the
   interface a job author reads.** His discriminator: not "identity" but *who is
   the only party that can know the value* — `lag_ms` (the runner's
   post-`markRunning` recheck), `policy_version` (a runner constant) and
   `duration_ms` (`completedAt − firedAt`) cannot be computed by a job, so an
   override only publishes a false runner measurement. `cron-registry.ts` now
   exports `RUNNER_AUTHORED_FIRE_META_KEYS` and `JobFireMeta`
   (`Record<string, unknown>` with those five as `?: never`);
   `CronJobRunResult.meta` and `beforeRun`'s return use it, so returning a
   reserved name is a **type error**, not a silent override. The runner writes
   `...beforeMeta, ...resultMeta` first and the five keys after them.
2. **The stale header in `scheduled-jobs-audit.ts`** ("every node-cron callback
   MUST call `writeFireRow()`") now says the runner is the only production
   caller and a new job registers through `cron-registry.ts`, never wiring this
   writer directly.
3. **The "28" was wrong:** it was the `open > 48h` family's row count. Re-derived
   (merged by id, non-null fields kept): `open > 48h` 28 rows / 19 batches,
   `OPEN > 7d` 22 rows / 17 batches, **26 distinct in the union** — Langston's
   number. Corrected in `GOVERNANCE_EXCEPTIONS.md`, the `#744` instance, and §13.
   The batch's name appears in 23 non-governance rows of the same file, so the
   search reaches the string.

**Fences.** (a) The runtime test now forges all five keys from `run` and
`beforeRun`; the row must carry the runner's values. Mutation: with the
pre-fold runner (identity last, measurements first) it fails
`expected -1 to be greater than or equal to 0`. (b) A new compile-time fence
compiles a virtual job file against the real `cron-registry.ts` (tests are
outside the tsc project) and requires errors on exactly the three reserved-key
lines, none on the import or the allowed line. Mutation: with `?: unknown`
instead of `?: never` it fails (no errors). Both suites 60/60; `tsc --noEmit`
324 = baseline, none in the touched files.

**STEP: 9 of 11 — fold landed, NEXT: Langston confirms the fold at the ref, then
it rides the next deliberate deploy (Step 6/7 on that restart), then Step 10.**

## 15. LANGSTON CONFIRMS THE FOLD (PROCEED TO DEPLOY), AND HIS CLOSING NOTES FOLDED (CC-C, 2026-11-13)

Langston **CONFIRMED** the §14 fold at `99722172178d431918eca9ed8265c2364af1307d`
(Discord `1570929969817854053`): ancestor of his graded head `f8020547`, all
touched files byte-identical; CI `43518141652` 4/4. He rebuilt the compile
fence himself against TS 5.6.3: as shipped `[2,3,4]` all TS2322; with
`?: unknown` `[]`; with a broken import `[0]` only, so a resolution failure
cannot read as a pass. He re-derived that `JobFireMeta` rejects nothing a
current job returns (six registrations plus the harness). **PROCEED to the
deploy.** His non-blocking notes, folded before that deploy so the deployed
code is final:

- **A — the reservation binds object literals only.** Measured by him: a
  `Record<string, unknown>` value, a spread of one, or `{duration_ms: undefined}`
  all pass the type. The `cron-registry.ts` comment now says a reserved key
  *written as an object literal* is a type error, that a wider value is not
  caught, and that the runner's write-last ordering is what holds at runtime.
- **B — the list is now tied to the runner.** A new test forges every key in
  `RUNNER_AUTHORED_FIRE_META_KEYS` (iterated, not named) from both `run` and
  `beforeRun` and requires none to survive, and a source tie reads the keys the
  runner writes after `...resultMeta,` in its `writeFireRow` call and requires
  them to equal the list. Mutation: dropping `'policy_version'` from the list
  fails the tie (`expected [5 keys] to deeply equal [4 keys]`).
- **C — the second stale header.** `xstock-qd-probe-cron.ts` no longer says
  the job calls `writeFireRow`; the runner writes its fire row.
- **Pin.** The compile fence now also requires every error on the virtual file
  to be TS2322, so an unrelated error cannot read as the reservation firing.
- **Slug nit.** The §14 commit's trailer reads `wrong-object`; the shape is
  `wrong-population` (a row count standing in for a distinct union). The pushed
  commit is not rewritten; this line is the correction of record.

Both suites 61/61, run twice. One earlier combined run reported a test-file
failure that was not captured and did not recur in the two reruns; recorded,
not explained.

**STEP: 9 of 11 — fold confirmed, NEXT: Step 6/7 on the next deliberate deploy,
then Step 10.**

## 16. STEP 7 LIVE VERIFICATION OF THE STEP-9 FOLD — PASS (CC-C, 2026-11-14)

**Deployed object.** Joint deploy by `cc-a`: `dt-deploy 9591ba8c22d2c0fb9adfd822d85462709e211ef9`
at `2026-11-14T01:40:58Z`, restart 699, `ENGINE RESUMED`, identity asserted, no
migrations in range (`/home/deploy/dawntrader-deploy.record`; `dist/BUILD_SHA`
reads the same sha); CI `43539037444` 4/4 on that sha. `git merge-base
--is-ancestor b2cf8987644120b55b5226c0fbfea7177e1b0e53 9591ba8c2…` = true, so the
fold (`7ddaadb83`, `997221721`, `b2cf89876`) is in the running build.
**Built code:** `dist/index.js:96345-96350` writes `...resultMeta,` followed by
`trigger_source`, `occurrence_id`, `duration_ms`, `lag_ms`, `policy_version` —
the runner-authored keys last, as at `server/services/cron-occurrence-runner.ts`
at the deployed sha; the `RUNNER_AUTHORED_FIRE_META_KEYS` comment is at `:96337`.
**Process, not file:** PM2 `dawntrader` pid 3425086, restart 699, `pm_uptime`
`2026-11-14T01:40:48Z`; the verifier's `Started; interval=900s` line at `01:40:55Z`.

**Pre-registered prediction (written before the pass, 01:42Z):** every fire row the
runner writes after the restart carries `trigger_source = 'cron'`, an
`occurrence_id` equal to its occurrence row's id, `duration_ms`, `lag_ms` and
`policy_version`; the first post-restart verifier pass is six of six `healthy`;
zero verifier lines in the error stream; zero new cron alerts.

**Result 1 — fire rows written by the running fold** (`scheduled_tasks_audit`
joined to `scheduled_job_occurrences` on `meta->>'occurrence_id'`,
`created_at >= 01:40:58Z`, read 01:57:47Z): **6 of 6** rows — qd_probe and
feed_integrity at 01:45, 01:50 and 01:55 — `success`, `trigger_source = cron`,
`occurrence_id` matching a `first_source = natural` occurrence, `duration_ms`
and `lag_ms` present, `policy_version = b-cron-missed-catchup/v1`.
**Positive control:** the same query from 01:30Z returns the six pre-restart
runner rows (same shape) plus `boot_state_reconciliation` at 01:40:54Z with no
runner keys — the session-lifecycle controller's own row, which does not go
through the runner (`session-lifecycle-controller.ts:120`), as expected. At
01:42:35Z, before any post-restart slot, the query returned 0 rows.

**Result 2 — first post-restart pass, `2026-11-14 01:55:57Z` (out stream):** six of six `healthy`:

| job | last_successful_boundary | mature_occurrence |
|---|---|---|
| xstock_universe_discovery_cron | 11-13 06:00:00.000Z | 11-13 06:00:00.000Z |
| xstock_qd_probe_cron | 11-14 01:55:00.000Z | 11-14 01:45:00.000Z |
| formula_audit_cron | 11-13 03:00:00.000Z | 11-13 03:00:00.000Z |
| feed_integrity_cron | 11-14 01:55:00.000Z | 11-14 01:45:00.000Z |
| awareness_state_update_cron | 11-14 01:00:00.000Z | 11-14 01:00:00.000Z |
| awareness_reflection_cron | 11-14 00:00:00.000Z | 11-14 00:00:00.000Z |

The two five-minute jobs certify on boundaries written by the folded runner
(01:45, matured), so the verifier accepts the new fire rows.
Error stream: **0** verifier lines in `error.log` since the restart. **Positive
control:** `error__2026-11-13_00-00-00.log` holds 16 verifier `STALE` lines, so
the stream carries them when they occur. Alert store (`system-alerts.jsonl`,
whole file, merged by id, non-null fields): 93 rows whose dedupe key or title
contains `cron` all-time (positive control; wider than §12's 68 because this
filter also matches titles), **0 created since `01:40:58Z`**.

**What this does and does not prove.** It proves the running process writes the
runner-authored keys from the runner, on every post-restart fire (6 of 6), and
that the verifier still certifies all six jobs on them. It does not exercise a
job that tries to override a reserved key — no registered job does; that arm
is proven by the forging test and the compile fence only (§14, §15). Stated,
not claimed.

**UI judgement:** unchanged from §9 — the fold changes only how a background
fire row is assembled; no page, panel or rendering contract moves.

`NOT RE-READ` by a second reader before Langston.

**Reproduce (staging, as `deploy`, in `/home/deploy/dawntrader`):**

```bash
cat /home/deploy/dawntrader-deploy.record; cat dist/BUILD_SHA
grep -n -A6 '^ *\.\.\.resultMeta,' dist/index.js | head -8
grep -h 'CRON-FIRE-VERIFIER' /var/log/dawntrader/out.log | grep '^2026-11-14 01:5'
grep -c 'CRON-FIRE-VERIFIER' /var/log/dawntrader/error.log
```
```sql
SELECT a.task_name, a.scheduled_for, a.status, a.meta->>'trigger_source',
       a.meta->>'occurrence_id' = o.id::text, a.meta ? 'duration_ms', a.meta ? 'lag_ms',
       a.meta->>'policy_version', o.first_source
FROM scheduled_tasks_audit a
LEFT JOIN scheduled_job_occurrences o ON o.id::text = a.meta->>'occurrence_id'
WHERE a.created_at >= '2026-11-14T01:40:58Z' ORDER BY a.created_at;
```

**STEP: 7 of 11 COMPLETE · NEXT STEP: 8 of 11** (Langston's second pass on this restart).

## 17. STEP 8 PROCEED ON THE JOINT DEPLOY (Langston, 2026-11-14)

Langston re-derived §16 at the ref and on the box (Discord `1570982569284083793`):
deployed record and `dist/BUILD_SHA` `9591ba8c2…`, restart 699; CI `43539037444`
4/4; `b2cf89876`, `7ddaadb83`, `997221721` ancestors; the three touched files
byte-identical between the deployed sha and the graded head `24d241820`.
**Step 8: PROCEED.** His tightenings, recorded as he stated them:

- **Two `...resultMeta` spreads in the bundle, not one.** The second
  (`dist/index.js:96359`) is the occurrence-meta terminal write, a different
  object: its runner key is appended by SQL `||` after `$4`, and both
  occurrence-meta readers gate on the `status` column, so a job's meta cannot
  forge a stale-resolve or a decision alert there either. No finding — write-last
  holds at both sites. §16 named only the fire-row site.
- **9 of 9 rows, and a tighter join.** By his read the 02:00 slot added
  `awareness_state_update_cron`; he also required `o.job_name = a.task_name`, so
  each occurrence id belongs to that job's own occurrence. 9/9 match,
  `first_source = natural`; the pre-restart control returns a keyless lifecycle
  row, so the query discriminates.
- **Verifier link.** Both five-minute jobs certify on `mature_occurrence = 01:45Z`,
  whose fire row the folded runner wrote at `01:45:04Z` — the exact arm accepted
  post-fold evidence.
- **The alert zero is weaker than §12's.** No alert of any kind was minted in the
  window, so nothing in-window proves the store was accepting writes. The zero is
  corroborative only; the verdict rests on the rows and the verifier pass.

The reserved-key override arm remains unexercised live (no registered job emits
one); forging test and compile fence only, and no future silence may be read as
proof it fires.

**STEP: 8 of 11 COMPLETE · NEXT STEP: 10 of 11** (governance).
