/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-DISK-FILE-TIERING amendment 4, increment 3a — the cold-path MEMORY PROOF (AP-5's flatness, Langston C-2 on plan r1)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Runs the streamed cold path on ONE real warm object and measures memory across all of it, WITHOUT rotating anything:
 *   warm downloadWarmFile → a private 0700 temp file → uploadColdFile under `_proof/` → (inside it) the upload response
 *   and b2_get_file_info by the returned file id → delete that proof version by id → remove the temp file.
 * It NEVER writes data_archive_manifest and NEVER calls deleteWarm: the warm object and its manifest row are untouched.
 * The real rotator cannot be used for this — its dry run returns before any I/O, and a real rotation of a large month
 * would write a cold row and delete a live warm object months early.
 *
 * B2 download spend: zero bytes. Warm is Supabase; the upload is free; b2_get_file_info is metadata (Langston, plan r2).
 * Cleanup: the proof version is deleted by file id with the current (wide) key — usable only until amendment 4's 3d
 * step 5 removes every delete right (Langston C-1 on plan r2).
 *
 * PASS (AP-5, verbatim): peak RSS FLAT in object size — run at 170,761,082 B (the trace) and 535,409,768 B (the largest
 * warm object), each under 1 GiB RSS and MemAvailable >= 512 MiB, and the two peaks within 64 MiB of each other.
 * This script measures ONE object per run; the operator runs it at both sizes and compares.
 *
 * Usage (as deploy, on staging):  npx tsx server/scripts/b75-cold-proof.ts --manifest-id <warm manifest uuid>
 * Output: one JSON line on stdout with bytes, peak_rss_kb, min_memavailable_kb, the attested sha1 / file id, and timings.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { getStorageClient, type ColdTransferLimits, type StorageClient } from '../services/data-archive/storage-client.js';
import { loadColdLimits } from '../services/data-archive/cold-limits.js';
import { isDirectEntry } from './direct-entry.js';

export const PROOF_PREFIX = '_proof';

/** MemAvailable in kB from /proc/meminfo (Linux); null where it cannot be read. */
export function readMemAvailableKb(meminfo: string): number | null {
  const m = /^MemAvailable:\s+(\d+)\s+kB/m.exec(meminfo);
  return m ? Number(m[1]) : null;
}

export interface ProofResult {
  manifest_id: string;
  bytes: number;
  peak_rss_kb: number;
  min_memavailable_kb: number | null;
  sha256: string;
  sha1: string;
  proof_file_id: string;
  proof_deleted: boolean;
  download_ms: number;
  upload_ms: number;
}

export interface ProofDependencies {
  storage: Pick<StorageClient, 'downloadWarmFile' | 'uploadColdFile' | 'deleteColdVersion'>;
  coldBucket: string;
  /** 3b: per-phase transfer limits from data_lifecycle */
  coldLimits: ColdTransferLimits;
  tempRoot: string;
  sampleMs?: number;
  rssKb?: () => number;
  memAvailableKb?: () => number | null;
}

/** The proof itself, injectable for tests. Throws if the warm file's SHA-256 is not the manifest's. */
export async function runColdProof(
  row: { id: string; storage_uri: string; checksum: string; source_table: string; partition_label: string },
  deps: ProofDependencies,
): Promise<ProofResult> {
  const m = /^supabase:\/\/([^/]+)\/(.+)$/.exec(row.storage_uri);
  if (!m) throw new Error(`[B75 cold-proof] not a warm object: ${row.storage_uri}`);
  const rssKb = deps.rssKb ?? (() => Math.round(process.memoryUsage().rss / 1024));
  const memAvailableKb = deps.memAvailableKb ?? (() => {
    try { return readMemAvailableKb(fs.readFileSync('/proc/meminfo', 'utf-8')); } catch { return null; }
  });
  let peakRss = rssKb();
  let minAvail = memAvailableKb();
  const sample = () => {
    peakRss = Math.max(peakRss, rssKb());
    const a = memAvailableKb();
    if (a !== null) minAvail = minAvail === null ? a : Math.min(minAvail, a);
  };
  const timer = setInterval(sample, deps.sampleMs ?? 250);
  const dir = fs.mkdtempSync(path.join(deps.tempRoot, '.b75-cold-proof-'));
  fs.chmodSync(dir, 0o700);
  try {
    const local = path.join(dir, 'object.jsonl.gz');
    const t0 = Date.now();
    const warm = await deps.storage.downloadWarmFile(m[1], m[2], local);
    const t1 = Date.now();
    sample();
    if (warm.checksum !== row.checksum) {
      throw new Error(`[B75 cold-proof] warm checksum drift: manifest=${row.checksum} actual=${warm.checksum}`);
    }
    const proofPath = `${PROOF_PREFIX}/${row.source_table}/${row.partition_label}.jsonl.gz`;
    const cold = await deps.storage.uploadColdFile(deps.coldBucket, proofPath, local, deps.coldLimits);
    const t2 = Date.now();
    sample();
    let deleted = false;
    try {
      await deps.storage.deleteColdVersion(proofPath, cold.fileId);
      deleted = true;
    } catch (err) {
      console.error(`[B75 cold-proof] proof version NOT deleted (${proofPath} ${cold.fileId}) — delete it by id:`, err);
    }
    return {
      manifest_id: row.id, bytes: cold.bytes, peak_rss_kb: peakRss, min_memavailable_kb: minAvail,
      sha256: cold.checksum, sha1: cold.sha1, proof_file_id: cold.fileId, proof_deleted: deleted,
      download_ms: t1 - t0, upload_ms: t2 - t1,
    };
  } finally {
    clearInterval(timer);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const i = process.argv.indexOf('--manifest-id');
  const id = i >= 0 ? process.argv[i + 1] : undefined;
  if (!id) throw new Error('usage: b75-cold-proof.ts --manifest-id <warm manifest uuid>');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let row: { id: string; storage_uri: string; checksum: string; source_table: string; partition_label: string };
  let coldBucket: string;
  let coldLimits: ColdTransferLimits;
  try {
    const r = await client.query(
      `SELECT id, storage_uri, checksum, source_table, partition_label FROM data_archive_manifest
        WHERE id = $1 AND tier = 'warm' AND state = 'active'`,
      [id],
    );
    if (r.rows.length !== 1) throw new Error(`[B75 cold-proof] ${id} is not one active warm manifest row`);
    row = r.rows[0];
    const c = await client.query(
      `SELECT value FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = 'cold_bucket'`,
    );
    if (typeof c.rows[0]?.value !== 'string') throw new Error('[B75 cold-proof] missing data_lifecycle.cold_bucket');
    coldBucket = c.rows[0].value;
    coldLimits = await loadColdLimits(client, 'B75 cold-proof');
  } finally {
    await client.end().catch(() => {});
  }
  const result = await runColdProof(row, { storage: getStorageClient(), coldBucket, coldLimits, tempRoot: os.homedir() });
  console.log(JSON.stringify(result));
}

if (isDirectEntry(import.meta.url)) {
  main().catch((err) => {
    console.error('[B75 cold-proof] fatal:', err);
    process.exit(1);
  });
}
