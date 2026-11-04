/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-DISK-FILE-TIERING (#1233) — pure logic for moving the app's dated business-data
 * files off the staging disk into the B75 warm tier (then cold, by the existing
 * rotator at 365 days). Pre-audit: `Claude Comms and Packages/Scope Files/
 * B_DISK_FILE_TIERING_PRE_AUDIT.md` (Langston PROCEED 2026-11-04, r4).
 *
 * This module holds NO I/O beyond `fs` stream helpers: which files are candidates
 * (by the date in the file NAME — mtime is the wrong instrument: `-mtime +35`
 * returns zero for the telemetry folder, measured), how a run is capped, and the
 * byte-identical round-trip digest. The runner is `server/scripts/b-disk-file-tiering.ts`.
 *
 * Every governed number (window, caps, floor) is read from module_constants
 * `data_lifecycle.disk_file_*` by the runner and passed in — no defaults here.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** The archive identity of a disk file: `format` in the manifest, contract in the evidence row. */
export const DISK_FILE_FORMAT = 'file.gz' as const;
export const DISK_FILE_CURSOR_CONTRACT = 'disk-file-lines-v1' as const;
/** Every disk-file `source_table` starts with this (pre-audit P2; Langston Q2 ruled). */
export const DISK_FILE_SOURCE_PREFIX = 'disk_file.' as const;

export interface DiskFileSpec {
  /** folder relative to the app's working directory (`/home/deploy/dawntrader` on staging) */
  folder: string;
  /** the manifest's `source_table` for files of this folder — path-safe for the rotator's cold key */
  sourceTable: string;
  /** the file-name shape; group 1 = YYYY-MM-DD, optional group 2 = HH */
  namePattern: RegExp;
}

/** The folders this batch tiers (pre-audit §3 A-C). Each folder's name shape differs — so the
 *  manifest stores the WHOLE file name as `partition_label` (Langston C2), never a bare date. */
export const DISK_FILE_SPECS: readonly DiskFileSpec[] = [
  { folder: 'logs/phase15b_dbs_telemetry',                sourceTable: 'disk_file.phase15b_dbs_telemetry',                namePattern: /^(\d{4}-\d{2}-\d{2})\.jsonl$/ },
  { folder: 'logs/phase15b_dbs_telemetry/consumer_sites', sourceTable: 'disk_file.phase15b_dbs_telemetry.consumer_sites', namePattern: /^(\d{4}-\d{2}-\d{2})\.jsonl$/ },
  { folder: 'logs/vts_eval_history',                      sourceTable: 'disk_file.vts_eval_history',                      namePattern: /^(\d{4}-\d{2}-\d{2})\.json$/ },
  { folder: 'logs/data_aggregates',                       sourceTable: 'disk_file.data_aggregates',                       namePattern: /^passive_(\d{4}-\d{2}-\d{2})\.json$/ },
  { folder: 'logs/data_aggregates/hourly',                sourceTable: 'disk_file.data_aggregates.hourly',                namePattern: /^passive_(\d{4}-\d{2}-\d{2})T(\d{2})\.json$/ },
];

export interface NameBounds {
  /** inclusive start of the period the name covers (UTC) */
  start: Date;
  /** exclusive end */
  end: Date;
}

/** The UTC period a file NAME covers, or null when the name is not this folder's shape. */
export function boundsFromName(spec: DiskFileSpec, name: string): NameBounds | null {
  const m = spec.namePattern.exec(name);
  if (!m) return null;
  const day = Date.parse(`${m[1]}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== m[1]) return null;
  if (m[2] !== undefined) {
    const hour = Number(m[2]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    const start = day + hour * HOUR_MS;
    return { start: new Date(start), end: new Date(start + HOUR_MS) };
  }
  return { start: new Date(day), end: new Date(day + DAY_MS) };
}

/** A file is a candidate when the DAY its name carries is more than `hotDays` days before
 *  today (UTC): on 2026-11-04 with 35, `2026-09-29.*` moves and `2026-09-30.*` stays. */
export function isOlderThanHotWindow(bounds: NameBounds, nowMs: number, hotDays: number): boolean {
  const todayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const nameDayStart = Math.floor(bounds.start.getTime() / DAY_MS) * DAY_MS;
  return todayStart - nameDayStart > hotDays * DAY_MS;
}

export interface Candidate {
  spec: DiskFileSpec;
  name: string;
  path: string;
  bytes: number;
  bounds: NameBounds;
}

export interface RunCaps {
  /** free bytes on `/` before the run */
  freeBytes: number;
  /** under this free space, the run moves at most `runCapBytes` of originals */
  backlogFreeBytes: number;
  runCapBytes: number;
  /** never start a file whose worst-case peak (its own size again, for the .gz beside it) would
   *  take free space under this */
  freeFloorBytes: number;
}

export interface RunPlan {
  take: Candidate[];
  /** why the plan stopped short of the full candidate list, if it did */
  stoppedBy: 'none' | 'run-cap' | 'free-floor';
}

/** Oldest first, and within a day the largest folder's file first — so a capped run frees the most
 *  per file and the backlog drains in date order. Worst-case peak for one file = its size again
 *  (gzip output never exceeds the input for these files by more than a few bytes; the floor check
 *  uses the full size, so it is conservative). Freed space is only counted after a file's delete,
 *  so the plan never relies on space it has not got yet. */
export function planRun(candidates: Candidate[], caps: RunCaps): RunPlan {
  const ordered = [...candidates].sort((a, b) =>
    a.bounds.start.getTime() - b.bounds.start.getTime() || b.bytes - a.bytes || a.path.localeCompare(b.path));
  const capped = caps.freeBytes < caps.backlogFreeBytes;
  const take: Candidate[] = [];
  let moved = 0;
  for (const c of ordered) {
    if (capped && moved + c.bytes > caps.runCapBytes) return { take, stoppedBy: 'run-cap' };
    // Free space at this file's start: the starting figure plus what earlier files freed (their
    // originals), which this plan only counts once they are gone — the runner re-reads statfs.
    if (caps.freeBytes + moved - c.bytes < caps.freeFloorBytes) return { take, stoppedBy: 'free-floor' };
    take.push(c);
    moved += c.bytes;
  }
  return { take, stoppedBy: 'none' };
}

export interface FileDigest {
  sha256: string;
  newlines: number;
  bytes: number;
}

function digestOf(stream: NodeJS.ReadableStream): Promise<FileDigest> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    let newlines = 0;
    let bytes = 0;
    stream.on('data', (chunk: Buffer) => {
      h.update(chunk);
      bytes += chunk.length;
      for (let i = 0; i < chunk.length; i++) if (chunk[i] === 0x0a) newlines++;
    });
    stream.on('error', reject);
    stream.on('end', () => resolve({ sha256: h.digest('hex'), newlines, bytes }));
  });
}

/** sha256 + newline count + size of a plain file, streamed. */
export function digestFile(path: string): Promise<FileDigest> {
  return digestOf(fs.createReadStream(path));
}

/** The same digest of a .gz file's INFLATED content — proves a byte-identical round trip when it
 *  equals `digestFile(original)`. Newlines are counted, not "rows": these files are not all JSONL. */
export function digestGunzipped(gzPath: string): Promise<FileDigest> {
  const src = fs.createReadStream(gzPath);
  const gunzip = zlib.createGunzip();
  src.on('error', (e) => gunzip.destroy(e));
  src.pipe(gunzip);
  return digestOf(gunzip);
}

/** gzip a file (level 6, no name/time in the header, so the output is deterministic for the same
 *  input — a resumed run reproduces the stored object's checksum) and return the .gz digest. */
export async function gzipFile(src: string, dest: string): Promise<FileDigest> {
  await pipeline(fs.createReadStream(src), zlib.createGzip({ level: 6 }), fs.createWriteStream(dest, { mode: 0o640 }));
  return digestFile(dest);
}

/** The warm object path for a disk file: `<warmPrefix>/disk-files/<sourceTable>/<file name>.gz`.
 *  The cold rotator will later write `<sourceTable>/<file name>.jsonl.gz` — that key's extension is
 *  NOT authoritative; rehydration reads the manifest's `format` (Langston C2). */
export function warmObjectPath(warmPrefix: string, spec: DiskFileSpec, name: string): string {
  return `${warmPrefix}/disk-files/${spec.sourceTable}/${name}.gz`;
}
