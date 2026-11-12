# B-CRON-MISSED-CATCHUP — Step 11 claim-only reader repair

**READY-AT (implementation object):**
`bcdd386385e2dc2eeb51e6ba7e0ad3f669a40242` on branch
`migration/b-cron-missed-catchup-step3-codex`. The dispatch names the later
branch-tip commit that carries this review package; it changes documentation
only and has this implementation object as its parent.

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
| completion report | **absent by design** — the stale draft was withdrawn when the claim-only reader found real defects; Step 11 will recreate it only after this repair completes Steps 4–10 |
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
Status: Step 3 repair complete; return to Step 4 review
Base runtime: `4e66ea904edf690e144035c959cbd335241f7651`

## Why completion stopped

The required claim-only Step 11 reader was given only the completion claim and
asked to name alternate states consistent with the proposed proof. The reader
found four concrete states in which the claim could be false. Each was
re-derived against the implementation and repaired before any completion report
was allowed to leave the draft stage.

## Re-derived defects and structural repairs

1. **Exact stale-alert resolution could be lost.** A successful recovered
   occurrence tried the exact resolution once. A temporary alert-store failure,
   or an alert written just after that attempt, could leave the exact row open.
   Successful missed recoveries now retain a durable pending-resolution marker
   in the occurrence ledger. Every scheduled, auxiliary and startup lock holder
   retries it; the marker clears only after the exact alert row is resolved.
   Exact scheduled-boundary alerts are one-shot, so an in-flight verifier cannot
   recreate the same immutable occurrence after its resolution.
2. **The verifier could certify the wrong evidence.** It used the latest start
   time without requiring success, so an error or an older boundary starting
   late could make a missed boundary appear healthy. It now reads only the
   latest successful scheduled boundary across the audit stream and occurrence
   ledger.
3. **Eligibility could expire before core work began.** The catch-up policy was
   decided before lock wait and pre-run work. It is now decided under the job
   lock and rechecked at actual core start; an occurrence that ages out becomes
   an explicit skip and never enters the job core.
4. **Q-D's business clock had changed accidentally.** The wrapper passed the
   historical scheduled boundary into a job that reads current snapshots. Q-D
   now uses actual start time for market state, freshness and bucketing while
   retaining the scheduled boundary as the durable occurrence identity.

## Verification at the repair boundary

- Focused runner, alert-store, verifier and Formula Health suites: 4 files,
  90 tests passed, including retry, one-shot and already-resolved branches.
- TypeScript baseline gate: 324 current known errors versus 324 baseline errors;
  no new or changed error.
- New controls exercise temporary resolution failure, alert-mint ordering,
  start-time expiry, successful-boundary filtering and the Q-D clock split.
- `git diff --check`: clean.

## Honest residual carried forward

The deterministic staging race proves one core execution inside one process and
the database uniqueness constraint is separately exercised. It does not imitate
a second operating-system process losing its database-lock session while the
core is already running. That destructive fault is not required by the
registered scope and will be stated as a proof limit rather than represented as
covered.

## Claim-only reader record

`REVIEWER: claim-only · name the objects and alternate states consistent with the completion mechanism · HIT — durable stale-resolve retry absent; verifier used fired-at/error-compatible evidence; eligibility not rechecked at start; Q-D business clock regressed to scheduled boundary; staging race did not establish separate-process/mid-core-lock-loss behavior · re-derived yes`

The reader record identifies the challenge; every defect and repair above was
independently re-derived from the code before implementation.

## Repair change-set census

Against the parent of implementation object `bcdd386385e2dc2eeb51e6ba7e0ad3f669a40242`,
exactly nine tracked paths changed: one new repair record and eight modified
paths; zero tracked paths were deleted. `.claude/launch.json` remains an
unrelated untracked file and is not in the review ref.

### NEW

- `Claude Comms and Packages/Change Lists/B_CRON_MISSED_CATCHUP_STEP11_REPAIR.md`

### MODIFIED

- `.claude/memory/MEMORY_CC_C.md` — repair workflow boundary only
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

After, only a successful missed recovery installs a durable carrier; every job
lock holder retries it, and an already-resolved exact row also closes the
carrier after a prior marker-write failure:

```ts
...(status === 'succeeded' && item.source === 'missed_catchup'
  ? { stale_resolve_pending: true }
  : {}),

const resolved = await this.deps.resolveByKey(
  key, CRON_RECOVERY_ACTOR, evidence, 'engine',
);
if (resolved.length > 0 || this.deps.hasResolvedByKey?.(key) === true) {
  await store.markStaleResolvePersisted(row.id, this.now());
}
```

The verifier marks this immutable scheduled-boundary identity one-shot, so an
in-flight stale read cannot recreate it after recovery:

```ts
await addAlert({
  dedupe_key: dedupeKey,
  one_shot: true,
  // exact occurrence title, body and metadata
});
```

### 2. MODIFIED — verifier health requires a successful scheduled boundary

Before:

```sql
SELECT task_name, MAX(fired_at) AS last_fired_at
FROM scheduled_tasks_audit
GROUP BY task_name
```

After:

```sql
SELECT task_name, MAX(scheduled_for) AS last_scheduled_for
FROM (
  SELECT task_name, scheduled_for FROM scheduled_tasks_audit
   WHERE status = 'success'
  UNION ALL
  SELECT job_name AS task_name, scheduled_for FROM scheduled_job_occurrences
   WHERE status = 'succeeded'
) successful_boundaries
GROUP BY task_name
```

### 3. MODIFIED — eligibility is rechecked at actual core start

Before, the policy decision preceded the database lock and pre-run work. After,
the initial decision is made under the lock and the job is refused if it ages
out before its core can begin:

```ts
const decisionAt = this.now();
let policy = this.evaluatePolicy(job, item, lane, decisionAt);
// durable claim and pre-run work
const firedAt = this.now();
const startPolicy = this.evaluatePolicy(job, item, lane, firedAt);
if (!startPolicy.eligible) {
  await store.markSkipped(claim.row.id, firedAt, startPolicy.reason, {
    rechecked_before_start: true,
    initial_lag_ms: policy.lagMs,
  });
  return { status: 'skipped', reason: startPolicy.reason, /* identity */ };
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

## Judgement calls to attack

1. Can any transient alert-store failure, marker-write failure or verifier/resolve
   ordering still leave an exact recovered occurrence open or re-created?
2. Is `one_shot` correctly limited to immutable scheduled-boundary identities,
   without changing ordinary recurring alert behavior?
3. Does the successful-boundary union reject error rows and late starts while
   retaining truth when the failure-safe audit write is missing?
4. Can lock wait or pre-run work still let an admitted catch-up enter core after
   its age/session guard has expired?
5. Does Q-D now retain both truths: scheduled identity for provenance and actual
   start for current-snapshot business logic?
6. Is the same-process deterministic race plus the database uniqueness proof an
   honest sufficient scope close while the separate-process/mid-core-lock-loss
   behavior remains explicitly unclaimed?
