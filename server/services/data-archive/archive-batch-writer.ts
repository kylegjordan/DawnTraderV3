/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B70 Step 3.2 — Archive Batch Writer (shared helper)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Shared 5-second buffered writer for the 5 B70 archive tables. Mirrors the
 * B74 ohlc-batch-writer pattern but generalized: each archiver registers its
 * table + column list once at startup and pushes plain row objects via
 * `enqueueArchiveRow()`. The flush timer drains all buffers on the same cadence
 * through a 2-slot counting semaphore so archivers can't starve VTS / signal-
 * orchestrator / B73 hook DB writes.
 *
 * Design properties (per BATCH_70_SCOPE.md §A.2 + §A.5 + Langston #893+#894+#897):
 *  - Per-table named buffers (string key)
 *  - Bounded queue (default 50,000 rows total across all buffers; configurable
 *    via `b70_archive_writer_queue_max` module_constant)
 *  - Drop-OLDEST on overflow with `[B70][ARCH][OVERFLOW]` log line + counter
 *    (the dashboard panel surfaces the count)
 *  - 1,000-row chunks per insert to stay under Postgres 65,535-param bind limit
 *  - Drizzle-sql tagged inserts so JSONB columns get proper binding
 *  - Try/catch on every flush — failures log + drop, never throw upstream
 *
 * Reference: BATCH_70_SCOPE.md + BATCH_70_PRE_AUDIT.md §3 (cascade analysis)
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

const BATCH_FLUSH_INTERVAL_MS = 5_000;
const POOL_SLOT_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_INSERTS = 2;
const CHUNK_SIZE = 1_000;
const DEFAULT_QUEUE_MAX = 50_000;

const JSONB_COLUMN_NAMES = new Set([
  'features',
  'modulators',
  'gate_decision',
  'scan_stage_decision',
  'state_snapshot',
  'snapshot',
  'retroactive_inputs',
  'metadata',
]);

/** A row buffered for write. Plain object — column names are the keys. */
export type ArchiveRow = Record<string, unknown>;

interface TableBuffer {
  rows: ArchiveRow[];
  columns: string[];
  /**
   * B-NEW-53: columns that emit the SQL keyword `DEFAULT` (column default, e.g.
   * a sequence) when their value is `undefined` for a given row, instead of
   * NULL. Lets the same buffer hold rows that app-supply an id and rows that
   * defer to the DB DEFAULT — without ever losing a base row. `null` still
   * means NULL (explicit); only `undefined` triggers DEFAULT.
   */
  defaultOnUndefined: Set<string>;
  overflowDrops: number;
  totalFlushed: number;
  lastFlushAt: number | null;
  lastError: string | null;
}

const buffers: Map<string, TableBuffer> = new Map();
let queueMax: number = DEFAULT_QUEUE_MAX;

let activeInserts = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeInserts < MAX_CONCURRENT_INSERTS) {
    activeInserts++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      activeInserts++;
      resolve();
    };
    const timeoutId = setTimeout(() => {
      const idx = waitQueue.indexOf(resolveOnce);
      if (idx >= 0) waitQueue.splice(idx, 1);
      reject(new Error('archive-batch-writer: pool slot timeout (5s)'));
    }, POOL_SLOT_TIMEOUT_MS);
    waitQueue.push(resolveOnce);
  });
}

function releaseSlot(): void {
  activeInserts--;
  const next = waitQueue.shift();
  if (next) next();
}

function totalBufferedRows(): number {
  let total = 0;
  for (const buf of buffers.values()) total += buf.rows.length;
  return total;
}

/**
 * Register a table's column list once at startup. Idempotent.
 * @param defaultOnUndefined B-NEW-53: columns that emit SQL `DEFAULT` (not NULL)
 *   when their value is `undefined` — e.g. an `id` column backed by a sequence,
 *   so rows that don't app-supply an id still insert cleanly via the DB default.
 */
export function registerArchiveTable(
  tableName: string,
  columns: string[],
  defaultOnUndefined: string[] = [],
): void {
  if (buffers.has(tableName)) return;
  buffers.set(tableName, {
    rows: [],
    columns: [...columns],
    defaultOnUndefined: new Set(defaultOnUndefined),
    overflowDrops: 0,
    totalFlushed: 0,
    lastFlushAt: null,
    lastError: null,
  });
}

/**
 * Enqueue a row. Non-blocking, hot-path safe (no awaits). Drops on overflow
 * with a periodic log line.
 */
export function enqueueArchiveRow(tableName: string, row: ArchiveRow): boolean {
  const buf = buffers.get(tableName);
  if (!buf) {
    console.error(`[B70][ARCH] enqueue called for unregistered table='${tableName}'`);
    return false;
  }
  if (totalBufferedRows() >= queueMax) {
    if (buf.rows.length > 0) {
      buf.rows.shift();
      buf.overflowDrops++;
    }
    if (buf.overflowDrops % 100 === 1) {
      console.warn(
        `[B70][ARCH][OVERFLOW] table='${tableName}' total drops=${buf.overflowDrops}`,
      );
    }
  }
  buf.rows.push(row);
  return true;
}

/** Set the global queue cap (called from bootstrap after module_constants resolution). */
export function setQueueMax(max: number): void {
  if (max > 0) queueMax = max;
}

async function insertChunk(
  tableName: string,
  columns: string[],
  rows: ArchiveRow[],
  defaultOnUndefined: Set<string>,
): Promise<void> {
  if (rows.length === 0) return;

  const rowFragments = rows.map((row) => {
    const cellFragments = columns.map((col) => {
      const raw = row[col];
      // B-NEW-53: a default-on-undefined column (e.g. `id`) emits the SQL
      // keyword DEFAULT when the row didn't supply a value, so the DB sequence
      // fills it. Explicit `null` still means NULL.
      if (raw === undefined && defaultOnUndefined.has(col)) return sql`DEFAULT`;
      if (raw === undefined || raw === null) return sql`NULL`;
      if (JSONB_COLUMN_NAMES.has(col)) {
        const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
        return sql`${text}::jsonb`;
      }
      return sql`${raw}`;
    });
    return sql`(${sql.join(cellFragments, sql`, `)})`;
  });

  const colSql = sql.raw(columns.map((c) => `"${c}"`).join(', '));
  const tableSql = sql.raw(`"${tableName}"`);
  const stmt = sql`INSERT INTO ${tableSql} (${colSql}) VALUES ${sql.join(rowFragments, sql`, `)}`;
  await db.execute(stmt);
}

async function flushTable(tableName: string, buf: TableBuffer): Promise<void> {
  if (buf.rows.length === 0) return;
  const drained = buf.rows.splice(0, buf.rows.length);
  try {
    await acquireSlot();
    try {
      for (let i = 0; i < drained.length; i += CHUNK_SIZE) {
        const slice = drained.slice(i, i + CHUNK_SIZE);
        await insertChunk(tableName, buf.columns, slice, buf.defaultOnUndefined);
      }
      buf.totalFlushed += drained.length;
      buf.lastFlushAt = Date.now();
      buf.lastError = null;
    } finally {
      releaseSlot();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    buf.lastError = msg;
    console.error(
      `[B70][ARCH] flush failed table='${tableName}' (${drained.length} rows dropped): ${msg}`,
    );
  }
}

let flushTimer: NodeJS.Timeout | null = null;

export function startArchiveBatchWriter(): void {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    const tasks: Promise<void>[] = [];
    for (const [tableName, buf] of buffers.entries()) {
      tasks.push(flushTable(tableName, buf));
    }
    await Promise.all(tasks);
  }, BATCH_FLUSH_INTERVAL_MS);
  console.log(
    `[B70][ARCH] batch writer started (flush every ${BATCH_FLUSH_INTERVAL_MS / 1000}s, ` +
      `max ${MAX_CONCURRENT_INSERTS} concurrent inserts, queueMax=${queueMax})`,
  );
}

export async function stopArchiveBatchWriter(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  const tasks: Promise<void>[] = [];
  for (const [tableName, buf] of buffers.entries()) {
    tasks.push(flushTable(tableName, buf));
  }
  await Promise.all(tasks);
}

export interface ArchiveStats {
  bufferDepth: number;
  overflowDrops: number;
  totalFlushed: number;
  lastFlushAt: number | null;
  lastError: string | null;
}

export function getArchiveStats(): Record<string, ArchiveStats> {
  const out: Record<string, ArchiveStats> = {};
  for (const [name, buf] of buffers.entries()) {
    out[name] = {
      bufferDepth: buf.rows.length,
      overflowDrops: buf.overflowDrops,
      totalFlushed: buf.totalFlushed,
      lastFlushAt: buf.lastFlushAt,
      lastError: buf.lastError,
    };
  }
  return out;
}

/** Test-only: reset internal state. */
export function _resetForTests(): void {
  buffers.clear();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  activeInserts = 0;
  waitQueue.length = 0;
  queueMax = DEFAULT_QUEUE_MAX;
}
