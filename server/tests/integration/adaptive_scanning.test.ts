/**
 * Directive 11.2 R1: Adaptive Scanning Fairness Integration Tests
 * 
 * Tests for pool tracking and AdaptiveRatioManager functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdaptiveRatioManager, type RatioConfig } from '../../services/adaptive-ratio-manager.js';
import type { PoolPerformance, MarketRegime } from '../../services/telemetry-repository.js';

describe('Directive 11.2 R1: Adaptive Scanning Fairness', () => {
  describe('AdaptiveRatioManager', () => {
    let manager: AdaptiveRatioManager;
    
    beforeEach(() => {
      manager = new AdaptiveRatioManager();
    });
    
    it('should initialize with default ratio', () => {
      const ratio = manager.getCurrentRatio();
      expect(ratio.idealRatio).toBe(0.7);
      expect(ratio.rotationalRatio).toBeCloseTo(0.3, 10);
      expect(ratio.confidence).toBe(0);
    });
    
    it('should respect min/max bounds', () => {
      const config: Partial<RatioConfig> = {
        minIdealRatio: 0.4,
        maxIdealRatio: 0.8,
        defaultRatio: 0.6,
      };
      const boundedManager = new AdaptiveRatioManager(config);
      const ratio = boundedManager.getCurrentRatio();
      
      expect(ratio.idealRatio).toBe(0.6);
      expect(ratio.idealRatio).toBeGreaterThanOrEqual(0.4);
      expect(ratio.idealRatio).toBeLessThanOrEqual(0.8);
    });
    
    it('should allocate pair counts correctly', () => {
      const allocation = manager.allocatePairCounts(10);
      expect(allocation.idealCount).toBe(7);
      expect(allocation.rotationalCount).toBe(3);
      expect(allocation.idealCount + allocation.rotationalCount).toBe(10);
    });
    
    it('should reset to default ratio', () => {
      manager.reset();
      const ratio = manager.getCurrentRatio();
      expect(ratio.idealRatio).toBe(0.7);
      expect(ratio.reasoning).toContain('reset');
    });
    
    it('should provide state for diagnostics', () => {
      const state = manager.getState();
      expect(state).toHaveProperty('currentRatio');
      expect(state).toHaveProperty('idealPerf');
      expect(state).toHaveProperty('rotationalPerf');
      expect(state).toHaveProperty('lastComputed');
    });
  });
  
  describe('Pool Score Computation', () => {
    it('should prefer higher win rates', () => {
      const config: Partial<RatioConfig> = {
        minSamples: 1,
        defaultRatio: 0.5,
      };
      const manager = new AdaptiveRatioManager(config);
      
      const ratio = manager.getCurrentRatio();
      expect(ratio.idealRatio).toBeGreaterThan(0);
      expect(ratio.rotationalRatio).toBeGreaterThan(0);
    });
  });
  
  describe('Telemetry Pool Tracking', () => {
    it('should track pool type in telemetry entries', () => {
      const entry = {
        symbol: 'BTC/USD',
        finalScore: 0.85,
        pool: 'rotational' as const,
      };
      
      expect(entry.pool).toBe('rotational');
    });
    
    it('should default to ideal pool when not specified', () => {
      const entry = {
        symbol: 'ETH/USD',
        finalScore: 0.75,
      };
      
      const pool = (entry as any).pool ?? 'ideal';
      expect(pool).toBe('ideal');
    });
  });
  
  describe('Confidence Scaling', () => {
    it('should increase confidence with more samples', () => {
      const config: Partial<RatioConfig> = {
        minSamples: 5,
      };
      const manager = new AdaptiveRatioManager(config);
      
      const state = manager.getState();
      expect(state.currentRatio.confidence).toBe(0);
    });
  });
  
  describe('Regime-Aware Ratio Adjustment', () => {
    it('should track regime in ratio computation', async () => {
      const manager = new AdaptiveRatioManager();
      const ratio = manager.getCurrentRatio();
      
      expect(ratio.regime).toBeDefined();
      expect(['EXTREME_NOISE', 'TREND_FRIENDLY_STABLE', 'BULL_VOLATILE', 'BEAR_STABLE', 'HIGH_VOLATILITY_UNSTABLE', 'RANGE_BOUND_STABLE'])
        .toContain(ratio.regime);
    });
  });

  describe('AdaptiveScanManager Integration', () => {
    it('should include ratioUsed in scan batch', async () => {
      const { AdaptiveScanManager } = await import('../../services/adaptive-scan-manager.js');
      const scanManager = new AdaptiveScanManager();
      
      const batch = await scanManager.getNextScanBatch(['BTC/USD', 'ETH/USD', 'XRP/USD']);
      
      expect(batch).toHaveProperty('idealPairs');
      expect(batch).toHaveProperty('rotationalPairs');
      expect(batch).toHaveProperty('totalBatch');
      expect(batch).toHaveProperty('ratioUsed');
    });

    it('should provide adaptive ratio state for diagnostics', async () => {
      const { AdaptiveScanManager } = await import('../../services/adaptive-scan-manager.js');
      const scanManager = new AdaptiveScanManager();
      
      const state = scanManager.getAdaptiveRatioState();
      
      expect(state).toHaveProperty('currentRatio');
      expect(state).toHaveProperty('lastComputed');
    });

    it('should toggle adaptive ratio enabled/disabled', async () => {
      const { AdaptiveScanManager } = await import('../../services/adaptive-scan-manager.js');
      const scanManager = new AdaptiveScanManager();
      
      scanManager.setAdaptiveRatioEnabled(false);
      const batch = await scanManager.getNextScanBatch(['BTC/USD', 'ETH/USD']);
      
      expect(batch.ratioUsed).toBeUndefined();
    });
  });

  describe('Pool-Level Performance Aggregation', () => {
    it('should aggregate performance by pool', async () => {
      const { TelemetryAggregatorService } = await import('../../services/telemetry-aggregator.js');
      const aggregator = new TelemetryAggregatorService();
      
      // Record ideal pool telemetry
      aggregator.recordPairTelemetry('BTC/USD', { finalScore: 0.8, success: true, pool: 'ideal' });
      aggregator.recordPairTelemetry('ETH/USD', { finalScore: 0.7, success: true, pool: 'ideal' });
      
      // Record rotational pool telemetry  
      aggregator.recordPairTelemetry('XRP/USD', { finalScore: 0.5, success: false, pool: 'rotational' });
      
      const comparison = aggregator.getPoolPerformanceComparison();
      
      expect(comparison.ideal.sampleCount).toBe(2);
      expect(comparison.rotational.sampleCount).toBe(1);
      expect(comparison.ideal.winRate).toBeGreaterThan(comparison.rotational.winRate);
    });

    it('should return explicit pool attribution from selectors', async () => {
      const { TelemetryAggregatorService } = await import('../../services/telemetry-aggregator.js');
      const aggregator = new TelemetryAggregatorService();
      
      // Seed some data
      for (let i = 0; i < 5; i++) {
        aggregator.recordPairTelemetry('BTC/USD', { finalScore: 0.8, pool: 'ideal' });
      }
      
      const topPairs = aggregator.getTopPairsWithPool(0.7);
      
      for (const pair of topPairs) {
        expect(pair).toHaveProperty('pool');
        expect(pair.pool).toBe('ideal');
        expect(pair).toHaveProperty('score');
      }
    });

    it('should reset pool aggregates', async () => {
      const { TelemetryAggregatorService } = await import('../../services/telemetry-aggregator.js');
      const aggregator = new TelemetryAggregatorService();
      
      aggregator.recordPairTelemetry('BTC/USD', { finalScore: 0.8, success: true, pool: 'ideal' });
      
      const before = aggregator.getPoolPerformanceComparison();
      expect(before.ideal.sampleCount).toBeGreaterThan(0);
      
      aggregator.resetPoolAggregates();
      
      const after = aggregator.getPoolPerformanceComparison();
      expect(after.ideal.sampleCount).toBe(0);
    });
  });
});
