/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B75 — Retention Sweep (B74 passive-archive tables) — B-NEW-47 streaming+slicing
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Daily 02:15 UTC. For each B74 partitioned table, identifies whole monthly
 * partitions older than the per-table hot retention and archives them to the
 * warm bucket (export → upload → download-verify → DROP), crash-safe via the
 * data_archive_manifest state machine.
 *
 * B-NEW-47 (RUNNING_ISSUES #161): the original loaded each whole partition into
 * a Buffer before upload (OOM on the 3.7 GB-RAM box for the 31 GB May ticker
 * partition) and a single object can exceed the Supabase 5 GB project cap. Fixed
 * with ADAPTIVE PER-DAY SLICING + STREAMED I/O:
 *   - hotBytes >= slice_threshold_hot_bytes (DB-governed) → export the partition
 *     in per-DAY slices, each a separate `YYYY-MM-DD` warm object + manifest row.
 *   - below threshold → one `YYYY-MM` object as before.
 *   - all uploads stream from a file path (uploadWarmFile); all verifies stream
 *     a download to a temp file (downloadWarmFile) — peak memory ~6 MiB.
 *   - DROP the monthly DB partition ONLY after EVERY distinct date present in the
 *     partition has a download-verified manifest row.
 *
 * WRITE-SEALED INVARIANT (Langston Step-2 fold-in #1): a partition is eligible
 * only when `rangeStart < cutoffMonthStart` — i.e. its whole month is in the
 * past and live writers target a LATER month. The per-slice snapshots, the
 * stable-hotBytes resume guard, and the distinct-dates DROP gate are all correct
 * ONLY because an eligible partition is write-sealed (no concurrent mutation).
 *
 * Cron line (root crontab on staging — installed in B-NEW-47 Step 6):
 *   15 2 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b75-retention-sweep.ts" >> /var/log/dawntrader/b75-retention.log 2>&1
 *
 * State machine (data_archive_manifest.state): pending → uploaded → verified → active
 * Crash recovery: verified/active slices are SKIPPED on resume (no re-export).
 *
 * Reference: BATCH_75_SCOPE.md §C.1 + B_NEW_47_SCOPE.md §8 + B_NEW_47_PRE_AUDIT.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
import { exportPartition } from '../services/data-archive/partition-exporter.js';
import { getStorageClient, type StorageClient } from '../services/data-archive/storage-client.js';
import {
  classifyPartition,
  decideSliceMode,
  enumerateUtcDays,
  dayLabel,
  deriveModeFromLabels,
  isPartitionEligible,
} from '../services/data-archive/sweep-slicing.js';
import { addAlert } from '../services/system-alerts.js';

const { Client } = pg;

/** 5 GB Supabase project upload cap (mirrors storage-client HARD_CAP). A single
 *  object — whole month OR one day-slice — exceeding this fails fast. There is
 *  no sub-day fallback (Langston fold-in #3): a single day over the cap stalls
 *  that partition and alerts nightly. Not reachable at current volumes
 *  (~300–500 MB/day) — documented boundary in RUNNING_ISSUES. */
const HARD_CAP_BYTES = 5 * 1024 * 1024 * 1024;

// ───────────────────────────────────────────────────────────────────────────
// Table inventory — one row per B74 archive table
// ───────────────────────────────────────────────────────────────────────────

interface B74TableSpec {
  parent: string;
  timestampColumn: string;
  retentionConstantName: string; // key in module_constants under data_lifecycle
}

const B74_TABLES: B74TableSpec[] = [
  { parent: 'xstock_spot_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'xstock_spot_ticker_snap.hot_retention_days' },
  { parent: 'xstock_perp_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'xstock_perp_ticker_snap.hot_retention_days' },
  { parent: 'crypto_spot_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'crypto_spot_ticker_snap.hot_retention_days' },
  { parent: 'xstock_spot_ohlc_1m',     timestampColumn: 'ts',          retentionConstantName: 'xstock_spot_ohlc_1m.hot_retention_days' },
  { parent: 'xstock_perp_ohlc_1m',     timestampColumn: 'ts',          retentionConstantName: 'xstock_perp_ohlc_1m.hot_retention_days' },
  { parent: 'crypto_spot_ohlc_1m',     timestampColumn: 'ts',          retentionConstantName: 'crypto_spot_ohlc_1m.hot_retention_days' },
];

// ───────────────────────────────────────────────────────────────────────────
// B-STORAGE-HARDEN Wave C (OBJ-2) — B70 analytics archive tables
// ───────────────────────────────────────────────────────────────────────────
// Kyle "we don't ever drop data" directive (2026-05-06): the B70 analytics
// tables were DROP-only via the now-DELETED `b70-retention-sweep.ts` (RUNNING_
// ISSUES #430 V1). They are monthly RANGE-partitioned by `captured_at` — the
// IDENTICAL shape as the B74 tables above — so they route through the SAME
// export→warm→verify→DROP-only-after-verify path (then the table-agnostic
// cold-rotator moves warm→cold at 365d, preserving them indefinitely).
// Each entry's `retentionConstantName` is per-table isolated (Langston Step-2):
// a B70 config gap fails ONLY that table's `reqNum`, never a B74 table.
const B70_TABLES: B74TableSpec[] = [
  { parent: 'signal_eval_archive',     timestampColumn: 'captured_at', retentionConstantName: 'signal_eval_archive.hot_retention_days' },
  { parent: 'pair_scan_archive',       timestampColumn: 'captured_at', retentionConstantName: 'pair_scan_archive.hot_retention_days' },
  { parent: 'exit_decision_archive',   timestampColumn: 'captured_at', retentionConstantName: 'exit_decision_archive.hot_retention_days' },
  { parent: 'macro_feed_archive',      timestampColumn: 'captured_at', retentionConstantName: 'macro_feed_archive.hot_retention_days' },
  { parent: 'signal_eval_provenance',  timestampColumn: 'captured_at', retentionConstantName: 'signal_eval_provenance.hot_retention_days' },
  { parent: 'switch_on_shadow_evidence', timestampColumn: 'captured_at', retentionConstantName: 'switch_on_shadow_evidence.hot_retention_days' }, // B-EVIDENCE-SINK: tiers hot→warm→cold like the others
];

// All monthly-partitioned archive tables processed by the same export→warm→drop
// loop (B74 market-data + B70 analytics). Handling is identical — only the
// per-table timestamp column + retention constant differ.
const PARTITIONED_TABLES: B74TableSpec[] = [...B74_TABLES, ...B70_TABLES];

// ───────────────────────────────────────────────────────────────────────────
// P19-B5c — PLAIN (non-partitioned) retention tables
// ───────────────────────────────────────────────────────────────────────────
// B75's partition machinery (pg_inherits / monthly YYYY_MM children / cold
// archive) does NOT apply to a plain table — a plain table has no partition
// children, so the partition loop above silently no-ops it. These tables get a
// batched age-DELETE + VACUUM instead (the canonical context-bridge-log-ttl
// pattern), NO cold-offload. This keeps B75 the SINGLE retention owner (one
// cron / one script) without partitioning a small derived-telemetry table.
// Table identifiers below are a STATIC allow-list (never user input) — safe to
// interpolate into the DELETE/VACUUM (Postgres has no bind param for an ident).
interface PlainRetentionTableSpec {
  table: string;
  timestampColumn: string;
  retentionConstantName: string; // key in module_constants under data_lifecycle
  // B-TRADE-TIER-REGISTER (#599): move-not-delete for PRIMARY-record plain tables.
  // archive:true = export age-eligible rows per present day (JSONL.gz -> warm TUS ->
  // checksum -> data_archive_manifest) and DELETE ONLY when every present day's
  // manifest row is verified/active (the partitioned lane's :698-701 gate, same
  // safety property). Absent/false = the original P19-B5c delete-only lane
  // (derived telemetry, STORAGE_POLICY-exempt with the why stated there).
  archive?: boolean;
  // STATIC SQL fragment ANDed into export + delete (allow-listed, never user input).
  extraPredicate?: string;
  // closed_trades only: before deleting a range, fold its exploration-close count
  // (the anneal reader's EXACT predicate, per asset_class) into the persisted
  // module_constants tallies so closedExplorationCount stays MONOTONE (pre-audit 4c(1)).
  explorationTally?: boolean;
}

const PLAIN_RETENTION_TABLES: PlainRetentionTableSpec[] = [
  { table: 'xstock_qd_probe_history', timestampColumn: 'bucket_start', retentionConstantName: 'xstock_qd_probe_history.hot_retention_days' },
  // B-TRADE-TIER-REGISTER: the trade tables enter the move-not-delete path.
  // vts_open_trades: closed-in-place rows only (OPEN rows never age; the range
  // predicate on closed_at plus `closed = true` scopes every export AND delete).
  { table: 'vts_open_trades', timestampColumn: 'closed_at', retentionConstantName: 'vts_open_trades.closed_gc_retention_days', archive: true, extraPredicate: 'closed = true' },
  // closed_trades: first-ever retention policy — archived-then-removed at the
  // Kyle-set 365, never bare-deleted. NULL closed_at rows (the B7.2c never-filled
  // maker pendings, 3 known) are structurally outside every range predicate
  // (NULL < cutoff is not true) — excluded from aging, and the exclusion is logged.
  { table: 'closed_trades', timestampColumn: 'closed_at', retentionConstantName: 'closed_trades.hot_retention_days', archive: true, extraPredicate: 'closed_at IS NOT NULL', explorationTally: true },
];

const PLAIN_DELETE_BATCH = 5000;

// ───────────────────────────────────────────────────────────────────────────
// Config loader
// ───────────────────────────────────────────────────────────────────────────

interface SweepConfig {
  warmBucket: string;
  warmPrefix: string;
  retentionByTable: Map<string, number>;
  sliceThresholdHotBytes: number;
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
  for (const spec of PARTITIONED_TABLES) {
    retentionByTable.set(spec.parent, reqNum(spec.retentionConstantName));
  }
  // P19-B5c: plain (non-partitioned) retention tables share the same map.
  for (const spec of PLAIN_RETENTION_TABLES) {
    retentionByTable.set(spec.table, reqNum(spec.retentionConstantName));
  }

  return {
    warmBucket: reqStr('warm_bucket'),
    warmPrefix: reqStr('warm_prefix'),
    retentionByTable,
    // B-NEW-47: DB-governed, fail-hard-if-empty (Langston Step-2 Q-A).
    sliceThresholdHotBytes: reqNum('slice_threshold_hot_bytes'),
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
  cutoff: Date,
): Promise<PartitionRow[]> {
  const r = await client.query(
    `SELECT child.relname AS child_name,
            pg_get_expr(child.relpartbound, child.oid) AS bound_expr
       FROM pg_inherits
       JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
       JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
      WHERE parent.relname = $1`,
    [parent],
  );

  // B-STORAGE-HARDEN Wave D (OBJ-3): a parent may now hold MONTHLY (`…_YYYY_MM`)
  // and/or DAILY (`…_YYYY_MM_DD`) children (xstock_spot_ticker_snap transitions
  // month→day at the cutover). `classifyPartition` tests the daily shape FIRST
  // (so `_DD` is never mis-read as a month), and `isPartitionEligible` applies
  // the right cutoff per granularity: a monthly child tiers when its whole month
  // is in the past (rangeStart < cutoffMonthStart, legacy); a daily child tiers
  // when its whole day is past the day-granular retention cutoff (rangeEnd <=
  // cutoff) — a true rolling window.
  const out: PartitionRow[] = [];
  for (const row of r.rows) {
    const parsed = classifyPartition(row.child_name);
    if (!parsed) continue;
    if (!isPartitionEligible(parsed, cutoff, cutoffMonthStart)) continue;
    out.push({
      parent,
      child: row.child_name,
      partitionLabel: parsed.partitionLabel,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
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

/** All warm-tier labels already in the manifest for (parent, month) — the month
 *  label itself plus any of its day-slices. Drives the resume invariant guard. */
async function listMonthLabels(
  client: pg.Client,
  sourceTable: string,
  monthLabel: string,
): Promise<string[]> {
  const r = await client.query(
    `SELECT partition_label FROM data_archive_manifest
      WHERE source_table = $1 AND tier = 'warm'
        AND (partition_label = $2 OR partition_label LIKE $3)`,
    [sourceTable, monthLabel, `${monthLabel}-%`],
  );
  return r.rows.map((row) => row.partition_label as string);
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

/** Bulk-mark every verified slice of a month active after the DROP gate passes. */
async function markLabelsActive(
  client: pg.Client,
  sourceTable: string,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) return;
  await client.query(
    `UPDATE data_archive_manifest
       SET state = 'active', hot_partition_dropped_at = NOW()
     WHERE source_table = $1 AND tier = 'warm'
       AND partition_label = ANY($2::text[])
       AND state = 'verified'`,
    [sourceTable, labels],
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Partition introspection
// ───────────────────────────────────────────────────────────────────────────

async function partitionHotBytes(client: pg.Client, partitionTable: string): Promise<number> {
  const r = await client.query(`SELECT pg_total_relation_size($1::regclass) AS bytes_hot`, [
    partitionTable,
  ]);
  return Number(r.rows[0].bytes_hot ?? 0);
}

/** Distinct dates PRESENT in [rangeStart, rangeEnd) via per-day index EXISTS
 *  probes (PK leads with the timestamp column) — NOT a `SELECT DISTINCT date()`
 *  seq scan. ~28–31 cheap probes per partition. */
async function listPresentDates(
  client: pg.Client,
  target: string,
  tsCol: string,
  rangeStart: Date,
  rangeEnd: Date,
  extraPredicate?: string,
): Promise<Date[]> {
  const extraAnd = extraPredicate ? ` AND (${extraPredicate})` : '';
  const present: Date[] = [];
  for (const day of enumerateUtcDays(rangeStart, rangeEnd)) {
    const dayEnd = new Date(day.getTime() + 86_400_000);
    const r = await client.query(
      `SELECT 1 FROM ${quoteIdent(target)}
        WHERE ${quoteIdent(tsCol)} >= $1 AND ${quoteIdent(tsCol)} < $2${extraAnd}
        LIMIT 1`,
      [day, dayEnd],
    );
    if (r.rows.length > 0) present.push(day);
  }
  return present;
}

async function dropPartition(client: pg.Client, partitionTable: string): Promise<void> {
  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(partitionTable)}`);
}

/** Atomically DROP the hot partition AND flip its manifest row(s) to active in a
 *  single transaction (Langston Step-4 rev A). Postgres DDL is transactional, so
 *  a crash can never leave the partition dropped while the manifest is stuck at
 *  'verified' (which listOldPartitions would never revisit). markFn performs the
 *  state flip on the SAME client inside the tx. */
async function dropAndMarkActive(
  ctlClient: pg.Client,
  partitionTable: string,
  markFn: () => Promise<void>,
): Promise<void> {
  await ctlClient.query('BEGIN');
  try {
    await dropPartition(ctlClient, partitionTable);
    await markFn();
    await ctlClient.query('COMMIT');
  } catch (err) {
    await ctlClient.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`[B75 sweep] unsafe identifier: ${name}`);
  }
  return `"${name}"`;
}

// ───────────────────────────────────────────────────────────────────────────
// Archive one object (whole month OR one day-slice) — streamed, verify-on-disk
// ───────────────────────────────────────────────────────────────────────────

interface ArchiveOutcome {
  manifestId: string;
  rowCount: number;
  bytesCompressed: number;
  reused: boolean; // true = already verified/active on entry (resume skip)
}

class ChecksumMismatchError extends Error {
  readonly isChecksumMismatch = true;
}

async function archiveOneObject(
  storage: StorageClient,
  exportClient: pg.Client,
  ctlClient: pg.Client,
  cfg: SweepConfig,
  spec: B74TableSpec,
  label: string,
  rangeStart: Date,
  rangeEnd: Date,
  partitionTableName: string,
  originalSizeBytes: number,
  extraPredicate?: string, // B-TRADE-TIER-REGISTER: plain-table subset export
): Promise<ArchiveOutcome> {
  const objPath = `${cfg.warmPrefix}/${spec.parent}/${label}.jsonl.gz`;
  const storageUri = `supabase://${cfg.warmBucket}/${objPath}`;

  // Resume skip (fold-in #2): already uploaded+verified (or fully active) → no re-export.
  const existing = await getManifestRow(ctlClient, spec.parent, label, 'warm');
  if (existing && (existing.state === 'verified' || existing.state === 'active') && existing.checksum) {
    return { manifestId: existing.id, rowCount: 0, bytesCompressed: 0, reused: true };
  }

  const manifestId = await upsertManifestPending(
    ctlClient,
    spec.parent,
    label,
    storageUri,
    rangeStart,
    rangeEnd,
  );

  const exportRes = await exportPartition(exportClient, {
    sourceTable: spec.parent,
    partitionLabel: label,
    rangeStart,
    rangeEnd,
    timestampColumn: spec.timestampColumn,
    partitionTableName,
    compressionLevel: 6,
    extraPredicate,
  });

  let verifyPath: string | null = null;
  try {
    const fileSize = fs.statSync(exportRes.localPath).size;
    if (fileSize > HARD_CAP_BYTES) {
      // Fail fast BEFORE streaming a doomed upload (fold-in #3 — no sub-day fallback).
      throw new Error(
        `[B75 sweep] object ${label} compressed size ${fileSize}B exceeds HARD_CAP ${HARD_CAP_BYTES}B; ` +
          `no sub-day fallback — partition stalls (see RUNNING_ISSUES day-grain limit)`,
      );
    }

    const upload = await storage.uploadWarmFile(cfg.warmBucket, objPath, exportRes.localPath, {
      size: fileSize,
      checksum: exportRes.checksum,
    });

    // Streamed download-verify to a temp file (Q-B: second read-pass checksum
    // validates bytes-as-landed-on-disk).
    verifyPath = `${exportRes.localPath}.verify`;
    const dl = await storage.downloadWarmFile(cfg.warmBucket, objPath, verifyPath);
    if (dl.checksum !== exportRes.checksum || upload.checksum !== exportRes.checksum) {
      throw new ChecksumMismatchError(
        `[B75 sweep] CHECKSUM MISMATCH ${spec.parent}/${label}: ` +
          `local=${exportRes.checksum} upload=${upload.checksum} readback=${dl.checksum}`,
      );
    }

    await updateManifestUploaded(
      ctlClient,
      manifestId,
      exportRes.rowCount,
      exportRes.bytesCompressed,
      exportRes.minTs,
      exportRes.maxTs,
      exportRes.checksum,
      originalSizeBytes,
    );

    // ts-bounds verify within [rangeStart, rangeEnd)
    if (exportRes.rowCount > 0) {
      if (exportRes.minTs < rangeStart) {
        throw new Error(
          `[B75 sweep] ${label} min_ts (${exportRes.minTs.toISOString()}) < rangeStart (${rangeStart.toISOString()})`,
        );
      }
      if (exportRes.maxTs >= rangeEnd) {
        throw new Error(
          `[B75 sweep] ${label} max_ts (${exportRes.maxTs.toISOString()}) >= rangeEnd (${rangeEnd.toISOString()})`,
        );
      }
    }

    await updateManifestVerified(ctlClient, manifestId);
    return {
      manifestId,
      rowCount: exportRes.rowCount,
      bytesCompressed: exportRes.bytesCompressed,
      reused: false,
    };
  } finally {
    try {
      fs.unlinkSync(exportRes.localPath);
    } catch {
      // ignore
    }
    if (verifyPath) {
      try {
        fs.unlinkSync(verifyPath);
      } catch {
        // ignore
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Per-partition processing
// ───────────────────────────────────────────────────────────────────────────

interface ProcessResult {
  status: 'dropped' | 'skipped' | 'failed';
  mode: 'whole' | 'sliced' | 'n/a';
  bytesHot: number;
  bytesWarm: number;
  rowCount: number;
  slices: number;
  durationMs: number;
  reason?: string;
  isChecksumMismatch?: boolean;
}

async function processPartition(
  spec: B74TableSpec,
  partition: PartitionRow,
  cfg: SweepConfig,
): Promise<ProcessResult> {
  const start = Date.now();

  // Fresh clients per partition: exportClient runs each export's REPEATABLE READ
  // READ ONLY snapshot (opened + committed INSIDE exportPartition, once per
  // object — not one long snapshot across the partition); ctlClient runs
  // manifest/DDL on a separate connection.
  const exportClient = new Client({ connectionString: process.env.DATABASE_URL });
  const ctlClient = new Client({ connectionString: process.env.DATABASE_URL });
  await exportClient.connect();
  await ctlClient.connect();

  let mode: 'whole' | 'sliced' = 'whole';
  let bytesHot = 0;

  try {
    bytesHot = await partitionHotBytes(ctlClient, partition.child);

    // Decide whole-vs-sliced. The resume invariant guard OVERRIDES the live
    // threshold so a half-swept month never mixes month + day labels.
    //
    // ★ Wave D (OBJ-3) label-equality convergence (Langston Step-4 Finding-1):
    // a DAILY partition (`…_YYYY_MM_DD`) reaches here with `partitionLabel` ==
    // its single day label (`YYYY-MM-DD`). Every month-oriented helper below
    // then converges to that one label: `listMonthLabels(… , 'YYYY-MM-DD')`
    // matches only `= 'YYYY-MM-DD' OR LIKE 'YYYY-MM-DD-%'` (just itself), so
    // `deriveModeFromLabels` sees at most one label and never trips its
    // month+day mixing guard; and in the sliced path `enumerateUtcDays(rangeStart,
    // rangeEnd)` yields exactly ONE day whose `dayLabel` equals `partitionLabel`.
    // So whole and sliced converge to the identical single object — daily
    // correctness is emergent from "a daily partition spans one UTC day", not a
    // dedicated branch. This convergence is regression-locked by the
    // "Wave D daily-partition through the month-oriented machinery" golden test
    // (b-new-47-sweep-helpers.test.ts) — keep it green if you refactor
    // decideSliceMode / deriveModeFromLabels / enumerateUtcDays.
    const existingLabels = await listMonthLabels(ctlClient, spec.parent, partition.partitionLabel);
    const resumeMode = deriveModeFromLabels(partition.partitionLabel, existingLabels);
    mode = resumeMode ?? decideSliceMode(bytesHot, cfg.sliceThresholdHotBytes);

    const storage = getStorageClient();

    if (mode === 'whole') {
      // ─── WHOLE PATH ───────────────────────────────────────────────────────
      const existing = await getManifestRow(ctlClient, spec.parent, partition.partitionLabel, 'warm');
      if (existing && existing.state === 'active') {
        return {
          status: 'skipped',
          mode,
          bytesHot: 0,
          bytesWarm: 0,
          rowCount: 0,
          slices: 0,
          durationMs: Date.now() - start,
          reason: 'already-active',
        };
      }
      const outcome = await archiveOneObject(
        storage,
        exportClient,
        ctlClient,
        cfg,
        spec,
        partition.partitionLabel,
        partition.rangeStart,
        partition.rangeEnd,
        partition.child,
        bytesHot,
      );
      await dropAndMarkActive(ctlClient, partition.child, () =>
        updateManifestActive(ctlClient, outcome.manifestId),
      );
      return {
        status: 'dropped',
        mode,
        bytesHot,
        bytesWarm: outcome.bytesCompressed,
        rowCount: outcome.rowCount,
        slices: 1,
        durationMs: Date.now() - start,
      };
    }

    // ─── SLICED PATH ─────────────────────────────────────────────────────────
    // Enumerate distinct dates present (cheap per-day index probes), archive each
    // day as its own object, then DROP only after EVERY present date is verified.
    const presentDates = await listPresentDates(
      ctlClient,
      partition.child,
      spec.timestampColumn,
      partition.rangeStart,
      partition.rangeEnd,
    );
    const presentLabels = presentDates.map(dayLabel);

    let bytesWarm = 0;
    let rowCount = 0;
    for (const day of presentDates) {
      const dEnd = new Date(day.getTime() + 86_400_000);
      const outcome = await archiveOneObject(
        storage,
        exportClient,
        ctlClient,
        cfg,
        spec,
        dayLabel(day),
        day,
        dEnd,
        partition.child,
        0, // per-slice original_partition_size_bytes = 0 (Langston rev B): the
           // whole-partition bytesHot would sum to N× the real size across slices.
      );
      bytesWarm += outcome.bytesCompressed;
      rowCount += outcome.rowCount;
    }

    // DROP gate (fold-in #1): every distinct present date must have a manifest
    // row in {verified, active}. Keys off dates PRESENT, not the calendar month.
    const stateRows = await ctlClient.query(
      `SELECT partition_label, state FROM data_archive_manifest
        WHERE source_table = $1 AND tier = 'warm' AND partition_label = ANY($2::text[])`,
      [spec.parent, presentLabels],
    );
    const verifiedSet = new Set(
      stateRows.rows
        .filter((r) => r.state === 'verified' || r.state === 'active')
        .map((r) => r.partition_label as string),
    );
    const missing = presentLabels.filter((l) => !verifiedSet.has(l));
    if (missing.length > 0) {
      throw new Error(
        `[B75 sweep] DROP gate BLOCKED ${spec.parent}/${partition.partitionLabel}: ` +
          `${missing.length}/${presentLabels.length} slice(s) not verified: ${missing.slice(0, 6).join(',')}`,
      );
    }

    await dropAndMarkActive(ctlClient, partition.child, () =>
      markLabelsActive(ctlClient, spec.parent, presentLabels),
    );

    return {
      status: 'dropped',
      mode,
      bytesHot,
      bytesWarm,
      rowCount,
      slices: presentLabels.length,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const isChecksumMismatch = err instanceof ChecksumMismatchError;
    return {
      status: 'failed',
      mode,
      bytesHot,
      bytesWarm: 0,
      rowCount: 0,
      slices: 0,
      durationMs: Date.now() - start,
      reason: err instanceof Error ? err.message : String(err),
      isChecksumMismatch,
    };
  } finally {
    await exportClient.end().catch(() => {});
    await ctlClient.end().catch(() => {});
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Failure → system-alert (chunk E). Never let alert-writing mask the sweep error.
// ───────────────────────────────────────────────────────────────────────────

async function raiseSweepAlert(
  title: string,
  body: string,
  severity: 'warning' | 'critical',
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(), // immediate; dispatcher promotes scheduled→active next tick
      category: 'breakage',
      severity,
      title,
      body,
      metadata: { batch: 'B-NEW-47', source: 'b75-retention-sweep', ...metadata },
    });
  } catch (alertErr) {
    console.error('[B75 sweep] failed to raise system-alert:', alertErr);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// P19-B5c — plain-table age-delete pass
// ───────────────────────────────────────────────────────────────────────────

/**
 * Batched age-DELETE + VACUUM for the plain (non-partitioned) retention tables.
 * Mirrors the canonical context-bridge-log-ttl pattern (delete the oldest N rows
 * by the timestamp column via a PK subselect, loop until under a batch, then
 * VACUUM). No cold-offload — these are small derived-telemetry tables; rows past
 * `hot_retention_days` are simply removed. Per-table failure is isolated +
 * alerted; the partition sweep + the other plain tables continue.
 */
async function sweepPlainTables(cfg: SweepConfig): Promise<{ deleted: number; failed: number }> {
  let deletedTotal = 0;
  let failed = 0;

  for (const spec of PLAIN_RETENTION_TABLES) {
    const retentionDays = cfg.retentionByTable.get(spec.table);
    if (retentionDays === undefined) {
      failed++;
      console.error(`[B75 sweep][plain] ${spec.table}: no retention configured — skipping`);
      continue;
    }
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const ctl = new Client({ connectionString: process.env.DATABASE_URL });
    await ctl.connect();
    try {
      let tableDeleted = 0;
      const extraAnd = spec.extraPredicate ? ` AND (${spec.extraPredicate})` : '';

      // B-TRADE-TIER-REGISTER (#599): ARCHIVE-BEFORE-DELETE for primary-record
      // plain tables. Every present day in the eligible range is exported to warm
      // (JSONL.gz + TUS + checksum + manifest) and the DELETE runs ONLY when every
      // present day's manifest row is verified/active — the partitioned lane's
      // drop gate, same safety property. A missing/failed export means NO delete
      // this run (data is safe; retried next run).
      if (spec.archive) {
        // Bound the day-scan at the real oldest eligible row (Langston Step-4 note 1:
        // an epoch-based scan probes ~20k empty days per table per run, forever).
        const extraAndMin = spec.extraPredicate ? ` AND (${spec.extraPredicate})` : '';
        const minRes = await ctl.query(
          `SELECT MIN(${spec.timestampColumn}) AS min_ts FROM ${spec.table}
            WHERE ${spec.timestampColumn} < $1${extraAndMin}`,
          [cutoff],
        );
        const minTs = minRes.rows[0]?.min_ts ? new Date(minRes.rows[0].min_ts) : null;
        const scanStart = minTs ? new Date(Date.UTC(minTs.getUTCFullYear(), minTs.getUTCMonth(), minTs.getUTCDate())) : cutoff;
        const present = minTs === null ? [] : await listPresentDates(
          ctl, spec.table, spec.timestampColumn, scanStart, cutoff, spec.extraPredicate,
        );
        if (present.length === 0) {
          console.log(`[B75 sweep][plain-archive] ${spec.table}: no age-eligible rows — nothing to archive`);
        } else {
          const storage = getStorageClient();
          const exportClient = new Client({ connectionString: process.env.DATABASE_URL });
          await exportClient.connect();
          try {
            for (const day of present) {
              const label = day.toISOString().slice(0, 10);
              const dayEnd = new Date(day.getTime() + 86_400_000);
              await archiveOneObject(
                storage, exportClient, ctl, cfg,
                { parent: spec.table, timestampColumn: spec.timestampColumn, retentionConstantName: spec.retentionConstantName },
                label, day, dayEnd, spec.table, 0, spec.extraPredicate,
              );
            }
          } finally {
            await exportClient.end();
          }
          // The gate: every present label verified/active before ANY delete.
          const labels = present.map((d) => d.toISOString().slice(0, 10));
          const stateRows = await ctl.query(
            `SELECT partition_label, state FROM data_archive_manifest
              WHERE source_table = $1 AND tier = 'warm' AND partition_label = ANY($2::text[])`,
            [spec.table, labels],
          );
          const okSet = new Set(
            stateRows.rows.filter((r) => r.state === 'verified' || r.state === 'active').map((r) => r.partition_label as string),
          );
          const missing = labels.filter((l) => !okSet.has(l));
          if (missing.length > 0) {
            console.error(`[B75 sweep][plain-archive] ${spec.table}: ${missing.length} present day(s) lack a verified manifest row (${missing.slice(0, 3).join(', ')}…) — DELETE SKIPPED this run`);
            continue; // move to the next spec; rows are safe, retried next run
          }
          // Exploration-anneal tally (pre-audit 4c(1)): fold the about-to-be-deleted
          // ranges' exploration-close counts into the persisted per-class tallies
          // (the anneal reader's EXACT predicate) so closedExplorationCount stays
          // monotone. The reader consumes these INSIDE its cachedCount closure.
          if (spec.explorationTally) {
            const tallyRes = await ctl.query(
              `SELECT asset_class, count(*)::int AS n FROM ${spec.table}
                WHERE metadata->>'admissionBasis' = 'exploration'
                  AND closed_at IS NOT NULL
                  AND close_reason IS DISTINCT FROM 'never_filled'
                  AND ${spec.timestampColumn} < $1${extraAnd}
                GROUP BY asset_class`,
              [cutoff],
            );
            for (const row of tallyRes.rows) {
              const upd = await ctl.query(
                `UPDATE module_constants SET value = (value::int + $1)::text::jsonb
                  WHERE module_name = 'exploration_lane'
                    AND constant_name = $2`,
                [row.n, `closed_count_archived.${row.asset_class}`],
              );
              if ((upd.rowCount ?? 0) === 0) {
                // Seeded-0-or-fault (pre-audit 4c(1) cond 2): a missing tally key is a
                // FAULT, never a silent ?? 0 — refuse the delete for this table.
                throw new Error(`[B75 sweep][plain-archive] exploration tally key missing for class ${row.asset_class} — seeded migration absent; DELETE REFUSED (rows safe)`);
              }
              console.log(`[B75 sweep][plain-archive] ${spec.table}: exploration tally +${row.n} (${row.asset_class})`);
            }
          }
        }
      }

      // Delete the oldest rows in bounded batches (the timestamp index serves
      // the predicate; deleting by PK avoids long row-lock windows).
      // Identifiers come from the static PLAIN_RETENTION_TABLES allow-list.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r = await ctl.query(
          `DELETE FROM ${spec.table}
            WHERE id IN (
              SELECT id FROM ${spec.table}
               WHERE ${spec.timestampColumn} < $1${extraAnd}
               ORDER BY ${spec.timestampColumn} ASC
               LIMIT $2
            )`,
          [cutoff, PLAIN_DELETE_BATCH],
        );
        const n = r.rowCount ?? 0;
        tableDeleted += n;
        if (n < PLAIN_DELETE_BATCH) break;
      }
      deletedTotal += tableDeleted;
      await ctl.query(`VACUUM ${spec.table}`); // not in a txn; plain VACUUM — no exclusive lock
      console.log(
        `[B75 sweep][plain] ${spec.table}: deleted ${tableDeleted} rows older than ` +
          `${cutoff.toISOString().slice(0, 10)} (retentionDays=${retentionDays}) + VACUUM`,
      );
    } catch (err) {
      failed++;
      console.error(
        `[B75 sweep][plain] ${spec.table}: FAILED — ${err instanceof Error ? err.message : String(err)}`,
      );
      await raiseSweepAlert(
        `B75 plain-table retention FAILED: ${spec.table}`,
        `The nightly age-delete for plain table ${spec.table} failed. Old rows were NOT removed ` +
          `(data is safe; retried next run). Reason: ${err instanceof Error ? err.message : String(err)}`,
        'warning',
        { table: spec.table },
      );
    } finally {
      await ctl.end();
    }
  }

  return { deleted: deletedTotal, failed };
}

// ───────────────────────────────────────────────────────────────────────────
// Run-lock (B-STORAGE-HARDEN Wave C, Langston Step-2 cond B) — overlap guard.
// Adding the B70 analytics tables (esp. signal_eval_archive ~14.5 GB/mo, per-day
// sliced) grows a first-tiering pass to ~1-2h once eligible (~Sept). That's well
// under the 24h daily cadence, but a single O_EXCL lockfile guarantees a slow
// pass can never overlap the next day's trigger (double-processing). Stale lock
// (holder crashed) older than SWEEP_LOCK_STALE_MS is force-reclaimed.
// ───────────────────────────────────────────────────────────────────────────
const SWEEP_LOCK_FILE = process.env.B75_SWEEP_LOCK_FILE ?? '/tmp/b75-retention-sweep.lock';
const SWEEP_LOCK_STALE_MS = 6 * 60 * 60 * 1000; // 6h — a real pass is ~1-2h; older = crashed holder

/** Returns true if the lock was acquired; false if a live run already holds it. */
function acquireSweepLock(): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(SWEEP_LOCK_FILE, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o644);
      fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      // Lock exists — reclaim only if stale (crashed holder).
      try {
        const ageMs = Date.now() - fs.statSync(SWEEP_LOCK_FILE).mtimeMs;
        if (ageMs > SWEEP_LOCK_STALE_MS) {
          console.warn(`[B75 sweep] stale run-lock (age ${(ageMs / 3_600_000).toFixed(1)}h) — force-reclaiming`);
          fs.unlinkSync(SWEEP_LOCK_FILE);
          continue; // retry the create
        }
      } catch { /* lock vanished between stat and now — retry */ continue; }
      return false; // fresh lock held by a live run
    }
  }
  return false;
}

function releaseSweepLock(): void {
  try {
    fs.unlinkSync(SWEEP_LOCK_FILE);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[B75 sweep] failed to release run-lock:', err);
    }
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

  if (!acquireSweepLock()) {
    console.log('[B75 sweep] another run still holds the lock — skipping this tick (overlap guard)');
    return;
  }
  // Release the lock in finally (NOT via process.exit inside runSweep — that would
  // bypass finally and leave the lock stuck until stale). Exit non-zero AFTER release.
  let hadFailures = false;
  try {
    hadFailures = await runSweep();
  } finally {
    releaseSweepLock();
  }
  if (hadFailures) process.exit(1);
}

async function runSweep(): Promise<boolean> {
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

  console.log(
    `[B75 sweep] started at ${startedAt.toISOString()} slice_threshold_hot_bytes=${cfg.sliceThresholdHotBytes}`,
  );

  for (const spec of PARTITIONED_TABLES) {
    const retentionDays = cfg.retentionByTable.get(spec.parent)!;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const cutoffMonth = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1));

    const ctlList = new Client({ connectionString: process.env.DATABASE_URL });
    await ctlList.connect();
    let oldPartitions: PartitionRow[];
    try {
      oldPartitions = await listOldPartitions(ctlList, spec.parent, cutoffMonth, cutoff);
    } finally {
      await ctlList.end();
    }

    if (oldPartitions.length === 0) {
      console.log(
        `[B75 sweep] ${spec.parent}: no partitions older than ${cutoffMonth
          .toISOString()
          .slice(0, 10)} (retentionDays=${retentionDays})`,
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
          `[B75 sweep] ${spec.parent}/${partition.partitionLabel}: dropped mode=${res.mode} slices=${res.slices} ` +
            `rows=${res.rowCount} bytes_hot=${res.bytesHot} bytes_warm=${res.bytesWarm} ` +
            `compression_ratio=${res.bytesHot && res.bytesWarm ? (res.bytesHot / res.bytesWarm).toFixed(2) : 'n/a'} ` +
            `duration_ms=${res.durationMs}`,
        );
      } else if (res.status === 'skipped') {
        console.log(`[B75 sweep] ${spec.parent}/${partition.partitionLabel}: skipped (${res.reason})`);
      } else {
        partitionsFailed++;
        console.error(
          `[B75 sweep] ${spec.parent}/${partition.partitionLabel}: FAILED — ${res.reason} (duration_ms=${res.durationMs})`,
        );
        await raiseSweepAlert(
          `B75 retention sweep FAILED: ${spec.parent}/${partition.partitionLabel}`,
          `The nightly storage archive sweep could not move partition ${partition.partitionLabel} of ${spec.parent} ` +
            `to warm storage. mode=${res.mode}. The hot partition was NOT dropped (data is safe). ` +
            `Reason: ${res.reason}. ${
              res.isChecksumMismatch
                ? 'CHECKSUM MISMATCH = possible data corruption — investigate before retry.'
                : 'Likely transient; the next nightly run retries from the last verified slice.'
            }`,
          res.isChecksumMismatch ? 'critical' : 'warning',
          {
            parent: spec.parent,
            partition_label: partition.partitionLabel,
            child: partition.child,
            mode: res.mode,
            is_checksum_mismatch: Boolean(res.isChecksumMismatch),
          },
        );
      }
    }
  }

  // P19-B5c: plain (non-partitioned) retention pass — runs after the partition
  // sweep so B75 remains the single retention owner for all archive tables.
  const plainResult = await sweepPlainTables(cfg);

  const totalMs = Date.now() - startedAt.getTime();
  console.log(
    `[B75 sweep] DONE — examined=${partitionsExamined} dropped=${partitionsDropped} ` +
      `failed=${partitionsFailed} bytes_freed=${bytesFreedTotal} ` +
      `bytes_archived=${bytesArchivedTotal} plain_deleted=${plainResult.deleted} ` +
      `plain_failed=${plainResult.failed} duration_ms=${totalMs}`,
  );

  // Return the failure flag; main() releases the run-lock (finally) THEN exits
  // non-zero. A fatal throw propagates through main()'s finally to the catch below.
  return partitionsFailed > 0 || plainResult.failed > 0;
}

main().catch(async (err) => {
  console.error('[B75 sweep] fatal:', err);
  await raiseSweepAlert(
    'B75 retention sweep CRASHED',
    `The nightly storage archive sweep crashed before completing. No partition is left half-dropped ` +
      `(DROP only happens after verify). Reason: ${err instanceof Error ? err.message : String(err)}`,
    'critical',
    { fatal: true },
  );
  process.exit(1);
});
