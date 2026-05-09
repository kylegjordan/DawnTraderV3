/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0c — Per-symbol 24/7 boundary tests for `isXstockMarketOpenUTC`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that the 10 Kraken Phase 1 24/7 names (XSTOCK_SPOT_24_7_SYMBOLS)
 * bypass the ARCA 24/5 schedule, while non-24/7 names still respect it.
 *
 * Also asserts:
 *   - All 10 24/7 names exist in the master XSTOCK_SPOT_SYMBOLS set
 *   - Symbol normalization (canonical / Kraken-pair-form / bare-with-x)
 *   - Required-symbol signature: callsites compile with symbol arg
 *
 * ARCA 24/5 schedule itself is covered by b79-0b-market-hours.test.ts.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { isXstockMarketOpenUTC } from '../../asset_classes/xstock_spot/market-hours.js';
import {
  XSTOCK_SPOT_SYMBOLS,
  XSTOCK_SPOT_24_7_SYMBOLS,
} from '../../../shared/asset-classes.js';

function utc(year: number, monthZero: number, day: number, hour: number, min: number = 0): Date {
  return new Date(Date.UTC(year, monthZero, day, hour, min));
}

// Anchored times for boundary cases.
const SAT_14_30 = utc(2026, 4, 9, 14, 30);   // Saturday — ARCA closed
const SAT_03_00 = utc(2026, 4, 9, 3, 0);     // Saturday early — ARCA closed
const FRI_23_00 = utc(2026, 4, 8, 23, 0);    // Friday after close — ARCA closed
const SUN_18_00 = utc(2026, 4, 10, 18, 0);   // Sunday before open — ARCA closed
const MON_15_00 = utc(2026, 4, 4, 15, 0);    // Monday RTH — ARCA open

const ARCA_SYM = 'AMZN/USD';   // 24/5 (in master set, NOT in 24/7 set)
const SYM_24_7  = 'TSLA/USD';  // 24/7 sample
const SYM_24_7_2 = 'AAPL/USD';

describe('B79.0c — XSTOCK_SPOT_24_7_SYMBOLS membership integrity', () => {
  it('contains exactly 10 names (Kraken Phase 1, 2025-12-03)', () => {
    expect(XSTOCK_SPOT_24_7_SYMBOLS.size).toBe(10);
  });

  it('every 24/7 name is also in master XSTOCK_SPOT_SYMBOLS', () => {
    for (const sym of XSTOCK_SPOT_24_7_SYMBOLS) {
      expect(XSTOCK_SPOT_SYMBOLS.has(sym)).toBe(true);
    }
  });

  it('contains the canonical Kraken Phase-1 names', () => {
    const expected = ['AAPL/USD', 'CRCL/USD', 'GLD/USD', 'GOOGL/USD', 'HOOD/USD',
                      'MSTR/USD', 'NVDA/USD', 'QQQ/USD', 'SPY/USD', 'TSLA/USD'];
    for (const sym of expected) {
      expect(XSTOCK_SPOT_24_7_SYMBOLS.has(sym)).toBe(true);
    }
  });
});

describe('B79.0c — 24/7 names bypass ARCA schedule', () => {
  it('TSLA/USD open Saturday 14:30 UTC (ARCA closed)', () => {
    expect(isXstockMarketOpenUTC(SYM_24_7, SAT_14_30)).toBe(true);
  });

  it('AAPL/USD open Friday 23:00 UTC (ARCA closed)', () => {
    expect(isXstockMarketOpenUTC(SYM_24_7_2, FRI_23_00)).toBe(true);
  });

  it('SPY/USD open Sunday 18:00 UTC (ARCA pre-reopen)', () => {
    expect(isXstockMarketOpenUTC('SPY/USD', SUN_18_00)).toBe(true);
  });

  it('GOOGL/USD open Saturday 03:00 UTC (deep closed window)', () => {
    expect(isXstockMarketOpenUTC('GOOGL/USD', SAT_03_00)).toBe(true);
  });

  it('all 10 24/7 names open during full ARCA-closed window', () => {
    for (const sym of XSTOCK_SPOT_24_7_SYMBOLS) {
      expect(isXstockMarketOpenUTC(sym, SAT_14_30)).toBe(true);
    }
  });
});

describe('B79.0c — non-24/7 names still respect ARCA schedule', () => {
  it('AMZN/USD closed Saturday 14:30 UTC', () => {
    expect(isXstockMarketOpenUTC(ARCA_SYM, SAT_14_30)).toBe(false);
  });

  it('AMZN/USD open Monday 15:00 UTC (RTH)', () => {
    expect(isXstockMarketOpenUTC(ARCA_SYM, MON_15_00)).toBe(true);
  });

  it('AMZN/USD closed Friday 23:00 UTC (post-22:00)', () => {
    expect(isXstockMarketOpenUTC(ARCA_SYM, FRI_23_00)).toBe(false);
  });
});

describe('B79.0c — symbol normalization', () => {
  // Langston Step 4 F1 regression-lock: greedy [A-Z]+ + case-insensitive
  // flag was consuming the `x` itself (TSLAxUSD → TSLAx/USD), silently
  // bypassing the 24/7 set. Mandatory `x` (no `?`) forces correct backtrack.
  it('Kraken-pair form `TSLAxUSD` → 24/7 (always open) [F1 regression-lock]', () => {
    expect(isXstockMarketOpenUTC('TSLAxUSD', SAT_14_30)).toBe(true);
  });

  it('Kraken-pair USDC quote `AAPLxUSDC` normalizes to AAPL/USDC — NOT in 24/7 set (which is /USD-only)', () => {
    // XSTOCK_SPOT_24_7_SYMBOLS holds the canonical /USD form only (matches
    // XSTOCK_SPOT_SYMBOLS shape). USDC-quote variants would need to be
    // explicitly added to the 24/7 set if Kraken expands Phase-1 across
    // quote currencies. For now, /USDC inputs fall through to the ARCA
    // schedule.
    expect(isXstockMarketOpenUTC('AAPLxUSDC', SAT_14_30)).toBe(false);
  });

  it('Kraken-pair form `MSTRxUSD` → 24/7 (always open)', () => {
    expect(isXstockMarketOpenUTC('MSTRxUSD', SAT_14_30)).toBe(true);
  });

  it('canonical-with-x form `TSLAx/USD` → 24/7 (always open)', () => {
    expect(isXstockMarketOpenUTC('TSLAx/USD', SAT_14_30)).toBe(true);
  });

  it('non-24/7 Kraken-pair form `AMZNxUSD` → ARCA-closed Saturday', () => {
    expect(isXstockMarketOpenUTC('AMZNxUSD', SAT_14_30)).toBe(false);
  });
});

describe('B79.0c — unknown / non-xstock symbols default to ARCA schedule', () => {
  it('unknown symbol returns ARCA-closed during weekend', () => {
    expect(isXstockMarketOpenUTC('UNKNOWN/USD', SAT_14_30)).toBe(false);
  });

  it('unknown symbol returns ARCA-open during RTH', () => {
    expect(isXstockMarketOpenUTC('UNKNOWN/USD', MON_15_00)).toBe(true);
  });
});
