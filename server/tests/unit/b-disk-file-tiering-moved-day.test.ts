import { describe, expect, it } from 'vitest';

// B-DISK-FILE-TIERING (#1233, pre-audit P6): the Drift Dashboard's expected-day arithmetic. The
// reader keeps a day file when dayStart + 1 day >= startMs and dayStart <= endMs; the check must
// expect exactly those names, so a moved day is noticed and an unwanted day is never asked about.
// The module imports the app's db, so these pure functions are tested through a dynamic import
// with the db module stubbed.
import { vi } from 'vitest';
vi.mock('../../db', () => ({ db: { execute: vi.fn() } }));

const mod = await import('../../services/data-archive/moved-day-check.js');

describe('expectedDayFiles — the same days the reader would select', () => {
  it('a 30-day window ending mid-day expects 31 day files, the first being the partial day', () => {
    const end = Date.parse('2026-11-04T15:00:00Z');
    const days = mod.expectedDayFiles(end - 30 * 86_400_000, end);
    expect(days.length).toBe(31);
    expect(days[0]).toBe('2026-10-05.jsonl');
    expect(days[days.length - 1]).toBe('2026-11-04.jsonl');
  });
  it('a window inside one day expects that day only', () => {
    expect(mod.expectedDayFiles(Date.parse('2026-11-04T01:00:00Z'), Date.parse('2026-11-04T02:00:00Z'))).toEqual(['2026-11-04.jsonl']);
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
