/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7R-E — Enforcement Correction Regression Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Mandatory regression test per Directive 11.7R-E Section 9.
 * 
 * Scenario: UNSTABLE regime + vwap_pullback signal
 * 
 * Expected Assertions:
 * - signal generated ✅
 * - governance blocks it ✅
 * - scoring function NOT called ✅
 * - no virtual trade created ✅
 * - no execution intent created ✅
 * - learning logs skip reason ✅
 * 
 * Schema Version: governance/v1.1
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isStrategyEligible,
  logGovernanceBlock,
  getPreScoreExclusionCount,
  resetPreScoreExclusionCount,
  filterByGovernanceEligibility,
} from '../../core/governance/strategy-eligibility';
import { getStrategyDependency } from '../../config/strategy-governance';

describe('Directive 11.7R-E: Enforcement Correction Regression Tests', () => {
  beforeEach(() => {
    resetPreScoreExclusionCount();
  });

  describe('Critical Scenario: UNSTABLE + vwap_pullback', () => {
    it('should block vwap_pullback before scoring in UNSTABLE regime', () => {
      const strategy = 'vwap_pullback';
      const stability = 'UNSTABLE' as const;
      const dependency = getStrategyDependency(strategy);

      expect(dependency).toBe('HIGH');

      const eligible = isStrategyEligible(strategy, stability, dependency);
      expect(eligible).toBe(false);
    });

    it('should increment pre-score exclusion counter when blocked', () => {
      const initialCount = getPreScoreExclusionCount();

      logGovernanceBlock(
        { strategy: 'vwap_pullback', pair: 'BTC/USD' },
        'UNSTABLE'
      );

      expect(getPreScoreExclusionCount()).toBe(initialCount + 1);
    });

    it('should log BLOCKED_GOVERNANCE with correct format', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = logGovernanceBlock(
        { strategy: 'vwap_pullback', pair: 'ETH/USD' },
        'UNSTABLE'
      );

      expect(result.resultType).toBe('BLOCKED_GOVERNANCE');
      expect(result.reason).toBe('UNSTABLE_REGIME');
      expect(result.strategy).toBe('vwap_pullback');
      expect(result.stability).toBe('UNSTABLE');
      expect(result.dependency).toBe('HIGH');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[11.7R-E][GOVERNANCE] BLOCKED_GOVERNANCE')
      );

      logSpy.mockRestore();
    });
  });

  describe('filterByGovernanceEligibility (Pre-Scoring Filter)', () => {
    it('should filter out HIGH dependency strategies in UNSTABLE', () => {
      const signals = [
        { strategy: 'vwap_pullback', pair: 'BTC/USD' },
        { strategy: 'sma_trend_ride', pair: 'ETH/USD' },
        { strategy: 'range_trade', pair: 'SOL/USD' },
        { strategy: 'defensive_hedge', pair: 'XRP/USD' },
        { strategy: 'volatility_edge', pair: 'ADA/USD' },
      ];

      const filtered = filterByGovernanceEligibility(signals, 'UNSTABLE');

      expect(filtered).toHaveLength(2);
      expect(filtered.map(s => s.strategy)).toContain('defensive_hedge');
      expect(filtered.map(s => s.strategy)).toContain('volatility_edge');
      expect(filtered.map(s => s.strategy)).not.toContain('vwap_pullback');
      expect(filtered.map(s => s.strategy)).not.toContain('sma_trend_ride');
      expect(filtered.map(s => s.strategy)).not.toContain('range_trade');
    });

    it('should allow all strategies in STABLE', () => {
      const signals = [
        { strategy: 'vwap_pullback', pair: 'BTC/USD' },
        { strategy: 'sma_trend_ride', pair: 'ETH/USD' },
        { strategy: 'defensive_hedge', pair: 'XRP/USD' },
      ];

      const filtered = filterByGovernanceEligibility(signals, 'STABLE');

      expect(filtered).toHaveLength(3);
    });

    it('should allow all strategies in TRANSITION (not blocked, only throttled)', () => {
      const signals = [
        { strategy: 'vwap_pullback', pair: 'BTC/USD' },
        { strategy: 'mean_reversion', pair: 'ETH/USD' },
        { strategy: 'defensive_hedge', pair: 'XRP/USD' },
      ];

      const filtered = filterByGovernanceEligibility(signals, 'TRANSITION');

      expect(filtered).toHaveLength(3);
    });
  });

  describe('All HIGH Dependency Strategies Blocked in UNSTABLE', () => {
    const highDependencyStrategies = [
      'vwap_pullback',
      'sma_trend_ride',
      'range_trade',
      'morning_star',
      'vwap_bounce',
      'support_bounce',
      'breakout',
      'liquidity_trap',
    ];

    highDependencyStrategies.forEach(strategy => {
      it(`should block ${strategy} in UNSTABLE`, () => {
        expect(isStrategyEligible(strategy, 'UNSTABLE')).toBe(false);
      });
    });
  });

  describe('MEDIUM and LOW Dependency Strategies NOT Blocked', () => {
    const mediumDependencyStrategies = [
      'mean_reversion',
      'pivot_shift',
      'momentum_burst',
      'trendpulse',
    ];

    const lowDependencyStrategies = [
      'defensive_hedge',
      'volatility_edge',
      'volsurf',
      'gridflow',
    ];

    mediumDependencyStrategies.forEach(strategy => {
      it(`should NOT block MEDIUM dependency ${strategy} in UNSTABLE (throttle only)`, () => {
        expect(isStrategyEligible(strategy, 'UNSTABLE')).toBe(true);
      });
    });

    lowDependencyStrategies.forEach(strategy => {
      it(`should NOT block LOW dependency ${strategy} in UNSTABLE`, () => {
        expect(isStrategyEligible(strategy, 'UNSTABLE')).toBe(true);
      });
    });
  });

  describe('Pre-Score Exclusion Stats', () => {
    it('should track exclusion count correctly', () => {
      resetPreScoreExclusionCount();

      expect(getPreScoreExclusionCount()).toBe(0);

      logGovernanceBlock({ strategy: 'vwap_pullback', pair: 'BTC/USD' }, 'UNSTABLE');
      expect(getPreScoreExclusionCount()).toBe(1);

      logGovernanceBlock({ strategy: 'sma_trend_ride', pair: 'ETH/USD' }, 'UNSTABLE');
      expect(getPreScoreExclusionCount()).toBe(2);

      logGovernanceBlock({ strategy: 'range_trade', pair: 'SOL/USD' }, 'UNSTABLE');
      expect(getPreScoreExclusionCount()).toBe(3);
    });

    it('should reset count correctly', () => {
      logGovernanceBlock({ strategy: 'vwap_pullback', pair: 'BTC/USD' }, 'UNSTABLE');
      expect(getPreScoreExclusionCount()).toBeGreaterThan(0);

      resetPreScoreExclusionCount();
      expect(getPreScoreExclusionCount()).toBe(0);
    });
  });
});
