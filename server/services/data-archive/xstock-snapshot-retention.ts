/**
 * B-XSTOCK-SNAPSHOT-RETENTION (#1194) — exact ranked-day selector contract.
 *
 * The two allow-listed snapshot tables are mutable UPSERT stores.  A time-range
 * count is therefore not a deletion proof.  This module owns the single selector
 * and canonical-row SQL used by export and by the final locked recheck/delete.
 */

import crypto from 'node:crypto';
import {
  XSTOCK_SNAPSHOT_POLICIES,
  assertSnapshotFloorCoversLiveCap,
  type XstockSnapshotTable,
} from '../xstock-snapshot-policy.js';

export const XSTOCK_SNAPSHOT_CURSOR_CONTRACT = 'xstock-snapshot-jsonb-v1:symbol+bucket_ts' as const;
export const XSTOCK_SNAPSHOT_SELECTOR_CONTRACT = 'xstock-snapshot-ranked-day/v1' as const;
export const XSTOCK_SNAPSHOT_SELECTOR_VERSION = 1 as const;
export const XSTOCK_SNAPSHOT_EXPECTED_COLUMNS = [
  'symbol', 'bucket_ts', 'open', 'high', 'low', 'close', 'volume', 'source_bar_count', 'captured_at',
  'aggregate_revision_id', 'aggregate_hash', 'source_revision_set_hash', 'source_max_visible_by',
  'source_max_visible_seq', 'read_observed_at', 'read_observed_seq', 'certificate_primary_identity',
  'availability_contract_version', 'eligibility_state',
] as const;

export interface XstockSnapshotSelector {
  table: XstockSnapshotTable;
  keepFloorRows: number;
  cutoffAt: Date;
  rankingObservedAt: Date;
  dayStart: Date;
  dayEnd: Date;
}

export interface XstockSnapshotProof {
  sourceRowCount: number;
  orderedKeySha256: string;
  fullRowSha256: string;
}

export interface XstockSnapshotCanonicalRow {
  symbol: string;
  bucket_ts: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
  source_bar_count: number;
  captured_at: string;
  aggregate_revision_id: string | null;
  aggregate_hash: string | null;
  source_revision_set_hash: string | null;
  source_max_visible_by: string | null;
  source_max_visible_seq: number | string | null;
  read_observed_at: string | null;
  read_observed_seq: number | string | null;
  certificate_primary_identity: string | null;
  availability_contract_version: string | null;
  eligibility_state: string | null;
}

function quoteSnapshotTable(table: XstockSnapshotTable): string {
  if (!XSTOCK_SNAPSHOT_POLICIES.some((policy) => policy.table === table)) {
    throw new Error(`unsupported xStock snapshot table: ${table}`);
  }
  return `"${table}"`;
}

function quoteInternalTempTable(table: string): string {
  if (!/^b75_snapshot_[a-z0-9_]+$/.test(table)) {
    throw new Error(`unsupported snapshot temp table: ${table}`);
  }
  return `"${table}"`;
}

function snapshotRankedCtes(table: XstockSnapshotTable): string {
  const quoted = quoteSnapshotTable(table);
  return `ranked AS MATERIALIZED (
    SELECT symbol, bucket_ts,
           row_number() OVER (PARTITION BY symbol ORDER BY bucket_ts DESC) AS retained_rank
      FROM ${quoted}
  ), floor_boundary AS MATERIALIZED (
    SELECT symbol, min(bucket_ts) AS oldest_kept_bucket
      FROM ranked
     WHERE retained_rank <= $1
     GROUP BY symbol
  )`;
}

export function assertSnapshotSelector(selector: XstockSnapshotSelector): void {
  quoteSnapshotTable(selector.table);
  assertSnapshotFloorCoversLiveCap(selector.table, selector.keepFloorRows);
  if (selector.cutoffAt.getTime() !== Date.UTC(
    selector.cutoffAt.getUTCFullYear(), selector.cutoffAt.getUTCMonth(), selector.cutoffAt.getUTCDate(),
  )) throw new Error('snapshot cutoff must be a complete UTC-day boundary');
  if (selector.dayStart.getTime() !== Date.UTC(
    selector.dayStart.getUTCFullYear(), selector.dayStart.getUTCMonth(), selector.dayStart.getUTCDate(),
  )) throw new Error('snapshot day start must be a UTC-day boundary');
  if (selector.dayEnd.getTime() - selector.dayStart.getTime() !== 86_400_000) {
    throw new Error('snapshot day range must be exactly one UTC day');
  }
  if (selector.dayEnd > selector.cutoffAt) throw new Error('snapshot day must be wholly older than the frozen cutoff');
  if (!Number.isFinite(selector.rankingObservedAt.getTime())) throw new Error('snapshot ranking instant is invalid');
}

export function frozenSnapshotCutoff(observedAt: Date, hotRetentionDays: number): Date {
  if (!Number.isInteger(hotRetentionDays) || hotRetentionDays <= 0) {
    throw new Error(`snapshot hot retention days must be a positive integer, got ${hotRetentionDays}`);
  }
  const shifted = new Date(observedAt.getTime() - hotRetentionDays * 86_400_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

export function snapshotDayLabel(dayStart: Date, orderedKeySha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(orderedKeySha256)) throw new Error('snapshot ordered-key digest is invalid');
  return `${dayStart.toISOString().slice(0, 10)}-${orderedKeySha256}`;
}

export function appendLengthFramedUtf8(hash: crypto.Hash, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length, 0);
  hash.update(length);
  hash.update(bytes);
}

export function appendSnapshotKey(hash: crypto.Hash, symbol: string, bucketTsText: string): void {
  appendLengthFramedUtf8(hash, symbol);
  appendLengthFramedUtf8(hash, bucketTsText);
}

export function snapshotCanonicalJsonExpression(alias = 's'): string {
  const ts = (column: string) =>
    `CASE WHEN ${alias}.${column} IS NULL THEN NULL ELSE to_char(${alias}.${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END`;
  return `jsonb_build_object(
    'symbol', ${alias}.symbol,
    'bucket_ts', ${ts('bucket_ts')},
    'open', ${alias}.open,
    'high', ${alias}.high,
    'low', ${alias}.low,
    'close', ${alias}.close,
    'volume', ${alias}.volume,
    'source_bar_count', ${alias}.source_bar_count,
    'captured_at', ${ts('captured_at')},
    'aggregate_revision_id', ${alias}.aggregate_revision_id,
    'aggregate_hash', ${alias}.aggregate_hash,
    'source_revision_set_hash', ${alias}.source_revision_set_hash,
    'source_max_visible_by', ${ts('source_max_visible_by')},
    'source_max_visible_seq', ${alias}.source_max_visible_seq,
    'read_observed_at', ${ts('read_observed_at')},
    'read_observed_seq', ${alias}.read_observed_seq,
    'certificate_primary_identity', ${alias}.certificate_primary_identity,
    'availability_contract_version', ${alias}.availability_contract_version,
    'eligibility_state', ${alias}.eligibility_state
  )::text`;
}

/**
 * The same ranked population is used for export and locked recheck.  The floor
 * is materialized once so PostgreSQL cannot rerun the window subplan per row.
 */
export function snapshotPopulationSql(selector: XstockSnapshotSelector): string {
  assertSnapshotSelector(selector);
  const table = quoteSnapshotTable(selector.table);
  return `WITH ${snapshotRankedCtes(selector.table)}
  SELECT s.symbol,
         s.bucket_ts,
         to_char(s.bucket_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS bucket_ts_text,
         ${snapshotCanonicalJsonExpression('s')} AS canonical_json
    FROM ${table} s
    JOIN floor_boundary f USING (symbol)
   WHERE s.bucket_ts >= $2
     AND s.bucket_ts < $3
     AND s.bucket_ts < $4
     AND s.bucket_ts < f.oldest_kept_bucket`;
}

export function snapshotPopulationParams(selector: XstockSnapshotSelector): unknown[] {
  assertSnapshotSelector(selector);
  return [selector.keepFloorRows, selector.dayStart, selector.dayEnd, selector.cutoffAt];
}

export function snapshotEligibleDaysSql(tableName: XstockSnapshotTable): string {
  const table = quoteSnapshotTable(tableName);
  return `WITH ${snapshotRankedCtes(tableName)}
  SELECT date_trunc('day', s.bucket_ts) AS day_start,
         count(*)::bigint AS eligible_rows,
         min(s.bucket_ts) AS oldest_key,
         max(s.bucket_ts) AS newest_key
    FROM ${table} s
    JOIN floor_boundary f USING (symbol)
   WHERE s.bucket_ts < $2
     AND s.bucket_ts < f.oldest_kept_bucket
   GROUP BY date_trunc('day', s.bucket_ts)
   ORDER BY day_start ASC`;
}

/**
 * One data-modifying statement after the caller takes SHARE lock.  It proves
 * the current frozen population, deletes only downloaded/proven keys, and
 * activates the matching manifest row.  A caller must roll back unless every
 * returned gate/count is exact.
 */
export function snapshotLockedDeleteSql(
  selector: XstockSnapshotSelector,
  provenKeysTable = 'b75_snapshot_proven_keys',
): string {
  assertSnapshotSelector(selector);
  const source = quoteSnapshotTable(selector.table);
  const proven = quoteInternalTempTable(provenKeysTable);
  const currentPopulation = snapshotPopulationSql(selector);
  return `WITH current_rows AS MATERIALIZED (
    ${currentPopulation}
  ), current_proof AS (
    SELECT count(*)::bigint AS row_count,
           encode(digest(COALESCE(string_agg(
             int4send(octet_length(convert_to(symbol, 'UTF8'))) || convert_to(symbol, 'UTF8') ||
             int4send(octet_length(convert_to(bucket_ts_text, 'UTF8'))) || convert_to(bucket_ts_text, 'UTF8'),
             ''::bytea ORDER BY symbol, bucket_ts
           ), ''::bytea), 'sha256'), 'hex') AS ordered_key_sha256,
           encode(digest(COALESCE(string_agg(
             convert_to(canonical_json || E'\\n', 'UTF8'),
             ''::bytea ORDER BY symbol, bucket_ts
           ), ''::bytea), 'sha256'), 'hex') AS full_row_sha256
      FROM current_rows
  ), proof_gate AS (
    SELECT row_count,
           ordered_key_sha256,
           full_row_sha256,
           row_count = $5::bigint
             AND ordered_key_sha256 = $6
             AND full_row_sha256 = $7 AS matches
      FROM current_proof
  ), deleted AS (
    DELETE FROM ${source} target
     USING ${proven} proven, proof_gate gate
     WHERE gate.matches
       AND target.symbol = proven.symbol
       AND target.bucket_ts = proven.bucket_ts
     RETURNING target.symbol, target.bucket_ts
  ), delete_count AS (
    SELECT count(*)::bigint AS row_count FROM deleted
  ), marked AS (
    UPDATE data_archive_manifest manifest
       SET state = 'active', hot_partition_dropped_at = NOW()
      FROM proof_gate gate, delete_count removed
     WHERE manifest.id = $8
       AND manifest.state = 'verified'
       AND manifest.completeness_basis = 'source-count-matched'
       AND gate.matches
       AND removed.row_count = $5::bigint
     RETURNING manifest.id
  )
  SELECT gate.matches AS proof_matches,
         gate.row_count::text AS current_row_count,
         gate.ordered_key_sha256,
         gate.full_row_sha256,
         removed.row_count::text AS deleted_row_count,
         (SELECT count(*)::text FROM marked) AS manifest_rows_marked
    FROM proof_gate gate
    CROSS JOIN delete_count removed`;
}

export function snapshotLockedDeleteParams(
  selector: XstockSnapshotSelector,
  proof: XstockSnapshotProof,
  manifestId: string,
): unknown[] {
  return [
    ...snapshotPopulationParams(selector),
    proof.sourceRowCount,
    proof.orderedKeySha256,
    proof.fullRowSha256,
    manifestId,
  ];
}

export function snapshotProvenKeyAbsenceSql(
  tableName: XstockSnapshotTable,
  provenKeysTable = 'b75_snapshot_proven_keys',
): string {
  const source = quoteSnapshotTable(tableName);
  const proven = quoteInternalTempTable(provenKeysTable);
  return `SELECT count(*)::bigint AS remaining_rows
    FROM ${source} source
    JOIN ${proven} proven USING (symbol, bucket_ts)`;
}

export function snapshotSchemaValidationSql(): string {
  return `SELECT column_name
    FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = $1
   ORDER BY ordinal_position`;
}

export function assertSnapshotSchemaColumns(rows: Array<{ column_name: string }>): void {
  const actual = rows.map((row) => row.column_name);
  const expected = [...XSTOCK_SNAPSHOT_EXPECTED_COLUMNS];
  if (actual.length !== expected.length || actual.some((column, index) => column !== expected[index])) {
    throw new Error(
      `snapshot schema mismatch: expected ${expected.join(',')} but found ${actual.join(',') || '<none>'}`,
    );
  }
}

export function assertCanonicalSnapshotObject(value: unknown): asserts value is XstockSnapshotCanonicalRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('snapshot JSONL row is not an object');
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...XSTOCK_SNAPSHOT_EXPECTED_COLUMNS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`snapshot JSONL row has unexpected fields: ${keys.join(',')}`);
  }
  const row = value as Record<string, unknown>;
  if (typeof row.symbol !== 'string' || row.symbol.length === 0) throw new Error('snapshot JSONL symbol is invalid');
  if (typeof row.bucket_ts !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(row.bucket_ts)) {
    throw new Error('snapshot JSONL bucket_ts is not UTC microsecond text');
  }
}

export function snapshotProofMatches(a: XstockSnapshotProof, b: XstockSnapshotProof): boolean {
  return a.sourceRowCount === b.sourceRowCount
    && a.orderedKeySha256 === b.orderedKeySha256
    && a.fullRowSha256 === b.fullRowSha256;
}
