import { storage } from '../storage';
import { PaperExecutionEngine } from './paper-execution-engine';
import { KrakenService } from './kraken';

interface PortfolioMetrics {
  totalTrades: number;
  openPositions: number;
  closedTrades: number;
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  avgReturn: number;
  avgHoldingTime: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  byStrategy: Array<{
    strategy: string;
    count: number;
    winRate: number;
    avgReturn: number;
    totalPnl: number;
  }>;
}

interface PortfolioHealth {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  metrics: {
    drawdownPercent: number;
    exposurePercent: number;
    openPositionCount: number;
  };
}

export class PaperPortfolioManager {
  private userId: string;
  private executionEngine: PaperExecutionEngine;
  private kraken: KrakenService;
  private isRunning: boolean = false;
  private watchlistRefreshInterval: NodeJS.Timeout | null = null;
  
  // Portfolio-level guardrails
  private readonly MAX_DRAWDOWN_PERCENT = 20; // Max 20% drawdown
  private readonly MAX_OPEN_POSITIONS = 10; // Max 10 concurrent positions
  private readonly MAX_PORTFOLIO_EXPOSURE_PERCENT = 80; // Max 80% capital deployed
  private readonly WATCHLIST_REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds

  constructor(userId: string) {
    this.userId = userId;
    this.executionEngine = new PaperExecutionEngine(userId);
    this.kraken = new KrakenService();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[PaperPortfolio:${this.userId}] Already running`);
      return;
    }

    // Check portfolio health before starting
    const health = await this.checkPortfolioHealth();
    if (health.status === 'critical') {
      console.error(`[PaperPortfolio:${this.userId}] Cannot start - portfolio in critical state:`);
      health.issues.forEach(issue => console.error(`  - ${issue}`));
      throw new Error(`Portfolio in critical state: ${health.issues.join(', ')}`);
    }

    this.isRunning = true;
    console.log(`[PaperPortfolio:${this.userId}] Starting paper portfolio manager`);

    // Start execution engine
    await this.executionEngine.start();

    // Start watchlist refresh cycle
    console.log(`[PaperPortfolio:${this.userId}] Starting watchlist refresh (every ${this.WATCHLIST_REFRESH_INTERVAL_MS / 1000}s)`);
    this.watchlistRefreshInterval = setInterval(
      () => this.refreshWatchlistData(),
      this.WATCHLIST_REFRESH_INTERVAL_MS
    );
    // Run initial refresh immediately
    await this.refreshWatchlistData();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log(`[PaperPortfolio:${this.userId}] Stopping paper portfolio manager`);

    // Stop watchlist refresh
    if (this.watchlistRefreshInterval) {
      clearInterval(this.watchlistRefreshInterval);
      this.watchlistRefreshInterval = null;
      console.log(`[PaperPortfolio:${this.userId}] Stopped watchlist refresh`);
    }

    // Stop execution engine
    await this.executionEngine.stop();
  }

  private async refreshWatchlistData(): Promise<void> {
    try {
      // Get user's paper mode watchlist
      const watchlist = await storage.getWatchlist({ userId: this.userId, mode: 'paper' });
      
      if (watchlist.length === 0) {
        return; // No symbols to refresh
      }

      console.log(`[PaperPortfolio:${this.userId}] Refreshing ${watchlist.length} watchlist pairs`);

      // Refresh market data for each symbol
      for (const pair of watchlist) {
        try {
          // getTicker returns Record<string, KrakenTicker>
          const tickerResponse = await this.kraken.getTicker(pair.symbol);
          
          // Extract the ticker data (Kraken returns an object keyed by pair name)
          const tickerData = Object.values(tickerResponse)[0];
          
          if (!tickerData) {
            console.log(`[PaperPortfolio:${this.userId}] No ticker data for ${pair.symbol}`);
            continue;
          }

          // Parse raw Kraken ticker fields with null-safety
          // c[0] = last trade price, v[1] = 24h volume, p[1] = 24h VWAP
          // h[1] = 24h high, l[1] = 24h low
          const currentPrice = tickerData.c?.[0] ? parseFloat(tickerData.c[0]) : null;
          const volume24h = tickerData.v?.[1] ? parseFloat(tickerData.v[1]) : null;
          const vwap = tickerData.p?.[1] ? parseFloat(tickerData.p[1]) : null;
          const high24h = tickerData.h?.[1] ? parseFloat(tickerData.h[1]) : null;
          const low24h = tickerData.l?.[1] ? parseFloat(tickerData.l[1]) : null;
          
          // Calculate daily range percentage if we have both high and low
          const dailyRange = (high24h && low24h && low24h > 0)
            ? ((high24h - low24h) / low24h) * 100
            : null;

          // Update watchlist with fresh market data
          await storage.updateWatchlistPair(pair.id, {
            currentPrice: currentPrice?.toString() || null,
            vwap: vwap?.toString() || null,
            volume24h: volume24h?.toString() || null,
            dailyRange: dailyRange?.toString() || null,
            lastScanned: new Date()
          });
        } catch (error: any) {
          // Log but don't fail the whole refresh if one symbol fails
          console.log(`[PaperPortfolio:${this.userId}] Failed to refresh ${pair.symbol}: ${error.message}`);
        }
      }

      console.log(`[PaperPortfolio:${this.userId}] Watchlist refresh complete`);
    } catch (error) {
      console.error(`[PaperPortfolio:${this.userId}] Error refreshing watchlist:`, error);
    }
  }

  async getPortfolioMetrics(): Promise<PortfolioMetrics> {
    const stats = await storage.getPaperSimStats(this.userId);
    const trades = await storage.getPaperSimTrades(this.userId, { limit: 1000, closedOnly: true });

    // Calculate max drawdown
    const maxDrawdown = this.calculateMaxDrawdown(trades);

    // Calculate Sharpe ratio (simplified - uses daily returns)
    const sharpeRatio = this.calculateSharpeRatio(trades);

    // Calculate profit factor (gross profit / gross loss)
    const profitFactor = this.calculateProfitFactor(trades);

    // Calculate total P/L percentage (relative to total capital deployed)
    const totalCapitalDeployed = trades.reduce((sum, t) => {
      const posValue = parseFloat(t.entryPrice) * parseFloat(t.quantity);
      return sum + posValue;
    }, 0);
    const totalPnlPercent = totalCapitalDeployed > 0 
      ? (stats.totalPnl / totalCapitalDeployed) * 100 
      : 0;

    return {
      totalTrades: stats.totalTrades,
      openPositions: stats.openPositions,
      closedTrades: stats.closedTrades,
      totalPnl: stats.totalPnl,
      totalPnlPercent,
      winRate: stats.winRate,
      avgReturn: stats.avgReturn,
      avgHoldingTime: stats.avgHoldingTime,
      maxDrawdown,
      sharpeRatio,
      profitFactor,
      byStrategy: stats.byStrategy
    };
  }

  async checkPortfolioHealth(): Promise<PortfolioHealth> {
    const stats = await storage.getPaperSimStats(this.userId);
    const trades = await storage.getPaperSimTrades(this.userId, { limit: 1000, closedOnly: true });
    const openPositions = await storage.getPaperSimOpenPositions(this.userId);

    const issues: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check drawdown
    const maxDrawdown = this.calculateMaxDrawdown(trades);
    if (maxDrawdown >= this.MAX_DRAWDOWN_PERCENT) {
      issues.push(`Max drawdown ${maxDrawdown.toFixed(2)}% exceeds limit ${this.MAX_DRAWDOWN_PERCENT}%`);
      status = 'critical';
    } else if (maxDrawdown >= this.MAX_DRAWDOWN_PERCENT * 0.8 && status === 'healthy') {
      issues.push(`Drawdown ${maxDrawdown.toFixed(2)}% approaching limit ${this.MAX_DRAWDOWN_PERCENT}%`);
      status = 'warning';
    }

    // Check open positions count
    if (stats.openPositions >= this.MAX_OPEN_POSITIONS) {
      issues.push(`Open positions ${stats.openPositions} at maximum ${this.MAX_OPEN_POSITIONS}`);
      status = 'critical';
    } else if (stats.openPositions >= this.MAX_OPEN_POSITIONS * 0.8 && status === 'healthy') {
      issues.push(`Open positions ${stats.openPositions} approaching limit ${this.MAX_OPEN_POSITIONS}`);
      status = 'warning';
    }

    // Check portfolio exposure
    const totalExposure = openPositions.reduce((sum, pos) => {
      const posValue = parseFloat(pos.avgPrice) * parseFloat(pos.quantity);
      return sum + posValue;
    }, 0);

    // Assume $10,000 starting capital for paper trading
    const startingCapital = 10000;
    const exposurePercent = (totalExposure / startingCapital) * 100;

    if (exposurePercent >= this.MAX_PORTFOLIO_EXPOSURE_PERCENT) {
      issues.push(`Portfolio exposure ${exposurePercent.toFixed(2)}% exceeds limit ${this.MAX_PORTFOLIO_EXPOSURE_PERCENT}%`);
      status = 'critical';
    } else if (exposurePercent >= this.MAX_PORTFOLIO_EXPOSURE_PERCENT * 0.8 && status === 'healthy') {
      issues.push(`Portfolio exposure ${exposurePercent.toFixed(2)}% approaching limit ${this.MAX_PORTFOLIO_EXPOSURE_PERCENT}%`);
      status = 'warning';
    }

    return {
      status,
      issues,
      metrics: {
        drawdownPercent: maxDrawdown,
        exposurePercent,
        openPositionCount: stats.openPositions
      }
    };
  }

  async closeAllPositions(reason: string = 'manual_close'): Promise<void> {
    const openPositions = await storage.getPaperSimOpenPositions(this.userId);
    
    console.log(`[PaperPortfolio:${this.userId}] Closing all ${openPositions.length} positions - ${reason}`);

    for (const position of openPositions) {
      try {
        // Find the corresponding trade
        const trades = await storage.getPaperSimTradesBySymbol(this.userId, position.symbol);
        const trade = trades.find(t => t.openedAt && !t.closedAt);
        
        if (trade) {
          const currentPrice = position.currentPrice ? parseFloat(position.currentPrice) : parseFloat(position.avgPrice);
          const avgPrice = parseFloat(position.avgPrice);
          const quantity = parseFloat(position.quantity);
          const pnl = (currentPrice - avgPrice) * quantity;
          const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100;

          // Update trade record
          await storage.updatePaperSimTrade(trade.id, {
            exitPrice: currentPrice.toString(),
            pnl: pnl.toString(),
            pnlPercent: pnlPercent.toString(),
            closeReason: reason,
            closedAt: new Date()
          });

          // Log the close event
          await storage.createPaperSimTradeLog({
            userId: this.userId,
            tradeId: trade.id,
            positionId: position.id,
            eventType: 'position_closed',
            message: `Position closed: ${position.symbol} - ${reason}`,
            metadata: {
              closeReason: reason,
              exitPrice: currentPrice,
              pnl,
              pnlPercent
            }
          });
        }

        // Delete open position
        await storage.deletePaperSimOpenPosition(position.id);
      } catch (error) {
        console.error(`[PaperPortfolio:${this.userId}] Error closing position ${position.symbol}:`, error);
      }
    }

    console.log(`[PaperPortfolio:${this.userId}] All positions closed`);
  }

  async resetPortfolio(): Promise<void> {
    console.log(`[PaperPortfolio:${this.userId}] Resetting paper portfolio`);

    // Stop engine if running
    if (this.isRunning) {
      await this.stop();
    }

    // Close all open positions
    await this.closeAllPositions('portfolio_reset');

    console.log(`[PaperPortfolio:${this.userId}] Portfolio reset complete`);
  }

  private calculateMaxDrawdown(trades: any[]): number {
    if (trades.length === 0) return 0;

    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;

    // Sort by close time
    const sortedTrades = [...trades]
      .filter(t => t.closedAt)
      .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());

    for (const trade of sortedTrades) {
      runningPnL += trade.pnl ? parseFloat(trade.pnl) : 0;
      
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Convert to percentage (assume $10,000 starting capital)
    const startingCapital = 10000;
    return (maxDrawdown / startingCapital) * 100;
  }

  private calculateSharpeRatio(trades: any[]): number {
    if (trades.length === 0) return 0;

    const returns = trades
      .filter(t => t.pnlPercent)
      .map(t => parseFloat(t.pnlPercent));

    if (returns.length === 0) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Simplified Sharpe: (mean return - risk-free rate) / std dev
    // Assuming 0% risk-free rate for simplicity
    return stdDev > 0 ? avgReturn / stdDev : 0;
  }

  private calculateProfitFactor(trades: any[]): number {
    if (trades.length === 0) return 0;

    let grossProfit = 0;
    let grossLoss = 0;

    for (const trade of trades) {
      if (trade.pnl) {
        const pnl = parseFloat(trade.pnl);
        if (pnl > 0) {
          grossProfit += pnl;
        } else {
          grossLoss += Math.abs(pnl);
        }
      }
    }

    return grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  }

  // Public getters for external access
  getExecutionEngine(): PaperExecutionEngine {
    return this.executionEngine;
  }

  getStatus(): { isRunning: boolean; userId: string } {
    return {
      isRunning: this.isRunning,
      userId: this.userId
    };
  }
}
