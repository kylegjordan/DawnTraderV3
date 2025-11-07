import { storage } from '../storage';

/**
 * Strategy Analytics Service (Phase 8.2)
 * 
 * Computes derived performance analytics for every active strategy:
 * - Cumulative P/L % and absolute value
 * - Rolling Sharpe Ratio (7 day window)
 * - Max Drawdown %
 * - Win Rate and Average Return per Trade
 * - Trade Frequency per hour and per day
 */

export interface StrategyMetrics {
  strategyName: string;
  cumulativePL: number;
  cumulativePLPercent: number;
  sharpeRatio7d: number;
  maxDrawdownPercent: number;
  winRate: number;
  avgReturnPerTrade: number;
  tradeFrequencyPerHour: number;
  tradeFrequencyPerDay: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  lastUpdated: string;
}

export interface StrategyAnalyticsSnapshot {
  timestamp: string;
  strategies: StrategyMetrics[];
  totalStrategies: number;
  averageSharpe: number;
  averageWinRate: number;
  bestPerformer: string | null;
  worstPerformer: string | null;
}

class StrategyAnalyticsService {
  private readonly MODULE_NAME = 'StrategyAnalytics';
  private readonly WINDOW_DAYS = 7;

  /**
   * Compute analytics for all strategies (mode-specific)
   */
  async computeStrategyAnalytics(userId: string, mode: 'live' | 'paper'): Promise<StrategyAnalyticsSnapshot> {
    console.log(`[${this.MODULE_NAME}] 🔍 Computing strategy analytics (user: ${userId}, mode: ${mode})`);
    const start = Date.now();

    // Get all trades for the user (mode-filtered in storage)
    // Phase 27.F.15.A + Phase 3D: Global mode-based queries (no userId)
    const allTrades = mode === 'live' 
      ? await storage.getTrades(mode, { limit: 10000 })
      : await storage.getAllPaperTrades();
    console.log('[Phase-27.F.15.B.2][3D] Updated service strategy-analytics → mode-based only');

    // Filter to last 7 days
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - this.WINDOW_DAYS);
    
    const recentTrades = allTrades.filter((t: any) => 
      t.entryTime && new Date(t.entryTime) >= windowStart
    );

    // Group trades by strategy
    const tradesByStrategy = this.groupTradesByStrategy(recentTrades);

    // Compute metrics for each strategy
    const strategies: StrategyMetrics[] = [];
    for (const [strategyName, trades] of Object.entries(tradesByStrategy)) {
      const metrics = this.computeStrategyMetrics(strategyName, trades);
      strategies.push(metrics);
    }

    // Sort by cumulative P/L for best/worst identification
    const sortedByPL = [...strategies].sort((a, b) => b.cumulativePL - a.cumulativePL);
    
    const snapshot: StrategyAnalyticsSnapshot = {
      timestamp: new Date().toISOString(),
      strategies,
      totalStrategies: strategies.length,
      averageSharpe: this.calculateAverageSharpe(strategies),
      averageWinRate: this.calculateAverageWinRate(strategies),
      bestPerformer: sortedByPL[0]?.strategyName || null,
      worstPerformer: sortedByPL[sortedByPL.length - 1]?.strategyName || null
    };

    const duration = Date.now() - start;
    console.log(`[${this.MODULE_NAME}] ✅ Analytics computed in ${duration}ms (${strategies.length} strategies)`);

    return snapshot;
  }

  /**
   * Group trades by strategy name
   */
  private groupTradesByStrategy(trades: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    for (const trade of trades) {
      const strategy = trade.strategy || 'Unknown';
      if (!grouped[strategy]) {
        grouped[strategy] = [];
      }
      grouped[strategy].push(trade);
    }

    return grouped;
  }

  /**
   * Compute comprehensive metrics for a single strategy
   */
  private computeStrategyMetrics(strategyName: string, trades: any[]): StrategyMetrics {
    const closedTrades = trades.filter(t => t.status === 'closed' && t.exitTime);
    
    // Cumulative P/L
    const cumulativePL = closedTrades.reduce((sum, t) => 
      sum + parseFloat(t.realizedPL || '0'), 0
    );

    // Initial capital estimate (simplified)
    const initialCapital = 1000; // Default for calculation
    const cumulativePLPercent = (cumulativePL / initialCapital) * 100;

    // Win/Loss metrics
    const winningTrades = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
    const losingTrades = closedTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);
    const winRate = closedTrades.length > 0 
      ? (winningTrades.length / closedTrades.length) * 100 
      : 0;

    // Average return per trade
    const avgReturnPerTrade = closedTrades.length > 0
      ? cumulativePL / closedTrades.length
      : 0;

    // Sharpe Ratio (7 day)
    const sharpeRatio7d = this.calculateSharpeRatio(closedTrades);

    // Max Drawdown
    const maxDrawdownPercent = this.calculateMaxDrawdown(closedTrades);

    // Trade frequency
    const { perHour, perDay } = this.calculateTradeFrequency(trades);

    return {
      strategyName,
      cumulativePL,
      cumulativePLPercent,
      sharpeRatio7d,
      maxDrawdownPercent,
      winRate,
      avgReturnPerTrade,
      tradeFrequencyPerHour: perHour,
      tradeFrequencyPerDay: perDay,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Calculate Sharpe Ratio (annualized)
   */
  private calculateSharpeRatio(trades: any[]): number {
    if (trades.length < 2) return 0;

    const returns = trades.map(t => parseFloat(t.realizedPL || '0'));
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    
    // Calculate standard deviation
    const squaredDiffs = returns.map(r => Math.pow(r - avgReturn, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualized Sharpe (assuming 365 trading days, risk-free rate = 0)
    const dailySharpe = avgReturn / stdDev;
    const annualizedSharpe = dailySharpe * Math.sqrt(365);

    return Number(annualizedSharpe.toFixed(2));
  }

  /**
   * Calculate Maximum Drawdown %
   */
  private calculateMaxDrawdown(trades: any[]): number {
    if (trades.length === 0) return 0;

    // Sort by exit time
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(a.exitTime || 0).getTime() - new Date(b.exitTime || 0).getTime()
    );

    let peak = 0;
    let maxDrawdown = 0;
    let runningPL = 0;

    for (const trade of sortedTrades) {
      runningPL += parseFloat(trade.realizedPL || '0');
      peak = Math.max(peak, runningPL);
      const drawdown = peak - runningPL;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    const drawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
    return Number(drawdownPercent.toFixed(2));
  }

  /**
   * Calculate trade frequency per hour and per day
   */
  private calculateTradeFrequency(trades: any[]): { perHour: number; perDay: number } {
    if (trades.length === 0) return { perHour: 0, perDay: 0 };

    // Find time span
    const times = trades
      .map(t => new Date(t.entryTime || Date.now()).getTime())
      .filter(t => !isNaN(t));

    if (times.length === 0) return { perHour: 0, perDay: 0 };

    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const spanMs = maxTime - minTime;

    if (spanMs === 0) return { perHour: 0, perDay: 0 };

    const spanHours = spanMs / (1000 * 60 * 60);
    const spanDays = spanMs / (1000 * 60 * 60 * 24);

    return {
      perHour: Number((trades.length / spanHours).toFixed(2)),
      perDay: Number((trades.length / spanDays).toFixed(2))
    };
  }

  /**
   * Calculate average Sharpe across all strategies
   */
  private calculateAverageSharpe(strategies: StrategyMetrics[]): number {
    if (strategies.length === 0) return 0;
    const sum = strategies.reduce((acc, s) => acc + s.sharpeRatio7d, 0);
    return Number((sum / strategies.length).toFixed(2));
  }

  /**
   * Calculate average win rate across all strategies
   */
  private calculateAverageWinRate(strategies: StrategyMetrics[]): number {
    if (strategies.length === 0) return 0;
    const sum = strategies.reduce((acc, s) => acc + s.winRate, 0);
    return Number((sum / strategies.length).toFixed(2));
  }
}

// Export singleton instance
export const strategyAnalytics = new StrategyAnalyticsService();
