/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0b — N4 boundary tests for `isXstockMarketOpenUTC`
 * (UPDATED 2026-05-10 by B79.0L for Fri 8PM ET → Sun 8PM ET close window)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Schedule under test (B79.0L correction per Kyle directive 2026-05-10):
 *   - CLOSED Saturday all day (in ET) — fully inside the weekend window
 *   - CLOSED Friday from 8 PM ET (= 00:00 UTC Sat in EDT, 01:00 UTC Sat in EST)
 *   - CLOSED Sunday before 8 PM ET (= before 00:00 UTC Mon EDT, before 01:00 UTC Mon EST)
 *   - OPEN otherwise
 *
 * Test fixtures use May 2026 dates (EDT, UTC-4): so Fri 8 PM ET = 00:00 UTC Sat,
 * and Sun 8 PM ET = 00:00 UTC Mon.
 *
 * Phase-1 extended-hours name behavior is covered by
 * b79-0c-market-hours-per-symbol.test.ts and b79-0L-market-hours-extended-hours.test.ts.
 *
 * B79.0c (2026-05-09) — signature: symbol is REQUIRED (Langston Q4 push-back).
 *
 * Tests inject controlled clocks (no `new Date()` at runtime) for deterministic
 * boundary verification.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { isXstockMarketOpenUTC } from '../../asset_classes/xstock_spot/market-hours.js';

// Reference dates (UTC) — anchored to a known week so days-of-week are stable.
// 2026-05-04 = Monday, 2026-05-09 = Saturday, 2026-05-10 = Sunday, 2026-05-08 = Friday.
function utc(year: number, monthZero: number, day: number, hour: number, min: number = 0): Date {
  return new Date(Date.UTC(year, monthZero, day, hour, min));
}

// Sample non-24/7 xstock symbol — AMZN trades 24/5 on Kraken (not in
// XSTOCK_SPOT_24_7_SYMBOLS), so applies the ARCA schedule under test.
const ARCA_SYM = 'AMZN/USD';

describe('B79.0b — isXstockMarketOpenUTC boundary cases (ARCA 24/5)', () => {
  describe('Weekday during market hours', () => {
    it('Monday 14:30 UTC — open', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 4, 14, 30))).toBe(true);
    });
    it('Wednesday 16:00 UTC — open', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 6, 16, 0))).toBe(true);
    });
    it('Friday 14:30 UTC (before close) — open', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 8, 14, 30))).toBe(true);
    });
  });

  describe('Friday close transition', () => {
    it('Friday 21:59 UTC — open (one minute before close)', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 8, 21, 59))).toBe(true);
    });
    it('Friday 22:00 UTC — closed (close boundary)', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 8, 22, 0))).toBe(false);
    });
    it('Friday 23:00 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 8, 23, 0))).toBe(false);
    });
  });

  describe('Saturday — fully closed', () => {
    it('Saturday 00:00 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 9, 0, 0))).toBe(false);
    });
    it('Saturday 14:30 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 9, 14, 30))).toBe(false);
    });
    it('Saturday 23:59 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 9, 23, 59))).toBe(false);
    });
  });

  describe('Sunday open transition (B79.0L: 20:00 ET = 00:00 UTC Mon EDT — UPDATED from old 22:00 UTC)', () => {
    it('Sunday 14:30 UTC — closed (before open)', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 10, 14, 30))).toBe(false);
    });
    it('Sunday 21:59 UTC — closed (still inside unified weekend window; was true under pre-B79.0L)', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 10, 21, 59))).toBe(false);
    });
    it('Sunday 22:00 UTC — closed (was OPEN under pre-B79.0L; corrected by B79.0L Langston R1)', () => {
      // 2026-05-10 22:00 UTC = 18:00 EDT (Sun 6 PM ET) — inside unified weekend window (Sun before 20:00 ET).
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 10, 22, 0))).toBe(false);
    });
    it('Sunday 23:00 UTC — closed (was OPEN under pre-B79.0L; corrected by B79.0L Langston R1)', () => {
      // 2026-05-10 23:00 UTC = 19:00 EDT (Sun 7 PM ET) — still inside unified weekend window.
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 10, 23, 0))).toBe(false);
    });
    it('Monday 00:00 UTC (= Sun 20:00 EDT, 8 PM ET) — OPEN at unified reopen boundary', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 11, 0, 0))).toBe(true);
    });
    it('Monday 02:00 UTC (= Sun 22:00 EDT, 10 PM ET) — OPEN', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 11, 2, 0))).toBe(true);
    });
  });

  describe('Wall-clock smoke (no injected time)', () => {
    it('returns a boolean for non-24/7 sample symbol', () => {
      const result = isXstockMarketOpenUTC(ARCA_SYM);
      expect(typeof result).toBe('boolean');
    });
  });
});
