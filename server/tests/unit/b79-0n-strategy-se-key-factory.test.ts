/**
 * B79.0n.STRATEGY (2026-05-24) — _SE_KEY factory class-aware resolution
 *
 * Per scope §4 test #2: the strategy-engine internal `_SE_KEY` factory is not
 * exported (module-private). This test exercises the behavior INDIRECTLY by
 * verifying that detect methods construct resolver keys with the cycle's
 * assetClass (not wildcard '*'). We use a vitest mock on
 * `getCachedNumbersForModule` to capture the resolver key passed in.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock module-constants-service BEFORE strategy-engine imports it.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumbersForModule: vi.fn(() => ({
    counter_trend_long_dbs_floor: -0.35,
    pullback_threshold_pct_default: 3.0,
    volume_multiplier_default: 1.5,
    max_holding_period_bars_default: 24,
    volume_confirm_min_history: 10,
    volume_avg_lookback: 20,
    atr_fallback_daily_range_frac: 0.1,
    entry_atr_premium: 0.1,
    stop_atr_mult_vwap: 0.5,
    stop_atr_mult_low24h: 0.1,
    target_atr_offset_high24h: 0.25,
    target_r_multiple_default: 2,
    base_confidence: 0.7,
    reversal_confidence_bonus: 0.2,
    bullish_reversal_near_vwap_atr: 2.0,
    bullish_reversal_above_low_atr: 0.5,
  })),
  getCachedConstant: vi.fn(),
}));

import { StrategyEngine } from '../../services/strategy-engine';
import { getCachedNumbersForModule } from '../../services/module-constants-service';

describe('B79.0n.STRATEGY — _SE_KEY factory class-aware resolution', () => {
  const mockedGetCachedNumbers = getCachedNumbersForModule as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockedGetCachedNumbers.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detectVWAPPullback with assetClass=crypto_spot produces resolver key with crypto_spot scope', () => {
    const engine = new StrategyEngine();
    const indicators = {
      vwap: 100, sma: 100, currentPrice: 100, volume: 1000,
      high24h: 110, low24h: 90, atr: 2,
      dbsScore: 0, dbsCategory: 'NEUTRAL', dbsSlope: 0,
    } as any;
    const priceHistory: any[] = [];

    try {
      engine.detectVWAPPullback(indicators, {} as any, priceHistory, 'crypto_spot');
    } catch {
      // Expected — minimal mock won't produce valid signal; we only care about the resolver key
    }

    expect(mockedGetCachedNumbers).toHaveBeenCalled();
    const firstCall = mockedGetCachedNumbers.mock.calls[0];
    expect(firstCall[0]).toBe('strategy.vwap_pullback');
    expect(firstCall[1]).toMatchObject({
      exchange: '*',
      assetClass: 'crypto_spot',  // B79.0n.STRATEGY — was '*' pre-batch
      strategy: 'vwap_pullback',
      regime: '*',
    });
  });

  it('detectVWAPPullback with assetClass=xstock_spot produces resolver key with xstock_spot scope', () => {
    const engine = new StrategyEngine();
    const indicators = {
      vwap: 100, sma: 100, currentPrice: 100, volume: 1000,
      high24h: 110, low24h: 90, atr: 2,
      dbsScore: 0, dbsCategory: 'NEUTRAL', dbsSlope: 0,
    } as any;
    const priceHistory: any[] = [];

    try {
      engine.detectVWAPPullback(indicators, {} as any, priceHistory, 'xstock_spot');
    } catch {
      // Expected
    }

    expect(mockedGetCachedNumbers).toHaveBeenCalled();
    const firstCall = mockedGetCachedNumbers.mock.calls[0];
    expect(firstCall[1]).toMatchObject({
      assetClass: 'xstock_spot',
    });
  });

  it('Resolver key NEVER has assetClass:"*" wildcard post-batch (regression-lock)', () => {
    const engine = new StrategyEngine();
    const indicators = {
      vwap: 100, sma: 100, currentPrice: 100, volume: 1000,
      high24h: 110, low24h: 90, atr: 2,
      dbsScore: 0, dbsCategory: 'NEUTRAL', dbsSlope: 0,
    } as any;

    try {
      engine.detectVWAPPullback(indicators, {} as any, [], 'crypto_spot');
    } catch { /* ignore */ }

    for (const call of mockedGetCachedNumbers.mock.calls) {
      const resolverKey = call[1] as { assetClass?: string };
      if (resolverKey && typeof resolverKey === 'object') {
        expect(resolverKey.assetClass).not.toBe('*');
      }
    }
  });
});
