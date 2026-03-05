/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4F.1 — Strategy & Regime Harmonization Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Updated for Directive 11.4F.1 canonical mappings.
 * 
 * Verification tests for:
 * - strategy_naming.test: VTS and Telemetry output canonical names
 * - hybrid_integrity.test: Hybrid trades have pattern attached
 * - regime_strictness.test: No ghost regimes exist
 * - type_consistency.test: SignalType and MarketRegimeType single source
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
  CANONICAL_REGIME_STRATEGY_MAP as REGIME_STRATEGY_MAP,
  STRATEGY_DISPLAY_NAMES,
  LEGACY_TO_CANONICAL,
  CANONICAL_REGIMES,
  GHOST_REGIME_NORMALIZATION,
  normalizeRegime,
  normalizeStrategy,
  selectRandomStrategy,
  selectPrimaryStrategy as getStrategyForRegime,
  getStrategiesForRegime,
  type CanonicalRegimeType,
  type CanonicalSignalType
} from '../../config/canonical-regime-strategy-map';

describe('Directive 11.4F.1 — Strategy Naming', () => {
  it('should have all canonical strategies in snake_case format', () => {
    for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
      for (const stratDef of mapping.strategies) {
        expect(stratDef.strategyKey).toMatch(/^[a-z_]+$/);
      }
    }
  });

  it('should have display names for all canonical strategies', () => {
    for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
      for (const stratDef of mapping.strategies) {
        expect(STRATEGY_DISPLAY_NAMES[stratDef.strategyKey]).toBeDefined();
        expect(typeof STRATEGY_DISPLAY_NAMES[stratDef.strategyKey]).toBe('string');
      }
    }
  });

  it('should map legacy VTS names to canonical names', () => {
    const legacyNames = [
      'MomentumPulse', 'TrendFlow', 'BreakoutConfirm', 
      'H2_Slingshot', 'ImpulseChaser', 'MeanReversion'
    ];
    
    for (const legacy of legacyNames) {
      const canonical = LEGACY_TO_CANONICAL[legacy];
      expect(canonical).toBeDefined();
      expect(canonical).toMatch(/^[a-z_]+$/);
    }
  });

  it('normalizeStrategy should convert legacy to canonical', () => {
    expect(normalizeStrategy('MomentumPulse')).toBe('vwap_pullback');
    expect(normalizeStrategy('TrendFlow')).toBe('sma_trend_ride');
    expect(normalizeStrategy('BreakoutConfirm')).toBe('breakout');
    expect(normalizeStrategy('H2_Slingshot')).toBe('vwap_bounce');
    expect(normalizeStrategy('MeanReversion')).toBe('mean_reversion');
  });

  it('normalizeStrategy should preserve already-canonical names', () => {
    expect(normalizeStrategy('vwap_pullback')).toBe('vwap_pullback');
    expect(normalizeStrategy('breakout')).toBe('breakout');
    expect(normalizeStrategy('mean_reversion')).toBe('mean_reversion');
  });
});

describe('Directive 11.4F.1 — Hybrid Integrity', () => {
  it('CANONICAL_REGIME_STRATEGY_MAP should have strategies with correct signal types', () => {
    for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
      for (const stratDef of mapping.strategies) {
        expect(['QUANT', 'PATTERN', 'HYBRID']).toContain(stratDef.signalType);
      }
    }
  });

  it('selectRandomStrategy should return valid signalType and strategy', () => {
    const regimes: CanonicalRegimeType[] = ['TREND_FRIENDLY_STABLE', 'HIGH_VOLATILITY_UNSTABLE', 'RANGE_BOUND_STABLE', 'IMPULSE_EXPANSION', 'STRUCTURAL_TRANSITION'];
    
    for (const regime of regimes) {
      const result = selectRandomStrategy(regime);
      expect(result.signalType).toMatch(/^(QUANT|PATTERN|HYBRID)$/);
      expect(result.strategy).toMatch(/^[a-z_]+$/);
      
      const validStrategies = getStrategiesForRegime(regime).map(s => s.strategyKey);
      expect(validStrategies).toContain(result.strategy);
    }
  });

  it('HYBRID strategies should have patternType defined', () => {
    for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
      for (const stratDef of mapping.strategies) {
        if (stratDef.signalType === 'HYBRID') {
          expect(stratDef.patternType).not.toBeNull();
        }
      }
    }
  });

  it('PATTERN strategies should have patternType defined', () => {
    for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
      for (const stratDef of mapping.strategies) {
        if (stratDef.signalType === 'PATTERN') {
          expect(stratDef.patternType).not.toBeNull();
        }
      }
    }
  });

  it('QUANT strategies should have null patternType', () => {
    for (const mapping of Object.values(CANONICAL_REGIME_STRATEGY_MAP)) {
      for (const stratDef of mapping.strategies) {
        if (stratDef.signalType === 'QUANT') {
          expect(stratDef.patternType).toBeNull();
        }
      }
    }
  });
});

describe('Directive 11.4F.1 — Regime Strictness', () => {
  it('should have exactly 5 canonical regimes', () => {
    expect(CANONICAL_REGIMES).toHaveLength(5);
    expect(CANONICAL_REGIMES).toContain('TREND_FRIENDLY_STABLE');
    expect(CANONICAL_REGIMES).toContain('HIGH_VOLATILITY_UNSTABLE');
    expect(CANONICAL_REGIMES).toContain('RANGE_BOUND_STABLE');
    expect(CANONICAL_REGIMES).toContain('IMPULSE_EXPANSION');
    expect(CANONICAL_REGIMES).toContain('STRUCTURAL_TRANSITION');
  });

  it('should NOT include ghost regimes in canonical list', () => {
    const ghostRegimes = ['BULL_VOLATILE', 'BEAR_STABLE', 'EXTREME_NOISE'];
    for (const ghost of ghostRegimes) {
      expect(CANONICAL_REGIMES).not.toContain(ghost);
    }
  });

  it('normalizeRegime should convert ghost regimes to canonical', () => {
    expect(normalizeRegime('BULL_VOLATILE')).toBe('IMPULSE_EXPANSION');
    expect(normalizeRegime('BEAR_STABLE')).toBe('HIGH_VOLATILITY_UNSTABLE');
    expect(normalizeRegime('EXTREME_NOISE')).toBe('RANGE_BOUND_STABLE');
    expect(normalizeRegime('HIGH_VOL_CHOP')).toBe('IMPULSE_EXPANSION');
    expect(normalizeRegime('MIXED_TRANSITION')).toBe('STRUCTURAL_TRANSITION');
  });

  it('normalizeRegime should preserve canonical regimes', () => {
    expect(normalizeRegime('TREND_FRIENDLY_STABLE')).toBe('TREND_FRIENDLY_STABLE');
    expect(normalizeRegime('HIGH_VOLATILITY_UNSTABLE')).toBe('HIGH_VOLATILITY_UNSTABLE');
    expect(normalizeRegime('RANGE_BOUND_STABLE')).toBe('RANGE_BOUND_STABLE');
    expect(normalizeRegime('IMPULSE_EXPANSION')).toBe('IMPULSE_EXPANSION');
    expect(normalizeRegime('STRUCTURAL_TRANSITION')).toBe('STRUCTURAL_TRANSITION');
  });

  it('CANONICAL_REGIME_STRATEGY_MAP should only contain canonical regimes', () => {
    const mapRegimes = Object.keys(CANONICAL_REGIME_STRATEGY_MAP);
    for (const regime of mapRegimes) {
      expect(CANONICAL_REGIMES).toContain(regime);
    }
  });
});

describe('Directive 11.4F.1 — Type Consistency', () => {
  it('CanonicalSignalType should only allow uppercase values', () => {
    const validTypes: CanonicalSignalType[] = ['QUANT', 'PATTERN', 'HYBRID'];
    for (const type of validTypes) {
      expect(type).toBe(type.toUpperCase());
    }
  });

  it('CanonicalRegimeType should only allow uppercase values', () => {
    for (const regime of CANONICAL_REGIMES) {
      expect(regime).toBe(regime.toUpperCase());
    }
  });

  it('all regime mappings should have valid structure', () => {
    for (const [regime, mapping] of Object.entries(CANONICAL_REGIME_STRATEGY_MAP)) {
      expect(mapping).toHaveProperty('strategies');
      expect(mapping).toHaveProperty('metrics');
      expect(mapping).toHaveProperty('riskMultiplier');
      expect(mapping).toHaveProperty('minConfidence');
      expect(Array.isArray(mapping.strategies)).toBe(true);
      expect(typeof mapping.riskMultiplier).toBe('number');
      expect(typeof mapping.minConfidence).toBe('number');
    }
  });

  it('selectPrimaryStrategy should return valid strategy for all canonical regimes', () => {
    for (const regime of CANONICAL_REGIMES) {
      const result = getStrategyForRegime(regime as any);
      expect(result).toBeDefined();
      expect(typeof result.strategy).toBe('string');
      expect(['QUANT', 'PATTERN', 'HYBRID']).toContain(result.signalType);
    }
  });

  it('selectPrimaryStrategy should fallback to TRANSITION strategy for unknown regimes', () => {
    const unknownRegime = 'UNKNOWN_REGIME' as any;
    const result = getStrategyForRegime(unknownRegime);
    expect(result).toBeDefined();
    // Unknown regimes normalize to TRANSITION, first strategy is adaptive_flow
    expect(result.strategy).toBe('adaptive_flow');
    expect(result.signalType).toBe('HYBRID');
  });
});
