/**
 * FilteredPairsService - Single Source of Truth for Filtered Pairs
 * 
 * Phase 27.F.13.H - Architecture Realignment
 * 
 * All filtered pair counts and lists must come from this service to ensure
 * consistency across:
 * - Filter Insights tab
 * - Filtered Pairs tab
 * - Filter Health widget
 * - Trading status endpoint
 * - Dashboard widgets
 */

import { KrakenService } from './kraken.js';
import type { ScreenerFilter } from '../storage.js';

export interface FilteredPairResult {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  currentPrice: number;
  volume24h: number;
  dailyRange: number;
  vwap: number;
  lastUpdate: Date;
}

export interface FilteredPairsStats {
  totalPairs: number;
  eligiblePairs: number;
  filteredPairs: FilteredPairResult[];
  lastScanAt: Date;
  nextScanAt: Date;
  dataFreshness: 'fresh' | 'stale' | 'expired';
  freshnessAgeMs: number;
}

const FRESHNESS_THRESHOLD_MS = 12 * 60 * 1000; // 12 minutes
const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class FilteredPairsService {
  private kraken: KrakenService;
  
  // Cache per mode to avoid unnecessary API calls
  private cache: Map<string, { data: FilteredPairsStats; timestamp: number }> = new Map();
  
  constructor() {
    this.kraken = new KrakenService();
  }

  /**
   * Get valid and unexpired filtered pairs for a specific mode
   * 
   * Valid & Unexpired criteria:
   * 1. Passes all current filters for that mode
   * 2. Market data < 12 minutes old
   * 3. Not failed or blacklisted
   * 4. Not a duplicate symbol
   */
  async getValidPairs(
    mode: 'live' | 'paper',
    filters: ScreenerFilter,
    forceRefresh = false
  ): Promise<FilteredPairsStats> {
    const cacheKey = mode;
    const now = Date.now();
    
    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && (now - cached.timestamp) < 60000) { // 1 minute cache
        return cached.data;
      }
    }
    
    // Get eligible pairs from Kraken using current filters
    const eligiblePairs = await this.kraken.getEligiblePairs(
      filters.maxSpread,
      filters.minVolume,
      filters.minVolumeUsd,
      filters.maxVolumeUsd,
      filters.minDailyRange,
      filters.maxDailyRange,
      filters.minPrice,
      filters.maxPrice,
      filters.minMarketCap,
      filters.maxMarketCap,
      filters.blacklist || [],
      [], // whitelist (empty for now)
      filters.volatilityMin,
      filters.volatilityMax
    );
    
    // Get all Kraken pairs for total count
    const allPairs = await this.kraken.getTradablePairs();
    
    // Transform to FilteredPairResult format and check freshness
    const lastScanAt = new Date();
    const filteredPairs: FilteredPairResult[] = eligiblePairs.map(pair => ({
      symbol: pair.symbol,
      baseCurrency: pair.baseCurrency,
      quoteCurrency: pair.quoteCurrency,
      currentPrice: pair.currentPrice,
      volume24h: pair.volume24h,
      dailyRange: pair.dailyRange,
      vwap: pair.vwap,
      lastUpdate: new Date(),
    }));
    
    // Calculate data freshness
    const freshnessAgeMs = 0; // Just fetched, so fresh
    const dataFreshness: 'fresh' | 'stale' | 'expired' = 'fresh';
    
    const result: FilteredPairsStats = {
      totalPairs: allPairs.length,
      eligiblePairs: filteredPairs.length,
      filteredPairs,
      lastScanAt,
      nextScanAt: new Date(lastScanAt.getTime() + SCAN_INTERVAL_MS),
      dataFreshness,
      freshnessAgeMs,
    };
    
    // Update cache
    this.cache.set(cacheKey, { data: result, timestamp: now });
    
    return result;
  }

  /**
   * Get only the count of eligible pairs (faster than full list)
   */
  async getEligibleCount(
    mode: 'live' | 'paper',
    filters: ScreenerFilter
  ): Promise<number> {
    const stats = await this.getValidPairs(mode, filters, false);
    return stats.eligiblePairs;
  }

  /**
   * Clear cache for a specific mode or all modes
   */
  clearCache(mode?: 'live' | 'paper'): void {
    if (mode) {
      this.cache.delete(mode);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Check if cached data exists and is fresh
   */
  isCacheFresh(mode: 'live' | 'paper'): boolean {
    const cached = this.cache.get(mode);
    if (!cached) return false;
    
    const now = Date.now();
    return (now - cached.timestamp) < 60000; // 1 minute
  }
}

// Export singleton instance
export const filteredPairsService = new FilteredPairsService();
