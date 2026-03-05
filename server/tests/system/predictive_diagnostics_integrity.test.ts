/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7G — Predictive Diagnostics Integrity Tests
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Integration tests for the Predictive Diagnostics & Filter Transparency Panel.
 * Validates API response shape, schema version, and data constraints.
 * 
 * Schema: predictive-diagnostics/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { 
  getPredictiveDiagnosticsService, 
  PredictiveDiagnosticsService 
} from '../../services/predictive-diagnostics.service';
import { 
  PREDICTIVE_FILTER_DESCRIPTIONS, 
  PREDICTIVE_DIAGNOSTICS_SCHEMA,
  FILTER_STATUS_COLORS,
  FILTER_STATUS_LABELS,
  WEIGHT_CONTRIBUTION_LABELS
} from '../../config/predictive-filter-descriptions';
import * as fs from 'fs';
import * as path from 'path';

describe('Directive 11.7G — Predictive Diagnostics Integrity', () => {
  
  describe('Schema Validation', () => {
    
    test('PREDICTIVE_DIAGNOSTICS_SCHEMA is correct version', () => {
      expect(PREDICTIVE_DIAGNOSTICS_SCHEMA).toBe('predictive-diagnostics/v1.0');
    });

    test('Bridge schema file exists and has correct version', () => {
      const bridgePath = path.join(process.cwd(), 'bridge/predictive-diagnostics-schema.json');
      expect(fs.existsSync(bridgePath)).toBe(true);
      
      const content = JSON.parse(fs.readFileSync(bridgePath, 'utf-8'));
      expect(content._schema).toBe('predictive-diagnostics/v1.0');
      expect(content._directive).toBe('11.7G');
    });

    test('Filter descriptions contain all required filters', () => {
      const requiredFilters = ['macroFilter', 'volatilityFilter', 'confidenceGate', 'riskScreen'];
      
      requiredFilters.forEach(filter => {
        expect(PREDICTIVE_FILTER_DESCRIPTIONS[filter]).toBeDefined();
        expect(typeof PREDICTIVE_FILTER_DESCRIPTIONS[filter]).toBe('string');
        expect(PREDICTIVE_FILTER_DESCRIPTIONS[filter].length).toBeGreaterThan(10);
      });
    });

    test('Filter status colors are valid hex codes', () => {
      const colorPattern = /^#[0-9a-f]{6}$/i;
      
      Object.entries(FILTER_STATUS_COLORS).forEach(([status, color]) => {
        expect(color).toMatch(colorPattern);
      });
    });

    test('Filter status labels contain all required statuses', () => {
      const requiredStatuses = ['PASS', 'BLOCKED', 'SKIPPED', 'DRIFT'];
      
      requiredStatuses.forEach(status => {
        expect(FILTER_STATUS_LABELS[status]).toBeDefined();
        expect(typeof FILTER_STATUS_LABELS[status]).toBe('string');
      });
    });

    test('Weight contribution labels are defined', () => {
      const requiredWeights = ['volZ', 'trendZ', 'adx', 'momentum'];
      
      requiredWeights.forEach(weight => {
        expect(WEIGHT_CONTRIBUTION_LABELS[weight]).toBeDefined();
      });
    });
    
  });

  describe('PredictiveDiagnosticsService', () => {
    let service: PredictiveDiagnosticsService;
    
    beforeEach(() => {
      service = getPredictiveDiagnosticsService();
      service.resetCounters();
      service.clearDecisions();
    });

    test('Service returns valid diagnostics payload', () => {
      const diagnostics = service.getDiagnostics();
      
      expect(diagnostics.schema).toBe(PREDICTIVE_DIAGNOSTICS_SCHEMA);
      expect(diagnostics.timestamp).toBeDefined();
      expect(diagnostics.predictiveModels).toBeDefined();
      expect(diagnostics.filters).toBeDefined();
      expect(diagnostics.recentDecisions).toBeDefined();
      expect(diagnostics.telemetryStats).toBeDefined();
    });

    test('Telemetry stats have correct structure', () => {
      const diagnostics = service.getDiagnostics();
      const stats = diagnostics.telemetryStats;
      
      expect(typeof stats.totalSignalsProcessed).toBe('number');
      expect(typeof stats.passRate).toBe('number');
      expect(typeof stats.avgConfidence).toBe('number');
      expect(typeof stats.driftWarnings).toBe('number');
      
      expect(stats.passRate).toBeGreaterThanOrEqual(0);
      expect(stats.passRate).toBeLessThanOrEqual(1);
    });

    test('Model diagnostics have correct structure', () => {
      const diagnostics = service.getDiagnostics();
      const model = diagnostics.predictiveModels['ensemble_primary'];
      
      expect(model).toBeDefined();
      expect(typeof model.calibrationDrift).toBe('number');
      expect(typeof model.meanConfidence).toBe('number');
      expect(typeof model.accuracy7d).toBe('number');
      expect(model.weightContribution).toBeDefined();
      
      expect(model.meanConfidence).toBeGreaterThanOrEqual(0);
      expect(model.meanConfidence).toBeLessThanOrEqual(1);
      expect(model.accuracy7d).toBeGreaterThanOrEqual(0);
      expect(model.accuracy7d).toBeLessThanOrEqual(1);
    });

    test('Weight contributions sum to approximately 1.0', () => {
      const diagnostics = service.getDiagnostics();
      const weights = diagnostics.predictiveModels['ensemble_primary'].weightContribution;
      
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 1);
    });

    test('Filter states have correct structure', () => {
      const diagnostics = service.getDiagnostics();
      const filters = diagnostics.filters;
      
      Object.entries(filters).forEach(([name, filter]) => {
        expect(['PASS', 'BLOCKED', 'SKIPPED', 'DRIFT']).toContain(filter.status);
        expect(typeof filter.reason).toBe('string');
      });
    });

    test('Recording decisions updates recentDecisions', () => {
      service.recordDecision({
        pair: 'BTC/USD',
        signalType: 'HYBRID',
        predictedRegime: 'TREND_FRIENDLY_STABLE',
        modelUsed: 'ensemble_primary',
        decision: 'APPROVED',
        tracePath: ['Signal', 'Filter', 'Model', 'Execution'],
        confidence: 0.85
      });
      
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.recentDecisions.length).toBe(1);
      expect(diagnostics.recentDecisions[0].pair).toBe('BTC/USD');
      expect(diagnostics.recentDecisions[0].timestamp).toBeDefined();
    });

    test('Recent decisions are capped at 100', () => {
      for (let i = 0; i < 120; i++) {
        service.recordDecision({
          pair: `PAIR${i}/USD`,
          signalType: 'QUANT',
          predictedRegime: 'TREND_FRIENDLY_STABLE',
          modelUsed: 'ensemble_primary',
          decision: 'APPROVED',
          tracePath: ['Signal', 'Execution']
        });
      }
      
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.recentDecisions.length).toBeLessThanOrEqual(100);
    });

    test('Recording filter results updates filter state', () => {
      service.recordFilterResult('volatilityFilter', 'BLOCKED', 'VolZ > +2.0σ');
      
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.filters['volatilityFilter'].status).toBe('BLOCKED');
      expect(diagnostics.filters['volatilityFilter'].reason).toBe('VolZ > +2.0σ');
    });

    test('DRIFT status increments drift warnings', () => {
      const initialDiagnostics = service.getDiagnostics();
      const initialWarnings = initialDiagnostics.telemetryStats.driftWarnings;
      
      service.recordFilterResult('macroFilter', 'DRIFT', 'Calibration drift detected');
      
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.telemetryStats.driftWarnings).toBe(initialWarnings + 1);
    });

    test('Updating model diagnostics persists changes', () => {
      service.updateModelDiagnostics('ensemble_primary', {
        accuracy7d: 0.91,
        calibrationDrift: 0.05
      });
      
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.predictiveModels['ensemble_primary'].accuracy7d).toBe(0.91);
      expect(diagnostics.predictiveModels['ensemble_primary'].calibrationDrift).toBe(0.05);
    });

    test('Weight contributions update correctly', () => {
      service.updateWeightContributions('ensemble_primary', {
        volZ: 0.40,
        trendZ: 0.30,
        adx: 0.20,
        momentum: 0.10
      });
      
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.predictiveModels['ensemble_primary'].weightContribution.volZ).toBe(0.40);
    });

    test('getFilterDescriptions returns all filter descriptions', () => {
      const descriptions = service.getFilterDescriptions();
      
      expect(descriptions).toEqual(PREDICTIVE_FILTER_DESCRIPTIONS);
    });

    test('Pass rate calculation is correct', () => {
      service.recordDecision({
        pair: 'BTC/USD',
        signalType: 'HYBRID',
        predictedRegime: 'TREND_FRIENDLY_STABLE',
        modelUsed: 'ensemble_primary',
        decision: 'APPROVED',
        tracePath: ['Signal']
      });
      
      service.recordDecision({
        pair: 'ETH/USD',
        signalType: 'HYBRID',
        predictedRegime: 'TREND_FRIENDLY_STABLE',
        modelUsed: 'ensemble_primary',
        decision: 'BLOCKED',
        tracePath: ['Signal']
      });
      
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.telemetryStats.totalSignalsProcessed).toBe(2);
      expect(diagnostics.telemetryStats.passRate).toBe(0.5);
    });
    
  });

  describe('API Response Shape', () => {
    
    test('Diagnostics payload has all required top-level fields', () => {
      const service = getPredictiveDiagnosticsService();
      const diagnostics = service.getDiagnostics();
      
      const requiredFields = [
        'schema',
        'timestamp',
        'predictiveModels',
        'filters',
        'recentDecisions',
        'telemetryStats'
      ];
      
      requiredFields.forEach(field => {
        expect(diagnostics).toHaveProperty(field);
      });
    });

    test('API response includes ok flag when spread with diagnostics', () => {
      const service = getPredictiveDiagnosticsService();
      const diagnostics = service.getDiagnostics();
      
      const apiResponse = {
        ok: true,
        ...diagnostics
      };
      
      expect(apiResponse.ok).toBe(true);
      expect(apiResponse.schema).toBe(PREDICTIVE_DIAGNOSTICS_SCHEMA);
      expect(apiResponse.predictiveModels).toBeDefined();
      expect(apiResponse.filters).toBeDefined();
      expect(apiResponse.recentDecisions).toBeDefined();
    });

    test('recentDecisions is always capped at 100 in API response', () => {
      const service = getPredictiveDiagnosticsService();
      service.clearDecisions();
      
      for (let i = 0; i < 150; i++) {
        service.recordDecision({
          pair: `TEST${i}/USD`,
          signalType: 'HYBRID',
          predictedRegime: 'TREND_FRIENDLY_STABLE',
          modelUsed: 'ensemble_primary',
          decision: 'APPROVED',
          tracePath: ['Signal']
        });
      }
      
      const diagnostics = service.getDiagnostics();
      expect(diagnostics.recentDecisions.length).toBeLessThanOrEqual(100);
    });

    test('TelemetryStats has all required fields', () => {
      const service = getPredictiveDiagnosticsService();
      const diagnostics = service.getDiagnostics();
      
      const requiredFields = [
        'totalSignalsProcessed',
        'passRate',
        'avgConfidence',
        'driftWarnings'
      ];
      
      requiredFields.forEach(field => {
        expect(diagnostics.telemetryStats).toHaveProperty(field);
      });
    });

    test('ModelDiagnostics has all required fields', () => {
      const service = getPredictiveDiagnosticsService();
      const diagnostics = service.getDiagnostics();
      const model = diagnostics.predictiveModels['ensemble_primary'];
      
      const requiredFields = [
        'calibrationDrift',
        'meanConfidence',
        'accuracy7d',
        'weightContribution'
      ];
      
      requiredFields.forEach(field => {
        expect(model).toHaveProperty(field);
      });
    });
    
  });
  
});
