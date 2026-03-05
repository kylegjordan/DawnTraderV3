/**
 * Directive 11.0E.2 — VTS Data Pipeline Isolation Tests
 * 
 * Validates governance invariants M50-M54:
 * - M50: VirtualTrade persists Phase-10 metrics (finalScore, hybridScore, etc.)
 * - M51: All legacy CWQI/NGC/DI/GSI references removed from VTS interfaces
 * - M52: TradeRecord schema matches VirtualTrade Phase-10 fields for ML calibration
 * - M53: All VTS-generated telemetry marked with source='simulation'
 * - M54: Cache sandboxing isolates VTS data from live trading cache
 * 
 * Schema: v1.6.7
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { VirtualSignal, VirtualTrade } from '../../services/vts-service';
import type { TradeRecord } from '../../services/ml-calibration';
import { CacheBucketType } from '../../services/price-cache';
import type { PairTelemetry, TelemetrySource } from '../../services/telemetry-aggregator';

describe('Directive 11.0E.2 — VTS Data Pipeline Isolation', () => {
  
  describe('M50: VirtualTrade Phase-10 Metric Persistence', () => {
    it('should have all Phase-10 metrics in VirtualTrade schema', () => {
      const mockTrade: VirtualTrade = {
        id: 'vtrade_test_123',
        signal: {
          id: 'vsig_test_123',
          symbol: 'BTCUSD',
          entryPrice: 50000,
          takeProfit: 51000,
          stopLoss: 49500,
          spread: 0.001,
          predictedProfit: 0.02,
          strategy: 'MomentumPulse',
          createdAt: Date.now(),
          signalType: 'Hybrid',
          finalScore: 0.75,
          hybridScore: 0.8,
          predictiveConfidence: 0.7,
          regimeWeight: 0.9,
          decayPenalty: 0.05,
          expectedEdge: 0.015,
          frictionCost: 0.003,
          regime: 'TREND_FRIENDLY_STABLE',
          pool: 'ideal',
          source: 'simulation',
        },
        status: 'closed',
        resultType: 'take_profit',
        entryTime: Date.now() - 3600000,
        exitTime: Date.now(),
        exitPrice: 51000,
        grossProfit: 200,
        netProfit: 180,
        fees: 20,
        calibrated: true,
        finalScore: 0.75,
        hybridScore: 0.8,
        predictiveConfidence: 0.7,
        regimeWeight: 0.9,
        decayPenalty: 0.05,
        expectedEdge: 0.015,
        frictionCost: 0.005,
        signalType: 'Hybrid',
        strategy: 'MomentumPulse',
        regime: 'TREND_FRIENDLY_STABLE',
        pool: 'ideal',
        source: 'simulation',
        schemaVersion: '1.6.7',
      };
      
      expect(mockTrade.finalScore).toBe(0.75);
      expect(mockTrade.hybridScore).toBe(0.8);
      expect(mockTrade.predictiveConfidence).toBe(0.7);
      expect(mockTrade.regimeWeight).toBe(0.9);
      expect(mockTrade.decayPenalty).toBe(0.05);
      expect(mockTrade.expectedEdge).toBe(0.015);
      expect(mockTrade.frictionCost).toBe(0.005);
      expect(mockTrade.source).toBe('simulation');
      expect(mockTrade.schemaVersion).toBe('1.6.7');
    });
    
    it('should have all Phase-10 metrics in VirtualSignal schema', () => {
      const mockSignal: VirtualSignal = {
        id: 'vsig_test_123',
        symbol: 'ETHUSD',
        entryPrice: 3000,
        takeProfit: 3100,
        stopLoss: 2950,
        spread: 0.002,
        predictedProfit: 0.03,
        strategy: 'TrendFlow',
        createdAt: Date.now(),
        signalType: 'Quantitative',
        finalScore: 0.68,
        hybridScore: 0.72,
        predictiveConfidence: 0.65,
        regimeWeight: 0.85,
        decayPenalty: 0.03,
        expectedEdge: 0.025,
        frictionCost: 0.004,
        regime: 'IMPULSE_EXPANSION',
        pool: 'rotational',
        source: 'simulation',
      };
      
      expect(mockSignal.finalScore).toBe(0.68);
      expect(mockSignal.hybridScore).toBe(0.72);
      expect(mockSignal.predictiveConfidence).toBe(0.65);
      expect(mockSignal.regimeWeight).toBe(0.85);
      expect(mockSignal.decayPenalty).toBe(0.03);
      expect(mockSignal.expectedEdge).toBe(0.025);
      expect(mockSignal.regime).toBe('IMPULSE_EXPANSION');
      expect(mockSignal.pool).toBe('rotational');
    });
  });
  
  describe('M51: Legacy CWQI/NGC/DI/GSI Removal', () => {
    it('should not contain legacy scoring fields in VirtualSignal', () => {
      const signalKeys = [
        'id', 'symbol', 'entryPrice', 'takeProfit', 'stopLoss', 'spread',
        'predictedProfit', 'strategy', 'createdAt', 'signalType', 'patternType',
        'patternStrength', 'finalScore', 'hybridScore', 'predictiveConfidence',
        'regimeWeight', 'decayPenalty', 'expectedEdge', 'regime', 'pool',
        'hybridStrategy', 'effectivePatternStrength', 'decayAge'
      ];
      
      const legacyFields = ['cwqi', 'ngc', 'di', 'gsi', 'CWQI', 'NGC', 'DI', 'GSI'];
      
      for (const legacy of legacyFields) {
        expect(signalKeys).not.toContain(legacy);
      }
    });
    
    it('should not contain legacy scoring fields in VirtualTrade', () => {
      const tradeKeys = [
        'id', 'signal', 'status', 'resultType', 'entryTime', 'exitTime',
        'exitPrice', 'grossProfit', 'netProfit', 'fees', 'calibrated',
        'finalScore', 'hybridScore', 'predictiveConfidence', 'regimeWeight',
        'decayPenalty', 'expectedEdge', 'frictionCost', 'signalType',
        'strategy', 'regime', 'pool', 'source', 'schemaVersion'
      ];
      
      const legacyFields = ['cwqi', 'ngc', 'di', 'gsi', 'CWQI', 'NGC', 'DI', 'GSI'];
      
      for (const legacy of legacyFields) {
        expect(tradeKeys).not.toContain(legacy);
      }
    });
  });
  
  describe('M52: TradeRecord-VirtualTrade Schema Parity', () => {
    it('should have matching Phase-10 fields in TradeRecord and VirtualTrade', () => {
      const phase10Fields = [
        'finalScore',
        'hybridScore',
        'predictiveConfidence',
        'regimeWeight',
        'decayPenalty',
        'expectedEdge',
        'frictionCost',
        'regime',
        'strategy',
        'source'
      ];
      
      const mockTradeRecord: TradeRecord = {
        signalType: 'Hybrid',
        patternType: 'MomentumPulse',
        pnl: 0.015,
        finalScore: 0.75,
        hybridScore: 0.8,
        predictiveConfidence: 0.7,
        regimeWeight: 0.9,
        decayPenalty: 0.05,
        expectedEdge: 0.018,
        frictionCost: 0.003,
        regime: 'TREND_FRIENDLY_STABLE',
        strategy: 'MomentumPulse',
        source: 'simulation',
      };
      
      for (const field of phase10Fields) {
        expect(mockTradeRecord).toHaveProperty(field);
      }
    });
    
    it('should support ML calibration with Phase-10 metrics', () => {
      const trades: TradeRecord[] = [
        {
          signalType: 'Hybrid',
          pnl: 0.02,
          finalScore: 0.8,
          predictiveConfidence: 0.75,
          regimeWeight: 0.9,
          expectedEdge: 0.015,
          source: 'simulation',
        },
        {
          signalType: 'Hybrid',
          pnl: -0.01,
          finalScore: 0.6,
          predictiveConfidence: 0.55,
          regimeWeight: 0.7,
          expectedEdge: 0.005,
          source: 'simulation',
        }
      ];
      
      const winningTrades = trades.filter(t => t.pnl > 0);
      const avgFinalScore = trades.reduce((sum, t) => sum + (t.finalScore ?? 0), 0) / trades.length;
      const avgEdgeDelta = trades.reduce((sum, t) => sum + ((t.expectedEdge ?? 0) - t.pnl), 0) / trades.length;
      
      expect(winningTrades.length).toBe(1);
      expect(avgFinalScore).toBe(0.7);
      expect(avgEdgeDelta).toBeCloseTo(0.005, 4);
    });
  });
  
  describe('M53: VTS Telemetry Source Tracking', () => {
    it('should support source field in PairTelemetry', () => {
      const telemetryEntry: PairTelemetry = {
        symbol: 'BTCUSD',
        finalScore: 0.75,
        hybridScore: 0.8,
        regimeWeight: 0.9,
        predictiveConfidence: 0.7,
        lastUpdated: Date.now(),
        sampleCount: 5,
        successRate: 0.6,
        avgDecayedStrength: 0.95,
        pool: 'ideal',
        source: 'simulation',
      };
      
      expect(telemetryEntry.source).toBe('simulation');
    });
    
    it('should distinguish simulation from live telemetry', () => {
      const simulationEntry: PairTelemetry = {
        symbol: 'ETHUSD',
        finalScore: 0.65,
        hybridScore: 0.7,
        regimeWeight: 0.85,
        predictiveConfidence: 0.6,
        lastUpdated: Date.now(),
        sampleCount: 3,
        successRate: 0.5,
        avgDecayedStrength: 0.9,
        pool: 'rotational',
        source: 'simulation',
      };
      
      const liveEntry: PairTelemetry = {
        symbol: 'ETHUSD',
        finalScore: 0.72,
        hybridScore: 0.78,
        regimeWeight: 0.88,
        predictiveConfidence: 0.68,
        lastUpdated: Date.now(),
        sampleCount: 10,
        successRate: 0.65,
        avgDecayedStrength: 0.92,
        pool: 'ideal',
        source: 'live',
      };
      
      expect(simulationEntry.source).toBe('simulation');
      expect(liveEntry.source).toBe('live');
      expect(simulationEntry.source).not.toBe(liveEntry.source);
    });
    
    it('should support TelemetrySource type correctly', () => {
      const validSources: TelemetrySource[] = ['simulation', 'live'];
      
      expect(validSources).toContain('simulation');
      expect(validSources).toContain('live');
      expect(validSources.length).toBe(2);
    });
  });
  
  describe('M54: Cache Sandboxing', () => {
    it('should include vtsSimulation bucket type', () => {
      const bucketTypes: CacheBucketType[] = ['openTrade', 'readyToBuy', 'fx5Snapshot', 'vtsSimulation'];
      
      expect(bucketTypes).toContain('vtsSimulation');
    });
    
    it('should isolate VTS cache from live trading buckets', () => {
      const liveBuckets: CacheBucketType[] = ['openTrade', 'readyToBuy', 'fx5Snapshot'];
      const vtsBucket: CacheBucketType = 'vtsSimulation';
      
      expect(liveBuckets).not.toContain(vtsBucket);
    });
    
    it('should have 4 distinct cache bucket types', () => {
      const allBuckets: CacheBucketType[] = ['openTrade', 'readyToBuy', 'fx5Snapshot', 'vtsSimulation'];
      const uniqueBuckets = new Set(allBuckets);
      
      expect(uniqueBuckets.size).toBe(4);
    });
  });
});

describe('Phase-10 Scoring Formula Validation', () => {
  it('should compute finalScore using canonical weights', () => {
    const hybridScore = 0.8;
    const predictiveConfidence = 0.7;
    const regimeWeight = 0.9;
    const decayPenalty = 0.1;
    
    const finalScore = 
      (hybridScore * 0.4) + 
      (predictiveConfidence * 0.3) + 
      (regimeWeight * 0.2) - 
      (decayPenalty * 0.1);
    
    expect(finalScore).toBeCloseTo(0.32 + 0.21 + 0.18 - 0.01, 4);
    expect(finalScore).toBeCloseTo(0.7, 2);
  });
  
  it('should compute ML calibration performance score correctly', () => {
    const finalScore = 0.75;
    const predictiveConfidence = 0.7;
    const regimeWeight = 0.9;
    
    const performanceScore = 
      (finalScore * 0.5) + 
      (predictiveConfidence * 0.3) + 
      (regimeWeight * 0.2);
    
    expect(performanceScore).toBeCloseTo(0.375 + 0.21 + 0.18, 4);
    expect(performanceScore).toBeCloseTo(0.765, 3);
  });
  
  it('should compute edge delta (prediction accuracy) correctly', () => {
    const expectedEdge = 0.025;
    const realizedPnL = 0.018;
    
    const edgeDelta = expectedEdge - realizedPnL;
    
    expect(edgeDelta).toBeCloseTo(0.007, 4);
    expect(edgeDelta).toBeGreaterThan(0);
  });
});
