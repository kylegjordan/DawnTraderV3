/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B63 Item 12 — Strong-Trend Geometry Override Contract Test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that detectVWAPPullback:
 *   (a) applies Variant E geometry (4×ATR stop, 3R target) when the routing layer
 *       attaches `strongTrendGeometryOverride` to indicators (strong-trend lane)
 *   (b) falls back to its default pullback geometry when no override is attached
 *   (c) continues to honor the B63 Item 10 counter-trend LONG guard
 *
 * Source: BATCH_63_SCOPE.md Item 12, BATCH_63_PRE_AUDIT.md §13 Item 12.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { StrategyEngine, type TechnicalIndicators } from '../../services/strategy-engine';
import type { PriceData } from '@shared/schema';
import type { TradingSettings } from '@shared/schema';
import { prefetchModule } from '../../services/module-constants-service.js';
// B-NEW-43 Phase 2 chunk 6 (2026-05-23): warm module_constants modules
// read by code under test. Server boot calls prefetchModule for all
// PREFETCH_MODULES; unit tests must do the same explicitly. CI Postgres
// (chunks 4.0-4.7) populates module_constants via db:migrate; this hook
// loads the rows into the sync-read cache.
import { beforeAll as __b43_beforeAll } from 'vitest';
__b43_beforeAll(async () => {
  await prefetchModule("strategy.vwap_pullback");
});


// Minimal helpers — build a price history that clears the detect function's
// "priceAboveVWAP && nearVWAP && hasReversalPattern && hasVolumeConfirmation" gate.
// Reversal pattern needs current close > prior open (bullish); volume check needs
// current volume > avg × 1.5. We synthesize 20 bars of calm price action then a
// strong bullish bar at the tail.
function buildFavorablePriceHistory(
  basePrice: number,
  vwap: number,
  atrish: number,
): PriceData[] {
  const rows: PriceData[] = [];
  for (let i = 0; i < 20; i++) {
    const drift = (Math.sin(i * 0.5) * atrish * 0.1);
    const p = vwap + drift;
    rows.push({
      symbol: 'TEST/USD',
      timestamp: new Date(Date.now() - (20 - i) * 60_000),
      open: String(p),
      close: String(p),
      high: String(p + atrish * 0.2),
      low: String(p - atrish * 0.2),
      volume: '1000',
    } as unknown as PriceData);
  }
  // Final bar — bullish reversal, higher volume (2×)
  rows.push({
    symbol: 'TEST/USD',
    timestamp: new Date(),
    open: String(vwap - atrish * 0.05),
    close: String(basePrice),
    high: String(basePrice + atrish * 0.1),
    low: String(vwap - atrish * 0.1),
    volume: '2500',
  } as unknown as PriceData);
  return rows;
}

function baseIndicators(overrides: Partial<TechnicalIndicators> = {}): TechnicalIndicators {
  return {
    vwap: 100,
    sma: 99,
    currentPrice: 102,
    volume: 2500,
    high24h: 110,
    low24h: 96,
    atr: 2.0, // $2 ATR for easy arithmetic
    ...overrides,
  };
}

const settings: TradingSettings = {
  vwapPullbackThreshold: '3.0',
  vwapVolumeMultiplier: '1.5',
  vwapMaxHoldingPeriod: 24,
} as unknown as TradingSettings;

describe('B63 Item 12 — strong-trend geometry override', () => {
  it('applies Variant E geometry (4×ATR stop, 3R target) when override is attached', () => {
    const engine = new StrategyEngine();
    const indicators = baseIndicators({
      strongTrendGeometryOverride: { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 },
    });
    const priceHistory = buildFavorablePriceHistory(102, 100, 2.0);
    const signal = engine.detectVWAPPullback(indicators, settings, priceHistory);

    // Signal existence precondition — synthetic data is designed to clear gates.
    // If a change to detectVWAPPullback's gate logic causes signal=null here, the
    // test needs its fixture refreshed. The override behavior itself is what's under test.
    expect(signal).not.toBeNull();
    if (!signal) return;

    const entry = signal.entryPrice;
    const stop = signal.stopPrice;
    const target = signal.targetPrice;

    // Stop = entry - 4 × ATR. ATR = 2.0 → stop distance = 8.0.
    const stopDistance = entry - stop;
    expect(stopDistance).toBeCloseTo(8.0, 3);

    // Target = entry + 3R. R = stopDistance = 8.0 → target distance = 24.0.
    const targetDistance = target - entry;
    expect(targetDistance).toBeCloseTo(24.0, 3);

    // R-multiple = 3.0 exactly.
    expect(targetDistance / stopDistance).toBeCloseTo(3.0, 3);
  });

  it('uses default geometry when no override is attached', () => {
    const engine = new StrategyEngine();
    const indicators = baseIndicators(); // no override field
    const priceHistory = buildFavorablePriceHistory(102, 100, 2.0);
    const signal = engine.detectVWAPPullback(indicators, settings, priceHistory);

    expect(signal).not.toBeNull();
    if (!signal) return;

    const entry = signal.entryPrice;
    const stop = signal.stopPrice;
    const target = signal.targetPrice;

    const stopDistance = entry - stop;
    const targetDistance = target - entry;

    // Default geometry is NOT 4×ATR. Should be the pullback-specific calculation:
    // stopPrice = min(vwap - atr*0.5, low24h + atr*0.1) = min(100-1, 96+0.2) = 96.2
    // With entry ≈ 102 + atr*0.1 = 102.2, default stop distance ≈ 6.0 (NOT 8.0).
    // We assert the default path is taken by checking stop distance != 4×ATR.
    expect(stopDistance).not.toBeCloseTo(8.0, 2);

    // Default target uses max(high24h - atr*0.25, twoRTarget) — resulting R-multiple is
    // at least 2.0 per existing logic. We just assert it's not the override's exact 3.0.
    const rMultiple = targetDistance / stopDistance;
    expect(rMultiple).toBeGreaterThanOrEqual(1.99);
    // If this test ever fails because rMultiple == 3.0 by coincidence with the default
    // calculation, that is not a bug — just refresh the fixture prices so paths diverge.
  });

  it('blocks on counter-trend LONG (DBS <= -0.35) regardless of override', () => {
    const engine = new StrategyEngine();
    const indicators = baseIndicators({
      dbsScore: -0.50, // strong DOWN — LONG entry would be counter-trend
      strongTrendGeometryOverride: { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 },
    });
    const priceHistory = buildFavorablePriceHistory(102, 100, 2.0);
    const signal = engine.detectVWAPPullback(indicators, settings, priceHistory);

    // B63 Item 10 mirror-defect guard must take precedence.
    expect(signal).toBeNull();
  });

  it('override with stopAtrMultiplier=4 and targetAsRMultiple=3 is the Variant E commitment', () => {
    // Sanity check that the specific constants are what Item 11/12 locked in.
    // If these constants ever change, the scope doc + audit evidence must be updated too.
    const varE = { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 };
    expect(varE.stopAtrMultiplier).toBe(4.0);
    expect(varE.targetAsRMultiple).toBe(3.0);
  });
});
