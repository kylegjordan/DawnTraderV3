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
    // Stream rows in batches via KEYSET pagination, not LIMIT/OFFSET.
    //
    // LIMIT/OFFSET becomes O(N²) for large partitions because each batch
    // re-scans past `offset` rows under the snapshot. On Supabase Pro with
    // 60s pooler statement_timeout, OFFSET ~80K+ on a wide JSONB-toasted
    // table starts failing. Keyset uses a (timestamp, id) cursor — each
    // batch scans only the next BATCH rows directly via the timestamp index.
    //
    // The cursor pair (timestamp, id) handles equal-timestamp rows:
    //   first batch:  WHERE ts >= rangeStart AND ts < rangeEnd
    //   subsequent:   WHERE (ts, id) > (lastTs, lastId) AND ts < rangeEnd
    //
    // PK on context_bridge_log + B74 tables is `id` (uuid) — string compare
    // is correct + stable. For B74 tables with composite PKs, the keyset
    // tiebreaker still works since the PK is unique.
    const BATCH = 5000;

    const out = fs.createWriteStream(localPath);
    const gzip = zlib.createGzip({ level: compressionLevel });
    gzip.pipe(out);

    let lastTs: Date | null = null;
    let lastId: string | null = null;
    let firstBatch = true;

    while (true) {
      let r;
      if (firstBatch) {
        r = await client.query(
          `SELECT * FROM ${quoteIdent(target)}
           WHERE ${quoteIdent(tsCol)} >= $1 AND ${quoteIdent(tsCol)} < $2
           ORDER BY ${quoteIdent(tsCol)} ASC, id ASC
           LIMIT ${BATCH}`,
          [req.rangeStart, req.rangeEnd],
        );
        firstBatch = false;
      } else {
        r = await client.query(
          `SELECT * FROM ${quoteIdent(target)}
           WHERE ${quoteIdent(tsCol)} < $3
             AND (${quoteIdent(tsCol)} > $1
                  OR (${quoteIdent(tsCol)} = $1 AND id > $2))
           ORDER BY ${quoteIdent(tsCol)} ASC, id ASC
           LIMIT ${BATCH}`,
          [lastTs, lastId, req.rangeEnd],
        );
      }
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

      // Advance the keyset cursor from the last row of this batch
      const lastRow = r.rows[r.rows.length - 1];
      const lastRowTs = lastRow[tsCol];
      lastTs = lastRowTs instanceof Date ? lastRowTs : new Date(lastRowTs);
      lastId = String(lastRow.id);

      if (r.rows.length < BATCH) break;
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
 *
 * B75 hotfix 2026-05-06: previous version used `pipeline(src, async function*)`
 * pattern with `yield chunk` but no downstream destination — caused the
 * generator to block waiting for a consumer that never arrived (first manual
 * sweep hung in this function for 30+ minutes). Replaced with a plain
 * for-await loop over the read stream.
 */
export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
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
