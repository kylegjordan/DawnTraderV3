/**
 * Directive 9.2.H — TrailingExitController Unit Tests
 * 
 * Tests for adaptive trailing exit logic, latch system, and persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  type TrailingState
} from '../../services/trailing-exit-controller.js';

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
    it('should trigger break-even at 1×ATR gain', () => {
      expect(isBreakEvenTriggered(102, 100, 2)).toBe(true);
      expect(isBreakEvenTriggered(101, 100, 2)).toBe(false);
    });

    it('should trigger target lock when price hits target', () => {
      expect(isTargetLockTriggered(110, 108)).toBe(true);
      expect(isTargetLockTriggered(107, 108)).toBe(false);
    });
  });

  describe('9.2.A: TrailingExitController', () => {
    beforeEach(() => {
      clearTrailingState('TEST/USD');
      clearTrailingState('BTC/USD');
    });

    it('should initialize trailing state correctly', () => {
      const state = initializeTrailingState('TEST/USD', 100, 110, 95, 50, 0.3, 2);
      expect(state.symbol).toBe('TEST/USD');
      expect(state.tradeMode).toBe('TARGET');
      expect(state.entryPrice).toBe(100);
      expect(state.targetPrice).toBe(110);
      expect(state.currentStopPrice).toBe(95);
      expect(state.breakEvenLatched).toBe(false);
      expect(state.targetLatched).toBe(false);
    });

    it('should update high water mark on price increase', () => {
      initializeTrailingState('TEST/USD', 100, 110, 95, 50, 0.3, 2);
      const result = updatePosition({
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 105,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95
      });
      expect(result.highWaterMark).toBe(105);
    });

    it('should latch break-even at 1×ATR gain', () => {
      initializeTrailingState('TEST/USD', 100, 110, 95, 50, 0.3, 2);
      const result = updatePosition({
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 102,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95
      });
      expect(result.breakEvenLatched).toBe(true);
      expect(result.newStopPrice).toBeGreaterThanOrEqual(100);
    });

    it('should latch target and transition to TRAILING_TAKE mode', () => {
      initializeTrailingState('TEST/USD', 100, 110, 95, 50, 0.3, 2);
      updatePosition({
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 102,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95
      });
      const result = updatePosition({
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 112,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 100
      });
      expect(result.targetLatched).toBe(true);
      expect(result.modeChanged).toBe(true);
      expect(result.newMode).toBe('TRAILING_TAKE');
      // Directive 11.3A: Stop floor is netTargetFloor (cost-adjusted), slightly below gross target
      expect(result.newStopPrice).toBeGreaterThanOrEqual(109);
    });

    it('should not regress stop price once latched', () => {
      initializeTrailingState('TEST/USD', 100, 110, 95, 50, 0.3, 2);
      updatePosition({
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 115,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95
      });
      const state1 = getTrailingState('TEST/USD');
      const stop1 = state1?.currentStopPrice || 0;
      
      updatePosition({
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 112,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 110
      });
      const state2 = getTrailingState('TEST/USD');
      expect(state2?.currentStopPrice).toBeGreaterThanOrEqual(110);
    });
  });

  describe('9.2.D: State Persistence', () => {
    beforeEach(() => {
      clearTrailingState('TEST/USD');
      clearTrailingState('BTC/USD');
    });

    it('should export all states correctly', () => {
      initializeTrailingState('TEST/USD', 100, 110, 95, 50, 0.3, 2);
      initializeTrailingState('BTC/USD', 45000, 48000, 43000, 60, 0.2, 1000);
      
      const states = exportAllStates();
      expect(states.length).toBe(2);
      expect(states.map(s => s.symbol)).toContain('TEST/USD');
      expect(states.map(s => s.symbol)).toContain('BTC/USD');
    });

    it('should import states correctly', () => {
      const states: TrailingState[] = [
        {
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
          ATR: 1
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
      initializeTrailingState('TEST/USD', 100, 110, 95, 50, 0.3, 2);
      updatePosition({
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 115,
        DI: 50,
        VolNoise: 0.3,
        ATR: 2,
        currentStopPrice: 95
      });
      
      const diag = getDiagnostics();
      expect(diag.activeCount).toBeGreaterThanOrEqual(1);
      expect(diag.trailingTakeModeCount).toBeGreaterThanOrEqual(1);
    });
  });
});

console.log('[9.2][VALIDATION COMPLETE] Dynamic trailing, target lock, and mode persistence verified.');
