/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B70.1 — Tabular Daily Exporter (JSONL format)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Exports prior day's rows from each B70 archive table to JSONL files at
 *   /var/lib/dawntrader/exports/<table>/<YYYY-MM-DD>.jsonl.gz
 *
 * JSONL chosen over Parquet for v1 simplicity: zero new npm deps (vs.
 * `parquetjs-lite` which is unmaintained and would require a GDrive npm install
 * that's been failing with EBADF). JSONL is universally readable by:
 *   - pandas:    pd.read_json(path, lines=True)
 *   - DuckDB:    SELECT * FROM read_json_auto('path')
 *   - tsfresh:   pd.read_json + extract_features()
 *   - mlfinlab:  same pandas pathway
 *   - Qlib:      data/handler.py custom loader is straightforward
 *
 * If Parquet is later required (large rows, columnar query speedup), a Python
 * sidecar can convert JSONL → Parquet via pyarrow.parquet.write_table on the
 * same files, no upstream change needed.
 *
 * Toggle: `b70_parquet_export_enabled` module_constant (kept the original name
 * even though the on-disk format is JSONL — the toggle's semantic is "off-host
 * archival exports enabled").
 *
 * Cron line (operator step — add to root crontab on staging server):
 *   0 3 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b70-table-export.ts" >> /var/log/dawntrader/b70-export.log 2>&1
 *
 * Reference: BATCH_70_SCOPE.md §A.11 + RUNNING_ISSUES #58
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import pg from 'pg';
const { Client } = pg;

const EXPORT_BASE = process.env.B70_EXPORT_DIR ?? '/var/lib/dawntrader/exports';

const TABLES = [
  'pair_scan_archive',
  'signal_eval_archive',
  'exit_decision_archive',
  'macro_feed_archive',
  'signal_eval_provenance', // B-NEW-53 (cold-tier offload target for Phase-25 study)
] as const;

async function isExportEnabled(client: pg.Client): Promise<boolean> {
  try {
    const r = await client.query(
      `SELECT value FROM module_constants
       WHERE module_name = 'data_archive'
         AND constant_name = 'b70_parquet_export_enabled'
       LIMIT 1`,
    );
    if (r.rows.length === 0) return false;
    const v = r.rows[0].value;
    return v === true || v === 'true';
  } catch {
    return false;
  }
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function exportTableForDate(
  client: pg.Client,
  table: string,
  yyyymmdd: string,
): Promise<{ rows: number; bytes: number }> {
  const start = `${yyyymmdd} 00:00:00+00`;
  const end = `${yyyymmdd} 24:00:00+00`;
  const dir = path.join(EXPORT_BASE, table);
  ensureDir(dir);
  const outPath = path.join(dir, `${yyyymmdd}.jsonl.gz`);

  // Stream rows in batches to keep memory bounded.
  const BATCH = 5000;
  let offset = 0;
  let totalRows = 0;
  let totalBytes = 0;

  // Use a write-stream piped through gzip
  const outStream = fs.createWriteStream(outPath);
  const gzip = zlib.createGzip();
  const sink = new Promise<void>((resolve, reject) => {
    gzip.pipe(outStream).on('close', () => resolve()).on('error', reject);
  });

  while (true) {
    const r = await client.query(
      `SELECT * FROM ${table}
       WHERE captured_at >= $1 AND captured_at < $2
       ORDER BY captured_at ASC, id ASC
       LIMIT ${BATCH} OFFSET ${offset}`,
      [start, end],
    );
    if (r.rows.length === 0) break;
    for (const row of r.rows) {
      const line = JSON.stringify(row) + '\n';
      gzip.write(line);
      totalRows++;
      totalBytes += Buffer.byteLength(line, 'utf-8');
    }
    if (r.rows.length < BATCH) break;
    offset += BATCH;
  }
  gzip.end();
  await sink;

  if (totalRows === 0) {
    // Remove empty file to avoid clutter
    try {
      fs.unlinkSync(outPath);
    } catch {
      // ignore
    }
  }
  return { rows: totalRows, bytes: totalBytes };
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[B70.1][export] DATABASE_URL not set');
    process.exit(1);
  }
  const targetDate = process.argv[2] ?? yesterdayUtc();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    console.error(`[B70.1][export] invalid date '${targetDate}', expected YYYY-MM-DD`);
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const enabled = await isExportEnabled(client);
    if (!enabled) {
      console.log(
        `[B70.1][export] b70_parquet_export_enabled=false; export skipped for ${targetDate}`,
      );
      return;
    }
    console.log(`[B70.1][export] exporting date=${targetDate} → ${EXPORT_BASE}/`);
    let totalAcrossTables = 0;
    for (const t of TABLES) {
      const { rows, bytes } = await exportTableForDate(client, t, targetDate);
      console.log(
        `[B70.1][export] ${t}: ${rows.toLocaleString()} rows, ${(bytes / 1024).toFixed(1)} KB raw`,
      );
      totalAcrossTables += rows;
    }
    console.log(
      `[B70.1][export] DONE — ${totalAcrossTables.toLocaleString()} total rows for ${targetDate}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[B70.1][export] failed:', err);
  process.exit(1);
});
