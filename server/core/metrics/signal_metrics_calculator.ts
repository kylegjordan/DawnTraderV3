/**
 * Directive 8.8.4-A3.R9.2-A: Signal Metrics Calculator with Decay Order Correction
 * 
 * This module ensures decay is applied BEFORE normalization to prevent upward bias
 * in NGC/CWQI values.
 * 
 * Key Change: applyDecay(rawValue) → normalize(decayedValue)
 * Instead of: normalize(rawValue) → applyDecay(normalizedValue)
 */

import { diagnosticTrace } from '../diagnostics/trace_service';

const DECAY_LAMBDA = parseFloat(process.env.CWQI_DECAY_RATE || '0.03');
const CWQI_FLOOR = 0.05;

/**
 * Directive 8.8.4-A3.R9.2-A: Apply decay to raw metric value
 * Decay is applied BEFORE normalization to prevent upward bias
 */
export function applyDecay(rawValue: number, ageMinutes: number): number {
  const decayFactor = Math.exp(-DECAY_LAMBDA * ageMinutes);
  return rawValue * decayFactor;
}

/**
 * Directive 8.8.4-A3.R9.2-A: Normalize a value to [0,1] range
 */
export function normalize(value: number, min: number = 0, max: number = 1): number {
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Directive 8.8.4-A3.R9.2-A: Calculate decayed and normalized metric
 * 
 * NEW ORDER (per directive):
 * 1. Apply decay to raw value FIRST
 * 2. Then normalize the decayed value
 * 
 * This prevents the upward bias seen in NGC/CWQI clustering at 0.75-0.8
 */
export function calculateDecayedMetric(
  rawValue: number,
  ageMinutes: number,
  symbol: string,
  metricName: string = 'metric'
): { decayed: number; normalized: number } {
  const preDecay = rawValue;
  
  // Step 1: Apply decay to raw value FIRST (R9.2-A)
  const decayed = applyDecay(rawValue, ageMinutes);
  
  // Step 2: THEN normalize the decayed value to [0,1] with floor (R9.2-A)
  // This is the correct order: decay → normalize (not normalize → decay)
  const normalized = normalize(Math.max(CWQI_FLOOR, decayed), 0, 1);
  
  console.log(
    `[A3.R9.2][DECAY_THEN_NORMALIZE] symbol=${symbol} ${metricName}: ` +
    `raw=${preDecay.toFixed(4)} decayed=${decayed.toFixed(4)} normalized=${normalized.toFixed(4)} ageMin=${ageMinutes.toFixed(1)}`
  );
  
  if (diagnosticTrace.isActive()) {
    diagnosticTrace.trace({
      phase: 'preprocessor',
      symbol,
      strategy: metricName,
      ngcRaw: null,
      cwqiRaw: preDecay,
      profit: null,
      risk: null,
      normalized: true,
      passed: null,
      rejected: null,
      inserted: null,
      timestamp: Date.now(),
      extra: {
        decayAppliedBeforeNormalization: true,
        preDecay,
        postDecay: decayed,
        postNormalize: normalized,
        ageMinutes,
        phase: 'R9.2-A'
      }
    });
  }
  
  return { decayed, normalized };
}

/**
 * Directive 8.8.4-A3.R9.2-B: Fetch latest metrics for a signal
 * Returns fresh market data instead of stale cached values
 */
export interface FreshMetrics {
  ngc: number;
  cwqi: number;
  profitRate: number;
  riskScore: number;
  volatility: number;
  refreshed: boolean;
  timestamp: number;
}

export async function fetchFreshMetrics(
  symbol: string,
  strategy: string,
  cachedMetrics: { ngc?: number; cwqi?: number; profitRate?: number; riskScore?: number }
): Promise<FreshMetrics> {
  try {
    const { calculateCWQI, calculateNGC, calculateRiskScore, estimateVolatility } = await import('./quality_index');
    
    // A4.R10R: Use unified price cache for RTB refresh (15s TTL)
    // This reduces API pressure by serving cached prices during signal revalidation
    const { priceCache } = await import('../../services/price-cache');
    const priceData = await priceCache.getPrice(symbol, 'readyToBuy');
    
    if (!priceData || !priceData.price) {
      console.log(`[A3.R9.2][REFRESH_METRICS] symbol=${symbol} no price data, using cached`);
      return {
        ngc: cachedMetrics.ngc ?? 0.5,
        cwqi: cachedMetrics.cwqi ?? 0.5,
        profitRate: cachedMetrics.profitRate ?? 0.15,
        riskScore: cachedMetrics.riskScore ?? 0.3,
        volatility: 0.3,
        refreshed: false,
        timestamp: Date.now()
      };
    }
    
    const volatility = estimateVolatility(
      (priceData as any).high24h,
      (priceData as any).low24h,
      priceData.price
    );
    
    const riskScore = cachedMetrics.riskScore ?? 0.3;
    const confidence = cachedMetrics.ngc ?? 0.6;
    
    const ngc = calculateNGC(confidence, volatility, riskScore, false);
    
    const cwqiResult = calculateCWQI({
      confidence,
      riskScore,
      expectedReturn: cachedMetrics.profitRate ?? 0.3,
      volatility
    });
    
    console.log(`[A3.R9.2][REFRESH_METRICS] symbol=${symbol} refreshedMetricsFetched=true NGC=${ngc.toFixed(4)} CWQI=${cwqiResult.cwqi.toFixed(4)}`);
    
    return {
      ngc,
      cwqi: cwqiResult.cwqi,
      profitRate: cwqiResult.components.profitRate,
      riskScore,
      volatility,
      refreshed: true,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error(`[A3.R9.2][REFRESH_METRICS] Error fetching metrics for ${symbol}:`, error);
    return {
      ngc: cachedMetrics.ngc ?? 0.5,
      cwqi: cachedMetrics.cwqi ?? 0.5,
      profitRate: cachedMetrics.profitRate ?? 0.15,
      riskScore: cachedMetrics.riskScore ?? 0.3,
      volatility: 0.3,
      refreshed: false,
      timestamp: Date.now()
    };
  }
}
