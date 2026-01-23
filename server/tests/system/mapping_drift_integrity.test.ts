/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F — Mapping Drift Integrity Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Validates DriftScore computation, boundary conditions, and bridge integrity.
 * 
 * Schema Version: regime-mapping/v1.4b
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeDriftScore, aggregateDriftStats, ema } from '../../core/analytics/mapping-drift-calculator';
import { DRIFT_CANONICAL } from '../../config/drift-definitions';
import { DRIFT_DESCRIPTIONS, getDriftDescription } from '../../config/drift-descriptions';
import { CANONICAL_SCHEMA_VERSION } from '../../config/canonical-regime-strategy-map';

describe('Mapping Drift Integrity — Directive 11.7F', () => {
  
  describe('DriftScore Computation', () => {
    
    test('DriftScore bounds — low drift scenario', () => {
      const sLow = computeDriftScore([-1, -0.9, -1.1], [1.4, 1.5, 1.6], 'BULL_STABLE');
      expect(sLow.score).toBeGreaterThanOrEqual(0);
      expect(sLow.score).toBeLessThanOrEqual(3);
      expect(sLow.score).toBeLessThan(0.5);
    });
    
    test('DriftScore bounds — high drift scenario', () => {
      const sHigh = computeDriftScore([5, 5, 5], [5, 5, 5], 'BULL_STABLE');
      expect(sHigh.score).toBeGreaterThanOrEqual(0);
      expect(sHigh.score).toBeLessThanOrEqual(3);
      expect(sHigh.score).toBeGreaterThan(1.5);
    });
    
    test('DriftScore returns proper structure', () => {
      const result = computeDriftScore([0.5, 0.6, 0.7], [0.8, 0.9, 1.0], 'HIGH_VOL_IMPULSE');
      
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('regime');
      expect(result).toHaveProperty('actualVolZ');
      expect(result).toHaveProperty('actualTrendZ');
      expect(result).toHaveProperty('idealVolZ');
      expect(result).toHaveProperty('idealTrendZ');
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('color');
    });
    
    test('DriftScore handles unknown regime gracefully', () => {
      const result = computeDriftScore([0, 0, 0], [0, 0, 0], 'UNKNOWN_REGIME');
      expect(result.score).toBe(0);
      expect(result.label).toBe('Unknown');
    });
    
    test('DriftScore applies EMA smoothing correctly', () => {
      const volatileInput = [0, 5, 0, 5, 0];
      const smoothed = ema(volatileInput, 0.4);
      expect(smoothed[smoothed.length - 1]).toBeGreaterThan(0);
      expect(smoothed[smoothed.length - 1]).toBeLessThan(5);
    });
    
  });
  
  describe('Drift Definitions', () => {
    
    test('All canonical regimes have drift definitions', () => {
      const expectedRegimes = ['BULL_STABLE', 'BEAR_VOLATILE', 'LOW_VOL_CHOP', 'HIGH_VOL_IMPULSE', 'TRANSITION'];
      
      for (const regime of expectedRegimes) {
        expect(DRIFT_CANONICAL[regime]).toBeDefined();
        expect(DRIFT_CANONICAL[regime].idealVolZ).toBeDefined();
        expect(DRIFT_CANONICAL[regime].idealTrendZ).toBeDefined();
        expect(DRIFT_CANONICAL[regime].weightVol).toBeDefined();
        expect(DRIFT_CANONICAL[regime].weightTrend).toBeDefined();
      }
    });
    
    test('Weights sum to 1.0 for each regime', () => {
      for (const [regime, def] of Object.entries(DRIFT_CANONICAL)) {
        const sum = def.weightVol + def.weightTrend;
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });
    
  });
  
  describe('Drift Descriptions', () => {
    
    test('All drift ranges covered', () => {
      expect(DRIFT_DESCRIPTIONS.length).toBeGreaterThanOrEqual(3);
      
      const desc0 = getDriftDescription(0);
      expect(desc0.label).toBe('Aligned');
      
      const desc1 = getDriftDescription(1.0);
      expect(desc1.label).toBe('Moderate Drift');
      
      const desc2 = getDriftDescription(2.0);
      expect(desc2.label).toBe('Significant Drift');
    });
    
  });
  
  describe('Bridge Markdown Validation', () => {
    
    test('Bridge Markdown exists and has proper structure', () => {
      const mdPath = path.join(process.cwd(), 'bridge/canonical/DawnTrader_Regime_Strategy_Mapping.md');
      
      if (fs.existsSync(mdPath)) {
        const md = fs.readFileSync(mdPath, 'utf8');
        const lines = md.split('\n');
        
        expect(md.toLowerCase()).toContain('regime');
        expect(md.toLowerCase()).toContain('strategy');
        
        const tableLines = lines.filter(l => l.includes('|'));
        if (tableLines.length > 0) {
          const headerCount = tableLines[0].split('|').length;
          expect(headerCount).toBeGreaterThan(3);
        }
      }
    });
    
  });
  
  describe('Bridge JSON Validation', () => {
    
    test('Bridge JSON exists and has valid schema', () => {
      const jsonPath = path.join(process.cwd(), 'bridge/canonical/mapping-regime-strategy.json');
      
      expect(fs.existsSync(jsonPath)).toBe(true);
      
      const content = fs.readFileSync(jsonPath, 'utf8');
      const bridge = JSON.parse(content);
      
      expect(bridge._schema).toBeDefined();
      expect(bridge._schema).toContain('v1.4');
    });
    
    test('Bridge JSON contains all canonical regimes', () => {
      const jsonPath = path.join(process.cwd(), 'bridge/canonical/mapping-regime-strategy.json');
      const content = fs.readFileSync(jsonPath, 'utf8');
      const bridge = JSON.parse(content);
      
      const expectedRegimes = ['BULL_STABLE', 'BEAR_VOLATILE', 'LOW_VOL_CHOP', 'HIGH_VOL_IMPULSE', 'TRANSITION'];
      
      for (const regime of expectedRegimes) {
        expect(bridge[regime]).toBeDefined();
        expect(bridge[regime].favoredStrategies).toBeDefined();
        expect(Array.isArray(bridge[regime].favoredStrategies)).toBe(true);
      }
    });
    
    test('SMA Trend Ride is in HIGH_VOL_IMPULSE (v1.4b realignment)', () => {
      const jsonPath = path.join(process.cwd(), 'bridge/canonical/mapping-regime-strategy.json');
      const content = fs.readFileSync(jsonPath, 'utf8');
      const bridge = JSON.parse(content);
      
      expect(bridge.HIGH_VOL_IMPULSE.favoredStrategies).toContain('sma_trend_ride');
      expect(bridge.BULL_STABLE.favoredStrategies).not.toContain('sma_trend_ride');
    });
    
  });
  
  describe('Aggregate Statistics', () => {
    
    test('aggregateDriftStats handles empty array', () => {
      const stats = aggregateDriftStats([]);
      expect(stats.avgScore).toBe(0);
      expect(stats.alignedCount).toBe(0);
    });
    
    test('aggregateDriftStats computes correctly', () => {
      const results = [
        computeDriftScore([-1, -1, -1], [1.5, 1.5, 1.5], 'BULL_STABLE'),
        computeDriftScore([1.2, 1.2, 1.2], [-0.8, -0.8, -0.8], 'BEAR_VOLATILE'),
        computeDriftScore([5, 5, 5], [5, 5, 5], 'TRANSITION')
      ];
      
      const stats = aggregateDriftStats(results);
      
      expect(stats.avgScore).toBeGreaterThan(0);
      expect(stats.maxScore).toBeGreaterThanOrEqual(stats.avgScore);
      expect(stats.minScore).toBeLessThanOrEqual(stats.avgScore);
      expect(stats.alignedCount + stats.driftedCount).toBeLessThanOrEqual(results.length);
    });
    
  });
  
});
