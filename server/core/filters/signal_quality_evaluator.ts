/**
 * Phase 8.8.4-B.1/C: Signal Quality Evaluator (SQE)
 * Directive 8.8.4-A3.R9.0.C: SQE Normalization, CWQI Correction, Symbol Resolution
 * 
 * Pure filter that evaluates pre-computed signal quality metrics.
 * The SQE does NOT compute metrics - it only filters based on thresholds.
 * 
 * R9C-1: Evaluate raw metrics against thresholds first, then clamp for downstream.
 * R9C-3: All symbol comparisons use Kraken Symbol Resolver.
 * 
 * Filtering Thresholds (relaxed):
 * - NGC >= 0.45 (Normalized Global Confidence)
 * - Risk <= 0.85 
 * - ProfitRate >= 0.10 (or strategy-specific floor if higher)
 * - CWQI >= 0.35
 * 
 * Phase C: Strategy-specific ProfitRate floors from config/strategy_thresholds.json
 * 
 * All metrics must be computed upstream (Signal Orchestrator) and passed to SQE.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SQE_THRESHOLDS } from '../metrics/quality_index';
import { performanceMonitor } from '../diagnostics/performance_monitor';
import { normalizeInternal } from '../../markets/kraken-symbol-resolver';
import { diagnosticTrace } from '../diagnostics/trace_service';
import { dataAggregator } from '../../services/data-aggregator.js';

interface StrategyThresholdsConfig {
  profitRateFloors: Record<string, number>;
}

const DEFAULT_PROFIT_RATE_FLOORS: Record<string, number> = {
  DHMA: 0.22,
  VWAP_Bounce: 0.25,
  MeanReversion: 0.28,
  Breakout: 0.30,
  Scalper: 0.35,
};

let strategyThresholds: StrategyThresholdsConfig | null = null;

function loadStrategyThresholds(): StrategyThresholdsConfig {
  if (strategyThresholds) {
    return strategyThresholds;
  }
  
  try {
    const configPath = path.resolve(process.cwd(), 'config/strategy_thresholds.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      strategyThresholds = JSON.parse(configData);
      console.log('[C][PROFIT_FLOORS] Loaded strategy thresholds:', strategyThresholds?.profitRateFloors);
      return strategyThresholds!;
    }
  } catch (err) {
    console.log('[C][PROFIT_FLOORS] Error loading config, using defaults:', err);
  }
  
  strategyThresholds = { profitRateFloors: DEFAULT_PROFIT_RATE_FLOORS };
  console.log('[C][PROFIT_FLOORS] Using default strategy thresholds');
  return strategyThresholds;
}

export function getProfitRateFloor(strategy: string): number {
  const config = loadStrategyThresholds();
  const floor = config.profitRateFloors[strategy];
  
  if (floor !== undefined) {
    return floor;
  }
  
  return SQE_THRESHOLDS.MIN_PROFIT_RATE;
}

export interface SQEInput {
  signalId: string;
  symbol: string;
  strategy: string;
  ngc: number;
  riskScore: number;
  profitRate: number;
  cwqi: number;
}

/**
 * Directive A3.R8.2: SQE evaluation options
 */
export interface SQEOptions {
  skipDecay?: boolean;  // Skip decay when re-evaluating during refresh cycles
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
 * Phase C: Uses strategy-specific ProfitRate floors
 * Directive A3.R9.0: Restored thresholds for ~35-50% pass rate
 * Directive A3.R9.0.C: Evaluate raw metrics first, normalize only for downstream
 * 
 * @param input - Pre-computed signal metrics
 * @param options - Optional evaluation settings (skipDecay for refresh cycles)
 * @returns SQEResult with pass/fail status and any failures
 */
export function evaluateSignalQuality(input: SQEInput, options: SQEOptions = {}): SQEResult {
  const failures: string[] = [];
  
  // R9C-3: Normalize symbol via Kraken Resolver for consistent comparison
  const canonicalSymbol = normalizeInternal(input.symbol);
  
  // R9C-1: Evaluate RAW metrics against thresholds (no pre-normalization)
  const profitRateFloor = getProfitRateFloor(input.strategy);
  
  if (input.ngc < SQE_THRESHOLDS.MIN_NGC) {
    failures.push(`NGC ${input.ngc.toFixed(4)} < ${SQE_THRESHOLDS.MIN_NGC}`);
  }
  
  if (input.riskScore > SQE_THRESHOLDS.MAX_RISK) {
    failures.push(`Risk ${input.riskScore.toFixed(4)} > ${SQE_THRESHOLDS.MAX_RISK}`);
  }
  
  if (input.profitRate < profitRateFloor) {
    failures.push(`ProfitRate ${input.profitRate.toFixed(4)} < Floor[${input.strategy}]=${profitRateFloor}`);
  }
  
  if (input.cwqi < SQE_THRESHOLDS.MIN_CWQI) {
    failures.push(`CWQI ${input.cwqi.toFixed(4)} < ${SQE_THRESHOLDS.MIN_CWQI}`);
  }
  
  const passed = failures.length === 0;
  
  // Directive A3.R9.2-C: Enhanced diagnostic logging for filtered-out signals
  if (!passed) {
    const failureReason = failures[0]?.split(' ')[0] || 'unknown';
    console.log(`[A3.R9.2][SQE_FILTERED] ${canonicalSymbol} reason=${failureReason} NGC=${input.ngc.toFixed(4)} CWQI=${input.cwqi.toFixed(4)} Risk=${input.riskScore.toFixed(4)} ProfitRate=${input.profitRate.toFixed(4)}`);
  }
  
  // Directive A3.R9.2: Unified SQE filter logging
  const status = passed ? 'PASS' : 'FAIL';
  const reason = passed ? 'all_thresholds_met' : failures[0]?.split(' ')[0] || 'unknown';
  console.log(`[A3.R9.2][SQE_EVAL] ${status} symbol=${canonicalSymbol} strategy=${input.strategy} NGC=${input.ngc.toFixed(4)} CWQI=${input.cwqi.toFixed(4)} reason=${reason}`);
  
  // A3.R9.2: Record metric for performance monitoring
  performanceMonitor.recordSQEEvaluation(passed);
  
  // Directive 8.8.4-L1: Capture SQE evaluation data for learning aggregation
  dataAggregator.capture('SQE_EVAL', {
    symbol: canonicalSymbol,
    strategy: input.strategy,
    cwqi: input.cwqi,
    ngc: input.ngc,
    risk: input.riskScore,
    profitRate: input.profitRate,
    sqeScore: passed ? 1 : 0,
    passed
  }).catch(() => {});
  
  // Directive 8.8.4-A3.R9.0.D: Trace SQE evaluation result
  diagnosticTrace.traceSQE(
    canonicalSymbol,
    input.strategy,
    {
      ngc: input.ngc,
      cwqi: input.cwqi,
      profit: input.profitRate,
      risk: input.riskScore,
    },
    passed,
    true // metrics are clamped for downstream
  );
  
  // R9C-1: Clamp metrics only for downstream consumers (after threshold check)
  const clampedMetrics = {
    ngc: Math.max(0, Math.min(1, input.ngc)),
    riskScore: Math.max(0, Math.min(1, input.riskScore)),
    profitRate: Math.max(0, Math.min(1, input.profitRate)),
    cwqi: Math.max(0, Math.min(1, input.cwqi)),
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
 * Phase C: Uses strategy-specific ProfitRate floors for classification
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
  
  const profitRateFloor = getProfitRateFloor(result.strategy);
  if (result.metrics.profitRate < profitRateFloor) {
    return 'LOW_PROFIT_RATE';
  }
  
  return 'UNKNOWN';
}

/**
 * Check if a signal should be soft-rejected (close to thresholds)
 * Phase C: Uses strategy-specific ProfitRate floors
 */
export function isMarginallySafe(result: SQEResult): boolean {
  if (!result.passed) return false;
  
  const { ngc, riskScore, profitRate, cwqi } = result.metrics;
  
  const profitRateFloor = getProfitRateFloor(result.strategy);
  
  const ngcMargin = ngc - SQE_THRESHOLDS.MIN_NGC;
  const riskMargin = SQE_THRESHOLDS.MAX_RISK - riskScore;
  const profitMargin = profitRate - profitRateFloor;
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
  
  /**
   * Directive A3.R8.2: Evaluate with optional skipDecay for refresh cycles
   */
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
