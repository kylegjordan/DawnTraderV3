/**
 * Specialized Trading Filters
 * 
 * Provides advanced filter functions for new trading strategies:
 * 1. Range Detection - Identifies bounded price movements
 * 2. Stop-Zone / Liquidity Cluster Detection - Identifies areas with stop loss accumulation
 */

import { PriceData } from '@shared/schema';

export interface RangeDetectionResult {
  isRange: boolean;
  rangeHigh: number;
  rangeLow: number;
  rangeMidpoint: number;
  rangeWidth: number;
  rangeWidthPercent: number;
  durationBars: number;
  volatility: number;
  reason: string;
}

export interface StopZoneResult {
  hasStopZone: boolean;
  stopZonePrice: number;
  stopZoneType: 'resistance' | 'support' | 'none';
  clusterStrength: 'weak' | 'medium' | 'strong';
  touchCount: number;
  volumeProfile: 'low' | 'medium' | 'high';
  reason: string;
}

/**
 * Range Detection Filter
 * 
 * Detects bounded price movements using:
 * - % band width (range must be within threshold)
 * - Bar count (minimum duration for valid range)
 * - Low volatility (price oscillation within bounds)
 * 
 * @param priceHistory - Array of price data (OHLCV)
 * @param minBars - Minimum bars for valid range (default: 10)
 * @param maxRangeWidthPct - Maximum range width % (default: 5%)
 * @param minTouches - Minimum touches per boundary (default: 2)
 */
export function detectRange(
  priceHistory: PriceData[],
  minBars: number = 10,
  maxRangeWidthPct: number = 5.0,
  minTouches: number = 2,
  touchTolerance: number = 0.003 // Batch 18H: ATR/4 tolerance when provided, default 0.3%
): RangeDetectionResult {
  
  if (priceHistory.length < minBars) {
    return {
      isRange: false,
      rangeHigh: 0,
      rangeLow: 0,
      rangeMidpoint: 0,
      rangeWidth: 0,
      rangeWidthPercent: 0,
      durationBars: priceHistory.length,
      volatility: 0,
      reason: `Insufficient data: need ${minBars} bars, have ${priceHistory.length}`
    };
  }

  // Calculate range boundaries using recent bars
  const recentBars = priceHistory.slice(-minBars);
  const highs = recentBars.map(p => parseFloat(p.high));
  const lows = recentBars.map(p => parseFloat(p.low));
  const closes = recentBars.map(p => parseFloat(p.close));
  
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeMidpoint = (rangeHigh + rangeLow) / 2;
  const rangeWidth = rangeHigh - rangeLow;
  const rangeWidthPercent = (rangeWidth / rangeMidpoint) * 100;

  // Check if range width is within threshold
  if (rangeWidthPercent > maxRangeWidthPct) {
    return {
      isRange: false,
      rangeHigh,
      rangeLow,
      rangeMidpoint,
      rangeWidth,
      rangeWidthPercent,
      durationBars: minBars,
      volatility: rangeWidthPercent,
      reason: `Range too wide: ${rangeWidthPercent.toFixed(2)}% exceeds ${maxRangeWidthPct}% threshold`
    };
  }

  // Count boundary touches (Batch 18H: ATR/4 tolerance when caller provides it, default 0.3%)
  const touchThreshold = touchTolerance;
  let highTouches = 0;
  let lowTouches = 0;

  for (const bar of recentBars) {
    const high = parseFloat(bar.high);
    const low = parseFloat(bar.low);
    
    // High touch: within 0.3% of range high
    if (Math.abs(high - rangeHigh) / rangeHigh <= touchThreshold) {
      highTouches++;
    }
    
    // Low touch: within 0.3% of range low
    if (Math.abs(low - rangeLow) / rangeLow <= touchThreshold) {
      lowTouches++;
    }
  }

  // Validate minimum touches
  if (highTouches < minTouches || lowTouches < minTouches) {
    return {
      isRange: false,
      rangeHigh,
      rangeLow,
      rangeMidpoint,
      rangeWidth,
      rangeWidthPercent,
      durationBars: minBars,
      volatility: rangeWidthPercent,
      reason: `Insufficient boundary touches: high=${highTouches}, low=${lowTouches} (need ${minTouches} each)`
    };
  }

  // Calculate volatility (standard deviation of closes as % of midpoint)
  const mean = closes.reduce((sum, c) => sum + c, 0) / closes.length;
  const variance = closes.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / closes.length;
  const stdDev = Math.sqrt(variance);
  const volatility = (stdDev / rangeMidpoint) * 100;

  // Valid range detected
  return {
    isRange: true,
    rangeHigh,
    rangeLow,
    rangeMidpoint,
    rangeWidth,
    rangeWidthPercent,
    durationBars: minBars,
    volatility,
    reason: `Valid range: ${rangeWidthPercent.toFixed(2)}% width, ${highTouches} high touches, ${lowTouches} low touches, ${volatility.toFixed(2)}% volatility`
  };
}

/**
 * Stop-Zone / Liquidity Cluster Detection
 * 
 * Identifies price levels where stop losses are likely clustered:
 * - Swing highs/lows (obvious stop placement zones)
 * - Round numbers (psychological levels)
 * - High volume rejection zones
 * 
 * @param priceHistory - Array of price data (OHLCV)
 * @param currentPrice - Current market price
 * @param lookbackBars - Bars to analyze (default: 20)
 * @param minTouches - Minimum level touches (default: 3)
 */
export function detectStopZone(
  priceHistory: PriceData[],
  currentPrice: number,
  lookbackBars: number = 20,
  minTouches: number = 3
): StopZoneResult {
  
  if (priceHistory.length < lookbackBars) {
    return {
      hasStopZone: false,
      stopZonePrice: currentPrice,
      stopZoneType: 'none',
      clusterStrength: 'weak',
      touchCount: 0,
      volumeProfile: 'low',
      reason: `Insufficient data: need ${lookbackBars} bars, have ${priceHistory.length}`
    };
  }

  const recentBars = priceHistory.slice(-lookbackBars);
  const highs = recentBars.map(p => parseFloat(p.high));
  const lows = recentBars.map(p => parseFloat(p.low));
  const volumes = recentBars.map(p => parseFloat(p.volume || '0'));
  
  // Find swing highs and swing lows (local extrema)
  const swingHighs: { price: number; index: number; volume: number }[] = [];
  const swingLows: { price: number; index: number; volume: number }[] = [];
  
  for (let i = 1; i < recentBars.length - 1; i++) {
    const prevHigh = parseFloat(recentBars[i - 1].high);
    const currHigh = parseFloat(recentBars[i].high);
    const nextHigh = parseFloat(recentBars[i + 1].high);
    const prevLow = parseFloat(recentBars[i - 1].low);
    const currLow = parseFloat(recentBars[i].low);
    const nextLow = parseFloat(recentBars[i + 1].low);
    const volume = parseFloat(recentBars[i].volume || '0');
    
    // Swing high: higher than neighbors
    if (currHigh > prevHigh && currHigh > nextHigh) {
      swingHighs.push({ price: currHigh, index: i, volume });
    }
    
    // Swing low: lower than neighbors
    if (currLow < prevLow && currLow < nextLow) {
      swingLows.push({ price: currLow, index: i, volume });
    }
  }

  // Check for clusters near current price (within 2%)
  const clusterThreshold = 0.02; // 2%
  const resistanceClusters: typeof swingHighs = [];
  const supportClusters: typeof swingLows = [];
  
  for (const swing of swingHighs) {
    if (Math.abs(swing.price - currentPrice) / currentPrice <= clusterThreshold && swing.price > currentPrice) {
      resistanceClusters.push(swing);
    }
  }
  
  for (const swing of swingLows) {
    if (Math.abs(swing.price - currentPrice) / currentPrice <= clusterThreshold && swing.price < currentPrice) {
      supportClusters.push(swing);
    }
  }

  // Determine dominant cluster
  let hasStopZone = false;
  let stopZonePrice = currentPrice;
  let stopZoneType: 'resistance' | 'support' | 'none' = 'none';
  let touchCount = 0;
  let avgVolume = 0;
  
  if (resistanceClusters.length >= minTouches) {
    hasStopZone = true;
    stopZoneType = 'resistance';
    stopZonePrice = resistanceClusters.reduce((sum, c) => sum + c.price, 0) / resistanceClusters.length;
    touchCount = resistanceClusters.length;
    avgVolume = resistanceClusters.reduce((sum, c) => sum + c.volume, 0) / resistanceClusters.length;
  } else if (supportClusters.length >= minTouches) {
    hasStopZone = true;
    stopZoneType = 'support';
    stopZonePrice = supportClusters.reduce((sum, c) => sum + c.price, 0) / supportClusters.length;
    touchCount = supportClusters.length;
    avgVolume = supportClusters.reduce((sum, c) => sum + c.volume, 0) / supportClusters.length;
  }

  if (!hasStopZone) {
    return {
      hasStopZone: false,
      stopZonePrice: currentPrice,
      stopZoneType: 'none',
      clusterStrength: 'weak',
      touchCount: Math.max(resistanceClusters.length, supportClusters.length),
      volumeProfile: 'low',
      reason: `No significant stop zone: resistance touches=${resistanceClusters.length}, support touches=${supportClusters.length} (need ${minTouches})`
    };
  }

  // Determine cluster strength based on touches and volume
  const totalVolume = volumes.reduce((sum, v) => sum + v, 0);
  const avgTotalVolume = totalVolume / volumes.length;
  
  // Guard against zero/NaN volume - if no volume data, assume weak cluster
  let volumeRatio = 0;
  if (avgTotalVolume > 0 && avgVolume > 0 && isFinite(avgVolume) && isFinite(avgTotalVolume)) {
    volumeRatio = avgVolume / avgTotalVolume;
  }
  
  let clusterStrength: 'weak' | 'medium' | 'strong' = 'medium';
  if (touchCount >= 5 && volumeRatio > 1.5) {
    clusterStrength = 'strong';
  } else if (touchCount < 4 || volumeRatio < 1.0) {
    clusterStrength = 'weak';
  }
  
  const volumeProfile: 'low' | 'medium' | 'high' = 
    volumeRatio > 1.5 ? 'high' : volumeRatio > 1.0 ? 'medium' : 'low';

  return {
    hasStopZone: true,
    stopZonePrice,
    stopZoneType,
    clusterStrength,
    touchCount,
    volumeProfile,
    reason: `${stopZoneType} stop zone at $${stopZonePrice.toFixed(2)}: ${touchCount} touches, ${clusterStrength} cluster, ${volumeProfile} volume`
  };
}

/**
 * Check if current price is near a round number (psychological level)
 * Round numbers often attract stop placement
 * 
 * @param price - Current price
 * @param threshold - Distance threshold (default: 0.5%)
 */
export function isNearRoundNumber(price: number, threshold: number = 0.005): {
  isNear: boolean;
  roundNumber: number;
  distance: number;
  reason: string;
} {
  // Determine appropriate round number based on price magnitude
  let roundIncrement: number;
  
  if (price >= 10000) {
    roundIncrement = 1000; // $10K, $20K, etc.
  } else if (price >= 1000) {
    roundIncrement = 500; // $1000, $1500, etc.
  } else if (price >= 100) {
    roundIncrement = 50; // $100, $150, etc.
  } else if (price >= 10) {
    roundIncrement = 5; // $10, $15, etc.
  } else {
    roundIncrement = 1; // $1, $2, etc.
  }

  // Find nearest round number
  const roundNumber = Math.round(price / roundIncrement) * roundIncrement;
  const distance = Math.abs(price - roundNumber) / price;
  const isNear = distance <= threshold;

  return {
    isNear,
    roundNumber,
    distance,
    reason: isNear 
      ? `Price $${price.toFixed(2)} within ${(distance * 100).toFixed(2)}% of round number $${roundNumber}`
      : `Price $${price.toFixed(2)} not near round number (${(distance * 100).toFixed(2)}% from $${roundNumber})`
  };
}

/**
 * Detect if market is in a consolidation/ranging state
 * Used by Mean Reversion and Range Trading strategies
 * 
 * @param priceHistory - Array of price data
 * @param sma - Simple moving average value (if available)
 */
export function isConsolidating(
  priceHistory: PriceData[],
  sma?: number
): {
  isConsolidating: boolean;
  trendStrength: number;
  reason: string;
} {
  if (priceHistory.length < 10) {
    return {
      isConsolidating: false,
      trendStrength: 0,
      reason: 'Insufficient data for consolidation detection'
    };
  }

  const recent = priceHistory.slice(-10);
  const closes = recent.map(p => parseFloat(p.close));
  
  // Calculate linear regression slope (trend strength)
  const n = closes.length;
  const xValues = Array.from({ length: n }, (_, i) => i);
  const xMean = xValues.reduce((sum, x) => sum + x, 0) / n;
  const yMean = closes.reduce((sum, c) => sum + c, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (xValues[i] - xMean) * (closes[i] - yMean);
    denominator += Math.pow(xValues[i] - xMean, 2);
  }
  
  const slope = numerator / denominator;
  const trendStrength = Math.abs(slope) / yMean; // Normalized trend strength
  
  // If SMA provided, check price oscillation around it
  if (sma) {
    const aboveSMA = closes.filter(c => c > sma).length;
    const belowSMA = closes.filter(c => c < sma).length;
    const balance = Math.abs(aboveSMA - belowSMA) / n;
    
    // Consolidating if price oscillates around SMA (balanced) and weak trend
    const isConsolidating = balance < 0.4 && trendStrength < 0.01;
    
    return {
      isConsolidating,
      trendStrength,
      reason: isConsolidating
        ? `Consolidating: balanced SMA interaction (${(balance * 100).toFixed(0)}%), weak trend (${(trendStrength * 100).toFixed(2)}%)`
        : `Trending: ${balance >= 0.4 ? 'unbalanced' : 'strong trend'} (strength: ${(trendStrength * 100).toFixed(2)}%)`
    };
  }

  // Without SMA, use trend strength only
  const isConsolidating = trendStrength < 0.01;
  
  return {
    isConsolidating,
    trendStrength,
    reason: isConsolidating
      ? `Consolidating: weak trend strength ${(trendStrength * 100).toFixed(2)}%`
      : `Trending: strong trend strength ${(trendStrength * 100).toFixed(2)}%`
  };
}
