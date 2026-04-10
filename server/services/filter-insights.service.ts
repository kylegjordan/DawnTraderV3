/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.9C — Filter Insights Service (Rolling 24h Window)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Captures and emits telemetry for all pre-signal filter outcomes.
 * Provides traceable insights for why pairs were filtered out.
 * 
 * 10.9C Changes:
 * - Rolling 24-hour window aggregation (continuous, not daily reset)
 * - Deprecated: RSI, Risk/Volatility (removed from backend)
 * - Active Institutional Math Guards: LQ, VolNoise, Correlation (ρ)
 * 
 * Pre-Signal Filters Tracked (10 active):
 * - Volume (min volume threshold)
 * - Liquidity Guard (LQ ≥ 40)
 * - Noise Guard (VolNoise ≤ 0.6)
 * - Correlation Guard (ρ ≤ 0.75)
 * - PriceRange (daily range threshold)
 * - MinPrice (minimum price threshold)
 * - MaxSpread (bid-ask spread limit)
 * - Stablecoin (exclude stablecoins)
 * - QuoteCurrency (allowed quote currencies)
 * - History (minimum trading days)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { FILTER_SCHEMA_VERSION, FILTER_FLAGS } from '../config/system-guards.js';

/**
 * Rolling 24-hour window configuration
 */
const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export interface FilterOutcome {
  filterName: string;
  threshold: string | number;
  actualValue: string | number;
  result: 'passed' | 'failed';
  timestamp: string;
  category: 'pre-signal' | 'scoring';
}

export interface FilterInsightPayload {
  symbol: string;
  mode: 'paper' | 'live';
  outcomes: FilterOutcome[];
  overallResult: 'passed' | 'failed';
  failedFilters: string[];
  phaseDirective: string;
  schemaVersion: string;
  timestamp: string;
}

export interface PreSignalFilterInput {
  symbol: string;
  mode: 'paper' | 'live';
  volume24h?: number;
  minVolume?: number;
  logLiquidity?: number;
  minLiquidity?: number;
  volNoise?: number;
  maxVolNoise?: number;
  correlation?: number;
  maxCorrelation?: number;
  dailyRange?: number;
  minDailyRange?: number;
  quoteCurrency?: string;
  allowedQuotes?: string[];
  price?: number;
  minPrice?: number;
  spread?: number;
  maxSpread?: number;
  isStablecoin?: boolean;
  excludeStablecoins?: boolean;
  historyDays?: number;
  minHistoryDays?: number;
}

/**
 * 10.9F: Active filter names (9 filters)
 * Deprecated: RSI, Risk/Volatility, QuoteCurrency (10.9F)
 */
export const ACTIVE_FILTER_NAMES = [
  'Volume',
  'Liquidity',      // LQ Guard
  'VolNoise',       // Noise Guard
  'Correlation',    // ρ Guard
  'PriceRange',
  'MinPrice',
  'MaxSpread',
  'Stablecoin',
  'History',
] as const;

export type ActiveFilterName = typeof ACTIVE_FILTER_NAMES[number];

/**
 * Filter display labels for UI
 */
// Directive 10.9F: Removed QuoteCurrency label (filter deprecated)
export const FILTER_LABELS: Record<string, string> = {
  'Volume': 'Min Volume',
  'Liquidity': 'Liquidity Guard (LQ ≥ 40)',
  'VolNoise': 'Noise Guard (VolNoise ≤ 0.6)',
  'Correlation': 'Correlation Guard (ρ ≤ 0.75)',
  'PriceRange': 'Min Daily Range',
  'MinPrice': 'Min Price',
  'MaxSpread': 'Max Spread',
  'Stablecoin': 'Exclude Stablecoins',
  'History': 'Min History Days',
};

class FilterInsightsService {
  private insightHistory: FilterInsightPayload[] = [];
  private readonly maxHistory = 5000; // Increased for 24h window support

  /**
   * 10.9C: Prune entries older than 24 hours
   */
  private pruneOldEntries(): void {
    const cutoffTime = Date.now() - ROLLING_WINDOW_MS;
    const cutoffDate = new Date(cutoffTime).toISOString();
    
    const beforeCount = this.insightHistory.length;
    this.insightHistory = this.insightHistory.filter(
      entry => entry.timestamp >= cutoffDate
    );
    
    const pruned = beforeCount - this.insightHistory.length;
    if (pruned > 0) {
      console.log(`[10.9C][FilterInsights] Pruned ${pruned} entries older than 24h`);
    }
  }

  /**
   * Evaluate pre-signal filters and emit telemetry
   * Returns true if all pre-signal filters pass
   */
  evaluatePreSignalFilters(input: PreSignalFilterInput): {
    passed: boolean;
    payload: FilterInsightPayload;
  } {
    const outcomes: FilterOutcome[] = [];
    const failedFilters: string[] = [];
    const now = new Date().toISOString();

    // Volume Filter
    if (input.volume24h !== undefined && input.minVolume !== undefined) {
      const passed = input.volume24h >= input.minVolume;
      outcomes.push({
        filterName: 'Volume',
        threshold: input.minVolume,
        actualValue: input.volume24h,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('Volume');
    }

    // Liquidity Guard (LQ)
    if (input.logLiquidity !== undefined && input.minLiquidity !== undefined) {
      const passed = input.logLiquidity >= input.minLiquidity;
      outcomes.push({
        filterName: 'Liquidity',
        threshold: input.minLiquidity,
        actualValue: input.logLiquidity,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('Liquidity');
    }

    // VolNoise Guard
    if (input.volNoise !== undefined && input.maxVolNoise !== undefined) {
      const passed = input.volNoise <= input.maxVolNoise;
      outcomes.push({
        filterName: 'VolNoise',
        threshold: input.maxVolNoise,
        actualValue: input.volNoise,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('VolNoise');
    }

    // Correlation Guard (ρ) - 10.9C addition
    if (input.correlation !== undefined && input.maxCorrelation !== undefined) {
      const passed = input.correlation <= input.maxCorrelation;
      outcomes.push({
        filterName: 'Correlation',
        threshold: input.maxCorrelation,
        actualValue: input.correlation,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('Correlation');
    }

    // Daily Range Filter
    if (input.dailyRange !== undefined && input.minDailyRange !== undefined) {
      const passed = input.dailyRange >= input.minDailyRange;
      outcomes.push({
        filterName: 'PriceRange',
        threshold: input.minDailyRange,
        actualValue: input.dailyRange,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('PriceRange');
    }

    // Min Price Filter
    if (input.price !== undefined && input.minPrice !== undefined) {
      const passed = input.price >= input.minPrice;
      outcomes.push({
        filterName: 'MinPrice',
        threshold: input.minPrice,
        actualValue: input.price,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('MinPrice');
    }

    // Max Spread Filter
    if (input.spread !== undefined && input.maxSpread !== undefined) {
      const passed = input.spread <= input.maxSpread;
      outcomes.push({
        filterName: 'MaxSpread',
        threshold: input.maxSpread,
        actualValue: input.spread,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('MaxSpread');
    }

    // Stablecoin Filter
    if (input.isStablecoin !== undefined && input.excludeStablecoins !== undefined) {
      const passed = !input.excludeStablecoins || !input.isStablecoin;
      outcomes.push({
        filterName: 'Stablecoin',
        threshold: input.excludeStablecoins ? 'Excluded' : 'Allowed',
        actualValue: input.isStablecoin ? 'Yes' : 'No',
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('Stablecoin');
    }

    // Directive 10.9F: Quote Currency Filter REMOVED - all quote currencies now accepted

    // History Days Filter
    if (input.historyDays !== undefined && input.minHistoryDays !== undefined) {
      const passed = input.historyDays >= input.minHistoryDays;
      outcomes.push({
        filterName: 'History',
        threshold: input.minHistoryDays,
        actualValue: input.historyDays,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('History');
    }

    const payload: FilterInsightPayload = {
      symbol: input.symbol,
      mode: input.mode,
      outcomes,
      overallResult: failedFilters.length === 0 ? 'passed' : 'failed',
      failedFilters,
      phaseDirective: '10.9F',
      schemaVersion: FILTER_SCHEMA_VERSION,
      timestamp: now,
    };

    this.recordInsight(payload);

    return {
      passed: failedFilters.length === 0,
      payload,
    };
  }

  /**
   * Record a filter insight to history
   */
  private recordInsight(payload: FilterInsightPayload): void {
    // 10.9C: Prune old entries before adding new one
    this.pruneOldEntries();
    
    this.insightHistory.push(payload);
    
    // Additional cap to prevent memory bloat
    if (this.insightHistory.length > this.maxHistory) {
      this.insightHistory = this.insightHistory.slice(-this.maxHistory);
    }

    if (payload.overallResult === 'failed') {
      console.log(`[10.9C][FilterInsights] ${payload.symbol} FAILED: ${payload.failedFilters.join(', ')}`);
    }
  }

  /**
   * 10.9C: Get rolling 24h window entries
   * Also prunes stale entries to maintain window accuracy
   */
  private getRolling24hEntries(mode?: 'paper' | 'live'): FilterInsightPayload[] {
    // 10.9C: Prune old entries before computing breakdown
    this.pruneOldEntries();
    
    const cutoffTime = Date.now() - ROLLING_WINDOW_MS;
    const cutoffDate = new Date(cutoffTime).toISOString();
    
    return this.insightHistory.filter(entry => {
      const inWindow = entry.timestamp >= cutoffDate;
      const matchesMode = mode ? entry.mode === mode : true;
      return inWindow && matchesMode;
    });
  }

  /**
   * 10.9C: Get rolling 24h filter breakdown
   */
  getRolling24hBreakdown(mode?: 'paper' | 'live'): {
    totalEvaluated: number;
    passed: number;
    failed: number;
    byFilter: Record<string, { passed: number; failed: number }>;
    windowStart: string;
    windowEnd: string;
    schemaVersion: string;
    phaseDirective: string;
  } {
    const entries = this.getRolling24hEntries(mode);
    const byFilter: Record<string, { passed: number; failed: number }> = {};
    let passed = 0;
    let failed = 0;

    // Initialize all active filters
    for (const filterName of ACTIVE_FILTER_NAMES) {
      byFilter[filterName] = { passed: 0, failed: 0 };
    }

    for (const entry of entries) {
      if (entry.overallResult === 'passed') {
        passed++;
      } else {
        failed++;
      }

      for (const outcome of entry.outcomes) {
        if (!byFilter[outcome.filterName]) {
          byFilter[outcome.filterName] = { passed: 0, failed: 0 };
        }
        if (outcome.result === 'passed') {
          byFilter[outcome.filterName].passed++;
        } else {
          byFilter[outcome.filterName].failed++;
        }
      }
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - ROLLING_WINDOW_MS);

    return {
      totalEvaluated: entries.length,
      passed,
      failed,
      byFilter,
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      schemaVersion: FILTER_SCHEMA_VERSION,
      phaseDirective: '10.9F',
    };
  }

  /**
   * Get summary statistics for filter outcomes (legacy API)
   */
  getFilterStats(mode?: 'paper' | 'live'): {
    totalEvaluated: number;
    passed: number;
    failed: number;
    failuresByFilter: Record<string, number>;
    schemaVersion: string;
    phaseDirective: string;
  } {
    const breakdown = this.getRolling24hBreakdown(mode);
    
    const failuresByFilter: Record<string, number> = {};
    for (const [filterName, counts] of Object.entries(breakdown.byFilter)) {
      if (counts.failed > 0) {
        failuresByFilter[filterName] = counts.failed;
      }
    }

    return {
      totalEvaluated: breakdown.totalEvaluated,
      passed: breakdown.passed,
      failed: breakdown.failed,
      failuresByFilter,
      schemaVersion: FILTER_SCHEMA_VERSION,
      phaseDirective: '10.9F',
    };
  }

  /**
   * Get recent filter insights
   */
  getRecentInsights(limit: number = 50): FilterInsightPayload[] {
    return this.insightHistory.slice(-limit);
  }

  /**
   * Check if legacy filters are enabled
   */
  isLegacyFiltersEnabled(): boolean {
    return FILTER_FLAGS.LEGACY_FILTERS_ENABLED;
  }

  /**
   * Check if institutional math filters are enabled
   */
  isInstitutionalMathEnabled(): boolean {
    return FILTER_FLAGS.INSTITUTIONAL_MATH_ENABLED;
  }

  /**
   * Get filter configuration metadata
   */
  getFilterConfigMetadata(): {
    legacyFiltersEnabled: boolean;
    institutionalMathEnabled: boolean;
    schemaVersion: string;
    phaseDirective: string;
    activeFilters: readonly string[];
    deprecatedFilters: string[];
  } {
    return {
      legacyFiltersEnabled: FILTER_FLAGS.LEGACY_FILTERS_ENABLED,
      institutionalMathEnabled: FILTER_FLAGS.INSTITUTIONAL_MATH_ENABLED,
      schemaVersion: FILTER_SCHEMA_VERSION,
      phaseDirective: '10.9F',
      activeFilters: ACTIVE_FILTER_NAMES,
      deprecatedFilters: ['RSI', 'Risk/Volatility'],
    };
  }

  /**
   * Clear insight history
   */
  clear(): void {
    this.insightHistory = [];
    console.log('[10.9C][FilterInsights] History cleared');
  }
}

let filterInsightsInstance: FilterInsightsService | null = null;

export function getFilterInsightsService(): FilterInsightsService {
  if (!filterInsightsInstance) {
    filterInsightsInstance = new FilterInsightsService();
    console.log(`[10.9C][FilterInsights] Service initialized (schema=${FILTER_SCHEMA_VERSION})`);
  }
  return filterInsightsInstance;
}

export { FilterInsightsService };
