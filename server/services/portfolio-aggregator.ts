import { storage } from '../storage';
import type { StrategyMetrics } from './strategy-analytics';

/**
 * Portfolio Aggregator Service (Phase 8.2)
 * 
 * Combines all strategies to produce portfolio-level metrics:
 * - Total Equity Curve
 * - Portfolio-level Volatility and Sharpe
 * - Capital Allocation Weightings
 * - Diversification Index (variance correlation metric)
 */

export interface EquityPoint {
  timestamp: string;
  value: number;
  cumulativePL: number;
}

export interface CapitalAllocation {
  strategyName: string;
  allocation: number; // Percentage
  currentValue: number;
}

export interface PortfolioSummary {
  timestamp: string;
  totalEquity: number;
  totalPL: number;
  totalPLPercent: number;
  portfolioVolatility: number;
  portfolioSharpe: number;
  diversificationIndex: number;
  capitalAllocations: CapitalAllocation[];
  equityCurve: EquityPoint[];
  strategyCount: number;
  activeStrategies: number;
}

class PortfolioAggregatorService {
  private readonly MODULE_NAME = 'PortfolioAggregator';
  private readonly INITIAL_CAPITAL = 1000; // Default starting capital

  /**
   * Aggregate portfolio metrics from all strategies
   */
  async aggregatePortfolio(
    userId: string, 
    mode: 'live' | 'paper',
    strategyMetrics: StrategyMetrics[]
  ): Promise<PortfolioSummary> {
    console.log(`[${this.MODULE_NAME}] 📊 Aggregating portfolio (user: ${userId}, mode: ${mode})`);
    const start = Date.now();

    // Phase 8.5 Addendum F: Get initial capital from portfolio_state
    const portfolioState = await storage.getPortfolioState({ userId, mode });
    const initialCapital = portfolioState 
      ? parseFloat(portfolioState.balance) 
      : this.INITIAL_CAPITAL;

    // Get all trades for equity curve
    const allTrades = mode === 'live' 
      ? await storage.getTrades(userId, { limit: 10000 })
      : await storage.getAllPaperTrades(userId);

    const closedTrades = allTrades.filter((t: any) => t.status === 'closed' && t.exitTime);

    // Calculate total P/L
    const totalPL = closedTrades.reduce((sum: number, t: any) => 
      sum + parseFloat(t.realizedPL || '0'), 0
    );

    const totalEquity = initialCapital + totalPL;
    const totalPLPercent = initialCapital > 0 ? (totalPL / initialCapital) * 100 : 0;

    // Build equity curve
    const equityCurve = this.buildEquityCurve(closedTrades, initialCapital);

    // Calculate portfolio volatility
    const portfolioVolatility = this.calculatePortfolioVolatility(closedTrades);

    // Calculate portfolio Sharpe ratio
    const portfolioSharpe = this.calculatePortfolioSharpe(closedTrades);

    // Calculate capital allocations
    const capitalAllocations = this.calculateCapitalAllocations(strategyMetrics, totalEquity);

    // Calculate diversification index
    const diversificationIndex = this.calculateDiversificationIndex(strategyMetrics);

    // Count active strategies (with recent trades)
    const activeStrategies = strategyMetrics.filter(s => s.totalTrades > 0).length;

    const summary: PortfolioSummary = {
      timestamp: new Date().toISOString(),
      totalEquity,
      totalPL,
      totalPLPercent,
      portfolioVolatility,
      portfolioSharpe,
      diversificationIndex,
      capitalAllocations,
      equityCurve,
      strategyCount: strategyMetrics.length,
      activeStrategies
    };

    const duration = Date.now() - start;
    console.log(`[${this.MODULE_NAME}] ✅ Portfolio aggregated in ${duration}ms`);

    return summary;
  }

  /**
   * Build equity curve from trade history
   */
  private buildEquityCurve(trades: any[], initialCapital: number): EquityPoint[] {
    const sortedTrades = [...trades].sort((a, b) => 
      new Date(a.exitTime || 0).getTime() - new Date(b.exitTime || 0).getTime()
    );

    const curve: EquityPoint[] = [];
    let runningPL = 0;

    for (const trade of sortedTrades) {
      runningPL += parseFloat(trade.realizedPL || '0');
      curve.push({
        timestamp: trade.exitTime || new Date().toISOString(),
        value: initialCapital + runningPL,
        cumulativePL: runningPL
      });
    }

    // Limit to last 100 points for performance
    return curve.slice(-100);
  }

  /**
   * Calculate portfolio-level volatility (standard deviation of returns)
   */
  private calculatePortfolioVolatility(trades: any[]): number {
    if (trades.length < 2) return 0;

    const returns = trades.map((t: any) => parseFloat(t.realizedPL || '0'));
    const avgReturn = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
    
    const squaredDiffs = returns.map((r: number) => Math.pow(r - avgReturn, 2));
    const variance = squaredDiffs.reduce((a: number, b: number) => a + b, 0) / squaredDiffs.length;
    const volatility = Math.sqrt(variance);

    // Annualize volatility (assuming 365 trading days)
    const annualizedVolatility = volatility * Math.sqrt(365);
    
    return Number(annualizedVolatility.toFixed(2));
  }

  /**
   * Calculate portfolio-level Sharpe ratio
   */
  private calculatePortfolioSharpe(trades: any[]): number {
    if (trades.length < 2) return 0;

    const returns = trades.map((t: any) => parseFloat(t.realizedPL || '0'));
    const avgReturn = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
    
    const squaredDiffs = returns.map((r: number) => Math.pow(r - avgReturn, 2));
    const variance = squaredDiffs.reduce((a: number, b: number) => a + b, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualized Sharpe (risk-free rate = 0)
    const dailySharpe = avgReturn / stdDev;
    const annualizedSharpe = dailySharpe * Math.sqrt(365);

    return Number(annualizedSharpe.toFixed(2));
  }

  /**
   * Calculate capital allocation weightings by strategy
   */
  private calculateCapitalAllocations(
    strategyMetrics: StrategyMetrics[],
    totalEquity: number
  ): CapitalAllocation[] {
    if (strategyMetrics.length === 0) {
      return [];
    }

    // Calculate total absolute P/L across strategies
    const totalAbsolutePL = strategyMetrics.reduce((sum, s) => 
      sum + Math.abs(s.cumulativePL), 0
    );

    // Allocate based on contribution to total P/L
    const allocations = strategyMetrics.map(strategy => {
      const contribution = totalAbsolutePL > 0 
        ? Math.abs(strategy.cumulativePL) / totalAbsolutePL 
        : 1 / strategyMetrics.length;
      
      const allocation = contribution * 100;
      const currentValue = (allocation / 100) * totalEquity;

      return {
        strategyName: strategy.strategyName,
        allocation: Number(allocation.toFixed(2)),
        currentValue: Number(currentValue.toFixed(2))
      };
    });

    return allocations.sort((a, b) => b.allocation - a.allocation);
  }

  /**
   * Calculate diversification index (inverse of correlation variance)
   * Higher = more diversified
   */
  private calculateDiversificationIndex(strategyMetrics: StrategyMetrics[]): number {
    if (strategyMetrics.length < 2) return 0;

    // Use win rates as proxy for strategy correlation
    const winRates = strategyMetrics.map(s => s.winRate);
    
    // Calculate variance of win rates
    const avgWinRate = winRates.reduce((a, b) => a + b, 0) / winRates.length;
    const squaredDiffs = winRates.map(wr => Math.pow(wr - avgWinRate, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;

    // Normalize to 0-100 scale (higher variance = more diversified)
    const normalizedIndex = Math.min(100, variance);

    return Number(normalizedIndex.toFixed(2));
  }
}

// Export singleton instance
export const portfolioAggregator = new PortfolioAggregatorService();
