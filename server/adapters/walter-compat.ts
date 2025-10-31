/**
 * Walter Compatibility Adapter
 * 
 * Phase 38.4 - Unified Filtering & Insights Refactor
 * 
 * Bridges the new Market Evaluation SSOT to Walter analytics system.
 * Provides backward compatibility while using the unified filtering logic.
 * 
 * Feature Flag: WALTER_COMPAT_MODE
 * - true: Use this adapter (compatibility mode)
 * - false: Direct SSOT access
 */

import { getMarketEvaluationService, type MarketEvaluationResult } from '../services/market-evaluation.js';
import type { ScreenerFilters } from '@shared/schema';

export interface WalterFilteredInsights {
  eligiblePairs: Array<{
    symbol: string;
    price: number;
    volume24h: number;
    dailyRange: number;
    reasons: string[];
  }>;
  universeEvaluated: number;
  eligibleCount: number;
  ineligibleCount: number;
  computedAt: string;
  dataFreshness: 'fresh' | 'stale';
}

/**
 * Get filtered insights formatted for Walter analytics
 * 
 * @param mode - Trading mode (live or paper)
 * @param filters - Screener filters to apply
 * @returns Filtered insights in Walter-compatible format
 */
export async function getFilteredInsightsForWalter(
  mode: 'live' | 'paper',
  filters: ScreenerFilters
): Promise<WalterFilteredInsights> {
  const marketEval = getMarketEvaluationService();
  const result = await marketEval.evaluateMarketOnce(mode, filters);

  // Transform to Walter-compatible format
  const walterInsights: WalterFilteredInsights = {
    eligiblePairs: result.eligiblePairs.map(pair => ({
      symbol: pair.symbol,
      price: pair.currentPrice,
      volume24h: pair.volume24h,
      dailyRange: pair.dailyRange,
      reasons: [] // SSOT doesn't track individual filter reasons
    })),
    universeEvaluated: result.universeCount,
    eligibleCount: result.eligiblePairs.length,
    ineligibleCount: result.ineligibleCount,
    computedAt: result.computedAt,
    dataFreshness: 'fresh' // 15s cache always returns fresh data
  };

  console.log(`[WalterCompat] Generated insights for ${mode}: ${walterInsights.eligibleCount}/${walterInsights.universeEvaluated} pairs`);
  return walterInsights;
}

/**
 * Get current walter compat mode setting
 * Defaults to true for backward compatibility
 */
export function isWalterCompatMode(): boolean {
  return process.env.WALTER_COMPAT_MODE !== 'false';
}

/**
 * Log walter compat mode status
 */
export function logWalterCompatStatus(): void {
  const mode = isWalterCompatMode();
  console.log(`[WalterCompat] Mode: ${mode ? 'ENABLED (compatibility)' : 'DISABLED (direct SSOT)'}`);
}
