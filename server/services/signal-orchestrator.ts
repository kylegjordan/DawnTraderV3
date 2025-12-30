/**
 * Phase 37/B6 + 8.8.4-B.1: Signal Orchestrator
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
 * - B.1: Computes NGC, ExpectedDuration, ProfitRate, CWQI for each signal
 * - B.1: Routes signals through SQE filter before forwarding
 * - De-duplicates and scores signals
 * - Forwards winning signals to TradingEngine for processing
 * 
 * Separation of Concerns:
 * - MarketScanner: maintains universe of eligible symbols
 * - SignalOrchestrator: evaluates strategies, computes metrics, filters via SQE
 * - StrategyEngine: pure/deterministic strategy detection
 * - TradingEngine: executes trades and manages positions
 * 
 * B6 Refactor:
 * - All 9 strategies now route through buildSizedSignalForStrategy()
 * - Signals are pre-sized with quantity and estimatedValue before forwarding
 * - Uses centralized sizing helper from paper-position-sizing.ts
 * 
 * B.1 Enhancements:
 * - NGC (Normalized Global Confidence) computed upstream
 * - Extended metrics (ExpectedDuration, ProfitRate) computed
 * - SQE used as pure filter with pre-computed metrics
 * - CWQI ranked signals forwarded to RTB queue
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
import { c5FinancialDiagnostics } from './c5-financial-diagnostics.js';
import { signalLifecycleAudit } from '../core/audit/signal_lifecycle_audit.js';
import { calculateExtendedSignalMetrics, estimateVolatility } from '../core/metrics/quality_index.js';
import { signalQualityEvaluator, type SQEInput } from '../core/filters/signal_quality_evaluator.js';
import { readyToBuyService, type SQESignalInput } from '../core/rtb/ready_to_buy_service.js';
import { activeFilterPool } from './active-filter-pool.js';
import { diagnosticTrace } from '../core/diagnostics/trace_service.js';
import { dataAggregator } from './data-aggregator.js';
import { predictPromotion, predictProfit, blendConfidence, type PredictionInput } from './ml-service-client.js';
import { getWeightSync as getStrategyWeight, computeStrategyWeights } from '../utils/strategyWeights.js';
import { getExposureMultiplierSync, computeExposureBias, getBiasSummaryForLog } from '../utils/strategyBias.js';
// M5B: Import disabled - VTS now runs autonomously, not from signal orchestrator
// import { captureSignalForVTS } from './vts-runner.js';

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
  signalId?: string; // Phase 8.8.4-A: SLAL lifecycle tracking ID
  // Phase 8.8.4-B.1: Extended metrics
  ngc?: number;           // Normalized Global Confidence
  riskScore?: number;     // Computed risk score
  volatility?: number;    // Estimated volatility
  expectedDuration?: number; // Expected hold time in minutes
  profitRate?: number;    // Profit per time unit
  cwqi?: number;          // Confidence-Weighted Quality Index
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
  private weightsRefreshTimer: NodeJS.Timeout | null = null; // L9: Timer for strategy weights cache refresh
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
    
    // L9: Pre-warm strategy weights cache before processing signals
    try {
      const weightsBundle = await computeStrategyWeights();
      const weightSummary = Object.entries(weightsBundle.weights)
        .map(([s, w]) => `${s}=${(w * 100).toFixed(1)}%`)
        .join(', ');
      console.log(`[L9][WEIGHTS_WARMUP] Cache populated with ${weightsBundle.totalStrategies} strategies: ${weightSummary || 'none'}`);
    } catch (err) {
      console.warn(`[L9][WEIGHTS_WARMUP] Failed to pre-warm strategy weights cache:`, err);
    }
    
    // L10: Pre-warm exposure bias cache
    try {
      const biasBundle = await computeExposureBias();
      const biasSummary = getBiasSummaryForLog();
      console.log(`[L10][BIAS_WARMUP] Cache populated with ${Object.keys(biasBundle.strategies).length} strategies: ${biasSummary}`);
    } catch (err) {
      console.warn(`[L10][BIAS_WARMUP] Failed to pre-warm exposure bias cache:`, err);
    }
    
    console.log(`[37.A][SignalOrchestrator][${this.mode}] Starting with ${this.enabledStrategies.size} strategies, interval ${this.evaluationIntervalMs}ms`);
    console.log(`[B.3][FLOW_CORRECTED] Signal flow order: Sizing → Metrics → SQE → RTB → TCL`);
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
    
    // L9+L10: Periodic background refresh of strategy weights and exposure bias caches (every 60s to match TTL)
    this.weightsRefreshTimer = setInterval(async () => {
      try {
        const weightsBundle = await computeStrategyWeights();
        console.log(`[L9][WEIGHTS_REFRESH] Cache refreshed with ${weightsBundle.totalStrategies} strategies`);
        
        // L10: Refresh exposure bias alongside weights
        const biasBundle = await computeExposureBias();
        console.log(`[L10][BIAS_REFRESH] Cache refreshed: ${getBiasSummaryForLog()}`);
      } catch (err) {
        console.warn(`[L9/L10][CACHE_REFRESH] Failed to refresh caches:`, err);
      }
    }, 60000); // 60s to match cache TTL

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
    
    // L9: Clean up weights refresh timer
    if (this.weightsRefreshTimer) {
      clearInterval(this.weightsRefreshTimer);
      this.weightsRefreshTimer = null;
    }

    this.isRunning = false;
    this.onSignalCallback = null;
    
    console.log(`[37.A][SignalOrchestrator][${this.mode}] Stopped`);
    telemetryTrace.trace('SignalOrchestrator', 'STOP_SUCCESS', 'INFO', { mode: this.mode });
  }

  /**
   * Phase 8.8.3-B7.A: Reset all in-memory session state
   * Called during hard reset to clear cooldowns, recent signals, session caches, and diagnostics.
   */
  resetSession(): void {
    console.log(`[B7.A][ORCHESTRATOR] Resetting session state for mode=${this.mode}`);
    
    // Stop orchestrator if running
    this.stop();
    
    // Reset stats
    this.stats = {
      symbolsEvaluated: 0,
      strategiesRun: 0,
      signalsGenerated: 0,
      signalsForwarded: 0,
      lastEvaluationAt: new Date(0),
      nextEvaluationAt: new Date(0),
    };
    
    // B7.A Enhancement: Reset diagnostics service buffers
    try {
      if (this.diagnosticService && typeof this.diagnosticService.resetSession === 'function') {
        this.diagnosticService.resetSession();
        console.log(`[B7.A][ORCHESTRATOR] Diagnostics service reset`);
      }
    } catch (diagErr) {
      console.warn(`[B7.A][ORCHESTRATOR] Diagnostics reset warning:`, diagErr);
    }
    
    // B7.A Enhancement: Reset B5 sizing audit for this mode
    try {
      b5SizingAudit.reset();
      console.log(`[B7.A][ORCHESTRATOR] B5 sizing audit reset`);
    } catch (sizingErr) {
      console.warn(`[B7.A][ORCHESTRATOR] B5 sizing reset warning:`, sizingErr);
    }
    
    console.log(`[B7.A][ORCHESTRATOR] Session state reset complete for mode=${this.mode}`);
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
   * B6 + B.1 + B.3: Build a sized signal from a raw strategy signal
   * Routes all strategies through the centralized sizing helper
   * Phase 8.8.4-A: SLAL instrumentation for GENERATION and SIZING stages
   * Phase 8.8.4-B.1: Compute NGC, ExpectedDuration, ProfitRate, CWQI
   * Phase 8.8.4-B.1: Apply SQE quality filter
   * Phase 8.8.4-B.3: Correct flow order - Sizing → Metrics → SQE
   */
  private buildSizedSignalForStrategy(
    rawSignal: StrategySignal | null,
    strategyId: StrategyType,
    sizingContext: SizingContext,
    marketContext?: { high24h?: number; low24h?: number; atr?: number }
  ): SizedStrategySignal | null {
    if (!rawSignal) return null;
    
    // Phase 8.8.4-A: Generate unique signal ID for lifecycle tracking
    const signalId = signalLifecycleAudit.generateSignalId(rawSignal.symbol, strategyId);
    
    // Phase 8.8.4-A: Record GENERATION stage
    signalLifecycleAudit.recordGeneration(
      signalId,
      sizingContext.mode,
      rawSignal.symbol,
      strategyId,
      {
        entryPrice: rawSignal.entryPrice,
        stopPrice: rawSignal.stopPrice,
        targetPrice: rawSignal.targetPrice,
        confidence: rawSignal.confidence,
      }
    );
    
    b5SizingAudit.logSignalCreated({
      strategy: strategyId,
      symbol: rawSignal.symbol,
      entryPrice: rawSignal.entryPrice,
      strategyQty: null,
      strategyNotional: null,
      hasEstimatedValue: false,
      hasPreComputedNotional: false,
    });

    // Phase 8.8.4-B.3: STEP 1 - Sizing FIRST (before metrics computation)
    const sizingResult = sizePaperPositionForSignal({
      portfolioValue: sizingContext.portfolioValue,
      guardrails: sizingContext.guardrails,
      entryPrice: rawSignal.entryPrice,
      stopPrice: rawSignal.stopPrice,
      symbol: rawSignal.symbol,
      strategy: strategyId,
    });

    // Phase 8.8.3-C5-2: Guardrail Input Verification - log balance used for trade sizing
    c5FinancialDiagnostics.logGuardrailInput(
      sizingContext.mode,
      rawSignal.symbol,
      strategyId,
      sizingContext.portfolioValue
    );

    if (sizingResult.quantity <= 0 || sizingResult.estimatedValue <= 0) {
      // Phase 8.8.4-A: Record SIZING failure
      signalLifecycleAudit.recordSizing(
        signalId,
        sizingContext.mode,
        rawSignal.symbol,
        strategyId,
        false,
        { portfolioValue: sizingContext.portfolioValue, quantity: sizingResult.quantity, estimatedValue: sizingResult.estimatedValue },
        'ZERO_SIZE'
      );
      console.log(`[B.3][SIZING_SKIP] Zero sizing result for ${rawSignal.symbol}/${strategyId}`);
      return null;
    }

    // Phase 8.8.4-A: Record SIZING success
    signalLifecycleAudit.recordSizing(
      signalId,
      sizingContext.mode,
      rawSignal.symbol,
      strategyId,
      true,
      { quantity: sizingResult.quantity, estimatedValue: sizingResult.estimatedValue }
    );

    console.log(`[B.3][SIZING] ${rawSignal.symbol}/${strategyId}: qty=${sizingResult.quantity.toFixed(8)}, value=$${sizingResult.estimatedValue.toFixed(2)}`);

    // Phase 8.8.4-B.3: STEP 2 - Compute extended signal metrics AFTER sizing
    const extendedMetrics = calculateExtendedSignalMetrics({
      confidence: rawSignal.confidence,
      entryPrice: rawSignal.entryPrice,
      stopPrice: rawSignal.stopPrice,
      targetPrice: rawSignal.targetPrice,
      atr: marketContext?.atr,
      high24h: marketContext?.high24h,
      low24h: marketContext?.low24h,
    });

    console.log(`[B.3][METRICS] ${rawSignal.symbol}/${strategyId}: NGC=${extendedMetrics.ngc.toFixed(4)}, CWQI=${extendedMetrics.cwqi.toFixed(4)}, ProfitRate=${extendedMetrics.profitRate.toFixed(4)}`);

    // Directive 8.8.4-L3: ML-enhanced predictions (non-blocking fire-and-forget)
    const mlInput: PredictionInput = {
      symbol: rawSignal.symbol,
      strategy: strategyId,
      ngc: extendedMetrics.ngc,
      cwqi: extendedMetrics.cwqi,
      riskRatio: extendedMetrics.riskScore,
      profitTarget: extendedMetrics.profitRate,
      signalAge: 0,
      entry: rawSignal.entryPrice,
      exit: rawSignal.targetPrice,
      stop: rawSignal.stopPrice,
    };
    
    // Fire-and-forget ML predictions - results logged for learning, don't block pipeline
    Promise.all([
      predictPromotion(mlInput),
      predictProfit(mlInput)
    ]).then(([promotionResult, profitResult]) => {
      if (promotionResult.success && profitResult.success) {
        const blendedNGC = blendConfidence(extendedMetrics.ngc, promotionResult.probability, 0.6);
        console.log(`[L3][MODEL_INFER] ${rawSignal.symbol}/${strategyId}: promotion=${promotionResult.probability.toFixed(4)}, profit=${profitResult.predicted_profit.toFixed(4)}, blendedNGC=${blendedNGC.toFixed(4)}`);
      }
    }).catch(() => {});

    // Directive 8.8.4-A3.R9.0.D: Trace raw metrics before SQE evaluation
    diagnosticTrace.traceOrchestrator(
      rawSignal.symbol,
      strategyId,
      {
        ngc: extendedMetrics.ngc,
        cwqi: extendedMetrics.cwqi,
        profit: extendedMetrics.profitRate,
        risk: extendedMetrics.riskScore,
      },
      false // not yet normalized by SQE
    );

    // Phase 8.8.4-B.3: STEP 3 - Apply SQE quality filter AFTER metrics
    const sqeInput: SQEInput = {
      signalId,
      symbol: rawSignal.symbol,
      strategy: strategyId,
      ngc: extendedMetrics.ngc,
      riskScore: extendedMetrics.riskScore,
      profitRate: extendedMetrics.profitRate,
      cwqi: extendedMetrics.cwqi,
    };

    const sqeResult = signalQualityEvaluator.evaluate(sqeInput);
    
    if (!sqeResult.passed) {
      console.log(`[B.3][SQE_REJECT] ${rawSignal.symbol}/${strategyId}: ${sqeResult.reason}`);
      signalLifecycleAudit.recordRejection(
        signalId,
        sizingContext.mode,
        rawSignal.symbol,
        strategyId,
        'VALIDATION',
        'SQE_QUALITY_REJECT',
        { sqeReject: true, reason: sqeResult.reason }
      );
      return null;
    }

    console.log(`[B.3][SQE_PASS] ${rawSignal.symbol}/${strategyId}: passed SQE filter`);

    // Phase 8.8.4-C.5: Queue SQE-qualified signal to RTB pool
    // All signals that pass SQE go into the unified pool regardless of capacity
    // L9: Fetch strategy weight for this signal's strategy (sync from cache)
    const strategyWeight = getStrategyWeight(strategyId);
    // L10: Fetch exposure bias multiplier for this strategy
    const exposureBias = getExposureMultiplierSync(strategyId);
    
    const sqeSignalInput: SQESignalInput = {
      signalId,
      mode: sizingContext.mode,
      symbol: rawSignal.symbol,
      strategy: strategyId,
      entryPrice: rawSignal.entryPrice,
      stopPrice: rawSignal.stopPrice,
      targetPrice: rawSignal.targetPrice,
      quantity: sizingResult.quantity,
      notional: sizingResult.estimatedValue,
      confidence: extendedMetrics.ngc,
      ngc: extendedMetrics.ngc,
      riskScore: extendedMetrics.riskScore,
      profitRate: extendedMetrics.profitRate,
      cwqi: extendedMetrics.cwqi,
      currentPrice: rawSignal.entryPrice, // Directive 8.8.4-C.14.B: Use entry price as current market price
      volume24h: activeFilterPool.getFX5DataForSymbol(rawSignal.symbol, sizingContext.mode)?.volume24h ?? null, // Directive 8.8.4-C.14.B: FX5 data only, NULL if not found
      metadata: {
        strategyWeight, // L9: Strategy reliability weight for finalRank computation
        exposureBias, // L10: Exposure bias multiplier for risk allocation
      },
    };
    
    console.log(`[L9][SIGNAL_WEIGHT] ${rawSignal.symbol}/${strategyId}: strategyWeight=${strategyWeight.toFixed(4)}`);
    console.log(`[L10][EXPOSURE_BIAS] ${rawSignal.symbol}/${strategyId}: exposureBias=${exposureBias.toFixed(4)}`);

    // Queue to RTB pool (fire-and-forget, non-blocking)
    readyToBuyService.queueSQESignal(sqeSignalInput).catch(err => {
      console.error(`[8.8.4-C.5][RTB_ERROR] Failed to queue ${rawSignal.symbol}/${strategyId}:`, err);
    });

    // M5B: VTS capture DISABLED - VTS now runs autonomously
    // VTS generates its own signals from pricing service cache when tradingActive=false
    // See: server/services/vts-runner.ts → runAutonomousSimulation()
    // DEPRECATED: captureSignalForVTS() no longer called from signal orchestrator

    // Phase 8.8.4-B.3: Build sized signal with extended metrics
    // NGC replaces raw confidence as the single source of truth
    const sizedSignal: SizedStrategySignal = {
      ...rawSignal,
      quantity: sizingResult.quantity,
      estimatedValue: sizingResult.estimatedValue,
      preComputedNotional: sizingResult.estimatedValue,
      signalId,
      // B.3: NGC is the SINGLE source of confidence (replaces raw confidence)
      confidence: extendedMetrics.ngc,
      ngc: extendedMetrics.ngc,
      riskScore: extendedMetrics.riskScore,
      volatility: extendedMetrics.volatility,
      expectedDuration: extendedMetrics.expectedDuration,
      profitRate: extendedMetrics.profitRate,
      cwqi: extendedMetrics.cwqi,
    };

    console.log(`[B.3][SIZED_SIGNAL] ${rawSignal.symbol}/${strategyId}: qty=${sizingResult.quantity.toFixed(8)}, value=$${sizingResult.estimatedValue.toFixed(2)}, NGC=${extendedMetrics.ngc.toFixed(4)}, CWQI=${extendedMetrics.cwqi.toFixed(4)}`);

    // Directive 8.8.4-L1.R1: Capture pricing and risk metrics for learning dataset
    dataAggregator.capture('PRICE_CALC', {
      symbol: rawSignal.symbol,
      strategy: strategyId,
      entry: rawSignal.entryPrice,
      exit: rawSignal.targetPrice,
      stop: rawSignal.stopPrice,
      spread: (rawSignal as any).spread ?? null,
      profitTarget: extendedMetrics.profitRate ?? null,
      riskRatio: extendedMetrics.riskScore ?? null,
      ngc: extendedMetrics.ngc,
      cwqi: extendedMetrics.cwqi,
    }).catch(() => {});

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
