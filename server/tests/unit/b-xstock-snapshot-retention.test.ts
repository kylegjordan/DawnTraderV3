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
  snapshotPopulationSql,
  type XstockSnapshotCanonicalRow,
  type XstockSnapshotSelector,
} from '../../services/data-archive/xstock-snapshot-retention.js';
import { inspectGzipSnapshotJsonl } from '../../services/data-archive/partition-exporter.js';
import { recordExactArchiveEvidence } from '../../services/data-archive/exact-archive-evidence.js';
import {
  XSTOCK_SNAPSHOT_POLICIES,
  assertSnapshotFloorCoversLiveCap,
} from '../../services/xstock-snapshot-policy.js';

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
  it('shares the exact 240/60 live caps and rejects a smaller retained floor', () => {
    expect(XSTOCK_SNAPSHOT_POLICIES.map((p) => [p.intervalMinutes, p.liveCapRows])).toEqual([[15, 240], [60, 60]]);
    expect(() => assertSnapshotFloorCoversLiveCap('xstock_spot_ohlc_15m_snapshot', 239)).toThrow(/below live cap 240/);
    expect(() => assertSnapshotFloorCoversLiveCap('xstock_spot_ohlc_60m_snapshot', 60)).not.toThrow();
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

  it('refuses malformed, truncated, extra-field and out-of-order downloads', async () => {
    await expect(inspectGzipSnapshotJsonl(gzipRows([canonicalRow()], false))).rejects.toThrow(/unterminated/);
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
});
