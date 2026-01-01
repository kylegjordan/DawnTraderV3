/**
 * Directive 9.4 — Covariance Guard / Risk Concentration Control
 * 
 * CovarianceMatrixEngine: Computes rolling covariance and correlation matrices
 * from recent returns to enable portfolio-level risk management.
 * 
 * Mathematical Foundation:
 * - Return: r_i(t) = (P_i(t) - P_i(t-1)) / P_i(t-1)
 * - Covariance: Σ = (1/(n-1)) × (R - R̄)ᵀ(R - R̄)
 * - Correlation: ρ_ij = Σ_ij / (σ_i × σ_j)
 * - Portfolio Variance: w^T Σ w
 * - Portfolio Volatility: √(w^T Σ w)
 * 
 * Tags: [9.4][COV], [9.4][RETURNS]
 */

export interface CovarianceMatrix {
  symbols: string[];
  matrix: Record<string, Record<string, number>>;
  timestamp: Date;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: Record<string, Record<string, number>>;
  timestamp: Date;
}

export interface CovarianceEngineDiagnostics {
  symbolCount: number;
  lastUpdateTime: Date | null;
  avgWindowSize: number;
  matrixConditionNumber: number | null;
}

const RETURN_HISTORY_SIZE = 100;
const MIN_RETURNS_FOR_CALCULATION = 10;

class CovarianceMatrixEngine {
  private returnHistory: Map<string, number[]> = new Map();
  private lastCovarianceMatrix: CovarianceMatrix | null = null;
  private lastCorrelationMatrix: CorrelationMatrix | null = null;
  private lastUpdateTime: Date | null = null;

  /**
   * Calculate returns from an array of prices
   * r_i(t) = (P_i(t) - P_i(t-1)) / P_i(t-1)
   */
  calculateReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] === 0) continue;
      const r = (prices[i] - prices[i - 1]) / prices[i - 1];
      if (isFinite(r) && !isNaN(r)) {
        returns.push(r);
      }
    }
    return returns;
  }

  /**
   * Add returns for a symbol to the rolling history
   */
  addReturns(symbol: string, returns: number[]): void {
    const existing = this.returnHistory.get(symbol) || [];
    const combined = [...existing, ...returns].slice(-RETURN_HISTORY_SIZE);
    this.returnHistory.set(symbol, combined);
    console.log(`[9.4][RETURNS] ${symbol}: added ${returns.length} returns, total=${combined.length}`);
  }

  /**
   * Update returns from raw price data
   */
  updateFromPrices(symbol: string, prices: number[]): void {
    if (prices.length < 2) return;
    const returns = this.calculateReturns(prices);
    if (returns.length > 0) {
      this.addReturns(symbol, returns);
    }
  }

  /**
   * Get all symbols with sufficient return history
   */
  getActiveSymbols(): string[] {
    const symbols: string[] = [];
    for (const [symbol, returns] of this.returnHistory.entries()) {
      if (returns.length >= MIN_RETURNS_FOR_CALCULATION) {
        symbols.push(symbol);
      }
    }
    return symbols;
  }

  /**
   * Compute covariance matrix for all active symbols
   * Σ = (1/(n-1)) × (R - R̄)ᵀ(R - R̄)
   */
  computeCovarianceMatrix(): CovarianceMatrix | null {
    const symbols = this.getActiveSymbols();
    if (symbols.length < 2) {
      console.log(`[9.4][COV] Insufficient symbols (${symbols.length}) for covariance matrix`);
      return null;
    }

    const returns: Record<string, number[]> = {};
    symbols.forEach(s => {
      returns[s] = this.returnHistory.get(s) || [];
    });

    const minLength = Math.min(...symbols.map(s => returns[s].length));
    if (minLength < MIN_RETURNS_FOR_CALCULATION) {
      console.log(`[9.4][COV] Insufficient return length (${minLength})`);
      return null;
    }

    const mean: Record<string, number> = {};
    symbols.forEach(s => {
      const trimmed = returns[s].slice(-minLength);
      mean[s] = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    });

    const cov: Record<string, Record<string, number>> = {};
    symbols.forEach(i => {
      cov[i] = {};
      const ri = returns[i].slice(-minLength);
      symbols.forEach(j => {
        const rj = returns[j].slice(-minLength);
        let sum = 0;
        for (let k = 0; k < minLength; k++) {
          sum += (ri[k] - mean[i]) * (rj[k] - mean[j]);
        }
        const covValue = sum / (minLength - 1);
        cov[i][j] = isFinite(covValue) && !isNaN(covValue) ? covValue : 0;
      });
    });

    this.lastCovarianceMatrix = {
      symbols,
      matrix: cov,
      timestamp: new Date()
    };
    this.lastUpdateTime = new Date();

    console.log(`[9.4][COV] Updated matrix for ${symbols.length} symbols (window=${minLength})`);
    return this.lastCovarianceMatrix;
  }

  /**
   * Compute correlation matrix from covariance matrix
   * ρ_ij = Σ_ij / (σ_i × σ_j)
   */
  computeCorrelationMatrix(cov?: CovarianceMatrix): CorrelationMatrix | null {
    const covMatrix = cov || this.lastCovarianceMatrix;
    if (!covMatrix) {
      return null;
    }

    const { symbols, matrix } = covMatrix;
    const corr: Record<string, Record<string, number>> = {};

    symbols.forEach(i => {
      corr[i] = {};
      const sigma_i = Math.sqrt(Math.max(matrix[i][i], 0));
      symbols.forEach(j => {
        const sigma_j = Math.sqrt(Math.max(matrix[j][j], 0));
        if (sigma_i === 0 || sigma_j === 0) {
          corr[i][j] = i === j ? 1 : 0;
        } else {
          const rho = matrix[i][j] / (sigma_i * sigma_j);
          corr[i][j] = Math.max(-1, Math.min(1, isFinite(rho) ? rho : 0));
        }
      });
    });

    this.lastCorrelationMatrix = {
      symbols,
      matrix: corr,
      timestamp: new Date()
    };

    return this.lastCorrelationMatrix;
  }

  /**
   * Get correlation between two symbols
   */
  getCorrelation(symbolA: string, symbolB: string): number | null {
    if (!this.lastCorrelationMatrix) {
      this.computeCovarianceMatrix();
      this.computeCorrelationMatrix();
    }
    
    if (!this.lastCorrelationMatrix) return null;
    
    const { matrix } = this.lastCorrelationMatrix;
    if (!matrix[symbolA] || !matrix[symbolB]) return null;
    
    return matrix[symbolA][symbolB] ?? null;
  }

  /**
   * Calculate portfolio variance given position weights
   * Portfolio Variance = w^T Σ w
   */
  calculatePortfolioVariance(weights: Record<string, number>): number | null {
    if (!this.lastCovarianceMatrix) {
      this.computeCovarianceMatrix();
    }
    
    if (!this.lastCovarianceMatrix) return null;

    const { symbols, matrix } = this.lastCovarianceMatrix;
    let variance = 0;

    for (const i of symbols) {
      const wi = weights[i] || 0;
      for (const j of symbols) {
        const wj = weights[j] || 0;
        variance += wi * wj * (matrix[i]?.[j] || 0);
      }
    }

    return variance >= 0 ? variance : 0;
  }

  /**
   * Calculate portfolio volatility (standard deviation)
   * Portfolio Volatility = √(w^T Σ w)
   */
  calculatePortfolioVolatility(weights: Record<string, number>): number | null {
    const variance = this.calculatePortfolioVariance(weights);
    return variance !== null ? Math.sqrt(variance) : null;
  }

  /**
   * Get cached covariance matrix
   */
  getCovarianceMatrix(): CovarianceMatrix | null {
    return this.lastCovarianceMatrix;
  }

  /**
   * Get cached correlation matrix
   */
  getCorrelationMatrix(): CorrelationMatrix | null {
    return this.lastCorrelationMatrix;
  }

  /**
   * Check if matrices are stale (older than specified seconds)
   */
  isStale(maxAgeSeconds: number = 60): boolean {
    if (!this.lastUpdateTime) return true;
    const ageMs = Date.now() - this.lastUpdateTime.getTime();
    return ageMs > maxAgeSeconds * 1000;
  }

  /**
   * Clear all data and reset engine
   */
  reset(): void {
    this.returnHistory.clear();
    this.lastCovarianceMatrix = null;
    this.lastCorrelationMatrix = null;
    this.lastUpdateTime = null;
    console.log(`[9.4][COV] Engine reset`);
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics(): CovarianceEngineDiagnostics {
    const symbols = this.getActiveSymbols();
    let totalWindowSize = 0;
    symbols.forEach(s => {
      totalWindowSize += (this.returnHistory.get(s)?.length || 0);
    });

    return {
      symbolCount: symbols.length,
      lastUpdateTime: this.lastUpdateTime,
      avgWindowSize: symbols.length > 0 ? totalWindowSize / symbols.length : 0,
      matrixConditionNumber: null
    };
  }

  /**
   * Export return history for persistence
   */
  exportState(): Record<string, number[]> {
    const state: Record<string, number[]> = {};
    for (const [symbol, returns] of this.returnHistory.entries()) {
      state[symbol] = [...returns];
    }
    return state;
  }

  /**
   * Import return history from persistence
   */
  importState(state: Record<string, number[]>): void {
    this.returnHistory.clear();
    for (const [symbol, returns] of Object.entries(state)) {
      if (Array.isArray(returns)) {
        this.returnHistory.set(symbol, returns.slice(-RETURN_HISTORY_SIZE));
      }
    }
    console.log(`[9.4][COV] Imported state for ${Object.keys(state).length} symbols`);
  }
}

export const covarianceEngine = new CovarianceMatrixEngine();

export function calculateReturns(prices: number[]): number[] {
  return covarianceEngine.calculateReturns(prices);
}

export function computeCovarianceMatrix(returns: Record<string, number[]>): Record<string, Record<string, number>> {
  const symbols = Object.keys(returns);
  if (symbols.length < 2) return {};

  const minLength = Math.min(...symbols.map(s => returns[s].length));
  if (minLength < 2) return {};

  const mean: Record<string, number> = {};
  symbols.forEach(s => {
    const trimmed = returns[s].slice(-minLength);
    mean[s] = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  });

  const cov: Record<string, Record<string, number>> = {};
  symbols.forEach(i => {
    cov[i] = {};
    const ri = returns[i].slice(-minLength);
    symbols.forEach(j => {
      const rj = returns[j].slice(-minLength);
      let sum = 0;
      for (let k = 0; k < minLength; k++) {
        sum += (ri[k] - mean[i]) * (rj[k] - mean[j]);
      }
      const covValue = sum / (minLength - 1);
      cov[i][j] = isFinite(covValue) ? covValue : 0;
    });
  });

  return cov;
}

export function computeCorrelationMatrix(cov: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  const symbols = Object.keys(cov);
  if (symbols.length === 0) return {};

  const corr: Record<string, Record<string, number>> = {};
  symbols.forEach(i => {
    corr[i] = {};
    const sigma_i = Math.sqrt(Math.max(cov[i]?.[i] || 0, 0));
    symbols.forEach(j => {
      const sigma_j = Math.sqrt(Math.max(cov[j]?.[j] || 0, 0));
      if (sigma_i === 0 || sigma_j === 0) {
        corr[i][j] = i === j ? 1 : 0;
      } else {
        const rho = (cov[i]?.[j] || 0) / (sigma_i * sigma_j);
        corr[i][j] = Math.max(-1, Math.min(1, isFinite(rho) ? rho : 0));
      }
    });
  });

  return corr;
}
