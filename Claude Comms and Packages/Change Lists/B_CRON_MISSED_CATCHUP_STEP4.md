# B-CRON-MISSED-CATCHUP — Step 4 code-review package

**READY-AT (implementation object):** `13fecfc11a35ea4f128815aa6a54bacae8d6edee` on branch `migration/b-cron-missed-catchup-step3-codex` (push verified before corrected dispatch)

**One gate:** review the Step-3 code diff against the approved scope and Step-2 plan. Return `APPROVED` or `SENT BACK` with one consolidated list. Deployment, runtime proof, governance and closeout are later gates.

## Required dispatch header

### i — DECLARED CHANGE-CLASS

`architecture` — verbatim from `Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_SCOPE.md`.

### ii — COMPLETE `architecture` DOC SET, ROW BY ROW

| document row | Step-4 state |
|---|---|
| scope | **present** — `Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_SCOPE.md` |
| pre-audit | **present** — `Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_PRE_AUDIT.md` |
| completion report | **absent** — written at Step 11 after staging verification and governance |
| `BATCH_CATALOG.md` | repository document **present**; this batch's close row is **absent until Step 10** |
| `PHASE_HISTORY.md` | repository document **present**; this batch's history entry is **absent until Step 10** |
| `SYSTEM_MANUAL.md` | repository document **present**; scheduler/fire-evidence corrections are **absent until Step 10** |
| `SYSTEM_IMPACT_MAP.md` | repository document **present**; six-schedule recovery topology is **absent until Step 10** |
| `CHANGES_AND_FIXES.md` | **applicable, absent until Step 10** — this batch closes missed-schedule risk `#691` |
| `RUNNING_ISSUES.md` | **present** with `#691`; close/update is **absent until Step 10** |
| `POST_AUDIT_ROADMAP.md` | **judged N/A** — no phase-level roadmap or sequencing decision changes; the batch is already placed in the active sprint plan |
| `DELETED_COMPONENTS_LOG.md` | **judged N/A** — no component or route is deleted |
| `PHASE_19_PLAN.md` | **judged N/A** — this is not a `P19-*` batch and it has no in-flight row there |
| `ADJUSTMENT_FRAMEWORK.md` | **judged N/A** — no operator-adjustable parameter is added; the six fail-closed limits are versioned recovery policy reviewed with the architecture |

### iii — STEP-2 REFERENCE

`Claude Comms and Packages/Scope Files/B_CRON_MISSED_CATCHUP_PRE_AUDIT.md` at the implementation ref. Coltrane approved the corrected Step-2 object at `0ad8a49b0fd52b0c3338f75cb531e9e7b1f6712c`, which is an ancestor of READY-AT.

## Change-set census

From the current shared base (`dacbd982562a9aa87cb9eff9af87012ec51700c6`) through READY-AT, exactly 23 tracked paths changed: 7 added, 16 modified, and 0 deleted. One modified path is the Step-3 memory boundary only; the implementation object is the other 22 paths. `git status --porcelain` also contains `.claude/launch.json` as an unrelated untracked file; it is not in READY-AT and is not part of this review.

### NEW

- `drizzle/migrations/2026-11-12-b-cron-missed-catchup.sql`
- `drizzle/migrations/2026-11-12-b-cron-missed-catchup-rollback.sql`
- `Claude Comms and Packages/Change Lists/B_CRON_MISSED_CATCHUP_STEP3.md`
- `server/services/cron-occurrence-runner.ts`
- `server/scripts/b-cron-missed-catchup-harness.ts`
- `server/tests/unit/b-cron-missed-catchup.test.ts`
- `server/tests/unit/b-cron-missed-catchup-alert-store.test.ts`

### MODIFIED

- `.claude/memory/MEMORY_CC_C.md` — Step-3 position boundary only
- `.tsc-baseline.json`
- `drizzle/migrations/MANIFEST.txt`
- `shared/schema.ts`
- `server/index.ts`
- `server/services/cron-registry.ts`
- `server/services/scheduled-jobs-audit.ts`
- `server/services/cron-fire-evidence-verifier.ts`
- `server/services/system-alerts.ts`
- `server/jobs/formula-auto-audit.ts`
- `server/jobs/feed-integrity-auto-check.ts`
- `server/services/awareness-scheduler.ts`
- `server/services/xstock-qd-probe-cron.ts`
- `server/services/xstock-universe-cron.ts`
- `server/routes.ts`
- `server/tests/unit/b-formula-health-audit-freshness.test.ts`

### DELETED

None.

## Load-bearing diff snippets

### 1. MODIFIED — durable identity is database-enforced

Before, `shared/schema.ts` moved directly from the existing value-category enum to the next unrelated enum; there was no occurrence table:

```ts
export const valueCategoryEnum = pgEnum("value_category", ["safety", "fairness", "transparency", "accountability", "user_welfare"]);
export const planStatusEnum = pgEnum("plan_status", ["draft", "active", "paused", "completed"]);
export const learningPhaseEnum = pgEnum("learning_phase", ["observation", "adjustment", "evaluation"]);
```

After, the schema carries the scheduled identity and unfinished-state index; the forward migration also adds state/timestamp checks and the rollback refuses once durable rows exist:

```ts
export const scheduledJobOccurrences = pgTable("scheduled_job_occurrences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  jobName: text("job_name").notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true, precision: 6 }).notNull(),
  firstSource: text("first_source").notNull(),
  policyVersion: text("policy_version").notNull(),
  status: text("status").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true, precision: 6 }).notNull().default(sql`clock_timestamp()`),
  startedAt: timestamp("started_at", { withTimezone: true, precision: 6 }),
  completedAt: timestamp("completed_at", { withTimezone: true, precision: 6 }),
  lagMs: bigint("lag_ms", { mode: "number" }).notNull(),
  reason: text("reason"),
  errorMessage: text("error_message"),
  attemptId: uuid("attempt_id"),
  ownerInstanceId: uuid("owner_instance_id"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
}, (table) => ({
  identityUnique: uniqueIndex("scheduled_job_occurrences_identity_unique").on(table.jobName, table.scheduledFor),
  jobBoundaryIdx: index("scheduled_job_occurrences_job_boundary_idx").on(table.jobName, table.scheduledFor.desc()),
  unfinishedIdx: index("scheduled_job_occurrences_unfinished_idx")
    .on(table.status, table.claimedAt)
    .where(sql`${table.status} IN ('claimed', 'running')`),
}));
```

### 2. NEW — natural, missed and auxiliary work enter one lane

`server/services/cron-occurrence-runner.ts` reconstructs the missed boundary, validates it against the schedule, and enqueues all three caller classes without inventing an auxiliary schedule identity:

```ts
async runNatural(jobName: string, scheduledFor: Date): Promise<CronOccurrenceResult> {
  await this.prepareJob(jobName);
  return this.enqueueScheduled(jobName, scheduledFor, 'natural', false);
}

async runMissed(jobName: string, advancedEventDate: Date): Promise<CronOccurrenceResult> {
  const job = this.deps.getJob(jobName);
  if (!job?.recovery) {
    return this.invalidBoundary(jobName, advancedEventDate, 'recovery_registration_missing');
  }
  await this.prepareJob(jobName);
  const scheduledFor = computePrevFire(job.expression, job.timezone, advancedEventDate);
  if (!scheduledFor || scheduledFor.getTime() >= advancedEventDate.getTime()) {
    return this.invalidBoundary(jobName, advancedEventDate, 'previous_boundary_unavailable');
  }
  const roundTrip = computeNextFire(job.expression, job.timezone, new Date(scheduledFor.getTime() - 1));
  if (!roundTrip || roundTrip.getTime() !== scheduledFor.getTime()) {
    return this.invalidBoundary(jobName, advancedEventDate, 'previous_boundary_not_on_schedule');
  }
  return this.enqueueScheduled(jobName, scheduledFor, 'missed_catchup', false);
}

async runAuxiliary<T>(jobName: string, source: CronAuxiliarySource, run: () => Promise<T>): Promise<T> {
  await this.prepareJob(jobName);
  return new Promise<T>((resolve, reject) => {
    this.enqueue({ kind: 'auxiliary', jobName, source, invocationId: this.randomUUID(), run,
      resolve: resolve as (value: unknown) => void, reject });
  });
}
```

### 3. NEW — the core starts only after lock, claim and running state

```ts
locked = await this.deps.store.withJobLock<CronOccurrenceResult>(item.jobName, async (store) => {
  const claim = await store.claim({
    jobName: item.jobName,
    scheduledFor: item.scheduledFor,
    source: item.source,
    policyVersion: CRON_RECOVERY_POLICY_VERSION,
    status: policy.eligible ? 'claimed' : 'skipped',
    claimedAt: decisionAt,
    completedAt: policy.eligible ? undefined : decisionAt,
    lagMs: policy.lagMs,
    reason: policy.eligible ? undefined : policy.reason,
    ownerInstanceId: this.ownerInstanceId,
    metadata: { source: item.source },
  });

  if (!claim.inserted && !(item.resumeClaimed && claim.row.status === 'claimed')) {
    return { jobName: item.jobName, scheduledFor: item.scheduledFor, status: 'duplicate' as const,
      occurrenceId: claim.row.id, reason: claim.row.status };
  }
  // ... policy refusal terminalizes without entering the core ...
  const firedAt = this.now();
  const attemptId = this.randomUUID();
  await store.markRunning(claim.row.id, firedAt, attemptId, this.ownerInstanceId);
  resultMeta = (await recovery.run({
    scheduledFor: item.scheduledFor,
    firedAt,
    triggerSource: item.source === 'natural' ? 'cron' : 'missed_catchup',
    occurrenceId: claim.row.id,
    policyVersion: CRON_RECOVERY_POLICY_VERSION,
  }))?.meta ?? {};
```

### 4. MODIFIED — a production wrapper no longer has a direct natural path

Before, feed integrity's callback performed jitter, called the core directly, and wrote its own terminal audit row. After, natural and missed events use the common occurrence runner and the boot call uses the same auxiliary lane:

```ts
// BEFORE — direct callback path
async () => {
  const jitter = Math.floor(Math.random() * 30 * 1000);
  console.log(`[FeedIntegrity] Waiting ${jitter}ms jitter before check...`);
  await new Promise(resolve => setTimeout(resolve, jitter));
  const firedAt = new Date();
  const startMs = firedAt.getTime();
  let status: 'success' | 'error' = 'success';
  let errorMessage: string | undefined;
  try {
    await runFeedIntegrityCheck('auto');
  } catch (error) {
    status = 'error';
    errorMessage = error instanceof Error ? error.message : String(error);
  } finally {
    // direct terminal audit write followed here
  }
}
```

```ts
// AFTER — common occurrence path
job = cron.createTask(
  cronSchedule,
  async (context) => {
    await cronOccurrenceRunner.runNatural(JOB_NAME, context.date);
  },
  { timezone: 'UTC' },
);

cronRegistry.register({
  name: JOB_NAME,
  task: job!,
  expression: cronSchedule,
  timezone: 'UTC',
  intervalSeconds: 300,
  enabled: true,
  recovery: {
    policyKey: JOB_NAME,
    beforeRun: async () => {
      const jitterMs = Math.floor(Math.random() * 30_000);
      await new Promise(resolve => setTimeout(resolve, jitterMs));
      return { jitter_ms: jitterMs };
    },
    run: async () => { await runFeedIntegrityCheck('auto'); },
  },
});
job!.on('execution:missed', (context) => {
  cronOccurrenceRunner.dispatchMissed(JOB_NAME, context.date);
});
await cronOccurrenceRunner.prepareJob(JOB_NAME);
job!.start();
```

The same dormant-create, reconcile, then start shape is applied to formula, both awareness schedules, Q-D and universe discovery; manual formula/feed/reflection/universe routes and feed/awareness boot calls use `runAuxiliary`, which independently awaits the same one-time preparation.

The one-pass reader found that Formula Health's no-result fallback called the underlying formula audit directly. READY-AT folds that on-read caller into the same auxiliary lane and the source-contract test pins the complete call shape:

```ts
const { cronOccurrenceRunner } = await import('./services/cron-occurrence-runner.js');
const run = await cronOccurrenceRunner.runAuxiliary(
  'formula_audit_cron',
  'on-read',
  () => formulaAuditService.runAudit(),
);
runType = 'on-read';
report = run;
```

The reader also found that the original six-site census named five source files, so a future schedule in a new file could evade it. READY-AT recursively scans every production TypeScript file under `server`, excludes only the test tree, and requires every file containing a schedule call to carry an equal number of recovery registrations and missed listeners; the whole production population must still total six.

### 4a. SENT-BACK CORRECTION — startup and rolling-process contention cannot overtake or drop work

Coltrane's first substantive round found three gaps at exact ref `0c82f89efef435edaded754b8a7898dbef0762ee`: schedules were auto-started before reconciliation, a contended reconciliation returned permanently, and a different scheduled identity returned `claim_unavailable` without a durable decision. READY-AT corrects all three at the shared runner boundary:

```ts
async prepareJob(jobName: string): Promise<void> {
  let preparation = this.preparations.get(jobName);
  if (!preparation) {
    preparation = this.performReconciliation(jobName);
    this.preparations.set(jobName, preparation);
  }
  return preparation;
}

private async performReconciliation(jobName: string): Promise<void> {
  let contentionAttempt = 0;
  let reconciled: { indeterminate: CronOccurrenceRow[]; claimed: CronOccurrenceRow[] };
  while (true) {
    this.assertLaneRunning(jobName);
    const at = this.now();
    let locked: { acquired: false } | {
      acquired: true;
      value: { indeterminate: CronOccurrenceRow[]; claimed: CronOccurrenceRow[] };
    };
    try {
      locked = await this.deps.store.withJobLock(jobName, async (store) => ({
        indeterminate: await store.reconcileRunning(jobName, this.ownerInstanceId, at),
        claimed: await store.loadClaimed(jobName),
      }));
    } catch (err) {
      throw this.stopLane(jobName, 'startup_reconciliation', err);
    }
    if (locked.acquired) {
      reconciled = locked.value;
      break;
    }
    contentionAttempt += 1;
    await this.retryContention(jobName, 'startup_reconciliation', contentionAttempt);
  }
}
```

Every schedule is now created dormant, registered, reconciled, and only then started. Natural, missed and auxiliary entry also await the cached preparation promise, so a future caller cannot bypass the wrapper ordering. A reconciliation lock-session error latches that job lane stopped; ordinary rolling-process contention stays pending and retries.

Scheduled admission now retains a different identity through contention rather than returning a decision that was never persisted:

```ts
while (true) {
  const locked = await this.deps.store.withJobLock(item.jobName, async (store) => {
    // durable claim / refusal, then core
  });
  if (locked.acquired) {
    result = locked.value;
    break;
  }
  try {
    const existing = await this.deps.store.find(item.jobName, item.scheduledFor);
    if (existing) {
      result = {
        jobName: item.jobName,
        scheduledFor: item.scheduledFor,
        status: 'duplicate',
        occurrenceId: existing.id,
        completedAt: existing.completedAt ?? undefined,
        reason: existing.status,
      };
      break;
    }
  } catch (err) {
    throw this.stopLane(item.jobName, 'contended_identity_read', err);
  }
  contentionAttempt += 1;
  await this.retryContention(item.jobName, 'scheduled_admission', contentionAttempt);
}
```

The source fence now requires six dormant tasks, six preparation calls, six starts, and proves every start occurs after every preparation in its module. Red-first behavioral tests prove scheduled and auxiliary work remain blocked during startup reconciliation, a deferred reconciliation eventually completes, and a different scheduled identity remains pending until it can persist and execute.

### 5. NEW — exact stale occurrence only, after durable success

```ts
const result = locked.value;
if (result.status === 'succeeded' && result.occurrenceId) {
  const evidence =
    `cron occurrence ${result.occurrenceId} policy ${CRON_RECOVERY_POLICY_VERSION} `
    + `terminal ${result.completedAt!.toISOString()}`;
  try {
    await this.deps.resolveByKey(
      `cron_stale:${result.jobName}:${result.scheduledFor.toISOString()}`,
      CRON_RECOVERY_ACTOR,
      evidence,
      'engine',
    );
  } catch (err) {
    console.error(`[CRON-RECOVERY][STALE_RESOLVE_FAIL] job=${result.jobName} occurrence=${result.occurrenceId}:`, err);
  }
}
```

### 6. NEW — staging proof refuses the wrong build and reads durable results back

```ts
function exactRef(expectedSha: string): void {
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('--expect-sha must be a full 40-character commit');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const built = readFileSync('dist/BUILD_SHA', 'utf8').trim();
  if (head !== expectedSha || built !== expectedSha) {
    throw new Error(`exact-ref refusal: expected=${expectedSha} head=${head} built=${built}`);
  }
}

if (!args.execute) throw new Error('read-only default: pass --execute after verifying the deployed exact ref');
```

The retained read-back requires 11 unique occurrence identities, exactly one admitted core in the natural/missed race, two backlog skips plus one execution, a Q-D age refusal, a failed core, scheduled-before-manual lane order, prior-running `indeterminate`, and claimed-before-start resume.

The pre-review branch CI passes caught two packaging/runtime-startup omissions before review. READY-AT now registers the forward migration in `MANIFEST.txt` (and pins the rollback's exclusion in the focused suite), and the standalone staging harness loads the app environment before importing the database pool. The migration manifest now has a one-to-one 214/214 forward-file match, and the existing script-environment suite passes 25/25.

## Verification already run for corrected READY-AT

- GitHub CI run `43155519026` at corrected exact ref: TypeScript Check, Test Suite, Build and Docker Build all passed individually. Prior runs are not used to certify READY-AT.
- TypeScript baseline: 324 current / 324 baseline across 43 files, no regression.
- Corrected recovery, alert-store and Formula Health suites: 56/56 passed across the three named files.
- Formula Health source-contract suite after its intentional runner update: 21/21 passed.
- Production build passed; only the repository's existing CSS, chunk-size and duplicate-member warnings appeared.
- Whitespace check passed with the repository's CRLF-aware setting.

## Judgement calls to attack

1. Does holding one per-job database advisory lock across admission and the core, together with the unique scheduled identity, actually cover natural/missed races and deploy overlap without making an unrelated job wait?
2. Is `claimed` safely retryable while prior-owner `running` must become `indeterminate`, given the six cores' side effects?
3. Are the six age/backlog/session limits fail-closed without converting present-time inputs into false historical evidence?
4. Does placing feed jitter after durable claim but before `running` preserve retry truth and still keep enough time before the next boundary?
5. Are all production natural, missed, boot, manual and Formula Health on-read callers routed through the lane, with no fake ledger identity for auxiliary work?
6. Can any non-success path resolve a stale row, or can any successful occurrence resolve the wrong boundary, job, or `cron_verifier_blind` row?
7. Does a terminal-write ambiguity remain visible and non-retryable even if the subsequent indeterminate write also fails?
8. Is the exact-ref harness sufficiently side-effect-free and strong enough to close Step 7 without altering the host clock or waiting for a natural miss?
9. Does the corrected dormant-arm/preparation gate cover every scheduled and auxiliary caller, and can any rolling-process contention still return before either finding the same durable identity or persisting a decision for a different one?

## One-pass fresh-reader record

`REVIEWER: claim-only · mechanism claim covering the shared six-job lane, durable scheduled identity, and auxiliary non-identity · HIT: Formula Health's no-result on-read audit bypassed the lane, and the six-site test could miss a future schedule in a new file; both were re-derived at the exact ref and corrected in READY-AT · re-derived yes`

## Step-4 review history

- Coltrane's first invocation returned `SENT BACK` ungraded because the exact objects were not yet in the governed review mirror. The unchanged object was then exposed on `review/b-cron-missed-catchup-step4-codex`.
- Coltrane's substantive round at implementation ref `0c82f89efef435edaded754b8a7898dbef0762ee` returned three corrections: dormant schedules must not start before reconciliation; reconciliation contention must retry rather than disappear; and a different scheduled identity must remain pending through advisory-lock contention until it can persist a decision. All three are corrected in READY-AT with the three requested red-first proofs.
- Coltrane could not write the private Delivery Board because his review environment reproduced the known Projects-access gap (HTTP 404). The owner set the card to `Implementation / SENT BACK TO OWNER / Blocked on Langston` and will request the final Review-field write again with the corrected object.
