/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B75 — context_bridge_log Export-then-TTL Sweep
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Daily 02:30 UTC. Exports `context_bridge_log` rows older than the hot
 * retention window to month-grouped JSONL.gz in the warm bucket, then deletes
 * them in batches, then VACUUMs the table to return disk to the OS.
 *
 * Cron line:
 *   30 2 * * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/context-bridge-log-ttl.ts >> /var/log/dawntrader/b75-ctx-bridge.log 2>&1
 *
 * VACUUM (plain, no FULL) is required (Langston rec #1) because pure DELETE
 * leaves dead tuples — without VACUUM, on-disk size doesn't drop until
 * autovacuum eventually runs.
 *
 * Reference: BATCH_75_SCOPE.md §C.3 + BATCH_75_PRE_AUDIT.md §B.2
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
import { countGzipJsonlLines, exportPartition } from '../services/data-archive/partition-exporter.js';
import { getStorageClient, type StorageClient } from '../services/data-archive/storage-client.js';
import {
  evidenceExistsForManifest,
  proofCountStillMatches,
  recordExactArchiveEvidence,
} from '../services/data-archive/exact-archive-evidence.js';
import {
  decideExistingCopy,
  decisionNeeds,
  LEGACY_TS_TIEGROUP_CURSOR_CONTRACT,
  NonProvenExistingCopyError,
  PROVEN_BASIS,
} from '../services/data-archive/archive-completeness.js';
import { isDirectEntry } from './direct-entry.js';

const { Client } = pg;

const SOURCE_TABLE = 'context_bridge_log';
const TS_COLUMN = 'timestamp';

export interface ContextBridgeConfig {
  retentionDays: number;
  batchSize: number;
  pauseMs: number;
  warmBucket: string;
  warmPrefix: string;
  coldBucket: string;
}

async function loadConfig(client: pg.Client): Promise<ContextBridgeConfig> {
  const r = await client.query(
    `SELECT constant_name, value FROM module_constants WHERE module_name = 'data_lifecycle'`,
  );
  const map = new Map<string, unknown>();
  for (const row of r.rows) map.set(row.constant_name, row.value);

  function reqStr(key: string): string {
    const v = map.get(key);
    if (typeof v !== 'string') {
      throw new Error(`[B75 ctx-bridge] missing or non-string data_lifecycle.${key}`);
    }
    return v;
  }
  function reqNum(key: string): number {
    const v = map.get(key);
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new Error(`[B75 ctx-bridge] missing or invalid numeric data_lifecycle.${key}`);
    }
    return v;
  }

  return {
    retentionDays: reqNum('context_bridge_log.hot_retention_days'),
    batchSize: reqNum('sweep_batch_size'),
    pauseMs: reqNum('sweep_pause_ms'),
    warmBucket: reqStr('warm_bucket'),
    warmPrefix: reqStr('warm_prefix'),
    coldBucket: reqStr('cold_bucket'),
  };
}

export interface ContextMonthRange {
  label: string; // 'YYYY-MM'
  start: Date;
  end: Date;
}

export type ContextDeletionGuard =
  | { kind: 'proven-count'; manifestId: string; month: ContextMonthRange }
  | {
      kind: 'must-be-empty';
      month: ContextMonthRange;
      reason: 'active-rows-present' | 'migrated-rows-present';
    };

export interface ContextMonthResult {
  rowCount: number;
  bytesCompressed: number;
  deletionGuard: ContextDeletionGuard;
}

/**
 * Enumerate the YYYY-MM month buckets covered by [oldestRow, cutoff). Skips
 * the partial cutoff month — only WHOLE months get exported as a single file.
 * Partial-month rows are NOT deleted in this sweep (Kyle directive: "never drop
 * data"). They wait until next month when their month becomes whole and gets
 * archived. Effective hot retention drifts between N and ~N+30 days depending
 * on calendar position. Acceptable cost; data is never lost.
 */
async function listMonthsToExport(
  client: pg.Client,
  cutoff: Date,
): Promise<{ months: ContextMonthRange[]; oldestTs: Date | null }> {
  const r = await client.query(
    `SELECT MIN(${TS_COLUMN}) AS oldest FROM ${SOURCE_TABLE}
       WHERE ${TS_COLUMN} < $1`,
    [cutoff],
  );
  const oldest = r.rows[0]?.oldest as Date | null;
  if (!oldest) return { months: [], oldestTs: null };

  const months: ContextMonthRange[] = [];
  let cursor = new Date(Date.UTC(oldest.getUTCFullYear(), oldest.getUTCMonth(), 1));
  while (true) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    if (next > cutoff) break; // partial month — handled in tail-delete phase
    months.push({
      label: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      start: cursor,
      end: next,
    });
    cursor = next;
  }
  return { months, oldestTs: oldest };
}

async function getManifestState(
  client: pg.Client,
  partitionLabel: string,
): Promise<{ id: string; state: string; tier: string; completeness_basis: string | null } | null> {
  // B-B75-EXPORT-COMPLETENESS: either tier. This lane's 413 fallback writes the ORIGINAL
  // copy straight to cold (the row is re-tiered at the fallback below), so a cold row
  // here is a copy of record, not a rotator copy — warm is preferred when both exist.
  const r = await client.query(
    `SELECT id, state, tier, completeness_basis FROM data_archive_manifest
      WHERE source_table = $1 AND partition_label = $2
      ORDER BY (tier = 'warm') DESC
      LIMIT 1`,
    [SOURCE_TABLE, partitionLabel],
  );
  return r.rows[0] ?? null;
}

/** One LIMIT 1 probe: does the month still hold source rows? (the decision's input). */
async function monthRowsPresent(client: pg.Client, month: ContextMonthRange): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM ${SOURCE_TABLE} WHERE "${TS_COLUMN}" >= $1 AND "${TS_COLUMN}" < $2 LIMIT 1`,
    [month.start, month.end],
  );
  return r.rows.length > 0;
}

/** Re-derive the complete UTC-month population reachable by the cutoff-wide
 * DELETE. Called only after the source write lock is held. */
async function listDeletePopulationLabels(client: pg.Client, cutoff: Date): Promise<string[]> {
  const r = await client.query(
    `SELECT DISTINCT to_char("${TS_COLUMN}" AT TIME ZONE 'UTC', 'YYYY-MM') AS label
       FROM ${SOURCE_TABLE}
      WHERE "${TS_COLUMN}" < $1
      ORDER BY label`,
    [cutoff],
  );
  return r.rows.map((row) => String(row.label));
}

export interface ContextMonthDependencies {
  exportPartition: typeof exportPartition;
  getStorageClient: () => StorageClient;
  unlinkFile: typeof fs.unlinkSync;
  countGzipJsonlLines: typeof countGzipJsonlLines;
  evidenceExistsForManifest: typeof evidenceExistsForManifest;
  proofCountStillMatches: typeof proofCountStillMatches;
  recordExactArchiveEvidence: typeof recordExactArchiveEvidence;
}

const DEFAULT_CONTEXT_MONTH_DEPS: ContextMonthDependencies = {
  exportPartition,
  getStorageClient,
  unlinkFile: fs.unlinkSync,
  countGzipJsonlLines,
  evidenceExistsForManifest,
  proofCountStillMatches,
  recordExactArchiveEvidence,
};

export async function exportAndUploadContextMonth(
  exportClient: pg.Client,
  ctlClient: pg.Client,
  cfg: ContextBridgeConfig,
  month: ContextMonthRange,
  deps: ContextMonthDependencies = DEFAULT_CONTEXT_MONTH_DEPS,
): Promise<ContextMonthResult> {
  // B-B75-EXPORT-COMPLETENESS (#1195): the same one decision as the B75 sweep. A month
  // already archived and deleted (`active`) with NO rows skips, as before; WITH rows it
  // refuses — those rows are not in the archived copy, and the delete below would remove
  // them unarchived. A refusal throws, so main() exits before its delete step.
  const existing = await getManifestState(ctlClient, month.label);
  const needs = decisionNeeds(existing);
  const evidenceExists = existing && needs.evidence ? await deps.evidenceExistsForManifest(ctlClient, existing.id) : false;
  const rowsPresent = needs.rows ? await monthRowsPresent(ctlClient, month) : false;
  const decision = decideExistingCopy(existing, evidenceExists, rowsPresent);
  if (decision.kind === 'refuse') {
    throw new NonProvenExistingCopyError(decision.reason, SOURCE_TABLE, month.label);
  }
  if (decision.kind === 'skip') {
    console.log(`[B75 ctx-bridge] ${month.label}: ${decision.reason} (skipped)`);
    return {
      rowCount: 0,
      bytesCompressed: 0,
      deletionGuard: {
        kind: 'must-be-empty',
        month,
        reason: decision.reason === 'already-active' ? 'active-rows-present' : 'migrated-rows-present',
      },
    };
  }
  if (decision.kind === 'reuse') {
    const same = await deps.proofCountStillMatches(ctlClient, existing!.id, {
      target: `"${SOURCE_TABLE}"`,
      tsCol: `"${TS_COLUMN}"`,
      rangeStart: month.start,
      rangeEnd: month.end,
    });
    if (!same) {
      throw new NonProvenExistingCopyError('reuse-count-changed', SOURCE_TABLE, month.label);
    }
    console.log(`[B75 ctx-bridge] ${month.label}: proven copy reused after source recount (skipped)`);
    return {
      rowCount: 0,
      bytesCompressed: 0,
      deletionGuard: { kind: 'proven-count', manifestId: existing!.id, month },
    };
  }

  const exportRes = await deps.exportPartition(exportClient, {
    sourceTable: SOURCE_TABLE,
    partitionLabel: month.label,
    rangeStart: month.start,
    rangeEnd: month.end,
    timestampColumn: TS_COLUMN,
    // No partitionTableName — read directly from unpartitioned table with WHERE clause
  });

  const storageUri = `supabase://${cfg.warmBucket}/${cfg.warmPrefix}/${SOURCE_TABLE}/${month.label}.jsonl.gz`;

  // Insert / update manifest as 'pending' first
  let manifestId: string;
  if (existing) {
    manifestId = existing.id;
    await ctlClient.query(
      `UPDATE data_archive_manifest SET state = 'pending', storage_uri = $2 WHERE id = $1`,
      [manifestId, storageUri],
    );
  } else {
    const r = await ctlClient.query(
      `INSERT INTO data_archive_manifest (
         source_table, partition_label, tier, state, storage_uri,
         min_ts, max_ts, date_range_start, date_range_end,
         row_count, bytes_compressed, checksum, format, compression
       ) VALUES ($1, $2, 'warm', 'pending', $3,
                $4, $5, $4, $5,
                0, 0, '', 'jsonl.gz', 'gzip')
       RETURNING id`,
      [SOURCE_TABLE, month.label, storageUri, month.start, month.end],
    );
    manifestId = r.rows[0].id;
  }

  // Upload + verify. If warm rejects with 413 (Supabase project file_size_limit
  // exceeded), fall back to cold tier (B2 supports 5 GB single-call).
  // B-DISK-FILE-TIERING 3a (AP-4 C-2): the export file is uploaded and verified by the FILE forms — the buffered warm
  // pair here (B-NEW-47 missed it, #169) and the buffered cold fallback are gone. The export itself is still built in
  // memory by its exporter (AP-4's recorded limit).
  const storage = deps.getStorageClient();
  const verifyPath = `${exportRes.localPath}.verify`;
  let upload;
  let actualBucket = cfg.warmBucket;
  let actualPath = `${cfg.warmPrefix}/${SOURCE_TABLE}/${month.label}.jsonl.gz`;
  let actualTier: 'warm' | 'cold' = 'warm';
  let actualUri = storageUri;

  try {
    // exportRes.checksum is deliberately NOT passed in: uploadWarmFile hashes the file itself, so the comparison below
    // stays a real check of what was uploaded rather than a tautology. Do not "optimise" this away.
    upload = await storage.uploadWarmFile(actualBucket, actualPath, exportRes.localPath);
    let readBack: { checksum: string };
    try {
      readBack = await storage.downloadWarmFile(actualBucket, actualPath, verifyPath);
    } finally {
      fs.rmSync(verifyPath, { force: true });
    }
    if (upload.checksum !== exportRes.checksum || readBack.checksum !== exportRes.checksum) {
      throw new Error(
        `[B75 ctx-bridge] ${month.label}: checksum mismatch ` +
          `local=${exportRes.checksum} upload=${upload.checksum} readback=${readBack.checksum}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const is413 = msg.includes('413') || msg.includes('Payload Too Large') || msg.includes('Maximum size exceeded') || msg.includes('exceeded the maximum allowed size');
    if (!is413 || !storage.isColdConfigured()) {
      throw err;
    }
    console.log(
      `[B75 ctx-bridge] ${month.label}: warm tier rejected (413). Falling back to cold tier (B2). Reason: ${msg.slice(0, 120)}`,
    );
    actualBucket = cfg.coldBucket || 'dt-archive-cold';
    actualPath = `${SOURCE_TABLE}/${month.label}.jsonl.gz`;
    actualTier = 'cold';
    actualUri = `b2://${actualBucket}/${actualPath}`;
    // Streamed and ATTESTED (upload response + b2_get_file_info by file id) — no whole-object re-download.
    const cold = await storage.uploadColdFile(actualBucket, actualPath, exportRes.localPath);
    if (cold.checksum !== exportRes.checksum) {
      throw new Error(
        `[B75 ctx-bridge] ${month.label}: cold upload hashed a different file ` +
          `local=${exportRes.checksum} upload=${cold.checksum}`,
      );
    }
    // Update the manifest row to reflect cold tier (it was inserted as 'warm pending' earlier), with the attestation
    await ctlClient.query(
      `UPDATE data_archive_manifest
         SET tier = 'cold', storage_uri = $2,
             provider_file_id = $3, provider_sha1 = $4, provider_bytes = $5, verification_method = 'b2-sha1-attested'
       WHERE id = $1`,
      [manifestId, actualUri, cold.fileId, cold.sha1, cold.bytes],
    );
  }

  // B-B75-EXPORT-COMPLETENESS (OBJ-7, R-1): the proof, the basis stamp and `verified`
  // land in ONE transaction, evidence first (the manifest tie trigger's invariant). The
  // downloaded count is taken from the local file, which the warm read-back checksum (or, on
  // the cold fallback, B2's SHA-1 attestation of the stored version) has just shown
  // byte-identical to the stored object. The tier is where the object
  // actually landed — `cold` after the 413 fallback (Langston Step-1 condition 1).
  const downloadedRowCount = await deps.countGzipJsonlLines(exportRes.localPath);
  await ctlClient.query('BEGIN');
  try {
    await deps.recordExactArchiveEvidence(ctlClient, {
      manifestId,
      sourceTable: SOURCE_TABLE,
      partitionLabel: month.label,
      tier: actualTier,
      cursorContract: LEGACY_TS_TIEGROUP_CURSOR_CONTRACT,
      sourceRowCount: exportRes.sourceRowCount,
      exportedRowCount: exportRes.rowCount,
      downloadedRowCount,
      objectChecksum: exportRes.checksum,
    });
    await ctlClient.query(
      `UPDATE data_archive_manifest
         SET state = 'verified',
             verified_at = NOW(),
             row_count = $2,
             bytes_compressed = $3,
             min_ts = $4,
             max_ts = $5,
             checksum = $6,
             completeness_basis = $7,
             tier = $8
       WHERE id = $1`,
      // tier = $8 (Langston Step-4 gate C, C-3): the row may have been read from a cold row
      // (either-tier lookup), and the success path never wrote tier — so the manifest row,
      // its URI and its proof must agree on where the object actually landed.
      [
        manifestId,
        exportRes.rowCount,
        exportRes.bytesCompressed,
        exportRes.minTs,
        exportRes.maxTs,
        exportRes.checksum,
        PROVEN_BASIS,
        actualTier,
      ],
    );
    await ctlClient.query('COMMIT');
  } catch (err) {
    await ctlClient.query('ROLLBACK').catch(() => {});
    throw err;
  }

  // Cleanup local temp
  try {
    deps.unlinkFile(exportRes.localPath);
  } catch {
    // ignore
  }

  console.log(
    `[B75 ctx-bridge] ${month.label}: exported rows=${exportRes.rowCount} bytes=${exportRes.bytesCompressed}`,
  );

  return {
    rowCount: exportRes.rowCount,
    bytesCompressed: exportRes.bytesCompressed,
    deletionGuard: { kind: 'proven-count', manifestId, month },
  };
}

async function deleteOldRows(
  client: pg.Client,
  cfg: ContextBridgeConfig,
  cutoff: Date,
): Promise<{ deleted: number }> {
  let totalDeleted = 0;
  while (true) {
    const r = await client.query(
      `DELETE FROM ${SOURCE_TABLE}
        WHERE id IN (
          SELECT id FROM ${SOURCE_TABLE}
           WHERE ${TS_COLUMN} < $1
           ORDER BY ${TS_COLUMN} ASC
           LIMIT $2
        )`,
      [cutoff, cfg.batchSize],
    );
    const deleted = r.rowCount ?? 0;
    totalDeleted += deleted;
    if (deleted < cfg.batchSize) break;
    if (cfg.pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, cfg.pauseMs));
    }
  }
  return { deleted: totalDeleted };
}

async function markMonthsActive(
  client: pg.Client,
  monthLabels: string[],
): Promise<void> {
  if (monthLabels.length === 0) return;
  // Update across BOTH tiers — cold-fallback rows (large historical archives
  // that hit Supabase 413 and went direct to B2) need state='active' too.
  await client.query(
    `UPDATE data_archive_manifest
       SET state = 'active', hot_partition_dropped_at = NOW()
     WHERE source_table = $1
       AND partition_label = ANY($2::text[])
       AND state = 'verified'`,
    [SOURCE_TABLE, monthLabels],
  );
}

async function vacuumTable(client: pg.Client): Promise<void> {
  // VACUUM cannot run inside a transaction. Plain VACUUM (no FULL) — no exclusive lock.
  await client.query(`VACUUM ${SOURCE_TABLE}`);
}

export interface ContextFinalizeDependencies {
  listDeletePopulationLabels: typeof listDeletePopulationLabels;
  proofCountStillMatches: typeof proofCountStillMatches;
  rowsPresent: typeof monthRowsPresent;
  deleteRows: typeof deleteOldRows;
  markActive: typeof markMonthsActive;
}

const DEFAULT_CONTEXT_FINALIZE_DEPS: ContextFinalizeDependencies = {
  listDeletePopulationLabels,
  proofCountStillMatches,
  rowsPresent: monthRowsPresent,
  deleteRows: deleteOldRows,
  markActive: markMonthsActive,
};

/**
 * Re-check every admitted month while source writes are excluded, then delete
 * and mark the same labels through the same client. This closes the interval
 * between the earlier archive/reuse decision and the destructive boundary.
 */
export async function finalizeContextDeletion(
  client: pg.Client,
  cfg: ContextBridgeConfig,
  cutoff: Date,
  monthLabels: string[],
  guards: ContextDeletionGuard[],
  deps: ContextFinalizeDependencies = DEFAULT_CONTEXT_FINALIZE_DEPS,
): Promise<{ deleted: number }> {
  const guardedLabels = guards.map((guard) => guard.month.label);
  if (
    guardedLabels.length !== monthLabels.length ||
    guardedLabels.some((label, index) => label !== monthLabels[index])
  ) {
    throw new Error('[B75 ctx-bridge] deletion labels do not match their final proof guards');
  }

  await client.query('BEGIN');
  try {
    // SHARE ROW EXCLUSIVE conflicts with INSERT/UPDATE/DELETE on the source
    // table. Once acquired, the final recount/empty check and DELETE share one
    // write-free interval on this client.
    await client.query(`LOCK TABLE ${SOURCE_TABLE} IN SHARE ROW EXCLUSIVE MODE`);
    const deletePopulationLabels = await deps.listDeletePopulationLabels(client, cutoff);
    const guardedLabelSet = new Set(guardedLabels);
    const unguardedLabels = deletePopulationLabels.filter((label) => !guardedLabelSet.has(label));
    if (unguardedLabels.length > 0) {
      throw new Error(
        `[B75 ctx-bridge] cutoff delete includes unguarded month(s): ${unguardedLabels.join(', ')}`,
      );
    }
    for (const guard of guards) {
      if (guard.kind === 'proven-count') {
        const same = await deps.proofCountStillMatches(client, guard.manifestId, {
          target: `"${SOURCE_TABLE}"`,
          tsCol: `"${TS_COLUMN}"`,
          rangeStart: guard.month.start,
          rangeEnd: guard.month.end,
        });
        if (!same) {
          throw new NonProvenExistingCopyError(
            'reuse-count-changed',
            SOURCE_TABLE,
            guard.month.label,
          );
        }
      } else if (await deps.rowsPresent(client, guard.month)) {
        throw new NonProvenExistingCopyError(guard.reason, SOURCE_TABLE, guard.month.label);
      }
    }

    const result = await deps.deleteRows(client, cfg, cutoff);
    await deps.markActive(client, monthLabels);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export interface ContextBridgeCycleDependencies {
  archiveMonth: (month: ContextMonthRange) => Promise<ContextMonthResult>;
  finalize: (
    cutoff: Date,
    labels: string[],
    guards: ContextDeletionGuard[],
  ) => Promise<{ deleted: number }>;
  vacuum: () => Promise<void>;
}

/**
 * The outer deletion fence.  A month is admitted to `completedLabels` only
 * after export or a successful reuse recount.  Any month failure rejects this
 * function before delete, active marking, or VACUUM can be reached.
 */
export async function runContextBridgeCycle(
  months: ContextMonthRange[],
  deleteCutoff: Date,
  deps: ContextBridgeCycleDependencies,
): Promise<{ archivedRows: number; archivedBytes: number; deleted: number; completedLabels: string[] }> {
  let archivedRows = 0;
  let archivedBytes = 0;
  const completedLabels: string[] = [];
  const deletionGuards: ContextDeletionGuard[] = [];
  for (const month of months) {
    const result = await deps.archiveMonth(month);
    archivedRows += result.rowCount;
    archivedBytes += result.bytesCompressed;
    completedLabels.push(month.label);
    deletionGuards.push(result.deletionGuard);
  }

  const { deleted } = await deps.finalize(deleteCutoff, completedLabels, deletionGuards);
  await deps.vacuum();
  return { archivedRows, archivedBytes, deleted, completedLabels };
}

export interface ContextBridgeCliDependencies {
  env: NodeJS.ProcessEnv;
  exit: (code: number) => void;
  run: () => Promise<void>;
}

export async function runContextBridgeLogTtlCli(
  deps: ContextBridgeCliDependencies = {
    env: process.env,
    exit: (code) => process.exit(code),
    run: runContextBridgeLogTtlCliBody,
  },
): Promise<void> {
  if (!deps.env.DATABASE_URL) {
    console.error('[B75 ctx-bridge] DATABASE_URL not set');
    deps.exit(1);
    return;
  }
  if (!deps.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[B75 ctx-bridge] SUPABASE_SERVICE_ROLE_KEY not set');
    deps.exit(1);
    return;
  }
  await deps.run();
}

async function runContextBridgeLogTtlCliBody(): Promise<void> {
  const startedAt = new Date();
  const ctl = new Client({ connectionString: process.env.DATABASE_URL });
  await ctl.connect();
  let cfg: ContextBridgeConfig;
  try {
    cfg = await loadConfig(ctl);
  } finally {
    await ctl.end();
  }

  const cutoff = new Date(Date.now() - cfg.retentionDays * 86_400_000);
  // B2 fix (Langston Step-4 review): only delete rows whose ENTIRE month has
  // been archived. Partial-month rows beyond hot retention wait until next
  // sweep when their month becomes whole. Honors "never drop data" directive.
  const deleteCutoff = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1),
  );
  console.log(
    `[B75 ctx-bridge] started at ${startedAt.toISOString()} ` +
      `retention_cutoff=${cutoff.toISOString()} ` +
      `delete_cutoff=${deleteCutoff.toISOString()} (rounded to month-start; retentionDays=${cfg.retentionDays})`,
  );

  // Step 1: enumerate whole months to archive
  const listClient = new Client({ connectionString: process.env.DATABASE_URL });
  await listClient.connect();
  let monthsToExport: ContextMonthRange[];
  try {
    const r = await listMonthsToExport(listClient, cutoff);
    monthsToExport = r.months;
    if (r.oldestTs) {
      console.log(`[B75 ctx-bridge] oldest row=${r.oldestTs.toISOString()}; ${r.months.length} whole months to archive`);
    } else {
      console.log('[B75 ctx-bridge] no rows older than cutoff; archive phase skipped');
    }
  } finally {
    await listClient.end();
  }

  const result = await runContextBridgeCycle(monthsToExport, deleteCutoff, {
    archiveMonth: async (month) => {
      const exportClient = new Client({ connectionString: process.env.DATABASE_URL });
      const ctlClient = new Client({ connectionString: process.env.DATABASE_URL });
      await exportClient.connect();
      await ctlClient.connect();
      try {
        return await exportAndUploadContextMonth(exportClient, ctlClient, cfg, month);
      } finally {
        await exportClient.end().catch(() => {});
        await ctlClient.end().catch(() => {});
      }
    },
    finalize: async (cutoff, labels, guards) => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        const deleted = await finalizeContextDeletion(client, cfg, cutoff, labels, guards);
        console.log(`[B75 ctx-bridge] deleted=${deleted.deleted} rows`);
        return deleted;
      } finally {
        await client.end();
      }
    },
    vacuum: async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        console.log('[B75 ctx-bridge] running VACUUM context_bridge_log ...');
        await vacuumTable(client);
        console.log('[B75 ctx-bridge] VACUUM complete');
      } finally {
        await client.end();
      }
    },
  });

  const totalMs = Date.now() - startedAt.getTime();
  console.log(
    `[B75 ctx-bridge] DONE — months_archived=${monthsToExport.length} rows_archived=${result.archivedRows} ` +
      `bytes_archived=${result.archivedBytes} rows_deleted=${result.deleted} duration_ms=${totalMs}`,
  );
}

export interface ContextBridgeProcessDependencies {
  runCli: () => Promise<void>;
  exit: (code: number) => void;
}

export async function runContextBridgeLogTtlProcess(
  deps: ContextBridgeProcessDependencies = {
    runCli: () => runContextBridgeLogTtlCli(),
    exit: (code) => process.exit(code),
  },
): Promise<void> {
  try {
    await deps.runCli();
  } catch (err) {
    console.error('[B75 ctx-bridge] fatal:', err);
    deps.exit(1);
  }
}

if (isDirectEntry(import.meta.url)) {
  void runContextBridgeLogTtlProcess();
}
