/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E — Signal Orchestrator
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Implements hybrid signal-orchestration loop for mode-aware market evaluation.
 * Periodically scans filtered symbols and evaluates trading strategies to generate signals.
 * 
 * DIRECTIVE 11.0E: FinalScore Unification
 * - ALL legacy metrics (NGC, CWQI, ProfitRate) references preserved for backward compatibility
 * - FinalScore is the PRIMARY ranking metric
 * - SQE evaluates FinalScore + RegimeWeight only
 * 
 * Architecture:
 * - Phase 8.8.7: Loads filtered symbols from activeFilterPool.getActivePool()
 * - Seeds immediate evaluation pass on start
 * - Timer-based evaluation (configurable interval)
 * - Calls all enabled strategies for each symbol
 * - Signals are sized via centralized sizing helper before forwarding
 * - FinalScore computed for signal ranking
 * - SQE used as filter with FinalScore/RegimeWeight thresholds
 * - FinalScore ranked signals forwarded to RTB queue
 * 
 * 8.8.7 Filter Synchronization:
 * - Uses activeFilterPool.getActivePool() for FX5-verified pairs ONLY
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { StrategyEngine, StrategySignal } from './strategy-engine';
// Phase 8.8.7: FilteredPairsService DEPRECATED - use activeFilterPool instead
// import { FilteredPairsService } from './filtered-pairs-service';
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
import { computeNetExpectancyKernel } from '../core/calculations/net-expectancy-kernel.js';
// M5B: Import disabled - VTS now runs autonomously, not from signal orchestrator
// import { captureSignalForVTS } from './vts-runner.js';
// Directive 9.3: Adaptive Kalman Filter integration
import { getSmoothedPrice, getKalmanFilter } from '../utils/adaptive-kalman.js';
import { calculateEfficiencyRatio, calculateVolNoise, calculateTrendSlope, calculateDirectionalIntegrity } from '../utils/analysis-utils.js';
// HF9: DSS import removed — DSS deleted (superseded by MCE regime filtering + detect functions)
import { SYSTEM_GUARDS } from '../config/system-guards.js';
// Batch 18: OHLC cache (5-min TTL) eliminates redundant per-symbol OHLC fetches
import { ohlcCache } from './ohlc-cache.js';
// Batch 18: Use priceCache for ticker data instead of per-symbol getTicker calls
import { priceCache } from './price-cache.js';
// Directive 12.3.1: Canonical regime calculator for pair-level regime
import { calculatePairRegime } from '../core/metrics/market-regime.js';
import type { OHLCData } from '../types/market-regime.types';
// Directive 10.2: Pattern Recognizer
import { getPatternRecognizer, type Candle, type PatternSignal, type SignalType } from './pattern-recognizer.js';
// Directive 10.4: Hybrid Integration
import { getHybridIntegration, type QuantSignal, type HybridSignal } from './hybrid-integration.js';
// Directive 10.7: Multi-Timeframe Expansion
import { cascadingScan } from './multi-timeframe-scanner.js';
import { TIMEFRAME_CONFIG } from '../config/system-guards.js';
// Directive 10.9A: Math Core Harmonization - Version-tracked weights
import { SCORE_WEIGHTS, SCORE_WEIGHTS_VERSION } from '../config/score-weights.config.js';
// Directive 11.3A: Net Expectancy Standardization - Canonical Cost Model
import { getCachedCostMetrics, computeNetGeometry, computeTotalRoundTripCost } from '../core/math/cost-model.js';
// Directive 11.4F.1B: Canonical regime-strategy mapping (single source of truth)
import { 
  CANONICAL_REGIME_STRATEGY_MAP as REGIME_STRATEGY_MAP, 
  STRATEGY_DISPLAY_NAMES,
  normalizeStrategy,
  type CanonicalRegimeType as MarketRegimeType 
} from '../config/canonical-regime-strategy-map.js';
// Directive 11.4H Task 1: Symbol normalization at data ingress
import { normalizeToInternalSymbol } from '../markets/kraken-symbol-resolver.js';
// Phase 13: Market Context Engine for centralized indicator + regime computation
import { getMarketContextEngine } from './market-context-engine.js';
import { computeBiasConfidenceModifier } from '../core/metrics/directional-bias.js';
// Phase 14.5: Pattern pool configuration
import { PATTERN_POOL_STRATEGIES, PATTERN_POOL_GUARDRAILS, DEFAULT_ASSET_CLASS } from '../config/pattern-filter-profile.js';
import { computeRankingScore, normalizeNetReturn, CONTEXT_BONUS } from '../config/ranking-weights.js';

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
  profitRate?: number;    // Profit per time unit
  cwqi?: number;          // Confidence-Weighted Quality Index
  // Directive 11.3A: Net Expectancy fields
  netExpectedEdge?: number;    // Net profit after costs
  netRewardToRisk?: number;    // Net R:R after costs
  totalRoundTripCost?: number; // Total costs (fee + slippage + spread)
}

interface SizingContext {
  portfolioValue: number;
  guardrails: GuardrailsV2 | null;
  mode: 'live' | 'paper';
}

export class SignalOrchestrator {
  private mode: 'live' | 'paper';
  private strategyEngine: StrategyEngine;
  // Phase 8.8.7: FilteredPairsService DEPRECATED - using activeFilterPool instead
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
    // Directive 12.3.2: All 17 canonical strategies enabled by default
    this.enabledStrategies = new Set(config.enabledStrategies || [
      // Original 9
      'vwap_pullback',
      'abcd_long',
      'sma_trend_ride',
      'breakout',
      'mean_reversion',
      'range_trading',      // Legacy name — canonical map uses 'range_trade'
      'range_trade',        // Directive 12.3.2: Canonical name added
      'vwap_bounce',
      'liquidity_trap',
      'dhma',
      // Directive 12.3.2: 8 new strategies
      'morning_star',
      'inside_bar_reversal',
      'support_bounce',
      'pivot_shift',
      'reverse_impulse',
      'defensive_hedge',
      'adaptive_flow',
      'volatility_edge'
    ]);
    
    this.strategyEngine = new StrategyEngine();
    // Phase 8.8.7: FilteredPairsService DEPRECATED - using activeFilterPool instead
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
   * Directive 11.4H.1 Task 6: Symbol validation before event dispatch
   */
  private async buildSizedSignalForStrategy(
    rawSignal: StrategySignal | null,
    strategyId: StrategyType,
    sizingContext: SizingContext,
    marketContext?: { high24h?: number; low24h?: number; atr?: number }
  ): Promise<SizedStrategySignal | null> {
    if (!rawSignal) return null;
    
    // Directive 11.4H.1 Task 6: Validate and normalize symbol before event dispatch
    const canonicalSymbol = normalizeToInternalSymbol(rawSignal.symbol);
    if (!canonicalSymbol) {
      console.warn(`[SignalOrchestrator] Dropped unmappable event: ${rawSignal.symbol}`);
      return null;
    }
    // Ensure normalized symbol is used in signal
    rawSignal.symbol = canonicalSymbol;
    
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
      // Phase 14: Additional inputs for FinalScore/RegimeWeight computation
      hybridScore: (rawSignal as any).hybridScore,
      trendStrength: 0.5, // Default for legacy signals
    });

    // Directive 12.3.3: Deterministic confidence + FinalScore from extended metrics
    console.log(`[12.3.3][METRICS] ${rawSignal.symbol}/${strategyId}: confidence=${extendedMetrics.confidence.toFixed(4)}, finalScore=${extendedMetrics.finalScore.toFixed(4)}, volatility=${(extendedMetrics.volatility ?? 0.3).toFixed(4)}`);

    // Phase 14: Apply DBS confidence modifier BEFORE SQE evaluation (parity with VTS path)
    // Adjusts confidence and recomputes FinalScore since it depends on confidence.
    let dbsModifier = 1.0;
    try {
      const mce = getMarketContextEngine();
      const mceCtx = mce.computeContext(rawSignal.symbol);
      dbsModifier = computeBiasConfidenceModifier(mceCtx.directionalBias?.category);
    } catch { /* MCE not ready — use neutral modifier */ }
    if (dbsModifier !== 1.0) {
      const rawConfidenceBeforeDBS = extendedMetrics.confidence;
      extendedMetrics.confidence = rawConfidenceBeforeDBS * dbsModifier;
      // Recompute FinalScore with DBS-adjusted confidence
      const adjHybrid = (rawSignal as any).hybridScore ?? extendedMetrics.confidence;
      extendedMetrics.finalScore = Math.max(0, Math.min(1,
        adjHybrid * SCORE_WEIGHTS.FINAL_SCORE.HYBRID +
        extendedMetrics.confidence * SCORE_WEIGHTS.FINAL_SCORE.CONFIDENCE +
        extendedMetrics.regimeWeight * SCORE_WEIGHTS.FINAL_SCORE.REGIME
      ));
      console.log(`[Phase14][DBS] ${rawSignal.symbol}/${strategyId}: dbsMod=${dbsModifier.toFixed(3)} adjConf=${extendedMetrics.confidence.toFixed(3)} adjFinalScore=${extendedMetrics.finalScore.toFixed(4)}`);
    }

    // Directive 11.0E: ML-enhanced predictions (non-blocking fire-and-forget)
    // Note: ML service still accepts ngc/cwqi for backward compatibility during transition
    const mlInput: PredictionInput = {
      symbol: rawSignal.symbol,
      strategy: strategyId,
      ngc: extendedMetrics.confidence, // Phase 14: ML interface keeps ngc field name for compat
      cwqi: extendedMetrics.cwqi, // Directive 11.0E: transitional - kept for ML backward compat
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
        const blendedConfidence = blendConfidence(extendedMetrics.confidence, promotionResult.probability, 0.6);
        console.log(`[L3][MODEL_INFER] ${rawSignal.symbol}/${strategyId}: promotion=${promotionResult.probability.toFixed(4)}, profit=${profitResult.predicted_profit.toFixed(4)}, blendedConfidence=${blendedConfidence.toFixed(4)}`);
      }
    }).catch(() => {});

    // Directive 11.0E: Trace raw metrics before SQE evaluation (FinalScore-native)
    diagnosticTrace.traceOrchestrator(
      rawSignal.symbol,
      strategyId,
      {
        confidence: extendedMetrics.confidence,
        volatility: extendedMetrics.volatility ?? 0.3,
        trendStrength: 0.5, // Default for legacy signals
        entryPrice: rawSignal.entryPrice,
      },
      false // not yet normalized by SQE
    );

    // Directive 11.0E: Apply SQE quality filter with FinalScore and RegimeWeight only
    // Phase 14: Pass pre-computed FinalScore and RegimeWeight — SQE no longer backfills
    // HF9 Item B: Compute regimeStability for governance gate in SQE
    let sqeRegimeStability: import('../../config/strategy-governance.js').RegimeStability | undefined;
    try {
      const { computeGlobalStability } = await import('../core/governance/regime-stability.js');
      const stabilityResult = computeGlobalStability(
        extendedMetrics.driftScore || 0.5,
        extendedMetrics.volZ || 0,
        extendedMetrics.confidence || 0.5
      );
      sqeRegimeStability = stabilityResult.stability;
    } catch { /* stability unavailable — SQE governance gate will be skipped */ }

    const sqeInput: SQEInput = {
      signalId,
      symbol: rawSignal.symbol,
      strategy: strategyId,
      mode: sizingContext.mode,
      confidence: extendedMetrics.confidence,
      finalScore: extendedMetrics.finalScore,
      regimeWeight: extendedMetrics.regimeWeight,
      trendStrength: 0.5,
      volatility: extendedMetrics.volatility ?? 0.3,
      regimeStability: sqeRegimeStability,  // HF9: For governance gate + confidence floor in SQE
      sourcePool: rawSignal.metadata?.sourcePool || 'quant',
    };

    const sqeResult = await signalQualityEvaluator.evaluate(sqeInput);
    
    if (!sqeResult.passed) {
      console.log(`[11.0E][SQE_REJECT] ${rawSignal.symbol}/${strategyId}: ${sqeResult.reason}`);
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
    
    // Phase 14: FinalScore computed in extended metrics — no duplicate calculation needed
    // Build RTB signal using pre-computed values from extendedMetrics
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
      confidence: extendedMetrics.confidence,
      finalScore: extendedMetrics.finalScore,
      regimeWeight: extendedMetrics.regimeWeight,
      hybridScore: (rawSignal as any).hybridScore ?? extendedMetrics.confidence,
      decayPenalty: 0,
      trendStrength: 0.5,
      volatility: extendedMetrics.volatility ?? 0.3,
      currentPrice: rawSignal.entryPrice,
      volume24h: activeFilterPool.getFX5DataForSymbol(rawSignal.symbol, sizingContext.mode)?.volume24h ?? null,
      sourcePool: rawSignal.metadata?.sourcePool || 'quant',
      signalType: (rawSignal as any).signalType || rawSignal.metadata?.signalType || 'QUANT',
      assetClass: rawSignal.metadata?.assetClass || DEFAULT_ASSET_CLASS,
      metadata: {
        strategyWeight,
        exposureBias,
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

    // Directive 11.3A: Compute net geometry with cost-aware adjustments
    const costMetrics = getCachedCostMetrics(rawSignal.symbol);
    const netGeometry = computeNetGeometry(
      rawSignal.entryPrice,
      rawSignal.stopPrice,
      rawSignal.targetPrice ?? rawSignal.entryPrice * 1.015,
      costMetrics
    );
    const totalCost = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
    
    console.log(`[11.3A][NET_GEOMETRY] ${rawSignal.symbol}/${strategyId}: netEdge=${(netGeometry.netExpectedEdge * 100).toFixed(3)}%, netRR=${netGeometry.netRewardToRisk.toFixed(2)}, totalCost=${(totalCost * 100).toFixed(3)}%`);

    // Directive 11.0E: Build sized signal with FinalScore-native metrics
    const sizedSignal: SizedStrategySignal = {
      ...rawSignal,
      quantity: sizingResult.quantity,
      estimatedValue: sizingResult.estimatedValue,
      preComputedNotional: sizingResult.estimatedValue,
      signalId,
      // Directive 11.0E: Confidence is the primary quality metric
      confidence: confidence,
      finalScore: signalFinalScore,
      regimeWeight: regimeWeight,
      hybridScore: hybridScore,
      volatility: extendedMetrics.volatility,
      // Directive 11.3A: Net expectancy fields
      netExpectedEdge: netGeometry.netExpectedEdge,
      netRewardToRisk: netGeometry.netRewardToRisk,
      totalRoundTripCost: totalCost,
    };

    console.log(`[11.0E][SIZED_SIGNAL] ${rawSignal.symbol}/${strategyId}: qty=${sizingResult.quantity.toFixed(8)}, value=$${sizingResult.estimatedValue.toFixed(2)}, FinalScore=${signalFinalScore.toFixed(4)}`);

    // Directive 11.0E: Capture pricing and risk metrics for learning dataset (FinalScore-native)
    // Directive 11.3A: Enhanced with net expectancy metrics
    dataAggregator.capture('PRICE_CALC', {
      symbol: rawSignal.symbol,
      strategy: strategyId,
      entry: rawSignal.entryPrice,
      exit: rawSignal.targetPrice,
      stop: rawSignal.stopPrice,
      spread: costMetrics.spread,
      finalScore: signalFinalScore, // Directive 11.0E: PRIMARY metric
      confidence: confidence,
      regimeWeight: regimeWeight,
      volatility: extendedMetrics.volatility,
      // Directive 11.3A: Net expectancy fields
      netExpectedEdge: netGeometry.netExpectedEdge,
      netRewardToRisk: netGeometry.netRewardToRisk,
      totalRoundTripCost: totalCost,
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

      // Phase 8.8.7: Use ONLY FX5 Active Filter Pool survivors for signal generation
      // This fixes the filter bypass where FilteredPairsService returned pairs that hadn't passed FX5 filters
      const fx5Survivors = activeFilterPool.getActivePool(this.mode);
      if (!fx5Survivors || fx5Survivors.length < 1) {
        console.warn(`[8.8.7][Orchestrator] Skipping signal generation – no FX5 survivors (mode=${this.mode})`);
        return;
      }
      // Phase 14.5: Get pattern pool pairs for separate evaluation
      const patternPoolPairs = activeFilterPool.getPatternPool(this.mode);
      const patternSymbols = patternPoolPairs.map(p => normalizeToInternalSymbol(p.symbol));
      console.log(`[14.5][ORCHESTRATOR] Pattern pool: ${patternSymbols.length} pairs for pattern/hybrid strategy evaluation`);
      // Directive 11.4H Task 1: Normalize symbols at data ingress
      const eligibleSymbols = fx5Survivors.map(p => normalizeToInternalSymbol(p.symbol));
      const fx5SymbolSet = new Set(eligibleSymbols);
      
      console.info(`[8.8.7][Orchestrator] Using FX5 Active Filter Pool – ${eligibleSymbols.length} eligible symbols.`);
      console.log(`[37.A][SIGNAL] Evaluating ${eligibleSymbols.length} eligible symbols`);
      telemetryTrace.trace('SignalOrchestrator', 'SYMBOLS_LOADED', 'INFO', { 
        mode: this.mode, 
        count: eligibleSymbols.length,
        source: 'FX5_ACTIVE_POOL'
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
      const portfolioValue = await getPortfolioBalanceV2(this.mode);
      
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

      // Phase 14.5: Process pattern pool — PATTERN + HYBRID strategies only
      let patternSignalsGenerated = 0;
      for (const symbol of patternSymbols) {
        try {
          // Skip if already processed in quant pool
          if (fx5SymbolSet.has(symbol)) continue;

          // Get OHLC data (uses ohlcCache — no new API calls)
          const ohlcData = await ohlcCache.getOHLCData(symbol, 60);
          if (!ohlcData || ohlcData.length < 10) continue;

          const currentPrice = parseFloat(ohlcData[ohlcData.length - 1].close);

          // Get MCE context for regime + indicators
          const mce = getMarketContextEngine();
          const volume24h = patternPoolPairs.find(p => normalizeToInternalSymbol(p.symbol) === symbol)?.volume24h ?? 0;
          const context = mce.computeContext(symbol, ohlcData, currentPrice, volume24h);

          // Pattern recognition
          const candles = ohlcData.map(d => ({
            open: parseFloat(d.open),
            high: parseFloat(d.high),
            low: parseFloat(d.low),
            close: parseFloat(d.close),
            volume: parseFloat(d.volume || '0'),
            timestamp: d.time * 1000,
          }));

          const patternSignals = getPatternRecognizer().scanPatterns(candles, symbol);
          const buyPatterns = patternSignals.filter(p => p.direction === 'BUY');

          for (const patternSig of buyPatterns) {
            const atr = context.indicators?.atr ?? (currentPrice * 0.02);
            const tradeSignal = getPatternRecognizer().patternToTradeSignal(patternSig, currentPrice, atr);

            const rawSignal = {
              symbol,
              strategy: tradeSignal.strategy || patternSig.pattern,
              entryPrice: tradeSignal.entryPrice ?? currentPrice,
              stopPrice: tradeSignal.stopPrice ?? currentPrice * 0.97,
              targetPrice: tradeSignal.targetPrice ?? currentPrice * 1.03,
              confidence: tradeSignal.confidence ?? patternSig.strength,
              metadata: {
                signalType: 'PATTERN',
                sourcePool: 'pattern',
                assetClass: DEFAULT_ASSET_CLASS,
                patternType: patternSig.pattern,
                patternStrength: patternSig.strength,
              },
            };

            const sizedSignal = await this.buildSizedSignalForStrategy(
              rawSignal, rawSignal.strategy, sizingContext
            );

            if (sizedSignal) {
              (sizedSignal as any).signalType = 'PATTERN';
              (sizedSignal as any).sourcePool = 'pattern';
              patternSignalsGenerated++;
            }
          }

          // Hybrid confluence check for pattern-pool pairs (PATTERN + QUANT from same pair)
          // Only if both quant and pattern signals exist for this symbol
          // (Hybrid strategies require both signal types to confluence)
        } catch (err) {
          console.warn(`[14.5][ORCHESTRATOR] Pattern pool eval failed for ${symbol}:`, err);
        }
      }
      console.log(`[14.5][ORCHESTRATOR] Pattern pool complete: ${patternSignalsGenerated} signal(s) generated from ${patternSymbols.length} pair(s)`);

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
      // Batch 18: Use OHLC cache (5-min TTL) — 60-min candles only change once/hour
      const ohlcResponse = await ohlcCache.getOHLCData(symbol, 60);
      const ohlcData = ohlcResponse.ohlc;
      
      if (!ohlcData || ohlcData.length < 20) {
        return signals;
      }

      // Batch 18: Use priceCache instead of per-symbol getTicker — these symbols are already
      // in the fx5Snapshot bucket (refreshed every 30s). Eliminates ~N redundant API calls/cycle.
      const cachedPrice = priceCache.getCachedPrice(symbol);
      const rawPrice = cachedPrice?.price || 0;
      const currentVolume = cachedPrice?.volume24h || 0;

      if (!rawPrice || rawPrice === 0) {
        console.log(`[37.A][SIGNAL] Invalid price for ${symbol} (not in priceCache)`);
        return signals;
      }

      // Directive 9.3: Apply Adaptive Kalman Filter for smoothed price
      const closePrices = ohlcData.map(c => parseFloat(c.close));
      const ER = calculateEfficiencyRatio(closePrices, 20);
      const VolNoise = calculateVolNoise(closePrices);
      const smoothedPrice = getSmoothedPrice(symbol, rawPrice, ER, VolNoise);
      
      // Directive 10.1: Calculate trend slope for DSS regime detection
      const trendSlope = calculateTrendSlope(closePrices);
      
      console.log(`[9.3][ER] ${symbol}=${ER.toFixed(4)} VolNoise=${VolNoise.toFixed(4)}`);
      
      // Phase 13: Convert Kraken OHLC to OHLCData format for MCE
      const ohlcForRegime: OHLCData[] = ohlcData.map((c: any) => ({
        open: parseFloat(c.open || c[1]),
        high: parseFloat(c.high || c[2]),
        low: parseFloat(c.low || c[3]),
        close: parseFloat(c.close || c[4]),
        volume: parseFloat(c.volume || c[6]),
        timestamp: parseFloat(c.timestamp || c[0]) || Date.now()
      }));

      // Phase 13: EXTREME_NOISE veto (preserved from DSS, pre-filter before MCE)
      if (VolNoise > SYSTEM_GUARDS.MAX_VOL_NOISE) {
        console.log(`[Phase13][MCE] SKIP ${symbol}: Extreme Noise veto (volNoise=${VolNoise.toFixed(4)} > ${SYSTEM_GUARDS.MAX_VOL_NOISE})`);
        return signals;
      }

      // Use smoothed price for strategy evaluation
      const currentPrice = smoothedPrice;

      // Phase 13: MCE computes indicators + regime in a single pass
      const mce = getMarketContextEngine();
      const mceContext = mce.computeContext(symbol, ohlcForRegime, currentPrice, currentVolume, settings.smaLength || 20);

      console.log(`[Phase13][MCE] ${symbol}: regime=${mceContext.regime.regime}, weight=${mceContext.regime.regimeWeight.toFixed(2)}, trendSlope=${trendSlope.toFixed(4)}, volNoise=${VolNoise.toFixed(4)}`);

      // Phase 13: Strategy filtering from MCE regime (replaces DSS getRegimeAllowedStrategies)
      const regimeStrategies = new Set(mceContext.regime.allowedStrategies);
      const activeStrategies = new Set(
        [...this.enabledStrategies].filter(s => regimeStrategies.has(s))
      );

      if (activeStrategies.size === 0) {
        console.log(`[Phase13][MCE] SKIP ${symbol}: No enabled strategies for regime ${mceContext.regime.regime}`);
        return signals;
      }

      console.log(`[Phase13][MCE] ${symbol}: activeStrategies=[${[...activeStrategies].join(',')}] for regime=${mceContext.regime.regime}`);

      // Phase 13: Use MCE pre-computed indicators (eliminates duplicate VWAP/SMA)
      const indicators = {
        vwap: mceContext.indicators.vwap,
        sma: mceContext.indicators.sma,
        currentPrice: mceContext.indicators.currentPrice,
        volume: mceContext.indicators.volume,
        high24h: mceContext.indicators.high24h,
        low24h: mceContext.indicators.low24h,
      };

      const ohlcAsAny = ohlcData as any[];
      
      // Directive 10.1: Only run strategies allowed for current regime
      if (activeStrategies.has('vwap_pullback')) {
        const rawSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, ohlcAsAny);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'vwap_pullback', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('abcd_long')) {
        const rawSignal = this.strategyEngine.detectABCDLong(ohlcAsAny, settings);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'abcd_long', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('sma_trend_ride')) {
        const rawSignal = this.strategyEngine.detectSMATrendRide(indicators, ohlcAsAny, settings);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'sma_trend_ride', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('breakout')) {
        const rawSignal = this.strategyEngine.detectBreakout(ohlcAsAny, {
          minConsolidationBars: 10,
          maxRangeWidth: 3,
          breakoutBuffer: 1,
          volumeMultiplier: 2,
          maxHoldingHours: 12
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'breakout', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('mean_reversion')) {
        const rawSignal = this.strategyEngine.detectMeanReversion(indicators, ohlcAsAny, {
          meanType: 'vwap',
          smaLength: 20,
          deviationThreshold: 2.5,
          partialExitPercent: 50,
          stopLossBuffer: 1
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'mean_reversion', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('range_trading')) {
        const rawSignal = this.strategyEngine.detectRangeTrading(ohlcAsAny, {
          minRangeDurationHours: 12,
          minRangeWidth: 3,
          minBoundaryTouches: 3,
          entryZoneWidth: 0.5,
          stopLossBeyond: 1
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'range_trading', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('vwap_bounce')) {
        const rawSignal = this.strategyEngine.detectVWAPBounce(indicators, ohlcAsAny, {
          vwapProximity: 0.5,
          minVWAPSlope: 0.3,
          volumeMultiplier: 1.3,
          maxPullbackBars: 5,
          partialExitR: 1.5
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'vwap_bounce', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('liquidity_trap')) {
        const rawSignal = this.strategyEngine.detectLiquidityTrap(ohlcAsAny, {
          maxTrapExtension: 1.2,
          trapReturnBars: 2,
          minStopZoneSize: 'medium',
          minLevelTouches: 3,
          volumeRatio: 1.5
        });
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'liquidity_trap', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('dhma')) {
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
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'dhma', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      // Directive 10.2: Pattern Recognition - Scan for candlestick patterns
      const patternRecognizer = getPatternRecognizer();
      const candles: Candle[] = ohlcData.map((c: any) => ({
        timestamp: parseInt(c.time || c[0]) * 1000,
        open: parseFloat(c.open || c[1]),
        high: parseFloat(c.high || c[2]),
        low: parseFloat(c.low || c[3]),
        close: parseFloat(c.close || c[4]),
        volume: parseFloat(c.volume || c[6] || '0'),
        timeframe: '1h' as const  // Directive 10.7: Tag with source timeframe
      }));
      
      let patternSignals = patternRecognizer.scanPatterns(candles, symbol);
      
      // Directive 10.7: Multi-Timeframe Cascade (when enabled)
      // Cascade to lower timeframes for additional pattern confirmation
      // Reuses already-fetched 1H candles to avoid duplicate Kraken requests
      if (TIMEFRAME_CONFIG.CASCADE.ENABLED) {
        try {
          const preloadedGlobalData = [{
            symbol,
            timeframe: '1h' as const,
            candles,
            regimeWeight: undefined,
            patternStrength: undefined
          }];
          
          const { globalPairs, tacticalPairs, precisionPairs } = await cascadingScan(
            this.kraken, 
            [symbol],
            { preloadedGlobalData }
          );
          
          const globalPatterns = globalPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol));
          const tacticalPatterns = tacticalPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol));
          const precisionPatterns = precisionPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol));
          
          const cascadePatterns = [...globalPatterns, ...tacticalPatterns, ...precisionPatterns];
          
          if (cascadePatterns.length > 0) {
            console.log(`[10.7][CASCADE] ${symbol}: Found ${cascadePatterns.length} pattern(s) (1H: ${globalPatterns.length}, 15m: ${tacticalPatterns.length}, 5m: ${precisionPatterns.length})`);
            patternSignals = cascadePatterns;
          }
        } catch (cascadeError) {
          console.log(`[10.7][CASCADE] ${symbol}: Cascade scan failed, using 1H patterns only`);
        }
      }
      
      // Phase 13: ATR from MCE (proper True Range formula, replaces inline range average)
      const atr = mceContext.indicators.atr;
      
      // ═══════════════════════════════════════════════════════════════
      // Directive 12.3.2: 8 New Strategy Evaluations
      // These strategies require pattern signals as input.
      // Convert detected patterns to PatternInput format for strategy modules.
      // ═══════════════════════════════════════════════════════════════
      const bestPattern = patternSignals.length > 0 ? patternSignals.reduce((best, p) =>
        p.strength > best.strength ? p : best, patternSignals[0]) : null;

      const patternInput = bestPattern ? {
        pattern: bestPattern.pattern,
        direction: bestPattern.direction as 'BUY' | 'SELL',
        strength: bestPattern.strength,
        metadata: {
          ...bestPattern,
          // Support-bounce needs low values
          parentHigh: bestPattern.metadata?.parentHigh ?? (candles.length >= 2 ? candles[candles.length - 2].high : 0),
          parentLow: bestPattern.metadata?.parentLow ?? (candles.length >= 2 ? candles[candles.length - 2].low : 0),
          compressionRatio: bestPattern.metadata?.compressionRatio ?? 0.5,
          pinbarLow: bestPattern.metadata?.pinbarLow ?? (candles.length > 0 ? candles[candles.length - 1].low : 0),
          engulfingLow: bestPattern.metadata?.engulfingLow ??
            (candles.length >= 2 ? Math.min(candles[candles.length - 1].low, candles[candles.length - 2].low) : 0),
          engulfRatio: bestPattern.metadata?.engulfRatio ?? 1.0,
          hasGap: bestPattern.metadata?.hasGap ?? false,
          recoveryRatio: bestPattern.metadata?.recoveryRatio ?? 0,
          // ABCD metadata for volatility_edge
          aPointLow: bestPattern.metadata?.aPointLow,
          bPointHigh: bestPattern.metadata?.bPointHigh,
          cPointLow: bestPattern.metadata?.cPointLow,
          cPointHigh: bestPattern.metadata?.cPointHigh,
        }
      } : null;

      if (activeStrategies.has('morning_star')) {
        const rawSignal = this.strategyEngine.detectMorningStar(indicators, ohlcAsAny, patternInput);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'morning_star' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('inside_bar_reversal')) {
        const rawSignal = this.strategyEngine.detectInsideBarReversal(indicators, ohlcAsAny, patternInput);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'inside_bar_reversal' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('support_bounce')) {
        const rawSignal = this.strategyEngine.detectSupportBounce(indicators, ohlcAsAny, patternInput);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'support_bounce' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('pivot_shift')) {
        const rawSignal = this.strategyEngine.detectPivotShift(indicators, ohlcAsAny, patternInput);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'pivot_shift' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('reverse_impulse')) {
        const rawSignal = this.strategyEngine.detectReverseImpulse(indicators, ohlcAsAny, patternInput);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'reverse_impulse' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('defensive_hedge')) {
        // Defensive hedge requires BTC candle data for correlation calculation
        // TODO: Pass BTC OHLC from pricing service cache when available
        const rawSignal = this.strategyEngine.detectDefensiveHedge(indicators, ohlcAsAny, patternInput);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'defensive_hedge' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('adaptive_flow')) {
        const rawSignal = this.strategyEngine.detectAdaptiveFlow(indicators, ohlcAsAny, patternInput);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'adaptive_flow' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('volatility_edge')) {
        const rawSignal = this.strategyEngine.detectVolatilityEdge(indicators, ohlcAsAny, patternInput);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'volatility_edge' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      console.log(`[12.3.2][EVAL] ${symbol}: ${signals.length} signals from ${activeStrategies.size} strategies (pattern=${bestPattern?.pattern ?? 'none'})`);

      // Convert pattern signals to trade signals and add to queue
      for (const patternSig of patternSignals) {
        // Only process BUY patterns for long-only trading
        if (patternSig.direction !== 'BUY') continue;
        
        const tradeSignal = patternRecognizer.patternToTradeSignal(patternSig, currentPrice, atr);
        
        // Build StrategySignal-compatible object
        const rawPatternSignal = {
          symbol,
          strategy: tradeSignal.strategy as any,
          entryPrice: tradeSignal.entryPrice,
          stopPrice: tradeSignal.stopPrice,
          targetPrice: tradeSignal.targetPrice,
          confidence: tradeSignal.confidence,
          metadata: {
            ...tradeSignal.metadata,
            signalType: 'PATTERN' as SignalType,
            patternType: patternSig.pattern,
            patternStrength: patternSig.strength
          }
        };
        
        // Size the pattern signal (use 'breakout' as base strategy type for sizing)
        const sizedPatternSignal = await this.buildSizedSignalForStrategy(rawPatternSignal as any, 'breakout' as StrategyType, sizingContext);
        if (sizedPatternSignal) {
          // Tag with PATTERN signalType
          (sizedPatternSignal as any).signalType = 'PATTERN';
          (sizedPatternSignal as any).patternType = patternSig.pattern;
          (sizedPatternSignal as any).patternStrength = patternSig.strength;
          signals.push(sizedPatternSignal);
          console.log(`[10.2][PATTERN] ${symbol}: Added ${patternSig.pattern} signal with strength=${patternSig.strength.toFixed(2)}`);
        }
      }

      // Directive 10.4: Hybrid Integration - Detect confluence between Quant and Pattern signals
      // Use the most recent candle timestamp for quant signal alignment (consistent clock source)
      const latestCandleTimestamp = candles.length > 0 ? candles[candles.length - 1].timestamp : Date.now();
      
      const hybridIntegration = getHybridIntegration();
      const quantSignals: QuantSignal[] = signals
        .filter(s => !(s as any).signalType || (s as any).signalType === 'QUANT')
        .map(s => ({
          symbol: s.symbol || symbol,
          strategy: s.strategy,
          entryPrice: s.entryPrice || 0,
          stopPrice: s.stopPrice || 0,
          targetPrice: s.targetPrice || 0,
          confidence: s.confidence || 0,
          direction: 'BUY' as const, // Long-only trading system: all quant signals are BUY
          timestamp: latestCandleTimestamp, // Use candle timestamp for clock-synchronized confluence
          expectancy: s.ngc || (s.confidence && s.confidence <= 1 ? s.confidence : (s.confidence || 0) / 100),
          metadata: s.metadata,
        }));
      
      const buyPatternSignals = patternSignals.filter(p => p.direction === 'BUY');
      
      if (quantSignals.length > 0 && buyPatternSignals.length > 0) {
        const hybridSignals = hybridIntegration.detectConfluence(quantSignals, buyPatternSignals);
        
        for (const hybrid of hybridSignals) {
          const rawHybridSignal = {
            symbol: hybrid.symbol,
            strategy: hybrid.strategy as any,
            entryPrice: hybrid.entryPrice,
            stopPrice: hybrid.stopPrice,
            targetPrice: hybrid.targetPrice,
            confidence: hybrid.hybridScore,
            metadata: {
              signalType: 'HYBRID' as SignalType,
              hybridScore: hybrid.hybridScore,
              hybridStrategy: hybrid.hybridStrategy,
              patternType: hybrid.patternType,
              patternStrength: hybrid.patternStrength,
              effectivePatternStrength: hybrid.effectivePatternStrength,  // Directive 10.5
              decayAge: hybrid.decayAge,                                  // Directive 10.5
              componentScores: hybrid.componentScores,
            }
          };
          
          const sizedHybridSignal = await this.buildSizedSignalForStrategy(rawHybridSignal as any, hybrid.strategy as StrategyType, sizingContext);
          if (sizedHybridSignal) {
            (sizedHybridSignal as any).signalType = 'HYBRID';
            (sizedHybridSignal as any).hybridScore = hybrid.hybridScore;
            (sizedHybridSignal as any).hybridStrategy = hybrid.hybridStrategy;
            (sizedHybridSignal as any).patternType = hybrid.patternType;
            (sizedHybridSignal as any).patternStrength = hybrid.patternStrength;
            (sizedHybridSignal as any).effectivePatternStrength = hybrid.effectivePatternStrength;  // Directive 10.5
            (sizedHybridSignal as any).decayAge = hybrid.decayAge;                                  // Directive 10.5
            (sizedHybridSignal as any).componentScores = hybrid.componentScores;
            signals.push(sizedHybridSignal);
          }
        }
      }

      // HF9: DSS replaced with inline NetEV > 0 filter using canonical expectancy kernel
      // DSS.evaluate() was never reachable (crashed on undefined `dss` variable).
      // This inline filter preserves the NetEV > 0 enforcement that DSS was supposed to provide.
      if (signals.length > 0) {
        console.log(`[37.A][SIGNAL] ${symbol}: Generated ${signals.length} sized signal(s) - ${signals.map(s => s.strategy).join(', ')}`);

        // Filter signals by NetEV > 0 using canonical expectancy kernel
        const evFilteredSignals = signals.filter(signal => {
          const entry = signal.entryPrice || 0;
          const target = signal.targetPrice || 0;
          const stop = signal.stopPrice || 0;

          if (entry <= 0 || target <= 0 || stop <= 0) return false;

          const costMetrics = getCachedCostMetrics(symbol);
          const frictionPct = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
          const frictionPerUnit = frictionPct * entry;
          const DI = calculateDirectionalIntegrity(closePrices);

          const kernelResult = computeNetExpectancyKernel({
            entryPrice: entry,
            stopPrice: stop,
            targetPrice: target,
            totalFriction: frictionPerUnit,
            DI,
          });

          if (kernelResult.netEV <= 0) {
            console.log(`[HF9][NetEV] Filtering ${symbol}/${signal.strategy}: netEV=${kernelResult.netEV.toFixed(6)} <= 0`);
            return false;
          }
          return true;
        });

        if (evFilteredSignals.length < signals.length) {
          console.log(`[HF9][NetEV] ${symbol}: Filtered ${signals.length} → ${evFilteredSignals.length} signals by NetEV > 0`);
        }
        signals.length = 0;
        signals.push(...evFilteredSignals);
      }

    } catch (error) {
      console.error(`[37.A][SIGNAL] Error evaluating strategies for ${symbol}:`, error);
    }

    return signals;
  }

  /**
   * Directive 10.1: Get strategies allowed for the current market regime
   */
  /**
   * Directive 12.3.1: Get regime-allowed strategies from CANONICAL_REGIME_STRATEGY_MAP
   * Replaces SYSTEM_GUARDS.STRATEGY_MAP (old 5-regime model with wrong strategy assignments)
   */
  private getRegimeAllowedStrategies(regime: string): Set<string> {
    const mapping = REGIME_STRATEGY_MAP[regime as MarketRegimeType];
    if (!mapping) {
      console.log(`[12.3.1][REGIME] Unknown regime '${regime}', returning empty strategy set`);
      return new Set();
    }
    const strategies = mapping.strategies.map(s => s.strategyKey);
    return new Set(strategies);
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
