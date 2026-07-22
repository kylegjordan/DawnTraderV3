/**
 * Phase 8.8.3-AJ19-B: Trade Lifecycle Integrity Tracing
 * 
 * Diagnoses whether trade closures are properly freeing slots in the guardrail system.
 * 
 * Hypothesis: The MAX_POSITION guardrail thinks slots are permanently full because:
 * 1. Trades open correctly (slot count increases)
 * 2. But when trades close, deleteActiveOpenPosition() fails or is skipped
 * 3. So the DB still has rows, and guardrails see max slots forever
 * 
 * This service logs:
 * - Trade OPEN events with slot counts before/after
 * - Monitoring loop status (SL/TP triggers)
 * - Trade CLOSE events with slot counts before/after
 * - Per-cycle reconciliation (DB vs guardrail position counts)
 * - Slot freed events
 */

import { storage } from '../storage';

export interface LifecycleOpenEvent {
  timestamp: Date;
  tradeId: string | number;
  positionId?: string | number;
  symbol: string;
  quantity: string;
  notionalValue: number;
  openPrice: number;
  slotCountBefore: number;
  slotCountAfter: number;
  dbOpenPositionsCount: number;
  mode: 'live' | 'paper';
}

export interface LifecycleMonitorEvent {
  timestamp: Date;
  positionId: string | number;
  symbol: string;
  unrealizedPnl: number;
  slTriggered: boolean;
  tpTriggered: boolean;
  trailingStopTriggered: boolean;
  currentPrice: number;
  stopPrice: number;
  targetPrice: number;
}

export interface LifecycleCloseEvent {
  timestamp: Date;
  tradeId?: string | number;
  positionId: string | number;
  symbol: string;
  // P19-B8.5f (OBJ-5): MAX_HOLD added. The `max_holding_period` exit previously mapped to
  // 'UNKNOWN' because it had NEVER fired — the value never reached the position (the #550
  // carry drop), so SysManual RISK-035 rated the mis-label LOW on those grounds. OBJ-1 makes
  // the exit fire, which promotes that dormant risk to live: without this member every
  // time-exit close would land in the trade tables as 'UNKNOWN' — a fresh truthfulness
  // regression in the exact surface B8.10 existed to fix. Named MAX_HOLD (not TIME_EXIT) to
  // match the system's own `max_holding_period` / `maxHoldingMs` vocabulary per §1 canonical
  // terms. Safe to extend: `close_reason` is varchar(40/50) — no pg enum, no CHECK constraint
  // — and no consumer switches exhaustively on this union (the AJ19B aggregation keys
  // dynamically at :410/:479).
  closeReason: 'SL' | 'TP' | 'TRAILING_STOP' | 'MAX_HOLD' | 'MANUAL' | 'KILL_SWITCH' | 'ENGINE_STOP' | 'UNKNOWN';
  closedValue: number;
  pnl: number;
  slotCountBefore: number;
  slotCountAfter: number;
  dbOpenPositionsCount: number;
  deleteSuccessful: boolean;
  deleteError?: string;
  mode: 'live' | 'paper';
}

export interface ReconciliationEvent {
  timestamp: Date;
  cycleId: string;
  dbOpenCount: number;
  guardrailOpenCount: number;
  mismatchDetected: boolean;
  positionIds?: string[];
  symbols?: string[];
  strandedPositionIds?: string[]; // Positions that should have been closed but weren't
  failedDeleteCount?: number; // Number of delete failures since last reconcile
  mode: 'live' | 'paper';
}

export interface SlotFreedEvent {
  timestamp: Date;
  positionId: string | number;
  symbol: string;
  slotCountNew: number;
  closeReason: string;
}

export interface LifecycleSummary {
  sessionStart: Date;
  isEnabled: boolean;
  
  // Counts
  totalOpens: number;
  totalCloseAttempts: number;
  successfulCloses: number;
  failedCloses: number;
  slotsFreed: number;
  
  // Mismatch tracking
  reconciliationChecks: number;
  mismatchesDetected: number;
  
  // Current state snapshot
  currentDbOpenCount: number;
  lastReconciliation?: ReconciliationEvent;
  
  // Recent events (last 20)
  recentOpens: LifecycleOpenEvent[];
  recentCloses: LifecycleCloseEvent[];
  recentMismatches: ReconciliationEvent[];
  
  // Close reason breakdown
  closesByReason: Record<string, number>;
  
  // Failed close details
  failedCloseDetails: Array<{
    positionId: string | number;
    symbol: string;
    error: string;
    timestamp: Date;
  }>;
}

class AJ19BLifecycleDiagnostic {
  private static instance: AJ19BLifecycleDiagnostic;
  
  private isEnabled: boolean = false;
  private sessionStart: Date = new Date();
  
  // Event logs
  private openEvents: LifecycleOpenEvent[] = [];
  private monitorEvents: LifecycleMonitorEvent[] = [];
  private closeEvents: LifecycleCloseEvent[] = [];
  private reconciliationEvents: ReconciliationEvent[] = [];
  private slotFreedEvents: SlotFreedEvent[] = [];
  
  // Counters
  private totalOpens: number = 0;
  private totalCloseAttempts: number = 0;
  private successfulCloses: number = 0;
  private failedCloses: number = 0;
  private reconciliationChecks: number = 0;
  private mismatchesDetected: number = 0;
  
  // Config
  private maxEvents: number = 1000;
  
  private constructor() {}
  
  static getInstance(): AJ19BLifecycleDiagnostic {
    if (!AJ19BLifecycleDiagnostic.instance) {
      AJ19BLifecycleDiagnostic.instance = new AJ19BLifecycleDiagnostic();
    }
    return AJ19BLifecycleDiagnostic.instance;
  }
  
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (enabled) {
      this.sessionStart = new Date();
      this.clear();
      console.log(`[AJ19B] Lifecycle Diagnostic ENABLED at ${this.sessionStart.toISOString()}`);
    } else {
      console.log(`[AJ19B] Lifecycle Diagnostic DISABLED`);
    }
  }
  
  isActive(): boolean {
    return this.isEnabled;
  }
  
  /**
   * Log when a trade/position OPENS
   */
  async logOpen(event: Omit<LifecycleOpenEvent, 'timestamp' | 'dbOpenPositionsCount'>, mode: 'live' | 'paper' = 'paper'): Promise<void> {
    if (!this.isEnabled) return;
    
    // Get current DB count using correct mode
    const dbPositions = await storage.getActiveOpenPositions(mode);
    const dbCount = dbPositions.length;
    
    const fullEvent: LifecycleOpenEvent = {
      ...event,
      timestamp: new Date(),
      dbOpenPositionsCount: dbCount,
      mode
    };
    
    this.openEvents.push(fullEvent);
    this.totalOpens++;
    
    // Trim old events
    if (this.openEvents.length > this.maxEvents) {
      this.openEvents = this.openEvents.slice(-this.maxEvents);
    }
    
    console.log(`[AJ19B][OPEN] mode=${mode} | tradeId=${event.tradeId} | positionId=${event.positionId || 'N/A'} | symbol=${event.symbol} | qty=${event.quantity} | notional=$${event.notionalValue.toFixed(2)} | slotsBefore=${event.slotCountBefore} | slotsAfter=${event.slotCountAfter} | dbCount=${dbCount}`);
  }
  
  /**
   * Log monitoring loop status for a position
   */
  logMonitor(event: Omit<LifecycleMonitorEvent, 'timestamp'>): void {
    if (!this.isEnabled) return;
    
    const fullEvent: LifecycleMonitorEvent = {
      ...event,
      timestamp: new Date()
    };
    
    this.monitorEvents.push(fullEvent);
    
    // Trim old events (keep fewer monitor events since they're frequent)
    if (this.monitorEvents.length > 500) {
      this.monitorEvents = this.monitorEvents.slice(-500);
    }
    
    // Only log if a trigger condition is met
    if (event.slTriggered || event.tpTriggered || event.trailingStopTriggered) {
      console.log(`[AJ19B][MONITOR] positionId=${event.positionId} | symbol=${event.symbol} | pnl=$${event.unrealizedPnl.toFixed(2)} | SL=${event.slTriggered} | TP=${event.tpTriggered} | trailing=${event.trailingStopTriggered} | price=${event.currentPrice.toFixed(6)}`);
    }
  }
  
  /**
   * Log when a trade/position CLOSES
   */
  async logClose(event: Omit<LifecycleCloseEvent, 'timestamp' | 'dbOpenPositionsCount'>, mode: 'live' | 'paper' = 'paper'): Promise<void> {
    if (!this.isEnabled) return;
    
    // Get current DB count AFTER the close attempt using correct mode
    const dbPositions = await storage.getActiveOpenPositions(mode);
    const dbCount = dbPositions.length;
    
    const fullEvent: LifecycleCloseEvent = {
      ...event,
      timestamp: new Date(),
      dbOpenPositionsCount: dbCount,
      mode
    };
    
    this.closeEvents.push(fullEvent);
    this.totalCloseAttempts++;
    
    if (event.deleteSuccessful) {
      this.successfulCloses++;
    } else {
      this.failedCloses++;
    }
    
    // Trim old events
    if (this.closeEvents.length > this.maxEvents) {
      this.closeEvents = this.closeEvents.slice(-this.maxEvents);
    }
    
    const status = event.deleteSuccessful ? 'SUCCESS' : 'FAILED';
    console.log(`[AJ19B][CLOSE][${status}] mode=${mode} | positionId=${event.positionId} | symbol=${event.symbol} | reason=${event.closeReason} | pnl=$${event.pnl.toFixed(2)} | slotsBefore=${event.slotCountBefore} | slotsAfter=${event.slotCountAfter} | dbCount=${dbCount}${event.deleteError ? ` | error=${event.deleteError}` : ''}`);
    
    // If delete was successful, log slot freed event
    if (event.deleteSuccessful) {
      this.logSlotFreed({
        positionId: event.positionId,
        symbol: event.symbol,
        slotCountNew: event.slotCountAfter,
        closeReason: event.closeReason
      });
    }
  }
  
  /**
   * Log slot freed event
   */
  private logSlotFreed(event: Omit<SlotFreedEvent, 'timestamp'>): void {
    const fullEvent: SlotFreedEvent = {
      ...event,
      timestamp: new Date()
    };
    
    this.slotFreedEvents.push(fullEvent);
    
    if (this.slotFreedEvents.length > this.maxEvents) {
      this.slotFreedEvents = this.slotFreedEvents.slice(-this.maxEvents);
    }
    
    console.log(`[AJ19B][SLOT_FREED] symbol=${event.symbol} | newSlotCount=${event.slotCountNew} | reason=${event.closeReason}`);
  }
  
  /**
   * Run per-cycle reconciliation check
   * Detects stranded positions from failed deletions AND unlogged/skipped closes
   */
  async runReconciliation(cycleId: string, mode: 'paper' | 'live' = 'paper'): Promise<ReconciliationEvent> {
    // Get DB count
    const dbPositions = await storage.getActiveOpenPositions(mode);
    const dbOpenCount = dbPositions.length;
    const dbPositionIds = new Set(dbPositions.map(p => String(p.id)));
    
    // Compute expected open count based on lifecycle events (since diagnostic was enabled)
    // Expected = (pre-existing positions before diagnostic started) + opens - successful_closes
    // Since we don't know pre-existing count at enable time, we track from opens
    const modeOpens = this.openEvents.filter(e => e.mode === mode).length;
    const modeSuccessfulCloses = this.closeEvents.filter(e => e.mode === mode && e.deleteSuccessful).length;
    const modeFailedCloses = this.closeEvents.filter(e => e.mode === mode && !e.deleteSuccessful).length;
    
    // Baseline: If no opens recorded yet, expected = dbOpenCount (we don't know pre-existing state)
    // Otherwise: expected = opens - successful_closes (ignoring pre-existing for now)
    // The key indicator is: if opens > 0 and dbCount > (opens - successful_closes), we have stranded positions
    let expectedOpenCount: number;
    let deltaCount = 0;
    
    if (modeOpens === 0) {
      // No opens recorded yet, use DB count as expected (we just started tracking)
      expectedOpenCount = dbOpenCount;
    } else {
      // Expected = modeOpens - modeSuccessfulCloses
      // If dbOpenCount > expected, we have stranded positions
      expectedOpenCount = modeOpens - modeSuccessfulCloses;
      deltaCount = dbOpenCount - expectedOpenCount;
    }
    
    // Stranded positions from logged failed closes
    const loggedFailedCloseIds = this.closeEvents
      .filter(e => e.mode === mode && !e.deleteSuccessful)
      .map(e => String(e.positionId));
    
    // If dbOpenCount > expectedOpenCount, find the excess DB positions
    // These are positions that should have been closed but weren't (either failed or skipped/unlogged)
    const loggedOpenPositionIds = new Set(this.openEvents
      .filter(e => e.mode === mode && e.positionId)
      .map(e => String(e.positionId)));
    
    // Find positions in DB that we opened but haven't successfully closed
    // These are potentially stranded (though some may just be legitimately open)
    const unloggedStrandedIds: string[] = [];
    if (deltaCount > 0) {
      // We have more positions in DB than expected
      // The excess could be from unlogged/skipped closes
      for (const posId of dbPositionIds) {
        if (!loggedOpenPositionIds.has(posId)) {
          // Position exists in DB but wasn't opened during this diagnostic session
          // This could be a stranded position from before the diagnostic started
          // Mark as potentially stranded if we're seeing a mismatch
          unloggedStrandedIds.push(posId);
          if (unloggedStrandedIds.length >= deltaCount) break;
        }
      }
    }
    
    // Combine logged failed closes and unlogged stranded
    const strandedPositionIds = [...new Set([...loggedFailedCloseIds, ...unloggedStrandedIds])];
    
    // Guardrail uses the same DB source, so guardrailOpenCount = dbOpenCount
    const guardrailOpenCount = dbOpenCount;
    
    // Mismatch detected if:
    // 1. Any failed deletes (logged stranded positions)
    // 2. Or DB count > expected (unlogged/skipped closes)
    const mismatchDetected = modeFailedCloses > 0 || deltaCount > 0;
    
    const event: ReconciliationEvent = {
      timestamp: new Date(),
      cycleId,
      dbOpenCount,
      guardrailOpenCount,
      mismatchDetected,
      positionIds: dbPositions.map(p => String(p.id)),
      symbols: dbPositions.map(p => p.symbol),
      strandedPositionIds,
      failedDeleteCount: modeFailedCloses,
      mode
    };
    
    // Add diagnostic metadata
    (event as any).diagnosticMeta = {
      modeOpens,
      modeSuccessfulCloses,
      modeFailedCloses,
      expectedOpenCount,
      deltaCount,
      loggedFailedCloseIds: loggedFailedCloseIds.length,
      unloggedStrandedIds: unloggedStrandedIds.length
    };
    
    this.reconciliationEvents.push(event);
    this.reconciliationChecks++;
    
    if (mismatchDetected) {
      this.mismatchesDetected++;
    }
    
    // Trim old events
    if (this.reconciliationEvents.length > 100) {
      this.reconciliationEvents = this.reconciliationEvents.slice(-100);
    }
    
    if (this.isEnabled) {
      const status = mismatchDetected ? 'MISMATCH' : 'OK';
      console.log(`[AJ19B][RECONCILE][${status}] mode=${mode} | cycleId=${cycleId} | dbOpen=${dbOpenCount} | expected=${expectedOpenCount} | delta=${deltaCount} | failedDeletes=${modeFailedCloses} | strandedIds=${strandedPositionIds.slice(0, 3).join(',')}${strandedPositionIds.length > 3 ? '...' : ''}`);
    }
    
    return event;
  }
  
  /**
   * Get summary of lifecycle events
   */
  async getSummary(mode: 'live' | 'paper' = 'paper'): Promise<LifecycleSummary> {
    // Get current DB state for the specified mode
    const dbPositions = await storage.getActiveOpenPositions(mode);
    
    // Build close reason breakdown
    const closesByReason: Record<string, number> = {};
    for (const event of this.closeEvents) {
      closesByReason[event.closeReason] = (closesByReason[event.closeReason] || 0) + 1;
    }
    
    // Get failed close details
    const failedCloseDetails = this.closeEvents
      .filter(e => !e.deleteSuccessful)
      .map(e => ({
        positionId: e.positionId,
        symbol: e.symbol,
        error: e.deleteError || 'Unknown error',
        timestamp: e.timestamp
      }));
    
    return {
      sessionStart: this.sessionStart,
      isEnabled: this.isEnabled,
      
      totalOpens: this.totalOpens,
      totalCloseAttempts: this.totalCloseAttempts,
      successfulCloses: this.successfulCloses,
      failedCloses: this.failedCloses,
      slotsFreed: this.slotFreedEvents.length,
      
      reconciliationChecks: this.reconciliationChecks,
      mismatchesDetected: this.mismatchesDetected,
      
      currentDbOpenCount: dbPositions.length,
      lastReconciliation: this.reconciliationEvents[this.reconciliationEvents.length - 1],
      
      recentOpens: this.openEvents.slice(-20),
      recentCloses: this.closeEvents.slice(-20),
      recentMismatches: this.reconciliationEvents.filter(e => e.mismatchDetected).slice(-10),
      
      closesByReason,
      failedCloseDetails
    };
  }
  
  /**
   * Get all events for export
   */
  exportData(): {
    summary: Omit<LifecycleSummary, 'recentOpens' | 'recentCloses' | 'recentMismatches'>;
    openEvents: LifecycleOpenEvent[];
    closeEvents: LifecycleCloseEvent[];
    reconciliationEvents: ReconciliationEvent[];
    slotFreedEvents: SlotFreedEvent[];
    metadata: {
      exportTime: string;
      isEnabled: boolean;
    };
  } {
    const summary = {
      sessionStart: this.sessionStart,
      isEnabled: this.isEnabled,
      totalOpens: this.totalOpens,
      totalCloseAttempts: this.totalCloseAttempts,
      successfulCloses: this.successfulCloses,
      failedCloses: this.failedCloses,
      slotsFreed: this.slotFreedEvents.length,
      reconciliationChecks: this.reconciliationChecks,
      mismatchesDetected: this.mismatchesDetected,
      currentDbOpenCount: 0, // Will be set async
      closesByReason: {} as Record<string, number>,
      failedCloseDetails: [] as Array<{ positionId: string | number; symbol: string; error: string; timestamp: Date }>
    };
    
    // Build close reason breakdown
    for (const event of this.closeEvents) {
      summary.closesByReason[event.closeReason] = (summary.closesByReason[event.closeReason] || 0) + 1;
    }
    
    // Get failed close details
    summary.failedCloseDetails = this.closeEvents
      .filter(e => !e.deleteSuccessful)
      .map(e => ({
        positionId: e.positionId,
        symbol: e.symbol,
        error: e.deleteError || 'Unknown error',
        timestamp: e.timestamp
      }));
    
    return {
      summary,
      openEvents: this.openEvents,
      closeEvents: this.closeEvents,
      reconciliationEvents: this.reconciliationEvents,
      slotFreedEvents: this.slotFreedEvents,
      metadata: {
        exportTime: new Date().toISOString(),
        isEnabled: this.isEnabled
      }
    };
  }
  
  /**
   * Clear all diagnostic data
   */
  clear(): void {
    this.openEvents = [];
    this.monitorEvents = [];
    this.closeEvents = [];
    this.reconciliationEvents = [];
    this.slotFreedEvents = [];
    
    this.totalOpens = 0;
    this.totalCloseAttempts = 0;
    this.successfulCloses = 0;
    this.failedCloses = 0;
    this.reconciliationChecks = 0;
    this.mismatchesDetected = 0;
    
    this.sessionStart = new Date();
    console.log(`[AJ19B] Diagnostic data cleared`);
  }
}

export const aj19bDiagnostic = AJ19BLifecycleDiagnostic.getInstance();
export default aj19bDiagnostic;
