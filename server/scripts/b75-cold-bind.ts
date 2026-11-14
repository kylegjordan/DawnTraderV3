/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-DISK-FILE-TIERING amendment 4, increment 3b item 3 — BIND the pre-3a cold rows to their exact B2 versions
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The 4 cold rows written before 3a were verified by a whole-object SHA-256 round trip and carry no provider_file_id,
 * so a restore of them reads by NAME (any version of the name — item 2). This lists every stored version in the cold
 * bucket (b2_list_file_versions, paged, a partial listing FAILS) and binds each unbound cold row to its version:
 *   - exactly one 'upload' version under the row's path, length = the manifest's bytes → that version;
 *   - several, all with one SHA-1 and length → byte-identical: the NEWEST (what a by-name read returns); the others
 *     are reported as residue (item 4 deletes them by id);
 *   - several with different SHA-1s → each candidate is downloaded BY ID and its SHA-256 compared with the manifest's
 *     (this spends B2 download budget — reported before it runs, and only with --apply);
 *   - none, or a length mismatch → REFUSED, reported, nothing written.
 * Before writing, b2_get_file_info by the chosen id re-checks name, SHA-1 and length (assertB2Version). The row then
 * records provider_file_id / provider_sha1 / provider_bytes and verification_method 'b2-sha1-attested'.
 *
 * It also reports every stored version whose name has NO manifest row (orphans — the P10 orphan, a failed retry's
 * leftover) and every non-newest duplicate: the inventory item 4 deletes from.
 *
 * DEFAULT IS A REPORT. Nothing is written and nothing is downloaded without --apply.
 * Usage (as deploy, on staging):  npx tsx server/scripts/b75-cold-bind.ts [--apply]
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {
  assertB2Version,
  getStorageClient,
  type B2ListedVersion,
} from '../services/data-archive/storage-client.js';
import { loadColdLimits } from '../services/data-archive/cold-limits.js';
import { isDirectEntry } from './direct-entry.js';

export interface UnboundColdRow {
  id: string;
  source_table: string;
  partition_label: string;
  storage_uri: string;
  bytes_compressed: number;
  checksum: string;
}

export type BindDecision =
  | { kind: 'bind'; row: UnboundColdRow; version: B2ListedVersion; residue: B2ListedVersion[] }
  | { kind: 'needs_download'; row: UnboundColdRow; candidates: B2ListedVersion[] }
  | { kind: 'refused'; row: UnboundColdRow; reason: string };

/** The cold object path a manifest row names (b2://<bucket>/<path>). */
export function coldPathOf(uri: string): { bucket: string; path: string } | null {
  const m = /^b2:\/\/([^/]+)\/(.+)$/.exec(uri);
  return m ? { bucket: m[1], path: m[2] } : null;
}

/** Pure: decide each row's binding from the listing. Exported for tests. */
export function planColdBindings(rows: UnboundColdRow[], versions: B2ListedVersion[]): BindDecision[] {
  const uploads = versions.filter((v) => v.action === 'upload');
  return rows.map((row): BindDecision => {
    const p = coldPathOf(row.storage_uri);
    if (!p) return { kind: 'refused', row, reason: `cannot parse cold URI ${row.storage_uri}` };
    const mine = uploads.filter((v) => v.fileName === p.path).sort((a, b) => b.uploadTimestamp - a.uploadTimestamp);
    if (mine.length === 0) return { kind: 'refused', row, reason: `no stored version named ${p.path}` };
    const sized = mine.filter((v) => Number(v.contentLength) === Number(row.bytes_compressed));
    if (sized.length === 0) {
      return { kind: 'refused', row, reason: `no version of ${p.path} has the manifest's ${row.bytes_compressed} bytes (found ${mine.map((v) => v.contentLength).join(', ')})` };
    }
    const sha1s = new Set(sized.map((v) => v.contentSha1));
    if (sha1s.size === 1 && !sha1s.has(null)) {
      const [newest, ...older] = sized;
      return { kind: 'bind', row, version: newest, residue: [...older, ...mine.filter((v) => !sized.includes(v))] };
    }
    return { kind: 'needs_download', row, candidates: sized };
  });
}

/**
 * Pure: stored versions in DawnTrader's OWN namespaces that no manifest row claims (orphans). The bucket is SHARED:
 * token-watch (CC-INFRA) keeps its cold archive under `token-watch/`, tracked by its own tool, and the canary uses
 * `_liveness/`. Only a name whose first segment is one of `ownPrefixes` (a manifest source_table, or `_proof`) can be an
 * orphan here; every other version belongs to another owner and is only COUNTED — never listed for deletion
 * (found at Step 3: the first report listed 108 token-watch objects as orphans).
 */
export function orphanVersions(versions: B2ListedVersion[], claimedPaths: Set<string>, ownPrefixes: Set<string>): B2ListedVersion[] {
  return versions.filter(
    (v) => v.action === 'upload' && ownPrefixes.has(v.fileName.split('/')[0]) && !claimedPaths.has(v.fileName),
  );
}

/** Pure: versions outside DawnTrader's namespaces, counted by first segment (reported, never touched). */
export function otherOwnerCounts(versions: B2ListedVersion[], ownPrefixes: Set<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of versions) {
    const seg = v.fileName.split('/')[0];
    if (!ownPrefixes.has(seg)) m.set(seg, (m.get(seg) ?? 0) + 1);
  }
  return m;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const c = await client.query(
      `SELECT value FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = 'cold_bucket'`,
    );
    if (typeof c.rows[0]?.value !== 'string') throw new Error('[B75 cold-bind] missing data_lifecycle.cold_bucket');
    const bucket: string = c.rows[0].value;
    const limits = await loadColdLimits(client, 'B75 cold-bind');
    const all = await client.query<{ storage_uri: string }>(`SELECT storage_uri FROM data_archive_manifest WHERE tier = 'cold'`);
    const claimed = new Set(all.rows.map((r) => coldPathOf(r.storage_uri)?.path).filter((x): x is string => !!x));
    const tables = await client.query<{ source_table: string }>(`SELECT DISTINCT source_table FROM data_archive_manifest`);
    const ownPrefixes = new Set([...tables.rows.map((t) => t.source_table), '_proof']);
    const r = await client.query<UnboundColdRow>(
      `SELECT id, source_table, partition_label, storage_uri, bytes_compressed, checksum
         FROM data_archive_manifest WHERE tier = 'cold' AND provider_file_id IS NULL ORDER BY source_table, partition_label`,
    );
    const storage = getStorageClient();
    const listing = await storage.listColdFileVersions(bucket, '', limits.setupMs);
    console.log(`[B75 cold-bind] listed ${listing.versions.length} version(s) in ${listing.pages} page(s) of ${bucket}; ${r.rows.length} unbound cold row(s); apply=${apply}`);
    for (const [seg, n] of otherOwnerCounts(listing.versions, ownPrefixes)) {
      console.log(`[B75 cold-bind] other owner (not DawnTrader's, never touched): ${seg}/ — ${n} version(s)`);
    }
    for (const o of orphanVersions(listing.versions, claimed, ownPrefixes)) {
      console.log(`[B75 cold-bind] ORPHAN (no manifest row): ${o.fileName} id=${o.fileId} bytes=${o.contentLength} sha1=${o.contentSha1} uploaded=${new Date(o.uploadTimestamp).toISOString()}`);
    }
    let failures = 0;
    for (const d of planColdBindings(r.rows, listing.versions)) {
      const name = `${d.row.source_table}/${d.row.partition_label}`;
      if (d.kind === 'refused') { failures++; console.error(`[B75 cold-bind] ${name}: REFUSED — ${d.reason}`); continue; }
      let version: B2ListedVersion | null = d.kind === 'bind' ? d.version : null;
      if (d.kind === 'bind') {
        for (const x of d.residue) console.log(`[B75 cold-bind] ${name}: RESIDUE (a duplicate, not bound) id=${x.fileId} bytes=${x.contentLength} uploaded=${new Date(x.uploadTimestamp).toISOString()}`);
      } else {
        const bytes = d.candidates.reduce((s, v) => s + Number(v.contentLength), 0);
        console.log(`[B75 cold-bind] ${name}: ${d.candidates.length} differing versions — choosing by SHA-256 needs ${bytes} bytes of B2 download`);
        if (!apply) continue;
        const dir = fs.mkdtempSync(path.join(os.homedir(), '.b75-cold-bind-'));
        fs.chmodSync(dir, 0o700);
        try {
          for (const v of d.candidates) {
            const dl = await storage.downloadColdFileById(v.fileId, path.join(dir, 'v.gz'), { expectedBytes: Number(v.contentLength), limits });
            if (dl.checksum === d.row.checksum) { version = v; break; }
          }
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
        if (!version) { failures++; console.error(`[B75 cold-bind] ${name}: REFUSED — no version's SHA-256 equals the manifest's`); continue; }
      }
      if (!version) continue;
      const p = coldPathOf(d.row.storage_uri)!;
      console.log(`[B75 cold-bind] ${name}: bind → id=${version.fileId} sha1=${version.contentSha1} bytes=${version.contentLength}`);
      if (!apply) continue;
      const info = await storage.b2GetFileInfo(version.fileId, limits.setupMs);
      assertB2Version('b2_get_file_info', info, {
        action: 'upload', bucketId: info.bucketId, fileName: p.path, sha1: version.contentSha1 ?? '', bytes: Number(d.row.bytes_compressed),
      });
      const u = await client.query(
        `UPDATE data_archive_manifest
            SET provider_file_id = $2, provider_sha1 = $3, provider_bytes = $4, verification_method = 'b2-sha1-attested'
          WHERE id = $1 AND tier = 'cold' AND provider_file_id IS NULL`,
        [d.row.id, info.fileId, info.contentSha1, Number(info.contentLength)],
      );
      if (u.rowCount !== 1) { failures++; console.error(`[B75 cold-bind] ${name}: the row changed underneath (updated ${u.rowCount})`); continue; }
      console.log(`[B75 cold-bind] ${name}: BOUND`);
    }
    console.log(`[B75 cold-bind] DONE failures=${failures} apply=${apply}`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

if (isDirectEntry(import.meta.url)) {
  main().catch((err) => {
    console.error('[B75 cold-bind] fatal:', err);
    process.exit(1);
  });
}
