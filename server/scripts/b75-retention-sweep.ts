/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B75 — Retention Sweep (B74 passive-archive tables)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Daily 02:15 UTC. For each B74 partitioned table, identifies whole monthly
 * partitions older than the per-table hot retention, exports each to JSONL.gz
 * in the warm bucket, verifies, registers in the manifest, then DROPs the
 * partition. State machine ensures crash recovery and idempotency.
 *
 * Cron line (add to /etc/cron.d/dawntrader on staging):
 *   15 2 * * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b75-retention-sweep.ts >> /var/log/dawntrader/b75-retention.log 2>&1
 *
 * State machine (data_archive_manifest.state):
 *   pending → uploaded → verified → active
 *
 * Crash recovery: on restart, manifest rows in {pending, uploaded, verified}
 * resume from last good state. No double-export.
 *
 * Reference: BATCH_75_SCOPE.md §C.1 + BATCH_75_PRE_AUDIT.md §B.2 + §E
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
import { exportPartition, sha256OfFile } from '../services/data-archive/partition-exporter.js';
import { getStorageClient, sha256Hex } from '../services/data-archive/storage-client.js';

const { Client } = pg;

// ───────────────────────────────────────────────────────────────────────────
// Table inventory — one row per B74 archive table
// ───────────────────────────────────────────────────────────────────────────

interface B74TableSpec {
  parent: string;
  timestampColumn: string;
  retentionConstantName: string; // key in module_constants under data_lifecycle
}

const B74_TABLES: B74TableSpec[] = [
  { parent: 'equity_spot_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'equity_spot_ticker_snap.hot_retention_days' },
  { parent: 'equity_perp_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'equity_perp_ticker_snap.hot_retention_days' },
  { parent: 'crypto_spot_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'crypto_spot_ticker_snap.hot_retention_days' },
  { parent: 'equity_spot_ohlc_1m',     timestampColumn: 'ts',          retentionConstantName: 'equity_spot_ohlc_1m.hot_retention_days' },
  { parent: 'equity_perp_ohlc_1m',     timestampColumn: 'ts',          retentionConstantName: 'equity_perp_ohlc_1m.hot_retention_days' },
  { parent: 'crypto_spot_ohlc_1m',     timestampColumn: 'ts',          retentionConstantName: 'crypto_spot_ohlc_1m.hot_retention_days' },
];

// ───────────────────────────────────────────────────────────────────────────
// Config loader
// ───────────────────────────────────────────────────────────────────────────

interface SweepConfig {
  warmBucket: string;
  warmPrefix: string;
  retentionByTable: Map<string, number>;
}

async function loadConfig(client: pg.Client): Promise<SweepConfig> {
  const r = await client.query(
    `SELECT constant_name, value FROM module_constants
       WHERE module_name = 'data_lifecycle'`,
  );
  const map = new Map<string, unknown>();
  for (const row of r.rows) map.set(row.constant_name, row.value);

  function reqStr(key: string): string {
    const v = map.get(key);
    if (typeof v !== 'string') {
      throw new Error(`[B75 sweep] missing or non-string data_lifecycle.${key}`);
    }
    return v;
  }
  function reqNum(key: string): number {
    const v = map.get(key);
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new Error(`[B75 sweep] missing or invalid numeric data_lifecycle.${key}`);
    }
    return v;
  }

  const retentionByTable = new Map<string, number>();
  for (const spec of B74_TABLES) {
    retentionByTable.set(spec.parent, reqNum(spec.retentionConstantName));
  }

  return {
    warmBucket: reqStr('warm_bucket'),
    warmPrefix: reqStr('warm_prefix'),
    retentionByTable,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Partition listing
// ───────────────────────────────────────────────────────────────────────────

interface PartitionRow {
  parent: string;
  child: string;
  partitionLabel: string; // 'YYYY-MM'
  rangeStart: Date;
  rangeEnd: Date;
}

async function listOldPartitions(
  client: pg.Client,
  parent: string,
  cutoffMonthStart: Date,
): Promise<PartitionRow[]> {
  // Pull child partition names + bounds. Bounds parse via FOR VALUES range expression.
  const r = await client.query(
    `SELECT child.relname AS child_name,
            pg_get_expr(child.relpartbound, child.oid) AS bound_expr
       FROM pg_inherits
       JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
       JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
      WHERE parent.relname = $1`,
    [parent],
  );

  const out: PartitionRow[] = [];
  for (const row of r.rows) {
    const m = /(\d{4})_(\d{2})$/.exec(row.child_name);
    if (!m) continue;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const rangeStart = new Date(Date.UTC(year, month - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, month, 1));
    if (rangeStart >= cutoffMonthStart) continue; // not old enough
    out.push({
      parent,
      child: row.child_name,
      partitionLabel: `${year}-${String(month).padStart(2, '0')}`,
      rangeStart,
      rangeEnd,
    });
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Manifest helpers
// ───────────────────────────────────────────────────────────────────────────

interface ManifestRow {
  id: string;
  state: string;
  storage_uri: string;
  checksum: string;
  hot_partition_dropped_at: Date | null;
}

async function getManifestRow(
  client: pg.Client,
  sourceTable: string,
  partitionLabel: string,
  tier: 'warm' | 'cold' = 'warm',
): Promise<ManifestRow | null> {
  const r = await client.query(
    `SELECT id, state, storage_uri, checksum, hot_partition_dropped_at
       FROM data_archive_manifest
      WHERE source_table = $1 AND partition_label = $2 AND tier = $3
      LIMIT 1`,
    [sourceTable, partitionLabel, tier],
  );
  return r.rows[0] ?? null;
}

async function upsertManifestPending(
  client: pg.Client,
  sourceTable: string,
  partitionLabel: string,
  storageUri: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<string> {
  const r = await client.query(
    `INSERT INTO data_archive_manifest (
       source_table, partition_label, tier, state, storage_uri,
       min_ts, max_ts, date_range_start, date_range_end,
       row_count, bytes_compressed, checksum, format, compression
     ) VALUES ($1, $2, 'warm', 'pending', $3,
              $4, $5, $4, $5,
              0, 0, '', 'jsonl.gz', 'gzip')
     ON CONFLICT (source_table, partition_label, tier) DO UPDATE
       SET state = CASE
                     WHEN data_archive_manifest.state IN ('active', 'migrating', 'migrated')
                       THEN data_archive_manifest.state
                     ELSE 'pending'
                   END,
           storage_uri = EXCLUDED.storage_uri
     RETURNING id`,
    [sourceTable, partitionLabel, storageUri, rangeStart, rangeEnd],
  );
  return r.rows[0].id;
}

async function updateManifestUploaded(
  client: pg.Client,
  id: string,
  rowCount: number,
  bytesCompressed: number,
  minTs: Date,
  maxTs: Date,
  checksum: string,
  originalPartitionSizeBytes: number,
): Promise<void> {
  await client.query(
    `UPDATE data_archive_manifest
       SET state = 'uploaded',
           row_count = $2,
           bytes_compressed = $3,
           min_ts = $4,
           max_ts = $5,
           checksum = $6,
           original_partition_size_bytes = $7
     WHERE id = $1`,
    [id, rowCount, bytesCompressed, minTs, maxTs, checksum, originalPartitionSizeBytes],
  );
}

async function updateManifestVerified(client: pg.Client, id: string): Promise<void> {
  await client.query(
    `UPDATE data_archive_manifest
       SET state = 'verified', verified_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

async function updateManifestActive(client: pg.Client, id: string): Promise<void> {
  await client.query(
    `UPDATE data_archive_manifest
       SET state = 'active', hot_partition_dropped_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Per-partition processing
// ───────────────────────────────────────────────────────────────────────────

interface PartitionStats {
  rowCount: number;
  bytesHot: number;
}

async function partitionStats(client: pg.Client, partitionTable: string): Promise<PartitionStats> {
  const r = await client.query(
    `SELECT pg_total_relation_size($1::regclass) AS bytes_hot`,
    [partitionTable],
  );
  return {
    rowCount: 0, // filled by exporter
    bytesHot: Number(r.rows[0].bytes_hot ?? 0),
  };
}

async function dropPartition(client: pg.Client, partitionTable: string): Promise<void> {
  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(partitionTable)}`);
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`[B75 sweep] unsafe identifier: ${name}`);
  }
  return `"${name}"`;
}

interface ProcessResult {
  status: 'dropped' | 'verified-only' | 'skipped' | 'failed';
  bytesHot: number;
  bytesWarm: number;
  rowCount: number;
  durationMs: number;
  reason?: string;
}

async function processPartition(
  spec: B74TableSpec,
  partition: PartitionRow,
  cfg: SweepConfig,
): Promise<ProcessResult> {
  const start = Date.now();

  // Fresh client for this partition's snapshot work — keeps the long REPEATABLE
  // READ transaction isolated from manifest UPDATEs (which run on a different client).
  const exportClient = new Client({ connectionString: process.env.DATABASE_URL });
  const ctlClient = new Client({ connectionString: process.env.DATABASE_URL });
  await exportClient.connect();
  await ctlClient.connect();

  try {
    // Idempotency check: if already 'active' (= hot dropped), skip
    const existing = await getManifestRow(ctlClient, spec.parent, partition.partitionLabel, 'warm');
    if (existing && existing.state === 'active') {
      return {
        status: 'skipped',
        bytesHot: 0,
        bytesWarm: 0,
        rowCount: 0,
        durationMs: Date.now() - start,
        reason: 'already-active',
      };
    }

    const stats = await partitionStats(ctlClient, partition.child);
    const storageUri = `supabase://${cfg.warmBucket}/${cfg.warmPrefix}/${spec.parent}/${partition.partitionLabel}.jsonl.gz`;
    const manifestId = await upsertManifestPending(
      ctlClient,
      spec.parent,
      partition.partitionLabel,
      storageUri,
      partition.rangeStart,
      partition.rangeEnd,
    );

    let exportRes: Awaited<ReturnType<typeof exportPartition>> | null = null;

    // Skip export if already uploaded+verified from a prior crashed run
    if (existing && existing.state === 'verified' && existing.checksum) {
      // Resume at DROP step
    } else {
      // Step 2-5: snapshot + export
      exportRes = await exportPartition(exportClient, {
        sourceTable: spec.parent,
        partitionLabel: partition.partitionLabel,
        rangeStart: partition.rangeStart,
        rangeEnd: partition.rangeEnd,
        timestampColumn: spec.timestampColumn,
        partitionTableName: partition.child,
      });

      // Step 6: upload to warm bucket
      const data = fs.readFileSync(exportRes.localPath);
      const storage = getStorageClient();
      const upload = await storage.uploadWarm(
        cfg.warmBucket,
        `${cfg.warmPrefix}/${spec.parent}/${partition.partitionLabel}.jsonl.gz`,
        data,
      );

      // Step 7: re-read from bucket, recompute checksum
      const readBack = await storage.downloadWarm(
        cfg.warmBucket,
        `${cfg.warmPrefix}/${spec.parent}/${partition.partitionLabel}.jsonl.gz`,
      );
      const localChecksum = exportRes.checksum;
      if (readBack.checksum !== localChecksum || upload.checksum !== localChecksum) {
        throw new Error(
          `[B75 sweep] checksum mismatch on re-read: ` +
            `local=${localChecksum} uploaded=${upload.checksum} readback=${readBack.checksum}`,
        );
      }

      await updateManifestUploaded(
        ctlClient,
        manifestId,
        exportRes.rowCount,
        exportRes.bytesCompressed,
        exportRes.minTs,
        exportRes.maxTs,
        localChecksum,
        stats.bytesHot,
      );

      // Step 8: verify min_ts >= rangeStart, max_ts < rangeEnd, row count > 0 OR partition empty
      if (exportRes.rowCount > 0) {
        if (exportRes.minTs < partition.rangeStart) {
          throw new Error(
            `[B75 sweep] export min_ts (${exportRes.minTs.toISOString()}) < partition rangeStart (${partition.rangeStart.toISOString()})`,
          );
        }
        if (exportRes.maxTs >= partition.rangeEnd) {
          throw new Error(
            `[B75 sweep] export max_ts (${exportRes.maxTs.toISOString()}) >= partition rangeEnd (${partition.rangeEnd.toISOString()})`,
          );
        }
      }

      await updateManifestVerified(ctlClient, manifestId);

      // Cleanup local temp file (warm bucket is now the canonical copy)
      try {
        fs.unlinkSync(exportRes.localPath);
      } catch {
        // ignore
      }
    }

    // Step 10: DROP partition
    await dropPartition(ctlClient, partition.child);
    await updateManifestActive(ctlClient, manifestId);

    return {
      status: 'dropped',
      bytesHot: stats.bytesHot,
      bytesWarm: exportRes?.bytesCompressed ?? 0,
      rowCount: exportRes?.rowCount ?? 0,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 'failed',
      bytesHot: 0,
      bytesWarm: 0,
      rowCount: 0,
      durationMs: Date.now() - start,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await exportClient.end().catch(() => {
      // ignore
    });
    await ctlClient.end().catch(() => {
      // ignore
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[B75 sweep] DATABASE_URL not set');
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[B75 sweep] SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  const ctl = new Client({ connectionString: process.env.DATABASE_URL });
  await ctl.connect();
  let cfg: SweepConfig;
  try {
    cfg = await loadConfig(ctl);
  } finally {
    await ctl.end();
  }

  const startedAt = new Date();
  let partitionsExamined = 0;
  let partitionsDropped = 0;
  let partitionsFailed = 0;
  let bytesFreedTotal = 0;
  let bytesArchivedTotal = 0;

  console.log(`[B75 sweep] started at ${startedAt.toISOString()}`);

  for (const spec of B74_TABLES) {
    const retentionDays = cfg.retentionByTable.get(spec.parent)!;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const cutoffMonth = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1));

    const ctlList = new Client({ connectionString: process.env.DATABASE_URL });
    await ctlList.connect();
    let oldPartitions: PartitionRow[];
    try {
      oldPartitions = await listOldPartitions(ctlList, spec.parent, cutoffMonth);
    } finally {
      await ctlList.end();
    }

    if (oldPartitions.length === 0) {
      console.log(
        `[B75 sweep] ${spec.parent}: no partitions older than ${cutoffMonth.toISOString().slice(0, 10)} (retentionDays=${retentionDays})`,
      );
      continue;
    }

    for (const partition of oldPartitions) {
      partitionsExamined++;
      console.log(
        `[B75 sweep] ${spec.parent}: processing partition=${partition.partitionLabel} child=${partition.child}`,
      );
      const res = await processPartition(spec, partition, cfg);
      if (res.status === 'dropped') {
        partitionsDropped++;
        bytesFreedTotal += res.bytesHot;
        bytesArchivedTotal += res.bytesWarm;
        console.log(
          `[B75 sweep] ${spec.parent}/${partition.partitionLabel}: dropped ` +
            `rows=${res.rowCount} bytes_hot=${res.bytesHot} bytes_warm=${res.bytesWarm} ` +
            `compression_ratio=${res.bytesHot && res.bytesWarm ? (res.bytesHot / res.bytesWarm).toFixed(2) : 'n/a'} ` +
            `duration_ms=${res.durationMs}`,
        );
      } else if (res.status === 'skipped') {
        console.log(
          `[B75 sweep] ${spec.parent}/${partition.partitionLabel}: skipped (${res.reason})`,
        );
      } else if (res.status === 'failed') {
        partitionsFailed++;
        console.error(
          `[B75 sweep] ${spec.parent}/${partition.partitionLabel}: FAILED — ${res.reason} (duration_ms=${res.durationMs})`,
        );
      }
    }
  }

  const totalMs = Date.now() - startedAt.getTime();
  console.log(
    `[B75 sweep] DONE — examined=${partitionsExamined} dropped=${partitionsDropped} ` +
      `failed=${partitionsFailed} bytes_freed=${bytesFreedTotal} ` +
      `bytes_archived=${bytesArchivedTotal} duration_ms=${totalMs}`,
  );

  if (partitionsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[B75 sweep] fatal:', err);
  process.exit(1);
});
