/**
 * Phase B4: Diagnostic Framework
 * 
 * SCOPE COMPLIANCE:
 * - NO modifications to guardrails, position sizing, signal routing, WS pricing, risk logic, scanning
 * - ONLY adds diagnostic hooks, data logging, observational endpoints, CSV export
 * 
 * Modules:
 * 1. MAX_POSITION diagnostics with ring buffer
 * 2. Funnel diagnostics (attempt → RTB → opened)
 * 3. WebSocket health validation
 * 4. Unified export
 */

export interface MaxPositionLogEntry {
  timestamp: string;
  symbol: string;
  strategy: string;
  entry_price: number;
  portfolio_balance: number;
  max_single_position_allowed: number;
  max_total_exposure_allowed: number;
  current_total_exposure: number;
  calculated_quantity: number;
  calculated_notional: number;
  buffered_max_notional: number;
  block_reason: 'MAX_POSITION' | 'PASS';
}

export interface FunnelLogEntry {
  timestamp: string;
  symbol: string;
  strategy: string;
  stage: 'attempt' | 'rtb' | 'opened';
  block_reason: string | null;
}

export interface FunnelSummary {
  active_pool: number;
  attempts: number;
  rtb_signals: number;
  opened_trades: number;
  conversions: {
    attempt_to_rtb_pct: number;
    rtb_to_open_pct: number;
  };
}

export interface WSHealthStatus {
  ws_connected: boolean;
  subscribed_symbols: string[];
  last_update_by_symbol: Record<string, { timestamp: string; age_ms: number }>;
  avg_tick_interval_ms: number;
  stale_symbols: string[];
}

class B4DiagnosticService {
  private static instance: B4DiagnosticService;
  
  private maxPositionLogs: MaxPositionLogEntry[] = [];
  private funnelLogs: FunnelLogEntry[] = [];
  
  private readonly MAX_ENTRIES = 5000;
  
  private funnelCounters = {
    active_pool_count: 0,
    attempt_count: 0,
    attempt_blocked_count: 0,
    rtb_count: 0,
    trade_opened_count: 0
  };
  
  private sessionStart: Date = new Date();
  
  private constructor() {}
  
  static getInstance(): B4DiagnosticService {
    if (!B4DiagnosticService.instance) {
      B4DiagnosticService.instance = new B4DiagnosticService();
    }
    return B4DiagnosticService.instance;
  }
  
  resetSession(): void {
    this.maxPositionLogs = [];
    this.funnelLogs = [];
    this.funnelCounters = {
      active_pool_count: 0,
      attempt_count: 0,
      attempt_blocked_count: 0,
      rtb_count: 0,
      trade_opened_count: 0
    };
    this.sessionStart = new Date();
    console.log(`[B4] Diagnostic session reset at ${this.sessionStart.toISOString()}`);
  }
  
  logMaxPositionCheck(entry: Omit<MaxPositionLogEntry, 'timestamp'>): void {
    const logEntry: MaxPositionLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    
    this.maxPositionLogs.push(logEntry);
    
    if (this.maxPositionLogs.length > this.MAX_ENTRIES) {
      this.maxPositionLogs.shift();
    }
  }
  
  logFunnelEvent(entry: Omit<FunnelLogEntry, 'timestamp'>): void {
    const logEntry: FunnelLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    
    this.funnelLogs.push(logEntry);
    
    if (this.funnelLogs.length > this.MAX_ENTRIES) {
      this.funnelLogs.shift();
    }
    
    switch (entry.stage) {
      case 'attempt':
        this.funnelCounters.attempt_count++;
        if (entry.block_reason) {
          this.funnelCounters.attempt_blocked_count++;
        }
        break;
      case 'rtb':
        this.funnelCounters.rtb_count++;
        break;
      case 'opened':
        this.funnelCounters.trade_opened_count++;
        break;
    }
  }
  
  updateActivePoolCount(count: number): void {
    this.funnelCounters.active_pool_count = count;
  }
  
  getMaxPositionLogs(limit: number = 5000): MaxPositionLogEntry[] {
    return this.maxPositionLogs.slice(-limit);
  }
  
  getFunnelLogs(limit: number = 5000): FunnelLogEntry[] {
    return this.funnelLogs.slice(-limit);
  }
  
  getFunnelSummary(): FunnelSummary {
    const attempts = this.funnelCounters.attempt_count;
    const rtb = this.funnelCounters.rtb_count;
    const opened = this.funnelCounters.trade_opened_count;
    
    return {
      active_pool: this.funnelCounters.active_pool_count,
      attempts,
      rtb_signals: rtb,
      opened_trades: opened,
      conversions: {
        attempt_to_rtb_pct: attempts > 0 ? parseFloat(((rtb / attempts) * 100).toFixed(1)) : 0,
        rtb_to_open_pct: rtb > 0 ? parseFloat(((opened / rtb) * 100).toFixed(1)) : 0
      }
    };
  }
  
  getWSHealth(): WSHealthStatus {
    try {
      const { krakenWebSocketAdapter } = require('./kraken-websocket-adapter');
      const diagnostics = krakenWebSocketAdapter.getDiagnostics();
      
      const now = Date.now();
      const lastUpdateBySymbol: Record<string, { timestamp: string; age_ms: number }> = {};
      
      if (diagnostics.lastUpdateBySymbol) {
        for (const [symbol, timestamp] of Object.entries(diagnostics.lastUpdateBySymbol)) {
          const ts = new Date(timestamp as string);
          const ageMs = now - ts.getTime();
          lastUpdateBySymbol[symbol] = {
            timestamp: ts.toISOString(),
            age_ms: ageMs
          };
        }
      }
      
      return {
        ws_connected: diagnostics.wsConnected || false,
        subscribed_symbols: diagnostics.subscribedSymbols || [],
        last_update_by_symbol: lastUpdateBySymbol,
        avg_tick_interval_ms: diagnostics.averageIntervalMs || 0,
        stale_symbols: diagnostics.staleSymbols || []
      };
    } catch (error) {
      console.error('[B4] Error getting WS health:', error);
      return {
        ws_connected: false,
        subscribed_symbols: [],
        last_update_by_symbol: {},
        avg_tick_interval_ms: 0,
        stale_symbols: []
      };
    }
  }
  
  exportToCSV(module: 'maxpos' | 'funnel' | 'ws'): string {
    switch (module) {
      case 'maxpos':
        return this.maxPositionLogsToCSV();
      case 'funnel':
        return this.funnelLogsToCSV();
      case 'ws':
        return this.wsHealthToCSV();
      default:
        return '';
    }
  }
  
  private maxPositionLogsToCSV(): string {
    const headers = [
      'timestamp', 'symbol', 'strategy', 'entry_price', 'portfolio_balance',
      'max_single_position_allowed', 'max_total_exposure_allowed', 'current_total_exposure',
      'calculated_quantity', 'calculated_notional', 'buffered_max_notional', 'block_reason'
    ];
    
    const rows = this.maxPositionLogs.map(e => [
      e.timestamp,
      e.symbol,
      e.strategy,
      e.entry_price,
      e.portfolio_balance,
      e.max_single_position_allowed,
      e.max_total_exposure_allowed,
      e.current_total_exposure,
      e.calculated_quantity,
      e.calculated_notional,
      e.buffered_max_notional,
      e.block_reason
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
  }
  
  private funnelLogsToCSV(): string {
    const headers = ['timestamp', 'symbol', 'strategy', 'stage', 'block_reason'];
    
    const rows = this.funnelLogs.map(e => [
      e.timestamp,
      e.symbol,
      e.strategy,
      e.stage,
      e.block_reason || ''
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
  }
  
  private wsHealthToCSV(): string {
    const health = this.getWSHealth();
    const headers = ['symbol', 'last_update', 'age_ms', 'is_stale'];
    
    const rows = Object.entries(health.last_update_by_symbol).map(([symbol, data]) => [
      symbol,
      data.timestamp,
      data.age_ms,
      health.stale_symbols.includes(symbol) ? 'yes' : 'no'
    ].join(','));
    
    return [headers.join(','), ...rows].join('\n');
  }
  
  getStats(): {
    sessionStart: string;
    maxPositionLogCount: number;
    funnelLogCount: number;
    funnelCounters: {
      active_pool_count: number;
      attempt_count: number;
      attempt_blocked_count: number;
      rtb_count: number;
      trade_opened_count: number;
    };
  } {
    return {
      sessionStart: this.sessionStart.toISOString(),
      maxPositionLogCount: this.maxPositionLogs.length,
      funnelLogCount: this.funnelLogs.length,
      funnelCounters: { ...this.funnelCounters }
    };
  }
}

export const b4Diagnostics = B4DiagnosticService.getInstance();
