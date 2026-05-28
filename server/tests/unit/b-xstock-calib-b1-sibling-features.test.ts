/**
 * B-XSTOCK-CALIB B.1 sub-batch — Sibling-feature unit tests
 *
 * Covers:
 *   - getTimeOfDayClass — NYSE-clock bucket boundaries (pre_open/open_hour/
 *     mid_morning/lunch/mid_afternoon/close_hour/after_close)
 *   - isRebalanceDay — Russell quarterly (last Friday of Mar/Jun/Sep/Dec)
 *
 * Both helpers are leaf modules (no imports) per scope §6.1+§6.3.
 */

import { describe, it, expect } from 'vitest';
import { getTimeOfDayClass } from '../../asset_classes/xstock_spot/time-of-day.js';
import { isRebalanceDay } from '../../asset_classes/xstock_spot/calendar.js';

describe('getTimeOfDayClass — NYSE clock buckets', () => {
  // Note: 2026-05-15 is a non-DST day in EDT (UTC-4). 09:30 ET = 13:30 UTC.
  // 2026-01-15 is EST (UTC-5). 09:30 ET = 14:30 UTC.

  it('returns pre_open for 13:00 UTC on EDT day (09:00 ET)', () => {
    expect(getTimeOfDayClass(new Date('2026-05-15T13:00:00Z'))).toBe('pre_open');
  });

  it('returns open_hour for 13:30 UTC on EDT day (09:30 ET)', () => {
    expect(getTimeOfDayClass(new Date('2026-05-15T13:30:00Z'))).toBe('open_hour');
  });

  it('returns open_hour for 14:25 UTC on EDT day (10:25 ET)', () => {
    expect(getTimeOfDayClass(new Date('2026-05-15T14:25:00Z'))).toBe('open_hour');
  });

  it('returns mid_morning for 14:30 UTC on EDT day (10:30 ET)', () => {
    expect(getTimeOfDayClass(new Date('2026-05-15T14:30:00Z'))).toBe('mid_morning');
  });

  it('returns lunch for 16:00 UTC on EDT day (12:00 ET)', () => {
    expect(getTimeOfDayClass(new Date('2026-05-15T16:00:00Z'))).toBe('lunch');
  });

  it('returns mid_afternoon for 17:30 UTC on EDT day (13:30 ET)', () => {
    expect(getTimeOfDayClass(new Date('2026-05-15T17:30:00Z'))).toBe('mid_afternoon');
  });

  it('returns close_hour for 19:00 UTC on EDT day (15:00 ET)', () => {
    expect(getTimeOfDayClass(new Date('2026-05-15T19:00:00Z'))).toBe('close_hour');
  });

  it('returns after_close for 20:00 UTC on EDT day (16:00 ET)', () => {
    expect(getTimeOfDayClass(new Date('2026-05-15T20:00:00Z'))).toBe('after_close');
  });

  it('handles EST/winter correctly: 14:30 UTC on EST day (09:30 ET) = open_hour', () => {
    expect(getTimeOfDayClass(new Date('2026-01-15T14:30:00Z'))).toBe('open_hour');
  });

  it('accepts numeric ms-epoch input', () => {
    const ms = new Date('2026-05-15T14:30:00Z').getTime();
    expect(getTimeOfDayClass(ms)).toBe('mid_morning');
  });
});

describe('isRebalanceDay — Russell quarterly', () => {
  // Russell quarterly: last Friday of Jun/Sep/Dec/Mar.
  // 2026-06-26 (Fri) — last Friday of June 2026 → true.
  // 2026-06-19 (Fri) — second-to-last Friday → false.
  // 2026-09-25 (Fri) — last Friday of Sep 2026 → true.
  // 2026-12-25 (Fri/Christmas) — last Friday of Dec 2026 → true (calendar
  //   logic only; holiday market-closure is orthogonal).
  // 2027-03-26 (Fri) — last Friday of Mar 2027 → true.

  it('returns true for 2026-06-26 (last Friday of June 2026)', () => {
    expect(isRebalanceDay(new Date('2026-06-26T18:00:00Z'))).toBe(true);
  });

  it('returns false for 2026-06-19 (second-to-last Friday of June 2026)', () => {
    expect(isRebalanceDay(new Date('2026-06-19T18:00:00Z'))).toBe(false);
  });

  it('returns true for 2026-09-25 (last Friday of September 2026)', () => {
    expect(isRebalanceDay(new Date('2026-09-25T18:00:00Z'))).toBe(true);
  });

  it('returns true for 2026-12-25 (last Friday of December 2026)', () => {
    expect(isRebalanceDay(new Date('2026-12-25T18:00:00Z'))).toBe(true);
  });

  it('returns true for 2027-03-26 (last Friday of March 2027)', () => {
    expect(isRebalanceDay(new Date('2027-03-26T18:00:00Z'))).toBe(true);
  });

  it('returns false for 2026-05-15 (Friday but not a Russell month)', () => {
    expect(isRebalanceDay(new Date('2026-05-15T18:00:00Z'))).toBe(false);
  });

  it('returns false for 2026-06-25 (Thursday before last Friday of June)', () => {
    expect(isRebalanceDay(new Date('2026-06-25T18:00:00Z'))).toBe(false);
  });

  it('returns false for 2026-07-31 (last Friday of July, not Russell month)', () => {
    expect(isRebalanceDay(new Date('2026-07-31T18:00:00Z'))).toBe(false);
  });

  it('accepts numeric ms-epoch input', () => {
    const ms = new Date('2026-06-26T18:00:00Z').getTime();
    expect(isRebalanceDay(ms)).toBe(true);
  });
});
