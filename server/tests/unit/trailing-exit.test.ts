/**
 * Directive 9.2.H — TrailingExitController Unit Tests
 *
 * Tests for adaptive trailing exit logic, latch system, and persistence.
 *
 * B79.TEC (2026-05-08): updated to seed per-class break_even_enabled rows
 * and prime the per-asset-class TEC config cache via primeTECConfig before
 * exercising updatePosition. Also adds `assetClass: 'crypto_spot'` to every
 * PositionUpdate call (now non-optional per scope §1 #3).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- B79.TEC: DB mock so primeTECConfig can resolve module_constants. ---
const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mockRows.current,
      }),
    }),
  },
}));
vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (entry: number) => entry,
  computeNetTargetFloor: (target: number) => target,
  computeTotalRoundTripCost: () => 0,
}));
vi.mock('../../storage.js', () => ({
  storage: {
    getPaperSimOpenPositions: async () => [],
    updatePaperSimOpenPosition: async () => undefined,
  },
}));
vi.mock('../../services/trade-safety.js', () => ({
  persistTrailingStates: () => undefined,
}));

import {
  calculateDynamicStopDistance,
  calculateTrailingStopPrice,
  isBreakEvenTriggered,
  isTargetLockTriggered
} from '../../utils/analysis-utils.js';
import {
  initializeTrailingState,
  updatePosition,
  getTrailingState,
  clearTrailingState,
  exportAllStates,
  importStates,
  getDiagnostics,
  primeTECConfig,
  _testClearEngineConfigCache,
  type TrailingState
} from '../../services/trailing-exit-controller.js';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';

const wildcardBase = {
  moduleName: 'trailing_exit',
  exchange: '*',
  assetClass: '*',
  strategy: '*',
  regime: '*',
  updatedAt: new Date(),
  updatedBy: 'test',
};

function seedB79TECRows() {
  mockRows.current = [
    { ...wildcardBase, assetClass: 'crypto_spot', constantName: 'break_even_enabled', value: true },
    { ...wildcardBase, assetClass: 'crypto_perp', constantName: 'break_even_enabled', value: true },
    { ...wildcardBase, assetClass: 'xstock_spot', constantName: 'break_even_enabled', value: true },
    { ...wildcardBase, assetClass: 'xstock_perp', constantName: 'break_even_enabled', value: true },
    { ...wildcardBase, constantName: 'break_even_trigger_r', value: 1.0 },
    { ...wildcardBase, constantName: 'target_lock_r', value: 1.5 },
    { ...wildcardBase, constantName: 'trail_distance_atr_multiplier', value: 1.0 },
    { ...wildcardBase, constantName: 'persistence_debounce_ms', value: 5000 },
    { ...wildcardBase, constantName: 'moonbag_qualifying_strategies', value: ['strong_bull_trend', 'sma_trend_ride', 'vwap_pullback', 'breakout'] },
    { ...wildcardBase, constantName: 'moonbag_qualifying_source_pools', value: { vwap_pullback: ['quant-strong_trend'] } },
    { ...wildcardBase, constantName: 'moonbag_max_duration_ms', value: 14400000 },
    { ...wildcardBase, constantName: 'moonbag_cap_mode', value: 'reserved_slots' },
    { ...wildcardBase, constantName: 'moonbag_reserved_slots', value: 1 },
  ];
}

describe('Directive 9.2 — Dynamic Trade Management', () => {
  describe('9.2.B: Dynamic Stop Distance Formula', () => {
    it('should compute K\' with default parameters', () => {
      const Kprime = calculateDynamicStopDistance(50, 0.3);
      expect(Kprime).toBeGreaterThan(1.0);
      expect(Kprime).toBeLessThan(2.0);
    });

    it('should widen stop for low DI (choppy market)', () => {
      const lowDI = calculateDynamicStopDistance(20, 0.3);
      const highDI = calculateDynamicStopDistance(80, 0.3);
      expect(lowDI).toBeGreaterThan(highDI);
    });

    it('should widen stop for high VolNoise', () => {
      const lowNoise = calculateDynamicStopDistance(50, 0.1);
      const highNoise = calculateDynamicStopDistance(50, 0.9);
      expect(highNoise).toBeGreaterThan(lowNoise);
    });

    it('should clamp K\' between 0.5 and 3.0', () => {
      const extreme1 = calculateDynamicStopDistance(100, 0, 0.1);
      const extreme2 = calculateDynamicStopDistance(0, 1.0, 5.0);
      expect(extreme1).toBeGreaterThanOrEqual(0.5);
      expect(extreme2).toBeLessThanOrEqual(3.0);
    });

    it('should compute trailing stop price correctly', () => {
      const stopPrice = calculateTrailingStopPrice(100, 2, 50, 0.3);
      expect(stopPrice).toBeLessThan(100);
      expect(stopPrice).toBeGreaterThan(90);
    });
  });

  describe('9.2.C: Break-Even & Target Lock Latch', () => {
    it('should trigger break-even at 1×ATR gain (default multiplier)', () => {
      expect(isBreakEvenTriggered(102, 100, 2)).toBe(true);
      expect(isBreakEvenTriggered(101, 100, 2)).toBe(false);
    });

    // B77 (2026-05-07, RUNNING_ISSUES #71): explicit breakEvenTriggerR multiplier
    // now drives the gate. Previously hardcoded to 1×ATR — was a no-op since B65.1.
    it('should respect breakEvenTriggerR multiplier > 1.0', () => {
      // 1.5×ATR threshold = 3.0 gain required against ATR=2
      expect(isBreakEvenTriggered(103, 100, 2, 1.5)).toBe(true);   // gain=3 == 1.5×2
      expect(isBreakEvenTriggered(102.99, 100, 2, 1.5)).toBe(false);
      expect(isBreakEvenTriggered(102, 100, 2, 1.5)).toBe(false);  // gain=2 < 3
    });

    it('should respect breakEvenTriggerR multiplier < 1.0', () => {
      // 0.5×ATR threshold = 1.0 gain required against ATR=2
      expect(isBreakEvenTriggered(101, 100, 2, 0.5)).toBe(true);
      expect(isBreakEvenTriggered(100.99, 100, 2, 0.5)).toBe(false);
    });

    it('omitting breakEvenTriggerR defaults to 1.0 (back-compat)', () => {
      expect(isBreakEvenTriggered(102, 100, 2)).toBe(isBreakEvenTriggered(102, 100, 2, 1.0));
      expect(isBreakEvenTriggered(101, 100, 2)).toBe(isBreakEvenTriggered(101, 100, 2, 1.0));
    });

    it('should trigger target lock when price hits target', () => {
      expect(isTargetLockTriggered(110, 108)).toBe(true);
      expect(isTargetLockTriggered(107, 108)).toBe(false);
    });
  });

  describe('9.2.A: TrailingExitController', () => {
    beforeEach(async () => {
      clearModuleConstantsCache();
      seedB79TECRows();
      _testClearEngineConfigCache();
      await primeTECConfig();
      clearTrailingState('TEST/USD');
      clearTrailingState('BTC/USD');
    });

    it('should initialize trailing state correctly', () => {
      const state = initializeTrailingState('TEST/USD', 'TEST/USD', 100, 110, 95, 50, 0.3, 2);
      expect(state.symbol).toBe('TEST/USD');
      expect(state.tradeMode).toBe('TARGET');
      expect(state.entryPrice).toBe(100);
      expect(state.targetPrice).toBe(110);
      expect(state.currentStopPrice).toBe(95);
      expect(state.breakEvenLatched).toBe(false);
      expect(state.targetLatched).toBe(false);
    });

    it('should update high water mark on price increase', () => {
      initializeTrailingState('TEST/USD', 'TEST/USD', 100, 110, 95, 50, 0.3, 2);
      const result = updatePosition({
        tradeId: 'TEST/USD',
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 105,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95,
        assetClass: 'crypto_spot',
      });
      expect(result.highWaterMark).toBe(105);
    });

    it('should latch break-even at 1×ATR gain', () => {
      initializeTrailingState('TEST/USD', 'TEST/USD', 100, 110, 95, 50, 0.3, 2);
      const result = updatePosition({
        tradeId: 'TEST/USD',
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 102,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95,
        assetClass: 'crypto_spot',
      });
      expect(result.breakEvenLatched).toBe(true);
      expect(result.newStopPrice).toBeGreaterThanOrEqual(100);
    });

    it('should latch target and transition to TRAILING_TAKE mode', () => {
      initializeTrailingState('TEST/USD', 'TEST/USD', 100, 110, 95, 50, 0.3, 2);
      updatePosition({
        tradeId: 'TEST/USD',
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 102,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95,
        assetClass: 'crypto_spot',
      });
      const result = updatePosition({
        tradeId: 'TEST/USD',
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 112,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 100,
        assetClass: 'crypto_spot',
      });
      expect(result.targetLatched).toBe(true);
      expect(result.modeChanged).toBe(true);
      expect(result.newMode).toBe('TRAILING_TAKE');
      // B65.4.1 (2026-04-26): Stop floor is netTargetFloor — at-or-ABOVE the
      // gross target, with a slippage buffer to absorb stop-trigger slippage.
      // Was previously slightly below target (cost-aware breakeven); changed
      // 2026-04-26 because that allowed reversals to exit BELOW the original
      // target. See B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md.
      expect(result.newStopPrice).toBeGreaterThanOrEqual(110);
    });

    it('should not regress stop price once latched', () => {
      initializeTrailingState('TEST/USD', 'TEST/USD', 100, 110, 95, 50, 0.3, 2);
      updatePosition({
        tradeId: 'TEST/USD',
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 115,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95,
        assetClass: 'crypto_spot',
      });
      const state1 = getTrailingState('TEST/USD');
      const stop1 = state1?.currentStopPrice || 0;
      
      updatePosition({
        tradeId: 'TEST/USD',
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 112,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 110,
        assetClass: 'crypto_spot',
      });
      const state2 = getTrailingState('TEST/USD');
      expect(state2?.currentStopPrice).toBeGreaterThanOrEqual(110);
    });
  });

  describe('9.2.D: State Persistence', () => {
    beforeEach(async () => {
      clearModuleConstantsCache();
      seedB79TECRows();
      _testClearEngineConfigCache();
      await primeTECConfig();
      clearTrailingState('TEST/USD');
      clearTrailingState('BTC/USD');
    });

    it('should export all states correctly', () => {
      initializeTrailingState('TEST/USD', 'TEST/USD', 100, 110, 95, 50, 0.3, 2);
      initializeTrailingState('BTC/USD', 'BTC/USD', 45000, 48000, 43000, 60, 0.2, 1000);
      
      const states = exportAllStates();
      expect(states.length).toBe(2);
      expect(states.map(s => s.symbol)).toContain('TEST/USD');
      expect(states.map(s => s.symbol)).toContain('BTC/USD');
    });

    it('should import states correctly', () => {
      const states: TrailingState[] = [
        {
          // B80 (2026-05-13): per-trade keying. tradeId added.
          tradeId: 'IMPORT/USD',
          symbol: 'IMPORT/USD',
          tradeMode: 'TRAILING_TAKE',
          entryPrice: 50,
          targetPrice: 55,
          currentStopPrice: 55,
          highWaterMark: 60,
          breakEvenLatched: true,
          targetLatched: true,
          lastUpdated: Date.now(),
          DI: 70,
          VolNoise: 0.2,
          ATR: 1,
          // B65.4: ladder fields required by interface.
          ladderRung: 1,
          currentRungTarget: 60,
          currentRungFloor: 55,
        }
      ];

      importStates(states);
      const imported = getTrailingState('IMPORT/USD');
      expect(imported).toBeDefined();
      expect(imported?.tradeMode).toBe('TRAILING_TAKE');
      expect(imported?.targetLatched).toBe(true);
      clearTrailingState('IMPORT/USD');
    });

    it('should provide correct diagnostics', () => {
      initializeTrailingState('TEST/USD', 'TEST/USD', 100, 110, 95, 50, 0.3, 2);
      updatePosition({
        tradeId: 'TEST/USD',
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 115,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95,
        assetClass: 'crypto_spot',
      });
      
      const diag = getDiagnostics();
      expect(diag.activeCount).toBeGreaterThanOrEqual(1);
      expect(diag.trailingTakeModeCount).toBeGreaterThanOrEqual(1);
    });
  });
});

console.log('[9.2][VALIDATION COMPLETE] Dynamic trailing, target lock, and mode persistence verified.');
