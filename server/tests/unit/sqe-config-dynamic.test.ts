/**
 * Directive 11.0D — SQE Dynamic Configuration Tests
 * 
 * Validates that SQE dynamically responds to screener config changes
 * and uses dynamic backfill for missing FinalScore/RegimeWeight.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateFinalScore, calculateRegimeWeight } from '../../core/utils/score-calculator';
import { evaluateSignalQualitySync } from '../../core/filters/signal_quality_evaluator';

describe('[11.0D] SQE Dynamic Configuration', () => {
  describe('evaluateSignalQualitySync with dynamic backfill', () => {
    it('dynamically calculates missing FinalScore', () => {
      const input = {
        signalId: 'test-123',
        symbol: 'BTC/USD',
        strategy: 'SCALP',
        mode: 'paper' as const,
        assetClass: 'crypto_spot' as const,  // B79.0n.STORAGE: REQUIRED
        confidence: 0.7,
        regimeWeight: 0.5,
      };
      
      const result = evaluateSignalQualitySync(input);
      
      expect(result.metrics.finalScore).toBeGreaterThan(0);
      expect(result.metrics.finalScore).toBeLessThanOrEqual(1);
    });

    it('dynamically calculates missing RegimeWeight', () => {
      const input = {
        signalId: 'test-456',
        symbol: 'ETH/USD',
        strategy: 'MOMENTUM',
        mode: 'paper' as const,
        assetClass: 'crypto_spot' as const,  // B79.0n.STORAGE: REQUIRED
        finalScore: 0.5,
        trendStrength: 0.6,
        volatility: 0.2,
      };
      
      const result = evaluateSignalQualitySync(input);
      
      expect(result.metrics.regimeWeight).toBeGreaterThan(0);
      expect(result.metrics.regimeWeight).toBeLessThanOrEqual(1);
    });

    it('uses provided values when FinalScore and RegimeWeight exist', () => {
      const input = {
        signalId: 'test-789',
        symbol: 'SOL/USD',
        strategy: 'TREND',
        mode: 'live' as const,
        assetClass: 'crypto_spot' as const,  // B79.0n.STORAGE: REQUIRED
        finalScore: 0.75,
        regimeWeight: 0.65,
      };
      
      const result = evaluateSignalQualitySync(input);
      
      expect(result.metrics.finalScore).toBeCloseTo(0.75, 2);
      expect(result.metrics.regimeWeight).toBeCloseTo(0.65, 2);
    });
  });

  describe('calculateFinalScore', () => {
    it('calculates FinalScore using SCORE_WEIGHTS formula', () => {
      const metrics = {
        hybridScore: 0.8,
        confidence: 0.7,
        regimeWeight: 0.6,
        decayPenalty: 0.1
      };
      
      const finalScore = calculateFinalScore(metrics);
      
      expect(finalScore).toBeGreaterThan(0);
      expect(finalScore).toBeLessThanOrEqual(1);
      expect(finalScore).toBeCloseTo(0.8 * 0.4 + 0.7 * 0.3 + 0.6 * 0.2 - 0.1 * 0.1, 2);
    });

    it('uses confidence fallback when hybridScore missing', () => {
      const metrics = {
        confidence: 0.6,
        regimeWeight: 0.5
      };
      
      const finalScore = calculateFinalScore(metrics);
      
      expect(finalScore).toBeGreaterThan(0);
      expect(finalScore).toBeLessThanOrEqual(1);
    });

    it('clamps result to [0, 1] range', () => {
      const highMetrics = {
        hybridScore: 1.5,
        confidence: 1.5,
        regimeWeight: 1.5
      };

      expect(calculateFinalScore(highMetrics)).toBeLessThanOrEqual(1);

      // Directive 11.0E: Negative FinalScore throws (safety hook),
      // so use low-but-positive inputs that won't go negative
      const lowMetrics = {
        hybridScore: 0.01,
        confidence: 0.01,
        regimeWeight: 0.01,
        decayPenalty: 0.05
      };

      expect(calculateFinalScore(lowMetrics)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateRegimeWeight', () => {
    it('calculates RegimeWeight from trend and volatility', () => {
      const metrics = {
        trendStrength: 0.7,
        volatility: 0.3
      };
      
      const regimeWeight = calculateRegimeWeight(metrics);
      
      expect(regimeWeight).toBeGreaterThanOrEqual(0.1);
      expect(regimeWeight).toBeLessThanOrEqual(1);
    });

    it('uses default values when metrics missing', () => {
      const regimeWeight = calculateRegimeWeight({});
      
      expect(regimeWeight).toBeGreaterThanOrEqual(0.1);
      expect(regimeWeight).toBeLessThanOrEqual(1);
    });

    it('penalizes high volatility', () => {
      const lowVol = calculateRegimeWeight({ trendStrength: 0.5, volatility: 0.1 });
      const highVol = calculateRegimeWeight({ trendStrength: 0.5, volatility: 0.9 });
      
      expect(lowVol).toBeGreaterThan(highVol);
    });
  });
});
