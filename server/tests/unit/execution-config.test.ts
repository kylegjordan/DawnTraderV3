/**
 * Directive 11.0D — Execution Config Tests
 * 
 * Validates that TEC uses centralized EXECUTION_CONFIG for all parameters.
 */

import { describe, it, expect } from 'vitest';
import { EXECUTION_CONFIG } from '../../config/execution-config';

describe('[11.0D] EXECUTION_CONFIG Validation', () => {
  it('has all required adaptive sizing parameters', () => {
    expect(EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR).toBeDefined();
    expect(EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR).toBeDefined();
    expect(typeof EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR).toBe('number');
    expect(typeof EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR).toBe('number');
  });

  it('has correct expand/contract factors for trendline adjustment', () => {
    expect(EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR).toBe(1.10);
    expect(EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR).toBe(0.90);
  });

  it('has trailing stop parameters', () => {
    expect(EXECUTION_CONFIG.TRAILING_STOP_BASE).toBe(0.015);
    expect(EXECUTION_CONFIG.TRAILING_STOP_ACCELERATION).toBe(0.002);
  });

  it('has risk management parameters', () => {
    expect(EXECUTION_CONFIG.MAX_POSITION_RISK).toBe(0.02);
  });

  it('has version tracking', () => {
    expect(EXECUTION_CONFIG.VERSION).toBeDefined();
    expect(typeof EXECUTION_CONFIG.VERSION).toBe('string');
  });

  it('is frozen/immutable', () => {
    expect(Object.isFrozen(EXECUTION_CONFIG)).toBe(true);
  });

  it('correctly calculates adaptive position size expansion', () => {
    const baseSize = 100;
    const expandedSize = baseSize * EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR;

    expect(expandedSize).toBeCloseTo(110, 5);
  });

  it('correctly calculates adaptive position size contraction', () => {
    const baseSize = 100;
    const contractedSize = baseSize * EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR;
    
    expect(contractedSize).toBe(90);
  });
});
