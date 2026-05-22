import { KrakenService } from '../exchanges/kraken/kraken.js';
import { StrategyEngine, type TechnicalIndicators, type StrategySignal } from './strategy-engine';
import { storage } from '../storage';
import { buildSettingsFromGuardrails } from './guardrail-settings';
import type { TradingSettings, InsertHistoricSignal, PriceData } from '@shared/schema';

// Simple symbol to Kraken pair mapping (for user convenience)
// Kraken accepts simplified names (XBTUSD, ETHUSD) but returns data under normalized keys (XXBTZUSD, XETHZUSD)
const SYMBOL_MAPPING: Record<string, string> = {
  'BTCUSD': 'XBTUSD',      // Bitcoin uses XBT per ISO 4217
  'ETHUSD': 'ETHUSD',
  'SOLUSD': 'SOLUSD',
  'ADAUSD': 'ADAUSD',
  'DOTUSD': 'DOTUSD',
  'AVAXUSD': 'AVAXUSD',
  'LINKUSD': 'LINKUSD',
  'UNIUSD': 'UNIUSD',
  'ATOMUSD': 'ATOMUSD',
  'XRPUSD': 'XRPUSD',
  'DOGEUSD': 'DOGEUSD',
  'LTCUSD': 'LTCUSD',
  'BCHUSD': 'BCHUSD',
  'XLMUSD': 'XLMUSD',
  // Keep original if already in Kraken format
  'XBTUSD': 'XBTUSD',
  'XXBTZUSD': 'XBTUSD',
  'XETHZUSD': 'ETHUSD',
};

interface BackfillOptions {
  startDate: Date;
  endDate: Date;
  symbols: string[];
  strategies: ('vwap_pullback' | 'abcd_long' | 'sma_trend_ride')[];
  userId: string;
  interval?: number; // Default 60 minutes
}

interface BackfillResult {
  totalSignals: number;
  successCount: number;
  errorCount: number;
  symbols: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  apiCalls: number;
  duration: number;
}

export class HistoricSignalGenerator {
  private kraken: KrakenService;
  private strategyEngine: StrategyEngine;
  private candleCache: Map<string, any[]>; // Cache candles for 24h TTL
  private cacheTimers: Map<string, NodeJS.Timeout>; // Track timers for cleanup
  
  // Pagination configuration
  private readonly PAGINATION_ENABLED = true;
  private readonly MAX_BATCHES = 10;
  private readonly PAGINATION_DELAY_MS = 500;
  private readonly MAX_CANDLES_TOTAL = 5000;

  constructor() {
    this.kraken = new KrakenService();
    this.strategyEngine = new StrategyEngine();
    this.candleCache = new Map();
    this.cacheTimers = new Map();
  }

  /**
   * Format number to decimal string for Drizzle (avoids binary rounding issues)
   */
  private formatDecimal(value: number, decimals: number = 8): string {
    return value.toFixed(decimals);
  }

  /**
   * Normalize symbol to Kraken format (e.g., BTCUSD → XBTUSD)
   */
  private normalizeSymbol(symbol: string): string {
    const upperSymbol = symbol.toUpperCase();
    return SYMBOL_MAPPING[upperSymbol] || upperSymbol;
  }

  /**
   * Generate historic signals for specified symbols and date range
   */
  async generateHistoricSignals(options: BackfillOptions): Promise<BackfillResult> {
    const startTime = Date.now();
    const {
      startDate,
      endDate,
      symbols,
      strategies,
      userId,
      interval = 60 // Default 60 minutes (hourly)
    } = options;

    console.log(`\n🔄 Starting historic signal backfill...`);
    console.log(`  User: ${userId}`);
    console.log(`  Symbols: ${symbols.join(', ')}`);
    console.log(`  Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`  Strategies: ${strategies.join(', ')}`);
    console.log(`  Interval: ${interval} minutes\n`);

    let totalSignals = 0;
    let successCount = 0;
    let errorCount = 0;
    let apiCalls = 0;

    // B-NEW-43 chunk 3 (2026-05-22): Phase 41F-L purged user-level getTradingSettings;
    // strategy params now derive from mode-level guardrails_v2. Historic backfill is
    // a paper-mode analysis tool. NOTE: legacy backfill harness — see RUNNING_ISSUES #136.
    const userSettings = await buildSettingsFromGuardrails('paper', userId);

    // Process each symbol
    for (const symbol of symbols) {
      // Normalize symbol to Kraken format (hoist outside try for catch access)
      const krakenSymbol = this.normalizeSymbol(symbol);
      
      try {
        console.log(`📊 Processing ${symbol} (${krakenSymbol})...`);
        
        // Fetch historical candles (check cache first)
        const cacheKey = `${krakenSymbol}-${interval}-${startDate.getTime()}-${endDate.getTime()}`;
        let candles = this.candleCache.get(cacheKey);
        
        if (!candles) {
          const sinceTimestamp = Math.floor(startDate.getTime() / 1000);
          const endTimestamp = Math.floor(endDate.getTime() / 1000);
          
          const ohlcData = await this.kraken.getOHLCData(
            krakenSymbol, 
            interval, 
            sinceTimestamp,
            {
              paginationEnabled: this.PAGINATION_ENABLED,
              maxBatches: this.MAX_BATCHES,
              paginationDelayMs: this.PAGINATION_DELAY_MS,
              maxCandlesTotal: this.MAX_CANDLES_TOTAL,
              endTimestamp
            }
          );
          candles = ohlcData.ohlc;
          apiCalls++;
          
          // Cache for 24 hours with proper cleanup
          this.candleCache.set(cacheKey, candles);
          const timer = setTimeout(() => {
            this.candleCache.delete(cacheKey);
            this.cacheTimers.delete(cacheKey);
          }, 24 * 60 * 60 * 1000);
          this.cacheTimers.set(cacheKey, timer);
          
          console.log(`  Fetched ${candles.length} candles from API`);
        } else {
          console.log(`  Using ${candles.length} candles from cache`);
        }

        // Filter candles by end date
        const endTimestamp = Math.floor(endDate.getTime() / 1000);
        const filteredCandles = candles.filter((c: any) => c.time <= endTimestamp);
        console.log(`  Filtered to ${filteredCandles.length} candles within date range`);

        // Generate signals for each candle window
        const signals = await this.detectSignalsInHistory(
          krakenSymbol,
          filteredCandles,
          strategies,
          userSettings
        );
        console.log(`  Detected ${signals.length} signals from ${filteredCandles.length} candles`);

        // Simulate trades and calculate P/L
        const evaluatedSignals = this.evaluateSignals(signals, filteredCandles);

        // Store in database
        for (const signal of evaluatedSignals) {
          try {
            await storage.createHistoricSignal({
              userId,
              symbol: krakenSymbol,
              exchange: 'Kraken',
              strategyId: signal.strategy,
              triggerTime: signal.triggerTime,
              exitTime: signal.exitTime || undefined,
              entryPrice: this.formatDecimal(signal.entryPrice),
              exitPrice: signal.exitPrice ? this.formatDecimal(signal.exitPrice) : undefined,
              pnlPercent: signal.pnlPercent !== null && signal.pnlPercent !== undefined 
                ? this.formatDecimal(signal.pnlPercent, 4) 
                : undefined,
              filtersUsed: signal.filtersUsed,
              confidence: signal.confidence !== null && signal.confidence !== undefined
                ? this.formatDecimal(signal.confidence, 2)
                : undefined,
              marketContext: signal.marketContext,
              source: 'historic'
            });
            successCount++;
          } catch (error) {
            console.error(`  Error storing signal:`, error);
            errorCount++;
          }
        }

        totalSignals += signals.length;
        console.log(`  ✅ Generated ${signals.length} signals for ${symbol} (${krakenSymbol})`);

      } catch (error) {
        console.error(`  ❌ Error processing ${symbol} (${krakenSymbol}):`, error);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;

    console.log(`\n✅ Backfill complete!`);
    console.log(`  Total signals: ${totalSignals}`);
    console.log(`  Successfully stored: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  API calls: ${apiCalls}`);
    console.log(`  Duration: ${(duration / 1000).toFixed(1)}s\n`);

    return {
      totalSignals,
      successCount,
      errorCount,
      symbols,
      dateRange: { start: startDate, end: endDate },
      apiCalls,
      duration
    };
  }

  /**
   * Detect signals in historical candles using strategy engine
   */
  private async detectSignalsInHistory(
    symbol: string,
    candles: any[],
    strategies: string[],
    settings: TradingSettings
  ): Promise<any[]> {
    const signals: any[] = [];

    // Need minimum 50 candles for pattern detection
    if (candles.length < 50) {
      console.log(`  ⚠️  Insufficient candles (${candles.length}) for signal detection (minimum 50 required)`);
      console.log(`  Suggestion: Increase date range or decrease interval to get more candles`);
      return signals;
    }
    
    console.log(`  Processing ${candles.length} candles with ${strategies.length} strategies`);

    // Convert candles to proper PriceData format for strategy detection
    const priceHistory = candles.map((c: any, idx: number) => ({
      id: `temp-${symbol}-${idx}`, // Temporary ID for strategy detection
      symbol,
      timestamp: new Date(c.time * 1000),
      open: c.open.toString(),
      high: c.high.toString(),
      low: c.low.toString(),
      close: c.close.toString(),
      volume: c.volume.toString(),
      vwap: c.vwap?.toString() || c.close.toString(),
      sma: null // Will be calculated as needed by strategy
    })) as any[];

    // Scan through candles with sliding window
    for (let i = 50; i < candles.length; i++) {
      const windowHistory = priceHistory.slice(i - 50, i + 1);
      const currentCandle = candles[i];

      // Calculate technical indicators
      const indicators: TechnicalIndicators = {
        currentPrice: parseFloat(currentCandle.close),
        vwap: parseFloat(currentCandle.vwap || currentCandle.close),
        sma: this.calculateSMA(windowHistory, 20),
        high24h: Math.max(...windowHistory.slice(-24).map(p => parseFloat(p.high))),
        low24h: Math.min(...windowHistory.slice(-24).map(p => parseFloat(p.low))),
        volume: parseFloat(currentCandle.volume)
      };

      // Detect signals for each strategy
      for (const strategy of strategies) {
        let signal: StrategySignal | null = null;

        if (strategy === 'vwap_pullback') {
          signal = this.strategyEngine.detectVWAPPullback(indicators, settings, windowHistory as PriceData[]);
        } else if (strategy === 'abcd_long') {
          signal = this.strategyEngine.detectABCDLong(windowHistory as PriceData[], settings);
        } else if (strategy === 'sma_trend_ride') {
          signal = this.strategyEngine.detectSMATrendRide(indicators, windowHistory as PriceData[], settings);
        }

        if (signal) {
          signals.push({
            ...signal,
            symbol,
            strategy,
            triggerTime: new Date(currentCandle.time * 1000),
            marketContext: {
              vwap: indicators.vwap,
              sma: indicators.sma,
              volume: indicators.volume,
              dailyRange: ((indicators.high24h - indicators.low24h) / indicators.low24h * 100),
              ...signal.metadata
            }
          });
        }
      }
    }

    return signals;
  }

  /**
   * Evaluate signals by simulating trades and calculating P/L
   * Uses consistent number parsing to avoid NaN issues
   */
  private evaluateSignals(signals: any[], candles: any[]): any[] {
    return signals.map(signal => {
      const triggerIndex = candles.findIndex((c: any) => 
        c.time * 1000 >= signal.triggerTime.getTime()
      );

      if (triggerIndex === -1) {
        return { ...signal, exitTime: null, exitPrice: null, pnlPercent: null };
      }

      // Parse signal prices consistently
      const entryPrice = typeof signal.entryPrice === 'number' ? signal.entryPrice : parseFloat(signal.entryPrice);
      const targetPrice = typeof signal.targetPrice === 'number' ? signal.targetPrice : parseFloat(signal.targetPrice);
      const stopPrice = typeof signal.stopPrice === 'number' ? signal.stopPrice : parseFloat(signal.stopPrice);

      // Look forward up to 24 candles (24 hours for hourly data) to find exit
      const maxHoldingPeriod = 24;
      let exitPrice: number | null = null;
      let exitTime: Date | null = null;
      let exitReason = 'time_limit';

      for (let i = triggerIndex + 1; i < Math.min(triggerIndex + maxHoldingPeriod, candles.length); i++) {
        const candle = candles[i];
        const high = typeof candle.high === 'string' ? parseFloat(candle.high) : candle.high;
        const low = typeof candle.low === 'string' ? parseFloat(candle.low) : candle.low;

        // Check if target hit
        if (high >= targetPrice) {
          exitPrice = targetPrice;
          exitTime = new Date(candle.time * 1000);
          exitReason = 'target';
          break;
        }

        // Check if stop hit
        if (low <= stopPrice) {
          exitPrice = stopPrice;
          exitTime = new Date(candle.time * 1000);
          exitReason = 'stop';
          break;
        }
      }

      // If no exit found, use last candle price
      if (exitPrice === null && triggerIndex + 1 < candles.length) {
        const lastCandle = candles[Math.min(triggerIndex + maxHoldingPeriod - 1, candles.length - 1)];
        const closePrice = typeof lastCandle.close === 'string' ? parseFloat(lastCandle.close) : lastCandle.close;
        exitPrice = closePrice;
        exitTime = new Date(lastCandle.time * 1000);
      }

      // Calculate P/L percentage
      const pnlPercent = exitPrice !== null
        ? ((exitPrice - entryPrice) / entryPrice) * 100
        : null;

      return {
        ...signal,
        entryPrice, // Use parsed value
        targetPrice,
        stopPrice,
        exitTime,
        exitPrice,
        pnlPercent,
        exitReason,
        filtersUsed: this.extractFiltersUsed(signal)
      };
    });
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(priceHistory: any[], period: number): number {
    if (priceHistory.length < period) return 0;
    
    const recentPrices = priceHistory.slice(-period);
    const sum = recentPrices.reduce((acc, p) => acc + parseFloat(p.close), 0);
    return sum / period;
  }

  /**
   * Extract filters used from signal metadata
   */
  private extractFiltersUsed(signal: any): string[] {
    const filters: string[] = [];
    
    if (signal.marketContext?.vwap) filters.push('VWAP');
    if (signal.marketContext?.sma) filters.push('SMA');
    if (signal.marketContext?.volume) filters.push('Volume');
    if (signal.marketContext?.dailyRange) filters.push('DailyRange');
    
    return filters;
  }

  /**
   * Clear candle cache and cleanup timers
   */
  clearCache(): void {
    // Clear all cache timers
    for (const timer of this.cacheTimers.values()) {
      clearTimeout(timer);
    }
    this.cacheTimers.clear();
    this.candleCache.clear();
    console.log('📦 Candle cache and timers cleared');
  }

  /**
   * Cleanup method to be called on shutdown
   */
  cleanup(): void {
    this.clearCache();
  }
}
