/**
 * Directive 11.4B.2-R1 — Adaptive Scanning Dynamic N & Ratio Governance Tests
 * 
 * Tests M63 and M64 governance invariants:
 * - M63: Ideal Pool flush removes only pairs with performanceScore == 0.5 or undefined
 * - M64: Each FX5 cycle must always scan 100 pairs (total = actualIdeal + actualRotational)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryAggregatorService } from '../../services/telemetry-aggregator';
import { 
  AdaptiveScanManager, 
  PairFailureTracker 
} from '../../services/adaptive-scan-manager';
import { SCANNER_PARAMS } from '../../config/system-guards';

describe('Directive 11.4B.2-R1 — Adaptive Scanning Governance', () => {
  
  describe('M63: Ideal Pool Flush Logic', () => {
    let telemetry: TelemetryAggregatorService;
    
    beforeEach(() => {
      telemetry = new TelemetryAggregatorService();
    });

    it('excludes pairs with default performanceScore (0.5) from Ideal Pool', () => {
      telemetry.recordPairTelemetry('BTCUSD', {
        finalScore: 0.5,
        hybridScore: 0.5,
        regimeWeight: 0.5,
        predictiveConfidence: 0.5,
        success: true,
        pool: 'ideal',
      });
      
      const idealPairs = telemetry.getTopPairs(10);
      expect(idealPairs).not.toContain('BTCUSD');
    });

    it('excludes pairs with zero performanceScore from Ideal Pool', () => {
      telemetry.recordPairTelemetry('ETHUSD', {
        finalScore: 0,
        hybridScore: 0,
        regimeWeight: 0,
        predictiveConfidence: 0,
        success: false,
        pool: 'ideal',
      });
      
      const idealPairs = telemetry.getTopPairs(10);
      expect(idealPairs).not.toContain('ETHUSD');
    });

    it('includes pairs with non-default performanceScore in Ideal Pool', () => {
      telemetry.recordPairTelemetry('SOLUSD', {
        finalScore: 0.8,
        hybridScore: 0.7,
        regimeWeight: 0.9,
        predictiveConfidence: 0.6,
        success: true,
        pool: 'ideal',
      });
      
      const idealPairs = telemetry.getTopPairs(10);
      expect(idealPairs).toContain('SOLUSD');
    });

    it('includes pairs with low but non-default score in Ideal Pool', () => {
      telemetry.recordPairTelemetry('XRPUSD', {
        finalScore: 0.3,
        hybridScore: 0.4,
        regimeWeight: 0.2,
        predictiveConfidence: 0.5,
        success: true,
        pool: 'ideal',
      });
      
      const idealPairs = telemetry.getTopPairs(10);
      expect(idealPairs).toContain('XRPUSD');
    });

    it('getAvailableIdealPoolCount returns correct count (M63)', () => {
      telemetry.recordPairTelemetry('BTCUSD', { finalScore: 0.8, hybridScore: 0.7, regimeWeight: 0.9, predictiveConfidence: 0.6, success: true, pool: 'ideal' });
      telemetry.recordPairTelemetry('ETHUSD', { finalScore: 0.7, hybridScore: 0.6, regimeWeight: 0.8, predictiveConfidence: 0.5, success: true, pool: 'ideal' });
      
      const count = telemetry.getAvailableIdealPoolCount();
      expect(count).toBe(2);
    });

    it('rotational pool includes pairs with no entries (M63)', () => {
      telemetry.recordPairTelemetry('ETHUSD', { finalScore: 0.8, hybridScore: 0.7, regimeWeight: 0.9, predictiveConfidence: 0.6, success: true, pool: 'ideal' });
      
      const allPairs = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD'];
      const rotationalPairs = telemetry.getRotationalPairs(10, allPairs);
      
      expect(rotationalPairs).toContain('BTCUSD');
      expect(rotationalPairs).toContain('SOLUSD');
      expect(rotationalPairs).toContain('XRPUSD');
      expect(rotationalPairs).toContain('ADAUSD');
      expect(rotationalPairs).not.toContain('ETHUSD');
    });
  });

  describe('M64: Batch-Size Cycle Guarantee', () => {
    let telemetry: TelemetryAggregatorService;
    let failureTracker: PairFailureTracker;
    let manager: AdaptiveScanManager;

    beforeEach(() => {
      telemetry = new TelemetryAggregatorService();
      failureTracker = new PairFailureTracker();
      manager = new AdaptiveScanManager(telemetry, failureTracker);
      manager.setAdaptiveRatioEnabled(false);
    });

    it('batch size is configured to 300', () => {
      expect(SCANNER_PARAMS.BATCH_SIZE).toBe(300);
    });

    it('getNextScanBatch aims for BATCH_SIZE pairs when sufficient pairs available', async () => {
      for (let i = 0; i < 200; i++) {
        telemetry.recordPairTelemetry(`PAIR${i}USD`, {
          finalScore: 0.7 + (i * 0.001),
          hybridScore: 0.6,
          regimeWeight: 0.8,
          predictiveConfidence: 0.5,
          success: true,
          pool: 'ideal',
        });
      }
      
      const allPairs: string[] = [];
      for (let i = 0; i < 400; i++) {
        allPairs.push(`PAIR${i}USD`);
      }
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch.idealPairs.length + batch.rotationalPairs.length).toBe(SCANNER_PARAMS.BATCH_SIZE);
      expect(batch.totalBatch.length).toBeLessThanOrEqual(SCANNER_PARAMS.BATCH_SIZE);
    });

    it('uses underflow protection when ideal pool is sparse', async () => {
      for (let i = 0; i < 20; i++) {
        telemetry.recordPairTelemetry(`IDEAL${i}`, {
          finalScore: 0.8,
          hybridScore: 0.7,
          regimeWeight: 0.9,
          predictiveConfidence: 0.6,
          success: true,
          pool: 'ideal',
        });
      }
      
      const allPairs: string[] = [];
      for (let i = 0; i < 400; i++) {
        allPairs.push(`PAIR${i}USD`);
      }
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch.idealPairs.length).toBeLessThanOrEqual(20);
      expect(batch.idealPairs.length + batch.rotationalPairs.length).toBe(SCANNER_PARAMS.BATCH_SIZE);
    });

    it('fills entire batch from rotational when ideal pool is empty', async () => {
      const allPairs: string[] = [];
      for (let i = 0; i < 400; i++) {
        allPairs.push(`PAIR${i}USD`);
      }
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch.idealPairs.length).toBe(0);
      expect(batch.rotationalPairs.length).toBe(SCANNER_PARAMS.BATCH_SIZE);
      expect(batch.totalBatch.length).toBeLessThanOrEqual(SCANNER_PARAMS.BATCH_SIZE);
    });

    it('actualIdeal + actualRotational = BATCH_SIZE regardless of available ideal count', async () => {
      for (let i = 0; i < 45; i++) {
        telemetry.recordPairTelemetry(`IDEAL${i}`, {
          finalScore: 0.75,
          hybridScore: 0.7,
          regimeWeight: 0.8,
          predictiveConfidence: 0.6,
          success: true,
          pool: 'ideal',
        });
      }
      
      const allPairs: string[] = [];
      for (let i = 0; i < 400; i++) {
        allPairs.push(`PAIR${i}USD`);
      }
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      const total = batch.idealPairs.length + batch.rotationalPairs.length;
      expect(total).toBe(SCANNER_PARAMS.BATCH_SIZE);
    });
  });

  describe('Integration: M63 + M64 Combined', () => {
    let telemetry: TelemetryAggregatorService;
    let failureTracker: PairFailureTracker;
    let manager: AdaptiveScanManager;

    beforeEach(() => {
      telemetry = new TelemetryAggregatorService();
      failureTracker = new PairFailureTracker();
      manager = new AdaptiveScanManager(telemetry, failureTracker);
      manager.setAdaptiveRatioEnabled(false);
    });

    it('pairs with scored telemetry go to ideal pool (M63 + M64)', async () => {
      for (let i = 0; i < 30; i++) {
        telemetry.recordPairTelemetry(`IDEAL${i}`, {
          finalScore: 0.8,
          hybridScore: 0.7,
          regimeWeight: 0.9,
          predictiveConfidence: 0.6,
          success: true,
          pool: 'ideal',
        });
      }
      
      const allPairs: string[] = [];
      for (let i = 0; i < 30; i++) allPairs.push(`IDEAL${i}`);
      for (let i = 0; i < 370; i++) allPairs.push(`NEW${i}`);
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch.idealPairs.length).toBe(30);
      
      batch.idealPairs.forEach(symbol => {
        expect(symbol.startsWith('IDEAL')).toBe(true);
      });
      
      expect(batch.idealPairs.length + batch.rotationalPairs.length).toBe(SCANNER_PARAMS.BATCH_SIZE);
    });

    it('meritocracy pipeline starts clean with no legacy survivors', async () => {
      const allPairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD'];
      
      const batch = await manager.getNextScanBatch(allPairs);
      
      expect(batch.idealPairs.length).toBe(0);
      
      expect(batch.rotationalPairs.length).toBe(allPairs.length);
    });
  });
});
