/**
 * Directive 11.0D — Config Provenance Integration Tests
 * 
 * Validates that configuration provenance is properly exposed via telemetry.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE } from '../../config/schema-version';
import { EXECUTION_CONFIG } from '../../config/execution-config';
import { FILTER_SCHEMA_VERSION } from '../../config/system-guards';
import { getTelemetryAggregator } from '../../services/telemetry-aggregator';

describe('[11.0D] Configuration Provenance', () => {
  it('has valid schema version', () => {
    expect(SCHEMA_VERSION).toBe('v1.4.5');
    expect(SCHEMA_DIRECTIVE).toBe('11.0D');
  });

  it('has valid execution config version', () => {
    expect(EXECUTION_CONFIG.VERSION).toBeDefined();
    expect(EXECUTION_CONFIG.VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('config versions are consistent', () => {
    expect(SCHEMA_DIRECTIVE).toBe('11.0D');
    expect(SCHEMA_VERSION).toBe('v1.4.5');
  });

  it('all provenance fields are defined', () => {
    const provenance = {
      phaseDirective: SCHEMA_DIRECTIVE,
      backendSchema: SCHEMA_VERSION,
      executionConfigVersion: EXECUTION_CONFIG.VERSION,
      screenerConfigVersion: FILTER_SCHEMA_VERSION
    };

    expect(provenance.phaseDirective).toBeDefined();
    expect(provenance.backendSchema).toBeDefined();
    expect(provenance.executionConfigVersion).toBeDefined();
    expect(provenance.screenerConfigVersion).toBeDefined();
  });

  describe('Telemetry Summary Provenance', () => {
    it('getTelemetrySummaryWithCoefficients returns configProvenance block', () => {
      const telemetry = getTelemetryAggregator();
      const summary = telemetry.getTelemetrySummaryWithCoefficients();
      
      expect(summary.configProvenance).toBeDefined();
      expect(summary.configProvenance?.phaseDirective).toBe(SCHEMA_DIRECTIVE);
      expect(summary.configProvenance?.backendSchema).toBe(SCHEMA_VERSION);
      expect(summary.configProvenance?.executionConfigVersion).toBe(EXECUTION_CONFIG.VERSION);
      expect(summary.configProvenance?.screenerConfigVersion).toBe(FILTER_SCHEMA_VERSION);
    });

    it('telemetry phaseDirective matches schema directive', () => {
      const telemetry = getTelemetryAggregator();
      const summary = telemetry.getTelemetrySummaryWithCoefficients();
      
      expect(summary.phaseDirective).toBe(SCHEMA_DIRECTIVE);
      expect(summary.phaseDirective).toBe('11.0D');
    });

    it('telemetry includes tecConfig block', () => {
      const telemetry = getTelemetryAggregator();
      const summary = telemetry.getTelemetrySummaryWithCoefficients();
      
      expect(summary.tecConfig).toBeDefined();
      expect(summary.tecConfig?.version).toBe(EXECUTION_CONFIG.VERSION);
    });
  });
});
