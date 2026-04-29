/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B67.2 — Phase Dimension Unit Tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers:
 *   1. computePhase boundary semantics (EARLY / PRIME / LATE)
 *   2. regimePhaseStore.tick — first observation, same-regime aging,
 *      regime-transition reset
 *   3. applyPhasePreference — multiplication math + hard-fail on missing key
 *
 * Reference: BATCH_67_2_SCOPE.md §7, BATCH_67_2_PRE_AUDIT.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  regimePhaseStore,
  computePhase,
  applyPhasePreference,
  type BackfillContext,
} from '../../core/metrics/regime-phase';
import { DEFAULT_REGIME_CONFIG } from '../../core/metrics/market-regime';
import type { OHLCData } from '../../types/market-regime.types';

// Helper for backfill tests: build OHLC such that calculatePairRegime returns
// a stable label across the whole series. We use a strong-uptrend series that
// classifies as TFS for all backward windows. Timestamps end at `nowMs`,
// going backward (most-recent-LAST in the array).
function makeTfsOhlc(nowMs: number, count = 80, spacingMs = 60 * 60 * 1000): OHLCData[] {
  const ohlc: OHLCData[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const close = 100 + 5 * t + 0.05 * Math.sin(i * 1.7);
    const open = i === 0 ? close : ohlc[i - 1].close;
    // Index 0 is oldest, index count-1 is newest at exactly nowMs.
    const timestamp = nowMs - (count - 1 - i) * spacingMs;
    ohlc.push({
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
      volume: 1000,
      timestamp,
    });
  }
  return ohlc;
}

describe('B67.2 — computePhase', () => {
  it('returns EARLY when age below early-max boundary', () => {
    expect(computePhase(0, 2.0, 12.0)).toBe('EARLY');
    expect(computePhase(60 * 60 * 1000, 2.0, 12.0)).toBe('EARLY'); // 1h
    expect(computePhase(2 * 60 * 60 * 1000 - 1, 2.0, 12.0)).toBe('EARLY'); // just under 2h
  });

  it('returns PRIME when age is between early-max and prime-max', () => {
    expect(computePhase(2 * 60 * 60 * 1000, 2.0, 12.0)).toBe('PRIME'); // exactly 2h
    expect(computePhase(6 * 60 * 60 * 1000, 2.0, 12.0)).toBe('PRIME'); // 6h
    expect(computePhase(12 * 60 * 60 * 1000 - 1, 2.0, 12.0)).toBe('PRIME'); // just under 12h
  });

  it('returns LATE when age >= prime-max', () => {
    expect(computePhase(12 * 60 * 60 * 1000, 2.0, 12.0)).toBe('LATE'); // exactly 12h
    expect(computePhase(24 * 60 * 60 * 1000, 2.0, 12.0)).toBe('LATE'); // 24h
    expect(computePhase(7 * 24 * 60 * 60 * 1000, 2.0, 12.0)).toBe('LATE'); // 7 days
  });

  it('respects custom boundaries', () => {
    // Tighter: 1h EARLY, 6h PRIME
    expect(computePhase(30 * 60 * 1000, 1.0, 6.0)).toBe('EARLY');
    expect(computePhase(2 * 60 * 60 * 1000, 1.0, 6.0)).toBe('PRIME');
    expect(computePhase(7 * 60 * 60 * 1000, 1.0, 6.0)).toBe('LATE');
  });
});

describe('B67.2 — regimePhaseStore.tick', () => {
  beforeEach(() => {
    regimePhaseStore.clear();
  });

  it('returns 0 on first tick for a new symbol', () => {
    const age = regimePhaseStore.tick('BTC/USD', 'TREND_FRIENDLY_STABLE', 1000);
    expect(age).toBe(0);
    expect(regimePhaseStore.size()).toBe(1);
  });

  it('returns increasing age for same regime on subsequent ticks', () => {
    regimePhaseStore.tick('BTC/USD', 'TFS', 1000);
    const age1 = regimePhaseStore.tick('BTC/USD', 'TFS', 1000 + 60_000);
    expect(age1).toBe(60_000);
    const age2 = regimePhaseStore.tick('BTC/USD', 'TFS', 1000 + 60 * 60_000);
    expect(age2).toBe(60 * 60_000);
  });

  it('resets to 0 on regime transition (same symbol, different regime)', () => {
    regimePhaseStore.tick('BTC/USD', 'TFS', 1000);
    regimePhaseStore.tick('BTC/USD', 'TFS', 1000 + 60_000);
    const ageAfterTransition = regimePhaseStore.tick(
      'BTC/USD',
      'IMPULSE_EXPANSION',
      1000 + 90_000,
    );
    expect(ageAfterTransition).toBe(0);
    // Subsequent ticks in the new regime should accrue from the transition moment
    const age2 = regimePhaseStore.tick(
      'BTC/USD',
      'IMPULSE_EXPANSION',
      1000 + 120_000,
    );
    expect(age2).toBe(30_000);
  });

  it('tracks multiple symbols independently', () => {
    regimePhaseStore.tick('BTC/USD', 'TFS', 1000);
    regimePhaseStore.tick('ETH/USD', 'IE', 1500);
    expect(regimePhaseStore.size()).toBe(2);
    const btcAge = regimePhaseStore.tick('BTC/USD', 'TFS', 1000 + 60_000);
    const ethAge = regimePhaseStore.tick('ETH/USD', 'IE', 1500 + 60_000);
    expect(btcAge).toBe(60_000);
    expect(ethAge).toBe(60_000);
  });
});

describe('B67.3.5 — regimePhaseStore backfill from OHLC history', () => {
  beforeEach(() => {
    regimePhaseStore.clear();
  });

  it('legacy tick (no backfill ctx) preserves existing enteredAt=now behavior', () => {
    const age = regimePhaseStore.tick('BTC/USD', 'TFS', 1000);
    expect(age).toBe(0);
  });

  it('emits structured warning + falls back to enteredAt=now on insufficient history', () => {
    const warnSpy = vi_spy_console_warn();
    // Only 5 candles — well below the 30-min required
    const ohlc = makeTfsOhlc(60 * 60 * 1000, 5);
    const ctx: BackfillContext = {
      ohlcData: ohlc,
      dbsScore: 0.5,
      regimeConfig: DEFAULT_REGIME_CONFIG,
    };
    const age = regimePhaseStore.tick('BTC/USD', 'TFS', ohlc[ohlc.length - 1].timestamp + 1, ctx);
    expect(age).toBe(0); // enteredAt = now → age 0
    expect(warnSpy.calls.some((c) => /insufficient_history/.test(c.join(' ')))).toBe(true);
    warnSpy.restore();
  });

  it('caps enteredAt at the walk depth when no different regime found in window', () => {
    const now = 24 * 60 * 60 * 1000; // 24h
    // 60 candles spanning 60h, all TFS — backfill walks 12 windows back (12h)
    // and finds same regime everywhere, so enteredAt = now - 12h
    const ohlc = makeTfsOhlc(now, 80, 60 * 60 * 1000);
    const ctx: BackfillContext = {
      ohlcData: ohlc,
      dbsScore: 0.5,
      regimeConfig: DEFAULT_REGIME_CONFIG,
    };
    const age = regimePhaseStore.tick('BTC/USD', 'TREND_FRIENDLY_STABLE', now, ctx);
    expect(age).toBe(12 * 60 * 60 * 1000); // exactly 12h (window cap)
  });

  it('does NOT re-backfill on subsequent ticks for the same pair', () => {
    const now = 24 * 60 * 60 * 1000;
    const ohlc = makeTfsOhlc(now, 80, 60 * 60 * 1000);
    const ctx: BackfillContext = {
      ohlcData: ohlc,
      dbsScore: 0.5,
      regimeConfig: DEFAULT_REGIME_CONFIG,
    };
    const age1 = regimePhaseStore.tick('BTC/USD', 'TREND_FRIENDLY_STABLE', now, ctx);
    expect(age1).toBe(12 * 60 * 60 * 1000);
    // Second tick 1h later, same pair, same regime — should NOT re-backfill;
    // age advances by 1h.
    const age2 = regimePhaseStore.tick('BTC/USD', 'TREND_FRIENDLY_STABLE', now + 60 * 60 * 1000, ctx);
    expect(age2).toBe(13 * 60 * 60 * 1000);
  });

  it('regime transition does NOT trigger backfill (transition resets enteredAt=now)', () => {
    const now = 24 * 60 * 60 * 1000;
    const ohlc = makeTfsOhlc(now, 80, 60 * 60 * 1000);
    const ctx: BackfillContext = {
      ohlcData: ohlc,
      dbsScore: 0.5,
      regimeConfig: DEFAULT_REGIME_CONFIG,
    };
    regimePhaseStore.tick('BTC/USD', 'TREND_FRIENDLY_STABLE', now, ctx);
    // Pair transitions to STRUCTURAL_TRANSITION — enteredAt should be the
    // transition moment, not a backfill-derived value.
    const ageAtTransition = regimePhaseStore.tick(
      'BTC/USD',
      'STRUCTURAL_TRANSITION',
      now + 30 * 60 * 1000,
      ctx,
    );
    expect(ageAtTransition).toBe(0);
  });
});

// Tiny console.warn spy helper (avoids pulling vi.fn for a single-file usage).
function vi_spy_console_warn() {
  const original = console.warn;
  const calls: any[][] = [];
  console.warn = (...args: any[]) => {
    calls.push(args);
  };
  return {
    calls,
    restore: () => {
      console.warn = original;
    },
  };
}

describe('B67.2 — applyPhasePreference', () => {
  const weights = {
    vwap_pullback_EARLY: 0.90,
    vwap_pullback_PRIME: 1.10,
    vwap_pullback_LATE: 0.95,
    strong_bull_trend_EARLY: 1.05,
    strong_bull_trend_PRIME: 1.10,
    strong_bull_trend_LATE: 0.85,
  };

  it('multiplies base confidence by the configured weight', () => {
    expect(applyPhasePreference('vwap_pullback', 'PRIME', weights, 0.7)).toBeCloseTo(0.77, 6);
    expect(applyPhasePreference('strong_bull_trend', 'LATE', weights, 1.0)).toBeCloseTo(0.85, 6);
  });

  it('applies the EARLY weight when phase is EARLY', () => {
    expect(applyPhasePreference('vwap_pullback', 'EARLY', weights, 0.5)).toBeCloseTo(0.45, 6);
  });

  it('throws hard on missing strategy_phase key (no fallback)', () => {
    expect(() => applyPhasePreference('unknown_strategy', 'PRIME', weights, 0.7)).toThrow(
      /\[B67\.2\]\[missing-weight\]/,
    );
    expect(() => applyPhasePreference('vwap_pullback', 'PRIME', {}, 0.7)).toThrow(
      /\[B67\.2\]\[missing-weight\]/,
    );
  });

  it('throws on missing phase row even when strategy has other phases seeded', () => {
    const partialWeights = {
      vwap_pullback_EARLY: 0.90,
      vwap_pullback_PRIME: 1.10,
      // LATE intentionally missing
    };
    expect(() => applyPhasePreference('vwap_pullback', 'LATE', partialWeights, 0.7)).toThrow(
      /vwap_pullback_LATE/,
    );
  });

  it('handles weight of exactly 1.00 (identity)', () => {
    const w = { adaptive_flow_EARLY: 1.0, adaptive_flow_PRIME: 1.0, adaptive_flow_LATE: 1.0 };
    expect(applyPhasePreference('adaptive_flow', 'EARLY', w, 0.5)).toBe(0.5);
    expect(applyPhasePreference('adaptive_flow', 'PRIME', w, 0.5)).toBe(0.5);
    expect(applyPhasePreference('adaptive_flow', 'LATE', w, 0.5)).toBe(0.5);
  });
});
