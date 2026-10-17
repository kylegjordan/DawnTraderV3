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
 *     --table xstock_spot_ohlc_1m \
 *     --from 2025-12-01 \
 *     --to   2026-02-28 \
 *     --out  /tmp/rehydrated/ \
 *     [--restore-cold]
 *
 * The `--restore-cold` flag attempts to download cold-tier objects directly
 * (only works if B2 credentials are configured — see storage-client.ts).
 * Without the flag, cold-only entries are warned about and skipped.
 *
 * B-NEW-47: warm downloads STREAM to file (`downloadWarmFile`) — the old
 * buffered `downloadWarm` + `writeFileSync` OOM'd on multi-GB objects. Also,
 * a single month may now be N per-day slices (`<table>_YYYY-MM-DD.jsonl.gz`)
 * instead of one `<table>_YYYY-MM.jsonl.gz` — the manifest tstzrange query
 * returns every in-window slice, so reassembly is automatic (one output file
 * per slice). Any consumer that globbed the single monthly filename must glob
 * `<table>_*.jsonl.gz` instead.
 *
 * B-B75-EXPORT-COMPLETENESS (#1195): every object is printed with its
 * `completeness_basis`, and only `source-count-matched` is proven. Copies made
 * 2026-05-06 → 2026-10-16 may be missing rows inside each day (Kyle 2026-10-17:
 * no recovery), so an unproven object's row count prints as `rows(unproven)=`,
 * the total splits proven from unproven, a warning names each unproven object's
 * range, and `<file>.completeness.json` is written beside every downloaded file.
 * A warm row the rotator has `migrated` (or is `migrating`) is never a download
 * candidate — its object is gone by design and fetching it crashed this CLI (A13);
 * such a label falls to its cold row. When a label has objects in more than one
 * tier, all of them are listed with their basis (never silently one).
 *
 * Reference: BATCH_75_SCOPE.md §C.9 + B_NEW_47_SCOPE.md §8
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { getStorageClient, sha256Hex } from '../services/data-archive/storage-client.js';
import { chooseObjectsByLabel, isProvenBasis } from '../services/data-archive/archive-completeness.js';

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
    completeness_basis: string | null;
  }>
> {
  const r = await client.query(
    `SELECT id, partition_label, tier, state, storage_uri, row_count, bytes_compressed,
            min_ts, max_ts, checksum, completeness_basis
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

  // A13 + A10: choose per label among DOWNLOADABLE rows (warm preferred), and list
  // every tier's row so a mixed label is visible, never silently one copy.
  const choices = chooseObjectsByLabel(rows);
  const storage = getStorageClient();
  let downloaded = 0;
  let skippedCold = 0;
  let provenRows = 0;
  let unprovenRows = 0;
  let mismatchRows = 0;
  let totalBytes = 0;
  const unproven: string[] = [];
  const mismatched: string[] = [];

  console.log(
    `[B75 rehydrate] table=${args.table} window=${args.from.toISOString().slice(0, 10)}..${args.to.toISOString().slice(0, 10)} → ${args.out}`,
  );
  console.log(
    `[B75 rehydrate] manifest matches: warm=${rows.filter((r) => r.tier === 'warm').length} ` +
      `cold=${rows.filter((r) => r.tier === 'cold').length} labels=${choices.length}`,
  );

  for (const { label, download, all } of choices) {
    if (all.length > 1) {
      const listed = all.map((r) => `${r.tier}/${r.state}/${r.completeness_basis ?? 'null'}`).join(', ');
      console.warn(
        `[B75 rehydrate] ${label}: ${all.length} objects (${listed}); ` +
          `downloading ${download ? `${download.tier}` : 'none'} — the other copy exists and is listed here`,
      );
    }
    if (!download) {
      console.warn(`[B75 rehydrate] ${label}: no downloadable object (every row is a rotated-away warm copy)`);
      continue;
    }
    if (download.tier === 'cold' && !args.restoreCold) {
      console.warn(`[B75 rehydrate] ${label} (cold): use --restore-cold to attempt cold-tier download`);
      skippedCold++;
      continue;
    }
    const proven = isProvenBasis(download.completeness_basis);
    const basis = download.completeness_basis ?? 'unrecorded';
    const rowsLabel = proven ? 'rows' : 'rows(unproven)';
    const localPath = path.join(args.out, `${args.table}_${label}.jsonl.gz`);
    let bytes = 0;
    let checksumOk = false;

    if (download.tier === 'warm') {
      const { bucket, path: objPath } = parseSupabaseUri(download.storage_uri);
      // B-NEW-47: stream to file (no whole-object Buffer); checksum computed
      // from the on-disk bytes (second read-pass inside downloadWarmFile).
      const dl = await storage.downloadWarmFile(bucket, objPath, localPath);
      bytes = dl.bytes;
      checksumOk = dl.checksum === download.checksum;
    } else {
      if (!storage.isColdConfigured()) {
        console.warn(`[B75 rehydrate] ${label} (cold): cold storage not configured; skipping`);
        skippedCold++;
        continue;
      }
      // Cold URI format: 'b2://<bucket>/<path>'
      const m = /^b2:\/\/([^/]+)\/(.+)$/.exec(download.storage_uri);
      if (!m) {
        console.warn(`[B75 rehydrate] ${label} (cold): cannot parse cold URI: ${download.storage_uri}`);
        skippedCold++;
        continue;
      }
      const data = await storage.downloadCold(m[1], m[2]);
      fs.writeFileSync(localPath, data.data);
      bytes = data.bytes;
      checksumOk = sha256Hex(data.data) === download.checksum;
    }

    console.log(
      `[B75 rehydrate] ${label} (${download.tier}): ${rowsLabel}=${download.row_count} completeness=${basis} ` +
        `bytes=${bytes} checksum=${checksumOk ? 'OK' : 'MISMATCH'} → ${localPath}`,
    );
    fs.writeFileSync(
      `${localPath}.completeness.json`,
      JSON.stringify({
        table: args.table,
        partition_label: label,
        tier: download.tier,
        completeness_basis: basis,
        // The basis proves the EXPORT; checksum_ok is whether the file now on disk is that
        // object. A sidecar with proven=true and checksum_ok=false is NOT a usable copy.
        proven,
        checksum_ok: checksumOk,
        row_count: download.row_count,
        row_count_meaning: proven
          ? 'source = exported = downloaded, stored as evidence (data_archive_exact_evidence)'
          : 'the exported count only; rows may be missing inside the day (#1195)',
        min_ts: download.min_ts,
        max_ts: download.max_ts,
        other_objects: all.filter((r) => r !== download).map((r) => ({
          tier: r.tier, state: r.state, completeness_basis: r.completeness_basis,
        })),
      }, null, 1),
    );
    // Langston Step-4 gate C (C-1): the deciding predicate rides every aggregate that uses
    // it. A checksum mismatch counts in neither proven nor unproven — it has its own bucket.
    if (!checksumOk) {
      mismatchRows += download.row_count;
      mismatched.push(`${label} (${download.tier}, ${basis})`);
    } else if (proven) {
      provenRows += download.row_count;
    } else {
      unprovenRows += download.row_count;
      unproven.push(`${label} (${new Date(download.min_ts).toISOString()} → ${new Date(download.max_ts).toISOString()}, ${basis})`);
    }
    downloaded++;
    totalBytes += bytes;
  }

  for (const u of unproven) {
    console.warn(`[B75 rehydrate] WARNING: ${u} is NOT proven complete — rows may be missing inside it (#1195)`);
  }
  for (const m of mismatched) {
    console.error(`[B75 rehydrate] CHECKSUM MISMATCH: ${m} — the file on disk is NOT the archived object; do not use it`);
  }
  console.log(
    `[B75 rehydrate] DONE downloaded=${downloaded} skipped_cold=${skippedCold} ` +
      `rows_proven=${provenRows} rows_unproven=${unprovenRows} rows_checksum_mismatch=${mismatchRows} ` +
      `unproven_objects=${unproven.length} mismatched_objects=${mismatched.length} total_bytes=${totalBytes}`,
  );
  // A mismatched download is a failed rehydrate: exit non-zero so a wrapping scheduler
  // cannot read the run as clean.
  if (mismatched.length > 0) process.exit(2);
}

main().catch((err) => {
  console.error('[B75 rehydrate] fatal:', err);
  process.exit(1);
});
