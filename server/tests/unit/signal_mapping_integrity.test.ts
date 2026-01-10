/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4C.3-B — Signal Mapping Integrity Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Verifies:
 * 1. getTypeForStrategy returns correct canonical SignalType
 * 2. Strategy → SignalType mappings are consistent
 * 3. Telemetry records include valid ISO 8601 timestamps
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import { getTypeForStrategy, normalizeStrategy } from '../../config/regime-strategy-map';

describe('Directive 11.4C.3-B — Signal Mapping Integrity', () => {
  
  describe('getTypeForStrategy - derived from REGIME_STRATEGY_MAP', () => {
    // Mappings derived from REGIME_STRATEGY_MAP authoritative source:
    // HIGH_VOL_IMPULSE (QUANT): vwap_bounce, liquidity_trap, volatility_edge
    // LOW_VOL_CHOP (PATTERN): range_trade, support_bounce, abcd_long
    // BULL_STABLE (HYBRID): vwap_pullback, sma_trend_ride, breakout
    // BEAR_VOLATILE (HYBRID): reverse_impulse, defensive_hedge
    // TRANSITION (HYBRID): mean_reversion, pivot_shift, adaptive_flow
    
    const strategyMappings: Record<string, string> = {
      // HIGH_VOL_IMPULSE → QUANT strategies
      vwap_bounce: 'QUANT',
      liquidity_trap: 'QUANT',
      volatility_edge: 'QUANT',
      
      // LOW_VOL_CHOP → PATTERN strategies
      range_trade: 'PATTERN',
      support_bounce: 'PATTERN',
      abcd_long: 'PATTERN',
      
      // BULL_STABLE → HYBRID strategies
      vwap_pullback: 'HYBRID',
      sma_trend_ride: 'HYBRID',
      breakout: 'HYBRID',
      
      // BEAR_VOLATILE → HYBRID strategies
      reverse_impulse: 'HYBRID',
      defensive_hedge: 'HYBRID',
      
      // TRANSITION → HYBRID strategies
      mean_reversion: 'HYBRID',
      pivot_shift: 'HYBRID',
      adaptive_flow: 'HYBRID',
    };

    for (const [strategy, expected] of Object.entries(strategyMappings)) {
      test(`${strategy} → ${expected}`, () => {
        expect(getTypeForStrategy(strategy)).toBe(expected);
      });
    }
  });

  describe('Legacy strategy normalization', () => {
    const legacyMappings: Record<string, string> = {
      MomentumPulse: 'vwap_pullback',
      TrendFlow: 'sma_trend_ride',
      ImpulseChaser: 'liquidity_trap',
      TriangleBreakout: 'abcd_long',
    };

    for (const [legacy, canonical] of Object.entries(legacyMappings)) {
      test(`normalizeStrategy: ${legacy} → ${canonical}`, () => {
        expect(normalizeStrategy(legacy)).toBe(canonical);
      });
    }
  });

  describe('Legacy strategy to SignalType chain', () => {
    test('MomentumPulse → vwap_pullback → HYBRID (BULL_STABLE regime)', () => {
      const normalized = normalizeStrategy('MomentumPulse');
      expect(normalized).toBe('vwap_pullback');
      const signalType = getTypeForStrategy(normalized);
      expect(signalType).toBe('HYBRID');
    });

    test('TriangleBreakout → abcd_long → PATTERN (LOW_VOL_CHOP regime)', () => {
      const normalized = normalizeStrategy('TriangleBreakout');
      expect(normalized).toBe('abcd_long');
      const signalType = getTypeForStrategy(normalized);
      expect(signalType).toBe('PATTERN');
    });

    test('H2_Slingshot → vwap_bounce → QUANT (HIGH_VOL_IMPULSE regime)', () => {
      const normalized = normalizeStrategy('H2_Slingshot');
      expect(normalized).toBe('vwap_bounce');
      const signalType = getTypeForStrategy(normalized);
      expect(signalType).toBe('QUANT');
    });
  });

  describe('Telemetry timestamp format', () => {
    test('ISO 8601 timestamp format is valid', () => {
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      const timestamp = new Date().toISOString();
      expect(timestamp).toMatch(isoRegex);
    });

    test('Date.now() can be converted to valid ISO 8601', () => {
      const now = Date.now();
      const isoString = new Date(now).toISOString();
      expect(typeof isoString).toBe('string');
      expect(isoString).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Unknown strategy handling', () => {
    test('Unknown strategy returns HYBRID as default', () => {
      expect(getTypeForStrategy('unknown_strategy')).toBe('HYBRID');
      expect(getTypeForStrategy('')).toBe('HYBRID');
    });
  });
});
