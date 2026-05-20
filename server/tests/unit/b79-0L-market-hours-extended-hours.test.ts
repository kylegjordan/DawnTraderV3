/**
 * B79.0L / B-NEW-36 sub-batch (c) — unified xStock weekend close window.
 *
 * Per B-NEW-36 sub-batch (c) (2026-05-20): all xStocks share identical
 * hours per empirical Q9 verification. Predicate returns true iff `now` is
 * OUTSIDE the unified weekend close (Fri 8PM ET → Sun 8PM ET). Symbol
 * parameter is kept in the signature for backward compat but no longer
 * consulted internally.
 *
 * Original B79.0L file scope: per-symbol "Phase-1 extended-hours" tests +
 * ARCA-aligned tests. Per-symbol distinction REMOVED — the previously-marked
 * 10 names now behave identically to the other ~255.
 *
 * Tests use `Intl.DateTimeFormat` DST-aware ET conversion. Includes DST
 * boundary cases (March/November transitions).
 */

import { describe, it, expect } from 'vitest';
import { isXstockMarketOpenUTC } from '../../asset_classes/xstock_spot/market-hours.js';

const FORMERLY_EXT_SYM = 'AAPL/USD'; // formerly designated Phase-1; now identical to all
const FORMERLY_ARCA_SYM = 'CVX/USD'; // formerly designated ARCA-aligned; now identical to all

describe('B79.0L / B-NEW-36 (c) — unified Fri 8PM ET → Sun 8PM ET closed window', () => {
  describe('Friday boundary (8PM ET = close)', () => {
    it('Friday 7:59 PM ET (just before close) → OPEN', () => {
      // Use a mid-Sept Friday for stable EDT (UTC-4): Fri 9/4/2026
      // Sep 4 2026 is a Friday. 7:59 PM EDT = 23:59 UTC same day.
      const t = new Date(Date.UTC(2026, 8, 4, 23, 59));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(true);
    });

    it('Friday 8:00 PM ET (close moment) → CLOSED', () => {
      // Sep 4 2026 Fri 8 PM EDT = 00:00 UTC Sat Sep 5
      const t = new Date(Date.UTC(2026, 8, 5, 0, 0));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(false);
    });

    it('Friday 8:01 PM ET → CLOSED', () => {
      const t = new Date(Date.UTC(2026, 8, 5, 0, 1));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(false);
    });
  });

  describe('Saturday (entire day closed)', () => {
    it('Saturday noon ET → CLOSED', () => {
      // Sep 5 2026 Sat noon EDT = 16:00 UTC
      const t = new Date(Date.UTC(2026, 8, 5, 16, 0));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(false);
    });

    it('Saturday 11:59 PM ET → CLOSED', () => {
      const t = new Date(Date.UTC(2026, 8, 6, 3, 59));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(false);
    });
  });

  describe('Sunday boundary (8PM ET = reopen)', () => {
    it('Sunday 7:59 PM ET (just before reopen) → CLOSED', () => {
      // Sep 6 2026 Sun 7:59 PM EDT = 23:59 UTC same day
      const t = new Date(Date.UTC(2026, 8, 6, 23, 59));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(false);
    });

    it('Sunday 8:00 PM ET (reopen moment) → OPEN', () => {
      // Sep 6 2026 Sun 8 PM EDT = 00:00 UTC Mon Sep 7
      const t = new Date(Date.UTC(2026, 8, 7, 0, 0));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(true);
    });

    it('Sunday 8:01 PM ET → OPEN', () => {
      const t = new Date(Date.UTC(2026, 8, 7, 0, 1));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(true);
    });
  });

  describe('Mid-week (continuous trading)', () => {
    it('Wednesday 2:30 PM ET → OPEN', () => {
      // Sep 9 2026 Wed 2:30 PM EDT = 18:30 UTC
      const t = new Date(Date.UTC(2026, 8, 9, 18, 30));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(true);
    });

    it('Tuesday 3:00 AM ET (overnight pre-market) → OPEN', () => {
      // Sep 8 2026 Tue 3 AM EDT = 07:00 UTC
      const t = new Date(Date.UTC(2026, 8, 8, 7, 0));
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t)).toBe(true);
    });
  });
});

describe('B79.0L — DST boundary handling (Nov 2026 EDT → EST transition)', () => {
  // DST ends 2026-11-01 (first Sunday of November). Clocks fall back 2:00 AM
  // EDT → 1:00 AM EST. The Friday 8PM ET close is wall-clock relative — should
  // still be 8PM ET regardless of DST status.

  it('Friday 8PM EDT (late October) → CLOSED', () => {
    // Oct 30 2026 Fri 8 PM EDT = 00:00 UTC Sat Oct 31
    const t = new Date(Date.UTC(2026, 9, 31, 0, 0));
    expect(isXstockMarketOpenUTC('AAPL/USD', t)).toBe(false);
  });

  it('Friday 8PM EST (mid November) → CLOSED', () => {
    // Nov 13 2026 Fri 8 PM EST = 01:00 UTC Sat Nov 14
    const t = new Date(Date.UTC(2026, 10, 14, 1, 0));
    expect(isXstockMarketOpenUTC('AAPL/USD', t)).toBe(false);
  });

  it('Sunday 8PM EST (mid November) → OPEN', () => {
    // Nov 15 2026 Sun 8 PM EST = 01:00 UTC Mon Nov 16
    const t = new Date(Date.UTC(2026, 10, 16, 1, 0));
    expect(isXstockMarketOpenUTC('AAPL/USD', t)).toBe(true);
  });
});

describe('B-NEW-36 sub-batch (c) — all symbols treated identically', () => {
  // Empirical Q9 (verified 2026-05-20): the 10 previously-designated
  // "extended-hours" names (AAPL/CRCL/GLD/GOOGL/HOOD/MSTR/NVDA/QQQ/SPY/TSLA)
  // showed ZERO bucket activity in the weekend window. They behave
  // IDENTICALLY to the other ~255 xStocks. The tests below regression-lock
  // that the predicate no longer treats them differently.

  const TEST_TIMES = [
    // [description, UTC Date, expected]
    ['Mon 10:00 ET (RTH)',           new Date(Date.UTC(2026, 8, 7, 14, 0)),  true],
    ['Wed 3:00 AM ET (overnight)',   new Date(Date.UTC(2026, 8, 9, 7, 0)),   true],
    ['Fri 7:59 PM ET',               new Date(Date.UTC(2026, 8, 4, 23, 59)), true],
    ['Fri 8:00 PM ET (close)',       new Date(Date.UTC(2026, 8, 5, 0, 0)),   false],
    ['Sat noon ET',                  new Date(Date.UTC(2026, 8, 5, 16, 0)),  false],
    ['Sun 7:59 PM ET',               new Date(Date.UTC(2026, 8, 6, 23, 59)), false],
    ['Sun 8:00 PM ET (reopen)',      new Date(Date.UTC(2026, 8, 7, 0, 0)),   true],
  ] as const;

  for (const [label, t, expected] of TEST_TIMES) {
    it(`formerly-Phase-1 (AAPL/USD) and formerly-ARCA (CVX/USD) match at ${label}`, () => {
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t as Date)).toBe(expected);
      expect(isXstockMarketOpenUTC(FORMERLY_ARCA_SYM, t as Date)).toBe(expected);
      // Sanity: both produce the same answer.
      expect(isXstockMarketOpenUTC(FORMERLY_EXT_SYM, t as Date)).toBe(
        isXstockMarketOpenUTC(FORMERLY_ARCA_SYM, t as Date),
      );
    });
  }
});
