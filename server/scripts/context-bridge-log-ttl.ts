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
import { exportPartition } from '../services/data-archive/partition-exporter.js';
import { getStorageClient } from '../services/data-archive/storage-client.js';

const { Client } = pg;

const SOURCE_TABLE = 'context_bridge_log';
const TS_COLUMN = 'timestamp';

interface Cfg {
  retentionDays: number;
  batchSize: number;
  pauseMs: number;
  warmBucket: string;
  warmPrefix: string;
}

async function loadConfig(client: pg.Client): Promise<Cfg> {
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
  };
}

interface MonthRange {
  label: string; // 'YYYY-MM'
  start: Date;
  end: Date;
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
): Promise<{ months: MonthRange[]; oldestTs: Date | null }> {
  const r = await client.query(
    `SELECT MIN(${TS_COLUMN}) AS oldest FROM ${SOURCE_TABLE}
       WHERE ${TS_COLUMN} < $1`,
    [cutoff],
  );
  const oldest = r.rows[0]?.oldest as Date | null;
  if (!oldest) return { months: [], oldestTs: null };

  const months: MonthRange[] = [];
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
): Promise<{ id: string; state: string } | null> {
  const r = await client.query(
    `SELECT id, state FROM data_archive_manifest
      WHERE source_table = $1 AND partition_label = $2 AND tier = 'warm'
      LIMIT 1`,
    [SOURCE_TABLE, partitionLabel],
  );
  return r.rows[0] ?? null;
}

async function exportAndUploadMonth(
  exportClient: pg.Client,
  ctlClient: pg.Client,
  cfg: Cfg,
  month: MonthRange,
): Promise<{ rowCount: number; bytesCompressed: number }> {
  const existing = await getManifestState(ctlClient, month.label);
  if (existing && existing.state === 'active') {
    // Already archived AND deleted-from-hot in a prior run; nothing to do here.
    // The DELETE for this month should already have run; tail-delete will skip.
    console.log(`[B75 ctx-bridge] ${month.label}: already active (skipped)`);
    return { rowCount: 0, bytesCompressed: 0 };
  }

  const exportRes = await exportPartition(exportClient, {
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

  // Upload + verify
  const data = fs.readFileSync(exportRes.localPath);
  const storage = getStorageClient();
  const upload = await storage.uploadWarm(
    cfg.warmBucket,
    `${cfg.warmPrefix}/${SOURCE_TABLE}/${month.label}.jsonl.gz`,
    data,
  );
  const readBack = await storage.downloadWarm(
    cfg.warmBucket,
    `${cfg.warmPrefix}/${SOURCE_TABLE}/${month.label}.jsonl.gz`,
  );
  if (upload.checksum !== exportRes.checksum || readBack.checksum !== exportRes.checksum) {
    throw new Error(
      `[B75 ctx-bridge] ${month.label}: checksum mismatch ` +
        `local=${exportRes.checksum} upload=${upload.checksum} readback=${readBack.checksum}`,
    );
  }

  await ctlClient.query(
    `UPDATE data_archive_manifest
       SET state = 'verified',
           verified_at = NOW(),
           row_count = $2,
           bytes_compressed = $3,
           min_ts = $4,
           max_ts = $5,
           checksum = $6
     WHERE id = $1`,
    [
      manifestId,
      exportRes.rowCount,
      exportRes.bytesCompressed,
      exportRes.minTs,
      exportRes.maxTs,
      exportRes.checksum,
    ],
  );

  // Cleanup local temp
  try {
    fs.unlinkSync(exportRes.localPath);
  } catch {
    // ignore
  }

  console.log(
    `[B75 ctx-bridge] ${month.label}: exported rows=${exportRes.rowCount} bytes=${exportRes.bytesCompressed}`,
  );

  return { rowCount: exportRes.rowCount, bytesCompressed: exportRes.bytesCompressed };
}

async function deleteOldRows(
  client: pg.Client,
  cfg: Cfg,
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
  await client.query(
    `UPDATE data_archive_manifest
       SET state = 'active', hot_partition_dropped_at = NOW()
     WHERE source_table = $1
       AND partition_label = ANY($2::text[])
       AND tier = 'warm'
       AND state = 'verified'`,
    [SOURCE_TABLE, monthLabels],
  );
}

async function vacuumTable(client: pg.Client): Promise<void> {
  // VACUUM cannot run inside a transaction. Plain VACUUM (no FULL) — no exclusive lock.
  await client.query(`VACUUM ${SOURCE_TABLE}`);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[B75 ctx-bridge] DATABASE_URL not set');
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[B75 ctx-bridge] SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  const startedAt = new Date();
  const ctl = new Client({ connectionString: process.env.DATABASE_URL });
  await ctl.connect();
  let cfg: Cfg;
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
  let monthsToExport: MonthRange[];
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

  // Step 2: export+verify each month
  let totalArchivedRows = 0;
  let totalArchivedBytes = 0;
  const monthLabels: string[] = [];
  for (const month of monthsToExport) {
    const exportClient = new Client({ connectionString: process.env.DATABASE_URL });
    const ctlClient = new Client({ connectionString: process.env.DATABASE_URL });
    await exportClient.connect();
    await ctlClient.connect();
    try {
      const { rowCount, bytesCompressed } = await exportAndUploadMonth(
        exportClient,
        ctlClient,
        cfg,
        month,
      );
      totalArchivedRows += rowCount;
      totalArchivedBytes += bytesCompressed;
      monthLabels.push(month.label);
    } finally {
      await exportClient.end().catch(() => {});
      await ctlClient.end().catch(() => {});
    }
  }

  // Step 3: delete only rows whose whole month has been exported to warm tier
  // (deleteCutoff = month-start of retention cutoff). Partial-month tail stays
  // in hot tier until next sweep when its month becomes whole. B2 fix.
  const delClient = new Client({ connectionString: process.env.DATABASE_URL });
  await delClient.connect();
  let deleted = 0;
  try {
    const r = await deleteOldRows(delClient, cfg, deleteCutoff);
    deleted = r.deleted;
    console.log(`[B75 ctx-bridge] deleted=${deleted} rows`);
    await markMonthsActive(delClient, monthLabels);
  } finally {
    await delClient.end();
  }

  // Step 4: VACUUM (separate connection — VACUUM cannot run in tx)
  const vacClient = new Client({ connectionString: process.env.DATABASE_URL });
  await vacClient.connect();
  try {
    console.log('[B75 ctx-bridge] running VACUUM context_bridge_log ...');
    await vacuumTable(vacClient);
    console.log('[B75 ctx-bridge] VACUUM complete');
  } finally {
    await vacClient.end();
  }

  const totalMs = Date.now() - startedAt.getTime();
  console.log(
    `[B75 ctx-bridge] DONE — months_archived=${monthsToExport.length} rows_archived=${totalArchivedRows} ` +
      `bytes_archived=${totalArchivedBytes} rows_deleted=${deleted} duration_ms=${totalMs}`,
  );
}

main().catch((err) => {
  console.error('[B75 ctx-bridge] fatal:', err);
  process.exit(1);
});
