/**
 * Phase 8.8.3-I1: Trade Lifecycle Diagnostics Service
 * 
 * Tracks the full lifecycle of each trade from signal to close.
 * This is DIAGNOSTIC ONLY - no behavior changes.
 * 
 * Responsibilities:
 * - Log trade lifecycle events with stable trade IDs
 * - Track trade open, update, and close events
 * - Provide summary statistics via API
 * - Log hard stop summaries
 */

type TradeEventType = 
  | 'TRADE_SIGNAL'
  | 'TRADE_OPEN'
  | 'TRADE_UPDATE'
  | 'TRADE_CLOSE'
  | 'TRADE_FORCE_CLOSE';

type TradeSource = 'normal' | 'hard_stop' | 'manual' | 'cleanup';  // Phase 8.8.3-I3: Added 'cleanup' for reconciliation

type CloseReason = 
  | 'target_hit'
  | 'stop_hit'
  | 'stop_loss'
  | 'trailing_stop_hit'
  | 'max_holding_period'
  | 'guardrail'
  | 'manual_stop'
  | 'engine_stop_cleanup'  // Phase 8.8.3-I3: Added for trade reconciliation on stop
  | 'unknown';

interface TradeLifecycleEvent {
  tradeId: string;
  symbol: string;
  strategy: string;
  eventType: TradeEventType;
  source: TradeSource;
  closeReason?: CloseReason;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

interface HardStopSummary {
  sessionId: string;
  openPositionsBefore: number;
  positionsClosedByHardStop: number;
  positionsRemainingOpen: number;
  timestamp: Date;
  dbCounts: {
    active_open_positions: number;
    paper_sim_trades: number;
  };
}

interface SlotStateSnapshot {
  timestamp: Date;
  sessionId: string;
  maxOpenTradesConfigured: number;
  currentOpenTrades: number;
  pendingSignals: number;
  rtbQueueLength: number;
  blockReasonsSnapshot: Record<string, number>;
}

interface I1TradeLifecycleSummary {
  sessionStart: Date;
  totalSignals: number;
  totalOpened: number;
  totalClosed: number;
  totalForceClosed: number;
  byCloseReason: Record<string, number>;
  byStrategy: Record<string, { opened: number; closed: number }>;
  recentEvents: TradeLifecycleEvent[];
  hardStopSummaries: HardStopSummary[];
  slotStateSnapshots: SlotStateSnapshot[];
}

class I1TradeLifecycleDiagnosticsService {
  private static instance: I1TradeLifecycleDiagnosticsService;
  
  private sessionStart: Date = new Date();
  private events: TradeLifecycleEvent[] = [];
  private hardStopSummaries: HardStopSummary[] = [];
  private slotStateSnapshots: SlotStateSnapshot[] = [];
  
  private totalSignals = 0;
  private totalOpened = 0;
  private totalClosed = 0;
  private totalForceClosed = 0;
  
  private byCloseReason: Record<string, number> = {};
  private byStrategy: Record<string, { opened: number; closed: number }> = {};
  
  private readonly MAX_EVENTS = 800; // Combined with snapshots stays under 1000
  private readonly MAX_SNAPSHOTS = 100;
  
  private constructor() {}
  
  static getInstance(): I1TradeLifecycleDiagnosticsService {
    if (!I1TradeLifecycleDiagnosticsService.instance) {
      I1TradeLifecycleDiagnosticsService.instance = new I1TradeLifecycleDiagnosticsService();
    }
    return I1TradeLifecycleDiagnosticsService.instance;
  }
  
  /**
   * Log a trade signal accepted into RTB
   */
  logSignal(tradeId: string, symbol: string, strategy: string, entryPrice?: number): void {
    const event: TradeLifecycleEvent = {
      tradeId,
      symbol,
      strategy,
      eventType: 'TRADE_SIGNAL',
      source: 'normal',
      entryPrice,
      timestamp: new Date()
    };
    
    this.totalSignals++;
    this.addEvent(event);
    
    console.log(`[8.8.3-I1][TRADE_SIGNAL] ${JSON.stringify({
      tradeId,
      symbol,
      strategy,
      entryPrice,
      ts: event.timestamp.toISOString()
    })}`);
  }
  
  /**
   * Log a trade opened from RTB
   */
  logOpen(tradeId: string, symbol: string, strategy: string, entryPrice: number, source: TradeSource = 'normal'): void {
    const event: TradeLifecycleEvent = {
      tradeId,
      symbol,
      strategy,
      eventType: 'TRADE_OPEN',
      source,
      entryPrice,
      timestamp: new Date()
    };
    
    this.totalOpened++;
    
    if (!this.byStrategy[strategy]) {
      this.byStrategy[strategy] = { opened: 0, closed: 0 };
    }
    this.byStrategy[strategy].opened++;
    
    this.addEvent(event);
    
    console.log(`[8.8.3-I1][TRADE_OPEN] ${JSON.stringify({
      tradeId,
      symbol,
      strategy,
      entryPrice,
      source,
      ts: event.timestamp.toISOString()
    })}`);
  }
  
  /**
   * Log a trade P&L update
   */
  logUpdate(tradeId: string, symbol: string, currentPrice: number, pnl: number): void {
    const event: TradeLifecycleEvent = {
      tradeId,
      symbol,
      strategy: 'unknown',
      eventType: 'TRADE_UPDATE',
      source: 'normal',
      exitPrice: currentPrice,
      pnl,
      timestamp: new Date()
    };
    
    this.addEvent(event);
  }
  
  /**
   * Log a trade closed normally
   */
  logClose(
    tradeId: string, 
    symbol: string, 
    strategy: string, 
    closeReason: CloseReason,
    exitPrice: number,
    pnl: number,
    source: TradeSource = 'normal'
  ): void {
    const event: TradeLifecycleEvent = {
      tradeId,
      symbol,
      strategy,
      eventType: 'TRADE_CLOSE',
      source,
      closeReason,
      exitPrice,
      pnl,
      timestamp: new Date()
    };
    
    this.totalClosed++;
    
    if (!this.byCloseReason[closeReason]) {
      this.byCloseReason[closeReason] = 0;
    }
    this.byCloseReason[closeReason]++;
    
    if (!this.byStrategy[strategy]) {
      this.byStrategy[strategy] = { opened: 0, closed: 0 };
    }
    this.byStrategy[strategy].closed++;
    
    this.addEvent(event);
    
    console.log(`[8.8.3-I1][TRADE_CLOSE] ${JSON.stringify({
      tradeId,
      symbol,
      strategy,
      closeReason,
      exitPrice,
      pnl,
      source,
      ts: event.timestamp.toISOString()
    })}`);
  }
  
  /**
   * Log a trade force-closed by hard stop
   */
  logForceClose(
    tradeId: string,
    symbol: string,
    strategy: string,
    exitPrice: number,
    pnl: number
  ): void {
    const event: TradeLifecycleEvent = {
      tradeId,
      symbol,
      strategy,
      eventType: 'TRADE_FORCE_CLOSE',
      source: 'hard_stop',
      closeReason: 'manual_stop',
      exitPrice,
      pnl,
      timestamp: new Date()
    };
    
    this.totalForceClosed++;
    this.totalClosed++;
    
    if (!this.byCloseReason['manual_stop']) {
      this.byCloseReason['manual_stop'] = 0;
    }
    this.byCloseReason['manual_stop']++;
    
    if (!this.byStrategy[strategy]) {
      this.byStrategy[strategy] = { opened: 0, closed: 0 };
    }
    this.byStrategy[strategy].closed++;
    
    this.addEvent(event);
    
    console.log(`[8.8.3-I1][TRADE_FORCE_CLOSE] ${JSON.stringify({
      tradeId,
      symbol,
      strategy,
      exitPrice,
      pnl,
      source: 'hard_stop',
      ts: event.timestamp.toISOString()
    })}`);
  }
  
  /**
   * Log hard stop summary after all positions closed
   */
  logHardStopSummary(summary: {
    sessionId: string;
    openPositionsBefore: number;
    positionsClosedByHardStop: number;
    positionsRemainingOpen: number;
    dbCounts: {
      active_open_positions: number;
      paper_sim_trades: number;
    };
  }): void {
    const hardStopSummary: HardStopSummary = {
      ...summary,
      timestamp: new Date()
    };
    
    this.hardStopSummaries.push(hardStopSummary);
    if (this.hardStopSummaries.length > 50) {
      this.hardStopSummaries.shift();
    }
    
    console.log(`[8.8.3-I1][HARD_STOP_SUMMARY] ${JSON.stringify({
      ...summary,
      ts: hardStopSummary.timestamp.toISOString()
    })}`);
  }
  
  /**
   * Log slot state snapshot for capacity diagnostics
   */
  logSlotState(snapshot: {
    sessionId: string;
    maxOpenTradesConfigured: number;
    currentOpenTrades: number;
    pendingSignals: number;
    rtbQueueLength: number;
    blockReasonsSnapshot: Record<string, number>;
  }): void {
    const slotSnapshot: SlotStateSnapshot = {
      ...snapshot,
      timestamp: new Date()
    };
    
    this.slotStateSnapshots.push(slotSnapshot);
    if (this.slotStateSnapshots.length > this.MAX_SNAPSHOTS) {
      this.slotStateSnapshots.shift();
    }
    
    console.log(`[8.8.3-I1][SLOT_STATE] ${JSON.stringify({
      ...snapshot,
      ts: slotSnapshot.timestamp.toISOString()
    })}`);
  }
  
  /**
   * Get aggregated summary
   */
  getSummary(): I1TradeLifecycleSummary {
    return {
      sessionStart: this.sessionStart,
      totalSignals: this.totalSignals,
      totalOpened: this.totalOpened,
      totalClosed: this.totalClosed,
      totalForceClosed: this.totalForceClosed,
      byCloseReason: { ...this.byCloseReason },
      byStrategy: { ...this.byStrategy },
      recentEvents: this.events.slice(-100).reverse(),
      hardStopSummaries: [...this.hardStopSummaries],
      slotStateSnapshots: this.slotStateSnapshots.slice(-20)
    };
  }
  
  /**
   * Clear all counters and reset session
   */
  clear(): void {
    this.sessionStart = new Date();
    this.events = [];
    this.hardStopSummaries = [];
    this.slotStateSnapshots = [];
    this.totalSignals = 0;
    this.totalOpened = 0;
    this.totalClosed = 0;
    this.totalForceClosed = 0;
    this.byCloseReason = {};
    this.byStrategy = {};
    
    console.log(`[8.8.3-I1][TRADE_LIFECYCLE_CLEARED] Session reset at ${this.sessionStart.toISOString()}`);
  }
  
  private addEvent(event: TradeLifecycleEvent): void {
    this.events.push(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events.shift();
    }
  }
}

export const i1TradeLifecycleDiagnostics = I1TradeLifecycleDiagnosticsService.getInstance();
