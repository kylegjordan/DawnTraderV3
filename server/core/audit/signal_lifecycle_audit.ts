/**
 * Phase 8.8.4-A: Signal Lifecycle Audit Layer (SLAL)
 * 
 * Instruments every stage of the trading-signal lifecycle:
 * 
 * 1. GENERATION: StrategyEngine produces raw signals
 * 2. SIZING: SignalOrchestrator sizes the signal (qty, notional)
 * 3. VALIDATION: Guardrails/TradeSafety check risk limits
 * 4. EXECUTION: TradingEngine executes (or rejects) the trade
 * 
 * This service provides observability into signal flow for debugging,
 * performance analysis, and system auditing.
 */

export type SignalStage = 
  | 'GENERATION'      // Strategy produced a raw signal
  | 'SIZING'          // Signal sized with qty/notional
  | 'VALIDATION'      // Guardrails check
  | 'QUEUED'          // Phase 8.8.4-B: Signal queued (high FinalScore)
  | 'PROMOTED'        // Phase 8.8.4-B: Signal promoted from queue to execution
  | 'EXECUTION'       // Trade execution attempt
  | 'COMPLETED'       // Trade successfully opened
  | 'REJECTED';       // Signal rejected at any stage

export type RejectionReason =
  | 'INVALID_SIGNAL'          // Malformed signal (missing fields)
  | 'ZERO_SIZE'               // Sizing returned 0 qty
  | 'GUARDRAIL_BLOCKED'       // Risk guardrail rejected
  | 'MAX_POSITIONS'           // Max open positions reached (legacy alias for MAX_TRADES)
  | 'MAX_TRADES'              // Max simultaneous open trades limit reached
  | 'SLOT_CONFLICT'           // Post-guardrail: trade rejected due to slot capacity overflow
  | 'DAILY_LOSS_LIMIT'        // Daily loss kill switch triggered
  | 'SYMBOL_COOLDOWN'         // Symbol on cooldown
  | 'POSITION_CAP'            // Position size cap exceeded
  | 'DUPLICATE_POSITION'      // Already have position in symbol
  | 'EXECUTION_FAILED'        // Trade execution failed
  | 'EXPIRED_SIGNAL'          // Signal TTL expired
  | 'NO_PRICE'                // Could not get reliable price
  | 'SQE_QUALITY_REJECT'      // Phase 8.8.4-B.1: Signal failed SQE quality thresholds
  | 'PER_UNDERLYING_CAP'      // B67.3: simultaneous-open-trades-per-base-currency cap reached
  | 'OTHER';                  // Other reason

export interface SignalLifecycleEvent {
  id: string;
  timestamp: Date;
  mode: 'live' | 'paper';
  symbol: string;
  strategy: string;
  stage: SignalStage;
  success: boolean;
  rejectionReason?: RejectionReason;
  details?: Record<string, unknown>;
  durationMs?: number;
}

export interface SignalJourney {
  signalId: string;
  mode: 'live' | 'paper';
  symbol: string;
  strategy: string;
  startedAt: Date;
  completedAt?: Date;
  finalStage: SignalStage;
  success: boolean;
  rejectionReason?: RejectionReason;
  events: SignalLifecycleEvent[];
  totalDurationMs?: number;
}

export interface SLALMetrics {
  mode: 'live' | 'paper';
  since: Date;
  signalsGenerated: number;
  signalsSized: number;
  signalsValidated: number;
  signalsExecuted: number;
  signalsCompleted: number;
  signalsRejected: number;
  rejectionsByReason: Record<RejectionReason, number>;
  rejectionsByStage: Record<SignalStage, number>;
  avgGenerationToCompletionMs: number;
  successRate: number;
  strategyBreakdown: Record<string, {
    generated: number;
    completed: number;
    rejected: number;
    successRate: number;
  }>;
}

class SignalLifecycleAuditService {
  private journeys: Map<string, SignalJourney> = new Map();
  private events: SignalLifecycleEvent[] = [];
  private sessionStart: Date = new Date();
  
  private readonly MAX_EVENTS = 10000;
  private readonly MAX_JOURNEYS = 5000;
  private readonly JOURNEY_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor() {
    console.log('[SLAL] Signal Lifecycle Audit Layer initialized');
  }

  /**
   * Generate a unique signal ID for tracking
   */
  generateSignalId(symbol: string, strategy: string): string {
    return `${symbol}-${strategy}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Record a signal generation event (Stage 1)
   */
  recordGeneration(
    signalId: string,
    mode: 'live' | 'paper',
    symbol: string,
    strategy: string,
    details?: Record<string, unknown>
  ): void {
    const event: SignalLifecycleEvent = {
      id: `${signalId}-GENERATION`,
      timestamp: new Date(),
      mode,
      symbol,
      strategy,
      stage: 'GENERATION',
      success: true,
      details,
    };

    this.addEvent(event);
    this.initJourney(signalId, mode, symbol, strategy);
    this.addEventToJourney(signalId, event);

    console.log(`[SLAL][${mode}] GENERATION: ${symbol}/${strategy} (${signalId})`);
  }

  /**
   * Record a signal sizing event (Stage 2)
   */
  recordSizing(
    signalId: string,
    mode: 'live' | 'paper',
    symbol: string,
    strategy: string,
    success: boolean,
    details?: Record<string, unknown>,
    rejectionReason?: RejectionReason
  ): void {
    const journey = this.journeys.get(signalId);
    const durationMs = journey ? Date.now() - journey.startedAt.getTime() : undefined;

    const event: SignalLifecycleEvent = {
      id: `${signalId}-SIZING`,
      timestamp: new Date(),
      mode,
      symbol,
      strategy,
      stage: 'SIZING',
      success,
      rejectionReason: success ? undefined : (rejectionReason || 'ZERO_SIZE'),
      details,
      durationMs,
    };

    this.addEvent(event);
    this.addEventToJourney(signalId, event);

    if (!success) {
      this.completeJourney(signalId, 'SIZING', false, rejectionReason || 'ZERO_SIZE');
    }

    console.log(`[SLAL][${mode}] SIZING: ${symbol}/${strategy} success=${success} (${signalId})`);
  }

  /**
   * Record a signal validation event (Stage 3 - Guardrails)
   */
  recordValidation(
    signalId: string,
    mode: 'live' | 'paper',
    symbol: string,
    strategy: string,
    success: boolean,
    details?: Record<string, unknown>,
    rejectionReason?: RejectionReason
  ): void {
    const journey = this.journeys.get(signalId);
    const durationMs = journey ? Date.now() - journey.startedAt.getTime() : undefined;

    const event: SignalLifecycleEvent = {
      id: `${signalId}-VALIDATION`,
      timestamp: new Date(),
      mode,
      symbol,
      strategy,
      stage: 'VALIDATION',
      success,
      rejectionReason: success ? undefined : (rejectionReason || 'GUARDRAIL_BLOCKED'),
      details,
      durationMs,
    };

    this.addEvent(event);
    this.addEventToJourney(signalId, event);

    if (!success) {
      this.completeJourney(signalId, 'VALIDATION', false, rejectionReason || 'GUARDRAIL_BLOCKED');
    }

    console.log(`[SLAL][${mode}] VALIDATION: ${symbol}/${strategy} success=${success} reason=${rejectionReason || 'N/A'} (${signalId})`);
  }

  /**
   * Record a signal execution attempt (Stage 4)
   * For successful trades, this emits EXECUTION event followed by COMPLETED event
   * to ensure full lifecycle tracking and correct metrics
   */
  recordExecution(
    signalId: string,
    mode: 'live' | 'paper',
    symbol: string,
    strategy: string,
    success: boolean,
    details?: Record<string, unknown>,
    rejectionReason?: RejectionReason
  ): void {
    const journey = this.journeys.get(signalId);
    const durationMs = journey ? Date.now() - journey.startedAt.getTime() : undefined;

    // Always emit EXECUTION stage event first
    const executionEvent: SignalLifecycleEvent = {
      id: `${signalId}-EXECUTION`,
      timestamp: new Date(),
      mode,
      symbol,
      strategy,
      stage: 'EXECUTION',
      success,
      rejectionReason: success ? undefined : (rejectionReason || 'EXECUTION_FAILED'),
      details,
      durationMs,
    };

    this.addEvent(executionEvent);
    this.addEventToJourney(signalId, executionEvent);

    console.log(`[SLAL][${mode}] EXECUTION: ${symbol}/${strategy} success=${success} (${signalId})`);

    if (success) {
      // For successful trades, also emit COMPLETED event
      const completedDurationMs = journey ? Date.now() - journey.startedAt.getTime() : undefined;
      
      const completedEvent: SignalLifecycleEvent = {
        id: `${signalId}-COMPLETED`,
        timestamp: new Date(),
        mode,
        symbol,
        strategy,
        stage: 'COMPLETED',
        success: true,
        details,
        durationMs: completedDurationMs,
      };

      this.addEvent(completedEvent);
      this.addEventToJourney(signalId, completedEvent);
      this.completeJourney(signalId, 'COMPLETED', true);

      console.log(`[SLAL][${mode}] COMPLETED: ${symbol}/${strategy} (${signalId})`);
    } else {
      // For failed trades, complete journey at EXECUTION stage
      this.completeJourney(signalId, 'EXECUTION', false, rejectionReason || 'EXECUTION_FAILED');
    }
  }

  /**
   * Phase 8.8.4-B: Record a signal being queued
   */
  recordQueued(
    signalId: string,
    mode: 'live' | 'paper',
    symbol: string,
    strategy: string,
    details?: Record<string, unknown>
  ): void {
    const journey = this.journeys.get(signalId);
    const durationMs = journey ? Date.now() - journey.startedAt.getTime() : undefined;

    const event: SignalLifecycleEvent = {
      id: `${signalId}-QUEUED`,
      timestamp: new Date(),
      mode,
      symbol,
      strategy,
      stage: 'QUEUED',
      success: true,
      details,
      durationMs,
    };

    this.addEvent(event);
    this.addEventToJourney(signalId, event);

    console.log(`[SLAL][${mode}] QUEUED: ${symbol}/${strategy} finalScore=${(details as any)?.finalScore?.toFixed(4) || 'N/A'} (${signalId})`);
  }

  /**
   * Phase 8.8.4-B: Record a signal being promoted from queue to execution
   */
  recordPromoted(
    signalId: string,
    mode: 'live' | 'paper',
    symbol: string,
    strategy: string,
    details?: Record<string, unknown>
  ): void {
    const journey = this.journeys.get(signalId);
    const durationMs = journey ? Date.now() - journey.startedAt.getTime() : undefined;

    const event: SignalLifecycleEvent = {
      id: `${signalId}-PROMOTED`,
      timestamp: new Date(),
      mode,
      symbol,
      strategy,
      stage: 'PROMOTED',
      success: true,
      details,
      durationMs,
    };

    this.addEvent(event);
    this.addEventToJourney(signalId, event);

    console.log(`[SLAL][${mode}] PROMOTED: ${symbol}/${strategy} tradeId=${(details as any)?.tradeId || 'N/A'} queueMs=${(details as any)?.queueDurationMs || 'N/A'} (${signalId})`);
  }

  /**
   * Record a signal rejection at any stage
   */
  recordRejection(
    signalId: string,
    mode: 'live' | 'paper',
    symbol: string,
    strategy: string,
    stage: SignalStage,
    reason: RejectionReason,
    details?: Record<string, unknown>
  ): void {
    const journey = this.journeys.get(signalId);
    const durationMs = journey ? Date.now() - journey.startedAt.getTime() : undefined;

    const event: SignalLifecycleEvent = {
      id: `${signalId}-REJECTED`,
      timestamp: new Date(),
      mode,
      symbol,
      strategy,
      stage: 'REJECTED',
      success: false,
      rejectionReason: reason,
      details: { ...details, rejectedAtStage: stage },
      durationMs,
    };

    this.addEvent(event);
    this.addEventToJourney(signalId, event);
    this.completeJourney(signalId, stage, false, reason);

    console.log(`[SLAL][${mode}] REJECTED: ${symbol}/${strategy} at ${stage} reason=${reason} (${signalId})`);
  }

  /**
   * Get metrics for the current session
   */
  getMetrics(mode: 'live' | 'paper'): SLALMetrics {
    const modeEvents = this.events.filter(e => e.mode === mode);
    const modeJourneys = Array.from(this.journeys.values()).filter(j => j.mode === mode);

    const rejectionsByReason: Record<RejectionReason, number> = {
      INVALID_SIGNAL: 0,
      ZERO_SIZE: 0,
      GUARDRAIL_BLOCKED: 0,
      MAX_POSITIONS: 0,
      MAX_TRADES: 0,
      SLOT_CONFLICT: 0,
      DAILY_LOSS_LIMIT: 0,
      SYMBOL_COOLDOWN: 0,
      POSITION_CAP: 0,
      DUPLICATE_POSITION: 0,
      EXECUTION_FAILED: 0,
      EXPIRED_SIGNAL: 0,
      NO_PRICE: 0,
      SQE_QUALITY_REJECT: 0,
      // B-NEW-43 chunk 10 (2026-05-23): PER_UNDERLYING_CAP is in the
      // RejectionReason union but was missing from this initializer
      // (Record<RejectionReason, number> required all keys). Added 0
      // default; the lifecycle audit didn't crash because no rejection
      // event currently carries this reason value, but the Record-type
      // contract was unsatisfied.
      PER_UNDERLYING_CAP: 0,
      OTHER: 0,
    };

    const rejectionsByStage: Record<SignalStage, number> = {
      GENERATION: 0,
      SIZING: 0,
      VALIDATION: 0,
      QUEUED: 0,
      PROMOTED: 0,
      EXECUTION: 0,
      COMPLETED: 0,
      REJECTED: 0,
    };

    const strategyBreakdown: Record<string, {
      generated: number;
      completed: number;
      rejected: number;
      successRate: number;
    }> = {};

    let signalsGenerated = 0;
    let signalsSized = 0;
    let signalsValidated = 0;
    let signalsExecuted = 0;
    let signalsCompleted = 0;
    let signalsRejected = 0;
    let totalCompletionTime = 0;
    let completedCount = 0;

    for (const event of modeEvents) {
      if (event.stage === 'GENERATION') signalsGenerated++;
      if (event.stage === 'SIZING' && event.success) signalsSized++;
      if (event.stage === 'VALIDATION' && event.success) signalsValidated++;
      if (event.stage === 'EXECUTION' && event.success) signalsExecuted++;
      if (event.stage === 'COMPLETED') {
        signalsCompleted++;
        if (event.durationMs) {
          totalCompletionTime += event.durationMs;
          completedCount++;
        }
      }
      if (!event.success && event.rejectionReason) {
        signalsRejected++;
        rejectionsByReason[event.rejectionReason]++;
        rejectionsByStage[event.stage]++;
      }
    }

    for (const journey of modeJourneys) {
      const strategy = journey.strategy;
      if (!strategyBreakdown[strategy]) {
        strategyBreakdown[strategy] = { generated: 0, completed: 0, rejected: 0, successRate: 0 };
      }
      strategyBreakdown[strategy].generated++;
      if (journey.success) {
        strategyBreakdown[strategy].completed++;
      } else {
        strategyBreakdown[strategy].rejected++;
      }
    }

    for (const strategy of Object.keys(strategyBreakdown)) {
      const stats = strategyBreakdown[strategy];
      stats.successRate = stats.generated > 0 ? (stats.completed / stats.generated) * 100 : 0;
    }

    const successRate = signalsGenerated > 0 ? (signalsCompleted / signalsGenerated) * 100 : 0;
    const avgGenerationToCompletionMs = completedCount > 0 ? totalCompletionTime / completedCount : 0;

    return {
      mode,
      since: this.sessionStart,
      signalsGenerated,
      signalsSized,
      signalsValidated,
      signalsExecuted,
      signalsCompleted,
      signalsRejected,
      rejectionsByReason,
      rejectionsByStage,
      avgGenerationToCompletionMs,
      successRate,
      strategyBreakdown,
    };
  }

  /**
   * Get recent journeys for debugging
   */
  getRecentJourneys(mode: 'live' | 'paper', limit: number = 50): SignalJourney[] {
    return Array.from(this.journeys.values())
      .filter(j => j.mode === mode)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get recent events for debugging
   */
  getRecentEvents(mode: 'live' | 'paper', limit: number = 100): SignalLifecycleEvent[] {
    return this.events
      .filter(e => e.mode === mode)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get journey by signal ID
   */
  getJourney(signalId: string): SignalJourney | undefined {
    return this.journeys.get(signalId);
  }

  /**
   * Reset session (for hard reset flow)
   */
  resetSession(): void {
    console.log('[SLAL] Resetting session');
    this.journeys.clear();
    this.events = [];
    this.sessionStart = new Date();
  }

  /**
   * Prune old data to prevent memory leaks
   */
  private prune(): void {
    const now = Date.now();
    
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }

    if (this.journeys.size > this.MAX_JOURNEYS) {
      const sortedJourneys = Array.from(this.journeys.entries())
        .sort((a, b) => b[1].startedAt.getTime() - a[1].startedAt.getTime());
      
      this.journeys = new Map(sortedJourneys.slice(0, this.MAX_JOURNEYS));
    }

    for (const [id, journey] of this.journeys.entries()) {
      if (now - journey.startedAt.getTime() > this.JOURNEY_TTL_MS && journey.completedAt) {
        this.journeys.delete(id);
      }
    }
  }

  private addEvent(event: SignalLifecycleEvent): void {
    this.events.push(event);
    if (this.events.length > this.MAX_EVENTS * 1.1) {
      this.prune();
    }
  }

  private initJourney(signalId: string, mode: 'live' | 'paper', symbol: string, strategy: string): void {
    if (this.journeys.has(signalId)) return;

    this.journeys.set(signalId, {
      signalId,
      mode,
      symbol,
      strategy,
      startedAt: new Date(),
      finalStage: 'GENERATION',
      success: false,
      events: [],
    });

    if (this.journeys.size > this.MAX_JOURNEYS * 1.1) {
      this.prune();
    }
  }

  private addEventToJourney(signalId: string, event: SignalLifecycleEvent): void {
    const journey = this.journeys.get(signalId);
    if (journey) {
      journey.events.push(event);
      journey.finalStage = event.stage;
    }
  }

  private completeJourney(
    signalId: string,
    finalStage: SignalStage,
    success: boolean,
    rejectionReason?: RejectionReason
  ): void {
    const journey = this.journeys.get(signalId);
    if (journey) {
      journey.completedAt = new Date();
      journey.finalStage = finalStage;
      journey.success = success;
      journey.rejectionReason = rejectionReason;
      journey.totalDurationMs = journey.completedAt.getTime() - journey.startedAt.getTime();
    }
  }
}

export const signalLifecycleAudit = new SignalLifecycleAuditService();
