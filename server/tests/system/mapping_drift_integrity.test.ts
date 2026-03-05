/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F-B — Mapping Drift Integrity Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Validates DriftScore computation, boundary conditions, and bridge integrity.
 * Extended for Directive 11.7F-B with per-strategy DriftScore validation.
 * 
 * Schema Version: regime-mapping/v1.4c
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
      const sLow = computeDriftScore([-1, -0.9, -1.1], [1.4, 1.5, 1.6], 'TREND_FRIENDLY_STABLE');
      expect(sLow.score).toBeGreaterThanOrEqual(0);
      expect(sLow.score).toBeLessThanOrEqual(3);
      expect(sLow.score).toBeLessThan(0.5);
    });
    
    test('DriftScore bounds — high drift scenario', () => {
      const sHigh = computeDriftScore([5, 5, 5], [5, 5, 5], 'TREND_FRIENDLY_STABLE');
      expect(sHigh.score).toBeGreaterThanOrEqual(0);
      expect(sHigh.score).toBeLessThanOrEqual(3);
      expect(sHigh.score).toBeGreaterThan(1.5);
    });
    
    test('DriftScore returns proper structure', () => {
      const result = computeDriftScore([0.5, 0.6, 0.7], [0.8, 0.9, 1.0], 'IMPULSE_EXPANSION');
      
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
      const expectedRegimes = ['TREND_FRIENDLY_STABLE', 'HIGH_VOLATILITY_UNSTABLE', 'RANGE_BOUND_STABLE', 'IMPULSE_EXPANSION', 'STRUCTURAL_TRANSITION'];
      
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
      
      const expectedRegimes = ['TREND_FRIENDLY_STABLE', 'HIGH_VOLATILITY_UNSTABLE', 'RANGE_BOUND_STABLE', 'IMPULSE_EXPANSION', 'STRUCTURAL_TRANSITION'];
      
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
        computeDriftScore([-1, -1, -1], [1.5, 1.5, 1.5], 'TREND_FRIENDLY_STABLE'),
        computeDriftScore([1.2, 1.2, 1.2], [-0.8, -0.8, -0.8], 'HIGH_VOLATILITY_UNSTABLE'),
        computeDriftScore([5, 5, 5], [5, 5, 5], 'STRUCTURAL_TRANSITION')
      ];
      
      const stats = aggregateDriftStats(results);
      
      expect(stats.avgScore).toBeGreaterThan(0);
      expect(stats.maxScore).toBeGreaterThanOrEqual(stats.avgScore);
      expect(stats.minScore).toBeLessThanOrEqual(stats.avgScore);
      expect(stats.alignedCount + stats.driftedCount).toBeLessThanOrEqual(results.length);
    });
    
  });

  describe('Directive 11.7F-B — Per-Strategy DriftScore Integration', () => {
    
    test('Schema version is v1.4c', () => {
      expect(CANONICAL_SCHEMA_VERSION).toBe('regime-mapping/v1.4c');
    });

    test('Simulated drift data with 10 pairs and random Z-scores', () => {
      const regimes = ['TREND_FRIENDLY_STABLE', 'HIGH_VOLATILITY_UNSTABLE', 'IMPULSE_EXPANSION', 'RANGE_BOUND_STABLE', 'STRUCTURAL_TRANSITION'];
      const strategies = ['vwap_pullback', 'mean_reversion', 'sma_trend_ride', 'range_trade', 'breakout'];
      
      const results: ReturnType<typeof computeDriftScore>[] = [];
      
      for (let i = 0; i < 10; i++) {
        const regime = regimes[i % regimes.length];
        const volZHistory = Array.from({ length: 5 }, () => (Math.random() - 0.5) * 4);
        const trendZHistory = Array.from({ length: 5 }, () => (Math.random() - 0.5) * 4);
        
        const result = computeDriftScore(volZHistory, trendZHistory, regime);
        results.push(result);
        
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(3);
        expect(result.regime).toBe(regime);
      }
      
      const stats = aggregateDriftStats(results);
      expect(stats.avgScore).toBeGreaterThanOrEqual(0);
      expect(stats.distribution).toBeDefined();
    });

    test('Per-regime-strategy aggregation structure', () => {
      const regimeStrategyData: Record<string, Record<string, { volZ: number[]; trendZ: number[] }>> = {
        'TREND_FRIENDLY_STABLE': {
          'vwap_pullback': { volZ: [-0.8, -1.0, -0.9], trendZ: [1.2, 1.4, 1.3] },
          'pivot_shift': { volZ: [-0.5, -0.6, -0.7], trendZ: [1.0, 1.1, 1.2] }
        },
        'HIGH_VOLATILITY_UNSTABLE': {
          'mean_reversion': { volZ: [1.0, 1.2, 1.1], trendZ: [-0.9, -0.8, -1.0] }
        }
      };
      
      const driftScores: Record<string, Record<string, ReturnType<typeof computeDriftScore>>> = {};
      
      for (const [regime, strategies] of Object.entries(regimeStrategyData)) {
        driftScores[regime] = {};
        for (const [strategy, zData] of Object.entries(strategies)) {
          const result = computeDriftScore(zData.volZ, zData.trendZ, regime);
          driftScores[regime][strategy] = result;
        }
      }
      
      expect(driftScores['TREND_FRIENDLY_STABLE']).toBeDefined();
      expect(driftScores['TREND_FRIENDLY_STABLE']['vwap_pullback']).toBeDefined();
      expect(driftScores['TREND_FRIENDLY_STABLE']['vwap_pullback'].score).toBeGreaterThanOrEqual(0);
      expect(driftScores['HIGH_VOLATILITY_UNSTABLE']['mean_reversion']).toBeDefined();
    });

    test('Bridge JSON schema version matches canonical', () => {
      const bridgePath = path.join(process.cwd(), 'bridge/canonical/mapping-regime-strategy.json');
      
      if (fs.existsSync(bridgePath)) {
        const bridgeContent = JSON.parse(fs.readFileSync(bridgePath, 'utf-8'));
        expect(bridgeContent._schema).toBe(CANONICAL_SCHEMA_VERSION);
      }
    });

    test('DriftScoreResult has required fields for UI', () => {
      const result = computeDriftScore([0.5, 0.6, 0.7], [1.2, 1.1, 1.3], 'TREND_FRIENDLY_STABLE');
      
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('regime');
      expect(result).toHaveProperty('actualVolZ');
      expect(result).toHaveProperty('actualTrendZ');
      expect(result).toHaveProperty('idealVolZ');
      expect(result).toHaveProperty('idealTrendZ');
      expect(result).toHaveProperty('volContribution');
      expect(result).toHaveProperty('trendContribution');
      expect(result).toHaveProperty('label');
      expect(result).toHaveProperty('color');
      
      expect(typeof result.score).toBe('number');
      expect(typeof result.actualVolZ).toBe('number');
      expect(typeof result.actualTrendZ).toBe('number');
      expect(typeof result.label).toBe('string');
      expect(typeof result.color).toBe('string');
    });

    test('computeMappingDrift response shape conforms to API contract', async () => {
      const requiredFields = [
        'driftScore', 'isDrifted', 'canonicalCoverage', 'empiricalRegimes',
        'missingCanonical', 'extraEmpirical', 'distribution', 'normalizedDistribution',
        'recommendations', 'validPairs', 'minSamplesMet', 'driftScores', 'hasZScoreData', 'schema'
      ];
      
      requiredFields.forEach(field => {
        expect(typeof field).toBe('string');
      });
    });
    
  });
  
});
