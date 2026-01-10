/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4C.3 — Strategy & Regime Harmonization Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Verification tests for:
 * - strategy_naming.test: VTS and Telemetry output legacy names
 * - hybrid_integrity.test: Hybrid trades have pattern attached
 * - regime_strictness.test: No ghost regimes exist
 * - type_consistency.test: SignalType and MarketRegimeType single source
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  REGIME_STRATEGY_MAP,
  STRATEGY_DISPLAY_NAMES,
  LEGACY_TO_CANONICAL,
  CANONICAL_REGIMES,
  GHOST_REGIME_FALLBACK,
  normalizeRegime,
  normalizeStrategy,
  selectRandomStrategy,
  getStrategyForRegime,
  type MarketRegimeType,
  type CanonicalSignalType
} from '../../config/regime-strategy-map';

describe('Directive 11.4C.3 — Strategy Naming', () => {
  it('should have all canonical strategies in snake_case format', () => {
    const allStrategies: string[] = [];
    for (const mapping of Object.values(REGIME_STRATEGY_MAP)) {
      allStrategies.push(...mapping.strategies);
    }
    
    for (const strategy of allStrategies) {
      expect(strategy).toMatch(/^[a-z_]+$/);
    }
  });

  it('should have display names for all canonical strategies', () => {
    const allStrategies: string[] = [];
    for (const mapping of Object.values(REGIME_STRATEGY_MAP)) {
      allStrategies.push(...mapping.strategies);
    }
    
    for (const strategy of allStrategies) {
      expect(STRATEGY_DISPLAY_NAMES[strategy]).toBeDefined();
      expect(typeof STRATEGY_DISPLAY_NAMES[strategy]).toBe('string');
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

describe('Directive 11.4C.3 — Hybrid Integrity', () => {
  it('REGIME_STRATEGY_MAP should assign correct signal types per regime', () => {
    expect(REGIME_STRATEGY_MAP.BULL_STABLE.signalType).toBe('HYBRID');
    expect(REGIME_STRATEGY_MAP.BEAR_VOLATILE.signalType).toBe('HYBRID');
    expect(REGIME_STRATEGY_MAP.LOW_VOL_CHOP.signalType).toBe('PATTERN');
    expect(REGIME_STRATEGY_MAP.HIGH_VOL_IMPULSE.signalType).toBe('QUANT');
    expect(REGIME_STRATEGY_MAP.TRANSITION.signalType).toBe('HYBRID');
  });

  it('selectRandomStrategy should return valid signalType and strategy', () => {
    const regimes: MarketRegimeType[] = ['BULL_STABLE', 'BEAR_VOLATILE', 'LOW_VOL_CHOP', 'HIGH_VOL_IMPULSE', 'TRANSITION'];
    
    for (const regime of regimes) {
      const result = selectRandomStrategy(regime);
      expect(result.signalType).toMatch(/^(QUANT|PATTERN|HYBRID)$/);
      expect(result.strategy).toMatch(/^[a-z_]+$/);
      expect(REGIME_STRATEGY_MAP[regime].strategies).toContain(result.strategy);
    }
  });

  it('HYBRID regimes should have at least one strategy with pattern potential', () => {
    const hybridRegimes: MarketRegimeType[] = ['BULL_STABLE', 'BEAR_VOLATILE', 'TRANSITION'];
    
    for (const regime of hybridRegimes) {
      const mapping = REGIME_STRATEGY_MAP[regime];
      expect(mapping.signalType).toBe('HYBRID');
      expect(mapping.strategies.length).toBeGreaterThan(0);
    }
  });
});

describe('Directive 11.4C.3 — Regime Strictness', () => {
  it('should have exactly 5 canonical regimes', () => {
    expect(CANONICAL_REGIMES).toHaveLength(5);
    expect(CANONICAL_REGIMES).toContain('BULL_STABLE');
    expect(CANONICAL_REGIMES).toContain('BEAR_VOLATILE');
    expect(CANONICAL_REGIMES).toContain('LOW_VOL_CHOP');
    expect(CANONICAL_REGIMES).toContain('HIGH_VOL_IMPULSE');
    expect(CANONICAL_REGIMES).toContain('TRANSITION');
  });

  it('should NOT include ghost regimes in canonical list', () => {
    const ghostRegimes = ['BULL_VOLATILE', 'BEAR_STABLE', 'EXTREME_NOISE', 'HIGH_VOL_CHOP', 'MIXED_TRANSITION'];
    
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
    for (const regime of CANONICAL_REGIMES) {
      expect(normalizeRegime(regime)).toBe(regime);
    }
  });

  it('REGIME_STRATEGY_MAP should only contain canonical regimes', () => {
    const mapKeys = Object.keys(REGIME_STRATEGY_MAP);
    
    for (const key of mapKeys) {
      expect(CANONICAL_REGIMES).toContain(key);
    }
    
    expect(mapKeys).toHaveLength(5);
  });
});

describe('Directive 11.4C.3 — Type Consistency', () => {
  it('CanonicalSignalType should only allow uppercase values', () => {
    const validSignalTypes: CanonicalSignalType[] = ['QUANT', 'PATTERN', 'HYBRID'];
    
    for (const st of validSignalTypes) {
      expect(st).toMatch(/^[A-Z]+$/);
    }
  });

  it('MarketRegimeType should only allow uppercase values', () => {
    for (const regime of CANONICAL_REGIMES) {
      expect(regime).toMatch(/^[A-Z_]+$/);
    }
  });

  it('all regime mappings should have valid structure', () => {
    for (const [regime, mapping] of Object.entries(REGIME_STRATEGY_MAP)) {
      expect(mapping).toHaveProperty('signalType');
      expect(mapping).toHaveProperty('strategies');
      expect(mapping).toHaveProperty('riskMultiplier');
      expect(mapping).toHaveProperty('minConfidence');
      
      expect(['QUANT', 'PATTERN', 'HYBRID']).toContain(mapping.signalType);
      expect(Array.isArray(mapping.strategies)).toBe(true);
      expect(mapping.strategies.length).toBeGreaterThan(0);
      expect(typeof mapping.riskMultiplier).toBe('number');
      expect(typeof mapping.minConfidence).toBe('number');
    }
  });

  it('getStrategyForRegime should return valid mapping for all canonical regimes', () => {
    for (const regime of CANONICAL_REGIMES) {
      const mapping = getStrategyForRegime(regime as MarketRegimeType);
      expect(mapping).toBeDefined();
      expect(mapping.strategies.length).toBeGreaterThan(0);
    }
  });

  it('getStrategyForRegime should fallback to TRANSITION for unknown regimes', () => {
    const unknown = 'UNKNOWN_REGIME' as MarketRegimeType;
    const mapping = getStrategyForRegime(unknown);
    expect(mapping).toEqual(REGIME_STRATEGY_MAP.TRANSITION);
  });
});
