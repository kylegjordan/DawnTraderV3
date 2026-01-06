/**
 * Directive 10.9B — Filter Insights Service Tests
 * 
 * Validates pre-signal filter telemetry, schema versioning,
 * and filter outcome tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFilterInsightsService,
  FilterInsightsService,
} from '../../services/filter-insights.service';
import { FILTER_SCHEMA_VERSION, FILTER_FLAGS } from '../../config/system-guards';

describe('Directive 10.9B — Filter Insights Service', () => {
  let service: FilterInsightsService;

  beforeEach(() => {
    service = getFilterInsightsService();
    service.clear();
  });

  describe('Filter Schema Version', () => {
    it('should have correct schema version v1.1.0', () => {
      expect(FILTER_SCHEMA_VERSION).toBe('v1.1.0');
    });

    it('should include schema version in filter stats', () => {
      const stats = service.getFilterStats();
      expect(stats.schemaVersion).toBe('v1.1.0');
    });

    it('should include phaseDirective 10.9B in stats', () => {
      const stats = service.getFilterStats();
      expect(stats.phaseDirective).toBe('10.9B');
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
      expect(result.payload.phaseDirective).toBe('10.9B');
      expect(result.payload.schemaVersion).toBe('v1.1.0');
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
      expect(metadata.schemaVersion).toBe('v1.1.0');
      expect(metadata.phaseDirective).toBe('10.9B');
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
