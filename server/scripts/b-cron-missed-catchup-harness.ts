/**
 * B-CRON-MISSED-CATCHUP (#691) deterministic staging harness.
 *
 * It registers only synthetic, side-effect-free jobs. The real occurrence
 * ledger, advisory lock, audit writer and alert store are exercised. Durable
 * rows are retained as verification evidence; expected synthetic breakage
 * alerts are resolved before exit by the explicit operator actor.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { ScheduledTask } from 'node-cron';
import { pool } from '../db.js';
import {
  CronOccurrenceRunner,
  PgOccurrenceStore,
  CRON_RECOVERY_POLICY_VERSION,
} from '../services/cron-occurrence-runner.js';
import { cronRegistry, type CronRecoveryPolicyKey } from '../services/cron-registry.js';
import { scheduledJobsAudit } from '../services/scheduled-jobs-audit.js';
import {
  addAlert,
  assertAlertActor,
  getAlertDedupeState,
  readAllAlerts,
  resolveAlertsByDedupeKey,
} from '../services/system-alerts.js';
import { isDirectEntry } from './direct-entry.js';

type Args = { execute: boolean; expectedSha: string; by: string };

function parseArgs(argv: string[]): Args {
  const value = (name: string): string => {
    const index = argv.indexOf(name);
    if (index === -1 || !argv[index + 1]) throw new Error(`missing ${name} <value>`);
    return argv[index + 1];
  };
  return {
    execute: argv.includes('--execute'),
    expectedSha: value('--expect-sha'),
    by: value('--by'),
  };
}

function exactRef(expectedSha: string): void {
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('--expect-sha must be a full 40-character commit');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const built = readFileSync('dist/BUILD_SHA', 'utf8').trim();
  if (head !== expectedSha || built !== expectedSha) {
    throw new Error(`exact-ref refusal: expected=${expectedSha} head=${head} built=${built}`);
  }
}

function registerSynthetic(
  name: string,
  policyKey: CronRecoveryPolicyKey,
  run: (scheduledFor: Date) => Promise<void>,
): void {
  cronRegistry.register({
    name,
    task: {} as ScheduledTask,
    expression: '* * * * * *',
    timezone: 'UTC',
    intervalSeconds: 1,
    enabled: true,
    recovery: {
      policyKey,
      run: async (context) => {
        await run(context.scheduledFor);
        return { meta: { harness: true } };
      },
    },
  });
}

const waitFor = async (check: () => Promise<boolean>, label: string): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`timeout waiting for ${label}`);
};

export async function runCronMissedCatchupHarness(argv: string[]): Promise<Record<string, unknown>> {
  const args = parseArgs(argv);
  if (!args.execute) throw new Error('read-only default: pass --execute after verifying the deployed exact ref');
  exactRef(args.expectedSha);
  const operator = assertAlertActor(args.by);
  const runId = crypto.randomUUID();
  const prefix = `b_cron_harness_${runId.replaceAll('-', '_')}`;
  const now = new Date();
  now.setMilliseconds(500);
  const boundary = (secondsAgo: number): Date => {
    const value = new Date(now.getTime() - secondsAgo * 1_000);
    value.setMilliseconds(0);
    return value;
  };
  const advanced = (scheduledFor: Date) => new Date(scheduledFor.getTime() + 1_000);
  const calls = new Map<string, string[]>();
  const record = (job: string, at: Date) => {
    const prior = calls.get(job) ?? [];
    prior.push(at.toISOString());
    calls.set(job, prior);
  };

  const naturalJob = `${prefix}_natural`;
  const catchupJob = `${prefix}_catchup`;
  const raceJob = `${prefix}_race`;
  const queueJob = `${prefix}_queue`;
  const oldJob = `${prefix}_old_qd`;
  const failureJob = `${prefix}_failure`;
  const reconcileJob = `${prefix}_reconcile`;
  const laneJob = `${prefix}_lane`;
  for (const job of [naturalJob, catchupJob, raceJob, queueJob, oldJob, reconcileJob]) {
    registerSynthetic(job, job === oldJob ? 'xstock_qd_probe_cron' : 'formula_audit_cron', async (at) => record(job, at));
  }
  registerSynthetic(failureJob, 'formula_audit_cron', async (at) => {
    record(failureJob, at);
    throw new Error('expected synthetic core failure');
  });
  const laneOrder: string[] = [];
  registerSynthetic(laneJob, 'formula_audit_cron', async () => {
    laneOrder.push('scheduled-start');
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    laneOrder.push('scheduled-end');
  });

  const runner = new CronOccurrenceRunner({
    store: new PgOccurrenceStore(),
    getJob: (name) => cronRegistry.get(name),
    writeFireRow: (options) => scheduledJobsAudit.writeFireRow(options),
    addAlert,
    resolveByKey: resolveAlertsByDedupeKey,
    dedupeStateByKey: getAlertDedupeState,
    now: () => new Date(now),
  });

  const naturalBoundary = boundary(2);
  const catchupBoundary = boundary(3);
  const stale = await addAlert({
    triggers_at: new Date(),
    category: 'breakage',
    severity: 'warning',
    dedupe_key: `cron_stale:${catchupJob}:${catchupBoundary.toISOString()}`,
    title: `Synthetic stale occurrence ${runId}`,
    body: 'B-CRON-MISSED-CATCHUP deterministic harness row; exact successful recovery must resolve it.',
    metadata: { batch: 'B-CRON-MISSED-CATCHUP', harness_run_id: runId },
  });

  const naturalResult = await runner.runNatural(naturalJob, naturalBoundary);
  const catchupResult = await runner.runMissed(catchupJob, advanced(catchupBoundary));

  const raceBoundary = boundary(4);
  const raceResults = await Promise.all([
    runner.runNatural(raceJob, raceBoundary),
    runner.runMissed(raceJob, advanced(raceBoundary)),
  ]);

  const queueBoundaries = [boundary(7), boundary(6), boundary(5)];
  const queueResults = await Promise.all(queueBoundaries.map((at) => runner.runMissed(queueJob, advanced(at))));
  const oldBoundary = boundary(60);
  const oldResult = await runner.runMissed(oldJob, advanced(oldBoundary));
  const failureBoundary = boundary(8);
  const failureResult = await runner.runMissed(failureJob, advanced(failureBoundary));

  const laneScheduled = runner.runNatural(laneJob, boundary(9));
  const laneManual = runner.runAuxiliary(laneJob, 'manual', async () => {
    laneOrder.push('manual');
    return 'manual-ok';
  });
  await Promise.all([laneScheduled, laneManual]);

  const priorRunningBoundary = boundary(11);
  const priorClaimedBoundary = boundary(10);
  await pool.query(
    `INSERT INTO scheduled_job_occurrences
       (job_name, scheduled_for, first_source, policy_version, status, claimed_at,
        started_at, lag_ms, attempt_id, owner_instance_id, metadata)
     VALUES
       ($1, $2, 'missed_catchup', $3, 'running', $4, $4, $5, $6, $7, $8::jsonb),
       ($1, $9, 'missed_catchup', $3, 'claimed', $4, NULL, $10, NULL, $7, $8::jsonb)`,
    [
      reconcileJob,
      priorRunningBoundary,
      CRON_RECOVERY_POLICY_VERSION,
      now,
      now.getTime() - priorRunningBoundary.getTime(),
      crypto.randomUUID(),
      crypto.randomUUID(),
      JSON.stringify({ harness_run_id: runId }),
      priorClaimedBoundary,
      now.getTime() - priorClaimedBoundary.getTime(),
    ],
  );
  await runner.reconcileJob(reconcileJob);
  await waitFor(async () => {
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM scheduled_job_occurrences WHERE job_name = $1 AND scheduled_for = $2`,
      [reconcileJob, priorClaimedBoundary],
    );
    return result.rows[0]?.status === 'succeeded';
  }, 'claimed occurrence resume');

  const occurrenceRead = await pool.query<{
    job_name: string;
    scheduled_for: Date;
    status: string;
    count: string;
  }>(
    `SELECT job_name, scheduled_for, max(status) AS status, count(*)::text AS count
       FROM scheduled_job_occurrences
      WHERE job_name = ANY($1::text[])
      GROUP BY job_name, scheduled_for
      ORDER BY job_name, scheduled_for`,
    [[naturalJob, catchupJob, raceJob, queueJob, oldJob, failureJob, reconcileJob, laneJob]],
  );
  if (occurrenceRead.rows.some((row) => row.count !== '1')) throw new Error('duplicate durable occurrence identity');
  const statusFor = (job: string, at: Date) => occurrenceRead.rows.find(
    (row) => row.job_name === job && new Date(row.scheduled_for).getTime() === at.getTime(),
  )?.status;
  if (occurrenceRead.rows.length !== 11) {
    throw new Error(`occurrence read-back expected 11 identities, found ${occurrenceRead.rows.length}`);
  }
  const expected = [
    [naturalResult.status, 'succeeded', 'natural result'],
    [catchupResult.status, 'succeeded', 'catch-up result'],
    [raceResults.filter((result) => result.status === 'succeeded').length, 1, 'race success count'],
    [raceResults.filter((result) => result.status === 'duplicate').length, 1, 'race duplicate count'],
    [queueResults.filter((result) => result.status === 'skipped').length, 2, 'queue skip count'],
    [queueResults.filter((result) => result.status === 'succeeded').length, 1, 'queue success count'],
    [oldResult.status, 'skipped', 'old Q-D result'],
    [failureResult.status, 'failed', 'failure result'],
    [laneOrder.join(','), 'scheduled-start,scheduled-end,manual', 'shared lane order'],
    [statusFor(reconcileJob, priorRunningBoundary), 'indeterminate', 'running reconciliation'],
    [statusFor(reconcileJob, priorClaimedBoundary), 'succeeded', 'claimed resume'],
    [statusFor(naturalJob, naturalBoundary), 'succeeded', 'natural durable status'],
    [statusFor(catchupJob, catchupBoundary), 'succeeded', 'catch-up durable status'],
    [statusFor(raceJob, raceBoundary), 'succeeded', 'race durable status'],
    [statusFor(oldJob, oldBoundary), 'skipped', 'old Q-D durable status'],
    [statusFor(failureJob, failureBoundary), 'failed', 'failure durable status'],
    [calls.get(naturalJob)?.length ?? 0, 1, 'natural core count'],
    [calls.get(catchupJob)?.length ?? 0, 1, 'catch-up core count'],
    [calls.get(raceJob)?.length ?? 0, 1, 'race core count'],
    [calls.get(queueJob)?.length ?? 0, 1, 'queue core count'],
    [calls.get(oldJob)?.length ?? 0, 0, 'old Q-D core refusal'],
    [calls.get(failureJob)?.length ?? 0, 1, 'failure core count'],
    [calls.get(reconcileJob)?.length ?? 0, 1, 'resumed core count'],
  ] as const;
  for (const [actual, wanted, label] of expected) {
    if (actual !== wanted) throw new Error(`${label}: expected=${wanted} actual=${String(actual)}`);
  }

  const storedStale = readAllAlerts().find((alert) => alert.id === stale.id);
  if (
    storedStale?.state !== 'resolved'
    || storedStale.resolved_by_claimed !== 'cron-recovery'
    || storedStale.resolved_by_transport !== 'engine'
    || !storedStale.resolution_evidence?.includes(String(catchupResult.occurrenceId))
    || !storedStale.resolution_evidence?.includes(CRON_RECOVERY_POLICY_VERSION)
  ) throw new Error('exact stale-alert recovery evidence did not persist');

  const alertCases = [
    ...queueResults.filter((result) => result.status === 'skipped'),
    oldResult,
    failureResult,
    {
      jobName: reconcileJob,
      scheduledFor: priorRunningBoundary,
      status: 'indeterminate',
    },
  ];
  const cleanupIds: string[] = [];
  for (const result of alertCases) {
    cleanupIds.push(...await resolveAlertsByDedupeKey(
      `cron_recovery:${result.status}:${result.jobName}:${result.scheduledFor.toISOString()}`,
      operator,
      runId,
      'cli',
    ));
  }

  const auditRead = await pool.query<{ task_name: string; scheduled_for: Date; status: string }>(
    `SELECT task_name, scheduled_for, status
       FROM scheduled_tasks_audit
      WHERE task_name = ANY($1::text[])
      ORDER BY task_name, scheduled_for`,
    [[naturalJob, catchupJob, raceJob, queueJob, oldJob, failureJob, reconcileJob, laneJob]],
  );
  const auditFor = (job: string, at: Date) => auditRead.rows.filter(
    (row) => row.task_name === job && new Date(row.scheduled_for).getTime() === at.getTime(),
  );
  const newestQueueBoundary = queueBoundaries[2];
  const auditExpected = [
    [auditFor(naturalJob, naturalBoundary).length, 1, 'natural audit count'],
    [auditFor(catchupJob, catchupBoundary).length, 1, 'catch-up audit count'],
    [auditFor(raceJob, raceBoundary).length, 1, 'race audit count'],
    [auditFor(queueJob, newestQueueBoundary).length, 1, 'queue audit count'],
    [auditRead.rows.filter((row) => row.task_name === oldJob).length, 0, 'old Q-D audit refusal'],
    [auditFor(failureJob, failureBoundary).length, 1, 'failure audit count'],
    [auditFor(reconcileJob, priorClaimedBoundary).length, 1, 'resumed audit count'],
    [auditRead.rows.filter((row) => row.task_name === laneJob).length, 1, 'lane scheduled audit count'],
    [auditRead.rows.length, 7, 'executed-only audit total'],
  ] as const;
  for (const [actual, wanted, label] of auditExpected) {
    if (actual !== wanted) throw new Error(`${label}: expected=${wanted} actual=${actual}`);
  }
  if (auditFor(failureJob, failureBoundary)[0]?.status !== 'error') {
    throw new Error('failure audit row did not retain error status');
  }

  return {
    ok: true,
    batch: 'B-CRON-MISSED-CATCHUP',
    exact_ref: args.expectedSha,
    harness_run_id: runId,
    occurrence_rows: occurrenceRead.rows.map((row) => ({
      job_name: row.job_name,
      scheduled_for: new Date(row.scheduled_for).toISOString(),
      status: row.status,
      identity_count: Number(row.count),
    })),
    audit_rows: auditRead.rows.map((row) => ({
      task_name: row.task_name,
      scheduled_for: new Date(row.scheduled_for).toISOString(),
      status: row.status,
    })),
    stale_alert_id: stale.id,
    stale_resolution_actor: storedStale.resolved_by_claimed,
    stale_resolution_transport: storedStale.resolved_by_transport,
    expected_alerts_resolved_by_operator: cleanupIds,
    call_counts: Object.fromEntries([...calls.entries()].map(([job, entries]) => [job, entries.length])),
    lane_order: laneOrder,
  };
}

if (isDirectEntry(import.meta.url)) {
  runCronMissedCatchupHarness(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error('[B-CRON-MISSED-CATCHUP][HARNESS][FAIL]', error instanceof Error ? error.stack : error);
      process.exitCode = 1;
    })
    .finally(async () => { await pool.end(); });
}
