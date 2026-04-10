/**
 * Directive 10.8 — Telemetry Aggregator Unit Tests
 * 
 * Tests for pair telemetry collection and ranking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryAggregatorService } from '../../services/telemetry-aggregator';
import { SCANNER_PARAMS } from '../../config/system-guards';

describe('Directive 10.8 — Telemetry Aggregator', () => {
  let telemetry: TelemetryAggregatorService;

  beforeEach(() => {
    telemetry = new TelemetryAggregatorService();
  });

  describe('recordPairTelemetry', () => {
    it('records telemetry for a pair', () => {
      telemetry.recordPairTelemetry('BTCUSD', {
        finalScore: 0.85,
        hybridScore: 0.75,
        regimeWeight: 0.6,
        predictiveConfidence: 0.7,
        caller: 'vts',
      });

      const stats = telemetry.getAllPairStats();
      expect(stats.has('BTCUSD')).toBe(true);
    });

    it('accumulates multiple samples for same pair', () => {
      for (let i = 0; i < 5; i++) {
        telemetry.recordPairTelemetry('ETHUSD', {
          finalScore: 0.7 + i * 0.05,
          caller: 'vts',
        });
      }

      const stats = telemetry.getAllPairStats();
      const ethStats = stats.get('ETHUSD');
      expect(ethStats?.samples).toBe(5);
    });
  });

  describe('getCompositeScore', () => {
    it('returns score even with few samples (Directive 11.4B.2-R1: minSamples removed)', () => {
      telemetry.recordPairTelemetry('BTCUSD', { finalScore: 0.9, caller: 'vts' });
      telemetry.recordPairTelemetry('BTCUSD', { finalScore: 0.85, caller: 'vts' });

      const score = telemetry.getCompositeScore('BTCUSD');
      expect(score).toBeGreaterThan(0);
    });

    it('calculates weighted composite score with enough samples', () => {
      for (let i = 0; i < 5; i++) {
        telemetry.recordPairTelemetry('SOLUSD', {
          finalScore: 0.8,
          hybridScore: 0.7,
          regimeWeight: 0.6,
          predictiveConfidence: 0.5,
          caller: 'vts',
        });
      }

      const score = telemetry.getCompositeScore('SOLUSD');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('uses correct weights from SCANNER_PARAMS', () => {
      for (let i = 0; i < 5; i++) {
        telemetry.recordPairTelemetry('XRPUSD', {
          finalScore: 1.0,
          hybridScore: 1.0,
          regimeWeight: 1.0,
          predictiveConfidence: 1.0,
          caller: 'vts',
        });
      }

      const score = telemetry.getCompositeScore('XRPUSD');
      const expectedSum = 
        SCANNER_PARAMS.TELEMETRY.SCORE_WEIGHTS.FINAL_SCORE +
        SCANNER_PARAMS.TELEMETRY.SCORE_WEIGHTS.HYBRID_SCORE +
        SCANNER_PARAMS.TELEMETRY.SCORE_WEIGHTS.REGIME_WEIGHT +
        SCANNER_PARAMS.TELEMETRY.SCORE_WEIGHTS.PREDICTIVE_CONF;
      
      expect(score).toBeCloseTo(Math.min(1, expectedSum), 2);
    });
  });

  describe('getTopPairs', () => {
    it('returns empty array when no telemetry data', () => {
      const topPairs = telemetry.getTopPairs(10);
      expect(topPairs).toHaveLength(0);
    });

    it('returns top performers by composite score', () => {
      // Add pairs with different scores
      const pairs = [
        { symbol: 'BTCUSD', score: 0.9 },
        { symbol: 'ETHUSD', score: 0.7 },
        { symbol: 'SOLUSD', score: 0.5 },
        { symbol: 'XRPUSD', score: 0.3 },
      ];

      for (const pair of pairs) {
        for (let i = 0; i < 5; i++) {
          telemetry.recordPairTelemetry(pair.symbol, {
            finalScore: pair.score,
            hybridScore: pair.score * 0.8,
            regimeWeight: pair.score * 0.6,
            predictiveConfidence: 0.5,
            caller: 'vts',
          });
        }
      }

      const topPairs = telemetry.getTopPairs(10);
      expect(topPairs).toContain('BTCUSD');
      expect(topPairs).toContain('ETHUSD');
    });
  });

  describe('getRotationalPairs', () => {
    it('returns undersampled pairs for exploration', () => {
      // Only add telemetry for some pairs
      for (let i = 0; i < 5; i++) {
        telemetry.recordPairTelemetry('BTCUSD', { finalScore: 0.8, caller: 'vts' });
      }

      const allPairs = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'];
      const rotational = telemetry.getRotationalPairs(4, allPairs);

      // ETHUSD, SOLUSD, XRPUSD should be in rotational (no samples)
      expect(rotational).not.toContain('BTCUSD');
      expect(rotational.length).toBeGreaterThan(0);
    });
  });

  describe('Cascade Efficiency Tracking', () => {
    it('records cascade efficiency metrics', () => {
      telemetry.recordCascadeEfficiency(100, 20, 5);

      const history = telemetry.getCascadeHistory();
      expect(history).toHaveLength(1);
      expect(history[0].global).toBe(100);
      expect(history[0].tactical).toBe(20);
      expect(history[0].precision).toBe(5);
    });

    it('calculates correct ratios', () => {
      telemetry.recordCascadeEfficiency(100, 25, 10);

      const history = telemetry.getCascadeHistory();
      expect(history[0].tacticalRatio).toBeCloseTo(0.25, 2);
      expect(history[0].precisionRatio).toBeCloseTo(0.4, 2);
    });

    it('maintains history of last 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        telemetry.recordCascadeEfficiency(100, i, i / 2);
      }

      const history = telemetry.getCascadeHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Timeframe Efficiency Report', () => {
    it('returns report with all timeframes', () => {
      const report = telemetry.getTimeframeEfficiencyReport();

      expect(report).toHaveLength(3);
      expect(report.map(r => r.timeframe)).toEqual(['1h', '15m', '5m']);
    });

    it('calculates average decayed strength per timeframe', () => {
      telemetry.recordPairTelemetry('BTCUSD', {
        finalScore: 0.8,
        decayedStrength: 0.7,
        timeframe: '1h',
        caller: 'vts',
      });

      telemetry.recordPairTelemetry('ETHUSD', {
        finalScore: 0.75,
        decayedStrength: 0.5,
        timeframe: '1h',
        caller: 'vts',
      });

      const report = telemetry.getTimeframeEfficiencyReport();
      const hourlyReport = report.find(r => r.timeframe === '1h');

      expect(hourlyReport?.sampleCount).toBe(2);
      expect(hourlyReport?.avgDecayedStrength).toBeCloseTo(0.6, 1);
    });
  });

  describe('clear', () => {
    it('clears all telemetry data', () => {
      telemetry.recordPairTelemetry('BTCUSD', { finalScore: 0.8, caller: 'vts' });
      telemetry.recordCascadeEfficiency(100, 20, 5);

      telemetry.clear();

      expect(telemetry.getAllPairStats().size).toBe(0);
      expect(telemetry.getCascadeHistory()).toHaveLength(0);
    });
  });
});
