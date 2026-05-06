/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B75 — Partition Exporter
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Streams a partition (or a date-range slice of an unpartitioned table) to a
 * local gzipped JSONL file, computing row count + min/max timestamps + SHA-256
 * along the way. Used by:
 *   - b75-retention-sweep.ts (full B74 partition export)
 *   - context-bridge-log-ttl.ts (per-month export of unpartitioned table)
 *
 * Modeled on `server/scripts/b70-table-export.ts` (B70 chose JSONL.gz over
 * Parquet — see BATCH_75_PRE_AUDIT.md F2). Adds:
 *   - REPEATABLE READ snapshot (Langston rev-2 ask a.3)
 *   - SHA-256 streaming (Langston rev-2 ask a.1)
 *   - min_ts/max_ts tracking (Langston rev-2 ask a.4)
 *   - Crash-safe temp file in /tmp/b75-export/
 *
 * Reference: BATCH_75_SCOPE.md §C.1 + §C.3 + BATCH_75_PRE_AUDIT.md §E.3
 * ═════════════════════════════════════════════════════════════════════════════
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';

const TMP_BASE = process.env.B75_EXPORT_TMP_DIR ?? '/tmp/b75-export';

export interface ExportRequest {
  /** Source table name (parent if partitioned, or the table itself). */
  sourceTable: string;
  /** Partition label, e.g. '2026-05'. For unpartitioned slices, use the same convention. */
  partitionLabel: string;
  /** Inclusive start of the row-range to export. */
  rangeStart: Date;
  /** Exclusive end of the row-range to export. */
  rangeEnd: Date;
  /**
   * Column to use for filtering + min/max tracking. Defaults to 'timestamp'
   * (matches context_bridge_log + B74 ticker tables). B74 OHLC tables use 'ts'
   * — caller passes that explicitly.
   */
  timestampColumn?: string;
  /**
   * Specific child partition table name. If provided, the SELECT runs against
   * the child partition directly (faster — no parent dispatch). For
   * unpartitioned tables omit and we read from sourceTable with WHERE clause.
   */
  partitionTableName?: string;
  /** Optional: gzip compression level 1-9 (default 6). */
  compressionLevel?: number;
}

export interface ExportResult {
  /** Local path to the gzipped JSONL file. Caller is responsible for unlink after upload. */
  localPath: string;
  /** Total uncompressed bytes written (sum of JSONL line lengths). */
  bytesUncompressed: number;
  /** Compressed file size on disk. */
  bytesCompressed: number;
  /** Number of rows exported. */
  rowCount: number;
  /** Earliest timestamp seen in the export (or rangeStart if empty). */
  minTs: Date;
  /** Latest timestamp seen in the export (or rangeEnd if empty). */
  maxTs: Date;
  /** SHA-256 hex of the compressed file. */
  checksum: string;
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/**
 * Begin a REPEATABLE READ transaction on the client, run the export, COMMIT.
 *
 * Caller must pass a fresh `pg.Client` (we won't share it with other queries
 * during the transaction window). Caller is responsible for `client.end()`.
 */
export async function exportPartition(
  client: pg.Client,
  req: ExportRequest,
): Promise<ExportResult> {
  const tsCol = req.timestampColumn ?? 'timestamp';
  const target = req.partitionTableName ?? req.sourceTable;
  const compressionLevel = req.compressionLevel ?? 6;

  const dir = path.join(TMP_BASE, req.sourceTable);
  ensureDir(dir);
  const localPath = path.join(dir, `${req.partitionLabel}.jsonl.gz`);
  // Clean any stale file from a previous failed attempt
  try {
    fs.unlinkSync(localPath);
  } catch {
    // ignore — file may not exist
  }

  // Open snapshot
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

  let rowCount = 0;
  let bytesUncompressed = 0;
  let minTs: Date | null = null;
  let maxTs: Date | null = null;

  try {
    // Stream rows in batches to keep memory bounded. LIMIT/OFFSET pagination
    // is correct under REPEATABLE READ since the snapshot is stable.
    const BATCH = 5000;
    let offset = 0;

    const out = fs.createWriteStream(localPath);
    const gzip = zlib.createGzip({ level: compressionLevel });
    gzip.pipe(out);

    while (true) {
      const r = await client.query(
        `SELECT * FROM ${quoteIdent(target)}
         WHERE ${quoteIdent(tsCol)} >= $1 AND ${quoteIdent(tsCol)} < $2
         ORDER BY ${quoteIdent(tsCol)} ASC
         LIMIT ${BATCH} OFFSET ${offset}`,
        [req.rangeStart, req.rangeEnd],
      );
      if (r.rows.length === 0) break;

      for (const row of r.rows) {
        const ts = row[tsCol];
        if (ts) {
          const tsDate = ts instanceof Date ? ts : new Date(ts);
          if (minTs === null || tsDate < minTs) minTs = tsDate;
          if (maxTs === null || tsDate > maxTs) maxTs = tsDate;
        }
        const line = JSON.stringify(row) + '\n';
        if (!gzip.write(line)) {
          // Respect backpressure — wait for drain before continuing.
          await new Promise<void>((resolve) => gzip.once('drain', () => resolve()));
        }
        bytesUncompressed += Buffer.byteLength(line, 'utf-8');
        rowCount++;
      }

      if (r.rows.length < BATCH) break;
      offset += BATCH;
    }

    gzip.end();
    await new Promise<void>((resolve, reject) => {
      out.on('close', () => resolve());
      out.on('error', reject);
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      // ignore rollback errors
    });
    // Cleanup local temp file on failure
    try {
      fs.unlinkSync(localPath);
    } catch {
      // ignore
    }
    throw err;
  }

  const stat = fs.statSync(localPath);
  const checksum = await sha256OfFile(localPath);

  return {
    localPath,
    bytesUncompressed,
    bytesCompressed: stat.size,
    rowCount,
    // Fall back to declared range bounds if no rows were exported (empty partition)
    minTs: minTs ?? req.rangeStart,
    maxTs: maxTs ?? new Date(req.rangeEnd.getTime() - 1),
    checksum,
  };
}

/**
 * Compute SHA-256 of a file by streaming. Used for the local-file checksum
 * captured immediately after export, before upload.
 */
export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  await pipeline(stream, async function* (source) {
    for await (const chunk of source) {
      hash.update(chunk as Buffer);
      yield chunk;
    }
  });
  return hash.digest('hex');
}

/**
 * Simple SQL identifier quoting. We only accept alphanumeric + underscore so
 * this is safe — partition names from pg_inherits match this pattern.
 */
function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`[B75 partition-exporter] unsafe identifier: ${name}`);
  }
  return `"${name}"`;
}
