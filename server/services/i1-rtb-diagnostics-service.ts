/**
 * Phase 8.8.3-I1: RTB Block Diagnostics Service
 * 
 * UPDATED in Phase 8.8.3-I2:
 * - No longer maintains its own counters
 * - Reads aggregated stats from RtbMetricsService.getSummary() (single source of truth)
 * - Only stores per-event logs (samples) in circular buffers
 * 
 * Responsibilities:
 * - Store recent RTB events (attempts, opens, blocks) with timestamps
 * - Provide detailed event history via API
 * - Log all events with [8.8.3-I1] prefix
 * - Read summary statistics from RtbMetricsService
 */

import { rtbMetricsService } from './rtb-metrics-service.js';

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

interface I1RTBSummary {
  sessionStart: Date;
  totals: {
    attempts: number;
    opened: number;
    blocked: number;
  };
  byReason: Record<string, number>;
  bySymbol: Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }>;
  byStrategy: Record<string, { attempts: number; opened: number; blocked: number }>;
  recentBlocks: Array<{
    symbol: string;
    strategy: string;
    blockReason: string;
    timestamp: string;
  }>;
  recentAttempts: Array<{
    symbol: string;
    strategy: string;
    timestamp: string;
  }>;
  recentOpens: Array<{
    symbol: string;
    strategy: string;
    tradeId?: string;
    timestamp: string;
  }>;
}

class I1RTBDiagnosticsService {
  private static instance: I1RTBDiagnosticsService;
  
  // Phase 8.8.3-I2: Only store event samples, not counters
  private attempts: RTBAttempt[] = [];
  private blocks: RTBBlock[] = [];
  private opens: RTBOpen[] = [];
  
  private readonly MAX_RECENT_EVENTS = 100;
  private readonly MAX_EVENT_HISTORY = 300; // Per-buffer limit (3 buffers x 300 = 900 max combined)
  
  private constructor() {}
  
  static getInstance(): I1RTBDiagnosticsService {
    if (!I1RTBDiagnosticsService.instance) {
      I1RTBDiagnosticsService.instance = new I1RTBDiagnosticsService();
    }
    return I1RTBDiagnosticsService.instance;
  }
  
  /**
   * Record an RTB attempt (signal evaluation started)
   * Phase 8.8.3-I2: Only logs and stores event sample - counters are in RtbMetricsService
   */
  recordAttempt(symbol: string, strategy: string): void {
    const timestamp = new Date();
    
    // Store event sample only - counters are managed by RtbMetricsService
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
   * Phase 8.8.3-I2: Only logs and stores event sample - counters are in RtbMetricsService
   */
  recordOpen(symbol: string, strategy: string, tradeId?: string): void {
    const timestamp = new Date();
    
    // Store event sample only - counters are managed by RtbMetricsService
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
   * Phase 8.8.3-I2: Only logs and stores event sample - counters are in RtbMetricsService
   */
  recordBlock(symbol: string, strategy: string, blockReason: string): void {
    const timestamp = new Date();
    
    // Store event sample only - counters are managed by RtbMetricsService
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
   * Phase 8.8.3-I2: Now reads from RtbMetricsService for counters, adds local event samples
   */
  getSummary(): I1RTBSummary {
    // Get authoritative stats from RtbMetricsService (single source of truth)
    const rtbSummary = rtbMetricsService.getSummary();
    
    // Get recent event samples from local buffers
    const recentBlocks = this.blocks
      .slice(-this.MAX_RECENT_EVENTS)
      .reverse()
      .map(b => ({
        symbol: b.symbol,
        strategy: b.strategy,
        blockReason: b.blockReason,
        timestamp: b.timestamp.toISOString()
      }));
    
    const recentAttempts = this.attempts
      .slice(-this.MAX_RECENT_EVENTS)
      .reverse()
      .map(a => ({
        symbol: a.symbol,
        strategy: a.strategy,
        timestamp: a.timestamp.toISOString()
      }));
    
    const recentOpens = this.opens
      .slice(-this.MAX_RECENT_EVENTS)
      .reverse()
      .map(o => ({
        symbol: o.symbol,
        strategy: o.strategy,
        tradeId: o.tradeId,
        timestamp: o.timestamp.toISOString()
      }));
    
    // Parse session start from RtbMetricsService
    const sessionStart = new Date(rtbSummary.sessionStart);
    
    return {
      sessionStart,
      totals: rtbSummary.totals,
      byReason: rtbSummary.byReason,
      bySymbol: rtbSummary.bySymbol,
      byStrategy: rtbSummary.byStrategy,
      recentBlocks,
      recentAttempts,
      recentOpens
    };
  }
  
  /**
   * Clear event buffers (session reset)
   * Phase 8.8.3-I2: Also clears RtbMetricsService
   */
  clear(): void {
    this.attempts = [];
    this.blocks = [];
    this.opens = [];
    
    // Also reset the central metrics service
    rtbMetricsService.reset();
    
    console.log(`[8.8.3-I1][RTB_DIAGNOSTICS_CLEARED] Session reset at ${new Date().toISOString()}`);
  }
  
  /**
   * Get buffer sizes for memory diagnostics
   */
  getBufferSizes(): { attempts: number; blocks: number; opens: number } {
    return {
      attempts: this.attempts.length,
      blocks: this.blocks.length,
      opens: this.opens.length
    };
  }
}

export const i1RtbDiagnostics = I1RTBDiagnosticsService.getInstance();
