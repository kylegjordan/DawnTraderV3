/**
 * Directive 9.8.C - Unified Filter Gateway
 * 
 * Single source of truth for filtered pair data.
 * Replaces legacy FilteredPairsService with ActiveFilterPool.
 * 
 * Used for:
 * - UI analytics (Filtered Pairs tab, Filter Insights)
 * - Signal generation (via activeFilterPool directly)
 * - Health monitoring
 * 
 * Fallback: When ActiveFilterPool is empty (cold start or before FX5 scanner runs),
 * falls back to Kraken API to fetch eligible pairs directly.
 */

import { activeFilterPool, type ActiveFilteredPair } from './active-filter-pool.js';
import { storage } from '../storage.js';
import { KrakenService } from '../exchanges/kraken/kraken.js';

export interface UnifiedFilterResult {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  currentPrice: number;
  volume24h: number;
  dailyRange: number;
  vwap: number | null;
  lastUpdate: Date;
}

export interface UnifiedFilterStats {
  totalPairs: number;
  eligiblePairs: number;
  filteredPairs: UnifiedFilterResult[];
  lastScanAt: Date;
  nextScanAt: Date;
  dataFreshness: 'fresh' | 'stale' | 'expired';
  freshnessAgeMs: number;
  source: 'active_pool';
}

const FRESHNESS_THRESHOLD_MS = 5 * 60 * 1000;
const SCAN_INTERVAL_MS = 60 * 1000;

class UnifiedFilterGateway {
  private lastScanTime: Map<string, number> = new Map();
  private krakenService: KrakenService;
  private fallbackCache: Map<string, { data: UnifiedFilterResult[]; timestamp: number }> = new Map();
  private FALLBACK_CACHE_TTL_MS = 60 * 1000;
  
  constructor() {
    this.krakenService = new KrakenService();
  }
  
  /**
   * Get valid filtered pairs from ActiveFilterPool with Kraken fallback
   * This replaces FilteredPairsService.getValidPairs()
   */
  async getValidPairs(
    mode: 'live' | 'paper',
    forceRefresh = false
  ): Promise<UnifiedFilterStats> {
    const now = Date.now();
    
    activeFilterPool.initialize();
    
    let activePairs = activeFilterPool.getActivePool(mode);
    
    if (activePairs.length === 0) {
      console.log(`[9.8.C][UnifiedFilter] Pool empty for ${mode} - hydrating from Kraken API`);
      
      await this.hydratePoolFromKraken(mode, forceRefresh);
      activePairs = activeFilterPool.getActivePool(mode);
      
      if (activePairs.length > 0) {
        console.log(`[9.8.C][UnifiedFilter] Pool hydrated successfully: ${activePairs.length} pairs`);
      }
    }
    
    const filteredPairs: UnifiedFilterResult[] = activePairs.map(pair => {
      const [base, quote] = this.parseSymbol(pair.symbol);
      return {
        symbol: pair.symbol,
        baseCurrency: base,
        quoteCurrency: quote,
        currentPrice: pair.price,
        volume24h: pair.volume24h,
        dailyRange: pair.dailyRange,
        vwap: null,
        lastUpdate: new Date(pair.lastUpdated)
      };
    });

    const oldestEntry = activePairs.reduce((oldest, pair) => {
      const pairTime = new Date(pair.lastUpdated).getTime();
      return pairTime < oldest ? pairTime : oldest;
    }, now);

    const freshnessAgeMs = now - oldestEntry;
    let dataFreshness: 'fresh' | 'stale' | 'expired' = 'fresh';
    if (freshnessAgeMs > FRESHNESS_THRESHOLD_MS * 2) {
      dataFreshness = 'expired';
    } else if (freshnessAgeMs > FRESHNESS_THRESHOLD_MS) {
      dataFreshness = 'stale';
    }

    const lastScan = this.lastScanTime.get(mode) || now;
    this.lastScanTime.set(mode, now);

    const universeCount = await this.getUniverseCount(mode);

    return {
      totalPairs: universeCount,
      eligiblePairs: filteredPairs.length,
      filteredPairs,
      lastScanAt: new Date(lastScan),
      nextScanAt: new Date(now + SCAN_INTERVAL_MS),
      dataFreshness,
      freshnessAgeMs,
      source: 'active_pool' as const
    };
  }

  /**
   * Hydrate ActiveFilterPool from Kraken API when empty (cold start)
   * This ensures all consumers (trading + UI) use the same source
   */
  private async hydratePoolFromKraken(mode: 'live' | 'paper', forceRefresh: boolean): Promise<void> {
    const now = Date.now();
    const cacheKey = `hydrate_${mode}`;
    
    if (!forceRefresh) {
      const cached = this.fallbackCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < this.FALLBACK_CACHE_TTL_MS) {
        console.log(`[9.8.C][UnifiedFilter] Hydration recently completed (age: ${now - cached.timestamp}ms)`);
        return;
      }
    }

    try {
      // B79.0n.STORAGE (2026-05-21 + Langston Step 4 reclassification): runtime
      // crypto-routing path — feeds krakenService.getEligiblePairs(...) and writes
      // to activeFilterPool.addSurvivors(...). Use explicit crypto_spot per
      // (a) crypto-intentional category, NOT the canonical-baseline helper.
      const filters = await storage.getScreenerFilters({ mode, assetClass: 'crypto_spot', filterPath: 'active_quant' });
      if (!filters) {
        console.log(`[9.8.C][UnifiedFilter] No screener filters for ${mode}, skipping hydration`);
        return;
      }

      console.log(`[9.8.C][UnifiedFilter] Hydrating pool from Kraken API for ${mode}...`);
      const eligiblePairs = await this.krakenService.getEligiblePairs({
        minVolume: filters.minVolume ?? "1000000.00",
        minDailyRange: "0",
        minPrice: filters.minPrice ?? "0.01",
        maxPrice: filters.maxPrice ?? "10000.00",
        maxBidAskSpread: filters.maxBidAskSpread ?? "1.00",
        minMarketCap: filters.minMarketCap ?? "100000000.00",
        excludeStablecoins: filters.excludeStablecoins ?? true,
        blacklistedSymbols: [],
        whitelistedSymbols: [],
        volatilityMin: filters.volatilityMin ?? "0.50",
        volatilityMax: filters.volatilityMax ?? "5.00",
        rsiMin: filters.rsiMin ?? 30,
        rsiMax: filters.rsiMax ?? 70,
        minLiquidity: filters.minLiquidity ?? "500000.00",
        allowRegulatedOnly: filters.allowRegulatedOnly ?? false,
        universeSize: filters.universeSize ?? 100,
        activeTimeframes: ["5m", "15m", "1h"]
      });

      const survivors = eligiblePairs.map((pair: any) => ({
        symbol: pair.symbol,
        currentPrice: pair.price || pair.currentPrice || 0,
        volume24h: pair.volume24h || pair.volume || 0,
        dailyRange: pair.dailyRange || 0
      }));

      const result = activeFilterPool.addSurvivors(mode, survivors, true);
      console.log(`[9.8.C][UnifiedFilter] Pool hydrated: added=${result.added}, updated=${result.updated}, skipped=${result.skipped}`);
      
      this.fallbackCache.set(cacheKey, { data: [], timestamp: now });
    } catch (error) {
      console.error(`[9.8.C][UnifiedFilter] Pool hydration failed:`, error);
    }
  }

  /**
   * Get universe count from screener filters or default
   */
  private async getUniverseCount(mode: 'live' | 'paper'): Promise<number> {
    try {
      // B79.0n.STORAGE (2026-05-21 + Langston Step 4 reclassification): drives the
      // crypto pool-sizing path; explicit crypto_spot per (a) category.
      const filters = await storage.getScreenerFilters({ mode, assetClass: 'crypto_spot', filterPath: 'active_quant' });
      return filters?.universeSize || 100;
    } catch {
      return 100;
    }
  }

  /**
   * Parse symbol into base and quote currencies
   */
  private parseSymbol(symbol: string): [string, string] {
    if (symbol.includes('/')) {
      const [base, quote] = symbol.split('/');
      return [base, quote];
    }
    
    const quoteCurrencies = ['USDT', 'USDC', 'EUR', 'USD', 'BTC', 'ETH', 'GBP'];
    for (const quote of quoteCurrencies) {
      if (symbol.endsWith(quote)) {
        const base = symbol.slice(0, -quote.length);
        return [base, quote];
      }
    }
    
    return [symbol, 'USD'];
  }

  /**
   * Check if a symbol is in the active pool
   */
  hasSymbol(symbol: string, mode: 'live' | 'paper'): boolean {
    return activeFilterPool.hasSymbol(symbol, mode);
  }

  /**
   * Get volume info for a symbol
   */
  getSymbolVolumeInfo(symbol: string, mode: 'live' | 'paper') {
    return activeFilterPool.getSymbolVolumeInfo(symbol, mode);
  }

  /**
   * Get pool size
   */
  getPoolSize(mode: 'live' | 'paper'): number {
    return activeFilterPool.getActivePool(mode).length;
  }

  /**
   * Get raw active pairs (for diagnostics)
   */
  getActivePairs(mode: 'live' | 'paper'): ActiveFilteredPair[] {
    return activeFilterPool.getActivePool(mode);
  }
}

export const unifiedFilterGateway = new UnifiedFilterGateway();
export { UnifiedFilterGateway };
