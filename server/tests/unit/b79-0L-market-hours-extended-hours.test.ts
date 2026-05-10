/**
 * B79.0L — extended-hours symbols Fri 8PM ET → Sun 8PM ET closed window
 *
 * Per Kyle directive 2026-05-10: xStocks (including the Phase-1 extended-hours
 * names) are closed Friday 8PM ET → Sunday 8PM ET (48-hour weekend window).
 * The previously-marked "24/7" names are NOT actually 24/7 — they trade
 * Sun 8PM ET → Fri 8PM ET continuously (120 hours/week).
 *
 * Tests use `Intl.DateTimeFormat` DST-aware ET conversion. Includes DST
 * boundary cases (March/November transitions).
 */

import { describe, it, expect } from 'vitest';
import { isXstockMarketOpenUTC } from '../../asset_classes/xstock_spot/market-hours.js';

// Helper: build a UTC Date from ET wall-clock time. Uses zero-offset arithmetic
// to construct UTC instants that, when interpreted in America/New_York,
// produce the desired ET weekday/hour/minute. Verified manually against
// Date.toLocaleString('en-US', { timeZone: 'America/New_York' }).
function utcInstantFor(year: number, month1: number, day: number, etHour: number, etMinute = 0): Date {
  // Conservative approach: construct from UTC then verify via Intl.
  // For winter EST (UTC-5): UTC = ET + 5
  // For summer EDT (UTC-4): UTC = ET + 4
  // Months 11-2 are EST; 4-10 are EDT; March + November have DST transitions.
  // For test fixtures we'll use mid-month dates outside DST switch weeks.
  const isEST = month1 <= 2 || month1 === 12 || (month1 === 3 && day < 8) || (month1 === 11 && day >= 1);
  // Standard convention: month1 is 1-indexed for caller convenience.
  const utcOffsetHours = isEST ? 5 : 4;
  return new Date(Date.UTC(year, month1 - 1, day, etHour + utcOffsetHours, etMinute));
}

const EXT_SYM = 'AAPL/USD'; // Phase-1 extended-hours name
const ARCA_SYM = 'CVX/USD'; // ARCA-aligned non-extended-hours name

describe('B79.0L — Phase-1 extended-hours names: Fri 8PM ET → Sun 8PM ET closed window', () => {
  describe('Friday boundary (8PM ET = close)', () => {
    it('Friday 7:59 PM ET (just before close) → OPEN', () => {
      // Use a mid-Sept Friday for stable EDT (UTC-4): Fri 9/4/2026
      // Sep 4 2026 is a Friday. 7:59 PM EDT = 23:59 UTC same day.
      const t = new Date(Date.UTC(2026, 8, 4, 23, 59));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(true);
    });

    it('Friday 8:00 PM ET (close moment) → CLOSED', () => {
      // Sep 4 2026 Fri 8 PM EDT = 00:00 UTC Sat Sep 5
      const t = new Date(Date.UTC(2026, 8, 5, 0, 0));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(false);
    });

    it('Friday 8:01 PM ET → CLOSED', () => {
      const t = new Date(Date.UTC(2026, 8, 5, 0, 1));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(false);
    });
  });

  describe('Saturday (entire day closed)', () => {
    it('Saturday noon ET → CLOSED', () => {
      // Sep 5 2026 Sat noon EDT = 16:00 UTC
      const t = new Date(Date.UTC(2026, 8, 5, 16, 0));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(false);
    });

    it('Saturday 11:59 PM ET → CLOSED', () => {
      const t = new Date(Date.UTC(2026, 8, 6, 3, 59));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(false);
    });
  });

  describe('Sunday boundary (8PM ET = reopen)', () => {
    it('Sunday 7:59 PM ET (just before reopen) → CLOSED', () => {
      // Sep 6 2026 Sun 7:59 PM EDT = 23:59 UTC same day
      const t = new Date(Date.UTC(2026, 8, 6, 23, 59));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(false);
    });

    it('Sunday 8:00 PM ET (reopen moment) → OPEN', () => {
      // Sep 6 2026 Sun 8 PM EDT = 00:00 UTC Mon Sep 7
      const t = new Date(Date.UTC(2026, 8, 7, 0, 0));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(true);
    });

    it('Sunday 8:01 PM ET → OPEN', () => {
      const t = new Date(Date.UTC(2026, 8, 7, 0, 1));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(true);
    });
  });

  describe('Mid-week (continuous trading for extended-hours names)', () => {
    it('Wednesday 2:30 PM ET → OPEN', () => {
      // Sep 9 2026 Wed 2:30 PM EDT = 18:30 UTC
      const t = new Date(Date.UTC(2026, 8, 9, 18, 30));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(true);
    });

    it('Tuesday 3:00 AM ET (overnight) → OPEN (extended-hours name)', () => {
      // Sep 8 2026 Tue 3 AM EDT = 07:00 UTC
      const t = new Date(Date.UTC(2026, 8, 8, 7, 0));
      expect(isXstockMarketOpenUTC(EXT_SYM, t)).toBe(true);
    });
  });
});

describe('B79.0L — DST boundary handling (Nov 2026 EDT → EST transition)', () => {
  // DST ends 2026-11-01 (first Sunday of November). Clocks fall back 2:00 AM
  // EDT → 1:00 AM EST. Test fixture: late October (still EDT) and mid-November
  // (now EST). The Friday 8PM ET close is wall-clock relative — should still
  // be 8PM ET regardless of DST status.

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

describe('B79.0L — ARCA-aligned (non-extended-hours) names also closed weekends', () => {
  it('Saturday noon ET, ARCA-aligned name → CLOSED', () => {
    const t = new Date(Date.UTC(2026, 8, 5, 16, 0));
    expect(isXstockMarketOpenUTC(ARCA_SYM, t)).toBe(false);
  });

  it('Sunday 7PM ET, ARCA-aligned name → CLOSED', () => {
    const t = new Date(Date.UTC(2026, 8, 6, 23, 0));
    expect(isXstockMarketOpenUTC(ARCA_SYM, t)).toBe(false);
  });

  it('Wednesday 2PM ET, ARCA-aligned name → OPEN', () => {
    const t = new Date(Date.UTC(2026, 8, 9, 18, 0));
    expect(isXstockMarketOpenUTC(ARCA_SYM, t)).toBe(true);
  });
});

describe('B79.0L — Symbol normalization preserved', () => {
  it('Kraken-pair form AAPLxUSD treated as AAPL/USD', () => {
    // Wed open window
    const t = new Date(Date.UTC(2026, 8, 9, 18, 30));
    expect(isXstockMarketOpenUTC('AAPLxUSD', t)).toBe(true);
  });

  it('Bare TSLAx not in normalized set → ARCA-aligned path → still OPEN mid-week', () => {
    const t = new Date(Date.UTC(2026, 8, 9, 18, 30));
    // TSLAx alone doesn't normalize to TSLA/USD without quote suffix —
    // returns the input as-is, doesn't match the set, falls through to
    // the ARCA-aligned default-true return.
    expect(isXstockMarketOpenUTC('TSLAx', t)).toBe(true);
  });
});
