/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4G — Diagnostic Trace Runner
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Diagnose why Hybrid/Pattern signals are not appearing in Ideal Pool.
 * Traces signal generation through VTS Runner, Pattern Detector, and Telemetry.
 * 
 * Outputs:
 * - /audit/reports/missing_pattern_rootcause.json
 * - /audit/logs/pattern_signal_trace.log
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { fx5Scanner } from '../services/fx5-scanner.js';
import { scanPatterns } from '../services/pattern-recognizer.js';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import { calculatePairRegime, DEFAULT_REGIME_CONFIG } from '../core/metrics/market-regime.js';
import { 
  CANONICAL_REGIME_STRATEGY_MAP,
  selectContextAwareStrategy,
  symbolToHash,
  type CanonicalRegimeType 
} from '../config/canonical-regime-strategy-map.js';
import type { OHLCData } from '../types/market-regime.types';
import fs from 'fs/promises';
import path from 'path';

interface DiagnosticTrace {
  symbol: string;
  pool: 'ideal' | 'rotational';
  regime: CanonicalRegimeType | null;
  assignedSignalType: string | null;
  assignedStrategy: string | null;
  patternDetectorCalled: boolean;
  patternsDetected: string[];
  patternCount: number;
  finalSignalType: string | null;  // Can be QUANT, HYBRID, PATTERN, or DISCARDED
  signalDowngraded: boolean;
  signalDiscarded: boolean;
  ohlcCandleCount: number;
  timestamp: string;
}

interface DiagnosticSummary {
  runDate: string;
  totalPairsScanned: number;
  pairsWithOHLC: number;
  pairsWithPatterns: number;
  uniquePatternsDetected: Set<string>;
  signalTypeDistribution: Record<string, number>;
  downgradeCount: number;
  discardCount: number;
  rootCause: string;
  recommendation: string;
}

const krakenService = new KrakenService();

async function fetchOHLC(symbol: string): Promise<OHLCData[]> {
  try {
    const { ohlc } = await krakenService.getOHLCData(symbol, 15, undefined, { maxCandlesTotal: 50 });
    if (!ohlc || ohlc.length === 0) return [];
    
    return ohlc.map((candle: any) => ({
      open: parseFloat(candle.open || candle[1]),
      high: parseFloat(candle.high || candle[2]),
      low: parseFloat(candle.low || candle[3]),
      close: parseFloat(candle.close || candle[4]),
      volume: parseFloat(candle.volume || candle[6] || 0),
      timestamp: candle.timestamp || candle[0] * 1000
    }));
  } catch (error) {
    return [];
  }
}

async function getActivePairs(limit: number): Promise<Array<{ symbol: string; pool: 'ideal' | 'rotational' }>> {
  const scanBatch = fx5Scanner.getCurrentScanBatch('paper');
  if (scanBatch.length >= 10) {
    return scanBatch.slice(0, limit).map(p => ({ symbol: p.symbol, pool: p.pool }));
  }
  
  console.log('[11.4G] FX5 batch empty, fetching pairs directly from Kraken...');
  try {
    const assets = await krakenService.getAssetPairs();
    const usdPairs = Object.keys(assets)
      .filter(k => k.endsWith('USD') && !k.includes('USDT') && !k.includes('USDC'))
      .slice(0, limit);
    return usdPairs.map(p => ({ symbol: p, pool: 'rotational' as const }));
  } catch (error) {
    console.error('[11.4G] Failed to fetch Kraken pairs:', error);
    const fallbackPairs = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD', 'DOT/USD', 
                          'LINK/USD', 'AVAX/USD', 'MATIC/USD', 'UNI/USD', 'ATOM/USD', 'LTC/USD',
                          'FIL/USD', 'NEAR/USD', 'APE/USD', 'SAND/USD', 'MANA/USD', 'AAVE/USD'];
    return fallbackPairs.slice(0, limit).map(p => ({ symbol: p, pool: 'rotational' as const }));
  }
}

async function runDiagnosticSweep(pairLimit: number = 100): Promise<void> {
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  Directive 11.4G — Pattern/Hybrid Signal Diagnostic Sweep      ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
  
  const traces: DiagnosticTrace[] = [];
  const summary: DiagnosticSummary = {
    runDate: new Date().toISOString(),
    totalPairsScanned: 0,
    pairsWithOHLC: 0,
    pairsWithPatterns: 0,
    uniquePatternsDetected: new Set(),
    signalTypeDistribution: { QUANT: 0, HYBRID: 0, PATTERN: 0 },
    downgradeCount: 0,
    discardCount: 0,
    rootCause: '',
    recommendation: ''
  };
  
  const pairs = await getActivePairs(pairLimit);
  
  console.log(`[11.4G] Scanning ${pairs.length} pairs...\n`);
  
  for (const pair of pairs) {
    const trace: DiagnosticTrace = {
      symbol: pair.symbol,
      pool: pair.pool,
      regime: null,
      assignedSignalType: null,
      assignedStrategy: null,
      patternDetectorCalled: false,
      patternsDetected: [],
      patternCount: 0,
      finalSignalType: null,
      signalDowngraded: false,
      signalDiscarded: false,
      ohlcCandleCount: 0,
      timestamp: new Date().toISOString()
    };
    
    summary.totalPairsScanned++;
    
    const ohlcData = await fetchOHLC(pair.symbol);
    trace.ohlcCandleCount = ohlcData.length;
    
    if (ohlcData.length === 0) {
      traces.push(trace);
      continue;
    }
    
    summary.pairsWithOHLC++;
    
    // B67.1 + B67.3.5 + B68.5: macroModifier + dbsSlope + regimeConfig required.
    // Diagnostic script — identity dbsSlope (0) + identity modifier (1.0) +
    // default regime config explicitly. Default config sets b68_5DbsSlopeMin=0
    // so Path B always admits in the diagnostic.
    const regimeResult = calculatePairRegime(ohlcData, 0, 0, 1.0, DEFAULT_REGIME_CONFIG);
    trace.regime = regimeResult.regime;
    
    const candles = ohlcData.map(o => ({
      timestamp: o.timestamp,
      open: o.open,
      high: o.high,
      low: o.low,
      close: o.close,
      volume: o.volume
    }));
    
    trace.patternDetectorCalled = true;
    const detectedPatterns = scanPatterns(candles, pair.symbol);
    trace.patternsDetected = detectedPatterns.map(p => p.pattern);
    trace.patternCount = detectedPatterns.length;
    
    if (trace.patternCount > 0) {
      summary.pairsWithPatterns++;
      detectedPatterns.forEach(p => summary.uniquePatternsDetected.add(p.pattern));
    }
    
    // Directive 11.4G: Use context-aware strategy selection WITH detected pattern
    const detectedPatternName = detectedPatterns.length > 0 ? detectedPatterns[0].pattern : null;
    const sHash = symbolToHash(pair.symbol);
    const { signalType, strategy, selectionReason } = selectContextAwareStrategy(
      trace.regime, 
      detectedPatternName, 
      sHash
    );
    trace.assignedSignalType = signalType;
    trace.assignedStrategy = strategy;
    
    let finalSignalType: string = signalType;
    
    // With context-aware selection, HYBRID with pattern should NOT downgrade
    if (signalType === 'HYBRID' && trace.patternCount === 0 && selectionReason === 'diversity') {
      finalSignalType = 'QUANT';
      trace.signalDowngraded = true;
      summary.downgradeCount++;
    }
    
    if (signalType === 'PATTERN' && trace.patternCount === 0 && selectionReason === 'diversity') {
      trace.signalDiscarded = true;
      summary.discardCount++;
      finalSignalType = 'DISCARDED';
    }
    
    trace.finalSignalType = finalSignalType;
    
    if (finalSignalType !== 'DISCARDED') {
      summary.signalTypeDistribution[finalSignalType] = 
        (summary.signalTypeDistribution[finalSignalType] || 0) + 1;
    }
    
    traces.push(trace);
    
    const statusIcon = trace.signalDiscarded ? '❌' : 
                       trace.signalDowngraded ? '⬇️' : 
                       trace.patternCount > 0 ? '✅' : '⚪';
    console.log(`${statusIcon} ${pair.symbol.padEnd(12)} regime=${trace.regime?.padEnd(14) || 'N/A'} assigned=${signalType?.padEnd(7) || 'N/A'} patterns=${trace.patternCount} final=${finalSignalType}`);
  }
  
  const hybridAssigned = traces.filter(t => t.assignedSignalType === 'HYBRID').length;
  const patternAssigned = traces.filter(t => t.assignedSignalType === 'PATTERN').length;
  const quantAssigned = traces.filter(t => t.assignedSignalType === 'QUANT').length;
  
  if (summary.pairsWithPatterns === 0) {
    summary.rootCause = 'PATTERN_DETECTOR_NO_MATCHES';
    summary.recommendation = 'Pattern detection thresholds may be too strict. Lower pinbar wick ratio from 2x to 1.5x, or increase candle lookback window.';
  } else if (summary.downgradeCount > hybridAssigned * 0.9) {
    summary.rootCause = 'HYBRID_MOSTLY_DOWNGRADED';
    summary.recommendation = 'Most HYBRID signals lack pattern confirmation. Relax pattern requirements or add more pattern types.';
  } else if (hybridAssigned === 0 && patternAssigned === 0) {
    summary.rootCause = 'REGIME_STRATEGY_MAP_QUANT_ONLY';
    summary.recommendation = 'CANONICAL_REGIME_STRATEGY_MAP assigns only QUANT strategies. Update map to include HYBRID/PATTERN strategies.';
  } else {
    summary.rootCause = 'UNKNOWN';
    summary.recommendation = 'Manual investigation required - patterns detected but signals not surfacing.';
  }
  
  console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
  console.log(`║  DIAGNOSTIC SUMMARY                                            ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`║  Total Pairs Scanned:     ${String(summary.totalPairsScanned).padStart(4)}                             ║`);
  console.log(`║  Pairs with OHLC:         ${String(summary.pairsWithOHLC).padStart(4)}                             ║`);
  console.log(`║  Pairs with Patterns:     ${String(summary.pairsWithPatterns).padStart(4)}                             ║`);
  console.log(`║  Patterns Found:          ${[...summary.uniquePatternsDetected].join(', ').padEnd(24).slice(0, 24)}   ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`║  ASSIGNED Signal Types:                                        ║`);
  console.log(`║    QUANT:    ${String(quantAssigned).padStart(4)}                                          ║`);
  console.log(`║    HYBRID:   ${String(hybridAssigned).padStart(4)}                                          ║`);
  console.log(`║    PATTERN:  ${String(patternAssigned).padStart(4)}                                          ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`║  FINAL Signal Types:                                           ║`);
  console.log(`║    QUANT:    ${String(summary.signalTypeDistribution.QUANT || 0).padStart(4)}  (includes ${summary.downgradeCount} downgrades)                 ║`);
  console.log(`║    HYBRID:   ${String(summary.signalTypeDistribution.HYBRID || 0).padStart(4)}                                          ║`);
  console.log(`║    PATTERN:  ${String(summary.signalTypeDistribution.PATTERN || 0).padStart(4)}                                          ║`);
  console.log(`║    DISCARDED:${String(summary.discardCount).padStart(4)}                                          ║`);
  console.log(`╠════════════════════════════════════════════════════════════════╣`);
  console.log(`║  ROOT CAUSE: ${summary.rootCause.padEnd(44)}   ║`);
  console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
  
  const reportPath = path.join(process.cwd(), 'audit', 'reports', 'missing_pattern_rootcause.json');
  const logPath = path.join(process.cwd(), 'audit', 'logs', 'pattern_signal_trace.log');
  
  const report = {
    directive: '11.4G',
    runDate: summary.runDate,
    rootCause: summary.rootCause,
    totalPairsScanned: summary.totalPairsScanned,
    pairsWithOHLC: summary.pairsWithOHLC,
    pairsWithPatterns: summary.pairsWithPatterns,
    uniquePatternsDetected: [...summary.uniquePatternsDetected],
    assignedDistribution: {
      QUANT: quantAssigned,
      HYBRID: hybridAssigned,
      PATTERN: patternAssigned
    },
    finalDistribution: summary.signalTypeDistribution,
    downgradeCount: summary.downgradeCount,
    discardCount: summary.discardCount,
    recommendation: summary.recommendation,
    regimeBreakdown: traces.reduce((acc, t) => {
      if (t.regime) {
        acc[t.regime] = (acc[t.regime] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>)
  };
  
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`[11.4G] Report saved: ${reportPath}`);
  
  const logContent = traces.map(t => JSON.stringify(t)).join('\n');
  await fs.writeFile(logPath, logContent);
  console.log(`[11.4G] Trace log saved: ${logPath}`);
}

const args = process.argv.slice(2);
const pairLimit = parseInt(args.find(a => a.startsWith('--pairs='))?.split('=')[1] || '100', 10);

runDiagnosticSweep(pairLimit).catch(console.error);
