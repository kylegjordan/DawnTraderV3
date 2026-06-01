/**
 * B-NEW-47 — retention-sweep pure-helper regression-lock (RUNNING_ISSUES #161).
 *
 * Locks the whole-vs-sliced decision, UTC day enumeration, day labelling, and
 * the resume invariant guard (a month is EITHER one `YYYY-MM` object OR N
 * `YYYY-MM-DD` slices — never both). No DB / network.
 */

import { describe, it, expect } from 'vitest';
import {
  decideSliceMode,
  enumerateUtcDays,
  dayLabel,
  deriveModeFromLabels,
} from '../../services/data-archive/sweep-slicing.js';

const GB = 1024 * 1024 * 1024;
const THRESHOLD = 3 * GB;

describe('B-NEW-47 decideSliceMode', () => {
  it('below threshold → whole', () => {
    expect(decideSliceMode(2 * GB, THRESHOLD)).toBe('whole');
    expect(decideSliceMode(0, THRESHOLD)).toBe('whole');
    expect(decideSliceMode(THRESHOLD - 1, THRESHOLD)).toBe('whole');
  });
  it('at/above threshold → sliced', () => {
    expect(decideSliceMode(THRESHOLD, THRESHOLD)).toBe('sliced');
    expect(decideSliceMode(31 * GB, THRESHOLD)).toBe('sliced'); // the 31 GB May ticker partition
    expect(decideSliceMode(5 * GB, THRESHOLD)).toBe('sliced');
  });
});

describe('B-NEW-47 enumerateUtcDays', () => {
  it('enumerates each UTC day-start in [start, end)', () => {
    const start = new Date('2026-05-01T00:00:00Z');
    const end = new Date('2026-06-01T00:00:00Z');
    const days = enumerateUtcDays(start, end);
    expect(days).toHaveLength(31); // May has 31 days
    expect(days[0].toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(days[30].toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });
  it('end-exclusive (does not include rangeEnd day)', () => {
    const days = enumerateUtcDays(new Date('2026-04-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'));
    expect(days).toHaveLength(30); // April
    expect(days.at(-1)!.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });
  it('handles a start that is not a day boundary by flooring to the UTC day', () => {
    const days = enumerateUtcDays(new Date('2026-05-15T13:45:00Z'), new Date('2026-05-18T00:00:00Z'));
    expect(days.map((d) => d.toISOString())).toEqual([
      '2026-05-15T00:00:00.000Z',
      '2026-05-16T00:00:00.000Z',
      '2026-05-17T00:00:00.000Z',
    ]);
  });
});

describe('B-NEW-47 dayLabel', () => {
  it('formats YYYY-MM-DD with zero-padding', () => {
    expect(dayLabel(new Date('2026-05-01T00:00:00Z'))).toBe('2026-05-01');
    expect(dayLabel(new Date('2026-12-09T00:00:00Z'))).toBe('2026-12-09');
  });
});

describe('B-NEW-47 deriveModeFromLabels (resume invariant guard)', () => {
  it('no existing labels → null (fresh decision)', () => {
    expect(deriveModeFromLabels('2026-05', [])).toBeNull();
  });
  it('month label present → whole', () => {
    expect(deriveModeFromLabels('2026-05', ['2026-05'])).toBe('whole');
  });
  it('day-slice labels present → sliced', () => {
    expect(deriveModeFromLabels('2026-05', ['2026-05-01', '2026-05-02'])).toBe('sliced');
  });
  it('does NOT treat a different month as this month', () => {
    // '2026-05-01' belongs to month '2026-05', not '2026-04'
    expect(deriveModeFromLabels('2026-04', ['2026-05-01'])).toBeNull();
  });
  it('BOTH month + day labels → throws (corrupt half-state)', () => {
    expect(() => deriveModeFromLabels('2026-05', ['2026-05', '2026-05-03'])).toThrow(/INVARIANT VIOLATION/);
  });
});
