/**
 * Directive 9.5.A — CWQI v4 Service (Net Expectancy)
 * 
 * Implements the two-stage trade evaluation system:
 * 1. The Gate (Pass/Fail): Net Expectancy (EV) check - reject trades where EV ≤ 0
 * 2. The Score (Ranking): CWQI quality score for ranking tradeable candidates
 * 
 * Mathematical Foundation:
 * - EV = (Pwin × DistTarget) - (Ploss × DistStop) - CostTotal
 * - Pwin = 0.40 + (DI / 200), capped at 0.60
 * - CostTotal = 0.5% of price (0.4% fees + 0.1% slippage)
 * - Score = (Reward/Risk) × DI × (1 - VolNoise) × (1 - ρ̄)
 * 
 * Tags: [9.5][CWQI]
 */

import { calculateDirectionalIntegrity, calculateVolNoise } from '../utils/analysis-utils.js';
import { getKrakenRestPair } from '../markets/kraken-symbol-resolver.js';
import { covarianceEngine } from '../utils/covariance-engine.js';
import { SYSTEM_GUARDS } from '../config/system-guards.js';

export interface TradeMeta {
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  DI?: number;
  VolNoise?: number;
  prices?: number[];
}

export interface CWQIResult {
  isTradeable: boolean;
  ev: number;
  score: number;
  rejectionReason?: string;
  pWin: number;
  pLoss: number;
  costTotal: number;
  meanCorrelation: number;
}

const COST_PERCENT = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE;
const MIN_PWIN = SYSTEM_GUARDS.MIN_PWIN;
const MAX_PWIN = SYSTEM_GUARDS.MAX_PWIN;
const DI_PWIN_FACTOR = SYSTEM_GUARDS.DI_PWIN_FACTOR;

class CWQIService {
  
  /**
   * Calculate win probability based on Directional Integrity
   * Pwin = 0.40 + (DI / 200), capped at 0.60
   */
  private calculateWinProbability(DI: number): number {
    const pWin = MIN_PWIN + (DI / DI_PWIN_FACTOR);
    return Math.min(MAX_PWIN, Math.max(MIN_PWIN, pWin));
  }

  /**
   * Get mean correlation for a symbol from the covariance engine
   * Returns average absolute correlation with all other tracked symbols
   */
  private getMeanCorrelation(symbol: string): number {
    try {
      const correlationMatrix = covarianceEngine.getCorrelationMatrix();
      if (!correlationMatrix || !correlationMatrix.matrix[symbol]) {
        return 0;
      }
      
      const symbolCorrelations = correlationMatrix.matrix[symbol];
      const otherSymbols = Object.keys(symbolCorrelations).filter(s => s !== symbol);
      
      if (otherSymbols.length === 0) {
        return 0;
      }
      
      const totalAbsCorr = otherSymbols.reduce((sum, s) => {
        return sum + Math.abs(symbolCorrelations[s] || 0);
      }, 0);
      
      return totalAbsCorr / otherSymbols.length;
    } catch (err) {
      console.warn(`[9.5][CWQI] Failed to get mean correlation for ${symbol}:`, err);
      return 0;
    }
  }

  /**
   * Calculate Net Expectancy (EV) - The Gate
   * EV = (Pwin × DistTarget) - (Ploss × DistStop) - CostTotal
   * 
   * @param tradeMeta - Trade metadata including entry, target, stop prices
   * @returns EV value (positive = profitable, negative = unprofitable)
   */
  calculateExpectancy(tradeMeta: TradeMeta): { 
    ev: number; 
    pWin: number; 
    pLoss: number; 
    costTotal: number;
    distTarget: number;
    distStop: number;
  } {
    const { entryPrice, targetPrice, stopPrice, DI = 50 } = tradeMeta;
    
    const distTarget = Math.abs(targetPrice - entryPrice);
    const distStop = Math.abs(entryPrice - stopPrice);
    
    const pWin = this.calculateWinProbability(DI);
    const pLoss = 1 - pWin;
    
    const costTotal = entryPrice * COST_PERCENT;
    
    const ev = (pWin * distTarget) - (pLoss * distStop) - costTotal;
    
    return { ev, pWin, pLoss, costTotal, distTarget, distStop };
  }

  /**
   * Calculate CWQI Quality Score - The Rank
   * Score = (Reward/Risk) × DI × (1 - VolNoise) × (1 - ρ̄)
   * 
   * @param tradeMeta - Trade metadata
   * @param symbol - Trading symbol for correlation lookup
   * @returns Score between 0-100
   */
  calculateQualityScore(tradeMeta: TradeMeta, symbol: string): { score: number; meanCorrelation: number } {
    const { entryPrice, targetPrice, stopPrice, DI = 50, VolNoise = 0.3 } = tradeMeta;
    
    const reward = Math.abs(targetPrice - entryPrice);
    const risk = Math.abs(entryPrice - stopPrice);
    const rewardRiskRatio = risk > 0 ? reward / risk : 0;
    
    const diNormalized = DI / 100;
    
    const volNoiseFactor = 1 - Math.min(1, Math.max(0, VolNoise));
    
    const meanCorrelation = this.getMeanCorrelation(symbol);
    const correlationFactor = 1 - Math.min(1, Math.max(0, meanCorrelation));
    
    const rawScore = rewardRiskRatio * diNormalized * volNoiseFactor * correlationFactor * 100;
    
    const score = Math.min(100, Math.max(0, rawScore));
    
    return { score, meanCorrelation };
  }

  /**
   * Main entry point: Calculate trade expectancy and score
   * Implements both The Gate (EV check) and The Score (ranking)
   * 
   * @param symbol - Trading pair symbol (internal format)
   * @param tradeMeta - Trade metadata
   * @returns CWQIResult with isTradeable, ev, score, and optional rejection reason
   */
  calculateTradeExpectancy(symbol: string, tradeMeta: TradeMeta): CWQIResult {
    const krakenPair = getKrakenRestPair(symbol);
    
    let DI = tradeMeta.DI;
    let VolNoise = tradeMeta.VolNoise;
    
    if (tradeMeta.prices && tradeMeta.prices.length >= 3) {
      if (DI === undefined) {
        DI = calculateDirectionalIntegrity(tradeMeta.prices);
      }
      if (VolNoise === undefined) {
        VolNoise = calculateVolNoise(tradeMeta.prices);
      }
    }
    
    DI = DI ?? 50;
    VolNoise = VolNoise ?? 0.3;
    
    const enrichedMeta = { ...tradeMeta, DI, VolNoise };
    
    const { ev, pWin, pLoss, costTotal } = this.calculateExpectancy(enrichedMeta);
    
    const { score, meanCorrelation } = this.calculateQualityScore(enrichedMeta, symbol);
    
    const isTradeable = ev > 0;
    const rejectionReason = !isTradeable 
      ? `EV=${ev.toFixed(6)} (negative expectancy after fees)` 
      : undefined;
    
    const result: CWQIResult = {
      isTradeable,
      ev,
      score,
      pWin,
      pLoss,
      costTotal,
      meanCorrelation,
      rejectionReason
    };
    
    console.log(`[9.5][CWQI] symbol=${symbol} EV=${ev.toFixed(6)} Score=${score.toFixed(1)} pWin=${pWin.toFixed(2)} DI=${DI.toFixed(1)} VolNoise=${VolNoise.toFixed(3)} ρ̄=${meanCorrelation.toFixed(3)} tradeable=${isTradeable}`);
    
    return result;
  }

  /**
   * Batch evaluate multiple trade candidates
   * Returns only tradeable candidates, ranked by CWQI score
   */
  evaluateCandidates(candidates: Array<{ symbol: string; tradeMeta: TradeMeta }>): Array<{ symbol: string; result: CWQIResult }> {
    const evaluated = candidates.map(({ symbol, tradeMeta }) => ({
      symbol,
      result: this.calculateTradeExpectancy(symbol, tradeMeta)
    }));
    
    const tradeable = evaluated.filter(c => c.result.isTradeable);
    
    tradeable.sort((a, b) => b.result.score - a.result.score);
    
    return tradeable;
  }

  /**
   * Get the current CWQI configuration
   */
  getConfig(): { costPercent: number; minPwin: number; maxPwin: number; diPwinFactor: number } {
    return {
      costPercent: COST_PERCENT,
      minPwin: MIN_PWIN,
      maxPwin: MAX_PWIN,
      diPwinFactor: DI_PWIN_FACTOR
    };
  }
}

export const cwqiService = new CWQIService();

export function calculateTradeExpectancy(symbol: string, tradeMeta: TradeMeta): CWQIResult {
  return cwqiService.calculateTradeExpectancy(symbol, tradeMeta);
}

export function evaluateCandidates(candidates: Array<{ symbol: string; tradeMeta: TradeMeta }>): Array<{ symbol: string; result: CWQIResult }> {
  return cwqiService.evaluateCandidates(candidates);
}
