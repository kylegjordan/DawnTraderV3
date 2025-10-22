/**
 * Phase 27.F.12 - PaperSim Universe Scan & Filter Trace
 * Read-only diagnostic service to verify end-to-end filtering without starting engines
 */

import { KrakenService } from './kraken.js';
import { StrategyEngine, type TechnicalIndicators } from './strategy-engine.js';
import { RiskManager } from './risk-manager.js';
import { storage } from '../storage.js';
import { toCanonical, canonicalFromPairInfo, normalizeSymbolArray } from './utils/symbol-canonicalizer.js';
import type { TradingSettings, PriceData } from '@shared/schema';

interface UniverseScanOptions {
  mode: 'paper' | 'live';
  limit?: number;
  trace?: boolean;
  strategies?: boolean;
  userId: string;
}

interface FilterBreakdown {
  failed_min_volume: number;
  failed_spread: number;
  failed_daily_range: number;
  failed_min_price: number;
  failed_stablecoin: number;
  failed_quote_currency: number;
  failed_blacklist: number;
  failed_whitelist: number;
  failed_history: number;
  failed_guardrail_risk: number;
  strategy_none_triggered: number;
}

interface CandidateSnapshot {
  symbol: string;
  reasons: string[];
  snapshot: {
    price: number;
    spread_bps: number;
    vol_24h: number;
    daily_range: number;
  };
  // Phase 27.F.12.b - Validation fields (temporary)
  symbol_canonical?: string;
  kraken_id?: string;
  whitelist_hit?: boolean;
  blacklist_hit?: boolean;
}

interface UniverseScanResult {
  mode: string;
  universe_count: number;
  evaluated: number;
  eligible_count: number;
  ineligible_count: number;
  breakdown: FilterBreakdown;
  top_candidates: CandidateSnapshot[];
  ts: string;
  nextScanAt?: string; // Phase 27.F.19b: Next scheduled scan time (ISO string)
}

export class PaperSimDiagnosticService {
  private krakenService: KrakenService;
  private strategyEngine: StrategyEngine;
  private riskManager: RiskManager;

  constructor() {
    this.krakenService = new KrakenService();
    this.strategyEngine = new StrategyEngine();
    this.riskManager = new RiskManager();
  }

  async performUniverseScan(options: UniverseScanOptions): Promise<UniverseScanResult> {
    const {
      mode = 'paper',
      limit = 500,
      trace = true,
      strategies = true,
      userId
    } = options;

    console.log(`[UniverseScan] Starting diagnostic scan (mode=${mode}, limit=${limit}, trace=${trace}, strategies=${strategies})`);

    // Get user's screener filters and trading settings
    const screenerSettings = await storage.getScreenerFilters({ userId, mode });
    const tradingSettings = await storage.getTradingSettings(userId);
    
    if (!screenerSettings || !tradingSettings) {
      throw new Error('No screener filters or trading settings found for user');
    }

    // Load raw Kraken universe
    console.log('[UniverseScan] Loading Kraken universe...');
    const [tickers, pairs] = await Promise.all([
      this.krakenService.getTicker(),
      this.krakenService.getTradablePairs()
    ]);
    
    const universeCount = Object.keys(tickers).length;
    const evaluated = Math.min(limit, universeCount);
    console.log(`[UniverseLoad] kraken_pairs=${universeCount} evaluated=${evaluated}`);

    // Parse settings from screener_filters (aligned with MarketScanner)
    const minVolume = parseFloat(screenerSettings.minVolume || '1000000');
    const minDailyRange = parseFloat(tradingSettings.minDailyRange || '6.5');
    const minPrice = screenerSettings.minPrice ? parseFloat(screenerSettings.minPrice) : 0.01;
    const maxBidAskSpread = screenerSettings.maxBidAskSpread ? parseFloat(screenerSettings.maxBidAskSpread) : 1.00;
    const excludeStablecoins = screenerSettings.excludeStablecoins ?? true;
    // Phase 27.F.13.B: No currency restrictions per user request
    const allowedQuotes = tradingSettings.allowedTradingPairs || [];
    const blacklist = normalizeSymbolArray(tradingSettings.blacklistedSymbols);
    const whitelist = normalizeSymbolArray(tradingSettings.whitelistedSymbols);
    const stablecoinPatterns = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'USDD', 'FRAX', 'LUSD'];

    // Track actual breakdown
    const breakdown: FilterBreakdown = {
      failed_min_volume: 0,
      failed_spread: 0,
      failed_daily_range: 0,
      failed_min_price: 0,
      failed_stablecoin: 0,
      failed_quote_currency: 0,
      failed_blacklist: 0,
      failed_whitelist: 0,
      failed_history: 0,
      failed_guardrail_risk: 0,
      strategy_none_triggered: 0
    };

    const eligiblePairs: any[] = [];
    let evaluated_count = 0;

    // Evaluate each pair manually
    for (const [pairName, ticker] of Object.entries(tickers)) {
      if (evaluated_count >= limit) break;
      evaluated_count++;

      const pairInfo = pairs[pairName];
      if (!pairInfo) continue;

      const currentPrice = parseFloat(ticker.c[0]);
      const volume24h = parseFloat(ticker.v[1]);
      const high24h = parseFloat(ticker.h[1]);
      const low24h = parseFloat(ticker.l[1]);
      const dailyRange = ((high24h - low24h) / low24h) * 100;
      const askPrice = parseFloat(ticker.a[0]);
      const bidPrice = parseFloat(ticker.b[0]);
      const bidAskSpread = ((askPrice - bidPrice) / bidPrice) * 100;

      // Get canonical symbol for comparison (BASE/QUOTE format)
      const canonicalSymbol = canonicalFromPairInfo(pairInfo);
      
      // Extract normalized quote currency from canonical symbol
      const normalizedQuote = canonicalSymbol.split('/')[1] || pairInfo.quote;

      // Apply filters in order and track first failure
      let rejected = false;
      let rejectReason = '';

      // Filter 1: Whitelist (compare canonical symbols)
      if (!rejected && whitelist.length > 0 && !whitelist.includes(canonicalSymbol)) {
        breakdown.failed_whitelist++;
        rejected = true;
        rejectReason = 'failed_whitelist';
      }

      // Filter 2: Blacklist (compare canonical symbols)
      if (!rejected && blacklist.includes(canonicalSymbol)) {
        breakdown.failed_blacklist++;
        rejected = true;
        rejectReason = 'failed_blacklist';
      }

      // Filter 3: Quote currency (use normalized quote) - Phase 27.F.13.B: Empty array means no restrictions
      if (!rejected && allowedQuotes.length > 0 && !allowedQuotes.includes(normalizedQuote)) {
        breakdown.failed_quote_currency++;
        rejected = true;
        rejectReason = 'failed_quote_currency';
      }

      // Filter 4: Stablecoins
      if (!rejected && excludeStablecoins && stablecoinPatterns.some(pattern => pairInfo.base.includes(pattern))) {
        breakdown.failed_stablecoin++;
        rejected = true;
        rejectReason = 'failed_stablecoin';
      }

      // Filter 5: Min volume
      if (!rejected && volume24h < minVolume) {
        breakdown.failed_min_volume++;
        rejected = true;
        rejectReason = `failed_min_volume vol=${volume24h.toFixed(0)}`;
      }

      // Filter 6: Daily range
      if (!rejected && dailyRange < minDailyRange) {
        breakdown.failed_daily_range++;
        rejected = true;
        rejectReason = `failed_daily_range range=${dailyRange.toFixed(2)}%`;
      }

      // Filter 7: Min price
      if (!rejected && currentPrice < minPrice) {
        breakdown.failed_min_price++;
        rejected = true;
        rejectReason = `failed_min_price price=${currentPrice}`;
      }

      // Filter 8: Bid-ask spread
      if (!rejected && bidAskSpread > maxBidAskSpread) {
        breakdown.failed_spread++;
        rejected = true;
        rejectReason = `failed_spread spread=${bidAskSpread.toFixed(2)}%`;
      }

      if (rejected && trace && evaluated_count <= 15) {
        console.log(`[TraceReject] SYMB=${pairName} canonical=${canonicalSymbol} reason=${rejectReason}`);
      }

      // Log whitelist/blacklist hits when trace enabled
      if (trace && evaluated_count <= 15) {
        if (whitelist.length > 0 && whitelist.includes(canonicalSymbol)) {
          console.log(`[FilterEval] WHITELIST_HIT ${canonicalSymbol}`);
        }
        if (blacklist.includes(canonicalSymbol)) {
          console.log(`[FilterEval] BLACKLIST_HIT ${canonicalSymbol}`);
        }
      }

      if (!rejected) {
        eligiblePairs.push({
          symbol: pairName,
          baseCurrency: pairInfo.base,
          quoteCurrency: pairInfo.quote,
          volume24h,
          currentPrice,
          dailyRange,
          vwap: parseFloat(ticker.p[1])
        });
      }
    }

    // Run strategy prechecks on eligible pairs
    const topCandidates: CandidateSnapshot[] = [];
    let guardrailRejectCount = 0;
    let noStrategyCount = 0;

    if (strategies) {
      console.log(`[StrategyProbe] Checking ${eligiblePairs.length} eligible pairs for strategy signals...`);

      for (const pair of eligiblePairs.slice(0, 25)) {
        try {
          const candidate = await this.checkPairForSignals(pair.symbol, tradingSettings, trace);
          
          if (candidate.reasons.some(r => r.startsWith('guardrail:'))) {
            guardrailRejectCount++;
          } else if (candidate.reasons.includes('no_strategy_triggered')) {
            noStrategyCount++;
          } else {
            topCandidates.push(candidate);
          }
        } catch (error) {
          if (trace) {
            console.log(`[TraceReject] ${pair.symbol} reason=strategy_check_failed error=${error instanceof Error ? error.message : 'unknown'}`);
          }
        }
      }

      breakdown.failed_guardrail_risk = guardrailRejectCount;
      breakdown.strategy_none_triggered = noStrategyCount;

      topCandidates.sort((a, b) => {
        const aConf = parseFloat(a.reasons.find(r => r.includes(':'))?.split(':')[1] || '0');
        const bConf = parseFloat(b.reasons.find(r => r.includes(':'))?.split(':')[1] || '0');
        return bConf - aConf;
      });

      console.log(`[StrategyProbe] candidates=${topCandidates.length} sample=[${topCandidates.slice(0, 5).map(c => c.symbol).join(',')}]`);
    } else {
      // Phase 27.F.13.B: When strategies=false, populate candidates from eligible pairs for Filtered Pairs display
      console.log(`[FilteredPairs] Populating ${eligiblePairs.length} eligible pairs (no strategy check)`);
      
      for (const pair of eligiblePairs) {
        const spreadBps = pair.currentPrice > 0 ? ((pair.currentPrice * 0.001) / pair.currentPrice) * 10000 : 0; // Rough estimate
        
        topCandidates.push({
          symbol: pair.symbol,
          reasons: ['passed_filters'],
          snapshot: {
            price: pair.currentPrice,
            spread_bps: spreadBps,
            vol_24h: pair.volume24h,
            daily_range: pair.dailyRange
          }
        });
      }
      
      console.log(`[FilteredPairs] Generated ${topCandidates.length} candidates from eligible pairs`);
    }

    const ineligibleCount = evaluated - eligiblePairs.length;
    console.log(`[FilterEval] eligible=${eligiblePairs.length} ineligible=${ineligibleCount} by_rule={vol:${breakdown.failed_min_volume}, spread:${breakdown.failed_spread}, range:${breakdown.failed_daily_range}, history:${breakdown.failed_history}}`);

    // Phase 27.F.19b: Calculate next scan time (10-minute interval)
    const SCAN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    const nextScanAt = new Date(Date.now() + SCAN_INTERVAL_MS).toISOString();

    return {
      mode,
      universe_count: universeCount,
      evaluated,
      eligible_count: eligiblePairs.length,
      ineligible_count: ineligibleCount,
      breakdown,
      top_candidates: topCandidates.slice(0, 10),
      ts: new Date().toISOString(),
      nextScanAt // Phase 27.F.19b: Next scheduled scan time
    };
  }

  private async checkPairForSignals(
    symbol: string,
    settings: TradingSettings,
    trace: boolean
  ): Promise<CandidateSnapshot> {
    const reasons: string[] = [];

    // Fetch ticker data
    const ticker = await this.krakenService.getTicker(symbol);
    const tickerData = Object.values(ticker)[0];
    
    if (!tickerData) {
      if (trace) {
        console.log(`[TraceReject] ${symbol} reason=no_ticker_data`);
      }
      throw new Error('No ticker data');
    }

    const currentPrice = parseFloat(tickerData.c[0]);
    const askPrice = parseFloat(tickerData.a[0]);
    const bidPrice = parseFloat(tickerData.b[0]);
    const volume24h = parseFloat(tickerData.v[1]);
    const high24h = parseFloat(tickerData.h[1]);
    const low24h = parseFloat(tickerData.l[1]);
    const dailyRange = ((high24h - low24h) / low24h) * 100;
    const bidAskSpread = ((askPrice - bidPrice) / bidPrice) * 10000; // in basis points

    // Check spread
    if (bidAskSpread <= parseFloat(settings.maxBidAskSpread || '1.00') * 100) {
      reasons.push('passes_spread');
    }

    // Check volume
    if (volume24h >= parseFloat(settings.minVolume || '30000000')) {
      reasons.push('passes_volume');
    }

    // Get OHLC data for technical indicators
    const ohlcResponse = await this.krakenService.getOHLCData(symbol, 60); // 1-hour candles
    const ohlcData = ohlcResponse.ohlc;

    if (ohlcData.length === 0) {
      if (trace) {
        console.log(`[TraceReject] ${symbol} reason=no_ohlc_data`);
      }
      throw new Error('No OHLC data');
    }

    // Build price data array
    const priceData: PriceData[] = ohlcData.map(candle => ({
      id: `${symbol}-${candle.time}`,
      symbol: symbol,
      timestamp: new Date(candle.time * 1000),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      vwap: candle.vwap,
      sma: null
    }));

    // Calculate indicators
    const vwap = this.calculateVWAP(priceData);
    const sma = this.calculateSMA(priceData, settings.smaLength || 20);

    const indicators: TechnicalIndicators = {
      currentPrice,
      vwap,
      sma,
      volume: volume24h,
      high24h,
      low24h
    };

    // Run strategy detectors (lightweight - no position sizing)
    const vwapSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, priceData);
    const abcdSignal = this.strategyEngine.detectABCDLong(priceData, settings);
    const smaSignal = this.strategyEngine.detectSMATrendRide(indicators, priceData, settings);

    const signals = [vwapSignal, abcdSignal, smaSignal].filter(s => s !== null);

    if (signals.length > 0) {
      const bestSignal = signals.reduce((prev, current) => 
        current!.confidence > prev!.confidence ? current : prev
      )!;

      reasons.push(`${bestSignal.strategy}:${bestSignal.confidence.toFixed(2)}`);

      // Quick guardrail check (simplified - just check kill switch and position limit)
      if (settings.tradingSuspended) {
        reasons.push('guardrail:kill_switch_active');
      } else {
        // Lightweight risk check - just validate stop loss exists
        if (!bestSignal.stopPrice) {
          reasons.push('guardrail:missing_stop_loss');
        }
      }
    } else {
      reasons.push('no_strategy_triggered');
    }

    return {
      symbol,
      reasons,
      snapshot: {
        price: currentPrice,
        spread_bps: bidAskSpread,
        vol_24h: volume24h,
        daily_range: dailyRange
      }
    };
  }

  private calculateVWAP(priceData: PriceData[]): number {
    if (priceData.length === 0) return 0;

    let totalVolume = 0;
    let totalVolumePrice = 0;

    for (const data of priceData) {
      const volume = parseFloat(data.volume);
      const typicalPrice = (
        parseFloat(data.high) +
        parseFloat(data.low) +
        parseFloat(data.close)
      ) / 3;

      totalVolumePrice += typicalPrice * volume;
      totalVolume += volume;
    }

    return totalVolume > 0 ? totalVolumePrice / totalVolume : 0;
  }

  private calculateSMA(priceData: PriceData[], period: number): number {
    if (priceData.length < period) return 0;

    const recentPrices = priceData.slice(-period);
    const sum = recentPrices.reduce((acc, data) => acc + parseFloat(data.close), 0);
    
    return sum / period;
  }
}

// Export singleton instance
export const paperSimDiagnosticService = new PaperSimDiagnosticService();
