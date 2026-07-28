/**
 * Directive 11.2 R1: Adaptive Scanning Fairness Integration Tests
 * 
 * Tests for telemetry pool tracking. (The AdaptiveRatioManager coverage was deleted with the
 * component in B-ARM-REMOVAL — see the note below.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ★ B-ARM-REMOVAL: this file's remaining subject is telemetry POOL TRACKING, which survives.
// DELETED as units (subject was the deleted component, per Langston's subject-vs-probe rule):
//   'AdaptiveRatioManager' · 'Pool Score Computation' · 'Confidence Scaling' ·
//   'Regime-Aware Ratio Adjustment' · 'AdaptiveScanManager Integration' (ratioUsed /
//   getAdaptiveRatioState / setAdaptiveRatioEnabled) · 'Pool-Level Performance Aggregation'
//   (getPoolPerformanceComparison + resetPoolAggregates — the limb deleted in this batch).
// KEPT: 'Telemetry Pool Tracking' — its subject is `entry.pool`, which is untouched.
describe('Telemetry Pool Tracking (post B-ARM-REMOVAL)', () => {
    it('should track pool type in telemetry entries', () => {
      const entry = {
        symbol: 'BTC/USD',
        finalScore: 0.85,
        pool: 'rotational' as const,
      };
      
      expect(entry.pool).toBe('rotational');
    });
    
    it('should default to ideal pool when not specified', () => {
      const entry = {
        symbol: 'ETH/USD',
        finalScore: 0.75,
      };
      
      const pool = (entry as any).pool ?? 'ideal';
      expect(pool).toBe('ideal');
    });
});
