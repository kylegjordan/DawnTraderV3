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
 *
 * 3b item 4 — RESIDUE DELETION (by file id, with the wide key, before 3d step 5 removes every delete right):
 *   npx tsx server/scripts/b75-cold-bind.ts --delete-residue <fileId>[,<fileId>...]
 * deletes ONLY ids that are BOTH named on the command line AND in the delete set this run computes itself (orphans in
 * DawnTrader's own namespaces + duplicates/losers of bound rows), and NEVER an id any manifest row's provider_file_id
 * names. An id outside that intersection is refused and nothing is deleted. A named id that is no longer listed is
 * reported, not an error (already gone). The delete set comes from orphanVersions / planColdBindings ONLY, never from
 * the owner counts (Langston item 3 r2). Permanent: the operator runs the report first and passes the ids it printed.
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
  created_at?: Date;
}

/**
 * Prefixes in the SHARED cold bucket that are never DawnTrader's archive objects (Langston item 3 (b)):
 * `token-watch/` is CC-INFRA's cold archive (its own tool tracks it); `_liveness/` is OUR canary — ours but never
 * manifest-tracked, so never an orphan either. This set is what item 4's deleter reads too, not only this reporter.
 */
export const COLD_NON_ARCHIVE_PREFIXES: ReadonlyMap<string, 'other-owner' | 'ours-untracked'> = new Map([
  ['token-watch', 'other-owner'],
  ['_liveness', 'ours-untracked'],
]);

/**
 * The prefixes that CAN hold DawnTrader archive orphans: every manifest source_table, plus `_proof`. REFUSES (throws)
 * if a source_table equals a non-archive prefix — a silent exclusion would either arm a deleter against another owner's
 * objects or blind the orphan check (Langston item 3 (b): source_table is free text with no constraint).
 */
export function ownColdPrefixes(sourceTables: Iterable<string>): Set<string> {
  const own = new Set<string>(['_proof']);
  for (const t of sourceTables) {
    if (COLD_NON_ARCHIVE_PREFIXES.has(t)) {
      throw new Error(`[B75 cold-bind] REFUSED — source_table "${t}" collides with a non-archive cold prefix; rename it before any inventory`);
    }
    own.add(t);
  }
  return own;
}

/** B2 reports a SHA-1 of null, or the literal "none" for a large-file upload: neither is a usable fingerprint. */
function usableSha1(v: B2ListedVersion): string | null {
  return v.contentSha1 && v.contentSha1 !== 'none' ? v.contentSha1 : null;
}

export type BindDecision =
  | { kind: 'bind'; row: UnboundColdRow; version: B2ListedVersion; residue: B2ListedVersion[] }
  | { kind: 'needs_download'; row: UnboundColdRow; candidates: B2ListedVersion[]; wrongSize: B2ListedVersion[] }
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
    const wrongSize = mine.filter((v) => !sized.includes(v));
    const sha1s = new Set(sized.map(usableSha1));
    if (sha1s.size === 1 && !sha1s.has(null)) {
      const [newest, ...older] = sized;
      return { kind: 'bind', row, version: newest, residue: [...older, ...wrongSize] };
    }
    // differing SHA-1s, or no usable SHA-1 at all (null / "none"): only the bytes can decide
    return { kind: 'needs_download', row, candidates: sized, wrongSize };
  });
}

/**
 * Pure: stored versions in DawnTrader's OWN archive namespaces that no manifest row claims (orphans). The bucket is
 * SHARED (`COLD_NON_ARCHIVE_PREFIXES`): only a name whose first segment is in `ownPrefixes` (from `ownColdPrefixes`)
 * can be an orphan; everything else is only COUNTED — never listed for deletion (found at Step 3: the first report
 * listed 108 token-watch objects as orphans).
 */
export function orphanVersions(versions: B2ListedVersion[], claimedPaths: Set<string>, ownPrefixes: Set<string>): B2ListedVersion[] {
  return versions.filter(
    (v) => v.action === 'upload' && ownPrefixes.has(v.fileName.split('/')[0]) && !claimedPaths.has(v.fileName),
  );
}

/**
 * Pure: the residue delete set — orphans in our own namespaces, plus every non-chosen version of a bound row's name —
 * minus any id a manifest row is bound to. The only source item 4 deletes from. Exported for tests.
 */
export function residueDeleteSet(
  versions: B2ListedVersion[],
  claimedPaths: Set<string>,
  ownPrefixes: Set<string>,
  decisions: BindDecision[],
  boundIds: Set<string>,
): B2ListedVersion[] {
  const out = new Map<string, B2ListedVersion>();
  for (const v of orphanVersions(versions, claimedPaths, ownPrefixes)) out.set(v.fileId, v);
  for (const d of decisions) {
    if (d.kind === 'bind') for (const v of d.residue) out.set(v.fileId, v);
  }
  // a bound row's name is claimed, so its OTHER versions reach here only through the decisions; a row bound in an
  // earlier run has no decision, so its siblings are found directly: same name, not the bound id
  const boundNames = new Set(versions.filter((v) => boundIds.has(v.fileId)).map((v) => v.fileName));
  for (const v of versions) {
    if (v.action === 'upload' && boundNames.has(v.fileName) && !boundIds.has(v.fileId)) out.set(v.fileId, v);
  }
  // never a version this run's plan KEEPS (a bind's chosen version) nor any candidate still undecided (needs_download)
  // — the sibling path alone would nominate the chosen version of a name whose bound id is a different row's
  // (Langston item 4 C-2: two cold rows resolving to one path is not ruled out by the schema)
  for (const d of decisions) {
    if (d.kind === 'bind') out.delete(d.version.fileId);
    if (d.kind === 'needs_download') for (const v of d.candidates) out.delete(v.fileId);
  }
  for (const id of boundIds) out.delete(id);
  return [...out.values()];
}

/**
 * Pure: why a --delete-residue run must refuse — every named id that is listed but outside the computed set, bound to a
 * manifest row, or on a name whose manifest row is still UNBOUND (nothing proven to keep yet; Langston item 4 C-1 —
 * keyed on the manifest, not the plan; an orphan has no row, so it is never in `unboundPaths`). Empty = may delete.
 */
export function deleteRefusals(
  deleteIds: Set<string>,
  delSet: B2ListedVersion[],
  listing: B2ListedVersion[],
  boundIds: Set<string>,
  unboundPaths: Set<string>,
): { notInSet: string[]; bound: string[]; unproven: string[] } {
  const inSet = new Set(delSet.map((v) => v.fileId));
  const listed = new Map(listing.map((v) => [v.fileId, v]));
  return {
    notInSet: [...deleteIds].filter((id) => listed.has(id) && !inSet.has(id)),
    bound: [...deleteIds].filter((id) => boundIds.has(id)),
    unproven: [...deleteIds].filter((id) => unboundPaths.has(listed.get(id)?.fileName ?? '')),
  };
}

/** Pure: stored VERSIONS (uploads only — hide markers are not versions) outside the archive namespaces, counted by
 * first segment and labelled by owner. Reported, never touched. */
export function otherOwnerCounts(versions: B2ListedVersion[], ownPrefixes: Set<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of versions) {
    if (v.action !== 'upload') continue;
    const seg = v.fileName.split('/')[0];
    if (!ownPrefixes.has(seg)) m.set(seg, (m.get(seg) ?? 0) + 1);
  }
  return m;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const delIdx = process.argv.indexOf('--delete-residue');
  const deleteIds = delIdx >= 0 ? new Set((process.argv[delIdx + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) : null;
  if (delIdx >= 0 && process.argv.slice(delIdx + 2).some((a) => !a.startsWith('--'))) {
    throw new Error('[B75 cold-bind] --delete-residue takes ONE comma-separated list; a stray argument would be silently dropped');
  }
  if (deleteIds && apply) throw new Error('[B75 cold-bind] --apply and --delete-residue are separate runs');
  if (deleteIds && deleteIds.size === 0) throw new Error('[B75 cold-bind] --delete-residue needs the ids the report printed');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const c = await client.query(
      `SELECT value FROM module_constants WHERE module_name = 'data_lifecycle' AND constant_name = 'cold_bucket'`,
    );
    if (typeof c.rows[0]?.value !== 'string') throw new Error('[B75 cold-bind] missing data_lifecycle.cold_bucket');
    const bucket: string = c.rows[0].value;
    const limits = await loadColdLimits(client, 'B75 cold-bind');
    const all = await client.query<{ storage_uri: string; provider_file_id: string | null }>(
      `SELECT storage_uri, provider_file_id FROM data_archive_manifest WHERE tier = 'cold'`,
    );
    const boundIds = new Set(all.rows.map((r) => r.provider_file_id).filter((x): x is string => !!x));
    const claimed = new Set(all.rows.map((r) => coldPathOf(r.storage_uri)?.path).filter((x): x is string => !!x));
    const tables = await client.query<{ source_table: string }>(`SELECT DISTINCT source_table FROM data_archive_manifest`);
    const ownPrefixes = ownColdPrefixes(tables.rows.map((t) => t.source_table));
    const r = await client.query<UnboundColdRow>(
      `SELECT id, source_table, partition_label, storage_uri, bytes_compressed, checksum, created_at
         FROM data_archive_manifest WHERE tier = 'cold' AND provider_file_id IS NULL ORDER BY source_table, partition_label`,
    );
    const storage = getStorageClient();
    const listing = await storage.listColdFileVersions(bucket, '', limits.setupMs);
    console.log(`[B75 cold-bind] listed ${listing.versions.length} version(s) in ${listing.pages} page(s) of ${bucket}; ${r.rows.length} unbound cold row(s); apply=${apply}`);
    for (const [seg, n] of otherOwnerCounts(listing.versions, ownPrefixes)) {
      // an unrecognised first segment is UNKNOWN, not quietly "another owner" (Langston item 3 r2, carried for item 4:
      // a mistyped namespace must surface). Item 4 takes its delete set from orphanVersions ONLY, never from these counts.
      const kind = COLD_NON_ARCHIVE_PREFIXES.get(seg);
      const who = kind === 'ours-untracked' ? 'ours, not manifest-tracked (never an orphan)'
        : kind === 'other-owner' ? 'other owner (never touched)'
        : 'UNKNOWN prefix — not an archive table, not a known owner (never touched; investigate)';
      console.log(`[B75 cold-bind] ${who}: ${seg}/ — ${n} stored version(s)`);
    }
    for (const o of orphanVersions(listing.versions, claimed, ownPrefixes)) {
      console.log(`[B75 cold-bind] ORPHAN (no manifest row): ${o.fileName} id=${o.fileId} bytes=${o.contentLength} sha1=${o.contentSha1} uploaded=${new Date(o.uploadTimestamp).toISOString()}`);
    }
    const decisions = planColdBindings(r.rows, listing.versions);
    const delSet = residueDeleteSet(listing.versions, claimed, ownPrefixes, decisions, boundIds);
    for (const v of delSet) {
      console.log(`[B75 cold-bind] DELETE-SET ${v.fileName} id=${v.fileId} bytes=${v.contentLength} uploaded=${new Date(v.uploadTimestamp).toISOString()}`);
    }
    let failures = 0;
    for (const d of decisions) {
      const name = `${d.row.source_table}/${d.row.partition_label}`;
      if (d.kind === 'refused') { failures++; console.error(`[B75 cold-bind] ${name}: REFUSED — ${d.reason}`); continue; }
      let version: B2ListedVersion | null = d.kind === 'bind' ? d.version : null;
      const residueLine = (x: B2ListedVersion, why: string) =>
        console.log(`[B75 cold-bind] ${name}: RESIDUE (${why}) id=${x.fileId} bytes=${x.contentLength} uploaded=${new Date(x.uploadTimestamp).toISOString()}`);
      if (d.kind === 'bind') {
        for (const x of d.residue) residueLine(x, 'a duplicate or a wrong-size version, not bound');
        if (d.residue.length > 0 && d.row.created_at) {
          // Langston item 3 (a): reported, not gated — the row's write time against the chosen version's upload time
          console.log(`[B75 cold-bind] ${name}: manifest row created ${new Date(d.row.created_at).toISOString()}; chosen version uploaded ${new Date(d.version.uploadTimestamp).toISOString()}`);
        }
      } else {
        for (const x of d.wrongSize) residueLine(x, 'wrong size, not bound');
        const bytes = d.candidates.reduce((s, v) => s + Number(v.contentLength), 0);
        console.log(`[B75 cold-bind] ${name}: ${d.candidates.length} version(s) without one agreed SHA-1 — choosing by SHA-256 needs ${bytes} bytes of B2 download`);
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
        for (const x of d.candidates) if (x !== version) residueLine(x, 'lost the SHA-256 comparison, not bound');
      }
      if (!version) continue;
      const p = coldPathOf(d.row.storage_uri)!;
      console.log(`[B75 cold-bind] ${name}: bind → id=${version.fileId} sha1=${version.contentSha1} bytes=${version.contentLength}`);
      if (!apply) continue;
      const info = await storage.b2GetFileInfo(version.fileId, limits.setupMs);
      // the bucket id is the LISTING's resolved one (Langston: comparing info.bucketId to itself was a tautology)
      assertB2Version('b2_get_file_info', info, {
        action: 'upload', bucketId: listing.bucketId, fileName: p.path, sha1: version.contentSha1 ?? '', bytes: Number(d.row.bytes_compressed),
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
    if (deleteIds) {
      // item 4, after the report loop so the delete run's own output shows the plan it deletes against (C-4). With
      // apply false that loop wrote nothing and downloaded nothing.
      const byId = new Map(delSet.map((v) => [v.fileId, v]));
      // C-1: a name whose manifest row is still UNBOUND has nothing proven to keep — none of its versions may go yet.
      const unboundPaths = new Set(r.rows.map((x) => coldPathOf(x.storage_uri)?.path).filter((x): x is string => !!x));
      const { notInSet, bound, unproven } = deleteRefusals(deleteIds, delSet, listing.versions, boundIds, unboundPaths);
      if (notInSet.length > 0 || bound.length > 0 || unproven.length > 0) {
        // C-3: a refusal names everything it refused, by reason
        console.error(
          `[B75 cold-bind] REFUSED — nothing deleted. not in the computed set: [${notInSet.join(', ')}]; ` +
            `bound to a manifest row: [${bound.join(', ')}]; its name's row is not yet bound (run --apply first): [${unproven.join(', ')}]`,
        );
        process.exitCode = 1;
        return;
      }
      let deleted = 0;
      for (const id of deleteIds) {
        const v = byId.get(id);
        if (!v) { console.log(`[B75 cold-bind] ${id}: no longer listed — already gone, skipped`); continue; }
        await storage.deleteColdVersion(v.fileName, v.fileId);
        deleted++;
        console.log(`[B75 cold-bind] DELETED ${v.fileName} id=${v.fileId} bytes=${v.contentLength}`);
      }
      console.log(`[B75 cold-bind] DONE deleted=${deleted} named=${deleteIds.size}`);
      return;
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
