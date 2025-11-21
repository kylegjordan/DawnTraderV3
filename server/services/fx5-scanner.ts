/**
 * FX5 Scanner Service - Always-On 30-Second Market Scanner
 * Phase 8.8.2 FINAL CORRECTION
 * 
 * This service drives Stage-3 state updates independently of trading engine status.
 * Runs every 30 seconds for both paper and live modes, providing real-time
 * market data via WebSocket events.
 * 
 * Architecture:
 * - Initializes at server startup
 * - Runs 30-second intervals for each mode
 * - Loads screener filters and executes FX5 filtering
 * - Computes breakdown from filter results (NOT diagnostics)
 * - Updates Stage-3 cache and emits WebSocket events
 * - Operates independently of trading engine state
 */

import { storage } from '../storage.js';
import { FilteredPairsService } from './filtered-pairs-service.js';
import { KrakenService } from './kraken.js';
import { updateStage3Cache } from './stage3-state-cache.js';
import { emitStage3Events, FilterBreakdown } from './stage3-emitter.js';
import type { ScreenerFilters } from '@shared/schema';

const SCAN_INTERVAL_MS = 30 * 1000; // 30 seconds

interface ScanResult {
  mode: 'paper' | 'live';
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  breakdown: FilterBreakdown;
  topNCount: number;
  tierBCount: number;
  activePoolCount: number;
}

export class Fx5ScannerService {
  private filteredPairsService: FilteredPairsService;
  private krakenService: KrakenService;
  private paperTimer: NodeJS.Timeout | null = null;
  private liveTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.filteredPairsService = new FilteredPairsService();
    this.krakenService = new KrakenService();
  }

  /**
   * Start the FX5 scanner for both modes
   * This runs independently of trading engine state
   */
  async start(): Promise<void> {
    console.log('[FX5Scanner][DEBUG] start() method called - isRunning:', this.isRunning);
    
    if (this.isRunning) {
      console.log('[FX5Scanner] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[FX5Scanner] Starting 30-second scanner for paper and live modes');

    // Run initial scan for both modes
    console.log('[FX5Scanner][DEBUG] About to run initial paper scan');
    await this.scanMode('paper');
    console.log('[FX5Scanner][DEBUG] About to run initial live scan');
    await this.scanMode('live');

    // Schedule recurring scans
    this.paperTimer = setInterval(async () => {
      try {
        await this.scanMode('paper');
      } catch (error) {
        console.error('[FX5Scanner] Paper scan error:', error);
      }
    }, SCAN_INTERVAL_MS);

    this.liveTimer = setInterval(async () => {
      try {
        await this.scanMode('live');
      } catch (error) {
        console.error('[FX5Scanner] Live scan error:', error);
      }
    }, SCAN_INTERVAL_MS);

    console.log('[FX5Scanner] ✅ Started (interval=30s)');
  }

  /**
   * Stop the FX5 scanner
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.paperTimer) {
      clearInterval(this.paperTimer);
      this.paperTimer = null;
    }

    if (this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }

    this.isRunning = false;
    console.log('[FX5Scanner] Stopped');
  }

  /**
   * Execute FX5 scan for a specific mode
   */
  private async scanMode(mode: 'paper' | 'live'): Promise<ScanResult | null> {
    try {
      // Load screener filters for this mode
      const filters = await storage.getScreenerFilters({ mode });
      if (!filters) {
        console.warn(`[FX5Scanner][${mode}] No filters found, skipping scan`);
        return null;
      }

      // Execute FX5 filtering via FilteredPairsService
      const result = await this.filteredPairsService.getValidPairs(mode, filters, true);
      
      // Compute breakdown from filter results (includes evaluated count)
      // Phase 8.8.2-UI-FINAL-RESTORE: Now includes symbol arrays for unique tracking
      const diagnosticData = await this.computeBreakdown(mode, filters);
      const breakdown = diagnosticData.breakdown;
      const { evaluatedSymbols, survivedSymbols } = diagnosticData;
      
      // Calculate counts from breakdown to satisfy truth constraint
      // eligibleCount = pairs that passed ALL filters (includes active trades)
      // ineligibleCount = pairs that failed ANY filter
      const evaluatedCount = diagnosticData.evaluated;
      const eligibleCount = breakdown.passed_all_filters + breakdown.already_active;
      const ineligibleCount = 
        breakdown.failed_min_volume +
        breakdown.failed_spread +
        breakdown.failed_daily_range +
        breakdown.failed_min_price +
        breakdown.failed_stablecoin +
        breakdown.failed_quote_currency +
        breakdown.failed_history +
        breakdown.failed_market_cap +
        breakdown.failed_guardrail_risk;

      // Get active trades count
      const activeTrades = await storage.getActiveTrades(mode);
      const activePoolCount = activeTrades.length;

      // Calculate rotation stats
      const universeSize = filters.universeSize || 100;
      const topNCount = eligibleCount;
      const tierBCount = 0; // Future enhancement (Phase 8.9)

      const scanResult: ScanResult = {
        mode,
        evaluatedCount,
        eligibleCount,
        ineligibleCount,
        breakdown,
        topNCount,
        tierBCount,
        activePoolCount,
      };

      // Update Stage-3 cache FIRST
      await updateStage3Cache(mode, {
        evaluatedCount,
        eligibleCount,
        ineligibleCount,
        topNCount,
        tierBCount,
        rotation: {
          topEndUniverseSize: universeSize,
          tierBUniverseSize: 0,
        },
        activePoolCount,
        latestEligibleSymbols: result.filteredPairs.slice(0, 10).map(p => p.symbol),
      });

      // Emit Stage-3 WebSocket events SECOND
      // Phase 8.8.2-UI-FINAL-RESTORE: Pass symbol arrays for unique 24h tracking
      await emitStage3Events(mode, breakdown, { evaluatedSymbols, survivedSymbols });

      console.log(`[FX5Scanner][${mode}] ✅ Scan complete (evaluated=${evaluatedCount}, eligible=${eligibleCount})`);

      return scanResult;
    } catch (error) {
      console.error(`[FX5Scanner][${mode}] Scan error:`, error);
      return null;
    }
  }

  /**
   * Compute filter breakdown from FX5 results
   * Engine-agnostic: Uses KrakenService directly without user context
   * 
   * Phase 8.8.2-UI-FINAL-RESTORE: Now returns symbol arrays for unique tracking in 24h aggregator
   */
  private async computeBreakdown(
    mode: 'paper' | 'live',
    filters: ScreenerFilters
  ): Promise<{ 
    breakdown: FilterBreakdown; 
    evaluated: number;
    evaluatedSymbols: string[];
    survivedSymbols: string[];
  }> {
    // Get all tradable pairs and tickers from Kraken
    const [tickers, pairsObj] = await Promise.all([
      this.krakenService.getTicker(),
      this.krakenService.getTradablePairs()
    ]);
    
    // Get active trades to exclude from eligible pool
    const activeTrades = await storage.getActiveTrades(mode);
    const activeSymbols = new Set(activeTrades.map(t => t.symbol));

    // Initialize breakdown counters
    const breakdown: FilterBreakdown = {
      failed_min_volume: 0,
      failed_spread: 0,
      failed_daily_range: 0,
      failed_min_price: 0,
      failed_stablecoin: 0,
      failed_quote_currency: 0,
      failed_history: 0,
      failed_market_cap: 0,
      failed_guardrail_risk: 0,
      already_active: 0,
      passed_all_filters: 0,
    };

    // Phase 8.8.2-UI-FINAL-RESTORE: Track symbols for unique 24h metrics
    const evaluatedSymbols: string[] = [];
    const survivedSymbols: string[] = [];

    // Extract filter criteria
    const minVolume = parseFloat(filters.minVolume ?? '1000000.00');
    const minDailyRange = parseFloat(filters.volatilityMin ?? '0.50');
    const minPrice = parseFloat(filters.minPrice ?? '0.01');
    const maxBidAskSpread = parseFloat(filters.maxBidAskSpread ?? '1.00');
    const excludeStablecoins = filters.excludeStablecoins ?? true;
    const stablecoinPatterns = ['USDT', 'USDC', 'DAI', 'BUSD', 'UST'];
    
    // Parse allowed quote currencies
    let allowedQuotes: string[] = [];
    try {
      allowedQuotes = typeof filters.quoteCurrencies === 'string'
        ? JSON.parse(filters.quoteCurrencies)
        : (filters.quoteCurrencies ?? []);
    } catch {
      allowedQuotes = [];
    }

    // Evaluate each pair against filters (using ticker data + pair info)
    let evaluated = 0;
    Object.entries(tickers).forEach(([pairName, ticker]) => {
      const pairInfo = pairsObj[pairName];
      if (!pairInfo) return;

      evaluated++;
      
      // Extract pair data
      const baseCurrency = pairInfo.base;
      const quoteCurrency = pairInfo.quote;
      const normalizedQuote = quoteCurrency?.startsWith('Z') ? quoteCurrency.slice(1) : quoteCurrency;
      const currentPrice = parseFloat(ticker.c[0]);
      const volume24h = parseFloat(ticker.v[1]);
      const high24h = parseFloat(ticker.h[1]);
      const low24h = parseFloat(ticker.l[1]);
      const dailyRange = ((high24h - low24h) / low24h) * 100;
      const askPrice = parseFloat(ticker.a[0]);
      const bidPrice = parseFloat(ticker.b[0]);
      const bidAskSpread = ((askPrice - bidPrice) / bidPrice) * 100;
      
      // Get canonical symbol (e.g., BTCUSD instead of XXBTZUSD)
      const symbol = pairInfo.wsname || pairName;
      
      // Phase 8.8.2-UI-FINAL-RESTORE: Track evaluated symbol
      evaluatedSymbols.push(symbol);
      
      let rejected = false;

      // Filter 1: Quote currency
      if (!rejected && allowedQuotes.length > 0 && !allowedQuotes.includes(normalizedQuote || '')) {
        breakdown.failed_quote_currency++;
        rejected = true;
      }

      // Filter 2: Stablecoins
      if (!rejected && excludeStablecoins && stablecoinPatterns.some(p => baseCurrency?.includes(p))) {
        breakdown.failed_stablecoin++;
        rejected = true;
      }

      // Filter 3: Min volume
      if (!rejected && volume24h < minVolume) {
        breakdown.failed_min_volume++;
        rejected = true;
      }

      // Filter 4: Daily range (volatility)
      if (!rejected && dailyRange < minDailyRange) {
        breakdown.failed_daily_range++;
        rejected = true;
      }

      // Filter 5: Min price
      if (!rejected && currentPrice < minPrice) {
        breakdown.failed_min_price++;
        rejected = true;
      }

      // Filter 6: Bid-ask spread
      if (!rejected && bidAskSpread > maxBidAskSpread) {
        breakdown.failed_spread++;
        rejected = true;
      }

      // Pair passed all filters
      if (!rejected) {
        // Check if already active
        if (activeSymbols.has(symbol)) {
          breakdown.already_active++;
        } else {
          breakdown.passed_all_filters++;
        }
        
        // Phase 8.8.2-UI-FINAL-RESTORE: Track survived symbol (passed all filters)
        survivedSymbols.push(symbol);
      }
    });

    return {
      breakdown,
      evaluated,
      evaluatedSymbols,
      survivedSymbols,
    };
  }
}

// Singleton instance
export const fx5Scanner = new Fx5ScannerService();
