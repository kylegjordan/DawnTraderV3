import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
  XSTOCK_SNAPSHOT_EXPECTED_COLUMNS,
  XSTOCK_SNAPSHOT_SELECTOR_CONTRACT,
  appendSnapshotKey,
  assertCanonicalSnapshotObject,
  assertSnapshotSchemaColumns,
  frozenSnapshotCutoff,
  snapshotDayLabel,
  snapshotEligibleDaysSql,
  snapshotLockedDeleteParams,
  snapshotLockedDeleteSql,
  snapshotPopulationSql,
  snapshotProvenKeyAbsenceSql,
  type XstockSnapshotCanonicalRow,
  type XstockSnapshotSelector,
} from '../../services/data-archive/xstock-snapshot-retention.js';
import {
  inspectGzipSnapshotJsonl,
  loadSnapshotProvenKeys,
} from '../../services/data-archive/partition-exporter.js';
import { recordExactArchiveEvidence } from '../../services/data-archive/exact-archive-evidence.js';
import {
  rehydrateChosenObject,
  type RehydrateArgs,
  type RehydrateManifestRow,
} from '../../scripts/b75-rehydrate.js';
import {
  deleteSnapshotProvenObject,
  parseRetentionSweepArgs,
  storedSnapshotEvidenceMatches,
  sweepSnapshotTable,
  type B75SweepConfig,
} from '../../scripts/b75-retention-sweep.js';
import {
  XSTOCK_SNAPSHOT_MUTATION_KEY,
  XSTOCK_SNAPSHOT_POLICIES,
  assertSnapshotFloorCoversLiveCap,
  parseXstockSnapshotLifecycleConfig,
} from '../../services/xstock-snapshot-policy.js';
import { loadProvenRehydratedSnapshot } from '../../services/data-archive/rehydrated-snapshot-input.js';
import { assertPrewarmRowsWithinCap } from '../../../scripts/b-new-34b-prewarm-snapshot.js';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function selector(overrides: Partial<XstockSnapshotSelector> = {}): XstockSnapshotSelector {
  return {
    table: 'xstock_spot_ohlc_15m_snapshot',
    keepFloorRows: 240,
    cutoffAt: new Date('2026-10-12T00:00:00.000Z'),
    rankingObservedAt: new Date('2026-11-11T11:30:51.962Z'),
    dayStart: new Date('2026-10-01T00:00:00.000Z'),
    dayEnd: new Date('2026-10-02T00:00:00.000Z'),
    ...overrides,
  };
}

function canonicalRow(overrides: Partial<XstockSnapshotCanonicalRow> = {}): XstockSnapshotCanonicalRow {
  return {
    symbol: 'CORZ/USD',
    bucket_ts: '2026-10-01T12:34:56.123456Z',
    open: 10.1,
    high: 10.4,
    low: 9.9,
    close: 10.2,
    volume: 123.45,
    source_bar_count: 15,
    captured_at: '2026-10-01T12:35:00.654321Z',
    aggregate_revision_id: null,
    aggregate_hash: null,
    source_revision_set_hash: null,
    source_max_visible_by: null,
    source_max_visible_seq: null,
    read_observed_at: null,
    read_observed_seq: null,
    certificate_primary_identity: null,
    availability_contract_version: null,
    eligibility_state: null,
    ...overrides,
  };
}

function gzipRows(rows: unknown[], terminate = true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xstock-snapshot-proof-'));
  tempDirs.push(dir);
  const file = path.join(dir, 'object.jsonl.gz');
  const text = rows.map((row) => JSON.stringify(row)).join('\n') + (terminate ? '\n' : '');
  fs.writeFileSync(file, zlib.gzipSync(Buffer.from(text, 'utf8')));
  return file;
}

describe('B-XSTOCK-SNAPSHOT-RETENTION ranked selector', () => {
  function lifecycleValues(): Map<string, unknown> {
    return new Map<string, unknown>([
      ['xstock_spot_ohlc_15m_snapshot.hot_retention_days', 30],
      ['xstock_spot_ohlc_15m_snapshot.keep_floor_rows', 240],
      ['xstock_spot_ohlc_60m_snapshot.hot_retention_days', 30],
      ['xstock_spot_ohlc_60m_snapshot.keep_floor_rows', 60],
      [XSTOCK_SNAPSHOT_MUTATION_KEY, false],
    ]);
  }

  it('requires exact wildcard, integer and boolean lifecycle settings', () => {
    const parsed = parseXstockSnapshotLifecycleConfig(lifecycleValues(), []);
    expect(parsed.mutationEnabled).toBe(false);
    expect(parsed.byTable.get('xstock_spot_ohlc_15m_snapshot')).toEqual({
      hotRetentionDays: 30,
      keepFloorRows: 240,
    });

    expect(() => parseXstockSnapshotLifecycleConfig(
      lifecycleValues(),
      ['xstock_spot_ohlc_15m_snapshot.keep_floor_rows'],
    )).toThrow(/exact wildcard scope/);

    const fractional = lifecycleValues();
    fractional.set('xstock_spot_ohlc_60m_snapshot.hot_retention_days', 30.5);
    expect(() => parseXstockSnapshotLifecycleConfig(fractional, [])).toThrow(/positive-integer/);

    const missingFlag = lifecycleValues();
    missingFlag.delete(XSTOCK_SNAPSHOT_MUTATION_KEY);
    expect(() => parseXstockSnapshotLifecycleConfig(missingFlag, [])).toThrow(/non-boolean/);
  });

  it('accepts only the supervised snapshot-only operator mode', () => {
    expect(parseRetentionSweepArgs([])).toEqual({ snapshotOnly: false });
    expect(parseRetentionSweepArgs(['--snapshot-only'])).toEqual({ snapshotOnly: true });
    expect(() => parseRetentionSweepArgs(['--unknown'])).toThrow(/unknown argument/);
  });

  it('shares the exact 240/60 live caps and rejects a smaller retained floor', () => {
    expect(XSTOCK_SNAPSHOT_POLICIES.map((p) => [p.intervalMinutes, p.liveCapRows])).toEqual([[15, 240], [60, 60]]);
    expect(() => assertSnapshotFloorCoversLiveCap('xstock_spot_ohlc_15m_snapshot', 239)).toThrow(/below live cap 240/);
    expect(() => assertSnapshotFloorCoversLiveCap('xstock_spot_ohlc_60m_snapshot', 60)).not.toThrow();
  });

  it('refuses a wide prewarm result before it can recreate a row beyond the live floor', () => {
    const rows = Array.from({ length: 241 }, (_, index) => ({
      bucket_ts: new Date(Date.UTC(2026, 0, 1, 0, index * 15)),
      bar_open: '1', bar_high: '1', bar_low: '1', bar_close: '1', bar_volume: '1', source_bar_count: '1',
    }));
    expect(() => assertPrewarmRowsWithinCap(rows.slice(1), 240)).not.toThrow();
    expect(() => assertPrewarmRowsWithinCap(rows, 240)).toThrow(/above live cap 240/);
    expect(() => assertPrewarmRowsWithinCap([rows[1], rows[0]], 240)).toThrow(/not unique and ascending/);

    const src = fs.readFileSync(path.join(__dirname, '../../../scripts/b-new-34b-prewarm-snapshot.ts'), 'utf8');
    expect(src).toMatch(/ORDER BY bucket_ts DESC\s+LIMIT \$3/);
    expect(src.indexOf('assertPrewarmRowsWithinCap(bars, interval.maxBars)'))
      .toBeLessThan(src.indexOf('await upsertLegacySnapshot(pool, symbol, bars, interval.table)'));
  });

  it('freezes the cutoff at the complete UTC-day boundary', () => {
    expect(frozenSnapshotCutoff(new Date('2026-11-11T23:59:59.999Z'), 30).toISOString())
      .toBe('2026-10-12T00:00:00.000Z');
  });

  it('builds one materialized rank-floor selector and refuses drifted phases', () => {
    const sql = snapshotPopulationSql(selector());
    expect(sql).toContain('WITH ranked AS MATERIALIZED');
    expect(sql).toContain('floor_boundary AS MATERIALIZED');
    expect(sql).toContain('row_number() OVER (PARTITION BY symbol ORDER BY bucket_ts DESC)');
    expect(sql).toContain('s.bucket_ts < f.oldest_kept_bucket');
    expect(sql).toContain("'source_revision_set_hash'");
    expect(() => snapshotPopulationSql(selector({ dayEnd: new Date('2026-10-03T00:00:00Z') })))
      .toThrow(/exactly one UTC day/);
    expect(() => snapshotPopulationSql(selector({ cutoffAt: new Date('2026-10-12T01:00:00Z') })))
      .toThrow(/complete UTC-day boundary/);
    expect(() => snapshotPopulationSql(selector({
      dayStart: new Date('2026-10-12T00:00:00Z'),
      dayEnd: new Date('2026-10-13T00:00:00Z'),
    }))).toThrow(/wholly older than the frozen cutoff/);
  });

  it('refuses reuse when the stored cutoff, floor, day, or immutable proof drifts', () => {
    const snap = selector();
    const proof = { sourceRowCount: 2, orderedKeySha256: 'a'.repeat(64), fullRowSha256: 'b'.repeat(64) };
    const stored = {
      cursor_contract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
      selector_contract: XSTOCK_SNAPSHOT_SELECTOR_CONTRACT,
      selector_version: 1,
      frozen_cutoff_at: snap.cutoffAt,
      ranking_observed_at: snap.rankingObservedAt,
      keep_floor_rows: snap.keepFloorRows,
      day_start: snap.dayStart,
      day_end: snap.dayEnd,
      source_row_count: proof.sourceRowCount,
      ordered_key_sha256: proof.orderedKeySha256,
      full_row_sha256: proof.fullRowSha256,
    };
    expect(storedSnapshotEvidenceMatches(stored, snap, proof)).toBe(true);
    expect(storedSnapshotEvidenceMatches({ ...stored, frozen_cutoff_at: new Date('2026-10-11T00:00:00Z') }, snap, proof))
      .toBe(false);
    expect(storedSnapshotEvidenceMatches({ ...stored, keep_floor_rows: 241 }, snap, proof)).toBe(false);
    expect(storedSnapshotEvidenceMatches({ ...stored, day_start: new Date('2026-09-30T00:00:00Z') }, snap, proof))
      .toBe(false);
    expect(storedSnapshotEvidenceMatches({ ...stored, full_row_sha256: 'c'.repeat(64) }, snap, proof)).toBe(false);
  });

  it('reuses the ranked contract for day discovery and one gated proven-key delete statement', () => {
    const snap = selector();
    const days = snapshotEligibleDaysSql(snap.table);
    const locked = snapshotLockedDeleteSql(snap);
    expect(days).toContain('row_number() OVER (PARTITION BY symbol ORDER BY bucket_ts DESC)');
    expect(days).toContain('s.bucket_ts < f.oldest_kept_bucket');
    expect(locked).toContain('WITH current_rows AS MATERIALIZED');
    expect(locked).toContain('int4send(octet_length(convert_to(symbol');
    expect(locked).toContain('DELETE FROM "xstock_spot_ohlc_15m_snapshot" target');
    expect(locked).toContain('target.symbol = proven.symbol');
    expect(locked).toContain("manifest.state = 'verified'");
    expect(locked).not.toContain('CURRENT_DATE');
    expect(snapshotProvenKeyAbsenceSql(snap.table)).toContain('JOIN "b75_snapshot_proven_keys" proven');
    expect(snapshotLockedDeleteParams(snap, {
      sourceRowCount: 2,
      orderedKeySha256: 'a'.repeat(64),
      fullRowSha256: 'b'.repeat(64),
    }, 'manifest-1')).toEqual([
      240,
      snap.dayStart,
      snap.dayEnd,
      snap.cutoffAt,
      2,
      'a'.repeat(64),
      'b'.repeat(64),
      'manifest-1',
    ]);
  });

  it('uses the full ordered-key digest in a deterministic day label', () => {
    const digest = 'a'.repeat(64);
    expect(snapshotDayLabel(new Date('2026-10-01T00:00:00Z'), digest)).toBe(`2026-10-01-${digest}`);
  });

  it('length framing distinguishes concatenation collisions', () => {
    const a = crypto.createHash('sha256');
    appendSnapshotKey(a, 'AB', 'C');
    const b = crypto.createHash('sha256');
    appendSnapshotKey(b, 'A', 'BC');
    expect(a.digest('hex')).not.toBe(b.digest('hex'));
  });
});

describe('B-XSTOCK-SNAPSHOT-RETENTION table orchestration', () => {
  function config(mutationEnabled: boolean): B75SweepConfig {
    return {
      warmBucket: 'warm', warmPrefix: 'archive', retentionByTable: new Map(),
      sliceThresholdHotBytes: 1, snapshotMutationEnabled: mutationEnabled,
      snapshotByTable: new Map([
        ['xstock_spot_ohlc_15m_snapshot', { hotRetentionDays: 30, keepFloorRows: 240 }],
      ]),
    };
  }

  function fakeClient() {
    return {
      connect: vi.fn(async () => undefined), end: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ rows: [] })),
    };
  }

  it('performs zero vacuums for a dry read with no deletion', async () => {
    const ctl = fakeClient();
    const exporter = fakeClient();
    const clients = [ctl, exporter];
    const exportDry = vi.fn(async () => ({
      localPath: 'dry-object', bytesUncompressed: 100, bytesCompressed: 50,
      rowCount: 1, minTs: new Date(), maxTs: new Date(), checksum: 'c', sourceRowCount: 1,
      snapshotProof: { sourceRowCount: 1, orderedKeySha256: 'a'.repeat(64), fullRowSha256: 'b'.repeat(64) },
    }));
    const result = await sweepSnapshotTable(config(false), 'xstock_spot_ohlc_15m_snapshot', {
      createClient: vi.fn(() => clients.shift() as never),
      getStorageClient: vi.fn(() => ({} as never)),
      listSelectors: vi.fn(async () => [selector()]),
      exportPartition: exportDry as never,
      archiveObject: vi.fn() as never,
      deleteObject: vi.fn() as never,
      raiseAlert: vi.fn() as never,
      resolveAlerts: vi.fn() as never,
      unlinkFile: vi.fn(),
      now: vi.fn(() => Date.parse('2026-11-11T12:00:00Z')),
    });
    expect(result).toMatchObject({ objectsExamined: 1, rowsDeleted: 0, failed: false });
    expect(ctl.query.mock.calls.some(([sql]) => String(sql).startsWith('VACUUM'))).toBe(false);
  });

  it('vacuums exactly once after one deletion even when a later object stops the table', async () => {
    const ctl = fakeClient();
    const exporter = fakeClient();
    const clients = [ctl, exporter];
    const first = selector();
    const second = selector({
      dayStart: new Date('2026-10-02T00:00:00Z'),
      dayEnd: new Date('2026-10-03T00:00:00Z'),
    });
    const archived = (snap: XstockSnapshotSelector) => ({
      manifestId: `manifest-${snap.dayStart.toISOString()}`,
      partitionLabel: snapshotDayLabel(snap.dayStart, 'a'.repeat(64)),
      proof: { sourceRowCount: 1, orderedKeySha256: 'a'.repeat(64), fullRowSha256: 'b'.repeat(64) },
      provenObjectPath: `proven-${snap.dayStart.toISOString()}`,
      exportedPath: `exported-${snap.dayStart.toISOString()}`,
      bytesCompressed: 50,
      reused: false,
      selector: snap,
      exportDurationMs: 1,
      archiveDurationMs: 2,
      readbackDurationMs: 3,
    });
    const deleteObject = vi.fn()
      .mockResolvedValueOnce({
        deletedRows: 1,
        provenKeyLoadDurationMs: 1,
        lockWaitDurationMs: 2,
        compareDeleteDurationMs: 3,
        commitDurationMs: 1,
        lockedDurationMs: 10,
        postCommitProofDurationMs: 1,
      })
      .mockRejectedValueOnce(new Error('same-count key replacement'));
    const raiseAlert = vi.fn();
    const result = await sweepSnapshotTable(config(true), 'xstock_spot_ohlc_15m_snapshot', {
      createClient: vi.fn(() => clients.shift() as never),
      getStorageClient: vi.fn(() => ({} as never)),
      listSelectors: vi.fn(async () => [first, second]),
      exportPartition: vi.fn() as never,
      archiveObject: vi.fn(async (_storage, _exportClient, _ctlClient, _cfg, snap) => archived(snap)) as never,
      deleteObject: deleteObject as never,
      raiseAlert: raiseAlert as never,
      resolveAlerts: vi.fn() as never,
      unlinkFile: vi.fn(),
      now: vi.fn(() => Date.parse('2026-11-11T12:00:00Z')),
    });
    expect(result).toMatchObject({ objectsExamined: 2, rowsDeleted: 1, failed: true });
    expect(ctl.query.mock.calls.filter(([sql]) => String(sql).startsWith('VACUUM'))).toHaveLength(1);
    expect(raiseAlert).toHaveBeenCalledTimes(1);
  });

  it('cannot reach delete or vacuum when archive/readback proof fails first', async () => {
    const ctl = fakeClient();
    const exporter = fakeClient();
    const clients = [ctl, exporter];
    const deleteObject = vi.fn();
    const result = await sweepSnapshotTable(config(true), 'xstock_spot_ohlc_15m_snapshot', {
      createClient: vi.fn(() => clients.shift() as never),
      getStorageClient: vi.fn(() => ({} as never)),
      listSelectors: vi.fn(async () => [selector()]),
      exportPartition: vi.fn() as never,
      archiveObject: vi.fn(async () => { throw new Error('checksum mismatch'); }) as never,
      deleteObject: deleteObject as never,
      raiseAlert: vi.fn() as never,
      resolveAlerts: vi.fn() as never,
      unlinkFile: vi.fn(),
      now: vi.fn(() => Date.parse('2026-11-11T12:00:00Z')),
    });
    expect(result).toMatchObject({ objectsExamined: 1, rowsDeleted: 0, failed: true });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(ctl.query.mock.calls.some(([sql]) => String(sql).startsWith('VACUUM'))).toBe(false);
  });
});

describe('B-XSTOCK-SNAPSHOT-RETENTION canonical archive proof', () => {
  it('requires the exact 19-column live schema in ordinal order', () => {
    expect(XSTOCK_SNAPSHOT_EXPECTED_COLUMNS).toHaveLength(19);
    expect(() => assertSnapshotSchemaColumns(
      XSTOCK_SNAPSHOT_EXPECTED_COLUMNS.map((column_name) => ({ column_name })),
    )).not.toThrow();
    expect(() => assertSnapshotSchemaColumns(
      XSTOCK_SNAPSHOT_EXPECTED_COLUMNS.slice(0, 18).map((column_name) => ({ column_name })),
    )).toThrow(/schema mismatch/);
  });

  it('accepts both legacy-null and fully certified rows without losing microseconds', () => {
    const legacy = canonicalRow();
    const certified = canonicalRow({
      aggregate_revision_id: '9c7a3c3f-2b73-4b9f-aa60-6eb9ec767999',
      aggregate_hash: 'a'.repeat(64),
      source_revision_set_hash: 'b'.repeat(64),
      source_max_visible_by: '2026-10-01T12:35:01.000001Z',
      source_max_visible_seq: '9223372036854775000',
      read_observed_at: '2026-10-01T12:35:02.999999Z',
      read_observed_seq: '9223372036854775001',
      certificate_primary_identity: 'cert:CORZ/USD:15:1',
      availability_contract_version: 'xstock-bar-availability/v1',
      eligibility_state: 'eligible_certified',
    });
    expect(() => assertCanonicalSnapshotObject(legacy)).not.toThrow();
    expect(() => assertCanonicalSnapshotObject(certified)).not.toThrow();
    expect(certified.read_observed_at).toContain('.999999Z');
  });

  it('recomputes count, ordered-key and exact-line digests from a downloaded object', async () => {
    const rows = [canonicalRow(), canonicalRow({ symbol: 'HUT/USD', bucket_ts: '2026-10-01T12:45:00.000001Z' })];
    const file = gzipRows(rows);
    const proof = await inspectGzipSnapshotJsonl(file);
    const keyHash = crypto.createHash('sha256');
    for (const row of rows) appendSnapshotKey(keyHash, row.symbol, row.bucket_ts);
    const rowHash = crypto.createHash('sha256').update(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    expect(proof).toEqual({
      sourceRowCount: 2,
      orderedKeySha256: keyHash.digest('hex'),
      fullRowSha256: rowHash.digest('hex'),
    });
  });

  it('detects same-count key swaps and in-place content replacements independently', async () => {
    const original = [canonicalRow()];
    const keySwap = [canonicalRow({ symbol: 'HUT/USD' })];
    const contentChange = [canonicalRow({ close: 10.20000001 })];
    const [a, b, c] = await Promise.all([
      inspectGzipSnapshotJsonl(gzipRows(original)),
      inspectGzipSnapshotJsonl(gzipRows(keySwap)),
      inspectGzipSnapshotJsonl(gzipRows(contentChange)),
    ]);
    expect(b.sourceRowCount).toBe(a.sourceRowCount);
    expect(b.orderedKeySha256).not.toBe(a.orderedKeySha256);
    expect(c.sourceRowCount).toBe(a.sourceRowCount);
    expect(c.orderedKeySha256).toBe(a.orderedKeySha256);
    expect(c.fullRowSha256).not.toBe(a.fullRowSha256);
  });

  it('uses one client for proven-key load, bounded lock, gated delete, commit and absence proof', async () => {
    const file = gzipRows([canonicalRow()]);
    const proof = await inspectGzipSnapshotJsonl(file);
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('SELECT count(*)::bigint AS row_count FROM b75_snapshot_proven_keys')) {
        return { rows: [{ row_count: String(proof.sourceRowCount) }] };
      }
      if (sql.includes('WITH current_rows AS MATERIALIZED')) {
        return { rows: [{
          proof_matches: true,
          current_row_count: String(proof.sourceRowCount),
          deleted_row_count: String(proof.sourceRowCount),
          manifest_rows_marked: '1',
        }] };
      }
      if (sql.includes('AS remaining_rows')) return { rows: [{ remaining_rows: '0' }] };
      return { rows: [] };
    });
    await expect(deleteSnapshotProvenObject({ query } as never, {
      manifestId: 'manifest-1', partitionLabel: '2026-10-01-proof', proof,
      provenObjectPath: file, exportedPath: 'unused', bytesCompressed: 1, reused: false, selector: selector(),
      exportDurationMs: 1, archiveDurationMs: 2, readbackDurationMs: 3,
    })).resolves.toMatchObject({ deletedRows: 1 });
    expect(calls).toEqual(expect.arrayContaining([
      'BEGIN', "SET LOCAL lock_timeout = '1s'", "SET LOCAL statement_timeout = '5s'",
      'LOCK TABLE "xstock_spot_ohlc_15m_snapshot" IN SHARE MODE', 'COMMIT',
    ]));
    expect(calls.indexOf('BEGIN')).toBeLessThan(calls.indexOf('LOCK TABLE "xstock_spot_ohlc_15m_snapshot" IN SHARE MODE'));
    expect(calls.indexOf('LOCK TABLE "xstock_spot_ohlc_15m_snapshot" IN SHARE MODE'))
      .toBeLessThan(calls.findIndex((sql) => sql.includes('WITH current_rows AS MATERIALIZED')));
    expect(calls.indexOf('COMMIT')).toBeLessThan(calls.findIndex((sql) => sql.includes('AS remaining_rows')));
  });

  it('rolls back on lock timeout and on a deleted-count mismatch before commit', async () => {
    const file = gzipRows([canonicalRow()]);
    const proof = await inspectGzipSnapshotJsonl(file);
    const archived = {
      manifestId: 'manifest-1', partitionLabel: '2026-10-01-proof', proof,
      provenObjectPath: file, exportedPath: 'unused', bytesCompressed: 1, reused: false, selector: selector(),
      exportDurationMs: 1, archiveDurationMs: 2, readbackDurationMs: 3,
    };
    const makeQuery = (mode: 'lock-timeout' | 'count-mismatch') => {
      const calls: string[] = [];
      const query = vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes('SELECT count(*)::bigint AS row_count FROM b75_snapshot_proven_keys')) {
          return { rows: [{ row_count: String(proof.sourceRowCount) }] };
        }
        if (mode === 'lock-timeout' && sql.startsWith('LOCK TABLE')) throw new Error('lock timeout');
        if (sql.includes('WITH current_rows AS MATERIALIZED')) return { rows: [{
          proof_matches: true, current_row_count: '1', deleted_row_count: '0', manifest_rows_marked: '0',
        }] };
        return { rows: [] };
      });
      return { calls, query };
    };
    const timeout = makeQuery('lock-timeout');
    await expect(deleteSnapshotProvenObject({ query: timeout.query } as never, archived)).rejects.toThrow(/lock timeout/);
    expect(timeout.calls).toContain('ROLLBACK');
    expect(timeout.calls).not.toContain('COMMIT');
    expect(timeout.calls.some((sql) => sql.includes('WITH current_rows AS MATERIALIZED'))).toBe(false);

    const mismatch = makeQuery('count-mismatch');
    await expect(deleteSnapshotProvenObject({ query: mismatch.query } as never, archived)).rejects.toThrow(/locked proof\/delete gate refused/);
    expect(mismatch.calls).toContain('ROLLBACK');
    expect(mismatch.calls).not.toContain('COMMIT');
  });

  it('accepts only a proven rehydrated object whose sidecar reproduces its exact proof', async () => {
    const row = canonicalRow();
    const scratch = path.dirname(gzipRows([row]));
    const original = path.join(scratch, 'object.jsonl.gz');
    const file = path.join(scratch, 'xstock_spot_ohlc_15m_snapshot_2026-10-01-proof.jsonl.gz');
    fs.renameSync(original, file);
    const proof = await inspectGzipSnapshotJsonl(file);
    fs.writeFileSync(`${file}.completeness.json`, JSON.stringify({
      table: 'xstock_spot_ohlc_15m_snapshot',
      proven: true,
      checksum_ok: true,
      row_count: proof.sourceRowCount,
      snapshot_selector: {
        cursor_contract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
        ordered_key_sha256: proof.orderedKeySha256,
        full_row_sha256: proof.fullRowSha256,
      },
    }));
    await expect(loadProvenRehydratedSnapshot(scratch, 'xstock_spot_ohlc_15m_snapshot'))
      .resolves.toMatchObject({ files: [file], rows: [row], proofs: [proof] });
    fs.writeFileSync(`${file}.completeness.json`, JSON.stringify({
      table: 'xstock_spot_ohlc_15m_snapshot',
      proven: false,
      checksum_ok: true,
      row_count: proof.sourceRowCount,
      snapshot_selector: {
        cursor_contract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
        ordered_key_sha256: proof.orderedKeySha256,
        full_row_sha256: proof.fullRowSha256,
      },
    }));
    await expect(loadProvenRehydratedSnapshot(scratch, 'xstock_spot_ohlc_15m_snapshot'))
      .rejects.toThrow(/not proven/);
    fs.writeFileSync(`${file}.completeness.json`, JSON.stringify({
      table: 'xstock_spot_ohlc_15m_snapshot',
      proven: true,
      checksum_ok: false,
      row_count: proof.sourceRowCount,
      snapshot_selector: {
        cursor_contract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
        ordered_key_sha256: proof.orderedKeySha256,
        full_row_sha256: proof.fullRowSha256,
      },
    }));
    await expect(loadProvenRehydratedSnapshot(scratch, 'xstock_spot_ohlc_15m_snapshot'))
      .rejects.toThrow(/not proven/);
    fs.writeFileSync(`${file}.completeness.json`, JSON.stringify({
      table: 'xstock_spot_ohlc_15m_snapshot',
      proven: true,
      checksum_ok: true,
      row_count: proof.sourceRowCount + 1,
      snapshot_selector: {
        cursor_contract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
        ordered_key_sha256: proof.orderedKeySha256,
        full_row_sha256: proof.fullRowSha256,
      },
    }));
    await expect(loadProvenRehydratedSnapshot(scratch, 'xstock_spot_ohlc_15m_snapshot'))
      .rejects.toThrow(/proof does not match/);
    fs.writeFileSync(`${file}.completeness.json`, JSON.stringify({
      table: 'xstock_spot_ohlc_15m_snapshot',
      proven: true,
      checksum_ok: true,
      row_count: proof.sourceRowCount,
      snapshot_selector: {
        cursor_contract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
        ordered_key_sha256: 'c'.repeat(64),
        full_row_sha256: proof.fullRowSha256,
      },
    }));
    await expect(loadProvenRehydratedSnapshot(scratch, 'xstock_spot_ohlc_15m_snapshot'))
      .rejects.toThrow(/proof does not match/);
  });

  it('loads only parsed downloaded keys into the typed pre-lock temp table', async () => {
    const rows = [canonicalRow(), canonicalRow({ symbol: 'HUT/USD', bucket_ts: '2026-10-01T12:45:00.000001Z' })];
    const file = gzipRows(rows);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT count(*)::bigint AS row_count')) return { rows: [{ row_count: '2' }] };
      return { rows: [] };
    });
    const proof = await loadSnapshotProvenKeys({ query } as never, file);
    expect(proof.sourceRowCount).toBe(2);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('CREATE TEMP TABLE'))).toBe(true);
    const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO b75_snapshot_proven_keys'));
    expect(insert?.[1]).toEqual([
      ['CORZ/USD', 'HUT/USD'],
      ['2026-10-01T12:34:56.123456Z', '2026-10-01T12:45:00.000001Z'],
    ]);
  });

  it('refuses malformed, truncated, extra-field and out-of-order downloads', async () => {
    await expect(inspectGzipSnapshotJsonl(gzipRows([canonicalRow()], false))).rejects.toThrow(/unterminated/);
    const malformedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xstock-snapshot-proof-'));
    tempDirs.push(malformedDir);
    const malformed = path.join(malformedDir, 'malformed.jsonl.gz');
    fs.writeFileSync(malformed, zlib.gzipSync(Buffer.from('{not-json}\n', 'utf8')));
    await expect(inspectGzipSnapshotJsonl(malformed)).rejects.toThrow(/malformed/);
    await expect(inspectGzipSnapshotJsonl(gzipRows([{ ...canonicalRow(), extra: true }]))).rejects.toThrow(/unexpected fields/);
    await expect(inspectGzipSnapshotJsonl(gzipRows([
      canonicalRow({ symbol: 'HUT/USD' }),
      canonicalRow({ symbol: 'CORZ/USD' }),
    ]))).rejects.toThrow(/out of order/);
  });

  it('records every snapshot selector field and compares immutable replay evidence', async () => {
    const snap = selector();
    const proof = { sourceRowCount: 2, orderedKeySha256: 'a'.repeat(64), fullRowSha256: 'b'.repeat(64) };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        source_table: snap.table,
        partition_label: `2026-10-01-${proof.orderedKeySha256}`,
        tier: 'warm',
        source_row_count: '2', exported_row_count: '2', downloaded_row_count: '2',
        cursor_contract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
        producing_build_sha: 'c'.repeat(40), object_checksum: 'd'.repeat(64),
        selector_contract: XSTOCK_SNAPSHOT_SELECTOR_CONTRACT, selector_version: 1,
        frozen_cutoff_at: snap.cutoffAt, ranking_observed_at: snap.rankingObservedAt,
        keep_floor_rows: 240, day_start: snap.dayStart, day_end: snap.dayEnd,
        ordered_key_sha256: proof.orderedKeySha256, full_row_sha256: proof.fullRowSha256,
      }] });
    await recordExactArchiveEvidence({ query }, {
      manifestId: 'manifest-1',
      sourceTable: snap.table,
      partitionLabel: `2026-10-01-${proof.orderedKeySha256}`,
      tier: 'warm',
      sourceRowCount: 2,
      exportedRowCount: 2,
      downloadedRowCount: 2,
      cursorContract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
      producingBuildSha: 'c'.repeat(40),
      objectChecksum: 'd'.repeat(64),
      snapshot: {
        ...proof,
        cutoffAt: snap.cutoffAt,
        rankingObservedAt: snap.rankingObservedAt,
        keepFloorRows: 240,
        dayStart: snap.dayStart,
        dayEnd: snap.dayEnd,
      },
    });
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining([
      XSTOCK_SNAPSHOT_SELECTOR_CONTRACT, 1, snap.cutoffAt, snap.rankingObservedAt,
      240, snap.dayStart, snap.dayEnd, proof.orderedKeySha256, proof.fullRowSha256,
    ]));
  });

  it('rehydrates a snapshot only when its selector, key and full-row proof reproduce', async () => {
    const source = gzipRows([canonicalRow()]);
    const proof = await inspectGzipSnapshotJsonl(source);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'xstock-snapshot-rehydrate-'));
    fs.chmodSync(out, 0o700);
    tempDirs.push(out);
    const snap = selector();
    const args: RehydrateArgs = {
      table: snap.table,
      from: snap.dayStart,
      to: snap.dayEnd,
      out,
      restoreCold: false,
      diskFile: false,
    };
    const manifest: RehydrateManifestRow = {
      id: 'manifest-1', partition_label: snapshotDayLabel(snap.dayStart, proof.orderedKeySha256),
      tier: 'warm', state: 'active', storage_uri: 'supabase://warm/object.jsonl.gz',
      row_count: 1, bytes_compressed: fs.statSync(source).size,
      min_ts: snap.dayStart, max_ts: snap.dayEnd, checksum: 'object-checksum',
      completeness_basis: 'source-count-matched', format: 'jsonl.gz', original_partition_size_bytes: null,
      cursor_contract: XSTOCK_SNAPSHOT_CURSOR_CONTRACT,
      selector_contract: XSTOCK_SNAPSHOT_SELECTOR_CONTRACT, selector_version: 1,
      frozen_cutoff_at: snap.cutoffAt, ranking_observed_at: snap.rankingObservedAt,
      keep_floor_rows: snap.keepFloorRows, day_start: snap.dayStart, day_end: snap.dayEnd,
      ordered_key_sha256: proof.orderedKeySha256, full_row_sha256: proof.fullRowSha256,
    };
    const result = await rehydrateChosenObject(args, {
      label: manifest.partition_label,
      download: manifest,
      all: [manifest],
    }, {
      downloadWarmFile: vi.fn(async (_bucket: string, _object: string, local: string) => {
        fs.copyFileSync(source, local);
        return { checksum: 'object-checksum', bytes: fs.statSync(source).size };
      }),
      isColdConfigured: vi.fn(),
      downloadCold: vi.fn(),
    } as never);
    expect(result).toMatchObject({ kind: 'downloaded', basisProven: true, rowCount: 1 });
    const restored = path.join(out, `${snap.table}_${manifest.partition_label}.jsonl.gz`);
    expect(JSON.parse(fs.readFileSync(`${restored}.completeness.json`, 'utf8')))
      .toMatchObject({ proven: true, snapshot_selector: { ordered_key_sha256: proof.orderedKeySha256 } });
  });
});
