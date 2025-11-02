/**
 * Phase 41F-I: Trade Telemetry Service
 * 
 * Provides real-time telemetry for trading lifecycle events:
 * - Trade execution events (opened, closed, errors)
 * - Risk evaluation metrics
 * - Strategy signal emissions
 * 
 * Features:
 * - In-memory event and metric buffers
 * - WebSocket broadcasting via context-bridge
 * - Cross-link to health monitor for anomaly detection
 */

import type { EngineHealthMonitor } from './health-monitor.js';

interface TradeEvent {
  ts: number;
  type: 'trade_opened' | 'trade_closed' | 'trade_error';
  symbol?: string;
  mode?: 'paper' | 'live';
  result?: string;
  durationMs?: number;
  reason?: string;
  amount?: number;
  price?: number;
  [key: string]: any;
}

interface TradeMetric {
  ts: number;
  name: 'risk_eval' | 'signal_emit';
  symbol?: string;
  mode?: 'paper' | 'live';
  riskPct?: number;
  strategy?: string;
  strength?: number;
  [key: string]: any;
}

class TelemetryService {
  private static instance: TelemetryService;
  private eventBuffer: TradeEvent[] = [];
  private metricBuffer: TradeMetric[] = [];
  private maxBufferSize: number = 1000;
  private healthMonitor: EngineHealthMonitor | null = null;
  private contextBridge: any = null;

  private constructor() {}

  static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Initialize with health monitor reference for cross-linking
   */
  setHealthMonitor(monitor: EngineHealthMonitor): void {
    this.healthMonitor = monitor;
  }

  /**
   * Set context bridge for WebSocket broadcasting
   */
  setContextBridge(bridge: any): void {
    this.contextBridge = bridge;
  }

  /**
   * Record a trade lifecycle event (opened, closed, error)
   */
  async recordTradeEvent(type: TradeEvent['type'], payload: Partial<TradeEvent> = {}): Promise<void> {
    const entry: TradeEvent = {
      ts: Date.now(),
      type,
      ...payload
    };

    this.eventBuffer.push(entry);

    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    if (this.contextBridge) {
      try {
        await this.contextBridge.broadcast({
          type: 'trade_event',
          payload: entry
        });
      } catch (error) {
        console.error('[TelemetryService] Failed to broadcast trade event:', error);
      }
    }

    if (this.healthMonitor && typeof (this.healthMonitor as any).handleTradeEvent === 'function') {
      (this.healthMonitor as any).handleTradeEvent(entry);
    }

    console.log(`[Telemetry] 📊 ${type}:`, {
      symbol: entry.symbol,
      mode: entry.mode,
      result: entry.result,
      durationMs: entry.durationMs
    });
  }

  /**
   * Record a trade metric (risk eval, signal emit, etc.)
   */
  async recordTradeMetric(name: TradeMetric['name'], payload: Partial<TradeMetric> = {}): Promise<void> {
    const metric: TradeMetric = {
      ts: Date.now(),
      name,
      ...payload
    };

    this.metricBuffer.push(metric);

    if (this.metricBuffer.length > this.maxBufferSize) {
      this.metricBuffer.shift();
    }

    console.log(`[Telemetry] 📈 ${name}:`, {
      symbol: metric.symbol,
      mode: metric.mode,
      riskPct: metric.riskPct,
      strategy: metric.strategy,
      strength: metric.strength
    });
  }

  /**
   * Get recent trade events
   */
  getRecentEvents(limit: number = 100): TradeEvent[] {
    return this.eventBuffer.slice(-limit);
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(limit: number = 100): TradeMetric[] {
    return this.metricBuffer.slice(-limit);
  }

  /**
   * Clear buffers
   */
  clearBuffers(): void {
    this.eventBuffer = [];
    this.metricBuffer = [];
  }

  /**
   * Get telemetry stats
   */
  getStats(): {
    eventCount: number;
    metricCount: number;
    recentTradeErrors: number;
    lastEventTs: number | null;
  } {
    const recentErrors = this.eventBuffer.filter(
      e => e.type === 'trade_error' && Date.now() - e.ts < 60000
    ).length;

    const lastEvent = this.eventBuffer.length > 0 
      ? this.eventBuffer[this.eventBuffer.length - 1].ts 
      : null;

    return {
      eventCount: this.eventBuffer.length,
      metricCount: this.metricBuffer.length,
      recentTradeErrors: recentErrors,
      lastEventTs: lastEvent
    };
  }
}

export const telemetryService = TelemetryService.getInstance();
export type { TradeEvent, TradeMetric };
