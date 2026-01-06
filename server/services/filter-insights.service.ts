/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.9B — Filter Insights Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Captures and emits telemetry for all pre-signal filter outcomes.
 * Provides traceable insights for why pairs were filtered out.
 * 
 * Pre-Signal Filters Tracked:
 * - Volume (min volume threshold)
 * - Liquidity (LQ guard)
 * - VolNoise (volatility noise guard)
 * - Correlation (ρ guard)
 * - PriceRange (daily range threshold)
 * - MarketCap (minimum market cap)
 * - RegulatedOnly (quote currency filter)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { FILTER_SCHEMA_VERSION, FILTER_FLAGS } from '../config/system-guards.js';

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
}

class FilterInsightsService {
  private insightHistory: FilterInsightPayload[] = [];
  private readonly maxHistory = 1000;

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

    // Correlation Guard
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

    // Quote Currency Filter
    if (input.quoteCurrency !== undefined && input.allowedQuotes !== undefined) {
      const passed = input.allowedQuotes.includes(input.quoteCurrency);
      outcomes.push({
        filterName: 'RegulatedOnly',
        threshold: input.allowedQuotes.join(','),
        actualValue: input.quoteCurrency,
        result: passed ? 'passed' : 'failed',
        timestamp: now,
        category: 'pre-signal',
      });
      if (!passed) failedFilters.push('RegulatedOnly');
    }

    const payload: FilterInsightPayload = {
      symbol: input.symbol,
      mode: input.mode,
      outcomes,
      overallResult: failedFilters.length === 0 ? 'passed' : 'failed',
      failedFilters,
      phaseDirective: '10.9B',
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
    this.insightHistory.push(payload);
    
    if (this.insightHistory.length > this.maxHistory) {
      this.insightHistory = this.insightHistory.slice(-this.maxHistory);
    }

    if (payload.overallResult === 'failed') {
      console.log(`[10.9B][FilterInsights] ${payload.symbol} FAILED: ${payload.failedFilters.join(', ')}`);
    }
  }

  /**
   * Get summary statistics for filter outcomes
   */
  getFilterStats(mode?: 'paper' | 'live'): {
    totalEvaluated: number;
    passed: number;
    failed: number;
    failuresByFilter: Record<string, number>;
    schemaVersion: string;
    phaseDirective: string;
  } {
    const filtered = mode 
      ? this.insightHistory.filter(i => i.mode === mode)
      : this.insightHistory;

    const failuresByFilter: Record<string, number> = {};
    let passed = 0;
    let failed = 0;

    for (const insight of filtered) {
      if (insight.overallResult === 'passed') {
        passed++;
      } else {
        failed++;
        for (const filterName of insight.failedFilters) {
          failuresByFilter[filterName] = (failuresByFilter[filterName] || 0) + 1;
        }
      }
    }

    return {
      totalEvaluated: filtered.length,
      passed,
      failed,
      failuresByFilter,
      schemaVersion: FILTER_SCHEMA_VERSION,
      phaseDirective: '10.9B',
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
  } {
    return {
      legacyFiltersEnabled: FILTER_FLAGS.LEGACY_FILTERS_ENABLED,
      institutionalMathEnabled: FILTER_FLAGS.INSTITUTIONAL_MATH_ENABLED,
      schemaVersion: FILTER_SCHEMA_VERSION,
      phaseDirective: '10.9B',
    };
  }

  /**
   * Clear insight history
   */
  clear(): void {
    this.insightHistory = [];
    console.log('[10.9B][FilterInsights] History cleared');
  }
}

let filterInsightsInstance: FilterInsightsService | null = null;

export function getFilterInsightsService(): FilterInsightsService {
  if (!filterInsightsInstance) {
    filterInsightsInstance = new FilterInsightsService();
    console.log(`[10.9B][FilterInsights] Service initialized (schema=${FILTER_SCHEMA_VERSION})`);
  }
  return filterInsightsInstance;
}

export { FilterInsightsService };
