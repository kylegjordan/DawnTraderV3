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

export interface ExpandedRegimeDescription {
  title: string;
  description: string;
  favoredSignalTypes: string[];
  favoredStrategies: string[];
}

export interface MarketIndicators {
  marketRegime: MarketRegime;
  regimeDescription: string;
  regimeTitle: string;
  favoredSignalTypes: string[];
  favoredStrategies: string[];
  globalFrictionScore: number;
  frictionDescription: FrictionStatus;
  frictionNarrative: string;
  timestamp: Date;
}

/**
 * Directive 11.4A.1 — Expanded Market Regime Definitions (M19 Governance Invariant)
 * Full-text regime definitions in simplified, narrative language for non-expert users.
 */
export const regimeDescriptions: Record<string, ExpandedRegimeDescription> = {
  BULL_STABLE: {
    title: "Bull Stable",
    description: `The market is in a clear upward trend, moving steadily higher with moderate volatility. This usually means that confidence is high and most buyers are stepping in at pullbacks. Momentum-based or trend-following signals are more likely to succeed here because the overall direction is upward. You can expect trades to stay open longer, aiming for larger gains.`,
    favoredSignalTypes: ["Quantitative", "Hybrid"],
    favoredStrategies: ["Trend Breakout", "Momentum Continuation", "EMA Alignment"]
  },
  BULL_VOLATILE: {
    title: "Bull Volatile",
    description: `The market is trending upward but with larger price swings and higher volatility. Opportunities exist but require quicker decision-making and tighter risk management. Momentum strategies work well but position sizes are typically smaller to account for the wider swings. Expect faster trade cycles with more active trailing stop adjustments.`,
    favoredSignalTypes: ["Quantitative", "Pattern"],
    favoredStrategies: ["Momentum Breakout", "Volatility Expansion", "Quick Scalp"]
  },
  BEAR_STABLE: {
    title: "Bear Stable",
    description: `The market is in a downward trend with moderate, predictable volatility. Prices are declining but doing so in an orderly fashion. Since this is a long-only system, trading is more selective, focusing on counter-trend bounces and oversold reversals. Position sizes are reduced and holding periods are shorter.`,
    favoredSignalTypes: ["Pattern", "Hybrid"],
    favoredStrategies: ["Support Bounce", "Oversold Reversal", "Counter-Trend"]
  },
  BEAR_VOLATILE: {
    title: "Bear Volatile",
    description: `The market is trending downward and swinging sharply from highs to lows. Prices often drop quickly and recover partially before continuing down. Short-term trades that favor quick exits or reversal signals may perform better. It's a defensive environment, so position sizes are often smaller and stops tighter.`,
    favoredSignalTypes: ["Quantitative", "Pattern"],
    favoredStrategies: ["Breakdown Pullback", "Counter-Reversal", "Fast Exit Short"]
  },
  LOW_VOL_CHOP: {
    title: "Low Volatility Chop",
    description: `The market is moving sideways with little clear direction and small price changes. Trends do not hold well, so breakout attempts usually fail or reverse quickly. Range-based or counter-trend signals tend to work best because prices often bounce between support and resistance levels. Trades will usually be smaller and shorter, focusing on quick gains.`,
    favoredSignalTypes: ["Pattern", "Hybrid"],
    favoredStrategies: ["RSI Overbought/Oversold", "Range Trade", "H2 Slingshot"]
  },
  HIGH_VOL_CHOP: {
    title: "High Volatility Chop",
    description: `The market has no clear direction and price movements are wide and unpredictable. Big swings up and down can trigger both stop losses and entries in quick succession. The system will generally trade less or use wider stops to avoid getting chopped up. Only high-confidence hybrid signals will activate in this kind of environment.`,
    favoredSignalTypes: ["Hybrid"],
    favoredStrategies: ["Volatility Compression", "Dynamic Range Play"]
  },
  MIXED_TRANSITION: {
    title: "Mixed Transition",
    description: `The market is shifting from one regime to another, often from bullish to bearish or vice versa. Conditions are unclear — volatility changes, trend indicators disagree, and signals can conflict. This is when the system becomes more selective and cautious, often reducing position sizes until a new regime stabilizes.`,
    favoredSignalTypes: ["Hybrid"],
    favoredStrategies: ["Confirmation Entry", "Directional Probe", "Adaptive Edge"]
  },
  EXTREME_NOISE: {
    title: "Extreme Noise",
    description: `The market is in chaotic conditions with no discernible pattern or direction. Price action is erratic and unpredictable, making any trading extremely risky. The system enters capital preservation mode, avoiding new entries entirely. This is a time to wait on the sidelines until conditions stabilize.`,
    favoredSignalTypes: [],
    favoredStrategies: ["Cash", "Wait"]
  }
};

const REGIME_DESCRIPTIONS: Record<MarketRegime, RegimeInfo> = {
  'BULL_STABLE': {
    name: 'BULL_STABLE',
    description: regimeDescriptions.BULL_STABLE.description,
    favoredStrategies: regimeDescriptions.BULL_STABLE.favoredStrategies,
  },
  'BULL_VOLATILE': {
    name: 'BULL_VOLATILE',
    description: regimeDescriptions.BULL_VOLATILE.description,
    favoredStrategies: regimeDescriptions.BULL_VOLATILE.favoredStrategies,
  },
  'BEAR_STABLE': {
    name: 'BEAR_STABLE',
    description: regimeDescriptions.BEAR_STABLE.description,
    favoredStrategies: regimeDescriptions.BEAR_STABLE.favoredStrategies,
  },
  'BEAR_VOLATILE': {
    name: 'BEAR_VOLATILE',
    description: regimeDescriptions.BEAR_VOLATILE.description,
    favoredStrategies: regimeDescriptions.BEAR_VOLATILE.favoredStrategies,
  },
  'LOW_VOL_CHOP': {
    name: 'LOW_VOL_CHOP',
    description: regimeDescriptions.LOW_VOL_CHOP.description,
    favoredStrategies: regimeDescriptions.LOW_VOL_CHOP.favoredStrategies,
  },
  'EXTREME_NOISE': {
    name: 'EXTREME_NOISE',
    description: regimeDescriptions.EXTREME_NOISE.description,
    favoredStrategies: regimeDescriptions.EXTREME_NOISE.favoredStrategies,
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
  const regimeKey = cachedGlobalRegime as string;
  const expandedRegime = regimeDescriptions[regimeKey] || regimeDescriptions['LOW_VOL_CHOP'];
  const frictionScore = computeGlobalFriction();
  const frictionStatus = describeFriction(frictionScore);
  
  return {
    marketRegime: cachedGlobalRegime,
    regimeTitle: expandedRegime.title,
    regimeDescription: expandedRegime.description,
    favoredSignalTypes: expandedRegime.favoredSignalTypes,
    favoredStrategies: expandedRegime.favoredStrategies,
    globalFrictionScore: frictionScore,
    frictionDescription: frictionStatus,
    frictionNarrative: frictionStatus.narrative,
    timestamp: lastUpdate,
  };
}

export function getExpandedRegimeDescription(regime: string): ExpandedRegimeDescription | undefined {
  return regimeDescriptions[regime];
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
