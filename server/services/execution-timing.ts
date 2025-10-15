import { promises as fs } from 'fs';
import path from 'path';
import { filePersistence } from './file-persistence';

export interface OrderTimingMarks {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  
  // Timing marks
  t_decide: number;      // When strategy decided to trade
  t_submit: number;      // When order was dispatched to exchange
  t_ack: number;         // When exchange acknowledged
  t_fill: number;        // When order was filled
  
  // Execution details
  intendedPrice: number;
  modeledFillPrice: number;
  actualFillPrice?: number;
  slippage_bps: number;
  fees: number;
  
  // Context
  strategy: string;
  marketDataSource: 'ws' | 'rest_fallback';
  venuePrice: number;    // Price at t_submit
  
  // Calculated durations (ms)
  submit_ack_ms: number;
  ack_fill_ms: number;
  total_ms: number;
}

export interface ExecutionMetrics {
  avgSubmitAckMs: number;
  avgAckFillMs: number;
  avgTotalMs: number;
  avgSlippageBps: number;
  avgFeesPerTrade: number;
  orderCount: number;
  lastUpdated: string;
}

class ExecutionTimingService {
  private orderTimings: Map<string, Partial<OrderTimingMarks>> = new Map();
  private completedTimings: OrderTimingMarks[] = [];
  private readonly maxHistorySize = 1000;

  /**
   * Mark when a strategy decides to trade
   */
  public markDecision(
    orderId: string, 
    symbol: string, 
    side: 'buy' | 'sell', 
    quantity: number,
    intendedPrice: number,
    strategy: string
  ): void {
    this.orderTimings.set(orderId, {
      orderId,
      symbol,
      side,
      quantity,
      t_decide: Date.now(),
      intendedPrice,
      strategy,
    });
    
    console.log(`[ExecTiming] Decision: ${orderId} ${side} ${quantity} ${symbol} @ ${intendedPrice} (${strategy})`);
  }

  /**
   * Mark when order is submitted to exchange
   */
  public markSubmit(
    orderId: string, 
    venuePrice: number,
    marketDataSource: 'ws' | 'rest_fallback'
  ): void {
    const timing = this.orderTimings.get(orderId);
    if (!timing) {
      console.warn(`[ExecTiming] No decision mark for ${orderId}`);
      return;
    }

    timing.t_submit = Date.now();
    timing.venuePrice = venuePrice;
    timing.marketDataSource = marketDataSource;
    
    console.log(`[ExecTiming] Submit: ${orderId} @ venue ${venuePrice} (source: ${marketDataSource})`);
  }

  /**
   * Mark when exchange acknowledges order
   */
  public markAck(orderId: string): void {
    const timing = this.orderTimings.get(orderId);
    if (!timing) {
      console.warn(`[ExecTiming] No submit mark for ${orderId}`);
      return;
    }

    timing.t_ack = Date.now();
    
    const submitAckMs = timing.t_ack - (timing.t_submit || timing.t_ack);
    console.log(`[ExecTiming] Ack: ${orderId} (submit→ack: ${submitAckMs}ms)`);
  }

  /**
   * Mark when order is filled
   */
  public markFill(
    orderId: string, 
    fillPrice: number, 
    slippageBps: number, 
    fees: number
  ): void {
    const timing = this.orderTimings.get(orderId);
    if (!timing) {
      console.warn(`[ExecTiming] No timing data for ${orderId}`);
      return;
    }

    timing.t_fill = Date.now();
    timing.modeledFillPrice = fillPrice;
    timing.actualFillPrice = fillPrice;
    timing.slippage_bps = slippageBps;
    timing.fees = fees;

    // Calculate durations
    const t_decide = timing.t_decide || timing.t_fill!;
    const t_submit = timing.t_submit || timing.t_fill!;
    const t_ack = timing.t_ack || timing.t_fill!;
    
    timing.submit_ack_ms = t_ack - t_submit;
    timing.ack_fill_ms = timing.t_fill! - t_ack;
    timing.total_ms = timing.t_fill! - t_decide;

    // Move to completed
    this.completedTimings.push(timing as OrderTimingMarks);
    this.orderTimings.delete(orderId);

    // Trim history
    if (this.completedTimings.length > this.maxHistorySize) {
      this.completedTimings = this.completedTimings.slice(-this.maxHistorySize);
    }

    console.log(`[ExecTiming] Fill: ${orderId} @ ${fillPrice} | slippage: ${slippageBps}bps | fees: $${fees.toFixed(2)} | total: ${timing.total_ms}ms`);

    // Log summary every 10 orders
    if (this.completedTimings.length % 10 === 0) {
      this.logSummary(10);
    }
  }

  /**
   * Get metrics for last N orders
   */
  public getMetrics(lastN: number = 100): ExecutionMetrics {
    const recent = this.completedTimings.slice(-lastN);
    
    if (recent.length === 0) {
      return {
        avgSubmitAckMs: 0,
        avgAckFillMs: 0,
        avgTotalMs: 0,
        avgSlippageBps: 0,
        avgFeesPerTrade: 0,
        orderCount: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    const sum = recent.reduce(
      (acc, t) => ({
        submitAck: acc.submitAck + t.submit_ack_ms,
        ackFill: acc.ackFill + t.ack_fill_ms,
        total: acc.total + t.total_ms,
        slippage: acc.slippage + t.slippage_bps,
        fees: acc.fees + t.fees,
      }),
      { submitAck: 0, ackFill: 0, total: 0, slippage: 0, fees: 0 }
    );

    const count = recent.length;

    return {
      avgSubmitAckMs: Math.round(sum.submitAck / count),
      avgAckFillMs: Math.round(sum.ackFill / count),
      avgTotalMs: Math.round(sum.total / count),
      avgSlippageBps: +(sum.slippage / count).toFixed(2),
      avgFeesPerTrade: +(sum.fees / count).toFixed(2),
      orderCount: count,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Log summary to console
   */
  private logSummary(lastN: number): void {
    const metrics = this.getMetrics(lastN);
    console.log(`[EXEC] avg_submit_ack_ms=${metrics.avgSubmitAckMs} / ack_fill_ms=${metrics.avgAckFillMs} (n=${metrics.orderCount})`);
  }

  /**
   * Export execution timing data to CSV
   */
  public async exportToCSV(filename?: string): Promise<string> {
    if (this.completedTimings.length === 0) {
      throw new Error('No execution timing data to export');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fileName = filename || `exec-timing-${timestamp}.csv`;

    // CSV header
    const headers = [
      'orderId', 'timestamp', 'symbol', 'side', 'quantity', 'strategy',
      'intendedPrice', 'fillPrice', 'slippage_bps', 'fees',
      'submit_ack_ms', 'ack_fill_ms', 'total_ms', 'marketDataSource'
    ];

    // CSV rows
    const rows = this.completedTimings.map(t => [
      t.orderId,
      new Date(t.t_decide).toISOString(),
      t.symbol,
      t.side,
      t.quantity,
      t.strategy,
      t.intendedPrice,
      t.modeledFillPrice,
      t.slippage_bps,
      t.fees,
      t.submit_ack_ms,
      t.ack_fill_ms,
      t.total_ms,
      t.marketDataSource
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    // Save via FilePersistenceService
    await filePersistence.saveFile('export', fileName, csv);

    console.log(`[ExecTiming] Exported ${this.completedTimings.length} orders to ${fileName}`);
    return fileName;
  }

  /**
   * Get recent timings
   */
  public getRecentTimings(limit: number = 50): OrderTimingMarks[] {
    return this.completedTimings.slice(-limit);
  }

  /**
   * Clear all timing data
   */
  public clear(): void {
    this.orderTimings.clear();
    this.completedTimings = [];
    console.log('[ExecTiming] Cleared all timing data');
  }
}

// Singleton instance
export const executionTiming = new ExecutionTimingService();
