/**
 * Phase 37/B6: Signal Orchestrator
 * 
 * Implements hybrid signal-orchestration loop for mode-aware market evaluation.
 * Periodically scans filtered symbols and evaluates trading strategies to generate signals.
 * 
 * Architecture:
 * - Loads filtered symbols from FilteredPairsService
 * - Seeds immediate evaluation pass on start
 * - Timer-based evaluation (configurable interval)
 * - Calls all enabled strategies for each symbol
 * - B6: All signals are sized via centralized sizing helper before forwarding
 * - De-duplicates and scores signals
 * - Forwards winning signals to TradingEngine for processing
 * 
 * Separation of Concerns:
 * - MarketScanner: maintains universe of eligible symbols
 * - SignalOrchestrator: evaluates strategies and generates signals
 * - StrategyEngine: pure/deterministic strategy detection
 * - TradingEngine: executes trades and manages positions
 * 
 * B6 Refactor:
 * - All 9 strategies now route through buildSizedSignalForStrategy()
 * - Signals are pre-sized with quantity and estimatedValue before forwarding
 * - Uses centralized sizing helper from paper-position-sizing.ts
 */

import { StrategyEngine, StrategySignal } from './strategy-engine';
import { FilteredPairsService } from './filtered-pairs-service';
import { KrakenService } from './kraken';
import { storage } from '../storage';
import type { TradingSettings, ScreenerFilters, PriceData, GuardrailsV2 } from '@shared/schema';
import { telemetryTrace } from './telemetry-trace.js';
import { PaperSimDiagnosticService } from './paper-sim-diagnostic.js';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { sizePaperPositionForSignal, type StrategyType } from './paper-position-sizing.js';
import { getPortfolioBalanceV2 } from './guardrail-settings.js';

export interface SignalOrchestratorConfig {
  mode: 'live' | 'paper';
  evaluationIntervalMs?: number;
  enabledStrategies?: string[];
}

export interface EvaluationStats {
  symbolsEvaluated: number;
  strategiesRun: number;
  signalsGenerated: number;
  signalsForwarded: number;
  lastEvaluationAt: Date;
  nextEvaluationAt: Date;
}

interface SizedStrategySignal extends StrategySignal {
  quantity?: number;
  estimatedValue?: number;
  preComputedNotional?: number;
}

interface SizingContext {
  portfolioValue: number;
  guardrails: GuardrailsV2 | null;
  mode: 'live' | 'paper';
}

export class SignalOrchestrator {
  private mode: 'live' | 'paper';
  private strategyEngine: StrategyEngine;
  private filteredPairsService: FilteredPairsService;
  private kraken: KrakenService;
  private diagnosticService: PaperSimDiagnosticService;
  private isRunning: boolean = false;
  private evaluationTimer: NodeJS.Timeout | null = null;
  private readonly evaluationIntervalMs: number;
  private readonly enabledStrategies: Set<string>;
  private onSignalCallback: ((signal: StrategySignal) => Promise<void>) | null = null;
  
  private stats: EvaluationStats = {
    symbolsEvaluated: 0,
    strategiesRun: 0,
    signalsGenerated: 0,
    signalsForwarded: 0,
    lastEvaluationAt: new Date(0),
    nextEvaluationAt: new Date(0),
  };

  constructor(config: SignalOrchestratorConfig) {
    this.mode = config.mode;
    this.evaluationIntervalMs = config.evaluationIntervalMs || 30000;
    this.enabledStrategies = new Set(config.enabledStrategies || [
      'vwap_pullback',
      'abcd_long',
      'sma_trend_ride',
      'breakout',
      'mean_reversion',
      'range_trading',
      'vwap_bounce',
      'liquidity_trap',
      'dhma'
    ]);
    
    this.strategyEngine = new StrategyEngine();
    this.filteredPairsService = new FilteredPairsService();
    this.kraken = new KrakenService();
    this.diagnosticService = new PaperSimDiagnosticService();
  }

  async start(onSignal: (signal: StrategySignal) => Promise<void>): Promise<void> {
    if (this.isRunning) {
      console.log(`[37.A][SignalOrchestrator][${this.mode}] Already running`);
      telemetryTrace.trace('SignalOrchestrator', 'START_ALREADY_RUNNING', 'WARN', { mode: this.mode });
      return;
    }

    this.isRunning = true;
    this.onSignalCallback = onSignal;
    
    console.log(`[37.A][SignalOrchestrator][${this.mode}] Starting with ${this.enabledStrategies.size} strategies, interval ${this.evaluationIntervalMs}ms`);
    console.log(`[WARMUP][DEBUG] SignalOrchestrator starting (non-blocking)`);
    telemetryTrace.trace('SignalOrchestrator', 'START', 'INFO', { 
      mode: this.mode, 
      strategies: this.enabledStrategies.size, 
      interval: this.evaluationIntervalMs 
    });

    this.evaluateMarket().catch(err => {
      console.error(`[SignalOrchestrator][${this.mode}] First evaluation failed:`, err);
    });

    this.evaluationTimer = setInterval(async () => {
      await this.evaluateMarket();
    }, this.evaluationIntervalMs);

    console.log(`[37.A][SignalOrchestrator][${this.mode}] Started successfully (first evaluation running async)`);
    console.log(`[WARMUP][DEBUG] SignalOrchestrator started successfully`);
    telemetryTrace.trace('SignalOrchestrator', 'START_SUCCESS', 'INFO', { mode: this.mode });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    telemetryTrace.trace('SignalOrchestrator', 'STOP', 'INFO', { mode: this.mode, stats: this.stats });

    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }

    this.isRunning = false;
    this.onSignalCallback = null;
    
    console.log(`[37.A][SignalOrchestrator][${this.mode}] Stopped`);
    telemetryTrace.trace('SignalOrchestrator', 'STOP_SUCCESS', 'INFO', { mode: this.mode });
  }

  getStats(): EvaluationStats {
    return { ...this.stats };
  }

  isStrategyEnabled(strategyId: string): boolean {
    return this.enabledStrategies.has(strategyId);
  }

  getEnabledStrategies(): string[] {
    return Array.from(this.enabledStrategies);
  }

  /**
   * B6: Build a sized signal from a raw strategy signal
   * Routes all strategies through the centralized sizing helper
   */
  private buildSizedSignalForStrategy(
    rawSignal: StrategySignal | null,
    strategyId: StrategyType,
    sizingContext: SizingContext
  ): SizedStrategySignal | null {
    if (!rawSignal) return null;
    
    b5SizingAudit.logSignalCreated({
      strategy: strategyId,
      symbol: rawSignal.symbol,
      entryPrice: rawSignal.entryPrice,
      strategyQty: null,
      strategyNotional: null,
      hasEstimatedValue: false,
      hasPreComputedNotional: false,
    });

    const sizingResult = sizePaperPositionForSignal({
      portfolioValue: sizingContext.portfolioValue,
      guardrails: sizingContext.guardrails,
      entryPrice: rawSignal.entryPrice,
      stopPrice: rawSignal.stopPrice,
      symbol: rawSignal.symbol,
      strategy: strategyId,
    });

    if (sizingResult.quantity <= 0 || sizingResult.estimatedValue <= 0) {
      console.log(`[B6][SIZING_SKIP] Zero sizing result for ${rawSignal.symbol}/${strategyId}`);
      return null;
    }

    const sizedSignal: SizedStrategySignal = {
      ...rawSignal,
      quantity: sizingResult.quantity,
      estimatedValue: sizingResult.estimatedValue,
      preComputedNotional: sizingResult.estimatedValue,
    };

    console.log(`[B6][SIZED] ${rawSignal.symbol}/${strategyId}: qty=${sizingResult.quantity.toFixed(8)}, value=$${sizingResult.estimatedValue.toFixed(2)}`);

    return sizedSignal;
  }

  private async evaluateMarket(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const startTime = Date.now();
    console.log(`[37.A][SIGNAL] Strategy evaluation tick triggered [mode=${this.mode}]`);
    telemetryTrace.trace('SignalOrchestrator', 'MARKET_EVALUATION_START', 'INFO', { mode: this.mode });

    try {
      const systemContext = await storage.getSystemContext(this.mode);
      if (!systemContext) {
        console.error(`[37.A][SIGNAL] No system context found for mode ${this.mode}`);
        telemetryTrace.trace('SignalOrchestrator', 'NO_SYSTEM_CONTEXT', 'ERROR', { mode: this.mode });
        return;
      }

      const filters = await storage.getScreenerFilters({ mode: this.mode });
      if (!filters) {
        console.error(`[37.A][SIGNAL] No filters found for mode ${this.mode}`);
        telemetryTrace.trace('SignalOrchestrator', 'NO_FILTERS', 'ERROR', { mode: this.mode });
        return;
      }

      const filteredPairsStats = await this.filteredPairsService.getValidPairs(this.mode, filters);
      const eligibleSymbols = filteredPairsStats.filteredPairs.map(p => p.symbol);

      console.log(`[37.A][SIGNAL] Evaluating ${eligibleSymbols.length} eligible symbols`);
      telemetryTrace.trace('SignalOrchestrator', 'SYMBOLS_LOADED', 'INFO', { 
        mode: this.mode, 
        count: eligibleSymbols.length 
      });

      if (!systemContext.lastStartedBy) {
        console.error(`[37.A][SIGNAL] No user associated with ${this.mode} mode engine`);
        return;
      }
      
      const settings = {
        smaLength: 20,
        riskPerTradePercent: 2.0,
        maxOpenPositions: 5,
        dailyLossLimitPercent: 10.0,
        whitelistedSymbols: [],
        blacklistedSymbols: [],
        allowedTradingPairs: [],
      } as any;

      const guardrails = await storage.getGuardrailsV2({ mode: this.mode });
      const portfolioValue = await getPortfolioBalanceV2(this.mode, systemContext.lastStartedBy);
      
      if (portfolioValue <= 0) {
        console.error(`[B6][SIZING_ERROR] Invalid portfolio value: ${portfolioValue}`);
        return;
      }

      const sizingContext: SizingContext = {
        portfolioValue,
        guardrails,
        mode: this.mode,
      };

      console.log(`[B6][CONTEXT] portfolioValue=$${portfolioValue.toFixed(2)}, guardrails=${guardrails ? 'loaded' : 'null'}`);

      let symbolsEvaluated = 0;
      let strategiesRun = 0;
      let signalsGenerated = 0;
      let signalsForwarded = 0;

      for (const symbol of eligibleSymbols) {
        try {
          const selectedStrategies = Array.from(this.enabledStrategies);
          console.log("[8.8.3-B][SELECTION]", JSON.stringify({
            symbol,
            regime: null,
            selectedStrategies: "ALL_STRATEGIES",
            skippedStrategies: [],
            enabledCount: selectedStrategies.length
          }));

          const signals = await this.evaluateSymbol(symbol, settings, filters, sizingContext);
          symbolsEvaluated++;
          strategiesRun += this.enabledStrategies.size;
          signalsGenerated += signals.length;

          for (const signal of signals) {
            const validation = this.validateStrategySignal(signal);
            if (!validation.ok) {
              console.warn("[8.8.3-B][ROUTING] Dropped malformed StrategySignal", JSON.stringify({
                reason: validation.reason,
                symbol: signal.symbol,
                strategy: signal.strategy,
                entryPrice: signal.entryPrice,
                stopPrice: signal.stopPrice,
                targetPrice: signal.targetPrice,
                confidence: signal.confidence
              }));
              continue;
            }

            console.log("[B6][ROUTING] Sized StrategySignal accepted", JSON.stringify({
              symbol: signal.symbol,
              strategy: signal.strategy,
              entryPrice: signal.entryPrice?.toFixed(4),
              stopPrice: signal.stopPrice?.toFixed(4),
              targetPrice: signal.targetPrice?.toFixed(4),
              confidence: signal.confidence?.toFixed(2),
              quantity: (signal as any).quantity?.toFixed(8),
              estimatedValue: (signal as any).estimatedValue?.toFixed(2)
            }));

            if (this.onSignalCallback) {
              await this.onSignalCallback(signal);
              signalsForwarded++;
            }
          }
        } catch (error) {
          console.error(`[37.A][SIGNAL] Error evaluating ${symbol}:`, error);
        }
      }

      const now = new Date();
      this.stats = {
        symbolsEvaluated,
        strategiesRun,
        signalsGenerated,
        signalsForwarded,
        lastEvaluationAt: now,
        nextEvaluationAt: new Date(now.getTime() + this.evaluationIntervalMs),
      };

      const duration = Date.now() - startTime;
      console.log(`[37.A][SIGNAL] Ready-to-Buy list length: ${signalsGenerated}`);
      console.log(`[37.A][SIGNAL] Evaluation complete: ${symbolsEvaluated} symbols, ${signalsGenerated} signals, ${duration}ms`);

    } catch (error) {
      console.error(`[37.A][SIGNAL] Market evaluation error:`, error);
    }
  }

  private async evaluateSymbol(
    symbol: string,
    settings: TradingSettings,
    filters: ScreenerFilters,
    sizingContext: SizingContext
  ): Promise<SizedStrategySignal[]> {
    const signals: SizedStrategySignal[] = [];

    try {
      const ohlcResponse = await this.kraken.getOHLCData(symbol, 60);
      const ohlcData = ohlcResponse.ohlc;
      
      if (!ohlcData || ohlcData.length < 20) {
        return signals;
      }

      const ticker = await this.kraken.getTicker(symbol);
      const currentPrice = parseFloat(ticker[symbol]?.c[0] || '0');
      const currentVolume = parseFloat(ticker[symbol]?.v[1] || '0');
      
      if (!currentPrice || currentPrice === 0) {
        console.log(`[37.A][SIGNAL] Invalid price for ${symbol}`);
        return signals;
      }

      const vwap = this.calculateVWAP(ohlcData);
      const sma = this.calculateSMA(ohlcData, settings.smaLength || 20);
      const high24h = Math.max(...ohlcData.slice(-24).map(c => parseFloat(c.high)));
      const low24h = Math.min(...ohlcData.slice(-24).map(c => parseFloat(c.low)));

      const indicators = {
        vwap,
        sma,
        currentPrice,
        volume: currentVolume,
        high24h,
        low24h,
      };

      const ohlcAsAny = ohlcData as any[];
      
      if (this.enabledStrategies.has('vwap_pullback')) {
        const rawSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, ohlcAsAny);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'vwap_pullback', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (this.enabledStrategies.has('abcd_long')) {
        const rawSignal = this.strategyEngine.detectABCDLong(ohlcAsAny, settings);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'abcd_long', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (this.enabledStrategies.has('sma_trend_ride')) {
        const rawSignal = this.strategyEngine.detectSMATrendRide(indicators, ohlcAsAny, settings);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'sma_trend_ride', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (this.enabledStrategies.has('breakout')) {
        const rawSignal = this.strategyEngine.detectBreakout(ohlcAsAny, {
          minConsolidationBars: 10,
          maxRangeWidth: 3,
          breakoutBuffer: 1,
          volumeMultiplier: 2,
          maxHoldingHours: 12
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'breakout', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (this.enabledStrategies.has('mean_reversion')) {
        const rawSignal = this.strategyEngine.detectMeanReversion(indicators, ohlcAsAny, {
          meanType: 'vwap',
          smaLength: 20,
          deviationThreshold: 2.5,
          partialExitPercent: 50,
          stopLossBuffer: 1
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'mean_reversion', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (this.enabledStrategies.has('range_trading')) {
        const rawSignal = this.strategyEngine.detectRangeTrading(ohlcAsAny, {
          minRangeDurationHours: 12,
          minRangeWidth: 3,
          minBoundaryTouches: 3,
          entryZoneWidth: 0.5,
          stopLossBeyond: 1
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'range_trading', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (this.enabledStrategies.has('vwap_bounce')) {
        const rawSignal = this.strategyEngine.detectVWAPBounce(indicators, ohlcAsAny, {
          vwapProximity: 0.5,
          minVWAPSlope: 0.3,
          volumeMultiplier: 1.3,
          maxPullbackBars: 5,
          partialExitR: 1.5
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'vwap_bounce', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (this.enabledStrategies.has('liquidity_trap')) {
        const rawSignal = this.strategyEngine.detectLiquidityTrap(ohlcAsAny, {
          maxTrapExtension: 1.2,
          trapReturnBars: 2,
          minStopZoneSize: 'medium',
          minLevelTouches: 3,
          volumeRatio: 1.5
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'liquidity_trap', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (this.enabledStrategies.has('dhma')) {
        const rawSignal = this.strategyEngine.detectDHMA(indicators, ohlcAsAny, {
          theta_OBI: 0.3,
          epsilon_micro: 0.2,
          tau_toxicity: 0.7,
          maxSpread: 5,
          k_tp: 1.5,
          N_flow: 50,
          N_burst: 10,
          window_session: 20
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = this.buildSizedSignalForStrategy(rawSignal, 'dhma', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (signals.length > 0) {
        console.log(`[37.A][SIGNAL] ${symbol}: Generated ${signals.length} sized signal(s) - ${signals.map(s => s.strategy).join(', ')}`);
      }

    } catch (error) {
      console.error(`[37.A][SIGNAL] Error evaluating strategies for ${symbol}:`, error);
    }

    return signals;
  }

  private calculateVWAP(data: any[]): number {
    if (data.length === 0) return 0;

    let sumPriceVolume = 0;
    let sumVolume = 0;

    for (const candle of data) {
      const high = parseFloat(candle.high || candle[2]);
      const low = parseFloat(candle.low || candle[3]);
      const close = parseFloat(candle.close || candle[4]);
      const volume = parseFloat(candle.volume || candle[6]);
      
      const typical = (high + low + close) / 3;
      sumPriceVolume += typical * volume;
      sumVolume += volume;
    }

    return sumVolume > 0 ? sumPriceVolume / sumVolume : 0;
  }

  private calculateSMA(data: any[], period: number): number {
    if (data.length < period) return 0;

    const recentPrices = data.slice(-period).map((c: any) => parseFloat(c.close || c[4]));
    const sum = recentPrices.reduce((acc: number, price: number) => acc + price, 0);
    return sum / period;
  }

  private validateStrategySignal(signal: StrategySignal): { ok: boolean; reason?: string } {
    if (!signal.symbol) return { ok: false, reason: "missing symbol" };
    if (!signal.strategy) return { ok: false, reason: "missing strategy" };
    if (typeof signal.entryPrice !== "number" || signal.entryPrice <= 0 || !isFinite(signal.entryPrice))
      return { ok: false, reason: "invalid entryPrice" };
    if (typeof signal.stopPrice !== "number" || signal.stopPrice <= 0 || !isFinite(signal.stopPrice))
      return { ok: false, reason: "invalid stopPrice" };
    if (typeof signal.targetPrice !== "number" || signal.targetPrice <= 0 || !isFinite(signal.targetPrice))
      return { ok: false, reason: "invalid targetPrice" };
    if (signal.stopPrice >= signal.entryPrice)
      return { ok: false, reason: "stopPrice >= entryPrice (invalid for long)" };
    if (signal.targetPrice <= signal.entryPrice)
      return { ok: false, reason: "targetPrice <= entryPrice (invalid for long)" };
    if (typeof signal.confidence !== "number" || signal.confidence < 0 || signal.confidence > 100 || !isFinite(signal.confidence))
      return { ok: false, reason: "invalid confidence (must be 0-100)" };

    return { ok: true };
  }
}
