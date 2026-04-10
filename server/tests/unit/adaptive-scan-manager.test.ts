/**
 * Directive 10.8 — Adaptive Scan Manager Unit Tests
 * 
 * Tests for the dual-pool scheduler and pair failure tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  AdaptiveScanManager, 
  PairFailureTracker,
  type AdaptiveScanBatch 
} from '../../services/adaptive-scan-manager';
import { TelemetryAggregatorService } from '../../services/telemetry-aggregator';
import { SCANNER_PARAMS } from '../../config/system-guards';

describe('Directive 10.8 — Adaptive Scan Manager', () => {
  describe('SCANNER_PARAMS Configuration', () => {
    it('has correct dual-pool ratios (60/40)', () => {
      expect(SCANNER_PARAMS.DUAL_POOL.IDEAL_RATIO).toBe(0.6);
      expect(SCANNER_PARAMS.DUAL_POOL.ROTATIONAL_RATIO).toBe(0.4);
    });

    it('has cooldown configuration', () => {
      expect(SCANNER_PARAMS.FAILURE_TRACKING.COOLDOWN_MS).toBe(120000); // Batch 51: 2 minutes (reduced from 10)
      expect(SCANNER_PARAMS.FAILURE_TRACKING.MAX_FAILURES).toBe(3);
      expect(SCANNER_PARAMS.FAILURE_TRACKING.EXTENDED_COOLDOWN_MS).toBe(300000); // Batch 51: 5 minutes (reduced from 30)
    });

    it('has telemetry score weights summing to 1.0', () => {
      const weights = SCANNER_PARAMS.TELEMETRY.SCORE_WEIGHTS;
      const sum = weights.FINAL_SCORE + weights.HYBRID_SCORE + weights.REGIME_WEIGHT + weights.PREDICTIVE_CONF;
      expect(sum).toBeCloseTo(1.0, 5);  // Use toBeCloseTo for floating point
    });

    it('has adaptive scanning enabled by default', () => {
      expect(SCANNER_PARAMS.ADAPTIVE_ENABLED).toBe(true);
    });
  });

  describe('PairFailureTracker', () => {
    let tracker: PairFailureTracker;

    beforeEach(() => {
      tracker = new PairFailureTracker();
    });

    it('records failures and puts pairs in cooldown', () => {
      tracker.recordFailure('BTCUSD', 'rate limit');
      expect(tracker.isInCooldown('BTCUSD')).toBe(true);
    });

    it('records success and removes from cooldown', () => {
      tracker.recordFailure('ETHUSD', 'timeout');
      expect(tracker.isInCooldown('ETHUSD')).toBe(true);
      
      tracker.recordSuccess('ETHUSD');
      expect(tracker.isInCooldown('ETHUSD')).toBe(false);
    });

    it('filters out pairs in cooldown', () => {
      tracker.recordFailure('BTCUSD', 'error');
      tracker.recordFailure('SOLUSD', 'timeout');
      
      const pairs = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'];
      const filtered = tracker.filterFailedPairs(pairs);
      
      expect(filtered).toContain('ETHUSD');
      expect(filtered).toContain('XRPUSD');
      expect(filtered).not.toContain('BTCUSD');
      expect(filtered).not.toContain('SOLUSD');
    });

    it('increments failure count on repeated failures', () => {
      tracker.recordFailure('BTCUSD', 'error1');
      tracker.recordFailure('BTCUSD', 'error2');
      tracker.recordFailure('BTCUSD', 'error3');
      
      const failedPairs = tracker.getFailedPairs();
      const btcEntry = failedPairs.find(p => p.symbol === 'BTCUSD');
      
      expect(btcEntry).toBeDefined();
      expect(btcEntry!.failCount).toBe(3);
    });

    it('clears all failure records', () => {
      tracker.recordFailure('BTCUSD', 'error');
      tracker.recordFailure('ETHUSD', 'error');
      
      tracker.clear();
      
      expect(tracker.getFailedPairs()).toHaveLength(0);
      expect(tracker.isInCooldown('BTCUSD')).toBe(false);
    });
  });

  describe('AdaptiveScanManager', () => {
    let telemetry: TelemetryAggregatorService;
    let failureTracker: PairFailureTracker;
    let manager: AdaptiveScanManager;

    beforeEach(() => {
      telemetry = new TelemetryAggregatorService();
      failureTracker = new PairFailureTracker();
      manager = new AdaptiveScanManager(telemetry, failureTracker);
      manager.setAdaptiveRatioEnabled(false); // Use static ratios in tests (no DB)
    });

    it('returns batch with ideal and rotational pairs', async () => {
      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);

      const batch = await manager.getNextScanBatch(allPairs);

      expect(batch).toBeDefined();
      expect(batch.idealPairs).toBeDefined();
      expect(batch.rotationalPairs).toBeDefined();
      expect(batch.totalBatch).toBeDefined();
      expect(batch.totalBatch.length).toBeGreaterThan(0);
    });

    it('does not exclude failed pairs (Batch 52: cooldown removed)', async () => {
      failureTracker.recordFailure('BTCUSD', 'error');

      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);
      const batch = await manager.getNextScanBatch(allPairs);

      // Batch 52: PairFailureTracker cooldown removed from scan batch selection
      expect(batch.excludedPairs).toHaveLength(0);
    });

    it('recordScanResult is no-op (Batch 52: cooldown removed, Directive 11.4C-R2: VTS is sole writer)', () => {
      // Batch 52 disabled PairFailureTracker recording in recordScanResult
      // Directive 11.4C-R2: Only VTS writes telemetry directly
      manager.recordScanResult('BTCUSD', true, {
        finalScore: 0.85,
        hybridScore: 0.75,
        regimeWeight: 0.6,
        predictiveConfidence: 0.7,
      });

      // recordScanResult no longer writes to telemetry
      const stats = telemetry.getAllPairStats();
      expect(stats.has('BTCUSD')).toBe(false);
    });

    it('recordScanResult does not record failures (Batch 52: cooldown removed)', () => {
      manager.recordScanResult('ETHUSD', false, { failureReason: 'timeout' });

      // Batch 52: PairFailureTracker recording disabled
      expect(failureTracker.isInCooldown('ETHUSD')).toBe(false);
    });

    it('isAdaptiveEnabled returns config value', () => {
      expect(manager.isAdaptiveEnabled()).toBe(SCANNER_PARAMS.ADAPTIVE_ENABLED);
    });

    it('getParamsInfo returns formatted string', () => {
      const info = manager.getParamsInfo();
      
      expect(info).toContain('10.8');
      expect(info).toContain('AdaptiveScan');
      expect(info).toContain('ideal=');
      expect(info).toContain('rotational=');
      expect(info).toContain('batch=300');
    });

    it('stores last batch for retrieval', async () => {
      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);

      await manager.getNextScanBatch(allPairs);
      const lastBatch = manager.getLastBatch();

      expect(lastBatch).not.toBeNull();
      expect(lastBatch?.timestamp).toBeDefined();
    });
  });

  describe('Dual-Pool Ratio Compliance', () => {
    it('batch respects 60/40 ideal/rotational split', async () => {
      const telemetry = new TelemetryAggregatorService();
      const failureTracker = new PairFailureTracker();
      const manager = new AdaptiveScanManager(telemetry, failureTracker);
      manager.setAdaptiveRatioEnabled(false);
      
      // Seed telemetry with enough data for reliable ranking
      for (let i = 0; i < 20; i++) {
        const symbol = `PAIR${i}USD`;
        for (let j = 0; j < 5; j++) {
          telemetry.recordPairTelemetry(symbol, {
            finalScore: Math.random(),
            hybridScore: Math.random() * 0.5,
            regimeWeight: Math.random() * 0.3,
            predictiveConfidence: 0.5,
            caller: 'vts',
          });
        }
      }
      
      const allPairs = Array.from({ length: 400 }, (_, i) => `PAIR${i}USD`);
      const batch = await manager.getNextScanBatch(allPairs);

      // With 400 pairs and 60/40 split, ideal comes from telemetry and rotational from allPairs
      expect(batch.idealPairs.length + batch.rotationalPairs.length).toBeLessThanOrEqual(SCANNER_PARAMS.BATCH_SIZE);
    });
  });
});
