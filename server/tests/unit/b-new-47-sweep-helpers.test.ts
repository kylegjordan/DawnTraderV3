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
  classifyPartition,
  isPartitionEligible,
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

// ─────────────────────────────────────────────────────────────────────────────
// B-STORAGE-HARDEN Wave D (OBJ-3) — daily-vs-monthly partition classification
// Golden-fixture lock on BOTH child-name shapes (Langston Wave-D req #4). The
// load-bearing invariant: DAILY (`…_YYYY_MM_DD`) is parsed FIRST so a daily
// name's trailing `_DD` is NEVER mis-read as a month (that mis-parse would tier
// a single day as a whole month = silent mis-tier / data loss).
// ─────────────────────────────────────────────────────────────────────────────

describe('B-STORAGE-HARDEN Wave D classifyPartition', () => {
  it('MONTHLY name → kind=monthly, YYYY-MM label, whole-month range', () => {
    const p = classifyPartition('xstock_spot_ticker_snap_2026_07')!;
    expect(p.kind).toBe('monthly');
    expect(p.partitionLabel).toBe('2026-07');
    expect(p.rangeStart.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(p.rangeEnd.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('DAILY name → kind=daily, YYYY-MM-DD label, single-day range', () => {
    const p = classifyPartition('xstock_spot_ticker_snap_2026_08_01')!;
    expect(p.kind).toBe('daily');
    expect(p.partitionLabel).toBe('2026-08-01');
    expect(p.rangeStart.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(p.rangeEnd.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('★ a DAILY name is NEVER mis-classified as monthly (daily tested first)', () => {
    const p = classifyPartition('xstock_spot_ticker_snap_2026_08_01')!;
    expect(p.kind).toBe('daily'); // not 'monthly'
    expect(p.partitionLabel).not.toBe('2026-08'); // must not read _08 as a month
  });

  it('★ a MONTHLY name is NEVER mis-classified as daily', () => {
    expect(classifyPartition('xstock_spot_ticker_snap_2026_07')!.kind).toBe('monthly');
  });

  it('daily month-end rolls to the next month (2026-08-31 → [.., 2026-09-01))', () => {
    const p = classifyPartition('xstock_spot_ticker_snap_2026_08_31')!;
    expect(p.rangeStart.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(p.rangeEnd.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('daily December rolls to the next year', () => {
    const p = classifyPartition('xstock_spot_ticker_snap_2026_12_31')!;
    expect(p.rangeEnd.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('B70 monthly analytics table name classifies as monthly', () => {
    const p = classifyPartition('signal_eval_archive_2026_05')!;
    expect(p.kind).toBe('monthly');
    expect(p.partitionLabel).toBe('2026-05');
  });

  it('a table name with an embedded digit run is not confused (ohlc_1m monthly)', () => {
    const p = classifyPartition('xstock_spot_ohlc_1m_2026_07')!;
    expect(p.kind).toBe('monthly');
    expect(p.partitionLabel).toBe('2026-07'); // the `1m` is not captured as the year
  });

  it('a table name with an embedded digit run is not confused (ohlc_1m daily)', () => {
    const p = classifyPartition('xstock_spot_ohlc_1m_2026_08_05')!;
    expect(p.kind).toBe('daily');
    expect(p.partitionLabel).toBe('2026-08-05');
  });

  it('the bare parent name (no date suffix) → null', () => {
    expect(classifyPartition('xstock_spot_ticker_snap')).toBeNull();
  });

  it('an impossible calendar date → null (rejects _02_30 and _13_01)', () => {
    expect(classifyPartition('xstock_spot_ticker_snap_2026_02_30')).toBeNull();
    expect(classifyPartition('xstock_spot_ticker_snap_2026_13_01')).toBeNull();
    expect(classifyPartition('xstock_spot_ticker_snap_2026_13')).toBeNull(); // bad month, monthly shape
  });
});

describe('B-STORAGE-HARDEN Wave D isPartitionEligible', () => {
  // retention 30d, "now" = 2026-09-15 → cutoff = 2026-08-16, cutoffMonth = 2026-08-01
  const cutoff = new Date('2026-08-16T00:00:00Z');
  const cutoffMonth = new Date('2026-08-01T00:00:00Z');

  it('MONTHLY eligible when its whole month is before the cutoff month', () => {
    const july = classifyPartition('xstock_spot_ticker_snap_2026_07')!;
    expect(isPartitionEligible(july, cutoff, cutoffMonth)).toBe(true);
  });

  it('MONTHLY NOT eligible for the cutoff month itself (not write-sealed)', () => {
    const aug = classifyPartition('xstock_spot_ticker_snap_2026_08')!;
    expect(isPartitionEligible(aug, cutoff, cutoffMonth)).toBe(false);
  });

  it('DAILY eligible when the whole day is at/older than the day-granular cutoff', () => {
    // 2026-08-14 → rangeEnd 2026-08-15 <= cutoff 2026-08-16 → eligible
    const d = classifyPartition('xstock_spot_ticker_snap_2026_08_14')!;
    expect(isPartitionEligible(d, cutoff, cutoffMonth)).toBe(true);
  });

  it('DAILY boundary: rangeEnd exactly == cutoff → eligible', () => {
    // 2026-08-15 → rangeEnd 2026-08-16 == cutoff → eligible (<=)
    const d = classifyPartition('xstock_spot_ticker_snap_2026_08_15')!;
    expect(isPartitionEligible(d, cutoff, cutoffMonth)).toBe(true);
  });

  it('DAILY NOT eligible when the day is too young (rangeEnd > cutoff)', () => {
    // 2026-08-16 → rangeEnd 2026-08-17 > cutoff 2026-08-16 → NOT eligible
    const d = classifyPartition('xstock_spot_ticker_snap_2026_08_16')!;
    expect(isPartitionEligible(d, cutoff, cutoffMonth)).toBe(false);
  });

  it('★ adversarial MIXED-shape pass: monthly + daily children in one sweep, each tiers on its OWN rule', () => {
    // The literal Aug–Oct transition-window reality: old monthly partitions and
    // new daily partitions co-exist under the same parent. Prove each is
    // classified + tiered on its own granularity in a single pass (Langston Q4).
    const children = [
      'xstock_spot_ticker_snap_2026_07',    // monthly, before cutoffMonth → tier
      'xstock_spot_ticker_snap_2026_08',    // monthly, the cutoff month itself → NOT yet
      'xstock_spot_ticker_snap_2026_08_14', // daily, whole day past cutoff → tier
      'xstock_spot_ticker_snap_2026_08_16', // daily, too young → NOT yet
    ];
    const tiered = children
      .map((c) => ({ c, p: classifyPartition(c)! }))
      .filter(({ p }) => isPartitionEligible(p, cutoff, cutoffMonth))
      .map(({ c, p }) => `${c}:${p.kind}`);
    // Exactly the July monthly + the Aug-14 daily tier this pass; nothing mis-fires.
    expect(tiered).toEqual([
      'xstock_spot_ticker_snap_2026_07:monthly',
      'xstock_spot_ticker_snap_2026_08_14:daily',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B-STORAGE-HARDEN Wave D — daily partition through the MONTH-ORIENTED machinery
// (Langston Step-4 Finding-1). Daily correctness in b75-retention-sweep is
// EMERGENT: a daily PartitionRow flows through listMonthLabels /
// deriveModeFromLabels / enumerateUtcDays, all of which are month-oriented, and
// works ONLY because a daily partition spans exactly one UTC day so every label
// converges to the single day label. Lock that convergence so a future refactor
// of those helpers can't silently break the daily path.
// ─────────────────────────────────────────────────────────────────────────────

describe('B-STORAGE-HARDEN Wave D daily-partition ↔ month-machinery convergence', () => {
  it('a daily partition spans exactly ONE UTC day whose dayLabel == partitionLabel', () => {
    const p = classifyPartition('xstock_spot_ticker_snap_2026_08_14')!;
    const days = enumerateUtcDays(p.rangeStart, p.rangeEnd);
    expect(days).toHaveLength(1);
    expect(dayLabel(days[0])).toBe(p.partitionLabel); // '2026-08-14'
  });

  it('deriveModeFromLabels never trips the month+day mixing guard for a daily label', () => {
    const label = classifyPartition('xstock_spot_ticker_snap_2026_08_14')!.partitionLabel;
    expect(deriveModeFromLabels(label, [])).toBeNull();       // fresh
    expect(deriveModeFromLabels(label, [label])).toBe('whole'); // one existing object → whole, no throw
  });

  it('listMonthLabels-style matching for a daily label matches ONLY itself (no sibling-day bleed)', () => {
    // The sweep queries `partition_label = $2 OR partition_label LIKE '$2-%'`.
    // For a daily label, that must match itself and NOT a neighbouring day.
    const label = classifyPartition('xstock_spot_ticker_snap_2026_08_14')!.partitionLabel;
    const matches = (candidate: string) => candidate === label || candidate.startsWith(`${label}-`);
    expect(matches('2026-08-14')).toBe(true);
    expect(matches('2026-08-15')).toBe(false);
    expect(matches('2026-08')).toBe(false); // the month label must not sweep the day
  });
});
