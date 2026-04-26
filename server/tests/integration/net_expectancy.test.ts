/**
 * Directive 11.3A — Net Expectancy Standardization Integration Tests
 * 
 * Tests:
 * - Canonical cost model computation (round-trip costs)
 * - Net geometry calculations (netExpectedEdge, netRewardToRisk)
 * - Cost-aware breakeven and target floor
 * - Signal Orchestrator net geometry enrichment
 * - Conditional geometry refresh logic
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('Directive 11.3A: Net Expectancy Standardization', () => {
  describe('Canonical Cost Model', () => {
    it('should compute total round-trip cost correctly', async () => {
      const { computeTotalRoundTripCost } = await import('../../core/math/cost-model.js');
      
      const totalCost = computeTotalRoundTripCost(0.001, 0.0005, 0.001);
      
      expect(totalCost).toBe(0.004);
    });
    
    it('should handle zero costs', async () => {
      const { computeTotalRoundTripCost } = await import('../../core/math/cost-model.js');
      
      const totalCost = computeTotalRoundTripCost(0, 0, 0);
      
      expect(totalCost).toBe(0);
    });
  });
  
  describe('Net Geometry Calculations', () => {
    it('should compute net expected edge correctly', async () => {
      const { computeNetGeometry } = await import('../../core/math/cost-model.js');
      
      const entry = 100;
      const stop = 95;
      const target = 110;
      const costMetrics = { fee: 0.001, slippage: 0.0005, spread: 0.001 };
      
      const geometry = computeNetGeometry(entry, stop, target, costMetrics);
      
      expect(geometry.netExpectedEdge).toBeLessThan(0.10);
      expect(geometry.netExpectedEdge).toBeGreaterThan(0);
      expect(geometry.netRewardToRisk).toBeGreaterThan(0);
    });
    
    it('should reduce edge by total cost', async () => {
      const { computeNetGeometry } = await import('../../core/math/cost-model.js');
      
      const entry = 100;
      const stop = 95;
      const target = 110;
      
      const zeroCostGeometry = computeNetGeometry(entry, stop, target, { fee: 0, slippage: 0, spread: 0 });
      const withCostGeometry = computeNetGeometry(entry, stop, target, { fee: 0.002, slippage: 0.001, spread: 0.002 });
      
      expect(withCostGeometry.netExpectedEdge).toBeLessThan(zeroCostGeometry.netExpectedEdge);
    });
    
    it('should compute net reward to risk correctly', async () => {
      const { computeNetGeometry } = await import('../../core/math/cost-model.js');
      
      const entry = 100;
      const stop = 95;
      const target = 115;
      const costMetrics = { fee: 0.001, slippage: 0.0005, spread: 0.001 };
      
      const geometry = computeNetGeometry(entry, stop, target, costMetrics);
      
      const grossR2R = (target - entry) / (entry - stop);
      expect(geometry.netRewardToRisk).toBeLessThan(grossR2R);
    });
    
    it('should compute deterministic net reward-to-risk value', async () => {
      const { computeNetGeometry, computeTotalRoundTripCost } = await import('../../core/math/cost-model.js');
      
      const entry = 100;
      const stop = 95;
      const target = 110;
      const costMetrics = { fee: 0.001, slippage: 0.0005, spread: 0.001 };
      
      const geometry = computeNetGeometry(entry, stop, target, costMetrics);
      const totalCost = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
      
      const executionEntry = entry * (1 + costMetrics.slippage + costMetrics.spread / 2);
      const riskPct = (executionEntry - stop) / executionEntry;
      const rewardPct = (target - executionEntry) / executionEntry;
      const expectedNetR2R = (rewardPct - totalCost) / riskPct;
      
      expect(geometry.netRewardToRisk).toBeCloseTo(expectedNetR2R, 6);
      expect(geometry.netRewardToRisk).toBeGreaterThan(1.5);
    });
  });
  
  describe('Cost-Aware Breakeven', () => {
    it('should compute net breakeven above gross entry', async () => {
      const { computeNetBreakeven } = await import('../../core/math/cost-model.js');
      
      const entry = 100;
      const costMetrics = { fee: 0.001, slippage: 0.0005, spread: 0.001 };
      
      const netBreakeven = computeNetBreakeven(entry, costMetrics);
      
      expect(netBreakeven).toBeGreaterThan(entry);
      expect(netBreakeven).toBe(entry * 1.004);
    });
  });
  
  describe('Cost-Aware Target Floor (B65.4.1: floor ABOVE target with slippage buffer)', () => {
    it('should compute net target floor ABOVE gross target by exactly the slippage buffer', async () => {
      const { computeNetTargetFloor } = await import('../../core/math/cost-model.js');

      const target = 110;
      const costMetrics = { fee: 0.001, slippage: 0.0005, spread: 0.001 };

      // Default multiplier 1.0
      const netTargetFloor = computeNetTargetFloor(target, costMetrics);

      // B65.4.1: floor sits ABOVE target by `slippage * multiplier` so that
      // a stop-out reversal still nets at-or-above the just-hit target value.
      expect(netTargetFloor).toBeGreaterThan(target);
      expect(netTargetFloor).toBeCloseTo(target * 1.0005, 6);
    });

    it('should respect a custom slippage buffer multiplier', async () => {
      const { computeNetTargetFloor } = await import('../../core/math/cost-model.js');

      const target = 110;
      const costMetrics = { fee: 0.001, slippage: 0.0005, spread: 0.001 };

      // 2x multiplier widens the buffer
      const wideFloor = computeNetTargetFloor(target, costMetrics, 2.0);
      // 0.5x multiplier tightens it
      const tightFloor = computeNetTargetFloor(target, costMetrics, 0.5);

      expect(wideFloor).toBeCloseTo(target * 1.001, 6);    // target * (1 + 0.0005 * 2.0)
      expect(tightFloor).toBeCloseTo(target * 1.00025, 6); // target * (1 + 0.0005 * 0.5)
      expect(wideFloor).toBeGreaterThan(tightFloor);
    });
  });
  
  describe('Cached Cost Metrics', () => {
    it('should return default costs for unknown symbols', async () => {
      const { getCachedCostMetrics, DEFAULT_FEE, DEFAULT_SLIPPAGE } = await import('../../core/math/cost-model.js');
      
      const metrics = getCachedCostMetrics('UNKNOWN/PAIR');
      
      expect(metrics.fee).toBe(DEFAULT_FEE);
      expect(metrics.slippage).toBe(DEFAULT_SLIPPAGE);
    });
    
    it('should include spread from price cache', async () => {
      const { getCachedCostMetrics } = await import('../../core/math/cost-model.js');
      
      const metrics = getCachedCostMetrics('BTC/USD');
      
      expect(metrics.spread).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Conditional Geometry Refresh (RTB Service)', () => {
    it('should trigger refresh when volatility shifts > 5%', async () => {
      const { shouldRecalculateGeometry } = await import('../../core/rtb/ready_to_buy_service.js');
      
      const signal = {
        signalId: 'test-1',
        symbol: 'BTC/USD',
        metadata: {
          volatility: 0.10,
          spread: 0.001,
          lastCostRefresh: Date.now()
        }
      } as any;
      
      const shouldRefresh = shouldRecalculateGeometry(signal, 0.11, 0.001);
      expect(shouldRefresh).toBe(true);
    });
    
    it('should trigger refresh when spread shifts > 5%', async () => {
      const { shouldRecalculateGeometry } = await import('../../core/rtb/ready_to_buy_service.js');
      
      const signal = {
        signalId: 'test-2',
        symbol: 'BTC/USD',
        metadata: {
          volatility: 0.10,
          spread: 0.001,
          lastCostRefresh: Date.now()
        }
      } as any;
      
      const shouldRefresh = shouldRecalculateGeometry(signal, 0.10, 0.0011);
      expect(shouldRefresh).toBe(true);
    });
    
    it('should trigger refresh when time > 180 seconds', async () => {
      const { shouldRecalculateGeometry } = await import('../../core/rtb/ready_to_buy_service.js');
      
      const signal = {
        signalId: 'test-3',
        symbol: 'BTC/USD',
        metadata: {
          volatility: 0.10,
          spread: 0.001,
          lastCostRefresh: Date.now() - 200000
        }
      } as any;
      
      const shouldRefresh = shouldRecalculateGeometry(signal, 0.10, 0.001);
      expect(shouldRefresh).toBe(true);
    });
    
    it('should NOT refresh when within thresholds', async () => {
      const { shouldRecalculateGeometry } = await import('../../core/rtb/ready_to_buy_service.js');
      
      const signal = {
        signalId: 'test-4',
        symbol: 'BTC/USD',
        metadata: {
          volatility: 0.10,
          spread: 0.001,
          lastCostRefresh: Date.now()
        }
      } as any;
      
      const shouldRefresh = shouldRecalculateGeometry(signal, 0.101, 0.00101);
      expect(shouldRefresh).toBe(false);
    });
  });
  
  describe('Schema Version', () => {
    it('should be v1.5.7 for Directive 11.3A', async () => {
      const { SCHEMA_VERSION, SCHEMA_DIRECTIVE } = await import('../../config/schema-version.js');
      
      expect(SCHEMA_VERSION).toBe('v1.6.3');
      expect(SCHEMA_DIRECTIVE).toBe('11.4C.1');
    });
    
    it('should have 11.3A in schema history', async () => {
      const { SCHEMA_HISTORY } = await import('../../config/schema-version.js');
      
      const entry = SCHEMA_HISTORY.find(h => h.version === 'v1.5.7');
      expect(entry).toBeDefined();
      expect(entry?.directive).toBe('11.3A');
      expect(entry?.description).toContain('Net Expectancy');
    });
  });
});
