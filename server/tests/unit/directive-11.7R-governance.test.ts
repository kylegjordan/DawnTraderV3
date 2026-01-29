/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7R — Regime Transition Governance Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Verification tests for governance boundaries:
 * - STABLE/TRANSITION/UNSTABLE classification
 * - Weight throttling and execution blocking
 * - Learning cooldown enforcement
 * 
 * Schema Version: governance/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyStability,
  STABILITY_THRESHOLDS,
  type StabilityMetrics,
} from '../../core/governance/regime-stability';
import {
  getStrategyDependency,
  getGovernanceMultiplier,
  isExecutionBlocked,
  INFLUENCE_RULES,
} from '../../config/strategy-governance';
import {
  shouldDeferLearning,
} from '../../core/governance/learning-cooldown';

describe('Directive 11.7R: Regime Stability Classification', () => {
  describe('STABLE classification', () => {
    it('should classify as STABLE when all metrics within thresholds', () => {
      const metrics: StabilityMetrics = {
        driftScore: 0.5,
        volZ: 0.8,
        regimeConfidence: 0.75,
        flipRate: 1,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('STABLE');
    });

    it('should classify as STABLE at boundary conditions', () => {
      const metrics: StabilityMetrics = {
        driftScore: 0.8,
        volZ: 1.2,
        regimeConfidence: 0.65,
        flipRate: 1,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('STABLE');
    });
  });

  describe('TRANSITION classification', () => {
    it('should classify as TRANSITION when driftScore > 0.8', () => {
      const metrics: StabilityMetrics = {
        driftScore: 1.0,
        volZ: 0.5,
        regimeConfidence: 0.75,
        flipRate: 1,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('TRANSITION');
    });

    it('should classify as TRANSITION when |volZ| > 1.2', () => {
      const metrics: StabilityMetrics = {
        driftScore: 0.5,
        volZ: 1.5,
        regimeConfidence: 0.75,
        flipRate: 1,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('TRANSITION');
    });

    it('should classify as TRANSITION when flipRate >= 2', () => {
      const metrics: StabilityMetrics = {
        driftScore: 0.5,
        volZ: 0.5,
        regimeConfidence: 0.75,
        flipRate: 2,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('TRANSITION');
    });

    it('should classify as TRANSITION when confidence < 0.65', () => {
      const metrics: StabilityMetrics = {
        driftScore: 0.5,
        volZ: 0.5,
        regimeConfidence: 0.55,
        flipRate: 1,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('TRANSITION');
    });
  });

  describe('UNSTABLE classification', () => {
    it('should classify as UNSTABLE when driftScore > 1.5', () => {
      const metrics: StabilityMetrics = {
        driftScore: 1.8,
        volZ: 0.5,
        regimeConfidence: 0.75,
        flipRate: 1,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('UNSTABLE');
    });

    it('should classify as UNSTABLE when |volZ| > 2.0', () => {
      const metrics: StabilityMetrics = {
        driftScore: 0.5,
        volZ: 2.5,
        regimeConfidence: 0.75,
        flipRate: 1,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('UNSTABLE');
    });

    it('should classify as UNSTABLE when flipRate >= 4', () => {
      const metrics: StabilityMetrics = {
        driftScore: 0.5,
        volZ: 0.5,
        regimeConfidence: 0.75,
        flipRate: 4,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('UNSTABLE');
    });

    it('should classify as UNSTABLE when confidence < 0.45', () => {
      const metrics: StabilityMetrics = {
        driftScore: 0.5,
        volZ: 0.5,
        regimeConfidence: 0.35,
        flipRate: 1,
      };
      
      const result = classifyStability(metrics);
      expect(result.stability).toBe('UNSTABLE');
    });
  });
});

describe('Directive 11.7R: Strategy Governance Profiles', () => {
  describe('Strategy dependency mapping', () => {
    it('should return HIGH dependency for trend strategies', () => {
      expect(getStrategyDependency('vwap_pullback')).toBe('HIGH');
      expect(getStrategyDependency('sma_trend_ride')).toBe('HIGH');
      expect(getStrategyDependency('range_trade')).toBe('HIGH');
    });

    it('should return MEDIUM dependency for adaptive strategies', () => {
      expect(getStrategyDependency('mean_reversion')).toBe('MEDIUM');
      expect(getStrategyDependency('pivot_shift')).toBe('MEDIUM');
    });

    it('should return LOW dependency for volatility strategies', () => {
      expect(getStrategyDependency('defensive_hedge')).toBe('LOW');
      expect(getStrategyDependency('volatility_edge')).toBe('LOW');
    });

    it('should default to HIGH for unknown strategies (fail-safe)', () => {
      expect(getStrategyDependency('unknown_strategy')).toBe('HIGH');
      expect(getStrategyDependency('')).toBe('HIGH');
    });
  });
});

describe('Directive 11.7R: Influence Rules', () => {
  describe('STABLE regime multipliers', () => {
    it('should return 100% for all dependencies in STABLE', () => {
      expect(getGovernanceMultiplier('STABLE', 'HIGH')).toBe(1.0);
      expect(getGovernanceMultiplier('STABLE', 'MEDIUM')).toBe(1.0);
      expect(getGovernanceMultiplier('STABLE', 'LOW')).toBe(1.0);
    });
  });

  describe('TRANSITION regime multipliers', () => {
    it('should return 30% for HIGH dependency', () => {
      expect(getGovernanceMultiplier('TRANSITION', 'HIGH')).toBe(0.30);
    });

    it('should return 60% for MEDIUM dependency', () => {
      expect(getGovernanceMultiplier('TRANSITION', 'MEDIUM')).toBe(0.60);
    });

    it('should return 100% for LOW dependency', () => {
      expect(getGovernanceMultiplier('TRANSITION', 'LOW')).toBe(1.0);
    });
  });

  describe('UNSTABLE regime multipliers', () => {
    it('should return 0% (blocked) for HIGH dependency', () => {
      expect(getGovernanceMultiplier('UNSTABLE', 'HIGH')).toBe(0.0);
    });

    it('should return 20% for MEDIUM dependency', () => {
      expect(getGovernanceMultiplier('UNSTABLE', 'MEDIUM')).toBe(0.20);
    });

    it('should return 60% for LOW dependency', () => {
      expect(getGovernanceMultiplier('UNSTABLE', 'LOW')).toBe(0.60);
    });
  });

  describe('Execution blocking', () => {
    it('should block HIGH dependency in UNSTABLE', () => {
      expect(isExecutionBlocked('UNSTABLE', 'HIGH')).toBe(true);
    });

    it('should not block MEDIUM in UNSTABLE', () => {
      expect(isExecutionBlocked('UNSTABLE', 'MEDIUM')).toBe(false);
    });

    it('should not block any dependency in STABLE', () => {
      expect(isExecutionBlocked('STABLE', 'HIGH')).toBe(false);
      expect(isExecutionBlocked('STABLE', 'MEDIUM')).toBe(false);
      expect(isExecutionBlocked('STABLE', 'LOW')).toBe(false);
    });
  });
});

describe('Directive 11.7R: Learning Cooldown', () => {
  describe('Negative learning (always immediate)', () => {
    it('should never defer negative learning', () => {
      expect(shouldDeferLearning('NEGATIVE', 'STABLE').defer).toBe(false);
      expect(shouldDeferLearning('NEGATIVE', 'TRANSITION').defer).toBe(false);
      expect(shouldDeferLearning('NEGATIVE', 'UNSTABLE').defer).toBe(false);
    });
  });

  describe('Positive learning', () => {
    it('should not defer in STABLE', () => {
      const result = shouldDeferLearning('POSITIVE', 'STABLE');
      expect(result.defer).toBe(false);
      expect(result.batch).toBe(false);
    });

    it('should batch in TRANSITION', () => {
      const result = shouldDeferLearning('POSITIVE', 'TRANSITION');
      expect(result.defer).toBe(false);
      expect(result.batch).toBe(true);
    });

    it('should defer in UNSTABLE', () => {
      const result = shouldDeferLearning('POSITIVE', 'UNSTABLE');
      expect(result.defer).toBe(true);
      expect(result.batch).toBe(false);
    });
  });
});
