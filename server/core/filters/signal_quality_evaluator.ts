/**
 * Phase 8.8.4-B.1: Signal Quality Evaluator (SQE)
 * 
 * Pure filter that evaluates pre-computed signal quality metrics.
 * The SQE does NOT compute metrics - it only filters based on thresholds.
 * 
 * Filtering Thresholds:
 * - NGC >= 0.40 (Normalized Global Confidence)
 * - Risk <= 0.70 
 * - ProfitRate >= 0.25
 * - CWQI >= 0.50
 * 
 * All metrics must be computed upstream (Signal Orchestrator) and passed to SQE.
 */

import { SQE_THRESHOLDS } from '../metrics/quality_index';

export interface SQEInput {
  signalId: string;
  symbol: string;
  strategy: string;
  ngc: number;
  riskScore: number;
  profitRate: number;
  cwqi: number;
}

export interface SQEResult {
  passed: boolean;
  signalId: string;
  symbol: string;
  strategy: string;
  metrics: {
    ngc: number;
    riskScore: number;
    profitRate: number;
    cwqi: number;
  };
  failures: string[];
  reason?: string;
}

export interface SQEBatchResult {
  passed: SQEResult[];
  rejected: SQEResult[];
  totalEvaluated: number;
  passRate: number;
}

/**
 * Evaluate a single signal against SQE quality thresholds
 * 
 * @param input - Pre-computed signal metrics
 * @returns SQEResult with pass/fail status and any failures
 */
export function evaluateSignalQuality(input: SQEInput): SQEResult {
  const failures: string[] = [];
  
  if (input.ngc < SQE_THRESHOLDS.MIN_NGC) {
    failures.push(`NGC ${input.ngc.toFixed(4)} < ${SQE_THRESHOLDS.MIN_NGC}`);
  }
  
  if (input.riskScore > SQE_THRESHOLDS.MAX_RISK) {
    failures.push(`Risk ${input.riskScore.toFixed(4)} > ${SQE_THRESHOLDS.MAX_RISK}`);
  }
  
  if (input.profitRate < SQE_THRESHOLDS.MIN_PROFIT_RATE) {
    failures.push(`ProfitRate ${input.profitRate.toFixed(4)} < ${SQE_THRESHOLDS.MIN_PROFIT_RATE}`);
  }
  
  if (input.cwqi < SQE_THRESHOLDS.MIN_CWQI) {
    failures.push(`CWQI ${input.cwqi.toFixed(4)} < ${SQE_THRESHOLDS.MIN_CWQI}`);
  }
  
  const passed = failures.length === 0;
  
  return {
    passed,
    signalId: input.signalId,
    symbol: input.symbol,
    strategy: input.strategy,
    metrics: {
      ngc: input.ngc,
      riskScore: input.riskScore,
      profitRate: input.profitRate,
      cwqi: input.cwqi,
    },
    failures,
    reason: passed ? undefined : failures.join('; '),
  };
}

/**
 * Evaluate a batch of signals
 * Returns separate arrays for passed and rejected signals
 */
export function evaluateSignalBatch(inputs: SQEInput[]): SQEBatchResult {
  const passed: SQEResult[] = [];
  const rejected: SQEResult[] = [];
  
  for (const input of inputs) {
    const result = evaluateSignalQuality(input);
    if (result.passed) {
      passed.push(result);
    } else {
      rejected.push(result);
    }
  }
  
  return {
    passed,
    rejected,
    totalEvaluated: inputs.length,
    passRate: inputs.length > 0 ? passed.length / inputs.length : 0,
  };
}

/**
 * Get the primary failure reason for a signal
 * Used for categorizing rejections
 */
export function getPrimaryFailureReason(result: SQEResult): string | null {
  if (result.passed || result.failures.length === 0) {
    return null;
  }
  
  if (result.metrics.cwqi < SQE_THRESHOLDS.MIN_CWQI) {
    return 'LOW_CWQI';
  }
  if (result.metrics.ngc < SQE_THRESHOLDS.MIN_NGC) {
    return 'LOW_NGC';
  }
  if (result.metrics.riskScore > SQE_THRESHOLDS.MAX_RISK) {
    return 'HIGH_RISK';
  }
  if (result.metrics.profitRate < SQE_THRESHOLDS.MIN_PROFIT_RATE) {
    return 'LOW_PROFIT_RATE';
  }
  
  return 'UNKNOWN';
}

/**
 * Check if a signal should be soft-rejected (close to thresholds)
 * Used for queue prioritization hints
 */
export function isMarginallySafe(result: SQEResult): boolean {
  if (!result.passed) return false;
  
  const { ngc, riskScore, profitRate, cwqi } = result.metrics;
  
  const ngcMargin = ngc - SQE_THRESHOLDS.MIN_NGC;
  const riskMargin = SQE_THRESHOLDS.MAX_RISK - riskScore;
  const profitMargin = profitRate - SQE_THRESHOLDS.MIN_PROFIT_RATE;
  const cwqiMargin = cwqi - SQE_THRESHOLDS.MIN_CWQI;
  
  const marginThreshold = 0.05;
  
  return (
    ngcMargin < marginThreshold ||
    riskMargin < marginThreshold ||
    profitMargin < marginThreshold ||
    cwqiMargin < marginThreshold
  );
}

/**
 * Get SQE threshold configuration for display/diagnostics
 */
export function getSQEThresholds(): typeof SQE_THRESHOLDS {
  return { ...SQE_THRESHOLDS };
}

/**
 * Signal Quality Evaluator service instance
 */
class SignalQualityEvaluatorService {
  private evaluationCount = 0;
  private passCount = 0;
  private rejectCount = 0;
  
  evaluate(input: SQEInput): SQEResult {
    const result = evaluateSignalQuality(input);
    
    this.evaluationCount++;
    if (result.passed) {
      this.passCount++;
    } else {
      this.rejectCount++;
      console.log(`[SQE][REJECT] ${input.symbol}/${input.strategy}: ${result.reason}`);
    }
    
    return result;
  }
  
  evaluateBatch(inputs: SQEInput[]): SQEBatchResult {
    return evaluateSignalBatch(inputs);
  }
  
  getStats(): { evaluations: number; passed: number; rejected: number; passRate: number } {
    return {
      evaluations: this.evaluationCount,
      passed: this.passCount,
      rejected: this.rejectCount,
      passRate: this.evaluationCount > 0 ? this.passCount / this.evaluationCount : 0,
    };
  }
  
  reset(): void {
    this.evaluationCount = 0;
    this.passCount = 0;
    this.rejectCount = 0;
    console.log('[SQE] Stats reset');
  }
}

export const signalQualityEvaluator = new SignalQualityEvaluatorService();
