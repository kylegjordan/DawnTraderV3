/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7S — Strategy Mode Modulation Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Tests for deterministic strategy mode assignment and overlay application.
 * 
 * Schema: strategy-modes/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveStrategyMode,
  getModeOverlay,
  meetsConfidenceFloor,
  applyModeOverlay,
  STRATEGY_MODE_OVERLAYS,
  REGIME_TO_MODE_MAP,
  resetModeStats,
  recordModeExecution,
  getModeStats,
  getModeStopOutRate,
  recordModeOutcome,
  type StrategyMode,
  type StrategyModeOverlay,
} from '../../core/governance/strategy-modes';
import { prefetchModule } from '../../services/module-constants-service.js';
// B-NEW-43 Phase 2 chunk 6 (2026-05-23): warm module_constants modules
// read by code under test. Server boot calls prefetchModule for all
// PREFETCH_MODULES; unit tests must do the same explicitly. CI Postgres
// (chunks 4.0-4.7) populates module_constants via db:migrate; this hook
// loads the rows into the sync-read cache.
import { beforeAll as __b43_beforeAll } from 'vitest';
__b43_beforeAll(async () => {
  await prefetchModule("governance_modes");
});


describe('Directive 11.7S: Strategy Mode Modulation', () => {
  beforeEach(() => {
    resetModeStats();
  });

  describe('Mode Resolution from Regime Stability', () => {
    it('should resolve STABLE to NORMAL mode', () => {
      expect(resolveStrategyMode('STABLE')).toBe('NORMAL');
    });

    it('should resolve TRANSITION to DEFENSIVE mode', () => {
      expect(resolveStrategyMode('TRANSITION')).toBe('DEFENSIVE');
    });

    it('should resolve UNSTABLE to SURVIVAL mode', () => {
      expect(resolveStrategyMode('UNSTABLE')).toBe('SURVIVAL');
    });

    it('should default to SURVIVAL for unknown stability', () => {
      expect(resolveStrategyMode('UNKNOWN' as any)).toBe('SURVIVAL');
    });
  });

  describe('Mode Overlay Values (Authoritative Table)', () => {
    describe('NORMAL mode', () => {
      const overlay = STRATEGY_MODE_OVERLAYS.NORMAL;

      it('should have 100% position size multiplier', () => {
        expect(overlay.positionSizeMultiplier).toBe(1.0);
      });

      it('should have 100% stop loss distance multiplier', () => {
        expect(overlay.stopLossDistanceMultiplier).toBe(1.0);
      });

      it('should have 100% take profit distance multiplier', () => {
        expect(overlay.takeProfitDistanceMultiplier).toBe(1.0);
      });

      it('should have 60% confidence floor', () => {
        expect(overlay.confidenceFloor).toBe(0.60);
      });

      it('should have 100% entry cooldown multiplier', () => {
        expect(overlay.entryCooldownMultiplier).toBe(1.0);
      });
    });

    describe('DEFENSIVE mode', () => {
      const overlay = STRATEGY_MODE_OVERLAYS.DEFENSIVE;

      it('should have 60% position size multiplier', () => {
        expect(overlay.positionSizeMultiplier).toBe(0.6);
      });

      it('should have 120% stop loss distance multiplier (wider stops)', () => {
        expect(overlay.stopLossDistanceMultiplier).toBe(1.2);
      });

      it('should have 80% take profit distance multiplier', () => {
        expect(overlay.takeProfitDistanceMultiplier).toBe(0.8);
      });

      it('should have 70% confidence floor', () => {
        expect(overlay.confidenceFloor).toBe(0.70);
      });

      it('should have 150% entry cooldown multiplier', () => {
        expect(overlay.entryCooldownMultiplier).toBe(1.5);
      });
    });

    describe('SURVIVAL mode', () => {
      const overlay = STRATEGY_MODE_OVERLAYS.SURVIVAL;

      it('should have 25% position size multiplier', () => {
        expect(overlay.positionSizeMultiplier).toBe(0.25);
      });

      it('should have 150% stop loss distance multiplier (wider stops)', () => {
        expect(overlay.stopLossDistanceMultiplier).toBe(1.5);
      });

      it('should have 60% take profit distance multiplier', () => {
        expect(overlay.takeProfitDistanceMultiplier).toBe(0.6);
      });

      it('should have 80% confidence floor', () => {
        expect(overlay.confidenceFloor).toBe(0.80);
      });

      it('should have 200% entry cooldown multiplier', () => {
        expect(overlay.entryCooldownMultiplier).toBe(2.0);
      });
    });
  });

  describe('Confidence Floor Validation', () => {
    it('should pass 65% confidence in STABLE (floor 60%)', () => {
      expect(meetsConfidenceFloor(0.65, 'STABLE')).toBe(true);
    });

    it('should fail 55% confidence in STABLE (floor 60%)', () => {
      expect(meetsConfidenceFloor(0.55, 'STABLE')).toBe(false);
    });

    it('should pass 75% confidence in TRANSITION (floor 70%)', () => {
      expect(meetsConfidenceFloor(0.75, 'TRANSITION')).toBe(true);
    });

    it('should fail 65% confidence in TRANSITION (floor 70%)', () => {
      expect(meetsConfidenceFloor(0.65, 'TRANSITION')).toBe(false);
    });

    it('should pass 85% confidence in UNSTABLE (floor 80%)', () => {
      expect(meetsConfidenceFloor(0.85, 'UNSTABLE')).toBe(true);
    });

    it('should fail 75% confidence in UNSTABLE (floor 80%)', () => {
      expect(meetsConfidenceFloor(0.75, 'UNSTABLE')).toBe(false);
    });
  });

  describe('Mode Overlay Application', () => {
    it('should apply NORMAL mode overlay correctly', () => {
      const result = applyModeOverlay(1000, 50, 100, 'STABLE');

      expect(result.mode).toBe('NORMAL');
      expect(result.adjustedSize).toBe(1000);
      expect(result.adjustedStopDistance).toBe(50);
      expect(result.adjustedTargetDistance).toBe(100);
    });

    it('should apply DEFENSIVE mode overlay correctly', () => {
      const result = applyModeOverlay(1000, 50, 100, 'TRANSITION');

      expect(result.mode).toBe('DEFENSIVE');
      expect(result.adjustedSize).toBe(600); // 1000 * 0.6
      expect(result.adjustedStopDistance).toBe(60); // 50 * 1.2 (wider stop)
      expect(result.adjustedTargetDistance).toBe(80); // 100 * 0.8
    });

    it('should apply SURVIVAL mode overlay correctly', () => {
      const result = applyModeOverlay(1000, 50, 100, 'UNSTABLE');

      expect(result.mode).toBe('SURVIVAL');
      expect(result.adjustedSize).toBe(250); // 1000 * 0.25
      expect(result.adjustedStopDistance).toBe(75); // 50 * 1.5 (wider stop)
      expect(result.adjustedTargetDistance).toBe(60); // 100 * 0.6
    });

    it('should include original values in result', () => {
      const result = applyModeOverlay(1000, 50, 100, 'TRANSITION');

      expect(result.originalSize).toBe(1000);
      expect(result.originalStopDistance).toBe(50);
      expect(result.originalTargetDistance).toBe(100);
    });
  });

  describe('Mode Stats Tracking', () => {
    it('should track mode executions', () => {
      recordModeExecution('NORMAL');
      recordModeExecution('NORMAL');
      recordModeExecution('DEFENSIVE');

      const stats = getModeStats();
      expect(stats.NORMAL.trades).toBe(2);
      expect(stats.DEFENSIVE.trades).toBe(1);
      expect(stats.SURVIVAL.trades).toBe(0);
    });

    it('should track mode outcomes', () => {
      recordModeExecution('NORMAL');
      recordModeOutcome('NORMAL', 100, false);
      recordModeExecution('NORMAL');
      recordModeOutcome('NORMAL', -50, true);

      const stats = getModeStats();
      expect(stats.NORMAL.pnl).toBe(50);
      expect(stats.NORMAL.stopOuts).toBe(1);
    });

    it('should calculate stop-out rate correctly', () => {
      recordModeExecution('SURVIVAL');
      recordModeOutcome('SURVIVAL', -10, true);
      recordModeExecution('SURVIVAL');
      recordModeOutcome('SURVIVAL', 20, false);
      recordModeExecution('SURVIVAL');
      recordModeOutcome('SURVIVAL', -15, true);

      const stats = getModeStats();
      expect(stats.SURVIVAL.trades).toBe(3);
      expect(stats.SURVIVAL.stopOuts).toBe(2);
      expect(getModeStopOutRate('SURVIVAL')).toBeCloseTo(0.667, 2);
    });

    it('should reset stats correctly', () => {
      recordModeExecution('NORMAL');
      recordModeExecution('DEFENSIVE');
      resetModeStats();

      const stats = getModeStats();
      expect(stats.NORMAL.trades).toBe(0);
      expect(stats.DEFENSIVE.trades).toBe(0);
    });
  });

  // B-5 AMR (2026-06-11, Kyle-approved scope Obj-1) REVERSED the original
  // 11.7S "AGGRESSIVE intentionally removed" decision: AGGRESSIVE exists as a
  // PER-CLASS-ONLY mode (amr_response_dials), producible solely by the AMR
  // weather resolver. The class-less legacy record path fails LOUD by design
  // (serving one class's dials to another would be the bug).
  describe('AGGRESSIVE Mode (B-5: per-class only, legacy path fail-hard)', () => {
    it('AGGRESSIVE key exists on the record but class-less access throws', () => {
      expect('AGGRESSIVE' in STRATEGY_MODE_OVERLAYS).toBe(true);
      expect(() => STRATEGY_MODE_OVERLAYS.AGGRESSIVE).toThrow(/no class-less overlay/);
    });

    it('legacy trio keys remain alongside AGGRESSIVE', () => {
      const modes = Object.keys(STRATEGY_MODE_OVERLAYS);
      expect(modes).toEqual(expect.arrayContaining(['NORMAL', 'DEFENSIVE', 'SURVIVAL', 'AGGRESSIVE']));
      expect(modes).toHaveLength(4);
    });

    it('legacy stability mapping NEVER produces AGGRESSIVE (parity)', () => {
      const produced = Object.values(REGIME_TO_MODE_MAP);
      expect(produced).not.toContain('AGGRESSIVE');
    });
  });

  describe('Regime to Mode Mapping Consistency', () => {
    it('should have exactly 3 stability states mapped', () => {
      const stabilities = Object.keys(REGIME_TO_MODE_MAP);
      expect(stabilities).toHaveLength(3);
      expect(stabilities).toContain('STABLE');
      expect(stabilities).toContain('TRANSITION');
      expect(stabilities).toContain('UNSTABLE');
    });
  });
});
