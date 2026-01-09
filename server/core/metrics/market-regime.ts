/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E.1 — Pair-Level Market Regime Calculator
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Calculates market regime for individual trading pairs based on OHLC data.
 * Uses volatility, momentum, and ADX metrics to classify into 5 regime categories.
 * 
 * Schema: v1.6.6
 * Governance: M46 (Pair regime must be calculated each cycle)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData, MarketRegimeType, RegimeCalculationResult } from '../../types/market-regime.types';
import { REGIME_WEIGHTS } from '../../types/market-regime.types';

export function computeVolatility(ohlcData: OHLCData[]): number {
  if (ohlcData.length < 2) return 0;
  
  const returns: number[] = [];
  for (let i = 1; i < ohlcData.length; i++) {
    const prevClose = ohlcData[i - 1].close;
    const currClose = ohlcData[i].close;
    if (prevClose > 0) {
      returns.push((currClose - prevClose) / prevClose);
    }
  }
  
  if (returns.length === 0) return 0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

export function computeMomentum(ohlcData: OHLCData[]): number {
  if (ohlcData.length < 14) return 0;
  
  const recentSlice = ohlcData.slice(-14);
  const startPrice = recentSlice[0].close;
  const endPrice = recentSlice[recentSlice.length - 1].close;
  
  if (startPrice === 0) return 0;
  
  return (endPrice - startPrice) / startPrice;
}

export function computeADX(ohlcData: OHLCData[], period: number = 14): number {
  if (ohlcData.length < period + 1) return 0;
  
  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < ohlcData.length; i++) {
    const curr = ohlcData[i];
    const prev = ohlcData[i - 1];
    
    const highLow = curr.high - curr.low;
    const highClose = Math.abs(curr.high - prev.close);
    const lowClose = Math.abs(curr.low - prev.close);
    
    trueRanges.push(Math.max(highLow, highClose, lowClose));
    
    const upMove = curr.high - prev.high;
    const downMove = prev.low - curr.low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  if (trueRanges.length < period) return 0;
  
  const smoothedTR = trueRanges.slice(-period).reduce((a, b) => a + b, 0);
  const smoothedPlusDM = plusDM.slice(-period).reduce((a, b) => a + b, 0);
  const smoothedMinusDM = minusDM.slice(-period).reduce((a, b) => a + b, 0);
  
  if (smoothedTR === 0) return 0;
  
  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;
  
  const diSum = plusDI + minusDI;
  if (diSum === 0) return 0;
  
  const dx = (Math.abs(plusDI - minusDI) / diSum) * 100;
  
  return dx;
}

export function calculatePairRegime(ohlcData: OHLCData[]): RegimeCalculationResult {
  const vol = computeVolatility(ohlcData);
  const mom = computeMomentum(ohlcData);
  const adx = computeADX(ohlcData);
  
  let regime: MarketRegimeType;
  let confidence: number;
  
  if (vol < 0.015 && Math.abs(mom) < 0.002) {
    regime = 'LOW_VOL_CHOP';
    confidence = 0.75 + (0.015 - vol) * 10;
  } else if (mom > 0.002 && adx > 25) {
    regime = 'BULL_STABLE';
    confidence = 0.70 + Math.min(mom * 10, 0.2) + (adx - 25) * 0.005;
  } else if (mom < -0.002 && adx > 25) {
    regime = 'BEAR_VOLATILE';
    confidence = 0.65 + Math.min(Math.abs(mom) * 8, 0.2);
  } else if (vol > 0.025) {
    regime = 'HIGH_VOL_IMPULSE';
    confidence = 0.60 + (vol - 0.025) * 8;
  } else {
    regime = 'TRANSITION';
    confidence = 0.50;
  }
  
  confidence = Math.min(Math.max(confidence, 0.4), 0.95);
  
  return {
    regime,
    volatility: vol,
    momentum: mom,
    adx,
    confidence
  };
}

export function getRegimeWeight(regime: MarketRegimeType): number {
  return REGIME_WEIGHTS[regime] ?? 0.5;
}

export function isHighConfidenceRegime(result: RegimeCalculationResult): boolean {
  return result.confidence >= 0.70;
}
