/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 10.0.B (Upgraded from 8.8.4-L1)
 * ══════════════════════════════════════════════════════════════════════════════
 * Data Aggregator Service - Passive & Active Learning Data Aggregation
 * 
 * Purpose: Non-blocking data aggregation framework capturing signal-level,
 * strategy-level, and market-level metrics during passive and active trading.
 * 
 * Features:
 * - Buffered async capture with 30-second flush intervals
 * - 15-minute aggregation cycles with global roll-up
 * - Automatic mode detection (passive/active)
 * - Strategy-specific and symbol-specific grouping
 * - Phase 10.0: Added netEV, frictionCost, volNoise, regimeId, trueFrictionDelta
 * - Phase 10.2: Added signalType, patternType, patternStrength, predictiveConfidence
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

interface CaptureRecord {
  timestamp: number;
  mode: 'passive' | 'active';
  eventType: string;
  symbol?: string;
  strategy?: string;
  [key: string]: any;
}

/**
 * Directive 10.0.B + 10.1.D + 10.2: Extended AggregateRecord with Pattern fields
 */
interface AggregateRecord {
  timestamp: string;
  symbol: string;
  strategy: string;
  period: string;
  avgRisk: number;
  avgProfitRate: number;
  reconfirmRate: number;
  tradePromotionRate: number;
  sampleCount: number;
  regimeId: string;
  strategySelected?: string;
  avgNetEV: number;
  avgFrictionCost: number;
  avgVolNoise: number;
  trueFrictionDelta: number | null;
  confidenceScore?: number;
  signalType?: 'QUANT' | 'PATTERN' | 'HYBRID';
  patternType?: string;
  patternStrength?: number;
  predictiveConfidence?: number;
}

/**
 * Directive 10.0.B: Extended GlobalRollup with Phase 9 Math fields
 */
interface GlobalRollup {
  timestamp: string;
  avgRisk: number;
  avgProfitRate: number;
  totalSignals: number;
  avgNetEV: number;
  avgFrictionCost: number;
  avgVolNoise: number;
}

const MAX_BUFFER_SIZE = 5000; // Memory audit: prevent runaway on I/O failure

export class DataAggregator extends EventEmitter {
  private buffer: CaptureRecord[] = [];
  private mode: 'passive' | 'active' = 'passive';
  private lastFlush = 0;
  private flushInterval = 30000; // 30s
  private aggregateInterval = 900000; // 15m
  private aggregateTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private captureCount = 0;
  private flushCount = 0;

  constructor() {
    super();
    this.aggregateTimer = setInterval(() => this.aggregate(), this.aggregateInterval);
    this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
    console.log('[8.8.4-L1][DataAggregator] INIT_OK - flush=30s, aggregate=15m');
  }

  setMode(mode: 'passive' | 'active') {
    if (this.mode !== mode) {
      console.log(`[8.8.4-L1][DataAggregator] Mode changed: ${this.mode} → ${mode}`);
      this.mode = mode;
    }
  }

  getMode(): 'passive' | 'active' {
    return this.mode;
  }

  async capture(eventType: string, payload: Record<string, any>) {
    if (this.isShuttingDown) return;
    // Memory audit: cap buffer to prevent runaway on I/O failure
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER_SIZE + 100); // Drop oldest 100
      console.warn(`[DataAggregator] Buffer capped at ${MAX_BUFFER_SIZE} — dropped oldest entries`);
    }
    this.buffer.push({
      timestamp: Date.now(),
      mode: this.mode,
      eventType,
      ...payload
    });
    this.captureCount++;
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (this.isShuttingDown) return;

    const toFlush = [...this.buffer];
    this.buffer = [];
    
    const day = new Date().toISOString().slice(0, 10);
    const dir = './logs/data_aggregates';
    
    try {
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${this.mode}_${day}.json`);
      const data = toFlush.map(d => JSON.stringify(d)).join('\n') + '\n';
      await fs.appendFile(filePath, data);
      this.lastFlush = Date.now();
      this.flushCount++;
      
      if (this.flushCount % 10 === 0) {
        console.log(`[8.8.4-L1][DataAggregator] Flush #${this.flushCount}: ${toFlush.length} records, total captures: ${this.captureCount}`);
      }
    } catch (err) {
      console.error('[8.8.4-L1][DataAggregator] Flush failed:', err);
      // Re-add failed records to buffer
      this.buffer = [...toFlush, ...this.buffer];
    }
  }

  async aggregate(): Promise<void> {
    if (this.isShuttingDown) return;

    const now = new Date();
    const periodKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const srcDir = './logs/data_aggregates';
    const outDir = path.join(srcDir, 'hourly');

    try {
      await fs.mkdir(outDir, { recursive: true });
      const outFile = path.join(outDir, `${this.mode}_${periodKey}.json`);

      // Read today's capture file
      const dayFile = path.join(srcDir, `${this.mode}_${now.toISOString().slice(0, 10)}.json`);
      
      let content: string;
      try {
        content = await fs.readFile(dayFile, 'utf-8');
      } catch {
        // No file yet, skip aggregation
        return;
      }

      const lines = content.trim().split('\n').filter(l => l.length > 0);
      if (lines.length === 0) return;

      const records: CaptureRecord[] = [];
      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }

      // Group by symbol_strategy
      const byKey: Record<string, CaptureRecord[]> = {};
      for (const rec of records) {
        const symbol = rec.symbol || 'UNKNOWN';
        const strategy = rec.strategy || 'UNKNOWN';
        const key = `${symbol}_${strategy}`;
        if (!byKey[key]) byKey[key] = [];
        byKey[key].push(rec);
      }

      const aggregates: AggregateRecord[] = Object.entries(byKey).map(([key, recs]) => {
        const [symbol, strategy] = key.split('_');
        const avg = (field: string) => {
          const values = recs.filter(r => r[field] !== undefined).map(r => r[field]);
          if (values.length === 0) return 0;
          return values.reduce((a, b) => a + b, 0) / values.length;
        };
        const rate = (field: string) => {
          const values = recs.filter(r => r[field] !== undefined);
          if (values.length === 0) return 0;
          return values.filter(r => r[field] === true).length / values.length;
        };
        const mode = (field: string) => {
          const values = recs.filter(r => r[field] !== undefined).map(r => r[field]);
          if (values.length === 0) return 'UNKNOWN';
          const counts: Record<string, number> = {};
          values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
          return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNKNOWN';
        };
        
        const avgFrictionDelta = avg('trueFrictionDelta');

        return {
          timestamp: now.toISOString(),
          symbol,
          strategy,
          period: periodKey,
          avgRisk: avg('risk'),
          avgProfitRate: avg('profitRate'),
          reconfirmRate: rate('reconfirmed'),
          tradePromotionRate: rate('tradeExecuted'),
          sampleCount: recs.length,
          regimeId: mode('regimeId'),
          avgNetEV: avg('netEV'),
          avgFrictionCost: avg('frictionCost'),
          avgVolNoise: avg('volNoise'),
          trueFrictionDelta: avgFrictionDelta > 0 ? avgFrictionDelta : null
        };
      });

      // Global roll-up (Directive 10.0.B: Added Phase 9 Math fields)
      const global: GlobalRollup = {
        timestamp: now.toISOString(),
        avgRisk: this.arrayAvg(aggregates, 'avgRisk'),
        avgProfitRate: this.arrayAvg(aggregates, 'avgProfitRate'),
        totalSignals: aggregates.reduce((a, r) => a + r.sampleCount, 0),
        avgNetEV: this.arrayAvg(aggregates, 'avgNetEV'),
        avgFrictionCost: this.arrayAvg(aggregates, 'avgFrictionCost'),
        avgVolNoise: this.arrayAvg(aggregates, 'avgVolNoise')
      };

      await fs.writeFile(outFile, JSON.stringify({ aggregates, global }, null, 2));
      console.log(`[8.8.4-L1][DataAggregator] Aggregation complete: ${aggregates.length} groups, ${global.totalSignals} signals`);
      
      this.emit('aggregation_complete', { period: periodKey, global, aggregateCount: aggregates.length });
    } catch (err) {
      console.error('[8.8.4-L1][DataAggregator] Aggregation failed:', err);
    }
  }

  private arrayAvg(arr: any[], key: string): number {
    if (arr.length === 0) return 0;
    const values = arr.filter(r => r[key] !== undefined && !isNaN(r[key])).map(r => r[key]);
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  getStats(): { captureCount: number; flushCount: number; bufferSize: number; mode: string; lastFlush: number } {
    return {
      captureCount: this.captureCount,
      flushCount: this.flushCount,
      bufferSize: this.buffer.length,
      mode: this.mode,
      lastFlush: this.lastFlush
    };
  }

  async shutdown(): Promise<void> {
    console.log('[8.8.4-L1][DataAggregator] Shutting down...');
    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.aggregateTimer) {
      clearInterval(this.aggregateTimer);
      this.aggregateTimer = null;
    }

    // Final flush
    await this.flush();
    console.log('[8.8.4-L1][DataAggregator] Shutdown complete');
  }
}

// Singleton instance
export const dataAggregator = new DataAggregator();
