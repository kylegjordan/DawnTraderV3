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

export interface RtbStats {
  attemptsTotal: number;
  openedTotal: number;
  blockedTotal: number;
  blockedByReason: Record<RtbBlockReason, number>;
  sessionStart: Date;
}

class RtbMetricsService {
  private static instance: RtbMetricsService;

  private stats: RtbStats = {
    attemptsTotal: 0,
    openedTotal: 0,
    blockedTotal: 0,
    blockedByReason: {} as Record<RtbBlockReason, number>,
    sessionStart: new Date(),
  };

  private bySymbol: Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }> = {};
  private byStrategy: Record<string, { attempts: number; opened: number; blocked: number }> = {};

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
    totals: { attempts: number; opened: number; blocked: number };
    byReason: Record<string, number>;
    byStrategy: Record<string, { attempts: number; opened: number; blocked: number }>;
    bySymbol: Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }>;
    invariantCheck: { valid: boolean; message: string };
  } {
    const { attemptsTotal, openedTotal, blockedTotal } = this.stats;
    const expectedTotal = openedTotal + blockedTotal;
    const invariantValid = attemptsTotal === expectedTotal;

    if (!invariantValid) {
      console.error(`[8.8.3-I2][RTB_INVARIANT_VIOLATION] attempts=${attemptsTotal}, opened=${openedTotal}, blocked=${blockedTotal}, expected=${expectedTotal}`);
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
      },
      byReason: { ...this.stats.blockedByReason },
      byStrategy: { ...this.byStrategy },
      bySymbol: { ...this.bySymbol },
      invariantCheck: {
        valid: invariantValid && reasonSum === blockedTotal,
        message: invariantValid && reasonSum === blockedTotal
          ? 'OK: attemptsTotal === openedTotal + blockedTotal && blockedTotal === sum(byReason)'
          : `MISMATCH: attempts=${attemptsTotal}, opened=${openedTotal}, blocked=${blockedTotal}, reasonSum=${reasonSum}`,
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
      sessionStart: new Date(),
    };
    this.initializeBlockReasons();
    this.bySymbol = {};
    this.byStrategy = {};
    console.log(`[8.8.3-I2][RTB_METRICS_RESET] Session reset at ${this.stats.sessionStart.toISOString()}`);
  }
}

export const rtbMetricsService = RtbMetricsService.getInstance();
