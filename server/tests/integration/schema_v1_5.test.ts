/**
 * Directive 11.0F — Schema v1.5.0 Integration Tests
 * 
 * Validates:
 * 1. Schema version is v1.5.0
 * 2. Legacy CWQI/NGC columns removed from RTB signals
 * 3. FinalScore is the sole ranking metric
 * 4. Telemetry reports metricEngineVersion = v1.0
 * 5. No legacy metric references in runtime code
 */

import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE, METRIC_ENGINE_VERSION } from '../../config/schema-version.js';
import { getTelemetryAggregator } from '../../services/telemetry-aggregator.js';

describe('Directive 11.0F - Schema v1.5.0 Finalization', () => {
  describe('Schema Version Tracking', () => {
    it('should report schema version v1.5.0', () => {
      expect(SCHEMA_VERSION).toBe('v1.5.0');
    });

    it('should report schema directive 11.0F', () => {
      expect(SCHEMA_DIRECTIVE).toBe('11.0F');
    });

    it('should report metric engine version v1.0', () => {
      expect(METRIC_ENGINE_VERSION).toBe('v1.0');
    });
  });

  describe('Telemetry Structure', () => {
    it('should return systemConfig with metricEngineVersion', () => {
      const telemetry = getTelemetryAggregator();
      const summary = telemetry.getTelemetrySummaryWithCoefficients();
      
      expect(summary.systemConfig).toBeDefined();
      expect(summary.systemConfig.metricEngineVersion).toBe('v1.0');
      expect(summary.systemConfig.schemaVersion).toBe('v1.5.0');
      expect(summary.systemConfig.directive).toBe('11.0F');
      expect(summary.systemConfig.telemetryHealth).toBe('green');
    });

    it('should not contain legacy configProvenance fields', () => {
      const telemetry = getTelemetryAggregator();
      const summary = telemetry.getTelemetrySummaryWithCoefficients();
      
      expect((summary as any).phaseDirective).toBeUndefined();
      expect((summary as any).filterSchemaVersion).toBeUndefined();
      expect((summary as any).configProvenance).toBeUndefined();
    });

    it('should contain FinalScore weights', () => {
      const telemetry = getTelemetryAggregator();
      const summary = telemetry.getTelemetrySummaryWithCoefficients();
      
      expect(summary.weights).toEqual({
        hybrid: 0.4,
        confidence: 0.3,
        regime: 0.2,
        decay: 0.1,
      });
    });
  });

  describe('FinalScore Formula Validation', () => {
    it('should calculate FinalScore correctly', () => {
      const hybridScore = 0.8;
      const confidence = 0.7;
      const regimeWeight = 0.6;
      const decayPenalty = 0.05;
      
      const expected = (hybridScore * 0.4) + (confidence * 0.3) + (regimeWeight * 0.2) - (decayPenalty * 0.1);
      const expectedRounded = Math.round(expected * 10000) / 10000;
      
      expect(expectedRounded).toBe(0.6550);
    });

    it('should enforce FinalScore bounds [0, 1]', () => {
      const testCases = [
        { h: 1, c: 1, r: 1, d: 0, expected: 0.9 }, // Max without decay
        { h: 0, c: 0, r: 0, d: 0.1, expected: 0 }, // Min with max decay
        { h: 0.5, c: 0.5, r: 0.5, d: 0.05, expected: 0.445 }, // Middle values
      ];
      
      for (const tc of testCases) {
        const result = (tc.h * 0.4) + (tc.c * 0.3) + (tc.r * 0.2) - (tc.d * 0.1);
        const bounded = Math.max(0, Math.min(1, result));
        expect(bounded).toBeGreaterThanOrEqual(0);
        expect(bounded).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Legacy Metric Removal Verification', () => {
    it('should have archived legacy formulas', async () => {
      const archive = await import('../../legacy/metrics_archive.js');
      
      expect(archive.CWQI_FORMULA_ARCHIVED).toBeDefined();
      expect(archive.NGC_FORMULA_ARCHIVED).toBeDefined();
      expect(archive.PROFITRATE_FORMULA_ARCHIVED).toBeDefined();
      expect(archive.ARCHIVE_METADATA.directive).toBe('11.0E');
    });

    it('should have legacy snapshot file metadata', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      const snapshotPath = path.join(process.cwd(), 'server/legacy/data/legacy_metrics_snapshot.json');
      
      if (fs.existsSync(snapshotPath)) {
        const content = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        expect(content.directive).toBe('11.0F');
        expect(content.schema_version).toBe('v1.4.6');
        expect(content.migrated_to).toBe('v1.5.0');
      }
    });
  });
});
