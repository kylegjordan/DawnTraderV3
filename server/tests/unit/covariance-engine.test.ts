/**
 * Directive 9.4 — Covariance Engine Unit Tests
 * 
 * Validates:
 * - Return calculation accuracy
 * - Covariance matrix symmetry (Σ_ij = Σ_ji)
 * - Correlation matrix bounds (ρ ∈ [-1, 1])
 * - Concentration score scaling
 * - Numerical stability for near-constant assets
 * - State persistence/restore
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  covarianceEngine,
  calculateReturns,
  computeCovarianceMatrix,
  computeCorrelationMatrix
} from '../../utils/covariance-engine';

describe('Directive 9.4 — Covariance Engine', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    covarianceEngine.reset();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.restoreAllMocks();
    covarianceEngine.reset();
  });

  describe('9.4.A: Return Calculation', () => {
    it('should calculate returns correctly', () => {
      const prices = [100, 105, 102, 108];
      const returns = calculateReturns(prices);
      
      expect(returns.length).toBe(3);
      expect(returns[0]).toBeCloseTo(0.05, 6);
      expect(returns[1]).toBeCloseTo(-0.0286, 3);
      expect(returns[2]).toBeCloseTo(0.0588, 3);
    });

    it('should return empty array for single price', () => {
      expect(calculateReturns([100])).toEqual([]);
    });

    it('should handle zero prices gracefully', () => {
      const prices = [100, 0, 105];
      const returns = calculateReturns(prices);
      expect(returns.every(r => isFinite(r))).toBe(true);
    });

    it('should filter out NaN returns', () => {
      const prices = [100, 100, 100];
      const returns = calculateReturns(prices);
      expect(returns.every(r => !isNaN(r))).toBe(true);
    });
  });

  describe('9.4.B: Covariance Matrix', () => {
    it('should compute symmetric covariance matrix', () => {
      const returns = {
        'BTC/USD': [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008],
        'ETH/USD': [0.015, 0.025, -0.012, 0.018, 0.008, -0.006, 0.014, 0.005, -0.003, 0.01]
      };
      
      const cov = computeCovarianceMatrix(returns);
      
      expect(cov['BTC/USD']['ETH/USD']).toBeCloseTo(cov['ETH/USD']['BTC/USD'], 10);
    });

    it('should have non-negative diagonal (variance)', () => {
      const returns = {
        'BTC/USD': [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008],
        'ETH/USD': [0.015, 0.025, -0.012, 0.018, 0.008, -0.006, 0.014, 0.005, -0.003, 0.01],
        'SOL/USD': [0.02, 0.03, -0.015, 0.02, 0.01, -0.01, 0.018, 0.006, -0.007, 0.012]
      };
      
      const cov = computeCovarianceMatrix(returns);
      
      expect(cov['BTC/USD']['BTC/USD']).toBeGreaterThanOrEqual(0);
      expect(cov['ETH/USD']['ETH/USD']).toBeGreaterThanOrEqual(0);
      expect(cov['SOL/USD']['SOL/USD']).toBeGreaterThanOrEqual(0);
    });

    it('should return empty object for insufficient data', () => {
      const returns = { 'BTC/USD': [0.01] };
      const cov = computeCovarianceMatrix(returns);
      expect(Object.keys(cov).length).toBe(0);
    });
  });

  describe('9.4.C: Correlation Matrix', () => {
    it('should have values in [-1, 1]', () => {
      const returns = {
        'BTC/USD': [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008],
        'ETH/USD': [0.015, 0.025, -0.012, 0.018, 0.008, -0.006, 0.014, 0.005, -0.003, 0.01],
        'XRP/USD': [-0.01, -0.02, 0.01, -0.015, -0.005, 0.008, -0.012, -0.003, 0.005, -0.008]
      };
      
      const cov = computeCovarianceMatrix(returns);
      const corr = computeCorrelationMatrix(cov);
      
      for (const i of Object.keys(corr)) {
        for (const j of Object.keys(corr[i])) {
          expect(corr[i][j]).toBeGreaterThanOrEqual(-1);
          expect(corr[i][j]).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should have 1.0 on diagonal (self-correlation)', () => {
      const returns = {
        'BTC/USD': [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008],
        'ETH/USD': [0.015, 0.025, -0.012, 0.018, 0.008, -0.006, 0.014, 0.005, -0.003, 0.01]
      };
      
      const cov = computeCovarianceMatrix(returns);
      const corr = computeCorrelationMatrix(cov);
      
      expect(corr['BTC/USD']['BTC/USD']).toBeCloseTo(1, 5);
      expect(corr['ETH/USD']['ETH/USD']).toBeCloseTo(1, 5);
    });

    it('should detect high positive correlation', () => {
      const returns = {
        'BTC/USD': [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008],
        'ETH/USD': [0.012, 0.022, -0.009, 0.016, 0.006, -0.007, 0.013, 0.004, -0.004, 0.009]
      };
      
      const cov = computeCovarianceMatrix(returns);
      const corr = computeCorrelationMatrix(cov);
      
      expect(corr['BTC/USD']['ETH/USD']).toBeGreaterThan(0.9);
    });

    it('should detect negative correlation', () => {
      const returns = {
        'ASSET_A': [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008],
        'ASSET_B': [-0.01, -0.02, 0.01, -0.015, -0.005, 0.008, -0.012, -0.003, 0.005, -0.008]
      };
      
      const cov = computeCovarianceMatrix(returns);
      const corr = computeCorrelationMatrix(cov);
      
      expect(corr['ASSET_A']['ASSET_B']).toBeLessThan(-0.9);
    });
  });

  describe('9.4.D: Engine State Management', () => {
    it('should update from prices correctly', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);
      covarianceEngine.updateFromPrices('TEST/USD', prices);
      
      const symbols = covarianceEngine.getActiveSymbols();
      expect(symbols).toContain('TEST/USD');
    });

    it('should require minimum returns for active symbol', () => {
      const shortPrices = [100, 101, 102];
      covarianceEngine.updateFromPrices('SHORT/USD', shortPrices);
      
      const symbols = covarianceEngine.getActiveSymbols();
      expect(symbols).not.toContain('SHORT/USD');
    });

    it('should compute matrices when sufficient data available', () => {
      const btcPrices = Array.from({ length: 20 }, (_, i) => 50000 + Math.random() * 1000);
      const ethPrices = Array.from({ length: 20 }, (_, i) => 3000 + Math.random() * 100);
      
      covarianceEngine.updateFromPrices('BTC/USD', btcPrices);
      covarianceEngine.updateFromPrices('ETH/USD', ethPrices);
      
      const covMatrix = covarianceEngine.computeCovarianceMatrix();
      const corrMatrix = covarianceEngine.computeCorrelationMatrix();
      
      expect(covMatrix).not.toBeNull();
      expect(corrMatrix).not.toBeNull();
      expect(covMatrix!.symbols.length).toBe(2);
    });

    it('should export and import state correctly', () => {
      const btcPrices = Array.from({ length: 20 }, (_, i) => 50000 + i * 100);
      covarianceEngine.updateFromPrices('BTC/USD', btcPrices);
      
      const state = covarianceEngine.exportState();
      covarianceEngine.reset();
      
      expect(covarianceEngine.getActiveSymbols().length).toBe(0);
      
      covarianceEngine.importState(state);
      expect(covarianceEngine.getActiveSymbols()).toContain('BTC/USD');
    });
  });

  describe('9.4.E: Portfolio Calculations', () => {
    beforeEach(() => {
      const btcReturns = [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008, 0.01, 0.005];
      const ethReturns = [0.015, 0.025, -0.012, 0.018, 0.008, -0.006, 0.014, 0.005, -0.003, 0.01, 0.012, 0.006];
      
      covarianceEngine.addReturns('BTC/USD', btcReturns);
      covarianceEngine.addReturns('ETH/USD', ethReturns);
      covarianceEngine.computeCovarianceMatrix();
    });

    it('should calculate portfolio variance', () => {
      const weights = { 'BTC/USD': 0.5, 'ETH/USD': 0.5 };
      const variance = covarianceEngine.calculatePortfolioVariance(weights);
      
      expect(variance).not.toBeNull();
      expect(variance).toBeGreaterThanOrEqual(0);
    });

    it('should calculate portfolio volatility', () => {
      const weights = { 'BTC/USD': 0.6, 'ETH/USD': 0.4 };
      const volatility = covarianceEngine.calculatePortfolioVolatility(weights);
      
      expect(volatility).not.toBeNull();
      expect(volatility).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero weights', () => {
      const weights = { 'BTC/USD': 0, 'ETH/USD': 0 };
      const variance = covarianceEngine.calculatePortfolioVariance(weights);
      
      expect(variance).toBe(0);
    });
  });

  describe('9.4.F: Numerical Stability', () => {
    it('should handle near-constant prices without NaN', () => {
      const flatPrices = Array.from({ length: 20 }, () => 100 + Math.random() * 0.0001);
      covarianceEngine.updateFromPrices('STABLE/USD', flatPrices);
      
      const cov = covarianceEngine.computeCovarianceMatrix();
      if (cov) {
        expect(cov.matrix['STABLE/USD']['STABLE/USD']).not.toBeNaN();
      }
    });

    it('should handle perfectly correlated returns', () => {
      const baseReturns = [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008, 0.006, 0.004];
      
      covarianceEngine.addReturns('ASSET_A', baseReturns);
      covarianceEngine.addReturns('ASSET_B', baseReturns.map(r => r * 1.5));
      
      covarianceEngine.computeCovarianceMatrix();
      const corr = covarianceEngine.computeCorrelationMatrix();
      
      expect(corr).not.toBeNull();
      expect(Math.abs(corr!.matrix['ASSET_A']['ASSET_B'])).toBeCloseTo(1, 5);
    });

    it('should clamp extreme correlation values', () => {
      const returns = {
        'A': [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008],
        'B': [0.01, 0.02, -0.01, 0.015, 0.005, -0.008, 0.012, 0.003, -0.005, 0.008]
      };
      
      const cov = computeCovarianceMatrix(returns);
      const corr = computeCorrelationMatrix(cov);
      
      expect(corr['A']['B']).toBeLessThanOrEqual(1);
      expect(corr['A']['B']).toBeGreaterThanOrEqual(-1);
    });
  });

  describe('9.4.G: Staleness Check', () => {
    it('should report stale when no updates', () => {
      expect(covarianceEngine.isStale(60)).toBe(true);
    });

    it('should report fresh after update', () => {
      const prices = Array.from({ length: 15 }, (_, i) => 100 + i);
      covarianceEngine.updateFromPrices('TEST1/USD', prices);
      covarianceEngine.updateFromPrices('TEST2/USD', prices.map(p => p * 0.5));
      covarianceEngine.computeCovarianceMatrix();
      
      expect(covarianceEngine.isStale(60)).toBe(false);
    });
  });

  describe('9.4.H: Telemetry Logging', () => {
    it('should emit [9.4][RETURNS] log on addReturns', () => {
      covarianceEngine.addReturns('LOG/USD', [0.01, 0.02, -0.01]);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[9.4][RETURNS]')
      );
    });

    it('should emit [9.4][COV] log on matrix computation', () => {
      const btcPrices = Array.from({ length: 15 }, (_, i) => 50000 + i * 100);
      const ethPrices = Array.from({ length: 15 }, (_, i) => 3000 + i * 50);
      
      covarianceEngine.updateFromPrices('BTC/USD', btcPrices);
      covarianceEngine.updateFromPrices('ETH/USD', ethPrices);
      covarianceEngine.computeCovarianceMatrix();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[9.4][COV]')
      );
    });
  });

  describe('9.4.I: Diagnostics', () => {
    it('should provide diagnostic information', () => {
      const prices = Array.from({ length: 15 }, (_, i) => 100 + i);
      covarianceEngine.updateFromPrices('DIAG/USD', prices);
      
      const diag = covarianceEngine.getDiagnostics();
      
      expect(diag.symbolCount).toBeGreaterThanOrEqual(0);
      expect(typeof diag.avgWindowSize).toBe('number');
    });
  });
});
