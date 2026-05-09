/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0b — N4 boundary tests for `isXstockMarketOpenUTC` (ARCA 24/5 schedule)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Schedule under test for non-24/7 names (ARCA-aligned, UTC):
 *   - CLOSED Saturday all day
 *   - CLOSED Friday from 22:00 UTC onward
 *   - CLOSED Sunday before 22:00 UTC
 *   - OPEN otherwise
 *
 * 24/7-name behavior is covered by b79-0c-market-hours-per-symbol.test.ts.
 *
 * B79.0c (2026-05-09) — signature changed: symbol is now REQUIRED
 * (Langston Q4 push-back). Tests pass a non-24/7 sample symbol (`AMZN/USD`).
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

  describe('Sunday open transition', () => {
    it('Sunday 14:30 UTC — closed (before open)', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 10, 14, 30))).toBe(false);
    });
    it('Sunday 21:59 UTC — closed (one minute before open)', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 10, 21, 59))).toBe(false);
    });
    it('Sunday 22:00 UTC — open (open boundary)', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 10, 22, 0))).toBe(true);
    });
    it('Sunday 23:00 UTC — open', () => {
      expect(isXstockMarketOpenUTC(ARCA_SYM, utc(2026, 4, 10, 23, 0))).toBe(true);
    });
  });

  describe('Wall-clock smoke (no injected time)', () => {
    it('returns a boolean for non-24/7 sample symbol', () => {
      const result = isXstockMarketOpenUTC(ARCA_SYM);
      expect(typeof result).toBe('boolean');
    });
  });
});
