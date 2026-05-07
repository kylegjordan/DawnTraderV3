/**
 * Directive 11.4G.2 - Blue-Chip Exclusion Audit
 * 
 * Purpose: Identify high-volume trading pairs filtered by low volatility thresholds
 * 
 * Analysis:
 * 1. Fetch all tradable pairs with volume data
 * 2. Classify by volume tier (HIGH/MID/LOW)
 * 3. Calculate volatility for each pair
 * 4. Identify blue-chip pairs (top volume) excluded due to volatility filters
 * 5. Generate recommendations for filter threshold adjustments
 */

import { krakenAssetPairsService, AutoMappingEntry } from '../markets/kraken-asset-pairs-service';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import { volumeClassifier } from '../services/market-data/volume-classifier';

interface BlueChipAuditResult {
  symbol: string;
  volumeRank: number;
  volumeTier: 'HIGH' | 'MID' | 'LOW';
  volume24h: number;
  volatility: number | null;
  excluded: boolean;
  exclusionReason: string | null;
  isBlueChip: boolean;
}

interface AuditSummary {
  totalPairs: number;
  blueChipCount: number;
  blueChipsExcluded: number;
  exclusionReasons: { reason: string; count: number }[];
  recommendations: string[];
}

const VOLATILITY_MIN_THRESHOLD = 0.02; // 2% min volatility typical filter
const VOLATILITY_MAX_THRESHOLD = 0.15; // 15% max volatility typical filter
const BLUE_CHIP_TOP_N = 50; // Top 50 by volume = blue chips

const krakenService = new KrakenService();

async function fetchPairData(symbol: string): Promise<{ 
  bid: number; 
  ask: number; 
  high24h: number; 
  low24h: number; 
  volume24h: number;
} | null> {
  try {
    const tickerResult = await krakenService.getTicker(symbol);
    if (!tickerResult) return null;
    
    const ticker = Object.values(tickerResult)[0];
    if (!ticker || !ticker.b || !ticker.a) return null;
    
    return {
      bid: parseFloat(ticker.b[0]),
      ask: parseFloat(ticker.a[0]),
      high24h: parseFloat(ticker.h?.[1] ?? '0'),
      low24h: parseFloat(ticker.l?.[1] ?? '0'),
      volume24h: parseFloat(ticker.v?.[1] ?? '0')
    };
  } catch {
    return null;
  }
}

function calculateVolatility(high24h: number, low24h: number, price: number): number | null {
  if (high24h <= 0 || low24h <= 0 || price <= 0) return null;
  return (high24h - low24h) / price;
}

function determineExclusionReason(volatility: number | null, volume24h: number): string | null {
  if (volatility === null) return 'NO_DATA';
  if (volatility < VOLATILITY_MIN_THRESHOLD) return 'LOW_VOLATILITY';
  if (volatility > VOLATILITY_MAX_THRESHOLD) return 'HIGH_VOLATILITY';
  if (volume24h < 10000) return 'LOW_VOLUME';
  return null;
}

interface RawPairData {
  symbol: string;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

async function runBlueChipAudit(pairLimit: number = 200): Promise<{
  results: BlueChipAuditResult[];
  summary: AuditSummary;
}> {
  console.log('[11.4G.2] Starting Blue-Chip Exclusion Audit...');
  
  // Initialize volume classifier
  await volumeClassifier.init();
  
  // Get all mappable pairs
  await krakenAssetPairsService.refresh();
  const allPairs: AutoMappingEntry[] = krakenAssetPairsService.getAllMappings();
  
  console.log(`[11.4G.2] Fetching data for ${Math.min(pairLimit, allPairs.length)} pairs...`);
  
  // Phase 1: Collect all pair data with actual volume
  const rawData: RawPairData[] = [];
  const processedPairs = allPairs.slice(0, pairLimit);
  
  const batchSize = 10;
  for (let i = 0; i < processedPairs.length; i += batchSize) {
    const batch = processedPairs.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(batch.map(async (pair: AutoMappingEntry) => {
      const symbol = pair.krakenWsPair || pair.internalSymbol;
      const pairData = await fetchPairData(symbol);
      
      if (!pairData) {
        return { symbol, bid: 0, ask: 0, high24h: 0, low24h: 0, volume24h: 0 };
      }
      
      return { symbol, ...pairData };
    }));
    
    rawData.push(...batchResults);
    
    if (i + batchSize < processedPairs.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  
  // Phase 2: Sort by actual 24h volume descending to determine true blue-chip ranking
  rawData.sort((a, b) => b.volume24h - a.volume24h);
  console.log(`[11.4G.2] Ranked ${rawData.length} pairs by 24h volume`);
  
  // Phase 3: Build results with correct volume-based ranks
  const results: BlueChipAuditResult[] = rawData.map((data, idx) => {
    const volumeRank = idx + 1;
    const midPrice = data.bid > 0 ? (data.bid + data.ask) / 2 : 0;
    const volatility = midPrice > 0 ? calculateVolatility(data.high24h, data.low24h, midPrice) : null;
    const exclusionReason = data.volume24h === 0 && data.bid === 0 
      ? 'NO_DATA' 
      : determineExclusionReason(volatility, data.volume24h);
    
    return {
      symbol: data.symbol,
      volumeRank,
      volumeTier: volumeClassifier.getTier(data.symbol),
      volume24h: data.volume24h,
      volatility,
      excluded: exclusionReason !== null,
      exclusionReason,
      isBlueChip: volumeRank <= BLUE_CHIP_TOP_N
    };
  });
  
  // Calculate summary
  const blueChips = results.filter(r => r.isBlueChip);
  const blueChipsExcluded = blueChips.filter(r => r.excluded);
  
  const exclusionReasonCounts = new Map<string, number>();
  blueChipsExcluded.forEach(r => {
    const reason = r.exclusionReason || 'UNKNOWN';
    exclusionReasonCounts.set(reason, (exclusionReasonCounts.get(reason) || 0) + 1);
  });
  
  const recommendations: string[] = [];
  
  // Analyze low volatility exclusions
  const lowVolBlueChips = blueChipsExcluded.filter(r => r.exclusionReason === 'LOW_VOLATILITY');
  if (lowVolBlueChips.length > 5) {
    const avgVol = lowVolBlueChips.reduce((sum, r) => sum + (r.volatility || 0), 0) / lowVolBlueChips.length;
    recommendations.push(
      `Consider lowering min volatility threshold from ${VOLATILITY_MIN_THRESHOLD * 100}% to ${(avgVol * 0.8 * 100).toFixed(1)}% to include ${lowVolBlueChips.length} blue-chip pairs`
    );
  }
  
  // Analyze high volatility exclusions
  const highVolBlueChips = blueChipsExcluded.filter(r => r.exclusionReason === 'HIGH_VOLATILITY');
  if (highVolBlueChips.length > 3) {
    recommendations.push(
      `${highVolBlueChips.length} blue-chip pairs excluded for HIGH_VOLATILITY - consider regime-based volatility thresholds`
    );
  }
  
  // Check for data quality issues
  const noDataBlueChips = blueChipsExcluded.filter(r => r.exclusionReason === 'NO_DATA');
  if (noDataBlueChips.length > 0) {
    recommendations.push(
      `${noDataBlueChips.length} blue-chip pairs have NO_DATA - check API connectivity and symbol mapping`
    );
  }
  
  const summary: AuditSummary = {
    totalPairs: results.length,
    blueChipCount: blueChips.length,
    blueChipsExcluded: blueChipsExcluded.length,
    exclusionReasons: Array.from(exclusionReasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    recommendations
  };
  
  return { results, summary };
}

async function main() {
  console.log('='.repeat(60));
  console.log('[11.4G.2] BLUE-CHIP EXCLUSION AUDIT');
  console.log('='.repeat(60));
  
  const pairLimit = parseInt(process.argv.find(a => a.startsWith('--pairs='))?.split('=')[1] || '100');
  
  try {
    const { results, summary } = await runBlueChipAudit(pairLimit);
    
    console.log('\n--- SUMMARY ---');
    console.log(`Total Pairs Analyzed: ${summary.totalPairs}`);
    console.log(`Blue-Chip Pairs (Top ${BLUE_CHIP_TOP_N}): ${summary.blueChipCount}`);
    console.log(`Blue-Chips Excluded: ${summary.blueChipsExcluded}`);
    
    console.log('\n--- EXCLUSION REASONS (Blue-Chips) ---');
    summary.exclusionReasons.forEach(({ reason, count }) => {
      console.log(`  ${reason}: ${count}`);
    });
    
    console.log('\n--- EXCLUDED BLUE-CHIPS ---');
    const excludedBlueChips = results.filter(r => r.isBlueChip && r.excluded).slice(0, 20);
    excludedBlueChips.forEach(r => {
      console.log(`  #${r.volumeRank} ${r.symbol}: vol=${(r.volatility ? (r.volatility * 100).toFixed(2) : 'N/A')}% reason=${r.exclusionReason}`);
    });
    
    console.log('\n--- RECOMMENDATIONS ---');
    if (summary.recommendations.length === 0) {
      console.log('  No specific recommendations - filter thresholds appear balanced.');
    } else {
      summary.recommendations.forEach(rec => {
        console.log(`  * ${rec}`);
      });
    }
    
    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      directive: '11.4G.2',
      summary,
      excludedBlueChips: results.filter(r => r.isBlueChip && r.excluded),
      includedBlueChips: results.filter(r => r.isBlueChip && !r.excluded),
      thresholds: {
        volatilityMin: VOLATILITY_MIN_THRESHOLD,
        volatilityMax: VOLATILITY_MAX_THRESHOLD,
        blueChipTopN: BLUE_CHIP_TOP_N
      }
    };
    
    const fs = await import('fs').then(m => m.promises);
    await fs.mkdir('/home/runner/workspace/audit/reports', { recursive: true });
    await fs.writeFile(
      '/home/runner/workspace/audit/reports/bluechip_exclusion_audit.json',
      JSON.stringify(report, null, 2)
    );
    console.log('\n[11.4G.2] Report saved to /audit/reports/bluechip_exclusion_audit.json');
    
  } catch (error) {
    console.error('[11.4G.2] Audit failed:', error);
  }
  
  console.log('\n[11.4G.2] Audit complete.');
  process.exit(0);
}

main();
