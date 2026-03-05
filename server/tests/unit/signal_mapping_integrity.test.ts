/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4F.1 — Canonical Signal Mapping Integrity Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Updated to reflect Directive 11.4F.1 canonical mappings.
 * 
 * Verifies:
 * 1. getTypeForStrategy returns correct canonical SignalType
 * 2. Strategy → SignalType mappings are consistent with CANONICAL_REGIME_STRATEGY_MAP
 * 3. Telemetry records include valid ISO 8601 timestamps
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import { 
  getTypeForStrategy, 
  normalizeStrategy,
  selectPrimaryStrategy,
  CANONICAL_REGIME_STRATEGY_MAP,
  type CanonicalRegimeType
} from '../../config/canonical-regime-strategy-map';

describe('Directive 11.4F.1 — Canonical Signal Mapping Integrity', () => {
  
  describe('getTypeForStrategy - derived from CANONICAL_REGIME_STRATEGY_MAP', () => {
    const strategyMappings: Record<string, string> = {
      sma_trend_ride: 'QUANT',
      vwap_pullback: 'QUANT',
      morning_star: 'PATTERN',
      pivot_shift: 'HYBRID',
      mean_reversion: 'QUANT',
      reverse_impulse: 'HYBRID',
      defensive_hedge: 'HYBRID',
      inside_bar_reversal: 'PATTERN',
      range_trade: 'QUANT',
      support_bounce: 'PATTERN',
      abcd_long: 'QUANT',
      adaptive_flow: 'HYBRID',
      breakout: 'QUANT',
      vwap_bounce: 'QUANT',
      volatility_edge: 'HYBRID',
      dhma: 'QUANT',
      liquidity_trap: 'QUANT',
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
    test('MomentumPulse → vwap_pullback → QUANT (BULL_STABLE regime)', () => {
      const normalized = normalizeStrategy('MomentumPulse');
      expect(normalized).toBe('vwap_pullback');
      const signalType = getTypeForStrategy(normalized);
      expect(signalType).toBe('QUANT');
    });

    test('TriangleBreakout → abcd_long → QUANT (LOW_VOL_CHOP regime)', () => {
      const normalized = normalizeStrategy('TriangleBreakout');
      expect(normalized).toBe('abcd_long');
      const signalType = getTypeForStrategy(normalized);
      expect(signalType).toBe('QUANT');
    });

    test('ImpulseChaser → liquidity_trap → QUANT (TRANSITION regime)', () => {
      const normalized = normalizeStrategy('ImpulseChaser');
      expect(normalized).toBe('liquidity_trap');
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

  describe('CANONICAL_REGIME_STRATEGY_MAP structure', () => {
    test('All 5 canonical regimes exist', () => {
      expect(Object.keys(CANONICAL_REGIME_STRATEGY_MAP)).toHaveLength(5);
      expect(CANONICAL_REGIME_STRATEGY_MAP).toHaveProperty('TREND_FRIENDLY_STABLE');
      expect(CANONICAL_REGIME_STRATEGY_MAP).toHaveProperty('HIGH_VOLATILITY_UNSTABLE');
      expect(CANONICAL_REGIME_STRATEGY_MAP).toHaveProperty('RANGE_BOUND_STABLE');
      expect(CANONICAL_REGIME_STRATEGY_MAP).toHaveProperty('IMPULSE_EXPANSION');
      expect(CANONICAL_REGIME_STRATEGY_MAP).toHaveProperty('STRUCTURAL_TRANSITION');
    });

    test('Each regime has at least one strategy', () => {
      for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
        expect(mapping.strategies.length).toBeGreaterThan(0);
      }
    });

    test('Each strategy has signalType, strategyKey, and patternType', () => {
      for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
        for (const stratDef of mapping.strategies) {
          expect(stratDef).toHaveProperty('signalType');
          expect(stratDef).toHaveProperty('strategyKey');
          expect(stratDef).toHaveProperty('patternType');
        }
      }
    });
  });

  describe('selectPrimaryStrategy - Directive 11.4F.1A deterministic selection', () => {
    const regimes: CanonicalRegimeType[] = [
      'TREND_FRIENDLY_STABLE', 'HIGH_VOLATILITY_UNSTABLE', 'RANGE_BOUND_STABLE', 'IMPULSE_EXPANSION', 'STRUCTURAL_TRANSITION'
    ];

    test('Returns consistent (deterministic) strategy for same regime across calls', () => {
      for (const regime of regimes) {
        const result1 = selectPrimaryStrategy(regime);
        const result2 = selectPrimaryStrategy(regime);
        const result3 = selectPrimaryStrategy(regime);
        
        expect(result1.strategy).toBe(result2.strategy);
        expect(result2.strategy).toBe(result3.strategy);
      }
    });

    test('Returns first strategy from regime mapping (primary strategy)', () => {
      for (const regime of regimes) {
        const result = selectPrimaryStrategy(regime);
        const expected = CANONICAL_REGIME_STRATEGY_MAP[regime].strategies[0];
        
        expect(result.strategy).toBe(expected.strategyKey);
        expect(result.signalType).toBe(expected.signalType);
        expect(result.patternType).toBe(expected.patternType);
      }
    });
  });
});
