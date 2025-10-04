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
    // Check 0: Trading suspended (kill switch)
    if (settings.tradingSuspended) {
      return {
        approved: false,
        reason: '🚨 Trading suspended due to Kill Switch activation. Reset required before resuming trades.'
      };
    }

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

  /**
   * Calculate rolling 24h P/L (realized + unrealized)
   */
  async calculate24hPL(userId: string): Promise<{
    totalPL: number;
    realizedPL: number;
    unrealizedPL: number;
    portfolioValueBefore: number;
    portfolioValueCurrent: number;
    lossPercent: number;
  }> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Get all closed trades in last 24h
    const closedTrades = await storage.getTrades(userId, { status: 'closed' });
    const recentClosed = closedTrades.filter(trade => 
      trade.exitTime && new Date(trade.exitTime) >= twentyFourHoursAgo
    );
    
    // Calculate realized P/L from closed trades
    const realizedPL = recentClosed.reduce((sum, trade) => 
      sum + parseFloat(trade.realizedPL || '0'), 0
    );
    
    // Get active trades
    const activeTrades = await storage.getActiveTrades(userId);
    
    // Calculate unrealized P/L (simplified - in reality would need current market prices)
    let unrealizedPL = 0;
    // TODO: Fetch current market prices and calculate unrealized P/L for active trades
    
    const totalPL = realizedPL + unrealizedPL;
    
    // Portfolio value calculation (assuming $50K starting balance)
    const basePortfolioValue = 50000;
    const portfolioValueCurrent = basePortfolioValue + realizedPL + unrealizedPL;
    const portfolioValueBefore = portfolioValueCurrent - totalPL;
    const lossPercent = portfolioValueBefore > 0 ? 
      (Math.abs(totalPL) / portfolioValueBefore) * 100 : 0;
    
    return {
      totalPL,
      realizedPL,
      unrealizedPL,
      portfolioValueBefore,
      portfolioValueCurrent,
      lossPercent
    };
  }

  /**
   * Check kill switch thresholds and trigger if needed
   */
  async checkKillSwitch(userId: string, settings: TradingSettings): Promise<{
    triggered: boolean;
    eventType: 'none' | 'warning' | 'kill_switch';
    message: string;
  }> {
    // Skip if already suspended
    if (settings.tradingSuspended) {
      return { triggered: false, eventType: 'none', message: '' };
    }
    
    const pl24h = await this.calculate24hPL(userId);
    
    // Only check if there's a loss
    if (pl24h.totalPL >= 0) {
      return { triggered: false, eventType: 'none', message: '' };
    }
    
    const killSwitchThreshold = parseFloat(settings.dailyLossKillSwitch || '7.00');
    const warningTriggerPercent = parseFloat(settings.dailyLossWarningTrigger || '75.00');
    const warningThreshold = (warningTriggerPercent / 100) * killSwitchThreshold;
    
    console.log(`\n🛡️  Kill Switch Monitor:`);
    console.log(`   24h Loss: ${pl24h.lossPercent.toFixed(2)}% ($${Math.abs(pl24h.totalPL).toFixed(2)})`);
    console.log(`   Warning Threshold: ${warningThreshold.toFixed(2)}%`);
    console.log(`   Kill Switch Threshold: ${killSwitchThreshold.toFixed(2)}%`);
    
    // Check kill switch threshold
    if (pl24h.lossPercent >= killSwitchThreshold) {
      console.log(`   🚨 KILL SWITCH TRIGGERED!`);
      
      // Close all open trades
      const closedTrades = await this.closeAllTrades(userId);
      
      // Log kill switch event
      await storage.createKillSwitchEvent({
        userId,
        eventType: 'kill_switch',
        portfolioValueBefore: pl24h.portfolioValueBefore,
        portfolioValueAfter: pl24h.portfolioValueCurrent,
        lossAmount: Math.abs(pl24h.totalPL).toString(),
        lossPercent: pl24h.lossPercent.toString(),
        killSwitchThreshold: killSwitchThreshold.toString(),
        tradesClosed: JSON.stringify(closedTrades)
      });
      
      // Suspend trading
      await storage.updateTradingSettings(userId, { tradingSuspended: true });
      
      return {
        triggered: true,
        eventType: 'kill_switch',
        message: `🚨 Kill Switch Triggered: Portfolio down ${pl24h.lossPercent.toFixed(2)}% in last 24h. All trades closed. Trading suspended.`
      };
    }
    
    // Check warning threshold
    if (pl24h.lossPercent >= warningThreshold) {
      console.log(`   ⚠️  WARNING triggered!`);
      
      // Log warning event
      await storage.createKillSwitchEvent({
        userId,
        eventType: 'warning',
        portfolioValueBefore: pl24h.portfolioValueBefore,
        portfolioValueAfter: pl24h.portfolioValueCurrent,
        lossAmount: Math.abs(pl24h.totalPL).toString(),
        lossPercent: pl24h.lossPercent.toString(),
        killSwitchThreshold: killSwitchThreshold.toString(),
        tradesClosed: JSON.stringify([])
      });
      
      return {
        triggered: true,
        eventType: 'warning',
        message: `⚠️ Portfolio down ${pl24h.lossPercent.toFixed(2)}% in last 24h. Approaching Kill Switch limit of ${killSwitchThreshold}%.`
      };
    }
    
    return { triggered: false, eventType: 'none', message: '' };
  }

  /**
   * Close all open trades (called when kill switch triggers)
   */
  private async closeAllTrades(userId: string): Promise<any[]> {
    const activeTrades = await storage.getActiveTrades(userId);
    const closedTrades = [];
    
    console.log(`   Closing ${activeTrades.length} open trades...`);
    
    for (const trade of activeTrades) {
      try {
        // Get current market price (simplified - would need real-time price)
        const exitPrice = parseFloat(trade.entryPrice) * 0.99; // Simulate 1% loss
        
        // Close the trade
        const closed = await storage.closeTrade(trade.id, exitPrice, 0, 0);
        closedTrades.push({
          symbol: trade.symbol,
          strategy: trade.strategy,
          entryPrice: trade.entryPrice,
          exitPrice: exitPrice.toString(),
          pnl: closed.realizedPL
        });
        
        console.log(`   ✓ Closed ${trade.symbol}: ${closed.realizedPL}`);
      } catch (error) {
        console.error(`   ✗ Failed to close ${trade.symbol}:`, error);
      }
    }
    
    return closedTrades;
  }

  /**
   * Calculate earnings for different time periods
   * Excludes paper trades and only includes realized P/L from live trades
   */
  async getEarnings(userId: string): Promise<{
    today: number;
    yesterday: number;
    thisWeek: number;
    thisMonth: number;
    thisYear: number;
    lifetime: number;
  }> {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
    const yesterdayEnd = todayStart;
    
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    const closedTrades = await storage.getTrades(userId, { status: 'closed' });
    
    const liveTrades = closedTrades.filter(trade => trade.mode === 'live' && trade.exitTime && trade.realizedPL);

    const safeParseFloat = (value: string | null | undefined): number => {
      if (!value) return 0;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    };

    const today = liveTrades
      .filter(trade => new Date(trade.exitTime!) >= todayStart)
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const yesterday = liveTrades
      .filter(trade => {
        const exitDate = new Date(trade.exitTime!);
        return exitDate >= yesterdayStart && exitDate < yesterdayEnd;
      })
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const thisWeek = liveTrades
      .filter(trade => new Date(trade.exitTime!) >= weekStart)
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const thisMonth = liveTrades
      .filter(trade => new Date(trade.exitTime!) >= monthStart)
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const thisYear = liveTrades
      .filter(trade => new Date(trade.exitTime!) >= yearStart)
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    const lifetime = liveTrades
      .reduce((sum, trade) => sum + safeParseFloat(trade.realizedPL), 0);

    return {
      today,
      yesterday,
      thisWeek,
      thisMonth,
      thisYear,
      lifetime
    };
  }

  /**
   * Get daily earnings data for chart
   * Returns one data point per day showing total earnings for that day
   */
  async getEarningsChartData(userId: string, days = 30): Promise<Array<{
    date: string;
    earnings: number;
    timestamp: number;
  }>> {
    const closedTrades = await storage.getTrades(userId, { status: 'closed' });
    const liveTrades = closedTrades.filter(trade => trade.mode === 'live' && trade.exitTime);

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    const dailyEarnings = new Map<string, number>();

    liveTrades.forEach(trade => {
      if (!trade.exitTime) return;
      
      const exitDate = new Date(trade.exitTime);
      if (exitDate < startDate) return;

      const dateKey = exitDate.toISOString().split('T')[0];
      const earnings = parseFloat(trade.realizedPL || '0');
      
      dailyEarnings.set(dateKey, (dailyEarnings.get(dateKey) || 0) + earnings);
    });

    const chartData: Array<{ date: string; earnings: number; timestamp: number }> = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      
      chartData.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        earnings: dailyEarnings.get(dateKey) || 0,
        timestamp: date.getTime()
      });
    }

    return chartData;
  }

  /**
   * Calculate Cash vs Crypto allocation
   */
  async getCashVsCrypto(userId: string): Promise<{
    cash: number;
    crypto: number;
    cashPercent: number;
    cryptoPercent: number;
  }> {
    const activeTrades = await storage.getActiveTrades(userId);
    const metrics = await this.getPortfolioMetrics(userId);
    
    const cryptoValue = activeTrades.reduce((sum, trade) => {
      return sum + (parseFloat(trade.entryPrice) * parseFloat(trade.quantity));
    }, 0);
    
    const totalValue = metrics.totalValue || 50000;
    const cash = totalValue - cryptoValue;
    
    const cashPercent = (cash / totalValue) * 100;
    const cryptoPercent = (cryptoValue / totalValue) * 100;

    return {
      cash,
      crypto: cryptoValue,
      cashPercent,
      cryptoPercent
    };
  }
}
