import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// B-DISK-FILE-TIERING (#1233, pre-audit P6): the Drift Dashboard's moved-day check. The pure day
// arithmetic must match the reader (keep a day when dayStart + 1 day >= startMs and dayStart <= endMs),
// and runCheck's two branches — mint when an expected day is in the manifest but not on disk, resolve
// that window's key when nothing is — are exercised here with the db and the alert store mocked
// (Langston Step 4 part 3: no live silence is evidence the alert path works until a test drives it).
const execute = vi.fn();
const addAlert = vi.fn();
const resolveAlertsByDedupeKey = vi.fn();
vi.mock('../../db', () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }));
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: (...a: unknown[]) => addAlert(...a),
  resolveAlertsByDedupeKey: (...a: unknown[]) => resolveAlertsByDedupeKey(...a),
}));

const mod = await import('../../services/data-archive/moved-day-check.js');
const DAY = 86_400_000;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-day-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => { execute.mockReset(); addAlert.mockReset(); resolveAlertsByDedupeKey.mockReset().mockResolvedValue([]); });

describe('expectedDayFiles — the same days the reader would select', () => {
  it('a 30-day window ending mid-day expects 31 day files, the first being the partial day', () => {
    const end = Date.parse('2026-11-04T15:00:00Z');
    const days = mod.expectedDayFiles(end - 30 * DAY, end);
    expect(days.length).toBe(31);
    expect(days[0]).toBe('2026-10-05.jsonl');
    expect(days[days.length - 1]).toBe('2026-11-04.jsonl');
  });
  it('a window inside one day expects that day only', () => {
    expect(mod.expectedDayFiles(Date.parse('2026-11-04T01:00:00Z'), Date.parse('2026-11-04T02:00:00Z'))).toEqual(['2026-11-04.jsonl']);
  });
  it('an exact-midnight start also expects the day before, as the reader keeps it (parity by construction)', () => {
    const days = mod.expectedDayFiles(Date.parse('2026-11-04T00:00:00Z'), Date.parse('2026-11-04T02:00:00Z'));
    expect(days).toEqual(['2026-11-03.jsonl', '2026-11-04.jsonl']);
  });
});

describe('missingFromDisk and the key', () => {
  it('lists only the expected names that are absent', () => {
    expect(mod.missingFromDisk(['2026-09-28.jsonl', '2026-09-29.jsonl', '2026-09-30.jsonl'], ['2026-09-30.jsonl', 'consumer_sites']))
      .toEqual(['2026-09-28.jsonl', '2026-09-29.jsonl']);
  });
  it('one key per window, so a rolling_30d clear never resolves a cohort_latest alert', () => {
    expect(mod.movedDayKey('cohort_latest')).not.toBe(mod.movedDayKey('rolling_30d'));
  });
});

describe('runCheck — both branches', () => {
  const start = Date.parse('2026-09-28T10:00:00Z');
  const end = Date.parse('2026-09-30T10:00:00Z');

  it('an expected day missing from disk AND in the manifest mints the window alert, and does not resolve', async () => {
    const dir = path.join(tmp, 'a'); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '2026-09-30.jsonl'), '');
    execute.mockResolvedValue({ rows: [{ partition_label: '2026-09-28.jsonl' }, { partition_label: '2026-09-29.jsonl' }] });
    await mod.runCheck(dir, 'cohort_latest', start, end);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(addAlert).toHaveBeenCalledTimes(1);
    const arg = addAlert.mock.calls[0][0];
    expect(arg.dedupe_key).toBe('disk-tiering-moved-day:phase15b_dbs_telemetry:cohort_latest');
    expect(arg.metadata.moved).toEqual(['2026-09-28.jsonl', '2026-09-29.jsonl']);
    expect(resolveAlertsByDedupeKey).not.toHaveBeenCalled();
  });

  it('nothing missing from disk: no query, and the window key is resolved under the moved-day actor, transport engine', async () => {
    const dir = path.join(tmp, 'b'); fs.mkdirSync(dir);
    for (const d of ['2026-09-28', '2026-09-29', '2026-09-30']) fs.writeFileSync(path.join(dir, `${d}.jsonl`), '');
    await mod.runCheck(dir, 'rolling_30d', start, end);
    expect(execute).not.toHaveBeenCalled();
    expect(addAlert).not.toHaveBeenCalled();
    expect(resolveAlertsByDedupeKey).toHaveBeenCalledTimes(1);
    const [key, actor, , transport] = resolveAlertsByDedupeKey.mock.calls[0];
    expect([key, actor, transport]).toEqual(['disk-tiering-moved-day:phase15b_dbs_telemetry:rolling_30d', 'drift-dashboard-moved-day', 'engine']);
  });

  it('missing from disk but NOT in the manifest (no data that day) resolves rather than alerting', async () => {
    const dir = path.join(tmp, 'c'); fs.mkdirSync(dir);
    execute.mockResolvedValue({ rows: [] });
    await mod.runCheck(dir, 'rolling_7d', start, end);
    expect(addAlert).not.toHaveBeenCalled();
    expect(resolveAlertsByDedupeKey).toHaveBeenCalledTimes(1);
  });
});
