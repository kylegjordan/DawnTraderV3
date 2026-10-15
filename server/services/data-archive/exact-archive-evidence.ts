/**
 * B-XSTOCK-BAR-AVAILABILITY — durable exact-export proof for the immutable
 * xStock revision ledger. The generic manifest remains the lifecycle row;
 * this append-only row preserves the equality proof after hot deletion.
 */
import { readFileSync } from 'node:fs';

export const XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT =
  'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid' as const;

export interface ExactArchiveEvidenceInput {
  manifestId: string;
  sourceTable: 'xstock_bar_revision_event';
  partitionLabel: string;
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
    throw new Error(
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
 * it can never rewrite evidence produced by a previous attempt. */
export async function recordExactArchiveEvidence(
  client: QueryClient,
  input: ExactArchiveEvidenceInput,
): Promise<void> {
  assertExactArchiveEquality(input);
  const producingBuildSha = (input.producingBuildSha ?? readExactArchiveBuildSha()).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(producingBuildSha)) {
    throw new Error('[B75 sweep] exact archive producing build SHA is invalid');
  }
  if (!input.objectChecksum) throw new Error('[B75 sweep] exact archive checksum is empty');

  await client.query(
    `INSERT INTO xstock_bar_archive_exact_evidence (
       manifest_id, source_table, partition_label, tier,
       source_row_count, exported_row_count, downloaded_row_count,
       cursor_contract, producing_build_sha, object_checksum
     ) VALUES ($1, $2, $3, 'warm', $4, $5, $6, $7, $8, $9)
     ON CONFLICT (manifest_id) DO NOTHING`,
    [
      input.manifestId,
      input.sourceTable,
      input.partitionLabel,
      input.sourceRowCount,
      input.exportedRowCount,
      input.downloadedRowCount,
      XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT,
      producingBuildSha,
      input.objectChecksum,
    ],
  );
  const result = await client.query(
    `SELECT source_table, partition_label, tier,
            source_row_count::text, exported_row_count::text, downloaded_row_count::text,
            cursor_contract, producing_build_sha, object_checksum
       FROM xstock_bar_archive_exact_evidence
      WHERE manifest_id = $1`,
    [input.manifestId],
  );
  const stored = result.rows[0];
  const exact = stored
    && stored.source_table === input.sourceTable
    && stored.partition_label === input.partitionLabel
    && stored.tier === 'warm'
    && Number(stored.source_row_count) === input.sourceRowCount
    && Number(stored.exported_row_count) === input.exportedRowCount
    && Number(stored.downloaded_row_count) === input.downloadedRowCount
    && stored.cursor_contract === XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT
    && stored.producing_build_sha === producingBuildSha
    && stored.object_checksum === input.objectChecksum;
  if (!exact) {
    throw new Error(
      `[B75 sweep] exact archive evidence replay does not match original proof `
      + `${input.sourceTable}/${input.partitionLabel}`,
    );
  }
}
