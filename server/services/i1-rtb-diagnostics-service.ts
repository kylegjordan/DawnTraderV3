/**
 * Phase 8.8.3-I1: RTB Block Diagnostics Service
 * 
 * Maintains in-memory counters of RTB attempts and block reasons.
 * This is DIAGNOSTIC ONLY - no behavior changes.
 * 
 * Responsibilities:
 * - Track RTB attempts, opens, and blocks by symbol/strategy/reason
 * - Provide summary statistics via API
 * - Log all events with [8.8.3-I1] prefix
 */

interface RTBAttempt {
  symbol: string;
  strategy: string;
  timestamp: Date;
}

interface RTBBlock {
  symbol: string;
  strategy: string;
  blockReason: string;
  timestamp: Date;
}

interface RTBOpen {
  symbol: string;
  strategy: string;
  tradeId?: string;
  timestamp: Date;
}

interface SymbolStats {
  attempts: number;
  opened: number;
  blocked: number;
  byReason: Record<string, number>;
}

interface I1RTBSummary {
  sessionStart: Date;
  totals: {
    attempts: number;
    opened: number;
    blocked: number;
  };
  byReason: Record<string, number>;
  bySymbol: Record<string, SymbolStats>;
  byStrategy: Record<string, { attempts: number; opened: number; blocked: number }>;
  recentBlocks: Array<{
    symbol: string;
    strategy: string;
    blockReason: string;
    timestamp: string;
  }>;
}

class I1RTBDiagnosticsService {
  private static instance: I1RTBDiagnosticsService;
  
  private sessionStart: Date = new Date();
  private attempts: RTBAttempt[] = [];
  private blocks: RTBBlock[] = [];
  private opens: RTBOpen[] = [];
  
  private totalAttempts = 0;
  private totalOpened = 0;
  private totalBlocked = 0;
  
  private byReason: Record<string, number> = {};
  private bySymbol: Record<string, SymbolStats> = {};
  private byStrategy: Record<string, { attempts: number; opened: number; blocked: number }> = {};
  
  private readonly MAX_RECENT_BLOCKS = 100;
  private readonly MAX_EVENT_HISTORY = 5000;
  
  private constructor() {}
  
  static getInstance(): I1RTBDiagnosticsService {
    if (!I1RTBDiagnosticsService.instance) {
      I1RTBDiagnosticsService.instance = new I1RTBDiagnosticsService();
    }
    return I1RTBDiagnosticsService.instance;
  }
  
  /**
   * Record an RTB attempt (signal evaluation started)
   */
  recordAttempt(symbol: string, strategy: string): void {
    const timestamp = new Date();
    
    this.totalAttempts++;
    
    if (!this.bySymbol[symbol]) {
      this.bySymbol[symbol] = { attempts: 0, opened: 0, blocked: 0, byReason: {} };
    }
    this.bySymbol[symbol].attempts++;
    
    if (!this.byStrategy[strategy]) {
      this.byStrategy[strategy] = { attempts: 0, opened: 0, blocked: 0 };
    }
    this.byStrategy[strategy].attempts++;
    
    this.attempts.push({ symbol, strategy, timestamp });
    if (this.attempts.length > this.MAX_EVENT_HISTORY) {
      this.attempts.shift();
    }
    
    console.log(`[8.8.3-I1][RTB_ATTEMPT] ${JSON.stringify({
      symbol,
      strategy,
      ts: timestamp.toISOString()
    })}`);
  }
  
  /**
   * Record a successful trade open from RTB
   */
  recordOpen(symbol: string, strategy: string, tradeId?: string): void {
    const timestamp = new Date();
    
    this.totalOpened++;
    
    if (!this.bySymbol[symbol]) {
      this.bySymbol[symbol] = { attempts: 0, opened: 0, blocked: 0, byReason: {} };
    }
    this.bySymbol[symbol].opened++;
    
    if (!this.byStrategy[strategy]) {
      this.byStrategy[strategy] = { attempts: 0, opened: 0, blocked: 0 };
    }
    this.byStrategy[strategy].opened++;
    
    this.opens.push({ symbol, strategy, tradeId, timestamp });
    if (this.opens.length > this.MAX_EVENT_HISTORY) {
      this.opens.shift();
    }
    
    console.log(`[8.8.3-I1][RTB_OPEN] ${JSON.stringify({
      symbol,
      strategy,
      tradeId,
      ts: timestamp.toISOString()
    })}`);
  }
  
  /**
   * Record a blocked RTB attempt with reason
   */
  recordBlock(symbol: string, strategy: string, blockReason: string): void {
    const timestamp = new Date();
    
    this.totalBlocked++;
    
    if (!this.byReason[blockReason]) {
      this.byReason[blockReason] = 0;
    }
    this.byReason[blockReason]++;
    
    if (!this.bySymbol[symbol]) {
      this.bySymbol[symbol] = { attempts: 0, opened: 0, blocked: 0, byReason: {} };
    }
    this.bySymbol[symbol].blocked++;
    if (!this.bySymbol[symbol].byReason[blockReason]) {
      this.bySymbol[symbol].byReason[blockReason] = 0;
    }
    this.bySymbol[symbol].byReason[blockReason]++;
    
    if (!this.byStrategy[strategy]) {
      this.byStrategy[strategy] = { attempts: 0, opened: 0, blocked: 0 };
    }
    this.byStrategy[strategy].blocked++;
    
    this.blocks.push({ symbol, strategy, blockReason, timestamp });
    if (this.blocks.length > this.MAX_EVENT_HISTORY) {
      this.blocks.shift();
    }
    
    console.log(`[8.8.3-I1][RTB_BLOCK] ${JSON.stringify({
      symbol,
      strategy,
      blockReason,
      ts: timestamp.toISOString()
    })}`);
  }
  
  /**
   * Get aggregated summary statistics
   */
  getSummary(): I1RTBSummary {
    const recentBlocks = this.blocks
      .slice(-this.MAX_RECENT_BLOCKS)
      .reverse()
      .map(b => ({
        symbol: b.symbol,
        strategy: b.strategy,
        blockReason: b.blockReason,
        timestamp: b.timestamp.toISOString()
      }));
    
    return {
      sessionStart: this.sessionStart,
      totals: {
        attempts: this.totalAttempts,
        opened: this.totalOpened,
        blocked: this.totalBlocked
      },
      byReason: { ...this.byReason },
      bySymbol: { ...this.bySymbol },
      byStrategy: { ...this.byStrategy },
      recentBlocks
    };
  }
  
  /**
   * Clear all counters and reset session
   */
  clear(): void {
    this.sessionStart = new Date();
    this.attempts = [];
    this.blocks = [];
    this.opens = [];
    this.totalAttempts = 0;
    this.totalOpened = 0;
    this.totalBlocked = 0;
    this.byReason = {};
    this.bySymbol = {};
    this.byStrategy = {};
    
    console.log(`[8.8.3-I1][RTB_DIAGNOSTICS_CLEARED] Session reset at ${this.sessionStart.toISOString()}`);
  }
}

export const i1RtbDiagnostics = I1RTBDiagnosticsService.getInstance();
