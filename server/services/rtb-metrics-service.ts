/**
 * Phase 8.8.3-I2: RTB Metrics Service
 * 
 * Single source of truth for RTB (Ready-To-Buy) statistics.
 * All RTB metrics (top row, breakdown table, I1 diagnostics) read from this service.
 * 
 * This service:
 * - Maintains O(1) counter increments for attempts, opens, blocks
 * - Provides blockedByReason breakdown
 * - Enforces invariant: attemptsTotal === openedTotal + blockedTotal
 * - Is purely in-memory (no DB or file writes in hot path)
 */

export type RtbBlockReason =
  | 'KILL_SWITCH'
  | 'NO_STOP_LOSS'
  | 'INVALID_STOP_LOSS'
  | 'POSITION_LIMIT'
  | 'COOLDOWN'
  | 'MAX_POSITION'
  | 'LPCP_LOW_PRICE'
  | 'LPCP_MIN_NOTIONAL'
  | 'FX_CONVERSION_FAILED'
  | 'PORTFOLIO_RISK'
  | 'INSUFFICIENT_BALANCE'
  | 'MAX_EXPOSURE'
  | 'MAX_TOTAL_EXPOSURE'
  | 'MAX_TRADES'
  | 'ENGINE_STOPPING'
  | 'OTHER';

/**
 * P19-B6.5e: post-guardrail OPEN-stage failure classes. Distinct from a guardrail
 * BLOCK — these fire AFTER all guardrails pass, inside the paper-engine open path
 * (EV gate, sizing, depth-sufficiency gate, fill, dup-guard, trade-insert). Before
 * B6.5e every one of these was a silent bare-`return` invisible to the I3 invariant,
 * which is why a sized crypto signal could vanish (`attempts>0 / opened=0 / blocked=0`).
 */
export type OpenFailStage =
  | 'DRY_RUN'             // AJ19 dry-run-no-guardrails skip (pre-attempt; NOT recorded)
  | 'GUARDRAIL_BLOCK'     // guardrail rejection — return label only; already counted via recordBlock, NOT recorded as openFailed
  | 'EV_REJECT'           // Net-Expectancy gate (11.8B)
  | 'SIZING_INVALID'      // quantity <= 0 / no valid portfolio value
  | 'UNCLASSIFIABLE'      // open/trade asset-class could not be resolved
  | 'DEPTH_GATE'          // 24/5 book-depth-sufficiency gate (no_book/stale/thin/insufficient)
  | 'FILL_REJECTED'       // depth-walked fill rejected / non-filled / zero qty
  | 'DUP_POSITION'        // duplicate-position guard
  | 'TRADE_INSERT_ERROR'  // DB trade/position insert threw
  | 'OTHER';

export interface RtbStats {
  attemptsTotal: number;
  openedTotal: number;
  blockedTotal: number;
  blockedByReason: Record<RtbBlockReason, number>;
  // P19-B6.5e: post-guardrail open-stage failures — the third term that makes the
  // I3 invariant reconcile: attemptsTotal === openedTotal + blockedTotal + openFailedTotal.
  openFailedTotal: number;
  openFailedByStage: Record<OpenFailStage, number>;
  sessionStart: Date;
}

class RtbMetricsService {
  private static instance: RtbMetricsService;

  private stats: RtbStats = {
    attemptsTotal: 0,
    openedTotal: 0,
    blockedTotal: 0,
    blockedByReason: {} as Record<RtbBlockReason, number>,
    openFailedTotal: 0,
    openFailedByStage: {} as Record<OpenFailStage, number>,
    sessionStart: new Date(),
  };

  private bySymbol: Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }> = {};
  private byStrategy: Record<string, { attempts: number; opened: number; blocked: number }> = {};
  
  // Phase 8.8.3-I3: 60-second periodic invariant check
  private invariantCheckInterval: ReturnType<typeof setInterval> | null = null;
  private invariantCheckIntervalMs = 60000; // 60 seconds

  private constructor() {
    this.initializeBlockReasons();
  }

  private initializeBlockReasons(): void {
    const reasons: RtbBlockReason[] = [
      'KILL_SWITCH', 'NO_STOP_LOSS', 'INVALID_STOP_LOSS', 'POSITION_LIMIT',
      'COOLDOWN', 'MAX_POSITION', 'LPCP_LOW_PRICE', 'LPCP_MIN_NOTIONAL',
      'FX_CONVERSION_FAILED', 'PORTFOLIO_RISK', 'INSUFFICIENT_BALANCE',
      'MAX_EXPOSURE', 'MAX_TOTAL_EXPOSURE', 'MAX_TRADES', 'ENGINE_STOPPING', 'OTHER'
    ];
    for (const reason of reasons) {
      this.stats.blockedByReason[reason] = 0;
    }
    // P19-B6.5e: initialize the open-stage failure breakdown
    const stages: OpenFailStage[] = [
      'DRY_RUN', 'EV_REJECT', 'SIZING_INVALID', 'UNCLASSIFIABLE', 'DEPTH_GATE',
      'FILL_REJECTED', 'DUP_POSITION', 'TRADE_INSERT_ERROR', 'OTHER'
    ];
    for (const stage of stages) {
      this.stats.openFailedByStage[stage] = 0;
    }
  }

  static getInstance(): RtbMetricsService {
    if (!RtbMetricsService.instance) {
      RtbMetricsService.instance = new RtbMetricsService();
    }
    return RtbMetricsService.instance;
  }

  /**
   * Record an RTB attempt (signal evaluation started)
   * Call this at the START of guardrail checks
   */
  recordAttempt(symbol: string, strategy: string): void {
    this.stats.attemptsTotal++;

    if (!this.bySymbol[symbol]) {
      this.bySymbol[symbol] = { attempts: 0, opened: 0, blocked: 0, byReason: {} };
    }
    this.bySymbol[symbol].attempts++;

    if (!this.byStrategy[strategy]) {
      this.byStrategy[strategy] = { attempts: 0, opened: 0, blocked: 0 };
    }
    this.byStrategy[strategy].attempts++;
  }

  /**
   * Record a successful trade open
   * Call this when trade is successfully opened
   */
  recordOpen(symbol: string, strategy: string): void {
    this.stats.openedTotal++;

    if (this.bySymbol[symbol]) {
      this.bySymbol[symbol].opened++;
    }

    if (this.byStrategy[strategy]) {
      this.byStrategy[strategy].opened++;
    }
  }

  /**
   * P19-B6.5e: Record a POST-GUARDRAIL open-stage failure (the attempt passed all
   * guardrails but the open path bailed: EV gate, sizing, depth gate, fill, dup-guard,
   * or trade-insert). This is the third term that makes the I3 invariant reconcile —
   * `attempts === opened + blocked + openFailed`. Do NOT call for the pre-attempt
   * DRY_RUN skip (no attempt was recorded for it).
   */
  recordOpenFailed(symbol: string, strategy: string, stage: OpenFailStage, reason: string): void {
    this.stats.openFailedTotal++;
    this.stats.openFailedByStage[stage] = (this.stats.openFailedByStage[stage] || 0) + 1;

    // [8.8.3-I5]-parallel: per-symbol/strategy funnel — count an open-stage failure
    // as a "blocked" in the per-symbol/strategy rollups (which only track attempts/
    // opened/blocked) so those funnels still reconcile; the precise stage lives in
    // openFailedByStage above. The reason string carries the fine detail.
    if (this.bySymbol[symbol]) {
      this.bySymbol[symbol].blocked++;
      this.bySymbol[symbol].byReason[`OPEN_${stage}`] = (this.bySymbol[symbol].byReason[`OPEN_${stage}`] || 0) + 1;
    }
    if (this.byStrategy[strategy]) {
      this.byStrategy[strategy].blocked++;
    }

    console.log(`[8.8.3-I3][OPEN_FAILED] stage=${stage} symbol=${symbol} strategy=${strategy} reason=${reason} timestamp=${Date.now()}`);
  }

  /**
   * Record a blocked RTB attempt with reason
   * Call this when guardrail blocks a trade
   */
  recordBlock(symbol: string, strategy: string, reason: RtbBlockReason | string): void {
    this.stats.blockedTotal++;

    const normalizedReason = this.normalizeBlockReason(reason);
    this.stats.blockedByReason[normalizedReason] = (this.stats.blockedByReason[normalizedReason] || 0) + 1;

    if (this.bySymbol[symbol]) {
      this.bySymbol[symbol].blocked++;
      this.bySymbol[symbol].byReason[normalizedReason] = (this.bySymbol[symbol].byReason[normalizedReason] || 0) + 1;
    }

    if (this.byStrategy[strategy]) {
      this.byStrategy[strategy].blocked++;
    }
    
    // Phase 8.8.3-I5: Diagnostic logging for RTB block recording audit
    console.log(`[8.8.3-I5][RTB_BLOCK] reason=${normalizedReason} symbol=${symbol} strategy=${strategy} timestamp=${Date.now()}`);
    
    // Phase 8.8.3-I5: Store block event in circular buffer for API retrieval
    this.recordBlockEvent(symbol, strategy, normalizedReason);
  }
  
  // Phase 8.8.3-I5: Circular buffer for block events
  private blockEventBuffer: Array<{
    reason: string;
    symbol: string;
    strategy: string;
    timestamp: number;
  }> = [];
  private readonly MAX_BLOCK_EVENTS = 500;
  
  private recordBlockEvent(symbol: string, strategy: string, reason: string): void {
    this.blockEventBuffer.push({
      reason,
      symbol,
      strategy,
      timestamp: Date.now()
    });
    
    // Trim to max size
    if (this.blockEventBuffer.length > this.MAX_BLOCK_EVENTS) {
      this.blockEventBuffer = this.blockEventBuffer.slice(-this.MAX_BLOCK_EVENTS);
    }
  }
  
  /**
   * Phase 8.8.3-I5: Get block event log for diagnostics API
   */
  getBlockEventLog(): Array<{
    reason: string;
    symbol: string;
    strategy: string;
    timestamp: number;
  }> {
    return [...this.blockEventBuffer];
  }

  /**
   * Normalize block reason to known type
   */
  private normalizeBlockReason(reason: string): RtbBlockReason {
    const knownReasons: RtbBlockReason[] = [
      'KILL_SWITCH', 'NO_STOP_LOSS', 'INVALID_STOP_LOSS', 'POSITION_LIMIT',
      'COOLDOWN', 'MAX_POSITION', 'LPCP_LOW_PRICE', 'LPCP_MIN_NOTIONAL',
      'FX_CONVERSION_FAILED', 'PORTFOLIO_RISK', 'INSUFFICIENT_BALANCE',
      'MAX_EXPOSURE', 'MAX_TOTAL_EXPOSURE', 'MAX_TRADES', 'ENGINE_STOPPING'
    ];
    
    if (knownReasons.includes(reason as RtbBlockReason)) {
      return reason as RtbBlockReason;
    }
    return 'OTHER';
  }

  /**
   * Get current RTB stats
   */
  getStats(): RtbStats {
    return { ...this.stats };
  }

  /**
   * Get stats by symbol
   */
  getBySymbol(): Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }> {
    return { ...this.bySymbol };
  }

  /**
   * Get stats by strategy
   */
  getByStrategy(): Record<string, { attempts: number; opened: number; blocked: number }> {
    return { ...this.byStrategy };
  }

  /**
   * Get summary for API response
   */
  getSummary(): {
    timestamp: string;
    sessionStart: string;
    totals: { attempts: number; opened: number; blocked: number; openFailed: number };
    byReason: Record<string, number>;
    openFailedByStage: Record<string, number>;
    byStrategy: Record<string, { attempts: number; opened: number; blocked: number }>;
    bySymbol: Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }>;
    invariantCheck: { valid: boolean; message: string };
  } {
    // P19-B6.5e: invariant is now attemptsTotal === openedTotal + blockedTotal + openFailedTotal
    const { attemptsTotal, openedTotal, blockedTotal, openFailedTotal } = this.stats;
    const expectedTotal = openedTotal + blockedTotal + openFailedTotal;
    const invariantValid = attemptsTotal === expectedTotal;

    if (!invariantValid) {
      console.error(`[8.8.3-I2][RTB_INVARIANT_VIOLATION] attempts=${attemptsTotal}, opened=${openedTotal}, blocked=${blockedTotal}, openFailed=${openFailedTotal}, expected=${expectedTotal}`);
    }

    const reasonSum = Object.values(this.stats.blockedByReason).reduce((a, b) => a + b, 0);
    if (reasonSum !== blockedTotal) {
      console.error(`[8.8.3-I2][RTB_BREAKDOWN_MISMATCH] blockedTotal=${blockedTotal}, reasonSum=${reasonSum}`);
    }

    return {
      timestamp: new Date().toISOString(),
      sessionStart: this.stats.sessionStart.toISOString(),
      totals: {
        attempts: attemptsTotal,
        opened: openedTotal,
        blocked: blockedTotal,
        openFailed: openFailedTotal,
      },
      byReason: { ...this.stats.blockedByReason },
      openFailedByStage: { ...this.stats.openFailedByStage },
      byStrategy: { ...this.byStrategy },
      bySymbol: { ...this.bySymbol },
      invariantCheck: {
        valid: invariantValid && reasonSum === blockedTotal,
        message: invariantValid && reasonSum === blockedTotal
          ? 'OK: attemptsTotal === openedTotal + blockedTotal + openFailedTotal && blockedTotal === sum(byReason)'
          : `MISMATCH: attempts=${attemptsTotal}, opened=${openedTotal}, blocked=${blockedTotal}, openFailed=${openFailedTotal}, reasonSum=${reasonSum}`,
      },
    };
  }

  /**
   * Reset all stats (called on session start)
   */
  reset(): void {
    this.stats = {
      attemptsTotal: 0,
      openedTotal: 0,
      blockedTotal: 0,
      blockedByReason: {} as Record<RtbBlockReason, number>,
      openFailedTotal: 0,
      openFailedByStage: {} as Record<OpenFailStage, number>,
      sessionStart: new Date(),
    };
    this.initializeBlockReasons();
    this.bySymbol = {};
    this.byStrategy = {};
    console.log(`[8.8.3-I2][RTB_METRICS_RESET] Session reset at ${this.stats.sessionStart.toISOString()}`);
  }

  /**
   * Phase 8.8.3-I3: Start 60-second periodic invariant check logging
   * Called when trading engine starts
   */
  startInvariantCheck(): void {
    if (this.invariantCheckInterval) {
      console.log('[8.8.3-I3][INVARIANT_CHECK] Already running, skipping start');
      return;
    }

    console.log('[8.8.3-I3][INVARIANT_CHECK] Starting 60-second periodic invariant check');
    
    this.invariantCheckInterval = setInterval(() => {
      this.logInvariantCheck();
    }, this.invariantCheckIntervalMs);
  }

  /**
   * Phase 8.8.3-I3: Stop periodic invariant check logging
   * Called when trading engine stops
   */
  stopInvariantCheck(): void {
    if (this.invariantCheckInterval) {
      clearInterval(this.invariantCheckInterval);
      this.invariantCheckInterval = null;
      console.log('[8.8.3-I3][INVARIANT_CHECK] Stopped periodic invariant check');
    }
  }

  /**
   * Phase 8.8.3-I3: Log invariant check status
   * Logs every 60 seconds to verify attemptsTotal === openedTotal + blockedTotal
   */
  private logInvariantCheck(): void {
    // P19-B6.5e: invariant now reconciles the post-guardrail open stage too \u2014
    // attemptsTotal === openedTotal + blockedTotal + openFailedTotal. The openFailedByStage
    // breakdown is what names WHERE a sized signal vanished (e.g. DEPTH_GATE) instead of opening.
    const { attemptsTotal, openedTotal, blockedTotal, openFailedTotal, blockedByReason, openFailedByStage } = this.stats;
    const expectedTotal = openedTotal + blockedTotal + openFailedTotal;
    const invariantValid = attemptsTotal === expectedTotal;
    const reasonSum = Object.values(blockedByReason).reduce((a, b) => a + b, 0);
    const stageSum = Object.values(openFailedByStage).reduce((a, b) => a + b, 0);
    const breakdownValid = reasonSum === blockedTotal && stageSum === openFailedTotal;

    const status = invariantValid && breakdownValid ? 'OK' : 'MISMATCH';
    const symbol = invariantValid && breakdownValid ? '\u2713' : '\u2717';

    // Compact non-zero openFailed breakdown for the log line (only when there are any).
    const stageBreakdown = openFailedTotal > 0
      ? ' [' + Object.entries(openFailedByStage).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(',') + ']'
      : '';

    console.log(`[8.8.3-I3][INVARIANT_CHECK][${status}] ${symbol} attempts=${attemptsTotal}, opened=${openedTotal}, blocked=${blockedTotal}, openFailed=${openFailedTotal}${stageBreakdown}, reasonSum=${reasonSum}`);

    if (!invariantValid) {
      console.error(`[8.8.3-I3][INVARIANT_VIOLATION] attemptsTotal(${attemptsTotal}) !== openedTotal(${openedTotal}) + blockedTotal(${blockedTotal}) + openFailedTotal(${openFailedTotal}) = ${expectedTotal}`);
    }

    if (!breakdownValid) {
      console.error(`[8.8.3-I3][BREAKDOWN_MISMATCH] blockedTotal(${blockedTotal}) !== reasonSum(${reasonSum}) OR openFailedTotal(${openFailedTotal}) !== stageSum(${stageSum})`);
      console.error(`[8.8.3-I3][BREAKDOWN_DETAILS]`, { blockedByReason, openFailedByStage });
    }
  }
}

export const rtbMetricsService = RtbMetricsService.getInstance();
