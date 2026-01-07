/**
 * Directive 11.0B — Signal Quality Evaluator (SQE)
 * 
 * Final gatekeeper that evaluates signal quality.
 * 
 * Directive 11.0B: PRIMARY filtering is on FinalScore and RegimeWeight.
 * When FinalScore is provided, it takes precedence over legacy metrics.
 * Legacy metrics (NGC, CWQI, Risk, ProfitRate) are used as fallback for backward compatibility.
 * 
 * Thresholds:
 * - FinalScore >= MIN_FINAL_SCORE (0.35)
 * - RegimeWeight >= MIN_REGIME_WEIGHT (0.30)
 * 
 * Exposure, correlation, and cooldown checks are handled by the Signal Orchestrator.
 * All metrics must be computed upstream (Signal Orchestrator) and passed to SQE.
 */

import { performanceMonitor } from '../diagnostics/performance_monitor';
import { normalizeInternal } from '../../markets/kraken-symbol-resolver';
import { diagnosticTrace } from '../diagnostics/trace_service';
import { dataAggregator } from '../../services/data-aggregator.js';

/**
 * Directive 11.0B: SQE Thresholds
 * Primary: FinalScore and RegimeWeight
 * Legacy: NGC, CWQI, Risk, ProfitRate (for backward compatibility)
 */
export const SQE_THRESHOLDS = {
  MIN_FINAL_SCORE: parseFloat(process.env.SQE_FINAL_SCORE_MIN || '0.35'),
  MIN_REGIME_WEIGHT: parseFloat(process.env.SQE_REGIME_MIN || '0.30'),
  // Legacy thresholds (for backward compatibility when FinalScore not provided)
  MIN_NGC: parseFloat(process.env.SQE_NGC_MIN || '0.55'),
  MAX_RISK: parseFloat(process.env.SQE_MAX_RISK || '0.85'),
  MIN_PROFIT_RATE: parseFloat(process.env.SQE_PROFIT_MIN || '0.10'),
  MIN_CWQI: parseFloat(process.env.SQE_CWQI_MIN || '0.45'),
};

console.log(`[11.0B][SQE_CONFIG] FinalScore>=${SQE_THRESHOLDS.MIN_FINAL_SCORE} RegimeWeight>=${SQE_THRESHOLDS.MIN_REGIME_WEIGHT} (Legacy: NGC>=${SQE_THRESHOLDS.MIN_NGC} CWQI>=${SQE_THRESHOLDS.MIN_CWQI})`);

export interface SQEInput {
  signalId: string;
  symbol: string;
  strategy: string;
  // Primary metrics (11.0B)
  finalScore?: number;
  regimeWeight?: number;
  // Legacy metrics (backward compatibility)
  ngc?: number;
  riskScore?: number;
  profitRate?: number;
  cwqi?: number;
}

export interface SQEOptions {
  skipDecay?: boolean;
}

export interface SQEResult {
  passed: boolean;
  signalId: string;
  symbol: string;
  strategy: string;
  metrics: {
    finalScore?: number;
    regimeWeight?: number;
    ngc?: number;
    riskScore?: number;
    profitRate?: number;
    cwqi?: number;
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
 * Directive 11.0B: Evaluate a single signal against SQE thresholds
 * If FinalScore and RegimeWeight are provided, use ONLY those.
 * Otherwise, fall back to legacy metrics for backward compatibility.
 * 
 * @param input - Pre-computed signal metrics
 * @param options - Optional evaluation settings
 * @returns SQEResult with pass/fail status and any failures
 */
export function evaluateSignalQuality(input: SQEInput, options: SQEOptions = {}): SQEResult {
  const failures: string[] = [];
  
  const canonicalSymbol = normalizeInternal(input.symbol);
  
  // Directive 11.0B: Use FinalScore-based filtering if available
  const useFinalScoreMode = input.finalScore !== undefined && input.finalScore !== null;
  
  if (useFinalScoreMode) {
    // PRIMARY: FinalScore-based filtering (11.0B)
    if (input.finalScore! < SQE_THRESHOLDS.MIN_FINAL_SCORE) {
      failures.push(`FinalScore ${input.finalScore!.toFixed(4)} < ${SQE_THRESHOLDS.MIN_FINAL_SCORE}`);
    }
    
    if (input.regimeWeight !== undefined && input.regimeWeight !== null) {
      if (input.regimeWeight < SQE_THRESHOLDS.MIN_REGIME_WEIGHT) {
        failures.push(`RegimeWeight ${input.regimeWeight.toFixed(4)} < ${SQE_THRESHOLDS.MIN_REGIME_WEIGHT}`);
      }
    }
  } else {
    // LEGACY: NGC/CWQI/Risk/ProfitRate filtering (backward compatibility)
    if (input.ngc !== undefined && input.ngc < SQE_THRESHOLDS.MIN_NGC) {
      failures.push(`NGC ${input.ngc.toFixed(4)} < ${SQE_THRESHOLDS.MIN_NGC}`);
    }
    
    if (input.riskScore !== undefined && input.riskScore > SQE_THRESHOLDS.MAX_RISK) {
      failures.push(`Risk ${input.riskScore.toFixed(4)} > ${SQE_THRESHOLDS.MAX_RISK}`);
    }
    
    if (input.profitRate !== undefined && input.profitRate < SQE_THRESHOLDS.MIN_PROFIT_RATE) {
      failures.push(`ProfitRate ${input.profitRate.toFixed(4)} < ${SQE_THRESHOLDS.MIN_PROFIT_RATE}`);
    }
    
    if (input.cwqi !== undefined && input.cwqi < SQE_THRESHOLDS.MIN_CWQI) {
      failures.push(`CWQI ${input.cwqi.toFixed(4)} < ${SQE_THRESHOLDS.MIN_CWQI}`);
    }
  }
  
  const passed = failures.length === 0;
  
  const status = passed ? 'PASS' : 'FAIL';
  const reason = passed ? 'thresholds_met' : failures[0]?.split(' ')[0] || 'unknown';
  const mode = useFinalScoreMode ? 'FinalScore' : 'Legacy';
  console.log(`[11.0B][SQE_EVAL] ${status} symbol=${canonicalSymbol} strategy=${input.strategy} mode=${mode} reason=${reason}`);
  
  performanceMonitor.recordSQEEvaluation(passed);
  
  dataAggregator.capture('SQE_EVAL', {
    symbol: canonicalSymbol,
    strategy: input.strategy,
    finalScore: input.finalScore,
    regimeWeight: input.regimeWeight,
    ngc: input.ngc,
    cwqi: input.cwqi,
    risk: input.riskScore,
    profitRate: input.profitRate,
    sqeScore: passed ? 1 : 0,
    passed
  }).catch(() => {});
  
  diagnosticTrace.traceSQE(
    canonicalSymbol,
    input.strategy,
    {
      finalScore: input.finalScore,
      regimeWeight: input.regimeWeight,
      ngc: input.ngc,
      cwqi: input.cwqi,
      profit: input.profitRate,
      risk: input.riskScore,
    },
    passed,
    true
  );
  
  const clampedMetrics = {
    finalScore: input.finalScore !== undefined ? Math.max(0, Math.min(1, input.finalScore)) : undefined,
    regimeWeight: input.regimeWeight !== undefined ? Math.max(0, Math.min(1, input.regimeWeight)) : undefined,
    ngc: input.ngc !== undefined ? Math.max(0, Math.min(1, input.ngc)) : undefined,
    riskScore: input.riskScore !== undefined ? Math.max(0, Math.min(1, input.riskScore)) : undefined,
    profitRate: input.profitRate !== undefined ? Math.max(0, Math.min(1, input.profitRate)) : undefined,
    cwqi: input.cwqi !== undefined ? Math.max(0, Math.min(1, input.cwqi)) : undefined,
  };
  
  return {
    passed,
    signalId: input.signalId,
    symbol: canonicalSymbol,
    strategy: input.strategy,
    metrics: clampedMetrics,
    failures,
    reason: passed ? undefined : failures.join('; '),
  };
}

/**
 * Evaluate a batch of signals
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
 */
export function getPrimaryFailureReason(result: SQEResult): string | null {
  if (result.passed || result.failures.length === 0) {
    return null;
  }
  
  // Check FinalScore mode first
  if (result.metrics.finalScore !== undefined) {
    if (result.metrics.finalScore < SQE_THRESHOLDS.MIN_FINAL_SCORE) {
      return 'LOW_FINAL_SCORE';
    }
    if (result.metrics.regimeWeight !== undefined && result.metrics.regimeWeight < SQE_THRESHOLDS.MIN_REGIME_WEIGHT) {
      return 'LOW_REGIME_WEIGHT';
    }
  }
  
  // Legacy mode
  if (result.metrics.ngc !== undefined && result.metrics.ngc < SQE_THRESHOLDS.MIN_NGC) {
    return 'LOW_NGC';
  }
  if (result.metrics.cwqi !== undefined && result.metrics.cwqi < SQE_THRESHOLDS.MIN_CWQI) {
    return 'LOW_CWQI';
  }
  if (result.metrics.riskScore !== undefined && result.metrics.riskScore > SQE_THRESHOLDS.MAX_RISK) {
    return 'HIGH_RISK';
  }
  if (result.metrics.profitRate !== undefined && result.metrics.profitRate < SQE_THRESHOLDS.MIN_PROFIT_RATE) {
    return 'LOW_PROFIT_RATE';
  }
  
  return 'UNKNOWN';
}

/**
 * Check if a signal is marginally safe (close to thresholds)
 */
export function isMarginallySafe(result: SQEResult): boolean {
  if (!result.passed) return false;
  
  const marginThreshold = 0.05;
  
  // Check FinalScore mode
  if (result.metrics.finalScore !== undefined) {
    const finalScoreMargin = result.metrics.finalScore - SQE_THRESHOLDS.MIN_FINAL_SCORE;
    if (finalScoreMargin < marginThreshold) return true;
  }
  
  if (result.metrics.regimeWeight !== undefined) {
    const regimeMargin = result.metrics.regimeWeight - SQE_THRESHOLDS.MIN_REGIME_WEIGHT;
    if (regimeMargin < marginThreshold) return true;
  }
  
  // Legacy mode
  if (result.metrics.ngc !== undefined) {
    const ngcMargin = result.metrics.ngc - SQE_THRESHOLDS.MIN_NGC;
    if (ngcMargin < marginThreshold) return true;
  }
  
  if (result.metrics.cwqi !== undefined) {
    const cwqiMargin = result.metrics.cwqi - SQE_THRESHOLDS.MIN_CWQI;
    if (cwqiMargin < marginThreshold) return true;
  }
  
  return false;
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
  
  evaluate(input: SQEInput, options: SQEOptions = {}): SQEResult {
    const result = evaluateSignalQuality(input, options);
    
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
