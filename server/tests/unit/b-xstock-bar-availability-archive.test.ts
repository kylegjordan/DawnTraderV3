import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  recordExactArchiveEvidence,
  XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT,
} from '../../services/data-archive/exact-archive-evidence.js';

const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xstock-exact-export-'));
let exportPartition: typeof import('../../services/data-archive/partition-exporter.js').exportPartition;
let countGzipJsonlLines: typeof import('../../services/data-archive/partition-exporter.js').countGzipJsonlLines;

beforeAll(async () => {
  process.env.B75_EXPORT_TMP_DIR = exportRoot;
  ({ exportPartition, countGzipJsonlLines } = await import(
    '../../services/data-archive/partition-exporter.js'
  ));
});

afterAll(() => {
  fs.rmSync(exportRoot, { recursive: true, force: true });
  delete process.env.B75_EXPORT_TMP_DIR;
});

function revisionId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function exactRow(index: number, timestamp: string) {
  return {
    __cursor_ts: timestamp,
    __cursor_tie: revisionId(index),
    __json: JSON.stringify({
      revision_id: revisionId(index),
      arrived_at: timestamp,
      visible_by: timestamp,
    }),
  };
}

describe('B75 exact xStock revision export', () => {
  it('keeps a microsecond text cursor and exports timestamp ties across a 1000-row boundary', async () => {
    const tiedTimestamp = '2026-10-15 10:11:12.123456+00';
    const nextMicrosecond = '2026-10-15 10:11:12.123457+00';
    const firstPage = Array.from({ length: 1_000 }, (_, index) => exactRow(index, tiedTimestamp));
    const secondPage = [
      exactRow(1_000, tiedTimestamp),
      exactRow(1_001, nextMicrosecond),
    ];
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    let exactPage = 0;
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('source_count')) return { rows: [{ source_count: '1002' }] };
        if (sql.includes('AS __cursor_ts')) {
          exactPage++;
          return { rows: exactPage === 1 ? firstPage : secondPage };
        }
        return { rows: [] };
      },
    } as any;

    const result = await exportPartition(client, {
      sourceTable: 'xstock_bar_revision_event',
      partitionLabel: '2026-10-15',
      rangeStart: new Date('2026-10-15T00:00:00Z'),
      rangeEnd: new Date('2026-10-16T00:00:00Z'),
      timestampColumn: 'arrived_at',
      exactCursorTieBreakerColumn: 'revision_id',
      exactCursorTieBreakerType: 'uuid',
    });

    expect(result.sourceRowCount).toBe(1_002);
    expect(result.rowCount).toBe(1_002);
    expect(await countGzipJsonlLines(result.localPath)).toBe(1_002);
    const cursorCall = calls.find((call) => call.params?.length === 3);
    expect(cursorCall?.params?.[0]).toBe(tiedTimestamp);
    expect(cursorCall?.params?.[1]).toBe(revisionId(999));
    expect(cursorCall?.sql).toContain('> ($1::timestamptz, $2::uuid)');
    expect(cursorCall?.sql).toContain('ORDER BY "arrived_at" ASC, "revision_id" ASC');
    const jsonl = zlib.gunzipSync(fs.readFileSync(result.localPath)).toString('utf8');
    expect(jsonl).toContain('.123456+00');
    expect(jsonl).toContain('.123457+00');
  });

  it('rolls back and removes the file when same-snapshot count does not match', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('source_count')) return { rows: [{ source_count: '2' }] };
        if (sql.includes('AS __cursor_ts')) {
          return { rows: [exactRow(0, '2026-10-15 10:11:12.123456+00')] };
        }
        return { rows: [] };
      },
    } as any;

    await expect(exportPartition(client, {
      sourceTable: 'xstock_bar_revision_event',
      partitionLabel: 'mismatch',
      rangeStart: new Date('2026-10-15T00:00:00Z'),
      rangeEnd: new Date('2026-10-16T00:00:00Z'),
      timestampColumn: 'arrived_at',
      exactCursorTieBreakerColumn: 'revision_id',
      exactCursorTieBreakerType: 'uuid',
    })).rejects.toThrow(/source=2 exported=1/);
    expect(calls).toContain('ROLLBACK');
    expect(fs.existsSync(path.join(exportRoot, 'xstock_bar_revision_event', 'mismatch.jsonl.gz')))
      .toBe(false);
  });

  it('blocks durable verification before any write when downloaded line count is corrupt', async () => {
    const calls: string[] = [];
    const client = {
      query: async (statement: string) => {
        calls.push(statement);
        return { rows: [] };
      },
    };
    await expect(recordExactArchiveEvidence(client, {
      manifestId: revisionId(50),
      sourceTable: 'xstock_bar_revision_event',
      partitionLabel: '2026-10-15',
      tier: 'warm',
      cursorContract: XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT,
      sourceRowCount: 100,
      exportedRowCount: 100,
      downloadedRowCount: 99,
      objectChecksum: 'checksum',
      producingBuildSha: 'a'.repeat(40),
    })).rejects.toThrow(/source=100 exported=100 downloaded=99/);
    expect(calls).toEqual([]);
  });

  it('persists and re-reads the immutable exact proof before lifecycle verification', async () => {
    const calls: string[] = [];
    const client = {
      query: async (statement: string) => {
        calls.push(statement);
        return statement.startsWith('SELECT')
          ? { rows: [{
              source_table: 'xstock_bar_revision_event',
              partition_label: '2026-10-15',
              tier: 'warm',
              source_row_count: '100',
              exported_row_count: '100',
              downloaded_row_count: '100',
              cursor_contract: XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT,
              producing_build_sha: 'a'.repeat(40),
              object_checksum: 'checksum',
            }] }
          : { rows: [] };
      },
    };
    await recordExactArchiveEvidence(client, {
      manifestId: revisionId(51),
      sourceTable: 'xstock_bar_revision_event',
      partitionLabel: '2026-10-15',
      tier: 'warm',
      cursorContract: XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT,
      sourceRowCount: 100,
      exportedRowCount: 100,
      downloadedRowCount: 100,
      objectChecksum: 'checksum',
      producingBuildSha: 'a'.repeat(40),
    });
    expect(calls).toHaveLength(2);
    // B-B75-EXPORT-COMPLETENESS (#1195): the table is renamed data_archive_exact_evidence.
    expect(calls[0]).toContain('INSERT INTO data_archive_exact_evidence');
    expect(calls[1]).toContain('FROM data_archive_exact_evidence');
  });
});
