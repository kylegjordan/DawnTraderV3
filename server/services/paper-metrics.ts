import { storage } from '../storage.js';
import type { PaperTrade } from '@shared/schema.js';

/**
 * PaperMetricsService - Calculates trading metrics for paper trading data
 * Mirrors live trading metrics but sources from paper_trades table
 * Complete data isolation from live trading
 */
export class PaperMetricsService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Get portfolio metrics snapshot for paper trading
   */
  async getPortfolioMetrics(): Promise<{
    totalValue: number;
    unrealizedPL: number;
    realizedPL: number;
    currentExposure: number;
    openTradesCount: number;
    cash: number;
    crypto: number;
    cashPercent: number;
    cryptoPercent: number;
  }> {
    const [allTrades, activeTrades] = await Promise.all([
      storage.getAllPaperTrades(),
      storage.getOpenPaperTrades()
    ]);

    const closedTrades = allTrades.filter(t => t.status === 'closed');

    // Calculate unrealized P/L from open trades
    let unrealizedPL = 0;
    let currentExposure = 0;
    
    for (const trade of activeTrades) {
      const tradeValue = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
      currentExposure += tradeValue;
      
      // For unrealized P/L, we'd need current market prices
      // This is simplified - in reality we'd fetch current prices
    }

    // Calculate realized P/L from closed trades
    const realizedPL = closedTrades.reduce((total, trade) => {
      return total + (parseFloat(trade.realizedPL || '0'));
    }, 0);

    // [9.0-FP] Simplified: Use default starting balance (mode not available in class context)
    const startingBalance = 50000;
    const totalValue = startingBalance + realizedPL + unrealizedPL;
    
    // Calculate cash vs crypto allocation
    const cash = totalValue - currentExposure;
    const cashPercent = totalValue > 0 ? (cash / totalValue) * 100 : 100;
    const cryptoPercent = totalValue > 0 ? (currentExposure / totalValue) * 100 : 0;

    return {
      totalValue,
      unrealizedPL,
      realizedPL,
      currentExposure,
      openTradesCount: activeTrades.length,
      cash,
      crypto: currentExposure,
      cashPercent,
      cryptoPercent
    };
  }

  /**
   * Get win rate and trade statistics over specified period
   */
  async getWinRate(days = 30): Promise<{
    winRate: number;
    totalTrades: number;
    wins: number;
    losses: number;
    profitFactor: number;
  }> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const allTrades = await storage.getAllPaperTrades();
    const closedTrades = allTrades.filter(t => t.status === 'closed');
    const recentTrades = closedTrades.filter(trade => 
      trade.exitTime && new Date(trade.exitTime) >= fromDate
    );

    const wins = recentTrades.filter(trade => 
      parseFloat(trade.realizedPL || '0') > 0
    );
    const losses = recentTrades.filter(trade => 
      parseFloat(trade.realizedPL || '0') < 0
    );

    const totalWins = wins.reduce((sum, trade) => 
      sum + parseFloat(trade.realizedPL || '0'), 0
    );
    const totalLosses = Math.abs(losses.reduce((sum, trade) => 
      sum + parseFloat(trade.realizedPL || '0'), 0
    ));

    const winRate = recentTrades.length > 0 ? 
      (wins.length / recentTrades.length) * 100 : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    return {
      winRate,
      totalTrades: recentTrades.length,
      wins: wins.length,
      losses: losses.length,
      profitFactor
    };
  }

  // P19-B6 (2026-06-16): `calculate24hPL()` DELETED — orphaned duplicate (ZERO live callers,
  // re-verified) of the rolling-24h loss calc, superseded by the restored authoritative
  // daily-loss evaluator at `server/services/daily-loss-budget.ts` (which re-homes the Phase-8
  // `risk-manager.ts::calculate24hPL`). Removed per rule-18 / §15 (no two sources of truth for
  // 24h P&L). See DELETED_COMPONENTS_LOG.md. Git history is the archive.

  /**
   * Get earnings by period for paper trading
   */
  async getEarnings(): Promise<{
    today: number;
    yesterday: number;
    thisWeek: number;
    thisMonth: number;
    thisYear: number;
    lifetime: number;
  }> {
    const allTrades = await storage.getAllPaperTrades();
    const closedTrades = allTrades.filter(t => t.status === 'closed');
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const sumPLForPeriod = (startDate: Date, endDate?: Date) => {
      return closedTrades
        .filter(t => {
          if (!t.exitTime) return false;
          const exitDate = new Date(t.exitTime);
          if (endDate) {
            return exitDate >= startDate && exitDate < endDate;
          }
          return exitDate >= startDate;
        })
        .reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
    };

    return {
      today: sumPLForPeriod(todayStart),
      yesterday: sumPLForPeriod(yesterdayStart, todayStart),
      thisWeek: sumPLForPeriod(weekStart),
      thisMonth: sumPLForPeriod(monthStart),
      thisYear: sumPLForPeriod(yearStart),
      lifetime: closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0)
    };
  }

  /**
   * Get comprehensive trade statistics for paper trading
   */
  async getTradeStatistics(): Promise<{
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPL: number;
    avgRMultiple: number;
  }> {
    const allTrades = await storage.getAllPaperTrades();
    const openTrades = allTrades.filter(t => t.status === 'open');
    const closedTrades = allTrades.filter(t => t.status === 'closed');
    const winningTrades = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
    const losingTrades = closedTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);
    
    const totalPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
    const avgRMultiple = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / closedTrades.length
      : 0;
    
    const winRate = closedTrades.length > 0
      ? (winningTrades.length / closedTrades.length) * 100
      : 0;

    return {
      totalTrades: allTrades.length,
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPL,
      avgRMultiple,
    };
  }

  /**
   * Get performance metrics by strategy for paper trading
   * Now includes all 8 strategies + MFE/MAE tracking
   */
  async getPerformanceByStrategy(): Promise<{
    strategy: string;
    trades: number;
    winRate: number;
    avgPL: number;
    avgRMultiple: number;
    avgMFE: number;
    avgMAE: number;
    avgWin: number;
    avgLoss: number;
  }[]> {
    const allTrades = await storage.getAllPaperTrades();
    const closedTrades = allTrades.filter(t => t.status === 'closed');
    
    // All 8 strategies
    const strategies = [
      'vwap_pullback', 
      'abcd_long', 
      'sma_trend_ride',
      'breakout',
      'mean_reversion',
      'range_trading',
      'vwap_bounce',
      'liquidity_trap'
    ];
    
    return strategies.map(strategy => {
      const strategyTrades = closedTrades.filter(t => t.strategy === strategy);
      const wins = strategyTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
      const losses = strategyTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);
      
      const winRate = strategyTrades.length > 0
        ? (wins.length / strategyTrades.length) * 100
        : 0;
      
      const avgPL = strategyTrades.length > 0
        ? strategyTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0) / strategyTrades.length
        : 0;
      
      const avgRMultiple = strategyTrades.length > 0
        ? strategyTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / strategyTrades.length
        : 0;

      // Calculate MFE/MAE averages
      const avgMFE = strategyTrades.length > 0
        ? strategyTrades.reduce((sum, t) => sum + parseFloat(t.mfe || '0'), 0) / strategyTrades.length
        : 0;

      const avgMAE = strategyTrades.length > 0
        ? strategyTrades.reduce((sum, t) => sum + parseFloat(t.mae || '0'), 0) / strategyTrades.length
        : 0;

      // Calculate avg win/loss
      const avgWin = wins.length > 0
        ? wins.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0) / wins.length
        : 0;

      const avgLoss = losses.length > 0
        ? losses.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0) / losses.length
        : 0;

      return {
        strategy,
        trades: strategyTrades.length,
        winRate,
        avgPL,
        avgRMultiple,
        avgMFE,
        avgMAE,
        avgWin,
        avgLoss
      };
    });
  }

  /**
   * Get equity curve data for paper trading (daily balances)
   */
  async getEquityCurve(days = 30): Promise<{
    date: string;
    balance: number;
    dayPL: number;
  }[]> {
    const allTrades = await storage.getAllPaperTrades();
    const closedTrades = allTrades.filter(t => t.status === 'closed' && t.exitTime);
    
    // Sort trades by exit time
    const sortedTrades = closedTrades.sort((a, b) => 
      new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime()
    );

    // [9.0-FP] Simplified: Use default starting balance (mode not available in class context)
    const startingBalance = 50000;
    const equityCurve: { date: string; balance: number; dayPL: number }[] = [];
    
    // Group trades by day
    const tradesByDay = new Map<string, PaperTrade[]>();
    for (const trade of sortedTrades) {
      const date = new Date(trade.exitTime!).toISOString().split('T')[0];
      if (!tradesByDay.has(date)) {
        tradesByDay.set(date, []);
      }
      tradesByDay.get(date)!.push(trade);
    }

    // Calculate cumulative balance
    let runningBalance = startingBalance;
    const sortedDates = Array.from(tradesByDay.keys()).sort();
    
    for (const date of sortedDates) {
      const dayTrades = tradesByDay.get(date)!;
      const dayPL = dayTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      runningBalance += dayPL;
      
      equityCurve.push({
        date,
        balance: runningBalance,
        dayPL
      });
    }

    // Return last N days
    return equityCurve.slice(-days);
  }

  /**
   * Calculate Average Daily Earnings (ADE) for paper trading
   * Uses same logic as live trading: last 30 days, active trading days only
   */
  async getAverageDailyEarnings(): Promise<number | null> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const allTrades = await storage.getAllPaperTrades();
    const closedTrades = allTrades.filter(t => t.status === 'closed' && t.exitTime);
    const recentTrades = closedTrades.filter(trade => 
      new Date(trade.exitTime!) >= thirtyDaysAgo
    );

    // Group by day
    const tradesByDay = new Map<string, PaperTrade[]>();
    for (const trade of recentTrades) {
      const date = new Date(trade.exitTime!).toISOString().split('T')[0];
      if (!tradesByDay.has(date)) {
        tradesByDay.set(date, []);
      }
      tradesByDay.get(date)!.push(trade);
    }

    const activeTradingDays = tradesByDay.size;
    
    // Require at least 5 active trading days
    if (activeTradingDays < 5) {
      return null;
    }

    // Calculate total P/L and average
    const totalPL = recentTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
    return totalPL / activeTradingDays;
  }

  /**
   * Get 7-day earnings trend data for sparkline visualization
   */
  async get7DayEarningsTrend(): Promise<{ date: string; amount: number }[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const allTrades = await storage.getAllPaperTrades();
    const closedTrades = allTrades.filter(t => t.status === 'closed' && t.exitTime);
    const recentTrades = closedTrades.filter(trade => 
      new Date(trade.exitTime!) >= sevenDaysAgo
    );

    // Group by day
    const tradesByDay = new Map<string, PaperTrade[]>();
    for (const trade of recentTrades) {
      const date = new Date(trade.exitTime!).toISOString().split('T')[0];
      if (!tradesByDay.has(date)) {
        tradesByDay.set(date, []);
      }
      tradesByDay.get(date)!.push(trade);
    }

    // Generate 7-day series
    const trend: { date: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayTrades = tradesByDay.get(dateStr) || [];
      const dayPL = dayTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      
      trend.push({
        date: dateStr,
        amount: dayPL
      });
    }

    return trend;
  }
}
