/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3B — In-Memory Cost Cache
 * Directive 11.4H.4 — Extended TTL for friction coverage
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Ultra-lightweight in-memory cache for cost metrics.
 * - TTL: 300 seconds (5 minutes) per Directive 11.4H.4
 * - Pure in-memory (nanosecond lookups)
 * - Clamps values to safe ranges
 * - Single source of cost truth across entire runtime
 * - Auto-prunes expired entries on enumeration
 * 
 * Governance Invariants:
 * - C1: Single cache source for all modules
 * - C3: Max bounds ≤ 1%
 * - C4: Cache TTL = 300s per 11.4H.4 (previously 60s)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  MAX_COST_BOUND,
  DEFAULT_SLIPPAGE,
  DEFAULT_SPREAD,
} from '../../config/exchange-defaults.js';
// B-4.5: the cache's default fee is DB-resolved (module_constants 'fee_model',
// warmed at boot, fail-hard). DEFAULT_TAKER_FEE + DEFAULT_COST_BUNDLE retired.
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

// The symbol cache is structurally crypto-lane only — getCachedCostMetrics
// (cost-model.ts) consults it solely for crypto_spot; xStock synthesizes from
// the friction merge. Hence the crypto_spot key here.
function resolveCryptoTakerFee(): number {
  return getCachedNumberRequired('fee_model', 'spot_taker_fee', {
    exchange: '*', assetClass: 'crypto_spot', strategy: '*', regime: '*',
  });
}

export interface CostMetrics {
  fee: number;
  slippage: number;
  spread: number;
}

interface CacheEntry {
  v: CostMetrics;
  t: number;
}

const CACHE_TTL_MS = 300_000; // Directive 11.4H.4: Extended to 5 minutes for full coverage
const cache = new Map<string, CacheEntry>();

let observabilityInterval: NodeJS.Timeout | null = null;

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.t >= CACHE_TTL_MS;
}

function pruneExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.t >= CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

export function getCostMetrics(symbol: string): CostMetrics | null {
  const item = cache.get(symbol);
  if (item && !isExpired(item)) {
    return item.v;
  }
  if (item && isExpired(item)) {
    cache.delete(symbol);
  }
  return null;
}

export function setCostMetrics(symbol: string, data: Partial<CostMetrics>): CostMetrics {
  const clamped: CostMetrics = {
    fee: Math.min(data.fee ?? resolveCryptoTakerFee(), MAX_COST_BOUND),
    slippage: Math.min(data.slippage ?? DEFAULT_SLIPPAGE, MAX_COST_BOUND),
    spread: Math.min(data.spread ?? DEFAULT_SPREAD, MAX_COST_BOUND),
  };
  cache.set(symbol, { v: clamped, t: Date.now() });
  return clamped;
}

export function getOrSetCostMetrics(symbol: string): CostMetrics {
  const cached = getCostMetrics(symbol);
  if (cached) return cached;
  // B-4.5: DEFAULT_COST_BUNDLE retired (it embedded the static fee).
  return setCostMetrics(symbol, {
    fee: resolveCryptoTakerFee(),
    slippage: DEFAULT_SLIPPAGE,
    spread: DEFAULT_SPREAD,
  });
}

export function getCacheTTLRemaining(symbol: string): number {
  const item = cache.get(symbol);
  if (!item) return 0;
  if (isExpired(item)) {
    cache.delete(symbol);
    return 0;
  }
  const remaining = CACHE_TTL_MS - (Date.now() - item.t);
  return Math.max(0, Math.floor(remaining / 1000));
}

export function getCacheSize(): number {
  pruneExpiredEntries();
  return cache.size;
}

export function getAllCachedSymbols(): string[] {
  pruneExpiredEntries();
  return Array.from(cache.keys());
}

export function getCacheStats(): {
  symbolCount: number;
  avgFee: number;
  avgSlippage: number;
  avgSpread: number;
} {
  pruneExpiredEntries();
  
  const entries = Array.from(cache.values());
  if (entries.length === 0) {
    return {
      symbolCount: 0,
      avgFee: resolveCryptoTakerFee(),
      avgSlippage: DEFAULT_SLIPPAGE,
      avgSpread: DEFAULT_SPREAD,
    };
  }

  const sumFee = entries.reduce((sum, e) => sum + e.v.fee, 0);
  const sumSlippage = entries.reduce((sum, e) => sum + e.v.slippage, 0);
  const sumSpread = entries.reduce((sum, e) => sum + e.v.spread, 0);

  return {
    symbolCount: entries.length,
    avgFee: sumFee / entries.length,
    avgSlippage: sumSlippage / entries.length,
    avgSpread: sumSpread / entries.length,
  };
}

export function clearCostCache(): void {
  cache.clear();
  console.log('[11.3B][CostCache] Cache cleared');
}

export function startObservabilityLoop(): void {
  if (observabilityInterval) return;
  
  observabilityInterval = setInterval(() => {
    pruneExpiredEntries();
    const stats = getCacheStats();
    if (stats.symbolCount > 0) {
      console.log(
        `[CostEngine] avgFee=${(stats.avgFee * 100).toFixed(2)}% ` +
        `avgSlip=${(stats.avgSlippage * 100).toFixed(2)}% ` +
        `avgSpread=${(stats.avgSpread * 100).toFixed(2)}% ` +
        `(symbols=${stats.symbolCount})`
      );
    }
  }, 60_000);
  
  console.log('[11.3B][CostCache] Observability loop started (60s interval)');
}

export function stopObservabilityLoop(): void {
  if (observabilityInterval) {
    clearInterval(observabilityInterval);
    observabilityInterval = null;
    console.log('[11.3B][CostCache] Observability loop stopped');
  }
}

export function setEntryTimestamp(symbol: string, timestamp: number): void {
  const item = cache.get(symbol);
  if (item) {
    item.t = timestamp;
  }
}

export { CACHE_TTL_MS, MAX_COST_BOUND };
