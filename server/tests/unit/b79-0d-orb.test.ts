/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0d — Opening Range Breakout (ORB) detect logic tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Coverage (Langston Q1-Q7 lock + scope concerns #1-#5; B79.0m.b2 update):
 *   (a) Range-formation phase returns null
 *   (b) Breakout-up generates BUY with correct stop/target/confidence
 *   (c) Breakout-down returns null with `sell_disabled_long_only` (B79.0m.b2 LONG-only)
 *   (c2) Breakout-up does NOT emit sell_disabled (LONG-only short-circuits before BUY)
 *   (d) No-breakout returns null
 *   (e) Gate-disabled returns null even on valid breakout
 *   (f) Crypto_spot symbol returns null (asset-class guard)
 *   (g) 24/7 symbol returns null — "no_open_bell" semantics (Langston scope #2)
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock module_constants service so we control the gate + thresholds.
const gateValue = { value: true };
const thresholds = {
  open_range_minutes: 30,
  breakout_buffer_atr_mult: 0.15,
  target_range_multiple: 2.0,
  volume_multiple_min: 1.5,
  confidence_base: 0.65,
  range_atr_clamp_max: 3.0,
  active_window_hours: 2,
};

vi.mock('../../services/module-constants-service.js', () => ({
  getCachedConstant: <T>(_module: string, _name: string) => gateValue.value as unknown as T,
  getCachedNumbersForModule: () => ({ ...thresholds }),
}));

// B79.0m.b2 (2026-05-11): mock null-reason-tracker so we can assert the
// LONG-only return-null path emits `sell_disabled_long_only`.
const nullReasonCalls: string[] = [];
vi.mock('../../utils/null-reason-tracker.js', () => ({
  setNullReason: (reason: string) => { nullReasonCalls.push(reason); },
}));

import { detectORB } from '../../strategies/orb.js';
import type { TechnicalIndicators } from '../../services/strategy-engine';
import type { PriceData } from '@shared/schema';

// Helper — synthesize 1m candle for a given UTC minute offset from 14:30 UTC.
function makeCandle(minuteOffset: number, high: number, low: number, volume: number): PriceData {
  const ts = new Date(Date.UTC(2026, 4, 11, 14, 30 + minuteOffset, 0)); // Mon 2026-05-11
  return {
    id: `t${minuteOffset}`,
    symbol: 'AMZN/USD',
    timestamp: ts,
    open: low.toString(),
    high: high.toString(),
    low: low.toString(),
    close: ((high + low) / 2).toString(),
    volume: volume.toString(),
    vwap: null,
    sma: null,
  } as unknown as PriceData;
}

// Build 30-min open-range OHLC: high=100, low=99, vol=1000/min ⇒ totalOR vol=30000.
function makeOpenRangeBars(): PriceData[] {
  const bars: PriceData[] = [];
  for (let i = 0; i < 30; i++) bars.push(makeCandle(i, 100, 99, 1000));
  return bars;
}

const baseIndicators: TechnicalIndicators = {
  vwap: 99.5,
  sma: 99.5,
  currentPrice: 99.5,
  volume: 1000,
  high24h: 100,
  low24h: 99,
  atr: 0.50, // 50¢ ATR — buffer = 0.15 × 0.50 = 7.5¢
};

const NOW_AFTER_RANGE = new Date(Date.UTC(2026, 4, 11, 15, 30, 0)); // 15:30 UTC — 1h post-formation
const NOW_DURING_RANGE = new Date(Date.UTC(2026, 4, 11, 14, 45, 0)); // 14:45 UTC — mid-formation
const NOW_LATE_DAY = new Date(Date.UTC(2026, 4, 11, 18, 0, 0)); // 18:00 UTC — past 17:00 active end

describe('B79.0d — ORB detect', () => {
  beforeEach(() => {
    gateValue.value = true;
    nullReasonCalls.length = 0;
  });

  it('(a) range-formation phase returns null even with apparent breakout', () => {
    const indicators = { ...baseIndicators, currentPrice: 110, volume: 5000 };
    const result = detectORB('AMZN/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'xstock_spot', symbol: 'AMZN/USD', now: NOW_DURING_RANGE,
    });
    expect(result).toBeNull();
  });

  it('(b) breakout-UP after window with sufficient volume generates BUY', () => {
    const indicators = { ...baseIndicators, currentPrice: 100.50, volume: 2000 };
    const result = detectORB('AMZN/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'xstock_spot', symbol: 'AMZN/USD', now: NOW_AFTER_RANGE,
    });
    expect(result).not.toBeNull();
    expect(result!.metadata.direction).toBe('BUY');
    expect(result!.entryPrice).toBeCloseTo(100.50, 2);
    expect(result!.stopPrice).toBeCloseTo(99, 2);                    // range low
    expect(result!.targetPrice).toBeCloseTo(100.50 + 2 * 1, 2);       // entry + 2×rangeHeight
    expect(result!.confidence).toBeGreaterThanOrEqual(0.55);
    expect(result!.confidence).toBeLessThanOrEqual(0.90);
  });

  it('(c) breakout-DOWN returns null with sell_disabled_long_only — B79.0m.b2 LONG-only', () => {
    // B79.0m.b2 (2026-05-11) — system is long-only; ORB down-break must NOT
    // produce a SELL signal. Mirrors inside-bar-reversal.ts:131-134.
    const indicators = { ...baseIndicators, currentPrice: 98.50, volume: 2000 };
    const result = detectORB('AMZN/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'xstock_spot', symbol: 'AMZN/USD', now: NOW_AFTER_RANGE,
    });
    expect(result).toBeNull();
    expect(nullReasonCalls).toContain('sell_disabled_long_only');
  });

  it('(c2) breakout-UP does NOT set sell_disabled — confirms LONG-only path doesn\'t fire on valid BUY', () => {
    // Sanity: the LONG-only guard short-circuits BEFORE the BUY branch. We
    // verify the SELL-disabled reason is NOT emitted on a valid up-break.
    const indicators = { ...baseIndicators, currentPrice: 100.50, volume: 2000 };
    const result = detectORB('AMZN/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'xstock_spot', symbol: 'AMZN/USD', now: NOW_AFTER_RANGE,
    });
    expect(result).not.toBeNull();
    expect(result!.metadata.direction).toBe('BUY');
    expect(nullReasonCalls).not.toContain('sell_disabled_long_only');
  });

  it('(d) inside-range price returns null', () => {
    const indicators = { ...baseIndicators, currentPrice: 99.5, volume: 2000 };
    const result = detectORB('AMZN/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'xstock_spot', symbol: 'AMZN/USD', now: NOW_AFTER_RANGE,
    });
    expect(result).toBeNull();
  });

  it('(d2) breakout above range but volume below 1.5× returns null', () => {
    const indicators = { ...baseIndicators, currentPrice: 100.5, volume: 1000 }; // exactly avg, volMult=1.0
    const result = detectORB('AMZN/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'xstock_spot', symbol: 'AMZN/USD', now: NOW_AFTER_RANGE,
    });
    expect(result).toBeNull();
  });

  it('(d3) breakout outside active window (after 17:00 UTC) returns null', () => {
    const indicators = { ...baseIndicators, currentPrice: 100.5, volume: 2000 };
    const result = detectORB('AMZN/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'xstock_spot', symbol: 'AMZN/USD', now: NOW_LATE_DAY,
    });
    expect(result).toBeNull();
  });

  it('(e) gate-disabled returns null even on valid breakout', () => {
    gateValue.value = false;
    const indicators = { ...baseIndicators, currentPrice: 100.5, volume: 2000 };
    const result = detectORB('AMZN/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'xstock_spot', symbol: 'AMZN/USD', now: NOW_AFTER_RANGE,
    });
    expect(result).toBeNull();
  });

  it('(f) crypto_spot asset class returns null (detect-internal guard)', () => {
    const indicators = { ...baseIndicators, currentPrice: 100.5, volume: 2000 };
    const result = detectORB('BTC/USD', makeOpenRangeBars(), indicators, {
      assetClass: 'crypto_spot', symbol: 'BTC/USD', now: NOW_AFTER_RANGE,
    });
    expect(result).toBeNull();
  });

  // B-NEW-43 Phase 2 chunk 8 (2026-05-23): tests (g) and (g2) REMOVED.
  // They asserted that the 10 named symbols ('AAPL', 'TSLA', etc.) would be
  // SKIPPED during the active ORB window because they were once treated as
  // "24/7" names with no opening-bell semantics. B-NEW-36 sub-batch (c)
  // (2026-05-20, server/strategies/orb.ts:156-165) REMOVED that per-symbol
  // weekend-bypass after empirical Q9 verification showed those 10 names
  // share identical Sun-8PM-ET-open → Fri-8PM-ET-close hours with the
  // other ~255 xStocks. The tests asserted deprecated behavior; the current
  // behavior (ORB applies normally to all xStocks during the active window)
  // is covered by tests (a)-(f) above.
});
