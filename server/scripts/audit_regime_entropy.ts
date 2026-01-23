/**
 * Directive 11.4H Task 4 — Regime Entropy Monitoring Audit
 * 
 * Monitors regime distribution entropy to detect normalization collapse.
 * Low entropy (<0.2) indicates over-concentration in a single regime.
 * 
 * Output: /audit/reports/regime_entropy_monitor.json
 */

import { getTelemetryAggregator } from '../services/telemetry-aggregator.js';
import { REGIMES } from '../config/canonical-regime-strategy-map.js';
import fs from 'fs/promises';
import path from 'path';

interface EntropyAuditReport {
  timestamp: string;
  directive: string;
  current_state: {
    entropy: number;
    entropy_status: 'healthy' | 'warning' | 'critical';
    total_pairs: number;
    distribution: Record<string, number>;
    distribution_percent: Record<string, number>;
  };
  thresholds: {
    warning: number;
    critical: number;
  };
  regime_analysis: {
    dominant_regime: string;
    dominant_percent: number;
    regime_count: number;
    is_balanced: boolean;
  };
  recommendations: string[];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[11.4H.4] REGIME ENTROPY MONITORING');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const telemetry = getTelemetryAggregator();
  
  // Compute current entropy
  console.log('\n--- COMPUTING REGIME ENTROPY ---');
  const { entropy, distribution, totalPairs } = telemetry.computeRegimeEntropy();
  
  console.log(`Total pairs with telemetry: ${totalPairs}`);
  console.log(`Normalized entropy: ${entropy.toFixed(4)}`);
  
  // Determine status
  let entropyStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (entropy < 0.2) {
    entropyStatus = 'critical';
  } else if (entropy < 0.4) {
    entropyStatus = 'warning';
  }
  
  // Calculate distribution percentages
  const distributionPercent: Record<string, number> = {};
  for (const [regime, count] of Object.entries(distribution)) {
    distributionPercent[regime] = totalPairs > 0 ? (count / totalPairs) * 100 : 0;
  }
  
  // Find dominant regime
  let dominantRegime: string = REGIMES.TRANSITION;
  let maxCount = 0;
  for (const [regime, count] of Object.entries(distribution)) {
    if (count > maxCount) {
      maxCount = count;
      dominantRegime = regime;
    }
  }
  const dominantPercent = totalPairs > 0 ? (maxCount / totalPairs) * 100 : 0;
  
  // Determine if balanced (no regime > 50%)
  const isBalanced = dominantPercent <= 50;
  
  // Generate recommendations
  const recommendations: string[] = [];
  if (entropyStatus === 'critical') {
    recommendations.push('CRITICAL: Regime entropy is too low - consider reviewing regime calculation logic');
    recommendations.push('Check if telemetry data is being populated correctly');
    recommendations.push('Review OHLC data quality for regime calculation');
  } else if (entropyStatus === 'warning') {
    recommendations.push('WARNING: Regime distribution is skewed');
    recommendations.push('Monitor for 24h to see if entropy recovers naturally');
  }
  
  if (!isBalanced) {
    recommendations.push(`Dominant regime (${dominantRegime}) accounts for ${dominantPercent.toFixed(1)}% of pairs`);
    recommendations.push('This may indicate market-wide conditions or calculation bias');
  }
  
  const report: EntropyAuditReport = {
    timestamp: new Date().toISOString(),
    directive: '11.4H Task 4',
    current_state: {
      entropy,
      entropy_status: entropyStatus,
      total_pairs: totalPairs,
      distribution,
      distribution_percent: distributionPercent,
    },
    thresholds: {
      warning: 0.4,
      critical: 0.2,
    },
    regime_analysis: {
      dominant_regime: dominantRegime,
      dominant_percent: dominantPercent,
      regime_count: Object.values(distribution).filter(c => c > 0).length,
      is_balanced: isBalanced,
    },
    recommendations,
  };
  
  // Print summary
  console.log('\n--- REGIME DISTRIBUTION ---');
  for (const [regime, count] of Object.entries(distribution)) {
    const pct = distributionPercent[regime];
    const bar = '█'.repeat(Math.round(pct / 5));
    console.log(`${regime.padEnd(18)}: ${String(count).padStart(4)} (${pct.toFixed(1).padStart(5)}%) ${bar}`);
  }
  
  console.log('\n--- ENTROPY STATUS ---');
  console.log(`Entropy: ${entropy.toFixed(4)}`);
  console.log(`Status: ${entropyStatus.toUpperCase()}`);
  console.log(`Dominant regime: ${dominantRegime} (${dominantPercent.toFixed(1)}%)`);
  console.log(`Balanced: ${isBalanced ? '✓ Yes' : '✗ No'}`);
  
  if (recommendations.length > 0) {
    console.log('\n--- RECOMMENDATIONS ---');
    for (const rec of recommendations) {
      console.log(`  - ${rec}`);
    }
  }
  
  // Save report
  const reportDir = path.join(process.cwd(), 'audit', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'regime_entropy_monitor.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[11.4H.4] Report saved to ${reportPath}`);
  
  console.log('\n[11.4H.4] Regime entropy monitoring complete.');
}

main().catch(console.error);
