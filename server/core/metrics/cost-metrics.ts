/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3A — Cost Metrics Service (Enhanced)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides transaction cost factor calculations for Dynamic Sizing Engine.
 * Enhanced in 11.3A to include spread as first-class trading cost.
 * 
 * Cost Factor = (spread + slippage) / average return
 * 
 * Where:
 * - spread: bid-ask spread as percentage of price (fetched from order book)
 * - slippage: estimated execution slippage (0.05% default)
 * - average return: expected return per trade (0.5% default)
 * 
 * Low cost factor = cheaper trade = larger position allowed
 * High cost factor = expensive trade = smaller position
 * 
 * 11.3A Enhancements:
 * - getCurrentSpread(): Fetches live spread from order book
 * - Spread cached for 30-60 seconds
 * - Spread included in all total cost calculations
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { updateCachedCostMetrics, getCachedCostMetrics as getCostModelMetrics } from '../math/cost-model.js';

export interface CostData {
  symbol: string;
  spread: number;
  slippage: number;
  costFactor: number;
  avgReturn: number;
  fee: number;
  timestamp: Date;
}

const costCache: Map<string, CostData> = new Map();
const spreadCache: Map<string, { spread: number; timestamp: number }> = new Map();
const CACHE_TTL_MS = 60_000;
const SPREAD_CACHE_TTL_MS = 30_000;

const DEFAULT_SLIPPAGE = 0.0005;
const DEFAULT_AVG_RETURN = 0.005;
const DEFAULT_FEE = 0.0025;
const DEFAULT_SPREAD = 0.001;

export function getTransactionCostFactor(symbol: string): number {
  const cached = costCache.get(symbol);
  if (cached && Date.now() - cached.timestamp.getTime() < CACHE_TTL_MS) {
    return cached.costFactor;
  }
  return 0.0005;
}

export async function getCurrentSpread(symbol: string): Promise<number> {
  const cached = spreadCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < SPREAD_CACHE_TTL_MS) {
    return cached.spread;
  }
  
  try {
    const { KrakenService } = await import('../../services/kraken.js');
    const kraken = new KrakenService();
    const orderBook = await kraken.getOrderBook(symbol, 1);
    
    if (orderBook && orderBook.asks.length > 0 && orderBook.bids.length > 0) {
      const bestAsk = orderBook.asks[0][0];
      const bestBid = orderBook.bids[0][0];
      const midPrice = (bestAsk + bestBid) / 2;
      const spread = midPrice > 0 ? (bestAsk - bestBid) / midPrice : DEFAULT_SPREAD;
      
      spreadCache.set(symbol, { spread, timestamp: Date.now() });
      return spread;
    }
  } catch (err) {
    console.warn(`[11.3A][CostMetrics] Failed to fetch spread for ${symbol}, using default`);
  }
  
  return DEFAULT_SPREAD;
}

export function getCachedSpread(symbol: string): number {
  const cached = spreadCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < SPREAD_CACHE_TTL_MS) {
    return cached.spread;
  }
  return DEFAULT_SPREAD;
}

export function updateSpreadCache(symbol: string, spread: number): void {
  spreadCache.set(symbol, { spread, timestamp: Date.now() });
  const costModelMetrics = getCostModelMetrics(symbol);
  updateCachedCostMetrics(symbol, costModelMetrics.fee, costModelMetrics.slippage, spread);
}

export function updateCostData(
  symbol: string,
  spread: number,
  slippage: number = DEFAULT_SLIPPAGE,
  avgReturn: number = DEFAULT_AVG_RETURN,
  fee: number = DEFAULT_FEE
): CostData {
  if (avgReturn <= 0) {
    console.warn(`[11.3A][CostMetrics] Invalid avgReturn for ${symbol}: ${avgReturn}`);
    avgReturn = DEFAULT_AVG_RETURN;
  }

  const costFactor = (spread + slippage) / avgReturn;
  
  const data: CostData = {
    symbol,
    spread,
    slippage,
    costFactor,
    avgReturn,
    fee,
    timestamp: new Date(),
  };

  costCache.set(symbol, data);
  updateCachedCostMetrics(symbol, fee, slippage, spread);
  
  console.log(`[11.3A][CostMetrics] ${symbol} costFactor=${costFactor.toFixed(4)} (spread=${(spread * 100).toFixed(3)}%, slippage=${(slippage * 100).toFixed(3)}%, fee=${(fee * 100).toFixed(3)}%)`);
  
  return data;
}

export function getCostCache(): Map<string, CostData> {
  return new Map(costCache);
}

export function clearCostCache(): void {
  costCache.clear();
  console.log('[11.3][CostMetrics] Cost cache cleared');
}

export function getCostClassification(costFactor: number): 'cheap' | 'moderate' | 'expensive' {
  if (costFactor < 0.0003) return 'cheap';
  if (costFactor > 0.001) return 'expensive';
  return 'moderate';
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4A — Market Friction Computation (M10 Governance Invariant)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Computes Market Friction score normalized to 0-100 scale.
 * 
 * Formula: base = (spread + slippage + fee) × 10000
 *          normalized = min(base / 3, 100)
 * 
 * Thresholds:
 * - 0-20:   High Liquidity (Green)
 * - 21-50:  Normal Liquidity (Yellow)
 * - 51-80:  Stressed Liquidity (Orange)
 * - 81-100: Frozen/Illiquid (Red)
 * 
 * @param spread - Bid-ask spread as decimal (e.g., 0.001 = 0.1%)
 * @param slippage - Execution slippage as decimal (e.g., 0.0005 = 0.05%)
 * @param fee - Trading fee as decimal (e.g., 0.0026 = 0.26%)
 * @returns Market friction score 0-100
 * ══════════════════════════════════════════════════════════════════════════════
 */
export function computeMarketFriction(spread: number, slippage: number, fee: number): number {
  const base = (spread + slippage + fee) * 10000;
  const normalized = Math.min(base / 3, 100);
  return Math.round(normalized);
}

/**
 * Directive 11.4A — Market Friction Status Description
 * Returns human-readable status and color indicator for friction score.
 */
export interface FrictionStatus {
  value: number;
  status: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
  emoji: string;
  narrative: string;
}

/**
 * Directive 11.4A.1 — Expanded Market Friction Narratives (M20 Governance Invariant)
 * Full 3-4 sentence explanations for each friction range.
 */
export function describeFriction(frictionScore: number): FrictionStatus {
  if (frictionScore <= 20) {
    return { 
      value: frictionScore, 
      status: 'High Liquidity', 
      color: 'green', 
      emoji: '🟢',
      narrative: 'High liquidity — trades are easy to enter and exit with very small price changes. Orders fill quickly, spreads are tight, and the system can use full position sizes safely. You can expect smoother performance and smaller differences between entry and exit prices.'
    };
  }
  if (frictionScore <= 50) {
    return { 
      value: frictionScore, 
      status: 'Normal Liquidity', 
      color: 'yellow', 
      emoji: '🟡',
      narrative: 'Normal liquidity — conditions are average and stable. Most trades execute at expected prices, but small slippage may occur. The system operates normally with standard position sizes.'
    };
  }
  if (frictionScore <= 80) {
    return { 
      value: frictionScore, 
      status: 'Stressed Liquidity', 
      color: 'orange', 
      emoji: '🟠',
      narrative: 'Stressed liquidity — spreads and slippage are starting to widen. Orders may take longer to fill or fill slightly off-target. The system will reduce position sizes or trail exits more tightly to protect capital.'
    };
  }
  return { 
    value: frictionScore, 
    status: 'Frozen / Illiquid', 
    color: 'red', 
    emoji: '🔴',
    narrative: 'Frozen or illiquid — markets are difficult to trade safely. Price jumps and execution delays are common, and signals may be paused temporarily. The system minimizes new entries until conditions stabilize.'
  };
}

/**
 * Directive 11.4A — Format friction for display
 * Example output: "37: Normal Liquidity 🟡"
 */
export function formatFrictionDisplay(frictionScore: number): string {
  const { status, emoji } = describeFriction(frictionScore);
  return `${frictionScore}: ${status} ${emoji}`;
}
