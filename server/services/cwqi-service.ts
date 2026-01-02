/**
 * Directive 9.5.A — CWQI v4 Service (Net Expectancy)
 * Directive 9.9 — Net EV Upgrade with Friction Standardization
 * 
 * Implements the two-stage trade evaluation system:
 * 1. The Gate (Pass/Fail): Net Expectancy (netEV) check - reject trades where netEV ≤ 0
 * 2. The Score (Ranking): CWQI quality score using normalize(netEV / risk)
 * 
 * Mathematical Foundation:
 * - RawEV = (Pwin × DistTarget) - (Ploss × DistStop)
 * - Friction = calculateFriction(entry, exit, qty) via canonical helper
 * - NetEV = RawEV - Friction
 * - Pwin = 0.40 + (DI / 200), capped at 0.60
 * - Score = normalize(netEV / risk) × DI × (1 - VolNoise) × (1 - ρ̄)
 * 
 * Tags: [9.5][CWQI][9.9]
 */

import { calculateDirectionalIntegrity, calculateVolNoise, calculateFriction } from '../utils/analysis-utils.js';
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
  netEV: number;
  rawEV: number;
  friction: number;
  score: number;
  rejectionReason?: string;
  pWin: number;
  pLoss: number;
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
   * Directive 9.9.B: Calculate Net Expectancy (EV) - The Gate
   * 
   * RawEV = (Pwin × DistTarget) - (Ploss × DistStop)
   * Friction = calculateFriction(entry, target, 1) via canonical helper
   * NetEV = RawEV - Friction
   * 
   * @param tradeMeta - Trade metadata including entry, target, stop prices
   * @returns Net EV value (positive = profitable, negative = unprofitable)
   */
  calculateExpectancy(tradeMeta: TradeMeta): { 
    netEV: number;
    rawEV: number;
    friction: number;
    pWin: number; 
    pLoss: number; 
    distTarget: number;
    distStop: number;
  } {
    const { entryPrice, targetPrice, stopPrice, DI = 50 } = tradeMeta;
    
    const distTarget = Math.abs(targetPrice - entryPrice);
    const distStop = Math.abs(entryPrice - stopPrice);
    
    const pWin = this.calculateWinProbability(DI);
    const pLoss = 1 - pWin;
    
    const friction = calculateFriction(entryPrice, targetPrice, 1);
    
    const rawEV = (pWin * distTarget) - (pLoss * distStop);
    const netEV = rawEV - friction;
    
    return { netEV, rawEV, friction, pWin, pLoss, distTarget, distStop };
  }

  /**
   * Directive 9.9.C: Calculate CWQI Quality Score - The Rank
   * 
   * Score = normalize(netEV / risk) × DI × (1 - VolNoise) × (1 - ρ̄)
   * 
   * Key changes in 9.9:
   * - Uses netEV (after friction) instead of raw reward for score calculation
   * - Ensures Gate and Score use identical netEV value
   * - If netEV ≤ 0, score MUST be 0 (enforced constraint)
   * 
   * @param tradeMeta - Trade metadata
   * @param symbol - Trading symbol for correlation lookup
   * @param netEV - Net Expectancy Value (from calculateExpectancy)
   * @returns Score between 0-100
   */
  calculateQualityScore(
    tradeMeta: TradeMeta, 
    symbol: string,
    netEV: number
  ): { score: number; meanCorrelation: number } {
    const { entryPrice, stopPrice, DI = 50, VolNoise = 0.3 } = tradeMeta;
    
    const risk = Math.abs(entryPrice - stopPrice);
    
    if (netEV <= 0 || risk <= 0) {
      const meanCorrelation = this.getMeanCorrelation(symbol);
      return { score: 0, meanCorrelation };
    }
    
    const netEVRiskRatio = netEV / risk;
    
    const diNormalized = DI / 100;
    
    const volNoiseFactor = 1 - Math.min(1, Math.max(0, VolNoise));
    
    const meanCorrelation = this.getMeanCorrelation(symbol);
    const correlationFactor = 1 - Math.min(1, Math.max(0, meanCorrelation));
    
    const rawScore = netEVRiskRatio * diNormalized * volNoiseFactor * correlationFactor * 100;
    
    const score = Math.min(100, Math.max(0, rawScore));
    
    return { score, meanCorrelation };
  }

  /**
   * Directive 9.9: Main entry point - Calculate trade expectancy and score
   * Implements both The Gate (netEV check) and The Score (ranking)
   * 
   * @param symbol - Trading pair symbol (internal format)
   * @param tradeMeta - Trade metadata
   * @param debugMode - Enable diagnostic output (optional, default false)
   * @returns CWQIResult with isTradeable, netEV, score, and optional rejection reason
   */
  calculateTradeExpectancy(symbol: string, tradeMeta: TradeMeta, debugMode: boolean = false): CWQIResult {
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
    
    const { netEV, rawEV, friction, pWin, pLoss } = this.calculateExpectancy(enrichedMeta);
    
    const { score, meanCorrelation } = this.calculateQualityScore(enrichedMeta, symbol, netEV);
    
    const isTradeable = netEV > 0;
    const rejectionReason = !isTradeable 
      ? `NetEV=${netEV.toFixed(6)} (negative expectancy after friction)` 
      : undefined;
    
    const result: CWQIResult = {
      isTradeable,
      ev: netEV,
      netEV,
      rawEV,
      friction,
      score,
      pWin,
      pLoss,
      meanCorrelation,
      rejectionReason
    };
    
    if (debugMode) {
      console.log(`[CWQI] NetEV=${netEV.toFixed(4)}  Friction=${friction.toFixed(4)}  Score=${score.toFixed(2)}`);
    }
    
    console.log(`[9.9][CWQI] symbol=${symbol} NetEV=${netEV.toFixed(6)} RawEV=${rawEV.toFixed(6)} Friction=${friction.toFixed(6)} Score=${score.toFixed(1)} pWin=${pWin.toFixed(2)} DI=${DI.toFixed(1)} VolNoise=${VolNoise.toFixed(3)} ρ̄=${meanCorrelation.toFixed(3)} tradeable=${isTradeable}`);
    
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
