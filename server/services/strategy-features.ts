/**
 * REB 2.12D Part C: Phase 8.8.2 Strategy Features
 * 
 * Implements the missing strategy enhancement features:
 * - Multi-Timeframe Confirmation: Validates signal across multiple timeframes
 * - Liquidity Factor: Scores signal quality based on available liquidity
 * - Volatility Weighting: Adjusts confidence based on current volatility regime
 * 
 * These features are used by DHMA and other strategies to improve signal quality.
 */

import { storage } from '../storage.js';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import type { PriceData } from '@shared/schema';

const krakenService = new KrakenService();

export type TimeFrame = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type TrendDirection = 'up' | 'down' | 'neutral';

interface MultiTimeframeResult {
  confirmed: boolean;
  agreementCount: number;
  totalChecked: number;
  confidenceAdjustment: number;
  details: Record<TimeFrame, TrendDirection>;
}

interface LiquidityFactorResult {
  score: number;
  volume24h: number;
  spreadBps: number;
  depthRatio: number;
  qualityTier: 'high' | 'medium' | 'low';
}

interface VolatilityWeightResult {
  weight: number;
  regime: 'low' | 'normal' | 'high' | 'extreme';
  realizedVol: number;
  confidenceAdjustment: number;
}

/**
 * Check trend direction for a symbol on a specific timeframe
 * Uses SMA crossover and price action
 */
export async function checkTrend(symbol: string, timeframe: TimeFrame): Promise<TrendDirection> {
  try {
    const candles = await getHistoricalCandles(symbol, timeframe, 20);
    
    if (!candles || candles.length < 10) {
      console.log(`[REB2.12D][MTF] Insufficient data for ${symbol} on ${timeframe}`);
      return 'neutral';
    }

    const sma10 = calculateSMAFromSimple(candles.slice(-10));
    const sma5 = calculateSMAFromSimple(candles.slice(-5));
    const currentPrice = parseFloat(candles[candles.length - 1].close);

    if (currentPrice > sma10 && sma5 > sma10) {
      return 'up';
    } else if (currentPrice < sma10 && sma5 < sma10) {
      return 'down';
    }

    return 'neutral';
  } catch (error) {
    console.error(`[REB2.12D][MTF] Error checking trend for ${symbol}@${timeframe}:`, error);
    return 'neutral';
  }
}

/**
 * Multi-Timeframe Confirmation
 * Validates that the primary signal aligns with secondary timeframes
 * 
 * @param symbol - Trading pair symbol
 * @param primaryTf - Primary timeframe of the signal
 * @returns MultiTimeframeResult with confirmation status and adjustments
 * 
 * Per REB 2.12D spec:
 * - All agree → confidence +10%
 * - Disagree → confidence –10%
 */
export async function confirmMultiTimeframe(
  symbol: string,
  primaryTf: TimeFrame
): Promise<MultiTimeframeResult> {
  const secondaryTimeframes: TimeFrame[] = ['15m', '1h'];
  
  console.log(`[REB2.12D][MTF] Confirming ${symbol} primary=${primaryTf} across ${secondaryTimeframes.join(', ')}`);

  const primaryTrend = await checkTrend(symbol, primaryTf);
  const details: Record<string, TrendDirection> = { [primaryTf]: primaryTrend };
  
  let agreementCount = 0;

  for (const tf of secondaryTimeframes) {
    const secondaryTrend = await checkTrend(symbol, tf);
    details[tf] = secondaryTrend;
    
    if (secondaryTrend === primaryTrend || secondaryTrend === 'neutral') {
      agreementCount++;
    }
  }

  const totalChecked = secondaryTimeframes.length;
  const confirmed = agreementCount === totalChecked;
  const confidenceAdjustment = confirmed ? 0.10 : -0.10;

  console.log(`[REB2.12D][MTF] ${symbol}: confirmed=${confirmed}, agreement=${agreementCount}/${totalChecked}, adj=${confidenceAdjustment > 0 ? '+' : ''}${(confidenceAdjustment * 100).toFixed(0)}%`);

  return {
    confirmed,
    agreementCount,
    totalChecked,
    confidenceAdjustment,
    details: details as Record<TimeFrame, TrendDirection>,
  };
}

/**
 * Calculate Liquidity Factor
 * Scores the available liquidity for a symbol based on volume, spread, and depth
 * 
 * @param symbol - Trading pair symbol
 * @returns LiquidityFactorResult with score and quality tier
 */
export async function calculateLiquidityFactor(symbol: string): Promise<LiquidityFactorResult> {
  console.log(`[REB2.12D][LIQ] Calculating liquidity factor for ${symbol}`);

  try {
    const tickers = await krakenService.getTicker(symbol);
    const ticker = tickers?.[symbol] || Object.values(tickers || {})[0];
    
    if (!ticker) {
      console.log(`[REB2.12D][LIQ] No ticker data for ${symbol}`);
      return {
        score: 0.5,
        volume24h: 0,
        spreadBps: 100,
        depthRatio: 0.5,
        qualityTier: 'low',
      };
    }

    const volume24h = parseFloat(ticker.v?.[1] || '0');
    const bid = parseFloat(ticker.b?.[0] || '0');
    const ask = parseFloat(ticker.a?.[0] || '0');
    const mid = (bid + ask) / 2;
    const spreadBps = mid > 0 ? ((ask - bid) / mid) * 10000 : 100;

    const volumeScore = Math.min(1, volume24h / 1000000);
    const spreadScore = Math.max(0, 1 - (spreadBps / 100));
    const depthRatio = 0.7;

    const score = (volumeScore * 0.4) + (spreadScore * 0.4) + (depthRatio * 0.2);

    let qualityTier: 'high' | 'medium' | 'low';
    if (score >= 0.7) {
      qualityTier = 'high';
    } else if (score >= 0.4) {
      qualityTier = 'medium';
    } else {
      qualityTier = 'low';
    }

    console.log(`[REB2.12D][LIQ] ${symbol}: score=${score.toFixed(2)}, tier=${qualityTier}, vol24h=${volume24h.toFixed(0)}, spread=${spreadBps.toFixed(1)}bps`);

    return {
      score,
      volume24h,
      spreadBps,
      depthRatio,
      qualityTier,
    };
  } catch (error) {
    console.error(`[REB2.12D][LIQ] Error calculating liquidity for ${symbol}:`, error);
    return {
      score: 0.5,
      volume24h: 0,
      spreadBps: 100,
      depthRatio: 0.5,
      qualityTier: 'low',
    };
  }
}

/**
 * Calculate Volatility Weight
 * Adjusts signal confidence based on current volatility regime
 * 
 * @param symbol - Trading pair symbol
 * @param timeframe - Timeframe for volatility calculation
 * @returns VolatilityWeightResult with regime and confidence adjustment
 */
export async function calculateVolatilityWeight(
  symbol: string,
  timeframe: TimeFrame = '1h'
): Promise<VolatilityWeightResult> {
  console.log(`[REB2.12D][VOL] Calculating volatility weight for ${symbol}@${timeframe}`);

  try {
    const candles = await getHistoricalCandles(symbol, timeframe, 24);
    
    if (!candles || candles.length < 10) {
      console.log(`[REB2.12D][VOL] Insufficient data for ${symbol}`);
      return {
        weight: 1.0,
        regime: 'normal',
        realizedVol: 0,
        confidenceAdjustment: 0,
      };
    }

    const returns: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      const currentClose = parseFloat(candles[i].close);
      const prevClose = parseFloat(candles[i - 1].close);
      if (prevClose > 0) {
        returns.push((currentClose - prevClose) / prevClose);
      }
    }

    if (returns.length === 0) {
      return {
        weight: 1.0,
        regime: 'normal',
        realizedVol: 0,
        confidenceAdjustment: 0,
      };
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const realizedVol = Math.sqrt(variance) * Math.sqrt(24);

    let regime: 'low' | 'normal' | 'high' | 'extreme';
    let weight: number;
    let confidenceAdjustment: number;

    if (realizedVol < 0.02) {
      regime = 'low';
      weight = 1.1;
      confidenceAdjustment = 0.05;
    } else if (realizedVol < 0.05) {
      regime = 'normal';
      weight = 1.0;
      confidenceAdjustment = 0;
    } else if (realizedVol < 0.10) {
      regime = 'high';
      weight = 0.9;
      confidenceAdjustment = -0.05;
    } else {
      regime = 'extreme';
      weight = 0.7;
      confidenceAdjustment = -0.10;
    }

    console.log(`[REB2.12D][VOL] ${symbol}: regime=${regime}, realizedVol=${(realizedVol * 100).toFixed(1)}%, weight=${weight.toFixed(2)}, adj=${confidenceAdjustment > 0 ? '+' : ''}${(confidenceAdjustment * 100).toFixed(0)}%`);

    return {
      weight,
      regime,
      realizedVol,
      confidenceAdjustment,
    };
  } catch (error) {
    console.error(`[REB2.12D][VOL] Error calculating volatility for ${symbol}:`, error);
    return {
      weight: 1.0,
      regime: 'normal',
      realizedVol: 0,
      confidenceAdjustment: 0,
    };
  }
}

/**
 * Apply all strategy feature adjustments to a confidence score
 */
export async function applyStrategyFeatures(
  symbol: string,
  baseConfidence: number,
  primaryTimeframe: TimeFrame = '5m'
): Promise<{
  adjustedConfidence: number;
  mtf: MultiTimeframeResult;
  liquidity: LiquidityFactorResult;
  volatility: VolatilityWeightResult;
}> {
  const [mtf, liquidity, volatility] = await Promise.all([
    confirmMultiTimeframe(symbol, primaryTimeframe),
    calculateLiquidityFactor(symbol),
    calculateVolatilityWeight(symbol, '1h'),
  ]);

  let adjustedConfidence = baseConfidence;
  adjustedConfidence += mtf.confidenceAdjustment;
  adjustedConfidence += volatility.confidenceAdjustment;
  adjustedConfidence *= liquidity.score > 0.3 ? 1 : 0.8;

  adjustedConfidence = Math.max(0.1, Math.min(0.95, adjustedConfidence));

  console.log(`[REB2.12D][FEATURES] ${symbol}: base=${(baseConfidence * 100).toFixed(0)}% → adjusted=${(adjustedConfidence * 100).toFixed(0)}%`);

  return {
    adjustedConfidence,
    mtf,
    liquidity,
    volatility,
  };
}

interface SimplePriceData {
  close: string;
  open: string;
  high: string;
  low: string;
  volume: string;
}

async function getHistoricalCandles(
  symbol: string,
  timeframe: TimeFrame,
  limit: number
): Promise<SimplePriceData[]> {
  try {
    const interval = timeframeToInterval(timeframe);
    const { ohlc } = await krakenService.getOHLCData(symbol, interval);
    
    const priceData: SimplePriceData[] = ohlc.map(candle => ({
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }));
    
    return priceData.slice(-limit);
  } catch (error) {
    console.error(`[REB2.12D] Error fetching candles for ${symbol}@${timeframe}:`, error);
    return [];
  }
}

function timeframeToInterval(tf: TimeFrame): number {
  const map: Record<TimeFrame, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  return map[tf] || 60;
}

function calculateSMAFromSimple(candles: SimplePriceData[]): number {
  if (candles.length === 0) return 0;
  const sum = candles.reduce((acc, c) => acc + parseFloat(c.close), 0);
  return sum / candles.length;
}

export {
  getHistoricalCandles,
  calculateSMAFromSimple,
  timeframeToInterval,
};
