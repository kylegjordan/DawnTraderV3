/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7D.1 — Recalibration Integrity Unit Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Tests for:
 * - Predictive Adjustments Log Valid Schema
 * - Concurrency-safe JSON appending
 * - Telemetry integrity validation
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { safeAppendJSON, safeReadJSONArray } from '../../utils/logging';
import { 
  logPredictiveAdjustment, 
  getAdjustments, 
  PREDICTIVE_ADJUSTMENTS_SCHEMA 
} from '../../core/logging/predictive-adjustments';

const TEST_DIR = path.join(process.cwd(), 'logs', 'predictive_adjustments_test');
const TEST_FILE = path.join(TEST_DIR, 'test_adjustment.json');

describe('Directive 11.7D.1 — Recalibration Integrity', () => {
  beforeAll(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(TEST_FILE)) {
        fs.unlinkSync(TEST_FILE);
      }
      if (fs.existsSync(TEST_DIR)) {
        const files = fs.readdirSync(TEST_DIR);
        if (files.length === 0) {
          fs.rmdirSync(TEST_DIR);
        }
      }
    } catch {
    }
  });

  describe('Predictive Adjustments Log Schema', () => {
    it('should write valid schema to log file', () => {
      const mock = [{ _schema: PREDICTIVE_ADJUSTMENTS_SCHEMA }];
      fs.writeFileSync(TEST_FILE, JSON.stringify(mock, null, 2));
      
      const data = JSON.parse(fs.readFileSync(TEST_FILE, 'utf8'));
      expect(data[0]._schema).toBe(PREDICTIVE_ADJUSTMENTS_SCHEMA);
    });

    it('should have correct schema version format', () => {
      expect(PREDICTIVE_ADJUSTMENTS_SCHEMA).toBe('predictive-adjustments/v1.0');
    });
  });

  describe('Concurrency-safe JSON Appending', () => {
    it('safeAppendJSON should create file if not exists', () => {
      const tempFile = path.join(TEST_DIR, 'temp_create.json');
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        
        const result = safeAppendJSON(tempFile, { test: true });
        expect(result).toBe(true);
        expect(fs.existsSync(tempFile)).toBe(true);
        
        const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(1);
        expect(data[0].test).toBe(true);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('safeAppendJSON should append to existing array', () => {
      const tempFile = path.join(TEST_DIR, 'temp_append.json');
      try {
        fs.writeFileSync(tempFile, JSON.stringify([{ first: 1 }], null, 2));
        
        const result = safeAppendJSON(tempFile, { second: 2 });
        expect(result).toBe(true);
        
        const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
        expect(data.length).toBe(2);
        expect(data[0].first).toBe(1);
        expect(data[1].second).toBe(2);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('safeReadJSONArray should return empty array for non-existent file', () => {
      const result = safeReadJSONArray<Record<string, unknown>>(
        path.join(TEST_DIR, 'non_existent.json')
      );
      expect(result).toEqual([]);
    });

    it('safeReadJSONArray should handle corrupted JSON gracefully', () => {
      const tempFile = path.join(TEST_DIR, 'temp_corrupt.json');
      try {
        fs.writeFileSync(tempFile, 'not valid json{{{');
        
        const result = safeReadJSONArray<Record<string, unknown>>(tempFile);
        expect(result).toEqual([]);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });
  });

  describe('Log Entry Structure', () => {
    it('should log adjustment with all required fields', () => {
      const entry = logPredictiveAdjustment({
        category: 'ROI',
        parameter: 'dynamicROI',
        oldValue: 0.02,
        newValue: 0.025,
        regime: 'BULL_STABLE',
        reason: 'Test adjustment'
      });

      expect(entry._schema).toBe(PREDICTIVE_ADJUSTMENTS_SCHEMA);
      expect(entry.category).toBe('ROI');
      expect(entry.parameter).toBe('dynamicROI');
      expect(entry.oldValue).toBe(0.02);
      expect(entry.newValue).toBe(0.025);
      expect(entry.delta).toBeCloseTo(0.005, 4);
      expect(entry.impact).toBeGreaterThan(0);
      expect(entry.regime).toBe('BULL_STABLE');
      expect(entry.reason).toBe('Test adjustment');
      expect(entry.timestamp).toBeDefined();
    });

    it('should calculate impact correctly', () => {
      const entry = logPredictiveAdjustment({
        category: 'Confidence',
        parameter: 'confidenceScore',
        oldValue: 0.5,
        newValue: 0.6,
        reason: 'Impact test'
      });

      const expectedImpact = Math.abs(0.6 - 0.5) / Math.max(Math.abs(0.5), 0.001);
      expect(entry.impact).toBeCloseTo(expectedImpact, 2);
    });
  });

  describe('Adjustment Retrieval', () => {
    it('getAdjustments should return array', () => {
      const result = getAdjustments({ limit: 10 });
      expect(Array.isArray(result)).toBe(true);
    });

    it('getAdjustments should respect limit parameter', () => {
      const result = getAdjustments({ limit: 5 });
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});
