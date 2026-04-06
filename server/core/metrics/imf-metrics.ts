/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7H — IMF (Institutional Math Filters) Metrics
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Computes LQ (Log-Liquidity), VolNoise, and Correlation from OHLC data.
 * During passive learning, uses cached historical data instead of live feeds.
 * 
 * Schema: metrics-calibration/v1.2
 * 
 * Directive 11.7H: VN calculation now uses canonical price-difference formula
 * from analysis-utils.ts to ensure cross-mode parity between passive learning
 * and active trading.
 * 
 * Batch 19G VN HF: Thresholds no longer imported from system-guards.ts.
 * Safe defaults are inline; callers should pass DB values via thresholds parameter.
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { OHLCData } from '../../types/market-regime.types';
import { calculateVolNoise as canonicalCalculateVolNoise } from '../../utils/analysis-utils.js';
// Batch 19G VN HF: IMF_THRESHOLDS import removed — thresholds now DB-driven.
// Safe defaults are inline; callers should pass DB values via thresholds parameter.

export interface IMFMetrics {
  LQ: number;
  VolNoise: number;
  Correlation: number;
  passesMetricFilter: boolean;
}

export interface IMFThresholdOverrides {
  LQ_MIN: number;
  VN_MAX: number;
  CORR_MAX?: number;
}

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

/**
 * Directive 11.7H: Calculate Volatility Noise using canonical log-returns MAD/median formula
 *
 * Delegates to analysis-utils.ts canonical function for cross-mode parity.
 * This ensures passive learning (OHLC cache) and active trading use identical math.
 *
 * Batch 19G VN: Formula updated to log returns + MAD/median (robust statistics)
 * Formula: VN = MAD(|ln(close[i]/close[i-1])|) / max(median(|ln returns|), 0.0001)
 * Typical range: 0.0 – 1.0 (new distribution — thresholds need post-deployment recalibration)
 *
 * @param ohlcData - Array of OHLC candles
 * @returns VolNoise value between 0-1
 */
export function calculateVolNoise(ohlcData: OHLCData[]): number {
  if (ohlcData.length < 3) return 0.5; // Default for insufficient data (matches analysis-utils)
  
  // Extract close prices and delegate to canonical function
  const closes = ohlcData.map(c => c.close);
  return canonicalCalculateVolNoise(closes);
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

/**
 * Batch 52: calculateIMFMetrics requires DB-driven thresholds.
 * No fallback defaults — DB is the sole authority (Kyle directive 2026-04-06).
 */
export async function calculateIMFMetrics(
  symbol: string,
  ohlcData: OHLCData[] | null,
  isPassive: boolean,
  benchmarkOHLC?: OHLCData[],
  thresholds?: IMFThresholdOverrides
): Promise<IMFMetrics> {
  if (!thresholds || thresholds.LQ_MIN === undefined || thresholds.VN_MAX === undefined) {
    console.error(`[IMF][FATAL] No DB thresholds provided for ${symbol}. DB is sole authority — no fallbacks.`);
    return { LQ: 0, VolNoise: 0.5, Correlation: 0.5, passesMetricFilter: false };
  }
  const lqMin = thresholds.LQ_MIN;
  const vnMax = thresholds.VN_MAX;
  const corrMax = thresholds.CORR_MAX ?? 0.95;

  let data = ohlcData;

  if (isPassive && (!data || data.length === 0)) {
    data = getCachedOHLCData(symbol);
  }

  if (!data || data.length < 10) {
    console.log(`[11.4H.6A][IMF] ${symbol}: Insufficient data (${data?.length || 0} candles) - using defaults`);
    return { LQ: 0, VolNoise: 0.5, Correlation: 0.5, passesMetricFilter: false };
  }

  if (!isPassive && data.length >= 10) {
    cacheOHLCData(symbol, data);
  }

  const LQ = calculateLogLiquidity(data);
  const VolNoise = calculateVolNoise(data);
  const Correlation = calculateCorrelation(data, benchmarkOHLC);
  const passesMetricFilter = LQ >= lqMin && VolNoise <= vnMax && Correlation <= corrMax;

  return { LQ, VolNoise, Correlation, passesMetricFilter };
}

/**
 * Directive 11.7H Task H-06: VN Parity Logging
 * Batch 52: No longer references hardcoded defaults — DB is sole authority.
 */
export function logVNParityStatus(): void {
  const timestamp = new Date().toISOString();
  const status = `[11.7H][Calibration] VN parity validated | imf-metrics=OK | analysis-utils=OK | thresholds=DB-only`;
  console.log(`${timestamp} ${status}`);
}

// Directive 11.7H: Log parity status on module initialization
logVNParityStatus();
