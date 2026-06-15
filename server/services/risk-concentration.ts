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

type RcMode = 'live' | 'paper';

class RiskConcentrationAnalyzer {
  private _configOverride: Partial<RiskConcentrationConfig> = {};
  // P19-B4b D5 (S4 isolation): position weights + concentration scores are now keyed BY MODE.
  // Pre-fix these were single symbol-keyed Maps shared by paper + live — trade-safety writes
  // mode-scoped weights (built from getActivePositions(mode)) into them, so a paper write and a
  // live write CLOBBERED each other when co-running. Now each mode has its own inner map.
  private positionWeightsByMode: Map<RcMode, Map<string, number>> = new Map();
  private concentrationScoresByMode: Map<RcMode, Map<string, ConcentrationScore>> = new Map();
  private lastUpdateTime: Date | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  private _weights(mode: RcMode): Map<string, number> {
    let m = this.positionWeightsByMode.get(mode);
    if (!m) { m = new Map(); this.positionWeightsByMode.set(mode, m); }
    return m;
  }
  private _scores(mode: RcMode): Map<string, ConcentrationScore> {
    let m = this.concentrationScoresByMode.get(mode);
    if (!m) { m = new Map(); this.concentrationScoresByMode.set(mode, m); }
    return m;
  }

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
  updatePositionWeights(mode: RcMode, weights: Record<string, number>): void {
    const w = this._weights(mode);
    w.clear();
    for (const [symbol, weight] of Object.entries(weights)) {
      if (weight > 0) {
        w.set(symbol, weight);
      }
    }
    console.log(`[9.4][RISK] Updated position weights for ${w.size} symbols (mode=${mode})`);
  }

  /**
   * Calculate concentration score for a symbol
   * C_i = Σ|ρ_ij| × w_j
   */
  calculateConcentrationScore(
    mode: RcMode,
    symbol: string,
    correlationMatrix: CorrelationMatrix
  ): ConcentrationScore {
    const { matrix, symbols } = correlationMatrix;
    const weights = this._weights(mode);
    
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
      const weight = weights.get(other) || 0;

      concentrationScore += absCorrelation * weight;

      if (absCorrelation >= this.config.correlationThreshold) {
        correlatedAssets.push({ symbol: other, correlation });
      }
    }

    const ownWeight = weights.get(symbol) || 0;
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
  recalculateScores(mode: RcMode): void {
    const correlationMatrix = covarianceEngine.getCorrelationMatrix();
    if (!correlationMatrix) {
      console.log(`[9.4][RISK] No correlation matrix available, skipping score calculation`);
      return;
    }

    const scores = this._scores(mode);
    scores.clear();
    const { symbols } = correlationMatrix;

    for (const symbol of symbols) {
      const score = this.calculateConcentrationScore(mode, symbol, correlationMatrix);
      scores.set(symbol, score);
    }

    this.lastUpdateTime = new Date();
    const overexposed = Array.from(scores.values()).filter(s => s.isOverexposed);
    console.log(`[9.4][RISK] Recalculated scores for ${symbols.length} symbols, ${overexposed.length} overexposed (mode=${mode})`);
  }

  /**
   * Get scaling factor for a symbol (used by SizingHelper)
   */
  getScalingFactor(mode: RcMode, symbol: string): number {
    const scores = this._scores(mode);
    const score = scores.get(symbol);
    if (!score) {
      const correlationMatrix = covarianceEngine.getCorrelationMatrix();
      if (correlationMatrix && correlationMatrix.matrix[symbol]) {
        const calculated = this.calculateConcentrationScore(mode, symbol, correlationMatrix);
        scores.set(symbol, calculated);
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
  isCorrelatedExposure(mode: RcMode, symbol: string): boolean {
    const correlationMatrix = covarianceEngine.getCorrelationMatrix();
    if (!correlationMatrix) return false;

    const { matrix } = correlationMatrix;
    if (!matrix[symbol]) return false;

    for (const [existingSymbol, weight] of this._weights(mode).entries()) {
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
  getConcentrationScore(mode: RcMode, symbol: string): ConcentrationScore | null {
    return this._scores(mode).get(symbol) || null;
  }

  /**
   * Get all concentration scores
   */
  getAllScores(mode: RcMode): ConcentrationScore[] {
    return Array.from(this._scores(mode).values());
  }

  /**
   * Calculate overall portfolio exposure metrics
   */
  getPortfolioExposure(mode: RcMode): PortfolioExposure {
    const correlationMatrix = covarianceEngine.getCorrelationMatrix();
    let totalExposure = 0;
    let correlatedExposure = 0;
    const overexposedSymbols: string[] = [];
    const weights = this._weights(mode);
    const scores = this._scores(mode);

    for (const [symbol, weight] of weights.entries()) {
      totalExposure += weight;

      if (correlationMatrix && correlationMatrix.matrix[symbol]) {
        for (const [other, otherWeight] of weights.entries()) {
          if (other === symbol) continue;
          const correlation = correlationMatrix.matrix[symbol][other] ?? 0;
          if (Math.abs(correlation) >= this.config.correlationThreshold) {
            correlatedExposure += weight * otherWeight * Math.abs(correlation);
          }
        }
      }

      const score = scores.get(symbol);
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
      // P19-B4b D5: this periodic market-data path is dormant (no external caller of
      // startPeriodicUpdates/updateFromMarketData); recalc the paper mode by default.
      this.recalculateScores('paper');
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
  getDiagnostics(mode: RcMode = 'paper'): {
    positionCount: number;
    scoreCount: number;
    overexposedCount: number;
    lastUpdateTime: Date | null;
    config: RiskConcentrationConfig;
  } {
    const weights = this._weights(mode);
    const scores = this._scores(mode);
    const overexposed = Array.from(scores.values()).filter(s => s.isOverexposed);
    return {
      positionCount: weights.size,
      scoreCount: scores.size,
      overexposedCount: overexposed.length,
      lastUpdateTime: this.lastUpdateTime,
      config: this.config
    };
  }

  /**
   * Reset analyzer state. P19-B4b D5: pass a mode to reset only that mode; omit to reset all.
   */
  reset(mode?: RcMode): void {
    this.stopPeriodicUpdates();
    if (mode) {
      this._weights(mode).clear();
      this._scores(mode).clear();
    } else {
      this.positionWeightsByMode.clear();
      this.concentrationScoresByMode.clear();
    }
    this.lastUpdateTime = null;
    console.log(`[9.4][RISK] Analyzer reset${mode ? ` (mode=${mode})` : ' (all modes)'}`);
  }
}

export const riskConcentrationAnalyzer = new RiskConcentrationAnalyzer();

export function getScalingFactor(mode: RcMode, symbol: string): number {
  return riskConcentrationAnalyzer.getScalingFactor(mode, symbol);
}

export function isCorrelatedExposure(mode: RcMode, symbol: string): boolean {
  return riskConcentrationAnalyzer.isCorrelatedExposure(mode, symbol);
}
