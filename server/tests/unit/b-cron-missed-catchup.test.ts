/**
 * B-CRON-MISSED-CATCHUP (#691): durable admission, boundary reconstruction,
 * bounded replay, crash truth and six-site registration fences.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduledTask } from 'node-cron';
import { pool } from '../../db.js';
import {
  CRON_RECOVERY_ACTOR,
  CRON_RECOVERY_POLICY_VERSION,
  CronOccurrenceRunner,
  PgOccurrenceStore,
  type ClaimOccurrenceInput,
  type CronOccurrenceRow,
  type CronOccurrenceRunnerDeps,
  type LockedOccurrenceStore,
  type OccurrenceStore,
} from '../../services/cron-occurrence-runner.js';
import { RUNNER_AUTHORED_FIRE_META_KEYS } from '../../services/cron-registry.js';
import type {
  CronJobRunResult,
  CronRecoveryPolicyKey,
  CronScheduledRunContext,
  RegisteredCronJob,
} from '../../services/cron-registry.js';

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

class MemoryOccurrenceStore implements OccurrenceStore, LockedOccurrenceStore {
  readonly rows = new Map<string, CronOccurrenceRow>();
  private locks = new Set<string>();
  private nextId = 100;
  failClaim = false;
  failTerminal = false;
  failStaleResolvePersistedOnce = false;
  failLockSession = false;
  failUnlock = false;
  refuseLock = false;
  refuseLockAttempts = 0;
  lockAttempts = 0;
  afterUnlockOnce?: (jobName: string) => Promise<void>;
  beforeDecisionAlertPersistedOnce?: () => Promise<void>;
  beforeMarkRunningOnce?: () => Promise<void>;

  private key(jobName: string, scheduledFor: Date): string {
    return `${jobName}:${scheduledFor.toISOString()}`;
  }

  async find(jobName: string, scheduledFor: Date): Promise<CronOccurrenceRow | undefined> {
    return this.rows.get(this.key(jobName, scheduledFor));
  }

  seed(row: CronOccurrenceRow): void {
    this.rows.set(this.key(row.jobName, row.scheduledFor), row);
  }

  async withJobLock<T>(
    jobName: string,
    run: (store: LockedOccurrenceStore) => Promise<T>,
  ): Promise<{ acquired: false } | { acquired: true; value: T }> {
    this.lockAttempts += 1;
    if (this.failLockSession) throw new Error('lock session unavailable');
    if (this.refuseLock || this.refuseLockAttempts-- > 0 || this.locks.has(jobName)) {
      return { acquired: false };
    }
    this.locks.add(jobName);
    let value: T;
    try {
      value = await run(this);
      if (this.failUnlock) throw new Error('advisory unlock unavailable');
    } finally {
      this.locks.delete(jobName);
    }
    const afterUnlock = this.afterUnlockOnce;
    this.afterUnlockOnce = undefined;
    if (afterUnlock) await afterUnlock(jobName);
    return { acquired: true, value };
  }

  async claim(input: ClaimOccurrenceInput): Promise<{ inserted: boolean; row: CronOccurrenceRow }> {
    if (this.failClaim) throw new Error('claim database unavailable');
    const key = this.key(input.jobName, input.scheduledFor);
    const existing = this.rows.get(key);
    if (existing) return { inserted: false, row: existing };
    const row: CronOccurrenceRow = {
      id: UUID(this.nextId++),
      jobName: input.jobName,
      scheduledFor: input.scheduledFor,
      firstSource: input.source,
      policyVersion: input.policyVersion,
      status: input.status,
      claimedAt: input.claimedAt,
      startedAt: null,
      completedAt: input.completedAt ?? null,
      lagMs: input.lagMs,
      reason: input.reason ?? null,
      errorMessage: null,
      attemptId: null,
      ownerInstanceId: input.ownerInstanceId,
      metadata: input.metadata ?? {},
    };
    this.rows.set(key, row);
    return { inserted: true, row };
  }

  async markRunning(id: string, startedAt: Date, attemptId: string, ownerInstanceId: string): Promise<CronOccurrenceRow> {
    const beforeMarkRunning = this.beforeMarkRunningOnce;
    this.beforeMarkRunningOnce = undefined;
    if (beforeMarkRunning) await beforeMarkRunning();
    const row = this.byId(id);
    if (row.status !== 'claimed' || row.startedAt !== null) throw new Error('not claimable');
    Object.assign(row, { status: 'running', startedAt, attemptId, ownerInstanceId });
    return row;
  }

  async markAdmissionExpired(
    id: string,
    attemptId: string,
    completedAt: Date,
    reason: string,
    metadata = {},
  ): Promise<CronOccurrenceRow> {
    const row = this.byId(id);
    if (row.status !== 'running' || row.startedAt === null || row.attemptId !== attemptId) {
      throw new Error('admission not expirable');
    }
    Object.assign(row, {
      status: 'skipped',
      startedAt: null,
      completedAt,
      reason,
      attemptId: null,
      metadata: { ...row.metadata, ...metadata },
    });
    return row;
  }

  async markSkipped(id: string, completedAt: Date, reason: string, metadata = {}): Promise<CronOccurrenceRow> {
    const row = this.byId(id);
    if (row.status !== 'claimed' || row.startedAt !== null) throw new Error('not skippable');
    Object.assign(row, { status: 'skipped', completedAt, reason, metadata: { ...row.metadata, ...metadata } });
    return row;
  }

  async markTerminal(
    id: string,
    status: 'succeeded' | 'failed',
    completedAt: Date,
    errorMessage: string | null,
    metadata = {},
  ): Promise<CronOccurrenceRow> {
    if (this.failTerminal) throw new Error('terminal write unavailable');
    const row = this.byId(id);
    if (row.status !== 'running') throw new Error('not running');
    Object.assign(row, { status, completedAt, errorMessage, metadata: { ...row.metadata, ...metadata } });
    return row;
  }

  async markIndeterminate(id: string, completedAt: Date, reason: string, metadata = {}): Promise<CronOccurrenceRow> {
    const row = this.byId(id);
    if (row.status !== 'running') throw new Error('not running');
    Object.assign(row, {
      status: 'indeterminate',
      completedAt,
      reason,
      metadata: { ...row.metadata, ...metadata, decision_alert_pending: true },
    });
    return row;
  }

  async reconcileRunning(jobName: string, currentOwner: string, at: Date): Promise<CronOccurrenceRow[]> {
    const changed: CronOccurrenceRow[] = [];
    for (const row of this.rows.values()) {
      if (row.jobName === jobName && row.status === 'running' && row.ownerInstanceId !== currentOwner) {
        Object.assign(row, {
          status: 'indeterminate',
          completedAt: at,
          reason: 'prior_process_died_after_start',
          metadata: {
            ...row.metadata,
            reconciled_by_owner_instance_id: currentOwner,
            decision_alert_pending: true,
          },
        });
        changed.push(row);
      }
    }
    return changed;
  }

  async loadPendingDecisionAlerts(jobName: string): Promise<CronOccurrenceRow[]> {
    return [...this.rows.values()]
      .filter((row) => row.jobName === jobName
        && row.status === 'indeterminate'
        && row.metadata.decision_alert_pending === true)
      .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime());
  }

  async markDecisionAlertPersisted(id: string, persistedAt: Date): Promise<CronOccurrenceRow> {
    const beforePersisted = this.beforeDecisionAlertPersistedOnce;
    this.beforeDecisionAlertPersistedOnce = undefined;
    if (beforePersisted) await beforePersisted();
    const row = this.byId(id);
    if (row.status !== 'indeterminate' || row.metadata.decision_alert_pending !== true) {
      throw new Error(`occurrence ${id} has no pending decision alert`);
    }
    const metadata = { ...row.metadata };
    delete metadata.decision_alert_pending;
    metadata.decision_alert_persisted_at = persistedAt.toISOString();
    row.metadata = metadata;
    return row;
  }

  async loadPendingStaleResolves(jobName: string): Promise<CronOccurrenceRow[]> {
    return [...this.rows.values()]
      .filter((row) => row.jobName === jobName
        && row.status === 'succeeded'
        && row.metadata.stale_resolve_pending === true)
      .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime());
  }

  async markStaleResolvePersisted(
    id: string,
    persistedAt: Date,
    outcome: 'resolved_open_alert' | 'already_resolved_alert' | 'no_open_alert',
  ): Promise<CronOccurrenceRow> {
    if (this.failStaleResolvePersistedOnce) {
      this.failStaleResolvePersistedOnce = false;
      throw new Error('stale resolve provenance unavailable');
    }
    const row = this.byId(id);
    if (row.status !== 'succeeded' || row.metadata.stale_resolve_pending !== true) {
      throw new Error(`occurrence ${id} has no pending stale resolve`);
    }
    const metadata = { ...row.metadata };
    delete metadata.stale_resolve_pending;
    metadata.stale_resolve_persisted_at = persistedAt.toISOString();
    metadata.stale_resolve_outcome = outcome;
    row.metadata = metadata;
    return row;
  }

  async loadClaimed(jobName: string): Promise<CronOccurrenceRow[]> {
    return [...this.rows.values()]
      .filter((row) => row.jobName === jobName && row.status === 'claimed' && row.startedAt === null)
      .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime());
  }

  private byId(id: string): CronOccurrenceRow {
    const row = [...this.rows.values()].find((candidate) => candidate.id === id);
    if (!row) throw new Error(`unknown occurrence ${id}`);
    return row;
  }
}

function makeJob(
  name: string,
  policyKey: CronRecoveryPolicyKey,
  expression: string,
  run: (context: CronScheduledRunContext) => Promise<CronJobRunResult | void>,
  beforeRun?: NonNullable<RegisteredCronJob['recovery']>['beforeRun'],
  timezone = 'UTC',
): RegisteredCronJob {
  return {
    name,
    task: {} as ScheduledTask,
    expression,
    timezone,
    intervalSeconds: 60,
    enabled: true,
    recovery: { policyKey, run, beforeRun },
  };
}

function fixture(options: {
  now?: string;
  name?: string;
  policyKey?: CronRecoveryPolicyKey;
  expression?: string;
  run?: (context: CronScheduledRunContext) => Promise<CronJobRunResult | void>;
  beforeRun?: NonNullable<RegisteredCronJob['recovery']>['beforeRun'];
  timezone?: string;
  store?: MemoryOccurrenceStore;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const store = options.store ?? new MemoryOccurrenceStore();
  const run = vi.fn(options.run ?? (async () => ({ meta: { proof: true } })));
  const name = options.name ?? 'formula_audit_cron';
  const job = makeJob(
    name,
    options.policyKey ?? 'formula_audit_cron',
    options.expression ?? '* * * * *',
    run,
    options.beforeRun,
    options.timezone,
  );
  const jobs = new Map([[name, job]]);
  let now = new Date(options.now ?? '2026-11-12T12:01:10.000Z');
  let uuid = 1;
  const writeFireRow = vi.fn(async () => undefined);
  const addAlert = vi.fn(async () => null);
  const resolveByKey = vi.fn(async () => ['resolved-alert-id'] as string[]);
  const dedupeStateByKey = vi.fn((): 'absent' | 'nonterminal' | 'resolved' => 'absent');
  const deps: CronOccurrenceRunnerDeps = {
    store,
    getJob: (jobName) => jobs.get(jobName),
    writeFireRow: writeFireRow as CronOccurrenceRunnerDeps['writeFireRow'],
    addAlert: addAlert as unknown as CronOccurrenceRunnerDeps['addAlert'],
    resolveByKey: resolveByKey as CronOccurrenceRunnerDeps['resolveByKey'],
    dedupeStateByKey,
    now: () => new Date(now),
    randomUUID: () => UUID(uuid++),
    sleep: options.sleep ?? (async () => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, 0))),
  };
  return {
    store,
    run,
    job,
    jobs,
    runner: new CronOccurrenceRunner(deps),
    writeFireRow,
    addAlert,
    resolveByKey,
    dedupeStateByKey,
    setNow: (value: string) => { now = new Date(value); },
  };
}

const row = (overrides: Partial<CronOccurrenceRow> = {}): CronOccurrenceRow => ({
  id: UUID(900),
  jobName: 'formula_audit_cron',
  scheduledFor: new Date('2026-11-12T12:00:00.000Z'),
  firstSource: 'missed_catchup',
  policyVersion: CRON_RECOVERY_POLICY_VERSION,
  status: 'claimed',
  claimedAt: new Date('2026-11-12T12:00:05.000Z'),
  startedAt: null,
  completedAt: null,
  lagMs: 5_000,
  reason: null,
  errorMessage: null,
  attemptId: null,
  ownerInstanceId: UUID(899),
  metadata: {},
  ...overrides,
});

describe('B-CRON-MISSED-CATCHUP occurrence runner', () => {
  it('uses the natural TaskContext boundary, not callback arrival time', async () => {
    const f = fixture({ now: '2026-11-12T12:01:10.123Z' });
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const result = await f.runner.runNatural(f.job.name, boundary);
    expect(result.status).toBe('succeeded');
    expect(f.run.mock.calls[0][0].scheduledFor).toEqual(boundary);
    expect(f.writeFireRow.mock.calls[0][0]).toMatchObject({ scheduledFor: boundary });
    expect(f.writeFireRow.mock.calls[0][0].firedAt).toEqual(new Date('2026-11-12T12:01:10.123Z'));
  });

  it('a job\'s own meta cannot override the fire row\'s identity fields', async () => {
    const f = fixture({
      // Deliberately violates JobFireMeta (a type error without the casts) to
      // prove the runtime ordering holds even if a job bypasses the type.
      run: async () => ({
        meta: {
          proof: true, trigger_source: 'poll', occurrence_id: 'forged',
          duration_ms: -1, lag_ms: -1, policy_version: 'forged',
        },
      }) as unknown as CronJobRunResult,
      beforeRun: (async () => ({ trigger_source: 'boot', occurrence_id: 'forged-before' })) as unknown as
        NonNullable<RegisteredCronJob['recovery']>['beforeRun'],
    });
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const result = await f.runner.runNatural(f.job.name, boundary);
    expect(result.status).toBe('succeeded');
    const meta = f.writeFireRow.mock.calls[0][0].meta;
    expect(meta.trigger_source).toBe('cron');
    expect(meta.occurrence_id).toBe([...f.store.rows.values()][0].id);
    expect(meta.occurrence_id).not.toMatch(/forged/);
    expect(meta.duration_ms).toBeGreaterThanOrEqual(0);
    expect(meta.lag_ms).toBeGreaterThanOrEqual(0);
    expect(meta.policy_version).toBe(CRON_RECOVERY_POLICY_VERSION);
    expect(meta.proof).toBe(true);
  });

  it('every reserved fire-meta key is runner-authored: forged values never survive, and the list matches the runner', async () => {
    const forged = Object.fromEntries(RUNNER_AUTHORED_FIRE_META_KEYS.map((key) => [key, '__forged__']));
    const f = fixture({
      run: async () => ({ meta: { ...forged, proof: true } }) as unknown as CronJobRunResult,
      beforeRun: (async () => ({ ...forged })) as unknown as NonNullable<RegisteredCronJob['recovery']>['beforeRun'],
    });
    const result = await f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z'));
    expect(result.status).toBe('succeeded');
    const meta = f.writeFireRow.mock.calls[0][0].meta as Record<string, unknown>;
    for (const key of RUNNER_AUTHORED_FIRE_META_KEYS) {
      expect(meta[key], key).toBeDefined();
      expect(meta[key], key).not.toBe('__forged__');
    }
    expect(meta.proof).toBe(true);

    // Source tie: the keys the runner writes AFTER the job's spreads are
    // exactly this list, so adding or dropping one on either side fails here.
    const source = readFileSync(resolve('server/services/cron-occurrence-runner.ts'), 'utf8').replace(/\r\n/g, '\n');
    const call = source.slice(source.indexOf('await this.deps.writeFireRow({'));
    const tail = call.slice(call.indexOf('...resultMeta,') + '...resultMeta,'.length, call.indexOf('},'));
    const trailing = [...tail.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
    expect([...trailing].sort()).toEqual([...RUNNER_AUTHORED_FIRE_META_KEYS].sort());
  });

  it('reconstructs the missed boundary before node-cron\'s advanced event date', async () => {
    const f = fixture();
    const result = await f.runner.runMissed(f.job.name, new Date('2026-11-12T12:02:00.000Z'));
    expect(result.scheduledFor).toEqual(new Date('2026-11-12T12:01:00.000Z'));
    expect(f.run.mock.calls[0][0].triggerSource).toBe('missed_catchup');
  });

  it('reconstructs a non-UTC calendar boundary through the registered timezone', async () => {
    const f = fixture({
      now: '2026-11-12T14:05:00.000Z',
      expression: '0 9 * * *',
      timezone: 'America/New_York',
    });
    const result = await f.runner.runMissed(f.job.name, new Date('2026-11-13T14:00:00.000Z'));
    expect(result.scheduledFor).toEqual(new Date('2026-11-12T14:00:00.000Z'));
    expect(result.status).toBe('succeeded');
  });

  it('records and alerts an invalid schedule instead of inventing a boundary', async () => {
    const f = fixture({ expression: 'NOT A CRON' });
    const eventDate = new Date('2026-11-12T12:02:00.000Z');
    const result = await f.runner.runMissed(f.job.name, eventDate);
    expect(result).toMatchObject({
      scheduledFor: eventDate,
      status: 'invalid_boundary',
      reason: 'previous_boundary_unavailable',
    });
    expect(f.run).not.toHaveBeenCalled();
    expect(f.addAlert).toHaveBeenCalledTimes(1);
  });

  it('admits one core for a natural/missed race on the same identity', async () => {
    const f = fixture();
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const results = await Promise.all([
      f.runner.runNatural(f.job.name, boundary),
      f.runner.runMissed(f.job.name, new Date('2026-11-12T12:02:00.000Z')),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['duplicate', 'succeeded']);
    expect(f.run).toHaveBeenCalledTimes(1);
    expect(f.store.rows.size).toBe(1);
  });

  it('records older burst members as backlog skips and executes only the newest boundary', async () => {
    const f = fixture({ now: '2026-11-12T12:02:10.000Z' });
    const results = await Promise.all([
      f.runner.runMissed(f.job.name, new Date('2026-11-12T12:01:00.000Z')),
      f.runner.runMissed(f.job.name, new Date('2026-11-12T12:02:00.000Z')),
      f.runner.runMissed(f.job.name, new Date('2026-11-12T12:03:00.000Z')),
    ]);
    expect(results.map((result) => [result.scheduledFor.toISOString(), result.status, result.reason])).toEqual([
      ['2026-11-12T12:00:00.000Z', 'skipped', 'backlog_cap'],
      ['2026-11-12T12:01:00.000Z', 'skipped', 'backlog_cap'],
      ['2026-11-12T12:02:00.000Z', 'succeeded', undefined],
    ]);
    expect(f.run.mock.calls.map((call) => call[0].scheduledFor.toISOString())).toEqual(['2026-11-12T12:02:00.000Z']);
  });

  it.each([
    ['formula_audit_cron', 6 * 60 * 60_000, 'too_old'],
    ['feed_integrity_cron', 4 * 60_000, 'too_old'],
    ['awareness_state_update_cron', 30 * 60_000, 'too_old'],
    ['awareness_reflection_cron', 60 * 60_000, 'too_old'],
    ['xstock_qd_probe_cron', 30_000, 'historical_inputs_unreconstructable'],
    ['xstock_universe_discovery_cron', 4 * 60 * 60_000, 'too_old'],
  ] as const)('fails closed beyond the %s lag policy', async (policyKey, maxLag, reason) => {
    const boundary = new Date('2026-11-12T00:00:00.000Z');
    const f = fixture({
      now: new Date(boundary.getTime() + maxLag + 1).toISOString(),
      name: `test_${policyKey}`,
      policyKey,
      expression: '* * * * *',
    });
    const result = await f.runner.runMissed(f.job.name, new Date(boundary.getTime() + 60_000));
    expect(result).toMatchObject({ status: 'skipped', reason });
    expect(f.run).not.toHaveBeenCalled();
    expect(f.writeFireRow).not.toHaveBeenCalled();
  });

  it('refuses feed catch-up when normal jitter could reach the next boundary', async () => {
    const f = fixture({
      now: '2026-11-12T12:00:40.000Z',
      name: 'feed-test',
      policyKey: 'feed_integrity_cron',
      expression: '* * * * *',
    });
    const result = await f.runner.runMissed(f.job.name, new Date('2026-11-12T12:01:00.000Z'));
    expect(result).toMatchObject({ status: 'skipped', reason: 'next_boundary_imminent' });
  });

  it('refuses universe recovery inside the pre-session completion guard', async () => {
    const f = fixture({
      now: '2026-11-16T14:10:00.000Z',
      name: 'universe-test',
      policyKey: 'xstock_universe_discovery_cron',
      expression: '* * * * *',
    });
    const result = await f.runner.runMissed(f.job.name, new Date('2026-11-16T14:10:00.000Z'));
    expect(result).toMatchObject({ status: 'skipped', reason: 'market_guard' });
  });

  it('prevents all core work when durable claim admission fails', async () => {
    const f = fixture();
    f.store.failClaim = true;
    const result = await f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z'));
    expect(result.status).toBe('claim_unavailable');
    expect(f.run).not.toHaveBeenCalled();
    expect(f.addAlert).toHaveBeenCalledTimes(1);
    const auxiliaryRun = vi.fn(async () => 'must-not-run');
    await expect(f.runner.runAuxiliary(f.job.name, 'manual', auxiliaryRun))
      .rejects.toThrow('[CRON-RECOVERY][LANE_STOPPED]');
    expect(auxiliaryRun).not.toHaveBeenCalled();
  });

  it('resolves only the exact successful occurrence with actor, transport and terminal evidence', async () => {
    const f = fixture();
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const result = await f.runner.runMissed(f.job.name, new Date('2026-11-12T12:02:00.000Z'));
    expect(f.resolveByKey).toHaveBeenCalledWith(
      `cron_stale:${f.job.name}:${boundary.toISOString()}`,
      CRON_RECOVERY_ACTOR,
      expect.stringMatching(new RegExp(`cron occurrence ${result.occurrenceId} .* terminal 2026-11-12T12:01:10.000Z`)),
      'engine',
    );
  });

  it('gives a natural success the same exact stale-alert cleanup as a catch-up success', async () => {
    const f = fixture();
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const result = await f.runner.runNatural(f.job.name, boundary);

    expect(f.resolveByKey).toHaveBeenCalledWith(
      `cron_stale:${f.job.name}:${boundary.toISOString()}`,
      CRON_RECOVERY_ACTOR,
      expect.stringContaining(`cron occurrence ${result.occurrenceId}`),
      'engine',
    );
    expect([...f.store.rows.values()][0].metadata).toMatchObject({
      stale_resolve_outcome: 'resolved_open_alert',
    });
  });

  it.each(['failed', 'skipped', 'indeterminate'] as const)('never resolves a %s occurrence', async (state) => {
    const store = new MemoryOccurrenceStore();
    const f = fixture({
      store,
      run: state === 'failed' ? async () => { throw new Error('core failed'); } : undefined,
      now: state === 'skipped' ? '2026-11-12T20:00:00.000Z' : undefined,
    });
    if (state === 'indeterminate') store.failTerminal = true;
    const result = state === 'skipped'
      ? await f.runner.runMissed(f.job.name, new Date('2026-11-12T12:02:00.000Z'))
      : await f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z'));
    expect(result.status).toBe(state);
    expect(f.resolveByKey).not.toHaveBeenCalled();
    expect(f.addAlert).toHaveBeenCalled();
    if (state === 'indeterminate') expect([...store.rows.values()][0].status).toBe('indeterminate');
  });

  it('serializes a manual caller behind scheduled work through the same lane', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    const order: string[] = [];
    const f = fixture({ run: async () => { order.push('scheduled-start'); await gate; order.push('scheduled-end'); } });
    const scheduled = f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z'));
    const manual = f.runner.runAuxiliary(f.job.name, 'manual', async () => { order.push('manual'); return 'ok'; });
    await vi.waitFor(() => expect(order).toEqual(['scheduled-start']));
    release();
    await expect(Promise.all([scheduled, manual])).resolves.toEqual([expect.objectContaining({ status: 'succeeded' }), 'ok']);
    expect(order).toEqual(['scheduled-start', 'scheduled-end', 'manual']);
  });

  it('lets different jobs proceed independently while one job is blocked', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    const f = fixture({ run: async () => gate });
    const otherRun = vi.fn(async () => undefined);
    const other = makeJob('other_formula_job', 'formula_audit_cron', '* * * * *', otherRun);
    f.jobs.set(other.name, other);
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const blocked = f.runner.runNatural(f.job.name, boundary);
    await vi.waitFor(() => expect(f.run).toHaveBeenCalledTimes(1));
    await expect(f.runner.runNatural(other.name, boundary)).resolves.toMatchObject({ status: 'succeeded' });
    expect(otherRun).toHaveBeenCalledTimes(1);
    release();
    await blocked;
  });

  it('marks prior-process running work indeterminate and resumes claimed work only', async () => {
    const store = new MemoryOccurrenceStore();
    store.seed(row({ id: UUID(901), status: 'running', startedAt: new Date('2026-11-12T11:59:00.000Z') }));
    store.seed(row({ id: UUID(902), scheduledFor: new Date('2026-11-12T12:01:00.000Z') }));
    const f = fixture({ store, now: '2026-11-12T12:01:10.000Z' });
    await f.runner.reconcileJob(f.job.name);
    await vi.waitFor(() => expect(
      store.rows.get(`${f.job.name}:2026-11-12T12:01:00.000Z`)?.status,
    ).toBe('succeeded'));
    expect(store.rows.get(`${f.job.name}:2026-11-12T12:00:00.000Z`)?.status).toBe('indeterminate');
    expect(store.rows.get(`${f.job.name}:2026-11-12T12:01:00.000Z`)?.status).toBe('succeeded');
  });

  it('blocks scheduled and auxiliary startup work until reconciliation completes', async () => {
    const store = new MemoryOccurrenceStore();
    store.refuseLock = true;
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolveRetry) => { releaseRetry = resolveRetry; });
    const auxiliaryRun = vi.fn(async () => 'auxiliary-ok');
    const f = fixture({ store, sleep: async () => retryGate });

    const scheduled = f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z'));
    const auxiliary = f.runner.runAuxiliary(f.job.name, 'boot', auxiliaryRun);
    await vi.waitFor(() => expect(store.lockAttempts).toBeGreaterThan(0));
    expect(f.run).not.toHaveBeenCalled();
    expect(auxiliaryRun).not.toHaveBeenCalled();
    expect(store.rows.size).toBe(0);

    store.refuseLock = false;
    releaseRetry();
    await expect(Promise.all([scheduled, auxiliary])).resolves.toEqual([
      expect.objectContaining({ status: 'succeeded' }),
      'auxiliary-ok',
    ]);
  });

  it('retries deferred reconciliation and eventually reconciles the prior process', async () => {
    const store = new MemoryOccurrenceStore();
    store.seed(row({ status: 'running', startedAt: new Date('2026-11-12T11:59:00.000Z') }));
    store.refuseLockAttempts = 1;
    const f = fixture({ store });

    await f.runner.prepareJob(f.job.name);

    expect(store.lockAttempts).toBe(2);
    expect([...store.rows.values()][0]).toMatchObject({
      status: 'indeterminate',
      reason: 'prior_process_died_after_start',
    });
  });

  it('preserves the exact reconciliation alert when advisory release fails afterward', async () => {
    const store = new MemoryOccurrenceStore();
    const prior = row({
      id: UUID(906),
      status: 'running',
      startedAt: new Date('2026-11-12T11:59:00.000Z'),
      ownerInstanceId: UUID(907),
    });
    store.seed(prior);
    store.failUnlock = true;
    const f = fixture({ store, now: '2026-11-12T12:01:10.000Z' });

    await expect(f.runner.reconcileJob(f.job.name))
      .rejects.toThrow('phase=startup_reconciliation');

    expect(store.rows.get(`${f.job.name}:${prior.scheduledFor.toISOString()}`)).toMatchObject({
      id: prior.id,
      status: 'indeterminate',
      reason: 'prior_process_died_after_start',
    });
    expect(f.addAlert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: `cron_recovery:indeterminate:${f.job.name}:${prior.scheduledFor.toISOString()}`,
      metadata: expect.objectContaining({
        occurrence_id: prior.id,
        status: 'indeterminate',
        reason: 'prior_process_died_after_start',
      }),
    }));
    store.failUnlock = false;
    await expect(f.runner.runNatural(f.job.name, new Date('2026-11-12T12:02:00.000Z')))
      .rejects.toThrow('[CRON-RECOVERY][LANE_STOPPED]');
  });

  it('retries a durable pending reconciliation alert before replacement startup resumes claimed work', async () => {
    const store = new MemoryOccurrenceStore();
    const prior = row({
      id: UUID(908),
      status: 'running',
      startedAt: new Date('2026-11-12T11:59:00.000Z'),
      ownerInstanceId: UUID(909),
    });
    const claimed = row({
      id: UUID(910),
      scheduledFor: new Date('2026-11-12T12:01:00.000Z'),
      ownerInstanceId: UUID(909),
    });
    store.seed(prior);
    store.seed(claimed);
    const first = fixture({ store, now: '2026-11-12T12:01:10.000Z' });
    first.addAlert.mockRejectedValueOnce(new Error('alert store unavailable'));

    await expect(first.runner.reconcileJob(first.job.name))
      .rejects.toThrow('phase=startup_reconciliation');

    expect(store.rows.get(`${first.job.name}:${prior.scheduledFor.toISOString()}`)).toMatchObject({
      status: 'indeterminate',
      metadata: expect.objectContaining({ decision_alert_pending: true }),
    });
    expect(store.rows.get(`${first.job.name}:${claimed.scheduledFor.toISOString()}`)?.status).toBe('claimed');
    expect(first.run).not.toHaveBeenCalled();

    const replacement = fixture({ store, now: '2026-11-12T12:01:20.000Z' });
    await replacement.runner.reconcileJob(replacement.job.name);
    await vi.waitFor(() => expect(
      store.rows.get(`${replacement.job.name}:${claimed.scheduledFor.toISOString()}`)?.status,
    ).toBe('succeeded'));

    expect(replacement.addAlert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: `cron_recovery:indeterminate:${replacement.job.name}:${prior.scheduledFor.toISOString()}`,
      metadata: expect.objectContaining({ occurrence_id: prior.id, status: 'indeterminate' }),
    }));
    expect(store.rows.get(`${replacement.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_persisted_at: '2026-11-12T12:01:20.000Z' });
    expect(store.rows.get(`${replacement.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .not.toHaveProperty('decision_alert_pending');
  });

  it('retries a rolling-process indeterminate alert before replacement startup resumes claimed work', async () => {
    const store = new MemoryOccurrenceStore();
    const first = fixture({ store, now: '2026-11-12T12:01:10.000Z' });
    await first.runner.prepareJob(first.job.name);
    const prior = row({
      id: UUID(911),
      status: 'running',
      startedAt: new Date('2026-11-12T11:59:00.000Z'),
      ownerInstanceId: UUID(912),
    });
    const claimed = row({
      id: UUID(913),
      scheduledFor: new Date('2026-11-12T12:01:00.000Z'),
      ownerInstanceId: UUID(912),
    });
    store.seed(prior);
    store.seed(claimed);
    first.addAlert.mockRejectedValueOnce(new Error('alert store unavailable'));

    await expect(first.runner.runNatural(first.job.name, prior.scheduledFor))
      .resolves.toMatchObject({ status: 'indeterminate', occurrenceId: prior.id });

    expect(store.rows.get(`${first.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });
    expect(store.rows.get(`${first.job.name}:${claimed.scheduledFor.toISOString()}`)?.status).toBe('claimed');
    await expect(first.runner.runAuxiliary(first.job.name, 'manual', async () => 'must-not-run'))
      .rejects.toThrow('[CRON-RECOVERY][LANE_STOPPED]');

    const replacement = fixture({ store, now: '2026-11-12T12:01:20.000Z' });
    let releaseAlert!: () => void;
    const alertGate = new Promise<void>((resolveAlert) => { releaseAlert = resolveAlert; });
    replacement.addAlert.mockImplementationOnce(async () => alertGate);
    const reconciliation = replacement.runner.reconcileJob(replacement.job.name);
    await vi.waitFor(() => expect(replacement.addAlert).toHaveBeenCalledTimes(1));
    expect(store.rows.get(`${replacement.job.name}:${claimed.scheduledFor.toISOString()}`)?.status).toBe('claimed');
    expect(store.rows.get(`${replacement.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });
    expect(replacement.run).not.toHaveBeenCalled();
    releaseAlert();
    await reconciliation;
    await vi.waitFor(() => expect(
      store.rows.get(`${replacement.job.name}:${claimed.scheduledFor.toISOString()}`)?.status,
    ).toBe('succeeded'));
    expect(replacement.addAlert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: `cron_recovery:indeterminate:${replacement.job.name}:${prior.scheduledFor.toISOString()}`,
      metadata: expect.objectContaining({ occurrence_id: prior.id, status: 'indeterminate' }),
    }));
    expect(store.rows.get(`${replacement.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .not.toHaveProperty('decision_alert_pending');
  });

  it('retries a terminal-write indeterminate alert before replacement startup resumes claimed work', async () => {
    const store = new MemoryOccurrenceStore();
    store.failTerminal = true;
    const first = fixture({ store, now: '2026-11-12T12:01:10.000Z' });
    first.addAlert.mockRejectedValueOnce(new Error('alert store unavailable'));
    const boundary = new Date('2026-11-12T12:01:00.000Z');

    const result = await first.runner.runNatural(first.job.name, boundary);

    expect(result).toMatchObject({ status: 'indeterminate', reason: 'terminal_write_failed:terminal write unavailable' });
    expect(store.rows.get(`${first.job.name}:${boundary.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });
    await expect(first.runner.runAuxiliary(first.job.name, 'manual', async () => 'must-not-run'))
      .rejects.toThrow('[CRON-RECOVERY][LANE_STOPPED]');

    store.failTerminal = false;
    const claimed = row({
      id: UUID(914),
      scheduledFor: new Date('2026-11-12T12:02:00.000Z'),
      ownerInstanceId: UUID(915),
    });
    store.seed(claimed);
    const replacement = fixture({ store, now: '2026-11-12T12:02:10.000Z' });
    let releaseAlert!: () => void;
    const alertGate = new Promise<void>((resolveAlert) => { releaseAlert = resolveAlert; });
    replacement.addAlert.mockImplementationOnce(async () => alertGate);
    const reconciliation = replacement.runner.reconcileJob(replacement.job.name);
    await vi.waitFor(() => expect(replacement.addAlert).toHaveBeenCalledTimes(1));
    expect(store.rows.get(`${replacement.job.name}:${claimed.scheduledFor.toISOString()}`)?.status).toBe('claimed');
    expect(store.rows.get(`${replacement.job.name}:${boundary.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });
    expect(replacement.run).not.toHaveBeenCalled();
    releaseAlert();
    await reconciliation;
    await vi.waitFor(() => expect(
      store.rows.get(`${replacement.job.name}:${claimed.scheduledFor.toISOString()}`)?.status,
    ).toBe('succeeded'));
    expect(replacement.addAlert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: `cron_recovery:indeterminate:${replacement.job.name}:${boundary.toISOString()}`,
      metadata: expect.objectContaining({ occurrence_id: result.occurrenceId, status: 'indeterminate' }),
    }));
    expect(store.rows.get(`${replacement.job.name}:${boundary.toISOString()}`)?.metadata)
      .not.toHaveProperty('decision_alert_pending');
  });

  it('makes an overtaking lock holder persist the pending alert before scheduled or auxiliary work', async () => {
    const store = new MemoryOccurrenceStore();
    const creator = fixture({ store, now: '2026-11-12T12:01:10.000Z' });
    const scheduledContender = fixture({ store, now: '2026-11-12T12:01:20.000Z' });
    const auxiliaryContender = fixture({ store, now: '2026-11-12T12:01:20.000Z' });
    await creator.runner.prepareJob(creator.job.name);
    await scheduledContender.runner.prepareJob(scheduledContender.job.name);
    await auxiliaryContender.runner.prepareJob(auxiliaryContender.job.name);
    const prior = row({
      id: UUID(916),
      status: 'running',
      startedAt: new Date('2026-11-12T11:59:00.000Z'),
      ownerInstanceId: UUID(917),
    });
    store.seed(prior);

    let releaseCreator!: () => void;
    let announceWindow!: () => void;
    const creatorGate = new Promise<void>((resolveCreator) => { releaseCreator = resolveCreator; });
    const windowOpen = new Promise<void>((resolveWindow) => { announceWindow = resolveWindow; });
    store.afterUnlockOnce = async () => {
      announceWindow();
      await creatorGate;
    };
    const creatorResult = creator.runner.runNatural(creator.job.name, prior.scheduledFor);
    await windowOpen;
    expect(store.rows.get(`${creator.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });

    let releaseAlert!: () => void;
    const alertGate = new Promise<void>((resolveAlert) => { releaseAlert = resolveAlert; });
    scheduledContender.addAlert.mockImplementationOnce(async () => alertGate);
    const nextBoundary = new Date('2026-11-12T12:01:00.000Z');
    const scheduled = scheduledContender.runner.runNatural(scheduledContender.job.name, nextBoundary);
    await vi.waitFor(() => expect(scheduledContender.addAlert).toHaveBeenCalledTimes(1));
    const auxiliaryRun = vi.fn(async () => 'auxiliary-ok');
    const auxiliary = auxiliaryContender.runner.runAuxiliary(auxiliaryContender.job.name, 'manual', auxiliaryRun);
    await vi.waitFor(() => expect(store.lockAttempts).toBeGreaterThanOrEqual(8));

    expect(scheduledContender.run).not.toHaveBeenCalled();
    expect(auxiliaryRun).not.toHaveBeenCalled();
    expect(store.rows.has(`${creator.job.name}:${nextBoundary.toISOString()}`)).toBe(false);
    expect(store.rows.get(`${creator.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });

    let releaseMarker!: () => void;
    let announceMarkerBlocked!: () => void;
    const markerGate = new Promise<void>((resolveMarker) => { releaseMarker = resolveMarker; });
    const markerBlocked = new Promise<void>((resolveBlocked) => { announceMarkerBlocked = resolveBlocked; });
    store.beforeDecisionAlertPersistedOnce = async () => {
      announceMarkerBlocked();
      await markerGate;
    };
    releaseAlert();
    await markerBlocked;
    expect(scheduledContender.run).not.toHaveBeenCalled();
    expect(auxiliaryRun).not.toHaveBeenCalled();
    expect(store.rows.get(`${creator.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });
    releaseMarker();
    await expect(Promise.all([scheduled, auxiliary])).resolves.toEqual([
      expect.objectContaining({ status: 'succeeded' }),
      'auxiliary-ok',
    ]);
    expect(scheduledContender.addAlert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: `cron_recovery:indeterminate:${creator.job.name}:${prior.scheduledFor.toISOString()}`,
      metadata: expect.objectContaining({ occurrence_id: prior.id, status: 'indeterminate' }),
    }));
    expect(store.rows.get(`${creator.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .not.toHaveProperty('decision_alert_pending');

    releaseCreator();
    await expect(creatorResult).resolves.toMatchObject({ status: 'indeterminate', occurrenceId: prior.id });
  });

  it('makes an auxiliary overtaking lock holder persist the pending alert before its callback', async () => {
    const store = new MemoryOccurrenceStore();
    const creator = fixture({ store, now: '2026-11-12T12:01:10.000Z' });
    const auxiliaryContender = fixture({ store, now: '2026-11-12T12:01:20.000Z' });
    await creator.runner.prepareJob(creator.job.name);
    await auxiliaryContender.runner.prepareJob(auxiliaryContender.job.name);
    const prior = row({
      id: UUID(919),
      status: 'running',
      startedAt: new Date('2026-11-12T11:59:00.000Z'),
      ownerInstanceId: UUID(920),
    });
    store.seed(prior);

    let releaseCreator!: () => void;
    let announceWindow!: () => void;
    const creatorGate = new Promise<void>((resolveCreator) => { releaseCreator = resolveCreator; });
    const windowOpen = new Promise<void>((resolveWindow) => { announceWindow = resolveWindow; });
    store.afterUnlockOnce = async () => {
      announceWindow();
      await creatorGate;
    };
    const creatorResult = creator.runner.runNatural(creator.job.name, prior.scheduledFor);
    await windowOpen;
    expect(store.rows.get(`${creator.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });

    let releaseAlert!: () => void;
    const alertGate = new Promise<void>((resolveAlert) => { releaseAlert = resolveAlert; });
    auxiliaryContender.addAlert.mockImplementationOnce(async () => alertGate);
    const auxiliaryRun = vi.fn(async () => 'auxiliary-ok');
    const auxiliary = auxiliaryContender.runner.runAuxiliary(auxiliaryContender.job.name, 'manual', auxiliaryRun);
    await vi.waitFor(() => expect(auxiliaryContender.addAlert).toHaveBeenCalledTimes(1));
    expect(auxiliaryRun).not.toHaveBeenCalled();

    let releaseMarker!: () => void;
    let announceMarkerBlocked!: () => void;
    const markerGate = new Promise<void>((resolveMarker) => { releaseMarker = resolveMarker; });
    const markerBlocked = new Promise<void>((resolveBlocked) => { announceMarkerBlocked = resolveBlocked; });
    store.beforeDecisionAlertPersistedOnce = async () => {
      announceMarkerBlocked();
      await markerGate;
    };
    releaseAlert();
    await markerBlocked;
    expect(auxiliaryRun).not.toHaveBeenCalled();
    expect(store.rows.get(`${creator.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .toMatchObject({ decision_alert_pending: true });

    releaseMarker();
    await expect(auxiliary).resolves.toBe('auxiliary-ok');
    expect(auxiliaryContender.addAlert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: `cron_recovery:indeterminate:${creator.job.name}:${prior.scheduledFor.toISOString()}`,
      metadata: expect.objectContaining({ occurrence_id: prior.id, status: 'indeterminate' }),
    }));
    expect(store.rows.get(`${creator.job.name}:${prior.scheduledFor.toISOString()}`)?.metadata)
      .not.toHaveProperty('decision_alert_pending');

    releaseCreator();
    await expect(creatorResult).resolves.toMatchObject({ status: 'indeterminate', occurrenceId: prior.id });
  });

  it('retains a different scheduled identity through advisory-lock contention', async () => {
    const store = new MemoryOccurrenceStore();
    const first = fixture({ store });
    const second = fixture({ store });
    await first.runner.prepareJob(first.job.name);
    await second.runner.prepareJob(second.job.name);

    let releaseAuxiliary!: () => void;
    const auxiliaryGate = new Promise<void>((resolveAuxiliary) => { releaseAuxiliary = resolveAuxiliary; });
    const auxiliary = first.runner.runAuxiliary(first.job.name, 'manual', async () => auxiliaryGate);
    await vi.waitFor(() => expect(store.lockAttempts).toBeGreaterThanOrEqual(3));
    const attemptsBeforeScheduled = store.lockAttempts;

    let scheduledSettled = false;
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const scheduled = second.runner.runNatural(second.job.name, boundary)
      .finally(() => { scheduledSettled = true; });
    await vi.waitFor(() => expect(store.lockAttempts).toBeGreaterThan(attemptsBeforeScheduled));
    expect(scheduledSettled).toBe(false);
    expect(store.rows.size).toBe(0);

    releaseAuxiliary();
    await auxiliary;
    await expect(scheduled).resolves.toMatchObject({ status: 'succeeded', scheduledFor: boundary });
    expect(store.rows.get(`${second.job.name}:${boundary.toISOString()}`)?.status).toBe('succeeded');
  });

  it('holds a separate runner verifier read behind an in-flight natural core', async () => {
    const store = new MemoryOccurrenceStore();
    let releaseCore!: () => void;
    const coreGate = new Promise<void>((resolveCore) => { releaseCore = resolveCore; });
    const naturalOwner = fixture({ store, run: async () => coreGate });
    const verifierOwner = fixture({ store });
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const natural = naturalOwner.runner.runNatural(naturalOwner.job.name, boundary);
    await vi.waitFor(() => expect(naturalOwner.run).toHaveBeenCalledTimes(1));

    const lockedRead = vi.fn(async () => 'read-after-core');
    const verifier = verifierOwner.runner.runVerifierLocked(verifierOwner.job.name, lockedRead);
    await vi.waitFor(() => expect(store.lockAttempts).toBeGreaterThanOrEqual(2));
    expect(lockedRead).not.toHaveBeenCalled();

    releaseCore();
    await expect(natural).resolves.toMatchObject({ status: 'succeeded' });
    await expect(verifier).resolves.toBe('read-after-core');
    expect(lockedRead).toHaveBeenCalledTimes(1);
  });

  it('retries its own lock failure and stays independent of a permanently stopped execution lane', async () => {
    const f = fixture();
    await f.runner.prepareJob(f.job.name);
    f.store.failLockSession = true;

    await expect(f.runner.runVerifierLocked(f.job.name, async () => 'must-not-run'))
      .rejects.toThrow('[CRON-RECOVERY][VERIFIER_LOCK_SESSION_FAIL]');
    f.store.failLockSession = false;
    await expect(f.runner.runVerifierLocked(f.job.name, async () => 'verifier-recovered'))
      .resolves.toBe('verifier-recovered');

    f.store.failLockSession = true;

    await expect(f.runner.runAuxiliary(f.job.name, 'manual', async () => 'must-not-run'))
      .rejects.toThrow('phase=auxiliary_lock_session');
    f.store.failLockSession = false;

    await expect(f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z')))
      .rejects.toThrow('[CRON-RECOVERY][LANE_STOPPED]');
    await expect(f.runner.runVerifierLocked(f.job.name, async () => 'verifier-still-independent'))
      .resolves.toBe('verifier-still-independent');
  });

  it('rejects an auxiliary business failure without stopping later scheduled work', async () => {
    const f = fixture();
    const auxiliaryError = new Error('manual refresh failed');

    await expect(f.runner.runAuxiliary(f.job.name, 'manual', async () => {
      throw auxiliaryError;
    })).rejects.toBe(auxiliaryError);

    await expect(f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z')))
      .resolves.toMatchObject({ status: 'succeeded' });
    expect(f.run).toHaveBeenCalledTimes(1);
  });

  it('stops the lane when the auxiliary lock session itself fails', async () => {
    const f = fixture();
    const auxiliaryRun = vi.fn(async () => 'must-not-run');
    await f.runner.prepareJob(f.job.name);
    f.store.failLockSession = true;

    await expect(f.runner.runAuxiliary(f.job.name, 'manual', auxiliaryRun))
      .rejects.toThrow('phase=auxiliary_lock_session');
    f.store.failLockSession = false;
    await expect(f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z')))
      .rejects.toThrow('[CRON-RECOVERY][LANE_STOPPED]');
    expect(auxiliaryRun).not.toHaveBeenCalled();
    expect(f.run).not.toHaveBeenCalled();
  });

  it('stops the lane when auxiliary work completes but advisory release fails', async () => {
    const f = fixture();
    const auxiliaryRun = vi.fn(async () => 'callback-completed');
    await f.runner.prepareJob(f.job.name);
    f.store.failUnlock = true;

    await expect(f.runner.runAuxiliary(f.job.name, 'manual', auxiliaryRun))
      .rejects.toThrow('phase=auxiliary_lock_session');
    expect(auxiliaryRun).toHaveBeenCalledTimes(1);
    f.store.failUnlock = false;
    await expect(f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z')))
      .rejects.toThrow('[CRON-RECOVERY][LANE_STOPPED]');
    expect(f.run).not.toHaveBeenCalled();
  });

  it('keeps durable success when the failure-safe audit writer unexpectedly rejects', async () => {
    const f = fixture();
    f.writeFireRow.mockRejectedValueOnce(new Error('audit unavailable'));
    const result = await f.runner.runNatural(f.job.name, new Date('2026-11-12T12:01:00.000Z'));
    expect(result.status).toBe('succeeded');
    expect([...f.store.rows.values()][0].status).toBe('succeeded');
  });

  it('keeps durable success when exact stale-alert resolution is temporarily unavailable', async () => {
    const f = fixture();
    f.resolveByKey.mockRejectedValueOnce(new Error('alert store unavailable'));
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    const result = await f.runner.runMissed(f.job.name, new Date('2026-11-12T12:02:00.000Z'));
    expect(result.status).toBe('succeeded');
    expect([...f.store.rows.values()][0]).toMatchObject({
      status: 'succeeded',
      metadata: expect.objectContaining({ stale_resolve_pending: true }),
    });

    await expect(f.runner.runAuxiliary(f.job.name, 'manual', async () => 'retried')).resolves.toBe('retried');
    expect(f.resolveByKey).toHaveBeenLastCalledWith(
      `cron_stale:${f.job.name}:${boundary.toISOString()}`,
      CRON_RECOVERY_ACTOR,
      expect.stringContaining(`cron occurrence ${result.occurrenceId}`),
      'engine',
    );
    expect([...f.store.rows.values()][0].metadata).not.toHaveProperty('stale_resolve_pending');
  });

  it('records no open alert as a terminal outcome and never retries it forever', async () => {
    const f = fixture();
    f.resolveByKey.mockResolvedValue([]);
    const boundary = new Date('2026-11-12T12:01:00.000Z');
    await f.runner.runMissed(f.job.name, new Date('2026-11-12T12:02:00.000Z'));
    expect(f.resolveByKey).toHaveBeenCalledTimes(1);
    expect([...f.store.rows.values()][0].metadata).toMatchObject({
      stale_resolve_outcome: 'no_open_alert',
    });
    expect([...f.store.rows.values()][0].metadata).not.toHaveProperty('stale_resolve_pending');

    await f.runner.runAuxiliary(f.job.name, 'manual', async () => undefined);
    expect(f.resolveByKey).toHaveBeenCalledTimes(1);
    expect(f.resolveByKey).toHaveBeenCalledWith(
      `cron_stale:${f.job.name}:${boundary.toISOString()}`,
      CRON_RECOVERY_ACTOR,
      expect.any(String),
      'engine',
    );
  });

  it('keeps the durable marker if an unresolved row survives an empty resolve', async () => {
    const f = fixture();
    f.resolveByKey.mockResolvedValue([]);
    f.dedupeStateByKey.mockReturnValue('nonterminal');

    await f.runner.runNatural(
      f.job.name,
      new Date('2026-11-12T12:01:00.000Z'),
    );

    expect([...f.store.rows.values()][0].metadata).toMatchObject({
      stale_resolve_pending: true,
    });
    expect([...f.store.rows.values()][0].metadata).not.toHaveProperty('stale_resolve_outcome');
  });

  it('preserves an earlier successful alert resolution when its provenance write retries', async () => {
    const f = fixture();
    f.store.failStaleResolvePersistedOnce = true;
    f.resolveByKey
      .mockResolvedValueOnce(['resolved-alert-id'])
      .mockResolvedValueOnce([]);
    f.dedupeStateByKey.mockReturnValue('resolved');

    await f.runner.runNatural(
      f.job.name,
      new Date('2026-11-12T12:01:00.000Z'),
    );
    expect([...f.store.rows.values()][0].metadata).toMatchObject({
      stale_resolve_pending: true,
    });

    await f.runner.runAuxiliary(f.job.name, 'manual', async () => undefined);

    expect(f.resolveByKey).toHaveBeenCalledTimes(2);
    expect(f.dedupeStateByKey).toHaveBeenCalledWith(
      'cron_stale:formula_audit_cron:2026-11-12T12:01:00.000Z',
    );
    expect([...f.store.rows.values()][0].metadata).toMatchObject({
      stale_resolve_outcome: 'already_resolved_alert',
    });
    expect([...f.store.rows.values()][0].metadata).not.toHaveProperty('stale_resolve_pending');
  });

  it('rechecks missed eligibility after pre-run work and refuses a boundary that aged out', async () => {
    let advanceClock = () => {};
    const beforeRun = vi.fn(async () => { advanceClock(); });
    const f = fixture({
      now: '2026-11-12T12:00:20.000Z',
      name: 'xstock_qd_probe_cron',
      policyKey: 'xstock_qd_probe_cron',
      expression: '* * * * *',
      beforeRun,
    });
    advanceClock = () => f.setNow('2026-11-12T12:00:40.000Z');

    const result = await f.runner.runMissed(f.job.name, new Date('2026-11-12T12:01:00.000Z'));

    expect(beforeRun).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'skipped', reason: 'historical_inputs_unreconstructable' });
    expect(f.run).not.toHaveBeenCalled();
    expect([...f.store.rows.values()][0]).toMatchObject({
      status: 'skipped',
      metadata: expect.objectContaining({ rechecked_before_start: true, initial_lag_ms: 20_000 }),
    });
  });

  it('rechecks missed eligibility after the running transition and refuses a boundary that aged out', async () => {
    const f = fixture({
      now: '2026-11-12T12:00:20.000Z',
      name: 'xstock_qd_probe_cron',
      policyKey: 'xstock_qd_probe_cron',
      expression: '* * * * *',
    });
    f.store.beforeMarkRunningOnce = async () => {
      f.setNow('2026-11-12T12:00:40.000Z');
    };

    const result = await f.runner.runMissed(f.job.name, new Date('2026-11-12T12:01:00.000Z'));

    expect(result).toMatchObject({ status: 'skipped', reason: 'historical_inputs_unreconstructable' });
    expect(f.run).not.toHaveBeenCalled();
    expect([...f.store.rows.values()][0]).toMatchObject({
      status: 'skipped',
      startedAt: null,
      attemptId: null,
      metadata: expect.objectContaining({
        rechecked_after_running_transition: true,
        admission_at: '2026-11-12T12:00:20.000Z',
        initial_lag_ms: 20_000,
        final_lag_ms: 40_000,
      }),
    });
  });

  it.each([
    ['claimed', 'lock contention observed', 1, 'succeeded', 1],
    ['claimed', 'lock released before admission', 0, 'succeeded', 1],
    ['running', 'lock contention observed', 1, 'indeterminate', 0],
    ['running', 'lock released before admission', 0, 'indeterminate', 0],
  ] as const)(
    'recovers a same-identity rolling-process %s row when %s',
    async (unfinishedStatus, _overlapShape, refusedAttempts, expectedStatus, expectedRuns) => {
      const store = new MemoryOccurrenceStore();
      const contender = fixture({ store });
      await contender.runner.prepareJob(contender.job.name);
      const boundary = new Date('2026-11-12T12:01:00.000Z');
      store.seed(row({
        id: UUID(903),
        scheduledFor: boundary,
        status: unfinishedStatus,
        startedAt: unfinishedStatus === 'running' ? new Date('2026-11-12T12:01:05.000Z') : null,
        attemptId: unfinishedStatus === 'running' ? UUID(904) : null,
        ownerInstanceId: UUID(905),
      }));
      store.refuseLockAttempts = refusedAttempts;

      const result = await contender.runner.runNatural(contender.job.name, boundary);

      expect(result).toMatchObject({ status: expectedStatus, occurrenceId: UUID(903) });
      expect(contender.run).toHaveBeenCalledTimes(expectedRuns);
      expect(store.rows.get(`${contender.job.name}:${boundary.toISOString()}`)?.status).toBe(expectedStatus);
      if (unfinishedStatus === 'running') expect(contender.addAlert).toHaveBeenCalledTimes(1);
    },
  );
});

describe('B-CRON-MISSED-CATCHUP advisory lock session', () => {
  it.each([
    ['query rejection', new Error('advisory unlock unavailable'), undefined],
    ['false result', undefined, { rows: [{ released: false }] }],
  ] as const)('propagates advisory-unlock %s and destroys the affected pooled client', async (
    _failureShape,
    unlockError,
    unlockResult,
  ) => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ acquired: true }] }),
      release: vi.fn(),
    };
    if (unlockError) client.query.mockRejectedValueOnce(unlockError);
    else client.query.mockResolvedValueOnce(unlockResult);
    const connect = vi.spyOn(pool, 'connect').mockResolvedValue(client as never);
    const store = new PgOccurrenceStore();

    try {
      const locked = store.withJobLock('formula_audit_cron', async () => 'callback-completed');
      if (unlockError) await expect(locked).rejects.toBe(unlockError);
      else await expect(locked).rejects.toThrow('advisory unlock returned false');
      expect(client.query).toHaveBeenCalledTimes(2);
      const releaseFailure = client.release.mock.calls[0]?.[0];
      expect(releaseFailure).toBeInstanceOf(Error);
      expect(releaseFailure?.message).toBe(unlockError?.message ?? 'advisory unlock returned false');
    } finally {
      connect.mockRestore();
    }
  });
});

describe('B-CRON-MISSED-CATCHUP source and registration fences', () => {
  it('the registry type refuses a runner-authored fire-meta key from a job (compile-time fence)', () => {
    // Tests are outside the tsc project, so this compiles a virtual job file
    // against the real cron-registry.ts and reads the diagnostics directly.
    const virtualName = '__job_fire_meta_fence__.ts';
    const virtualPath = resolve('server/services', virtualName).replace(/\\/g, '/');
    const lines = [
      "import type { CronJobRunResult, JobFireMeta } from './cron-registry';",
      'export const allowed: JobFireMeta = { proof: true, count: 3 };',
      "export const reservedIdentity: CronJobRunResult = { meta: { trigger_source: 'poll' } };",
      'export const reservedMeasure: JobFireMeta = { duration_ms: 1 };',
      "export const reservedBefore: JobFireMeta = { occurrence_id: 'x' };",
    ];
    const options: ts.CompilerOptions = {
      strict: true, noEmit: true, skipLibCheck: true, types: [],
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const isVirtual = (f: string) => f.replace(/\\/g, '/').endsWith(`/server/services/${virtualName}`);
    host.getSourceFile = (f, lang, ...rest) =>
      isVirtual(f) ? ts.createSourceFile(f, lines.join('\n'), lang) : getSourceFile(f, lang, ...rest);
    host.fileExists = (f) => isVirtual(f) || fileExists(f);
    const program = ts.createProgram([virtualPath], options, host);
    const virtual = program.getSourceFiles().find((sf) => isVirtual(sf.fileName));
    expect(virtual).toBeDefined();
    const errors = ts.getPreEmitDiagnostics(program, virtual)
      .filter((d) => d.category === ts.DiagnosticCategory.Error && d.file && d.start !== undefined);
    const errorLines = errors.map((d) => d.file!.getLineAndCharacterOfPosition(d.start!).line);
    // Pinned to TS2322 (not assignable): an unrelated error on those lines
    // must not read as the reservation firing.
    expect(errors.filter((d) => d.code !== 2322).map((d) => d.code)).toEqual([]);
    // Line 0 is the import: it must resolve (a missing module would also be an
    // error, which would read as a false pass on the reserved lines).
    expect(errorLines).not.toContain(0);
    expect(errorLines).not.toContain(1);
    expect([...new Set(errorLines)].sort()).toEqual([2, 3, 4]);
  });

  it('registers the forward migration and keeps the rollback out of the manifest', () => {
    const manifest = readFileSync(resolve('drizzle/migrations/MANIFEST.txt'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    expect(manifest).toContain('2026-11-12-b-cron-missed-catchup.sql');
    expect(manifest).not.toContain('2026-11-12-b-cron-missed-catchup-rollback.sql');
    expect(new Set(manifest).size).toBe(manifest.length);
  });

  it('pins node-cron 4.2.1 advancing the date before emitting a missed execution', () => {
    const packageJson = JSON.parse(readFileSync(resolve('node_modules/node-cron/package.json'), 'utf8')) as { version: string };
    const source = readFileSync(resolve('node_modules/node-cron/dist/cjs/scheduler/runner.js'), 'utf8');
    expect(packageJson.version).toBe('4.2.1');
    const advance = source.indexOf('expectedNextExecution = this.timeMatcher.getNextMatch(expectedNextExecution)');
    const emit = source.indexOf('runAsync(this.onMissedExecution, expectedNextExecution');
    expect(advance).toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(advance);
  });

  it('keeps the Q-D business clock on actual start while retaining the scheduled occurrence identity', () => {
    const source = readFileSync(resolve('server/services/xstock-qd-probe-cron.ts'), 'utf8');
    expect(source).toMatch(/runQdProbeOnce\(context\.firedAt, config\)/);
    expect(source).not.toMatch(/runQdProbeOnce\(context\.scheduledFor, config\)/);
  });

  it('finds exactly six dormant production schedules, each reconciled before start', () => {
    const productionTypescript = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'tests' ? [] : productionTypescript(path);
        return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
      });
    const files = productionTypescript(resolve('server'));
    let scheduleCalls = 0;
    let dormantTaskCalls = 0;
    let recoveryProperties = 0;
    let missedListeners = 0;
    let preparationCalls = 0;
    let startCalls = 0;
    for (const file of files) {
      let fileScheduleCalls = 0;
      let fileDormantTaskCalls = 0;
      let fileRecoveryProperties = 0;
      let fileMissedListeners = 0;
      let filePreparationCalls = 0;
      let fileStartCalls = 0;
      const preparationPositions: number[] = [];
      const startPositions: number[] = [];
      const source = readFileSync(resolve(file), 'utf8');
      const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          if (node.expression.name.text === 'schedule' || node.expression.name.text === 'createTask') {
            fileScheduleCalls += 1;
          }
          if (node.expression.name.text === 'createTask') fileDormantTaskCalls += 1;
          if (node.expression.name.text === 'prepareJob') {
            filePreparationCalls += 1;
            preparationPositions.push(node.getStart(tree));
          }
          if (node.expression.name.text === 'start') {
            fileStartCalls += 1;
            startPositions.push(node.getStart(tree));
          }
          if (
            node.expression.name.text === 'on'
            && node.arguments[0]
            && ts.isStringLiteral(node.arguments[0])
            && node.arguments[0].text === 'execution:missed'
          ) fileMissedListeners += 1;
        }
        if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'recovery') fileRecoveryProperties += 1;
        ts.forEachChild(node, visit);
      };
      visit(tree);
      if (fileScheduleCalls > 0) {
        expect(
          { recoveryProperties: fileRecoveryProperties, missedListeners: fileMissedListeners },
          `production schedule wiring in ${file}`,
        ).toEqual({ recoveryProperties: fileScheduleCalls, missedListeners: fileScheduleCalls });
        expect(
          {
            dormantTaskCalls: fileDormantTaskCalls,
            preparationCalls: filePreparationCalls,
            startCalls: fileStartCalls,
          },
          `startup reconciliation gate in ${file}`,
        ).toEqual({
          dormantTaskCalls: fileScheduleCalls,
          preparationCalls: fileScheduleCalls,
          startCalls: fileScheduleCalls,
        });
        expect(
          Math.min(...startPositions),
          `every schedule in ${file} must remain dormant until every job in that module is reconciled`,
        ).toBeGreaterThan(Math.max(...preparationPositions));
        scheduleCalls += fileScheduleCalls;
        dormantTaskCalls += fileDormantTaskCalls;
        recoveryProperties += fileRecoveryProperties;
        missedListeners += fileMissedListeners;
        preparationCalls += filePreparationCalls;
        startCalls += fileStartCalls;
      }
    }
    expect({ scheduleCalls, dormantTaskCalls, recoveryProperties, missedListeners, preparationCalls, startCalls }).toEqual({
      scheduleCalls: 6,
      dormantTaskCalls: 6,
      recoveryProperties: 6,
      missedListeners: 6,
      preparationCalls: 6,
      startCalls: 6,
    });
  });
});
