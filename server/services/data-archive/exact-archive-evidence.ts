/**
 * B-XSTOCK-BAR-AVAILABILITY — durable exact-export proof for the immutable
 * xStock revision ledger. The generic manifest remains the lifecycle row;
 * this append-only row preserves the equality proof after hot deletion.
 *
 * B-B75-EXPORT-COMPLETENESS (#1195): generalised to EVERY archive lane. The table
 * is `data_archive_exact_evidence` (renamed from `xstock_bar_archive_exact_evidence`,
 * pins on `source_table`/`tier` dropped, `cursor_contract` widened to two values).
 * The writer takes `sourceTable`, `tier` and `cursorContract` from the export — it
 * never hard-codes them, because a literal here would file every lane's proof
 * under one table and the manifest's tie trigger would then refuse every stamp
 * (Langston Step-1 condition 1). CC-C's lane passes exactly what it passed before.
 */
import { readFileSync } from 'node:fs';
import { ArchiveReadbackMismatchError } from './archive-completeness.js';

export const XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT =
  'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid' as const;

export interface ExactArchiveEvidenceInput {
  manifestId: string;
  sourceTable: string;
  partitionLabel: string;
  /** The tier the exported object actually landed in (the ctx 413 fallback lands cold). */
  tier: 'warm' | 'cold';
  cursorContract: string;
  sourceRowCount: number | null;
  exportedRowCount: number;
  downloadedRowCount: number;
  objectChecksum: string;
  producingBuildSha?: string;
}

interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export function assertExactArchiveEquality(input: Pick<
  ExactArchiveEvidenceInput,
  'sourceRowCount' | 'exportedRowCount' | 'downloadedRowCount'
>): asserts input is typeof input & { sourceRowCount: number } {
  if (input.sourceRowCount === null
      || input.sourceRowCount !== input.exportedRowCount
      || input.sourceRowCount !== input.downloadedRowCount) {
    throw new ArchiveReadbackMismatchError(
      `[B75 sweep] exact readback row-count mismatch: `
      + `source=${input.sourceRowCount ?? 'unknown'} exported=${input.exportedRowCount} `
      + `downloaded=${input.downloadedRowCount}`,
    );
  }
}

export function readExactArchiveBuildSha(): string {
  const value = readFileSync('dist/BUILD_SHA', 'utf8').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error('[B75 sweep] exact archive producing build identity is unavailable');
  }
  return value;
}

/** Insert once, then compare every field. A retry may confirm the same fact;
 * it can never rewrite evidence produced by a previous attempt.
 *
 * `producing_build_sha` is FIRST-WRITE-WINS and is not part of the refusal
 * (Langston JC-4): a replay from a later build keeps the stored value and logs
 * both shas loudly. Refusing on it meant an object whose proof landed but whose
 * `verified` failed could never complete after any later deploy. CC-C's capacity
 * gate leans on the stored first producer being a reviewed ref, which this keeps. */
export async function recordExactArchiveEvidence(
  client: QueryClient,
  input: ExactArchiveEvidenceInput,
  log: (msg: string) => void = (msg) => console.warn(msg),
): Promise<void> {
  assertExactArchiveEquality(input);
  const producingBuildSha = (input.producingBuildSha ?? readExactArchiveBuildSha()).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(producingBuildSha)) {
    throw new Error('[B75 sweep] exact archive producing build SHA is invalid');
  }
  if (!input.objectChecksum) throw new Error('[B75 sweep] exact archive checksum is empty');
  if (!input.cursorContract) throw new Error('[B75 sweep] exact archive cursor contract is empty');

  await client.query(
    `INSERT INTO data_archive_exact_evidence (
       manifest_id, source_table, partition_label, tier,
       source_row_count, exported_row_count, downloaded_row_count,
       cursor_contract, producing_build_sha, object_checksum
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (manifest_id) DO NOTHING`,
    [
      input.manifestId,
      input.sourceTable,
      input.partitionLabel,
      input.tier,
      input.sourceRowCount,
      input.exportedRowCount,
      input.downloadedRowCount,
      input.cursorContract,
      producingBuildSha,
      input.objectChecksum,
    ],
  );
  const result = await client.query(
    `SELECT source_table, partition_label, tier,
            source_row_count::text, exported_row_count::text, downloaded_row_count::text,
            cursor_contract, producing_build_sha, object_checksum
       FROM data_archive_exact_evidence
      WHERE manifest_id = $1`,
    [input.manifestId],
  );
  const stored = result.rows[0];
  const exact = stored
    && stored.source_table === input.sourceTable
    && stored.partition_label === input.partitionLabel
    && stored.tier === input.tier
    && Number(stored.source_row_count) === input.sourceRowCount
    && Number(stored.exported_row_count) === input.exportedRowCount
    && Number(stored.downloaded_row_count) === input.downloadedRowCount
    && stored.cursor_contract === input.cursorContract
    && stored.object_checksum === input.objectChecksum;
  if (!exact) {
    throw new Error(
      `[B75 sweep] exact archive evidence replay does not match original proof `
      + `${input.sourceTable}/${input.partitionLabel}`,
    );
  }
  if (stored.producing_build_sha !== producingBuildSha) {
    log(
      `[B75 sweep] EVIDENCE BUILD-SHA MISMATCH ${input.sourceTable}/${input.partitionLabel}: `
      + `stored first producer=${String(stored.producing_build_sha)} this run=${producingBuildSha}; `
      + `counts, checksum and contract match, so the stored proof stands (first-write-wins)`,
    );
  }
}

/** The reuse recount (B-B75-EXPORT-COMPLETENESS, Langston Step-4 gate B residual): before
 *  a proven copy authorises a drop or delete of the CURRENT source, count that source again
 *  over the population the exporter counted (target, `ts >= start AND ts < end`, the extra
 *  predicate) and compare with the proof's stored source_row_count. No proof → false.
 *  `target` and `tsCol` arrive already identifier-quoted by the caller. */
export async function proofCountStillMatches(
  client: QueryClient,
  manifestId: string,
  source: { target: string; tsCol: string; rangeStart: Date; rangeEnd: Date; extraPredicate?: string },
): Promise<boolean> {
  const proof = await client.query(
    `SELECT source_row_count::text AS n FROM data_archive_exact_evidence WHERE manifest_id = $1`,
    [manifestId],
  );
  if (proof.rows.length === 0) return false;
  const extraAnd = source.extraPredicate ? ` AND (${source.extraPredicate})` : '';
  const now = await client.query(
    `SELECT count(*)::text AS n FROM ${source.target}
      WHERE ${source.tsCol} >= $1 AND ${source.tsCol} < $2${extraAnd}`,
    [source.rangeStart, source.rangeEnd],
  );
  return String(proof.rows[0].n) === String(now.rows[0]?.n);
}

/** Does an evidence row exist for this manifest row? (the resume decision's input). */
export async function evidenceExistsForManifest(client: QueryClient, manifestId: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM data_archive_exact_evidence WHERE manifest_id = $1 LIMIT 1`,
    [manifestId],
  );
  return r.rows.length > 0;
}
