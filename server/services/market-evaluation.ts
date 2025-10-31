/**
 * Market Evaluation Service - Single Source of Truth (SSOT)
 * 
 * Phase 38.1 - Unified Filtering & Insights Refactor
 * 
 * This service provides the authoritative market evaluation used by:
 * - SignalOrchestrator (trading engine)
 * - Filtered Pairs tab
 * - Filtered Insights tab
 * - Walter analytics
 * 
 * Eliminates discrepancy between FilteredPairsService (17 pairs) and
 * PaperSimDiagnosticService (662 pairs) by using one evaluation method.
 */

import { FilteredPairsService, type FilteredPairResult } from './filtered-pairs-service.js';
import type { ScreenerFilters } from '@shared/schema';

export interface MarketEvaluationResult {
  universeCount: number;
  eligiblePairs: FilteredPairResult[];
  ineligibleCount: number;
  computedAt: string; // ISO date string
}

interface CachedEvaluation {
  data: MarketEvaluationResult;
  timestamp: number;
}

const CACHE_TTL_MS = 15 * 1000; // 15 seconds as specified in directive

/**
 * Single Source of Truth for market evaluation
 * Uses FilteredPairsService internally to ensure identical filtering
 * as SignalOrchestrator
 */
export class MarketEvaluationService {
  private filteredPairsService: FilteredPairsService;
  private cache: Map<string, CachedEvaluation> = new Map();

  constructor() {
    this.filteredPairsService = new FilteredPairsService();
  }

  /**
   * Evaluate market once and return eligible pairs
   * Uses 15-second cache for stability between requests
   * 
   * @param mode - Trading mode (live or paper)
   * @param filters - Screener filters to apply
   * @returns Market evaluation with eligible pairs
   */
  async evaluateMarketOnce(
    mode: 'live' | 'paper',
    filters: ScreenerFilters
  ): Promise<MarketEvaluationResult> {
    // Include filter hash in cache key to prevent cross-user contamination
    const filterHash = JSON.stringify({
      quoteCurrencies: filters.quoteCurrencies || [],
      minVolume: filters.minVolume || null,
      minPrice: filters.minPrice || null,
      maxBidAskSpread: filters.maxBidAskSpread || null,
      excludeStablecoins: filters.excludeStablecoins || null
    });
    const cacheKey = `${mode}:${filterHash}`;
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      console.log(`[MarketEval] Cache hit for ${mode} (age: ${now - cached.timestamp}ms)`);
      return cached.data;
    }

    // Fetch from FilteredPairsService (same logic as SignalOrchestrator)
    console.log(`[MarketEval] Evaluating market for ${mode}...`);
    const stats = await this.filteredPairsService.getValidPairs(mode, filters, true);

    const result: MarketEvaluationResult = {
      universeCount: stats.totalPairs,
      eligiblePairs: stats.filteredPairs,
      ineligibleCount: stats.totalPairs - stats.eligiblePairs,
      computedAt: new Date().toISOString()
    };

    // Update cache
    this.cache.set(cacheKey, { data: result, timestamp: now });
    console.log(`[MarketEval] Evaluated ${result.eligiblePairs.length}/${result.universeCount} eligible pairs for ${mode}`);

    return result;
  }

  /**
   * Clear cache for a specific mode (clears all filter variations)
   */
  clearCache(mode?: 'live' | 'paper'): void {
    if (mode) {
      // Clear all cache entries for this mode
      const keysToDelete: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${mode}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.cache.delete(key));
      console.log(`[MarketEval] Cache cleared for ${mode} (${keysToDelete.length} entries)`);
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

// Singleton instance
let instance: MarketEvaluationService | null = null;

export function getMarketEvaluationService(): MarketEvaluationService {
  if (!instance) {
    instance = new MarketEvaluationService();
  }
  return instance;
}
