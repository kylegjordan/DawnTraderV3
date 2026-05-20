/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0b — boundary tests for `isXstockMarketOpenUTC`
 * (UPDATED 2026-05-10 by B79.0L for Fri 8PM ET → Sun 8PM ET close window)
 * (UPDATED 2026-05-20 by B-NEW-36 sub-batch (c): all symbols now use the
 *  unified predicate — no more per-symbol ARCA-aligned restriction)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Schedule under test (B-NEW-36 sub-batch (c) — empirical Q9 verified):
 *   - OPEN Sun 8PM ET → Fri 8PM ET (120-hour open window)
 *   - CLOSED Fri 8PM ET → Sun 8PM ET (48-hour unified weekend close)
 *   - Applies to ALL xStock symbols. Previously the 10 designated 24/7
 *     names had a different schedule; that distinction was empirically
 *     wrong and was removed in B-NEW-36 sub-batch (c).
 *
 * Test fixtures use May 2026 dates (EDT, UTC-4): so Fri 8 PM ET = 00:00 UTC Sat,
 * and Sun 8 PM ET = 00:00 UTC Mon.
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

// Sample xStock symbol. Predicate now returns the same value for every
// symbol — the symbol parameter is retained in the signature for backward
// compatibility but no longer consulted internally.
const SAMPLE_SYM = 'AMZN/USD';

describe('B79.0b / B-NEW-36 (c) — isXstockMarketOpenUTC boundary cases (unified weekend close)', () => {
  describe('Weekday during market hours', () => {
    it('Monday 14:30 UTC — open', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 4, 14, 30))).toBe(true);
    });
    it('Wednesday 16:00 UTC — open', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 6, 16, 0))).toBe(true);
    });
    it('Friday 14:30 UTC (before close) — open', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 8, 14, 30))).toBe(true);
    });
  });

  describe('Friday close transition (8 PM ET = 00:00 UTC Sat in EDT)', () => {
    it('Friday 22:00 UTC (= 6 PM ET in EDT) — open (still pre-close)', () => {
      // Pre-B-NEW-36 this returned false under the per-symbol ARCA-aligned
      // 22:00 UTC rule. Now treated identically to all symbols: still open
      // until the unified 8 PM ET (= Sat 00:00 UTC in EDT) boundary.
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 8, 22, 0))).toBe(true);
    });
    it('Friday 23:59 UTC (= 7:59 PM ET in EDT) — open (one minute pre-close)', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 8, 23, 59))).toBe(true);
    });
    it('Saturday 00:00 UTC (= Fri 8 PM ET in EDT, close moment) — closed', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 9, 0, 0))).toBe(false);
    });
  });

  describe('Saturday — fully closed', () => {
    it('Saturday 14:30 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 9, 14, 30))).toBe(false);
    });
    it('Saturday 23:59 UTC — closed', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 9, 23, 59))).toBe(false);
    });
  });

  describe('Sunday open transition (8 PM ET = 00:00 UTC Mon in EDT)', () => {
    it('Sunday 14:30 UTC — closed (before open)', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 10, 14, 30))).toBe(false);
    });
    it('Sunday 22:00 UTC (= 6 PM ET in EDT) — closed (still inside unified weekend window)', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 10, 22, 0))).toBe(false);
    });
    it('Sunday 23:59 UTC (= 7:59 PM ET in EDT) — closed (one minute pre-reopen)', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 10, 23, 59))).toBe(false);
    });
    it('Monday 00:00 UTC (= Sun 8 PM ET in EDT, reopen boundary) — open', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 11, 0, 0))).toBe(true);
    });
    it('Monday 02:00 UTC (= Sun 10 PM ET in EDT) — open', () => {
      expect(isXstockMarketOpenUTC(SAMPLE_SYM, utc(2026, 4, 11, 2, 0))).toBe(true);
    });
  });

  describe('Wall-clock smoke (no injected time)', () => {
    it('returns a boolean for the sample symbol', () => {
      const result = isXstockMarketOpenUTC(SAMPLE_SYM);
      expect(typeof result).toBe('boolean');
    });
  });
});
