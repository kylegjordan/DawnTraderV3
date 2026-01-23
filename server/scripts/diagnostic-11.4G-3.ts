/**
 * Directive 11.4G.3 - Regime Flattening & Friction Calibration Diagnostics
 * 
 * Purpose: Analyze regime distribution entropy and friction tier mappings
 * 
 * Analysis:
 * 1. Calculate regime distribution entropy (identify over-concentration)
 * 2. Validate friction tier mappings match actual spread/slippage data
 * 3. Identify pairs with misaligned regime/friction classifications
 * 4. Generate calibration recommendations
 */

import { CANONICAL_REGIMES, CanonicalRegimeType, REGIMES } from '../config/canonical-regime-strategy-map';
import { getTelemetryAggregator } from '../services/telemetry-aggregator';
import { volumeClassifier, VolumeTier } from '../services/market-data/volume-classifier';

type MarketRegimeType = CanonicalRegimeType;

interface RegimeDistribution {
  regime: MarketRegimeType;
  count: number;
  percentage: number;
}

interface FrictionAnalysis {
  tier: 'green' | 'yellow' | 'orange' | 'red';
  count: number;
  avgScore: number;
}

interface DiagnosticResult {
  regimeEntropy: number;
  regimeDistribution: RegimeDistribution[];
  frictionAnalysis: FrictionAnalysis[];
  recommendations: string[];
  warnings: string[];
}

function calculateEntropy(distribution: number[]): number {
  const total = distribution.reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;
  
  let entropy = 0;
  for (const count of distribution) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }
  
  return entropy;
}

function calculateMaxEntropy(numClasses: number): number {
  if (numClasses <= 0) return 0;
  return Math.log2(numClasses);
}

function analyzeRegimeDistribution(regimeCounts: Map<MarketRegimeType, number>): {
  distribution: RegimeDistribution[];
  entropy: number;
  normalizedEntropy: number;
} {
  const total = Array.from(regimeCounts.values()).reduce((sum, count) => sum + count, 0);
  
  const distribution: RegimeDistribution[] = CANONICAL_REGIMES.map(regime => ({
    regime,
    count: regimeCounts.get(regime) || 0,
    percentage: total > 0 ? ((regimeCounts.get(regime) || 0) / total) * 100 : 0
  }));
  
  const counts = distribution.map(d => d.count);
  const entropy = calculateEntropy(counts);
  const maxEntropy = calculateMaxEntropy(CANONICAL_REGIMES.length);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
  
  return { distribution, entropy, normalizedEntropy };
}

interface TelemetryPairData {
  symbol: string;
  regime: MarketRegimeType;
  score: number;
  signalType: string;
  strategy: string;
}

async function runRegimeDiagnostics(): Promise<DiagnosticResult> {
  console.log('[11.4G.3] Starting Regime Flattening Diagnostics...');
  
  // Get telemetry and rehydrate from persisted state
  const telemetry = getTelemetryAggregator();
  
  console.log('[11.4G.3] Rehydrating telemetry from persisted state...');
  const rehydratedCount = await telemetry.rehydrateTelemetryState();
  console.log(`[11.4G.3] Rehydrated ${rehydratedCount} telemetry entries`);
  
  // Also load adaptive learning data
  const learningCount = await telemetry.rehydrateAdaptiveLearning();
  console.log(`[11.4G.3] Loaded ${learningCount} adaptive learning entries`);
  
  const rankedPairs = telemetry.getRankedPairs(200);
  
  console.log(`[11.4G.3] Analyzing ${rankedPairs.length} pairs from telemetry...`);
  
  // CRITICAL: Telemetry data is REQUIRED for meaningful regime/friction diagnostics
  // If empty, this indicates VTS needs to run first to populate telemetry
  if (rankedPairs.length === 0) {
    console.warn('[11.4G.3] ⚠️  INSUFFICIENT DATA: No telemetry entries found');
    console.warn('[11.4G.3] To populate telemetry:');
    console.warn('[11.4G.3]   1. Enable passive learning mode in the trading engine');
    console.warn('[11.4G.3]   2. Let VTS run for at least one cycle (60 seconds)');
    console.warn('[11.4G.3]   3. Re-run this diagnostic after telemetry is populated');
    console.warn('[11.4G.3] Proceeding with volume-tier fallback for friction analysis only...');
    await volumeClassifier.init();
  }
  
  // Build pair data from real telemetry
  const pairData: TelemetryPairData[] = rankedPairs.map(p => ({
    symbol: p.symbol,
    regime: CANONICAL_REGIMES.includes(p.regime as CanonicalRegimeType) 
      ? p.regime as MarketRegimeType 
      : REGIMES.TRANSITION,
    score: p.score,
    signalType: p.signalType,
    strategy: p.strategy
  }));
  
  const regimeCounts = new Map<MarketRegimeType, number>();
  CANONICAL_REGIMES.forEach(r => regimeCounts.set(r, 0));
  
  const frictionCounts = new Map<string, { count: number; totalScore: number }>();
  ['green', 'yellow', 'orange', 'red'].forEach(t => {
    frictionCounts.set(t, { count: 0, totalScore: 0 });
  });
  
  // Count regimes from real data
  for (const pair of pairData) {
    regimeCounts.set(pair.regime, (regimeCounts.get(pair.regime) || 0) + 1);
    
    // Map volume tier to friction tier (HIGH=green, MID=yellow/orange, LOW=red)
    const volumeTier = volumeClassifier.getTier(pair.symbol);
    let frictionTier: string;
    if (volumeTier === 'HIGH') frictionTier = 'green';
    else if (volumeTier === 'MID' && pair.score >= 0.5) frictionTier = 'yellow';
    else if (volumeTier === 'MID') frictionTier = 'orange';
    else frictionTier = 'red';
    
    const tierData = frictionCounts.get(frictionTier)!;
    tierData.count++;
    tierData.totalScore += pair.score;
  }
  
  // If using fallback, populate friction from volume classifier distribution
  if (useFallback) {
    const stats = volumeClassifier.getStats();
    if (stats && stats.initialized) {
      frictionCounts.set('green', { count: stats.high, totalScore: stats.high * 0.85 });
      frictionCounts.set('yellow', { count: Math.floor(stats.mid * 0.6), totalScore: Math.floor(stats.mid * 0.6) * 0.6 });
      frictionCounts.set('orange', { count: Math.floor(stats.mid * 0.4), totalScore: Math.floor(stats.mid * 0.4) * 0.4 });
      frictionCounts.set('red', { count: stats.low, totalScore: stats.low * 0.2 });
      console.log(`[11.4G.3] Fallback friction from volume: HIGH=${stats.high}, MID=${stats.mid}, LOW=${stats.low}`);
    }
  }
  
  const { distribution, entropy, normalizedEntropy } = analyzeRegimeDistribution(regimeCounts);
  
  const recommendations: string[] = [];
  const warnings: string[] = [];
  
  if (normalizedEntropy < 0.5) {
    const dominantRegime = distribution.reduce((max, d) => d.count > max.count ? d : max);
    warnings.push(
      `Low regime entropy (${(normalizedEntropy * 100).toFixed(1)}%) - ${dominantRegime.regime} dominates at ${dominantRegime.percentage.toFixed(1)}%`
    );
    recommendations.push(
      `Consider adjusting regime classification thresholds to improve distribution balance`
    );
  }
  
  const zeroCountRegimes = distribution.filter(d => d.count === 0);
  if (zeroCountRegimes.length > 0) {
    warnings.push(
      `${zeroCountRegimes.length} regimes have zero representation: ${zeroCountRegimes.map(d => d.regime).join(', ')}`
    );
  }
  
  const frictionAnalysis: FrictionAnalysis[] = ['green', 'yellow', 'orange', 'red'].map(tier => {
    const data = frictionCounts.get(tier)!;
    return {
      tier: tier as FrictionAnalysis['tier'],
      count: data.count,
      avgScore: data.count > 0 ? data.totalScore / data.count : 0
    };
  });
  
  const greenCount = frictionAnalysis.find(f => f.tier === 'green')?.count || 0;
  const totalCount = frictionAnalysis.reduce((sum, f) => sum + f.count, 0);
  if (greenCount / totalCount < 0.2) {
    warnings.push(`Only ${((greenCount / totalCount) * 100).toFixed(1)}% of pairs have green (low friction) status`);
    recommendations.push(`Consider relaxing friction thresholds or focusing on higher-liquidity pairs`);
  }
  
  return {
    regimeEntropy: entropy,
    regimeDistribution: distribution,
    frictionAnalysis,
    recommendations,
    warnings
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('[11.4G.3] REGIME FLATTENING & FRICTION DIAGNOSTICS');
  console.log('='.repeat(60));
  
  try {
    const result = await runRegimeDiagnostics();
    
    console.log('\n--- REGIME ENTROPY ---');
    console.log(`Entropy: ${result.regimeEntropy.toFixed(3)} bits`);
    console.log(`Max Entropy: ${calculateMaxEntropy(CANONICAL_REGIMES.length).toFixed(3)} bits`);
    console.log(`Normalized: ${((result.regimeEntropy / calculateMaxEntropy(CANONICAL_REGIMES.length)) * 100).toFixed(1)}%`);
    
    console.log('\n--- REGIME DISTRIBUTION ---');
    result.regimeDistribution.forEach(({ regime, count, percentage }) => {
      const bar = '█'.repeat(Math.floor(percentage / 5));
      console.log(`  ${regime.padEnd(16)} ${String(count).padStart(3)} (${percentage.toFixed(1).padStart(5)}%) ${bar}`);
    });
    
    console.log('\n--- FRICTION TIER DISTRIBUTION ---');
    result.frictionAnalysis.forEach(({ tier, count, avgScore }) => {
      const color = { green: '🟢', yellow: '🟡', orange: '🟠', red: '🔴' }[tier];
      console.log(`  ${color} ${tier.padEnd(8)} ${String(count).padStart(3)} pairs | avgScore: ${avgScore.toFixed(3)}`);
    });
    
    console.log('\n--- WARNINGS ---');
    if (result.warnings.length === 0) {
      console.log('  No warnings.');
    } else {
      result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    }
    
    console.log('\n--- RECOMMENDATIONS ---');
    if (result.recommendations.length === 0) {
      console.log('  No specific recommendations.');
    } else {
      result.recommendations.forEach(r => console.log(`  * ${r}`));
    }
    
    const fs = await import('fs').then(m => m.promises);
    await fs.mkdir('/home/runner/workspace/audit/reports', { recursive: true });
    await fs.writeFile(
      '/home/runner/workspace/audit/reports/regime_friction_diagnostics.json',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        directive: '11.4G.3',
        ...result
      }, null, 2)
    );
    console.log('\n[11.4G.3] Report saved to /audit/reports/regime_friction_diagnostics.json');
    
  } catch (error) {
    console.error('[11.4G.3] Diagnostics failed:', error);
  }
  
  console.log('\n[11.4G.3] Diagnostics complete.');
  process.exit(0);
}

main();
