/**
 * Directive 11.0G — Schema v1.5.1 Integration Tests
 * 
 * Validates:
 * 1. Schema version is v1.5.1
 * 2. Migration file exists
 * 3. Archive checksum validation works
 * 4. Telemetry schema sync validation
 * 5. ExecutionConfig read-only enforcement
 */

import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE, METRIC_ENGINE_VERSION, SCHEMA_HISTORY } from '../../config/schema-version.js';
import { getTelemetryAggregator } from '../../services/telemetry-aggregator.js';
import { sealLegacyArchive, verifyArchiveIntegrity } from '../../legacy/metrics_archive.js';
import { EXECUTION_CONFIG } from '../../config/execution-config.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Directive 11.0G - Schema v1.5.1 Integrity & Validation', () => {
  describe('Schema Version Tracking', () => {
    it('should report schema version v1.5.1', () => {
      expect(SCHEMA_VERSION).toBe('v1.5.1');
    });

    it('should report schema directive 11.0G', () => {
      expect(SCHEMA_DIRECTIVE).toBe('11.0G');
    });

    it('should report metric engine version v1.0', () => {
      expect(METRIC_ENGINE_VERSION).toBe('v1.0');
    });

    it('should include schema history entries', () => {
      expect(SCHEMA_HISTORY).toBeDefined();
      expect(SCHEMA_HISTORY.length).toBeGreaterThanOrEqual(2);
      expect(SCHEMA_HISTORY[0].version).toBe('v1.5.1');
      expect(SCHEMA_HISTORY[0].directive).toBe('11.0G');
    });
  });

  describe('Archive Integrity Checksum', () => {
    it('should seal archive data with SHA-256 checksum', () => {
      const testData = {
        directive: '11.0G',
        metrics: { test: 'value' },
      };
      
      const sealed = sealLegacyArchive(testData);
      
      expect(sealed.archiveChecksum).toBeDefined();
      expect(typeof sealed.archiveChecksum).toBe('string');
      expect(sealed.archiveChecksum.length).toBe(64); // SHA-256 hex length
    });

    it('should verify archive integrity correctly', () => {
      const testData = {
        directive: '11.0G',
        metrics: { test: 'value' },
      };
      
      const sealed = sealLegacyArchive(testData);
      const isValid = verifyArchiveIntegrity(sealed);
      
      expect(isValid).toBe(true);
    });

    it('should detect tampered archive data', () => {
      const testData = {
        directive: '11.0G',
        metrics: { test: 'value' },
      };
      
      const sealed = sealLegacyArchive(testData);
      (sealed as any).metrics.test = 'tampered';
      const isValid = verifyArchiveIntegrity(sealed);
      
      expect(isValid).toBe(false);
    });

    it('should return false for data without checksum', () => {
      const dataWithoutChecksum = {
        directive: '11.0G',
        metrics: { test: 'value' },
      };
      
      const isValid = verifyArchiveIntegrity(dataWithoutChecksum);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Telemetry Schema Validation', () => {
    it('should validate matching schema versions', () => {
      const telemetry = getTelemetryAggregator();
      const result = telemetry.validateSchemaSync('v1.5.1');
      
      expect(result.isValid).toBe(true);
      expect(result.health).toBe('green');
      expect(result.mismatchReason).toBeNull();
    });

    it('should detect schema version mismatch', () => {
      const telemetry = getTelemetryAggregator();
      const result = telemetry.validateSchemaSync('v1.4.0');
      
      expect(result.isValid).toBe(false);
      expect(result.health).toBe('yellow');
      expect(result.mismatchReason).toContain('mismatch');
    });

    it('should handle missing frontend version', () => {
      const telemetry = getTelemetryAggregator();
      const result = telemetry.validateSchemaSync(undefined);
      
      expect(result.isValid).toBe(false);
      expect(result.health).toBe('yellow');
      expect(result.mismatchReason).toContain('not provided');
    });

    it('should include schemaSync in telemetry summary', () => {
      const telemetry = getTelemetryAggregator();
      const summary = telemetry.getTelemetrySummaryWithCoefficients('v1.5.1');
      
      expect(summary.schemaSync).toBeDefined();
      expect(summary.schemaSync?.isValid).toBe(true);
      expect(summary.systemConfig.telemetryHealth).toBe('green');
    });
  });

  describe('ExecutionConfig Read-Only Enforcement', () => {
    it('should have EXECUTION_CONFIG frozen', () => {
      expect(Object.isFrozen(EXECUTION_CONFIG)).toBe(true);
    });

    it('should include readOnly flag in telemetry tecConfig', () => {
      const telemetry = getTelemetryAggregator();
      const summary = telemetry.getTelemetrySummaryWithCoefficients();
      
      expect(summary.tecConfig).toBeDefined();
      expect(summary.tecConfig?.readOnly).toBe(true);
    });

    it('should prevent modification of EXECUTION_CONFIG', () => {
      expect(() => {
        (EXECUTION_CONFIG as any).TRAILING_STOP_BASE = 0.999;
      }).toThrow();
    });
  });

  describe('Migration File Existence', () => {
    it('should have migration file for 11.0G', () => {
      const migrationPath = path.join(process.cwd(), 'drizzle/migrations/2026-11-0G-schema-hardening.sql');
      const exists = fs.existsSync(migrationPath);
      
      expect(exists).toBe(true);
    });
  });
});
