/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B75 — Rehydrate CLI
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * One-shot tool for pulling archived JSONL.gz back from warm/cold tier into
 * a local directory for analytics. Future ML/analytics schedulers will wrap
 * this script.
 *
 * Usage:
 *   npx tsx server/scripts/b75-rehydrate.ts \
 *     --table equity_spot_ohlc_1m \
 *     --from 2025-12-01 \
 *     --to   2026-02-28 \
 *     --out  /tmp/rehydrated/ \
 *     [--restore-cold]
 *
 * The `--restore-cold` flag attempts to download cold-tier objects directly
 * (only works if B2 credentials are configured — see storage-client.ts).
 * Without the flag, cold-only entries are warned about and skipped.
 *
 * Reference: BATCH_75_SCOPE.md §C.9
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { getStorageClient, sha256Hex } from '../services/data-archive/storage-client.js';

const { Client } = pg;

interface Args {
  table: string;
  from: Date;
  to: Date;
  out: string;
  restoreCold: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { restoreCold: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--table') args.table = argv[++i];
    else if (flag === '--from') args.from = new Date(argv[++i] + 'T00:00:00Z');
    else if (flag === '--to') args.to = new Date(argv[++i] + 'T23:59:59.999Z');
    else if (flag === '--out') args.out = argv[++i];
    else if (flag === '--restore-cold') args.restoreCold = true;
    else if (flag === '--help' || flag === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  if (!args.table || !args.from || !args.to || !args.out) {
    printUsage();
    process.exit(1);
  }
  if (Number.isNaN(args.from.getTime()) || Number.isNaN(args.to.getTime())) {
    console.error('[B75 rehydrate] invalid --from/--to date (use YYYY-MM-DD)');
    process.exit(1);
  }
  return args as Args;
}

function printUsage(): void {
  console.error(
    'Usage: b75-rehydrate.ts --table <name> --from <YYYY-MM-DD> --to <YYYY-MM-DD> --out <dir> [--restore-cold]',
  );
}

async function queryManifest(
  client: pg.Client,
  args: Args,
): Promise<
  Array<{
    id: string;
    partition_label: string;
    tier: string;
    state: string;
    storage_uri: string;
    row_count: number;
    bytes_compressed: number;
    min_ts: Date;
    max_ts: Date;
    checksum: string;
  }>
> {
  const r = await client.query(
    `SELECT id, partition_label, tier, state, storage_uri, row_count, bytes_compressed,
            min_ts, max_ts, checksum
       FROM data_archive_manifest
      WHERE source_table = $1
        AND state IN ('verified', 'active', 'migrating', 'migrated')
        AND tstzrange(min_ts, max_ts, '[]') && tstzrange($2::timestamptz, $3::timestamptz, '[]')
      ORDER BY min_ts ASC, tier ASC`,
    [args.table, args.from, args.to],
  );
  return r.rows;
}

function parseSupabaseUri(uri: string): { bucket: string; path: string } {
  // 'supabase://<bucket>/<path>'
  const m = /^supabase:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) throw new Error(`[B75 rehydrate] cannot parse supabase URI: ${uri}`);
  return { bucket: m[1], path: m[2] };
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('[B75 rehydrate] DATABASE_URL not set');
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[B75 rehydrate] SUPABASE_SERVICE_ROLE_KEY not set');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.out)) fs.mkdirSync(args.out, { recursive: true });

  const ctl = new Client({ connectionString: process.env.DATABASE_URL });
  await ctl.connect();
  let rows;
  try {
    rows = await queryManifest(ctl, args);
  } finally {
    await ctl.end();
  }

  if (rows.length === 0) {
    console.log(
      `[B75 rehydrate] no manifest rows for table=${args.table} between ${args.from.toISOString()} and ${args.to.toISOString()}`,
    );
    return;
  }

  // Prefer warm-tier rows; only fall back to cold if no warm equivalent
  const warmByLabel = new Map<string, (typeof rows)[0]>();
  const coldByLabel = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    if (r.tier === 'warm') warmByLabel.set(r.partition_label, r);
    else coldByLabel.set(r.partition_label, r);
  }

  const storage = getStorageClient();
  const labels = new Set([...warmByLabel.keys(), ...coldByLabel.keys()]);
  let downloaded = 0;
  let skippedCold = 0;
  let totalRows = 0;
  let totalBytes = 0;

  console.log(
    `[B75 rehydrate] table=${args.table} window=${args.from.toISOString().slice(0, 10)}..${args.to.toISOString().slice(0, 10)} → ${args.out}`,
  );
  console.log(`[B75 rehydrate] manifest matches: warm=${warmByLabel.size} cold=${coldByLabel.size}`);

  for (const label of [...labels].sort()) {
    const warm = warmByLabel.get(label);
    if (warm) {
      const { bucket, path: objPath } = parseSupabaseUri(warm.storage_uri);
      const data = await storage.downloadWarm(bucket, objPath);
      const localPath = path.join(args.out, `${args.table}_${label}.jsonl.gz`);
      fs.writeFileSync(localPath, data.data);
      const localChecksum = sha256Hex(data.data);
      const checksumOk = localChecksum === warm.checksum;
      console.log(
        `[B75 rehydrate] ${label} (warm): rows=${warm.row_count} bytes=${data.bytes} checksum=${checksumOk ? 'OK' : 'MISMATCH'} → ${localPath}`,
      );
      downloaded++;
      totalRows += warm.row_count;
      totalBytes += data.bytes;
      continue;
    }
    const cold = coldByLabel.get(label)!;
    if (args.restoreCold) {
      if (!storage.isColdConfigured()) {
        console.warn(`[B75 rehydrate] ${label} (cold): cold storage not configured; skipping`);
        skippedCold++;
        continue;
      }
      // Cold URI format: 'b2://<bucket>/<path>'
      const m = /^b2:\/\/([^/]+)\/(.+)$/.exec(cold.storage_uri);
      if (!m) {
        console.warn(`[B75 rehydrate] ${label} (cold): cannot parse cold URI: ${cold.storage_uri}`);
        skippedCold++;
        continue;
      }
      const data = await storage.downloadCold(m[1], m[2]);
      const localPath = path.join(args.out, `${args.table}_${label}.jsonl.gz`);
      fs.writeFileSync(localPath, data.data);
      const localChecksum = sha256Hex(data.data);
      const checksumOk = localChecksum === cold.checksum;
      console.log(
        `[B75 rehydrate] ${label} (cold): rows=${cold.row_count} bytes=${data.bytes} checksum=${checksumOk ? 'OK' : 'MISMATCH'} → ${localPath}`,
      );
      downloaded++;
      totalRows += cold.row_count;
      totalBytes += data.bytes;
    } else {
      console.warn(
        `[B75 rehydrate] ${label} (cold): use --restore-cold to attempt cold-tier download`,
      );
      skippedCold++;
    }
  }

  console.log(
    `[B75 rehydrate] DONE downloaded=${downloaded} skipped_cold=${skippedCold} ` +
      `total_rows=${totalRows} total_bytes=${totalBytes}`,
  );
}

main().catch((err) => {
  console.error('[B75 rehydrate] fatal:', err);
  process.exit(1);
});
