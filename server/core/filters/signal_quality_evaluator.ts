/**
 * Directive 11.0E — Signal Quality Evaluator (SQE)
 * 
 * Final gatekeeper that evaluates signal quality based on FinalScore and RegimeWeight.
 * Thresholds are read from the screener_filters table (configurable via UI screeners tab).
 * 
 * DIRECTIVE 11.0E: ALL legacy metrics (NGC, CWQI, Risk, ProfitRate) have been PURGED.
 * FinalScore and RegimeWeight are the SOLE determinants for signal quality.
 * 
 * Exposure, correlation, and cooldown checks are handled by the Signal Orchestrator.
 */

import { storage } from '../../storage.js';
import { performanceMonitor } from '../diagnostics/performance_monitor';
import { normalizeInternal } from '../../markets/kraken-symbol-resolver';
import { diagnosticTrace } from '../diagnostics/trace_service';
import { dataAggregator } from '../../services/data-aggregator.js';
import { calculateFinalScore, calculateRegimeWeight } from '../utils/score-calculator.js';
import { isSignalProfitable, getMinROIForRegime, getDynamicROIThreshold } from '../calculations/expectancy.js';
import { getPredictiveConfidence } from '../utils/score-calculator.js';
import { logSkippedSignal } from '../logging/skipped-signals-logger.js';
// Phase 14.1 HF8 (B3): Confidence floor imports for centralized mode-based qualification
import { resolveStrategyMode, getModeOverlay, meetsConfidenceFloor } from '../governance/strategy-modes.js';
import type { RegimeStability } from '../../config/strategy-governance.js';
// HF9 Item B: Governance gate imports (migrated from paper-execution-engine)
import { isStrategyEligible } from '../governance/strategy-eligibility.js';
import { getStrategyDependency } from '../../config/strategy-governance.js';
// Phase 14.5: Pattern pool elevated quality floor
import { PATTERN_POOL_GUARDRAILS } from '../../config/pattern-filter-profile.js';

/**
 * Directive 11.0B: SQE Thresholds - Default values used when screener config is unavailable
 * Production values are loaded from screener_filters table
 */
export const SQE_DEFAULT_THRESHOLDS = {
  MIN_FINAL_SCORE: 0.35,
  MIN_REGIME_WEIGHT: 0.30,
};

console.log(`[11.0B][SQE_CONFIG] Defaults: FinalScore>=${SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE} RegimeWeight>=${SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT}`);

export interface SQEInput {
  signalId: string;
  symbol: string;
  strategy: string;
  mode: 'paper' | 'live';
  finalScore?: number;
  regimeWeight?: number;
  confidence?: number;
  trendStrength?: number;
  volatility?: number;
  entryPrice?: number;
  targetPrice?: number;
  regime?: string;
  signalType?: string;
  regimeStability?: RegimeStability;  // Phase 14.1 HF8 (B3): For confidence floor check
  sourcePool?: 'quant' | 'pattern';  // Phase 14.5: active filter path origin
}

export interface SQEOptions {
  skipDecay?: boolean;
  skipConfidenceFloor?: boolean;  // Phase 14.1 HF8 (B3): VTS cold-start bypass
  skipGovernanceGate?: boolean;   // HF9 Item B: VTS bypass (VTS has own inline governance)
}

export interface SQEResult {
  passed: boolean;
  signalId: string;
  symbol: string;
  strategy: string;
  metrics: {
    finalScore: number;
    regimeWeight: number;
  };
  thresholds: {
    finalScoreMin: number;
    regimeWeightMin: number;
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
 * Directive 11.0B: Get SQE thresholds from screener config
 * Reads finalScoreMin and regimeWeightMin from screener_filters table
 */
export async function getSQEThresholdsFromConfig(mode: 'paper' | 'live'): Promise<{ finalScoreMin: number; regimeWeightMin: number }> {
  try {
    const filters = await storage.getScreenerFilters({ mode });
    if (filters) {
      return {
        finalScoreMin: parseFloat(filters.finalScoreMin || String(SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE)),
        regimeWeightMin: parseFloat(filters.regimeWeightMin || String(SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT)),
      };
    }
  } catch (err) {
    console.warn(`[SQE][CONFIG] Failed to load screener config for ${mode}, using defaults:`, err);
  }
  
  return {
    finalScoreMin: SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE,
    regimeWeightMin: SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT,
  };
}

/**
 * Directive 11.0B: Evaluate a single signal against SQE thresholds
 * ONLY evaluates FinalScore and RegimeWeight - no legacy metrics
 * 
 * @param input - Pre-computed signal metrics (must include finalScore and regimeWeight)
 * @param options - Optional evaluation settings
 * @returns SQEResult with pass/fail status and any failures
 */
export async function evaluateSignalQuality(input: SQEInput, options: SQEOptions = {}): Promise<SQEResult> {
  const failures: string[] = [];
  
  const canonicalSymbol = normalizeInternal(input.symbol);
  
  // Phase 14: FinalScore and RegimeWeight must be pre-computed by extended metrics
  // Backfill removed — callers must provide these values
  const finalScore = input.finalScore ?? 0;
  const regimeWeight = input.regimeWeight ?? 0;

  if (input.finalScore === undefined || input.finalScore === null) {
    console.warn(`[SQE][MISSING] FinalScore not pre-computed for ${canonicalSymbol}/${input.strategy} — defaulting to 0`);
  }
  if (input.regimeWeight === undefined || input.regimeWeight === null) {
    console.warn(`[SQE][MISSING] RegimeWeight not pre-computed for ${canonicalSymbol}/${input.strategy} — defaulting to 0`);
  }
  
  // Load thresholds from screener config (configurable via UI)
  const thresholds = await getSQEThresholdsFromConfig(input.mode);
  
  // Phase 14.5: Pattern pool signals use elevated quality floor
  const effectiveMinFinalScore = input.sourcePool === 'pattern'
    ? PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR  // 0.45 for pattern pool
    : thresholds.finalScoreMin;                    // 0.35 for quant (default)

  if (finalScore < effectiveMinFinalScore) {
    failures.push(`FinalScore ${finalScore.toFixed(4)} < ${effectiveMinFinalScore} (${input.sourcePool === 'pattern' ? 'pattern' : 'quant'} threshold)`);
  }
  
  // Directive 11.0B: RegimeWeight check
  if (regimeWeight < thresholds.regimeWeightMin) {
    failures.push(`RegimeWeight ${regimeWeight.toFixed(4)} < ${thresholds.regimeWeightMin}`);
  }
  
  // Directive 11.7C Task 5: Regime-Aware ROI Gate with PredictiveConfidence (SQE parity with VTS)
  // Only apply if entry/target/regime are provided
  if (input.entryPrice && input.targetPrice && input.regime) {
    const predictiveConf = getPredictiveConfidence(canonicalSymbol, input.regime, input.strategy);
    if (!isSignalProfitable(input.entryPrice, input.targetPrice, input.regime, predictiveConf)) {
      const expectedROI = (input.targetPrice - input.entryPrice) / input.entryPrice;
      const dynamicROI = getDynamicROIThreshold(input.regime, predictiveConf);
      failures.push(`ROI ${(expectedROI * 100).toFixed(2)}% < ${(dynamicROI * 100).toFixed(2)}% for ${input.regime} (conf=${predictiveConf.toFixed(2)})`);
      logSkippedSignal({
        symbol: canonicalSymbol,
        reason: 'Low_ROI',
        regime: input.regime,
        expectedROI,
        minROI: dynamicROI,
        signalType: input.signalType,
        strategy: input.strategy,
        finalScore,
        regimeWeight,
        source: 'SQE'
      });
      console.log(`[11.7C][SQE][ROI_Gate] Skipping ${canonicalSymbol}: ROI ${(expectedROI * 100).toFixed(2)}% < min ${(dynamicROI * 100).toFixed(2)}% (conf=${predictiveConf.toFixed(2)}) for ${input.regime}`);
    }
  }
  
  // Phase 14.1 HF8 (B3): Confidence floor check (Directive 11.7S)
  // Centralized here so both VTS and active trading use the same qualification gate.
  // VTS signals pass skipConfidenceFloor=true for cold-start bypass (no data -> no confidence -> no trades loop).
  if (!options.skipConfidenceFloor && input.regimeStability && input.confidence !== undefined) {
    if (!meetsConfidenceFloor(input.confidence, input.regimeStability)) {
      const mode = resolveStrategyMode(input.regimeStability);
      const overlay = getModeOverlay(mode);
      failures.push(`Confidence ${input.confidence.toFixed(2)} < floor ${overlay.confidenceFloor} (mode=${mode})`);
    }
  }

  // HF9 Item B: Governance gate (migrated from paper-execution-engine Directive 11.7R-E)
  // Checks strategy eligibility based on regime stability and dependency level.
  // VTS signals pass skipGovernanceGate=true (VTS has its own inline governance checks).
  if (!options.skipGovernanceGate && input.strategy && input.regimeStability) {
    const dependency = getStrategyDependency(input.strategy);
    if (!isStrategyEligible(input.strategy, input.regimeStability, dependency)) {
      failures.push(`Governance: ${input.strategy} (${dependency} dep) blocked in ${input.regimeStability}`);
      console.log(`[11.7R-E][SQE] GOVERNANCE BLOCK: ${canonicalSymbol} ${input.strategy} (${dependency} dep) in ${input.regimeStability}`);
    }
  }

  const passed = failures.length === 0;
  
  const status = passed ? 'PASS' : 'FAIL';
  const reason = passed ? 'thresholds_met' : failures[0]?.split(' ')[0] || 'unknown';
  console.log(`[11.0B][SQE_EVAL] ${status} symbol=${canonicalSymbol} strategy=${input.strategy} finalScore=${finalScore.toFixed(4)} regimeWeight=${regimeWeight.toFixed(4)} reason=${reason}`);
  
  performanceMonitor.recordSQEEvaluation(passed);
  
  dataAggregator.capture('SQE_EVAL', {
    symbol: canonicalSymbol,
    strategy: input.strategy,
    finalScore: finalScore,
    regimeWeight: regimeWeight,
    sqeScore: passed ? 1 : 0,
    passed
  }).catch(() => {});
  
  diagnosticTrace.traceSQE(
    canonicalSymbol,
    input.strategy,
    {
      finalScore: finalScore,
      regimeWeight: regimeWeight,
    },
    passed,
    true
  );
  
  const clampedMetrics = {
    finalScore: Math.max(0, Math.min(1, finalScore)),
    regimeWeight: Math.max(0, Math.min(1, regimeWeight)),
  };
  
  return {
    passed,
    signalId: input.signalId,
    symbol: canonicalSymbol,
    strategy: input.strategy,
    metrics: clampedMetrics,
    thresholds,
    failures,
    reason: passed ? undefined : failures.join('; '),
  };
}

/**
 * Synchronous version for backward compatibility during transition
 * Uses default thresholds - for full config support use async version
 */
export function evaluateSignalQualitySync(input: SQEInput, thresholds?: { finalScoreMin: number; regimeWeightMin: number }): SQEResult {
  const failures: string[] = [];
  
  const canonicalSymbol = normalizeInternal(input.symbol);
  
  const config = thresholds || {
    finalScoreMin: SQE_DEFAULT_THRESHOLDS.MIN_FINAL_SCORE,
    regimeWeightMin: SQE_DEFAULT_THRESHOLDS.MIN_REGIME_WEIGHT,
  };
  
  // Directive 11.0E: Dynamic backfill for sync version - no legacy metrics
  let finalScore = input.finalScore;
  let regimeWeight = input.regimeWeight;
  
  if (finalScore === undefined || finalScore === null) {
    finalScore = calculateFinalScore({
      confidence: input.confidence ?? 0.5,
      regimeWeight: input.regimeWeight ?? 0.5,
    });
  }
  
  if (regimeWeight === undefined || regimeWeight === null) {
    regimeWeight = calculateRegimeWeight({
      trendStrength: (input as any).trendStrength ?? 0.5,
      volatility: (input as any).volatility ?? 0.3,
    });
  }
  
  if (finalScore < config.finalScoreMin) {
    failures.push(`FinalScore ${finalScore.toFixed(4)} < ${config.finalScoreMin}`);
  }
  
  if (regimeWeight < config.regimeWeightMin) {
    failures.push(`RegimeWeight ${regimeWeight.toFixed(4)} < ${config.regimeWeightMin}`);
  }
  
  // Directive 11.7A Task 3: Regime-Aware ROI Gate (SQE parity with VTS) - Sync version
  if (input.entryPrice && input.targetPrice && input.regime) {
    if (!isSignalProfitable(input.entryPrice, input.targetPrice, input.regime)) {
      const expectedROI = (input.targetPrice - input.entryPrice) / input.entryPrice;
      const minROI = getMinROIForRegime(input.regime);
      failures.push(`ROI ${(expectedROI * 100).toFixed(2)}% < ${(minROI * 100).toFixed(2)}% for ${input.regime}`);
      logSkippedSignal({
        symbol: canonicalSymbol,
        reason: 'Low_ROI',
        regime: input.regime,
        expectedROI,
        minROI,
        signalType: input.signalType,
        strategy: input.strategy,
        finalScore,
        regimeWeight,
        source: 'SQE'
      });
    }
  }
  
  const passed = failures.length === 0;
  
  const status = passed ? 'PASS' : 'FAIL';
  const reason = passed ? 'thresholds_met' : failures[0]?.split(' ')[0] || 'unknown';
  console.log(`[11.0D][SQE_EVAL] ${status} symbol=${canonicalSymbol} strategy=${input.strategy} finalScore=${finalScore.toFixed(4)} regimeWeight=${regimeWeight.toFixed(4)} reason=${reason}`);
  
  performanceMonitor.recordSQEEvaluation(passed);
  
  return {
    passed,
    signalId: input.signalId,
    symbol: canonicalSymbol,
    strategy: input.strategy,
    metrics: {
      finalScore: Math.max(0, Math.min(1, finalScore)),
      regimeWeight: Math.max(0, Math.min(1, regimeWeight)),
    },
    thresholds: config,
    failures,
    reason: passed ? undefined : failures.join('; '),
  };
}

/**
 * Evaluate a batch of signals
 */
export async function evaluateSignalBatch(inputs: SQEInput[]): Promise<SQEBatchResult> {
  const passed: SQEResult[] = [];
  const rejected: SQEResult[] = [];
  
  for (const input of inputs) {
    const result = await evaluateSignalQuality(input);
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
  
  if (result.metrics.finalScore < result.thresholds.finalScoreMin) {
    return 'LOW_FINAL_SCORE';
  }
  if (result.metrics.regimeWeight < result.thresholds.regimeWeightMin) {
    return 'LOW_REGIME_WEIGHT';
  }
  
  return 'UNKNOWN';
}

/**
 * Check if a signal is marginally safe (close to thresholds)
 */
export function isMarginallySafe(result: SQEResult): boolean {
  if (!result.passed) return false;
  
  const marginThreshold = 0.05;
  
  const finalScoreMargin = result.metrics.finalScore - result.thresholds.finalScoreMin;
  if (finalScoreMargin < marginThreshold) return true;
  
  const regimeMargin = result.metrics.regimeWeight - result.thresholds.regimeWeightMin;
  if (regimeMargin < marginThreshold) return true;
  
  return false;
}

/**
 * Get SQE default thresholds for display/diagnostics
 */
export function getSQEDefaultThresholds(): typeof SQE_DEFAULT_THRESHOLDS {
  return { ...SQE_DEFAULT_THRESHOLDS };
}

/**
 * Directive 11.0B: Export thresholds constant for tests
 */
export const SQE_THRESHOLDS = SQE_DEFAULT_THRESHOLDS;

/**
 * Signal Quality Evaluator service instance
 */
class SignalQualityEvaluatorService {
  private evaluationCount = 0;
  private passCount = 0;
  private rejectCount = 0;
  private cachedThresholds: Map<string, { thresholds: { finalScoreMin: number; regimeWeightMin: number }; cachedAt: number }> = new Map();
  private cacheTTL = 60000; // 1 minute cache
  
  async getThresholds(mode: 'paper' | 'live'): Promise<{ finalScoreMin: number; regimeWeightMin: number }> {
    const cached = this.cachedThresholds.get(mode);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      return cached.thresholds;
    }
    
    const thresholds = await getSQEThresholdsFromConfig(mode);
    this.cachedThresholds.set(mode, { thresholds, cachedAt: Date.now() });
    return thresholds;
  }
  
  async evaluate(input: SQEInput, options: SQEOptions = {}): Promise<SQEResult> {
    const result = await evaluateSignalQuality(input, options);
    
    this.evaluationCount++;
    if (result.passed) {
      this.passCount++;
    } else {
      this.rejectCount++;
      console.log(`[SQE][REJECT] ${input.symbol}/${input.strategy}: ${result.reason}`);
    }
    
    return result;
  }
  
  async evaluateBatch(inputs: SQEInput[]): Promise<SQEBatchResult> {
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
    this.cachedThresholds.clear();
    console.log('[SQE] Stats and cache reset');
  }
}

export const signalQualityEvaluator = new SignalQualityEvaluatorService();
