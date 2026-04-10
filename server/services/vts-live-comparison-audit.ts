/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-M5C — VTS vs Live Trade Comparison Audit Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Compares VTS simulated trades against live paper trades to validate:
 * - Strategy matching and overlap
 * - Entry/exit variance
 * - Calibration error measurement
 * 
 * Produces comprehensive comparison reports for system validation.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs/promises';
import path from 'path';

interface VTSTradeRecord {
  symbol: string;
  strategy: string;
  entry: number;
  exit: number;
  di: number;
  gsi: number;
  profit: number;
  loss: number;
  positionSize: number;
  strategyWeight: number;
  timestamp: string;
}

export interface PaperTradeRecord {
  symbol: string;
  strategy: string;
  entryPrice: number;
  exitPrice: number;
  di?: number;
  gsi?: number;
  profit: number;
  loss: number;
  positionSize: number;
  timestamp: string;
}

interface TradeComparison {
  symbol: string;
  strategy: string;
  vts_profit: number;
  live_profit: number;
  position_diff: number;
  entry_diff: number;
  exit_diff: number;
  matched: boolean;
}

interface ComparisonReport {
  timestamp: string;
  vtsSessionFile: string;
  paperSessionFile: string;
  vtsTradeCount: number;
  paperTradeCount: number;
  matchedPairs: number;
  matchRate: number;
  calibrationError: number;
  avgPositionDiff: number;
  avgProfitDelta: number;
  correlation: number;
  strategyOverlap: string[];
  validationPassed: boolean;
  comparisons: TradeComparison[];
}

let latestComparisonReport: ComparisonReport | null = null;
let paperSessionTrades: PaperTradeRecord[] = [];
let paperSessionStartTime: number | null = null;

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function matchTrades(vtsTrades: VTSTradeRecord[], paperTrades: PaperTradeRecord[]): TradeComparison[] {
  const comparisons: TradeComparison[] = [];
  const usedPaperTrades = new Set<number>();
  
  for (const vts of vtsTrades) {
    let bestMatch: PaperTradeRecord | null = null;
    let bestMatchIndex = -1;
    let bestScore = Infinity;
    
    for (let i = 0; i < paperTrades.length; i++) {
      if (usedPaperTrades.has(i)) continue;
      
      const paper = paperTrades[i];
      if (vts.symbol !== paper.symbol) continue;
      
      const timeDiff = Math.abs(new Date(vts.timestamp).getTime() - new Date(paper.timestamp).getTime());
      const priceDiff = Math.abs(vts.entry - paper.entryPrice) / vts.entry;
      
      const score = timeDiff / 60000 + priceDiff * 100;
      
      if (score < bestScore && score < 30) {
        bestScore = score;
        bestMatch = paper;
        bestMatchIndex = i;
      }
    }
    
    if (bestMatch && bestMatchIndex >= 0) {
      usedPaperTrades.add(bestMatchIndex);
      
      comparisons.push({
        symbol: vts.symbol,
        strategy: vts.strategy,
        vts_profit: vts.profit - vts.loss,
        live_profit: bestMatch.profit - bestMatch.loss,
        position_diff: Math.abs(vts.positionSize - bestMatch.positionSize) / Math.max(vts.positionSize, 1),
        entry_diff: Math.abs(vts.entry - bestMatch.entryPrice) / vts.entry,
        exit_diff: Math.abs(vts.exit - bestMatch.exitPrice) / vts.exit,
        matched: true
      });
    } else {
      comparisons.push({
        symbol: vts.symbol,
        strategy: vts.strategy,
        vts_profit: vts.profit - vts.loss,
        live_profit: 0,
        position_diff: 0,
        entry_diff: 0,
        exit_diff: 0,
        matched: false
      });
    }
  }
  
  return comparisons;
}

export async function runComparisonAudit(vtsFilePath: string, paperFilePath: string): Promise<ComparisonReport> {
  let vtsTrades: VTSTradeRecord[] = [];
  let paperTrades: PaperTradeRecord[] = [];
  
  try {
    const vtsData = JSON.parse(await fs.readFile(vtsFilePath, 'utf-8'));
    vtsTrades = vtsData.trades || [];
  } catch (error) {
    console.error('[M5C][AUDIT] Failed to read VTS trades:', error);
  }
  
  try {
    const paperData = JSON.parse(await fs.readFile(paperFilePath, 'utf-8'));
    paperTrades = paperData.trades || [];
  } catch (error) {
    console.error('[M5C][AUDIT] Failed to read paper trades:', error);
  }
  
  const comparisons = matchTrades(vtsTrades, paperTrades);
  const matchedComparisons = comparisons.filter(c => c.matched);
  
  const matchRate = vtsTrades.length > 0 ? matchedComparisons.length / vtsTrades.length : 0;
  
  const avgPositionDiff = matchedComparisons.length > 0
    ? matchedComparisons.reduce((sum, c) => sum + c.position_diff, 0) / matchedComparisons.length
    : 0;
  
  const avgProfitDelta = matchedComparisons.length > 0
    ? matchedComparisons.reduce((sum, c) => sum + Math.abs(c.vts_profit - c.live_profit), 0) / matchedComparisons.length
    : 0;
  
  const calibrationError = avgPositionDiff * 0.5;
  
  const vtsStrategies = new Set(vtsTrades.map(t => t.strategy));
  const paperStrategies = new Set(paperTrades.map(t => t.strategy));
  const strategyOverlap = [...vtsStrategies].filter(s => paperStrategies.has(s));
  
  const vtsProfit = matchedComparisons.map(c => c.vts_profit);
  const liveProfit = matchedComparisons.map(c => c.live_profit);
  const correlation = calculateCorrelation(vtsProfit, liveProfit);
  
  const validationPassed = matchRate >= 0.5 && calibrationError < 0.15 && correlation > 0.5;
  
  const report: ComparisonReport = {
    timestamp: new Date().toISOString(),
    vtsSessionFile: vtsFilePath,
    paperSessionFile: paperFilePath,
    vtsTradeCount: vtsTrades.length,
    paperTradeCount: paperTrades.length,
    matchedPairs: matchedComparisons.length,
    matchRate: Math.round(matchRate * 100) / 100,
    calibrationError: Math.round(calibrationError * 100) / 100,
    avgPositionDiff: Math.round(avgPositionDiff * 1000) / 1000,
    avgProfitDelta: Math.round(avgProfitDelta * 100) / 100,
    correlation: Math.round(correlation * 100) / 100,
    strategyOverlap,
    validationPassed,
    comparisons
  };
  
  latestComparisonReport = report;
  
  const reportsDir = path.join(process.cwd(), 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  
  const reportPath = path.join(reportsDir, `VTS_Live_Comparison_${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`[M5C][AUDIT] Comparison report saved: ${reportPath}`);
  
  return report;
}

export function getLatestComparisonReport(): ComparisonReport | null {
  return latestComparisonReport;
}

export function startPaperTradeRecording(): void {
  paperSessionTrades = [];
  paperSessionStartTime = Date.now();
  console.log('[M5C][PAPER] Started paper trade recording session');
}

export function recordPaperTrade(trade: PaperTradeRecord): void {
  paperSessionTrades.push(trade);
}

export async function savePaperSessionTrades(sessionId?: string): Promise<string> {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  
  const timestamp = sessionId || Date.now().toString();
  const filePath = path.join(dataDir, `paper_trades_${timestamp}.json`);
  
  const sessionData = {
    sessionId: timestamp,
    startTime: paperSessionStartTime ? new Date(paperSessionStartTime).toISOString() : null,
    endTime: new Date().toISOString(),
    durationMinutes: paperSessionStartTime ? Math.round((Date.now() - paperSessionStartTime) / 60000) : 0,
    tradeCount: paperSessionTrades.length,
    trades: paperSessionTrades
  };
  
  await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
  console.log(`[M5C][PAPER] Saved ${paperSessionTrades.length} trades to ${filePath}`);
  
  return filePath;
}

export function getPaperSessionTrades(): PaperTradeRecord[] {
  return [...paperSessionTrades];
}

export async function getLatestPaperTradesFile(): Promise<string | null> {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    const files = await fs.readdir(dataDir);
    const paperFiles = files.filter(f => f.startsWith('paper_trades_') && f.endsWith('.json'));
    if (paperFiles.length === 0) return null;
    
    paperFiles.sort().reverse();
    return path.join(dataDir, paperFiles[0]);
  } catch {
    return null;
  }
}

export async function compareLatestSessions(): Promise<ComparisonReport | null> {
  const { getLatestVTSTradesFile } = await import('./vts-runner.js');
  
  const vtsFile = await getLatestVTSTradesFile();
  const paperFile = await getLatestPaperTradesFile();
  
  if (!vtsFile || !paperFile) {
    console.log('[M5C][AUDIT] Missing VTS or paper trades file');
    return null;
  }
  
  return runComparisonAudit(vtsFile, paperFile);
}
