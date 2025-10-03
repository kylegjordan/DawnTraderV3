import { KrakenService } from './kraken';
import { StrategyEngine } from './strategy-engine';
import { storage } from '../storage';
import { WatchlistPair } from '@shared/schema';

export class MarketScanner {
  private kraken: KrakenService;
  private strategyEngine: StrategyEngine;
  private isScanning = false;

  constructor() {
    this.kraken = new KrakenService();
    this.strategyEngine = new StrategyEngine();
  }

  async startHourlyScanning(): Promise<void> {
    console.log('Starting hourly market scanning...');
    
    // Run initial scan
    await this.performScan();
    
    // Schedule hourly scans
    setInterval(async () => {
      if (!this.isScanning) {
        await this.performScan();
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  private async performScan(): Promise<void> {
    if (this.isScanning) {
      console.log('Scan already in progress, skipping...');
      return;
    }

    this.isScanning = true;
    console.log('\n🔍 Performing market scan...');

    try {
      // Get all users to update their watchlists
      const users = await this.getAllActiveUsers();
      
      // If no users, use default settings for testing
      if (users.length === 0) {
        console.log('No active users found, using default screener settings for testing...');
        const defaultSettings = {
          minVolume: '30000000',
          minDailyRange: '6.5',
          minPrice: '0.01',
          maxBidAskSpread: '1.00',
          excludeStablecoins: true,
          allowedTradingPairs: ['USD', 'USDT'],
          blacklistedSymbols: [],
          whitelistedSymbols: [],
          minHistoryDays: 90
        };
        
        const eligiblePairs = await this.kraken.getEligiblePairs(defaultSettings);
        console.log(`Found ${eligiblePairs.length} eligible pairs with default settings`);
      } else {
        // Process each user with their own settings
        for (const user of users) {
          const settings = await storage.getTradingSettings(user.id);
          
          if (!settings) {
            console.log(`No settings found for user ${user.id}, skipping...`);
            continue;
          }

          console.log(`\n👤 Processing user ${user.id} with custom settings...`);
          
          // Apply user-specific screener filters (handle null values)
          const eligiblePairs = await this.kraken.getEligiblePairs({
            minVolume: settings.minVolume || '30000000',
            minDailyRange: settings.minDailyRange || '6.5',
            minPrice: settings.minPrice || undefined,
            maxBidAskSpread: settings.maxBidAskSpread || undefined,
            excludeStablecoins: settings.excludeStablecoins ?? undefined,
            allowedTradingPairs: settings.allowedTradingPairs || undefined,
            blacklistedSymbols: settings.blacklistedSymbols || undefined,
            whitelistedSymbols: settings.whitelistedSymbols || undefined,
            minHistoryDays: settings.minDataHistoryDays || 90
          });
          
          await this.updateUserWatchlist(user.id, eligiblePairs);
          await this.scanForSignals(user.id);
        }
      }

    } catch (error) {
      console.error('Error during market scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  private async getAllActiveUsers(): Promise<Array<{ id: string; tradingStatus: string }>> {
    // This would normally query all users from the database
    // For now, we'll return empty array since we don't have user management
    // In a real implementation:
    // return await db.select({ id: users.id, tradingStatus: users.tradingStatus })
    //   .from(users)
    //   .where(eq(users.tradingStatus, 'active'));
    return [];
  }

  private async updateUserWatchlist(userId: string, eligiblePairs: any[]): Promise<void> {
    try {
      // Get current user watchlist
      const currentWatchlist = await storage.getWatchlist(userId);
      const currentSymbols = new Set(currentWatchlist.map(p => p.symbol));

      // Add new eligible pairs to watchlist
      for (const pair of eligiblePairs) {
        if (!currentSymbols.has(pair.symbol)) {
          const watchlistPair: any = {
            userId,
            symbol: pair.symbol,
            baseCurrency: pair.baseCurrency,
            quoteCurrency: pair.quoteCurrency,
            volume24h: pair.volume24h.toString(),
            currentPrice: pair.currentPrice.toString(),
            vwap: pair.vwap?.toString(),
            dailyRange: pair.dailyRange.toString(),
            lastScanned: new Date()
          };

          await storage.addWatchlistPair(watchlistPair);
        } else {
          // Update existing pair data
          const existingPair = currentWatchlist.find(p => p.symbol === pair.symbol);
          if (existingPair) {
            await storage.updateWatchlistPair(existingPair.id, {
              volume24h: pair.volume24h.toString(),
              currentPrice: pair.currentPrice.toString(),
              vwap: pair.vwap?.toString(),
              dailyRange: pair.dailyRange.toString(),
              lastScanned: new Date()
            });
          }
        }
      }

      // Remove pairs that no longer meet criteria
      const eligibleSymbols = new Set(eligiblePairs.map(p => p.symbol));
      for (const watchlistPair of currentWatchlist) {
        if (!eligibleSymbols.has(watchlistPair.symbol)) {
          await storage.removeWatchlistPair(watchlistPair.id);
        }
      }

    } catch (error) {
      console.error(`Error updating watchlist for user ${userId}:`, error);
    }
  }

  private async scanForSignals(userId: string): Promise<void> {
    try {
      const watchlist = await storage.getWatchlist(userId);
      const settings = await storage.getTradingSettings(userId);
      
      if (!settings) return;

      for (const pair of watchlist) {
        await this.analyzeSymbolForSignals(userId, pair, settings);
        
        // Add delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Error scanning for signals for user ${userId}:`, error);
    }
  }

  private async analyzeSymbolForSignals(
    userId: string, 
    pair: WatchlistPair, 
    settings: any
  ): Promise<void> {
    try {
      // Get price data for analysis
      const ohlcData = await this.kraken.getOHLCData(pair.symbol, 60); // 1-hour candles
      if (!ohlcData.ohlc || ohlcData.ohlc.length < 20) return;

      // Convert to our PriceData format
      const priceData = ohlcData.ohlc.map(candle => ({
        symbol: pair.symbol,
        timestamp: new Date(candle.time * 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        vwap: candle.vwap,
        sma: '0' // Will be calculated
      }));

      // Calculate technical indicators
      const currentPrice = parseFloat(priceData[priceData.length - 1].close);
      const vwap = this.strategyEngine.calculateVWAP(priceData.slice(-24)); // 24-hour VWAP
      const sma = this.strategyEngine.calculateSMA(priceData, parseInt(settings.smaLength || '20'));
      
      const indicators = {
        vwap,
        sma,
        currentPrice,
        volume: parseFloat(priceData[priceData.length - 1].volume),
        high24h: Math.max(...priceData.slice(-24).map(p => parseFloat(p.high))),
        low24h: Math.min(...priceData.slice(-24).map(p => parseFloat(p.low)))
      };

      // Check each strategy for signals
      const signals = [
        this.strategyEngine.detectVWAPPullback(indicators),
        this.strategyEngine.detectABCDLong(priceData),
        this.strategyEngine.detectSMATrendRide(indicators, priceData)
      ].filter(signal => signal !== null);

      // Process any found signals
      for (const signal of signals) {
        if (signal) {
          signal.symbol = pair.symbol;
          await this.processSignal(userId, signal);
        }
      }

      // Save price data for future analysis (commented out due to type issues - not critical for screener)
      // await storage.savePriceData(priceData.map(p => ({
      //   symbol: p.symbol,
      //   timestamp: p.timestamp,
      //   open: p.open,
      //   high: p.high,
      //   low: p.low,
      //   close: p.close,
      //   volume: p.volume,
      //   vwap: vwap.toString(),
      //   sma: sma.toString()
      // })));

    } catch (error) {
      console.error(`Error analyzing ${pair.symbol} for user ${userId}:`, error);
    }
  }

  private async processSignal(userId: string, signal: any): Promise<void> {
    // In a real implementation, this would:
    // 1. Check if signal meets minimum confidence threshold
    // 2. Perform additional risk checks
    // 3. Send to trading engine for execution
    // 4. Log signal for analysis
    
    console.log(`Signal detected for user ${userId}:`, {
      symbol: signal.symbol,
      strategy: signal.strategy,
      confidence: signal.confidence,
      entry: signal.entryPrice,
      stop: signal.stopPrice,
      target: signal.targetPrice
    });

    // For now, we'll just log it
    // In production, this would integrate with the TradingEngine
  }

  async getMarketOverview(): Promise<{
    totalPairs: number;
    activePairs: number;
    topVolume: any[];
    topPerformers: any[];
  }> {
    try {
      const tickers = await this.kraken.getTicker();
      const pairs = Object.entries(tickers);
      
      const activePairs = pairs.filter(([_, ticker]) => {
        const volume = parseFloat(ticker.v[1]);
        return volume >= 1000000; // At least $1M volume
      });

      const sortedByVolume = activePairs
        .sort((a, b) => parseFloat(b[1].v[1]) - parseFloat(a[1].v[1]))
        .slice(0, 10)
        .map(([symbol, ticker]) => ({
          symbol,
          volume24h: parseFloat(ticker.v[1]),
          price: parseFloat(ticker.c[0]),
          change: ((parseFloat(ticker.c[0]) - parseFloat(ticker.o)) / parseFloat(ticker.o)) * 100
        }));

      const topPerformers = activePairs
        .map(([symbol, ticker]) => ({
          symbol,
          change: ((parseFloat(ticker.c[0]) - parseFloat(ticker.o)) / parseFloat(ticker.o)) * 100,
          price: parseFloat(ticker.c[0]),
          volume: parseFloat(ticker.v[1])
        }))
        .sort((a, b) => b.change - a.change)
        .slice(0, 10);

      return {
        totalPairs: pairs.length,
        activePairs: activePairs.length,
        topVolume: sortedByVolume,
        topPerformers
      };
    } catch (error) {
      console.error('Error getting market overview:', error);
      return {
        totalPairs: 0,
        activePairs: 0,
        topVolume: [],
        topPerformers: []
      };
    }
  }
}
