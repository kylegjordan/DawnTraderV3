/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H.6A Task 3 — IMF (Institutional Math Filters) Metrics
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Computes LQ (Log-Liquidity), VolNoise, and Correlation from OHLC data.
 * During passive learning, uses cached historical data instead of live feeds.
 * 
 * Thresholds:
 * - LQ_MIN: Minimum log-liquidity score (default 40)
 * - VN_MAX: Maximum volatility noise (default 0.80)
 * - CORR_MAX: Maximum correlation with benchmark (default 0.95)
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData } from '../../types/market-regime.types';

export interface IMFMetrics {
  LQ: number;
  VolNoise: number;
  Correlation: number;
  passesMetricFilter: boolean;
}

const LQ_MIN = 40;
const VN_MAX = 0.80;
const CORR_MAX = 0.95;

const ohlcCache = new Map<string, { data: OHLCData[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function cacheOHLCData(symbol: string, data: OHLCData[]): void {
  ohlcCache.set(symbol, { data, timestamp: Date.now() });
}

export function getCachedOHLCData(symbol: string): OHLCData[] | null {
  const cached = ohlcCache.get(symbol);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    ohlcCache.delete(symbol);
    return null;
  }
  return cached.data;
}

export function clearOHLCCache(): void {
  ohlcCache.clear();
}

export function calculateLogLiquidity(ohlcData: OHLCData[]): number {
  if (ohlcData.length < 5) return 0;
  
  let totalVolume = 0;
  let totalPriceVolume = 0;
  
  for (const candle of ohlcData) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume || 0;
    totalVolume += volume;
    totalPriceVolume += typicalPrice * volume;
  }
  
  if (totalVolume === 0) return 0;
  
  const avgVolumeUSD = totalPriceVolume / ohlcData.length;
  
  if (avgVolumeUSD <= 0) return 0;
  const rawLQ = Math.log10(avgVolumeUSD + 1) * 10;
  
  return Math.min(100, Math.max(0, rawLQ));
}

export function calculateVolNoise(ohlcData: OHLCData[]): number {
  if (ohlcData.length < 10) return 1.0;
  
  const returns: number[] = [];
  for (let i = 1; i < ohlcData.length; i++) {
    const prevClose = ohlcData[i - 1].close;
    const currClose = ohlcData[i].close;
    if (prevClose > 0) {
      returns.push((currClose - prevClose) / prevClose);
    }
  }
  
  if (returns.length < 5) return 1.0;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  const absReturns = returns.map(r => Math.abs(r));
  const meanAbsReturn = absReturns.reduce((a, b) => a + b, 0) / absReturns.length;
  
  if (meanAbsReturn === 0) return 0;
  
  const noiseRatio = stdDev / (meanAbsReturn + 0.0001);
  
  return Math.min(1.0, Math.max(0, noiseRatio));
}

export function calculateCorrelation(ohlcData: OHLCData[], benchmarkData?: OHLCData[]): number {
  if (!benchmarkData || benchmarkData.length < 10 || ohlcData.length < 10) {
    return 0.5;
  }
  
  const minLen = Math.min(ohlcData.length, benchmarkData.length);
  const pairReturns: number[] = [];
  const benchReturns: number[] = [];
  
  for (let i = 1; i < minLen; i++) {
    const pairPrev = ohlcData[i - 1].close;
    const pairCurr = ohlcData[i].close;
    const benchPrev = benchmarkData[i - 1].close;
    const benchCurr = benchmarkData[i].close;
    
    if (pairPrev > 0 && benchPrev > 0) {
      pairReturns.push((pairCurr - pairPrev) / pairPrev);
      benchReturns.push((benchCurr - benchPrev) / benchPrev);
    }
  }
  
  if (pairReturns.length < 5) return 0.5;
  
  const n = pairReturns.length;
  const meanPair = pairReturns.reduce((a, b) => a + b, 0) / n;
  const meanBench = benchReturns.reduce((a, b) => a + b, 0) / n;
  
  let covariance = 0;
  let varPair = 0;
  let varBench = 0;
  
  for (let i = 0; i < n; i++) {
    const diffPair = pairReturns[i] - meanPair;
    const diffBench = benchReturns[i] - meanBench;
    covariance += diffPair * diffBench;
    varPair += diffPair * diffPair;
    varBench += diffBench * diffBench;
  }
  
  const denominator = Math.sqrt(varPair * varBench);
  if (denominator === 0) return 0;
  
  return Math.abs(covariance / denominator);
}

export async function calculateIMFMetrics(
  symbol: string,
  ohlcData: OHLCData[] | null,
  isPassive: boolean,
  benchmarkOHLC?: OHLCData[]
): Promise<IMFMetrics> {
  let data = ohlcData;
  
  if (isPassive && (!data || data.length === 0)) {
    data = getCachedOHLCData(symbol);
  }
  
  if (!data || data.length < 10) {
    console.log(`[11.4H.6A][IMF] ${symbol}: Insufficient data (${data?.length || 0} candles) - using defaults`);
    return { LQ: 0, VolNoise: 1.0, Correlation: 1.0, passesMetricFilter: false };
  }
  
  if (!isPassive && data.length >= 10) {
    cacheOHLCData(symbol, data);
  }
  
  const LQ = calculateLogLiquidity(data);
  const VolNoise = calculateVolNoise(data);
  const Correlation = calculateCorrelation(data, benchmarkOHLC);
  const passesMetricFilter = LQ >= LQ_MIN && VolNoise <= VN_MAX && Correlation <= CORR_MAX;
  
  return { LQ, VolNoise, Correlation, passesMetricFilter };
}

export function getIMFThresholds(): { LQ_MIN: number; VN_MAX: number; CORR_MAX: number } {
  return { LQ_MIN, VN_MAX, CORR_MAX };
}
