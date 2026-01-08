/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3 — Cost Metrics Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides transaction cost factor calculations for Dynamic Sizing Engine.
 * 
 * Cost Factor = (spread + slippage) / average return
 * 
 * Where:
 * - spread: bid-ask spread as percentage of price
 * - slippage: estimated execution slippage (0.05% default)
 * - average return: expected return per trade (0.5% default)
 * 
 * Low cost factor = cheaper trade = larger position allowed
 * High cost factor = expensive trade = smaller position
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

export interface CostData {
  symbol: string;
  spread: number;
  slippage: number;
  costFactor: number;
  avgReturn: number;
  timestamp: Date;
}

const costCache: Map<string, CostData> = new Map();
const CACHE_TTL_MS = 60_000;

const DEFAULT_SLIPPAGE = 0.0005;
const DEFAULT_AVG_RETURN = 0.005;

export function getTransactionCostFactor(symbol: string): number {
  const cached = costCache.get(symbol);
  if (cached && Date.now() - cached.timestamp.getTime() < CACHE_TTL_MS) {
    return cached.costFactor;
  }
  return 0.0005;
}

export function updateCostData(
  symbol: string,
  spread: number,
  slippage: number = DEFAULT_SLIPPAGE,
  avgReturn: number = DEFAULT_AVG_RETURN
): CostData {
  if (avgReturn <= 0) {
    console.warn(`[11.3][CostMetrics] Invalid avgReturn for ${symbol}: ${avgReturn}`);
    avgReturn = DEFAULT_AVG_RETURN;
  }

  const costFactor = (spread + slippage) / avgReturn;
  
  const data: CostData = {
    symbol,
    spread,
    slippage,
    costFactor,
    avgReturn,
    timestamp: new Date(),
  };

  costCache.set(symbol, data);
  console.log(`[11.3][CostMetrics] ${symbol} costFactor=${costFactor.toFixed(4)} (spread=${(spread * 100).toFixed(3)}%, slippage=${(slippage * 100).toFixed(3)}%)`);
  
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
