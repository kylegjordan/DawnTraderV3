/**
 * Directive 10.4 — Hybrid Integration Unit Tests
 * 
 * Tests for ensemble scoring and confluence detection between Quant and Pattern signals.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HybridIntegrationService, type QuantSignal, type HybridSignal } from '../../services/hybrid-integration';
import { HYBRID_PARAMS } from '../../config/system-guards';
import type { PatternSignal } from '../../types';

describe('Directive 10.4 — Hybrid Integration', () => {
  let service: HybridIntegrationService;

  beforeEach(() => {
    service = new HybridIntegrationService();
  });

  describe('computeEnsembleScore', () => {
    it('computes weighted ensemble score with all components', () => {
      const score = service.computeEnsembleScore(0.8, 0.7, 0.6);
      const expected = 0.8 * HYBRID_PARAMS.WEIGHTS.QUANT +
                      0.7 * HYBRID_PARAMS.WEIGHTS.PATTERN +
                      0.6 * HYBRID_PARAMS.WEIGHTS.PREDICTIVE;
      expect(score).toBeCloseTo(expected, 4);
    });

    it('uses default ML confidence (0.5) when not provided', () => {
      const score = service.computeEnsembleScore(0.8, 0.7);
      const expected = 0.8 * HYBRID_PARAMS.WEIGHTS.QUANT +
                      0.7 * HYBRID_PARAMS.WEIGHTS.PATTERN +
                      0.5 * HYBRID_PARAMS.WEIGHTS.PREDICTIVE;
      expect(score).toBeCloseTo(expected, 4);
    });

    it('returns MIN_SCORE threshold when all components are at threshold', () => {
      const score = service.computeEnsembleScore(0.65, 0.65, 0.65);
      expect(score).toBeCloseTo(0.65, 4);
    });
  });

  describe('detectConfluence', () => {
    const baseQuant: QuantSignal = {
      symbol: 'BTCUSD',
      strategy: 'vwap_pullback',
      entryPrice: 50000,
      stopPrice: 49000,
      targetPrice: 52000,
      confidence: 0.8,
      direction: 'BUY',
      timestamp: Date.now(),
      expectancy: 0.8,
    };

    const basePattern: PatternSignal = {
      symbol: 'BTCUSD',
      pattern: 'PINBAR',
      direction: 'BUY',
      strength: 0.85,
      timestamp: Date.now(),
    };

    it('Valid Confluence: Quant BUY + Pattern BUY within window returns HYBRID', () => {
      const quantSignals = [baseQuant];
      const patternSignals = [basePattern];

      const hybrids = service.detectConfluence(quantSignals, patternSignals);

      expect(hybrids.length).toBe(1);
      expect(hybrids[0].signalType).toBe('HYBRID');
      expect(hybrids[0].symbol).toBe('BTCUSD');
      expect(hybrids[0].patternType).toBe('PINBAR');
      expect(hybrids[0].hybridStrategy).toBe('H1_TREND_SNIPER');
      expect(hybrids[0].hybridScore).toBeGreaterThanOrEqual(HYBRID_PARAMS.MIN_SCORE);
    });

    it('Directional Mismatch: Quant BUY + Pattern SELL returns empty', () => {
      const quantSignals = [baseQuant];
      const patternSignals: PatternSignal[] = [{
        ...basePattern,
        direction: 'SELL',
      }];

      const hybrids = service.detectConfluence(quantSignals, patternSignals);
      expect(hybrids.length).toBe(0);
    });

    it('Time Mismatch: signals too far apart returns empty', () => {
      const quantSignals = [baseQuant];
      const patternSignals: PatternSignal[] = [{
        ...basePattern,
        timestamp: baseQuant.timestamp + (HYBRID_PARAMS.MAX_CONFLUENCE_WINDOW + 1) * 60000 * 2,
      }];

      const hybrids = service.detectConfluence(quantSignals, patternSignals);
      expect(hybrids.length).toBe(0);
    });

    it('Low Score: ensemble score below MIN_SCORE returns empty', () => {
      const lowConfQuant: QuantSignal = {
        ...baseQuant,
        expectancy: 0.3,
        confidence: 0.3,
      };
      const lowStrengthPattern: PatternSignal = {
        ...basePattern,
        strength: 0.3,
      };

      const hybrids = service.detectConfluence([lowConfQuant], [lowStrengthPattern]);
      expect(hybrids.length).toBe(0);
    });

    it('componentScores correctly populated for transparency', () => {
      const quantSignals = [baseQuant];
      const patternSignals: PatternSignal[] = [{
        ...basePattern,
        predictiveConfidence: 0.7,
      }];

      const hybrids = service.detectConfluence(quantSignals, patternSignals);

      expect(hybrids.length).toBe(1);
      expect(hybrids[0].componentScores).toBeDefined();
      expect(hybrids[0].componentScores.quant).toBe(0.8);
      expect(hybrids[0].componentScores.pattern).toBe(0.85);
      expect(hybrids[0].componentScores.ml).toBe(0.7);
    });

    it('selects H2_SLINGSHOT for breakout strategy', () => {
      const breakoutQuant: QuantSignal = {
        ...baseQuant,
        strategy: 'breakout',
      };

      const hybrids = service.detectConfluence([breakoutQuant], [basePattern]);

      expect(hybrids.length).toBe(1);
      expect(hybrids[0].hybridStrategy).toBe('H2_SLINGSHOT');
    });

    it('selects H3_GATECRASHER for mean_reversion strategy', () => {
      const meanRevQuant: QuantSignal = {
        ...baseQuant,
        strategy: 'mean_reversion',
      };

      const hybrids = service.detectConfluence([meanRevQuant], [basePattern]);

      expect(hybrids.length).toBe(1);
      expect(hybrids[0].hybridStrategy).toBe('H3_GATECRASHER');
    });

    it('multiple confluences generates multiple hybrids', () => {
      const quant1 = { ...baseQuant, symbol: 'BTCUSD' };
      const quant2 = { ...baseQuant, symbol: 'ETHUSD', strategy: 'sma_trend_ride' };
      
      const pattern1 = { ...basePattern, symbol: 'BTCUSD' };
      const pattern2 = { ...basePattern, symbol: 'ETHUSD', pattern: 'ENGULFING' as const };

      const hybrids = service.detectConfluence([quant1, quant2], [pattern1, pattern2]);

      expect(hybrids.length).toBe(2);
      expect(hybrids.map(h => h.symbol)).toContain('BTCUSD');
      expect(hybrids.map(h => h.symbol)).toContain('ETHUSD');
    });
  });

  describe('getHybridParamsInfo', () => {
    it('returns formatted configuration string', () => {
      const info = service.getHybridParamsInfo();
      expect(info).toContain('[10.4][CONFIG]');
      expect(info).toContain(`MIN_SCORE=${HYBRID_PARAMS.MIN_SCORE}`);
      expect(info).toContain(`WINDOW=${HYBRID_PARAMS.MAX_CONFLUENCE_WINDOW}`);
    });
  });
});
