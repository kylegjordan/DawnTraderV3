import { KrakenService } from './kraken';
import { StrategyEngine } from './strategy-engine';
import { storage } from '../storage';
import { WatchlistPair } from '@shared/schema';
import { strategyAlerts } from './strategy-alerts';

export class MarketScanner {
  private kraken: KrakenService;
  private strategyEngine: StrategyEngine;
  private isScanning = false;

  constructor() {
    this.kraken = new KrakenService();
    this.strategyEngine = new StrategyEngine();
  }

  async startHourlyScanning(): Promise<void> {
    console.log('Starting 10-minute market scanning...');
    
    // Run initial scan
    await this.performScan();
    
    // Schedule 10-minute scans
    setInterval(async () => {
      if (!this.isScanning) {
        await this.performScan();
      }
    }, 10 * 60 * 1000); // 10 minutes
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
          // Phase 27.F.15.B: Use screener_filters for comprehensive filtering
          const screenerSettings = await storage.getScreenerFilters({ userId: user.id, mode: 'paper' });
          const tradingSettings = await storage.getTradingSettings(user.id);
          
          if (!screenerSettings || !tradingSettings) {
            console.log(`No settings found for user ${user.id}, skipping...`);
            continue;
          }

          console.log(`\n👤 Processing user ${user.id} with custom screener filters...`);
          
          // Apply user-specific screener filters (NO HARDCODED FALLBACKS - use database values ONLY)
          const eligiblePairs = await this.kraken.getEligiblePairs({
            minVolume: screenerSettings.minVolume || undefined,
            minDailyRange: tradingSettings.minDailyRange || undefined,
            minPrice: screenerSettings.minPrice || undefined,
            maxPrice: screenerSettings.maxPrice || undefined,
            maxBidAskSpread: screenerSettings.maxBidAskSpread || undefined,
            excludeStablecoins: screenerSettings.excludeStablecoins ?? true,
            allowedTradingPairs: [], // User explicitly requires NO currency-based filtering
            blacklistedSymbols: tradingSettings.blacklistedSymbols || [],
            whitelistedSymbols: tradingSettings.whitelistedSymbols || [],
            minHistoryDays: tradingSettings.minDataHistoryDays || undefined,
            rsiMin: screenerSettings.rsiMin || undefined,
            rsiMax: screenerSettings.rsiMax || undefined,
            volatilityMin: screenerSettings.volatilityMin || undefined,
            volatilityMax: screenerSettings.volatilityMax || undefined,
            minLiquidity: screenerSettings.minLiquidity || undefined,
            minMarketCap: screenerSettings.minMarketCap || undefined,
            allowRegulatedOnly: screenerSettings.allowRegulatedOnly ?? false
          });
          
          // Phase 27.F.15.A: Log filter diagnostics for both modes
          await this.logFilterDiagnostics(user.id, 'paper', eligiblePairs);
          await this.logFilterDiagnostics(user.id, 'live', eligiblePairs);
          
          // Update watchlists for both live and paper modes
          await this.updateUserWatchlist(user.id, 'paper', eligiblePairs);
          await this.updateUserWatchlist(user.id, 'live', eligiblePairs);
          
          // Auto-start paper simulation if user has eligible pairs and it's not already running
          await this.ensurePaperSimulationRunning(user.id, eligiblePairs);
          
          // Scan for signals in both modes
          await this.scanForSignals(user.id, 'paper');
          await this.scanForSignals(user.id, 'live');
        }
      }
      
      // Dawn Trader Phase 2: Automatic signal cleanup (runs every 10 minutes with scan)
      console.log('\n🧹 Running signal cleanup...');
      const expiredCount = await storage.expireAllExpiredSignals();
      console.log(`✅ Signal cleanup complete: ${expiredCount} expired signals removed`);

    } catch (error) {
      console.error('Error during market scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  private async getAllActiveUsers(): Promise<Array<{ id: string; tradingStatus: string }>> {
    // Query all users from the database who have trading settings
    // The scanner updates watchlists for all users, not just those actively trading
    const allUsers = await storage.getAllUsers();
    
    // Return users who have trading settings configured
    const usersWithSettings = [];
    for (const user of allUsers) {
      const settings = await storage.getTradingSettings(user.id);
      if (settings) {
        usersWithSettings.push({
          id: user.id,
          tradingStatus: user.tradingStatus || 'stopped'
        });
      }
    }
    
    console.log(`[MarketScan] Found ${usersWithSettings.length} users with trading settings`);
    return usersWithSettings;
  }

  private async updateUserWatchlist(userId: string, mode: 'live' | 'paper', eligiblePairs: any[]): Promise<void> {
    try {
      // Get current user watchlist for this mode
      const currentWatchlist = await storage.getWatchlist({ userId, mode });
      const currentSymbols = new Set(currentWatchlist.map(p => p.symbol));

      // Add new eligible pairs to watchlist
      for (const pair of eligiblePairs) {
        if (!currentSymbols.has(pair.symbol)) {
          const watchlistPair: any = {
            userId,
            mode,
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
      console.error(`Error updating ${mode} watchlist for user ${userId}:`, error);
    }
  }

  private async scanForSignals(userId: string, mode: 'live' | 'paper'): Promise<void> {
    try {
      const watchlist = await storage.getWatchlist({ userId, mode });
      const settings = await storage.getTradingSettings(userId);
      
      if (!settings) return;

      // Check if trading is suspended by kill switch
      if (settings.tradingSuspended) {
        console.log('🚨 Trading suspended by Kill Switch — strategies skipped.');
        return;
      }

      // Fetch all strategy settings for this user and mode
      const strategySettings = await storage.listStrategySettings({ userId, mode });

      for (const pair of watchlist) {
        await this.analyzeSymbolForSignals(userId, pair, settings, strategySettings, mode);
        
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
    settings: any,
    strategySettings: any[],
    mode: 'live' | 'paper'
  ): Promise<void> {
    try {
      // Get price data for analysis
      const ohlcData = await this.kraken.getOHLCData(pair.symbol, 60); // 1-hour candles
      if (!ohlcData.ohlc || ohlcData.ohlc.length < 20) return;

      // Convert to our PriceData format
      const priceData = ohlcData.ohlc.map((candle, index) => ({
        id: `${pair.symbol}-${candle.time}-${index}`,
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

      // Helper function to get strategy params
      const getStrategyParams = (strategyName: string) => {
        const strategySetting = strategySettings.find(s => s.strategy === strategyName && s.enabled);
        return strategySetting?.params || null;
      };

      // Check all 8 strategies for signals
      console.log(`\n🔍 Analyzing ${pair.symbol} for strategy signals...`);
      const signals = [];

      // Original 3 strategies (still using TradingSettings)
      signals.push(this.strategyEngine.detectVWAPPullback(indicators, settings, priceData));
      signals.push(this.strategyEngine.detectABCDLong(priceData, settings));
      signals.push(this.strategyEngine.detectSMATrendRide(indicators, priceData, settings));

      // New 5 strategies (using strategy-specific params)
      const breakoutParams = getStrategyParams('breakout');
      if (breakoutParams) {
        signals.push(this.strategyEngine.detectBreakout(priceData, breakoutParams));
      }

      const meanReversionParams = getStrategyParams('mean_reversion');
      if (meanReversionParams) {
        signals.push(this.strategyEngine.detectMeanReversion(indicators, priceData, meanReversionParams));
      }

      const rangeTradingParams = getStrategyParams('range_trading');
      if (rangeTradingParams) {
        signals.push(this.strategyEngine.detectRangeTrading(priceData, rangeTradingParams));
      }

      const vwapBounceParams = getStrategyParams('vwap_bounce');
      if (vwapBounceParams) {
        signals.push(this.strategyEngine.detectVWAPBounce(indicators, priceData, vwapBounceParams));
      }

      const liquidityTrapParams = getStrategyParams('liquidity_trap');
      if (liquidityTrapParams) {
        signals.push(this.strategyEngine.detectLiquidityTrap(priceData, liquidityTrapParams));
      }

      // Filter out null signals
      const validSignals = signals.filter(signal => signal !== null);

      // ===== TELEMETRY: Signal Counter Logging =====
      if (validSignals.length > 0) {
        const signalsByStrategy = validSignals.reduce((acc: Record<string, number>, signal: any) => {
          acc[signal.strategy] = (acc[signal.strategy] || 0) + 1;
          return acc;
        }, {});
        console.log(`📊 [TELEMETRY] Signals generated for ${pair.symbol}:`, signalsByStrategy);
      }

      // Apply conflict resolution if multiple signals found
      let resolvedSignals = validSignals;
      let skippedSignals: any[] = [];
      if (validSignals.length > 1) {
        resolvedSignals = this.resolveConflicts(validSignals, strategySettings);
        skippedSignals = validSignals.filter(s => !resolvedSignals.includes(s));
        console.log(`⚖️ Conflict resolution: ${validSignals.length} signals → ${resolvedSignals.length} resolved for ${pair.symbol}`);
        
        // ===== TELEMETRY: Skipped Signals =====
        if (skippedSignals.length > 0) {
          console.log(`📊 [TELEMETRY] Skipped signals (conflict resolution):`, 
            skippedSignals.map(s => `${s.strategy}(conf=${s.confidence})`).join(', '));
        }

        // ===== ALERT: Conflict Resolution =====
        strategyAlerts.conflictResolution(
          userId,
          pair.symbol,
          validSignals.length,
          resolvedSignals.length,
          skippedSignals.map(s => s.strategy)
        );
      }

      // Process any found signals
      if (resolvedSignals.length > 0) {
        console.log(`✅ Found ${resolvedSignals.length} signal(s) for ${pair.symbol}`);
      }
      
      for (const signal of resolvedSignals) {
        if (signal) {
          signal.symbol = pair.symbol;
          await this.processSignal(userId, mode, signal, pair, indicators);
        }
      }

    } catch (error) {
      console.error(`Error analyzing ${pair.symbol} for user ${userId}:`, error);
    }
  }

  /**
   * Resolve conflicts when multiple strategies trigger on the same symbol
   * Strategy: BEST SCORE WINS - Only 1 signal per asset
   * Prioritization (deterministic):
   * 1. Strategy weight (from settings)
   * 2. Signal confidence
   * 3. Strategy name (alphabetical, for determinism)
   */
  private resolveConflicts(signals: any[], strategySettings: any[]): any[] {
    // Get strategy weight for each signal
    const signalsWithWeight = signals.map(signal => {
      const setting = strategySettings.find(s => s.strategy === signal.strategy);
      const weight = setting?.weight ?? 1.0; // Default weight = 1.0
      return { signal, weight };
    });

    // Sort by: weight (desc) → confidence (desc) → strategy name (asc for determinism)
    signalsWithWeight.sort((a, b) => {
      // 1. Higher weight wins
      if (a.weight !== b.weight) {
        return b.weight - a.weight;
      }
      // 2. Higher confidence wins
      if (a.signal.confidence !== b.signal.confidence) {
        return b.signal.confidence - a.signal.confidence;
      }
      // 3. Alphabetical strategy name (deterministic tiebreaker)
      return a.signal.strategy.localeCompare(b.signal.strategy);
    });

    // Take only the best signal (prevents over-exposure to single asset)
    const bestSignal = signalsWithWeight[0].signal;

    // Log conflict resolution details
    if (signals.length > 1) {
      const dropped = signals.length - 1;
      console.log(`📉 Conflict resolution: ${signals.length} signals → BEST SCORE WINS`);
      console.log(`  ✅ Selected: ${bestSignal.strategy} (weight=${signalsWithWeight[0].weight}, conf=${bestSignal.confidence})`);
      console.log(`  ❌ Dropped: ${dropped} signal(s):`, 
        signalsWithWeight.slice(1).map(s => `${s.signal.strategy}(w=${s.weight},c=${s.signal.confidence})`).join(', '));
    }

    return [bestSignal];
  }

  private async processSignal(
    userId: string, 
    mode: 'live' | 'paper',
    signal: any, 
    pair: WatchlistPair,
    indicators: any
  ): Promise<void> {
    console.log(`Signal detected for user ${userId}:`, {
      symbol: signal.symbol,
      strategy: signal.strategy,
      confidence: signal.confidence,
      entry: signal.entryPrice,
      stop: signal.stopPrice,
      target: signal.targetPrice
    });

    try {
      // Parse symbol to extract base and quote currencies (e.g., "BTCUSD" -> "BTC", "USD")
      const symbolParts = signal.symbol.match(/^([A-Z]+)(USD|USDT|EUR|GBP)$/);
      const baseCurrency = symbolParts ? symbolParts[1] : signal.symbol.slice(0, -3);
      const quoteCurrency = symbolParts ? symbolParts[2] : signal.symbol.slice(-3);

      // Save signal to database with 24-hour expiration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await storage.saveTradingSignal({
        userId,
        mode,
        symbol: signal.symbol,
        baseCurrency,
        quoteCurrency,
        strategy: signal.strategy,
        confidence: signal.confidence.toString(),
        entryPrice: signal.entryPrice.toString(),
        stopPrice: signal.stopPrice.toString(),
        targetPrice: signal.targetPrice.toString(),
        currentPrice: (pair.currentPrice || indicators.currentPrice.toString()),
        vwap: indicators.vwap?.toString() || pair.vwap,
        volume24h: pair.volume24h,
        dailyRange: pair.dailyRange,
        status: 'active',
        expiresAt,
        metadata: {
          detectedBy: 'market_scanner',
          scanCycle: new Date().toISOString()
        }
      });

      console.log(`✅ Trading signal saved to database for ${signal.symbol}`);
      
      // Clean up expired signals for this user/mode (older than 24 hours)
      const expirationCutoff = new Date();
      expirationCutoff.setHours(expirationCutoff.getHours() - 24);
      await storage.expireOldSignals({ userId, mode, beforeDate: expirationCutoff });
      
    } catch (error) {
      console.error(`Error saving trading signal for ${signal.symbol}:`, error);
    }
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

  /**
   * Phase 27.F.15.A/B: Log comprehensive filter diagnostics to database
   * This enables the Filtered Pairs widget to show real-time scan statistics
   * with detailed breakdown by filter type
   */
  private async logFilterDiagnostics(
    userId: string, 
    mode: 'live' | 'paper', 
    eligiblePairs: any[]
  ): Promise<void> {
    try {
      // Get total universe count
      const tickers = await this.kraken.getTicker();
      const pairsScanned = Object.keys(tickers).length;
      const eligibleCount = eligiblePairs.length;
      
      // Calculate overall stats
      const failurePercent = pairsScanned > 0 
        ? ((pairsScanned - eligibleCount) / pairsScanned * 100).toFixed(2)
        : '0';
      
      // Determine top failure reason
      // Since we don't have access to exclusionReasons here, we use the same heuristic
      // The detailed breakdown is available via /api/paper-sim/diagnostics/scan
      let topFailureReason = 'Quote Currency Filter';
      
      if (parseFloat(failurePercent) > 90) {
        topFailureReason = 'Quote Currency Filter';
      } else if (parseFloat(failurePercent) > 50) {
        topFailureReason = 'Min Volume';
      } else if (eligibleCount > 0) {
        topFailureReason = 'Daily Range';
      }
      
      // Log to database
      await storage.logFilterDiagnostic({
        userId,
        mode,
        pairsScanned,
        eligiblePairs: eligibleCount,
        topFailureReason,
        failurePercent
      });
      
      console.log(`📊 [FilterDiag] ${mode}: scanned=${pairsScanned}, eligible=${eligibleCount} (${(100 - parseFloat(failurePercent)).toFixed(1)}%)`);
    } catch (error) {
      console.error(`Error logging filter diagnostics for user ${userId} (${mode}):`, error);
    }
  }

  /**
   * Auto-start paper simulation for users with eligible pairs
   * SAFETY: Respects kill switch, trading status, and manual stops
   */
  private async ensurePaperSimulationRunning(userId: string, eligiblePairs: any[]): Promise<void> {
    try {
      // Only auto-start if user has eligible pairs
      if (eligiblePairs.length === 0) {
        console.log(`[MarketScan:AutoStart] User ${userId} has no eligible pairs, skipping auto-start`);
        return;
      }

      // SAFETY CHECK 1: Respect trading settings (kill switch, etc.)
      const settings = await storage.getTradingSettings(userId);
      if (!settings) {
        console.log(`[MarketScan:AutoStart] User ${userId} has no trading settings, skipping auto-start`);
        return;
      }

      // SAFETY CHECK 2: Respect kill switch (trading suspended)
      if (settings.tradingSuspended) {
        console.log(`[MarketScan:AutoStart] User ${userId} has trading suspended (kill switch), skipping auto-start`);
        return;
      }

      // SAFETY CHECK 3: Check if user opted into auto-start
      if (!settings.autoStartPaperTrading) {
        console.log(`[AutoStart] User ${userId} has not enabled auto-start (autoStartPaperTrading=false)`);
        return;
      }

      // SAFETY CHECK 4: Check user trading status
      const user = await storage.getUser(userId);
      if (!user) {
        console.log(`[AutoStart] User ${userId} not found, skipping auto-start`);
        return;
      }

      // SAFETY CHECK 5: Respect manual stops - check if user manually stopped trading
      if (user.tradingStatus === 'stopped') {
        console.log(`[AutoStart] User ${userId} manually stopped trading, skipping auto-start`);
        return;
      }

      // Check if paper simulation is already running for this user
      // We do this by attempting to import the paper sim service and checking the global managers map
      const paperSimModule = await import('./paper-sim-service.js');
      
      // The paper-sim-service maintains a Map of active sessions
      // We can call startPaperSimulation - it has its own guard clause for already-running sessions
      
      // All safety checks passed - attempt to start paper simulation
      console.log(`\n🚀 [AutoStart] ============================================`);
      console.log(`[AutoStart] Attempting to start paper trading for user ${userId}`);
      console.log(`[AutoStart] Eligible pairs: ${eligiblePairs.length}`);
      console.log(`[AutoStart] Trigger: Market scan found eligible pairs`);
      console.log(`[AutoStart] Kill switch: OFF`);
      console.log(`[AutoStart] Manual stop: NO`);
      console.log(`[AutoStart] ============================================\n`);
      
      const result = await paperSimModule.startPaperSimulation(userId, {
        startingBalance: 10000,
        startedBy: 'market_scanner_auto',
        metadata: {
          autoStarted: true,
          triggerReason: 'eligible_pairs_found',
          eligiblePairCount: eligiblePairs.length,
          timestamp: new Date().toISOString()
        }
      });

      if (result.success) {
        console.log(`✅ [AutoStart] Paper trading started successfully for user ${userId}`);
      } else {
        // Could be already running, which is fine
        if (result.error && result.error.includes('already running')) {
          console.log(`[AutoStart] Paper trading already running for user ${userId} - no action needed`);
        } else {
          console.error(`❌ [AutoStart] Failed to start paper trading for user ${userId}:`, result.error);
        }
      }
    } catch (error) {
      console.error(`[MarketScan:AutoStart] Error in auto-start check for user ${userId}:`, error);
    }
  }
}
