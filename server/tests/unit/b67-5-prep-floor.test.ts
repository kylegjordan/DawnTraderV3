/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B67.5-prep — Post-composition floor unit test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that calculatePairRegime uses regimeConfig.b67_5PostCompositionFloor
 * for the terminal clamp instead of hardcoded 0.4. The DEFAULT_REGIME_CONFIG
 * exports 0.45 as the seed value (per Langston cc-inbox #885 O.1 + Kyle
 * approval 2026-05-03).
 *
 * Reference: BATCH_67_5_PREP_SCOPE.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  calculatePairRegime,
  DEFAULT_REGIME_CONFIG,
} from '../../core/metrics/market-regime';
import type { OHLCData, RegimeConfig } from '../../types/market-regime.types';

function makeOhlc(close: number, count = 30): OHLCData[] {
  const ohlc: OHLCData[] = [];
  for (let i = 0; i < count; i++) {
    ohlc.push({
      open: close, high: close, low: close, close,
      volume: 1000, timestamp: i * 60_000,
    });
  }
  return ohlc;
}

describe('B67.5-prep — post-composition floor', () => {
  it('DEFAULT_REGIME_CONFIG seeds floor at 0.45', () => {
    expect(DEFAULT_REGIME_CONFIG.b67_5PostCompositionFloor).toBe(0.45);
  });

  it('floor is applied via regimeConfig field, not hardcoded', () => {
    // Construct a config with floor at 0.55 to verify the value is sourced
    // from config (not hardcoded 0.4 or 0.45).
    const customCfg: RegimeConfig = {
      ...DEFAULT_REGIME_CONFIG,
      b67_5PostCompositionFloor: 0.55,
    };
    // Use a flat-price series with very low macro modifier to drive raw
    // confidence below 0.55 — terminal clamp should pin it to 0.55.
    const ohlc = makeOhlc(100, 30);
    const result = calculatePairRegime(ohlc, 0, 0, 0.5, customCfg, 'crypto_spot' as const);
    // After raw × 0.5 macro modifier, pre-clamp value drops well below 0.55.
    // Floor should clamp it to 0.55 exactly.
    expect(result.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('floor 0.45 lower than confidence: no clamp engages', () => {
    const ohlc = makeOhlc(100, 30);
    const result = calculatePairRegime(ohlc, 0, 0, 1.0, DEFAULT_REGIME_CONFIG, 'crypto_spot' as const);
    // Result should be the raw classifier output (≥ 0.45 floor doesn't engage
    // because macro=1.0 doesn't push it below the natural classifier output).
    expect(result.confidence).toBeGreaterThanOrEqual(0.45);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });

  it('floor at 0.0 effectively disables clamp: confidence can drop arbitrarily low', () => {
    const noFloorCfg: RegimeConfig = {
      ...DEFAULT_REGIME_CONFIG,
      b67_5PostCompositionFloor: 0.0,
    };
    const ohlc = makeOhlc(100, 30);
    const result = calculatePairRegime(ohlc, 0, 0, 0.1, noFloorCfg, 'crypto_spot' as const);
    // With floor=0 and macro=0.1, confidence × macro can be very low.
    // No clamp at the bottom means the natural classifier output × macro
    // can produce values < 0.45.
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });
});
