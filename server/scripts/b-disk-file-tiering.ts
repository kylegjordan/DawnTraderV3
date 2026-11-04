/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-DISK-FILE-TIERING (#1233) — the daily job that moves the app's dated business-data
 * files off the staging disk into the B75 WARM tier (Supabase `dt-archive`), proved by
 * a byte-identical round trip before the local file is deleted. The existing cold
 * rotator takes them to COLD at 365 days with no change (pre-audit census F).
 *
 * Pre-audit: `Claude Comms and Packages/Scope Files/B_DISK_FILE_TIERING_PRE_AUDIT.md`
 * (Langston PROCEED 2026-11-04, r4) — plan items P2, P3, P4, P5.
 *
 * Cron (root, beside the B75 jobs):
 *   45 2 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b-disk-file-tiering.ts" >> /var/log/dawntrader/disk-file-tiering.log 2>&1
 * One-off, the Phase 41F-L trace AFTER its writer is gone (P5 — writer first, Langston C1):
 *   npx tsx server/scripts/b-disk-file-tiering.ts --trace diagnostic-reports/phase-41F-L-trace.ndjson
 *
 * Per file, in this order, and the original is deleted ONLY at the end:
 *   gzip beside it → uploadWarmFile (streaming; never the whole-file Buffer path) →
 *   downloadWarmFile to a temp → the download's checksum equals the local .gz's AND its
 *   inflated sha256 + newline count equal the original's → evidence row, then the manifest
 *   stamp, in one transaction → delete the original → manifest `active`.
 * Any failure keeps the original, removes the temps, counts `failed`, and the run goes on.
 * The page is archival-health's (`DONE moved=N failed=N …`, P7), never a second key.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { getStorageClient, type StorageClient } from '../services/data-archive/storage-client.js';
import { recordExactArchiveEvidence } from '../services/data-archive/exact-archive-evidence.js';
import { PROVEN_BASIS } from '../services/data-archive/archive-completeness.js';
import {
  DISK_FILE_CURSOR_CONTRACT, DISK_FILE_FORMAT, DISK_FILE_SPECS,
  boundsFromName, digestFile, digestGunzipped, gzipFile, isOlderThanHotWindow, planRun, warmObjectPath,
  type Candidate, type DiskFileSpec, type NameBounds,
} from '../services/data-archive/disk-file-tiering.js';

const { Client } = pg;
const LOCK_FILE = process.env.B_DISK_FILE_TIERING_LOCK ?? '/tmp/b-disk-file-tiering.lock';
const LOCK_STALE_MS = 12 * 60 * 60 * 1000;
const TRACE_SPEC: DiskFileSpec = { folder: 'diagnostic-reports', sourceTable: 'disk_file.diagnostic_reports', namePattern: /^$/ };
/** a file being archived whole must have stopped growing (the trace's writer is removed first, P5) */
const TRACE_STATIC_MS = 60 * 60 * 1000;

interface Cfg {
  warmBucket: string;
  warmPrefix: string;
  hotDays: number;
  runCapBytes: number;
  backlogFreeBytes: number;
  freeFloorBytes: number;
}

function log(msg: string): void {
  console.log(`[disk-tiering] ${new Date().toISOString()} ${msg}`);
}

async function loadConfig(client: pg.Client): Promise<Cfg> {
  const r = await client.query(`SELECT constant_name, value FROM module_constants WHERE module_name = 'data_lifecycle'`);
  const map = new Map<string, unknown>(r.rows.map((row) => [row.constant_name as string, row.value]));
  const str = (k: string): string => {
    const v = map.get(k);
    if (typeof v !== 'string' || v === '') throw new Error(`missing or non-string data_lifecycle.${k}`);
    return v;
  };
  const num = (k: string): number => {
    const v = map.get(k);
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`missing or invalid numeric data_lifecycle.${k}`);
    return v;
  };
  return {
    warmBucket: str('warm_bucket'),
    warmPrefix: str('warm_prefix'),
    hotDays: num('disk_file_hot_days'),
    runCapBytes: num('disk_file_run_cap_bytes'),
    backlogFreeBytes: num('disk_file_backlog_free_bytes'),
    freeFloorBytes: num('disk_file_free_floor_bytes'),
  };
}

function freeBytes(): number {
  const s = fs.statfsSync('/');
  return Number(s.bavail) * Number(s.bsize);
}

function acquireLock(): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK_FILE, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o644);
      fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      fs.closeSync(fd);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      try {
        if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) { fs.unlinkSync(LOCK_FILE); continue; }
      } catch { continue; }
      return false;
    }
  }
  return false;
}

function rmQuiet(p: string | null): void {
  if (!p) return;
  try { fs.unlinkSync(p); } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') log(`WARN could not remove temp ${p}: ${String(err)}`);
  }
}

interface ManifestRow { id: string; state: string; checksum: string }

async function existingRow(client: pg.Client, sourceTable: string, label: string): Promise<ManifestRow | null> {
  const r = await client.query(
    `SELECT id, state, checksum FROM data_archive_manifest WHERE source_table = $1 AND partition_label = $2 AND tier = 'warm'`,
    [sourceTable, label],
  );
  return (r.rows[0] as ManifestRow | undefined) ?? null;
}

async function markActive(client: pg.Client, id: string): Promise<void> {
  await client.query(
    `UPDATE data_archive_manifest SET state = 'active', hot_partition_dropped_at = NOW() WHERE id = $1 AND state = 'verified'`,
    [id],
  );
}

/** Move one file. Returns the original's size when it left the disk; throws on any failure
 *  (the caller keeps counting). The original is unlinked only after the proof is committed. */
async function moveOne(storage: StorageClient, client: pg.Client, cfg: Cfg, c: Candidate): Promise<number> {
  const objPath = warmObjectPath(cfg.warmPrefix, c.spec, c.name);
  const gzPath = `${c.path}.tiering.gz`;
  const verifyPath = `${c.path}.tiering.verify.gz`;
  try {
    const prior = await existingRow(client, c.spec.sourceTable, c.name);
    if (prior && prior.state !== 'verified') {
      throw new Error(`manifest row ${prior.id} for ${c.spec.sourceTable}/${c.name} is '${prior.state}' while the file is still on disk — refusing (inspect by hand)`);
    }
    const original = await digestFile(c.path);
    const gz = await gzipFile(c.path, gzPath);
    if (prior) {
      // Resume after a crash between the commit and the delete: the gzip is deterministic, so the
      // stored object checksum must be reproduced exactly from the file still on disk.
      if (prior.checksum !== gz.sha256) throw new Error(`resume refused: the file changed since its proof (stored ${prior.checksum}, now ${gz.sha256})`);
      fs.unlinkSync(c.path);
      await markActive(client, prior.id);
      return original.bytes;
    }

    const upload = await storage.uploadWarmFile(cfg.warmBucket, objPath, gzPath, { size: gz.bytes, checksum: gz.sha256 });
    const dl = await storage.downloadWarmFile(cfg.warmBucket, objPath, verifyPath);
    if (upload.checksum !== gz.sha256 || dl.checksum !== gz.sha256) {
      throw new Error(`checksum mismatch: local=${gz.sha256} upload=${upload.checksum} readback=${dl.checksum}`);
    }
    const inflated = await digestGunzipped(verifyPath);
    if (inflated.sha256 !== original.sha256 || inflated.newlines !== original.newlines || inflated.bytes !== original.bytes) {
      throw new Error(`round trip not byte-identical: original ${original.sha256}/${original.newlines}/${original.bytes} `
        + `inflated ${inflated.sha256}/${inflated.newlines}/${inflated.bytes}`);
    }

    // The proof and the stamp land together (the manifest tie trigger's ordering: evidence first).
    await client.query('BEGIN');
    let manifestId: string;
    try {
      const ins = await client.query(
        `INSERT INTO data_archive_manifest (
           source_table, partition_label, tier, state, storage_uri, min_ts, max_ts,
           date_range_start, date_range_end, row_count, bytes_compressed, original_partition_size_bytes,
           format, compression, checksum_algo, checksum, verified_at
         ) VALUES ($1, $2, 'warm', 'verified', $3, $4, $5, $4, $6, $7, $8, $9, $10, 'gzip', 'sha256', $11, NOW())
         RETURNING id`,
        [c.spec.sourceTable, c.name, `supabase://${cfg.warmBucket}/${objPath}`, c.bounds.start,
          new Date(c.bounds.end.getTime() - 1), c.bounds.end, original.newlines, gz.bytes, original.bytes,
          DISK_FILE_FORMAT, gz.sha256],
      );
      manifestId = ins.rows[0].id as string;
      await recordExactArchiveEvidence(client, {
        manifestId,
        sourceTable: c.spec.sourceTable,
        partitionLabel: c.name,
        tier: 'warm',
        cursorContract: DISK_FILE_CURSOR_CONTRACT,
        sourceRowCount: original.newlines,
        exportedRowCount: original.newlines,
        downloadedRowCount: inflated.newlines,
        objectChecksum: gz.sha256,
      });
      await client.query(`UPDATE data_archive_manifest SET completeness_basis = $2 WHERE id = $1`, [manifestId, PROVEN_BASIS]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    }
    fs.unlinkSync(c.path);
    await markActive(client, manifestId);
    log(`moved ${c.spec.sourceTable}/${c.name} bytes=${original.bytes} gz=${gz.bytes} newlines=${original.newlines}`);
    return original.bytes;
  } finally {
    rmQuiet(gzPath);
    rmQuiet(verifyPath);
  }
}

function listCandidates(appRoot: string, cfg: Cfg, nowMs: number): { candidates: Candidate[]; foldersSeen: number } {
  const candidates: Candidate[] = [];
  let foldersSeen = 0;
  for (const spec of DISK_FILE_SPECS) {
    const dir = path.join(appRoot, spec.folder);
    let names: string[];
    try { names = fs.readdirSync(dir); } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') { log(`folder absent: ${spec.folder}`); continue; }
      throw err;
    }
    foldersSeen++;
    for (const name of names) {
      const bounds = boundsFromName(spec, name);
      if (!bounds || !isOlderThanHotWindow(bounds, nowMs, cfg.hotDays)) continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isFile()) candidates.push({ spec, name, path: p, bytes: st.size, bounds });
    }
  }
  return { candidates, foldersSeen };
}

/** The trace's bounds: its first line's `ts` to its last write (it is static by the time it moves). */
function traceBounds(p: string, mtimeMs: number): NameBounds {
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const first = buf.subarray(0, n).toString('utf8').split('\n')[0];
    const ts = Number((JSON.parse(first) as { ts?: unknown }).ts);
    if (!Number.isFinite(ts)) throw new Error('trace first line has no numeric ts');
    return { start: new Date(ts), end: new Date(Math.max(mtimeMs, ts) + 1) };
  } finally { fs.closeSync(fd); }
}

async function main(): Promise<void> {
  for (const k of ['DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[k]) { log(`${k} not set`); process.exit(1); }
  }
  if (!acquireLock()) { log('another run holds the lock — skipping this tick'); return; }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const cfg = await loadConfig(client);
    const storage = getStorageClient();
    const appRoot = process.cwd();
    const nowMs = Date.now();
    const freeStart = freeBytes();
    log(`started run free=${freeStart} cwd=${appRoot}`);

    const traceIdx = process.argv.indexOf('--trace');
    let take: Candidate[];
    let stoppedBy = 'none';
    if (traceIdx > 0) {
      const rel = process.argv[traceIdx + 1];
      if (!rel) throw new Error('--trace needs a path');
      const p = path.resolve(appRoot, rel);
      const st = fs.statSync(p);
      if (nowMs - st.mtimeMs < TRACE_STATIC_MS) throw new Error(`--trace refused: ${rel} was written ${Math.round((nowMs - st.mtimeMs) / 1000)} s ago — remove its writer first (P5)`);
      if (freeStart - st.size < cfg.freeFloorBytes) throw new Error(`--trace refused: free ${freeStart} minus ${st.size} is under the floor ${cfg.freeFloorBytes}`);
      take = [{ spec: TRACE_SPEC, name: path.basename(p), path: p, bytes: st.size, bounds: traceBounds(p, st.mtimeMs) }];
    } else {
      const { candidates, foldersSeen } = listCandidates(appRoot, cfg, nowMs);
      if (foldersSeen === 0) throw new Error(`none of the ${DISK_FILE_SPECS.length} folders exist under ${appRoot} — wrong working directory?`);
      const plan = planRun(candidates, { freeBytes: freeStart, backlogFreeBytes: cfg.backlogFreeBytes, runCapBytes: cfg.runCapBytes, freeFloorBytes: cfg.freeFloorBytes });
      take = plan.take;
      stoppedBy = plan.stoppedBy;
      log(`candidates=${candidates.length} planned=${take.length} stopped_by=${stoppedBy} hot_days=${cfg.hotDays}`);
    }

    let moved = 0;
    let failed = 0;
    let freed = 0;
    for (const c of take) {
      // Re-read free space before each file: the floor is checked against the disk, not the plan.
      if (freeBytes() - c.bytes < cfg.freeFloorBytes) { stoppedBy = 'free-floor'; log(`floor reached before ${c.name}`); break; }
      try {
        freed += await moveOne(storage, client, cfg, c);
        moved++;
      } catch (err) {
        failed++;
        log(`FAILED ${c.spec.sourceTable}/${c.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    log(`DONE moved=${moved} failed=${failed} freed_bytes=${freed} free_after=${freeBytes()} stopped_by=${stoppedBy} hot_days=${cfg.hotDays}`);
  } finally {
    await client.end().catch(() => {});
    try { fs.unlinkSync(LOCK_FILE); } catch { /* already gone */ }
  }
}

main().catch((err) => {
  log(`FATAL ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
