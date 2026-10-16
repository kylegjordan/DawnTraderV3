import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

// B-B75-COUNT-GATE hotfix (#1195): the legacy (timestamp-only) export must count
// the source in its snapshot and refuse an incomplete copy, so the sweep never
// verifies and drops a partition whose archive is missing rows.

const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'b75-count-gate-'));
let mod: typeof import('../../services/data-archive/partition-exporter.js');

beforeAll(async () => {
  process.env.B75_EXPORT_TMP_DIR = exportRoot;
  mod = await import('../../services/data-archive/partition-exporter.js');
});

afterAll(() => {
  fs.rmSync(exportRoot, { recursive: true, force: true });
  delete process.env.B75_EXPORT_TMP_DIR;
});

/** Microsecond database text; this fixed form sorts lexically in time order. */
function tsText(second: number, micro = 0): string {
  return `2026-09-16 10:${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}.${String(micro).padStart(6, '0')}+00`;
}

/**
 * A fake client that evaluates the legacy page queries the way PostgreSQL would:
 * `>= $1` on the first page, `> $1` (text cursor) afterwards, ORDER BY ts, LIMIT 1000.
 */
function fakeTable(texts: string[], extraSourceRows = 0) {
  const rows = texts
    .map((t, i) => ({ id: i, t }))
    .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.id - b.id));
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const shape = (r: { id: number; t: string }) => ({
    id: r.id,
    captured_at: new Date(r.t.replace(' ', 'T').replace('+00', 'Z')),
    __b75_cursor_ts: r.t,
  });
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('source_count')) return { rows: [{ source_count: String(rows.length + extraSourceRows) }] };
      if (sql.includes('"captured_at" = $1')) {
        const cursor = String(params?.[0]);
        return { rows: rows.filter((r) => r.t === cursor).map(shape) };
      }
      if (sql.includes('"captured_at" >= $1')) return { rows: rows.slice(0, 1000).map(shape) };
      if (sql.includes('"captured_at" > $1')) {
        const cursor = String(params?.[0]);
        return { rows: rows.filter((r) => r.t > cursor).slice(0, 1000).map(shape) };
      }
      return { rows: [] };
    },
  } as any;
  return { client, calls };
}

const req = (label: string) => ({
  sourceTable: 'crypto_perp_ticker_snap',
  partitionLabel: label,
  rangeStart: new Date('2026-09-16T00:00:00Z'),
  rangeEnd: new Date('2026-09-17T00:00:00Z'),
  timestampColumn: 'captured_at',
  partitionTableName: 'crypto_perp_ticker_snap_2026_09_16',
});

describe('B75 legacy export count gate (#1195)', () => {
  it('reads the whole tie group at a page boundary, so nothing is skipped', async () => {
    // 999 rows at second 0, then 3 rows tied at second 1: page 1 ends on the first
    // of the tie, and `> cursor` alone would skip the other two (the #1195 shape).
    const texts = [
      ...Array.from({ length: 999 }, () => tsText(0)),
      tsText(1), tsText(1), tsText(1),
    ];
    const { client, calls } = fakeTable(texts);
    const result = await mod.exportPartition(client, req('tie'));
    expect(result.sourceRowCount).toBe(1002);
    expect(result.rowCount).toBe(1002);
    const jsonl = zlib.gunzipSync(fs.readFileSync(result.localPath)).toString('utf8');
    expect(new Set(jsonl.trim().split('\n').map((l) => JSON.parse(l).id)).size).toBe(1002);
    expect(calls.some((c) => c.sql.includes('"captured_at" = $1'))).toBe(true);
  });

  it('exports a tie group larger than a whole page', async () => {
    const texts = [
      ...Array.from({ length: 2500 }, () => tsText(5)),
      ...Array.from({ length: 10 }, (_, i) => tsText(6, i)),
    ];
    const result = await mod.exportPartition(fakeTable(texts).client, req('bigtie'));
    expect(result.rowCount).toBe(2510);
    const jsonl = zlib.gunzipSync(fs.readFileSync(result.localPath)).toString('utf8');
    expect(new Set(jsonl.trim().split('\n').map((l) => JSON.parse(l).id)).size).toBe(2510);
  });

  it('refuses an export whose row count does not match the source, and leaves no file', async () => {
    const texts = Array.from({ length: 1200 }, (_, i) => tsText(i));
    const { client, calls } = fakeTable(texts, 1);
    await expect(mod.exportPartition(client, req('short'))).rejects.toBeInstanceOf(mod.ExportRowCountMismatchError);
    await expect(mod.exportPartition(fakeTable(texts, 1).client, req('short'))).rejects.toThrow(/source=1201 exported=1200/);
    expect(fs.existsSync(path.join(exportRoot, 'crypto_perp_ticker_snap', 'short.jsonl.gz'))).toBe(false);
    expect(calls.some((c) => c.sql === 'ROLLBACK')).toBe(true);
    expect(calls.some((c) => c.sql === 'COMMIT')).toBe(false);
  });

  it('passes a complete export, keeps the text cursor, and writes rows without the cursor column', async () => {
    const texts = Array.from({ length: 1500 }, (_, i) => tsText(Math.floor(i / 2), (i % 2) * 7 + 1));
    const { client, calls } = fakeTable(texts);
    const result = await mod.exportPartition(client, req('complete'));
    expect(result.sourceRowCount).toBe(1500);
    expect(result.rowCount).toBe(1500);
    expect(await mod.countGzipJsonlLines(result.localPath)).toBe(1500);
    const cursorCall = calls.find((c) => c.sql.includes('"captured_at" > $1'));
    expect(typeof cursorCall?.params?.[0]).toBe('string');
    expect(cursorCall?.params?.[0]).toBe(texts.slice().sort()[999]);
    const jsonl = zlib.gunzipSync(fs.readFileSync(result.localPath)).toString('utf8');
    expect(jsonl).not.toContain('__b75_cursor_ts');
    expect(new Set(jsonl.trim().split('\n').map((l) => JSON.parse(l).id)).size).toBe(1500);
  });
});
