/**
 * B-XSTOCK-BAR-AVAILABILITY v1 — immutable xStock projection events and
 * post-commit primary visibility certification.
 *
 * `intervalBegin` stays the Kraken vendor label. `arrivedAt` stays the F-G-1
 * winner watermark. Neither is promoted to database availability. The first
 * transaction atomically applies/rejects the compact projection and appends a
 * distinct event; only after that COMMIT resolves does a second transaction
 * certify the exact returned event-ID set.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { captureXstockDbSnapshot } from './xstock-db-snapshot.js';
import {
  recordXstockBarStatementTimeout,
  recordXstockBarTiming,
  type XstockTimingLeg,
} from './xstock-bar-timing.js';
import type { InsertEquitySpotOhlc1m } from '../../../shared/schema.js';

export const XSTOCK_BAR_AVAILABILITY_CONTRACT = 'xstock-bar-availability/v1' as const;

/**
 * Server-side ceiling for every statement inside this module's transactions, set
 * below the pool's client-side `query_timeout` (30 s, `server/db.ts`).
 *
 * WHY (2026-11-04, 18:03-18:16Z): when the database slowed, a certify statement
 * outlived the client's 30 s read timeout. The client gives up on a statement
 * without cancelling it on the server, so the transaction's ROLLBACK could not
 * be sent in time either, and the connection was handed back still inside an
 * open transaction. Ten of these took every pool slot and stalled the app until
 * the backends were terminated. With the server's own timer shorter, the server
 * cancels the statement first, the error comes back on the connection in the
 * normal way, and ROLLBACK runs at once. Same pattern as the Drift Dashboard's
 * `SET LOCAL statement_timeout` (drift-dashboard-aggregator.ts).
 * Residual: a database stalled so hard that ROLLBACK itself takes 30 s still
 * reaches the client timeout. This bounds the common case; it does not remove
 * the client-side timeout's failure mode for every caller of the pool.
 * ⛔ FORWARD-BINDING (Langston R5d; restated at B-DB-POOL-GUARD P3 C2, 2026-11-07): this value must stay BELOW
 * the POOL's server-side `statement_timeout` (25 s since P3, `server/db.ts`), which itself stays below the
 * 30 s client `query_timeout`. While it does, this module's own bound fires first and the writer's retry
 * (`isXstockProjectionRetryable`, ohlc-batch-writer.ts) sees the SQLSTATE 57014 cancel it expects.
 */
export const XSTOCK_TX_STATEMENT_TIMEOUT_MS = 20_000;

type XstockTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** R6a / C-2: parse the guard-wait setting. Only a non-empty string of digits is a sample; '' (the
 *  value after a transaction ends), NULL (never set) or anything else is no sample. */
export function parseGuardWaitMs(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const ms = Number(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** R6a: time one of the writer's three transactions; a success records its duration, a statement
 *  timeout is counted (its failure line is written where it is handled). */
async function timedLeg<T>(leg: XstockTimingLeg, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const value = await run();
    recordXstockBarTiming(leg, Date.now() - startedAt);
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('canceling statement due to statement timeout')) {
      recordXstockBarStatementTimeout(leg);
      // R6a / C4: every statement timeout on the three transactions (the projection's, which R5d then
      // retries, and the certify failures, first pass and repair) records what every backend was doing.
      // Best-effort, fresh connection, rate-limited to one a minute, never awaited.
      void captureXstockDbSnapshot(`${leg} statement timeout`);
    }
    throw error;
  }
}

function boundedTransaction<T>(work: (tx: XstockTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${XSTOCK_TX_STATEMENT_TIMEOUT_MS}`));
    return work(tx);
  });
}
export const XSTOCK_BAR_WRITER_BOOT_ID = randomUUID();
export const XSTOCK_BAR_WRITER_BUILD_SHA = (() => {
  try {
    const value = readFileSync('dist/BUILD_SHA', 'utf8').trim();
    if (/^[0-9a-f]{40}$/i.test(value)) return value.toLowerCase();
  } catch {
    // Tests and source-mode development do not necessarily have a built tree.
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[B-XSTOCK-BAR-AVAILABILITY] production build identity is unavailable');
  }
  return 'non-production';
})();

export interface XstockProjectionAttempt {
  revisionId: string;
  arrivedAt: Date;
  projectionApplied: boolean;
  projectionGeneration: number | null;
  supersedesRevisionId: string | null;
  observedWinnerRevisionId: string | null;
  payloadHash: string;
  payloadRepeatedFromWinner: boolean;
}

export interface XstockVisibilityCertificate {
  revisionId: string;
  visibleBy: Date;
  visibleSeq: number;
  certificatePrimaryIdentity: string;
}

export interface XstockRevisionWriteResult {
  attempts: XstockProjectionAttempt[];
  certificates: XstockVisibilityCertificate[];
  certification: 'certified' | 'pending_repair';
}

export interface XstockProjectionFlushPopulation {
  acceptedInputFrames: number;
  bufferSuperseded: number;
  /** Stable across retries of one logical buffer snapshot. */
  flushId?: string;
}

export interface XstockWriterHandoffState {
  acceptedInputFrames: number;
  bufferSuperseded: number;
  projectionAttempts: number;
  repeatedPayloadAttempts: number;
  appliedWinners: number;
  rejectedOlderArrivals: number;
  remainingBufferRows: number;
  pendingFlush: boolean;
  inFlight: boolean;
}

interface XstockAdmissionFailure extends Error {
  xstockAdmissionFailed: true;
}

export function isXstockAdmissionFailure(error: unknown): error is XstockAdmissionFailure {
  return error instanceof Error
    && (error as Partial<XstockAdmissionFailure>).xstockAdmissionFailed === true;
}

interface DbProjectionAttemptRow {
  revision_id: string;
  arrived_at: Date | string;
  projection_applied: boolean;
  projection_generation: number | string | null;
  supersedes_revision_id: string | null;
  observed_winner_revision_id: string | null;
  payload_hash: string;
  payload_repeated_from_winner: boolean;
}

interface DbCertificateRow {
  revision_id: string;
  visible_by: Date | string;
  visible_seq: number | string;
  certificate_primary_identity: string;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) {
    throw new Error('[B-XSTOCK-BAR-AVAILABILITY] unexpected database result shape');
  }
  return rows as T[];
}

function exactNonNegativeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`[B-XSTOCK-BAR-AVAILABILITY] invalid ${label}: ${String(value)}`);
  }
  return parsed;
}

/** Register this writer boot and link it to the immediately preceding boot.
 * The database advisory lock makes two accidental concurrent starts form one
 * chain rather than two branches. A missing predecessor handoff is retained as
 * a fact and makes the final observation gate fail; startup never invents it. */
export async function registerXstockWriterBootStart(): Promise<string | null> {
  return boundedTransaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('xstock-bar-writer-boot-chain'))`);
    const predecessorResult = await tx.execute(sql`
      SELECT boot_id
      FROM xstock_bar_writer_boot_start
      WHERE boot_id <> ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid
      ORDER BY started_at DESC, boot_id DESC
      LIMIT 1
    `);
    const predecessor = resultRows<{ boot_id: string }>(predecessorResult)[0]?.boot_id ?? null;
    await tx.execute(sql`
      INSERT INTO xstock_bar_writer_boot_start (
        boot_id, predecessor_boot_id, writer_build_sha, contract_version
      ) VALUES (
        ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid,
        ${predecessor}::uuid,
        ${XSTOCK_BAR_WRITER_BUILD_SHA}::text,
        ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text
      )
      ON CONFLICT (boot_id) DO NOTHING
    `);
    const registeredResult = await tx.execute(sql`
      SELECT predecessor_boot_id, writer_build_sha, contract_version
      FROM xstock_bar_writer_boot_start
      WHERE boot_id = ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid
    `);
    const registered = resultRows<{
      predecessor_boot_id: string | null;
      writer_build_sha: string;
      contract_version: string;
    }>(registeredResult)[0];
    if (!registered
        || registered.predecessor_boot_id !== predecessor
        || registered.writer_build_sha !== XSTOCK_BAR_WRITER_BUILD_SHA
        || registered.contract_version !== XSTOCK_BAR_AVAILABILITY_CONTRACT) {
      throw new Error('[B-XSTOCK-BAR-AVAILABILITY] writer boot registration identity mismatch');
    }
    return predecessor;
  });
}

/** Persist a clean handoff only after intake is stopped and every accepted
 * frame has reached its durable admission and atomic completion. */
export async function recordXstockWriterHandoff(
  state: XstockWriterHandoffState,
): Promise<void> {
  const localValues = Object.entries(state).filter(([, value]) => typeof value === 'number');
  for (const [label, value] of localValues) exactNonNegativeInteger(value, label);
  if (state.remainingBufferRows !== 0 || state.pendingFlush || state.inFlight) {
    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] refusing dirty writer handoff `
      + `(buffer=${state.remainingBufferRows}, pendingFlush=${state.pendingFlush}, inFlight=${state.inFlight})`,
    );
  }
  if (state.acceptedInputFrames - state.bufferSuperseded !== state.projectionAttempts
      || state.appliedWinners + state.rejectedOlderArrivals !== state.projectionAttempts) {
    throw new Error('[B-XSTOCK-BAR-AVAILABILITY] local writer handoff counters do not reconcile');
  }

  await boundedTransaction(async (tx) => {
    const aggregateResult = await tx.execute(sql`
      WITH admitted AS MATERIALIZED (
        SELECT * FROM xstock_bar_projection_flush_admission
        WHERE writer_boot_id = ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid
      ), completed AS MATERIALIZED (
        SELECT * FROM xstock_bar_projection_flush_completion
        WHERE writer_boot_id = ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid
      )
      SELECT
        count(a.flush_id)::bigint AS admission_flushes,
        count(c.flush_id)::bigint AS completion_flushes,
        count(*) FILTER (WHERE c.flush_id IS NULL)::bigint AS orphan_admissions,
        count(*) FILTER (WHERE c.flush_id IS NOT NULL AND (
          c.writer_build_sha IS DISTINCT FROM a.writer_build_sha
          OR c.contract_version IS DISTINCT FROM a.contract_version
          OR c.accepted_input_frames IS DISTINCT FROM a.accepted_input_frames
          OR c.buffer_superseded IS DISTINCT FROM a.buffer_superseded
          OR c.projection_attempts IS DISTINCT FROM a.expected_projection_attempts
          OR c.population_hash IS DISTINCT FROM a.population_hash
        ))::bigint AS mismatches,
        COALESCE(sum(a.accepted_input_frames), 0)::bigint AS accepted_input_frames,
        COALESCE(sum(a.buffer_superseded), 0)::bigint AS buffer_superseded,
        COALESCE(sum(c.projection_attempts), 0)::bigint AS projection_attempts,
        COALESCE(sum(c.repeated_payload_attempts), 0)::bigint AS repeated_payload_attempts,
        COALESCE(sum(c.applied_winners), 0)::bigint AS applied_winners,
        COALESCE(sum(c.rejected_older_arrivals), 0)::bigint AS rejected_older_arrivals,
        (SELECT count(*)::bigint
           FROM xstock_bar_revision_event e
          WHERE e.writer_boot_id = ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid
            AND e.visible_by IS NULL) AS pending_certificates
      FROM admitted a
      LEFT JOIN completed c USING (flush_id)
    `);
    const row = resultRows<Record<string, unknown>>(aggregateResult)[0];
    if (!row) throw new Error('[B-XSTOCK-BAR-AVAILABILITY] writer handoff aggregate missing');
    const durable = {
      admissionFlushes: exactNonNegativeInteger(row.admission_flushes, 'admission flushes'),
      completionFlushes: exactNonNegativeInteger(row.completion_flushes, 'completion flushes'),
      orphanAdmissions: exactNonNegativeInteger(row.orphan_admissions, 'orphan admissions'),
      mismatches: exactNonNegativeInteger(row.mismatches, 'admission/completion mismatches'),
      acceptedInputFrames: exactNonNegativeInteger(row.accepted_input_frames, 'durable accepted frames'),
      bufferSuperseded: exactNonNegativeInteger(row.buffer_superseded, 'durable buffer superseded'),
      projectionAttempts: exactNonNegativeInteger(row.projection_attempts, 'durable projection attempts'),
      repeatedPayloadAttempts: exactNonNegativeInteger(row.repeated_payload_attempts, 'durable repeated attempts'),
      appliedWinners: exactNonNegativeInteger(row.applied_winners, 'durable applied winners'),
      rejectedOlderArrivals: exactNonNegativeInteger(row.rejected_older_arrivals, 'durable rejected arrivals'),
      pendingCertificates: exactNonNegativeInteger(row.pending_certificates, 'pending certificates'),
    };
    if (durable.orphanAdmissions !== 0 || durable.mismatches !== 0
        || durable.pendingCertificates !== 0
        || durable.admissionFlushes !== durable.completionFlushes
        || durable.acceptedInputFrames !== state.acceptedInputFrames
        || durable.bufferSuperseded !== state.bufferSuperseded
        || durable.projectionAttempts !== state.projectionAttempts
        || durable.repeatedPayloadAttempts !== state.repeatedPayloadAttempts
        || durable.appliedWinners !== state.appliedWinners
        || durable.rejectedOlderArrivals !== state.rejectedOlderArrivals) {
      throw new Error(
        `[B-XSTOCK-BAR-AVAILABILITY] refusing unreconciled writer handoff `
        + JSON.stringify({ state, durable }),
      );
    }

    await tx.execute(sql`
      INSERT INTO xstock_bar_writer_handoff (
        boot_id, writer_build_sha, contract_version,
        accepted_input_frames, buffer_superseded, projection_attempts,
        repeated_payload_attempts, applied_winners, rejected_older_arrivals,
        admission_flushes, completion_flushes
      ) VALUES (
        ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid,
        ${XSTOCK_BAR_WRITER_BUILD_SHA}::text,
        ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text,
        ${durable.acceptedInputFrames}::bigint,
        ${durable.bufferSuperseded}::bigint,
        ${durable.projectionAttempts}::bigint,
        ${durable.repeatedPayloadAttempts}::bigint,
        ${durable.appliedWinners}::bigint,
        ${durable.rejectedOlderArrivals}::bigint,
        ${durable.admissionFlushes}::bigint,
        ${durable.completionFlushes}::bigint
      )
      ON CONFLICT (boot_id) DO NOTHING
    `);
    const proofResult = await tx.execute(sql`
      SELECT writer_build_sha, contract_version, accepted_input_frames,
             buffer_superseded, projection_attempts, repeated_payload_attempts,
             applied_winners, rejected_older_arrivals, admission_flushes,
             completion_flushes
      FROM xstock_bar_writer_handoff
      WHERE boot_id = ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid
    `);
    const proof = resultRows<Record<string, unknown>>(proofResult)[0];
    if (!proof
        || proof.writer_build_sha !== XSTOCK_BAR_WRITER_BUILD_SHA
        || proof.contract_version !== XSTOCK_BAR_AVAILABILITY_CONTRACT
        || exactNonNegativeInteger(proof.accepted_input_frames, 'proof accepted frames') !== durable.acceptedInputFrames
        || exactNonNegativeInteger(proof.buffer_superseded, 'proof buffer superseded') !== durable.bufferSuperseded
        || exactNonNegativeInteger(proof.projection_attempts, 'proof projection attempts') !== durable.projectionAttempts
        || exactNonNegativeInteger(proof.repeated_payload_attempts, 'proof repeated attempts') !== durable.repeatedPayloadAttempts
        || exactNonNegativeInteger(proof.applied_winners, 'proof applied winners') !== durable.appliedWinners
        || exactNonNegativeInteger(proof.rejected_older_arrivals, 'proof rejected arrivals') !== durable.rejectedOlderArrivals
        || exactNonNegativeInteger(proof.admission_flushes, 'proof admissions') !== durable.admissionFlushes
        || exactNonNegativeInteger(proof.completion_flushes, 'proof completions') !== durable.completionFlushes) {
      throw new Error('[B-XSTOCK-BAR-AVAILABILITY] writer handoff readback mismatch');
    }
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function xstockBarPayloadHash(row: InsertEquitySpotOhlc1m): string {
  const payload = {
    assetClass: row.assetClass,
    close: String(row.close),
    exchange: row.exchange,
    high: String(row.high),
    intervalBegin: row.intervalBegin instanceof Date
      ? row.intervalBegin.toISOString()
      : new Date(String(row.intervalBegin)).toISOString(),
    low: String(row.low),
    metadata: row.metadata ?? {},
    open: String(row.open),
    symbol: row.symbol,
    tradeCount: row.tradeCount ?? null,
    volume: String(row.volume),
    vwap: row.vwap == null ? null : String(row.vwap),
  };
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function toDatabasePayload(row: InsertEquitySpotOhlc1m): Record<string, unknown> {
  const arrivedAt = row.arrivedAt instanceof Date
    ? row.arrivedAt
    : row.arrivedAt == null ? null : new Date(String(row.arrivedAt));
  const intervalBegin = row.intervalBegin instanceof Date
    ? row.intervalBegin
    : new Date(String(row.intervalBegin));
  if (arrivedAt === null || !Number.isFinite(arrivedAt.getTime())) {
    throw new Error('[B-XSTOCK-BAR-AVAILABILITY] xStock attempt has no valid arrivedAt');
  }
  if (!Number.isFinite(intervalBegin.getTime())) {
    throw new Error('[B-XSTOCK-BAR-AVAILABILITY] xStock attempt has no valid intervalBegin');
  }
  if (row.assetClass !== 'xstock_spot') {
    throw new Error(`[B-XSTOCK-BAR-AVAILABILITY] wrong asset class: ${row.assetClass}`);
  }
  return {
    symbol: row.symbol,
    assetClass: row.assetClass,
    exchange: row.exchange,
    intervalBegin: intervalBegin.toISOString(),
    arrivedAt: arrivedAt.toISOString(),
    open: String(row.open),
    high: String(row.high),
    low: String(row.low),
    close: String(row.close),
    volume: String(row.volume),
    vwap: row.vwap == null ? null : String(row.vwap),
    tradeCount: row.tradeCount == null ? null : String(row.tradeCount),
    metadata: row.metadata ?? { schema_version: 1 },
    payloadHash: xstockBarPayloadHash(row),
  };
}

/** Canonical logical-flush payload. PostgreSQL stores and compares a SHA-256
 * of the jsonb-normalized value, so array order and every row field are bound
 * to the stable flush ID across ambiguous retries. */
export function xstockProjectionPayloadJson(rows: InsertEquitySpotOhlc1m[]): string {
  return JSON.stringify(rows.map(toDatabasePayload));
}

export function assertExactRevisionIdSet(expected: readonly string[], returned: readonly string[]): void {
  const expectedSet = new Set(expected);
  const returnedSet = new Set(returned);
  if (expectedSet.size !== expected.length || returnedSet.size !== returned.length
      || expectedSet.size !== returnedSet.size
      || [...expectedSet].some((id) => !returnedSet.has(id))) {
    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] certificate exact-ID mismatch `
      + `(expected=${expected.length}/${expectedSet.size} unique, returned=${returned.length}/${returnedSet.size} unique)`,
    );
  }
}

/**
 * R1 (Step 9 re-run plan, Langston PROCEED 2026-11-04): a durable trace of a failed writer
 * lifecycle step. A shutdown that fails exits 1 and its only record was `error.log`, which rotates
 * in days; the 10-17 failed handoff's cause was lost exactly that way. This writes one warning row
 * per boot and step to the alerts FILE store, which does not depend on the database whose stall it
 * may be recording. Bounded: the store's own lock budget is 5 s, and this races a 6 s ceiling, so it
 * can never hold the exit; every failure is swallowed into `console.error`.
 */
export type XstockLifecycleStep = 'shutdown-archive-handoff' | 'shutdown-after-handoff' | 'boot-registration';
export const XSTOCK_LIFECYCLE_TRACE_CEILING_MS = 6_000;
/** PM2's `kill_timeout` for the app (`ecosystem.config.cjs`); a fence test keeps the two equal. */
export const PM2_KILL_TIMEOUT_MS = 10_000;
/** The shutdown's whole budget before SIGKILL, with a margin for the exit itself. */
export const SHUTDOWN_BUDGET_MS = PM2_KILL_TIMEOUT_MS - 500;

/**
 * R1 r2 (Langston, PROCEED follow-up): the trace is bounded by a DEADLINE, not only the ceiling.
 * A shutdown that spent most of its budget before failing gets only what is left, so a late drain
 * shows up as a skipped trace in the log rather than silently being SIGKILLed mid-write.
 */
export async function recordXstockLifecycleFailure(
  step: XstockLifecycleStep,
  error: unknown,
  opts: { deadlineAt?: number } = {},
): Promise<void> {
  const detail = (error instanceof Error ? error.message : String(error)).slice(0, 600);
  const remaining = opts.deadlineAt === undefined
    ? XSTOCK_LIFECYCLE_TRACE_CEILING_MS
    : Math.min(XSTOCK_LIFECYCLE_TRACE_CEILING_MS, opts.deadlineAt - Date.now());
  if (remaining <= 0) {
    console.error(`[B-XSTOCK-BAR-AVAILABILITY][LIFECYCLE] no time left to record ${step} failure `
      + `(deadline passed by ${-remaining} ms); not written`);
    return;
  }
  const write = (async () => {
    const { addAlert } = await import('../system-alerts.js');
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'warning',
      title: `xStock bar writer ${step} failed`,
      body: `The xStock bar writer's ${step} step failed for boot ${XSTOCK_BAR_WRITER_BOOT_ID} `
        + `(build ${XSTOCK_BAR_WRITER_BUILD_SHA}). A failed shutdown step means no clean writer handoff `
        + `for this boot, which fails the Step 9 observation window. Error: ${detail}`,
      metadata: {
        source: 'xstock-bar-availability',
        batch: 'B-XSTOCK-BAR-AVAILABILITY',
        step,
        bootId: XSTOCK_BAR_WRITER_BOOT_ID,
        buildSha: XSTOCK_BAR_WRITER_BUILD_SHA,
        error: detail,
      },
      dedupe_key: `xstock-bar-writer-lifecycle-failure:${XSTOCK_BAR_WRITER_BOOT_ID}:${step}`,
    });
  })();
  let timer: NodeJS.Timeout | undefined;
  const ceiling = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), remaining);
  });
  try {
    const outcome = await Promise.race([write.then(() => 'written' as const), ceiling]);
    if (outcome === 'timeout') {
      console.error(`[B-XSTOCK-BAR-AVAILABILITY][LIFECYCLE] trace for ${step} not written within `
        + `${remaining} ms; proceeding`);
    }
  } catch (traceError) {
    console.error(`[B-XSTOCK-BAR-AVAILABILITY][LIFECYCLE] FAILED TO RECORD ${step} failure:`,
      traceError instanceof Error ? traceError.message : traceError);
  } finally {
    if (timer) clearTimeout(timer);
    write.catch(() => undefined);
  }
}

export const XSTOCK_CERTIFICATION_PENDING_KEY = 'xstock-bar-availability-certification-pending';
export const XSTOCK_BAR_REPAIR_ACTOR = 'xstock-bar-repair';

/** R4 (C3): the daily failure tally's key. It is never resolved by the repair; owner CC-C closes it. */
export function xstockCertificationFailureDayKey(at: Date = new Date()): string {
  return `xstock-bar-availability-certification-failures-day:${at.toISOString().slice(0, 10)}`;
}

/** R4: true while a certification-pending row may be open, so the repair checks only when it can matter.
 *  Starts true so the first repair after a boot checks once for a row left by an earlier process. */
let certificationAlertMayBeOpen = true;

/**
 * R4 (C3): one warning row per UTC day counting certification failures. The per-event critical is
 * the page; this row is the recurrence record that survives the auto-resolve. Never resolved here.
 */
async function recordCertificationFailureDay(revisionCount: number): Promise<void> {
  try {
    const { addAlert, mergeAlertMetadata } = await import('../system-alerts.js');
    const key = xstockCertificationFailureDayKey();
    const before = Date.now();
    const row = await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'warning',
      title: `xStock bar certification failures on ${key.slice(-10)}`,
      body: 'Daily tally of first-pass and repair certification failures for xStock bars. The per-event '
        + 'critical alert clears itself once every revision is certified; this row keeps the count so a '
        + 'recurrence stays visible. Owner CC-C resolves it at the R6b read or the window close, with the '
        + "day's count as evidence. Never ack.",
      metadata: { source: 'xstock-bar-availability', batch: 'B-XSTOCK-BAR-AVAILABILITY', failures: 1, lastRevisionCount: revisionCount },
      dedupe_key: key,
    });
    // addAlert returns the EXISTING open row on a dedupe hit; a row created before this call is that
    // case, so its count goes up by one. A row created by this call already carries failures: 1.
    // C8 (Langston): the increment reads the CURRENT count inside the store's lock, so two interleaved
    // raises cannot both read N and both write N+1.
    if (Date.parse(row.created_at) < before) {
      await mergeAlertMetadata(row.id, (current) => ({
        failures: Number(current.failures ?? 1) + 1,
        lastRevisionCount: revisionCount,
      }));
    }
  } catch (error) {
    console.error('[B-XSTOCK-BAR-AVAILABILITY] FAILED TO RECORD certification failure day:',
      error instanceof Error ? error.message : error);
  }
}

/**
 * R4 (C2): resolve the certification-pending alert only on a MEASURED GLOBAL ZERO. The alert keeps
 * only its first 20 revision ids and the repair reads at most `limit`, so neither can say that
 * nothing is pending; the count over the whole table can.
 */
async function resolveCertificationAlertIfClear(): Promise<void> {
  if (!certificationAlertMayBeOpen) return;
  try {
    const pending = await boundedTransaction(async (tx) => {
      const result = await tx.execute(sql`
        SELECT count(*)::bigint AS pending FROM xstock_bar_revision_event WHERE visible_by IS NULL
      `);
      return Number(resultRows<{ pending: string | number }>(result)[0]?.pending);
    });
    if (!Number.isInteger(pending) || pending !== 0) return;
    const { resolveAlertsByDedupeKey } = await import('../system-alerts.js');
    const checkId = randomUUID();
    const resolved = await resolveAlertsByDedupeKey(
      XSTOCK_CERTIFICATION_PENDING_KEY,
      XSTOCK_BAR_REPAIR_ACTOR,
      `certificate repair check ${checkId}: xstock_bar_revision_event visible_by IS NULL = 0 at ${new Date().toISOString()} (#707)`,
      'engine',
    );
    certificationAlertMayBeOpen = false;
    if (resolved.length > 0) {
      console.log(`[B-XSTOCK-BAR-AVAILABILITY] certification alert resolved by ${checkId}: ${resolved.join(', ')}`);
    }
  } catch (error) {
    // Leave the flag set: the next repair tries again.
    console.error('[B-XSTOCK-BAR-AVAILABILITY] certification auto-resolve check failed:',
      error instanceof Error ? error.message : error);
  }
}

async function raiseCertificationAlert(detail: string, revisionIds: readonly string[]): Promise<void> {
  certificationAlertMayBeOpen = true;
  await recordCertificationFailureDay(revisionIds.length);
  try {
    const { addAlert } = await import('../system-alerts.js');
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'critical',
      title: 'xStock bar visibility certification pending repair',
      body: `The immutable revision/projection transaction committed, but its later primary visibility `
        + `certificate failed. These revisions remain ineligible until exact-ID repair succeeds. `
        + `No receipt, label, projection-write, or cache timestamp may substitute. Detail: ${detail}`,
      metadata: {
        source: 'xstock-bar-availability',
        issue: '#707',
        contract: XSTOCK_BAR_AVAILABILITY_CONTRACT,
        revisionCount: revisionIds.length,
        revisionIds: revisionIds.slice(0, 20),
      },
      dedupe_key: XSTOCK_CERTIFICATION_PENDING_KEY,
    });
  } catch (alertError) {
    console.error(
      '[B-XSTOCK-BAR-AVAILABILITY] FAILED TO RAISE certification alert:',
      alertError instanceof Error ? alertError.message : alertError,
    );
  }
}

async function certifyRevisionIds(revisionIds: string[]): Promise<XstockVisibilityCertificate[]> {
  // Drizzle/node-postgres serializes a one-element JavaScript array as the
  // scalar UUID text, which PostgreSQL cannot cast to uuid[].  Build the
  // canonical text-array input explicitly; every value originated from the
  // database as a UUID, and the exact-set checks below still reject duplicates
  // or substitutions on either side of the certificate boundary.
  const revisionIdArrayLiteral = `{${revisionIds.join(',')}}`;
  const certificates = await timedLeg('certify', () => boundedTransaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT * FROM certify_xstock_bar_revision_events(
        ${revisionIdArrayLiteral}::uuid[],
        ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text
      )
    `);
    // R6a guardWaitMs (C5): the function stored its wait for the clock-guard lock in a transaction-local
    // setting; read it in this SAME transaction (inside this callback, Langston C-3). Parsed strictly
    // (Langston C-2, measured 2026-11-05): after a transaction ends the setting reads back as '' rather
    // than NULL, and Number('') is 0, so only a non-empty string of digits counts. Anything else is NO
    // SAMPLE, never a 0 ms reading.
    const guard = await tx.execute(sql`SELECT current_setting('xstock_bar.guard_wait_ms', true) AS guard_wait_ms`);
    const guardWait = parseGuardWaitMs(resultRows<{ guard_wait_ms: string | null }>(guard)[0]?.guard_wait_ms);
    if (guardWait !== null) recordXstockBarTiming('guardWait', guardWait);
    return resultRows<DbCertificateRow>(result).map((row) => ({
      revisionId: row.revision_id,
      visibleBy: new Date(row.visible_by),
      visibleSeq: Number(row.visible_seq),
      certificatePrimaryIdentity: row.certificate_primary_identity,
    }));
  }));
  assertExactRevisionIdSet(revisionIds, certificates.map((row) => row.revisionId));
  return certificates;
}

/**
 * Bounded repair for committed events whose second transaction failed.
 *
 * SINGLE-FLIGHT (2026-11-04): the batch writer calls this on a 5 s timer, and
 * the timer does not wait for a slow repair. During the 18:03Z slowdown each
 * failed repair took about 60 s, so a new one started every tick and up to six
 * were seen failing in the same second, each holding a pool slot. A call that
 * arrives while a repair is running now joins that run instead of starting
 * another one; the shutdown drain awaits the same run.
 */
let repairInFlight: { run: Promise<number>; limit: number } | null = null;

export async function repairPendingXstockCertificates(limit = 1_000): Promise<number> {
  // Validated BEFORE the single-flight gate, so a joining caller's limit is never unchecked.
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error(`[B-XSTOCK-BAR-AVAILABILITY] invalid certificate repair limit ${limit}`);
  }
  const current = repairInFlight;
  if (current) {
    if (current.limit === limit) return current.run;
    // A different limit is not served by a join: wait the running repair out, then run its own.
    // The catch is defence only: runPendingCertificateRepair returns 0 on every failure, so this
    // promise does not reject at present. Known fence limit (Langston R5 r2): the recursion can
    // be starved if the 5 s timer re-claims the slot with the default limit first. Both live
    // callers use the default, so this path is unreached; a non-default caller must not rely on it.
    await current.run.catch(() => undefined);
    return repairPendingXstockCertificates(limit);
  }
  const run = runPendingCertificateRepair(limit).finally(() => {
    if (repairInFlight?.run === run) repairInFlight = null;
  });
  repairInFlight = { run, limit };
  return run;
}

async function runPendingCertificateRepair(limit: number): Promise<number> {
  let revisionIds: string[] = [];
  let repairCertifyStartedAt: number | null = null;
  try {
    // This read commits before certifyRevisionIds starts its own transaction. Repair therefore
    // retains the same later-statement causal boundary as first-pass certification.
    revisionIds = await boundedTransaction(async (tx) => {
      const result = await tx.execute(sql`
        SELECT revision_id
        FROM xstock_bar_revision_event
        WHERE visible_by IS NULL
        ORDER BY created_at, revision_id
        LIMIT ${limit}
      `);
      return resultRows<{ revision_id: string }>(result).map((row) => row.revision_id);
    });
    if (revisionIds.length === 0) {
      await resolveCertificationAlertIfClear();
      return 0;
    }
    repairCertifyStartedAt = Date.now();
    await certifyRevisionIds(revisionIds);
    console.log(`[B-XSTOCK-BAR-AVAILABILITY] repaired ${revisionIds.length} pending visibility certificates`);
    await resolveCertificationAlertIfClear();
    return revisionIds.length;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const elapsed = repairCertifyStartedAt === null
      ? 'before certify'
      : `${Date.now() - repairCertifyStartedAt} ms into certify`;
    console.error(`[B-XSTOCK-BAR-AVAILABILITY] certificate repair failed (${elapsed}): ${detail}`);
    await raiseCertificationAlert(detail.slice(0, 600), revisionIds);
    return 0;
  }
}

/**
 * Commit an idempotent admission, then projection attempts, then certify the
 * exact committed IDs in a later transaction.
 * A certificate failure does not retry the first transaction and create a false extra arrival
 * event; it leaves the committed events NULL/ineligible for the repair path.
 */
export async function writeXstockProjectionAttempts(
  rows: InsertEquitySpotOhlc1m[],
  population: XstockProjectionFlushPopulation = {
    acceptedInputFrames: rows.length,
    bufferSuperseded: 0,
  },
): Promise<XstockRevisionWriteResult> {
  if (rows.length === 0) return { attempts: [], certificates: [], certification: 'certified' };
  if (!Number.isInteger(population.acceptedInputFrames)
      || !Number.isInteger(population.bufferSuperseded)
      || population.acceptedInputFrames <= 0
      || population.bufferSuperseded < 0
      || population.acceptedInputFrames - population.bufferSuperseded !== rows.length) {
    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] invalid flush population `
      + `(accepted=${population.acceptedInputFrames}, superseded=${population.bufferSuperseded}, `
      + `attempts=${rows.length})`,
    );
  }
  const payloadJson = xstockProjectionPayloadJson(rows);
  const flushId = population.flushId ?? randomUUID();

  // This is intentionally a separate committed transaction. If projection
  // fails permanently or its COMMIT acknowledgement is ambiguous, the
  // accepted population remains durable and the retry reuses this flush ID.
  try {
    await timedLeg('admit', () => boundedTransaction(async (tx) => {
      await tx.execute(sql`
        SELECT admit_xstock_bar_projection_flush(
          ${flushId}::uuid,
          ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid,
          ${XSTOCK_BAR_WRITER_BUILD_SHA}::text,
          ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text,
          ${population.acceptedInputFrames}::integer,
          ${population.bufferSuperseded}::integer,
          ${rows.length}::integer,
          ${payloadJson}::jsonb
        )
      `);
    }));
  } catch (error) {
    // The admission COMMIT may have succeeded even when its acknowledgement
    // was lost. Mark the phase so the buffer writer always retains this exact
    // snapshot and retries the same flush ID; it must never classify an
    // unconfirmed admission as a droppable permanent projection failure.
    const detail = error instanceof Error ? error.message : String(error);
    const admissionError = new Error(
      `xStock flush admission unconfirmed: ${detail}`,
    ) as XstockAdmissionFailure;
    admissionError.xstockAdmissionFailed = true;
    throw admissionError;
  }

  // Awaiting this Drizzle transaction includes its COMMIT acknowledgement. The certificate call
  // below therefore cannot observe an uncommitted event from this transaction.
  const attempts = await timedLeg('apply', () => boundedTransaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT * FROM apply_xstock_bar_revision_flush(
        ${payloadJson}::jsonb,
        ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid,
        ${XSTOCK_BAR_WRITER_BUILD_SHA}::text,
        ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text,
        ${flushId}::uuid
      )
    `);
    return resultRows<DbProjectionAttemptRow>(result).map((row) => ({
      revisionId: row.revision_id,
      arrivedAt: new Date(row.arrived_at),
      projectionApplied: row.projection_applied,
      projectionGeneration: row.projection_generation == null ? null : Number(row.projection_generation),
      supersedesRevisionId: row.supersedes_revision_id,
      observedWinnerRevisionId: row.observed_winner_revision_id,
      payloadHash: row.payload_hash,
      payloadRepeatedFromWinner: row.payload_repeated_from_winner,
    }));
  }));
  if (attempts.length !== rows.length) {
    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] projection transaction returned ${attempts.length} `
      + `events for ${rows.length} post-buffer attempts`,
    );
  }

  const revisionIds = attempts.map((attempt) => attempt.revisionId);
  const certifyStartedAt = Date.now();
  try {
    const certificates = await certifyRevisionIds(revisionIds);
    return { attempts, certificates, certification: 'certified' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `[B-XSTOCK-BAR-AVAILABILITY] certificate failed after ${Date.now() - certifyStartedAt} ms `
      + `for ${revisionIds.length} committed revisions; `
      + `left NULL/ineligible for repair: ${detail}`,
    );
    await raiseCertificationAlert(detail.slice(0, 600), revisionIds);
    return { attempts, certificates: [], certification: 'pending_repair' };
  }
}
