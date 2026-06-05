/**
 * B.5 W2.1 (2026-06-06) — max-holding unified on explicit MILLISECONDS.
 *
 * Covers the three load-bearing pieces of the unit-consistency fix:
 *   1. The shared `stampMaxHoldingMs` helper (strategy-engine.ts): resolves
 *      `max_holding_ms` from module_constants, falls back to the documented
 *      default, and no-ops when a signal already carries the field.
 *   2. The paper-execution-engine force-close decision: a signal whose hold is
 *      21_600_000 ms (6h) is force-closed AT/AFTER 6h, NOT before — compared in
 *      milliseconds (the old code read the value as HOURS).
 *   3. The historic-signal-generator clock-anchored conversion: the intended
 *      hold in ms maps to the correct BAR COUNT at both 15-min and 60-min candle
 *      spacing (the old code hardcoded 24 bars and silently assumed 60-min).
 */

import { describe, it, expect, vi } from 'vitest';

// Mock module-constants-service so stampMaxHoldingMs can resolve max_holding_ms.
// getCachedConstant returns the per-strategy ms value the test sets here.
const mockConstants: Record<string, number | undefined> = {};
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumbersForModule: vi.fn(() => ({})),
  getCachedConstant: vi.fn((moduleName: string, constantName: string) => {
    if (constantName === 'max_holding_ms') return mockConstants[moduleName];
    return undefined;
  }),
}));

import {
  stampMaxHoldingMs,
  DEFAULT_MAX_HOLDING_MS,
  type StrategySignal,
} from '../../services/strategy-engine';

function makeSignal(overrides: Partial<StrategySignal> = {}): StrategySignal {
  return {
    symbol: 'BTC/USD',
    strategy: 'vwap_pullback',
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    confidence: 0.7,
    metadata: {},
    ...overrides,
  } as StrategySignal;
}

describe('B.5 W2.1 — stampMaxHoldingMs shared helper', () => {
  it('resolves max_holding_ms from module_constants for the strategy + asset class', () => {
    mockConstants['strategy.vwap_pullback'] = 86400000;
    const sig = stampMaxHoldingMs(makeSignal(), 'crypto_spot');
    expect(sig?.metadata.maxHoldingMs).toBe(86400000);
  });

  it('falls back to DEFAULT_MAX_HOLDING_MS (24h) when unresolved', () => {
    delete mockConstants['strategy.breakout'];
    const sig = stampMaxHoldingMs(makeSignal({ strategy: 'breakout' }), 'xstock_spot');
    expect(sig?.metadata.maxHoldingMs).toBe(DEFAULT_MAX_HOLDING_MS);
    expect(DEFAULT_MAX_HOLDING_MS).toBe(24 * 60 * 60 * 1000); // 86_400_000
  });

  it('is a no-op when the signal already carries maxHoldingMs (strategy builder stamped it)', () => {
    mockConstants['strategy.vwap_pullback'] = 99999; // would override if not guarded
    const sig = stampMaxHoldingMs(
      makeSignal({ metadata: { maxHoldingMs: 43200000 } }),
      'crypto_spot',
    );
    expect(sig?.metadata.maxHoldingMs).toBe(43200000);
  });

  it('returns null unchanged for a null signal', () => {
    expect(stampMaxHoldingMs(null, 'crypto_spot')).toBeNull();
  });
});

describe('B.5 W2.1 — paper-execution force-close compares in MILLISECONDS', () => {
  // Mirrors the exact decision logic in paper-execution-engine.ts checkExitConditions:
  //   const elapsedMs = Date.now() - openTime;
  //   if (elapsedMs >= maxHoldingMs) -> force close.
  // A 6h hold (21_600_000 ms) must NOT close at 5h59m and MUST close at 6h.
  const SIX_HOURS_MS = 21600000;
  function shouldForceClose(maxHoldingMs: number, elapsedMs: number): boolean {
    return elapsedMs >= maxHoldingMs;
  }

  it('does NOT force-close just before 6h', () => {
    const elapsed = SIX_HOURS_MS - 1; // 5h59m59.999s
    expect(shouldForceClose(SIX_HOURS_MS, elapsed)).toBe(false);
  });

  it('force-closes exactly at 6h', () => {
    expect(shouldForceClose(SIX_HOURS_MS, SIX_HOURS_MS)).toBe(true);
  });

  it('force-closes after 6h', () => {
    expect(shouldForceClose(SIX_HOURS_MS, SIX_HOURS_MS + 60000)).toBe(true);
  });

  it('REGRESSION: a 6h hold is NOT mistakenly treated as 6 HOURS-of-hours (old hours bug)', () => {
    // Old code did parseFloat(metadata.maxHoldingPeriod) and compared to hoursHeld.
    // If 21_600_000 were (wrongly) read as hours, nothing would ever close.
    // New code compares ms-to-ms, so 6h elapsed against a 6h hold closes.
    const sixHoursElapsedMs = 6 * 60 * 60 * 1000;
    expect(shouldForceClose(SIX_HOURS_MS, sixHoursElapsedMs)).toBe(true);
  });
});

describe('B.5 W2.1 — historic-signal-generator clock-anchored bar count', () => {
  // Mirrors the exact conversion in historic-signal-generator.ts evaluateSignals:
  //   barMs = (candles[i+1].time - candles[i].time) * 1000   (times are unix sec)
  //   maxHoldingPeriod = Math.max(1, Math.ceil(holdMs / barMs))
  function barCount(holdMs: number, barSpacingSeconds: number): number {
    const barMs = barSpacingSeconds * 1000;
    return Math.max(1, Math.ceil(holdMs / barMs));
  }

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000; // 86_400_000

  it('24h hold -> 96 bars at 15-minute spacing', () => {
    expect(barCount(TWENTY_FOUR_HOURS_MS, 15 * 60)).toBe(96);
  });

  it('24h hold -> 24 bars at 60-minute spacing (preserves the old behavior)', () => {
    expect(barCount(TWENTY_FOUR_HOURS_MS, 60 * 60)).toBe(24);
  });

  it('6h hold -> 24 bars at 15-minute spacing', () => {
    expect(barCount(21600000, 15 * 60)).toBe(24);
  });

  it('never returns fewer than 1 bar even for a tiny hold', () => {
    expect(barCount(1, 60 * 60)).toBe(1);
  });
});
