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
 *     --out  ~/rehydrated/ \   (a private folder in your home — never a shared /tmp path)
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
import { getStorageClient, sha256Hex, type StorageClient } from '../services/data-archive/storage-client.js';
import {
  chooseObjectsByLabel,
  isProvenBasis,
  type LabelChoice,
} from '../services/data-archive/archive-completeness.js';
import { DISK_FILE_FORMAT, DISK_FILE_SOURCE_PREFIX, digestFile } from '../services/data-archive/disk-file-tiering.js';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { isDirectEntry } from './direct-entry.js';

const { Client } = pg;

export interface RehydrateArgs {
  table: string;
  from: Date;
  to: Date;
  out: string;
  restoreCold: boolean;
  /** B-DISK-FILE-TIERING (#1233, pre-audit P8): restore moved disk files under their ORIGINAL names. */
  diskFile: boolean;
}

function parseArgs(argv: string[]): RehydrateArgs {
  const args: Partial<RehydrateArgs> = { restoreCold: false, diskFile: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--table') args.table = argv[++i];
    else if (flag === '--from') args.from = new Date(argv[++i] + 'T00:00:00Z');
    else if (flag === '--to') args.to = new Date(argv[++i] + 'T23:59:59.999Z');
    else if (flag === '--out') args.out = argv[++i];
    else if (flag === '--restore-cold') args.restoreCold = true;
    else if (flag === '--disk-file') args.diskFile = true;
    else if (flag === '--help' || flag === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  if (!args.table || !args.from || !args.to || !args.out) {
    printUsage();
    process.exit(1);
  }
  if (args.diskFile !== args.table.startsWith(DISK_FILE_SOURCE_PREFIX)) {
    console.error(`[B75 rehydrate] --disk-file and a ${DISK_FILE_SOURCE_PREFIX}<folder> table go together (got table=${args.table}, --disk-file=${args.diskFile})`);
    process.exit(1);
  }
  if (Number.isNaN(args.from.getTime()) || Number.isNaN(args.to.getTime())) {
    console.error('[B75 rehydrate] invalid --from/--to date (use YYYY-MM-DD)');
    process.exit(1);
  }
  return args as RehydrateArgs;
}

function printUsage(): void {
  console.error(
    'Usage: b75-rehydrate.ts --table <name> --from <YYYY-MM-DD> --to <YYYY-MM-DD> --out <dir> [--restore-cold] [--disk-file]\n' +
      '  --disk-file: for a disk_file.<folder> table — restores each moved file under its original name (the\n' +
      '  manifest partition_label), inflated and checked byte-count and newline-count against the manifest.',
  );
}

export interface RehydrateManifestRow {
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
  format: string;
  original_partition_size_bytes: number | null;
}

async function queryManifest(
  client: pg.Client,
  args: RehydrateArgs,
): Promise<RehydrateManifestRow[]> {
  const r = await client.query(
    `SELECT id, partition_label, tier, state, storage_uri, row_count, bytes_compressed,
            min_ts, max_ts, checksum, completeness_basis, format, original_partition_size_bytes
       FROM data_archive_manifest
      WHERE source_table = $1
        AND state IN ('verified', 'active', 'migrating', 'migrated')
        AND tstzrange(min_ts, max_ts, '[]') && tstzrange($2::timestamptz, $3::timestamptz, '[]')
      ORDER BY min_ts ASC, tier ASC`,
    [args.table, args.from, args.to],
  );
  // row_count and bytes_compressed are BIGINT, which node-postgres returns as STRINGS, so
  // `total += row.row_count` concatenated ("0" + "29069" = "029069") — measured at Step 7 on
  // staging, and present in the pre-batch total_rows too. Convert at the read site, once.
  // Same class as #432, already fixed the same way in b75-cold-rotator.ts; this reader was
  // never swept (Langston, Step-7 mini-cycle).
  return r.rows.map((row) => ({
    ...row,
    row_count: Number(row.row_count),
    bytes_compressed: Number(row.bytes_compressed),
    original_partition_size_bytes: row.original_partition_size_bytes == null ? null : Number(row.original_partition_size_bytes),
  }));
}

function parseSupabaseUri(uri: string): { bucket: string; path: string } {
  // 'supabase://<bucket>/<path>'
  const m = /^supabase:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) throw new Error(`[B75 rehydrate] cannot parse supabase URI: ${uri}`);
  return { bucket: m[1], path: m[2] };
}

export type RehydrateObjectResult =
  | {
      kind: 'downloaded';
      bytes: number;
      rowCount: number;
      basisProven: boolean;
      description?: string;
    }
  | { kind: 'mismatch'; bytes: number; rowCount: number; description: string }
  | { kind: 'skipped-cold'; bytes: 0; rowCount: 0 }
  | { kind: 'skipped'; bytes: 0; rowCount: 0 };

export interface RehydrateOutputDependencies {
  lstat: typeof fs.lstatSync;
  mkdir: typeof fs.mkdirSync;
}

/** Enforce the existing private output-directory rule without exiting, so the
 * direct CLI remains the sole owner of the refusal exit code. */
export function ensurePrivateRehydrateOutput(
  out: string,
  deps: RehydrateOutputDependencies = { lstat: fs.lstatSync, mkdir: fs.mkdirSync },
): string | null {
  let outStat: fs.Stats | null = null;
  try {
    outStat = deps.lstat(out);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (outStat) {
    if (outStat.isSymbolicLink()) return 'is a symbolic link';
    if (!outStat.isDirectory()) return 'is not a directory';
    if ((outStat.mode & 0o077) !== 0) {
      return `is mode ${(outStat.mode & 0o777).toString(8)} (group or others can reach it): run chmod 0700 ${out} first`;
    }
  } else {
    deps.mkdir(out, { recursive: true, mode: 0o700 });
  }
  return null;
}

export interface RehydrateSummary {
  downloaded: number;
  skippedCold: number;
  provenRows: number;
  unprovenRows: number;
  mismatchRows: number;
  totalBytes: number;
  unproven: string[];
  mismatched: string[];
}

export function summarizeRehydrateResults(results: RehydrateObjectResult[]): RehydrateSummary {
  const summary: RehydrateSummary = {
    downloaded: 0,
    skippedCold: 0,
    provenRows: 0,
    unprovenRows: 0,
    mismatchRows: 0,
    totalBytes: 0,
    unproven: [],
    mismatched: [],
  };
  for (const result of results) {
    if (result.kind === 'skipped-cold') {
      summary.skippedCold++;
      continue;
    }
    if (result.kind === 'skipped') continue;
    summary.downloaded++;
    summary.totalBytes += result.bytes;
    if (result.kind === 'mismatch') {
      summary.mismatchRows += result.rowCount;
      summary.mismatched.push(result.description);
    } else if (result.basisProven) {
      summary.provenRows += result.rowCount;
    } else {
      summary.unprovenRows += result.rowCount;
      if (result.description) summary.unproven.push(result.description);
    }
  }
  return summary;
}

export interface RehydrateFinishDependencies {
  warn: (message: string) => void;
  error: (message: string) => void;
  log: (message: string) => void;
  exit: (code: number) => void;
}

export function finishRehydrateRun(
  summary: RehydrateSummary,
  deps: RehydrateFinishDependencies = {
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
    log: (message) => console.log(message),
    exit: (code) => process.exit(code),
  },
): void {
  for (const item of summary.unproven) {
    deps.warn(`[B75 rehydrate] WARNING: ${item} is NOT proven complete — rows may be missing inside it (#1195)`);
  }
  for (const item of summary.mismatched) {
    deps.error(`[B75 rehydrate] CHECKSUM MISMATCH: ${item} — the file on disk is NOT the archived object; do not use it`);
  }
  deps.log(
    `[B75 rehydrate] DONE downloaded=${summary.downloaded} skipped_cold=${summary.skippedCold} ` +
      `rows_proven=${summary.provenRows} rows_unproven=${summary.unprovenRows} ` +
      `rows_checksum_mismatch=${summary.mismatchRows} unproven_objects=${summary.unproven.length} ` +
      `mismatched_objects=${summary.mismatched.length} total_bytes=${summary.totalBytes}`,
  );
  if (summary.mismatched.length > 0) deps.exit(2);
}

/** Rehydrate one chosen label.  The return value, rather than process exit,
 * carries checksum and accounting state back to the thin CLI wrapper. */
export async function rehydrateChosenObject(
  args: RehydrateArgs,
  choice: LabelChoice<RehydrateManifestRow>,
  storage: Pick<StorageClient, 'downloadWarmFile' | 'isColdConfigured' | 'downloadCold'>,
): Promise<RehydrateObjectResult> {
  const { label, download, all } = choice;
  if (all.length > 1) {
    const listed = all.map((r) => `${r.tier}/${r.state}/${r.completeness_basis ?? 'null'}`).join(', ');
    console.warn(
      `[B75 rehydrate] ${label}: ${all.length} objects (${listed}); ` +
        `downloading ${download ? `${download.tier}` : 'none'} — the other copy exists and is listed here`,
    );
  }
  if (!download) {
    console.warn(`[B75 rehydrate] ${label}: no downloadable object (every row is a rotated-away warm copy)`);
    return { kind: 'skipped', bytes: 0, rowCount: 0 };
  }
  if (download.tier === 'cold' && !args.restoreCold) {
    console.warn(`[B75 rehydrate] ${label} (cold): use --restore-cold to attempt cold-tier download`);
    return { kind: 'skipped-cold', bytes: 0, rowCount: 0 };
  }

  const proven = isProvenBasis(download.completeness_basis);
  const basis = download.completeness_basis ?? 'unrecorded';
  const rowsLabel = proven ? 'rows' : 'rows(unproven)';
  const isDiskFile = download.format === DISK_FILE_FORMAT;
  if (isDiskFile !== args.diskFile) {
    console.warn(`[B75 rehydrate] ${label}: format ${download.format} needs ${isDiskFile ? '' : 'no '}--disk-file; skipping`);
    return { kind: 'skipped', bytes: 0, rowCount: 0 };
  }

  const localPath = isDiskFile
    ? path.join(args.out, `${label}.gz`)
    : path.join(args.out, `${args.table}_${label}.jsonl.gz`);
  let bytes = 0;
  let checksumOk = false;
  if (download.tier === 'warm') {
    const { bucket, path: objPath } = parseSupabaseUri(download.storage_uri);
    const dl = await storage.downloadWarmFile(bucket, objPath, localPath);
    bytes = dl.bytes;
    checksumOk = dl.checksum === download.checksum;
  } else {
    if (!storage.isColdConfigured()) {
      console.warn(`[B75 rehydrate] ${label} (cold): cold storage not configured; skipping`);
      return { kind: 'skipped-cold', bytes: 0, rowCount: 0 };
    }
    const m = /^b2:\/\/([^/]+)\/(.+)$/.exec(download.storage_uri);
    if (!m) {
      console.warn(`[B75 rehydrate] ${label} (cold): cannot parse cold URI: ${download.storage_uri}`);
      return { kind: 'skipped-cold', bytes: 0, rowCount: 0 };
    }
    const data = await storage.downloadCold(m[1], m[2]);
    fs.writeFileSync(localPath, data.data);
    bytes = data.bytes;
    checksumOk = sha256Hex(data.data) === download.checksum;
  }

  let outPath = localPath;
  const restored = path.join(args.out, label);
  const goodSidecar = `${isDiskFile ? restored : localPath}.completeness.json`;
  if (checksumOk && isDiskFile) {
    await pipeline(fs.createReadStream(localPath), zlib.createGunzip(), fs.createWriteStream(restored));
    const digest = await digestFile(restored);
    const sizeOk = download.original_partition_size_bytes == null
      || digest.bytes === download.original_partition_size_bytes;
    if (digest.newlines !== download.row_count || !sizeOk) {
      checksumOk = false;
      fs.renameSync(restored, `${restored}.CORRUPT`);
      console.error(
        `[B75 rehydrate] ${label}: restored file has ${digest.newlines} newlines / ${digest.bytes} bytes; ` +
          `manifest says ${download.row_count} / ${download.original_partition_size_bytes}`,
      );
    } else {
      fs.rmSync(localPath, { force: true });
      outPath = restored;
    }
  }
  if (!checksumOk) {
    outPath = `${localPath}.CORRUPT`;
    fs.renameSync(localPath, outPath);
    fs.rmSync(goodSidecar, { force: true });
  }

  console.log(
    `[B75 rehydrate] ${label} (${download.tier}): ${rowsLabel}=${download.row_count} completeness=${basis} ` +
      `bytes=${bytes} checksum=${checksumOk ? 'OK' : 'MISMATCH'} → ${outPath}`,
  );
  fs.writeFileSync(
    `${outPath}.completeness.json`,
    JSON.stringify({
      table: args.table,
      partition_label: label,
      tier: download.tier,
      completeness_basis: basis,
      proven,
      checksum_ok: checksumOk,
      row_count: download.row_count,
      row_count_meaning: proven
        ? 'source = exported = downloaded, stored as evidence (data_archive_exact_evidence)'
        : 'the exported count only; rows may be missing inside the day (#1195)',
      min_ts: download.min_ts,
      max_ts: download.max_ts,
      other_objects: all.filter((r) => r !== download).map((r) => ({
        tier: r.tier,
        state: r.state,
        completeness_basis: r.completeness_basis,
      })),
    }, null, 1),
  );

  const description = checksumOk
    ? (proven ? undefined : `${label} (${new Date(download.min_ts).toISOString()} → ${new Date(download.max_ts).toISOString()}, ${basis})`)
    : `${label} (${download.tier}, ${basis})`;
  if (!checksumOk) {
    return {
      kind: 'mismatch',
      bytes,
      rowCount: download.row_count,
      description: description!,
    };
  }
  return {
    kind: 'downloaded',
    bytes,
    rowCount: download.row_count,
    basisProven: proven,
    description,
  };
}

export interface RehydrateCliDependencies {
  env: NodeJS.ProcessEnv;
  exit: (code: number) => void;
  run: () => Promise<void>;
}

export async function runRehydrateCli(
  deps: RehydrateCliDependencies = {
    env: process.env,
    exit: (code) => process.exit(code),
    run: runRehydrateCliBody,
  },
): Promise<void> {
  if (!deps.env.DATABASE_URL) {
    console.error('[B75 rehydrate] DATABASE_URL not set');
    deps.exit(1);
    return;
  }
  if (!deps.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[B75 rehydrate] SUPABASE_SERVICE_ROLE_KEY not set');
    deps.exit(1);
    return;
  }
  await deps.run();
}

async function runRehydrateCliBody(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // B-DISK-FILE-TIERING (Langston Step 4 part 3, CHANGE 4 + its condition): the output folder must be private.
  // ONE lstat of --out ITSELF decides four cases: a symbolic link (dangling or not) is refused — a planted link
  // would send the restore wherever it points, e.g. into the live telemetry folder; anything
  // that is not a directory is refused; an existing directory with any group/other bits is refused (the
  // operator chmods it — this script never silently changes their folder); otherwise it is created 0700.
  // NOT checked (Langston, 2026-11-04): who owns the folder (uid is not compared), and links in a PARENT of
  // --out — mkdirSync creates through a symlinked parent. --out is operator-typed and normally under ~/.
  const outputRefusal = ensurePrivateRehydrateOutput(args.out);
  if (outputRefusal) {
    console.error(`[B75 rehydrate] --out ${args.out} ${outputRefusal}; refusing — use a private folder you own`);
    process.exit(1);
    return;
  }

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
  const results: RehydrateObjectResult[] = [];

  console.log(
    `[B75 rehydrate] table=${args.table} window=${args.from.toISOString().slice(0, 10)}..${args.to.toISOString().slice(0, 10)} → ${args.out}`,
  );
  console.log(
    `[B75 rehydrate] manifest matches: warm=${rows.filter((r) => r.tier === 'warm').length} ` +
      `cold=${rows.filter((r) => r.tier === 'cold').length} labels=${choices.length}`,
  );

  for (const choice of choices) {
    results.push(await rehydrateChosenObject(args, choice, storage));
  }
  finishRehydrateRun(summarizeRehydrateResults(results));
}

export interface RehydrateProcessDependencies {
  runCli: () => Promise<void>;
  exit: (code: number) => void;
}

export async function runRehydrateProcess(
  deps: RehydrateProcessDependencies = {
    runCli: () => runRehydrateCli(),
    exit: (code) => process.exit(code),
  },
): Promise<void> {
  try {
    await deps.runCli();
  } catch (err) {
    console.error('[B75 rehydrate] fatal:', err);
    deps.exit(1);
  }
}

if (isDirectEntry(import.meta.url)) {
  void runRehydrateProcess();
}
