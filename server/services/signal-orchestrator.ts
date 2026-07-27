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

import { StrategyEngine, StrategySignal, stampMaxHoldingMs } from './strategy-engine';
// B72 (2026-05-05): orchestrator timing intervals from module='signal_orchestrator'.
import { getCachedNumberRequired } from './module-constants-service.js';
// B79.0n.STORAGE (2026-05-21): AssetClass type for SQEInput.assetClass population.
// P19-B6.5d: the four active-path re-derives (MCE context, evaluateSymbol capture,
// ORB gate, NetEV filter) now read the CARRIED crypto-pipe stamp, so the throwing
// resolveAssetClass top-level import is no longer needed here.
import { type AssetClass } from '../../shared/asset-classes.js';
// B79.0n.CONFIDENCE-CHAIN: capture-and-reuse pattern at chain composition entry.
// safeResolveAssetClass returns null + logs WARN on unresolvable (vs throw).
import { safeResolveAssetClass } from '../../shared/asset-classes.js';
// Phase 8.8.7: FilteredPairsService DEPRECATED - use activeFilterPool instead
// import { FilteredPairsService } from './filtered-pairs-service';
import { KrakenService } from '../exchanges/kraken/kraken.js';
import { storage } from '../storage';
import type { TradingSettings, ScreenerFilters, PriceData, GuardrailsV2 } from '@shared/schema';
import { telemetryTrace } from './telemetry-trace.js';
import { ActiveScanDiagnosticService } from './active-scan-diagnostic.js';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { sizeActivePositionForSignal, type StrategyType } from './active-position-sizing.js';
import { tradingModeToRunMode } from './run-mode-controller.js'; // ITEM-4 step 2: single-site TradingMode->RunMode map
import { getPortfolioBalanceV2 } from './guardrail-settings.js';
import { c5FinancialDiagnostics } from './c5-financial-diagnostics.js';
// P19-B8.10 (OBJ-2): SLAL purged with its sole reader (the Ready-tab panel);
// the load-bearing signal-ID mint lives on as a pure util, format unchanged.
import { generateSignalId } from '../utils/signal-id.js';
// P19-B8.10 (OBJ-4): genesis-capture sources — the SAME shared helpers the VTS
// open-trade capture reads (mirror semantics, one formula per value, no drift).
import { getTelemetryAggregator } from './telemetry-aggregator.js';
import { getGlobalFriction, getLastGlobalDBSCategory, getLastGlobalDBSScore } from './market-indicators.js';
import { computePairFrictionIndex } from '../core/math/cost-model.js';
import { calculateExtendedSignalMetrics, estimateVolatility } from '../core/metrics/quality_index.js';
import { signalQualityEvaluator, type SQEInput } from '../core/filters/signal_quality_evaluator.js';
// P19-B8.4b: active-path funnel instrumentation (S21). buildSizedSignalForStrategy + the crypto
// family-filter loop are the ACTIVE path exclusively (VTS runs via vts-runner and never calls these),
// so every count here is an active-mode count. DORMANT (zero) until paper-active turns on at B8.5.
import {
  recordActiveSignalsGenerated,
  recordActivePreSqeReject,
  recordActivePostSqeReject,
  recordActiveSqeEvaluation,
  recordActiveStrategyAttrition,
  type FunnelAssetClass,
} from '../core/observability/active-funnel-tracker.js';
import { readyToBuyService, type SQESignalInput } from '../core/rtb/ready_to_buy_service.js';
import { activeFilterPool } from './active-filter-pool.js';
import { diagnosticTrace } from '../core/diagnostics/trace_service.js';
import { dataAggregator } from './data-aggregator.js';
import { getWeightSync as getStrategyWeight, computeStrategyWeights } from '../utils/strategyWeights.js';
import { getExposureMultiplierSync, computeExposureBias, getBiasSummaryForLog } from '../utils/strategyBias.js';
import { computeNetExpectancyKernel } from '../core/calculations/net-expectancy-kernel.js';
// reorg-B2 (Piece A): central per-class target-floor + the shared normalizer (applied at the
// active convergence point in buildSizedSignalForStrategy; VTS applies the same in vts-runner).
import { getPerClassTargetGate } from '../core/calculations/expectancy.js';
import { normalizeAndGateTarget } from '../core/calculations/signal-target-normalizer.js';
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
import { getCachedCostMetrics, computeNetGeometry, computeTotalRoundTripCost, getFrictionForAssetClass } from '../core/math/cost-model.js';
// Directive 11.4F.1B: Canonical regime-strategy mapping (single source of truth)
import {
  CANONICAL_REGIME_STRATEGY_MAP as REGIME_STRATEGY_MAP,
  REGIMES,
  STRATEGY_DISPLAY_NAMES,
  normalizeStrategy,
  normalizePatternToCanonical,
  normalizeRegime,
  resolvePatternConsumingStrategy,
  getPatternNoMatchDropStats,
  isStrategyEnabledForAssetClass,
  STRATEGY_FAMILY_MAP,
  type CanonicalRegimeType as MarketRegimeType
} from '../config/canonical-regime-strategy-map.js';
// P19-B7.2: the shared maker/taker best-of-both entry decision (pure) + its
// per-class DB-governed haircut resolver (fail-hard). Computed once at the
// shared signal-build convergence, snapshotted onto the RTB row (OBJ-1/OBJ-3).
import { decideMakerTaker, entryUrgencyClassForFamily } from '../core/math/maker-taker-decision.js';
import { resolveMakerTakerHaircut } from './maker-taker-config.js';
import { rtbMetricsService } from './rtb-metrics-service.js';
import { emitMakerTaker } from './data-archive/switch-on-evidence-sink.js';
// Directive 11.4H Task 1: Symbol normalization at data ingress
import { normalizeToInternalSymbol } from '../markets/kraken-symbol-resolver.js';
// Phase 13: Market Context Engine for centralized indicator + regime computation
import { getMarketContextEngine } from './market-context-engine.js';
// B-REGIME-INPUTS-LIVE (#543 + #538): the single MCE-backed source of the two
// RegimeWeight inputs. Returns null-with-a-reason on a miss and NEVER substitutes —
// the caller rejects. See the module header for why a fallback here would re-create
// the exact defect this batch removes.
import { readRegimeInputs, recordRegimeInputsMiss } from '../core/metrics/regime-inputs.js';
// Phase 15b B61: DBS telemetry emitter (observational, feature-flagged, no behavior change)
import { emitConsumerTelemetry } from './phase15b-dbs-telemetry.js';
// Phase 14.5: Pattern pool configuration
// B79.0n.ORCHESTRATOR (2026-05-27): dead-import cleanup. Pre-batch this line
// imported PATTERN_POOL_STRATEGIES + PATTERN_POOL_GUARDRAILS + DEFAULT_ASSET_CLASS.
// Step 1.a probe confirmed PATTERN_POOL_STRATEGIES + PATTERN_POOL_GUARDRAILS are
// NOT referenced anywhere in this file's body. DEFAULT_ASSET_CLASS IS still
// referenced at lines 670 and 1397 (fallback for the crypto-only path per the
// docstring at lines 1377-1379). Cleaned to import only the live symbol.
import { DEFAULT_ASSET_CLASS } from '../asset_classes/crypto_spot/pattern-pool-filters.js';
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
  // P19-B3b: FinalScore-native quality metrics the builder copies from
  // extendedMetrics (mirrors the sqeSignalInput builder). These were assigned on
  // the sized signal but never declared on the type — TS2353 on `finalScore`.
  finalScore?: number;    // Composite FinalScore (Directive 11.0E)
  regimeWeight?: number;  // Regime weight contribution to FinalScore
  hybridScore?: number;   // Hybrid quant+pattern score
  // Directive 11.3A: Net Expectancy fields
  netExpectedEdge?: number;    // Net profit after costs
  netRewardToRisk?: number;    // Net R:R after costs
  totalRoundTripCost?: number; // Total costs (fee + slippage + spread)
}

// P19-B4a (stamp-at-source — Kyle directive 2026-06-14, Langston-approved; revises the
// B79.0n.ORCHESTRATOR Probe-8 resolve-from-symbol choice): the asset class is REQUIRED
// and supplied by the caller at the per-pipe dispatch chokepoint (where the pipe — and
// thus the class — is known by construction), NOT re-derived from the symbol downstream.
// Re-deriving via resolveAssetClass is wrong-by-construction for the collision-set tickers
// (exist as BOTH xStock and crypto with identical canonical form) — only the pipe gets
// them right. resolveAssetClass survives ONLY for stored-row / diagnostic re-resolution.
// 🔒 INVARIANT: one SizingContext = one asset class = one pipe. NEVER build a SizingContext
// that serves mixed classes (would silently corrupt per-class sizing, friction, regime,
// and the RTB asset_class write). Required (no `?`) so the compiler rejects any pipe that
// omits it — that IS the compile-enforcement of the stamp.
interface SizingContext {
  portfolioValue: number;
  guardrails: GuardrailsV2 | null;
  mode: 'live' | 'paper';
  assetClass: AssetClass;
  // reorg-B2 (Piece C): the canonical per-pipe ATR (mceContext.indicators.atr), set ONCE after the
  // MCE context computes and BEFORE the strategy-dispatch loop, so buildSizedSignalForStrategy reads
  // it off the universal carrier instead of an optional marketContext that 20 callers forget to pass
  // (which silently fed atr=0 → reachability would drop 100% of active signals). Loud `invalid_atr`
  // (not silent coerce-to-0) if it's ever genuinely missing.
  atr?: number;
  // P19-B8.10 (OBJ-4): display-context carriers, same single-point-feed pattern as
  // `atr` above — set per-symbol at each pipe's stamp site (crypto quant = the MCE
  // context; crypto pattern pass = the pattern's own context + propagated pool DBS;
  // xStock = the eval-cycle's regime/DBS threaded through active-dispatch). A pipe
  // with no honest value leaves them undefined — absent stays absent, never a
  // default string (the #405/#530 KEEP-AS-DATA discipline). Read ONLY by the
  // genesis-capture metadata stamp in buildSizedSignalForStrategy; no decision
  // path consumes them.
  regime?: string;
  pairDbsCategory?: string;
  pairDbsScore?: number;
}

export class SignalOrchestrator {
  private mode: 'live' | 'paper';
  private strategyEngine: StrategyEngine;
  // Phase 8.8.7: FilteredPairsService DEPRECATED - using activeFilterPool instead
  private kraken: KrakenService;
  private diagnosticService: ActiveScanDiagnosticService;
  private isRunning: boolean = false;
  private evaluationTimer: NodeJS.Timeout | null = null;
  private weightsRefreshTimer: NodeJS.Timeout | null = null; // L9: Timer for strategy weights cache refresh
  private readonly evaluationIntervalMs: number;
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
    // P19-B4a C5: the hardcoded enabledStrategies allowlist was DISPOSED (rule-18).
    // Per-asset-class strategy enablement is now resolved from DB at the
    // buildSizedSignalForStrategy chokepoint via isStrategyEnabledForAssetClass
    // (strategy_gates) — the sole authority. Per-symbol regime selection still happens
    // in evaluateSymbol via the MCE regime allowlist.

    this.strategyEngine = new StrategyEngine();
    // Phase 8.8.7: FilteredPairsService DEPRECATED - using activeFilterPool instead
    this.kraken = new KrakenService();
    this.diagnosticService = new ActiveScanDiagnosticService();
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
    
    // P19-B4a C5: the hardcoded enabledStrategies Set was disposed. The strategy
    // universe is the canonical map; per-class enablement is DB-resolved at the build
    // chokepoint and per-symbol selection is regime-driven in evaluateSymbol.
    const strategyUniverseCount = Object.keys(STRATEGY_DISPLAY_NAMES).length;
    console.log(`[37.A][SignalOrchestrator][${this.mode}] Starting with ${strategyUniverseCount} strategies (canonical universe; per-class gate is DB-resolved), interval ${this.evaluationIntervalMs}ms`);
    console.log(`[B.3][FLOW_CORRECTED] Signal flow order: Sizing → Metrics → SQE → RTB → TCL`);
    console.log(`[WARMUP][DEBUG] SignalOrchestrator starting (non-blocking)`);
    telemetryTrace.trace('SignalOrchestrator', 'START', 'INFO', {
      mode: this.mode,
      strategies: strategyUniverseCount,
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

  /**
   * P19-B4a (C2 stamp-at-source wire-in) — PUBLIC external-dispatch entry.
   * The xStock active path is a separate scanner/cycle, decoupled from this orchestrator
   * instance; it reaches the shared per-signal pipeline through here. The caller builds a
   * StrategySignal + a SizingContext stamped with its asset class at the per-pipe
   * chokepoint (xStock → 'xstock_spot') and calls this. The method only delegates to the
   * private buildSizedSignalForStrategy, which sizes → SQE → queues to RTB internally
   * (no post-routing to replicate — onSignalCallback is a no-op in paper, the RTB enqueue
   * is terminal). Both pipes (crypto via evaluateSymbol, xStock via this entry) funnel
   * through identical code; the only difference is the class the caller stamps on the
   * SizingContext (the single source of truth post-89b76c8b8). Langston-approved seam
   * (P19_B4a_C2_DISPATCH_DESIGN_rev1.md).
   */
  async dispatchExternalSignal(
    rawSignal: StrategySignal,
    strategyId: StrategyType,
    sizingContext: SizingContext,
    marketContext?: { high24h?: number; low24h?: number; atr?: number }
  ): Promise<SizedStrategySignal | null> {
    return this.buildSizedSignalForStrategy(rawSignal, strategyId, sizingContext, marketContext);
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

    // P19-B8.4b: active-path funnel — narrow the pipe's stamped class to the funnel grid
    // (crypto_spot|xstock_spot); mode is already 'paper'|'live'. Count this generated signal at the funnel
    // TOP (the denominator), then the gates below record their own drops (pre-SQE / SQE / post-SQE). A class
    // outside the grid (a future asset class) is simply not counted. Dormant until paper-active (B8.5).
    const _fClass: FunnelAssetClass | undefined =
      (sizingContext.assetClass === 'crypto_spot' || sizingContext.assetClass === 'xstock_spot')
        ? sizingContext.assetClass : undefined;
    if (_fClass) recordActiveSignalsGenerated(sizingContext.mode, _fClass, 1);

    // Directive 11.4H.1 Task 6: Validate and normalize symbol before event dispatch
    const canonicalSymbol = normalizeToInternalSymbol(rawSignal.symbol);
    if (!canonicalSymbol) {
      console.warn(`[SignalOrchestrator] Dropped unmappable event: ${rawSignal.symbol}`);
      if (_fClass) recordActivePreSqeReject(sizingContext.mode, _fClass, 'unmappable_symbol', strategyId);
      return null;
    }
    // Ensure normalized symbol is used in signal
    rawSignal.symbol = canonicalSymbol;

    // P19-B4a stamp-at-source fail-loud (Langston primary guard): the asset class is
    // carried on sizingContext from the per-pipe dispatch chokepoint and is NEVER
    // re-derived from the symbol here — re-derivation mislabels the collision-set tickers
    // (exist as BOTH xStock and crypto with identical canonical form; the symbol alone
    // can't disambiguate, only the pipe can). The required SizingContext.assetClass field
    // makes a missing stamp a COMPILE error on the typed path; this runtime backstop catches
    // an `as any` / JSON-boundary bypass and screams with full pipe + symbol + strategy
    // context instead of a silent default deep in the RTB write.
    const _stampedAssetClass = sizingContext.assetClass as AssetClass | undefined;
    if (!_stampedAssetClass) {
      throw new Error(
        `[P19-B4a][STAMP_MISSING] sizingContext.assetClass absent on the active build path — ` +
        `symbol=${rawSignal.symbol} strategy=${strategyId} mode=${sizingContext.mode}. The dispatch ` +
        `pipe must stamp the asset class (invariant: one sizingContext = one class = one pipe).`,
      );
    }

    // P19-B4a C5 (A5): DB-resolved per-asset-class strategy gate (replaces the disposed
    // hardcoded enabledStrategies allowlist). Authoritative for BOTH pipes (crypto via
    // evaluateSymbol, xStock via dispatchExternalSignal) since the stamped class lives here.
    // strategyId is the 9-wide StrategyType union ('range_trading'); the gate + strategy_gates
    // rows + STRATEGY_DISPLAY_NAMES use the canonical name ('range_trade'). normalizeStrategy()
    // does NOT bridge this (its legacy map is PascalCase + 'range_trading' is not a
    // STRATEGY_DISPLAY_NAMES key → returns unchanged → silent default-open), so an explicit
    // one-entry reverse-alias is required (mirror of the C2 forward-alias).
    const _canonicalStrategy = strategyId === 'range_trading' ? 'range_trade' : (strategyId as string);
    if (!isStrategyEnabledForAssetClass(_canonicalStrategy, _stampedAssetClass)) {
      console.log(`[P19-B4a][C5][STRATEGY_GATE] blocked ${rawSignal.symbol}/${_canonicalStrategy} — disabled for assetClass=${_stampedAssetClass} (strategy_gates DB).`);
      if (_fClass) recordActivePreSqeReject(sizingContext.mode, _fClass, 'strategy_gate', _canonicalStrategy);
      return null;
    }

    // W2.1 (2026-06-06): central max-holding-ms stamp for the active dispatch
    // path. Guarantees every active-path signal carries an unambiguous
    // metadata.maxHoldingMs (milliseconds) before it reaches the paper-execution
    // enforcer. No-op if the strategy's builder already set it. Forward-prep
    // only — active trading is OFF; this changes no live behavior today.
    stampMaxHoldingMs(rawSignal, sizingContext.assetClass);

    // P19-B8.10 (OBJ-2): signalId mint relocated to the pure util — the SLAL audit
    // layer (Phase 8.8.4-A) was purged with its sole reader, the Ready-tab panel.
    const signalId = generateSignalId(rawSignal.symbol, strategyId);

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
    const sizingResult = sizeActivePositionForSignal({
      mode: sizingContext.mode, // P19-B4b D5: per-mode concentration sizing
      portfolioValue: sizingContext.portfolioValue,
      guardrails: sizingContext.guardrails,
      entryPrice: rawSignal.entryPrice,
      stopPrice: rawSignal.stopPrice,
      symbol: rawSignal.symbol,
      strategy: strategyId,
      // B-NEW-43 chunk 3: thread the signal's source pool so Phase 14.5
      // pattern-pool reduced sizing applies (was an undeclared ref in TS2304).
      sourcePool: rawSignal.metadata?.sourcePool,
      // B79.0n.ORCHESTRATOR (2026-05-27): REQUIRED per-class dispatch key.
      // Deterministic from symbol (resolveAssetClass) per Langston Step 2
      // Probe 8 ACK — single source of truth, no silent crypto_spot fallback.
      assetClass: sizingContext.assetClass,
    });

    // Phase 8.8.3-C5-2: Guardrail Input Verification - log balance used for trade sizing
    c5FinancialDiagnostics.logGuardrailInput(
      sizingContext.mode,
      rawSignal.symbol,
      strategyId,
      sizingContext.portfolioValue
    );

    if (sizingResult.quantity <= 0 || sizingResult.estimatedValue <= 0) {
      console.log(`[B.3][SIZING_SKIP] Zero sizing result for ${rawSignal.symbol}/${strategyId}`);
      if (_fClass) recordActivePreSqeReject(sizingContext.mode, _fClass, 'sizing_zero', strategyId);
      return null;
    }

    console.log(`[B.3][SIZING] ${rawSignal.symbol}/${strategyId}: qty=${sizingResult.quantity.toFixed(8)}, value=$${sizingResult.estimatedValue.toFixed(2)}`);

    // ── B-REGIME-INPUTS-LIVE (2026-07-19) — #543 + #538 ──────────────────────────
    // Read BOTH RegimeWeight inputs LIVE from the MCE. Called fresh here rather than
    // reusing the `mceCtx` local further up: that one is block-scoped inside a 3-line
    // try and is DEAD by this point (Langston Step-1 flag 1 — the scope claimed
    // otherwise and was wrong). getCachedContext is a pure map lookup, so a fresh call
    // costs nothing.
    const _regime = readRegimeInputs(rawSignal.symbol, sizingContext.assetClass as AssetClass);
    if (!_regime.inputs) {
      // ★ FAIL LOUD, NEVER SUBSTITUTE (OBJ-3; Kyle's standing rule, CLAUDE.md §11).
      // The predecessor defect was precisely a silent substitution: an unfilled cache
      // returned a hardcoded 0.015 one hundred percent of the time with no log and no
      // alarm, which is why a dead admission gate survived months. A missing market
      // context means we CANNOT honestly score this signal, so we drop it and say so.
      // The per-signal disposition is REJECT; the "is the MCE down?" question is a
      // SYSTEM-level concern handled by the miss-rate circuit breaker, not by quietly
      // admitting the signal here (Langston Q4 — explicitly NOT admit-and-alarm).
      recordRegimeInputsMiss(rawSignal.symbol, sizingContext.assetClass as AssetClass, _regime.miss!);
      console.warn(
        `[B-REGIME-INPUTS-LIVE][REJECT] ${rawSignal.symbol}/${strategyId}: no live market context ` +
        `(${_regime.miss}) — signal DROPPED rather than scored on a substituted constant.`
      );
      return null;
    }

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
      // ── B-REGIME-INPUTS-LIVE (2026-07-19) — #543 + #538, fixed TOGETHER per OBJ-0 ──
      // THIS IS THE ROOT SITE: calculateExtendedSignalMetrics computes `regimeWeight`
      // here, so a constant fed in HERE pins the gate everywhere downstream. It read
      // `trendStrength: 0.5 // Default for legacy signals` — never set from anything —
      // and let volatility fall to estimateVolatility(). With BOTH inputs constant the
      // output pinned at 0.6455 against a 0.30 floor, so the RegimeWeight gate had no
      // reachable reject path. Both now come LIVE from the MCE (the same source the VTS
      // path already reads correctly — 9,041 distinct values across 16,183 trades).
      // ⚠️ NO FALLBACK ON A MISS, by design (OBJ-3 / CLAUDE.md §11): `_regime` is null
      // when the MCE has nothing, and the caller REJECTS below. Substituting here is the
      // exact defect this batch removes — the old 0.015 was never a chosen default, it
      // was an unfilled cache's failure mode returned silently.
      trendStrength: _regime.inputs?.trendStrength,
      volatility: _regime.inputs?.volatility,
    });

    // ── #546 — ABSENCE IS NOT A SCORE. Second gate, deliberately kept. ──
    // The `_regime.inputs` check above should already have returned, so in principle this
    // is unreachable today. It stays for two reasons. (1) It is the TYPE-LEVEL contract:
    // calculateExtendedSignalMetrics returns `… | null`, and the compiler requires the
    // caller to say what happens on null rather than letting it flow on as a value —
    // which is exactly the enforcement that would have stopped the `= 0` sentinel from
    // being written at all. (2) Defence in depth: if a future edit adds another path into
    // these metrics that does NOT come through the guard above, this refuses instead of
    // scoring. An unreachable guard that makes absence unrepresentable is worth more than
    // a reachable one that has to be remembered.
    if (!extendedMetrics) {
      console.warn(
        `[B-REGIME-INPUTS-LIVE][REJECT] ${rawSignal.symbol}/${strategyId}: extended metrics ` +
        `unavailable (regimeWeight could not be computed) — signal DROPPED, not scored.`
      );
      return null;
    }

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
      // B79.0n.MCE: this observational telemetry wants the already-computed
      // directionalBias category for the symbol — it must READ the cached
      // context, not recompute it. The prior `computeContext(rawSignal.symbol)`
      // call passed only a symbol (computeContext needs OHLC + price + volume),
      // so it could never produce a real context — the try/catch silently
      // swallowed the failure and this telemetry always emitted 'UNKNOWN'.
      // getCachedContext is the correct read-only API; assetClass resolved
      // from the symbol.
      const mceCtx = mce.getCachedContext(rawSignal.symbol, sizingContext.assetClass);
      _phase15bDbsCategory = mceCtx?.directionalBias?.category ?? 'UNKNOWN';
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

    // B-NEW-54 (2026-06-08): the fire-and-forget ML promotion/profit prediction
    // block was removed here. The Python ML microservice was retired; its blended
    // confidence was computed and logged but never consumed by the pipeline.

    // Directive 11.0E: Trace raw metrics before SQE evaluation (FinalScore-native)
    // P19-B3b: traceOrchestrator's rawMetrics param is { finalScore?, profit?, risk? }.
    // The prior object passed confidence/volatility/trendStrength/entryPrice — NONE of
    // which are valid keys, so the trace recorded all-null raw metrics. Use the real
    // FinalScore-native values extendedMetrics already computes (expectedReturn = profit,
    // riskScore = risk).
    diagnosticTrace.traceOrchestrator(
      rawSignal.symbol,
      strategyId,
      {
        finalScore: extendedMetrics.finalScore,
        profit: extendedMetrics.expectedReturn,
        risk: extendedMetrics.riskScore,
      },
      false // not yet normalized by SQE
    );

    // Directive 11.0E: Apply SQE quality filter with FinalScore and RegimeWeight only
    // Phase 14: Pass pre-computed FinalScore and RegimeWeight — SQE no longer backfills
    // HF9 Item B: Compute regimeStability for governance gate in SQE
    // P19-B3b: corrected relative path — strategy-governance.ts lives at
    // server/config/, so from server/services/ it is ONE `../` (was two).
    let sqeRegimeStability: import('../config/strategy-governance.js').RegimeStability | undefined;
    try {
      const { computeGlobalStability } = await import('../core/governance/regime-stability.js');
      // P19-B3b: driftScore + volZ are NOT computed in this orchestrator scope.
      // calculateExtendedSignalMetrics produces no drift/vol-Z fields, so the prior
      // `extendedMetrics.driftScore`/`.volZ` reads were always undefined (masked by
      // `|| 0.5` / `|| 0`). The rolling-stats z-scores that vts-runner feeds here come
      // from getNormalizedRegimeWithDetails(), which is NOT run on this path. Until that
      // wiring exists, pass the documented cold-start defaults explicitly (was silently
      // undefined). Homed to the VTS/regime-stability wiring follow-up.
      const stabilityResult = computeGlobalStability(
        0.5, // driftScore — unavailable in orchestrator scope; cold-start default
        0,   // volZ — unavailable in orchestrator scope; cold-start default
        extendedMetrics.confidence || 0.5
      );
      sqeRegimeStability = stabilityResult.stability;
    } catch { /* stability unavailable — SQE governance gate will be skipped */ }

    // P19-B4a stamp-at-source: the SQE asset class is the pipe-stamped class on
    // sizingContext — NOT re-derived from the symbol (which mislabels collision tickers)
    // nor read from optional metadata (which an upstream step might omit). Single
    // authoritative source per the one-sizingContext-one-class-one-pipe invariant.
    const sqeAssetClass = sizingContext.assetClass;

    // reorg-B3 (#233, Option B): read the FX5 pool entry ONCE. It is the routing-time survivor
    // snapshot for this symbol — the active-filter-pool DEDUPLICATES and does NOT refresh a
    // non-expired entry (5-min TTL), so within a scan cycle this is the stable snapshot that drove
    // this signal's routing. We capture di + dbsScore here as the AT-QUEUE EV inputs (frozen into
    // the typed rtb_signals columns below, so a later pool refresh cannot drift them). dbsScore is
    // the SAME survivor DBS that drove strong-trend routing → coherent with the open-gate
    // strong-trend pWin branch. This call also supplies volume24h (it did before reorg-B3; now read
    // once instead of inline). NULL when the symbol is absent from the pool → kernel defaults.
    const fx5Data = activeFilterPool.getFX5DataForSymbol(rawSignal.symbol, sizingContext.mode);

    // ── P19-B7.2: BEST-OF-BOTH maker/taker ENTRY decision (OBJ-1/OBJ-2/OBJ-3) ──
    // Computed ONCE here, at the shared build convergence (covers quant + hybrid +
    // pattern + xStock — all funnel through buildSizedSignalForStrategy), on the
    // SAME at-queue DI/DBS basis captured for the snapshot below (fx5Data.di /
    // .dbsScore) so the maker/taker comparison and the [11.8B] open-gate read one
    // consistent vintage (F2). The chosen best netEV is snapshotted onto the RTB
    // row and is the SINGLE value every downstream EV consumer reads — the
    // [11.8B] open-gate and the B7.1 ranker — so a taker-unprofitable /
    // maker-profitable signal (the crypto opener) survives to be ranked + opened.
    //
    // Placement (P19-B7.2b, Kyle directive 2026-07-01): this decision is a STANDALONE
    // service that runs JUST BEFORE the SQE — signal-gen → sizing → THIS decision →
    // SQE. The SQE stays a pure, calculation-FREE quality gate; the decision is NOT
    // inside it. Placing it before the SQE (a) mirrors the VTS, which runs the SAME
    // shared decideMakerTaker() before its own Net-EV gate (F6), and (b) is
    // future-proof: even if the SQE's optional ROI sub-check
    // (signal_quality_evaluator.ts:327, guarded `if (entryPrice && targetPrice &&
    // regime)`, dormant on the active path today) is ever activated, it can no longer
    // reject a maker-chosen opener upstream because best-of-both is already decided.
    // The chosen netEV flows PAST the calc-free SQE via the snapshot below to the
    // [11.8B] open-gate + the B7.1 ranker (the sole active-path taker-EV gate today is
    // that [11.8B] open-gate — Active-Trading-Path-Audit H1). VTS: same function, its
    // own Net-EV gate (no SQE in the VTS).
    const _mtCosts = getCachedCostMetrics(rawSignal.symbol, sizingContext.assetClass);
    const _mtFriction = getFrictionForAssetClass(sizingContext.assetClass);
    const _mtFeeRateMaker = _mtFriction.feeRateMaker;
    const _mtFeeRateTaker = _mtFriction.feeRateTaker; // single-source the taker−maker fee delta (Langston Q1)
    const _mtGlobalKey = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
    const _mtDecision = decideMakerTaker({
      entryPrice: rawSignal.entryPrice,
      stopPrice: rawSignal.stopPrice,
      targetPrice: rawSignal.targetPrice,
      costs: _mtCosts,
      feeRateMaker: _mtFeeRateMaker,
      feeRateTaker: _mtFeeRateTaker,
      // Same at-queue DI/DBS basis as the diAtQueue/dbsScoreAtQueue snapshot below
      // (F2 single-basis). NULL → kernel documented defaults, exactly as the
      // open-gate treats a null di_at_queue.
      DI: fx5Data?.di ?? undefined,
      sourcePool: rawSignal.metadata?.sourcePool || undefined,
      dbsScore: fx5Data?.dbsScore ?? undefined,
      minPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_floor',     _mtGlobalKey),
      maxPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_ceiling',   _mtGlobalKey),
      diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', _mtGlobalKey),
      // P19-B8.5a (OBJ-1, FIX-1): signalStrength = the MEASURED flat pWin base rate
      // (per-class DB knob; crypto 0.295 / xstock 0.317 / global 0.307 — pinned to the
      // 12,140-trade post-B62 probe). REPLACES the deterministic FinalScore, which is
      // anti-predictive (r=−0.140) and was tinting chosenNetEv — the rank key AND the
      // EV gates' number — with the retired composite. Drives the adverse-selection
      // slope + the hard taker floor; a shift in some maker/taker picks is EXPECTED
      // (intended de-tinting) — watched via the maker-pick-rate monitor at Step-7.
      // PLACEHOLDER until the Phase-25 calibrated pWin (#399a); DB-governed per rule 15.
      signalStrength: getCachedNumberRequired('scoring_base', 'flat_pwin_base',
        { exchange: '*', assetClass: sizingContext.assetClass, strategy: '*', regime: '*' }),
      urgencyClass: entryUrgencyClassForFamily(STRATEGY_FAMILY_MAP[_canonicalStrategy]),
      haircut: resolveMakerTakerHaircut(sizingContext.assetClass),
    });
    console.log(
      `[P19-B7.2][MAKER_TAKER] ${rawSignal.symbol}/${strategyId}: chose ${_mtDecision.chosenMode} ` +
      `(taker netEV=${_mtDecision.takerNetEV.toFixed(6)}, maker-adj netEV=${_mtDecision.makerNetEVAdjusted.toFixed(6)}, ` +
      `A=${(_mtDecision.adverseSelectionPct * 100).toFixed(3)}% C=${(_mtDecision.nonFillCostPct * 100).toFixed(3)}% ` +
      `floor=${_mtDecision.hardFloorFired})`,
    );
    // B-EVIDENCE-SINK: durable capture of the maker/taker pick + the decision-time haircut snapshot
    // (chosen mode, both leg EVs, pFill/adverse/nonfill AS APPLIED) — the Phase-25 pFill-calibration
    // substrate (rtb_signals is transient + holds no haircut snapshot). Fire-and-forget, never throws.
    emitMakerTaker(
      { symbol: rawSignal.symbol, strategy: strategyId, assetClass: sizingContext.assetClass ?? 'unknown', regime: null, sourcePool: rawSignal.metadata?.sourcePool ?? null, mode: sizingContext.mode },
      {
        chosenEntryMode: _mtDecision.chosenMode,
        takerNetEv: _mtDecision.takerNetEV,
        makerNetEvAdjusted: _mtDecision.makerNetEVAdjusted,
        signalStrength: _mtDecision.signalStrength,
        adverseSelectionPct: _mtDecision.adverseSelectionPct,
        nonFillCostPct: _mtDecision.nonFillCostPct,
        makerFillProbability: _mtDecision.makerFillProbability,
        hardFloorFired: _mtDecision.hardFloorFired,
      },
    );
    // P19-B7.2 (OBJ-6): record the decision for the maker-PICK-RATE monitor (too-loose-haircut
    // early warning). Bounded buffer; paper maker-fill outcomes stay data-fenced (non-calibration).
    rtbMetricsService.recordMakerTakerDecision({
      symbol: rawSignal.symbol,
      strategy: strategyId,
      assetClass: sizingContext.assetClass,
      chosenMode: _mtDecision.chosenMode,
      takerNetEV: _mtDecision.takerNetEV,
      makerNetEVAdjusted: _mtDecision.makerNetEVAdjusted,
      adverseSelectionPct: _mtDecision.adverseSelectionPct,
      nonFillCostPct: _mtDecision.nonFillCostPct,
      hardFloorFired: _mtDecision.hardFloorFired,
      timestamp: Date.now(),
    });
    const sqeInput: SQEInput = {
      signalId,
      symbol: rawSignal.symbol,
      strategy: strategyId,
      mode: sizingContext.mode,
      assetClass: sqeAssetClass,
      confidence: extendedMetrics.confidence,
      finalScore: extendedMetrics.finalScore,
      regimeWeight: extendedMetrics.regimeWeight,
      trendStrength: 0.5,
      volatility: extendedMetrics.volatility ?? 0.3,
      regimeStability: sqeRegimeStability,  // HF9: For governance gate + confidence floor in SQE
      sourcePool: rawSignal.metadata?.sourcePool || undefined,
      // P19-B8.5a (OBJ-3): the upstream-computed best-of-both netEV for the SQE's
      // admission sign-check (gate-inside, calculation-outside — decideMakerTaker
      // above stays the calc home per Kyle's P19-B7.2b placement).
      chosenNetEv: _mtDecision.chosenNetEV,
      chosenEntryMode: _mtDecision.chosenMode,
    };

    // P19-B8.5 OBJ-6 (Langston-approved): ACTIVE-path gen — the HF8 confidence floor +
    // HF9 governance gate run in SHADOW (evaluate + log, never block); their stability
    // input here is the cold-start default above. See SQEOptions.gateShadowMode + #514.
    const sqeResult = await signalQualityEvaluator.evaluate(sqeInput, { gateShadowMode: true });
    // P19-B8.4b: SQE-at-generation tally — per-gate reject breakdown + the pass/fail denominator. The SAME
    // signal is re-SQE'd during RTB refresh (phase='refresh' in ready_to_buy_service); those are two labelled
    // numbers, never summed (MUST-4). Records BOTH pass and fail (a pass feeds the honest denominator).
    if (_fClass) recordActiveSqeEvaluation(sizingContext.mode, _fClass, sqeResult.passed, sqeResult.failures, 'generation');

    // ══════════════════════════════════════════════════════════════════════════════
    // P19-B8.5 — THE EXPLORATION LANE (paper-only, additive; 3-way consensus + Kyle
    // GO 2026-07-15, budget 25-30/day). The organic netEV>0 admission above stays
    // BYTE-IDENTICAL; this lane may additionally admit a bounded daily budget of
    // signals whose ONLY SQE failure is the NetEV gate (the fee wall — verified
    // genuine). STRUCTURAL live-scoping (Langston condition-2): the lane is consulted
    // ONLY under `this.mode === 'paper'` — the live path never reads the knobs and
    // its netEV>0 admission stays hardcoded. Every lane admit carries the 4-field
    // stamp (admissionBasis/netEvAtAdmit/floorInEffect/policyVersion — KEEP-AS-DATA,
    // the #405 pattern) so Phase-25 separates the cohort and the anneal is
    // reconstructable per row. A lane ERROR falls through to the normal reject
    // (fail-closed: never an accidental admit).
    // ══════════════════════════════════════════════════════════════════════════════
    let _exploAdmit: import('./execution/exploration-lane.js').ExplorationAdmitDecision | null = null;
    if (!sqeResult.passed && this.mode === 'paper') {
      try {
        const { checkExplorationAdmit, isNetEvOnlyFailure } = await import('./execution/exploration-lane.js');
        if (isNetEvOnlyFailure(sqeResult.failures)) {
          const d = await checkExplorationAdmit({
            assetClass: sizingContext.assetClass,
            chosenNetEv: _mtDecision.chosenNetEV,
            entryPrice: rawSignal.entryPrice,
          });
          if (d.admit) {
            _exploAdmit = d;
            console.log(`[P19-B8.5][EXPLORATION_ADMIT] ${rawSignal.symbol}/${strategyId}: ${d.reason} (netEV=${_mtDecision.chosenNetEV.toFixed(6)}, organic gate UNTOUCHED — lane admit)`);
          } else {
            console.log(`[P19-B8.5][EXPLORATION_DECLINE] ${rawSignal.symbol}/${strategyId}: ${d.reason}`);
          }
        }
      } catch (laneErr) {
        console.warn(`[P19-B8.5][EXPLORATION_ERR] ${rawSignal.symbol}/${strategyId}: lane error — falling through to normal reject (fail-closed):`, laneErr instanceof Error ? laneErr.message : laneErr);
      }
    }

    if (!sqeResult.passed && !_exploAdmit) {
      console.log(`[11.0E][SQE_REJECT] ${rawSignal.symbol}/${strategyId}: ${sqeResult.reason}`);
      // P19-B5a: SQE-reject capture (active path; dormant until paper-active —
      // this emit branch only runs when the active orchestrator emits). Langston
      // NO-PATCHES: capture the failing FinalScore (the below-floor score is the
      // most analytically valuable number on the row), NOT null. Fire-and-forget.
      try {
        const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
        archiveSignalEval({
          mode: tradingModeToRunMode(this.mode),
          symbol: rawSignal.symbol,
          exchange: 'kraken',
          assetClass: sqeAssetClass,
          source: 'signal-orchestrator',
          strategy: strategyId,
          rejectStage: 'sqe',
          finalScore: extendedMetrics.finalScore,
          features: { predictiveConfidence: extendedMetrics.confidence },
          gateDecision: { gate: 'sqe', accepted: false, reason: sqeResult.reason, path: 'active-signal-orchestrator' },
        });
      } catch (b70Err) {
        console.warn(`[B70][ARCH] SQE-reject signal-eval archive enqueue failed:`, b70Err instanceof Error ? b70Err.message : b70Err);
      }
      return null;
    }

    console.log(_exploAdmit
      ? `[B.3][SQE_PASS] ${rawSignal.symbol}/${strategyId}: EXPLORATION-LANE admit (organic SQE gate said no on NetEV only; lane budget consumed)`
      : `[B.3][SQE_PASS] ${rawSignal.symbol}/${strategyId}: passed SQE filter`);

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
        // P19-B8.4b: POST-SQE reject (passed the SQE, dropped before the RTB queue) — kept distinct from the
        // pre-SQE bucket so the funnel order is honest (this site sits after the :764 SQE).
        if (_fClass) recordActivePostSqeReject(sizingContext.mode, _fClass, 'position_cap');
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


    // P19-B8.10 (OBJ-4): build the genesis display-context stamp. Each value comes
    // from the SAME source the VTS open-trade capture reads; a value that is not
    // honestly available HERE, at this signal's genesis, is left absent. The whole
    // block is defensive — a capture error must never block a qualified signal.
    let _displayContext: Record<string, unknown> = {};
    try {
      const _dcClass = sizingContext.assetClass;
      const _dc: Record<string, unknown> = {};
      if (sizingContext.regime) _dc.regime = sizingContext.regime;
      if (sizingContext.pairDbsCategory) _dc.pairDirectionalBias = sizingContext.pairDbsCategory;
      if (sizingContext.pairDbsScore != null && Number.isFinite(sizingContext.pairDbsScore)) _dc.pairDirectionalBiasScore = sizingContext.pairDbsScore;
      try {
        const _gr = getTelemetryAggregator().getDominantRegimeForClass?.(_dcClass)?.regime;
        if (_gr) _dc.globalRegime = _gr;
      } catch { /* class idle/warming → absent */ }
      try {
        const _pf = computePairFrictionIndex(rawSignal.symbol, _dcClass);
        if (Number.isFinite(_pf)) _dc.pairFriction = _pf;
      } catch { /* no cost cache entry → absent */ }
      const _gf = getGlobalFriction(_dcClass);
      if (_gf != null && Number.isFinite(_gf)) _dc.globalFriction = _gf;
      const _gCat = getLastGlobalDBSCategory(_dcClass);
      if (_gCat) _dc.globalDirectionalBias = _gCat;
      const _gScore = getLastGlobalDBSScore(_dcClass);
      if (_gScore != null && Number.isFinite(_gScore)) _dc.globalDirectionalBiasScore = _gScore;
      // Pattern name: set at pattern-signal genesis (a signal field; hybrid confluence
      // carries it in metadata) — the #530-shape transit gap: the engine reads
      // sigMeta.patternType at open and found nothing until this carry.
      const _pt = (rawSignal as { patternType?: string }).patternType ?? (rawSignal.metadata as { patternType?: string } | undefined)?.patternType;
      if (_pt) _dc.patternType = _pt;
      // Entry-liquidity (crypto convention: 24h volume) — stamped into metadata so
      // CLOSED rows retain it after the open row is deleted.
      // P19-B8.12: the scanner's ideal/rotational pool marking (carried through the
      // active pool as of this batch; the adapter already reads metadata.pool).
      if (fx5Data?.pool) _dc.pool = fx5Data.pool;
      if ((fx5Data?.volume24h ?? 0) > 0) {
        _dc.entryLiquidityValue = fx5Data!.volume24h;
        _dc.entryLiquidityKind = 'volume_qty';
      }
      _displayContext = _dc;
    } catch (dcErr) {
      console.warn(`[P19-B8.10][GENESIS_CAPTURE] display-context stamp failed for ${rawSignal.symbol}/${strategyId} (queue proceeds, cells stay absent):`, dcErr instanceof Error ? dcErr.message : dcErr);
      _displayContext = {};
    }

    // ★ P19-B8.5f (OBJ-2, #550): runtime BACKSTOP for the typed `SQESignalMetadata.maxHoldingMs`
    // contract. The type is the primary gate — omitting the key below is now a COMPILE error —
    // and this throw catches only what a type cannot: an `as any` or JSON-boundary bypass that
    // delivers a rawSignal whose central stamp never ran. Mirrors the B4a `STAMP_MISSING` guard
    // at :496-509 (typed field = compile error, runtime throw = bypass backstop).
    // FAIL LOUD, never a silent default: a wrong-but-plausible max-hold silently changes when
    // every position exits, which is exactly the class of silent defect this batch exists to
    // close (§5 no-silent-fallback; the B8.8 sizing-fallback fail-loud sweep).
    const _rawMaxHoldingMs = (rawSignal.metadata as Record<string, unknown> | undefined)?.maxHoldingMs;
    if (typeof _rawMaxHoldingMs !== 'number' || !Number.isFinite(_rawMaxHoldingMs) || _rawMaxHoldingMs <= 0) {
      throw new Error(
        `[P19-B8.5f][MAXHOLD_STAMP_MISSING] rawSignal.metadata.maxHoldingMs absent or invalid on the active ` +
        `build path — symbol=${rawSignal.symbol} strategy=${strategyId} mode=${sizingContext.mode} ` +
        `got=${JSON.stringify(_rawMaxHoldingMs)}. stampMaxHoldingMs (:531) must run before this point; ` +
        `a position without a max-hold never time-exits (#550).`,
      );
    }
    const _maxHoldingMs: number = _rawMaxHoldingMs;

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
      // P19-B3b (landmine #2): riskScore + profitRate are REQUIRED by queueSQESignal
      // (written to the risk_score + expected_return columns). They were never set
      // here, so queueSQESignal threw on `input.riskScore.toString()` and the catch
      // below silently dropped EVERY qualified signal. extendedMetrics already
      // computes both — thread them through.
      riskScore: extendedMetrics.riskScore,
      profitRate: extendedMetrics.profitRate,
      finalScore: extendedMetrics.finalScore,
      regimeWeight: extendedMetrics.regimeWeight,
      hybridScore: (rawSignal as any).hybridScore ?? extendedMetrics.confidence,
      decayPenalty: 0,
      trendStrength: 0.5,
      volatility: extendedMetrics.volatility ?? 0.3,
      currentPrice: rawSignal.entryPrice,
      volume24h: fx5Data?.volume24h ?? null,
      // reorg-B3 (#233): the at-queue EV inputs from the same FX5 survivor snapshot read above.
      // Persisted to the typed di_at_queue / dbs_score_at_queue columns (NOT metadata). NULL when
      // the symbol is absent from the pool → kernel documented defaults at the open-gate.
      diAtQueue: fx5Data?.di ?? null,
      dbsScoreAtQueue: fx5Data?.dbsScore ?? null,
      // P19-B7.2: the best-of-both maker/taker snapshot (OBJ-1/OBJ-3). chosenNetEV
      // is the SINGLE-CONSISTENT-NUMBER every downstream EV consumer reads (the
      // [11.8B] open-gate + the B7.1 ranker) — never the raw un-haircut maker EV.
      chosenEntryMode: _mtDecision.chosenMode,
      chosenNetEv: _mtDecision.chosenNetEV,
      takerNetEv: _mtDecision.takerNetEV,
      makerNetEvAdjusted: _mtDecision.makerNetEVAdjusted,
      sourcePool: rawSignal.metadata?.sourcePool || undefined,
      signalType: (rawSignal as any).signalType || rawSignal.metadata?.signalType || 'QUANT',
      // P19-B4a (A1.5, Langston spine): resolver-backed, NOT metadata-OR-default.
      // The sizing input above (:464) already resolves the class from the symbol with
      // "no silent crypto_spot fallback"; this RTB queue input MUST match it. A missing
      // metadata.assetClass must NOT silently write crypto_spot onto an xstock row.
      // resolveAssetClass is deterministic from symbol + throws on an unclassifiable
      // symbol (fail loud, no silent fallback — CLAUDE.md §10).
      assetClass: sizingContext.assetClass,
      metadata: {
        strategyWeight,
        exposureBias,
        // P19-B8.5 exploration lane — the 4-field cohort stamp (KEEP-AS-DATA, #405
        // pattern). 'organic' = passed the untouched netEV>0 admission; 'exploration'
        // = lane admit (paper-only) with the effective floor + policy version at
        // admit time, so the anneal's non-stationarity is reconstructable per row.
        admissionBasis: _exploAdmit ? 'exploration' : 'organic',
        netEvAtAdmit: _mtDecision.chosenNetEV,
        ...(_exploAdmit ? { floorInEffect: _exploAdmit.floorInEffect, policyVersion: _exploAdmit.policyVersion } : {}),
        assetClass: sizingContext.assetClass,
        // ★ P19-B8.5f (OBJ-1, #550): CARRY THE MAX-HOLD. `stampMaxHoldingMs` (:531) stamps this
        // on the RAW signal and its own comment promises it reaches "the paper-execution
        // enforcer" — but this rebuild constructs a FRESH object from an explicit field list and
        // never spreads `rawSignal.metadata`, so the value died here and the exit engine's
        // `max_holding_period` branch (`active-execution-engine.ts:1482-1494`) was skipped for
        // EVERY position. Measured: 0 of 15 live positions carried it, and there are 0
        // max_holding_period closes in the entire closed_trades history. That stamp comment also
        // says "active trading is OFF — changes no live behavior today" (2026-06-06); it is ON
        // now, so a dormant forward-prep guarantee had quietly become load-bearing.
        // No downstream plumbing is needed: `active-execution-engine.ts:3143` spreads
        // `...signal.metadata` onto the position row.
        maxHoldingMs: _maxHoldingMs,
        // P19-B8.5l (#581, unblocks #556): carry the entry-time ATR forward. RE-ENABLED after
        // the source fix in THIS batch — the B8.5k carry was reverted because `sizingContext.atr`
        // was a SINGLE SHARED value per scan cycle (the pattern pass at :1846 never re-stamped it,
        // so it held the last quant symbol's atr). That is fixed at :~1949 (`sizingContext.atr =
        // context.indicators?.atr` per pattern-symbol), so the value is now per-symbol-correct for
        // every consumer. Fed to atr_at_open → Open Trades display, RTB ranking, replay, VTS-parity.
        // Exit-neutral (B8.5k T1/T2; trailing off). Gated by the ≥2-distinct-atr-per-cycle fence
        // test (p19-b8-5l). No fail-loud here — the rebuild precedes the :1548 invalid_atr gate.
        atr: sizingContext.atr,
        // P19-B8.10 (OBJ-4): genesis capture of the display-context fields the VTS
        // records at open (regime / global regime / pair+global friction / pair+
        // global DBS / pattern name / entry-liquidity). KEEP-AS-DATA transit — read
        // by NOTHING on the decision path; the engine spreads them onto the position
        // row for the trade tables. Absent values are simply absent (no fabrication).
        ..._displayContext,
      },
    };

    console.log(`[L9][SIGNAL_WEIGHT] ${rawSignal.symbol}/${strategyId}: strategyWeight=${strategyWeight.toFixed(4)}`);
    console.log(`[L10][EXPOSURE_BIAS] ${rawSignal.symbol}/${strategyId}: exposureBias=${exposureBias.toFixed(4)}`);

    // Queue to RTB pool (fire-and-forget, non-blocking).
    // P19-B3b (landmine #2): route the catch to an OBSERVABLE counter — a drop here
    // means a SQE-qualified signal never reached the queue. Previously this was a
    // bare console.error that read like normal operation while silently losing every
    // signal. recordQueueFailure increments a metric + logs [RTB_QUEUE_DROP][CRITICAL].
    readyToBuyService.queueSQESignal(sqeSignalInput).catch(err => {
      readyToBuyService.recordQueueFailure(rawSignal.symbol, strategyId, err);
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
      // B79.0n.CONFIDENCE-CHAIN: capture-and-reuse asset class for the chain
      // block per CLAUDE.md §5 #15 (B79.0n.PATTERN-DETECT Step 9 capture-and-reuse pattern).
      // safeResolveAssetClass returns null on unresolvable + logs WARN — avoids
      // per-call throws in the hot loop. Skip the entire chain block when null.
      // P19-B4a stamp-at-source: the chain-block asset class is the pipe-stamped class
      // (sizingContext.assetClass), always present — the old safeResolveAssetClass null-skip
      // is removed (a stamped signal can never be unclassifiable). Bare block preserves scope.
      const _pairAssetClass: AssetClass = sizingContext.assetClass;
      {
      // Per-class accessors (B79.0n.CONFIDENCE-CHAIN) — pulled FIRST so all
      // 7 push sites below can thread `_pairAssetClass` uniformly. Legacy
      // global accessors retained for non-per-class data (cold-start logging).
      const macro = mce.getCurrentMacroContext();
      const macroConfig = mce.getMacroConfigForClass(_pairAssetClass) ?? mce.getCurrentMacroConfig();
      const phaseWeights = mce.getPhaseWeightsForClass(_pairAssetClass) ?? mce.getCurrentPhaseWeights();

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
          assetClass: _pairAssetClass,
        });
      }

      // B67.2 phase preference alternate
      // Confidence here is the strategy's effective confidence value at admission.
      // Phase preference multiplies it; alternate row records both with/without
      // the multiplication for downstream calibration analysis.
      const outcomeFeedbackConfig = mce.getCurrentOutcomeFeedbackConfig();
      const regimeAgeConfig = mce.getCurrentRegimeAgeConfig();
      const fullRegimeConfig = mce.getCurrentRegimeConfig();
      // B79.0n.MCE: append required assetClass — the cache is keyed by (symbol, assetClass).
      const symbolCtx = mce.getCachedContext(rawSignal.symbol, sizingContext.assetClass);
      const strategyKey = (rawSignal as any).strategy ?? 'unknown';
      // P19-B3b: regime LABEL comes from the cached MCE context (symbolCtx), not from
      // extendedMetrics — calculateExtendedSignalMetrics produces no `regime` field, so
      // the prior `extendedMetrics.regime` read was always undefined (masked by ?? 'UNKNOWN').
      const regimeLabel = symbolCtx?.regime.regime ?? 'UNKNOWN';
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
            const modulated = applyPhasePreference(strategyKey, phase, phaseWeights, baseConf, _pairAssetClass);
            const weight = phaseWeights[`${strategyKey}_${phase}`];
            modulatedConfChain = modulated;
            // B76: stash; alt.conf computed in Pass 2 from chain-final.
            alternateInputs.push({
              kind: 'b67_2',
              phase,
              phaseAgeSeconds,
              strategy: strategyKey,
              phaseWeight: weight,
              assetClass: _pairAssetClass,
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
        const freshness = computeFreshnessFactor(ageMs, regimeAgeConfig, _pairAssetClass);
        modulatedConfChain *= freshness.factor;
        alternateInputs.push({
          kind: 'b68_4',
          result: freshness,
          targetAgeHours: regimeAgeConfig.targetAgeHours,
          assetClass: _pairAssetClass,
        });
        console.log(
          `[B68.4][freshness] pair=${rawSignal.symbol} age_hours=${freshness.ageHours.toFixed(2)} factor=${freshness.factor.toFixed(4)}`,
        );
      } else {
        console.warn('[B68.4][orchestrator] regime age config null at ablation hook — cold-start race');
      }

      // ── B67.4 outcome feedback ────────────────────────────────────────
      if (outcomeFeedbackConfig !== null) {
        // B79.0n.CONFIDENCE-CHAIN: per-class store key isolation.
        // ITEM-4 step 2 (D9): SOURCE-MATCHED read — this per-mode engine
        // instance reads ITS OWN partition (Gate-2 decision; no pooling).
        const entry = outcomeFeedbackStore.peek(tradingModeToRunMode(this.mode), _pairAssetClass, regimeLabel, strategyKey);
        const outcome = computeOutcomeFeedbackFactor(entry, outcomeFeedbackConfig, _pairAssetClass);
        modulatedConfChain *= outcome.factor;
        alternateInputs.push({
          kind: 'b67_4',
          result: outcome,
          context: { regime: regimeLabel, strategy: strategyKey, entry },
          assetClass: _pairAssetClass,
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
            const result = computeVolumeRegime(ohlc, volumeRegimeConfig, _pairAssetClass);
            modulatedConfChain *= result.factor;
            alternateInputs.push({ kind: 'b68_2', result, config: volumeRegimeConfig, assetClass: _pairAssetClass });
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
      const pairCorrelationConfig = mce.getPairCorrelationConfigForClass(_pairAssetClass) ?? mce.getCurrentPairCorrelationConfig();
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
              _pairAssetClass,
            );
            modulatedConfChain *= result.factor;
            alternateInputs.push({ kind: 'b68_3', result, config: pairCorrelationConfig, assetClass: _pairAssetClass });
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
              // B79.0n.CONFIDENCE-CHAIN: reuse captured _pairAssetClass instead
              // of re-resolving (avoids redundant resolveAssetClass call).
              _pairAssetClass,
            );
            modulatedConfChain *= result.factor;
            alternateInputs.push({ kind: 'b68_1', result, config: multiTfConfig, assetClass: _pairAssetClass });
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
            // B79.0n.CONFIDENCE-CHAIN: reuse captured _pairAssetClass for the b68_5
            // label-counterfactual re-classification.
            assetClass: _pairAssetClass,
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
      } // end else-branch (_pairAssetClass !== null) for B79.0n.CONFIDENCE-CHAIN
    }

    // ── B76 PASS 2: dispatch stashed inputs with chain-final reference ──
    // chainFinalConfidence is the post-clamp value above; ablation alternates
    // built from it satisfy `alt.conf = chainFinal / factor` for divide-out
    // factors (or label-counterfactual semantics for B68.5).
    const chainFinalConfidence = modulatedConfChain;
    // P19-B3b: regime LABEL from the cached MCE context (symbolCtx is block-scoped above,
    // so re-read the cache here). extendedMetrics has no `regime` field — the prior read
    // was always undefined (masked by ?? 'UNKNOWN'). getCachedContext is the read-only
    // accessor for the (symbol, assetClass) context the upstream cycle already computed.
    const regimeLabelForEmit =
      getMarketContextEngine()
        .getCachedContext(rawSignal.symbol, sizingContext.assetClass)
        ?.regime.regime ?? 'UNKNOWN';
    const ablationAlternates = buildAllAlternates(
      alternateInputs,
      chainFinalConfidence,
      regimeLabelForEmit,
    );

    // BATCH_82 (2026-05-14): resolve assetClass via resolveAssetClass (already
    // statically imported at top of file; same pattern used at line 990 below).
    // REQUIRED parameter — no default, no silent fallback. Compile fails if missed.
    const assetClassForAblation = sizingContext.assetClass;
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
      assetClassForAblation, // BATCH_82
      strategyId, // B67.0.1 (2026-04-30): natural-key join in replay-ablation per Langston #864
    );

    // B70 Step 3.6: signal-eval archive — admitted row alongside active-signal
    // ablation emit. ITEM-4 step 2 (2026-06-10): the mode tag is this
    // instance's OWN carried mode (tradingModeToRunMode(this.mode)) — the
    // write-time getCurrentMode() lookup is gone. Fire-and-forget, try/catch.
    try {
      const { archiveSignalEval } = await import('./data-archive/signal-eval-archiver.js');
      // P19-B6.5e (#327): removed the dead dynamic `resolveAssetClass` import — this
      // archive block writes the carried `sizingContext.assetClass` (below), never re-resolves.
      archiveSignalEval({
        mode: tradingModeToRunMode(this.mode), // ITEM-4 step 2 (D1): this instance's OWN mode — not the global
        symbol: rawSignal.symbol,
        exchange: 'kraken',
        assetClass: sizingContext.assetClass,
        source: 'signal-orchestrator',
        strategy: strategyId,
        // P19-B3b: reuse the regime label resolved from the cached MCE context above
        // (extendedMetrics has no `regime` field — prior read was always undefined).
        regimeLabel: regimeLabelForEmit,
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

    // reorg-B2 (Piece A): central target-floor lift + universal RR gate (per-class) — the ACTIVE
    // convergence point (SINGLE, post-strategy, pre-geometry/sizing — covers every active emit path
    // that goes through sizing). The VTS path applies the SAME normalizer in vts-runner. DROP (never
    // co-move the structural stop) when RR < minRR (Langston Step-2). Also replaces the old
    // `?? entry×1.015` V4 fallback literal — a target-less signal is now DROPPED, not fabricated.
    const _b2Gate = getPerClassTargetGate(sizingContext.assetClass, strategyId);
    // reorg-B2 (Piece C): ATR from the universal carrier (set once per pipe), marketContext as override.
    const _b2Atr = marketContext?.atr ?? sizingContext.atr;
    const _b2 = normalizeAndGateTarget({
      entryPrice: rawSignal.entryPrice, stopPrice: rawSignal.stopPrice, targetPrice: rawSignal.targetPrice ?? NaN,
      floorPct: _b2Gate.floorPct, minRR: _b2Gate.minRR,
      atr: _b2Atr ?? NaN, reachAtrMax: _b2Gate.reachAtrMax,
    });
    if (!_b2.ok) {
      if (_b2.reason === 'invalid_atr') {
        // LOUD: a wiring/data bug (ATR absent on both the SizingContext carrier AND marketContext),
        // NEVER silently masked as a feasibility drop (Langston Step-4).
        console.error(`[reorg-B2][TARGET_GATE][active][INVALID_ATR] ${rawSignal.symbol}/${strategyId} — ATR unavailable on the active build path (sizingContext.atr + marketContext both missing). Wiring bug — investigate.`);
      } else {
        console.warn(`[reorg-B2][TARGET_GATE][active] drop ${rawSignal.symbol}/${strategyId}: ${_b2.reason} rr=${_b2.rr.toFixed(2)} atrs=${_b2.atrsToTarget.toFixed(2)}`);
      }
      // P19-B8.4b: POST-SQE reject (the reorg-B2 target gate sits after the :764 SQE) — recorded by the
      // specific reason (invalid_geometry / rr_below_min / invalid_atr / unreachable) so the drop is honest.
      if (_fClass) recordActivePostSqeReject(sizingContext.mode, _fClass, _b2.reason ?? 'target_gate_unknown');
      return null;
    }
    const _b2Target = _b2.targetPrice;

    // Directive 11.3A: Compute net geometry with cost-aware adjustments
    // B79.0n.MCE: assetClass REQUIRED — resolved from the signal symbol.
    const costMetrics = getCachedCostMetrics(rawSignal.symbol, sizingContext.assetClass);
    const netGeometry = computeNetGeometry(
      rawSignal.entryPrice,
      rawSignal.stopPrice,
      _b2Target,
      costMetrics
    );
    const totalCost = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
    
    console.log(`[11.3A][NET_GEOMETRY] ${rawSignal.symbol}/${strategyId}: netEdge=${(netGeometry.netExpectedEdge * 100).toFixed(3)}%, netRR=${netGeometry.netRewardToRisk.toFixed(2)}, totalCost=${(totalCost * 100).toFixed(3)}%`);

    // Directive 11.0E: Build sized signal with FinalScore-native metrics
    const sizedSignal: SizedStrategySignal = {
      ...rawSignal,
      targetPrice: _b2Target,   // reorg-B2 (Piece A): the floored/gated target flows downstream.
      quantity: sizingResult.quantity,
      estimatedValue: sizingResult.estimatedValue,
      preComputedNotional: sizingResult.estimatedValue,
      signalId,
      // Directive 11.0E: Confidence is the primary quality metric
      // B-NEW-43 chunk 3 (2026-05-22): source from extendedMetrics — mirrors the
      // sqeSignalInput builder above (~lines 653-656). The bare confidence/
      // signalFinalScore/regimeWeight/hybridScore locals were removed in the
      // extendedMetrics consolidation; these references were left dangling (TS2304).
      confidence: extendedMetrics.confidence,
      finalScore: extendedMetrics.finalScore,
      regimeWeight: extendedMetrics.regimeWeight,
      hybridScore: (rawSignal as any).hybridScore ?? extendedMetrics.confidence,
      volatility: extendedMetrics.volatility,
      // Directive 11.3A: Net expectancy fields
      netExpectedEdge: netGeometry.netExpectedEdge,
      netRewardToRisk: netGeometry.netRewardToRisk,
      totalRoundTripCost: totalCost,
    };

    console.log(`[11.0E][SIZED_SIGNAL] ${rawSignal.symbol}/${strategyId}: qty=${sizingResult.quantity.toFixed(8)}, value=$${sizingResult.estimatedValue.toFixed(2)}, FinalScore=${extendedMetrics.finalScore.toFixed(4)}`);

    // Directive 11.0E: Capture pricing and risk metrics for learning dataset (FinalScore-native)
    // Directive 11.3A: Enhanced with net expectancy metrics
    dataAggregator.capture('PRICE_CALC', {
      symbol: rawSignal.symbol,
      strategy: strategyId,
      entry: rawSignal.entryPrice,
      exit: rawSignal.targetPrice,
      stop: rawSignal.stopPrice,
      spread: costMetrics.spread,
      finalScore: extendedMetrics.finalScore, // Directive 11.0E: PRIMARY metric
      confidence: extendedMetrics.confidence,
      regimeWeight: extendedMetrics.regimeWeight,
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

      // P19-B3b: getScreenerFilters REQUIRES assetClass (B79.0n.STORAGE). This
      // orchestrator is the crypto active-trading path — crypto_spot by construction
      // (DEFAULT_ASSET_CLASS), matching the literal 'crypto_spot' usages in the pattern
      // loops below. No silent fallback.
      const filters = await storage.getScreenerFilters({ mode: this.mode, assetClass: DEFAULT_ASSET_CLASS });
      if (!filters) {
        console.error(`[37.A][SIGNAL] No filters found for mode ${this.mode}`);
        telemetryTrace.trace('SignalOrchestrator', 'NO_FILTERS', 'ERROR', { mode: this.mode });
        return;
      }

      // Batch 19G VN HF: Load active_quant VN threshold from DB for EXTREME_NOISE veto
      const activeQuantFilters = await storage.getScreenerFilters({ mode: this.mode, assetClass: DEFAULT_ASSET_CLASS, filterPath: 'active_quant' });
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
        // P19-B4a stamp-at-source: this is the CRYPTO pipe — evaluateMarket iterates the
        // FX5 crypto survivor pool — so the class is crypto_spot by construction. One
        // SizingContext = one class = one pipe (see SizingContext def). The xStock dispatch
        // (C2) builds its own SizingContext stamped 'xstock_spot'.
        assetClass: 'crypto_spot',
      };

      console.log(`[B6][CONTEXT] portfolioValue=$${portfolioValue.toFixed(2)}, guardrails=${guardrails ? 'loaded' : 'null'}`);

      let symbolsEvaluated = 0;
      let strategiesRun = 0;
      let signalsGenerated = 0;
      let signalsForwarded = 0;

      for (const symbol of eligibleSymbols) {
        try {
          // P19-B4a C5: log-only — the disposed enabledStrategies Set is replaced by the
          // canonical strategy universe for this banner. Actual per-symbol selection is
          // regime-driven (evaluateSymbol) and per-class enablement is DB-resolved.
          const selectedStrategies = Object.keys(STRATEGY_DISPLAY_NAMES);
          console.log("[8.8.3-B][SELECTION]", JSON.stringify({
            symbol,
            regime: null,
            selectedStrategies: "ALL_STRATEGIES",
            skippedStrategies: [],
            enabledCount: selectedStrategies.length
          }));

          const signals = await this.evaluateSymbol(symbol, settings, filters, sizingContext, fx5Survivors, symbolFamilies, STRATEGY_FAMILY_MAP, HYBRID_FAMILY_ELIGIBILITY, vnMaxVeto);
          symbolsEvaluated++;
          // P19-B4a C5: stat counter — the disposed enabledStrategies.size is replaced by
          // the canonical strategy-universe count (activeStrategies is local to
          // evaluateSymbol and not in scope here; this is the faithful stand-in for the
          // former fixed per-symbol count).
          strategiesRun += Object.keys(STRATEGY_DISPLAY_NAMES).length;
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
            const compatiblePatterns = hybridConfluenceBuffer.findCompatiblePatterns(signal.symbol, tradingModeToRunMode(this.mode));
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
          // P19-B3b: getOHLCData returns { ohlc, last } — destructure the candle array
          // (was treated as an array directly, breaking .length/index/.map/computeContext).
          // Mirrors the destructure at the per-symbol scan path below (~line 1508).
          const { ohlc: ohlcData } = await ohlcCache.getOHLCData(symbol, 60);
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
          // P19-B3b: computeContext requires OHLCData[] (number fields + timestamp), but
          // the cache yields OHLCCandle[] (string fields + time). Convert first — same
          // shape as `candles` below and the ohlcForRegime conversion at the scan path.
          const ohlcForContext: OHLCData[] = ohlcData.map(d => ({
            open: parseFloat(d.open),
            high: parseFloat(d.high),
            low: parseFloat(d.low),
            close: parseFloat(d.close),
            volume: parseFloat(d.volume || '0'),
            timestamp: d.time * 1000,
          }));
          // P19-B6.5d: use the carried crypto-pipe stamp (sizingContext.assetClass =
          // 'crypto_spot' by construction in evaluateMarket) — never re-derive downstream.
          const context = mce.computeContext(symbol, ohlcForContext, currentPrice, volume24h, undefined, propagatedDbs, sizingContext.assetClass);

          // Pattern recognition
          const candles = ohlcData.map(d => ({
            open: parseFloat(d.open),
            high: parseFloat(d.high),
            low: parseFloat(d.low),
            close: parseFloat(d.close),
            volume: parseFloat(d.volume || '0'),
            timestamp: d.time * 1000,
          }));

          // B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` threaded
          // through scanPatterns + patternToTradeSignal. Signal-orchestrator is
          // the crypto active-trading path — class is crypto_spot by construction.
          const patternSignals = getPatternRecognizer().scanPatterns(candles, symbol, 'crypto_spot');
          const buyPatterns = patternSignals.filter(p => p.direction === 'BUY');

          for (const patternSig of buyPatterns) {
            const atr = context.indicators?.atr ?? (currentPrice * 0.02);

            // P19-B6.5c: patterns are TRIGGERS, not strategies. Resolve the detected
            // pattern to the CANONICAL strategy that consumes it in THIS regime
            // (crypto_spot), EXACT-MATCH only — no fallback to a non-consuming strategy
            // (Langston D3: never map-to-nearest; that pollutes the wrong strategy's Net
            // Expectancy). No consuming strategy in this regime → DROP (counted via
            // resolvePatternConsumingStrategy's per-(pattern,regime,class) tally, not
            // silent); the quant-path dispatch independently evaluates the regime's quant
            // strategies, so nothing actionable is lost. This replaces the old `pattern_*`
            // fabrication that the rtb_signals enum rejected on every row (B6.5b dry-run).
            const patternRegime = normalizeRegime((context as any).regime?.regime ?? '');
            const consuming = resolvePatternConsumingStrategy(patternRegime, patternSig.pattern, 'crypto_spot');
            if (!consuming) {
              continue;
            }

            const tradeSignal = getPatternRecognizer().patternToTradeSignal(patternSig, currentPrice, atr, 'crypto_spot');

            const rawSignal: StrategySignal = {
              symbol,
              // Verified-canonical strategy key (one of the 19) — a benign string→union
              // narrowing, NOT the old invalid `pattern_*` bridge.
              strategy: consuming.strategy as StrategySignal['strategy'],
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

            // P19-B8.10 (OBJ-4): re-stamp the display-context carriers from THIS
            // pattern's own context — the shared sizingContext still holds the last
            // quant symbol's values (stale cross-symbol leak otherwise). The pattern
            // pass's honest sources: its own MCE context regime + the propagated
            // pool DBS (the #530 restore).
            sizingContext.regime = patternRegime || undefined;
            sizingContext.pairDbsCategory = propagatedDbs?.category ?? undefined;
            sizingContext.pairDbsScore = propagatedDbs?.score ?? undefined;
            // P19-B8.5l (#581): re-stamp atr per pattern-symbol too. The sibling regime/DBS
            // re-stamps above fixed the documented "stale cross-symbol leak" (see the comment
            // block above them) but MISSED atr — so pattern signals read the LAST QUANT
            // SYMBOL's sizingContext.atr (stamped at :2165 during the earlier eligibleSymbols
            // pass, which runs before this pattern pass). That fed a wrong shared atr into the
            // :1548 reachability gate (3-arg pattern callers) live, and into the B8.5k carry.
            // ★ Re-stamp the RAW `context.indicators?.atr` (undefined-preserving) — NOT the
            // `:1905` local `atr`, which carries a synthetic `?? (currentPrice*0.02)` fallback;
            // re-stamping the fallback would feed a fabricated ATR into the gate's `invalid_atr`
            // LOUD branch and let patterns silently pass a gate the quant path loudly rejects
            // (quant stamps raw `mceContext.indicators.atr` at :2165, no fallback — gate parity).
            sizingContext.atr = context.indicators?.atr;

            const sizedSignal = await this.buildSizedSignalForStrategy(
              rawSignal, consuming.strategy as StrategyType, sizingContext
            );

            if (sizedSignal) {
              (sizedSignal as any).signalType = 'PATTERN';
              (sizedSignal as any).sourcePool = 'pattern';
              patternSignalsGenerated++;

              // Batch 19F: Store pattern signal in hybrid confluence buffer
              hybridConfluenceBuffer.addPatternSignal({
        sourceMode: tradingModeToRunMode(this.mode), // ITEM-4 step 2 (D1b): own namespace
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
      // P19-B6.5c: surface the exact-match no-match DROP counter (Langston D3/D4 obs gate — "no silent caps").
      // Cumulative per (pattern|regime|class); a high/rising drop count vs signals-generated is the tell that
      // pattern coverage went dark (e.g. a regime-field misread routing everything to a no-consumer regime).
      console.log(`[14.5][ORCHESTRATOR] Pattern pool complete: ${patternSignalsGenerated} signal(s) generated from ${patternSymbols.length} pair(s) | [P19-B6.5c][PATTERN_NOMATCH_DROPS] ${JSON.stringify(getPatternNoMatchDropStats())}`);

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
    // B-NEW-43 chunk 3 (2026-05-22): these 4 were free variables left dangling when
    // evaluateSymbol was extracted out of evaluateMarket (TS2304). They are computed
    // in evaluateMarket — thread them through as parameters to complete the extraction.
    fx5Survivors: ReturnType<typeof activeFilterPool.getActivePool>,
    symbolFamilies: Map<string, Set<string>>,
    STRATEGY_FAMILY_MAP: Record<string, string>,
    HYBRID_FAMILY_ELIGIBILITY: Record<string, string[]>,
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
      // B79.0n.MCE: assetClass is REQUIRED by computeContext + the dispatch block.
      // B79.0n.STRATEGY (2026-05-24): captured into a local for reuse across the
      // 18-strategy dispatch + the ORB gate + the NetEV filter below.
      // P19-B6.5d: read the CARRIED crypto-pipe stamp (sizingContext.assetClass =
      // 'crypto_spot' by construction in evaluateMarket) — do NOT re-derive from the
      // symbol string (carry-the-stamp invariant; removes the throwing re-derive).
      const assetClass = sizingContext.assetClass;
      const mceContext = mce.computeContext(symbol, ohlcForRegime, currentPrice, currentVolume, settings.smaLength || 20, orchestratorDbs, assetClass);

      console.log(`[Phase13][MCE] ${symbol}: regime=${mceContext.regime.regime}, weight=${mceContext.regime.regimeWeight.toFixed(2)}, trendSlope=${trendSlope.toFixed(4)}, volNoise=${VolNoise.toFixed(4)}`);

      // Phase 13: Strategy filtering from MCE regime (replaces DSS getRegimeAllowedStrategies)
      // P19-B4a C5: the hardcoded enabledStrategies allowlist was disposed — the regime map
      // IS the per-symbol selector, and the DB-resolved per-asset-class gate at the
      // buildSizedSignalForStrategy chokepoint is now the per-class authority. So the
      // regime allowlist is taken directly (no intersection with a static enabled set).
      const regimeStrategies = new Set(mceContext.regime.allowedStrategies);
      const activeStrategies = new Set(regimeStrategies);

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
        // P19-B8.4b: active-path funnel — the family filter drops STRATEGIES the pair's family tags exclude,
        // BEFORE any signal is built for them. This is UPSTREAM of the signalsGenerated denominator, so it is
        // recorded in the dedicated `strategyAttrition` bucket (NOT preSqeRejects — mixing it in would let the
        // pre-SQE stage exceed the denominator and read as a broken funnel, Langston B8.4b). This is the
        // crypto pipe (evaluateSymbol) — xStock's external-dispatch pipe has no family-filter stage. Emit
        // BEFORE the clear() below (activeStrategies still holds the pre-filter set here). Dormant until
        // paper-active.
        const _famClass: FunnelAssetClass | undefined =
          (sizingContext.assetClass === 'crypto_spot' || sizingContext.assetClass === 'xstock_spot')
            ? sizingContext.assetClass : undefined;
        if (_famClass) {
          for (const strat of activeStrategies) {
            if (!familyFilteredStrategies.has(strat)) recordActiveStrategyAttrition(sizingContext.mode, _famClass, strat);
          }
        }
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

      // reorg-B2 (Piece C): stamp the canonical per-pipe ATR onto the SizingContext ONCE here —
      // after the MCE context computes, before the strategy-dispatch loop — so every
      // buildSizedSignalForStrategy call reads it off the universal carrier (the 3-arg callers never
      // pass marketContext). Robust single-point feed, not 20 fragile call-site threads.
      sizingContext.atr = mceContext.indicators.atr;
      // P19-B8.10 (OBJ-4): the display-context carriers ride the same single-point
      // stamp — this symbol's MCE regime + pair DBS (the same mceContext values the
      // VTS captures at open). Re-stamped per symbol; undefined when the MCE has no
      // value (absent stays absent).
      sizingContext.regime = mceContext.regime?.regime ?? undefined;
      sizingContext.pairDbsCategory = orchestratorDbs?.category ?? undefined;
      sizingContext.pairDbsScore = orchestratorDbs?.score ?? undefined;

      // Directive 10.1: Only run strategies allowed for current regime
      if (activeStrategies.has('vwap_pullback')) {
        const rawSignal = this.strategyEngine.detectVWAPPullback(indicators, settings, ohlcAsAny, assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'vwap_pullback', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('abcd_long')) {
        const rawSignal = this.strategyEngine.detectABCDLong(ohlcAsAny, settings, assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'abcd_long', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('sma_trend_ride')) {
        const rawSignal = this.strategyEngine.detectSMATrendRide(indicators, ohlcAsAny, settings, assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'sma_trend_ride', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('breakout')) {
        // B72.2: detector reads params from module_constants 'strategy.breakout'.
        const rawSignal = this.strategyEngine.detectBreakout(ohlcAsAny, {}, assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'breakout', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('mean_reversion')) {
        // B72.2: detector reads params from module_constants 'strategy.mean_reversion'.
        const rawSignal = this.strategyEngine.detectMeanReversion(indicators, ohlcAsAny, {}, assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'mean_reversion', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('range_trading')) {
        // B72.2: detector reads params from module_constants 'strategy.range_trade'.
        const rawSignal = this.strategyEngine.detectRangeTrading(ohlcAsAny, {}, assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'range_trading', sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('vwap_bounce')) {
        // B72.2: detector reads params from module_constants 'strategy.vwap_bounce'.
        const rawSignal = this.strategyEngine.detectVWAPBounce(indicators, ohlcAsAny, {}, assetClass);
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
        const rawSignal = this.strategyEngine.detectDHMA(indicators, ohlcAsAny, {}, assetClass);
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
      
      // B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` threaded
      // through scanPatterns (crypto_spot by construction — orchestrator path).
      let patternSignals = patternRecognizer.scanPatterns(candles, symbol, 'crypto_spot');

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
          
          // B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` on the
          // multi-timeframe cascade fan-out (crypto_spot — orchestrator path).
          const globalPatterns = globalPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol, 'crypto_spot'));
          const tacticalPatterns = tacticalPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol, 'crypto_spot'));
          const precisionPatterns = precisionPairs.flatMap(r => patternRecognizer.scanPatterns(r.candles, r.symbol, 'crypto_spot'));
          
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
        const rawSignal = this.strategyEngine.detectMorningStar(indicators, ohlcAsAny, buildPatternInputForStrategy('morning_star'), assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'morning_star' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('inside_bar_reversal')) {
        const rawSignal = this.strategyEngine.detectInsideBarReversal(indicators, ohlcAsAny, buildPatternInputForStrategy('inside_bar_reversal'), assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'inside_bar_reversal' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('support_bounce')) {
        const rawSignal = this.strategyEngine.detectSupportBounce(indicators, ohlcAsAny, buildPatternInputForStrategy('support_bounce'), assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'support_bounce' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('pivot_shift')) {
        const rawSignal = this.strategyEngine.detectPivotShift(indicators, ohlcAsAny, buildPatternInputForStrategy('pivot_shift'), assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'pivot_shift' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('reverse_impulse')) {
        const rawSignal = this.strategyEngine.detectReverseImpulse(indicators, ohlcAsAny, buildPatternInputForStrategy('reverse_impulse'), assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'reverse_impulse' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('defensive_hedge')) {
        // Defensive hedge requires BTC candle data for correlation calculation
        // TODO: Pass BTC OHLC from pricing service cache when available
        const rawSignal = this.strategyEngine.detectDefensiveHedge(indicators, ohlcAsAny, buildPatternInputForStrategy('defensive_hedge'), undefined, assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'defensive_hedge' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('adaptive_flow')) {
        const rawSignal = this.strategyEngine.detectAdaptiveFlow(indicators, ohlcAsAny, buildPatternInputForStrategy('adaptive_flow'), assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'adaptive_flow' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      if (activeStrategies.has('volatility_edge')) {
        const rawSignal = this.strategyEngine.detectVolatilityEdge(indicators, ohlcAsAny, buildPatternInputForStrategy('volatility_edge'), assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'volatility_edge' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      // B63: Strong Bull Trend (Path D) — QUANT, LONG-only, evaluates only on quant-strong_trend sourcePool pairs.
      // Strategy's internal DBS guard provides belt-and-braces if routing leaks.
      if (activeStrategies.has('strong_bull_trend')) {
        const rawSignal = this.strategyEngine.detectStrongBullTrend(indicators, ohlcAsAny, buildPatternInputForStrategy('strong_bull_trend'), assetClass);
        if (rawSignal) {
          rawSignal.symbol = symbol;
          const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'strong_bull_trend' as any, sizingContext);
          if (sizedSignal) signals.push(sizedSignal);
        }
      }

      // B79.0d: ORB (Opening Range Breakout) — xstock_spot only.
      // Dispatch-layer guard (Q6 triple-defense layer 2): only call detect when
      // the resolved asset class is xstock_spot. Detect's own guards then
      // enforce 24/7-symbol exclusion + DB gate. SQE whitelist (layer 3) ensures
      // any signal that does fire is kept off crypto_spot at the filter layer.
      if (activeStrategies.has('orb')) {
        const orbAssetClass = assetClass; // P19-B6.5d: reuse the carried stamp (was a throwing re-derive)
        if (orbAssetClass === 'xstock_spot') {
          const rawSignal = this.strategyEngine.detectORB(
            symbol,
            ohlcAsAny,
            indicators,
            { assetClass: orbAssetClass, symbol },
          );
          if (rawSignal) {
            rawSignal.symbol = symbol;
            const sizedSignal = await this.buildSizedSignalForStrategy(rawSignal, 'orb' as any, sizingContext);
            if (sizedSignal) signals.push(sizedSignal);
          }
        }
      }

      console.log(`[12.3.2][EVAL] ${symbol}: ${signals.length} signals from ${activeStrategies.size} strategies (pattern=${bestPattern?.pattern ?? 'none'})`);

      // P19-B6.5c: REMOVED the redundant pattern double-emission loop (rule 18).
      // It re-emitted a raw signal for every detected pattern, labeled with the invalid
      // `pattern_*` strategy (rejected by the rtb_signals strategy_type enum) and sized
      // under a hardcoded 'breakout' — incoherent. It was redundant: the activeStrategies
      // dispatch above already evaluates EVERY pattern-consuming strategy (morning_star,
      // inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge,
      // adaptive_flow, volatility_edge) via detect*() fed the matching pattern by
      // buildPatternInputForStrategy (B57 per-strategy routing); the pattern-pool path
      // emits canonically (B6.5c site-1 fix). Removing it ends the double-count.
      // See DELETED_COMPONENTS_LOG.md (P19-B6.5c).

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

          // B79.0n.MCE: assetClass REQUIRED. P19-B6.5d: reuse the carried stamp captured
          // above (closure) — do NOT re-derive inside the filter callback.
          const costMetrics = getCachedCostMetrics(symbol, assetClass);
          const frictionPct = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
          const frictionPerUnit = frictionPct * entry;
          // reorg-B3 (#233, OBJ-5) DI-provenance note: this inline [HF9] NetEV pre-filter recomputes
          // DI from closePrices at EVALUATE time (a fresh value for the pre-filter, on the live VTS
          // path). The OPEN-GATE (active-execution-engine) instead reads the AT-QUEUE DI snapshot from
          // the rtb_signals.di_at_queue column (the routing-time survivor value). These two DI moments
          // are intentionally distinct: reorg-B3 deliberately does NOT unify them here — changing this
          // recompute would alter a live VTS-path filter's DI freshness, which is out of #233's scope
          // (and DI is accuracy-only per H1 — no EV consequence). dbsScore is the EV-decisive thread.
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
  // B-4.7 (#163): ZERO callers (active path reads mceContext.regime.allowedStrategies
  // since Phase 13) — Phase-16 legacy register candidate (RUNNING_ISSUES #218 family).
  // Signature made class-aware so the dead path can't silently misread if revived.
  private getRegimeAllowedStrategies(assetClass: 'crypto_spot' | 'xstock_spot', regime: string): Set<string> {
    const mapping = REGIME_STRATEGY_MAP[assetClass][regime as MarketRegimeType];
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
