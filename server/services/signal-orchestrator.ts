/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E — Signal Orchestrator
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Implements hybrid signal-orchestration loop for mode-aware market evaluation.
 * Periodically scans filtered symbols and evaluates trading strategies to generate signals.
 * 
 * DIRECTIVE 11.0E: FinalScore Unification
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
// B72 (2026-05-05): orchestrator timing intervals from module='signal_orchestrator'.
import { getCachedNumberRequired } from './module-constants-service.js';
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
// Batch 19G VN HF: SYSTEM_GUARDS import removed — deprecated filter constants deleted.
// VN veto threshold now loaded from DB (screener_filters active_quant row).
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
  REGIMES,
  STRATEGY_DISPLAY_NAMES,
  normalizeStrategy,
  normalizePatternToCanonical,
  type CanonicalRegimeType as MarketRegimeType
} from '../config/canonical-regime-strategy-map.js';
// Directive 11.4H Task 1: Symbol normalization at data ingress
import { normalizeToInternalSymbol } from '../markets/kraken-symbol-resolver.js';
// Phase 13: Market Context Engine for centralized indicator + regime computation
import { getMarketContextEngine } from './market-context-engine.js';
// Phase 15b B61: DBS telemetry emitter (observational, feature-flagged, no behavior change)
import { emitConsumerTelemetry } from './phase15b-dbs-telemetry.js';
// Phase 14.5: Pattern pool configuration
import { PATTERN_POOL_STRATEGIES, PATTERN_POOL_GUARDRAILS, DEFAULT_ASSET_CLASS } from '../asset_classes/crypto_spot/pattern-pool-filters.js';
import { computeRankingScore, normalizeNetReturn, CONTEXT_BONUS } from '../config/ranking-weights.js';
// Batch 19F: Hybrid confluence buffer for pattern+quant signal matching
import { hybridConfluenceBuffer } from './hybrid-confluence-buffer.js';
// Batch 19G Fix 5: Shared hybrid compatibility registry (single source of truth)
import { findHybridMatch, HYBRID_COMPATIBILITY } from '../config/hybrid-compatibility-registry.js';
// B67.0 — Factor ablation framework: emit hook for replay-ablation telemetry
import { emitAblationRecord } from './factor-ablation-emitter.js';
// B76 — Two-pass stash-then-build: input records collected at point-of-fire
// then dispatched to build helpers AFTER chain-final clamp.
import { buildAllAlternates, type FactorAlternateInput } from './factor-ablation-builders.js';
// B67.2 — phase preference application
import { applyPhasePreference, regimePhaseStore } from '../core/metrics/regime-phase.js';
// B67.4 cheap-tier bundle (2026-05-01): outcome feedback + regime age + path B gate
import {
  outcomeFeedbackStore,
  computeOutcomeFeedbackFactor,
} from '../core/metrics/outcome-feedback-store.js';
import {
  computeFreshnessFactor,
} from '../core/metrics/regime-age-factor.js';
// B68.2 (2026-05-02): volume regime as second confidence dimension
import {
  computeVolumeRegime,
} from '../core/metrics/volume-regime.js';
// B68.3 (2026-05-02): pair correlation as third orthogonal confidence dimension
import {
  computePairCorrelation,
} from '../core/metrics/pair-correlation.js';
// B68.1 (2026-05-03): multi-TF agreement as 7th and final B68.x chain modulator.
// Higher-TF (240-min / 4h) regime classification reuses calculatePairRegime
// unchanged. Higher-TF OHLC fetched at this hook from ohlcCache (new cache key
// `${symbol}_240`). Family map LOCAL to multi-tf-agreement.ts.
import {
  computeMultiTfAgreement,
} from '../core/metrics/multi-tf-agreement.js';
// B67.3 — Per-underlying position cap (admission gate for active path)
import { checkPerUnderlyingCap, formatDecisionLog } from './per-underlying-cap.js';

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
  riskScore?: number;     // Computed risk score
  volatility?: number;    // Estimated volatility
  profitRate?: number;    // Profit per time unit
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
    this.evaluationIntervalMs = config.evaluationIntervalMs ||
      getCachedNumberRequired('signal_orchestrator', 'evaluation_interval_ms',
        { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
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
    }, getCachedNumberRequired('signal_orchestrator', 'weights_cache_refresh_ms',
      { exchange: '*', assetClass: '*', strategy: '*', regime: '*' })); // 60s to match cache TTL

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
   * Phase 8.8.4-B.1: Compute ExpectedDuration, ProfitRate
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

    // B62: Dormant DBS confidence modifier removed. Was a dead consumer wire —
    // computeBiasConfidenceModifier was called but never executed against a live cycle
    // (active trading OFF since 2026-01-12). See B61 provisional findings report.

    // Phase 15b B61: observational telemetry emit (no-op unless DT_PHASE15B_DBS_TELEMETRY=1).
    // Dormant wire removed — emitter retained for audit continuity. dbsApplied is always
    // false now that the modifier code is gone.
    let _phase15bDbsCategory: string = 'UNKNOWN';
    try {
      const mce = getMarketContextEngine();
      const mceCtx = mce.computeContext(rawSignal.symbol);
      _phase15bDbsCategory = mceCtx.directionalBias?.category ?? 'UNKNOWN';
    } catch { /* MCE not ready */ }
    emitConsumerTelemetry({
      cycleId: Date.now(),
      site: 'signal-orchestrator.ts:454',
      symbol: rawSignal.symbol,
      strategy: strategyId ?? null,
      dbsCategory: _phase15bDbsCategory,
      dbsModifier: 1.0,
      confidencePreDBS: extendedMetrics.confidence,
      confidencePostDBS: extendedMetrics.confidence,
      finalScorePreDBS: extendedMetrics.finalScore,
      finalScorePostDBS: extendedMetrics.finalScore,
      dbsApplied: false,
    });

    // Directive 11.0E: ML-enhanced predictions (non-blocking fire-and-forget)
    const mlInput: PredictionInput = {
      symbol: rawSignal.symbol,
      strategy: strategyId,
      confidence: extendedMetrics.confidence,
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
      sourcePool: rawSignal.metadata?.sourcePool || undefined,
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

    // B67.3 — Per-underlying position cap check.
    // Counts currently-open trades sharing the signal's base currency.
    // Default disabled (shadow mode) at ship; activation is a module_constants
    // flip with no code change. In shadow mode, logs what would have been
    // rejected without actually rejecting. Cohort 1 (control) bypasses the
    // cap during the A/B observation window.
    try {
      const activeTrades = await storage.getActiveTrades(sizingContext.mode);
      const openSymbols = activeTrades.map((t) => t.symbol);
      const capDecision = await checkPerUnderlyingCap(rawSignal.symbol, openSymbols);
      console.log(formatDecisionLog(rawSignal.symbol, capDecision));
      if (!capDecision.allowed) {
        return null; // hard reject; signal does not enter RTB queue
      }
    } catch (err) {
      console.error(`[B67.3][cap-check] Failed for ${rawSignal.symbol}; allowing through:`, err instanceof Error ? err.message : err);
      // Fail-open by design: a B67.3 lookup error must not block trading.
    }

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
      sourcePool: rawSignal.metadata?.sourcePool || undefined,
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

    // B67.0 — Factor ablation emit hook. Today this fires with an empty
    // alternates array (no factors deployed yet) and no-ops. When B67.1
    // (macro modifier), B67.2 (phase), B67.4 (outcome feedback), B68.1
    // (multi-TF), B68.2 (volume), B68.3 (pair correlation), B68.4 (regime
    // age), B68.5 (Path B sustainability) ship, each producer adds its
    // FactorAlternate to the alternates array here, recomputing the
    // classifier output as if its specific contribution were absent. The
    // emitter then persists one row per (signal, factor) for the nightly
    // replay-ablation job.
    //
    // Fire-and-forget; classifier hot path never blocks on this.
    // B67.1 + B67.2 — always push the macro + phase alternates. Per Kyle
    // directive 2026-04-29 (no shadow theater): both factors always live.
    // Cold-start null window is the brief moment between MCE.start() and the
    // first refreshMacroContext — no signals reach this hook during that
    // window. Defensive null checks retained only for that edge.
    // B76 (2026-05-06): two-pass stash-then-build pattern.
    //   PASS 1 — at each factor's fire point: compute factor, multiply into
    //   `modulatedConfChain`, push a `FactorAlternateInput` record onto the
    //   stash. NO build helper called here.
    //   PASS 2 — after final clamp on `modulatedConfChain`: dispatch every
    //   stashed input via `buildAllAlternates(stash, chainFinal, regimeLabel)`,
    //   producing alternates whose `confidence = chainFinal / factor` (or
    //   label-counterfactual for B68.5). Then `emitAblationRecord` with
    //   chain-final `realDecision.confidence` and the built alternates.
    // This restructure is the calibration framework refactor — see B76 scope §3.
    const alternateInputs: FactorAlternateInput[] = [];
    let modulatedConfChain = extendedMetrics.confidence ?? 0.5;
    {
      const mce = getMarketContextEngine();
      const macro = mce.getCurrentMacroContext();
      const macroConfig = mce.getCurrentMacroConfig();
      const phaseWeights = mce.getCurrentPhaseWeights();

      // B67.1 macro modifier — per-input split into 3 factor rows
      if (macro === null || macroConfig === null) {
        console.warn('[B67.1][orchestrator] macro context/config null at ablation hook — cold-start race');
      } else {
        // B67.1 macro modifier already applied to baseConf upstream by
        // calculatePairRegime — chain math unchanged. Stash the input record
        // for chain-final dispatch in Pass 2.
        alternateInputs.push({
          kind: 'b67_1',
          modifier: macro.modifier,
          admissionPossible: true,
          config: macroConfig,
        });
      }

      // B67.2 phase preference alternate
      // Confidence here is the strategy's effective confidence value at admission.
      // Phase preference multiplies it; alternate row records both with/without
      // the multiplication for downstream calibration analysis.
      const outcomeFeedbackConfig = mce.getCurrentOutcomeFeedbackConfig();
      const regimeAgeConfig = mce.getCurrentRegimeAgeConfig();
      const fullRegimeConfig = mce.getCurrentRegimeConfig();
      const symbolCtx = mce.getCachedContext(rawSignal.symbol);
      const strategyKey = (rawSignal as any).strategy ?? 'unknown';
      const regimeLabel = extendedMetrics.regime ?? 'UNKNOWN';
      const baseConf = extendedMetrics.confidence ?? 0.5;
      // modulatedConfChain initialized above; Pass 1 multiplies factors into it

      if (phaseWeights === null) {
        console.warn('[B67.2][orchestrator] phase weights null at ablation hook — cold-start race');
      } else if (macro !== null) {
        // Need a phase + ageSeconds. Read from rawSignal's pair via MCE
        // context. If MCE produced a context, regime.phase is non-null.
        const phase = symbolCtx?.regime.phase;
        const phaseAgeSeconds = symbolCtx?.regime.phaseAgeSeconds ?? 0;
        if (phase) {
          try {
            const modulated = applyPhasePreference(strategyKey, phase, phaseWeights, baseConf);
            const weight = phaseWeights[`${strategyKey}_${phase}`];
            modulatedConfChain = modulated;
            // B76: stash; alt.conf computed in Pass 2 from chain-final.
            alternateInputs.push({
              kind: 'b67_2',
              phase,
              phaseAgeSeconds,
              strategy: strategyKey,
              phaseWeight: weight,
            });
          } catch (err) {
            // applyPhasePreference throws on missing weight key. Log loudly.
            console.error(
              '[B67.2][orchestrator] phase preference lookup failed:',
              err instanceof Error ? err.message : err,
            );
          }
        }
      }

      // ── B68.4 freshness factor ────────────────────────────────────────
      if (regimeAgeConfig !== null) {
        const ageMs = regimePhaseStore.peekAgeMs(rawSignal.symbol, Date.now());
        const freshness = computeFreshnessFactor(ageMs, regimeAgeConfig);
        modulatedConfChain *= freshness.factor;
        alternateInputs.push({
          kind: 'b68_4',
          result: freshness,
          targetAgeHours: regimeAgeConfig.targetAgeHours,
        });
        console.log(
          `[B68.4][freshness] pair=${rawSignal.symbol} age_hours=${freshness.ageHours.toFixed(2)} factor=${freshness.factor.toFixed(4)}`,
        );
      } else {
        console.warn('[B68.4][orchestrator] regime age config null at ablation hook — cold-start race');
      }

      // ── B67.4 outcome feedback ────────────────────────────────────────
      if (outcomeFeedbackConfig !== null) {
        const entry = outcomeFeedbackStore.peek(regimeLabel, strategyKey);
        const outcome = computeOutcomeFeedbackFactor(entry, outcomeFeedbackConfig);
        modulatedConfChain *= outcome.factor;
        alternateInputs.push({
          kind: 'b67_4',
          result: outcome,
          context: { regime: regimeLabel, strategy: strategyKey, entry },
        });
      } else {
        console.warn('[B67.4][orchestrator] outcome feedback config null at ablation hook — cold-start race');
      }

      // ── B68.2 volume regime (5th chain modulator) ─────────────────────
      // Pure-function score over rolling OHLC. Active-path orchestrator
      // inherits the same any-cast-on-MarketContext.ohlcData issue as B68.5
      // (RUNNING_ISSUES #44 — deferred to B67.5 per Langston cc-inbox #881
      // Step-2 D.1). When ohlc is undefined here, the >= minSamples guard
      // silently skips emit. Active trading is OFF so observational-only
      // impact is acceptable. VTS-runner path uses function-scope ohlcData
      // and is correct.
      const volumeRegimeConfig = mce.getCurrentVolumeRegimeConfig();
      if (volumeRegimeConfig !== null && symbolCtx !== null) {
        const ohlc = (rawSignal as any).ohlcData ?? (symbolCtx as any).ohlcData;
        if (ohlc && Array.isArray(ohlc) && ohlc.length >= volumeRegimeConfig.minSamples) {
          try {
            const result = computeVolumeRegime(ohlc, volumeRegimeConfig);
            modulatedConfChain *= result.factor;
            alternateInputs.push({ kind: 'b68_2', result, config: volumeRegimeConfig });
            console.log(
              `[B68.2][volume] pair=${rawSignal.symbol} score=${result.score.toFixed(3)} ` +
                `factor=${result.factor.toFixed(4)} label=${result.label}` +
                (result.hasLiquidationSpike ? ' (liquidation_spike)' : ''),
            );
          } catch (err) {
            console.error(
              '[B68.2][orchestrator] volume regime emit failed:',
              err instanceof Error ? err.message : err,
            );
          }
        }
      } else if (volumeRegimeConfig === null) {
        console.warn('[B68.2][orchestrator] volume regime config null at ablation hook — cold-start race');
      }

      // ── B68.3 pair correlation (6th chain modulator, 2026-05-02) ──────
      // Spearman correlation of pair returns vs BTC returns over rolling N
      // bars. Decorrelation score = 1 - |corr|; factor = clamp(1 + decorr ×
      // sensitivity). Asymmetric range [0.95, 1.05] — boost only.
      // BTC OHLC fetched on-demand from ohlcCache (cache read; microsecond
      // latency per Langston cc-inbox #884 D.1). Self-reference handled
      // inside computePairCorrelation (factor=1.0 + SELF_REFERENCE flag).
      const pairCorrelationConfig = mce.getCurrentPairCorrelationConfig();
      if (pairCorrelationConfig !== null && symbolCtx !== null) {
        const ohlc = (rawSignal as any).ohlcData ?? (symbolCtx as any).ohlcData;
        if (ohlc && Array.isArray(ohlc) && ohlc.length >= pairCorrelationConfig.minSamples) {
          try {
            const { ohlcCache } = await import('./ohlc-cache.js');
            const btcRaw = await ohlcCache.getOHLCData(pairCorrelationConfig.btcReferenceSymbol, 60);
            const btcOhlc = (btcRaw?.ohlc ?? []).map((c: any) => ({
              open: parseFloat(c.open || c[1]),
              high: parseFloat(c.high || c[2]),
              low: parseFloat(c.low || c[3]),
              close: parseFloat(c.close || c[4]),
              volume: parseFloat(c.volume || c[6] || 0),
              timestamp: c.timestamp || c[0] * 1000,
            }));
            const result = computePairCorrelation(
              rawSignal.symbol,
              ohlc,
              btcOhlc.length >= pairCorrelationConfig.minSamples ? btcOhlc : null,
              pairCorrelationConfig,
            );
            modulatedConfChain *= result.factor;
            alternateInputs.push({ kind: 'b68_3', result, config: pairCorrelationConfig });
            console.log(
              `[B68.3][correlation] pair=${rawSignal.symbol} corr=${result.correlationToBtc.toFixed(3)} ` +
                `decorr=${result.decorrelationScore.toFixed(3)} factor=${result.factor.toFixed(4)} ` +
                `label=${result.label}`,
            );
          } catch (err) {
            console.error(
              '[B68.3][orchestrator] pair correlation emit failed:',
              err instanceof Error ? err.message : err,
            );
          }
        }
      } else if (pairCorrelationConfig === null) {
        console.warn('[B68.3][orchestrator] pair correlation config null at ablation hook — cold-start race');
      }

      // ── B68.1 multi-TF agreement (7th chain modulator, 2026-05-03) ────
      // Higher-TF (240-min / 4h) regime classification reused via
      // calculatePairRegime (Path A only — DBS=0 in v1). Three-state agreement
      // CONFIRMED/COMPATIBLE/CONFLICTED. ST is universally COMPATIBLE.
      // Inherits same active-path any-cast deferral as B68.2/B68.3/B68.5
      // (silent-skip when MarketContext.ohlcData is undefined; B67.5 fix).
      const multiTfConfig = mce.getCurrentMultiTfAgreementConfig();
      if (multiTfConfig !== null && symbolCtx !== null) {
        const ohlc = (rawSignal as any).ohlcData ?? (symbolCtx as any).ohlcData;
        if (ohlc && Array.isArray(ohlc) && ohlc.length > 0) {
          try {
            const { ohlcCache } = await import('./ohlc-cache.js');
            const higherRaw = await ohlcCache.getOHLCData(
              rawSignal.symbol,
              multiTfConfig.higherTfIntervalMinutes,
            );
            const higherTfOhlc = (higherRaw?.ohlc ?? []).map((c: any) => ({
              open: parseFloat(c.open || c[1]),
              high: parseFloat(c.high || c[2]),
              low: parseFloat(c.low || c[3]),
              close: parseFloat(c.close || c[4]),
              volume: parseFloat(c.volume || c[6] || 0),
              timestamp: c.timestamp || c[0] * 1000,
            }));
            const result = computeMultiTfAgreement(
              regimeLabel as any,
              higherTfOhlc.length >= multiTfConfig.minHigherTfSamples ? higherTfOhlc : null,
              multiTfConfig,
              fullRegimeConfig ?? undefined,
            );
            modulatedConfChain *= result.factor;
            alternateInputs.push({ kind: 'b68_1', result, config: multiTfConfig });
            console.log(
              `[B68.1][multi-tf] pair=${rawSignal.symbol} active=${result.activeTfRegime} ` +
                `higher=${result.higherTfRegime ?? 'COLD'} agree=${result.agreement} ` +
                `factor=${result.factor.toFixed(4)}`,
            );
          } catch (err) {
            console.error(
              '[B68.1][orchestrator] multi-tf emit failed:',
              err instanceof Error ? err.message : err,
            );
          }
        }
      } else if (multiTfConfig === null) {
        console.warn('[B68.1][orchestrator] multi-tf config null at ablation hook — cold-start race');
      }

      // ── B68.5 Path B sustainability ablation row ──────────────────────
      // Stash inputs; B68.5 builder re-runs classifier with gate disabled
      // (label-counterfactual, not divide-out). Built in Pass 2 below.
      if (fullRegimeConfig !== null && symbolCtx !== null) {
        const ohlc = (rawSignal as any).ohlcData ?? (symbolCtx as any).ohlcData;
        const dbsScore = symbolCtx.directionalBias?.score ?? 0;
        const dbsSlope = (symbolCtx.directionalBias as any)?.slope ?? 0;
        const macroValue = macro?.modifier.value ?? 1.0;
        if (ohlc && Array.isArray(ohlc) && ohlc.length >= 30) {
          alternateInputs.push({
            kind: 'b68_5',
            ohlcData: ohlc,
            dbsScore,
            dbsSlope,
            macroModifier: macroValue,
            regimeConfig: fullRegimeConfig,
          });
          console.log(
            `[B68.5][gate] pair=${rawSignal.symbol} dbs=${dbsScore.toFixed(3)} ` +
              `slope=${dbsSlope.toFixed(4)} gate_admitted=${regimeLabel === REGIMES.TREND_FRIENDLY_STABLE} ` +
              `regime_label=${regimeLabel}`,
          );
        }
      }

      // ── Final clamp on full-chain modulated confidence ────────────────
      // B67.5-prep (2026-05-03): floor from module_constant; default 0.4
      // cold-start fallback matching legacy pre-B67.5 behavior.
      // Note: floor constant is `b67_5_post_composition_floor` (DB-governed
      // via module_constants). The constant is named with B67.5 in mind but
      // its consumer (this clamp) has been live since B70.3/B72-family.
      const orchFloor = fullRegimeConfig?.b67_5PostCompositionFloor ?? 0.4;
      modulatedConfChain = Math.max(orchFloor, Math.min(1.0, modulatedConfChain));
    }

    // ── B76 PASS 2: dispatch stashed inputs with chain-final reference ──
    // chainFinalConfidence is the post-clamp value above; ablation alternates
    // built from it satisfy `alt.conf = chainFinal / factor` for divide-out
    // factors (or label-counterfactual semantics for B68.5).
    const chainFinalConfidence = modulatedConfChain;
    const regimeLabelForEmit = extendedMetrics.regime ?? 'UNKNOWN';
    const ablationAlternates = buildAllAlternates(
      alternateInputs,
      chainFinalConfidence,
      regimeLabelForEmit,
    );

    emitAblationRecord(
      { kind: 'active_signal', signalId },
      rawSignal.symbol,
      {
        regimeLabel: regimeLabelForEmit,
        // B76: chain-final, NOT raw classifier value. Raw preserved in metadata.
        confidence: chainFinalConfidence,
        admissionPossible: true, // we got here past SQE gate
        metadata: {
          finalScore: extendedMetrics.finalScore,
          regimeWeight: extendedMetrics.regimeWeight, // pre-B67.5; replaced by regimeConfidence after Consumer #1 ships
          sourcePool: rawSignal.metadata?.sourcePool,
          // B76: preserve raw classifier output for any downstream that wants
          // raw semantics (none today per Step-2 grep audit; future-proof).
          predictiveConfidenceRaw: extendedMetrics.confidence ?? 0.5,
        },
      },
      ablationAlternates,
      strategyId, // B67.0.1 (2026-04-30): natural-key join in replay-ablation per Langston #864
    );

    // B70 Step 3.6: signal-eval archive — admitted row alongside active-signal
    // ablation emit. Live trading is currently dormant; this hook fires
    // automatically when active trading turns on (Phase 21). Mode tag is read
    // from getCurrentMode() at write time. Fire-and-forget, try/catch wrapped.
    try {
      const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
      const { resolveAssetClass } = await import('../../shared/asset-classes.js');
      archiveSignalEval({
        symbol: rawSignal.symbol,
        exchange: 'kraken',
        assetClass: resolveAssetClass(rawSignal.symbol, 'kraken'),
        source: 'signal-orchestrator',
        strategy: strategyId,
        regimeLabel: extendedMetrics.regime ?? undefined,
        rejectStage: 'admitted',
        finalScore: extendedMetrics.finalScore,
        confidenceModulated: modulatedConfChain,
        features: {
          sourcePool: rawSignal.metadata?.sourcePool,
          regimeWeight: extendedMetrics.regimeWeight,
          predictiveConfidence: extendedMetrics.confidence,
        },
        modulators: {
          chain_modulated_confidence: modulatedConfChain,
        },
        gateDecision: {
          gate: 'admitted',
          accepted: true,
          path: 'active-signal-orchestrator',
        },
      });
    } catch (b70Err) {
      console.warn(
        `[B70][ARCH] signal-orchestrator signal-eval archive enqueue failed:`,
        b70Err instanceof Error ? b70Err.message : b70Err,
      );
    }

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

      // Batch 19G VN HF: Load active_quant VN threshold from DB for EXTREME_NOISE veto
      const activeQuantFilters = await storage.getScreenerFilters({ mode: this.mode, filterPath: 'active_quant' });
      const vnMaxVeto = parseFloat(activeQuantFilters?.vnMax ?? '0.93');
      console.log(`[19G_VN_HF][ORCHESTRATOR] VN veto threshold loaded from DB: ${vnMaxVeto}`);

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

    // Batch 22: Read family pools for family-aware strategy selection
    const { STRATEGY_FAMILY_MAP, FILTER_FAMILIES, HYBRID_FAMILY_ELIGIBILITY } = await import('../config/canonical-regime-strategy-map.js');
    const familyPools: Record<string, string[]> = {};
    for (const family of FILTER_FAMILIES) {
      const familyPairs = activeFilterPool.getFamilyPool(this.mode, family);
      familyPools[family] = familyPairs.map(p => normalizeToInternalSymbol(p.symbol));
      console.log(`[22][ORCHESTRATOR] ${family} pool: ${familyPools[family].length} pairs`);
    }
    // Build per-symbol family set for strategy selection
    const symbolFamilies = new Map<string, Set<string>>();
    for (const [family, symbols] of Object.entries(familyPools)) {
      for (const sym of symbols) {
        if (!symbolFamilies.has(sym)) symbolFamilies.set(sym, new Set());
        symbolFamilies.get(sym)!.add(family);
      }
    }
    // Pattern pool pairs get 'pattern' family
    for (const sym of patternSymbols) {
      if (!symbolFamilies.has(sym)) symbolFamilies.set(sym, new Set());
      symbolFamilies.get(sym)!.add('pattern');
    }
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

          const signals = await this.evaluateSymbol(symbol, settings, filters, sizingContext, vnMaxVeto);
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

            // Batch 19F: Check hybrid confluence buffer for compatible pattern signal
            const compatiblePatterns = hybridConfluenceBuffer.findCompatiblePatterns(signal.symbol);
            if (compatiblePatterns.length > 0) {
              for (const patternSig of compatiblePatterns) {
                const hybridStrategy = findHybridMatch(signal.strategy, patternSig.patternType);
                if (hybridStrategy) {
                  const decayFactor = hybridConfluenceBuffer.getDecayFactor(patternSig);
                  const hybridConfidence = (signal.confidence * 0.4 + patternSig.strength * 0.4 + 0.2) * decayFactor;

                  // Create hybrid signal (goes through SQE independently)
                  const hybridSignal = {
                    ...signal,
                    strategy: hybridStrategy,
                    confidence: hybridConfidence,
                    signalType: 'HYBRID',
                    sourcePool: 'hybrid',
                    metadata: {
                      ...((signal as any).metadata || {}),
                      hybridSource: {
                        quantStrategy: signal.strategy,
                        patternType: patternSig.patternType,
                        patternStrategy: patternSig.strategy,
                        decayFactor,
                        confluenceAge: Date.now() - patternSig.timestamp,
                      },
                    },
                  };

                  // Forward hybrid signal through SQE
                  if (this.onSignalCallback) {
                    await this.onSignalCallback(hybridSignal as any);
                  }
                  console.log(`[19F][HYBRID] Confluence detected: ${signal.symbol} quant=${signal.strategy} + pattern=${patternSig.patternType} → hybrid=${hybridStrategy} (decay=${decayFactor.toFixed(2)})`);
                }
              }
            }
          }
        } catch (error) {
          console.error(`[37.A][SIGNAL] Error evaluating ${symbol}:`, error);
        }
      }

      // Batch 19F: Sweep expired entries from hybrid confluence buffer
      hybridConfluenceBuffer.sweep();

      // Phase 14.5: Process pattern pool — PATTERN + HYBRID strategies only
      let patternSignalsGenerated = 0;
      for (const symbol of patternSymbols) {
        try {
          // Batch 19G VN HF2: Do NOT skip quant pool pairs — they deserve pattern evaluation too
          // A pair surviving both quant and pattern paths should generate signals from BOTH paths
          // Quant path: regime-driven strategy selection (Loop 1 above)
          // Pattern path: pattern-detection-driven strategy selection (this loop)

          // Get OHLC data (uses ohlcCache — no new API calls)
          const ohlcData = await ohlcCache.getOHLCData(symbol, 60);
          if (!ohlcData || ohlcData.length < 10) continue;

          const currentPrice = parseFloat(ohlcData[ohlcData.length - 1].close);

          // Get MCE context for regime + indicators
          const mce = getMarketContextEngine();
          const poolPair = patternPoolPairs.find(p => normalizeToInternalSymbol(p.symbol) === symbol);
          const volume24h = poolPair?.volume24h ?? 0;
          // B63: DBS hard contract — propagate from pair object. Pattern-pool strong-DBS leaks are blocked
          // at scanner level, but defensive propagation keeps the contract consistent for any edge case.
          const propagatedDbs = (poolPair as any)?.dbsScore !== undefined ? {
            score: (poolPair as any).dbsScore as number,
            category: ((poolPair as any).dbsCategory as string) || 'NEUTRAL',
            slope: (poolPair as any).dbsSlope as number | undefined,
          } : undefined;
          const context = mce.computeContext(symbol, ohlcData, currentPrice, volume24h, undefined, propagatedDbs);

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

              // Batch 19F: Store pattern signal in hybrid confluence buffer
              hybridConfluenceBuffer.addPatternSignal({
                symbol: sizedSignal.symbol,
                patternType: (patternSig as any).pattern || 'UNKNOWN',
                strategy: sizedSignal.strategy,
                strength: patternSig.strength,
                direction: 'BUY',
                timestamp: Date.now(),
                metadata: (patternSig as any).metadata,
              });
            }
          }
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
    sizingContext: SizingContext,
    vnMaxVeto: number = 0.93  // Batch 19G VN HF: DB-driven VN veto threshold
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
      // Batch 19G VN HF: Threshold now DB-driven (was hardcoded SYSTEM_GUARDS.MAX_VOL_NOISE = 0.93)
      if (VolNoise > vnMaxVeto) {
        console.log(`[Phase13][MCE] SKIP ${symbol}: Extreme Noise veto (volNoise=${VolNoise.toFixed(4)} > ${vnMaxVeto} [DB])`);
        return signals;
      }

      // Use smoothed price for strategy evaluation
      const currentPrice = smoothedPrice;

      // Phase 13: MCE computes indicators + regime in a single pass
      const mce = getMarketContextEngine();
      // B63: Propagate DBS from active filter pool (hard contract — MCE no longer computes DBS locally).
      const poolEntry = fx5Survivors.find(p => normalizeToInternalSymbol(p.symbol) === symbol);
      const orchestratorDbs = (poolEntry as any)?.dbsScore !== undefined ? {
        score: (poolEntry as any).dbsScore as number,
        category: ((poolEntry as any).dbsCategory as string) || 'NEUTRAL',
        slope: (poolEntry as any).dbsSlope as number | undefined,
      } : undefined;
      const mceContext = mce.computeContext(symbol, ohlcForRegime, currentPrice, currentVolume, settings.smaLength || 20, orchestratorDbs);

      console.log(`[Phase13][MCE] ${symbol}: regime=${mceContext.regime.regime}, weight=${mceContext.regime.regimeWeight.toFixed(2)}, trendSlope=${trendSlope.toFixed(4)}, volNoise=${VolNoise.toFixed(4)}`);

      // Phase 13: Strategy filtering from MCE regime (replaces DSS getRegimeAllowedStrategies)
      const regimeStrategies = new Set(mceContext.regime.allowedStrategies);
      const activeStrategies = new Set(
        [...this.enabledStrategies].filter(s => regimeStrategies.has(s))
      );

      // Batch 22: Family-aware strategy filtering
      // Only run strategies whose family matches the families this symbol survived.
      // If a symbol has no family tags (didn't go through family filters), skip family
      // filtering entirely — use regime-only selection (backward compatible).
      const pairFamilies = symbolFamilies.get(symbol);
      if (pairFamilies && pairFamilies.size > 0) {
        const familyFilteredStrategies = new Set<string>();
        for (const strat of activeStrategies) {
          const stratFamily = STRATEGY_FAMILY_MAP[strat];
          if (!stratFamily) { familyFilteredStrategies.add(strat); continue; } // Unknown strategy — allow
          if (stratFamily === 'hybrid') {
            // Hybrid strategies are eligible if pair survived ANY parent family
            const parentFamilies = HYBRID_FAMILY_ELIGIBILITY[strat] ?? [];
            if (parentFamilies.some(f => pairFamilies.has(f))) {
              familyFilteredStrategies.add(strat);
            }
          } else if (pairFamilies.has(stratFamily)) {
            familyFilteredStrategies.add(strat);
          }
        }
        console.log(`[22][ORCHESTRATOR] ${symbol}: families=${Array.from(pairFamilies).join(',')} strategies=${familyFilteredStrategies.size}/${activeStrategies.size}`);
        // Replace activeStrategies with family-filtered set
        activeStrategies.clear();
        for (const s of familyFilteredStrategies) activeStrategies.add(s);
      }

      if (activeStrategies.size === 0) {
        console.log(`[Phase13][MCE] SKIP ${symbol}: No enabled strategies for regime ${mceContext.regime.regime}`);
        return signals;
      }

      console.log(`[Phase13][MCE] ${symbol}: activeStrategies=[${[...activeStrategies].join(',')}] for regime=${mceContext.regime.regime}`);

      // Phase 13: Use MCE pre-computed indicators (eliminates duplicate VWAP/SMA)
      // B63: Pass through DBS fields so detect() guards + strong_bull_trend can read them.
      const indicators = {
        vwap: mceContext.indicators.vwap,
        sma: mceContext.indicators.sma,
        currentPrice: mceContext.indicators.currentPrice,
        volume: mceContext.indicators.volume,
        high24h: mceContext.indicators.high24h,
        low24h: mceContext.indicators.low24h,
        atr: mceContext.indicators.atr,
        dbsScore: orchestratorDbs?.score,
        dbsCategory: orchestratorDbs?.category,
        dbsSlope: orchestratorDbs?.slope,
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
        // B72.2: detector reads params from module_constants 'strategy.breakout'.
        const rawSignal = this.strategyEngine.detectBreakout(ohlcAsAny, {});
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'breakout', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('mean_reversion')) {
        // B72.2: detector reads params from module_constants 'strategy.mean_reversion'.
        const rawSignal = this.strategyEngine.detectMeanReversion(indicators, ohlcAsAny, {});
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'mean_reversion', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('range_trading')) {
        // B72.2: detector reads params from module_constants 'strategy.range_trade'.
        const rawSignal = this.strategyEngine.detectRangeTrading(ohlcAsAny, {});
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'range_trading', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('vwap_bounce')) {
        // B72.2: detector reads params from module_constants 'strategy.vwap_bounce'.
        const rawSignal = this.strategyEngine.detectVWAPBounce(indicators, ohlcAsAny, {});
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'vwap_bounce', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      // B70.3 (2026-05-05): liquidity_trap is universally disabled (Batch 45 —
      // bearish failed-breakout fade incompatible with long-only system).
      // Pre-B70.3 active path would still call detectLiquidityTrap if the
      // regime-strategy map admitted it. Block at the orchestrator iteration
      // level so the detector isn't called at all. Mirrors the VTS-runner
      // exclusion via UNIVERSALLY_DISABLED_STRATEGIES set.
      // (Block intentionally left empty — liquidity_trap is excluded.)

      if (activeStrategies.has('dhma')) {
        // B72.2: detector reads params from module_constants 'strategy.dhma'.
        const rawSignal = this.strategyEngine.detectDHMA(indicators, ohlcAsAny, {});
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
      // B57 Fix: Build per-strategy pattern input instead of single global best
      // Each strategy expects a specific pattern type — pass the matching one
      const STRATEGY_PATTERN_MAP: Record<string, string> = {
        'morning_star': 'MORNING_STAR',
        'inside_bar_reversal': 'INSIDE_BAR',
        'support_bounce': 'PINBAR',
        'pivot_shift': 'MORNING_STAR',
        'reverse_impulse': 'PINBAR',
        'defensive_hedge': 'ENGULFING',
        'adaptive_flow': 'MORNING_STAR', // THREE_SOLDIERS canonicalizes to MORNING_STAR
        'volatility_edge': 'ABCD',
      };

      const buildPatternInputForStrategy = (strategyKey: string) => {
        const expectedPattern = STRATEGY_PATTERN_MAP[strategyKey];
        const candidates = expectedPattern
          ? patternSignals.filter(p => normalizePatternToCanonical(p.pattern) === expectedPattern)
          : patternSignals;
        const bp = candidates.length > 0
          ? candidates.reduce((best, p) => p.strength > best.strength ? p : best, candidates[0])
          : null;
        if (!bp) return null;
        return {
          pattern: normalizePatternToCanonical(bp.pattern) ?? bp.pattern,
          direction: bp.direction as 'BUY' | 'SELL',
          strength: bp.strength,
          metadata: {
            ...bp,
            parentHigh: bp.metadata?.parentHigh ?? (candles.length >= 2 ? candles[candles.length - 2].high : 0),
            parentLow: bp.metadata?.parentLow ?? (candles.length >= 2 ? candles[candles.length - 2].low : 0),
            compressionRatio: bp.metadata?.compressionRatio ?? 0.5,
            pinbarLow: bp.metadata?.pinbarLow ?? (candles.length > 0 ? candles[candles.length - 1].low : 0),
            engulfingLow: bp.metadata?.engulfingLow ??
              (candles.length >= 2 ? Math.min(candles[candles.length - 1].low, candles[candles.length - 2].low) : 0),
            engulfRatio: bp.metadata?.engulfRatio ?? 1.0,
            hasGap: bp.metadata?.hasGap ?? false,
            recoveryRatio: bp.metadata?.recoveryRatio ?? 0,
            aPointLow: bp.metadata?.aPointLow,
            bPointHigh: bp.metadata?.bPointHigh,
            cPointLow: bp.metadata?.cPointLow,
            cPointHigh: bp.metadata?.cPointHigh,
          }
        };
      };
      const bestPattern = patternSignals.length > 0 ? patternSignals[0] : null; // kept for log line below

      if (activeStrategies.has('morning_star')) {
        const rawSignal = this.strategyEngine.detectMorningStar(indicators, ohlcAsAny, buildPatternInputForStrategy('morning_star'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'morning_star' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('inside_bar_reversal')) {
        const rawSignal = this.strategyEngine.detectInsideBarReversal(indicators, ohlcAsAny, buildPatternInputForStrategy('inside_bar_reversal'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'inside_bar_reversal' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('support_bounce')) {
        const rawSignal = this.strategyEngine.detectSupportBounce(indicators, ohlcAsAny, buildPatternInputForStrategy('support_bounce'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'support_bounce' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('pivot_shift')) {
        const rawSignal = this.strategyEngine.detectPivotShift(indicators, ohlcAsAny, buildPatternInputForStrategy('pivot_shift'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'pivot_shift' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('reverse_impulse')) {
        const rawSignal = this.strategyEngine.detectReverseImpulse(indicators, ohlcAsAny, buildPatternInputForStrategy('reverse_impulse'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'reverse_impulse' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('defensive_hedge')) {
        // Defensive hedge requires BTC candle data for correlation calculation
        // TODO: Pass BTC OHLC from pricing service cache when available
        const rawSignal = this.strategyEngine.detectDefensiveHedge(indicators, ohlcAsAny, buildPatternInputForStrategy('defensive_hedge'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'defensive_hedge' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('adaptive_flow')) {
        const rawSignal = this.strategyEngine.detectAdaptiveFlow(indicators, ohlcAsAny, buildPatternInputForStrategy('adaptive_flow'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'adaptive_flow' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('volatility_edge')) {
        const rawSignal = this.strategyEngine.detectVolatilityEdge(indicators, ohlcAsAny, buildPatternInputForStrategy('volatility_edge'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'volatility_edge' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      // B63: Strong Bull Trend (Path D) — QUANT, LONG-only, evaluates only on quant-strong_trend sourcePool pairs.
      // Strategy's internal DBS guard provides belt-and-braces if routing leaks.
      if (activeStrategies.has('strong_bull_trend')) {
        const rawSignal = this.strategyEngine.detectStrongBullTrend(indicators, ohlcAsAny, buildPatternInputForStrategy('strong_bull_trend'));
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'strong_bull_trend' as any, sizingContext);
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
          expectancy: (s.confidence && s.confidence <= 1 ? s.confidence : (s.confidence || 0) / 100),
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
            // B72: caller-injected pWin params (preserves kernel purity).
            minPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_floor',     { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }),
            maxPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_ceiling',   { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }),
            diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }),
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

// Batch 19G Fix 5: HYBRID_COMPATIBILITY and findHybridMatch removed —
// now imported from shared hybrid-compatibility-registry.ts (single source of truth)
