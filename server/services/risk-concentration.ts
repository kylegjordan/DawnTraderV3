/**
 * Directive 9.4 — Risk Concentration Analyzer
 * 
 * Evaluates total correlation-weighted exposure and calculates scaling factors
 * to prevent portfolio concentration in highly correlated assets.
 * 
 * Concentration Rule:
 * - Threshold: ρ_th = 0.75
 * - C_i = Σ|ρ_ij| × w_j (sum of absolute correlations weighted by position weights)
 * - If C_i > C_max (default = 2.5), apply scaling:
 *   ScalingFactor_i = min(1, C_max / C_i)
 * 
 * Tags: [9.4][RISK], [9.4][CONCENTRATION]
 */

import { covarianceEngine, CorrelationMatrix } from '../utils/covariance-engine.js';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import { getCachedNumberRequired } from './module-constants-service.js';
// B72.1 (2026-05-05): Directive 9.4 covariance guards now read from
// module='concentration_risk' (correlation_threshold, max_concentration_score,
// min_scaling_factor). Singleton-init refactored to lazy `get config()` so the
// values resolve from the warm cache after b72-warmup runs. updateIntervalMs
// stays hardcoded (KEEP — pure-infra poll cadence).

const _CONCENTRATION_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };

const krakenService = new KrakenService();

export interface ConcentrationScore {
  symbol: string;
  score: number;
  scalingFactor: number;
  isOverexposed: boolean;
  correlatedAssets: { symbol: string; correlation: number }[];
}

export interface RiskConcentrationConfig {
  correlationThreshold: number;
  maxConcentration: number;
  minScalingFactor: number;
  updateIntervalMs: number;
}

export interface PortfolioExposure {
  totalExposure: number;
  correlatedExposure: number;
  diversificationScore: number;
  overexposedSymbols: string[];
}

// updateIntervalMs is KEEP (pure-infra poll cadence). Other 3 fields PROMOTE
// resolve from module_constants on every read.
const _UPDATE_INTERVAL_MS = 60000;

class RiskConcentrationAnalyzer {
  private _configOverride: Partial<RiskConcentrationConfig> = {};
  private positionWeights: Map<string, number> = new Map();
  private concentrationScores: Map<string, ConcentrationScore> = new Map();
  private lastUpdateTime: Date | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RiskConcentrationConfig> = {}) {
    this._configOverride = config;
  }

  private get config(): RiskConcentrationConfig {
    return {
      correlationThreshold: this._configOverride.correlationThreshold
        ?? getCachedNumberRequired('concentration_risk', 'correlation_threshold', _CONCENTRATION_KEY),
      maxConcentration: this._configOverride.maxConcentration
        ?? getCachedNumberRequired('concentration_risk', 'max_concentration_score', _CONCENTRATION_KEY),
      minScalingFactor: this._configOverride.minScalingFactor
        ?? getCachedNumberRequired('concentration_risk', 'min_scaling_factor', _CONCENTRATION_KEY),
      updateIntervalMs: this._configOverride.updateIntervalMs ?? _UPDATE_INTERVAL_MS,
    };
  }

  /**
   * Update position weights from current portfolio
   */
  updatePositionWeights(weights: Record<string, number>): void {
    this.positionWeights.clear();
    for (const [symbol, weight] of Object.entries(weights)) {
      if (weight > 0) {
        this.positionWeights.set(symbol, weight);
      }
    }
    console.log(`[9.4][RISK] Updated position weights for ${this.positionWeights.size} symbols`);
  }

  /**
   * Calculate concentration score for a symbol
   * C_i = Σ|ρ_ij| × w_j
   */
  calculateConcentrationScore(
    symbol: string,
    correlationMatrix: CorrelationMatrix
  ): ConcentrationScore {
    const { matrix, symbols } = correlationMatrix;
    
    if (!matrix[symbol]) {
      return {
        symbol,
        score: 0,
        scalingFactor: 1,
        isOverexposed: false,
        correlatedAssets: []
      };
    }

    let concentrationScore = 0;
    const correlatedAssets: { symbol: string; correlation: number }[] = [];

    for (const other of symbols) {
      if (other === symbol) continue;
      
      const correlation = matrix[symbol][other] ?? 0;
      const absCorrelation = Math.abs(correlation);
      const weight = this.positionWeights.get(other) || 0;

      concentrationScore += absCorrelation * weight;

      if (absCorrelation >= this.config.correlationThreshold) {
        correlatedAssets.push({ symbol: other, correlation });
      }
    }

    const ownWeight = this.positionWeights.get(symbol) || 0;
    concentrationScore += ownWeight;

    const isOverexposed = concentrationScore > this.config.maxConcentration;
    let scalingFactor = 1;

    if (isOverexposed) {
      scalingFactor = Math.max(
        this.config.minScalingFactor,
        this.config.maxConcentration / concentrationScore
      );
      console.warn(`[9.4][RISK] ${symbol} overexposed: score=${concentrationScore.toFixed(2)} limit=${this.config.maxConcentration} scale=${scalingFactor.toFixed(2)}`);
    }

    return {
      symbol,
      score: concentrationScore,
      scalingFactor,
      isOverexposed,
      correlatedAssets: correlatedAssets.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
    };
  }

  /**
   * Recalculate all concentration scores
   */
  recalculateScores(): void {
    const correlationMatrix = covarianceEngine.getCorrelationMatrix();
    if (!correlationMatrix) {
      console.log(`[9.4][RISK] No correlation matrix available, skipping score calculation`);
      return;
    }

    this.concentrationScores.clear();
    const { symbols } = correlationMatrix;

    for (const symbol of symbols) {
      const score = this.calculateConcentrationScore(symbol, correlationMatrix);
      this.concentrationScores.set(symbol, score);
    }

    this.lastUpdateTime = new Date();
    const overexposed = Array.from(this.concentrationScores.values()).filter(s => s.isOverexposed);
    console.log(`[9.4][RISK] Recalculated scores for ${symbols.length} symbols, ${overexposed.length} overexposed`);
  }

  /**
   * Get scaling factor for a symbol (used by SizingHelper)
   */
  getScalingFactor(symbol: string): number {
    const score = this.concentrationScores.get(symbol);
    if (!score) {
      const correlationMatrix = covarianceEngine.getCorrelationMatrix();
      if (correlationMatrix && correlationMatrix.matrix[symbol]) {
        const calculated = this.calculateConcentrationScore(symbol, correlationMatrix);
        this.concentrationScores.set(symbol, calculated);
        return calculated.scalingFactor;
      }
      return 1;
    }
    return score.scalingFactor;
  }

  /**
   * Check if adding a position would create correlated exposure
   * Returns true if correlation with existing positions exceeds threshold
   */
  isCorrelatedExposure(symbol: string): boolean {
    const correlationMatrix = covarianceEngine.getCorrelationMatrix();
    if (!correlationMatrix) return false;

    const { matrix } = correlationMatrix;
    if (!matrix[symbol]) return false;

    for (const [existingSymbol, weight] of this.positionWeights.entries()) {
      if (weight <= 0 || existingSymbol === symbol) continue;
      
      const correlation = matrix[symbol]?.[existingSymbol];
      if (correlation !== undefined && Math.abs(correlation) >= this.config.correlationThreshold) {
        console.log(`[9.4][CONCENTRATION] ${symbol} correlated with ${existingSymbol}: ρ=${correlation.toFixed(3)}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get concentration score for a symbol
   */
  getConcentrationScore(symbol: string): ConcentrationScore | null {
    return this.concentrationScores.get(symbol) || null;
  }

  /**
   * Get all concentration scores
   */
  getAllScores(): ConcentrationScore[] {
    return Array.from(this.concentrationScores.values());
  }

  /**
   * Calculate overall portfolio exposure metrics
   */
  getPortfolioExposure(): PortfolioExposure {
    const correlationMatrix = covarianceEngine.getCorrelationMatrix();
    let totalExposure = 0;
    let correlatedExposure = 0;
    const overexposedSymbols: string[] = [];

    for (const [symbol, weight] of this.positionWeights.entries()) {
      totalExposure += weight;

      if (correlationMatrix && correlationMatrix.matrix[symbol]) {
        for (const [other, otherWeight] of this.positionWeights.entries()) {
          if (other === symbol) continue;
          const correlation = correlationMatrix.matrix[symbol][other] ?? 0;
          if (Math.abs(correlation) >= this.config.correlationThreshold) {
            correlatedExposure += weight * otherWeight * Math.abs(correlation);
          }
        }
      }

      const score = this.concentrationScores.get(symbol);
      if (score?.isOverexposed) {
        overexposedSymbols.push(symbol);
      }
    }

    const diversificationScore = totalExposure > 0 
      ? Math.max(0, 1 - correlatedExposure / (totalExposure * totalExposure))
      : 1;

    return {
      totalExposure,
      correlatedExposure,
      diversificationScore,
      overexposedSymbols
    };
  }

  /**
   * Feed price data to the covariance engine
   */
  async updateFromMarketData(symbols: string[]): Promise<void> {
    const startTime = Date.now();
    let updated = 0;

    for (const symbol of symbols) {
      try {
        const ohlcResult = await krakenService.getOHLCData(symbol, 60);
        if (ohlcResult && ohlcResult.ohlc && ohlcResult.ohlc.length > 0) {
          const closes = ohlcResult.ohlc.map((c: { close: string }) => parseFloat(c.close));
          covarianceEngine.updateFromPrices(symbol, closes);
          updated++;
        }
      } catch (error) {
        console.warn(`[9.4][RISK] Failed to fetch OHLC for ${symbol}:`, error);
      }
    }

    if (updated > 0) {
      covarianceEngine.computeCovarianceMatrix();
      covarianceEngine.computeCorrelationMatrix();
      this.recalculateScores();
    }

    console.log(`[9.4][RISK] Market data update: ${updated}/${symbols.length} symbols in ${Date.now() - startTime}ms`);
  }

  /**
   * Start periodic updates
   */
  startPeriodicUpdates(symbols: string[]): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateFromMarketData(symbols).catch(err => {
      console.error(`[9.4][RISK] Initial update failed:`, err);
    });

    this.updateInterval = setInterval(() => {
      this.updateFromMarketData(symbols).catch(err => {
        console.error(`[9.4][RISK] Periodic update failed:`, err);
      });
    }, this.config.updateIntervalMs);

    console.log(`[9.4][RISK] Started periodic updates (interval=${this.config.updateIntervalMs}ms)`);
  }

  /**
   * Stop periodic updates
   */
  stopPeriodicUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log(`[9.4][RISK] Stopped periodic updates`);
    }
  }

  /**
   * Get configuration
   */
  getConfig(): RiskConcentrationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RiskConcentrationConfig>): void {
    this._configOverride = { ...this._configOverride, ...config };
    console.log(`[9.4][RISK] Config override updated:`, this._configOverride);
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics(): {
    positionCount: number;
    scoreCount: number;
    overexposedCount: number;
    lastUpdateTime: Date | null;
    config: RiskConcentrationConfig;
  } {
    const overexposed = Array.from(this.concentrationScores.values()).filter(s => s.isOverexposed);
    return {
      positionCount: this.positionWeights.size,
      scoreCount: this.concentrationScores.size,
      overexposedCount: overexposed.length,
      lastUpdateTime: this.lastUpdateTime,
      config: this.config
    };
  }

  /**
   * Reset analyzer state
   */
  reset(): void {
    this.stopPeriodicUpdates();
    this.positionWeights.clear();
    this.concentrationScores.clear();
    this.lastUpdateTime = null;
    console.log(`[9.4][RISK] Analyzer reset`);
  }
}

export const riskConcentrationAnalyzer = new RiskConcentrationAnalyzer();

export function getScalingFactor(symbol: string): number {
  return riskConcentrationAnalyzer.getScalingFactor(symbol);
}

export function isCorrelatedExposure(symbol: string): boolean {
  return riskConcentrationAnalyzer.isCorrelatedExposure(symbol);
}
