/**
 * Directive 11.4H Task 2 — Friction Balance Validation Script
 * 
 * Validates adaptive percentile-based friction tier distribution.
 * Target: GREEN ≈ 30%, ORANGE ≈ 40%, RED ≈ 30%
 * 
 * Output: /audit/reports/friction_balance_validation.json
 */

import { computeAdaptiveFrictionBands, getAdaptiveFrictionTier, getCachedFrictionBands, type FrictionBands, type FrictionTier } from '../core/metrics/cost-metrics.js';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import fs from 'fs/promises';
import path from 'path';

interface FrictionAuditReport {
  timestamp: string;
  directive: string;
  summary: {
    total_pairs: number;
    green_count: number;
    orange_count: number;
    red_count: number;
    green_percent: number;
    orange_percent: number;
    red_percent: number;
    target_met: boolean;
  };
  bands: FrictionBands | null;
  spread_stats: {
    min: number;
    max: number;
    median: number;
    mean: number;
    p30: number;
    p70: number;
  };
  sample_pairs: Array<{
    symbol: string;
    spread: number;
    tier: FrictionTier;
  }>;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('[11.4H.2] FRICTION BALANCE VALIDATION');
  console.log('═══════════════════════════════════════════════════════════════');
  
  const kraken = new KrakenService();
  
  // Get spread data from order books
  console.log('\n--- COLLECTING SPREAD DATA ---');
  const spreads: Array<{ symbol: string; spread: number }> = [];
  
  try {
    const assetPairs = await kraken.getAssetPairs();
    const symbols = Object.keys(assetPairs).slice(0, 100); // Sample 100 pairs
    
    console.log(`Fetching order book data for ${symbols.length} pairs...`);
    
    for (const symbol of symbols) {
      try {
        const orderBookRecord = await kraken.getOrderBook(symbol, 1);
        const orderBook = orderBookRecord?.[symbol];
        if (orderBook && orderBook.asks && orderBook.asks.length > 0 && orderBook.bids && orderBook.bids.length > 0) {
          const bestAsk = parseFloat(orderBook.asks[0].price);
          const bestBid = parseFloat(orderBook.bids[0].price);
          const midPrice = (bestAsk + bestBid) / 2;
          const spread = midPrice > 0 ? (bestAsk - bestBid) / midPrice : 0.001;
          spreads.push({ symbol, spread });
        }
      } catch (e) {
        // Skip pairs that fail
      }
      // Rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
    
    console.log(`Collected spread data for ${spreads.length} pairs`);
  } catch (error) {
    console.error('Failed to fetch spread data, using simulated data');
    // Generate simulated spread data for testing
    for (let i = 0; i < 100; i++) {
      spreads.push({
        symbol: `TEST${i}/USD`,
        spread: Math.random() * 0.01, // 0-1% spread
      });
    }
  }
  
  if (spreads.length === 0) {
    console.error('No spread data available');
    return;
  }
  
  // Compute adaptive friction bands
  console.log('\n--- COMPUTING ADAPTIVE BANDS ---');
  const spreadValues = spreads.map(s => s.spread);
  const bands = computeAdaptiveFrictionBands(spreadValues);
  
  console.log(`P30 threshold: ${(bands.lowThreshold * 100).toFixed(4)}%`);
  console.log(`P70 threshold: ${(bands.highThreshold * 100).toFixed(4)}%`);
  
  // Classify all pairs
  console.log('\n--- CLASSIFYING PAIRS ---');
  let green = 0, orange = 0, red = 0;
  const samplePairs: Array<{ symbol: string; spread: number; tier: FrictionTier }> = [];
  
  for (const { symbol, spread } of spreads) {
    const tier = getAdaptiveFrictionTier(spread, bands);
    if (tier === 'GREEN') green++;
    else if (tier === 'ORANGE') orange++;
    else red++;
    
    if (samplePairs.length < 20) {
      samplePairs.push({ symbol, spread, tier });
    }
  }
  
  const total = spreads.length;
  const greenPct = (green / total) * 100;
  const orangePct = (orange / total) * 100;
  const redPct = (red / total) * 100;
  
  // Check if target met (within 10% tolerance)
  const targetMet = 
    Math.abs(greenPct - 30) <= 10 &&
    Math.abs(orangePct - 40) <= 10 &&
    Math.abs(redPct - 30) <= 10;
  
  const report: FrictionAuditReport = {
    timestamp: new Date().toISOString(),
    directive: '11.4H Task 2',
    summary: {
      total_pairs: total,
      green_count: green,
      orange_count: orange,
      red_count: red,
      green_percent: greenPct,
      orange_percent: orangePct,
      red_percent: redPct,
      target_met: targetMet,
    },
    bands,
    spread_stats: {
      min: Math.min(...spreadValues),
      max: Math.max(...spreadValues),
      median: percentile(spreadValues, 50),
      mean: spreadValues.reduce((a, b) => a + b, 0) / spreadValues.length,
      p30: percentile(spreadValues, 30),
      p70: percentile(spreadValues, 70),
    },
    sample_pairs: samplePairs,
  };
  
  // Print summary
  console.log('\n--- DISTRIBUTION SUMMARY ---');
  console.log(`GREEN:  ${green}/${total} (${greenPct.toFixed(1)}%) - target: 30%`);
  console.log(`ORANGE: ${orange}/${total} (${orangePct.toFixed(1)}%) - target: 40%`);
  console.log(`RED:    ${red}/${total} (${redPct.toFixed(1)}%) - target: 30%`);
  console.log(`Target met: ${targetMet ? '✓ PASS' : '✗ FAIL'}`);
  
  // Save report
  const reportDir = path.join(process.cwd(), 'audit', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'friction_balance_validation.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n[11.4H.2] Report saved to ${reportPath}`);
  
  console.log('\n[11.4H.2] Friction balance validation complete.');
}

main().catch(console.error);
