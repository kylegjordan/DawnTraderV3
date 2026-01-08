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
