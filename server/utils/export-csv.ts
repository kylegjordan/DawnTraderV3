/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.6E: CSV Export Helper
 * ══════════════════════════════════════════════════════════════════════════════
 * Utility for exporting VTS data to CSV format
 */

import fs from 'fs/promises';
import path from 'path';

interface TradeRecord {
  [key: string]: string | number | null | undefined;
}

/**
 * Generate CSV content string from trade records (for browser download)
 */
export function generateCsvContent(trades: TradeRecord[]): string {
  if (trades.length === 0) {
    return 'No data available';
  }
  
  const headers = Object.keys(trades[0]);
  const rows = trades.map(trade => 
    headers.map(header => {
      const value = trade[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    }).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Legacy: Export to file (kept for backwards compatibility)
 */
export async function exportVtsDataToCsv(
  trades: TradeRecord[], 
  filenamePrefix: string
): Promise<string> {
  const exportsDir = path.join(process.cwd(), 'logs', 'exports');
  
  await fs.mkdir(exportsDir, { recursive: true });
  
  const csv = generateCsvContent(trades);
  
  const filename = `${filenamePrefix}_${Date.now()}.csv`;
  const filepath = path.join(exportsDir, filename);
  
  await fs.writeFile(filepath, csv, 'utf-8');
  
  console.log(`[11.6E][Export] CSV exported: ${filename} (${trades.length} records)`);
  
  return `/logs/exports/${filename}`;
}

/**
 * Directive 11.6H: Added dollarValue (fixed USD exposure) and quantity (variable coin units)
 */
export async function getClosedVTSTradesFromLogs(days: number = 7): Promise<Array<{
  symbol: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  dollarValue: number;    // Directive 11.6H: Fixed USD exposure
  quantity: number;       // Directive 11.6H: Variable coin units
  entryPrice: number;
  exitPrice: number;
  target: number;
  stopLoss: number;
  resultType: string;
  grossProfitValue: number;
  grossProfitPercent: string;
  costs: number;
  netProfitValue: number;
  netProfitPercent: string;
  finalScore: number;
  hybridScore: number;
  expectedEdge: number;
  regimeWeight: number;
  entryTime: string;
  exitTime: string;
  durationMinutes: number;
  globalRegime: string | null;
  pairFriction: number | null;
  globalFriction: number | null;
  pairDirectionalBias: string | null;
  globalDirectionalBias: string | null;
  filterTier: string | null;
}>> {
  const vtsDir = path.join(process.cwd(), 'logs', 'virtual_trades');
  const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
  const trades: Array<any> = [];
  let skippedIncomplete = 0;
  
  try {
    const files = await fs.readdir(vtsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(vtsDir, file), 'utf-8');
        const fileTradesRaw = JSON.parse(content);
        const fileTrades = Array.isArray(fileTradesRaw) ? fileTradesRaw : [];
        
        for (const trade of fileTrades) {
          if (!trade.id?.startsWith('vts_')) continue;
          // Phase 14: Exclude legacy simulation trades — only show Phase 14+ real-price trades
          if (trade.source !== 'vts') continue;
          
          const exitTime = trade.exitTime || trade.closedAt || trade.resolvedAt;
          if (!exitTime) continue;
          
          const exitTimestamp = new Date(exitTime).getTime();
          if (exitTimestamp < cutoffDate) continue;
          
          const entryPrice = trade.entryPrice || trade.signal?.entryPrice;
          const exitPrice = trade.exitPrice || trade.resolvedPrice;
          
          // Directive 11.6H: dollarValue is USD exposure, quantity is coin units
          // For legacy trades: positionSize represents USD, so divide by entryPrice to get units
          const tradeDollarValue = trade.dollarValue ?? trade.positionSize ?? 0;
          const tradeQuantity = trade.quantity ?? (entryPrice > 0 ? tradeDollarValue / entryPrice : 0);
          
          if (!entryPrice || entryPrice <= 0 || !exitPrice || exitPrice <= 0 || !tradeQuantity || tradeQuantity <= 0) {
            skippedIncomplete++;
            continue;
          }
          
          const grossProfitValue = (exitPrice - entryPrice) * tradeQuantity;
          const grossProfitPercent = ((exitPrice - entryPrice) / entryPrice * 100).toFixed(2);
          
          // Fix: Convert frictionCost (percentage) to dollar amount
          const frictionCostPercent = trade.frictionCost || trade.costs || 0;
          const costsDollar = tradeDollarValue * frictionCostPercent;
          const netProfitValue = grossProfitValue - costsDollar;
          // Directive 11.6H: Use dollarValue for netProfitPercent denominator
          const netProfitPercent = tradeDollarValue > 0 
            ? (netProfitValue / tradeDollarValue * 100).toFixed(2) 
            : '0.00';
          
          const entryTimestamp = new Date(trade.entryTime || trade.openedAt || trade.signal?.createdAt || 0).getTime();
          const durationMinutes = Math.floor((exitTimestamp - entryTimestamp) / 60000);
          
          let resultType = 'TIMEOUT';
          if (trade.resultType) {
            resultType = trade.resultType.toUpperCase().replace(/[_-]/g, '_');
          } else if (trade.exitReason) {
            if (trade.exitReason.includes('stop') || trade.exitReason.includes('STOP')) {
              resultType = 'STOP_HIT';
            } else if (trade.exitReason.includes('target') || trade.exitReason.includes('PROFIT') || trade.exitReason.includes('TARGET')) {
              resultType = 'TARGET_HIT';
            }
          }
          
          trades.push({
            symbol: trade.symbol || trade.signal?.symbol || 'UNKNOWN',
            regime: trade.regime || trade.signal?.regime || 'UNKNOWN',
            strategy: trade.strategy || trade.signal?.strategy || 'UNKNOWN',
            signalType: trade.signalType || trade.signal?.signalType || 'UNKNOWN',
            patternType: trade.patternType || trade.signal?.patternType || null,
            pool: (trade.pool || 'UNKNOWN').toUpperCase(),
            dollarValue: parseFloat(tradeDollarValue.toFixed(2)),  // Directive 11.6H: Fixed USD exposure
            quantity: parseFloat(tradeQuantity.toFixed(6)),        // Directive 11.6H: Variable coin units
            entryPrice,
            exitPrice,
            target: trade.takeProfit || trade.target || trade.signal?.takeProfit || 0,
            stopLoss: trade.stopLoss || trade.signal?.stopLoss || 0,
            resultType,
            grossProfitValue: parseFloat(grossProfitValue.toFixed(2)),
            grossProfitPercent: (parseFloat(grossProfitPercent) >= 0 ? '+' : '') + grossProfitPercent + '%',
            costs: parseFloat(costsDollar.toFixed(4)),
            netProfitValue: parseFloat(netProfitValue.toFixed(2)),
            netProfitPercent: (parseFloat(netProfitPercent) >= 0 ? '+' : '') + netProfitPercent + '%',
            finalScore: trade.finalScore || trade.signal?.finalScore || 0,
            hybridScore: trade.hybridScore || trade.signal?.hybridScore || 0,
            expectedEdge: trade.predictiveConfidence || trade.expectedEdge || 0,
            regimeWeight: trade.regimeWeight || 0,
            entryTime: new Date(entryTimestamp).toISOString(),
            exitTime: new Date(exitTimestamp).toISOString(),
            durationMinutes,
            globalRegime: trade.globalRegime || null,
            pairFriction: trade.pairFriction ?? null,
            globalFriction: trade.globalFriction ?? null,
            pairDirectionalBias: trade.pairDirectionalBias || null,
            globalDirectionalBias: trade.globalDirectionalBias || null
          });
        }
      } catch (err) {
        console.warn(`[11.6E][Export] Error reading ${file}:`, err);
      }
    }
  } catch (err) {
    console.warn('[11.6E][Export] Error reading virtual_trades directory:', err);
  }
  
  if (skippedIncomplete > 0) {
    console.log(`[11.6E][Export] Skipped ${skippedIncomplete} incomplete trades (missing entry/exit price or quantity)`);
  }
  
  return trades.sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime());
}
