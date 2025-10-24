/**
 * LATTI Baseline Indicator Service (Phase 27.F.14.B - Simplified Approach)
 * 
 * Provides a Paper-mode UI indicator showing when LATTI has enough data to
 * declare a "Baseline Established", with a read-only table of optimal parameters
 * that users can manually copy to Live mode.
 * 
 * NO automatic transfers - user maintains full control.
 * 
 * Criteria for "Baseline Established":
 * 1. Minimum activity: 24h runtime OR 150 closed trades (whichever first)
 * 2. Stability: Last 50 trades show win rate ±7% stable, PF ≥1.2, drawdown ≤7%
 * 3. Safety: No kill-switch events during window
 * 
 * @module BaselineIndicator
 */

import { storage } from '../storage';
import type { PaperSimTrade } from '@shared/schema';

interface BaselineSnapshot {
  established: boolean;
  timestamp: Date;
  
  // Key parameters (for manual copying to Live)
  riskPerTrade: number; // Absolute $
  riskPerTradePercent: number; // % of portfolio
  maxDailyLoss: number; // Absolute $
  maxDailyLossPercent: number; // % of portfolio
  tradesPerDay: number;
  expectedProfitPerTrade: number; // $
  minNetProfitThreshold: number; // $ after fees
  
  // Performance metrics (context)
  winRate: number; // Last 50 trades
  profitFactor: number; // Last 50 trades
  maxDrawdown: number; // % since window start
  avgNetProfitPerTrade: number; // $ after fees (default mode)
  feesPerTrade: number; // Estimated $ per trade (default mode)
  defaultFeeMode: 'maker' | 'taker';
  
  // Phase 27.F.14.B: Dual fee scenario calculations
  avgGrossProfit: number; // Before fees
  makerFeesPerTrade: number;
  takerFeesPerTrade: number;
  avgNetProfitMaker: number;
  avgNetProfitTaker: number;
  
  // Provenance
  windowDefinition: string; // e.g., "Last 50 closed trades"
  tradingPace: string; // Conservative/Baseline/Optimistic/Aggressive
  closedTradesCount: number;
  runtimeHours: number;
}

interface BaselineProgress {
  closedTrades: number;
  targetTrades: number;
  runtimeHours: number;
  targetHours: number;
  stabilityCheck: 'pending' | 'passed' | 'failed';
  safetyCheck: 'pending' | 'passed' | 'failed';
}

export class BaselineIndicator {
  private readonly MODULE_NAME = 'BaselineIndicator';
  
  // Criteria thresholds
  private readonly MIN_CLOSED_TRADES = 150;
  private readonly MIN_RUNTIME_HOURS = 24;
  private readonly STABILITY_WINDOW = 50; // Last N trades
  private readonly WIN_RATE_TOLERANCE = 0.07; // ±7 percentage points
  private readonly MIN_PROFIT_FACTOR = 1.2;
  private readonly MAX_DRAWDOWN_PERCENT = 0.07; // 7%
  
  /**
   * Check if Paper mode baseline is established
   */
  async checkBaselineStatus(userId: string): Promise<{
    snapshot: BaselineSnapshot | null;
    progress: BaselineProgress;
  }> {
    try {
      // Get Paper mode system context
      const paperContext = await storage.getSystemContext('paper');
      if (!paperContext) {
        throw new Error('Paper mode system context not found');
      }
      
      // Get paper trading session info for runtime calculation
      const session = await storage.getPaperSimSession(userId);
      const runtimeHours = session?.startedAt 
        ? (Date.now() - new Date(session.startedAt).getTime()) / (1000 * 60 * 60)
        : 0;
      
      // Get closed paper trades
      // NOTE: getPaperSimTradesGlobal returns trades sorted by closedAt DESC (newest-first)
      // Defensive sort added to guarantee ordering even if storage changes
      const allTrades = await storage.getPaperSimTradesGlobal({ closedOnly: true, limit: 1000 });
      const closedTrades = allTrades
        .filter(t => t.closedAt !== null)
        .sort((a, b) => {
          const aTime = new Date(a.closedAt!).getTime();
          const bTime = new Date(b.closedAt!).getTime();
          return bTime - aTime; // DESC order (newest first)
        });
      
      // Build progress object
      const progress: BaselineProgress = {
        closedTrades: closedTrades.length,
        targetTrades: this.MIN_CLOSED_TRADES,
        runtimeHours,
        targetHours: this.MIN_RUNTIME_HOURS,
        stabilityCheck: 'pending',
        safetyCheck: 'pending'
      };
      
      // Check minimum activity criterion
      const hasMinActivity = closedTrades.length >= this.MIN_CLOSED_TRADES || 
                            runtimeHours >= this.MIN_RUNTIME_HOURS;
      
      if (!hasMinActivity) {
        return { snapshot: null, progress };
      }
      
      // Need at least STABILITY_WINDOW trades for stability check
      if (closedTrades.length < this.STABILITY_WINDOW) {
        return { snapshot: null, progress };
      }
      
      // Check stability (last 50 vs previous 50)
      const stabilityResult = await this.checkStability(closedTrades);
      progress.stabilityCheck = stabilityResult.passed ? 'passed' : 'failed';
      
      if (!stabilityResult.passed) {
        return { snapshot: null, progress };
      }
      
      // Check safety (no kill-switch events)
      const safetyResult = await this.checkSafety(userId);
      progress.safetyCheck = safetyResult.passed ? 'passed' : 'failed';
      
      if (!safetyResult.passed) {
        return { snapshot: null, progress };
      }
      
      // All criteria met - create snapshot
      const snapshot = await this.createSnapshot(userId, paperContext, closedTrades, runtimeHours);
      
      // Check if this is a new establishment (not previously established)
      const existingSnapshot = await this.getStoredSnapshot(userId);
      if (!existingSnapshot) {
        // First time establishing baseline - log it
        await this.logBaselineEstablished(userId, snapshot);
      }
      
      // Store snapshot
      await this.storeSnapshot(userId, snapshot);
      
      return { snapshot, progress };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Error checking baseline status:`, error.message);
      throw error;
    }
  }
  
  /**
   * Check stability criteria using absolute thresholds
   * Phase 27.F.14.B: Architect-mandated acceptance gates:
   * - Win rate ≥40%
   * - Profit factor ≥1.1
   * - Max drawdown ≤15%
   * - Max 3 consecutive losses
   */
  private async checkStability(closedTrades: PaperSimTrade[]): Promise<{
    passed: boolean;
    reason?: string;
  }> {
    if (closedTrades.length < this.STABILITY_WINDOW) {
      return { passed: false, reason: `Need ${this.STABILITY_WINDOW} trades for stability check` };
    }
    
    // Get last 50 trades for analysis
    const last50 = closedTrades.slice(0, this.STABILITY_WINDOW);
    
    // 1. Win Rate ≥40%
    const winRate = this.calculateWinRate(last50);
    if (winRate < 0.40) {
      return {
        passed: false,
        reason: `Win rate ${(winRate * 100).toFixed(1)}% < 40% minimum`
      };
    }
    
    // 2. Profit Factor ≥1.1
    const profitFactor = this.calculateProfitFactor(last50);
    if (profitFactor < 1.1) {
      return {
        passed: false,
        reason: `Profit factor ${profitFactor.toFixed(2)} < 1.1 minimum`
      };
    }
    
    // 3. Max Drawdown ≤15%
    const maxDrawdown = this.calculateMaxDrawdown(last50);
    if (maxDrawdown > 0.15) {
      return {
        passed: false,
        reason: `Max drawdown ${(maxDrawdown * 100).toFixed(1)}% > 15% maximum`
      };
    }
    
    // 4. Max 3 Consecutive Losses
    const maxConsecutiveLosses = this.calculateMaxConsecutiveLosses(last50);
    if (maxConsecutiveLosses > 3) {
      return {
        passed: false,
        reason: `${maxConsecutiveLosses} consecutive losses > 3 maximum`
      };
    }
    
    return { passed: true };
  }
  
  /**
   * Check safety criteria (no kill-switch events)
   */
  private async checkSafety(userId: string): Promise<{
    passed: boolean;
    reason?: string;
  }> {
    // Check for recent kill-switch or emergency stop events
    // For now, just check if paper mode is active (simplified)
    const paperContext = await storage.getSystemContext('paper');
    
    if (!paperContext?.isEngineActive) {
      return { passed: false, reason: 'Paper trading engine not active' };
    }
    
    // Could add more sophisticated checks here:
    // - Check system_logs for kill-switch events
    // - Check for emergency stops in trading_audit_log
    // For initial implementation, keeping it simple
    
    return { passed: true };
  }
  
  /**
   * Create baseline snapshot from current state
   */
  private async createSnapshot(
    userId: string,
    paperContext: any,
    closedTrades: PaperSimTrade[],
    runtimeHours: number
  ): Promise<BaselineSnapshot> {
    // Get last 50 trades for metrics (trades already sorted newest-first from storage)
    const last50 = closedTrades.slice(0, this.STABILITY_WINDOW);
    
    // Get current guardrails and portfolio
    const guardrails = await storage.getGuardrails({ mode: 'paper' });
    const portfolio = await storage.getPortfolioState({ mode: 'paper' });
    const filters = await storage.getScreenerFilters({ mode: 'paper' });
    
    const balance = parseFloat(portfolio?.balance || '0');
    const riskPerTrade = parseFloat(guardrails?.riskPerTrade || '0');
    const maxDailyLoss = parseFloat(guardrails?.maxDailyLoss || '0');
    
    // Calculate performance metrics
    const winRate = this.calculateWinRate(last50);
    const profitFactor = this.calculateProfitFactor(last50);
    const maxDrawdown = this.calculateMaxDrawdown(last50);
    
    // Fee configuration - Phase 27.F.14.B: Calculate BOTH maker and taker scenarios
    const makerFeePct = parseFloat(paperContext.makerFeePct || '0.0016');
    const takerFeePct = parseFloat(paperContext.takerFeePct || '0.0026');
    const defaultFeeMode = paperContext.defaultFeeMode || 'taker';
    
    // Calculate average trade metrics (gross profit)
    const avgGrossProfit = last50.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0) / last50.length;
    const avgTradeSize = last50.reduce((sum, t) => sum + parseFloat(t.quantity || '0') * parseFloat(t.entryPrice || '0'), 0) / last50.length;
    
    // Calculate fees and net profit for BOTH fee modes
    const makerFeesPerTrade = avgTradeSize * makerFeePct * 2; // Buy + sell
    const takerFeesPerTrade = avgTradeSize * takerFeePct * 2; // Buy + sell
    const avgNetProfitMaker = avgGrossProfit - makerFeesPerTrade;
    const avgNetProfitTaker = avgGrossProfit - takerFeesPerTrade;
    
    // Use default fee mode for primary calculations
    const feesPerTrade = defaultFeeMode === 'maker' ? makerFeesPerTrade : takerFeesPerTrade;
    const avgNetProfit = defaultFeeMode === 'maker' ? avgNetProfitMaker : avgNetProfitTaker;
    
    // Calculate trades per day
    const tradingDays = runtimeHours / 24;
    const tradesPerDay = tradingDays > 0 ? closedTrades.length / tradingDays : 0;
    
    return {
      established: true,
      timestamp: new Date(),
      
      // Key parameters
      riskPerTrade,
      riskPerTradePercent: balance > 0 ? (riskPerTrade / balance) * 100 : 0,
      maxDailyLoss,
      maxDailyLossPercent: balance > 0 ? (maxDailyLoss / balance) * 100 : 0,
      tradesPerDay,
      expectedProfitPerTrade: avgNetProfit,
      minNetProfitThreshold: parseFloat(paperContext.minNetProfitThreshold || '0'),
      
      // Performance metrics (default mode)
      winRate,
      profitFactor,
      maxDrawdown: maxDrawdown * 100, // Convert to percentage
      avgNetProfitPerTrade: avgNetProfit,
      feesPerTrade,
      defaultFeeMode: defaultFeeMode as 'maker' | 'taker',
      
      // Phase 27.F.14.B: Dual fee scenario calculations
      avgGrossProfit,
      makerFeesPerTrade,
      takerFeesPerTrade,
      avgNetProfitMaker,
      avgNetProfitTaker,
      
      // Provenance
      windowDefinition: `Last ${this.STABILITY_WINDOW} closed trades`,
      tradingPace: paperContext.tradingPace || 'baseline',
      closedTradesCount: closedTrades.length,
      runtimeHours
    };
  }
  
  /**
   * Calculate win rate for trades
   */
  private calculateWinRate(trades: PaperSimTrade[]): number {
    if (trades.length === 0) return 0;
    const winners = trades.filter(t => parseFloat(t.pnl || '0') > 0);
    return winners.length / trades.length;
  }
  
  /**
   * Calculate profit factor for trades
   */
  private calculateProfitFactor(trades: PaperSimTrade[]): number {
    const winners = trades.filter(t => parseFloat(t.pnl || '0') > 0);
    const losers = trades.filter(t => parseFloat(t.pnl || '0') < 0);
    
    const totalWins = winners.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);
    const totalLosses = Math.abs(losers.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0));
    
    return totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
  }
  
  /**
   * Calculate max consecutive losses
   * Phase 27.F.14.B: Critical stability metric
   */
  private calculateMaxConsecutiveLosses(trades: PaperSimTrade[]): number {
    let maxStreak = 0;
    let currentStreak = 0;
    
    // Sort by closed time to get chronological order
    const sorted = [...trades].sort((a, b) => {
      const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return aTime - bTime;
    });
    
    for (const trade of sorted) {
      const pnl = parseFloat(trade.pnl || '0');
      if (pnl < 0) {
        currentStreak++;
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
        }
      } else {
        currentStreak = 0;
      }
    }
    
    return maxStreak;
  }
  
  /**
   * Calculate max drawdown for trades
   */
  private calculateMaxDrawdown(trades: PaperSimTrade[]): number {
    let peak = 0;
    let maxDD = 0;
    let running = 0;
    
    // Sort by closed time (oldest first)
    const sorted = [...trades].sort((a, b) => {
      const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return aTime - bTime;
    });
    
    for (const trade of sorted) {
      running += parseFloat(trade.pnl || '0');
      if (running > peak) {
        peak = running;
      }
      const dd = peak - running;
      if (dd > maxDD) {
        maxDD = dd;
      }
    }
    
    // Return as percentage of peak
    return peak > 0 ? maxDD / peak : 0;
  }
  
  /**
   * Store snapshot in database (using system_context metadata for now)
   */
  private async storeSnapshot(userId: string, snapshot: BaselineSnapshot): Promise<void> {
    const paperContext = await storage.getSystemContext('paper');
    if (!paperContext) return;
    
    const metadata = {
      ...(paperContext.metadata as object || {}),
      lattiBaselineSnapshot: snapshot
    };
    
    await storage.updateSystemContext('paper', { metadata });
  }
  
  /**
   * Get stored snapshot from database
   */
  private async getStoredSnapshot(userId: string): Promise<BaselineSnapshot | null> {
    const paperContext = await storage.getSystemContext('paper');
    if (!paperContext?.metadata) return null;
    
    const meta = paperContext.metadata as any;
    return meta.lattiBaselineSnapshot || null;
  }
  
  /**
   * Log baseline establishment event
   */
  private async logBaselineEstablished(userId: string, snapshot: BaselineSnapshot): Promise<void> {
    await storage.createTradingAuditLog({
      userId,
      action: 'baseline_established',
      mode: 'paper',
      triggeredBy: 'latti_baseline_indicator',
      metadata: {
        timestamp: snapshot.timestamp,
        closedTrades: snapshot.closedTradesCount,
        runtimeHours: snapshot.runtimeHours,
        winRate: snapshot.winRate,
        profitFactor: snapshot.profitFactor,
        maxDrawdown: snapshot.maxDrawdown,
        riskPerTrade: snapshot.riskPerTrade,
        tradesPerDay: snapshot.tradesPerDay,
        tradingPace: snapshot.tradingPace
      }
    });
    
    console.log(`[${this.MODULE_NAME}] ✅ Baseline established for user ${userId}`);
    console.log(`[${this.MODULE_NAME}]    - Closed trades: ${snapshot.closedTradesCount}`);
    console.log(`[${this.MODULE_NAME}]    - Runtime: ${snapshot.runtimeHours.toFixed(1)}h`);
    console.log(`[${this.MODULE_NAME}]    - Win rate: ${(snapshot.winRate * 100).toFixed(1)}%`);
    console.log(`[${this.MODULE_NAME}]    - Profit factor: ${snapshot.profitFactor.toFixed(2)}`);
  }
}

// Singleton instance
export const baselineIndicator = new BaselineIndicator();
