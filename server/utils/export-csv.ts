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
  sourcePool: string; // Batch 47f15: Family-qualified source pool (quant-trend, pattern, etc.)
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
  // B61 (2026-04-15): numeric DBS scores alongside categories
  pairDirectionalBiasScore: number | null;
  globalDirectionalBiasScore: number | null;
  filterTier: string | null;
  // B65.2 (2026-04-23): trailing-exit mode preserved on close so the
  // Closed Simulated Trades UI can distinguish trades that ended in
  // moonbag (TRAILING_TAKE) from trades that closed at the static
  // target / stop / timeout. Populated from the trailing engine's
  // final state at close time (written by vts-runner into the JSON log).
  tradeMode: 'TARGET' | 'TRAILING_TAKE';
  // B65.2: raw exitReason preserved alongside the normalized resultType
  // so the UI can render differentiated badges for trailing_stop_hit
  // and moonbag_timeout instead of collapsing everything to
  // TAKE_PROFIT / STOP_LOSS / TIMEOUT.
  exitReason: string;
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
          
          // B65.2 (2026-04-23): resultType mapping expanded so the new
          // trailing_stop_hit + moonbag_timeout exit reasons flow through
          // to the UI as distinct badges instead of collapsing to TIMEOUT.
          // Order matters: check specific reasons first, then generic ones.
          let resultType = 'TIMEOUT';
          const rawExit = (trade.exitReason || '').toString().toLowerCase();
          if (trade.resultType) {
            resultType = trade.resultType.toUpperCase().replace(/[_-]/g, '_');
          } else if (rawExit) {
            if (rawExit === 'trailing_stop_hit') {
              resultType = 'TRAILING_STOP_HIT';
            } else if (rawExit === 'moonbag_timeout') {
              resultType = 'MOONBAG_TIMEOUT';
            } else if (rawExit.includes('stop')) {
              resultType = 'STOP_HIT';
            } else if (rawExit.includes('target') || rawExit.includes('profit')) {
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
            sourcePool: (trade.sourcePool || 'UNKNOWN').toUpperCase(),
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
            expectedEdge: trade.expectedEdge ?? trade.signal?.expectedEdge ?? 0,
            regimeWeight: trade.regimeWeight || 0,
            entryTime: new Date(entryTimestamp).toISOString(),
            exitTime: new Date(exitTimestamp).toISOString(),
            durationMinutes,
            globalRegime: trade.globalRegime || null,
            pairFriction: trade.pairFriction ?? null,
            globalFriction: trade.globalFriction ?? null,
            pairDirectionalBias: trade.pairDirectionalBias || null,
            globalDirectionalBias: trade.globalDirectionalBias || null,
            // B61 (2026-04-15): numeric DBS scores alongside categories
            pairDirectionalBiasScore: (typeof trade.pairDirectionalBiasScore === 'number') ? trade.pairDirectionalBiasScore : null,
            globalDirectionalBiasScore: (typeof trade.globalDirectionalBiasScore === 'number') ? trade.globalDirectionalBiasScore : null,
            filterTier: trade.filterTier || null,
            // B65.2 (2026-04-23): trailing-exit mode at close + raw exit reason
            tradeMode: (trade.tradeMode === 'TRAILING_TAKE' ? 'TRAILING_TAKE' : 'TARGET') as 'TARGET' | 'TRAILING_TAKE',
            exitReason: (trade.exitReason || '').toString(),
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
