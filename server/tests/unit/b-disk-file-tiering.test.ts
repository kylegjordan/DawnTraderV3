import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DISK_FILE_SPECS, boundsFromName, digestFile, digestGunzipped, gzipFile, isOlderThanHotWindow, planRun,
  warmObjectPath, type Candidate,
} from '../../services/data-archive/disk-file-tiering.js';

// B-DISK-FILE-TIERING (#1233): the pure half of the daily disk-file move. Selection is by the
// date in the NAME (mtime is the wrong instrument for these folders, measured), the run is
// capped by governed numbers, and a move is proved by a byte-identical round trip.

const spec = (folder: string) => DISK_FILE_SPECS.find((s) => s.folder === folder)!;
const NOW = Date.parse('2026-11-04T15:00:00Z');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b-disk-file-tiering-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('boundsFromName — each folder has its own name shape', () => {
  it('reads a day from the telemetry, eval and daily aggregate names', () => {
    expect(boundsFromName(spec('logs/phase15b_dbs_telemetry'), '2026-09-18.jsonl')?.start.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(boundsFromName(spec('logs/vts_eval_history'), '2026-10-01.json')?.end.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(boundsFromName(spec('logs/data_aggregates'), 'passive_2026-10-01.json')?.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
  it('reads an hour from the hourly aggregate names', () => {
    const b = boundsFromName(spec('logs/data_aggregates/hourly'), 'passive_2026-10-01T05.json');
    expect([b?.start.toISOString(), b?.end.toISOString()]).toEqual(['2026-10-01T05:00:00.000Z', '2026-10-01T06:00:00.000Z']);
  });
  it('refuses a name that is not the folder\'s shape, an impossible date, or an impossible hour', () => {
    expect(boundsFromName(spec('logs/phase15b_dbs_telemetry'), 'consumer_sites')).toBeNull();
    expect(boundsFromName(spec('logs/phase15b_dbs_telemetry'), '2026-09-18.jsonl.tiering.gz')).toBeNull();
    expect(boundsFromName(spec('logs/vts_eval_history'), '2026-02-30.json')).toBeNull();
    expect(boundsFromName(spec('logs/data_aggregates/hourly'), 'passive_2026-10-01T24.json')).toBeNull();
    expect(boundsFromName(spec('logs/data_aggregates'), 'passive_2026-10-01T05.json')).toBeNull();
  });
});

describe('isOlderThanHotWindow — the 35-day boundary, by name date', () => {
  const day = (d: string) => boundsFromName(spec('logs/vts_eval_history'), `${d}.json`)!;
  it('on 2026-11-04 with 35 days: 09-29 moves, 09-30 stays (Langston\'s backlog read: "older than 2026-09-30")', () => {
    expect(isOlderThanHotWindow(day('2026-09-29'), NOW, 35)).toBe(true);
    expect(isOlderThanHotWindow(day('2026-09-30'), NOW, 35)).toBe(false);
    expect(isOlderThanHotWindow(day('2026-11-04'), NOW, 35)).toBe(false);
  });
  it('an hourly file follows its day', () => {
    const h = boundsFromName(spec('logs/data_aggregates/hourly'), 'passive_2026-09-29T23.json')!;
    expect(isOlderThanHotWindow(h, NOW, 35)).toBe(true);
  });
});

describe('planRun — oldest first, capped, and never under the free-space floor', () => {
  const GB = 1024 ** 3;
  const c = (name: string, d: string, bytes: number): Candidate => ({
    spec: spec('logs/vts_eval_history'), name, path: `/x/${name}`, bytes, bounds: boundsFromName(spec('logs/vts_eval_history'), `${d}.json`)!,
  });
  const files = [c('b', '2026-09-02', 1 * GB), c('a', '2026-09-01', 1 * GB), c('c', '2026-09-03', 1 * GB)];
  it('orders by name date, oldest first', () => {
    const p = planRun(files, { freeBytes: 100 * GB, backlogFreeBytes: 15 * GB, runCapBytes: 2 * GB, freeFloorBytes: 5 * GB });
    expect(p.take.map((x) => x.name)).toEqual(['a', 'b', 'c']);
    expect(p.stoppedBy).toBe('none');
  });
  it('under the backlog threshold, moves at most the run cap of originals', () => {
    const p = planRun(files, { freeBytes: 10 * GB, backlogFreeBytes: 15 * GB, runCapBytes: 2 * GB, freeFloorBytes: 5 * GB });
    expect(p.take.map((x) => x.name)).toEqual(['a', 'b']);
    expect(p.stoppedBy).toBe('run-cap');
  });
  it('never starts a file whose worst-case peak would cross the floor', () => {
    const p = planRun([c('big', '2026-09-01', 3 * GB)], { freeBytes: 7 * GB, backlogFreeBytes: 15 * GB, runCapBytes: 10 * GB, freeFloorBytes: 5 * GB });
    expect(p.take).toEqual([]);
    expect(p.stoppedBy).toBe('free-floor');
  });
});

describe('the round trip — what makes deleting the original safe', () => {
  it('gzip then inflate reproduces the original byte for byte, including a file with no final newline', async () => {
    const src = path.join(tmp, 'passive_2026-10-01T05.json');
    fs.writeFileSync(src, '{\n  "aggregates": [1, 2, 3]\n}');
    const original = await digestFile(src);
    const gz = await gzipFile(src, `${src}.gz`);
    const back = await digestGunzipped(`${src}.gz`);
    expect(back).toEqual(original);
    expect(original.newlines).toBe(2);
    expect(gz.bytes).toBeGreaterThan(0);
  });
  it('the gzip is deterministic, so a resumed run reproduces the stored object checksum', async () => {
    const src = path.join(tmp, '2026-09-18.jsonl');
    fs.writeFileSync(src, '{"a":1}\n{"a":2}\n');
    const one = await gzipFile(src, `${src}.1.gz`);
    const two = await gzipFile(src, `${src}.2.gz`);
    expect(one.sha256).toBe(two.sha256);
  });
  it('a changed byte is caught', async () => {
    const src = path.join(tmp, 'x.jsonl');
    fs.writeFileSync(src, '{"a":1}\n');
    await gzipFile(src, `${src}.gz`);
    fs.writeFileSync(src, '{"a":2}\n');
    expect((await digestGunzipped(`${src}.gz`)).sha256).not.toBe((await digestFile(src)).sha256);
  });
});

describe('warmObjectPath', () => {
  it('keeps the whole original name under the disk-files prefix', () => {
    expect(warmObjectPath('warm', spec('logs/data_aggregates/hourly'), 'passive_2026-10-01T05.json'))
      .toBe('warm/disk-files/disk_file.data_aggregates.hourly/passive_2026-10-01T05.json.gz');
  });
});
