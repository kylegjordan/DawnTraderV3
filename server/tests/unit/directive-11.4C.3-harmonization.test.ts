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
  STRATEGY_DISPLAY_NAMES,
  LEGACY_TO_CANONICAL,
  CANONICAL_REGIMES,
  GHOST_REGIME_NORMALIZATION,
  normalizeRegime,
  normalizeStrategy,
  selectRandomStrategy,
  getStrategiesForRegime,
  type CanonicalRegimeType,
  type CanonicalSignalType
} from '../../config/canonical-regime-strategy-map';

import {
  REGIME_STRATEGY_MAP,
  getStrategyForRegime,
} from '../../config/regime-strategy-map';

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
    const regimes: CanonicalRegimeType[] = ['BULL_STABLE', 'BEAR_VOLATILE', 'LOW_VOL_CHOP', 'HIGH_VOL_IMPULSE', 'TRANSITION'];
    
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
    expect(CANONICAL_REGIMES).toContain('BULL_STABLE');
    expect(CANONICAL_REGIMES).toContain('BEAR_VOLATILE');
    expect(CANONICAL_REGIMES).toContain('LOW_VOL_CHOP');
    expect(CANONICAL_REGIMES).toContain('HIGH_VOL_IMPULSE');
    expect(CANONICAL_REGIMES).toContain('TRANSITION');
  });

  it('should NOT include ghost regimes in canonical list', () => {
    const ghostRegimes = ['BULL_VOLATILE', 'BEAR_STABLE', 'EXTREME_NOISE'];
    for (const ghost of ghostRegimes) {
      expect(CANONICAL_REGIMES).not.toContain(ghost);
    }
  });

  it('normalizeRegime should convert ghost regimes to canonical', () => {
    expect(normalizeRegime('BULL_VOLATILE')).toBe('HIGH_VOL_IMPULSE');
    expect(normalizeRegime('BEAR_STABLE')).toBe('BEAR_VOLATILE');
    expect(normalizeRegime('EXTREME_NOISE')).toBe('LOW_VOL_CHOP');
    expect(normalizeRegime('HIGH_VOL_CHOP')).toBe('HIGH_VOL_IMPULSE');
    expect(normalizeRegime('MIXED_TRANSITION')).toBe('TRANSITION');
  });

  it('normalizeRegime should preserve canonical regimes', () => {
    expect(normalizeRegime('BULL_STABLE')).toBe('BULL_STABLE');
    expect(normalizeRegime('BEAR_VOLATILE')).toBe('BEAR_VOLATILE');
    expect(normalizeRegime('LOW_VOL_CHOP')).toBe('LOW_VOL_CHOP');
    expect(normalizeRegime('HIGH_VOL_IMPULSE')).toBe('HIGH_VOL_IMPULSE');
    expect(normalizeRegime('TRANSITION')).toBe('TRANSITION');
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

  it('backward-compatible getStrategyForRegime should return valid mapping for all canonical regimes', () => {
    for (const regime of CANONICAL_REGIMES) {
      const mapping = getStrategyForRegime(regime as any);
      expect(mapping).toBeDefined();
      expect(mapping.strategies.length).toBeGreaterThan(0);
      expect(['QUANT', 'PATTERN', 'HYBRID']).toContain(mapping.signalType);
    }
  });

  it('backward-compatible getStrategyForRegime should fallback to TRANSITION for unknown regimes', () => {
    const unknownRegime = 'UNKNOWN_REGIME' as any;
    const mapping = getStrategyForRegime(unknownRegime);
    expect(mapping).toBeDefined();
    expect(mapping).toEqual(REGIME_STRATEGY_MAP.TRANSITION);
  });
});
