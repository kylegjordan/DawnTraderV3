/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0b — N4 boundary tests for `isXstockMarketOpenUTC`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Schedule under test (ARCA-aligned, UTC):
 *   - CLOSED Saturday all day
 *   - CLOSED Friday from 22:00 UTC onward
 *   - CLOSED Sunday before 22:00 UTC
 *   - OPEN otherwise
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

describe('B79.0b — isXstockMarketOpenUTC boundary cases', () => {
  describe('Weekday during market hours', () => {
    it('Monday 14:30 UTC — open', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 4, 14, 30))).toBe(true);
    });
    it('Wednesday 16:00 UTC — open', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 6, 16, 0))).toBe(true);
    });
    it('Friday 14:30 UTC (before close) — open', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 8, 14, 30))).toBe(true);
    });
  });

  describe('Friday close transition', () => {
    it('Friday 21:59 UTC — open (one minute before close)', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 8, 21, 59))).toBe(true);
    });
    it('Friday 22:00 UTC — closed (close boundary)', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 8, 22, 0))).toBe(false);
    });
    it('Friday 23:00 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 8, 23, 0))).toBe(false);
    });
  });

  describe('Saturday — fully closed', () => {
    it('Saturday 00:00 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 9, 0, 0))).toBe(false);
    });
    it('Saturday 14:30 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 9, 14, 30))).toBe(false);
    });
    it('Saturday 23:59 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 9, 23, 59))).toBe(false);
    });
  });

  describe('Sunday open transition', () => {
    it('Sunday 14:30 UTC — closed (before open)', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 10, 14, 30))).toBe(false);
    });
    it('Sunday 21:59 UTC — closed (one minute before open)', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 10, 21, 59))).toBe(false);
    });
    it('Sunday 22:00 UTC — open (open boundary)', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 10, 22, 0))).toBe(true);
    });
    it('Sunday 23:00 UTC — open', () => {
      expect(isXstockMarketOpenUTC(utc(2026, 4, 10, 23, 0))).toBe(true);
    });
  });

  describe('Default-arg fallback', () => {
    it('No-arg call uses new Date() — returns boolean', () => {
      // Smoke test only — actual value depends on wall-clock at test run.
      const result = isXstockMarketOpenUTC();
      expect(typeof result).toBe('boolean');
    });
  });
});
