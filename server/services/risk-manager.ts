import { storage } from '../storage';
import { TradingSettings } from '@shared/schema';
import { TradeSignal } from './trading-engine';
import { KrakenService } from './kraken';
import { marketDataService } from './market-data';
import { AssetCapabilitiesService } from './asset-capabilities';

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
}

interface BalanceCache {
  totalValueUSD: number;
  cashUSD: number;
  cryptoUSD: number;
  syncTimestamp: number;
  source: 'kraken' | 'internal';
  error?: string;
}

export class RiskManager {
  private krakenService: KrakenService;
  private assetCapabilitiesService: AssetCapabilitiesService;
  private balanceCacheMap: Map<string, BalanceCache> = new Map();
  private readonly BALANCE_CACHE_TTL = 45000;

  constructor() {
    this.krakenService = new KrakenService();
    this.assetCapabilitiesService = new AssetCapabilitiesService();
  }

  /**
   * Fetch live Kraken account balance and convert all holdings to USD
   * Uses 45-second cache to avoid excessive API calls
   * Falls back to internal calculation if Kraken API fails
   */
  async getLiveKrakenBalance(userId: string): Promise<{
    totalValueUSD: number;
    cashUSD: number;
    cryptoUSD: number;
    syncTimestamp: number;
    source: 'kraken' | 'internal';
    error?: string;
  }> {
    const cachedBalance = this.balanceCacheMap.get(userId);
    if (cachedBalance && Date.now() - cachedBalance.syncTimestamp < this.BALANCE_CACHE_TTL) {
      console.log(`[Portfolio:${userId}] Using cached balance (${Math.floor((Date.now() - cachedBalance.syncTimestamp) / 1000)}s old)`);
      return cachedBalance;
    }

    try {
      console.log(`[Portfolio:${userId}] Fetching live Kraken balance...`);
      const balances = await this.krakenService.getAccountBalance();
      
      let cashUSD = 0;
      let cryptoUSD = 0;
      
      const USD_ASSETS = ['ZUSD', 'USD', 'USDT', 'USDC', 'DAI'];
      
      for (const [asset, balance] of Object.entries(balances)) {
        const amount = parseFloat(balance);
        if (amount === 0) continue;
        
        const normalizedAsset = asset.replace(/^[XZ]/, '');
        
        if (USD_ASSETS.includes(asset) || USD_ASSETS.includes(normalizedAsset)) {
          cashUSD += amount;
          console.log(`  [Portfolio:${userId}] ${asset}: $${amount.toFixed(2)} (USD)`);
        } else {
          try {
            const marketData = await marketDataService.getMarketData(normalizedAsset);
            const valueUSD = amount * marketData.price;
            cryptoUSD += valueUSD;
            console.log(`  [Portfolio:${userId}] ${asset}: ${amount.toFixed(8)} × $${marketData.price.toFixed(2)} = $${valueUSD.toFixed(2)}`);
          } catch (error) {
            console.warn(`  [Portfolio:${userId}] Failed to get price for ${asset}, skipping:`, error);
          }
        }
      }
      
      const totalValueUSD = cashUSD + cryptoUSD;
      
      console.log(`[Portfolio:${userId}] Kraken balance: $${totalValueUSD.toFixed(2)} (Cash: $${cashUSD.toFixed(2)}, Crypto: $${cryptoUSD.toFixed(2)})`);
      
      const krakenBalance = {
        totalValueUSD,
        cashUSD,
        cryptoUSD,
        syncTimestamp: Date.now(),
        source: 'kraken' as const
      };
      
      this.balanceCacheMap.set(userId, krakenBalance);
      return krakenBalance;
    } catch (error: any) {
      console.error(`[Portfolio:${userId}] Failed to fetch Kraken balance, falling back to internal calculation:`, error.message);
      
      const metrics = await this.getPortfolioMetrics(userId);
      const cashCrypto = await this.getCashVsCrypto(userId);
      
      const fallbackResult = {
        totalValueUSD: metrics.totalValue,
        cashUSD: cashCrypto.cash,
        cryptoUSD: cashCrypto.crypto,
        syncTimestamp: Date.now(),
        source: 'internal' as const,
        error: 'Kraken API unavailable'
      };
      
      this.balanceCacheMap.set(userId, fallbackResult);
      return fallbackResult;
    }
  }

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

    // Check 1: Stop-loss validation (Task 8 Safety Guardrail - MOVED TO TOP)
    const stopLossCheck = this.checkStopLossRequired(signal);
    if (!stopLossCheck.approved) {
      return stopLossCheck;
    }

    // Check 2: Max 1 position per asset (Task 8 Safety Guardrail - MOVED TO TOP)
    const assetCheck = await this.checkMaxPositionsPerAsset(userId, signal);
    if (!assetCheck.approved) {
      return assetCheck;
    }

    // Check 3: Position size cap (Task 8 Safety Guardrail - MOVED BEFORE EXPOSURE)
    const positionSizeCheck = await this.checkPositionSizeCap(userId, signal, settings);
    if (!positionSizeCheck.approved) {
      return positionSizeCheck;
    }

    // Check 4: Risk per trade
    const riskCheck = await this.checkRiskPerTrade(signal, settings);
    if (!riskCheck.approved) {
      return riskCheck;
    }

    // Check 5: Available balance (for live trading)
    const balanceCheck = await this.checkAvailableBalance(userId, signal, settings);
    if (!balanceCheck.approved) {
      return balanceCheck;
    }

    // Check 6: Maximum concurrent exposure
    const exposureCheck = await this.checkMaxExposure(userId, signal, settings);
    if (!exposureCheck.approved) {
      return exposureCheck;
    }

    // Check 7: Maximum open trades
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
      const riskAmount = parseFloat(settings.riskPerTrade || '0');
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
    const riskAmount = parseFloat(settings.riskPerTrade || '0');
    
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
    const maxExposurePercent = parseFloat(settings.maxExposurePercent || '0');

    // Calculate current exposure
    let currentExposure = 0;
    for (const trade of activeTrades) {
      const tradeValue = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
      currentExposure += tradeValue;
    }

    // Calculate new trade exposure
    const riskAmount = parseFloat(settings.riskPerTrade || '0');
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
    const maxOpenTrades = settings.maxOpenTrades || 0;

    if (activeTrades.length >= maxOpenTrades) {
      return {
        approved: false,
        reason: `Maximum open trades limit reached (${maxOpenTrades})`
      };
    }

    return { approved: true };
  }

  /**
   * Task 8 Safety Guardrail: Max 1 position per asset
   * Prevents multiple simultaneous positions in the same asset
   */
  private async checkMaxPositionsPerAsset(
    userId: string,
    signal: TradeSignal
  ): Promise<RiskCheckResult> {
    const activeTrades = await storage.getActiveTrades(userId);
    
    // Extract base asset from symbol - handles all Kraken variants
    // Kraken uses: XXBTZUSD (double prefix), XBTUSD, XBT/USD, BTC/USD
    const normalizeSymbol = (symbol: string): string => {
      // Strip all X and Z prefixes from start (Kraken adds X for crypto, Z for fiat)
      let normalized = symbol.replace(/^[XZ]+/, '');
      
      // Remove quote currency (USD variants and slashes)
      normalized = normalized.replace(/\/USD|USD|ZUSD|\/ZUSD/g, '');
      
      // Map Kraken's XBT to standard BTC
      if (normalized === 'BT') {
        normalized = 'BTC';
      }
      
      return normalized;
    };
    
    const normalizedSymbol = normalizeSymbol(signal.symbol);
    
    const existingPosition = activeTrades.find(trade => {
      const tradeSymbol = normalizeSymbol(trade.symbol);
      return tradeSymbol === normalizedSymbol;
    });

    if (existingPosition) {
      return {
        approved: false,
        reason: `🛡️ Safety: Already have an open position in ${normalizedSymbol}. Max 1 position per asset allowed.`
      };
    }

    return { approved: true };
  }

  /**
   * Task 8 Safety Guardrail: Stop-loss required
   * Ensures every trade has a stop-loss defined
   */
  private checkStopLossRequired(signal: TradeSignal): RiskCheckResult {
    if (!signal.stopPrice || signal.stopPrice === 0) {
      return {
        approved: false,
        reason: '🛡️ Safety: Stop-loss is required for all trades'
      };
    }

    // Validate stop-loss is on correct side for long positions
    if (signal.stopPrice >= signal.entryPrice) {
      return {
        approved: false,
        reason: '🛡️ Safety: Stop-loss must be below entry price for long positions'
      };
    }

    return { approved: true };
  }

  /**
   * Task 8 Safety Guardrail: Position size cap
   * Prevents oversized positions (max 10% of portfolio per position)
   */
  private async checkPositionSizeCap(
    userId: string,
    signal: TradeSignal,
    settings: TradingSettings
  ): Promise<RiskCheckResult> {
    const riskAmount = parseFloat(settings.riskPerTrade || '0');
    const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
    
    if (stopDistance === 0) {
      return { approved: true }; // Can't calculate if no stop distance
    }
    
    const positionSize = riskAmount / stopDistance;
    const positionValue = positionSize * signal.entryPrice;

    // Get portfolio value - prefer settings.portfolioValue, fallback to metrics
    let portfolioValue = settings.portfolioValue ? parseFloat(settings.portfolioValue.toString()) : 0;
    
    if (portfolioValue === 0) {
      const metrics = await this.getPortfolioMetrics(userId, settings.mode);
      portfolioValue = metrics.totalValue || 50000;
    }
    
    // Maximum single position: 10% of portfolio
    const MAX_POSITION_PERCENT = 10;
    const maxPositionValue = (portfolioValue * MAX_POSITION_PERCENT) / 100;
    const positionPercent = (positionValue / portfolioValue) * 100;

    console.log(`[Position Size Cap] Risk=${riskAmount}, Stop=${stopDistance}, Qty=${positionSize.toFixed(2)}, Value=$${positionValue.toFixed(0)} (${positionPercent.toFixed(1)}% of $${portfolioValue.toFixed(0)} portfolio), Max=${MAX_POSITION_PERCENT}%`);

    if (positionPercent > MAX_POSITION_PERCENT) {
      return {
        approved: false,
        reason: `🛡️ Safety: Position size (${positionPercent.toFixed(1)}% = $${positionValue.toFixed(2)}) exceeds ${MAX_POSITION_PERCENT}% portfolio limit ($${maxPositionValue.toFixed(2)})`
      };
    }

    return { approved: true };
  }

  /**
   * Calculate position size based on risk amount and asset capabilities
   * Uses capability-aware sizing for fractional vs whole shares
   * @param symbol Trading pair symbol (e.g., 'BTC/USD', 'AAPL/USD')
   * @param riskAmount Risk amount in USD
   * @param entryPrice Entry price
   * @param stopPrice Stop loss price
   * @returns Position size object with quantity, notional value, and capability info
   */
  async calculatePositionSize(
    symbol: string,
    riskAmount: number,
    entryPrice: number,
    stopPrice: number
  ): Promise<{
    quantity: number;
    notionalValue: number;
    isFractional: boolean;
    meetsMinimum: boolean;
    reason?: string;
  }> {
    const stopDistance = Math.abs(entryPrice - stopPrice);
    if (stopDistance === 0) {
      return {
        quantity: 0,
        notionalValue: 0,
        isFractional: true,
        meetsMinimum: false,
        reason: 'Stop distance is zero'
      };
    }
    
    // Calculate position size in units based on risk
    // Formula: quantity = riskAmount / stopDistance
    const quantity = riskAmount / stopDistance;
    
    // Calculate notional value (max investment in USD)
    const maxInvestment = quantity * entryPrice;
    
    // Try to get asset capabilities for sizing rules
    try {
      const sizing = await this.assetCapabilitiesService.calculatePositionSize({
        symbol,
        maxInvestment,
        price: entryPrice
      });
      return sizing;
    } catch (error) {
      // Fallback: use basic calculation if capabilities not available
      console.warn(`[RiskManager] Asset capabilities not available for ${symbol}, using basic sizing:`, error);
      return {
        quantity,
        notionalValue: maxInvestment,
        isFractional: true,
        meetsMinimum: true,
        reason: 'Using basic sizing (capabilities unavailable)'
      };
    }
  }
  
  /**
   * Legacy method for backward compatibility
   * @deprecated Use calculatePositionSize with symbol parameter instead
   */
  calculatePositionSizeBasic(
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

  async getPortfolioMetrics(userId: string, mode?: 'live' | 'paper'): Promise<{
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

    // Get base portfolio value from settings if available
    let baseValue = 50000; // Default fallback
    if (mode) {
      const settings = await storage.getTradingSettings(userId, mode);
      if (settings?.portfolioValue) {
        baseValue = parseFloat(settings.portfolioValue.toString());
      }
    }

    // Total value = base + realized P/L + unrealized P/L
    const totalValue = baseValue + realizedPL + unrealizedPL;

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
  async calculate24hPL(userId: string, settings?: TradingSettings): Promise<{
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
    
    // ✅ FIXED: Use actual portfolio value from settings instead of hardcoded value
    let basePortfolioValue = 50000; // Fallback only
    if (settings?.portfolioValue) {
      basePortfolioValue = parseFloat(settings.portfolioValue.toString());
    } else {
      // Try to get from storage if settings not provided
      const userSettings = await storage.getTradingSettings(userId);
      if (userSettings?.portfolioValue) {
        basePortfolioValue = parseFloat(userSettings.portfolioValue.toString());
      }
    }
    
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
    
    const pl24h = await this.calculate24hPL(userId, settings);
    
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
        portfolioValueBefore: pl24h.portfolioValueBefore.toString(),
        portfolioValueAfter: pl24h.portfolioValueCurrent.toString(),
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
        portfolioValueBefore: pl24h.portfolioValueBefore.toString(),
        portfolioValueAfter: pl24h.portfolioValueCurrent.toString(),
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
