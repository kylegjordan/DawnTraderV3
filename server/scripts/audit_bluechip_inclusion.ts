/**
 * Directive 11.4H Task 3 — Blue-Chip & Stablecoin Inclusion Audit
 * 
 * Validates forced inclusion logic for benchmark assets and stablecoins.
 * Ensures BTC, ETH, SOL are present in Ideal Pool.
 * 
 * Output: /audit/reports/bluechip_stable_inclusion.json
 */

import { fx5Scanner } from '../services/fx5-scanner.js';
import fs from 'fs/promises';
import path from 'path';

interface InclusionAuditReport {
  timestamp: string;
  directive: string;
  summary: {
    total_pairs_scanned: number;
    force_included_count: number;
    bluechip_count: number;
    stablecoin_count: number;
    btc_present: boolean;
    eth_present: boolean;
    sol_present: boolean;
    benchmark_coverage: number;
  };
  force_included_pairs: Array<{
    symbol: string;
    reason: 'blue_chip' | 'stablecoin';
    volume24h?: number;
    volatility?: number;
  }>;
  benchmark_pairs: Array<{
    symbol: string;
    present: boolean;
    pool?: 'ideal' | 'rotational';
    volume24h?: number;
  }>;
  stats: {
    avg_bluechip_volume: number;
    avg_bluechip_volatility: number;
    avg_stablecoin_volatility: number;
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[11.4H.3] BLUE-CHIP & STABLECOIN INCLUSION AUDIT');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Get current scan batch
  console.log('\n--- ANALYZING CURRENT SCAN BATCH ---');
  const paperBatch = fx5Scanner.getCurrentScanBatch('paper');
  const liveBatch = fx5Scanner.getCurrentScanBatch('live');
  const allPairs = [...paperBatch, ...liveBatch];
  
  console.log(`Paper batch: ${paperBatch.length} pairs`);
  console.log(`Live batch: ${liveBatch.length} pairs`);
  console.log(`Total pairs to analyze: ${allPairs.length}`);
  
  // Define benchmark assets
  const benchmarkAssets = ['BTC/USD', 'ETH/USD', 'SOL/USD'];
  
  const report: InclusionAuditReport = {
    timestamp: new Date().toISOString(),
    directive: '11.4H Task 3',
    summary: {
      total_pairs_scanned: allPairs.length,
      force_included_count: 0,
      bluechip_count: 0,
      stablecoin_count: 0,
      btc_present: false,
      eth_present: false,
      sol_present: false,
      benchmark_coverage: 0,
    },
    force_included_pairs: [],
    benchmark_pairs: [],
    stats: {
      avg_bluechip_volume: 0,
      avg_bluechip_volatility: 0,
      avg_stablecoin_volatility: 0,
    },
  };
  
  // Check benchmark assets
  console.log('\n--- BENCHMARK ASSET CHECK ---');
  for (const benchmark of benchmarkAssets) {
    const found = allPairs.find(p => p.symbol === benchmark || p.symbol.includes(benchmark.split('/')[0]));
    const present = !!found;
    
    report.benchmark_pairs.push({
      symbol: benchmark,
      present,
      pool: found?.pool,
      volume24h: found?.volume24h,
    });
    
    if (benchmark.startsWith('BTC')) report.summary.btc_present = present;
    if (benchmark.startsWith('ETH')) report.summary.eth_present = present;
    if (benchmark.startsWith('SOL')) report.summary.sol_present = present;
    
    console.log(`${benchmark}: ${present ? '✓ Present' : '✗ Missing'}${found ? ` (${found.pool} pool, vol=${found.volume24h?.toFixed(0)})` : ''}`);
  }
  
  const presentCount = report.benchmark_pairs.filter(b => b.present).length;
  report.summary.benchmark_coverage = (presentCount / benchmarkAssets.length) * 100;
  
  // Analyze force-included pairs
  console.log('\n--- FORCE INCLUSION ANALYSIS ---');
  const blueChipThreshold = 50_000_000;
  const stablecoinPattern = /USDT|USDC|DAI/;
  
  let bluechipVolumes: number[] = [];
  let bluechipVolatilities: number[] = [];
  let stablecoinVolatilities: number[] = [];
  
  for (const pair of allPairs) {
    const volume = pair.volume24h ?? 0;
    const volatility = pair.volatility ?? (pair.dailyRange ?? 0);
    
    const isBlueChip = volume > blueChipThreshold;
    const isStablecoin = volatility > 0.0005 && stablecoinPattern.test(pair.symbol);
    
    if (isBlueChip) {
      report.force_included_pairs.push({
        symbol: pair.symbol,
        reason: 'blue_chip',
        volume24h: volume,
        volatility,
      });
      report.summary.bluechip_count++;
      bluechipVolumes.push(volume);
      bluechipVolatilities.push(volatility);
    }
    
    if (isStablecoin) {
      report.force_included_pairs.push({
        symbol: pair.symbol,
        reason: 'stablecoin',
        volume24h: volume,
        volatility,
      });
      report.summary.stablecoin_count++;
      stablecoinVolatilities.push(volatility);
    }
  }
  
  report.summary.force_included_count = report.force_included_pairs.length;
  
  // Calculate stats
  if (bluechipVolumes.length > 0) {
    report.stats.avg_bluechip_volume = bluechipVolumes.reduce((a, b) => a + b, 0) / bluechipVolumes.length;
    report.stats.avg_bluechip_volatility = bluechipVolatilities.reduce((a, b) => a + b, 0) / bluechipVolatilities.length;
  }
  if (stablecoinVolatilities.length > 0) {
    report.stats.avg_stablecoin_volatility = stablecoinVolatilities.reduce((a, b) => a + b, 0) / stablecoinVolatilities.length;
  }
  
  // Print summary
  console.log('\n--- INCLUSION SUMMARY ---');
  console.log(`Total pairs scanned: ${report.summary.total_pairs_scanned}`);
  console.log(`Force-included: ${report.summary.force_included_count}`);
  console.log(`  Blue-chips (vol > $50M): ${report.summary.bluechip_count}`);
  console.log(`  Stablecoins (USDT/USDC/DAI): ${report.summary.stablecoin_count}`);
  console.log(`Benchmark coverage: ${report.summary.benchmark_coverage.toFixed(1)}%`);
  console.log(`  BTC present: ${report.summary.btc_present ? '✓' : '✗'}`);
  console.log(`  ETH present: ${report.summary.eth_present ? '✓' : '✗'}`);
  console.log(`  SOL present: ${report.summary.sol_present ? '✓' : '✗'}`);
  
  // Save report
  const reportDir = path.join(process.cwd(), 'audit', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'bluechip_stable_inclusion.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[11.4H.3] Report saved to ${reportPath}`);
  
  console.log('\n[11.4H.3] Blue-chip & stablecoin inclusion audit complete.');
}

main().catch(console.error);
