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
import { ArchiveReadbackMismatchError } from './archive-completeness.js';
import {
  appendSnapshotKey,
  assertCanonicalSnapshotObject,
  assertSnapshotSchemaColumns,
  snapshotPopulationParams,
  snapshotPopulationSql,
  snapshotSchemaValidationSql,
  type XstockSnapshotCanonicalRow,
  type XstockSnapshotProof,
  type XstockSnapshotSelector,
} from './xstock-snapshot-retention.js';

const TMP_BASE = process.env.B75_EXPORT_TMP_DIR ?? '/tmp/b75-export';
/** Legacy-mode cursor column: the timestamp as database text, stripped before the row is written. */
const LEGACY_CURSOR_COL = '__b75_cursor_ts';

/**
 * B-B75-COUNT-GATE hotfix (#1195): the export did not contain every source row
 * in its snapshot. Thrown BEFORE the caller uploads, verifies or drops anything,
 * so the source partition/rows stay in place and the next run retries.
 */
export class ExportRowCountMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportRowCountMismatchError';
  }
}

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
  /**
   * B-TRADE-TIER-REGISTER: optional STATIC SQL fragment ANDed into the export
   * WHERE clause (e.g. `closed = true`). Comes ONLY from the sweep's static
   * allow-listed table specs — never user input — same interpolation contract
   * as the identifiers. Lets a plain (unpartitioned) table export a row SUBSET
   * (vts_open_trades archives closed rows only; open rows are never touched).
   */
  extraPredicate?: string;
  /**
   * Exact-provenance mode. The ordinary exporter historically paginates only
   * by timestamp; that is sufficient only for tables whose timestamp values
   * are effectively unique. Provenance ledgers can contain many rows with the
   * same arrival timestamp, so they must advance on a stable second key.
   *
   * When present, rows are rendered to JSON by PostgreSQL (`to_jsonb`) rather
   * than round-tripped through node-postgres values. This preserves
   * microsecond timestamptz precision. The exporter also counts the source rows
   * in the same REPEATABLE READ snapshot and refuses an incomplete export.
   */
  exactCursorTieBreakerColumn?: string;
  /** Allow-listed PostgreSQL type for the text transport of the exact cursor. */
  exactCursorTieBreakerType?: 'uuid';
  /**
   * B-XSTOCK-SNAPSHOT-RETENTION: optional ranked-day population adapter.
   * It replaces the ordinary time-range SELECT while retaining this exporter's
   * transaction, gzip, checksum and local-file lifecycle.
   */
  snapshotSelector?: XstockSnapshotSelector;
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
  /** Same-snapshot source count (both modes since #1195; an export that differs throws). */
  sourceRowCount: number | null;
  /** Exact mutable-snapshot proof; absent for every generic B75 lane. */
  snapshotProof?: XstockSnapshotProof;
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
  const exactTieCol = req.exactCursorTieBreakerColumn;
  if (req.snapshotSelector && exactTieCol) {
    throw new Error('[B75 partition-exporter] snapshot adapter and generic exact cursor are mutually exclusive');
  }
  if (req.snapshotSelector && (
    req.snapshotSelector.table !== req.sourceTable
    || req.snapshotSelector.dayStart.getTime() !== req.rangeStart.getTime()
    || req.snapshotSelector.dayEnd.getTime() !== req.rangeEnd.getTime()
  )) throw new Error('[B75 partition-exporter] snapshot selector does not match export source/range');
  if (exactTieCol && req.exactCursorTieBreakerType !== 'uuid') {
    throw new Error('[B75 partition-exporter] exact cursor tie-breaker type must be allow-listed uuid');
  }
  const exactTieCast = req.exactCursorTieBreakerType;

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
  let sourceRowCount: number | null = null;
  let snapshotProof: XstockSnapshotProof | undefined;

  try {
    if (req.snapshotSelector) {
      const schema = await client.query(
        snapshotSchemaValidationSql(),
        [req.snapshotSelector.table],
      );
      assertSnapshotSchemaColumns(schema.rows as Array<{ column_name: string }>);

      await client.query(
        `CREATE TEMP TABLE b75_snapshot_export_population ON COMMIT DROP AS
         ${snapshotPopulationSql(req.snapshotSelector)}`,
        snapshotPopulationParams(req.snapshotSelector),
      );
      await client.query(
        'CREATE UNIQUE INDEX ON b75_snapshot_export_population (symbol, bucket_ts)',
      );

      sourceRowCount = Number((await client.query(
        'SELECT count(*)::bigint AS source_count FROM b75_snapshot_export_population',
      )).rows[0]?.source_count ?? 0);

      const out = fs.createWriteStream(localPath);
      const gzip = zlib.createGzip({ level: compressionLevel });
      gzip.pipe(out);
      const keyHash = crypto.createHash('sha256');
      const rowHash = crypto.createHash('sha256');
      const BATCH = 1000;
      let lastSymbol: string | null = null;
      let lastBucketTs: string | null = null;

      while (true) {
        const page: pg.QueryResult<any> = lastSymbol === null
          ? await client.query(
            `SELECT symbol, bucket_ts::text AS bucket_ts_cursor, bucket_ts_text, canonical_json
               FROM b75_snapshot_export_population
              ORDER BY symbol ASC, bucket_ts ASC
              LIMIT ${BATCH}`,
          )
          : await client.query(
            `SELECT symbol, bucket_ts::text AS bucket_ts_cursor, bucket_ts_text, canonical_json
               FROM b75_snapshot_export_population
              WHERE (symbol, bucket_ts) > ($1, $2::timestamptz)
              ORDER BY symbol ASC, bucket_ts ASC
              LIMIT ${BATCH}`,
            [lastSymbol, lastBucketTs],
          );
        if (page.rows.length === 0) break;

        for (const row of page.rows) {
          const symbol = String(row.symbol);
          const bucketTsText = String(row.bucket_ts_text);
          const line = `${String(row.canonical_json)}\n`;
          appendSnapshotKey(keyHash, symbol, bucketTsText);
          rowHash.update(Buffer.from(line, 'utf8'));
          if (!gzip.write(line)) await new Promise<void>((resolve) => gzip.once('drain', resolve));
          bytesUncompressed += Buffer.byteLength(line, 'utf8');
          rowCount++;
          const tsDate = new Date(String(row.bucket_ts_cursor));
          if (minTs === null || tsDate < minTs) minTs = tsDate;
          if (maxTs === null || tsDate > maxTs) maxTs = tsDate;
        }

        const last: any = page.rows[page.rows.length - 1];
        lastSymbol = String(last.symbol);
        lastBucketTs = String(last.bucket_ts_cursor);
        if (page.rows.length < BATCH) break;
      }

      gzip.end();
      await new Promise<void>((resolve, reject) => {
        out.on('close', resolve);
        out.on('error', reject);
      });
      snapshotProof = {
        sourceRowCount,
        orderedKeySha256: keyHash.digest('hex'),
        fullRowSha256: rowHash.digest('hex'),
      };
    } else {
    // KEYSET pagination via timestamp cursor — uses the existing timestamp
    // index directly without a composite (ts, id) index. The earlier
    // (ts, id) tuple form created an OR-condition the planner couldn't
    // optimize, leading to sequential scans and 2min statement_timeout
    // hits on Supabase Pro.
    //
    // Legacy mode retains the timestamp-only cursor, but since #1195 it reads
    // each boundary tie group whole and is held to a same-snapshot source
    // count. Exact mode below uses (timestamp, immutable tie-breaker).
    //
    // BATCH=1000 (down from 5000) caps single-query payload size given
    // wide JSONB rows that TOAST to 20+ KB raw.
    const BATCH = 1000;
    // Static fragment from the allow-listed spec (see ExportRequest.extraPredicate).
    const extraAnd = req.extraPredicate ? ` AND (${req.extraPredicate})` : '';

    const out = fs.createWriteStream(localPath);
    const gzip = zlib.createGzip({ level: compressionLevel });
    gzip.pipe(out);

    // B-B75-COUNT-GATE hotfix (#1195): count the source in BOTH modes, inside
    // the same REPEATABLE READ snapshot as the pages, so an incomplete export
    // is refused before any caller can verify and drop/delete the source.
    sourceRowCount = Number((await client.query(
      `SELECT count(*)::bigint AS source_count FROM ${quoteIdent(target)}
        WHERE ${quoteIdent(tsCol)} >= $1 AND ${quoteIdent(tsCol)} < $2${extraAnd}`,
      [req.rangeStart, req.rangeEnd],
    )).rows[0]?.source_count ?? 0);

    let lastTs: Date | string | null = null;
    let lastTie: string | null = null;
    let firstBatch = true;

    while (true) {
      let r;
      if (exactTieCol && firstBatch) {
        r = await client.query(
          `SELECT ${quoteIdent(tsCol)}::text AS __cursor_ts,
                  ${quoteIdent(exactTieCol)}::text AS __cursor_tie,
                  to_jsonb(src)::text AS __json
             FROM ${quoteIdent(target)} AS src
            WHERE ${quoteIdent(tsCol)} >= $1 AND ${quoteIdent(tsCol)} < $2${extraAnd}
            ORDER BY ${quoteIdent(tsCol)} ASC, ${quoteIdent(exactTieCol)} ASC
            LIMIT ${BATCH}`,
          [req.rangeStart, req.rangeEnd],
        );
        firstBatch = false;
      } else if (exactTieCol) {
        r = await client.query(
          `SELECT ${quoteIdent(tsCol)}::text AS __cursor_ts,
                  ${quoteIdent(exactTieCol)}::text AS __cursor_tie,
                  to_jsonb(src)::text AS __json
             FROM ${quoteIdent(target)} AS src
            WHERE (${quoteIdent(tsCol)}, ${quoteIdent(exactTieCol)})
                    > ($1::timestamptz, $2::${exactTieCast})
              AND ${quoteIdent(tsCol)} < $3${extraAnd}
            ORDER BY ${quoteIdent(tsCol)} ASC, ${quoteIdent(exactTieCol)} ASC
            LIMIT ${BATCH}`,
          [lastTs, lastTie, req.rangeEnd],
        );
      } else if (firstBatch) {
        r = await client.query(
          `SELECT *, ${quoteIdent(tsCol)}::text AS ${LEGACY_CURSOR_COL} FROM ${quoteIdent(target)}
           WHERE ${quoteIdent(tsCol)} >= $1 AND ${quoteIdent(tsCol)} < $2${extraAnd}
           ORDER BY ${quoteIdent(tsCol)} ASC
           LIMIT ${BATCH}`,
          [req.rangeStart, req.rangeEnd],
        );
        firstBatch = false;
      } else {
        r = await client.query(
          `SELECT *, ${quoteIdent(tsCol)}::text AS ${LEGACY_CURSOR_COL} FROM ${quoteIdent(target)}
           WHERE ${quoteIdent(tsCol)} > $1 AND ${quoteIdent(tsCol)} < $2${extraAnd}
           ORDER BY ${quoteIdent(tsCol)} ASC
           LIMIT ${BATCH}`,
          [lastTs, req.rangeEnd],
        );
      }
      if (r.rows.length === 0) break;
      const fullPage = r.rows.length === BATCH;

      let pageRows: any[] = r.rows;
      let legacyCursor: string | null = null;
      if (!exactTieCol) {
        // Exact database text for the cursor (no millisecond Date floor), so a
        // page can never re-export a row and mask a skipped one in the count.
        legacyCursor = String(r.rows[r.rows.length - 1][LEGACY_CURSOR_COL]);
        if (fullPage) {
          // B-B75-COUNT-GATE (#1195): a full page can end PART-WAY through a
          // group of rows sharing the last timestamp, and the next page asks
          // for `> lastTs`, so the rest of that group would never be read.
          // Hold back this page's share of the group and read the WHOLE group
          // by equality (the timestamp index serves it) before moving on.
          pageRows = r.rows.filter((row: any) => String(row[LEGACY_CURSOR_COL]) !== legacyCursor);
          const tie = await client.query(
            `SELECT *, ${quoteIdent(tsCol)}::text AS ${LEGACY_CURSOR_COL} FROM ${quoteIdent(target)}
             WHERE ${quoteIdent(tsCol)} = $1 AND ${quoteIdent(tsCol)} < $2${extraAnd}`,
            [legacyCursor, req.rangeEnd],
          );
          pageRows = pageRows.concat(tie.rows);
        }
      }

      for (const row of pageRows) {
        if (!exactTieCol) {
          // The cursor column is removed so the archived row shape is unchanged.
          delete row[LEGACY_CURSOR_COL];
        }
        const ts = exactTieCol ? row.__cursor_ts : row[tsCol];
        if (ts) {
          const tsDate = ts instanceof Date ? ts : new Date(ts);
          if (minTs === null || tsDate < minTs) minTs = tsDate;
          if (maxTs === null || tsDate > maxTs) maxTs = tsDate;
        }
        const line = (exactTieCol ? String(row.__json) : JSON.stringify(row)) + '\n';
        if (!gzip.write(line)) {
          // Respect backpressure — wait for drain before continuing.
          await new Promise<void>((resolve) => gzip.once('drain', () => resolve()));
        }
        bytesUncompressed += Buffer.byteLength(line, 'utf-8');
        rowCount++;
      }

      // Advance the keyset cursor from the last row of this batch
      const lastRow: any = r.rows[r.rows.length - 1];
      // Keep the cursor as database text in both modes. A node-postgres Date
      // round-trip truncates microseconds and corrupts page boundaries.
      lastTs = exactTieCol ? String(lastRow.__cursor_ts) : legacyCursor;
      if (exactTieCol) lastTie = String(lastRow.__cursor_tie);

      if (!fullPage) break;
    }

    gzip.end();
    await new Promise<void>((resolve, reject) => {
      out.on('close', () => resolve());
      out.on('error', reject);
    });
    }

    if (rowCount !== sourceRowCount) {
      const exportMode = req.snapshotSelector ? 'snapshot' : exactTieCol ? 'exact' : 'legacy';
      throw new ExportRowCountMismatchError(
        `[B75 partition-exporter] ${exportMode} source/export row-count mismatch `
        + `${req.sourceTable}/${req.partitionLabel}: source=${sourceRowCount} exported=${rowCount}`,
      );
    }

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
    sourceRowCount,
    snapshotProof,
  };
}

/** Count newline-delimited rows after inflating a downloaded JSONL.gz object. */
export async function countGzipJsonlLines(filePath: string): Promise<number> {
  const input = fs.createReadStream(filePath);
  const gunzip = zlib.createGunzip();
  input.pipe(gunzip);
  let lines = 0;
  let sawByte = false;
  let lastByte = 0;
  for await (const chunk of gunzip) {
    const bytes = chunk as Buffer;
    if (bytes.length === 0) continue;
    sawByte = true;
    lastByte = bytes[bytes.length - 1];
    for (const byte of bytes) if (byte === 0x0a) lines++;
  }
  if (sawByte && lastByte !== 0x0a) {
    // B-B75-EXPORT-COMPLETENESS (Langston gate B BLOCKER-1): corruption, never a retry.
    throw new ArchiveReadbackMismatchError(`[B75 partition-exporter] JSONL object has an unterminated final row: ${filePath}`);
  }
  return lines;
}

/**
 * Validate and fingerprint the bytes downloaded from storage.  Digests cover
 * the raw canonical line bytes, not a JSON parse/stringify round-trip.
 */
export async function inspectGzipSnapshotJsonl(
  filePath: string,
  onRow?: (row: XstockSnapshotCanonicalRow) => void | Promise<void>,
): Promise<XstockSnapshotProof> {
  const input = fs.createReadStream(filePath);
  const gunzip = zlib.createGunzip();
  input.pipe(gunzip);
  const keyHash = crypto.createHash('sha256');
  const rowHash = crypto.createHash('sha256');
  let pending = Buffer.alloc(0);
  let rowCount = 0;
  let previous: [string, string] | null = null;

  for await (const chunk of gunzip) {
    pending = Buffer.concat([pending, chunk as Buffer]);
    while (true) {
      const newline = pending.indexOf(0x0a);
      if (newline < 0) break;
      const raw = pending.subarray(0, newline);
      pending = pending.subarray(newline + 1);
      if (raw.length === 0) throw new ArchiveReadbackMismatchError('snapshot JSONL contains an empty row');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString('utf8'));
      } catch (err) {
        throw new ArchiveReadbackMismatchError(
          `snapshot JSONL row is malformed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      assertCanonicalSnapshotObject(parsed);
      const row = parsed as XstockSnapshotCanonicalRow;
      if (previous && (row.symbol < previous[0]
          || (row.symbol === previous[0] && row.bucket_ts <= previous[1]))) {
        throw new ArchiveReadbackMismatchError('snapshot JSONL keys are duplicate or out of order');
      }
      previous = [row.symbol, row.bucket_ts];
      appendSnapshotKey(keyHash, row.symbol, row.bucket_ts);
      rowHash.update(raw);
      rowHash.update(Buffer.from('\n'));
      if (onRow) await onRow(row);
      rowCount++;
    }
  }
  if (pending.length > 0) {
    throw new ArchiveReadbackMismatchError(`snapshot JSONL object has an unterminated final row: ${filePath}`);
  }
  return {
    sourceRowCount: rowCount,
    orderedKeySha256: keyHash.digest('hex'),
    fullRowSha256: rowHash.digest('hex'),
  };
}

/**
 * Parse the downloaded object before any source lock and load only its proven
 * primary keys into a typed session temp table.  The final delete joins this
 * table; it never re-evaluates a rolling predicate as its delete target.
 */
export async function loadSnapshotProvenKeys(
  client: Pick<pg.Client, 'query'>,
  filePath: string,
): Promise<XstockSnapshotProof> {
  await client.query(
    `CREATE TEMP TABLE IF NOT EXISTS b75_snapshot_proven_keys (
       symbol text NOT NULL,
       bucket_ts timestamptz NOT NULL,
       PRIMARY KEY (symbol, bucket_ts)
     ) ON COMMIT PRESERVE ROWS`,
  );
  await client.query('TRUNCATE b75_snapshot_proven_keys');

  const symbols: string[] = [];
  const bucketTimestamps: string[] = [];
  const flush = async (): Promise<void> => {
    if (symbols.length === 0) return;
    await client.query(
      `INSERT INTO b75_snapshot_proven_keys (symbol, bucket_ts)
       SELECT * FROM unnest($1::text[], $2::timestamptz[])`,
      [symbols.splice(0), bucketTimestamps.splice(0)],
    );
  };

  const proof = await inspectGzipSnapshotJsonl(filePath, async (row) => {
    symbols.push(row.symbol);
    bucketTimestamps.push(row.bucket_ts);
    if (symbols.length >= 1000) await flush();
  });
  await flush();

  const loaded = Number((await client.query(
    'SELECT count(*)::bigint AS row_count FROM b75_snapshot_proven_keys',
  )).rows[0]?.row_count ?? 0);
  if (loaded !== proof.sourceRowCount) {
    throw new ArchiveReadbackMismatchError(
      `snapshot proven-key load count mismatch: object=${proof.sourceRowCount} temp=${loaded}`,
    );
  }
  return proof;
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
