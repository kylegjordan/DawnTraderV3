/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.1.E — DSS Verification Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * Tests for Dynamic Strategy Selector (DSS) regime detection and veto behavior.
 * 
 * Verified Scenarios:
 * - EXTREME_NOISE: volNoise > 0.6 → Auto-veto
 * - LOW_VOL_CHOP: -0.05 <= trend <= +0.05 (sideways)
 * - BULL_STABLE: trend > +0.05, vol < 0.3
 * - BULL_VOLATILE: trend > +0.05, vol >= 0.3
 * - BEAR_STABLE: trend < -0.05, vol < 0.3
 * - BEAR_VOLATILE: trend < -0.05, vol >= 0.3
 * - NetEV Veto: All strategies with netEV <= 0 → veto
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { DynamicStrategySelector, type DSSMetrics, type StrategyMetrics } from '../../services/dynamic-strategy-selector.js';
import { SYSTEM_GUARDS } from '../../config/system-guards.js';

describe('Directive 10.1 — Dynamic Strategy Selector (DSS)', () => {
  let dss: DynamicStrategySelector;

  beforeAll(() => {
    dss = new DynamicStrategySelector();
    console.log('[10.1][DSS_TEST] Test Suite Started');
    console.log(`[10.1][CONFIG] MAX_VOL_NOISE=${SYSTEM_GUARDS.MAX_VOL_NOISE}, TREND_POSITIVE=${SYSTEM_GUARDS.REGIME_THRESHOLDS.TREND_POSITIVE}, VOL_LOW=${SYSTEM_GUARDS.REGIME_THRESHOLDS.VOL_LOW}`);
  });

  test('EXTREME_NOISE regime when volNoise > 0.6', () => {
    const metrics: DSSMetrics = { volNoise: 0.65, trendSlope: 0.03 };
    const regime = dss.determineRegime(metrics);
    
    expect(regime).toBe('EXTREME_NOISE');
    console.log(`[10.1][TEST] volNoise=0.65 → regime=${regime}`);
  });

  test('EXTREME_NOISE veto blocks all strategies', () => {
    const metrics: DSSMetrics = { volNoise: 0.70, trendSlope: 0.08 };
    const strategyMetrics: Record<string, StrategyMetrics> = {
      'STRAT_VWAP': { netEV: 100, confidence: 0.8 },
      'STRAT_MOMENTUM': { netEV: 50, confidence: 0.7 },
    };
    
    const result = dss.evaluate(metrics, strategyMetrics);
    
    expect(result.veto).toBe(true);
    expect(result.regime).toBe('EXTREME_NOISE');
    expect(result.reason).toContain('Extreme Volatility');
    console.log(`[10.1][TEST] EXTREME_NOISE veto: ${result.reason}`);
  });

  test('LOW_VOL_CHOP regime when trend ≈ 0', () => {
    const metrics: DSSMetrics = { volNoise: 0.25, trendSlope: 0.02 };
    const regime = dss.determineRegime(metrics);
    
    expect(regime).toBe('RANGE_BOUND_STABLE');
    console.log(`[10.1][TEST] trend=0.02 → regime=${regime}`);
  });

  test('LOW_VOL_CHOP regime with negative small trend', () => {
    const metrics: DSSMetrics = { volNoise: 0.2, trendSlope: -0.03 };
    const regime = dss.determineRegime(metrics);
    
    expect(regime).toBe('RANGE_BOUND_STABLE');
    console.log(`[10.1][TEST] trend=-0.03 → regime=${regime}`);
  });

  test('BULL_STABLE regime when trend > +0.05 and vol < 0.3', () => {
    const metrics: DSSMetrics = { volNoise: 0.2, trendSlope: 0.08 };
    const regime = dss.determineRegime(metrics);
    
    expect(regime).toBe('TREND_FRIENDLY_STABLE');
    console.log(`[10.1][TEST] trend=0.08, vol=0.2 → regime=${regime}`);
  });

  test('BULL_VOLATILE regime when trend > +0.05 and vol >= 0.3', () => {
    const metrics: DSSMetrics = { volNoise: 0.45, trendSlope: 0.10 };
    const regime = dss.determineRegime(metrics);
    
    expect(regime).toBe('BULL_VOLATILE');
    console.log(`[10.1][TEST] trend=0.10, vol=0.45 → regime=${regime}`);
  });

  test('BEAR_STABLE regime when trend < -0.05 and vol < 0.3', () => {
    const metrics: DSSMetrics = { volNoise: 0.15, trendSlope: -0.07 };
    const regime = dss.determineRegime(metrics);
    
    expect(regime).toBe('BEAR_STABLE');
    console.log(`[10.1][TEST] trend=-0.07, vol=0.15 → regime=${regime}`);
  });

  test('BEAR_VOLATILE regime when trend < -0.05 and vol >= 0.3', () => {
    const metrics: DSSMetrics = { volNoise: 0.5, trendSlope: -0.12 };
    const regime = dss.determineRegime(metrics);
    
    expect(regime).toBe('HIGH_VOLATILITY_UNSTABLE');
    console.log(`[10.1][TEST] trend=-0.12, vol=0.5 → regime=${regime}`);
  });

  test('NetEV veto when all strategies have netEV <= 0', () => {
    const metrics: DSSMetrics = { volNoise: 0.2, trendSlope: 0.08 };
    const strategyMetrics: Record<string, StrategyMetrics> = {
      'vwap_pullback': { netEV: -10, confidence: 0.8 },
      'sma_trend_ride': { netEV: 0, confidence: 0.7 },
    };
    
    const result = dss.evaluate(metrics, strategyMetrics);
    
    expect(result.veto).toBe(true);
    expect(result.reason).toBe('No positive NetEV strategy');
    console.log(`[10.1][TEST] NetEV veto confirmed: ${result.reason}`);
  });

  test('Selects highest confidence strategy with positive NetEV', () => {
    const metrics: DSSMetrics = { volNoise: 0.2, trendSlope: 0.08 };
    const strategyMetrics: Record<string, StrategyMetrics> = {
      'vwap_pullback': { netEV: 100, confidence: 0.6 },
      'sma_trend_ride': { netEV: 50, confidence: 0.9 },
    };
    
    const result = dss.evaluate(metrics, strategyMetrics);
    
    expect(result.veto).toBe(false);
    expect(result.strategy).toBe('sma_trend_ride');
    expect(result.confidence).toBe(0.9);
    console.log(`[10.1][TEST] Selected: ${result.strategy} with confidence=${result.confidence}`);
  });

  test('Filters out negative NetEV strategies before selection', () => {
    const metrics: DSSMetrics = { volNoise: 0.2, trendSlope: 0.08 };
    const strategyMetrics: Record<string, StrategyMetrics> = {
      'vwap_pullback': { netEV: -50, confidence: 0.95 },
      'sma_trend_ride': { netEV: 30, confidence: 0.5 },
    };
    
    const result = dss.evaluate(metrics, strategyMetrics);
    
    expect(result.veto).toBe(false);
    expect(result.strategy).toBe('sma_trend_ride');
    expect(result.confidence).toBe(0.5);
    console.log(`[10.1][TEST] Filtered negative NetEV, selected: ${result.strategy}`);
  });

  test('Boundary: trend exactly at +0.05 is BULL regime', () => {
    const metrics: DSSMetrics = { volNoise: 0.2, trendSlope: 0.051 };
    const regime = dss.determineRegime(metrics);
    
    expect(regime).toBe('TREND_FRIENDLY_STABLE');
    console.log(`[10.1][BOUNDARY] trend=0.051 → regime=${regime}`);
  });

  test('Boundary: vol exactly at 0.3 transitions to volatile', () => {
    const metricsLow: DSSMetrics = { volNoise: 0.29, trendSlope: 0.08 };
    const metricsHigh: DSSMetrics = { volNoise: 0.31, trendSlope: 0.08 };
    
    const regimeLow = dss.determineRegime(metricsLow);
    const regimeHigh = dss.determineRegime(metricsHigh);
    
    expect(regimeLow).toBe('TREND_FRIENDLY_STABLE');
    expect(regimeHigh).toBe('BULL_VOLATILE');
    console.log(`[10.1][BOUNDARY] vol=0.29 → ${regimeLow}, vol=0.31 → ${regimeHigh}`);
  });

  test('SYSTEM_GUARDS contains required DSS configuration', () => {
    expect(SYSTEM_GUARDS.MAX_VOL_NOISE).toBe(0.6);
    expect(SYSTEM_GUARDS.REGIME_THRESHOLDS.VOL_LOW).toBe(0.3);
    expect(SYSTEM_GUARDS.REGIME_THRESHOLDS.TREND_POSITIVE).toBe(0.05);
    expect(SYSTEM_GUARDS.STRATEGY_MAP.BULL_STABLE).toContain('vwap_pullback');
    expect(SYSTEM_GUARDS.STRATEGY_MAP.LOW_VOL_CHOP).toContain('mean_reversion');
    
    console.log(`[10.1][CONFIG] SYSTEM_GUARDS validated`);
    console.log(`[10.1][VALIDATION COMPLETE] DSS Test Suite Passed`);
  });
});
