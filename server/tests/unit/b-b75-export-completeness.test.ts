/**
 * B-B75-EXPORT-COMPLETENESS (#1195) — the completeness register, the one existing-copy
 * decision, the alert keys, the rehydrate tier choice, the generalised evidence writer,
 * and the wiring of each into the four archive scripts and two migrations.
 *
 * The pure rules are tested by behaviour. The scripts run `main()` at import, so their
 * wiring is tested by structure (order and presence at the source), as
 * b-trade-tier-register.test.ts and b-xstock-bar-availability-observation.test.ts do.
 * The live behaviour is observed at Step 7 on the first nightly sweep.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {
  ArchiveReadbackMismatchError,
  AUTO_RESOLVED_CLASSES,
  chooseObjectsByLabel,
  COMPLETENESS_BASES,
  decideExistingCopy,
  decisionNeeds,
  FATAL_ALERT_KEY,
  isDownloadable,
  isProvenBasis,
  NonProvenExistingCopyError,
  partitionAlertKey,
  plainAlertKey,
  sweepFailureClass,
} from '../../services/data-archive/archive-completeness.js';
import {
  assertExactArchiveEquality,
  proofCountStillMatches,
  recordExactArchiveEvidence,
  XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT,
} from '../../services/data-archive/exact-archive-evidence.js';
import { countGzipJsonlLines } from '../../services/data-archive/partition-exporter.js';

const ROOT = process.cwd();
const SRC = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const SWEEP = SRC('server/scripts/b75-retention-sweep.ts');
const CTX = SRC('server/scripts/context-bridge-log-ttl.ts');
const ROTATOR = SRC('server/scripts/b75-cold-rotator.ts');
const REHYDRATE = SRC('server/scripts/b75-rehydrate.ts');
const PERPFEED = SRC('server/scripts/perpfeed-gate-test.ts');
const ALERTS = SRC('server/services/system-alerts.ts');
const MIG = SRC('drizzle/migrations/2026-10-17-b-b75-export-completeness.sql');
const MIG_RB = SRC('drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql');
const MIG_1015 = SRC('drizzle/migrations/2026-10-15-b-xstock-bar-availability-observation.sql');
const MIG_1015_RB = SRC('drizzle/migrations/2026-10-15-b-xstock-bar-availability-observation-rollback.sql');

/** The body of one top-level function in a script, from its signature to the next top-level declaration. */
function fnBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start, `signature not found: ${signature}`).toBeGreaterThan(-1);
  const rest = src.slice(start + signature.length);
  const next = rest.search(/\n(async )?function |\ninterface |\ntype |\nclass |\nconst [A-Z_]+ =|\nmain\(\)/);
  return src.slice(start, next === -1 ? undefined : start + signature.length + next);
}

describe('the existing-copy decision (P3.2, one row per state)', () => {
  const row = (state: string, basis: string | null = 'unverified-legacy') => ({ state, completeness_basis: basis });

  it('no row exports', () => {
    expect(decideExistingCopy(null, false, true)).toEqual({ kind: 'export' });
  });
  it('verified + proven reuses (the legitimate mid-run resume)', () => {
    expect(decideExistingCopy(row('verified', 'source-count-matched'), false, true)).toEqual({ kind: 'reuse' });
  });
  it.each(['unverified-legacy', 'gate-deployed-unrecorded', 'unrecorded', null])(
    'verified + %s refuses (C-6: a re-export could only prove leftover rows)',
    (basis) => {
      expect(decideExistingCopy(row('verified', basis), false, true))
        .toEqual({ kind: 'refuse', reason: 'verified-unproven' });
    },
  );
  it.each(['source-count-matched', 'unverified-legacy'])(
    'active + %s WITH rows refuses — even when proven (Langston r3)',
    (basis) => {
      expect(decideExistingCopy(row('active', basis), false, true))
        .toEqual({ kind: 'refuse', reason: 'active-rows-present' });
    },
  );
  it('active with NO rows skips (an empty past child — the deleted :703 short-circuit\'s case, Langston r4)', () => {
    expect(decideExistingCopy(row('active', 'unverified-legacy'), false, false))
      .toEqual({ kind: 'skip', reason: 'already-active' });
  });
  it.each(['migrated', 'migrating'])('%s WITH rows refuses; with no rows skips', (state) => {
    expect(decideExistingCopy(row(state), false, true)).toEqual({ kind: 'refuse', reason: 'migrated-rows-present' });
    expect(decideExistingCopy(row(state), false, false)).toEqual({ kind: 'skip', reason: 'already-migrated' });
  });
  it.each(['pending', 'uploaded'])('%s exports with no evidence, refuses with evidence (stale proof)', (state) => {
    expect(decideExistingCopy(row(state), false, false)).toEqual({ kind: 'export' });
    expect(decideExistingCopy(row(state), true, false)).toEqual({ kind: 'refuse', reason: 'stale-proof' });
  });
  it('an unknown state throws rather than guessing', () => {
    expect(() => decideExistingCopy(row('weird'), false, false)).toThrow(/unknown manifest state/);
  });
  it('rowsPresent is the discriminator for the empty-child case (the probe, forced true, must page)', () => {
    // Mutation-proof of the probe's role: the same row with rowsPresent forced true refuses.
    const empty = decideExistingCopy(row('active'), false, false);
    const forced = decideExistingCopy(row('active'), false, true);
    expect(empty.kind).toBe('skip');
    expect(forced.kind).toBe('refuse');
  });
  it('decisionNeeds reads evidence only for pending/uploaded and rows only for active/migrated/migrating', () => {
    expect(decisionNeeds(null)).toEqual({ evidence: false, rows: false });
    expect(decisionNeeds(row('verified'))).toEqual({ evidence: false, rows: false });
    expect(decisionNeeds(row('pending'))).toEqual({ evidence: true, rows: false });
    expect(decisionNeeds(row('uploaded'))).toEqual({ evidence: true, rows: false });
    for (const s of ['active', 'migrated', 'migrating']) expect(decisionNeeds(row(s))).toEqual({ evidence: false, rows: true });
  });
  it('the refusal error carries isNonProven and a measured, permanent message', () => {
    const e = new NonProvenExistingCopyError('active-rows-present', 'crypto_perp_ohlc_1m', '2026-09-16');
    expect(e.isNonProven).toBe(true);
    expect(e.message).toMatch(/REFUSED crypto_perp_ohlc_1m\/2026-09-16/);
    expect(e.message).toMatch(/NOT in the archived copy/);
  });
  it('only source-count-matched is proven', () => {
    expect(COMPLETENESS_BASES.filter(isProvenBasis)).toEqual(['source-count-matched']);
  });
});

describe('sweep alert classes and keys (OBJ-5)', () => {
  it('four classes; a refusal never falls into "other"', () => {
    expect(sweepFailureClass({ isNonProven: true, isChecksumMismatch: true })).toBe('non-proven-existing');
    expect(sweepFailureClass({ isChecksumMismatch: true })).toBe('checksum');
    expect(sweepFailureClass({ isCountMismatch: true })).toBe('count-mismatch');
    expect(sweepFailureClass({})).toBe('other');
  });
  it('keys separate parent, label and class (the positive control: a different one mints a new row)', () => {
    const a = partitionAlertKey('crypto_perp_ohlc_1m', '2026-09-16', 'count-mismatch');
    expect(a).toBe('b75-sweep:crypto_perp_ohlc_1m:2026-09-16:count-mismatch');
    expect(partitionAlertKey('crypto_perp_ohlc_1m', '2026-09-17', 'count-mismatch')).not.toBe(a);
    expect(partitionAlertKey('crypto_perp_ticker_snap', '2026-09-16', 'count-mismatch')).not.toBe(a);
    expect(partitionAlertKey('crypto_perp_ohlc_1m', '2026-09-16', 'checksum')).not.toBe(a);
    expect(plainAlertKey('closed_trades', 'other')).toBe('b75-plain:closed_trades:other');
    expect(FATAL_ALERT_KEY).toBe('b75-sweep:fatal');
  });
  it('a later success auto-resolves every class except non-proven-existing (that one needs a human)', () => {
    expect([...AUTO_RESOLVED_CLASSES].sort()).toEqual(['checksum', 'count-mismatch', 'other']);
  });
});

describe('the rehydrate tier choice (A10, A13)', () => {
  const r = (label: string, tier: string, state: string, basis = 'unverified-legacy') =>
    ({ partition_label: label, tier, state, completeness_basis: basis });

  it('A13: a migrated or migrating warm row is never downloaded; the label falls to cold', () => {
    expect(isDownloadable(r('2026-02', 'warm', 'migrated'))).toBe(false);
    expect(isDownloadable(r('2026-02', 'warm', 'migrating'))).toBe(false);
    const [choice] = chooseObjectsByLabel([r('2026-02', 'warm', 'migrated'), r('2026-02', 'cold', 'active')]);
    expect(choice.download?.tier).toBe('cold');
    expect(choice.all).toHaveLength(2); // both listed, never silently one
  });
  it('a live warm row is preferred over cold, and both are listed', () => {
    const [choice] = chooseObjectsByLabel([r('2026-03', 'cold', 'active'), r('2026-03', 'warm', 'active')]);
    expect(choice.download?.tier).toBe('warm');
    expect(choice.all).toHaveLength(2);
  });
  it('a label with only a rotated-away warm row has nothing to download', () => {
    const [choice] = chooseObjectsByLabel([r('2026-01', 'warm', 'migrated')]);
    expect(choice.download).toBeNull();
  });
});

describe('the readback leg is typed (gate B BLOCKER-1)', () => {
  it('assertExactArchiveEquality throws ArchiveReadbackMismatchError, classed count-mismatch', () => {
    let caught: unknown;
    try { assertExactArchiveEquality({ sourceRowCount: 10, exportedRowCount: 10, downloadedRowCount: 9 }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ArchiveReadbackMismatchError);
    expect(sweepFailureClass({ isCountMismatch: (caught as ArchiveReadbackMismatchError).isCountMismatch })).toBe('count-mismatch');
  });
  it('an unterminated final row in the downloaded object is ArchiveReadbackMismatchError, not a plain Error', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b75-readback-'));
    const file = path.join(dir, 'x.jsonl.gz');
    fs.writeFileSync(file, zlib.gzipSync(Buffer.from('{"a":1}\n{"a":2}')));
    try {
      await expect(countGzipJsonlLines(file)).rejects.toBeInstanceOf(ArchiveReadbackMismatchError);
      fs.writeFileSync(file, zlib.gzipSync(Buffer.from('{"a":1}\n{"a":2}\n')));
      await expect(countGzipJsonlLines(file)).resolves.toBe(2); // the positive control
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the reuse recount (gate B residual, folded)', () => {
  const fake = (proof: string | null, now: string) => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    return {
      calls,
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('FROM data_archive_exact_evidence')) return { rows: proof === null ? [] : [{ n: proof }] };
        return { rows: [{ n: now }] };
      },
    };
  };
  const src = { target: '"t"', tsCol: '"ts"', rangeStart: new Date('2026-09-16T00:00:00Z'), rangeEnd: new Date('2026-09-17T00:00:00Z'), extraPredicate: 'closed = true' };
  it('the same count as the proof → true (reuse allowed)', async () => {
    expect(await proofCountStillMatches(fake('264960', '264960'), 'm', src)).toBe(true);
  });
  it('a different count → false (the reuse is refused)', async () => {
    expect(await proofCountStillMatches(fake('264960', '264961'), 'm', src)).toBe(false);
    expect(await proofCountStillMatches(fake('264960', '240000'), 'm', src)).toBe(false);
  });
  it('no stored proof → false', async () => {
    expect(await proofCountStillMatches(fake(null, '0'), 'm', src)).toBe(false);
  });
  it('counts the population the exporter counted: the range and the extra predicate', async () => {
    const c = fake('1', '1');
    await proofCountStillMatches(c, 'm', src);
    expect(c.calls[1].sql).toContain('WHERE "ts" >= $1 AND "ts" < $2 AND (closed = true)');
    expect(c.calls[1].params).toEqual([src.rangeStart, src.rangeEnd]);
  });
});

describe('the generalised evidence writer (Langston Step-1 condition 1, JC-4)', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    source_table: 'crypto_perp_ohlc_1m', partition_label: '2026-09-17', tier: 'warm',
    source_row_count: '264960', exported_row_count: '264960', downloaded_row_count: '264960',
    cursor_contract: 'text-ts-tiegroup-v1', producing_build_sha: 'a'.repeat(40), object_checksum: 'ck',
    ...over,
  });
  const input = {
    manifestId: '00000000-0000-4000-8000-000000000001',
    sourceTable: 'crypto_perp_ohlc_1m', partitionLabel: '2026-09-17', tier: 'warm' as const,
    cursorContract: 'text-ts-tiegroup-v1', sourceRowCount: 264960, exportedRowCount: 264960,
    downloadedRowCount: 264960, objectChecksum: 'ck', producingBuildSha: 'a'.repeat(40),
  };
  const client = (row: Record<string, unknown>) => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    return {
      calls,
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return sql.trim().startsWith('SELECT') ? { rows: [row] } : { rows: [] };
      },
    };
  };

  it('a non-xStock object\'s evidence carries ITS OWN source_table, tier and contract (no literals)', async () => {
    const c = client(stored());
    await recordExactArchiveEvidence(c, input);
    const insert = c.calls[0];
    expect(insert.sql).toContain('INSERT INTO data_archive_exact_evidence');
    expect(insert.params?.slice(1, 4)).toEqual(['crypto_perp_ohlc_1m', '2026-09-17', 'warm']);
    expect(insert.params?.[7]).toBe('text-ts-tiegroup-v1');
  });
  it('the 413-fallback case: a cold export records tier cold', async () => {
    const c = client(stored({ tier: 'cold' }));
    await recordExactArchiveEvidence(c, { ...input, tier: 'cold' });
    expect(c.calls[0].params?.[3]).toBe('cold');
  });
  it('first-write-wins (CC-C): a replay from another build keeps the stored sha, logs both, does not refuse', async () => {
    const logs: string[] = [];
    const c = client(stored({ producing_build_sha: 'b'.repeat(40) }));
    await expect(recordExactArchiveEvidence(c, input, (m) => logs.push(m))).resolves.toBeUndefined();
    expect(logs.join('\n')).toMatch(/BUILD-SHA MISMATCH/);
    expect(logs.join('\n')).toContain('b'.repeat(40));
    expect(logs.join('\n')).toContain('a'.repeat(40));
    // The writer never UPDATEs: one insert (ON CONFLICT DO NOTHING) and one read.
    expect(c.calls.filter((x) => /^\s*UPDATE/i.test(x.sql))).toHaveLength(0);
  });
  it('a replay whose counts or checksum differ still refuses', async () => {
    await expect(recordExactArchiveEvidence(client(stored({ source_row_count: '240000' })), input))
      .rejects.toThrow(/does not match original proof/);
    await expect(recordExactArchiveEvidence(client(stored({ object_checksum: 'other' })), input))
      .rejects.toThrow(/does not match original proof/);
  });
  it('CC-C\'s exact lane passes its own contract unchanged', async () => {
    const c = client(stored({ source_table: 'xstock_bar_revision_event', cursor_contract: XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT }));
    await recordExactArchiveEvidence(c, { ...input, sourceTable: 'xstock_bar_revision_event', cursorContract: XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT });
    expect(c.calls[0].params?.[7]).toBe(XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT);
  });
});

describe('sweep wiring (structure at the source)', () => {
  const archive = fnBody(SWEEP, 'async function archiveOneObject(');
  const process_ = fnBody(SWEEP, 'async function processPartition(');
  const plain = fnBody(SWEEP, 'async function sweepPlainTables(');

  it('the decision is taken BEFORE the pending upsert and the upload', () => {
    const d = archive.indexOf('decideExistingCopy(');
    expect(d).toBeGreaterThan(0);
    expect(archive.indexOf('upsertManifestPending(')).toBeGreaterThan(d);
    expect(archive.indexOf('uploadWarmFile(')).toBeGreaterThan(d);
    expect(archive).toContain('throw new NonProvenExistingCopyError(');
    expect(archive).toContain('labelRowsPresent(');
    expect(archive).toContain('evidenceExistsForManifest(');
  });
  it('every export writes evidence with the export\'s own source table (no xStock literal)', () => {
    expect(SWEEP).not.toContain("sourceTable: 'xstock_bar_revision_event'");
    expect(archive).toContain('sourceTable: spec.parent');
    expect(archive).not.toMatch(/if \(spec\.exactCursorTieBreakerColumn\) \{\s*const downloadedLineCount/);
  });
  it('R-1: evidence, then the basis stamp, then verified — inside one BEGIN/COMMIT', () => {
    const b = archive.indexOf("query('BEGIN')");
    const ev = archive.indexOf('recordExactArchiveEvidence(', b);
    const stamp = archive.indexOf('SET completeness_basis = $2', ev);
    const ver = archive.indexOf('updateManifestVerified(', stamp);
    const c = archive.indexOf("query('COMMIT')", ver);
    expect([b, ev, stamp, ver, c].every((x) => x > 0)).toBe(true);
    expect(b < ev && ev < stamp && stamp < ver && ver < c).toBe(true);
  });
  it('R-1 binds the CONNECTION: BEGIN, every write and COMMIT are on ctlClient (gate C, C-2)', () => {
    // A BEGIN on exportClient would leave the three writes auto-committing with the ordering test green.
    expect(archive).toMatch(
      /ctlClient\.query\('BEGIN'\)[\s\S]*recordExactArchiveEvidence\(ctlClient[\s\S]*ctlClient\.query\([\s\S]*SET completeness_basis = \$2[\s\S]*updateManifestVerified\(ctlClient[\s\S]*ctlClient\.query\('COMMIT'\)/,
    );
    expect(archive).not.toMatch(/exportClient\.query\('BEGIN'\)/);
  });
  it('the whole path: the already-active short-circuit is gone; a skip returns BEFORE dropAndMarkActive', () => {
    expect(process_).not.toMatch(/existing\.state === 'active'/);
    const whole = process_.slice(process_.indexOf("if (mode === 'whole')"), process_.indexOf('SLICED PATH'));
    const skip = whole.indexOf("outcome.kind === 'skipped'");
    const drop = whole.indexOf('dropAndMarkActive(');
    expect(skip).toBeGreaterThan(0);
    expect(drop).toBeGreaterThan(skip);
    expect(whole.slice(skip, drop)).toMatch(/return \{\s*status: 'skipped'/);
  });
  it('gates (a) and (b) require a proven basis, not only a state', () => {
    expect(process_).toMatch(/\(r\.state === 'verified' \|\| r\.state === 'active'\) && isProvenBasis\(r\.completeness_basis\)/);
    expect(plain).toMatch(/\(r\.state === 'verified' \|\| r\.state === 'active'\) && isProvenBasis\(r\.completeness_basis\)/);
    expect(plain).toContain('DELETE REFUSED this run');
    expect(plain).not.toContain('DELETE SKIPPED this run');
  });
  it('A14: the plain lane marks its archived labels active AFTER the delete loop', () => {
    const del = plain.indexOf('DELETE FROM ${spec.table}');
    const mark = plain.indexOf('markLabelsActive(ctl, spec.table, archivedLabels)');
    expect(del).toBeGreaterThan(0);
    expect(mark).toBeGreaterThan(del);
    expect(plain.indexOf('let archivedLabels')).toBeLessThan(plain.indexOf('if (spec.archive)'));
  });
  it('every raiseSweepAlert call carries a dedupe key, and each has a resolve edge', () => {
    const calls = SWEEP.match(/await raiseSweepAlert\(/g) ?? [];
    expect(calls).toHaveLength(3);
    expect(SWEEP).toContain('partitionAlertKey(spec.parent, partition.partitionLabel, cls),');
    expect(SWEEP).toContain('plainAlertKey(spec.table, cls),');
    expect(SWEEP).toMatch(/\{ fatal: true \},\s*FATAL_ALERT_KEY,/);
    expect(SWEEP).toContain("AUTO_RESOLVED_CLASSES.map((cls) => partitionAlertKey(spec.parent, partition.partitionLabel, cls))");
    expect(SWEEP).toContain('AUTO_RESOLVED_CLASSES.map((cls) => plainAlertKey(spec.table, cls))');
    expect(SWEEP).toContain('await resolveSweepAlerts([FATAL_ALERT_KEY]');
    expect(SWEEP).toContain("'timer-script'");
  });
  it('no failure is promised to be transient; the old promise is gone (gate B BLOCKER-1)', () => {
    expect(SWEEP).not.toMatch(/Likely transient/);
    expect(SWEEP).toContain('UNCLASSIFIED failure — not known to be transient');
    expect(SWEEP).not.toContain('until B-B75-EXPORT-COMPLETENESS lands');
    expect(SWEEP).not.toContain('(data is safe; retried next run). Reason');
  });
  it('both catches class a readback mismatch as count-mismatch (gate B BLOCKER-1)', () => {
    expect(SWEEP.match(/err instanceof ExportRowCountMismatchError \|\| err instanceof ArchiveReadbackMismatchError/g)).toHaveLength(2);
  });
  it('the plain lane day-floors the cutoff for archive tables, so archived and deleted rows match (gate B BLOCKER-2)', () => {
    expect(plain).toMatch(/const cutoff = spec\.archive\s*\? new Date\(Date\.UTC\(rawCutoff\.getUTCFullYear\(\), rawCutoff\.getUTCMonth\(\), rawCutoff\.getUTCDate\(\)\)\)\s*: rawCutoff;/);
    // every later read of the window uses that one cutoff
    expect(plain).not.toMatch(/rawCutoff\]/);
    expect(plain).toContain('WHERE ${spec.timestampColumn} < $1${extraAnd}');
  });
  it('the plain-lane log prints the full cutoff and names its policy (Step 8 record item 2)', () => {
    expect(plain).toContain("${cutoff.toISOString()} (retentionDays=${retentionDays}${spec.archive ? ', day-floored archive lane' : ', exact cutoff'})");
    expect(plain).not.toContain('cutoff.toISOString().slice(0, 10)');
  });
  it('the plain lane treats a skipped present day as an invariant violation, like the sliced path', () => {
    expect(plain).toMatch(/if \(outcome\.kind === 'skipped'\) \{\s*throw new Error\(/);
  });
  it('a reuse is recounted against the proof before it may authorise a drop (gate B residual, folded)', () => {
    const reuse = archive.slice(archive.indexOf("if (decision.kind === 'reuse')"));
    const recount = reuse.indexOf('proofCountStillMatches(');
    const ret = reuse.indexOf("return { kind: 'reused'");
    expect(recount).toBeGreaterThan(0);
    expect(ret).toBeGreaterThan(recount);
    expect(reuse.slice(recount, ret)).toContain("throw new NonProvenExistingCopyError('reuse-count-changed'");
  });
});

describe('the other lanes and readers', () => {
  it('ctx lane: the one decision replaces the active short-circuit; evidence uses the actual tier', () => {
    expect(CTX).not.toMatch(/existing && existing\.state === 'active'\) \{/);
    expect(CTX).toContain('decideExistingCopy(existing, evidenceExists, rowsPresent)');
    expect(CTX).toContain('tier: actualTier,');
    const b = CTX.indexOf("query('BEGIN')");
    expect(CTX.indexOf('recordExactArchiveEvidence(', b)).toBeGreaterThan(b);
    expect(CTX.indexOf('completeness_basis = $7', b)).toBeGreaterThan(CTX.indexOf('recordExactArchiveEvidence(', b));
    // gate C, C-2 (r2): the transaction is on ctlClient throughout — sliced to the one lane
    // function, and the verified UPDATE is IN the chain, so moving it to exportClient fails.
    const lane = fnBody(CTX, 'async function exportAndUploadMonth(');
    expect(lane.match(/query\('BEGIN'\)/g)).toHaveLength(1);
    expect(lane.match(/query\('COMMIT'\)/g)).toHaveLength(1);
    expect(lane).toMatch(
      /ctlClient\.query\('BEGIN'\)[\s\S]*recordExactArchiveEvidence\(ctlClient[\s\S]*ctlClient\.query\(\s*`UPDATE data_archive_manifest\s*SET state = 'verified'[\s\S]*completeness_basis = \$7[\s\S]*ctlClient\.query\('COMMIT'\)/,
    );
    expect(lane).not.toMatch(/exportClient\.query\(/);
    // gate C, C-3: the verified UPDATE writes the tier the object actually landed in
    expect(CTX).toMatch(/completeness_basis = \$7,\s*tier = \$8/);
    expect(CTX).toMatch(/PROVEN_BASIS,\s*actualTier,/);
  });
  it('rotator: the basis is carried in the INSERT list and the ON CONFLICT update (Langston r3)', () => {
    expect(ROTATOR).toMatch(/verified_at, completeness_basis\s*\)\s*SELECT/);
    expect(ROTATOR).toMatch(/NOW\(\), completeness_basis\s*FROM data_archive_manifest/);
    expect(ROTATOR).toContain('completeness_basis = EXCLUDED.completeness_basis');
  });
  it('rehydrate: chooses by label among downloadable rows, labels unproven counts, writes a sidecar', () => {
    expect(REHYDRATE).toContain('chooseObjectsByLabel(rows)');
    expect(REHYDRATE).not.toContain('warmByLabel');
    expect(REHYDRATE).toContain("'rows(unproven)'");
    expect(REHYDRATE).toContain('.completeness.json');
    expect(REHYDRATE).toContain('rows_proven=');
  });
  it('rehydrate: BIGINT counts are numbers before any total (Step 7 find: "0" + "29069" printed 029069)', () => {
    const q = fnBody(REHYDRATE, 'async function queryManifest(');
    expect(q).toMatch(/row_count: Number\(row\.row_count\)/);
    expect(q).toMatch(/bytes_compressed: Number\(row\.bytes_compressed\)/);
    expect(q).not.toMatch(/return r\.rows;/);
  });
  it('rehydrate: a checksum mismatch rides the sidecar and the aggregate, and fails the run (gate C, C-1)', () => {
    expect(REHYDRATE).toContain('checksum_ok: checksumOk,');
    // the mismatch branch comes FIRST, so a corrupt proven object never reaches rows_proven
    const bucket = REHYDRATE.indexOf('if (!checksumOk) {');
    const provenAdd = REHYDRATE.indexOf('provenRows += download.row_count');
    expect(bucket).toBeGreaterThan(0);
    expect(provenAdd).toBeGreaterThan(bucket);
    expect(REHYDRATE.slice(bucket, provenAdd)).toMatch(/mismatchRows \+= download\.row_count;[\s\S]*\} else if \(proven\) \{/);
    expect(REHYDRATE).toContain('rows_checksum_mismatch=');
    expect(REHYDRATE).toContain('if (mismatched.length > 0) process.exit(2);');
    // the rider: a mismatched file is renamed out of the <table>_*.jsonl.gz glob
    expect(REHYDRATE).toMatch(/if \(!checksumOk\) \{\s*outPath = `\$\{localPath\}\.CORRUPT`;\s*fs\.renameSync\(localPath, outPath\);/);
    expect(REHYDRATE).toContain('`${outPath}.completeness.json`');
    expect(REHYDRATE).toContain('fs.rmSync(`${localPath}.completeness.json`, { force: true });');
  });
  it('perpfeed --clean deletes the manifest rows BEFORE dropping, and stops if refused', () => {
    const clean = PERPFEED.slice(PERPFEED.indexOf("if (mode === 'clean')"));
    const del = clean.indexOf('DELETE FROM data_archive_manifest');
    const drop = clean.indexOf('DROP TABLE IF EXISTS ${CHILD}');
    expect(del).toBeGreaterThan(0);
    expect(drop).toBeGreaterThan(del);
    expect(clean.slice(del, drop)).toContain('process.exit(1)');
  });
  it('system-alerts: timer-script added, the three dead transport values removed; the sweep is a machine actor', () => {
    expect(ALERTS).toContain("export type ResolveTransport = 'cli' | 'engine' | 'timer-script';");
    // every value left has a caller; none of the removed three is passed anywhere (gate C record iii)
    for (const dead of ['governance-checker', 'dispatcher', 'api']) {
      expect(ALERTS).not.toMatch(new RegExp(`ResolveTransport = [^;]*'${dead}'`));
    }
    expect(ALERTS).toMatch(/\{ value: 'b75-retention-sweep',\s+tag: 'machine'/);
  });
});

describe('the migrations', () => {
  it('the column: four values, fail-closed default, backfill by the deploy boundary', () => {
    expect(MIG).toContain("ADD COLUMN IF NOT EXISTS completeness_basis TEXT NOT NULL DEFAULT 'unrecorded'");
    for (const v of COMPLETENESS_BASES) expect(MIG).toContain(`'${v}'`);
    expect(MIG).toContain("created_at < '2026-10-16T09:45:18Z'");
    expect(MIG).toContain("created_at >= '2026-10-16T09:45:18Z'");
  });
  it('the tie trigger keys on (source_table, partition_label) only — not manifest_id, not tier', () => {
    const fn = MIG.slice(MIG.indexOf('CREATE OR REPLACE FUNCTION data_archive_manifest_basis_requires_evidence'), MIG.indexOf('END $$;'));
    expect(fn).toContain('e.source_table = NEW.source_table');
    expect(fn).toContain('e.partition_label = NEW.partition_label');
    expect(fn).not.toMatch(/manifest_id|e\.tier/);
    expect(MIG).toContain('BEFORE INSERT OR UPDATE ON data_archive_manifest'); // every update, not only the basis column
    expect(MIG).not.toContain('UPDATE OF completeness_basis');
    expect(MIG).not.toMatch(/CONSTRAINT TRIGGER|DEFERRABLE INITIALLY|INITIALLY DEFERRED/i); // a plain BEFORE trigger
    expect(MIG).toContain('ORDERING INVARIANT');
  });
  it('the rename moves every constraint and both triggers; the pins are dropped', () => {
    expect(MIG).toContain('RENAME TO data_archive_exact_evidence;');
    expect(MIG.match(/RENAME CONSTRAINT xstock_bar_archive_exact_evid/g)).toHaveLength(10);
    expect(MIG.match(/ALTER TRIGGER trg_guard_xstock_bar_archive_exact_evidence_/g)).toHaveLength(2);
    // IF EXISTS on all three: the forward file must re-apply after the rollback's foreign-rows path (Langston gate A).
    expect(MIG).toContain('DROP CONSTRAINT IF EXISTS xstock_bar_archive_exact_evidence_source_table_check');
    expect(MIG).toContain('DROP CONSTRAINT IF EXISTS xstock_bar_archive_exact_evidence_tier_check');
    expect(MIG).toContain('DROP CONSTRAINT IF EXISTS xstock_bar_archive_exact_evidence_cursor_contract_check');
    expect(MIG).not.toMatch(/DROP CONSTRAINT xstock_bar_archive/);
  });
  it('the rollback restores the pins only when no row violates them, and keeps every row', () => {
    expect(MIG_RB).toMatch(/IF foreign_rows = 0 THEN[\s\S]*source_table_check[\s\S]*ELSE[\s\S]*RAISE NOTICE/);
    expect(MIG_RB).not.toMatch(/DELETE FROM data_archive_exact_evidence|DROP TABLE/i);
    expect(MIG_RB).toContain('run this BEFORE 2026-10-15-b-xstock-bar-availability-observation-rollback.sql');
  });
  it('the 10-15 replay guard: three guarded blocks, and the observation test strings survive', () => {
    expect(MIG_1015.match(/IF to_regclass\('data_archive_exact_evidence'\) IS NULL THEN/g)).toHaveLength(3);
    expect(MIG_1015).toContain('CREATE TABLE IF NOT EXISTS xstock_bar_archive_exact_evidence');
    expect(MIG_1015).toContain('BEFORE TRUNCATE ON xstock_bar_archive_exact_evidence');
    expect(MIG_1015_RB).toMatch(/ELSIF to_regclass\('data_archive_exact_evidence'\) IS NOT NULL THEN/);
  });
  it('registered in MANIFEST.txt; the rollback is tracked but not listed', () => {
    const manifest = SRC('drizzle/migrations/MANIFEST.txt');
    expect(manifest).toContain('2026-10-17-b-b75-export-completeness.sql');
    expect(manifest).not.toContain('2026-10-17-b-b75-export-completeness-rollback.sql');
  });
});
