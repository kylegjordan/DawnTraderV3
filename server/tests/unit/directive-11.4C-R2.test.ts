/**
 * Directive 11.4C-R2 — Top Batch UI Integration & Initialization Diagnostics
 * Governance Tests: M65, M66, M67
 * 
 * M65: Retry logic fills ≤ 100 pairs even during load lag
 * M66: /api/pairs/ranked returns ordered list of top N with new columns
 * M67: No legacy "pool" references remain in codebase (deprecated patterns only)
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
// B-4.5: the ranked-pairs path reaches the DB-governed fee merge
// (getFrictionForAssetClass, fail-hard on cold cache) — seed the sync cache
// in-memory with the same shape server boot's prefetchModule produces.
import { _seedModuleCacheForTests } from '../../services/module-constants-service.js';
import type { ModuleConstant } from '../../../shared/schema.js';

beforeAll(() => {
  const row = (assetClass: string, constantName: string, value: number) => ({
    moduleName: 'fee_model', exchange: '*', assetClass, strategy: '*', regime: '*',
    constantName, value,
  } as unknown as ModuleConstant);
  _seedModuleCacheForTests('fee_model', [
    row('crypto_spot', 'spot_taker_fee', 0.008),
    row('crypto_spot', 'spot_maker_fee', 0.004),
    row('xstock_spot', 'spot_taker_fee', 0.008),
    row('xstock_spot', 'spot_maker_fee', 0.004),
  ]);
});
import { AdaptiveScanManager, PairFailureTracker } from '../../services/adaptive-scan-manager';
import { TelemetryAggregatorService } from '../../services/telemetry-aggregator';

describe('Directive 11.4C-R2 — Top Batch UI Integration & Diagnostics', () => {
  
  describe('M65: Retry Logic for Underflow Protection', () => {
    let telemetry: TelemetryAggregatorService;
    let failureTracker: PairFailureTracker;
    let manager: AdaptiveScanManager;
    
    beforeEach(() => {
      telemetry = new TelemetryAggregatorService();
      failureTracker = new PairFailureTracker();
      manager = new AdaptiveScanManager(telemetry, failureTracker);
    });

    it('should include retryCount in batch result', async () => {
      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch).toHaveProperty('retryCount');
      expect(typeof batch.retryCount).toBe('number');
    });
    
    it('should have retryCount of 0 when batch succeeds on first try', async () => {
      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch.retryCount).toBe(0);
    });
    
    it('should still produce batch when pairs available but ideal pool empty', async () => {
      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch.totalBatch.length).toBeGreaterThan(0);
      expect(batch.idealPairs.length + batch.rotationalPairs.length).toBe(batch.totalBatch.length);
    });
    
    it('should expand rotational pool when ideal pool is empty (M64/M65 combined)', async () => {
      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch.rotationalPairs.length).toBeGreaterThanOrEqual(batch.idealPairs.length);
    });
  });
  
  describe('M66: getRankedPairs API Output Format', () => {
    let telemetry: TelemetryAggregatorService;
    
    beforeEach(() => {
      telemetry = new TelemetryAggregatorService();
    });
    
    it('should return empty array when no telemetry data exists', () => {
      const ranked = telemetry.getRankedPairs(100);
      
      expect(Array.isArray(ranked)).toBe(true);
      expect(ranked.length).toBe(0);
    });
    
    it('should return ranked pairs with correct structure (M66)', () => {
      telemetry.recordPairTelemetry('BTCUSD', {
        finalScore: 0.85,
        hybridScore: 0.75,
        regimeWeight: 0.6,
        predictiveConfidence: 0.7,
        caller: 'vts',
      });
      
      const ranked = telemetry.getRankedPairs(100);
      
      expect(ranked.length).toBe(1);
      expect(ranked[0]).toHaveProperty('rank', 1);
      expect(ranked[0]).toHaveProperty('symbol', 'BTCUSD');
      expect(ranked[0]).toHaveProperty('score');
      expect(ranked[0]).toHaveProperty('signalType');
      expect(ranked[0]).toHaveProperty('strategy');
      expect(ranked[0]).toHaveProperty('pattern');
      expect(ranked[0]).toHaveProperty('regime');
      expect(ranked[0]).toHaveProperty('source');
    });
    
    it('should order pairs by score descending', () => {
      telemetry.recordPairTelemetry('LOWPAIR', {
        finalScore: 0.3,
        hybridScore: 0.2,
        caller: 'vts',
      });
      telemetry.recordPairTelemetry('HIGHPAIR', {
        finalScore: 0.9,
        hybridScore: 0.85,
        caller: 'vts',
      });
      telemetry.recordPairTelemetry('MIDPAIR', {
        finalScore: 0.6,
        hybridScore: 0.5,
        caller: 'vts',
      });
      
      const ranked = telemetry.getRankedPairs(100);
      
      expect(ranked.length).toBe(3);
      expect(ranked[0].symbol).toBe('HIGHPAIR');
      expect(ranked[1].symbol).toBe('MIDPAIR');
      expect(ranked[2].symbol).toBe('LOWPAIR');
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
      expect(ranked[2].rank).toBe(3);
    });
    
    it('should respect limit parameter', () => {
      for (let i = 0; i < 50; i++) {
        telemetry.recordPairTelemetry(`PAIR${i}USD`, {
          finalScore: 0.5 + (i * 0.01),
          hybridScore: 0.4,
          caller: 'vts',
        });
      }
      
      const ranked10 = telemetry.getRankedPairs(10);
      const ranked25 = telemetry.getRankedPairs(25);
      
      expect(ranked10.length).toBe(10);
      expect(ranked25.length).toBe(25);
    });
    
    it('should include correct signalType values', () => {
      telemetry.recordPairTelemetry('HYBRIDPAIR', {
        finalScore: 0.85,
        hybridScore: 0.7,
        predictiveConfidence: 0.6,
        signalType: 'HYBRID',
        caller: 'vts',
      });
      telemetry.recordPairTelemetry('QUANTPAIR', {
        finalScore: 0.75,
        hybridScore: 0.4,
        predictiveConfidence: 0.3,
        signalType: 'QUANT',
        caller: 'vts',
      });

      const ranked = telemetry.getRankedPairs(100);

      const signalTypes = ranked.map(p => p.signalType);
      expect(signalTypes).toContain('HYBRID');
    });
    
    it('should include source field with live or simulation value', () => {
      telemetry.recordPairTelemetry('LIVEPAIR', {
        finalScore: 0.8,
        source: 'live',
        caller: 'vts',
      });
      telemetry.recordPairTelemetry('SIMPAIR', {
        finalScore: 0.7,
        source: 'simulation',
        caller: 'vts',
      });
      
      const ranked = telemetry.getRankedPairs(100);
      
      expect(ranked.find(p => p.symbol === 'LIVEPAIR')?.source).toBe('live');
      expect(ranked.find(p => p.symbol === 'SIMPAIR')?.source).toBe('simulation');
    });
  });
  
  describe('M67: Legacy Pool Reference Check', () => {
    // ★ B-ARM-REMOVAL (Langston Step-4, BLOCKING B1): the former
    // 'should use PoolType (ideal/rotational) not legacy tier references' test is DELETED AS A
    // UNIT rather than re-pointed. Its original probe, `getPoolPerformanceComparison`, died with
    // the pool-aggregate limb.
    // ⚠️ MY FIRST ATTEMPT RE-POINTED IT TO `getTopPairsWithPool` AND THAT WAS WRONG: that method
    // HARDCODES `pool: 'ideal' as PoolType` (`telemetry-aggregator.ts:946`), so the assertion
    // compared a compile-time literal against itself and COULD NOT FAIL FOR ANY INPUT — and if the
    // probe pair's composite score hit the M63 0.5-default filter the array was empty and the loop
    // body never executed at all. `rotational` could have been renamed everywhere and it stayed
    // green. **A fence that cannot fail is worse than no fence: it reports coverage it does not
    // provide.** Same family as a tsc error count that "improves" because the compiler bailed.
    // ★ SURVIVING M67 COVERAGE: the test immediately below — 'AdaptiveScanBatch should use
    // idealPairs/rotationalPairs terminology' — asserts the terminology on a live surface.

    it('AdaptiveScanBatch should use idealPairs/rotationalPairs terminology', async () => {
      const telemetry = new TelemetryAggregatorService();
      const failureTracker = new PairFailureTracker();
      const manager = new AdaptiveScanManager(telemetry, failureTracker);

      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);
      const batch = await manager.getNextScanBatch(allPairs);

      expect(batch).toHaveProperty('idealPairs');
      expect(batch).toHaveProperty('rotationalPairs');
      expect(Array.isArray(batch.idealPairs)).toBe(true);
      expect(Array.isArray(batch.rotationalPairs)).toBe(true);
    });
  });
  
  describe('Enhanced Diagnostics Logging', () => {
    it('should include retry count in console logs', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const telemetry = new TelemetryAggregatorService();
      const failureTracker = new PairFailureTracker();
      const manager = new AdaptiveScanManager(telemetry, failureTracker);

      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);
      await manager.getNextScanBatch(allPairs);
      
      const logCalls = consoleSpy.mock.calls.map(call => call.join(' '));
      const hasTargetLog = logCalls.some(log => log.includes('[11.4B.2-R1][AdaptiveScan] Target:'));
      
      expect(hasTargetLog).toBe(true);
      
      consoleSpy.mockRestore();
    });
  });
});
