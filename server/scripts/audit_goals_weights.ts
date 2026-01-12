/**
 * Directive 11.4H Task 5 — Goals Engine Adaptive Weights Audit
 * 
 * Validates that adaptive weight calculation:
 * - Caps ML contribution at 40%
 * - Total weights sum to 1.0 ± 0.01
 * - Volatility adjustment works correctly
 * 
 * Output: /audit/reports/goals_engine_adaptive_weights.json
 */

import { 
  computeAdaptiveGoalsWeights, 
  validateWeightIntegrity, 
  getWeightSummary,
  calculateAdaptiveFinalScore,
  AI_WEIGHT_CAP
} from '../core/metrics/adaptive-goals-weight.js';
import { SCORE_WEIGHTS, SCORE_WEIGHTS_VERSION } from '../config/score-weights.config.js';
import fs from 'fs/promises';
import path from 'path';

interface WeightsAuditReport {
  timestamp: string;
  directive: string;
  config: {
    score_weights_version: string;
    base_weights: typeof SCORE_WEIGHTS.FINAL_SCORE;
    ai_weight_cap: number;
  };
  test_scenarios: Array<{
    volatility: number;
    weights: {
      hybridWeight: number;
      confidenceWeight: number;
      regimeWeight: number;
      decayPenalty: number;
    };
    totalPositive: number;
    mlContribution: number;
    cappedMlWeight: boolean;
    integrityCheck: boolean;
  }>;
  summary: {
    all_tests_pass: boolean;
    ml_always_capped: boolean;
    total_always_valid: boolean;
    volatility_reduces_ml: boolean;
  };
  sample_calculations: Array<{
    inputs: {
      hybridScore: number;
      confidence: number;
      regimeWeight: number;
      decayPenalty: number;
      volatility: number;
    };
    finalScore: number;
    effectiveWeights: string;
  }>;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[11.4H.5] GOALS ENGINE ADAPTIVE WEIGHTS AUDIT');
  console.log('═══════════════════════════════════════════════════════════════');
  
  console.log('\n--- CONFIGURATION ---');
  console.log(`Score Weights Version: ${SCORE_WEIGHTS_VERSION}`);
  console.log(`Base weights: Hybrid=${SCORE_WEIGHTS.FINAL_SCORE.HYBRID}, Confidence=${SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE}, Regime=${SCORE_WEIGHTS.FINAL_SCORE.REGIME}, Decay=${SCORE_WEIGHTS.FINAL_SCORE.DECAY}`);
  console.log(`AI Weight Cap: ${AI_WEIGHT_CAP}`);
  
  const report: WeightsAuditReport = {
    timestamp: new Date().toISOString(),
    directive: '11.4H Task 5',
    config: {
      score_weights_version: SCORE_WEIGHTS_VERSION,
      base_weights: { ...SCORE_WEIGHTS.FINAL_SCORE },
      ai_weight_cap: AI_WEIGHT_CAP,
    },
    test_scenarios: [],
    summary: {
      all_tests_pass: true,
      ml_always_capped: true,
      total_always_valid: true,
      volatility_reduces_ml: true,
    },
    sample_calculations: [],
  };
  
  // Test various volatility levels
  console.log('\n--- TESTING VOLATILITY SCENARIOS ---');
  const volatilityLevels = [0, 0.1, 0.25, 0.5, 0.75, 1.0];
  let prevMlWeight = Infinity;
  
  for (const volatility of volatilityLevels) {
    const weights = computeAdaptiveGoalsWeights(volatility);
    const integrityCheck = validateWeightIntegrity(weights);
    
    const scenario = {
      volatility,
      weights: {
        hybridWeight: weights.hybridWeight,
        confidenceWeight: weights.confidenceWeight,
        regimeWeight: weights.regimeWeight,
        decayPenalty: weights.decayPenalty,
      },
      totalPositive: weights.totalPositive,
      mlContribution: weights.mlContribution,
      cappedMlWeight: weights.cappedMlWeight,
      integrityCheck,
    };
    
    report.test_scenarios.push(scenario);
    
    // Check invariants
    if (weights.mlContribution > AI_WEIGHT_CAP + 0.001) {
      report.summary.ml_always_capped = false;
      report.summary.all_tests_pass = false;
    }
    
    if (!integrityCheck) {
      report.summary.total_always_valid = false;
      report.summary.all_tests_pass = false;
    }
    
    // Check that higher volatility reduces ML weight
    if (volatility > 0 && weights.mlContribution > prevMlWeight + 0.001) {
      report.summary.volatility_reduces_ml = false;
    }
    prevMlWeight = weights.mlContribution;
    
    const status = integrityCheck ? '✓' : '✗';
    console.log(`Volatility ${volatility.toFixed(2)}: ${getWeightSummary(weights)} ${status}`);
  }
  
  // Sample FinalScore calculations
  console.log('\n--- SAMPLE CALCULATIONS ---');
  const testCases = [
    { hybridScore: 0.7, confidence: 0.8, regimeWeight: 0.6, decayPenalty: 0.05, volatility: 0.2 },
    { hybridScore: 0.5, confidence: 0.5, regimeWeight: 0.5, decayPenalty: 0.1, volatility: 0.5 },
    { hybridScore: 0.9, confidence: 0.9, regimeWeight: 0.8, decayPenalty: 0.02, volatility: 0.8 },
  ];
  
  for (const tc of testCases) {
    const { finalScore, weights } = calculateAdaptiveFinalScore(
      tc.hybridScore,
      tc.confidence,
      tc.regimeWeight,
      tc.decayPenalty,
      tc.volatility
    );
    
    report.sample_calculations.push({
      inputs: tc,
      finalScore,
      effectiveWeights: getWeightSummary(weights),
    });
    
    console.log(`Inputs: hybrid=${tc.hybridScore}, conf=${tc.confidence}, regime=${tc.regimeWeight}, decay=${tc.decayPenalty}, vol=${tc.volatility}`);
    console.log(`  FinalScore: ${finalScore.toFixed(4)}`);
    console.log(`  Weights: ${getWeightSummary(weights)}`);
  }
  
  // Print summary
  console.log('\n--- VALIDATION SUMMARY ---');
  console.log(`All tests pass: ${report.summary.all_tests_pass ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`ML always capped at ${AI_WEIGHT_CAP}: ${report.summary.ml_always_capped ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Total weights always valid: ${report.summary.total_always_valid ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Volatility reduces ML: ${report.summary.volatility_reduces_ml ? '✓ PASS' : '✗ FAIL'}`);
  
  // Save report
  const reportDir = path.join(process.cwd(), 'audit', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'goals_engine_adaptive_weights.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[11.4H.5] Report saved to ${reportPath}`);
  
  console.log('\n[11.4H.5] Goals engine adaptive weights audit complete.');
}

main().catch(console.error);
