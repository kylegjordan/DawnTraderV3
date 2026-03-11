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
import { DEFAULT_TAKER_FEE, DEFAULT_SLIPPAGE as CANONICAL_SLIPPAGE, DEFAULT_SPREAD as CANONICAL_SPREAD } from '../../config/exchange-defaults.js';

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

const DEFAULT_SLIPPAGE = CANONICAL_SLIPPAGE;     // Batch 18J: from exchange-defaults.ts (0.05%)
const DEFAULT_AVG_RETURN = 0.005;
const DEFAULT_FEE = DEFAULT_TAKER_FEE;           // Batch 18J: from exchange-defaults.ts (0.26%)
const DEFAULT_SPREAD = CANONICAL_SPREAD;          // Batch 18J: from exchange-defaults.ts (0.10%)

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
    const orderBookRecord = await kraken.getOrderBook(symbol, 1);
    
    // KrakenService.getOrderBook returns Record<string, KrakenOrderBook>
    // where each entry has asks/bids arrays of {price: string, volume: string, timestamp: number}
    const book = orderBookRecord?.[symbol];
    if (book && book.asks && book.asks.length > 0 && book.bids && book.bids.length > 0) {
      const bestAsk = parseFloat(book.asks[0].price);
      const bestBid = parseFloat(book.bids[0].price);
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
 * Directive 11.4H.2 Task 2: Corrected friction label mapping (semantic alignment)
 * Full 3-4 sentence explanations for each friction range.
 * 
 * Friction score interpretation:
 * - Low friction (0-30) = High Liquidity / Low Cost (GREEN)
 * - Medium friction (30-70) = Moderate Liquidity (YELLOW/ORANGE)
 * - High friction (70-100) = Low Liquidity / High Cost (RED)
 */
export function describeFriction(frictionScore: number): FrictionStatus {
  // Directive 11.4H.2: Normalize friction to 0-100 scale if needed
  const normalizedScore = frictionScore > 1 ? frictionScore : frictionScore * 100;
  
  if (normalizedScore <= 30) {
    return { 
      value: normalizedScore, 
      status: 'High Liquidity / Low Cost', 
      color: 'green', 
      emoji: '🟢',
      narrative: 'High liquidity — trades are easy to enter and exit with very small price changes. Orders fill quickly, spreads are tight, and the system can use full position sizes safely. You can expect smoother performance and smaller differences between entry and exit prices.'
    };
  }
  if (normalizedScore <= 70) {
    return { 
      value: normalizedScore, 
      status: 'Moderate Liquidity', 
      color: 'orange', 
      emoji: '🟠',
      narrative: 'Moderate liquidity — conditions are average and stable. Most trades execute at expected prices, but small slippage may occur. The system operates normally with standard position sizes.'
    };
  }
  return { 
    value: normalizedScore, 
    status: 'Low Liquidity / High Cost', 
    color: 'red', 
    emoji: '🔴',
    narrative: 'Low liquidity — markets are difficult to trade safely. Price jumps and execution delays are common, and signals may be paused temporarily. The system minimizes new entries until conditions stabilize.'
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

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4B — Friction Visual Mapping for Table Columns (M25 Governance)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Maps friction score to label and color for UI column rendering.
 * Called at serialization time for signals and trades before returning to client.
 * 
 * @param score - Friction score 0-100
 * @returns Object with label (e.g., "25: Normal Liquidity") and color
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface FrictionVisual {
  label: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
}

/**
 * Directive 11.4H.2 Task 2: Updated friction visual mapping
 * Color rules: Green ≤ 0.3 (30), Orange 0.3–0.7 (30-70), Red > 0.7 (70+)
 */
export function mapFrictionVisual(score: number): FrictionVisual {
  // Directive 11.4H.2: Handle both 0-1 and 0-100 scales
  const normalizedScore = score > 1 ? score : Math.round(score * 100);
  
  if (normalizedScore <= 30) return { label: `${normalizedScore}: High Liquidity / Low Cost`, color: 'green' };
  if (normalizedScore <= 70) return { label: `${normalizedScore}: Moderate Liquidity`, color: 'orange' };
  return { label: `${normalizedScore}: Low Liquidity / High Cost`, color: 'red' };
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H Task 2 — Adaptive Percentile Friction Tiers
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Replaces static friction thresholds with adaptive percentile-based scaling.
 * Target distribution: GREEN ≈ 30%, ORANGE ≈ 40%, RED ≈ 30%
 * 
 * @param spreads - Array of spread values from all pairs
 * @returns Percentile bands for friction tier assignment
 * ══════════════════════════════════════════════════════════════════════════════
 */
export interface FrictionBands {
  lowThreshold: number;  // 30th percentile
  highThreshold: number; // 70th percentile
  distribution: { green: number; orange: number; red: number };
  sampleSize: number;
  timestamp: number;
}

let cachedFrictionBands: FrictionBands | null = null;
const FRICTION_BAND_TTL_MS = 60_000; // 1 minute cache

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Directive 11.4H Task 2: Compute adaptive friction bands from spread data
 * Directive 11.4H.1 Task 3: Handle small datasets and TTL invalidation
 */
const DEFAULT_FRICTION_BANDS: FrictionBands = {
  lowThreshold: 0.001, // 0.1%
  highThreshold: 0.003, // 0.3%
  distribution: { green: 30, orange: 40, red: 30 },
  sampleSize: 0,
  timestamp: 0
};

// Directive 11.4H.3 Task 2: Pair-level friction audit cycle counter
let frictionAuditCycleId = 0;

export function computeAdaptiveFrictionBands(spreads: number[]): FrictionBands {
  // Directive 11.4H.1 Task 3: TTL invalidation - check if cache is stale
  if (cachedFrictionBands && Date.now() - cachedFrictionBands.timestamp > FRICTION_BAND_TTL_MS) {
    console.debug(`[11.4H.1][Friction] Cache expired (TTL=${FRICTION_BAND_TTL_MS}ms), recomputing...`);
    cachedFrictionBands = null;
  }
  
  if (spreads.length === 0) {
    return {
      lowThreshold: DEFAULT_SPREAD * 0.5,
      highThreshold: DEFAULT_SPREAD * 1.5,
      distribution: { green: 0, orange: 0, red: 0 },
      sampleSize: 0,
      timestamp: Date.now()
    };
  }

  // Directive 11.4H.1 Task 3: Skip adaptive calculation for small samples (<10 pairs)
  if (spreads.length < 10) {
    console.debug(`[11.4H.1][Friction] Small sample size (${spreads.length}<10), using default bands`);
    return { ...DEFAULT_FRICTION_BANDS, sampleSize: spreads.length, timestamp: Date.now() };
  }

  const low = percentile(spreads, 30);
  const high = percentile(spreads, 70);

  // Count distribution
  let green = 0, orange = 0, red = 0;
  for (const spread of spreads) {
    if (spread <= low) green++;
    else if (spread <= high) orange++;
    else red++;
  }

  const bands: FrictionBands = {
    lowThreshold: low,
    highThreshold: high,
    distribution: { 
      green: Math.round((green / spreads.length) * 100),
      orange: Math.round((orange / spreads.length) * 100),
      red: Math.round((red / spreads.length) * 100)
    },
    sampleSize: spreads.length,
    timestamp: Date.now()
  };

  // Cache for reuse
  cachedFrictionBands = bands;

  // Directive 11.4H.1 Task 3: Log percentile boundaries
  console.debug(`[FrictionBands] Low=${low.toFixed(4)} High=${high.toFixed(4)} (Pairs=${spreads.length})`);
  console.log(`[11.4H][Friction] Adaptive bands computed: GREEN<=${(low * 100).toFixed(3)}%, ORANGE<=${(high * 100).toFixed(3)}%, distribution=${bands.distribution.green}/${bands.distribution.orange}/${bands.distribution.red}%`);

  return bands;
}

/**
 * Directive 11.4H.3 Task 2: Pair-Level Friction Diagnostic Logging
 * Logs detailed friction data for each pair in a scan cycle.
 * 
 * @param pairs - Array of pair data with spread, mid price, and symbol
 * @param bands - Current friction bands for tier assignment
 */
export function logPairFrictionAudit(
  pairs: Array<{ symbol: string; spread: number; mid: number }>,
  bands?: FrictionBands
): void {
  frictionAuditCycleId++;
  const activeBands = bands || cachedFrictionBands || DEFAULT_FRICTION_BANDS;
  
  console.log(`[FrictionAudit] Cycle ${frictionAuditCycleId} - Pair Count: ${pairs.length}`);
  
  // Log first 10 pairs for brevity (full log would be too verbose)
  const sampleSize = Math.min(pairs.length, 10);
  for (let i = 0; i < sampleSize; i++) {
    const p = pairs[i];
    const frictionScore = p.mid > 0 ? Math.round((p.spread / p.mid) * 10000 / 3) : 0;
    const tier = getAdaptiveFrictionTier(p.spread, activeBands);
    const label = mapFrictionVisual(frictionScore).label;
    console.log(`[FrictionAudit] ${p.symbol} | spread=${(p.spread * 100).toFixed(4)}% | mid=${p.mid.toFixed(4)} | friction=${frictionScore} | tier=${tier} | label="${label}"`);
  }
  
  if (pairs.length > sampleSize) {
    console.log(`[FrictionAudit] ... and ${pairs.length - sampleSize} more pairs`);
  }
  
  console.log(`[FrictionAudit] Band thresholds: Green<=${(activeBands.lowThreshold * 100).toFixed(4)}%, Orange<=${(activeBands.highThreshold * 100).toFixed(4)}%`);
}

/**
 * Directive 11.4H Task 2: Get friction tier using adaptive percentile bands
 */
export type FrictionTier = 'GREEN' | 'ORANGE' | 'RED';

export function getAdaptiveFrictionTier(spread: number, bands?: FrictionBands): FrictionTier {
  const activeBands = bands || cachedFrictionBands;
  
  if (!activeBands) {
    // Fallback to static thresholds if no bands computed yet
    if (spread <= 0.001) return 'GREEN';
    if (spread <= 0.003) return 'ORANGE';
    return 'RED';
  }

  if (spread <= activeBands.lowThreshold) return 'GREEN';
  if (spread <= activeBands.highThreshold) return 'ORANGE';
  return 'RED';
}

/**
 * Directive 11.4H Task 2: Get cached friction bands
 */
export function getCachedFrictionBands(): FrictionBands | null {
  if (cachedFrictionBands && Date.now() - cachedFrictionBands.timestamp < FRICTION_BAND_TTL_MS) {
    return cachedFrictionBands;
  }
  return null;
}
