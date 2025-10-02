import { storage } from '../storage';
import { TradingSettings } from '@shared/schema';
import { TradeSignal } from './trading-engine';

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
}

export class RiskManager {
  async checkPreTradeRisk(
    userId: string,
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    // Check 1: Available balance (for live trading)
    const balanceCheck = await this.checkAvailableBalance(userId, signal, settings);
    if (!balanceCheck.approved) {
      return balanceCheck;
    }

    // Check 2: Risk per trade
    const riskCheck = await this.checkRiskPerTrade(signal, settings);
    if (!riskCheck.approved) {
      return riskCheck;
    }

    // Check 3: Maximum concurrent exposure
    const exposureCheck = await this.checkMaxExposure(userId, signal, settings);
    if (!exposureCheck.approved) {
      return exposureCheck;
    }

    // Check 4: Maximum open trades
    const maxTradesCheck = await this.checkMaxOpenTrades(userId, settings);
    if (!maxTradesCheck.approved) {
      return maxTradesCheck;
    }

    return { approved: true };
  }

  private async checkAvailableBalance(
    userId: string,
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    try {
      // For paper trading, always approve
      const user = await storage.getUser(userId);
      if (!user || user.tradingMode === 'paper') {
        return { approved: true };
      }

      // For live trading, we'd check actual Kraken balance
      // This is a simplified check
      const riskAmount = parseFloat(settings.riskPerTrade);
      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      const positionSize = riskAmount / stopDistance;
      const requiredCapital = positionSize * signal.entryPrice;

      // In a real implementation, we'd get actual balance from Kraken
      // For now, we'll assume sufficient balance if risk amount is reasonable
      if (requiredCapital > 100000) { // Arbitrary large position check
        return {
          approved: false,
          reason: 'Position size too large for available balance'
        };
      }

      return { approved: true };
    } catch (error) {
      return {
        approved: false,
        reason: 'Error checking available balance'
      };
    }
  }

  private async checkRiskPerTrade(
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    const riskAmount = parseFloat(settings.riskPerTrade);
    
    if (riskAmount <= 0) {
      return {
        approved: false,
        reason: 'Risk per trade must be greater than 0'
      };
    }

    if (riskAmount > 1000) { // Arbitrary upper limit
      return {
        approved: false,
        reason: 'Risk per trade exceeds maximum allowed'
      };
    }

    return { approved: true };
  }

  private async checkMaxExposure(
    userId: string,
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    const activeTrades = await storage.getActiveTrades(userId);
    const maxExposurePercent = parseFloat(settings.maxExposurePercent);

    // Calculate current exposure
    let currentExposure = 0;
    for (const trade of activeTrades) {
      const tradeValue = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
      currentExposure += tradeValue;
    }

    // Calculate new trade exposure
    const riskAmount = parseFloat(settings.riskPerTrade);
    const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
    const positionSize = riskAmount / stopDistance;
    const newTradeValue = positionSize * signal.entryPrice;

    // Assume a portfolio value (in a real system, this would be actual balance)
    const assumedPortfolioValue = 50000; // This should come from actual balance
    const totalExposure = currentExposure + newTradeValue;
    const exposurePercent = (totalExposure / assumedPortfolioValue) * 100;

    if (exposurePercent > maxExposurePercent) {
      return {
        approved: false,
        reason: `Total exposure (${exposurePercent.toFixed(1)}%) would exceed maximum allowed (${maxExposurePercent}%)`
      };
    }

    return { approved: true };
  }

  private async checkMaxOpenTrades(
    userId: string,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    const activeTrades = await storage.getActiveTrades(userId);
    const maxOpenTrades = settings.maxOpenTrades;

    if (activeTrades.length >= maxOpenTrades) {
      return {
        approved: false,
        reason: `Maximum open trades limit reached (${maxOpenTrades})`
      };
    }

    return { approved: true };
  }

  calculatePositionSize(
    riskAmount: number,
    entryPrice: number,
    stopPrice: number
  ): number {
    const stopDistance = Math.abs(entryPrice - stopPrice);
    if (stopDistance === 0) return 0;
    
    return riskAmount / stopDistance;
  }

  calculateRiskReward(
    entryPrice: number,
    stopPrice: number,
    targetPrice: number
  ): { risk: number; reward: number; ratio: number } {
    const risk = Math.abs(entryPrice - stopPrice);
    const reward = Math.abs(targetPrice - entryPrice);
    const ratio = reward / risk;

    return { risk, reward, ratio };
  }

  async getPortfolioMetrics(userId: string): Promise<{
    totalValue: number;
    unrealizedPL: number;
    realizedPL: number;
    currentExposure: number;
    openTradesCount: number;
  }> {
    const [activeTrades, closedTrades] = await Promise.all([
      storage.getActiveTrades(userId),
      storage.getTrades(userId, { status: 'closed', limit: 1000 })
    ]);

    let unrealizedPL = 0;
    let currentExposure = 0;

    // Calculate unrealized P/L and exposure from active trades
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

    // Simplified total value calculation
    const totalValue = 50000 + realizedPL + unrealizedPL; // Starting with assumed base value

    return {
      totalValue,
      unrealizedPL,
      realizedPL,
      currentExposure,
      openTradesCount: activeTrades.length
    };
  }

  async getWinRate(userId: string, days = 30): Promise<{
    winRate: number;
    totalTrades: number;
    wins: number;
    losses: number;
    profitFactor: number;
  }> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const trades = await storage.getTrades(userId, { status: 'closed' });
    const recentTrades = trades.filter(trade => 
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
}
