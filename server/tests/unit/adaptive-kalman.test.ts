/**
 * Directive 9.3 — Adaptive Kalman Filter Unit Tests
 * 
 * Validates:
 * - Cold Start: Returns price immediately, no delay
 * - High ER (trend) → fast responsiveness (small lag)
 * - Low ER (chop) → high smoothing, small noise amplitude
 * - VolNoise interaction → higher Q increases volatility adaptation
 * - Flat Market (ER≈0, VolNoise≈0) → no drift
 * - Numerical Stability: P never negative, NaN, or zero
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AdaptiveKalmanFilter,
  getKalmanFilter,
  getSmoothedPrice,
  clearKalmanFilter,
  getAllKalmanDiagnostics,
  getActiveFilterCount
} from '../../utils/adaptive-kalman';
import { calculateEfficiencyRatio, calculateVolNoise } from '../../utils/analysis-utils';

describe('Directive 9.3 — Adaptive Kalman Filter', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    clearKalmanFilter('TEST/USD');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    clearKalmanFilter('TEST/USD');
  });

  describe('9.3.A: Cold Start Behavior', () => {
    it('should seed with first price immediately (no delay)', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      const firstPrice = 100.0;
      
      const result = filter.update(firstPrice, 0.5, 0.3);
      
      expect(result).toBe(firstPrice);
      expect(filter.getState()).toBe(firstPrice);
      expect(filter.isInitialized()).toBe(true);
    });

    it('should emit [9.3][INIT] log on first update', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100.0, 0.5, 0.3);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[9.3][INIT]')
      );
    });

    it('should not emit [9.3][INIT] on subsequent updates', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100.0, 0.5, 0.3);
      consoleLogSpy.mockClear();
      
      filter.update(101.0, 0.5, 0.3);
      
      const initCalls = consoleLogSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('[9.3][INIT]')
      );
      expect(initCalls.length).toBe(0);
    });
  });

  describe('9.3.B: Efficiency Ratio (ER) Calculator', () => {
    it('should return 0 for insufficient data', () => {
      const shortPrices = [100, 101, 102];
      expect(calculateEfficiencyRatio(shortPrices, 20)).toBe(0);
    });

    it('should return high ER for smooth uptrend', () => {
      const uptrend = Array.from({ length: 25 }, (_, i) => 100 + i);
      const ER = calculateEfficiencyRatio(uptrend, 20);
      expect(ER).toBeGreaterThan(0.9);
    });

    it('should return low ER for choppy market', () => {
      const choppy = Array.from({ length: 25 }, (_, i) => 100 + (i % 2 === 0 ? 2 : -2));
      const ER = calculateEfficiencyRatio(choppy, 20);
      expect(ER).toBeLessThan(0.3);
    });

    it('should return 0 when volatility is zero', () => {
      const flatPrices = Array.from({ length: 25 }, () => 100);
      const ER = calculateEfficiencyRatio(flatPrices, 20);
      expect(ER).toBe(0);
    });

    it('should clamp ER between 0 and 1', () => {
      const prices = Array.from({ length: 25 }, (_, i) => 100 + i * 0.5);
      const ER = calculateEfficiencyRatio(prices, 20);
      expect(ER).toBeGreaterThanOrEqual(0);
      expect(ER).toBeLessThanOrEqual(1);
    });
  });

  describe('9.3.C: Adaptive Parameter Logic', () => {
    it('should have low R (fast response) when ER is high', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100, 0.95, 0.1);
      filter.update(105, 0.95, 0.1);
      
      const diag = filter.getDiagnostics();
      expect(diag.lastR).toBeLessThan(10);
    });

    it('should have high R (slow response) when ER is low', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100, 0.05, 0.1);
      filter.update(105, 0.05, 0.1);
      
      const diag = filter.getDiagnostics();
      expect(diag.lastR).toBeGreaterThan(40);
    });

    it('should clamp R between 1 and 50', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      
      filter.update(100, 1.0, 0.1);
      filter.update(101, 1.0, 0.1);
      expect(filter.getDiagnostics().lastR).toBeGreaterThanOrEqual(1);
      
      filter.reset();
      filter.update(100, 0.0, 0.1);
      filter.update(101, 0.0, 0.1);
      expect(filter.getDiagnostics().lastR).toBeLessThanOrEqual(50);
    });

    it('should scale Q with VolNoise', () => {
      const filter1 = new AdaptiveKalmanFilter('TEST/USD');
      filter1.update(100, 0.5, 0.1);
      filter1.update(101, 0.5, 0.1);
      const lowNoiseQ = filter1.getDiagnostics().lastQ;
      
      const filter2 = new AdaptiveKalmanFilter('HIGH/USD');
      filter2.update(100, 0.5, 0.8);
      filter2.update(101, 0.5, 0.8);
      const highNoiseQ = filter2.getDiagnostics().lastQ;
      
      expect(highNoiseQ).toBeGreaterThan(lowNoiseQ);
    });

    it('should have minimum Q of 0.1', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100, 0.5, 0.0);
      filter.update(101, 0.5, 0.0);
      
      expect(filter.getDiagnostics().lastQ).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('9.3.D: Response Characteristics', () => {
    it('should track fast uptrend closely with high ER', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      const prices = [100, 105, 110, 115, 120];
      let lastSmoothed = 0;
      
      for (const price of prices) {
        lastSmoothed = filter.update(price, 0.95, 0.1);
      }
      
      const lag = 120 - lastSmoothed;
      expect(lag).toBeLessThan(15);
    });

    it('should heavily smooth choppy prices with low ER', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      const choppyPrices = [100, 105, 98, 103, 97, 104, 99, 102];
      let smoothedPrices: number[] = [];
      
      for (const price of choppyPrices) {
        smoothedPrices.push(filter.update(price, 0.1, 0.5));
      }
      
      const rawStdDev = Math.sqrt(
        choppyPrices.reduce((sum, p) => sum + Math.pow(p - 100.5, 2), 0) / choppyPrices.length
      );
      const smoothedStdDev = Math.sqrt(
        smoothedPrices.slice(1).reduce((sum, p) => sum + Math.pow(p - smoothedPrices[1], 2), 0) / (smoothedPrices.length - 1)
      );
      
      expect(smoothedStdDev).toBeLessThan(rawStdDev);
    });
  });

  describe('9.3.E: Flat Market Stability', () => {
    it('should not drift on constant price feed', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      const flatPrice = 100.0;
      
      let lastSmoothed = flatPrice;
      for (let i = 0; i < 50; i++) {
        lastSmoothed = filter.update(flatPrice, 0.0, 0.0);
      }
      
      expect(Math.abs(lastSmoothed - flatPrice)).toBeLessThan(0.01);
    });

    it('should remain stable with ER≈0 and VolNoise≈0', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      const prices = [100, 100.001, 99.999, 100.002, 99.998];
      let lastState = 0;
      
      for (const price of prices) {
        lastState = filter.update(price, 0.01, 0.01);
      }
      
      expect(Math.abs(lastState - 100)).toBeLessThan(1);
    });
  });

  describe('9.3.F: Numerical Stability', () => {
    it('should never have negative P', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      
      for (let i = 0; i < 1000; i++) {
        filter.update(100 + Math.random() * 10, Math.random(), Math.random());
      }
      
      expect(filter.getDiagnostics().P).toBeGreaterThan(0);
    });

    it('should never produce NaN state', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      
      for (let i = 0; i < 100; i++) {
        const state = filter.update(100 + Math.random() * 10, Math.random(), Math.random());
        expect(Number.isNaN(state)).toBe(false);
      }
    });

    it('should maintain P above minimum threshold (1e-8)', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      
      for (let i = 0; i < 500; i++) {
        filter.update(100, 1.0, 0.0);
      }
      
      expect(filter.getDiagnostics().P).toBeGreaterThanOrEqual(1e-8);
    });

    it('should handle extreme ER/VolNoise values', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      
      expect(() => filter.update(100, 0, 0)).not.toThrow();
      expect(() => filter.update(101, 1, 1)).not.toThrow();
      expect(() => filter.update(102, 0, 1)).not.toThrow();
      expect(() => filter.update(103, 1, 0)).not.toThrow();
    });
  });

  describe('9.3.G: Filter Registry', () => {
    it('should create and retrieve filter by symbol', () => {
      const filter1 = getKalmanFilter('BTC/USD');
      const filter2 = getKalmanFilter('BTC/USD');
      
      expect(filter1).toBe(filter2);
    });

    it('should create separate filters for different symbols', () => {
      const btcFilter = getKalmanFilter('BTC/USD');
      const ethFilter = getKalmanFilter('ETH/USD');
      
      expect(btcFilter).not.toBe(ethFilter);
    });

    it('should update correct filter via getSmoothedPrice', () => {
      const price1 = getSmoothedPrice('REG/USD', 100, 0.5, 0.3);
      const price2 = getSmoothedPrice('REG/USD', 105, 0.5, 0.3);
      
      expect(price1).toBe(100);
      expect(price2).not.toBe(105);
      
      clearKalmanFilter('REG/USD');
    });

    it('should clear filter correctly', () => {
      getSmoothedPrice('CLEAR/USD', 100, 0.5, 0.3);
      expect(getActiveFilterCount()).toBeGreaterThan(0);
      
      clearKalmanFilter('CLEAR/USD');
      
      const price = getSmoothedPrice('CLEAR/USD', 200, 0.5, 0.3);
      expect(price).toBe(200);
      
      clearKalmanFilter('CLEAR/USD');
    });

    it('should provide diagnostics for all active filters', () => {
      getSmoothedPrice('DIAG1/USD', 100, 0.5, 0.3);
      getSmoothedPrice('DIAG2/USD', 200, 0.6, 0.4);
      
      const diagnostics = getAllKalmanDiagnostics();
      const symbols = diagnostics.map(d => d.symbol);
      
      expect(symbols).toContain('DIAG1/USD');
      expect(symbols).toContain('DIAG2/USD');
      
      clearKalmanFilter('DIAG1/USD');
      clearKalmanFilter('DIAG2/USD');
    });
  });

  describe('9.3.H: State Persistence', () => {
    it('should export internal state', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100, 0.5, 0.3);
      filter.update(105, 0.6, 0.25);
      
      const state = filter.getInternalState();
      
      expect(state.x).not.toBeNull();
      expect(state.P).toBeGreaterThan(0);
      expect(state.updateCount).toBe(2);
      expect(state.lastER).toBe(0.6);
      expect(state.lastVolNoise).toBe(0.25);
    });

    it('should restore from saved state', () => {
      const filter1 = new AdaptiveKalmanFilter('TEST/USD');
      filter1.update(100, 0.5, 0.3);
      filter1.update(105, 0.6, 0.25);
      const savedState = filter1.getInternalState();
      
      const filter2 = new AdaptiveKalmanFilter('TEST/USD');
      filter2.restoreState(savedState);
      
      expect(filter2.getState()).toBe(filter1.getState());
      expect(filter2.getDiagnostics().P).toBe(filter1.getDiagnostics().P);
      expect(filter2.getDiagnostics().updateCount).toBe(filter1.getDiagnostics().updateCount);
    });

    it('should reset to initial state', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100, 0.5, 0.3);
      filter.update(105, 0.6, 0.25);
      
      filter.reset();
      
      expect(filter.getState()).toBeNull();
      expect(filter.isInitialized()).toBe(false);
      expect(filter.getDiagnostics().updateCount).toBe(0);
    });
  });

  describe('9.3.I: Telemetry Logging', () => {
    it('should emit [9.3][KALMAN] log on each update after init', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100, 0.5, 0.3);
      consoleLogSpy.mockClear();
      
      filter.update(105, 0.6, 0.25);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[9.3][KALMAN]')
      );
    });

    it('should include ER, R, Q, K, x in telemetry', () => {
      const filter = new AdaptiveKalmanFilter('TEST/USD');
      filter.update(100, 0.5, 0.3);
      consoleLogSpy.mockClear();
      
      filter.update(105, 0.75, 0.2);
      
      const logCall = consoleLogSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('[9.3][KALMAN]')
      );
      expect(logCall).toBeDefined();
      expect(logCall![0]).toContain('ER=');
      expect(logCall![0]).toContain('R=');
      expect(logCall![0]).toContain('Q=');
      expect(logCall![0]).toContain('K=');
      expect(logCall![0]).toContain('x=');
    });
  });
});
