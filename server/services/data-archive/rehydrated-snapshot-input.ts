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

export const XSTOCK_SNAPSHOT_REHYDRATE_RUN_INDEX = 'xstock-snapshot-rehydrate-run/v1';
export const XSTOCK_SNAPSHOT_REHYDRATE_RUN_INDEX_FILE = 'xstock-snapshot-rehydrate-run.json';

export interface SnapshotRehydrateRunIndexLabel {
  partition_label: string;
  manifest_id: string | null;
  tier: string | null;
  result: 'downloaded' | 'mismatch' | 'skipped-cold' | 'skipped';
  output_file: string | null;
  sidecar_file: string | null;
  row_count: number;
  min_ts: string | null;
  max_ts: string | null;
}

export interface SnapshotRehydrateRunIndex {
  contract: typeof XSTOCK_SNAPSHOT_REHYDRATE_RUN_INDEX;
  table: XstockSnapshotTable;
  requested_from: string;
  requested_to_exclusive: string;
  restore_cold: boolean;
  expected_label_count: number;
  complete: boolean;
  labels: SnapshotRehydrateRunIndexLabel[];
}

export interface ProvenRehydratedSnapshot {
  files: string[];
  rows: XstockSnapshotCanonicalRow[];
  proofs: XstockSnapshotProof[];
}

function inputDirectory(inputPath: string): { directory: string; selectedFile: string | null } {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return { directory: path.dirname(inputPath), selectedFile: path.resolve(inputPath) };
  if (!stat.isDirectory()) throw new Error(`rehydrated snapshot input is neither a file nor directory: ${inputPath}`);
  return { directory: inputPath, selectedFile: null };
}

export async function loadProvenRehydratedSnapshot(
  inputPath: string,
  table: XstockSnapshotTable,
  requiredRange?: { from: Date; toExclusive: Date },
): Promise<ProvenRehydratedSnapshot> {
  const { directory, selectedFile } = inputDirectory(inputPath);
  const indexPath = path.join(directory, XSTOCK_SNAPSHOT_REHYDRATE_RUN_INDEX_FILE);
  if (!fs.existsSync(indexPath)) throw new Error(`missing rehydrate run index for ${inputPath}`);
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as SnapshotRehydrateRunIndex;
  const requestedFrom = new Date(index.requested_from);
  const requestedToExclusive = new Date(index.requested_to_exclusive);
  if (index.contract !== XSTOCK_SNAPSHOT_REHYDRATE_RUN_INDEX
      || index.table !== table
      || index.complete !== true
      || !Number.isFinite(requestedFrom.getTime())
      || !Number.isFinite(requestedToExclusive.getTime())
      || index.expected_label_count !== index.labels?.length
      || index.labels.length === 0) {
    throw new Error(`rehydrate run index is incomplete or invalid for ${table}: ${indexPath}`);
  }
  if (requiredRange && (requestedFrom.getTime() > requiredRange.from.getTime()
      || requestedToExclusive.getTime() < requiredRange.toExclusive.getTime())) {
    throw new Error(`rehydrate run index does not cover the required ${table} replay window`);
  }

  const files = index.labels.map((label) => {
    if (label.result !== 'downloaded' || !label.output_file || !label.sidecar_file
        || label.sidecar_file !== `${label.output_file}.completeness.json`) {
      throw new Error(`rehydrate run index contains an incomplete label: ${label.partition_label}`);
    }
    const file = path.resolve(directory, label.output_file);
    const sidecar = path.resolve(directory, label.sidecar_file);
    if (path.dirname(file) !== path.resolve(directory) || path.dirname(sidecar) !== path.resolve(directory)) {
      throw new Error(`rehydrate run index contains a path outside its output directory: ${label.partition_label}`);
    }
    if (!fs.existsSync(file) || !fs.existsSync(sidecar)) {
      throw new Error(`rehydrate run index object is missing: ${label.partition_label}`);
    }
    return file;
  });
  if (new Set(files).size !== files.length) throw new Error('rehydrate run index repeats an output object');
  if (selectedFile && (files.length !== 1 || files[0] !== selectedFile)) {
    throw new Error('a single snapshot file cannot stand in for the complete rehydrate run');
  }

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
