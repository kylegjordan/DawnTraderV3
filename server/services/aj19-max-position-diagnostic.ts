/**
 * Phase 8.8.3-AJ19: Max Position Guardrail Diagnostic Service
 * 
 * Investigates why MAX_POSITION guardrail is blocking 99%+ of RTB signals
 * after trades start opening.
 * 
 * Key diagnostic areas:
 * 1. Position sizing calculation at P2 vs P3 validation
 * 2. Portfolio value consistency across pipeline stages
 * 3. Max position percent setting application
 * 4. Dry-run mode to test with guardrail disabled
 * 
 * Block Reason Clarification:
 * - MAX_POSITION (checkPositionSizeCap): Position size % of portfolio exceeds limit
 * - MAX_TRADES (checkMaxOpenTrades): Total count of open trades >= maxOpenTrades
 * - POSITION_LIMIT (checkMaxPositionsPerAsset): Already have position in same symbol
 */

import * as fs from 'fs';
import * as path from 'path';

export interface MaxPositionDiagnosticEntry {
  timestamp: Date;
  cycleId: string;
  symbol: string;
  strategy: string;
  
  // P2 Sizing Values (from active-position-sizing)
  p2PortfolioValue?: number;
  p2RiskPerTradePct?: number;
  p2RiskAmount?: number;
  p2StopDistance?: number;
  p2Quantity?: number;
  p2Notional?: number;
  p2SizingSource?: string;
  
  // P3 Guardrail Values (from trade-safety)
  p3PortfolioValue?: number;
  p3MaxPositionPct?: number;
  p3MaxPositionValue?: number;
  p3PositionValue?: number;
  p3PositionPct?: number;
  p3SizingSource?: string;
  
  // Result
  p3Result: 'PASS' | 'BLOCK_MAX_POSITION' | 'BLOCK_OTHER';
  p3BlockReason?: string;
  
  // Diagnostic flags
  portfolioValueMismatch: boolean;
  preComputedNotionalMissing: boolean;
  wouldPassWithoutCheck: boolean;
}

export interface MaxPositionDiagnosticSummary {
  sessionStart: Date;
  totalChecks: number;
  passed: number;
  blockedMaxPosition: number;
  blockedOther: number;
  
  // Diagnostic insights
  portfolioValueMismatches: number;
  preComputedMissing: number;
  wouldPassIfDisabled: number;
  
  // Value ranges observed
  portfolioValueRange: { min: number; max: number };
  positionPctRange: { min: number; max: number };
  maxPositionPctUsed: number;
  
  // Strategy breakdown
  byStrategy: Record<string, { passed: number; blocked: number }>;
  
  // Sample blocked entries (most recent 20)
  recentBlocked: MaxPositionDiagnosticEntry[];
}

/**
 * Would-be trade entry for dryRunNoGuardrails mode
 */
export interface WouldBeTradeEntry {
  timestamp: Date;
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  estimatedValue?: number;
  quantity?: number;
  portfolioValue?: number;
  mode: 'paper' | 'live';
  reason: string; // Why this would have been a trade
}

class AJ19MaxPositionDiagnostic {
  private static instance: AJ19MaxPositionDiagnostic;
  
  private entries: MaxPositionDiagnosticEntry[] = [];
  private sessionStart: Date = new Date();
  private isEnabled: boolean = false;
  private dryRunMode: boolean = false;
  
  // New: dryRunNoGuardrails mode - skip trade creation AND guardrails
  private dryRunNoGuardrails: boolean = false;
  private wouldBeTrades: WouldBeTradeEntry[] = [];
  private signalsGenerated: number = 0;
  private dryRunSessionStart: Date | null = null;
  
  private maxEntries = 5000; // Keep last 5000 entries
  
  private constructor() {}
  
  static getInstance(): AJ19MaxPositionDiagnostic {
    if (!AJ19MaxPositionDiagnostic.instance) {
      AJ19MaxPositionDiagnostic.instance = new AJ19MaxPositionDiagnostic();
    }
    return AJ19MaxPositionDiagnostic.instance;
  }
  
  /**
   * Enable/disable diagnostic logging
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (enabled) {
      this.sessionStart = new Date();
      this.entries = [];
      console.log(`[AJ19] Max Position Diagnostic ENABLED at ${this.sessionStart.toISOString()}`);
    } else {
      console.log(`[AJ19] Max Position Diagnostic DISABLED`);
    }
  }
  
  isActive(): boolean {
    return this.isEnabled;
  }
  
  /**
   * Enable dry-run mode where MAX_POSITION checks are logged but don't block
   * This helps test if disabling the check would allow signals through
   */
  setDryRunMode(enabled: boolean): void {
    this.dryRunMode = enabled;
    console.log(`[AJ19] Dry-run mode ${enabled ? 'ENABLED' : 'DISABLED'} - MAX_POSITION will ${enabled ? 'log but not block' : 'block normally'}`);
  }
  
  isDryRunMode(): boolean {
    return this.dryRunMode;
  }
  
  /**
   * Enable dryRunNoGuardrails mode:
   * - Runs filters + strategies normally
   * - Logs signals and would-be trades
   * - Skips creating trades / open positions
   * - Skips all guardrail checks
   * 
   * Purpose: Test if RTB signals continue generating when no trades are opened
   */
  setDryRunNoGuardrails(enabled: boolean): void {
    this.dryRunNoGuardrails = enabled;
    if (enabled) {
      this.wouldBeTrades = [];
      this.signalsGenerated = 0;
      this.dryRunSessionStart = new Date();
      console.log(`[AJ19][DRY_RUN_NO_GUARDRAILS] ENABLED at ${this.dryRunSessionStart.toISOString()}`);
      console.log(`[AJ19][DRY_RUN_NO_GUARDRAILS] Filters + strategies will run normally`);
      console.log(`[AJ19][DRY_RUN_NO_GUARDRAILS] Signals will be logged but NO trades will be created`);
      console.log(`[AJ19][DRY_RUN_NO_GUARDRAILS] ALL guardrail checks will be SKIPPED`);
    } else {
      console.log(`[AJ19][DRY_RUN_NO_GUARDRAILS] DISABLED - normal trade execution will resume`);
    }
  }
  
  isDryRunNoGuardrails(): boolean {
    return this.dryRunNoGuardrails;
  }
  
  /**
   * Log a signal that was generated (before guardrail checks)
   */
  logSignalGenerated(signal: {
    symbol: string;
    strategy: string;
    entryPrice: number;
    stopPrice: number;
    targetPrice: number;
    confidence: number;
    estimatedValue?: number;
    quantity?: number;
    mode: 'paper' | 'live';
  }): void {
    this.signalsGenerated++;
    console.log(`[AJ19][SIGNAL_GENERATED] #${this.signalsGenerated} | ${signal.symbol} | ${signal.strategy} | conf=${(signal.confidence * 100).toFixed(1)}% | entry=$${signal.entryPrice.toFixed(4)} | est=$${signal.estimatedValue?.toFixed(2) || 'N/A'}`);
  }
  
  /**
   * Log a would-be trade (trade that would have been opened if not in dry-run mode)
   */
  logWouldBeTrade(trade: Omit<WouldBeTradeEntry, 'timestamp'>): void {
    const entry: WouldBeTradeEntry = {
      ...trade,
      timestamp: new Date()
    };
    
    this.wouldBeTrades.push(entry);
    
    // Trim old entries
    if (this.wouldBeTrades.length > 1000) {
      this.wouldBeTrades = this.wouldBeTrades.slice(-1000);
    }
    
    console.log(`[AJ19][WOULD_OPEN_TRADE] ${trade.symbol} | ${trade.strategy}`);
    console.log(`  Entry: $${trade.entryPrice.toFixed(4)} | Stop: $${trade.stopPrice.toFixed(4)} | Target: $${trade.targetPrice.toFixed(4)}`);
    console.log(`  Confidence: ${(trade.confidence * 100).toFixed(1)}% | EstValue: $${trade.estimatedValue?.toFixed(2) || 'N/A'} | Qty: ${trade.quantity?.toFixed(4) || 'N/A'}`);
    console.log(`  Reason: ${trade.reason}`);
  }
  
  /**
   * Get dry-run no-guardrails summary
   */
  getDryRunNoGuardrailsSummary(): {
    isEnabled: boolean;
    sessionStart: Date | null;
    signalsGenerated: number;
    wouldBeTradesCount: number;
    uniqueSymbols: string[];
    byStrategy: Record<string, number>;
    recentWouldBeTrades: WouldBeTradeEntry[];
    durationMinutes: number;
  } {
    const byStrategy: Record<string, number> = {};
    const symbols = new Set<string>();
    
    for (const trade of this.wouldBeTrades) {
      symbols.add(trade.symbol);
      byStrategy[trade.strategy] = (byStrategy[trade.strategy] || 0) + 1;
    }
    
    const durationMinutes = this.dryRunSessionStart 
      ? (Date.now() - this.dryRunSessionStart.getTime()) / 60000 
      : 0;
    
    return {
      isEnabled: this.dryRunNoGuardrails,
      sessionStart: this.dryRunSessionStart,
      signalsGenerated: this.signalsGenerated,
      wouldBeTradesCount: this.wouldBeTrades.length,
      uniqueSymbols: Array.from(symbols),
      byStrategy,
      recentWouldBeTrades: this.wouldBeTrades.slice(-20),
      durationMinutes: Math.round(durationMinutes * 10) / 10
    };
  }
  
  /**
   * Clear dry-run data
   */
  clearDryRunData(): void {
    this.wouldBeTrades = [];
    this.signalsGenerated = 0;
    this.dryRunSessionStart = this.dryRunNoGuardrails ? new Date() : null;
    console.log(`[AJ19][DRY_RUN_NO_GUARDRAILS] Data cleared`);
  }
  
  /**
   * Log a position size check for diagnostic analysis
   */
  logCheck(entry: Omit<MaxPositionDiagnosticEntry, 'timestamp'>): void {
    if (!this.isEnabled) return;
    
    const fullEntry: MaxPositionDiagnosticEntry = {
      ...entry,
      timestamp: new Date()
    };
    
    this.entries.push(fullEntry);
    
    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    
    // Detailed console logging
    if (entry.p3Result === 'BLOCK_MAX_POSITION') {
      console.log(`[AJ19][MAX_POSITION_BLOCK] ${fullEntry.timestamp.toISOString()}`);
      console.log(`  Symbol: ${entry.symbol} | Strategy: ${entry.strategy}`);
      console.log(`  P2 Sizing: portfolio=$${entry.p2PortfolioValue?.toFixed(2) || 'N/A'}, notional=$${entry.p2Notional?.toFixed(2) || 'N/A'}, source=${entry.p2SizingSource || 'N/A'}`);
      console.log(`  P3 Check: portfolio=$${entry.p3PortfolioValue?.toFixed(2) || 'N/A'}, positionValue=$${entry.p3PositionValue?.toFixed(2) || 'N/A'}, positionPct=${entry.p3PositionPct?.toFixed(1) || 'N/A'}%`);
      console.log(`  Limit: maxPositionPct=${entry.p3MaxPositionPct?.toFixed(1) || 'N/A'}%, maxValue=$${entry.p3MaxPositionValue?.toFixed(2) || 'N/A'}`);
      console.log(`  Flags: portfolioMismatch=${entry.portfolioValueMismatch}, preComputedMissing=${entry.preComputedNotionalMissing}, wouldPassIfDisabled=${entry.wouldPassWithoutCheck}`);
    }
  }
  
  /**
   * Get diagnostic summary
   */
  getSummary(): MaxPositionDiagnosticSummary {
    const totalChecks = this.entries.length;
    const passed = this.entries.filter(e => e.p3Result === 'PASS').length;
    const blockedMaxPosition = this.entries.filter(e => e.p3Result === 'BLOCK_MAX_POSITION').length;
    const blockedOther = this.entries.filter(e => e.p3Result === 'BLOCK_OTHER').length;
    
    const portfolioValueMismatches = this.entries.filter(e => e.portfolioValueMismatch).length;
    const preComputedMissing = this.entries.filter(e => e.preComputedNotionalMissing).length;
    const wouldPassIfDisabled = this.entries.filter(e => e.wouldPassWithoutCheck).length;
    
    // Portfolio value range
    const p3PortfolioValues = this.entries.map(e => e.p3PortfolioValue).filter(v => v !== undefined && v > 0) as number[];
    const portfolioValueRange = {
      min: p3PortfolioValues.length > 0 ? Math.min(...p3PortfolioValues) : 0,
      max: p3PortfolioValues.length > 0 ? Math.max(...p3PortfolioValues) : 0
    };
    
    // Position percent range
    const positionPcts = this.entries.map(e => e.p3PositionPct).filter(v => v !== undefined) as number[];
    const positionPctRange = {
      min: positionPcts.length > 0 ? Math.min(...positionPcts) : 0,
      max: positionPcts.length > 0 ? Math.max(...positionPcts) : 0
    };
    
    // Max position percent used (most common)
    const maxPcts = this.entries.map(e => e.p3MaxPositionPct).filter(v => v !== undefined) as number[];
    const maxPositionPctUsed = maxPcts.length > 0 ? maxPcts[maxPcts.length - 1] : 10;
    
    // Strategy breakdown
    const byStrategy: Record<string, { passed: number; blocked: number }> = {};
    for (const entry of this.entries) {
      if (!byStrategy[entry.strategy]) {
        byStrategy[entry.strategy] = { passed: 0, blocked: 0 };
      }
      if (entry.p3Result === 'PASS') {
        byStrategy[entry.strategy].passed++;
      } else {
        byStrategy[entry.strategy].blocked++;
      }
    }
    
    // Recent blocked entries
    const recentBlocked = this.entries
      .filter(e => e.p3Result === 'BLOCK_MAX_POSITION')
      .slice(-20);
    
    return {
      sessionStart: this.sessionStart,
      totalChecks,
      passed,
      blockedMaxPosition,
      blockedOther,
      portfolioValueMismatches,
      preComputedMissing,
      wouldPassIfDisabled,
      portfolioValueRange,
      positionPctRange,
      maxPositionPctUsed,
      byStrategy,
      recentBlocked
    };
  }
  
  /**
   * Get raw entries for detailed analysis
   */
  getEntries(limit: number = 100): MaxPositionDiagnosticEntry[] {
    return this.entries.slice(-limit);
  }
  
  /**
   * Clear diagnostic data
   */
  clear(): void {
    this.entries = [];
    this.sessionStart = new Date();
    console.log(`[AJ19] Diagnostic data cleared, new session started`);
  }
  
  /**
   * Export diagnostic data as JSON for analysis
   */
  exportData(): {
    summary: MaxPositionDiagnosticSummary;
    entries: MaxPositionDiagnosticEntry[];
    metadata: {
      exportTime: string;
      isEnabled: boolean;
      isDryRunMode: boolean;
      totalEntries: number;
    };
  } {
    return {
      summary: this.getSummary(),
      entries: this.entries,
      metadata: {
        exportTime: new Date().toISOString(),
        isEnabled: this.isEnabled,
        isDryRunMode: this.dryRunMode,
        totalEntries: this.entries.length
      }
    };
  }
  
  /**
   * Export dryRunNoGuardrails data to a file
   * Saves to diagnostic-reports/aj19-dry-run-{timestamp}.json
   */
  exportDryRunToFile(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `aj19-dry-run-${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'diagnostic-reports', filename);
    
    const summary = this.getDryRunNoGuardrailsSummary();
    const data = {
      exportTime: new Date().toISOString(),
      testType: 'dryRunNoGuardrails',
      description: 'Test to see if RTB signals continue generating when no trades are opened',
      summary: {
        ...summary,
        sessionStart: summary.sessionStart?.toISOString() || null
      },
      allWouldBeTrades: this.wouldBeTrades.map(t => ({
        ...t,
        timestamp: t.timestamp.toISOString()
      }))
    };
    
    try {
      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`[AJ19][EXPORT] DryRunNoGuardrails data saved to ${filepath}`);
      return filepath;
    } catch (err: any) {
      console.error(`[AJ19][EXPORT] Failed to save file:`, err.message);
      throw err;
    }
  }
  
  /**
   * Export full AJ19 diagnostic data to a file
   * Saves to diagnostic-reports/aj19-full-{timestamp}.json
   */
  exportFullToFile(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `aj19-full-${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'diagnostic-reports', filename);
    
    const data = {
      ...this.exportData(),
      dryRunNoGuardrailsSummary: this.getDryRunNoGuardrailsSummary()
    };
    
    try {
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`[AJ19][EXPORT] Full diagnostic data saved to ${filepath}`);
      return filepath;
    } catch (err: any) {
      console.error(`[AJ19][EXPORT] Failed to save file:`, err.message);
      throw err;
    }
  }
}

export const aj19Diagnostic = AJ19MaxPositionDiagnostic.getInstance();
export default aj19Diagnostic;
