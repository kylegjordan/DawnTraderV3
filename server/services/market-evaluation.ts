/**
 * Market Evaluation Service - UI Analytics Only
 * 
 * Phase 38.1 - Unified Filtering & Insights Refactor
 * Phase 9.8.C - Migrated from FilteredPairsService to UnifiedFilterGateway
 * 
 * This service provides market evaluation for UI analytics ONLY:
 * - Filtered Pairs tab (UI display)
 * - Filtered Insights tab (UI display)
 * - AI analytics display
 * - Health monitor (diagnostics)
 * 
 * NOTE: Signal generation uses activeFilterPool.getActivePool() directly,
 * NOT this service. See signal-orchestrator.ts and vts-runner.ts.
 */

import { unifiedFilterGateway, type UnifiedFilterResult } from './unified-filter-gateway.js';
import type { ScreenerFilters } from '@shared/schema';

export interface FilteredPairResult {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  currentPrice: number;
  volume24h: number;
  dailyRange: number;
  vwap: number | null;
  lastUpdate: Date;
}

export interface MarketEvaluationResult {
  universeCount: number;
  eligiblePairs: FilteredPairResult[];
  ineligibleCount: number;
  computedAt: string;
}

interface CachedEvaluation {
  data: MarketEvaluationResult;
  timestamp: number;
}

const CACHE_TTL_MS = 15 * 1000;

/**
 * Single Source of Truth for market evaluation
 * Phase 9.8.C: Now uses UnifiedFilterGateway (backed by ActiveFilterPool)
 */
export class MarketEvaluationService {
  private cache: Map<string, CachedEvaluation> = new Map();

  /**
   * Evaluate market once and return eligible pairs
   * Uses 15-second cache for stability between requests
   * 
   * Phase 9.8.C: Filters parameter is kept for API compatibility but
   * filtering is now done by FX5 Scanner -> ActiveFilterPool
   * 
   * @param mode - Trading mode (live or paper)
   * @param _filters - Screener filters (for compatibility, not used)
   * @returns Market evaluation with eligible pairs
   */
  async evaluateMarketOnce(
    mode: 'live' | 'paper',
    _filters: ScreenerFilters
  ): Promise<MarketEvaluationResult> {
    const cacheKey = mode;
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`[MarketEval] Cache hit for ${mode} (age: ${now - cached.timestamp}ms)`);
      return cached.data;
    }

    console.log(`[MarketEval][9.8.C] Evaluating market for ${mode} via UnifiedFilterGateway...`);
    const stats = await unifiedFilterGateway.getValidPairs(mode);

    const eligiblePairs: FilteredPairResult[] = stats.filteredPairs.map(pair => ({
      symbol: pair.symbol,
      baseCurrency: pair.baseCurrency,
      quoteCurrency: pair.quoteCurrency,
      currentPrice: pair.currentPrice,
      volume24h: pair.volume24h,
      dailyRange: pair.dailyRange,
      vwap: pair.vwap,
      lastUpdate: pair.lastUpdate
    }));

    const result: MarketEvaluationResult = {
      universeCount: stats.totalPairs,
      eligiblePairs,
      ineligibleCount: stats.totalPairs - stats.eligiblePairs,
      computedAt: new Date().toISOString()
    };

    this.cache.set(cacheKey, { data: result, timestamp: now });
    console.log(`[MarketEval][9.8.C] Evaluated ${result.eligiblePairs.length}/${result.universeCount} eligible pairs for ${mode}`);

    return result;
  }

  /**
   * Clear cache for a specific mode (clears all filter variations)
   */
  clearCache(mode?: 'live' | 'paper'): void {
    if (mode) {
      this.cache.delete(mode);
      console.log(`[MarketEval] Cache cleared for ${mode}`);
    } else {
      this.cache.clear();
      console.log(`[MarketEval] All caches cleared`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { mode: string; ageMs: number }[] {
    const now = Date.now();
    return Array.from(this.cache.entries()).map(([mode, cached]) => ({
      mode,
      ageMs: now - cached.timestamp
    }));
  }
}

let instance: MarketEvaluationService | null = null;

export function getMarketEvaluationService(): MarketEvaluationService {
  if (!instance) {
    instance = new MarketEvaluationService();
  }
  return instance;
}
