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

export async function exportVtsDataToCsv(
  trades: TradeRecord[], 
  filenamePrefix: string
): Promise<string> {
  const exportsDir = path.join(process.cwd(), 'logs', 'exports');
  
  await fs.mkdir(exportsDir, { recursive: true });
  
  if (trades.length === 0) {
    const filename = `${filenamePrefix}_${Date.now()}.csv`;
    const filepath = path.join(exportsDir, filename);
    await fs.writeFile(filepath, 'No data available');
    return `/logs/exports/${filename}`;
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
  
  const csv = [headers.join(','), ...rows].join('\n');
  
  const filename = `${filenamePrefix}_${Date.now()}.csv`;
  const filepath = path.join(exportsDir, filename);
  
  await fs.writeFile(filepath, csv, 'utf-8');
  
  console.log(`[11.6E][Export] CSV exported: ${filename} (${trades.length} records)`);
  
  return `/logs/exports/${filename}`;
}

export async function getClosedVTSTradesFromLogs(days: number = 7): Promise<Array<{
  symbol: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  quantity: number;
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
}>> {
  const vtsDir = path.join(process.cwd(), 'logs', 'virtual_trades');
  const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
  const trades: Array<any> = [];
  
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
          
          const exitTime = trade.exitTime || trade.closedAt || trade.resolvedAt;
          if (!exitTime) continue;
          
          const exitTimestamp = new Date(exitTime).getTime();
          if (exitTimestamp < cutoffDate) continue;
          
          const entryPrice = trade.entryPrice || trade.signal?.entryPrice || 0;
          const exitPrice = trade.exitPrice || trade.resolvedPrice || 0;
          const quantity = trade.positionSize || trade.quantity || 0;
          
          const grossProfitValue = (exitPrice - entryPrice) * quantity;
          const grossProfitPercent = entryPrice > 0 
            ? ((exitPrice - entryPrice) / entryPrice * 100).toFixed(2)
            : '0.00';
          
          const costs = trade.frictionCost || trade.costs || 0;
          const netProfitValue = grossProfitValue - costs;
          const netProfitPercent = entryPrice > 0 && quantity > 0
            ? (netProfitValue / (entryPrice * quantity) * 100).toFixed(2)
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
            quantity,
            entryPrice,
            exitPrice,
            target: trade.takeProfit || trade.target || 0,
            stopLoss: trade.stopLoss || 0,
            resultType,
            grossProfitValue: parseFloat(grossProfitValue.toFixed(2)),
            grossProfitPercent: (parseFloat(grossProfitPercent) >= 0 ? '+' : '') + grossProfitPercent + '%',
            costs,
            netProfitValue: parseFloat(netProfitValue.toFixed(2)),
            netProfitPercent: (parseFloat(netProfitPercent) >= 0 ? '+' : '') + netProfitPercent + '%',
            finalScore: trade.finalScore || trade.signal?.finalScore || 0,
            hybridScore: trade.hybridScore || trade.signal?.hybridScore || 0,
            expectedEdge: trade.predictiveConfidence || trade.expectedEdge || 0,
            regimeWeight: trade.regimeWeight || 0,
            entryTime: new Date(entryTimestamp).toISOString(),
            exitTime: new Date(exitTimestamp).toISOString(),
            durationMinutes
          });
        }
      } catch (err) {
        console.warn(`[11.6E][Export] Error reading ${file}:`, err);
      }
    }
  } catch (err) {
    console.warn('[11.6E][Export] Error reading virtual_trades directory:', err);
  }
  
  return trades.sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime());
}
