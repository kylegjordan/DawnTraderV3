/**
 * B-CRON-MISSED-CATCHUP (#691) — one durable admission path for every
 * production node-cron occurrence.
 *
 * Natural callbacks and node-cron's execution:missed events enter the same
 * per-job FIFO. The database identity (job_name, scheduled_for) decides who
 * may start; the FIFO and a session advisory lock serialize scheduled,
 * boot-time and manual callers for the same job. scheduled_tasks_audit stays
 * the best-effort terminal fire stream and is never used as the claim.
 */

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { computeNextFire, computePrevFire } from './cron-next-fire.js';
import {
  cronRegistry,
  type CronAuxiliarySource,
  type CronOccurrenceSource,
  type CronRecoveryPolicyKey,
  type RegisteredCronJob,
} from './cron-registry.js';
import { scheduledJobsAudit } from './scheduled-jobs-audit.js';
import {
  addAlert,
  getAlertDedupeState,
  resolveAlertsByDedupeKey,
  type AlertDedupeState,
} from './system-alerts.js';

export const CRON_RECOVERY_POLICY_VERSION = 'b-cron-missed-catchup/v1';
export const CRON_RECOVERY_ACTOR = 'cron-recovery';

export type CronOccurrenceStatus =
  | 'claimed'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'indeterminate';

export interface CronOccurrenceRow {
  id: string;
  jobName: string;
  scheduledFor: Date;
  firstSource: CronOccurrenceSource;
  policyVersion: string;
  status: CronOccurrenceStatus;
  claimedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lagMs: number;
  reason: string | null;
  errorMessage: string | null;
  attemptId: string | null;
  ownerInstanceId: string | null;
  metadata: Record<string, unknown>;
}

export interface ClaimOccurrenceInput {
  jobName: string;
  scheduledFor: Date;
  source: CronOccurrenceSource;
  policyVersion: string;
  status: 'claimed' | 'skipped';
  claimedAt: Date;
  completedAt?: Date;
  lagMs: number;
  reason?: string;
  ownerInstanceId: string;
  metadata?: Record<string, unknown>;
}

export interface LockedOccurrenceStore {
  claim(input: ClaimOccurrenceInput): Promise<{ inserted: boolean; row: CronOccurrenceRow }>;
  markRunning(id: string, startedAt: Date, attemptId: string, ownerInstanceId: string): Promise<CronOccurrenceRow>;
  markSkipped(id: string, completedAt: Date, reason: string, metadata?: Record<string, unknown>): Promise<CronOccurrenceRow>;
  markTerminal(
    id: string,
    status: 'succeeded' | 'failed',
    completedAt: Date,
    errorMessage: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<CronOccurrenceRow>;
  markIndeterminate(
    id: string,
    completedAt: Date,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<CronOccurrenceRow>;
  reconcileRunning(jobName: string, currentOwner: string, at: Date): Promise<CronOccurrenceRow[]>;
  loadPendingDecisionAlerts(jobName: string): Promise<CronOccurrenceRow[]>;
  markDecisionAlertPersisted(id: string, persistedAt: Date): Promise<CronOccurrenceRow>;
  loadPendingStaleResolves(jobName: string): Promise<CronOccurrenceRow[]>;
  markStaleResolvePersisted(
    id: string,
    persistedAt: Date,
    outcome: 'resolved_open_alert' | 'already_resolved_alert' | 'no_open_alert',
  ): Promise<CronOccurrenceRow>;
  loadClaimed(jobName: string): Promise<CronOccurrenceRow[]>;
}

export interface OccurrenceStore {
  withJobLock<T>(
    jobName: string,
    run: (store: LockedOccurrenceStore) => Promise<T>,
  ): Promise<{ acquired: false } | { acquired: true; value: T }>;
  find(jobName: string, scheduledFor: Date): Promise<CronOccurrenceRow | undefined>;
}

interface DbOccurrenceRow {
  id: string;
  job_name: string;
  scheduled_for: Date | string;
  first_source: CronOccurrenceSource;
  policy_version: string;
  status: CronOccurrenceStatus;
  claimed_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  lag_ms: number | string;
  reason: string | null;
  error_message: string | null;
  attempt_id: string | null;
  owner_instance_id: string | null;
  metadata: Record<string, unknown> | null;
}

function asDate(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value);
}

function mapDbRow(row: DbOccurrenceRow): CronOccurrenceRow {
  return {
    id: row.id,
    jobName: row.job_name,
    scheduledFor: asDate(row.scheduled_for)!,
    firstSource: row.first_source,
    policyVersion: row.policy_version,
    status: row.status,
    claimedAt: asDate(row.claimed_at)!,
    startedAt: asDate(row.started_at),
    completedAt: asDate(row.completed_at),
    lagMs: Number(row.lag_ms),
    reason: row.reason,
    errorMessage: row.error_message,
    attemptId: row.attempt_id,
    ownerInstanceId: row.owner_instance_id,
    metadata: row.metadata ?? {},
  };
}

const ROW_COLUMNS = `
  id, job_name, scheduled_for, first_source, policy_version, status,
  claimed_at, started_at, completed_at, lag_ms, reason, error_message,
  attempt_id, owner_instance_id, metadata
`;

class PgLockedOccurrenceStore implements LockedOccurrenceStore {
  constructor(private readonly client: PoolClient) {}

  async claim(input: ClaimOccurrenceInput): Promise<{ inserted: boolean; row: CronOccurrenceRow }> {
    const inserted = await this.client.query<DbOccurrenceRow>(`
      INSERT INTO scheduled_job_occurrences (
        job_name, scheduled_for, first_source, policy_version, status,
        claimed_at, completed_at, lag_ms, reason, owner_instance_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (job_name, scheduled_for) DO NOTHING
      RETURNING ${ROW_COLUMNS}
    `, [
      input.jobName,
      input.scheduledFor,
      input.source,
      input.policyVersion,
      input.status,
      input.claimedAt,
      input.completedAt ?? null,
      input.lagMs,
      input.reason ?? null,
      input.ownerInstanceId,
      JSON.stringify(input.metadata ?? {}),
    ]);
    if (inserted.rows[0]) return { inserted: true, row: mapDbRow(inserted.rows[0]) };

    const existing = await this.client.query<DbOccurrenceRow>(`
      SELECT ${ROW_COLUMNS}
        FROM scheduled_job_occurrences
       WHERE job_name = $1 AND scheduled_for = $2
    `, [input.jobName, input.scheduledFor]);
    if (!existing.rows[0]) {
      throw new Error(`occurrence conflict read vanished for ${input.jobName}/${input.scheduledFor.toISOString()}`);
    }
    return { inserted: false, row: mapDbRow(existing.rows[0]) };
  }

  async markRunning(id: string, startedAt: Date, attemptId: string, ownerInstanceId: string): Promise<CronOccurrenceRow> {
    const result = await this.client.query<DbOccurrenceRow>(`
      UPDATE scheduled_job_occurrences
         SET status = 'running', started_at = $2, attempt_id = $3, owner_instance_id = $4
       WHERE id = $1 AND status = 'claimed' AND started_at IS NULL
       RETURNING ${ROW_COLUMNS}
    `, [id, startedAt, attemptId, ownerInstanceId]);
    if (!result.rows[0]) throw new Error(`occurrence ${id} was not claimable`);
    return mapDbRow(result.rows[0]);
  }

  async markSkipped(
    id: string,
    completedAt: Date,
    reason: string,
    metadata: Record<string, unknown> = {},
  ): Promise<CronOccurrenceRow> {
    const result = await this.client.query<DbOccurrenceRow>(`
      UPDATE scheduled_job_occurrences
         SET status = 'skipped', completed_at = $2, reason = $3,
             metadata = metadata || $4::jsonb
       WHERE id = $1 AND status = 'claimed' AND started_at IS NULL
       RETURNING ${ROW_COLUMNS}
    `, [id, completedAt, reason, JSON.stringify(metadata)]);
    if (!result.rows[0]) throw new Error(`occurrence ${id} could not be skipped from claimed`);
    return mapDbRow(result.rows[0]);
  }

  async markTerminal(
    id: string,
    status: 'succeeded' | 'failed',
    completedAt: Date,
    errorMessage: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<CronOccurrenceRow> {
    const result = await this.client.query<DbOccurrenceRow>(`
      UPDATE scheduled_job_occurrences
         SET status = $2, completed_at = $3, error_message = $4,
             metadata = metadata || $5::jsonb
       WHERE id = $1 AND status = 'running' AND started_at IS NOT NULL
       RETURNING ${ROW_COLUMNS}
    `, [id, status, completedAt, errorMessage, JSON.stringify(metadata)]);
    if (!result.rows[0]) throw new Error(`occurrence ${id} could not terminalize from running`);
    return mapDbRow(result.rows[0]);
  }

  async markIndeterminate(
    id: string,
    completedAt: Date,
    reason: string,
    metadata: Record<string, unknown> = {},
  ): Promise<CronOccurrenceRow> {
    const result = await this.client.query<DbOccurrenceRow>(`
      UPDATE scheduled_job_occurrences
         SET status = 'indeterminate', completed_at = $2, reason = $3,
             metadata = metadata || $4::jsonb || '{"decision_alert_pending":true}'::jsonb
       WHERE id = $1 AND status = 'running' AND started_at IS NOT NULL
       RETURNING ${ROW_COLUMNS}
    `, [id, completedAt, reason, JSON.stringify(metadata)]);
    if (!result.rows[0]) throw new Error(`occurrence ${id} could not become indeterminate from running`);
    return mapDbRow(result.rows[0]);
  }

  async reconcileRunning(jobName: string, currentOwner: string, at: Date): Promise<CronOccurrenceRow[]> {
    const result = await this.client.query<DbOccurrenceRow>(`
      UPDATE scheduled_job_occurrences
         SET status = 'indeterminate', completed_at = $3,
             reason = 'prior_process_died_after_start',
             metadata = metadata || jsonb_build_object(
               'reconciled_by_owner_instance_id', $2::text,
               'decision_alert_pending', true
             )
       WHERE job_name = $1 AND status = 'running'
         AND owner_instance_id IS DISTINCT FROM $2::uuid
       RETURNING ${ROW_COLUMNS}
    `, [jobName, currentOwner, at]);
    return result.rows.map(mapDbRow);
  }

  async loadPendingDecisionAlerts(jobName: string): Promise<CronOccurrenceRow[]> {
    const result = await this.client.query<DbOccurrenceRow>(`
      SELECT ${ROW_COLUMNS}
        FROM scheduled_job_occurrences
       WHERE job_name = $1 AND status = 'indeterminate'
         AND metadata @> '{"decision_alert_pending":true}'::jsonb
       ORDER BY scheduled_for ASC
    `, [jobName]);
    return result.rows.map(mapDbRow);
  }

  async markDecisionAlertPersisted(id: string, persistedAt: Date): Promise<CronOccurrenceRow> {
    const result = await this.client.query<DbOccurrenceRow>(`
      UPDATE scheduled_job_occurrences
         SET metadata = (metadata - 'decision_alert_pending')
           || jsonb_build_object('decision_alert_persisted_at', $2::text)
       WHERE id = $1 AND status = 'indeterminate'
         AND metadata @> '{"decision_alert_pending":true}'::jsonb
       RETURNING ${ROW_COLUMNS}
    `, [id, persistedAt.toISOString()]);
    if (!result.rows[0]) throw new Error(`occurrence ${id} has no pending decision alert`);
    return mapDbRow(result.rows[0]);
  }

  async loadPendingStaleResolves(jobName: string): Promise<CronOccurrenceRow[]> {
    const result = await this.client.query<DbOccurrenceRow>(`
      SELECT ${ROW_COLUMNS}
        FROM scheduled_job_occurrences
       WHERE job_name = $1 AND status = 'succeeded'
         AND metadata @> '{"stale_resolve_pending":true}'::jsonb
       ORDER BY scheduled_for ASC
    `, [jobName]);
    return result.rows.map(mapDbRow);
  }

  async markStaleResolvePersisted(
    id: string,
    persistedAt: Date,
    outcome: 'resolved_open_alert' | 'already_resolved_alert' | 'no_open_alert',
  ): Promise<CronOccurrenceRow> {
    const result = await this.client.query<DbOccurrenceRow>(`
      UPDATE scheduled_job_occurrences
         SET metadata = (metadata - 'stale_resolve_pending')
           || jsonb_build_object(
             'stale_resolve_persisted_at', $2::text,
             'stale_resolve_outcome', $3::text
           )
       WHERE id = $1 AND status = 'succeeded'
         AND metadata @> '{"stale_resolve_pending":true}'::jsonb
       RETURNING ${ROW_COLUMNS}
    `, [id, persistedAt.toISOString(), outcome]);
    if (!result.rows[0]) throw new Error(`occurrence ${id} has no pending stale resolve`);
    return mapDbRow(result.rows[0]);
  }

  async loadClaimed(jobName: string): Promise<CronOccurrenceRow[]> {
    const result = await this.client.query<DbOccurrenceRow>(`
      SELECT ${ROW_COLUMNS}
        FROM scheduled_job_occurrences
       WHERE job_name = $1 AND status = 'claimed' AND started_at IS NULL
       ORDER BY scheduled_for ASC
    `, [jobName]);
    return result.rows.map(mapDbRow);
  }
}

export class PgOccurrenceStore implements OccurrenceStore {
  async find(jobName: string, scheduledFor: Date): Promise<CronOccurrenceRow | undefined> {
    const result = await pool.query<DbOccurrenceRow>(`
      SELECT ${ROW_COLUMNS}
        FROM scheduled_job_occurrences
       WHERE job_name = $1 AND scheduled_for = $2
    `, [jobName, scheduledFor]);
    return result.rows[0] ? mapDbRow(result.rows[0]) : undefined;
  }

  async withJobLock<T>(
    jobName: string,
    run: (store: LockedOccurrenceStore) => Promise<T>,
  ): Promise<{ acquired: false } | { acquired: true; value: T }> {
    const client = await pool.connect();
    const lockKey = `dawntrader:cron-job:${jobName}`;
    let acquired = false;
    try {
      const lock = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [lockKey],
      );
      acquired = lock.rows[0]?.acquired === true;
      if (!acquired) return { acquired: false };
      const value = await run(new PgLockedOccurrenceStore(client));
      return { acquired: true, value };
    } finally {
      let releaseFailure: Error | undefined;
      if (acquired) {
        try {
          const unlock = await client.query<{ released: boolean }>(
            'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released',
            [lockKey],
          );
          if (unlock.rows[0]?.released !== true) {
            throw new Error('advisory unlock returned false');
          }
        } catch (err) {
          console.error(`[CRON-RECOVERY][ADVISORY_UNLOCK_FAIL] job=${jobName}:`, err);
          releaseFailure = err instanceof Error ? err : new Error(String(err));
        }
      }
      if (releaseFailure) {
        client.release(releaseFailure);
        throw releaseFailure;
      }
      client.release();
    }
  }
}

export interface CronOccurrenceResult {
  jobName: string;
  scheduledFor: Date;
  status: CronOccurrenceStatus | 'duplicate' | 'claim_unavailable' | 'invalid_boundary';
  occurrenceId?: string;
  completedAt?: Date;
  reason?: string;
}

type ScheduledLaneItem = {
  kind: 'scheduled';
  jobName: string;
  scheduledFor: Date;
  source: CronOccurrenceSource;
  resumeClaimed: boolean;
  resolve: (result: CronOccurrenceResult) => void;
  reject: (error: unknown) => void;
};

type AuxiliaryLaneItem<T = unknown> = {
  kind: 'auxiliary';
  jobName: string;
  source: CronAuxiliarySource;
  invocationId: string;
  run: () => Promise<T>;
  resolve: (result: T) => void;
  reject: (error: unknown) => void;
};

type LaneItem = ScheduledLaneItem | AuxiliaryLaneItem;
type Lane = { queue: LaneItem[]; draining: boolean };

class AuxiliaryCallbackFailure {
  constructor(readonly error: unknown) {}
}

export interface CronOccurrenceRunnerDeps {
  store: OccurrenceStore;
  getJob: (name: string) => RegisteredCronJob | undefined;
  writeFireRow: typeof scheduledJobsAudit.writeFireRow;
  addAlert: typeof addAlert;
  resolveByKey: typeof resolveAlertsByDedupeKey;
  dedupeStateByKey: (dedupeKey: string) => AlertDedupeState;
  now?: () => Date;
  randomUUID?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

const POLICY_MAX_LAG_MS: Readonly<Record<CronRecoveryPolicyKey, number>> = {
  formula_audit_cron: 6 * 60 * 60_000,
  feed_integrity_cron: 4 * 60_000,
  awareness_state_update_cron: 30 * 60_000,
  awareness_reflection_cron: 60 * 60_000,
  xstock_qd_probe_cron: 30_000,
  xstock_universe_discovery_cron: 4 * 60 * 60_000,
};

export class CronOccurrenceRunner {
  readonly ownerInstanceId: string;
  private readonly lanes = new Map<string, Lane>();
  private readonly preparations = new Map<string, Promise<void>>();
  private readonly stoppedLanes = new Map<string, Error>();
  private readonly now: () => Date;
  private readonly randomUUID: () => string;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: CronOccurrenceRunnerDeps) {
    this.now = deps.now ?? (() => new Date());
    this.randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
    this.sleep = deps.sleep ?? ((ms) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms)));
    this.ownerInstanceId = this.randomUUID();
  }

  private stoppedError(jobName: string): Error | undefined {
    return this.stoppedLanes.get(jobName);
  }

  private stopLane(jobName: string, phase: string, cause: unknown): Error {
    const existing = this.stoppedError(jobName);
    if (existing) return existing;
    const detail = cause instanceof Error ? cause.message : String(cause);
    const error = new Error(`[CRON-RECOVERY][LANE_STOPPED] job=${jobName} phase=${phase} cause=${detail}`);
    this.stoppedLanes.set(jobName, error);
    console.error(error.message);
    return error;
  }

  private assertLaneRunning(jobName: string): void {
    const stopped = this.stoppedError(jobName);
    if (stopped) throw stopped;
  }

  private async retryContention(jobName: string, phase: string, attempt: number): Promise<void> {
    if (attempt === 1 || attempt % 20 === 0) {
      console.warn(
        `[CRON-RECOVERY][LOCK_DEFERRED] job=${jobName} phase=${phase} attempt=${attempt} advisory lock unavailable`,
      );
    }
    await this.sleep(250);
    this.assertLaneRunning(jobName);
  }

  private lane(jobName: string): Lane {
    let lane = this.lanes.get(jobName);
    if (!lane) {
      lane = { queue: [], draining: false };
      this.lanes.set(jobName, lane);
    }
    return lane;
  }

  private enqueue(item: LaneItem): void {
    const lane = this.lane(item.jobName);
    lane.queue.push(item);
    if (item.kind === 'scheduled') {
      const scheduledIndexes = lane.queue
        .map((queued, index) => queued.kind === 'scheduled' ? index : -1)
        .filter((index) => index >= 0);
      const orderedScheduled = scheduledIndexes
        .map((index) => lane.queue[index] as ScheduledLaneItem)
        .sort((left, right) => left.scheduledFor.getTime() - right.scheduledFor.getTime());
      scheduledIndexes.forEach((index, orderedIndex) => {
        lane.queue[index] = orderedScheduled[orderedIndex];
      });
    }
    // node-cron emits every missed event synchronously but does not await its
    // listeners. Deferring the drain one microtask lets the complete burst enter
    // the queue so backlog-cap decisions can see the whole burst.
    if (!lane.draining) queueMicrotask(() => void this.drain(item.jobName));
  }

  private async drain(jobName: string): Promise<void> {
    const lane = this.lane(jobName);
    if (lane.draining) return;
    lane.draining = true;
    try {
      while (lane.queue.length > 0) {
        const item = lane.queue.shift()!;
        try {
          this.assertLaneRunning(jobName);
          if (item.kind === 'scheduled') {
            item.resolve(await this.executeScheduled(item, lane));
          } else {
            item.resolve(await this.executeAuxiliary(item));
          }
        } catch (err) {
          item.reject(err);
        }
      }
    } finally {
      lane.draining = false;
      if (lane.queue.length > 0) queueMicrotask(() => void this.drain(jobName));
    }
  }

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
    const roundTrip = computeNextFire(
      job.expression,
      job.timezone,
      new Date(scheduledFor.getTime() - 1),
    );
    if (!roundTrip || roundTrip.getTime() !== scheduledFor.getTime()) {
      return this.invalidBoundary(jobName, advancedEventDate, 'previous_boundary_not_on_schedule');
    }
    return this.enqueueScheduled(jobName, scheduledFor, 'missed_catchup', false);
  }

  dispatchMissed(jobName: string, advancedEventDate: Date): void {
    void this.runMissed(jobName, advancedEventDate).catch((err) => {
      console.error(`[CRON-RECOVERY][MISSED_DISPATCH_FAIL] job=${jobName}:`, err);
    });
  }

  async runAuxiliary<T>(jobName: string, source: CronAuxiliarySource, run: () => Promise<T>): Promise<T> {
    await this.prepareJob(jobName);
    return new Promise<T>((resolve, reject) => {
      this.enqueue({
        kind: 'auxiliary',
        jobName,
        source,
        invocationId: this.randomUUID(),
        run,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
  }

  /**
   * Run the independent fire-evidence verifier under the same cross-process
   * advisory lock as execution, without inheriting this process's permanently
   * stopped execution lane. A lock/session failure rejects this pass but does
   * not poison the next verifier pass; advisory-lock contention remains
   * retryable and callback failures remain distinguishable from lock failures.
   */
  async runVerifierLocked<T>(jobName: string, run: () => Promise<T>): Promise<T> {
    let contentionAttempt = 0;
    while (true) {
      let locked: { acquired: false } | { acquired: true; value: T };
      try {
        locked = await this.deps.store.withJobLock(jobName, async (store) => {
          await this.persistPendingDecisionAlerts(store, jobName);
          await this.persistPendingStaleResolves(store, jobName);
          try {
            return await run();
          } catch (err) {
            throw new AuxiliaryCallbackFailure(err);
          }
        });
      } catch (err) {
        if (err instanceof AuxiliaryCallbackFailure) throw err.error;
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          `[CRON-RECOVERY][VERIFIER_LOCK_SESSION_FAIL] job=${jobName} cause=${detail}`,
        );
      }
      if (locked.acquired) return locked.value;
      contentionAttempt += 1;
      if (contentionAttempt === 1 || contentionAttempt % 20 === 0) {
        console.warn(
          `[CRON-RECOVERY][VERIFIER_LOCK_DEFERRED] job=${jobName} attempt=${contentionAttempt} advisory lock unavailable`,
        );
      }
      await this.sleep(250);
    }
  }

  private enqueueScheduled(
    jobName: string,
    scheduledFor: Date,
    source: CronOccurrenceSource,
    resumeClaimed: boolean,
  ): Promise<CronOccurrenceResult> {
    return new Promise<CronOccurrenceResult>((resolve, reject) => {
      this.enqueue({ kind: 'scheduled', jobName, scheduledFor, source, resumeClaimed, resolve, reject });
    });
  }

  private hasNewerMissed(lane: Lane, scheduledFor: Date): boolean {
    return lane.queue.some((queued) =>
      queued.kind === 'scheduled'
      && queued.source === 'missed_catchup'
      && queued.scheduledFor.getTime() > scheduledFor.getTime());
  }

  private evaluatePolicy(
    job: RegisteredCronJob,
    item: ScheduledLaneItem,
    lane: Lane,
    now: Date,
  ): { eligible: true; lagMs: number } | { eligible: false; lagMs: number; reason: string } {
    const lagMs = Math.max(0, now.getTime() - item.scheduledFor.getTime());
    if (item.source === 'natural') return { eligible: true, lagMs };
    if (this.hasNewerMissed(lane, item.scheduledFor)) {
      return { eligible: false, lagMs, reason: 'backlog_cap' };
    }
    const policyKey = job.recovery!.policyKey;
    if (lagMs > POLICY_MAX_LAG_MS[policyKey]) {
      return {
        eligible: false,
        lagMs,
        reason: policyKey === 'xstock_qd_probe_cron' ? 'historical_inputs_unreconstructable' : 'too_old',
      };
    }
    if (policyKey === 'feed_integrity_cron' || policyKey === 'xstock_qd_probe_cron') {
      const nextBoundary = computeNextFire(job.expression, job.timezone, item.scheduledFor);
      if (!nextBoundary || nextBoundary.getTime() <= now.getTime()) {
        return { eligible: false, lagMs, reason: 'next_boundary_imminent' };
      }
      if (policyKey === 'feed_integrity_cron' && nextBoundary.getTime() - now.getTime() <= 30_000) {
        return { eligible: false, lagMs, reason: 'next_boundary_imminent' };
      }
    }
    if (policyKey === 'xstock_universe_discovery_cron') {
      const nextRegularOpen = computeNextFire('30 9 * * 1-5', 'America/New_York', now);
      if (!nextRegularOpen || nextRegularOpen.getTime() - now.getTime() <= 30 * 60_000) {
        return { eligible: false, lagMs, reason: 'market_guard' };
      }
    }
    return { eligible: true, lagMs };
  }

  private async executeScheduled(item: ScheduledLaneItem, lane: Lane): Promise<CronOccurrenceResult> {
    const job = this.deps.getJob(item.jobName);
    if (!job?.recovery) {
      return this.invalidBoundary(item.jobName, item.scheduledFor, 'recovery_registration_missing');
    }
    const recovery = job.recovery;
    let contentionAttempt = 0;
    let result: CronOccurrenceResult;
    while (true) {
      this.assertLaneRunning(item.jobName);
      let locked: { acquired: false } | { acquired: true; value: CronOccurrenceResult };
      try {
        locked = await this.deps.store.withJobLock<CronOccurrenceResult>(item.jobName, async (store) => {
          await this.persistPendingDecisionAlerts(store, item.jobName);
          await this.persistPendingStaleResolves(store, item.jobName);
          const decisionAt = this.now();
          let policy = this.evaluatePolicy(job, item, lane, decisionAt);
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

        if (
          !claim.inserted
          && claim.row.status === 'running'
          && claim.row.ownerInstanceId !== this.ownerInstanceId
        ) {
          const abandoned = await store.markIndeterminate(
            claim.row.id,
            decisionAt,
            'prior_process_died_after_start',
            { reconciled_by_owner_instance_id: this.ownerInstanceId },
          );
          return {
            jobName: item.jobName,
            scheduledFor: item.scheduledFor,
            status: 'indeterminate' as const,
            occurrenceId: abandoned.id,
            completedAt: abandoned.completedAt ?? decisionAt,
            reason: abandoned.reason ?? 'prior_process_died_after_start',
          };
        }

        const resumeClaimed = claim.row.status === 'claimed'
          && (item.resumeClaimed || claim.row.ownerInstanceId !== this.ownerInstanceId);
        if (!claim.inserted && !resumeClaimed) {
          return {
            jobName: item.jobName,
            scheduledFor: item.scheduledFor,
            status: 'duplicate' as const,
            occurrenceId: claim.row.id,
            reason: claim.row.status,
          };
        }
        if (!policy.eligible) {
          if (!claim.inserted && claim.row.status === 'claimed') {
            await store.markSkipped(claim.row.id, decisionAt, policy.reason, { resumed_claim: true });
          }
          return {
            jobName: item.jobName,
            scheduledFor: item.scheduledFor,
            status: 'skipped' as const,
            occurrenceId: claim.row.id,
            completedAt: decisionAt,
            reason: policy.reason,
          };
        }

        let beforeMeta: Record<string, unknown> = {};
        if (recovery.beforeRun) {
          try {
            beforeMeta = (await recovery.beforeRun(item.source)) ?? {};
          } catch (err) {
            const reason = 'before_run_failed';
            const skippedAt = this.now();
            await store.markSkipped(claim.row.id, skippedAt, reason, {
              error: err instanceof Error ? err.message : String(err),
            });
            return {
              jobName: item.jobName,
              scheduledFor: item.scheduledFor,
              status: 'skipped' as const,
              occurrenceId: claim.row.id,
              completedAt: skippedAt,
              reason,
            };
          }
        }

        const firedAt = this.now();
        const startPolicy = this.evaluatePolicy(job, item, lane, firedAt);
        if (!startPolicy.eligible) {
          await store.markSkipped(claim.row.id, firedAt, startPolicy.reason, {
            rechecked_before_start: true,
            initial_lag_ms: policy.lagMs,
          });
          return {
            jobName: item.jobName,
            scheduledFor: item.scheduledFor,
            status: 'skipped' as const,
            occurrenceId: claim.row.id,
            completedAt: firedAt,
            reason: startPolicy.reason,
          };
        }
        policy = startPolicy;
        const attemptId = this.randomUUID();
        await store.markRunning(claim.row.id, firedAt, attemptId, this.ownerInstanceId);
        let status: 'succeeded' | 'failed' = 'succeeded';
        let errorMessage: string | null = null;
        let resultMeta: Record<string, unknown> = {};
        try {
          resultMeta = (await recovery.run({
            scheduledFor: item.scheduledFor,
            firedAt,
            triggerSource: item.source === 'natural' ? 'cron' : 'missed_catchup',
            occurrenceId: claim.row.id,
            policyVersion: CRON_RECOVERY_POLICY_VERSION,
          }))?.meta ?? {};
        } catch (err) {
          status = 'failed';
          errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[CRON-RECOVERY][CORE_FAIL] job=${item.jobName} occurrence=${claim.row.id}:`, err);
        }

        const completedAt = this.now();
        try {
          await this.deps.writeFireRow({
            jobName: item.jobName,
            scheduledFor: item.scheduledFor,
            firedAt,
            status: status === 'succeeded' ? 'success' : 'error',
            errorMessage: errorMessage ?? undefined,
            meta: {
              trigger_source: item.source === 'natural' ? 'cron' : 'missed_catchup',
              duration_ms: completedAt.getTime() - firedAt.getTime(),
              occurrence_id: claim.row.id,
              lag_ms: policy.lagMs,
              policy_version: CRON_RECOVERY_POLICY_VERSION,
              ...beforeMeta,
              ...resultMeta,
            },
          });
        } catch (err) {
          // The production writer is failure-safe by contract. Keep the runner
          // correct even if a future implementation violates that contract:
          // fire evidence is observability, never the durable execution claim.
          console.error(`[CRON-RECOVERY][AUDIT_WRITE_FAIL] job=${item.jobName} occurrence=${claim.row.id}:`, err);
        }

        try {
          await store.markTerminal(claim.row.id, status, completedAt, errorMessage, {
            ...beforeMeta,
            ...resultMeta,
            ...(status === 'succeeded' ? { stale_resolve_pending: true } : {}),
          });
        } catch (err) {
          const reason = `terminal_write_failed:${err instanceof Error ? err.message : String(err)}`;
          try {
            await store.markIndeterminate(claim.row.id, completedAt, reason, {
              ...beforeMeta,
              ...resultMeta,
            });
          } catch (indeterminateErr) {
            console.error(
              `[CRON-RECOVERY][INDETERMINATE_WRITE_FAIL] job=${item.jobName} occurrence=${claim.row.id}:`,
              indeterminateErr,
            );
          }
          return {
            jobName: item.jobName,
            scheduledFor: item.scheduledFor,
            status: 'indeterminate' as const,
            occurrenceId: claim.row.id,
            completedAt,
            reason,
          };
        }

        return {
          jobName: item.jobName,
          scheduledFor: item.scheduledFor,
          status,
          occurrenceId: claim.row.id,
          completedAt,
          reason: errorMessage ?? undefined,
        };
        });
      } catch (err) {
        this.stopLane(item.jobName, 'scheduled_lock_or_admission', err);
        const unavailable: CronOccurrenceResult = {
          jobName: item.jobName,
          scheduledFor: item.scheduledFor,
          status: 'claim_unavailable',
          reason: err instanceof Error ? err.message : String(err),
        };
        await this.emitDecisionAlert(unavailable);
        return unavailable;
      }

      if (locked.acquired) {
        result = locked.value;
        break;
      }

      try {
        const existing = await this.deps.store.find(item.jobName, item.scheduledFor);
        if (existing) {
          if (existing.status !== 'claimed' && existing.status !== 'running') {
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
        }
      } catch (err) {
        throw this.stopLane(item.jobName, 'contended_identity_read', err);
      }
      contentionAttempt += 1;
      await this.retryContention(item.jobName, 'scheduled_admission', contentionAttempt);
    }

    if (result.status === 'succeeded' && result.occurrenceId) {
      await this.flushPendingStaleResolves(result.jobName);
    } else if (result.status === 'indeterminate') {
      try {
        await this.flushPendingDecisionAlerts(result.jobName);
      } catch (err) {
        console.error(
          `[CRON-RECOVERY][INDETERMINATE_ALERT_PENDING] job=${result.jobName} occurrence=${result.occurrenceId}:`,
          err,
        );
      }
    } else if (result.status === 'failed' || result.status === 'skipped') {
      await this.emitDecisionAlert(result);
    }
    return result;
  }

  private async executeAuxiliary<T>(item: AuxiliaryLaneItem<T>): Promise<T> {
    let contentionAttempt = 0;
    while (true) {
      this.assertLaneRunning(item.jobName);
      let locked: { acquired: false } | { acquired: true; value: T };
      try {
        locked = await this.deps.store.withJobLock(item.jobName, async (store) => {
          await this.persistPendingDecisionAlerts(store, item.jobName);
          await this.persistPendingStaleResolves(store, item.jobName);
          try {
            return await item.run();
          } catch (err) {
            throw new AuxiliaryCallbackFailure(err);
          }
        });
      } catch (err) {
        if (err instanceof AuxiliaryCallbackFailure) throw err.error;
        throw this.stopLane(item.jobName, 'auxiliary_lock_session', err);
      }
      if (locked.acquired) return locked.value;
      contentionAttempt += 1;
      await this.retryContention(item.jobName, `auxiliary_${item.source}`, contentionAttempt);
    }
  }

  async prepareJob(jobName: string): Promise<void> {
    let preparation = this.preparations.get(jobName);
    if (!preparation) {
      preparation = this.performReconciliation(jobName);
      this.preparations.set(jobName, preparation);
    }
    return preparation;
  }

  async reconcileJob(jobName: string): Promise<void> {
    return this.prepareJob(jobName);
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
        locked = await this.deps.store.withJobLock(jobName, async (store) => {
          await store.reconcileRunning(jobName, this.ownerInstanceId, at);
          const indeterminate = await this.persistPendingDecisionAlerts(store, jobName);
          await this.persistPendingStaleResolves(store, jobName);
          return {
            indeterminate,
            claimed: await store.loadClaimed(jobName),
          };
        });
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

    for (const row of reconciled.claimed) {
      void this.enqueueScheduled(jobName, row.scheduledFor, 'missed_catchup', true).catch((err) => {
        console.error(`[CRON-RECOVERY][CLAIMED_RESUME_FAIL] job=${jobName} occurrence=${row.id}:`, err);
      });
    }
  }

  private async persistPendingDecisionAlerts(
    store: LockedOccurrenceStore,
    jobName: string,
  ): Promise<CronOccurrenceRow[]> {
    const pending = await store.loadPendingDecisionAlerts(jobName);
    for (const row of pending) {
      await this.persistDecisionAlert({
        jobName,
        scheduledFor: row.scheduledFor,
        status: 'indeterminate',
        occurrenceId: row.id,
        reason: row.reason ?? 'prior_process_died_after_start',
      });
      await store.markDecisionAlertPersisted(row.id, this.now());
    }
    return pending;
  }

  private async flushPendingDecisionAlerts(jobName: string): Promise<void> {
    let contentionAttempt = 0;
    while (true) {
      this.assertLaneRunning(jobName);
      let locked: { acquired: false } | { acquired: true; value: void };
      try {
        locked = await this.deps.store.withJobLock(jobName, async (store) => {
          await this.persistPendingDecisionAlerts(store, jobName);
        });
      } catch (err) {
        throw this.stopLane(jobName, 'indeterminate_alert_persistence', err);
      }
      if (locked.acquired) return;
      contentionAttempt += 1;
      await this.retryContention(jobName, 'indeterminate_alert_persistence', contentionAttempt);
    }
  }

  private async persistPendingStaleResolves(
    store: LockedOccurrenceStore,
    jobName: string,
  ): Promise<CronOccurrenceRow[]> {
    const pending = await store.loadPendingStaleResolves(jobName);
    for (const row of pending) {
      const key = `cron_stale:${row.jobName}:${row.scheduledFor.toISOString()}`;
      const evidence =
        `cron occurrence ${row.id} policy ${row.policyVersion} `
        + `terminal ${row.completedAt!.toISOString()}`;
      try {
        const resolved = await this.deps.resolveByKey(
          key,
          CRON_RECOVERY_ACTOR,
          evidence,
          'engine',
        );
        let outcome: 'resolved_open_alert' | 'already_resolved_alert' | 'no_open_alert';
        if (resolved.length > 0) {
          outcome = 'resolved_open_alert';
        } else {
          const alertState = this.deps.dedupeStateByKey(key);
          if (alertState === 'nonterminal') {
            // Fail closed if the resolver ever reports no IDs while a live row
            // still exists. Keep the durable carrier for the next lock holder.
            console.warn(
              `[CRON-RECOVERY][STALE_RESOLVE_INCOMPLETE] job=${row.jobName} occurrence=${row.id} key=${key}`,
            );
            continue;
          }
          outcome = alertState === 'resolved' ? 'already_resolved_alert' : 'no_open_alert';
        }
        // The verifier's final history read and alert write use this same
        // per-job advisory lock. Therefore an absent alert is terminal, while
        // a resolved row preserves the truth of an earlier successful attempt.
        await store.markStaleResolvePersisted(
          row.id,
          this.now(),
          outcome,
        );
      } catch (err) {
        // Alert-store I/O never rewrites a completed occurrence into failure.
        // Keeping the marker makes the next scheduled/auxiliary holder retry.
        console.error(
          `[CRON-RECOVERY][STALE_RESOLVE_FAIL] job=${row.jobName} occurrence=${row.id}:`,
          err,
        );
      }
    }
    return pending;
  }

  private async flushPendingStaleResolves(jobName: string): Promise<void> {
    try {
      const locked = await this.deps.store.withJobLock(jobName, async (store) => {
        await this.persistPendingStaleResolves(store, jobName);
      });
      if (!locked.acquired) {
        console.warn(`[CRON-RECOVERY][STALE_RESOLVE_DEFERRED] job=${jobName} advisory lock unavailable`);
      }
    } catch (err) {
      console.error(`[CRON-RECOVERY][STALE_RESOLVE_RETRY_FAIL] job=${jobName}:`, err);
    }
  }

  dispatchReconciliation(jobName: string): void {
    void this.prepareJob(jobName).catch((err) => {
      console.error(`[CRON-RECOVERY][RECONCILE_FAIL] job=${jobName}:`, err);
    });
  }

  private async invalidBoundary(jobName: string, at: Date, reason: string): Promise<CronOccurrenceResult> {
    const result: CronOccurrenceResult = {
      jobName,
      scheduledFor: at,
      status: 'invalid_boundary',
      reason,
    };
    await this.emitDecisionAlert(result);
    return result;
  }

  private async emitDecisionAlert(result: CronOccurrenceResult): Promise<void> {
    const identity = `${result.jobName}:${result.scheduledFor.toISOString()}`;
    try {
      await this.persistDecisionAlert(result);
    } catch (err) {
      console.error(`[CRON-RECOVERY][ALERT_WRITE_FAIL] identity=${identity} status=${result.status}:`, err);
    }
  }

  private async persistDecisionAlert(result: CronOccurrenceResult): Promise<void> {
    const identity = `${result.jobName}:${result.scheduledFor.toISOString()}`;
    await this.deps.addAlert({
      triggers_at: this.now(),
      category: 'breakage',
      severity: result.status === 'indeterminate' ? 'critical' : 'warning',
      dedupe_key: `cron_recovery:${result.status}:${identity}`,
      title: `Scheduled recovery ${result.status}: ${result.jobName}`,
      body:
        `B-CRON-MISSED-CATCHUP recorded ${result.status} for ${identity}. `
        + `No acknowledgement was performed. Inspect the durable occurrence before any manual retry.`,
      metadata: {
        batch: 'B-CRON-MISSED-CATCHUP',
        job_name: result.jobName,
        scheduled_for: result.scheduledFor.toISOString(),
        occurrence_id: result.occurrenceId ?? null,
        status: result.status,
        reason: result.reason ?? null,
        policy_version: CRON_RECOVERY_POLICY_VERSION,
        owner_instance_id: this.ownerInstanceId,
      },
    });
  }
}

export const cronOccurrenceRunner = new CronOccurrenceRunner({
  store: new PgOccurrenceStore(),
  getJob: (name) => cronRegistry.get(name),
  writeFireRow: (opts) => scheduledJobsAudit.writeFireRow(opts),
  addAlert,
  resolveByKey: resolveAlertsByDedupeKey,
  dedupeStateByKey: getAlertDedupeState,
});
