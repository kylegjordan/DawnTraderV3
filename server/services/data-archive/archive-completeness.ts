/**
 * B-B75-EXPORT-COMPLETENESS (#1195) — what an archive copy is known to hold, and
 * what the sweeps may do with an existing copy.
 *
 * Pure: no I/O. The sweep (`b75-retention-sweep.ts`), the context-bridge lane
 * (`context-bridge-log-ttl.ts`) and the rehydrate CLI (`b75-rehydrate.ts`) all
 * decide through these functions, so one rule governs every lane.
 *
 * `data_archive_manifest.completeness_basis` (migration
 * `2026-10-17-b-b75-export-completeness.sql`) carries one of four values:
 *   - `source-count-matched`     — an evidence row in `data_archive_exact_evidence`
 *     stores source = exported = downloaded for this label. A database trigger
 *     refuses the value without that row. The ONLY basis that counts as proven.
 *   - `gate-deployed-unrecorded` — exported under the in-snapshot count gate
 *     (`b678ef0f6`, 2026-10-16T09:45:18Z) but before this batch stored the count.
 *   - `unverified-legacy`        — exported 2026-05-06 → 2026-10-16 with no source
 *     count; rows may be missing inside each day (#1195). Kyle 2026-10-17: no recovery.
 *   - `unrecorded`               — the column default. A writer that did not stamp:
 *     a defect signal, and it fails closed everywhere.
 *
 * What `source-count-matched` does NOT mean: it proves the copy matches the table
 * as it stood at export time — not that the table held everything it should have.
 */

export const COMPLETENESS_BASES = [
  'source-count-matched',
  'gate-deployed-unrecorded',
  'unverified-legacy',
  'unrecorded',
] as const;
export type CompletenessBasis = typeof COMPLETENESS_BASES[number];

export const PROVEN_BASIS: CompletenessBasis = 'source-count-matched';

export function isProvenBasis(basis: unknown): boolean {
  return basis === PROVEN_BASIS;
}

/** The legacy (single-column text cursor, whole tie-group re-read) export contract,
 *  recorded on every evidence row the generic lanes write. CC-C's exact lane keeps
 *  `XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT` (`exact-archive-evidence.ts`). */
export const LEGACY_TS_TIEGROUP_CURSOR_CONTRACT = 'text-ts-tiegroup-v1' as const;

// ─── The existing-copy decision ──────────────────────────────────────────────

export interface ExistingCopyRow {
  state: string;
  completeness_basis: string | null;
}

export type RefuseReason =
  | 'verified-unproven'   // a re-export could only prove the rows still hot (C-6)
  | 'active-rows-present' // rows found for a label already archived and dropped/deleted
  | 'migrated-rows-present' // rows found for a label whose copy of record is cold
  | 'stale-proof';        // a non-final row already carries evidence

export type ExistingCopyDecision =
  | { kind: 'export' }
  | { kind: 'reuse' }
  | { kind: 'skip'; reason: 'already-active' | 'already-migrated' }
  | { kind: 'refuse'; reason: RefuseReason };

/**
 * Decide what to do with a label that already has (or lacks) a warm manifest row.
 * Decided BEFORE any upload, so a refusal writes nothing.
 *
 * - `evidenceExists`: an evidence row exists for this manifest row (only consulted
 *   for `pending`/`uploaded`).
 * - `rowsPresent`: a LIMIT 1 probe of the label's source range found a row (only
 *   consulted for `active`/`migrated`/`migrating`). The whole path enumerates
 *   children by name, not rows, so presence is measured, never assumed.
 *
 * `skip` is first-class: it must cause NO drop and NO manifest write, so
 * `hot_partition_dropped_at` is never re-stamped and a `migrated` row is never
 * flipped back to `active` (Langston Step-2 C-1).
 */
export function decideExistingCopy(
  row: ExistingCopyRow | null,
  evidenceExists: boolean,
  rowsPresent: boolean,
): ExistingCopyDecision {
  if (!row) return { kind: 'export' };
  switch (row.state) {
    case 'verified':
      return isProvenBasis(row.completeness_basis)
        ? { kind: 'reuse' }
        : { kind: 'refuse', reason: 'verified-unproven' };
    case 'active':
      return rowsPresent
        ? { kind: 'refuse', reason: 'active-rows-present' }
        : { kind: 'skip', reason: 'already-active' };
    case 'migrated':
    case 'migrating':
      return rowsPresent
        ? { kind: 'refuse', reason: 'migrated-rows-present' }
        : { kind: 'skip', reason: 'already-migrated' };
    case 'pending':
    case 'uploaded':
      return evidenceExists ? { kind: 'refuse', reason: 'stale-proof' } : { kind: 'export' };
    default:
      // The manifest CHECK admits exactly the six states above; anything else is a
      // schema the code does not know, and the safe answer is to touch nothing.
      throw new Error(`[B75] unknown manifest state '${row.state}' — refusing to decide`);
  }
}

/** Which inputs the decision reads for a given row, so callers query only what matters. */
export function decisionNeeds(row: ExistingCopyRow | null): { evidence: boolean; rows: boolean } {
  if (!row) return { evidence: false, rows: false };
  return {
    evidence: row.state === 'pending' || row.state === 'uploaded',
    rows: row.state === 'active' || row.state === 'migrated' || row.state === 'migrating',
  };
}

const REFUSE_TEXT: Record<RefuseReason, string> = {
  'verified-unproven':
    'an existing verified copy is NOT proven complete, and a re-export could only prove the rows still hot',
  'active-rows-present':
    'rows were found for a label already archived and dropped/deleted — they are NOT in the archived copy, and they are kept hot',
  'migrated-rows-present':
    'rows were found for a label whose copy of record is in cold storage — they are NOT in that copy, and they are kept hot',
  'stale-proof':
    'an unfinished manifest row already carries a stored proof, so a re-export would test that proof against different bytes',
};

export class NonProvenExistingCopyError extends Error {
  readonly isNonProven = true;
  constructor(readonly reason: RefuseReason, source: string, label: string) {
    super(`[B75] REFUSED ${source}/${label}: ${REFUSE_TEXT[reason]} (#1195)`);
  }
}

export function refuseText(reason: RefuseReason): string {
  return REFUSE_TEXT[reason];
}

// ─── Sweep alert classes and keys (OBJ-5) ────────────────────────────────────

export type SweepFailureClass = 'checksum' | 'count-mismatch' | 'non-proven-existing' | 'other';

/** Classes a later success clears. `non-proven-existing` is left for a human. */
export const AUTO_RESOLVED_CLASSES: readonly SweepFailureClass[] = ['checksum', 'count-mismatch', 'other'];

export function sweepFailureClass(f: {
  isChecksumMismatch?: boolean;
  isCountMismatch?: boolean;
  isNonProven?: boolean;
}): SweepFailureClass {
  if (f.isNonProven) return 'non-proven-existing';
  if (f.isChecksumMismatch) return 'checksum';
  if (f.isCountMismatch) return 'count-mismatch';
  return 'other';
}

export function partitionAlertKey(parent: string, label: string, cls: SweepFailureClass): string {
  return `b75-sweep:${parent}:${label}:${cls}`;
}

export function plainAlertKey(table: string, cls: SweepFailureClass): string {
  return `b75-plain:${table}:${cls}`;
}

export const FATAL_ALERT_KEY = 'b75-sweep:fatal';

/** The machine actor and transport the sweep resolves its own rows as. */
export const SWEEP_ALERT_ACTOR = 'b75-retention-sweep';

// ─── Rehydrate tier choice (A10, A13) ────────────────────────────────────────

export interface ManifestObjectRow {
  partition_label: string;
  tier: string;
  state: string;
  completeness_basis: string | null;
}

/** A warm row whose object the rotator deleted (`migrated`) or is deleting
 *  (`migrating`) is never a download candidate (A13: it 404s). */
export function isDownloadable(row: ManifestObjectRow): boolean {
  return !(row.tier === 'warm' && (row.state === 'migrated' || row.state === 'migrating'));
}

export interface LabelChoice<T extends ManifestObjectRow> {
  label: string;
  download: T | null; // the object to fetch; warm preferred, among downloadable rows
  all: T[];           // every tier's row for the label — listed, never silently dropped
}

export function chooseObjectsByLabel<T extends ManifestObjectRow>(rows: T[]): LabelChoice<T>[] {
  const byLabel = new Map<string, T[]>();
  for (const r of rows) {
    const list = byLabel.get(r.partition_label) ?? [];
    list.push(r);
    byLabel.set(r.partition_label, list);
  }
  return [...byLabel.keys()].sort().map((label) => {
    const all = byLabel.get(label)!;
    const usable = all.filter(isDownloadable);
    const download = usable.find((r) => r.tier === 'warm') ?? usable.find((r) => r.tier === 'cold') ?? null;
    return { label, download, all };
  });
}
