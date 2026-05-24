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
      // B79.0n.STRATEGY (2026-05-24): selectHybridStrategy now derives from pattern
      // dimension (canonical hybrid keys) instead of legacy H1/H2/H3/H4 enum.
      // PINBAR → reverse_impulse per Directive 11.4H.6G PATTERN_TO_HYBRID.
      expect(hybrids[0].hybridStrategy).toBe('reverse_impulse');
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
        timestamp: baseQuant.timestamp + (HYBRID_PARAMS.MAX_CONFLUENCE_WINDOW + 1) * HYBRID_PARAMS.CANDLE_INTERVAL_MS,
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
      // componentScores.pattern uses effectivePatternStrength (decayed), which equals original for age=0
      expect(hybrids[0].componentScores.pattern).toBe(hybrids[0].effectivePatternStrength);
      expect(hybrids[0].componentScores.ml).toBe(0.7);
    });

    // B79.0n.STRATEGY (2026-05-24): legacy H1/H2/H3/H4 taxonomy retired (BUG-007 closure).
    // selectHybridStrategy now derives from PATTERN dimension, not from QUANT.strategy.
    // The breakout + mean_reversion tests below verify that varying quant.strategy with
    // the same PINBAR pattern produces the same canonical hybrid (reverse_impulse) —
    // demonstrating the new pattern-driven contract.
    it('PINBAR pattern always maps to reverse_impulse regardless of quant strategy (was H2_SLINGSHOT for breakout)', () => {
      const breakoutQuant: QuantSignal = {
        ...baseQuant,
        strategy: 'breakout',
      };

      const hybrids = service.detectConfluence([breakoutQuant], [basePattern]);

      expect(hybrids.length).toBe(1);
      expect(hybrids[0].hybridStrategy).toBe('reverse_impulse');
    });

    it('PINBAR pattern always maps to reverse_impulse regardless of quant strategy (was H3_GATECRASHER for mean_reversion)', () => {
      const meanRevQuant: QuantSignal = {
        ...baseQuant,
        strategy: 'mean_reversion',
      };

      const hybrids = service.detectConfluence([meanRevQuant], [basePattern]);

      expect(hybrids.length).toBe(1);
      expect(hybrids[0].hybridStrategy).toBe('reverse_impulse');
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

  // Directive 10.5 — Pattern Decay Logic
  describe('Pattern Decay Logic (Directive 10.5)', () => {
    it('Fresh Pattern (Age 0) - no decay', () => {
      const result = service.applyPatternDecay(1.0, 0);
      expect(result).toBeCloseTo(1.0, 4);
    });

    it('Aged Pattern (3 candles) - approximately 65% of original', () => {
      // e^(-0.15 * 3) = e^(-0.45) ≈ 0.6376
      const result = service.applyPatternDecay(1.0, 3);
      expect(result).toBeCloseTo(0.6376, 2);
    });

    it('Floor Enforcement (Age 50) - never below 30% of original', () => {
      // e^(-0.15 * 50) = e^(-7.5) ≈ 0.00055 → floor kicks in at 0.3
      const result = service.applyPatternDecay(1.0, 50);
      expect(result).toBeGreaterThanOrEqual(0.3);
      expect(result).toBeCloseTo(0.3, 4);
    });

    it('Floor scales with original strength', () => {
      // For strength 0.8, floor is 0.8 * 0.3 = 0.24
      const result = service.applyPatternDecay(0.8, 100);
      expect(result).toBeCloseTo(0.24, 4);
    });

    it('decayAge and effectivePatternStrength are populated in hybrid signals', () => {
      const now = Date.now();
      const candleIntervalMs = HYBRID_PARAMS.CANDLE_INTERVAL_MS;
      
      const quant: QuantSignal = {
        symbol: 'BTCUSD',
        strategy: 'vwap_pullback',
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        confidence: 0.8,
        direction: 'BUY',
        timestamp: now,
        expectancy: 0.8,
      };
      
      // Pattern is 2 candles old (within 5-candle confluence window)
      const pattern: PatternSignal = {
        symbol: 'BTCUSD',
        pattern: 'PINBAR',
        direction: 'BUY',
        strength: 0.9,
        timestamp: now - (2 * candleIntervalMs), // 2 candles ago
      };

      const hybrids = service.detectConfluence([quant], [pattern]);

      expect(hybrids.length).toBe(1);
      expect(hybrids[0].decayAge).toBeCloseTo(2.0, 1); // 2 candles
      // e^(-0.15 * 2) ≈ 0.74, so 0.9 * 0.74 ≈ 0.67
      expect(hybrids[0].effectivePatternStrength).toBeLessThan(0.9);
      expect(hybrids[0].effectivePatternStrength).toBeGreaterThan(0.9 * 0.3);
      expect(hybrids[0].effectivePatternStrength).toBeDefined();
      expect(hybrids[0].decayAge).toBeDefined();
    });

    it('componentScores.pattern uses decayed strength', () => {
      const now = Date.now();
      const candleIntervalMs = HYBRID_PARAMS.CANDLE_INTERVAL_MS;
      
      const quant: QuantSignal = {
        symbol: 'BTCUSD',
        strategy: 'vwap_pullback',
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        confidence: 0.8,
        direction: 'BUY',
        timestamp: now,
        expectancy: 0.8,
      };
      
      // Pattern is 1 candle old (within 5-candle confluence window)
      const pattern: PatternSignal = {
        symbol: 'BTCUSD',
        pattern: 'PINBAR',
        direction: 'BUY',
        strength: 0.85,
        timestamp: now - candleIntervalMs, // 1 candle ago
      };

      const hybrids = service.detectConfluence([quant], [pattern]);

      expect(hybrids.length).toBe(1);
      // componentScores.pattern should match effectivePatternStrength
      expect(hybrids[0].componentScores.pattern).toBeCloseTo(hybrids[0].effectivePatternStrength, 4);
    });

    it('decay rejects patterns outside confluence window', () => {
      const now = Date.now();
      const candleIntervalMs = HYBRID_PARAMS.CANDLE_INTERVAL_MS;
      
      const quant: QuantSignal = {
        symbol: 'BTCUSD',
        strategy: 'vwap_pullback',
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        confidence: 0.8,
        direction: 'BUY',
        timestamp: now,
        expectancy: 0.8,
      };
      
      // Pattern is 6 candles old (outside 5-candle confluence window)
      const pattern: PatternSignal = {
        symbol: 'BTCUSD',
        pattern: 'PINBAR',
        direction: 'BUY',
        strength: 0.9,
        timestamp: now - (6 * candleIntervalMs), // 6 candles ago - outside window
      };

      const hybrids = service.detectConfluence([quant], [pattern]);

      expect(hybrids.length).toBe(0); // Should not match - too old
    });
  });

  // ══════════════════════════════════════════════════════════════════════════════
  // Directive 10.7a — Hybrid Timeframe Guard Tests
  // ══════════════════════════════════════════════════════════════════════════════
  describe('Directive 10.7a - Hybrid Timeframe Guard', () => {
    it('isValidTimeframePair allows valid cross-timeframe pairs', () => {
      expect(service.isValidTimeframePair('1h', '15m')).toBe(true);
      expect(service.isValidTimeframePair('15m', '5m')).toBe(true);
      expect(service.isValidTimeframePair('1h', '5m')).toBe(true);
    });

    it('isValidTimeframePair rejects same-timeframe merges', () => {
      expect(service.isValidTimeframePair('1h', '1h')).toBe(false);
      expect(service.isValidTimeframePair('15m', '15m')).toBe(false);
      expect(service.isValidTimeframePair('5m', '5m')).toBe(false);
    });

    it('isValidTimeframePair allows undefined timeframes (legacy signals)', () => {
      expect(service.isValidTimeframePair(undefined, '15m')).toBe(true);
      expect(service.isValidTimeframePair('1h', undefined)).toBe(true);
      expect(service.isValidTimeframePair(undefined, undefined)).toBe(true);
    });

    it('detectConfluence skips same-timeframe hybrids', () => {
      const now = Date.now();
      
      const quant: QuantSignal = {
        symbol: 'BTCUSD',
        strategy: 'vwap_pullback',
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        confidence: 0.8,
        direction: 'BUY',
        timestamp: now,
        expectancy: 0.8,
        metadata: { timeframe: '5m' },
      };
      
      const pattern: PatternSignal = {
        symbol: 'BTCUSD',
        pattern: 'PINBAR',
        direction: 'BUY',
        strength: 0.9,
        timestamp: now,
        metadata: { timeframe: '5m' },  // Same timeframe as quant
      };

      const hybrids = service.detectConfluence([quant], [pattern]);
      expect(hybrids.length).toBe(0);  // Should be skipped by guard
    });

    it('detectConfluence allows valid cross-timeframe hybrids', () => {
      const now = Date.now();
      
      const quant: QuantSignal = {
        symbol: 'BTCUSD',
        strategy: 'vwap_pullback',
        entryPrice: 50000,
        stopPrice: 49000,
        targetPrice: 52000,
        confidence: 0.8,
        direction: 'BUY',
        timestamp: now,
        expectancy: 0.8,
        metadata: { timeframe: '1h' },
      };
      
      const pattern: PatternSignal = {
        symbol: 'BTCUSD',
        pattern: 'PINBAR',
        direction: 'BUY',
        strength: 0.9,
        timestamp: now,
        metadata: { timeframe: '15m' },  // Valid cross-timeframe
      };

      const hybrids = service.detectConfluence([quant], [pattern]);
      expect(hybrids.length).toBe(1);  // Should be accepted
      expect(hybrids[0].signalType).toBe('HYBRID');
    });
  });
});
