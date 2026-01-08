/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3 — Market Metrics Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides normalized volatility calculations for Dynamic Sizing Engine.
 * 
 * Primary Metric: Normalized ATR(14) / Price
 * - Low volatility: < 0.01 (stable)
 * - Medium volatility: 0.01-0.03 (normal)
 * - High volatility: > 0.03 (volatile)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export interface VolatilityData {
  symbol: string;
  normalizedVol: number;
  atr14: number;
  currentPrice: number;
  timestamp: Date;
}

const volatilityCache: Map<string, VolatilityData> = new Map();
const CACHE_TTL_MS = 60_000;

export function getNormalizedVolatility(symbol: string): number {
  const cached = volatilityCache.get(symbol);
  if (cached && Date.now() - cached.timestamp.getTime() < CACHE_TTL_MS) {
    return cached.normalizedVol;
  }
  return 0.015;
}

export function updateVolatilityData(
  symbol: string, 
  atr14: number, 
  currentPrice: number
): VolatilityData {
  if (currentPrice <= 0) {
    console.warn(`[11.3][MarketMetrics] Invalid price for ${symbol}: ${currentPrice}`);
    return {
      symbol,
      normalizedVol: 0.02,
      atr14,
      currentPrice,
      timestamp: new Date(),
    };
  }

  const normalizedVol = atr14 / currentPrice;
  
  const data: VolatilityData = {
    symbol,
    normalizedVol,
    atr14,
    currentPrice,
    timestamp: new Date(),
  };

  volatilityCache.set(symbol, data);
  console.log(`[11.3][MarketMetrics] ${symbol} volatility=${(normalizedVol * 100).toFixed(2)}% (ATR=${atr14.toFixed(4)}, price=${currentPrice.toFixed(2)})`);
  
  return data;
}

export function getVolatilityCache(): Map<string, VolatilityData> {
  return new Map(volatilityCache);
}

export function clearVolatilityCache(): void {
  volatilityCache.clear();
  console.log('[11.3][MarketMetrics] Volatility cache cleared');
}

export function getVolatilityClassification(normalizedVol: number): 'low' | 'medium' | 'high' {
  if (normalizedVol < 0.01) return 'low';
  if (normalizedVol > 0.03) return 'high';
  return 'medium';
}
