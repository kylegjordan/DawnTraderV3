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
import { sql } from 'drizzle-orm';
import { db } from '../../db.js';
import type { InsertEquitySpotOhlc1m } from '../../../shared/schema.js';

export const XSTOCK_BAR_AVAILABILITY_CONTRACT = 'xstock-bar-availability/v1' as const;
export const XSTOCK_BAR_WRITER_BOOT_ID = randomUUID();

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

async function raiseCertificationAlert(detail: string, revisionIds: readonly string[]): Promise<void> {
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
      dedupe_key: 'xstock-bar-availability-certification-pending',
    });
  } catch (alertError) {
    console.error(
      '[B-XSTOCK-BAR-AVAILABILITY] FAILED TO RAISE certification alert:',
      alertError instanceof Error ? alertError.message : alertError,
    );
  }
}

async function certifyRevisionIds(revisionIds: string[]): Promise<XstockVisibilityCertificate[]> {
  const certificates = await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT * FROM certify_xstock_bar_revision_events(
        ${revisionIds}::uuid[],
        ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text
      )
    `);
    return resultRows<DbCertificateRow>(result).map((row) => ({
      revisionId: row.revision_id,
      visibleBy: new Date(row.visible_by),
      visibleSeq: Number(row.visible_seq),
      certificatePrimaryIdentity: row.certificate_primary_identity,
    }));
  });
  assertExactRevisionIdSet(revisionIds, certificates.map((row) => row.revisionId));
  return certificates;
}

/** Bounded repair for committed events whose second transaction failed. */
export async function repairPendingXstockCertificates(limit = 1_000): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    throw new Error(`[B-XSTOCK-BAR-AVAILABILITY] invalid certificate repair limit ${limit}`);
  }
  let revisionIds: string[] = [];
  try {
    // This read commits before certifyRevisionIds starts its own transaction. Repair therefore
    // retains the same later-statement causal boundary as first-pass certification.
    revisionIds = await db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        SELECT revision_id
        FROM xstock_bar_revision_event
        WHERE visible_by IS NULL
        ORDER BY created_at, revision_id
        LIMIT ${limit}
      `);
      return resultRows<{ revision_id: string }>(result).map((row) => row.revision_id);
    });
    if (revisionIds.length === 0) return 0;
    await certifyRevisionIds(revisionIds);
    console.log(`[B-XSTOCK-BAR-AVAILABILITY] repaired ${revisionIds.length} pending visibility certificates`);
    return revisionIds.length;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[B-XSTOCK-BAR-AVAILABILITY] certificate repair failed: ${detail}`);
    await raiseCertificationAlert(detail.slice(0, 600), revisionIds);
    return 0;
  }
}

/**
 * Commit projection attempts, then certify the exact committed IDs in a later transaction.
 * A certificate failure does not retry the first transaction and create a false extra arrival
 * event; it leaves the committed events NULL/ineligible for the repair path.
 */
export async function writeXstockProjectionAttempts(
  rows: InsertEquitySpotOhlc1m[],
): Promise<XstockRevisionWriteResult> {
  if (rows.length === 0) return { attempts: [], certificates: [], certification: 'certified' };
  const payloadJson = JSON.stringify(rows.map(toDatabasePayload));

  // Awaiting this Drizzle transaction includes its COMMIT acknowledgement. The certificate call
  // below therefore cannot observe an uncommitted event from this transaction.
  const attempts = await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT * FROM apply_xstock_bar_revision_events(
        ${payloadJson}::jsonb,
        ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid,
        ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text
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
  });
  if (attempts.length !== rows.length) {
    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] projection transaction returned ${attempts.length} `
      + `events for ${rows.length} post-buffer attempts`,
    );
  }

  const revisionIds = attempts.map((attempt) => attempt.revisionId);
  try {
    const certificates = await certifyRevisionIds(revisionIds);
    return { attempts, certificates, certification: 'certified' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `[B-XSTOCK-BAR-AVAILABILITY] certificate failed for ${revisionIds.length} committed revisions; `
      + `left NULL/ineligible for repair: ${detail}`,
    );
    await raiseCertificationAlert(detail.slice(0, 600), revisionIds);
    return { attempts, certificates: [], certification: 'pending_repair' };
  }
}
