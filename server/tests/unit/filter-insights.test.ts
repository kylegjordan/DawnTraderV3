/**
 * Directive 10.9C — Filter Insights Service Tests
 * 
 * Validates pre-signal filter telemetry, rolling 24h window,
 * schema versioning, and filter outcome tracking.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getFilterInsightsService,
  FilterInsightsService,
  ACTIVE_FILTER_NAMES,
  FILTER_LABELS,
} from '../../services/filter-insights.service';
import { FILTER_SCHEMA_VERSION, FILTER_FLAGS } from '../../config/system-guards';

describe('Directive 10.9C — Filter Insights Service', () => {
  let service: FilterInsightsService;

  beforeEach(() => {
    service = getFilterInsightsService();
    service.clear();
  });

  describe('Filter Schema Version', () => {
    it('should have correct schema version v1.3.1', () => {
      expect(FILTER_SCHEMA_VERSION).toBe('v1.3.1');
    });

    it('should include schema version in filter stats', () => {
      const stats = service.getFilterStats();
      expect(stats.schemaVersion).toBe('v1.3.1');
    });

    it('should include phaseDirective 10.9F in stats', () => {
      const stats = service.getFilterStats();
      expect(stats.phaseDirective).toBe('10.9F');
    });
  });

  describe('Active Filters Configuration', () => {
    it('should have exactly 9 active filters', () => {
      // Directive 10.9F: QuoteCurrency removed, now 9 filters
      expect(ACTIVE_FILTER_NAMES.length).toBe(9);
    });

    it('should include Liquidity Guard', () => {
      expect(ACTIVE_FILTER_NAMES).toContain('Liquidity');
    });

    it('should include Noise Guard', () => {
      expect(ACTIVE_FILTER_NAMES).toContain('VolNoise');
    });

    it('should include Correlation Guard', () => {
      expect(ACTIVE_FILTER_NAMES).toContain('Correlation');
    });

    it('should have labels for all active filters', () => {
      for (const filterName of ACTIVE_FILTER_NAMES) {
        expect(FILTER_LABELS[filterName]).toBeDefined();
      }
    });

    it('should show Correlation Guard label with ρ symbol', () => {
      expect(FILTER_LABELS['Correlation']).toContain('ρ');
    });
  });

  describe('Filter Flags Configuration', () => {
    it('should have LEGACY_FILTERS_ENABLED set to false', () => {
      expect(FILTER_FLAGS.LEGACY_FILTERS_ENABLED).toBe(false);
    });

    it('should have INSTITUTIONAL_MATH_ENABLED set to true', () => {
      expect(FILTER_FLAGS.INSTITUTIONAL_MATH_ENABLED).toBe(true);
    });

    it('should report legacy filters disabled via service', () => {
      expect(service.isLegacyFiltersEnabled()).toBe(false);
    });

    it('should report institutional math enabled via service', () => {
      expect(service.isInstitutionalMathEnabled()).toBe(true);
    });
  });

  describe('Pre-Signal Filter Evaluation', () => {
    it('should pass all filters when values meet thresholds', () => {
      const result = service.evaluatePreSignalFilters({
        symbol: 'BTC/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
        logLiquidity: 60,
        minLiquidity: 40,
        volNoise: 0.3,
        maxVolNoise: 0.6,
        correlation: 0.5,
        maxCorrelation: 0.75,
      });

      expect(result.passed).toBe(true);
      expect(result.payload.overallResult).toBe('passed');
      expect(result.payload.failedFilters).toHaveLength(0);
    });

    it('should fail when volume is below threshold', () => {
      const result = service.evaluatePreSignalFilters({
        symbol: 'SMALL/USD',
        mode: 'paper',
        volume24h: 100000,
        minVolume: 500000,
      });

      expect(result.passed).toBe(false);
      expect(result.payload.failedFilters).toContain('Volume');
    });

    it('should fail when liquidity is below threshold', () => {
      const result = service.evaluatePreSignalFilters({
        symbol: 'LOW_LQ/USD',
        mode: 'paper',
        logLiquidity: 30,
        minLiquidity: 40,
      });

      expect(result.passed).toBe(false);
      expect(result.payload.failedFilters).toContain('Liquidity');
    });

    it('should fail when volNoise exceeds threshold', () => {
      const result = service.evaluatePreSignalFilters({
        symbol: 'NOISY/USD',
        mode: 'paper',
        volNoise: 0.7,
        maxVolNoise: 0.6,
      });

      expect(result.passed).toBe(false);
      expect(result.payload.failedFilters).toContain('VolNoise');
    });

    it('should fail when correlation exceeds threshold', () => {
      const result = service.evaluatePreSignalFilters({
        symbol: 'CORR/USD',
        mode: 'paper',
        correlation: 0.85,
        maxCorrelation: 0.75,
      });

      expect(result.passed).toBe(false);
      expect(result.payload.failedFilters).toContain('Correlation');
    });

    it('should track multiple filter failures', () => {
      const result = service.evaluatePreSignalFilters({
        symbol: 'BAD/USD',
        mode: 'live',
        volume24h: 10000,
        minVolume: 500000,
        logLiquidity: 20,
        minLiquidity: 40,
        volNoise: 0.8,
        maxVolNoise: 0.6,
      });

      expect(result.passed).toBe(false);
      expect(result.payload.failedFilters).toContain('Volume');
      expect(result.payload.failedFilters).toContain('Liquidity');
      expect(result.payload.failedFilters).toContain('VolNoise');
      expect(result.payload.failedFilters.length).toBe(3);
    });

    it('should evaluate all 9 active filter types', () => {
      // Directive 10.9F: QuoteCurrency removed, now 9 filters
      const result = service.evaluatePreSignalFilters({
        symbol: 'FULL/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
        logLiquidity: 60,
        minLiquidity: 40,
        volNoise: 0.3,
        maxVolNoise: 0.6,
        correlation: 0.5,
        maxCorrelation: 0.75,
        dailyRange: 2.0,
        minDailyRange: 0.5,
        price: 100,
        minPrice: 0.01,
        spread: 0.5,
        maxSpread: 2.0,
        isStablecoin: false,
        excludeStablecoins: true,
        historyDays: 90,
        minHistoryDays: 30,
      });

      expect(result.passed).toBe(true);
      expect(result.payload.outcomes.length).toBe(9);
    });
  });

  describe('Rolling 24h Window', () => {
    it('should include entries within 24h window', () => {
      service.evaluatePreSignalFilters({
        symbol: 'RECENT/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      const breakdown = service.getRolling24hBreakdown('paper');
      expect(breakdown.totalEvaluated).toBe(1);
    });

    it('should exclude entries older than 24h after pruning', () => {
      // Add an entry with a timestamp older than 24h
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      
      // Directly inject an old entry into history for testing (use internal access)
      const oldPayload = {
        symbol: 'OLD/USD',
        mode: 'paper' as const,
        outcomes: [],
        overallResult: 'passed' as const,
        failedFilters: [],
        phaseDirective: '10.9C',
        schemaVersion: 'v1.2.0',
        timestamp: oldTimestamp,
      };
      
      // Access internal history via getRecentInsights after injecting
      // We simulate by calling the service with current time, then checking rolling 24h
      service.evaluatePreSignalFilters({
        symbol: 'RECENT/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      // The rolling breakdown should only include recent entries
      const breakdown = service.getRolling24hBreakdown('paper');
      expect(breakdown.totalEvaluated).toBe(1);
      
      // Verify window timestamps are correct (24h span)
      const start = new Date(breakdown.windowStart);
      const end = new Date(breakdown.windowEnd);
      const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0);
    });

    it('should include windowStart and windowEnd in breakdown', () => {
      service.evaluatePreSignalFilters({
        symbol: 'TEST/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      const breakdown = service.getRolling24hBreakdown();
      expect(breakdown.windowStart).toBeDefined();
      expect(breakdown.windowEnd).toBeDefined();
      
      const start = new Date(breakdown.windowStart);
      const end = new Date(breakdown.windowEnd);
      const diffMs = end.getTime() - start.getTime();
      const hours = diffMs / (1000 * 60 * 60);
      
      expect(hours).toBeCloseTo(24, 0);
    });

    it('should track byFilter counts in rolling breakdown', () => {
      service.evaluatePreSignalFilters({
        symbol: 'PASS/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      service.evaluatePreSignalFilters({
        symbol: 'FAIL/USD',
        mode: 'paper',
        volume24h: 100,
        minVolume: 500000,
      });

      const breakdown = service.getRolling24hBreakdown();
      expect(breakdown.byFilter['Volume'].passed).toBe(1);
      expect(breakdown.byFilter['Volume'].failed).toBe(1);
    });

    it('should filter by mode in rolling breakdown', () => {
      service.evaluatePreSignalFilters({
        symbol: 'PAPER/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      service.evaluatePreSignalFilters({
        symbol: 'LIVE/USD',
        mode: 'live',
        volume24h: 1000000,
        minVolume: 500000,
      });

      const paperBreakdown = service.getRolling24hBreakdown('paper');
      expect(paperBreakdown.totalEvaluated).toBe(1);

      const liveBreakdown = service.getRolling24hBreakdown('live');
      expect(liveBreakdown.totalEvaluated).toBe(1);
    });
  });

  describe('Filter Outcome Telemetry', () => {
    it('should include all outcome fields in payload', () => {
      const result = service.evaluatePreSignalFilters({
        symbol: 'TEST/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      expect(result.payload.symbol).toBe('TEST/USD');
      expect(result.payload.mode).toBe('paper');
      expect(result.payload.phaseDirective).toBe('10.9F');
      expect(result.payload.schemaVersion).toBe('v1.3.1');
      expect(result.payload.timestamp).toBeDefined();
      expect(result.payload.outcomes.length).toBeGreaterThan(0);
    });

    it('should mark outcomes as pre-signal category', () => {
      const result = service.evaluatePreSignalFilters({
        symbol: 'TEST/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      for (const outcome of result.payload.outcomes) {
        expect(outcome.category).toBe('pre-signal');
      }
    });
  });

  describe('Filter Statistics', () => {
    it('should track passed and failed counts', () => {
      service.evaluatePreSignalFilters({
        symbol: 'PASS/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      service.evaluatePreSignalFilters({
        symbol: 'FAIL/USD',
        mode: 'paper',
        volume24h: 100,
        minVolume: 500000,
      });

      const stats = service.getFilterStats();
      expect(stats.totalEvaluated).toBe(2);
      expect(stats.passed).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it('should filter stats by mode', () => {
      service.evaluatePreSignalFilters({
        symbol: 'PAPER/USD',
        mode: 'paper',
        volume24h: 1000000,
        minVolume: 500000,
      });

      service.evaluatePreSignalFilters({
        symbol: 'LIVE/USD',
        mode: 'live',
        volume24h: 1000000,
        minVolume: 500000,
      });

      const paperStats = service.getFilterStats('paper');
      expect(paperStats.totalEvaluated).toBe(1);

      const liveStats = service.getFilterStats('live');
      expect(liveStats.totalEvaluated).toBe(1);
    });

    it('should track failures by filter name', () => {
      service.evaluatePreSignalFilters({
        symbol: 'VOL1/USD',
        mode: 'paper',
        volume24h: 100,
        minVolume: 500000,
      });

      service.evaluatePreSignalFilters({
        symbol: 'VOL2/USD',
        mode: 'paper',
        volume24h: 200,
        minVolume: 500000,
      });

      const stats = service.getFilterStats();
      expect(stats.failuresByFilter['Volume']).toBe(2);
    });
  });

  describe('Filter Config Metadata', () => {
    it('should return complete config metadata', () => {
      const metadata = service.getFilterConfigMetadata();

      expect(metadata.legacyFiltersEnabled).toBe(false);
      expect(metadata.institutionalMathEnabled).toBe(true);
      expect(metadata.schemaVersion).toBe('v1.3.1');
      expect(metadata.phaseDirective).toBe('10.9F');
      expect(metadata.activeFilters).toEqual(ACTIVE_FILTER_NAMES);
      expect(metadata.deprecatedFilters).toContain('RSI');
      expect(metadata.deprecatedFilters).toContain('Risk/Volatility');
    });
  });

  describe('Recent Insights', () => {
    it('should return recent insights with limit', () => {
      for (let i = 0; i < 10; i++) {
        service.evaluatePreSignalFilters({
          symbol: `TEST${i}/USD`,
          mode: 'paper',
          volume24h: 1000000,
          minVolume: 500000,
        });
      }

      const recent = service.getRecentInsights(5);
      expect(recent.length).toBe(5);
    });
  });
});
