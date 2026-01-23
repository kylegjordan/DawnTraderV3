/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7G — Predictive Diagnostics Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Collects calibration data, filter states, and weighting metrics for the
 * Predictive Diagnostics & Filter Transparency Panel.
 * 
 * Features:
 * - Model calibration tracking with drift detection
 * - Filter state aggregation with human-readable reasoning
 * - Weight contribution visualization data
 * - Decision traceback for end-to-end traceability
 * 
 * Schema: predictive-diagnostics/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { PREDICTIVE_FILTER_DESCRIPTIONS, PREDICTIVE_DIAGNOSTICS_SCHEMA } from '../config/predictive-filter-descriptions.js';
import { REGIMES } from '../config/canonical-regime-strategy-map.js';

export type FilterStatus = 'PASS' | 'BLOCKED' | 'SKIPPED' | 'DRIFT';
export type DecisionOutcome = 'APPROVED' | 'BLOCKED' | 'SKIPPED';
export type SignalType = 'HYBRID' | 'QUANT' | 'PATTERN';

export interface FilterState {
  status: FilterStatus;
  reason: string;
  threshold?: number;
  confidence?: number;
  riskRatio?: number;
}

export interface WeightContribution {
  volZ: number;
  trendZ: number;
  adx: number;
  momentum: number;
  [key: string]: number;
}

export interface ModelDiagnostics {
  calibrationDrift: number;
  meanConfidence: number;
  accuracy7d: number;
  weightContribution: WeightContribution;
}

export interface TraceDecision {
  pair: string;
  signalType: SignalType;
  predictedRegime: string;
  modelUsed: string;
  decision: DecisionOutcome;
  tracePath: string[];
  timestamp: string;
  confidence?: number;
  finalScore?: number;
}

export interface PredictiveDiagnosticsPayload {
  schema: string;
  timestamp: string;
  predictiveModels: Record<string, ModelDiagnostics>;
  filters: Record<string, FilterState>;
  recentDecisions: TraceDecision[];
  telemetryStats: {
    totalSignalsProcessed: number;
    passRate: number;
    avgConfidence: number;
    driftWarnings: number;
  };
}

const RECENT_DECISIONS_CAP = 100;
const CALIBRATION_DRIFT_THRESHOLD = 1.0;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.65;

class PredictiveDiagnosticsService {
  private recentDecisions: TraceDecision[] = [];
  private filterStates: Record<string, FilterState> = {};
  private modelMetrics: Record<string, ModelDiagnostics> = {};
  private signalCount = 0;
  private passCount = 0;
  private confidenceSum = 0;
  private driftWarnings = 0;
  
  private confidenceHistory: number[] = [];
  private accuracyHistory: { predicted: boolean; actual: boolean; timestamp: number }[] = [];

  constructor() {
    this.initializeDefaultState();
  }

  private initializeDefaultState(): void {
    this.filterStates = {
      macroFilter: { status: 'PASS', reason: 'Macro conditions stable' },
      volatilityFilter: { status: 'PASS', reason: 'Volatility within baseline' },
      confidenceGate: { status: 'PASS', reason: 'Confidence above threshold', threshold: DEFAULT_CONFIDENCE_THRESHOLD, confidence: 0.72 },
      riskScreen: { status: 'PASS', reason: 'Risk ratio acceptable', riskRatio: 0.9 }
    };

    this.modelMetrics = {
      ensemble_primary: {
        calibrationDrift: 0.12,
        meanConfidence: 0.78,
        accuracy7d: 0.82,
        weightContribution: {
          volZ: 0.33,
          trendZ: 0.29,
          adx: 0.22,
          momentum: 0.16
        }
      }
    };
  }

  /**
   * Record a filter evaluation result
   */
  recordFilterResult(
    filterName: string,
    status: FilterStatus,
    reason: string,
    metadata?: { threshold?: number; confidence?: number; riskRatio?: number }
  ): void {
    this.filterStates[filterName] = {
      status,
      reason,
      ...metadata
    };

    if (status === 'DRIFT') {
      this.driftWarnings++;
    }
  }

  /**
   * Update model diagnostics from ML calibration service
   */
  updateModelDiagnostics(
    modelId: string,
    diagnostics: Partial<ModelDiagnostics>
  ): void {
    if (!this.modelMetrics[modelId]) {
      this.modelMetrics[modelId] = {
        calibrationDrift: 0,
        meanConfidence: 0.5,
        accuracy7d: 0.5,
        weightContribution: { volZ: 0.25, trendZ: 0.25, adx: 0.25, momentum: 0.25 }
      };
    }

    Object.assign(this.modelMetrics[modelId], diagnostics);

    if (diagnostics.calibrationDrift && diagnostics.calibrationDrift > CALIBRATION_DRIFT_THRESHOLD) {
      this.driftWarnings++;
    }
  }

  /**
   * Record a trade decision with full traceback
   */
  recordDecision(decision: Omit<TraceDecision, 'timestamp'>): void {
    const fullDecision: TraceDecision = {
      ...decision,
      timestamp: new Date().toISOString()
    };

    this.recentDecisions.push(fullDecision);
    
    if (this.recentDecisions.length > RECENT_DECISIONS_CAP) {
      this.recentDecisions = this.recentDecisions.slice(-RECENT_DECISIONS_CAP);
    }

    this.signalCount++;
    if (decision.decision === 'APPROVED') {
      this.passCount++;
    }
    if (decision.confidence !== undefined) {
      this.confidenceSum += decision.confidence;
      this.confidenceHistory.push(decision.confidence);
      if (this.confidenceHistory.length > 1000) {
        this.confidenceHistory.shift();
      }
    }
  }

  /**
   * Record prediction outcome for accuracy tracking
   */
  recordPredictionOutcome(predicted: boolean, actual: boolean): void {
    this.accuracyHistory.push({
      predicted,
      actual,
      timestamp: Date.now()
    });

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.accuracyHistory = this.accuracyHistory.filter(h => h.timestamp > sevenDaysAgo);

    const correct = this.accuracyHistory.filter(h => h.predicted === h.actual).length;
    const total = this.accuracyHistory.length;
    const accuracy7d = total > 0 ? correct / total : 0.5;

    this.updateModelDiagnostics('ensemble_primary', { accuracy7d });
  }

  /**
   * Update weight contributions from adaptive learning
   */
  updateWeightContributions(modelId: string, weights: WeightContribution): void {
    if (this.modelMetrics[modelId]) {
      this.modelMetrics[modelId].weightContribution = weights;
    }
  }

  /**
   * Calculate calibration drift from confidence vs outcome history
   */
  calculateCalibrationDrift(): number {
    if (this.confidenceHistory.length < 10) return 0;

    const meanConfidence = this.confidenceHistory.reduce((a, b) => a + b, 0) / this.confidenceHistory.length;
    const actualPassRate = this.passCount / Math.max(1, this.signalCount);
    
    const drift = Math.abs(meanConfidence - actualPassRate);
    
    this.updateModelDiagnostics('ensemble_primary', {
      calibrationDrift: drift,
      meanConfidence
    });

    return drift;
  }

  /**
   * Get the full diagnostics payload for API response
   */
  getDiagnostics(): PredictiveDiagnosticsPayload {
    this.calculateCalibrationDrift();

    return {
      schema: PREDICTIVE_DIAGNOSTICS_SCHEMA,
      timestamp: new Date().toISOString(),
      predictiveModels: { ...this.modelMetrics },
      filters: { ...this.filterStates },
      recentDecisions: [...this.recentDecisions].slice(-RECENT_DECISIONS_CAP),
      telemetryStats: {
        totalSignalsProcessed: this.signalCount,
        passRate: this.signalCount > 0 ? this.passCount / this.signalCount : 0,
        avgConfidence: this.confidenceHistory.length > 0 
          ? this.confidenceHistory.reduce((a, b) => a + b, 0) / this.confidenceHistory.length 
          : 0,
        driftWarnings: this.driftWarnings
      }
    };
  }

  /**
   * Get filter descriptions for UI tooltips
   */
  getFilterDescriptions(): Record<string, string> {
    return { ...PREDICTIVE_FILTER_DESCRIPTIONS };
  }

  /**
   * Reset telemetry counters (for testing or daily reset)
   */
  resetCounters(): void {
    this.signalCount = 0;
    this.passCount = 0;
    this.confidenceSum = 0;
    this.driftWarnings = 0;
    this.confidenceHistory = [];
  }

  /**
   * Clear recent decisions (for testing)
   */
  clearDecisions(): void {
    this.recentDecisions = [];
  }
}

let instance: PredictiveDiagnosticsService | null = null;

export function getPredictiveDiagnosticsService(): PredictiveDiagnosticsService {
  if (!instance) {
    instance = new PredictiveDiagnosticsService();
    console.log('[11.7G] PredictiveDiagnosticsService initialized');
  }
  return instance;
}

export { PredictiveDiagnosticsService };
