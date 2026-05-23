/**
 * Directive 11.3 — Dynamic Sizing Engine Integration Tests
 * 
 * Tests:
 * - Dynamic scaling proportional to equity
 * - Multiplier bounds (0.3 ≤ × ≤ 1.2)
 * - Hard cap enforcement
 * - Regime-specific variation
 * - Telemetry log accuracy
 * - No static base values allowed
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { prefetchModule } from '../../services/module-constants-service.js';
// B-NEW-43 Phase 2 chunk 6 (2026-05-23): warm module_constants modules
// read by code under test. Server boot calls prefetchModule for all
// PREFETCH_MODULES; unit tests must do the same explicitly. CI Postgres
// (chunks 4.0-4.7) populates module_constants via db:migrate; this hook
// loads the rows into the sync-read cache.
import { beforeAll as __b43_beforeAll } from 'vitest';
__b43_beforeAll(async () => {
  await prefetchModule("position_sizing");
});


describe('Directive 11.3: Dynamic Sizing Engine', () => {
  describe('Core Sizing Formula', () => {
    it('should compute size proportional to balance', async () => {
      const { computeDynamicSize, resetDSEHistory } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const result1 = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.0003,
        balance: 1000,
      });
      
      const result2 = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.0003,
        balance: 2000,
      });
      
      expect(result2.positionSize).toBeGreaterThan(result1.positionSize);
      expect(result2.baseSize).toBe(result1.baseSize * 2);
    });

    it('should enforce multiplier bounds (0.3 ≤ × ≤ 1.2)', async () => {
      const { computeDynamicSize, resetDSEHistory, DSE_CONFIG } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const result = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'EXTREME_NOISE',
        pool: 'rotational',
        volatility: 0.05,
        cost: 0.002,
        balance: 1000,
      });
      
      expect(result.sizeMultiplier).toBeGreaterThanOrEqual(DSE_CONFIG.MIN_MULTIPLIER);
      expect(result.sizeMultiplier).toBeLessThanOrEqual(DSE_CONFIG.MAX_MULTIPLIER);
    });

    it('should enforce hard cap on position size', async () => {
      const { computeDynamicSize, resetDSEHistory } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const result = await computeDynamicSize({
        strategyId: 'high_confidence',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.001,
        cost: 0.0001,
        balance: 100,
      });
      
      expect(result.positionSize).toBeLessThanOrEqual(result.baseSize * 1.2);
      if (result.capped) {
        expect(result.cappedAt).toBeDefined();
      }
    });
  });

  describe('Volatility and Cost Penalties', () => {
    it('should reduce size for high volatility', async () => {
      const { computeDynamicSize, resetDSEHistory } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const lowVolResult = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.005,
        cost: 0.0003,
        balance: 1000,
      });
      
      const highVolResult = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.04,
        cost: 0.0003,
        balance: 1000,
      });
      
      expect(highVolResult.breakdown.volPenalty).toBeLessThan(lowVolResult.breakdown.volPenalty);
    });

    it('should reduce size for high transaction costs', async () => {
      const { computeDynamicSize, resetDSEHistory } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const lowCostResult = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.0001,
        balance: 1000,
      });
      
      const highCostResult = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.002,
        balance: 1000,
      });
      
      expect(highCostResult.breakdown.costPenalty).toBeLessThanOrEqual(lowCostResult.breakdown.costPenalty);
    });
  });

  describe('Telemetry Tracking', () => {
    it('should record sizing decisions in history', async () => {
      const { computeDynamicSize, resetDSEHistory, getSizeHistory } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.0003,
        balance: 1000,
      });
      
      await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'ETH/USD',
        regime: 'HIGH_VOLATILITY_UNSTABLE',
        pool: 'rotational',
        volatility: 0.025,
        cost: 0.0005,
        balance: 1000,
      });
      
      const history = getSizeHistory();
      expect(history.length).toBe(2);
      expect(history[0].symbol).toBe('BTC/USD');
      expect(history[1].symbol).toBe('ETH/USD');
    });

    it('should track last sizing decision', async () => {
      const { computeDynamicSize, resetDSEHistory, getLastSizeDecision } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'SOL/USD',
        regime: 'RANGE_BOUND_STABLE',
        pool: 'ideal',
        volatility: 0.01,
        cost: 0.0002,
        balance: 500,
      });
      
      const lastDecision = getLastSizeDecision();
      expect(lastDecision).not.toBeNull();
      expect(lastDecision?.symbol).toBe('SOL/USD');
      expect(lastDecision?.regime).toBe('RANGE_BOUND_STABLE');
    });

    it('should compute average multiplier by regime', async () => {
      const { computeDynamicSize, resetDSEHistory, getAverageSizeMultiplierByRegime } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.0003,
        balance: 1000,
      });
      
      await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'ETH/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.0003,
        balance: 1000,
      });
      
      const avgMultiplier = getAverageSizeMultiplierByRegime('TREND_FRIENDLY_STABLE');
      expect(avgMultiplier).toBeGreaterThan(0);
      expect(avgMultiplier).toBeLessThanOrEqual(1.2);
    });
  });

  describe('DSE Multiplier Application', () => {
    it('should apply DSE multiplier to position sizing result', async () => {
      const { applyDSEMultiplier } = await import('../../services/paper-position-sizing.js');
      
      const baseResult = {
        quantity: 1.0,
        estimatedValue: 100,
      };
      
      const adjusted = applyDSEMultiplier(baseResult, 0.8, 'BTC/USD');
      
      expect(adjusted.dseAdjusted).toBe(true);
      expect(adjusted.dseMultiplier).toBe(0.8);
      expect(adjusted.quantity).toBe(0.8);
      expect(adjusted.originalQuantity).toBe(1.0);
    });

    it('should clamp DSE multiplier to bounds', async () => {
      const { applyDSEMultiplier } = await import('../../services/paper-position-sizing.js');
      
      const baseResult = {
        quantity: 1.0,
        estimatedValue: 100,
      };
      
      const tooLow = applyDSEMultiplier(baseResult, 0.1, 'BTC/USD');
      expect(tooLow.dseMultiplier).toBe(0.3);
      
      const tooHigh = applyDSEMultiplier(baseResult, 2.0, 'BTC/USD');
      expect(tooHigh.dseMultiplier).toBe(1.2);
    });
  });

  describe('Market Metrics', () => {
    it('should update and retrieve normalized volatility', async () => {
      const { updateVolatilityData, getNormalizedVolatility, clearVolatilityCache } = await import('../../core/metrics/market-metrics.js');
      clearVolatilityCache();
      
      const data = updateVolatilityData('BTC/USD', 500, 50000);
      
      expect(data.normalizedVol).toBe(0.01);
      expect(getNormalizedVolatility('BTC/USD')).toBe(0.01);
    });

    it('should classify volatility correctly', async () => {
      const { getVolatilityClassification } = await import('../../core/metrics/market-metrics.js');
      
      expect(getVolatilityClassification(0.005)).toBe('low');
      expect(getVolatilityClassification(0.02)).toBe('medium');
      expect(getVolatilityClassification(0.05)).toBe('high');
    });
  });

  describe('Cost Metrics', () => {
    // B79.0n.MCE (2026-05-21, Langston Q-VI option a): removed the
    // 'should update and retrieve transaction cost factor' test — it
    // exclusively exercised the dead-code chain (updateCostData +
    // getTransactionCostFactor) deleted from cost-metrics.ts this batch.
    it('should classify costs correctly', async () => {
      const { getCostClassification } = await import('../../core/metrics/cost-metrics.js');
      
      expect(getCostClassification(0.0001)).toBe('cheap');
      expect(getCostClassification(0.0005)).toBe('moderate');
      expect(getCostClassification(0.002)).toBe('expensive');
    });
  });

  describe('Diagnostics', () => {
    it('should provide complete DSE diagnostics', async () => {
      const { computeDynamicSize, resetDSEHistory, getDSEDiagnostics } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.0003,
        balance: 1000,
      });
      
      const diagnostics = getDSEDiagnostics();
      
      expect(diagnostics).toHaveProperty('lastDecision');
      expect(diagnostics).toHaveProperty('avgMultiplier');
      expect(diagnostics).toHaveProperty('historyCount');
      expect(diagnostics).toHaveProperty('byRegime');
      expect(diagnostics.historyCount).toBe(1);
    });
  });

  describe('Adaptive Weight Integration', () => {
    it('should increase multiplier with high edge and confidence weights', async () => {
      const { computeDynamicSize, resetDSEHistory, setMockAdaptiveWeights } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const mockWeights = new Map<string, Map<string, { [key: string]: number }>>();
      const regimeWeights = new Map<string, { [key: string]: number }>();
      regimeWeights.set('high_edge_strategy', { expectedEdge: 0.12, confidence: 0.9 });
      mockWeights.set('TREND_FRIENDLY_STABLE', regimeWeights);
      setMockAdaptiveWeights(mockWeights);
      
      const resultWithWeights = await computeDynamicSize({
        strategyId: 'high_edge_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.01,
        cost: 0.0002,
        balance: 1000,
      });
      
      setMockAdaptiveWeights(null);
      
      const resultDefault = await computeDynamicSize({
        strategyId: 'default_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.01,
        cost: 0.0002,
        balance: 1000,
      });
      
      expect(resultWithWeights.sizeMultiplier).toBeGreaterThan(resultDefault.sizeMultiplier);
    });

    it('should reduce multiplier with low edge and confidence weights', async () => {
      const { computeDynamicSize, resetDSEHistory, setMockAdaptiveWeights } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const mockWeights = new Map<string, Map<string, { [key: string]: number }>>();
      const regimeWeights = new Map<string, { [key: string]: number }>();
      regimeWeights.set('low_edge_strategy', { expectedEdge: 0.01, confidence: 0.2 });
      mockWeights.set('HIGH_VOLATILITY_UNSTABLE', regimeWeights);
      setMockAdaptiveWeights(mockWeights);
      
      const resultWithWeights = await computeDynamicSize({
        strategyId: 'low_edge_strategy',
        symbol: 'BTC/USD',
        regime: 'HIGH_VOLATILITY_UNSTABLE',
        pool: 'rotational',
        volatility: 0.01,
        cost: 0.0002,
        balance: 1000,
      });
      
      setMockAdaptiveWeights(null);
      
      const resultDefault = await computeDynamicSize({
        strategyId: 'default_strategy',
        symbol: 'BTC/USD',
        regime: 'HIGH_VOLATILITY_UNSTABLE',
        pool: 'rotational',
        volatility: 0.01,
        cost: 0.0002,
        balance: 1000,
      });
      
      expect(resultWithWeights.sizeMultiplier).toBeLessThan(resultDefault.sizeMultiplier);
    });

    it('should extract edge from winRate weight field', async () => {
      const { computeDynamicSize, resetDSEHistory, setMockAdaptiveWeights } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const mockWeights = new Map<string, Map<string, { [key: string]: number }>>();
      const regimeWeights = new Map<string, { [key: string]: number }>();
      regimeWeights.set('winrate_strategy', { winRate: 0.85, sampleCount: 50 });
      mockWeights.set('TREND_FRIENDLY_STABLE', regimeWeights);
      setMockAdaptiveWeights(mockWeights);
      
      const result = await computeDynamicSize({
        strategyId: 'winrate_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.01,
        cost: 0.0002,
        balance: 1000,
      });
      
      setMockAdaptiveWeights(null);
      
      expect(result.sizeMultiplier).toBeGreaterThan(0.3);
      expect(result.sizeMultiplier).toBeLessThan(1.2);
    });

    it('should derive edge from generic weight profile', async () => {
      const { computeDynamicSize, resetDSEHistory, setMockAdaptiveWeights } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const mockWeights = new Map<string, Map<string, { [key: string]: number }>>();
      const regimeWeights = new Map<string, { [key: string]: number }>();
      regimeWeights.set('generic_strategy', { param1: 0.8, param2: 0.7, param3: 0.9, momentum: 0.6, drawdown: 0.4 });
      mockWeights.set('RANGE_BOUND_STABLE', regimeWeights);
      setMockAdaptiveWeights(mockWeights);
      
      const resultWithWeights = await computeDynamicSize({
        strategyId: 'generic_strategy',
        symbol: 'BTC/USD',
        regime: 'RANGE_BOUND_STABLE',
        pool: 'rotational',
        volatility: 0.01,
        cost: 0.0002,
        balance: 1000,
      });
      
      setMockAdaptiveWeights(null);
      
      const resultDefault = await computeDynamicSize({
        strategyId: 'default_strategy',
        symbol: 'BTC/USD',
        regime: 'RANGE_BOUND_STABLE',
        pool: 'rotational',
        volatility: 0.01,
        cost: 0.0002,
        balance: 1000,
      });
      
      expect(resultWithWeights.sizeMultiplier).not.toEqual(resultDefault.sizeMultiplier);
    });

    it('should handle production-style weight profiles with DSE-compatible fields', async () => {
      const { computeDynamicSize, resetDSEHistory, setMockAdaptiveWeights } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const mockWeights = new Map<string, Map<string, { [key: string]: number }>>();
      
      const bullRegime = new Map<string, { [key: string]: number }>();
      bullRegime.set('H1_TREND_SNIPER', { expectedEdge: 0.08, confidence: 0.75, momentum: 0.6, patternStrength: 0.7 });
      mockWeights.set('TREND_FRIENDLY_STABLE', bullRegime);
      
      const bearRegime = new Map<string, { [key: string]: number }>();
      bearRegime.set('H1_TREND_SNIPER', { expectedEdge: 0.03, confidence: 0.4, momentum: 0.3, patternStrength: 0.4 });
      mockWeights.set('HIGH_VOLATILITY_UNSTABLE', bearRegime);
      
      setMockAdaptiveWeights(mockWeights);
      
      const bullResult = await computeDynamicSize({
        strategyId: 'H1_TREND_SNIPER',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.01,
        cost: 0.0002,
        balance: 1000,
      });
      
      const bearResult = await computeDynamicSize({
        strategyId: 'H1_TREND_SNIPER',
        symbol: 'BTC/USD',
        regime: 'HIGH_VOLATILITY_UNSTABLE',
        pool: 'rotational',
        volatility: 0.025,
        cost: 0.0005,
        balance: 1000,
      });
      
      setMockAdaptiveWeights(null);
      
      expect(bullResult.sizeMultiplier).toBeGreaterThan(bearResult.sizeMultiplier);
      expect(bullResult.sizeMultiplier).toBeGreaterThan(0.5);
      expect(bearResult.sizeMultiplier).toBeLessThan(0.5);
    });
  });

  describe('Regime and Pool Differentiation', () => {
    it('should produce different multipliers for different regimes', async () => {
      const { computeDynamicSize, resetDSEHistory } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      const bullResult = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.005,
        cost: 0.0001,
        balance: 1000,
      });
      
      const bearResult = await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'HIGH_VOLATILITY_UNSTABLE',
        pool: 'ideal',
        volatility: 0.04,
        cost: 0.001,
        balance: 1000,
      });
      
      expect(bullResult.sizeMultiplier).not.toEqual(bearResult.sizeMultiplier);
      expect(bullResult.sizeMultiplier).toBeGreaterThan(bearResult.sizeMultiplier);
    });

    it('should track sizing decisions by pool type', async () => {
      const { computeDynamicSize, resetDSEHistory, getSizeHistory } = await import('../../core/risk/dynamic-sizing-engine.js');
      resetDSEHistory();
      
      await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'BTC/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        volatility: 0.015,
        cost: 0.0003,
        balance: 1000,
      });
      
      await computeDynamicSize({
        strategyId: 'test_strategy',
        symbol: 'ETH/USD',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'rotational',
        volatility: 0.015,
        cost: 0.0003,
        balance: 1000,
      });
      
      const history = getSizeHistory();
      expect(history[0].pool).toBe('ideal');
      expect(history[1].pool).toBe('rotational');
    });
  });
});
