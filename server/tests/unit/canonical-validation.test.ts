/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4F.1 — Canonical Validation Middleware Tests
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateAndNormalizeTrade,
  clearViolationLog,
  type TradeValidationInput
} from '../../middleware/canonical-validation';
import { getTypeForStrategy } from '../../config/canonical-regime-strategy-map';

describe('Directive 11.4F.1 — Canonical Validation Middleware', () => {
  beforeEach(() => {
    clearViolationLog();
  });

  describe('validateAndNormalizeTrade', () => {
    it('validates canonical trade data correctly', () => {
      const input: TradeValidationInput = {
        regime: 'TREND_FRIENDLY_STABLE',
        strategy: 'vwap_pullback',
        signalType: 'QUANT',
        symbol: 'BTC/USD'
      };

      const result = validateAndNormalizeTrade(input, 'test');

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.normalized.regime).toBe('TREND_FRIENDLY_STABLE');
      expect(result.normalized.strategy).toBe('vwap_pullback');
      expect(result.normalized.signalType).toBe('QUANT');
    });

    it('normalizes ghost regimes with WARN violation', () => {
      const input: TradeValidationInput = {
        regime: 'BULL_VOLATILE',
        strategy: 'breakout',
        signalType: 'QUANT',
        symbol: 'ETH/USD'
      };
      
      const result = validateAndNormalizeTrade(input, 'test');
      
      expect(result.valid).toBe(true);
      expect(result.normalized.regime).toBe('IMPULSE_EXPANSION');
      expect(result.violations.some(v => v.level === 'WARN' && v.message.includes('Ghost regime normalized'))).toBe(true);
    });

    it('normalizes legacy strategies with WARN violation', () => {
      const input: TradeValidationInput = {
        regime: 'TREND_FRIENDLY_STABLE',
        strategy: 'MomentumPulse',
        signalType: 'QUANT',
        symbol: 'SOL/USD'
      };

      const result = validateAndNormalizeTrade(input, 'test');

      expect(result.valid).toBe(true);
      expect(result.normalized.strategy).toBe('vwap_pullback');
      expect(result.violations.some(v => v.level === 'WARN' && v.message.includes('Legacy strategy normalized'))).toBe(true);
    });

    it('fails validation with ERROR for signalType mismatch', () => {
      const input: TradeValidationInput = {
        regime: 'TREND_FRIENDLY_STABLE',
        strategy: 'vwap_pullback',
        signalType: 'PATTERN',
        symbol: 'BTC/USD'
      };
      
      const result = validateAndNormalizeTrade(input, 'test');
      
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.level === 'ERROR' && v.message.includes('SignalType mismatch'))).toBe(true);
    });

    it('fails validation with CRITICAL for non-canonical combination', () => {
      const input: TradeValidationInput = {
        regime: 'TREND_FRIENDLY_STABLE',
        strategy: 'unknown_strategy_xyz',
        signalType: 'HYBRID',
        symbol: 'XRP/USD'
      };
      
      const result = validateAndNormalizeTrade(input, 'test');
      
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => v.level === 'CRITICAL' && v.message.includes('Non-canonical combination rejected'))).toBe(true);
    });

    it('accepts PATTERN strategies with correct patternType', () => {
      const input: TradeValidationInput = {
        regime: 'TREND_FRIENDLY_STABLE',
        strategy: 'morning_star',
        signalType: 'PATTERN',
        patternType: 'MORNING_STAR',
        symbol: 'ADA/USD'
      };
      
      const result = validateAndNormalizeTrade(input, 'test');
      
      expect(result.valid).toBe(true);
      expect(result.normalized.signalType).toBe('PATTERN');
      expect(result.normalized.patternType).toBe('MORNING_STAR');
    });

    it('accepts HYBRID strategies with patternType', () => {
      const input: TradeValidationInput = {
        regime: 'TREND_FRIENDLY_STABLE',
        strategy: 'pivot_shift',
        signalType: 'HYBRID',
        patternType: 'MORNING_STAR',
        symbol: 'DOT/USD'
      };
      
      const result = validateAndNormalizeTrade(input, 'test');
      
      expect(result.valid).toBe(true);
      expect(result.normalized.signalType).toBe('HYBRID');
    });

    it('accepts QUANT strategies with null patternType', () => {
      const input: TradeValidationInput = {
        regime: 'IMPULSE_EXPANSION',
        strategy: 'breakout',
        signalType: 'QUANT',
        patternType: null,
        symbol: 'LINK/USD'
      };
      
      const result = validateAndNormalizeTrade(input, 'test');
      
      expect(result.valid).toBe(true);
      expect(result.normalized.signalType).toBe('QUANT');
      expect(result.normalized.patternType).toBeNull();
    });
  });

  describe('getTypeForStrategy with throwOnUnknown', () => {
    it('returns correct type for known strategy', () => {
      expect(getTypeForStrategy('sma_trend_ride')).toBe('QUANT');
      expect(getTypeForStrategy('morning_star')).toBe('PATTERN');
      expect(getTypeForStrategy('pivot_shift')).toBe('HYBRID');
    });

    it('throws error for unknown strategy when throwOnUnknown=true', () => {
      expect(() => getTypeForStrategy('unknown_xyz', true)).toThrow('[11.4F.1] Unknown strategy');
    });

    it('returns HYBRID fallback for unknown strategy when throwOnUnknown=false', () => {
      expect(getTypeForStrategy('unknown_xyz', false)).toBe('HYBRID');
    });
  });
});
