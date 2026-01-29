/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7Q — Adjustment Explainability Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Generates human-interpretable explanations for every predictive adjustment.
 * 
 * OBSERVABILITY ONLY — No learning logic modifications permitted.
 * 
 * Schema Version: learning-explainability/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { PredictiveAdjustmentEntry, AdjustmentType } from '../logging/predictive-adjustments';

export const EXPLAINABILITY_SCHEMA = 'learning-explainability/v1.0';

/**
 * Trigger context explaining what initiated the adjustment
 */
export interface TriggerContext {
  learningSystem: string;
  evaluationWindow: string;
  sampleSize: number;
  evaluationPeriod?: string;
}

/**
 * Performance rationale explaining the metrics that drove the adjustment
 */
export interface PerformanceRationale {
  triggerMetric: string;
  metricValue: number | string;
  direction: 'improved' | 'degraded' | 'stable' | 'unknown';
  regimesInvolved: string[];
  additionalMetrics?: Record<string, number | string>;
}

/**
 * Complete adjustment explanation
 */
export interface AdjustmentExplanation {
  triggerContext: TriggerContext;
  performanceRationale: PerformanceRationale;
  intentSummary: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  isLifecycleEvent: boolean;
}

/**
 * Enhanced adjustment entry with explanation
 */
export interface ExplainedAdjustment extends PredictiveAdjustmentEntry {
  explanation?: AdjustmentExplanation;
}

/**
 * Parses the reason string to extract evaluation context
 */
function parseEvaluationContext(reason: string): { sampleSize: number; metrics: Record<string, number> } {
  const sampleSize = 50;
  const metrics: Record<string, number> = {};

  const perfScoreMatch = reason.match(/perfScore=([\d.-]+)/);
  if (perfScoreMatch) {
    metrics.performanceScore = parseFloat(perfScoreMatch[1]);
  }

  const edgeDeltaMatch = reason.match(/edgeDelta=([\d.e-]+)/);
  if (edgeDeltaMatch) {
    metrics.edgeDelta = parseFloat(edgeDeltaMatch[1]);
  }

  const winRateMatch = reason.match(/(\d+(?:\.\d+)?)%\s*win/i);
  if (winRateMatch) {
    metrics.winRate = parseFloat(winRateMatch[1]);
  }

  const expectancyMatch = reason.match(/([-]?\d+\.?\d*)R/);
  if (expectancyMatch) {
    metrics.expectancy = parseFloat(expectancyMatch[1]);
  }

  return { sampleSize, metrics };
}

/**
 * Determines the learning system from the adjustment details
 */
function identifyLearningSystem(entry: PredictiveAdjustmentEntry): string {
  const reason = entry.reason.toLowerCase();
  const param = entry.parameter.toLowerCase();

  if (reason.includes('mlcalibration') || param.includes('ml.')) {
    return 'ML Calibration Service';
  }
  if (reason.includes('telemetry') || param.includes('telemetry')) {
    return 'Telemetry Aggregator';
  }
  if (reason.includes('adaptive') || param.includes('adaptive')) {
    return 'Adaptive Parameter System';
  }
  if (reason.includes('vts') || param.includes('vts')) {
    return 'Virtual Trade Simulator';
  }
  if (entry.adjustmentType === 'lifecycle') {
    return 'System Lifecycle';
  }
  return 'Learning Engine';
}

/**
 * Extracts the pattern/strategy from parameter name
 */
function extractPattern(param: string): string | null {
  const match = param.match(/ml\.(\w+)_weight/);
  if (match) return match[1];
  
  const stratMatch = param.match(/strategy\.(\w+)/);
  if (stratMatch) return stratMatch[1];
  
  return null;
}

/**
 * Determines the direction of change
 */
function determineDirection(delta: number, category: string): 'improved' | 'degraded' | 'stable' | 'unknown' {
  if (Math.abs(delta) < 0.001) return 'stable';
  
  if (category === 'Weight') {
    return delta > 0 ? 'improved' : 'degraded';
  }
  if (category === 'Confidence' || category === 'ROI') {
    return delta > 0 ? 'improved' : 'degraded';
  }
  
  return 'unknown';
}

/**
 * Generates a human-readable intent summary
 */
function generateIntentSummary(entry: PredictiveAdjustmentEntry, context: { sampleSize: number; metrics: Record<string, number> }): string {
  const pattern = extractPattern(entry.parameter);
  const action = entry.delta > 0 ? 'increased' : 'decreased';
  const magnitude = Math.abs(entry.delta).toFixed(4);
  
  if (entry.adjustmentType === 'lifecycle') {
    return `System ${entry.reason.includes('enabled') ? 'enabled' : entry.reason.includes('disabled') ? 'disabled' : 'initialized'} ${entry.parameter}.`;
  }
  
  if (pattern && entry.category === 'Weight') {
    const expectancy = context.metrics.expectancy;
    const winRate = context.metrics.winRate;
    const regime = entry.regime || 'all regimes';
    
    let rationale = '';
    if (expectancy !== undefined) {
      rationale = expectancy >= 0 
        ? `positive expectancy (+${expectancy.toFixed(2)}R)` 
        : `negative expectancy (${expectancy.toFixed(2)}R)`;
    } else if (winRate !== undefined) {
      rationale = winRate >= 50 
        ? `${winRate.toFixed(1)}% win rate` 
        : `${winRate.toFixed(1)}% win rate (below threshold)`;
    } else {
      rationale = 'performance metrics';
    }
    
    return `${pattern.toUpperCase()} weight ${action} by ${magnitude} due to ${rationale} over last ${context.sampleSize} HYBRID trades in ${regime}.`;
  }
  
  return `${entry.parameter} ${action} from ${entry.oldValue.toFixed(4)} to ${entry.newValue.toFixed(4)} based on ${entry.reason}.`;
}

/**
 * Determines confidence level based on sample size and metric quality
 */
function determineConfidenceLevel(sampleSize: number, metrics: Record<string, number>): 'high' | 'medium' | 'low' {
  if (sampleSize >= 50 && Object.keys(metrics).length >= 2) return 'high';
  if (sampleSize >= 20 && Object.keys(metrics).length >= 1) return 'medium';
  return 'low';
}

/**
 * Generates a complete explanation for a predictive adjustment
 */
export function generateExplanation(entry: PredictiveAdjustmentEntry): AdjustmentExplanation {
  const { sampleSize, metrics } = parseEvaluationContext(entry.reason);
  const learningSystem = identifyLearningSystem(entry);
  const isLifecycle = entry.adjustmentType === 'lifecycle';
  
  const triggerContext: TriggerContext = {
    learningSystem,
    evaluationWindow: `Last ${sampleSize} trades`,
    sampleSize,
    evaluationPeriod: new Date(entry.timestamp).toLocaleDateString()
  };
  
  const performanceRationale: PerformanceRationale = {
    triggerMetric: metrics.expectancy !== undefined ? 'expectancy' 
      : metrics.winRate !== undefined ? 'win_rate'
      : metrics.performanceScore !== undefined ? 'performance_score'
      : 'composite_metrics',
    metricValue: metrics.expectancy ?? metrics.winRate ?? metrics.performanceScore ?? entry.delta,
    direction: determineDirection(entry.delta, entry.category),
    regimesInvolved: entry.regime ? [entry.regime] : ['all'],
    additionalMetrics: metrics
  };
  
  const intentSummary = generateIntentSummary(entry, { sampleSize, metrics });
  const confidenceLevel = isLifecycle ? 'high' : determineConfidenceLevel(sampleSize, metrics);
  
  return {
    triggerContext,
    performanceRationale,
    intentSummary,
    confidenceLevel,
    isLifecycleEvent: isLifecycle
  };
}

/**
 * Enriches an array of adjustments with explanations
 */
export function enrichWithExplanations(adjustments: PredictiveAdjustmentEntry[]): ExplainedAdjustment[] {
  return adjustments.map(adj => ({
    ...adj,
    explanation: generateExplanation(adj)
  }));
}

console.log('[11.7Q] Adjustment Explainability Service loaded (schema: learning-explainability/v1.0)');
