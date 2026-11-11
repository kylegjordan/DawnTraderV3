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
 * Cron line (root crontab on staging; B-XSTOCK-SNAPSHOT-RETENTION replaces the
 * unsafe timestamp/unlink lock with the shared kernel-lock launcher):
 *   15 2 * * * su - deploy -c "cd /home/deploy/dawntrader && server/scripts/b75-retention-run.sh" >> /var/log/dawntrader/b75-retention.log 2>&1
 *
 * State machine (data_archive_manifest.state): pending → uploaded → verified → active
 * Resume (B-B75-EXPORT-COMPLETENESS #1195): what happens to a label that already has
 * a manifest row is decided by ONE rule, `decideExistingCopy`
 * (server/services/data-archive/archive-completeness.ts): a proven `verified` copy is
 * reused; an empty `active`/`migrated` label is skipped with no write; anything that
 * would re-prove or overwrite an unproven or closed-out copy is REFUSED before upload.
 *
 * Reference: BATCH_75_SCOPE.md §C.1 + B_NEW_47_SCOPE.md §8 + B_NEW_47_PRE_AUDIT.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import {
  countGzipJsonlLines,
  exportPartition,
  ExportRowCountMismatchError,
  inspectGzipSnapshotJsonl,
  loadSnapshotProvenKeys,
} from '../services/data-archive/partition-exporter.js';
import { getStorageClient, type StorageClient } from '../services/data-archive/storage-client.js';
import { DATA_LIFECYCLE_SCOPE_SQL, parseLifecycleNumber } from '../services/data-archive/hot-horizon.js';
import {
  classifyPartition,
  decideSliceMode,
  enumerateUtcDays,
  dayLabel,
  deriveModeFromLabels,
  isPartitionEligible,
} from '../services/data-archive/sweep-slicing.js';
import { addAlert, resolveAlertsByDedupeKey } from '../services/system-alerts.js';
import { NON_OUTCOME_CLOSE_REASONS } from '../services/trade-close-reason.js';
import {
  assertExactArchiveEquality,
  evidenceExistsForManifest,
  proofCountStillMatches,
  recordExactArchiveEvidence,
  XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT,
  type ExactArchiveEvidenceInput,
} from '../services/data-archive/exact-archive-evidence.js';
import {
  ArchiveReadbackMismatchError,
  AUTO_RESOLVED_CLASSES,
  decideExistingCopy,
  decisionNeeds,
  FATAL_ALERT_KEY,
  isProvenBasis,
  LEGACY_TS_TIEGROUP_CURSOR_CONTRACT,
  NonProvenExistingCopyError,
  partitionAlertKey,
  plainAlertKey,
  PROVEN_BASIS,
  SWEEP_ALERT_ACTOR,
  sweepFailureClass,
  type SweepFailureClass,
} from '../services/data-archive/archive-completeness.js';
import { isDirectEntry } from './direct-entry.js';
import {
  parseXstockSnapshotLifecycleConfig,
  XSTOCK_SNAPSHOT_POLICIES,
  type XstockSnapshotTable,
} from '../services/xstock-snapshot-policy.js';
import {
  XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
  frozenSnapshotCutoff,
  snapshotDayLabel,
  snapshotEligibleDaysSql,
  snapshotLockedDeleteParams,
  snapshotLockedDeleteSql,
  snapshotPopulationParams,
  snapshotProvenKeyAbsenceSql,
  snapshotProofMatches,
  type XstockSnapshotProof,
  type XstockSnapshotSelector,
} from '../services/data-archive/xstock-snapshot-retention.js';

/** One id per run, printed on the started line and cited as resolve evidence. */
const RUN_ID = crypto.randomUUID();
const SWEEP_LOG = '/var/log/dawntrader/b75-retention.log';

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

export interface B75ArchiveTableSpec {
  parent: string;
  timestampColumn: string;
  retentionConstantName: string; // key in module_constants under data_lifecycle
  /** Immutable second cursor + database-rendered JSON for exact provenance tables. */
  exactCursorTieBreakerColumn?: string;
  exactCursorTieBreakerType?: 'uuid';
}

// P19-B-PERPFEED (#685 DEFECT-1 fix): the three OHLC entries named a `ts` column
// that DOES NOT EXIST on those tables — all three build from the shared
// `ohlcColumns` const (shared/schema.ts) whose timestamp is `interval_begin`.
// The wrong column made the sweep structurally unable to tier the OHLC family
// (zero manifest rows for any *_ohlc_1m table, ever — measured 2026-08-17).
// The crypto_perp pair joins the family born daily-partitioned at 30-day hot
// (P19-B-PERPFEED OBJ-2; the departure from 365 is deliberate — warm preserves).
const B74_TABLES: B75ArchiveTableSpec[] = [
  { parent: 'xstock_spot_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'xstock_spot_ticker_snap.hot_retention_days' },
  { parent: 'xstock_perp_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'xstock_perp_ticker_snap.hot_retention_days' },
  { parent: 'crypto_spot_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'crypto_spot_ticker_snap.hot_retention_days' },
  { parent: 'crypto_perp_ticker_snap', timestampColumn: 'captured_at', retentionConstantName: 'crypto_perp_ticker_snap.hot_retention_days' },
  { parent: 'xstock_spot_ohlc_1m',     timestampColumn: 'interval_begin', retentionConstantName: 'xstock_spot_ohlc_1m.hot_retention_days' },
  { parent: 'xstock_perp_ohlc_1m',     timestampColumn: 'interval_begin', retentionConstantName: 'xstock_perp_ohlc_1m.hot_retention_days' },
  { parent: 'crypto_spot_ohlc_1m',     timestampColumn: 'interval_begin', retentionConstantName: 'crypto_spot_ohlc_1m.hot_retention_days' },
  { parent: 'crypto_perp_ohlc_1m',     timestampColumn: 'interval_begin', retentionConstantName: 'crypto_perp_ohlc_1m.hot_retention_days' },
  // B-XSTOCK-BAR-AVAILABILITY P4: arrived_at is intentionally non-unique. The
  // exact cursor preserves every tied immutable revision and database-rendered
  // JSON preserves the certificate's microsecond timestamps.
  { parent: 'xstock_bar_revision_event', timestampColumn: 'arrived_at', retentionConstantName: 'xstock_bar_revision_event.hot_retention_days', exactCursorTieBreakerColumn: 'revision_id', exactCursorTieBreakerType: 'uuid' },
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
// Each entry's `retentionConstantName` is per-table (Langston Step-2) — but a config gap is NOT isolated: `reqNum`
// throws, `loadConfig` runs before the sweep starts and nothing catches it, so a missing key on ANY entry (B74, B70 or
// plain) aborts the WHOLE night's sweep. That is the safe fail-hard behaviour — and it is why a rollback that restores a
// table entry must restore its seed row FIRST (B-CLUSTER-BUS-PERSIST-DISPOSITION: run the rollback SQL, then revert the
// code). Corrected 2026-10-11; it read "a B70 config gap fails ONLY that table's reqNum, never a B74 table".
const B70_TABLES: B75ArchiveTableSpec[] = [
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
const PARTITIONED_TABLES: B75ArchiveTableSpec[] = [...B74_TABLES, ...B70_TABLES];

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
export interface PlainRetentionTableSpec {
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

export interface B75SweepConfig {
  warmBucket: string;
  warmPrefix: string;
  retentionByTable: Map<string, number>;
  sliceThresholdHotBytes: number;
  snapshotByTable: Map<XstockSnapshotTable, {
    hotRetentionDays: number;
    keepFloorRows: number;
  }>;
  snapshotMutationEnabled: boolean;
}

const NARROW_LIFECYCLE_SCOPE_ALERT_KEY = 'b75-retention-sweep:data-lifecycle-narrow-scope';

export async function loadConfig(client: pg.Client): Promise<B75SweepConfig> {
  const narrow = await client.query(
    `SELECT constant_name FROM module_constants
       WHERE module_name = 'data_lifecycle'
         AND (exchange IS DISTINCT FROM '*' OR asset_class IS DISTINCT FROM '*'
           OR strategy IS DISTINCT FROM '*' OR regime IS DISTINCT FROM '*')
       ORDER BY constant_name`,
  );
  const narrowNames = narrow.rows.map((row) => String(row.constant_name));
  if (narrowNames.length > 0) {
    console.warn(
      `[B75 sweep] narrow-scope data_lifecycle rows count=${narrowNames.length} `
        + `constant_names=${narrowNames.join(',')}`,
    );
    await raiseSweepAlert(
      'B75 sweep found narrow-scope data_lifecycle rows',
      `Found ${narrowNames.length} non-wildcard data_lifecycle row(s): ${narrowNames.join(', ')}. `
        + 'After B-DB-SIZE-RELIEF increment 4 a narrow row is not out-voted; it is unseen by the sweep.',
      'warning',
      { batch: 'B-DB-SIZE-RELIEF', row_count: narrowNames.length, constant_names: narrowNames },
      NARROW_LIFECYCLE_SCOPE_ALERT_KEY,
    );
  } else {
    await resolveSweepAlerts([NARROW_LIFECYCLE_SCOPE_ALERT_KEY], 'the data_lifecycle scope-shape read');
  }

  // B-DB-SIZE-RELIEF increment 4: the SAME scope filter the horizon readers use (all four scope columns '*'), so a
  // narrower-scope row can never win this map unseen while the Drift Dashboard and the W20C replay state the '*' value.
  const r = await client.query(
    `SELECT constant_name, value FROM module_constants
       WHERE ${DATA_LIFECYCLE_SCOPE_SQL}`,
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
    // The SAME value test the horizon readers use (parseLifecycleNumber: a jsonb number, finite, > 0).
    const v = parseLifecycleNumber(map.get(key));
    if (v === null) {
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

  const snapshot = parseXstockSnapshotLifecycleConfig(map, narrowNames);

  return {
    warmBucket: reqStr('warm_bucket'),
    warmPrefix: reqStr('warm_prefix'),
    retentionByTable,
    // B-NEW-47: DB-governed, fail-hard-if-empty (Langston Step-2 Q-A).
    sliceThresholdHotBytes: reqNum('slice_threshold_hot_bytes'),
    snapshotByTable: snapshot.byTable,
    snapshotMutationEnabled: snapshot.mutationEnabled,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Partition listing
// ───────────────────────────────────────────────────────────────────────────

export interface PartitionRow {
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
  completeness_basis: string | null;
}

async function getManifestRow(
  client: pg.Client,
  sourceTable: string,
  partitionLabel: string,
  tier: 'warm' | 'cold' = 'warm',
): Promise<ManifestRow | null> {
  const r = await client.query(
    `SELECT id, state, storage_uri, checksum, hot_partition_dropped_at, completeness_basis
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

/** B-B75-EXPORT-COMPLETENESS (Langston Step-2 r4): does the label's source range hold
 *  any row? The SAME object and population the exporter counts — `target` is the
 *  partition child (or the plain table), `ts >= start AND ts < end` plus the spec's
 *  extra predicate (`partition-exporter.ts:127`, `:179-181`). One LIMIT 1 probe. */
async function labelRowsPresent(
  client: pg.Client,
  target: string,
  tsCol: string,
  rangeStart: Date,
  rangeEnd: Date,
  extraPredicate?: string,
): Promise<boolean> {
  const extraAnd = extraPredicate ? ` AND (${extraPredicate})` : '';
  const r = await client.query(
    `SELECT 1 FROM ${quoteIdent(target)}
      WHERE ${quoteIdent(tsCol)} >= $1 AND ${quoteIdent(tsCol)} < $2${extraAnd}
      LIMIT 1`,
    [rangeStart, rangeEnd],
  );
  return r.rows.length > 0;
}

async function dropPartition(client: pg.Client, partitionTable: string): Promise<void> {
  await client.query(`DROP TABLE IF EXISTS ${quoteIdent(partitionTable)}`);
}

/** Atomically DROP the hot partition AND flip its manifest row(s) to active in a
 *  single transaction (Langston Step-4 rev A). Postgres DDL is transactional, so
 *  a crash can never leave the partition dropped while the manifest is stuck at
 *  'verified' (which listOldPartitions would never revisit). markFn performs the
 *  state flip on the SAME client inside the tx. */
export async function dropAndMarkActive(
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

export function missingProvenArchiveLabels(
  labels: string[],
  rows: Array<{ partition_label: string; state: string; completeness_basis: string | null }>,
): string[] {
  const proven = new Set(
    rows
      .filter((row) => (row.state === 'verified' || row.state === 'active')
        && isProvenBasis(row.completeness_basis))
      .map((row) => row.partition_label),
  );
  return labels.filter((label) => !proven.has(label));
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

/** `exported` = a fresh, proven copy; `reused` = an existing proven `verified` copy
 *  (mid-run resume — the source is still present, so the caller may drop/delete);
 *  `skipped` = an empty `active`/`migrated` label — the caller must do NOTHING with
 *  it (no drop, no manifest write), so `hot_partition_dropped_at` is never re-stamped
 *  and a `migrated` row is never flipped back to `active` (Langston Step-2 C-1).
 *  (The old `reused: boolean` field had no reader and is gone — rule 18.) */
export type B75ArchiveOutcome =
  | { kind: 'exported' | 'reused'; manifestId: string; rowCount: number; bytesCompressed: number }
  | { kind: 'skipped'; manifestId: string; reason: 'already-active' | 'already-migrated' };

class ChecksumMismatchError extends Error {
  readonly isChecksumMismatch = true;
}

export interface B75ArchiveObjectDependencies {
  exportPartition: typeof exportPartition;
  evidenceExistsForManifest: typeof evidenceExistsForManifest;
  proofCountStillMatches: typeof proofCountStillMatches;
  recordExactArchiveEvidence: typeof recordExactArchiveEvidence;
  countGzipJsonlLines: typeof countGzipJsonlLines;
  assertExactArchiveEquality: typeof assertExactArchiveEquality;
  statSize: (filePath: string) => number;
  unlinkFile: (filePath: string) => void;
}

const DEFAULT_ARCHIVE_OBJECT_DEPS: B75ArchiveObjectDependencies = {
  exportPartition,
  evidenceExistsForManifest,
  proofCountStillMatches,
  recordExactArchiveEvidence,
  countGzipJsonlLines,
  assertExactArchiveEquality,
  statSize: (filePath) => fs.statSync(filePath).size,
  unlinkFile: (filePath) => fs.unlinkSync(filePath),
};

export async function archiveB75Object(
  storage: StorageClient,
  exportClient: pg.Client,
  ctlClient: pg.Client,
  cfg: B75SweepConfig,
  spec: B75ArchiveTableSpec,
  label: string,
  rangeStart: Date,
  rangeEnd: Date,
  partitionTableName: string,
  originalSizeBytes: number,
  extraPredicate?: string, // B-TRADE-TIER-REGISTER: plain-table subset export
  deps: B75ArchiveObjectDependencies = DEFAULT_ARCHIVE_OBJECT_DEPS,
): Promise<B75ArchiveOutcome> {
  const objPath = `${cfg.warmPrefix}/${spec.parent}/${label}.jsonl.gz`;
  const storageUri = `supabase://${cfg.warmBucket}/${objPath}`;

  // B-B75-EXPORT-COMPLETENESS (#1195): ONE decision for an existing copy, made BEFORE
  // any upload. Its inputs are read only when the row's state needs them; row presence
  // is MEASURED (the whole path enumerates children by name, not by rows).
  const existing = await getManifestRow(ctlClient, spec.parent, label, 'warm');
  const needs = decisionNeeds(existing);
  const evidenceExists = existing && needs.evidence ? await deps.evidenceExistsForManifest(ctlClient, existing.id) : false;
  const rowsPresent = needs.rows
    ? await labelRowsPresent(ctlClient, partitionTableName, spec.timestampColumn, rangeStart, rangeEnd, extraPredicate)
    : false;
  const decision = decideExistingCopy(existing, evidenceExists, rowsPresent);
  if (decision.kind === 'refuse') {
    throw new NonProvenExistingCopyError(decision.reason, spec.parent, label);
  }
  if (decision.kind === 'skip') {
    return { kind: 'skipped', manifestId: existing!.id, reason: decision.reason };
  }
  if (decision.kind === 'reuse') {
    // The reuse recount (Langston Step-4 gate B residual, folded): `reuse` is the one arm
    // that acts destructively on the CURRENT source from a proof taken EARLIER, so the
    // source is counted again over the exporter's own population and compared with the
    // proof's stored source_row_count. Resume-only (no `verified` rows exist today).
    const same = await deps.proofCountStillMatches(ctlClient, existing!.id, {
      target: quoteIdent(partitionTableName),
      tsCol: quoteIdent(spec.timestampColumn),
      rangeStart,
      rangeEnd,
      extraPredicate,
    });
    if (!same) throw new NonProvenExistingCopyError('reuse-count-changed', spec.parent, label);
    return { kind: 'reused', manifestId: existing!.id, rowCount: 0, bytesCompressed: 0 };
  }

  const manifestId = await upsertManifestPending(
    ctlClient,
    spec.parent,
    label,
    storageUri,
    rangeStart,
    rangeEnd,
  );

  const exportRes = await deps.exportPartition(exportClient, {
    sourceTable: spec.parent,
    partitionLabel: label,
    rangeStart,
    rangeEnd,
    timestampColumn: spec.timestampColumn,
    partitionTableName,
    compressionLevel: 6,
    extraPredicate,
    exactCursorTieBreakerColumn: spec.exactCursorTieBreakerColumn,
    exactCursorTieBreakerType: spec.exactCursorTieBreakerType,
  });

  let verifyPath: string | null = null;
  try {
    const fileSize = deps.statSize(exportRes.localPath);
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

    // B-B75-EXPORT-COMPLETENESS (OBJ-7): EVERY export records its proof, not only the
    // exact lane. Source table, tier and contract come from the export — never literals
    // (Langston Step-1 condition 1). The downloaded count is read from the verified
    // download, so the proof covers the bytes as landed.
    const downloadedLineCount = await deps.countGzipJsonlLines(verifyPath);
    const evidence: ExactArchiveEvidenceInput = {
      manifestId,
      sourceTable: spec.parent,
      partitionLabel: label,
      tier: 'warm',
      cursorContract: spec.exactCursorTieBreakerColumn
        ? XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT
        : LEGACY_TS_TIEGROUP_CURSOR_CONTRACT,
      sourceRowCount: exportRes.sourceRowCount,
      exportedRowCount: exportRes.rowCount,
      downloadedRowCount: downloadedLineCount,
      objectChecksum: exportRes.checksum,
    };
    // Corruption blocks even the mutable uploaded transition. The immutable
    // proof itself lands after bounds validation and before verified/drop.
    deps.assertExactArchiveEquality(evidence);

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

    // R-1: the proof, the basis stamp and `verified` land together or not at all. The
    // order is the manifest tie trigger's invariant: evidence FIRST, then the stamp
    // (`trg_data_archive_manifest_basis_requires_evidence` refuses the stamp otherwise).
    await ctlClient.query('BEGIN');
    try {
      await deps.recordExactArchiveEvidence(ctlClient, evidence);
      await ctlClient.query(
        `UPDATE data_archive_manifest SET completeness_basis = $2 WHERE id = $1`,
        [manifestId, PROVEN_BASIS],
      );
      await updateManifestVerified(ctlClient, manifestId);
      await ctlClient.query('COMMIT');
    } catch (err) {
      await ctlClient.query('ROLLBACK').catch(() => {});
      throw err;
    }
    return {
      kind: 'exported',
      manifestId,
      rowCount: exportRes.rowCount,
      bytesCompressed: exportRes.bytesCompressed,
    };
  } finally {
    try {
      deps.unlinkFile(exportRes.localPath);
    } catch {
      // ignore
    }
    if (verifyPath) {
      try {
        deps.unlinkFile(verifyPath);
      } catch {
        // ignore
      }
    }
  }
}

export interface StoredSnapshotEvidence {
  cursor_contract: string;
  selector_contract: string;
  selector_version: number;
  frozen_cutoff_at: Date;
  ranking_observed_at: Date;
  keep_floor_rows: number;
  day_start: Date;
  day_end: Date;
  source_row_count: number;
  ordered_key_sha256: string;
  full_row_sha256: string;
}

async function getStoredSnapshotEvidence(
  client: pg.Client,
  manifestId: string,
): Promise<StoredSnapshotEvidence | null> {
  const result = await client.query(
    `SELECT cursor_contract, selector_contract, selector_version,
            frozen_cutoff_at, ranking_observed_at, keep_floor_rows,
            day_start, day_end, source_row_count::text,
            ordered_key_sha256, full_row_sha256
       FROM data_archive_exact_evidence
      WHERE manifest_id = $1`,
    [manifestId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    selector_version: Number(row.selector_version),
    keep_floor_rows: Number(row.keep_floor_rows),
    source_row_count: Number(row.source_row_count),
    frozen_cutoff_at: new Date(row.frozen_cutoff_at),
    ranking_observed_at: new Date(row.ranking_observed_at),
    day_start: new Date(row.day_start),
    day_end: new Date(row.day_end),
  } as StoredSnapshotEvidence;
}

export function storedSnapshotEvidenceMatches(
  stored: StoredSnapshotEvidence,
  selector: XstockSnapshotSelector,
  proof: XstockSnapshotProof,
): boolean {
  return stored.cursor_contract === XSTOCK_SNAPSHOT_CURSOR_CONTRACT
    && stored.selector_contract === 'xstock-snapshot-ranked-day/v1'
    && stored.selector_version === 1
    && stored.frozen_cutoff_at.getTime() === selector.cutoffAt.getTime()
    && Number.isFinite(stored.ranking_observed_at.getTime())
    && stored.keep_floor_rows === selector.keepFloorRows
    && stored.day_start.getTime() === selector.dayStart.getTime()
    && stored.day_end.getTime() === selector.dayEnd.getTime()
    && snapshotProofMatches({
      sourceRowCount: stored.source_row_count,
      orderedKeySha256: stored.ordered_key_sha256,
      fullRowSha256: stored.full_row_sha256,
    }, proof);
}

function parseWarmStorageUri(uri: string): { bucket: string; objectPath: string } {
  const match = /^supabase:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error(`[B75 sweep] unsupported warm storage URI: ${uri}`);
  return { bucket: match[1], objectPath: match[2] };
}

export interface SnapshotArchiveOutcome {
  manifestId: string;
  partitionLabel: string;
  proof: XstockSnapshotProof;
  provenObjectPath: string;
  exportedPath: string;
  bytesCompressed: number;
  reused: boolean;
  selector: XstockSnapshotSelector;
  exportDurationMs: number;
  archiveDurationMs: number;
  readbackDurationMs: number;
}

/**
 * Snapshot-specific adapter around the existing exporter, manifest, storage
 * and exact-evidence state machine.  The label is not known until the current
 * ordered-key digest exists, so export precedes the existing-copy decision.
 */
export async function archiveSnapshotObject(
  storage: StorageClient,
  exportClient: pg.Client,
  ctlClient: pg.Client,
  cfg: B75SweepConfig,
  selector: XstockSnapshotSelector,
): Promise<SnapshotArchiveOutcome> {
  const provisionalLabel = `${selector.dayStart.toISOString().slice(0, 10)}-${RUN_ID}`;
  const exportStartedAt = Date.now();
  const exportRes = await exportPartition(exportClient, {
    sourceTable: selector.table,
    partitionLabel: provisionalLabel,
    rangeStart: selector.dayStart,
    rangeEnd: selector.dayEnd,
    timestampColumn: 'bucket_ts',
    compressionLevel: 6,
    snapshotSelector: selector,
  });
  const exportDurationMs = Date.now() - exportStartedAt;
  if (!exportRes.snapshotProof) {
    try { fs.unlinkSync(exportRes.localPath); } catch { /* already absent */ }
    throw new Error(`[B75 sweep][snapshot] ${selector.table}: exporter omitted snapshot proof`);
  }
  const proof = exportRes.snapshotProof;
  const partitionLabel = snapshotDayLabel(selector.dayStart, proof.orderedKeySha256);
  const objPath = `${cfg.warmPrefix}/${selector.table}/${partitionLabel}.jsonl.gz`;
  const storageUri = `supabase://${cfg.warmBucket}/${objPath}`;
  const verifyPath = `${exportRes.localPath}.verify`;

  try {
    const existing = await getManifestRow(ctlClient, selector.table, partitionLabel, 'warm');
    const needs = decisionNeeds(existing);
    const evidenceExists = existing && needs.evidence
      ? await evidenceExistsForManifest(ctlClient, existing.id)
      : false;
    const decision = decideExistingCopy(existing, evidenceExists, proof.sourceRowCount > 0);
    if (decision.kind === 'refuse') {
      throw new NonProvenExistingCopyError(decision.reason, selector.table, partitionLabel);
    }
    if (decision.kind === 'skip') {
      throw new Error(
        `[B75 sweep][snapshot] ${selector.table}/${partitionLabel}: current eligible rows cannot skip ${decision.reason}`,
      );
    }

    if (decision.kind === 'reuse') {
      const stored = await getStoredSnapshotEvidence(ctlClient, existing!.id);
      if (!stored || !storedSnapshotEvidenceMatches(stored, selector, proof)) {
        throw new NonProvenExistingCopyError('reuse-count-changed', selector.table, partitionLabel);
      }
      const remote = parseWarmStorageUri(existing!.storage_uri);
      const readbackStartedAt = Date.now();
      const download = await storage.downloadWarmFile(remote.bucket, remote.objectPath, verifyPath);
      if (download.checksum !== existing!.checksum) {
        throw new ChecksumMismatchError(
          `[B75 sweep][snapshot] ${selector.table}/${partitionLabel}: stored checksum=${existing!.checksum} readback=${download.checksum}`,
        );
      }
      const downloadedProof = await inspectGzipSnapshotJsonl(verifyPath);
      const readbackDurationMs = Date.now() - readbackStartedAt;
      if (!snapshotProofMatches(downloadedProof, proof)) {
        throw new ArchiveReadbackMismatchError(
          `[B75 sweep][snapshot] ${selector.table}/${partitionLabel}: current, stored and downloaded proofs differ`,
        );
      }
      return {
        manifestId: existing!.id,
        partitionLabel,
        proof,
        provenObjectPath: verifyPath,
        exportedPath: exportRes.localPath,
        bytesCompressed: 0,
        reused: true,
        selector: { ...selector, rankingObservedAt: stored.ranking_observed_at },
        exportDurationMs,
        archiveDurationMs: 0,
        readbackDurationMs,
      };
    }

    const manifestId = await upsertManifestPending(
      ctlClient,
      selector.table,
      partitionLabel,
      storageUri,
      selector.dayStart,
      selector.dayEnd,
    );
    const fileSize = fs.statSync(exportRes.localPath).size;
    if (fileSize > HARD_CAP_BYTES) {
      throw new Error(
        `[B75 sweep][snapshot] ${selector.table}/${partitionLabel}: compressed size ${fileSize}B exceeds ${HARD_CAP_BYTES}B`,
      );
    }
    const archiveStartedAt = Date.now();
    const upload = await storage.uploadWarmFile(cfg.warmBucket, objPath, exportRes.localPath, {
      size: fileSize,
      checksum: exportRes.checksum,
    });
    const archiveDurationMs = Date.now() - archiveStartedAt;
    const readbackStartedAt = Date.now();
    const download = await storage.downloadWarmFile(cfg.warmBucket, objPath, verifyPath);
    if (upload.checksum !== exportRes.checksum || download.checksum !== exportRes.checksum) {
      throw new ChecksumMismatchError(
        `[B75 sweep][snapshot] ${selector.table}/${partitionLabel}: upload/readback checksum mismatch`,
      );
    }
    const downloadedProof = await inspectGzipSnapshotJsonl(verifyPath);
    const readbackDurationMs = Date.now() - readbackStartedAt;
    if (!snapshotProofMatches(downloadedProof, proof)) {
      throw new ArchiveReadbackMismatchError(
        `[B75 sweep][snapshot] ${selector.table}/${partitionLabel}: downloaded key/content proof mismatch`,
      );
    }

    const evidence: ExactArchiveEvidenceInput = {
      manifestId,
      sourceTable: selector.table,
      partitionLabel,
      tier: 'warm',
      cursorContract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
      sourceRowCount: proof.sourceRowCount,
      exportedRowCount: exportRes.rowCount,
      downloadedRowCount: downloadedProof.sourceRowCount,
      objectChecksum: exportRes.checksum,
      snapshot: {
        ...proof,
        cutoffAt: selector.cutoffAt,
        rankingObservedAt: selector.rankingObservedAt,
        keepFloorRows: selector.keepFloorRows,
        dayStart: selector.dayStart,
        dayEnd: selector.dayEnd,
      },
    };
    assertExactArchiveEquality(evidence);
    await updateManifestUploaded(
      ctlClient,
      manifestId,
      exportRes.rowCount,
      exportRes.bytesCompressed,
      exportRes.minTs,
      exportRes.maxTs,
      exportRes.checksum,
      exportRes.bytesUncompressed,
    );
    await ctlClient.query('BEGIN');
    try {
      await recordExactArchiveEvidence(ctlClient, evidence);
      await ctlClient.query(
        `UPDATE data_archive_manifest SET completeness_basis = $2 WHERE id = $1`,
        [manifestId, PROVEN_BASIS],
      );
      await updateManifestVerified(ctlClient, manifestId);
      await ctlClient.query('COMMIT');
    } catch (err) {
      await ctlClient.query('ROLLBACK').catch(() => {});
      throw err;
    }
    return {
      manifestId,
      partitionLabel,
      proof,
      provenObjectPath: verifyPath,
      exportedPath: exportRes.localPath,
      bytesCompressed: exportRes.bytesCompressed,
      reused: false,
      selector,
      exportDurationMs,
      archiveDurationMs,
      readbackDurationMs,
    };
  } catch (err) {
    try { fs.unlinkSync(verifyPath); } catch { /* already absent */ }
    try { fs.unlinkSync(exportRes.localPath); } catch { /* already absent */ }
    throw err;
  }
}

export interface SnapshotDeleteOutcome {
  deletedRows: number;
  provenKeyLoadDurationMs: number;
  lockWaitDurationMs: number;
  compareDeleteDurationMs: number;
  commitDurationMs: number;
  lockedDurationMs: number;
  postCommitProofDurationMs: number;
}

export async function deleteSnapshotProvenObject(
  client: pg.Client,
  archived: SnapshotArchiveOutcome,
): Promise<SnapshotDeleteOutcome> {
  const selector = archived.selector;
  const provenKeyLoadStartedAt = Date.now();
  const downloadedProof = await loadSnapshotProvenKeys(client, archived.provenObjectPath);
  const provenKeyLoadDurationMs = Date.now() - provenKeyLoadStartedAt;
  if (!snapshotProofMatches(downloadedProof, archived.proof)) {
    throw new ArchiveReadbackMismatchError(
      `[B75 sweep][snapshot] ${selector.table}/${archived.partitionLabel}: pre-lock object proof changed`,
    );
  }

  let lockWaitDurationMs = 0;
  let compareDeleteDurationMs = 0;
  let commitDurationMs = 0;
  let lockedDurationMs = 0;
  let deletedRows: number;
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '1s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const lockStartedAt = Date.now();
    await client.query(`LOCK TABLE ${quoteIdent(selector.table)} IN SHARE MODE`);
    lockWaitDurationMs = Date.now() - lockStartedAt;
    const compareDeleteStartedAt = Date.now();
    const result = await client.query(
      snapshotLockedDeleteSql(selector),
      snapshotLockedDeleteParams(selector, archived.proof, archived.manifestId),
    );
    compareDeleteDurationMs = Date.now() - compareDeleteStartedAt;
    const row = result.rows[0];
    deletedRows = Number(row?.deleted_row_count ?? -1);
    if (row?.proof_matches !== true
      || Number(row?.current_row_count ?? -1) !== archived.proof.sourceRowCount
      || deletedRows !== archived.proof.sourceRowCount
      || Number(row?.manifest_rows_marked ?? 0) !== 1) {
      throw new ArchiveReadbackMismatchError(
        `[B75 sweep][snapshot] ${selector.table}/${archived.partitionLabel}: locked proof/delete gate refused`,
      );
    }
    const commitStartedAt = Date.now();
    await client.query('COMMIT');
    commitDurationMs = Date.now() - commitStartedAt;
    lockedDurationMs = Date.now() - lockStartedAt;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
  const postCommitProofStartedAt = Date.now();
  const remaining = Number((await client.query(
    snapshotProvenKeyAbsenceSql(selector.table),
  )).rows[0]?.remaining_rows ?? -1);
  const postCommitProofDurationMs = Date.now() - postCommitProofStartedAt;
  if (remaining !== 0) {
    throw new ArchiveReadbackMismatchError(
      `[B75 sweep][snapshot] ${selector.table}/${archived.partitionLabel}: ${remaining} proven key(s) remain after commit`,
    );
  }
  return {
    deletedRows,
    provenKeyLoadDurationMs,
    lockWaitDurationMs,
    compareDeleteDurationMs,
    commitDurationMs,
    lockedDurationMs,
    postCommitProofDurationMs,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Per-partition processing
// ───────────────────────────────────────────────────────────────────────────

export interface ProcessResult {
  status: 'dropped' | 'skipped' | 'failed';
  mode: 'whole' | 'sliced' | 'n/a';
  bytesHot: number;
  bytesWarm: number;
  rowCount: number;
  slices: number;
  durationMs: number;
  reason?: string;
  isChecksumMismatch?: boolean;
  /** B-B75-COUNT-GATE (#1195): the export held fewer/more rows than the source snapshot. */
  isCountMismatch?: boolean;
  /** B-B75-EXPORT-COMPLETENESS (#1195): an existing copy was refused — permanent until a human acts. */
  isNonProven?: boolean;
  /** The whole path dropped against an existing proven copy (resume), so rows/bytes read 0. */
  reused?: boolean;
}

export interface ProcessPartitionDependencies {
  createClient: () => pg.Client;
  partitionHotBytes: typeof partitionHotBytes;
  listMonthLabels: typeof listMonthLabels;
  getStorageClient: typeof getStorageClient;
  archiveObject: typeof archiveB75Object;
  dropAndMarkActive: typeof dropAndMarkActive;
  updateManifestActive: typeof updateManifestActive;
  listPresentDates: typeof listPresentDates;
  markLabelsActive: typeof markLabelsActive;
  now: () => number;
}

const DEFAULT_PROCESS_PARTITION_DEPS: ProcessPartitionDependencies = {
  createClient: () => new Client({ connectionString: process.env.DATABASE_URL }),
  partitionHotBytes,
  listMonthLabels,
  getStorageClient,
  archiveObject: archiveB75Object,
  dropAndMarkActive,
  updateManifestActive,
  listPresentDates,
  markLabelsActive,
  now: Date.now,
};

export async function processPartition(
  spec: B75ArchiveTableSpec,
  partition: PartitionRow,
  cfg: B75SweepConfig,
  deps: ProcessPartitionDependencies = DEFAULT_PROCESS_PARTITION_DEPS,
): Promise<ProcessResult> {
  const start = deps.now();

  // Fresh clients per partition: exportClient runs each export's REPEATABLE READ
  // READ ONLY snapshot (opened + committed INSIDE exportPartition, once per
  // object — not one long snapshot across the partition); ctlClient runs
  // manifest/DDL on a separate connection.
  const exportClient = deps.createClient();
  const ctlClient = deps.createClient();
  await exportClient.connect();
  await ctlClient.connect();

  let mode: 'whole' | 'sliced' = 'whole';
  let bytesHot = 0;

  try {
    bytesHot = await deps.partitionHotBytes(ctlClient, partition.child);

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
    const existingLabels = await deps.listMonthLabels(ctlClient, spec.parent, partition.partitionLabel);
    const resumeMode = deriveModeFromLabels(partition.partitionLabel, existingLabels);
    mode = resumeMode ?? decideSliceMode(bytesHot, cfg.sliceThresholdHotBytes);

    const storage = deps.getStorageClient();

    if (mode === 'whole') {
      // ─── WHOLE PATH ───────────────────────────────────────────────────────
      // B-B75-EXPORT-COMPLETENESS (Langston Step-2 r3): the `already-active` short-
      // circuit that lived here returned BEFORE the resume decision, so an `active`
      // label with live rows was silently skipped. The whole path now goes through
      // archiveB75Object's one decision; an empty `active`/`migrated` label comes
      // back `skipped` and is returned here BEFORE any drop or manifest write.
      const outcome = await deps.archiveObject(
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
      if (outcome.kind === 'skipped') {
        return {
          status: 'skipped',
          mode,
          bytesHot: 0,
          bytesWarm: 0,
          rowCount: 0,
          slices: 0,
          durationMs: deps.now() - start,
          reason: outcome.reason,
        };
      }
      await deps.dropAndMarkActive(ctlClient, partition.child, () =>
        deps.updateManifestActive(ctlClient, outcome.manifestId),
      );
      return {
        status: 'dropped',
        mode,
        bytesHot,
        bytesWarm: outcome.bytesCompressed,
        rowCount: outcome.rowCount,
        slices: 1,
        durationMs: deps.now() - start,
        reused: outcome.kind === 'reused',
      };
    }

    // ─── SLICED PATH ─────────────────────────────────────────────────────────
    // Enumerate distinct dates present (cheap per-day index probes), archive each
    // day as its own object, then DROP only after EVERY present date is verified.
    const presentDates = await deps.listPresentDates(
      ctlClient,
      partition.child,
      spec.timestampColumn,
      partition.rangeStart,
      partition.rangeEnd,
    );
    const presentLabels = presentDates.map(dayLabel);

    let bytesWarm = 0;
    let rowCount = 0;
    const skippedLabels = new Set<string>();
    for (const day of presentDates) {
      const dEnd = new Date(day.getTime() + 86_400_000);
      const outcome = await deps.archiveObject(
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
      if (outcome.kind === 'skipped') {
        // Defensive: present dates are row-derived, so the probe finds rows and an
        // active/migrated label refuses rather than skips. A skip still writes nothing.
        skippedLabels.add(dayLabel(day));
        continue;
      }
      bytesWarm += outcome.bytesCompressed;
      rowCount += outcome.rowCount;
    }
    if (skippedLabels.size > 0) {
      throw new Error(
        `[B75 sweep] ${spec.parent}/${partition.partitionLabel}: ${skippedLabels.size} present day(s) came back skipped ` +
          `(${[...skippedLabels].slice(0, 6).join(',')}) — a skip means no rows, which a present day cannot be; DROP refused`,
      );
    }

    // DROP gate (fold-in #1): every distinct present date must have a manifest
    // row in {verified, active} AND a proven completeness basis (#1195 OBJ-8 (a)).
    // Keys off dates PRESENT, not the calendar month.
    const stateRows = await ctlClient.query(
      `SELECT partition_label, state, completeness_basis FROM data_archive_manifest
        WHERE source_table = $1 AND tier = 'warm' AND partition_label = ANY($2::text[])`,
      [spec.parent, presentLabels],
    );
    const missing = missingProvenArchiveLabels(presentLabels, stateRows.rows);
    if (missing.length > 0) {
      throw new Error(
        `[B75 sweep] DROP gate BLOCKED ${spec.parent}/${partition.partitionLabel}: ` +
          `${missing.length}/${presentLabels.length} slice(s) not verified and proven: ${missing.slice(0, 6).join(',')}`,
      );
    }

    await deps.dropAndMarkActive(ctlClient, partition.child, () =>
      deps.markLabelsActive(ctlClient, spec.parent, presentLabels),
    );

    return {
      status: 'dropped',
      mode,
      bytesHot,
      bytesWarm,
      rowCount,
      slices: presentLabels.length,
      durationMs: deps.now() - start,
    };
  } catch (err) {
    const isChecksumMismatch = err instanceof ChecksumMismatchError;
    // The readback leg (downloaded vs source/exported, an unterminated row) is a count
    // mismatch too, never "transient" (Langston gate B BLOCKER-1).
    const isCountMismatch = err instanceof ExportRowCountMismatchError || err instanceof ArchiveReadbackMismatchError;
    const isNonProven = err instanceof NonProvenExistingCopyError;
    return {
      status: 'failed',
      mode,
      bytesHot,
      bytesWarm: 0,
      rowCount: 0,
      slices: 0,
      durationMs: deps.now() - start,
      reason: err instanceof Error ? err.message : String(err),
      isChecksumMismatch,
      isCountMismatch,
      isNonProven,
    };
  } finally {
    await exportClient.end().catch(() => {});
    await ctlClient.end().catch(() => {});
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Failure → system-alert (chunk E). Never let alert-writing mask the sweep error.
// ───────────────────────────────────────────────────────────────────────────

/** B-B75-EXPORT-COMPLETENESS (OBJ-5, Langston F2): every row carries a dedupe key, so a
 *  persistent failure is ONE row, not one a night. A keyed row replays its mint-time
 *  body, so the body names the run it was first seen in and points at the log; the
 *  current state is the log, never a count frozen into the body. */
async function raiseSweepAlert(
  title: string,
  body: string,
  severity: 'warning' | 'critical',
  metadata: Record<string, unknown>,
  dedupeKey: string,
): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(), // immediate; dispatcher promotes scheduled→active next tick
      category: 'breakage',
      severity,
      title,
      body: `${body} First seen in sweep run ${RUN_ID} (${new Date().toISOString()}); ` +
        `the current state of this condition is in ${SWEEP_LOG}.`,
      // batch = the batch that owns this keyed alert path (B-NEW-47 built the original
      // unkeyed one); metadata.batch is a routing read-site (Langston gate C record iv).
      metadata: { batch: 'B-B75-EXPORT-COMPLETENESS', source: 'b75-retention-sweep', run_id: RUN_ID, ...metadata },
      dedupe_key: dedupeKey,
    });
  } catch (alertErr) {
    console.error('[B75 sweep] failed to raise system-alert:', alertErr);
  }
}

/** The resolve edge: a later success for the same key clears it (the classes a run can
 *  outgrow — never `non-proven-existing`, which needs a human). Never masks the sweep. */
async function resolveSweepAlerts(keys: string[], what: string): Promise<void> {
  for (const key of keys) {
    try {
      const ids = await resolveAlertsByDedupeKey(
        key,
        SWEEP_ALERT_ACTOR,
        `b75 sweep run ${RUN_ID} succeeded for ${what}`,
        'timer-script',
      );
      if (ids.length > 0) console.log(`[B75 sweep] resolved ${ids.length} alert(s) on ${key}`);
    } catch (alertErr) {
      console.error(`[B75 sweep] failed to resolve alerts on ${key}:`, alertErr);
    }
  }
}

function failureClassText(cls: SweepFailureClass, refuseReason?: string): string {
  switch (cls) {
    case 'checksum':
      return 'CHECKSUM MISMATCH = possible data corruption — investigate before retry.';
    case 'count-mismatch':
      return 'ROW-COUNT MISMATCH = the archive copy would be incomplete, so the drop was refused (#1195). '
        + 'Not transient: it fails the same way every night until someone finds why the export and the source differ.';
    case 'non-proven-existing':
      return `REFUSED (#1195): ${refuseReason ?? 'an existing copy is not proven'}. Not transient: the next run reads the `
        + 'same row and refuses again. The hot data is kept, so it stays on the database disk every night this refuses — '
        + 'a human must decide what to do with this label.';
    default:
      // An unclassified failure. It is auto-resolved by a later success (real transients
      // exist), but it is NOT promised to be transient (Langston gate B BLOCKER-1).
      return 'UNCLASSIFIED failure — not known to be transient; read the run in the sweep log. '
        + 'The next nightly run retries from the last verified slice, and a success clears this row.';
  }
}

export interface PartitionSettlementDependencies {
  process: (
    spec: B75ArchiveTableSpec,
    partition: PartitionRow,
    cfg: B75SweepConfig,
  ) => Promise<ProcessResult>;
  resolveAlerts: typeof resolveSweepAlerts;
  raiseAlert: typeof raiseSweepAlert;
}

const DEFAULT_PARTITION_SETTLEMENT_DEPS: PartitionSettlementDependencies = {
  process: processPartition,
  resolveAlerts: resolveSweepAlerts,
  raiseAlert: raiseSweepAlert,
};

/** Execute one partition and take its keyed resolve/alert edge before returning
 * the result to the run-level counters and log formatter. */
export async function processPartitionAndSettle(
  spec: B75ArchiveTableSpec,
  partition: PartitionRow,
  cfg: B75SweepConfig,
  deps: PartitionSettlementDependencies = DEFAULT_PARTITION_SETTLEMENT_DEPS,
): Promise<ProcessResult> {
  const res = await deps.process(spec, partition, cfg);
  if (res.status !== 'failed') {
    await deps.resolveAlerts(
      AUTO_RESOLVED_CLASSES.map((cls) => partitionAlertKey(spec.parent, partition.partitionLabel, cls)),
      `${spec.parent}/${partition.partitionLabel} (${res.status})`,
    );
    return res;
  }

  const cls = sweepFailureClass(res);
  await deps.raiseAlert(
    `B75 retention sweep FAILED: ${spec.parent}/${partition.partitionLabel}`,
    `The nightly storage archive sweep could not move partition ${partition.partitionLabel} of ${spec.parent} ` +
      `to warm storage. mode=${res.mode}. The hot partition was NOT dropped (data is safe` +
      `${cls === 'non-proven-existing' ? `; it holds ${res.bytesHot} bytes on the database disk` : ''}). ` +
      `Reason: ${res.reason}. ${failureClassText(cls, res.reason)}`,
    cls === 'checksum' || cls === 'non-proven-existing' ? 'critical' : 'warning',
    {
      parent: spec.parent,
      partition_label: partition.partitionLabel,
      child: partition.child,
      mode: res.mode,
      failure_class: cls,
      is_checksum_mismatch: Boolean(res.isChecksumMismatch),
      is_count_mismatch: Boolean(res.isCountMismatch),
      is_non_proven: Boolean(res.isNonProven),
    },
    partitionAlertKey(spec.parent, partition.partitionLabel, cls),
  );
  return res;
}

export interface PlainArchiveRemovalDependencies {
  deleteBatch: () => Promise<number>;
  markActive: () => Promise<void>;
  vacuum: () => Promise<void>;
}

/** Run every bounded delete batch before the manifest state change, then
 * vacuum. A thrown archive/proof error occurs before this helper is called. */
export async function removePlainArchiveSource(
  batchSize: number,
  deps: PlainArchiveRemovalDependencies,
): Promise<number> {
  let deleted = 0;
  while (true) {
    const count = await deps.deleteBatch();
    deleted += count;
    if (count < batchSize) break;
  }
  await deps.markActive();
  await deps.vacuum();
  return deleted;
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
export interface SweepPlainDependencies {
  specs: readonly PlainRetentionTableSpec[];
  createClient: () => pg.Client;
  listPresentDates: typeof listPresentDates;
  getStorageClient: typeof getStorageClient;
  archiveObject: typeof archiveB75Object;
  removeSource: typeof removePlainArchiveSource;
  markLabelsActive: typeof markLabelsActive;
  resolveAlerts: typeof resolveSweepAlerts;
  raiseAlert: typeof raiseSweepAlert;
  now: () => number;
}

const DEFAULT_SWEEP_PLAIN_DEPS: SweepPlainDependencies = {
  specs: PLAIN_RETENTION_TABLES,
  createClient: () => new Client({ connectionString: process.env.DATABASE_URL }),
  listPresentDates,
  getStorageClient,
  archiveObject: archiveB75Object,
  removeSource: removePlainArchiveSource,
  markLabelsActive,
  resolveAlerts: resolveSweepAlerts,
  raiseAlert: raiseSweepAlert,
  now: Date.now,
};

export async function sweepPlainTables(
  cfg: B75SweepConfig,
  deps: SweepPlainDependencies = DEFAULT_SWEEP_PLAIN_DEPS,
): Promise<{ deleted: number; failed: number }> {
  let deletedTotal = 0;
  let failed = 0;

  for (const spec of deps.specs) {
    const retentionDays = cfg.retentionByTable.get(spec.table);
    if (retentionDays === undefined) {
      failed++;
      console.error(`[B75 sweep][plain] ${spec.table}: no retention configured — skipping`);
      continue;
    }
    const rawCutoff = new Date(deps.now() - retentionDays * 86_400_000);
    // B-B75-EXPORT-COMPLETENESS (Langston gate B BLOCKER-2): for an archive:true table the
    // labels archived and the rows deleted must be the SAME rows. The day scan exports whole
    // days [day, day+1), so the delete (and the tally) use the day-floor of the cutoff —
    // otherwise the trailing day is archived whole, deleted in part, marked `active`, and the
    // next run finds its leftover rows and refuses the table forever. Rows stay hot up to one
    // extra day; the delete-only lane keeps the exact cutoff.
    const cutoff = spec.archive
      ? new Date(Date.UTC(rawCutoff.getUTCFullYear(), rawCutoff.getUTCMonth(), rawCutoff.getUTCDate()))
      : rawCutoff;
    const ctl = deps.createClient();
    await ctl.connect();
    try {
      let tableDeleted = 0;
      const extraAnd = spec.extraPredicate ? ` AND (${spec.extraPredicate})` : '';
      // B-B75-EXPORT-COMPLETENESS (A14): the labels archived this run, hoisted out of
      // the archive branch so they can be marked `active` AFTER the delete below.
      let archivedLabels: string[] = [];

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
        const present = minTs === null ? [] : await deps.listPresentDates(
          ctl, spec.table, spec.timestampColumn, scanStart, cutoff, spec.extraPredicate,
        );
        if (present.length === 0) {
          console.log(`[B75 sweep][plain-archive] ${spec.table}: no age-eligible rows — nothing to archive`);
        } else {
          const storage = deps.getStorageClient();
          const exportClient = deps.createClient();
          await exportClient.connect();
          try {
            for (const day of present) {
              const label = day.toISOString().slice(0, 10);
              const dayEnd = new Date(day.getTime() + 86_400_000);
              const outcome = await deps.archiveObject(
                storage, exportClient, ctl, cfg,
                { parent: spec.table, timestampColumn: spec.timestampColumn, retentionConstantName: spec.retentionConstantName },
                label, day, dayEnd, spec.table, 0, spec.extraPredicate,
              );
              // One posture with the sliced path: a present day cannot come back skipped
              // (a skip means no rows); if it does, refuse the delete.
              if (outcome.kind === 'skipped') {
                throw new Error(
                  `[B75 sweep][plain-archive] ${spec.table}/${label}: a present day came back skipped (${outcome.reason}) — DELETE REFUSED this run (rows safe)`,
                );
              }
            }
          } finally {
            await exportClient.end();
          }
          // The gate: every present label verified/active AND proven before ANY delete
          // (#1195 OBJ-8 (b)). A refusal now raises an alert — it only logged before.
          const labels = present.map((d) => d.toISOString().slice(0, 10));
          const stateRows = await ctl.query(
            `SELECT partition_label, state, completeness_basis FROM data_archive_manifest
              WHERE source_table = $1 AND tier = 'warm' AND partition_label = ANY($2::text[])`,
            [spec.table, labels],
          );
          const missing = missingProvenArchiveLabels(labels, stateRows.rows);
          if (missing.length > 0) {
            throw new Error(
              `[B75 sweep][plain-archive] ${spec.table}: ${missing.length} present day(s) lack a verified, proven manifest row ` +
                `(${missing.slice(0, 3).join(', ')}…) — DELETE REFUSED this run (rows safe)`,
            );
          }
          archivedLabels = labels;
          // Exploration-anneal tally (pre-audit 4c(1)): fold the about-to-be-deleted
          // ranges' exploration-close counts into the persisted per-class tallies
          // (the anneal reader's EXACT predicate) so closedExplorationCount stays
          // monotone. The reader consumes these INSIDE its cachedCount closure.
          if (spec.explorationTally) {
            const tallyRes = await ctl.query(
              `SELECT asset_class, count(*)::int AS n FROM ${spec.table}
                WHERE metadata->>'admissionBasis' = 'exploration'
                  AND closed_at IS NOT NULL
                  AND (close_reason IS NULL OR close_reason <> ALL($2::text[]))
                  AND ${spec.timestampColumn} < $1${extraAnd}
                GROUP BY asset_class`,
              // B-CLOSE-WRITER-COSTS P-15 (Langston Part A C-2): the anneal reader's predicate, the shared non-outcome list.
              [cutoff, [...NON_OUTCOME_CLOSE_REASONS]],
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

      tableDeleted = await deps.removeSource(PLAIN_DELETE_BATCH, {
        deleteBatch: async () => {
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
          return r.rowCount ?? 0;
        },
        markActive: () => deps.markLabelsActive(ctl, spec.table, archivedLabels),
        vacuum: async () => { await ctl.query(`VACUUM ${spec.table}`); },
      });
      deletedTotal += tableDeleted;
      console.log(
        `[B75 sweep][plain] ${spec.table}: deleted ${tableDeleted} rows older than ` +
          `${cutoff.toISOString()} (retentionDays=${retentionDays}${spec.archive ? ', day-floored archive lane' : ', exact cutoff'}) + VACUUM`,
      );
      await deps.resolveAlerts(
        AUTO_RESOLVED_CLASSES.map((cls) => plainAlertKey(spec.table, cls)),
        `plain table ${spec.table}`,
      );
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[B75 sweep][plain] ${spec.table}: FAILED — ${reason}`);
      // OBJ-6 (Langston F4, re-pointed): name a count mismatch, a checksum mismatch or a
      // refusal for what it is, instead of calling every failure "retried next run".
      const cls = sweepFailureClass({
        isChecksumMismatch: err instanceof ChecksumMismatchError,
        isCountMismatch: err instanceof ExportRowCountMismatchError || err instanceof ArchiveReadbackMismatchError,
        isNonProven: err instanceof NonProvenExistingCopyError,
      });
      await deps.raiseAlert(
        `B75 plain-table retention FAILED: ${spec.table}`,
        `The nightly archive-and-age-delete for plain table ${spec.table} failed. Old rows were NOT removed ` +
          `(data is safe). Reason: ${reason}. ${failureClassText(cls, reason)}`,
        cls === 'checksum' || cls === 'non-proven-existing' ? 'critical' : 'warning',
        { table: spec.table, failure_class: cls },
        plainAlertKey(spec.table, cls),
      );
    } finally {
      await ctl.end();
    }
  }

  return { deleted: deletedTotal, failed };
}

// ───────────────────────────────────────────────────────────────────────────
// B-XSTOCK-SNAPSHOT-RETENTION — ranked snapshot lane
// ───────────────────────────────────────────────────────────────────────────

export interface SnapshotTableSweepResult {
  table: XstockSnapshotTable;
  objectsExamined: number;
  rowsDeleted: number;
  bytesArchived: number;
  failed: boolean;
}

export interface SnapshotTableSweepDependencies {
  createClient: () => pg.Client;
  getStorageClient: typeof getStorageClient;
  listSelectors: typeof listSnapshotSelectors;
  exportPartition: typeof exportPartition;
  archiveObject: typeof archiveSnapshotObject;
  deleteObject: typeof deleteSnapshotProvenObject;
  raiseAlert: typeof raiseSweepAlert;
  resolveAlerts: typeof resolveSweepAlerts;
  unlinkFile: (filePath: string) => void;
  now: () => number;
}

export async function listSnapshotSelectors(
  client: pg.Client,
  table: XstockSnapshotTable,
  config: { hotRetentionDays: number; keepFloorRows: number },
  rankingObservedAt: Date,
): Promise<XstockSnapshotSelector[]> {
  const cutoffAt = frozenSnapshotCutoff(rankingObservedAt, config.hotRetentionDays);
  const result = await client.query(
    snapshotEligibleDaysSql(table),
    [config.keepFloorRows, cutoffAt],
  );
  return result.rows.map((row) => {
    const dayStart = new Date(row.day_start);
    return {
      table,
      keepFloorRows: config.keepFloorRows,
      cutoffAt,
      rankingObservedAt,
      dayStart,
      dayEnd: new Date(dayStart.getTime() + 86_400_000),
    };
  });
}

export async function sweepSnapshotTable(
  cfg: B75SweepConfig,
  table: XstockSnapshotTable,
  deps: SnapshotTableSweepDependencies = {
    createClient: () => new Client({ connectionString: process.env.DATABASE_URL }),
    getStorageClient,
    listSelectors: listSnapshotSelectors,
    exportPartition,
    archiveObject: archiveSnapshotObject,
    deleteObject: deleteSnapshotProvenObject,
    raiseAlert: raiseSweepAlert,
    resolveAlerts: resolveSweepAlerts,
    unlinkFile: (filePath) => fs.unlinkSync(filePath),
    now: Date.now,
  },
): Promise<SnapshotTableSweepResult> {
  const config = cfg.snapshotByTable.get(table);
  if (!config) throw new Error(`[B75 sweep][snapshot] missing config for ${table}`);

  const ctlClient = deps.createClient();
  const exportClient = deps.createClient();
  await ctlClient.connect();
  await exportClient.connect();
  const storage = deps.getStorageClient();
  const rankingObservedAt = new Date(deps.now());
  let objectsExamined = 0;
  let rowsDeleted = 0;
  let bytesArchived = 0;
  let failed = false;

  try {
    const selectors = await deps.listSelectors(ctlClient, table, config, rankingObservedAt);
    console.log(
      `[B75 sweep][snapshot] ${table}: mode=${cfg.snapshotMutationEnabled ? 'apply' : 'dry-read'} `
      + `cutoff=${frozenSnapshotCutoff(rankingObservedAt, config.hotRetentionDays).toISOString()} `
      + `floor=${config.keepFloorRows} objects=${selectors.length}`,
    );

    for (const selector of selectors) {
      objectsExamined++;
      let exportedPath: string | null = null;
      let provenPath: string | null = null;
      try {
        if (!cfg.snapshotMutationEnabled) {
          const dry = await deps.exportPartition(exportClient, {
            sourceTable: selector.table,
            partitionLabel: `${selector.dayStart.toISOString().slice(0, 10)}-dry-${RUN_ID}`,
            rangeStart: selector.dayStart,
            rangeEnd: selector.dayEnd,
            timestampColumn: 'bucket_ts',
            compressionLevel: 6,
            snapshotSelector: selector,
          });
          exportedPath = dry.localPath;
          if (!dry.snapshotProof) throw new Error('snapshot dry read omitted exact proof');
          console.log(
            `[B75 sweep][snapshot] ${table}/${selector.dayStart.toISOString().slice(0, 10)}: `
            + `dry rows=${dry.snapshotProof.sourceRowCount} bytes_jsonl=${dry.bytesUncompressed} `
            + `bytes_gzip=${dry.bytesCompressed} key_sha256=${dry.snapshotProof.orderedKeySha256}`,
          );
          continue;
        }

        const archived = await deps.archiveObject(storage, exportClient, ctlClient, cfg, selector);
        exportedPath = archived.exportedPath;
        provenPath = archived.provenObjectPath;
        const deletion = await deps.deleteObject(ctlClient, archived);
        rowsDeleted += deletion.deletedRows;
        bytesArchived += archived.bytesCompressed;
        console.log(
          `[B75 sweep][snapshot] ${table}/${archived.partitionLabel}: `
          + `${archived.reused ? 'reused' : 'archived'} rows=${deletion.deletedRows} `
          + `bytes_gzip=${archived.bytesCompressed} export_ms=${archived.exportDurationMs} `
          + `archive_ms=${archived.archiveDurationMs} readback_ms=${archived.readbackDurationMs} `
          + `proven_key_load_ms=${deletion.provenKeyLoadDurationMs} lock_wait_ms=${deletion.lockWaitDurationMs} `
          + `compare_delete_ms=${deletion.compareDeleteDurationMs} commit_ms=${deletion.commitDurationMs} `
          + `locked_ms=${deletion.lockedDurationMs} post_commit_proof_ms=${deletion.postCommitProofDurationMs}`,
        );
      } catch (err) {
        failed = true;
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[B75 sweep][snapshot] ${table}: stopped after object failure — ${reason}`);
        await deps.raiseAlert(
          `B75 snapshot retention failed: ${table}`,
          `The ranked snapshot lane stopped this table before its next object. Reason: ${reason}`,
          'warning',
          { batch: 'B-XSTOCK-SNAPSHOT-RETENTION', table, run_id: RUN_ID },
          `b75-snapshot:${table}:failure`,
        );
        break;
      } finally {
        if (provenPath) {
          try { deps.unlinkFile(provenPath); } catch { /* already absent */ }
        }
        if (exportedPath) {
          try { deps.unlinkFile(exportedPath); } catch { /* already absent */ }
        }
      }
    }

    if (rowsDeleted > 0) {
      const vacuumStartedAt = deps.now();
      await ctlClient.query(`VACUUM (ANALYZE) ${quoteIdent(table)}`);
      console.log(
        `[B75 sweep][snapshot] ${table}: vacuum_count=1 rows_deleted=${rowsDeleted} `
        + `vacuum_ms=${deps.now() - vacuumStartedAt} physical_allocation_unchanged_expected=true`,
      );
    } else {
      console.log(`[B75 sweep][snapshot] ${table}: vacuum_count=0 rows_deleted=0`);
    }
    if (!failed) {
      await deps.resolveAlerts([`b75-snapshot:${table}:failure`], `the ${table} snapshot lane`);
    }
    return { table, objectsExamined, rowsDeleted, bytesArchived, failed };
  } finally {
    await exportClient.end().catch(() => {});
    await ctlClient.end().catch(() => {});
  }
}

export function parseRetentionSweepArgs(argv: string[]): { snapshotOnly: boolean } {
  let snapshotOnly = false;
  for (const arg of argv) {
    if (arg === '--snapshot-only') snapshotOnly = true;
    else throw new Error(`[B75 sweep] unknown argument: ${arg}`);
  }
  return { snapshotOnly };
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────

export interface RetentionSweepCliDependencies {
  env: NodeJS.ProcessEnv;
  exit: (code: number) => void;
  run: () => Promise<void>;
}

async function runRetentionSweepCliBody(): Promise<void> {
  if (await runSweep(parseRetentionSweepArgs(process.argv.slice(2)))) process.exit(1);
}

export async function runRetentionSweepCli(
  deps: RetentionSweepCliDependencies = {
    env: process.env,
    exit: (code) => process.exit(code),
    run: runRetentionSweepCliBody,
  },
): Promise<void> {
  if (deps.env.B75_SWEEP_LOCK_HELD !== '1') {
    console.error('[B75 sweep] REFUSED: invoke through server/scripts/b75-retention-run.sh so cron and manual runs share the kernel lock');
    deps.exit(1);
    return;
  }
  if (!deps.env.DATABASE_URL) {
    console.error('[B75 sweep] DATABASE_URL not set');
    deps.exit(1);
    return;
  }
  if (!deps.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[B75 sweep] SUPABASE_SERVICE_ROLE_KEY not set');
    deps.exit(1);
    return;
  }
  await deps.run();
}

async function runSweep(options: { snapshotOnly: boolean } = { snapshotOnly: false }): Promise<boolean> {
  const ctl = new Client({ connectionString: process.env.DATABASE_URL });
  await ctl.connect();
  let cfg: B75SweepConfig;
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
    `[B75 sweep] started at ${startedAt.toISOString()} run_id=${RUN_ID} slice_threshold_hot_bytes=${cfg.sliceThresholdHotBytes}`,
  );

  if (!options.snapshotOnly) {
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
      const res = await processPartitionAndSettle(spec, partition, cfg);
      if (res.status === 'dropped') {
        partitionsDropped++;
        bytesFreedTotal += res.bytesHot;
        bytesArchivedTotal += res.bytesWarm;
        console.log(
          `[B75 sweep] ${spec.parent}/${partition.partitionLabel}: dropped mode=${res.mode} slices=${res.slices}` +
            `${res.reused ? ' (against an existing proven copy — resume, recount matched; rows/bytes below are for this run, i.e. 0)' : ''} ` +
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
      }
    }
    }
  }

  // P19-B5c: plain (non-partitioned) retention pass — runs after the partition
  // sweep so B75 remains the single retention owner for all archive tables.
  const plainResult = options.snapshotOnly
    ? { deleted: 0, failed: 0 }
    : await sweepPlainTables(cfg);

  const snapshotResults: SnapshotTableSweepResult[] = [];
  for (const policy of XSTOCK_SNAPSHOT_POLICIES) {
    snapshotResults.push(await sweepSnapshotTable(cfg, policy.table));
  }
  const snapshotRowsDeleted = snapshotResults.reduce((sum, result) => sum + result.rowsDeleted, 0);
  const snapshotFailed = snapshotResults.filter((result) => result.failed).length;

  const totalMs = Date.now() - startedAt.getTime();
  console.log(
    `[B75 sweep] DONE — examined=${partitionsExamined} dropped=${partitionsDropped} ` +
      `failed=${partitionsFailed} bytes_freed=${bytesFreedTotal} ` +
      `bytes_archived=${bytesArchivedTotal} plain_deleted=${plainResult.deleted} ` +
      `plain_failed=${plainResult.failed} snapshot_deleted=${snapshotRowsDeleted} `
      + `snapshot_failed=${snapshotFailed} duration_ms=${totalMs}`,
  );
  // Reaching DONE is the fatal key's resolve edge: a run that completes has not crashed.
  await resolveSweepAlerts([FATAL_ALERT_KEY], 'the whole sweep (reached DONE)');

  // Return the failure flag; main() releases the run-lock (finally) THEN exits
  // non-zero. A fatal throw propagates through main()'s finally to the catch below.
  return partitionsFailed > 0 || plainResult.failed > 0 || snapshotFailed > 0;
}

export interface RetentionSweepProcessDependencies {
  runCli: () => Promise<void>;
  raiseAlert: typeof raiseSweepAlert;
  exit: (code: number) => void;
}

export async function runRetentionSweepProcess(
  deps: RetentionSweepProcessDependencies = {
    runCli: () => runRetentionSweepCli(),
    raiseAlert: raiseSweepAlert,
    exit: (code) => process.exit(code),
  },
): Promise<void> {
  try {
    await deps.runCli();
  } catch (err) {
    console.error('[B75 sweep] fatal:', err);
    await deps.raiseAlert(
      'B75 retention sweep CRASHED',
      `The nightly storage archive sweep crashed before completing. No partition is left half-dropped ` +
        `(DROP only happens after verify). Reason: ${err instanceof Error ? err.message : String(err)}`,
      'critical',
      { fatal: true },
      FATAL_ALERT_KEY,
    );
    deps.exit(1);
  }
}

if (isDirectEntry(import.meta.url)) {
  void runRetentionSweepProcess();
}
