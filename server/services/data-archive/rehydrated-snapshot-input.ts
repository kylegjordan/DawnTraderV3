import fs from 'node:fs';
import path from 'node:path';
import {
  XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
  type XstockSnapshotCanonicalRow,
  type XstockSnapshotProof,
} from './xstock-snapshot-retention.js';
import { inspectGzipSnapshotJsonl } from './partition-exporter.js';
import type { XstockSnapshotTable } from '../xstock-snapshot-policy.js';

interface SnapshotCompletenessSidecar {
  table?: unknown;
  proven?: unknown;
  checksum_ok?: unknown;
  row_count?: unknown;
  snapshot_selector?: {
    cursor_contract?: unknown;
    ordered_key_sha256?: unknown;
    full_row_sha256?: unknown;
  } | null;
}

export interface ProvenRehydratedSnapshot {
  files: string[];
  rows: XstockSnapshotCanonicalRow[];
  proofs: XstockSnapshotProof[];
}

function snapshotFiles(inputPath: string, table: XstockSnapshotTable): string[] {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return [inputPath];
  if (!stat.isDirectory()) throw new Error(`rehydrated snapshot input is neither a file nor directory: ${inputPath}`);
  const prefix = `${table}_`;
  return fs.readdirSync(inputPath)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.jsonl.gz'))
    .sort()
    .map((name) => path.join(inputPath, name));
}

export async function loadProvenRehydratedSnapshot(
  inputPath: string,
  table: XstockSnapshotTable,
): Promise<ProvenRehydratedSnapshot> {
  const files = snapshotFiles(inputPath, table);
  if (files.length === 0) throw new Error(`no rehydrated ${table} snapshot objects found at ${inputPath}`);

  const rows: XstockSnapshotCanonicalRow[] = [];
  const proofs: XstockSnapshotProof[] = [];
  const keys = new Set<string>();
  for (const file of files) {
    const sidecarPath = `${file}.completeness.json`;
    if (!fs.existsSync(sidecarPath)) throw new Error(`missing completeness sidecar for ${file}`);
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as SnapshotCompletenessSidecar;
    if (sidecar.table !== table || sidecar.proven !== true || sidecar.checksum_ok !== true
      || sidecar.snapshot_selector?.cursor_contract !== XSTOCK_SNAPSHOT_CURSOR_CONTRACT) {
      throw new Error(`rehydrated snapshot is not proven for ${table}: ${file}`);
    }
    const objectRows: XstockSnapshotCanonicalRow[] = [];
    const proof = await inspectGzipSnapshotJsonl(file, (row) => { objectRows.push(row); });
    if (sidecar.row_count !== proof.sourceRowCount
      || sidecar.snapshot_selector.ordered_key_sha256 !== proof.orderedKeySha256
      || sidecar.snapshot_selector.full_row_sha256 !== proof.fullRowSha256) {
      throw new Error(`rehydrated snapshot proof does not match its sidecar: ${file}`);
    }
    for (const row of objectRows) {
      const key = `${row.symbol}\0${row.bucket_ts}`;
      if (keys.has(key)) throw new Error(`duplicate rehydrated snapshot key: ${row.symbol}/${row.bucket_ts}`);
      keys.add(key);
      rows.push(row);
    }
    proofs.push(proof);
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.bucket_ts.localeCompare(b.bucket_ts));
  return { files, rows, proofs };
}
