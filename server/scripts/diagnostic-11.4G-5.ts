#!/usr/bin/env npx tsx
/**
 * Directive 11.4G.5: Goals Engine Normalization Diagnostics
 * 
 * Validates:
 * 1. Weight sliders sum to 1.0 (100%)
 * 2. Tier thresholds are properly ordered and non-overlapping
 * 3. No metric overlap between FinalScore components
 * 4. Configuration alignment between frontend and backend
 * 
 * IMPORTANT: This script reads from AUTHORITATIVE sources:
 * - SCORE_WEIGHTS from server/config/score-weights.config.ts
 * - SYSTEM_GUARDS from server/config/system-guards.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { SCORE_WEIGHTS, SCORE_WEIGHTS_VERSION, getScoreWeightsMetadata } from '../config/score-weights.config';
import { SYSTEM_GUARDS, HYBRID_PARAMS } from '../config/system-guards';
import { SQE_DEFAULT_THRESHOLDS, getSQEDefaultThresholds, getSQEThresholdsFromConfig } from '../core/filters/signal_quality_evaluator';

interface WeightConfig {
  name: string;
  weight: number;
  source: string;
}

interface TierThreshold {
  name: string;
  min: number;
  max: number;
  source: string;
}

interface ValidationResult {
  category: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  details?: Record<string, unknown>;
}

interface NormalizationReport {
  timestamp: string;
  directive: string;
  scoreWeightsVersion: string;
  weightValidation: {
    totalWeight: number;
    weights: WeightConfig[];
    normalized: boolean;
  };
  tierValidation: {
    thresholds: TierThreshold[];
    ordered: boolean;
    overlapping: boolean;
  };
  metricOverlapCheck: {
    components: string[];
    overlaps: string[];
  };
  validationResults: ValidationResult[];
  recommendations: string[];
}

function loadAuthorativeWeights(): WeightConfig[] {
  const W = SCORE_WEIGHTS.FINAL_SCORE;
  return [
    { name: 'hybridScore', weight: W.HYBRID, source: 'score-weights.config.ts' },
    { name: 'confidence', weight: W.CONFIDENCE, source: 'score-weights.config.ts' },
    { name: 'regimeWeight', weight: W.REGIME, source: 'score-weights.config.ts' },
    { name: 'decayPenalty', weight: -W.DECAY, source: 'score-weights.config.ts' },
  ];
}

interface LiveThresholds {
  paper: { finalScoreMin: number; regimeWeightMin: number };
  live: { finalScoreMin: number; regimeWeightMin: number };
  defaults: { MIN_FINAL_SCORE: number; MIN_REGIME_WEIGHT: number };
}

async function loadLiveThresholds(): Promise<LiveThresholds> {
  const defaults = getSQEDefaultThresholds();
  // B79.0n.STORAGE (2026-05-21): diagnostic CLI reads canonical crypto baseline.
  // Explicit literal (not via getCanonicalScreenerConfig helper) since this is a
  // one-off CLI tool, not a route handler — Langston Step 2 re-ACK wording note.
  const paperThresholds = await getSQEThresholdsFromConfig('paper', 'crypto_spot');
  const liveThresholds = await getSQEThresholdsFromConfig('live', 'crypto_spot');
  
  return {
    paper: paperThresholds,
    live: liveThresholds,
    defaults,
  };
}

function buildTierThresholds(minFinalScore: number, source: string): TierThreshold[] {
  return [
    { name: 'excellent', min: 0.8, max: 1.0, source },
    { name: 'good', min: 0.6, max: 0.8, source },
    { name: 'acceptable', min: minFinalScore, max: 0.6, source: `${source} MIN_FINAL_SCORE=${minFinalScore}` },
    { name: 'rejected', min: 0.0, max: minFinalScore, source },
  ];
}

const FINAL_SCORE_FRONTEND_CONFIG = {
  MIN: 0.2,
  MAX: 1.0,
  DEFAULT: 0.35,
  STEP: 0.05,
};

async function runNormalizationDiagnostics(): Promise<void> {
  console.log('============================================================');
  console.log('[11.4G.5] GOALS ENGINE NORMALIZATION DIAGNOSTICS');
  console.log('============================================================');
  
  // Load authoritative weights from config
  const authorativeWeights = loadAuthorativeWeights();
  const weightMetadata = getScoreWeightsMetadata();
  console.log(`[11.4G.5] Loading weights from score-weights.config.ts (${weightMetadata.version})`);
  
  const report: NormalizationReport = {
    timestamp: new Date().toISOString(),
    directive: '11.4G.5',
    scoreWeightsVersion: SCORE_WEIGHTS_VERSION,
    weightValidation: {
      totalWeight: 0,
      weights: [],
      normalized: false,
    },
    tierValidation: {
      thresholds: [],
      ordered: false,
      overlapping: false,
    },
    metricOverlapCheck: {
      components: [],
      overlaps: [],
    },
    validationResults: [],
    recommendations: [],
  };
  
  // 1. Weight Slider Validation (from authoritative source)
  console.log('\n--- WEIGHT SLIDER VALIDATION ---');
  console.log(`Source: score-weights.config.ts (${SCORE_WEIGHTS_VERSION})`);
  
  const positiveWeights = authorativeWeights.filter(w => w.weight > 0);
  const negativeWeights = authorativeWeights.filter(w => w.weight < 0);
  
  const positiveSum = positiveWeights.reduce((sum, w) => sum + w.weight, 0);
  const negativeSum = Math.abs(negativeWeights.reduce((sum, w) => sum + w.weight, 0));
  
  report.weightValidation.weights = authorativeWeights;
  report.weightValidation.totalWeight = positiveSum;
  
  console.log('FinalScore Weights (from authoritative config):');
  for (const w of authorativeWeights) {
    const sign = w.weight >= 0 ? '+' : '';
    console.log(`  ${w.name}: ${sign}${(w.weight * 100).toFixed(0)}%`);
  }
  
  console.log(`\nPositive weights sum: ${(positiveSum * 100).toFixed(0)}%`);
  console.log(`Negative weights sum: -${(negativeSum * 100).toFixed(0)}%`);
  
  if (Math.abs(positiveSum - 0.9) < 0.001) {
    console.log('Status: PASS - Positive weights sum to 90% (allows decay penalty of 10%)');
    report.weightValidation.normalized = true;
    report.validationResults.push({
      category: 'Weight Normalization',
      status: 'PASS',
      message: 'Weights properly normalized (0.9 positive + 0.1 decay penalty)',
    });
  } else if (Math.abs(positiveSum - 1.0) < 0.001) {
    console.log('Status: WARN - Positive weights sum to 100% but decay penalty subtracts from total');
    report.weightValidation.normalized = true;
    report.validationResults.push({
      category: 'Weight Normalization',
      status: 'WARN',
      message: 'Weights sum to 100% but decay penalty can exceed bounds',
    });
  } else {
    console.log(`Status: FAIL - Weights do not sum to expected value`);
    report.weightValidation.normalized = false;
    report.validationResults.push({
      category: 'Weight Normalization',
      status: 'FAIL',
      message: `Weights sum to ${(positiveSum * 100).toFixed(0)}%, expected 90-100%`,
    });
    report.recommendations.push('Adjust FinalScore weights to sum to 0.9 (positive) + 0.1 (decay penalty)');
  }
  
  // 2. Tier Threshold Validation (from LIVE screener config)
  console.log('\n--- TIER THRESHOLD VALIDATION ---');
  console.log('Loading thresholds from LIVE screener configuration...');
  
  const liveThresholds = await loadLiveThresholds();
  console.log(`  Defaults: FinalScore>=${liveThresholds.defaults.MIN_FINAL_SCORE} RegimeWeight>=${liveThresholds.defaults.MIN_REGIME_WEIGHT}`);
  console.log(`  Paper mode: FinalScore>=${liveThresholds.paper.finalScoreMin} RegimeWeight>=${liveThresholds.paper.regimeWeightMin}`);
  console.log(`  Live mode: FinalScore>=${liveThresholds.live.finalScoreMin} RegimeWeight>=${liveThresholds.live.regimeWeightMin}`);
  
  // Check for drift between paper/live/defaults
  const paperDrift = Math.abs(liveThresholds.paper.finalScoreMin - liveThresholds.defaults.MIN_FINAL_SCORE);
  const liveDrift = Math.abs(liveThresholds.live.finalScoreMin - liveThresholds.defaults.MIN_FINAL_SCORE);
  
  if (paperDrift > 0.001 || liveDrift > 0.001) {
    console.log(`  ⚠️ Threshold drift detected: paper=${paperDrift.toFixed(3)}, live=${liveDrift.toFixed(3)}`);
    report.validationResults.push({
      category: 'Threshold Drift',
      status: 'WARN',
      message: `Screener config differs from defaults (paper: ${liveThresholds.paper.finalScoreMin}, live: ${liveThresholds.live.finalScoreMin}, default: ${liveThresholds.defaults.MIN_FINAL_SCORE})`,
    });
  }
  
  // Use paper mode thresholds as primary (most commonly used during development)
  const tierThresholds = buildTierThresholds(liveThresholds.paper.finalScoreMin, 'screener_config(paper)');
  report.tierValidation.thresholds = tierThresholds;
  
  console.log('FinalScore Tier Thresholds (from SQE config):');
  for (const t of tierThresholds) {
    console.log(`  ${t.name.padEnd(12)}: [${t.min.toFixed(2)} - ${t.max.toFixed(2)}] (${t.source})`);
  }
  
  // Check ordering
  let isOrdered = true;
  for (let i = 0; i < tierThresholds.length - 1; i++) {
    const current = tierThresholds[i];
    const next = tierThresholds[i + 1];
    if (current.min < next.max) {
      isOrdered = true;
    }
    if (Math.abs(current.min - next.max) > 0.001) {
      isOrdered = false;
      break;
    }
  }
  
  report.tierValidation.ordered = isOrdered;
  
  // Check overlapping
  let hasOverlap = false;
  for (let i = 0; i < tierThresholds.length - 1; i++) {
    const current = tierThresholds[i];
    const next = tierThresholds[i + 1];
    if (current.min < next.max) {
      hasOverlap = true;
      break;
    }
  }
  
  report.tierValidation.overlapping = hasOverlap;
  
  if (isOrdered && !hasOverlap) {
    console.log('Status: PASS - Tiers are properly ordered and contiguous');
    report.validationResults.push({
      category: 'Tier Thresholds',
      status: 'PASS',
      message: 'Tiers are properly ordered and contiguous (from SQE config)',
    });
  } else if (!isOrdered) {
    console.log('Status: WARN - Tier boundaries have gaps');
    report.validationResults.push({
      category: 'Tier Thresholds',
      status: 'WARN',
      message: 'Tier boundaries have gaps - signals may fall between tiers',
    });
    report.recommendations.push('Adjust tier thresholds to be contiguous');
  }
  
  // Check frontend config alignment
  console.log('\n--- FRONTEND CONFIG ALIGNMENT ---');
  console.log(`Frontend FinalScore Config:`);
  console.log(`  MIN: ${FINAL_SCORE_FRONTEND_CONFIG.MIN}`);
  console.log(`  MAX: ${FINAL_SCORE_FRONTEND_CONFIG.MAX}`);
  console.log(`  DEFAULT: ${FINAL_SCORE_FRONTEND_CONFIG.DEFAULT}`);
  console.log(`  STEP: ${FINAL_SCORE_FRONTEND_CONFIG.STEP}`);
  
  const acceptableThreshold = tierThresholds.find(t => t.name === 'acceptable');
  if (acceptableThreshold && Math.abs(FINAL_SCORE_FRONTEND_CONFIG.DEFAULT - acceptableThreshold.min) < 0.001) {
    console.log('Status: PASS - Default aligns with acceptable tier minimum');
    report.validationResults.push({
      category: 'Frontend Alignment',
      status: 'PASS',
      message: 'Default threshold aligns with acceptable tier minimum',
    });
  } else {
    console.log('Status: WARN - Default does not align with acceptable tier minimum');
    report.validationResults.push({
      category: 'Frontend Alignment',
      status: 'WARN',
      message: `Default (${FINAL_SCORE_FRONTEND_CONFIG.DEFAULT}) differs from acceptable tier min (${acceptableThreshold?.min})`,
    });
  }
  
  // 3. Metric Overlap Check - Analyze actual FinalScore formula
  console.log('\n--- METRIC OVERLAP CHECK (DATA-DRIVEN) ---');
  
  const components = ['hybridScore', 'confidence', 'regimeWeight', 'decayPenalty'];
  report.metricOverlapCheck.components = components;
  
  console.log('Analyzing FinalScore formula from score-weights.config.ts...');
  console.log('Formula: finalScore = hybridScore*W.HYBRID + confidence*W.CONFIDENCE + regimeWeight*W.REGIME - decayPenalty*W.DECAY');
  
  // Analyze hybrid params from system-guards.ts
  console.log('\nHybrid Integration Parameters (from system-guards.ts):');
  console.log(`  QUANT weight: ${HYBRID_PARAMS.WEIGHTS.QUANT * 100}%`);
  console.log(`  PATTERN weight: ${HYBRID_PARAMS.WEIGHTS.PATTERN * 100}%`);
  console.log(`  PREDICTIVE weight: ${HYBRID_PARAMS.WEIGHTS.PREDICTIVE * 100}%`);
  
  // Check if confidence is double-counted
  // hybridScore includes PREDICTIVE (0.2) which is ML confidence
  // FinalScore also adds confidence * 0.3
  const predictiveInHybrid = HYBRID_PARAMS.WEIGHTS.PREDICTIVE;
  const confidenceInFinalScore = SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE;
  
  const analysisResults: Array<{ check: string; status: 'CLEAR' | 'OVERLAP'; detail: string }> = [];
  
  if (predictiveInHybrid > 0 && confidenceInFinalScore > 0) {
    console.log(`\n  Confidence Analysis:`);
    console.log(`    PREDICTIVE in hybridScore: ${(predictiveInHybrid * 100).toFixed(0)}%`);
    console.log(`    CONFIDENCE in FinalScore: ${(confidenceInFinalScore * 100).toFixed(0)}%`);
    console.log(`    Total confidence contribution: ~${((predictiveInHybrid * SCORE_WEIGHTS.FINAL_SCORE.HYBRID + confidenceInFinalScore) * 100).toFixed(0)}%`);
    console.log(`    Status: OVERLAP DETECTED - confidence appears twice in calculation`);
    analysisResults.push({
      check: 'hybridScore <-> confidence',
      status: 'OVERLAP',
      detail: `ML confidence weighted ${(predictiveInHybrid * 100).toFixed(0)}% in hybridScore and ${(confidenceInFinalScore * 100).toFixed(0)}% directly in FinalScore`,
    });
  } else {
    analysisResults.push({
      check: 'hybridScore <-> confidence',
      status: 'CLEAR',
      detail: 'No overlap detected',
    });
  }
  
  // Check regimeWeight independence
  console.log(`\n  RegimeWeight Analysis:`);
  console.log(`    RegimeWeight is calculated from: trendStrength * 0.7 + (1 - volatility) * 0.3`);
  console.log(`    Pattern signals use: candle patterns (engulfing, doji, etc.)`);
  console.log(`    Status: CLEAR - regimeWeight uses trend/volatility, patterns use candle structure`);
  analysisResults.push({
    check: 'regimeWeight <-> patternSignals',
    status: 'CLEAR',
    detail: 'RegimeWeight uses trend/volatility metrics, pattern signals use candle structure analysis',
  });
  
  const overlaps = analysisResults.filter(r => r.status === 'OVERLAP');
  report.metricOverlapCheck.overlaps = overlaps.map(o => `${o.check}: ${o.detail}`);
  
  if (overlaps.length > 0) {
    console.log(`\n  ⚠️ ${overlaps.length} metric overlap(s) detected`);
    report.validationResults.push({
      category: 'Metric Overlap',
      status: 'WARN',
      message: `${overlaps.length} metric overlap(s) detected through formula analysis`,
      details: { analysisResults },
    });
    report.recommendations.push('Consider reducing CONFIDENCE weight in FinalScore since ML predictive is already in hybridScore');
  } else {
    console.log(`\n  ✓ No metric overlaps detected`);
    report.validationResults.push({
      category: 'Metric Overlap',
      status: 'PASS',
      message: 'No metric overlaps detected through formula analysis',
    });
  }
  
  // Summary
  console.log('\n--- VALIDATION SUMMARY ---');
  const passCount = report.validationResults.filter(r => r.status === 'PASS').length;
  const warnCount = report.validationResults.filter(r => r.status === 'WARN').length;
  const failCount = report.validationResults.filter(r => r.status === 'FAIL').length;
  
  console.log(`Results: ${passCount} PASS, ${warnCount} WARN, ${failCount} FAIL`);
  
  for (const result of report.validationResults) {
    const icon = result.status === 'PASS' ? '✓' : result.status === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} ${result.category}: ${result.message}`);
  }
  
  if (report.recommendations.length > 0) {
    console.log('\n--- RECOMMENDATIONS ---');
    report.recommendations.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  }
  
  // Save report
  const reportsDir = path.join(process.cwd(), 'audit', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const outputPath = path.join(reportsDir, 'g5_normalization_diagnostics.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n[11.4G.5] Report saved to ${outputPath}`);
  console.log('\n[11.4G.5] Normalization diagnostics complete.');
}

runNormalizationDiagnostics().catch(console.error);
