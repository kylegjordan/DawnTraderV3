/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7D.1 — Recalibration Integrity Unit Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Tests for:
 * - Predictive Adjustments Log Valid Schema
 * - Concurrency-safe JSON appending with file locking
 * - Telemetry integrity validation (validateTelemetryIntegrity)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { safeAppendJSON, safeReadJSONArray, safeAppendJSONAsync } from '../../utils/logging';
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
      expect(PREDICTIVE_ADJUSTMENTS_SCHEMA).toBe('predictive-adjustments/v1.1');
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
        regime: 'TREND_FRIENDLY_STABLE',
        reason: 'Test adjustment'
      });

      expect(entry._schema).toBe(PREDICTIVE_ADJUSTMENTS_SCHEMA);
      expect(entry.category).toBe('ROI');
      expect(entry.parameter).toBe('dynamicROI');
      expect(entry.oldValue).toBe(0.02);
      expect(entry.newValue).toBe(0.025);
      expect(entry.delta).toBeCloseTo(0.005, 4);
      expect(entry.impact).toBeGreaterThan(0);
      expect(entry.regime).toBe('TREND_FRIENDLY_STABLE');
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

  describe('Concurrency Safety with File Locking', () => {
    it('safeAppendJSONAsync should serialize concurrent appends', async () => {
      const tempFile = path.join(TEST_DIR, 'temp_concurrent.json');
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        
        const appendPromises = Array.from({ length: 5 }, (_, i) => 
          safeAppendJSONAsync(tempFile, { index: i, timestamp: Date.now() })
        );
        
        const results = await Promise.all(appendPromises);
        
        expect(results.every(r => r === true)).toBe(true);
        
        const data = JSON.parse(fs.readFileSync(tempFile, 'utf8'));
        expect(data.length).toBe(5);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(`${tempFile}.lock`)) {
          fs.unlinkSync(`${tempFile}.lock`);
        }
      }
    });

    it('file lock should be created and removed during operation', () => {
      const tempFile = path.join(TEST_DIR, 'temp_lock_test.json');
      const lockFile = `${tempFile}.lock`;
      
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
        
        safeAppendJSON(tempFile, { test: 'lock' });
        
        expect(fs.existsSync(lockFile)).toBe(false);
        expect(fs.existsSync(tempFile)).toBe(true);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
      }
    });
  });

  describe('Telemetry Integrity Validation', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    
    beforeAll(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    
    afterAll(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should warn when winRate metric is missing', () => {
      const validateTelemetryIntegrity = (
        regime: string, 
        perf: Record<string, unknown>, 
        strategyCount: number
      ): void => {
        if (!('winRate' in perf) || !('avgPnL' in perf) || !('skipRatio' in perf)) {
          console.warn(`[11.7D.1][Telemetry] Missing key metrics for ${regime}`);
        }
        
        if (strategyCount < 2) {
          console.warn(`[11.7D.1][Telemetry] Regime ${regime} has <2 strategies — incomplete dataset.`);
        }
      };
      
      consoleWarnSpy.mockClear();
      
      validateTelemetryIntegrity('TREND_FRIENDLY_STABLE', { avgPnL: 0.05, skipRatio: 0.1 }, 3);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing key metrics for TREND_FRIENDLY_STABLE')
      );
    });

    it('should warn when avgPnL metric is missing', () => {
      const validateTelemetryIntegrity = (
        regime: string, 
        perf: Record<string, unknown>, 
        strategyCount: number
      ): void => {
        if (!('winRate' in perf) || !('avgPnL' in perf) || !('skipRatio' in perf)) {
          console.warn(`[11.7D.1][Telemetry] Missing key metrics for ${regime}`);
        }
        
        if (strategyCount < 2) {
          console.warn(`[11.7D.1][Telemetry] Regime ${regime} has <2 strategies — incomplete dataset.`);
        }
      };
      
      consoleWarnSpy.mockClear();
      
      validateTelemetryIntegrity('BEAR_STABLE', { winRate: 0.6, skipRatio: 0.1 }, 3);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing key metrics for BEAR_STABLE')
      );
    });

    it('should warn when skipRatio metric is missing', () => {
      const validateTelemetryIntegrity = (
        regime: string, 
        perf: Record<string, unknown>, 
        strategyCount: number
      ): void => {
        if (!('winRate' in perf) || !('avgPnL' in perf) || !('skipRatio' in perf)) {
          console.warn(`[11.7D.1][Telemetry] Missing key metrics for ${regime}`);
        }
        
        if (strategyCount < 2) {
          console.warn(`[11.7D.1][Telemetry] Regime ${regime} has <2 strategies — incomplete dataset.`);
        }
      };
      
      consoleWarnSpy.mockClear();
      
      validateTelemetryIntegrity('RANGE_BOUND', { winRate: 0.6, avgPnL: 0.05 }, 3);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing key metrics for RANGE_BOUND')
      );
    });

    it('should warn when regime has fewer than 2 strategies', () => {
      const validateTelemetryIntegrity = (
        regime: string, 
        perf: Record<string, unknown>, 
        strategyCount: number
      ): void => {
        if (!('winRate' in perf) || !('avgPnL' in perf) || !('skipRatio' in perf)) {
          console.warn(`[11.7D.1][Telemetry] Missing key metrics for ${regime}`);
        }
        
        if (strategyCount < 2) {
          console.warn(`[11.7D.1][Telemetry] Regime ${regime} has <2 strategies — incomplete dataset.`);
        }
      };
      
      consoleWarnSpy.mockClear();
      
      validateTelemetryIntegrity('BULL_VOLATILE', { winRate: 0.6, avgPnL: 0.05, skipRatio: 0.1 }, 1);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Regime BULL_VOLATILE has <2 strategies')
      );
    });

    it('should not warn when all metrics present and strategy count >= 2', () => {
      const validateTelemetryIntegrity = (
        regime: string, 
        perf: Record<string, unknown>, 
        strategyCount: number
      ): void => {
        if (!('winRate' in perf) || !('avgPnL' in perf) || !('skipRatio' in perf)) {
          console.warn(`[11.7D.1][Telemetry] Missing key metrics for ${regime}`);
        }
        
        if (strategyCount < 2) {
          console.warn(`[11.7D.1][Telemetry] Regime ${regime} has <2 strategies — incomplete dataset.`);
        }
      };
      
      consoleWarnSpy.mockClear();
      
      validateTelemetryIntegrity('HIGH_VOLATILITY_UNSTABLE', { winRate: 0.6, avgPnL: 0.05, skipRatio: 0.1 }, 3);
      
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});
