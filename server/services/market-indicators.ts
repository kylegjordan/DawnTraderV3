/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4A — Market Indicators Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides global market intelligence for the operator dashboard:
 * - Market Regime (global macro climate)
 * - Global Friction Score (execution environment from Top-100 FX5 pool)
 * 
 * Governance Invariants:
 * - M14: Global Friction derived only from Top-100 FX5 pool
 * - M15: Market Regime remains globally calculated
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { type MarketRegime } from './dynamic-strategy-selector.js';
import { computeMarketFriction, describeFriction, type FrictionStatus } from '../core/metrics/cost-metrics.js';
import { getCostMetrics as getCacheMetrics, getCacheSize } from '../core/cache/cost-cache.js';
import { activeFilterPool } from './active-filter-pool.js';

export interface RegimeInfo {
  name: MarketRegime;
  description: string;
  favoredStrategies: string[];
}

export interface MarketIndicators {
  marketRegime: MarketRegime;
  regimeDescription: string;
  favoredStrategies: string[];
  globalFrictionScore: number;
  frictionDescription: FrictionStatus;
  timestamp: Date;
}

const REGIME_DESCRIPTIONS: Record<MarketRegime, RegimeInfo> = {
  'BULL_STABLE': {
    name: 'BULL_STABLE',
    description: 'Trending market with moderate volatility; trend-following strategies favored.',
    favoredStrategies: ['EMA_CROSS', 'RSI_OVERSOLD', 'MACD_SIGNAL', 'H1_TREND_SNIPER'],
  },
  'BULL_VOLATILE': {
    name: 'BULL_VOLATILE',
    description: 'Strong uptrend with high volatility; momentum strategies favored with caution.',
    favoredStrategies: ['RSI_OVERSOLD', 'MACD_SIGNAL', 'BREAKOUT'],
  },
  'BEAR_STABLE': {
    name: 'BEAR_STABLE',
    description: 'Downtrend with moderate volatility; defensive and reversal strategies favored.',
    favoredStrategies: ['RSI_OVERSOLD', 'SUPPORT_BOUNCE'],
  },
  'BEAR_VOLATILE': {
    name: 'BEAR_VOLATILE',
    description: 'Strong downtrend with high volatility; caution advised, minimal exposure.',
    favoredStrategies: ['CASH', 'SUPPORT_BOUNCE'],
  },
  'LOW_VOL_CHOP': {
    name: 'LOW_VOL_CHOP',
    description: 'Sideways market with low volatility; range-bound strategies favored.',
    favoredStrategies: ['RSI_OVERBOUGHT', 'RANGE_TRADE', 'H2_SLINGSHOT'],
  },
  'EXTREME_NOISE': {
    name: 'EXTREME_NOISE',
    description: 'Chaotic market conditions; trading vetoed, capital preservation mode.',
    favoredStrategies: ['CASH'],
  },
};

let cachedGlobalRegime: MarketRegime = 'LOW_VOL_CHOP';
let cachedGlobalFriction: number = 25;
let lastUpdate: Date = new Date();

const TOP_100_FALLBACK_PAIRS = [
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'DOGE/USD',
  'ADA/USD', 'AVAX/USD', 'DOT/USD', 'MATIC/USD', 'LINK/USD',
  'ATOM/USD', 'UNI/USD', 'LTC/USD', 'BCH/USD', 'XLM/USD',
];

export function updateGlobalRegime(regime: MarketRegime): void {
  cachedGlobalRegime = regime;
  lastUpdate = new Date();
  console.log(`[11.4A][MarketIndicators] Global regime updated: ${regime}`);
}

export function computeGlobalFriction(): number {
  try {
    const pool = activeFilterPool.getActivePool();
    const symbolsToSample = pool.length >= 50 
      ? pool.slice(0, 100).map(p => p.symbol)
      : TOP_100_FALLBACK_PAIRS;
    
    let totalFriction = 0;
    let count = 0;
    
    for (const symbol of symbolsToSample) {
      const metrics = getCacheMetrics(symbol);
      if (metrics) {
        const friction = computeMarketFriction(metrics.spread, metrics.slippage, metrics.fee);
        totalFriction += friction;
        count++;
      }
    }
    
    if (count === 0) {
      return 25;
    }
    
    const avgFriction = Math.round(totalFriction / count);
    cachedGlobalFriction = avgFriction;
    lastUpdate = new Date();
    
    return avgFriction;
  } catch (err) {
    console.warn('[11.4A][MarketIndicators] Error computing global friction:', err);
    return cachedGlobalFriction;
  }
}

export function getMarketIndicators(): MarketIndicators {
  const regimeInfo = REGIME_DESCRIPTIONS[cachedGlobalRegime];
  const frictionScore = computeGlobalFriction();
  
  return {
    marketRegime: cachedGlobalRegime,
    regimeDescription: regimeInfo.description,
    favoredStrategies: regimeInfo.favoredStrategies,
    globalFrictionScore: frictionScore,
    frictionDescription: describeFriction(frictionScore),
    timestamp: lastUpdate,
  };
}

export function getRegimeInfo(regime: MarketRegime): RegimeInfo {
  return REGIME_DESCRIPTIONS[regime] || REGIME_DESCRIPTIONS['LOW_VOL_CHOP'];
}

export function getCurrentRegime(): MarketRegime {
  return cachedGlobalRegime;
}

export function getGlobalFriction(): number {
  return cachedGlobalFriction;
}
