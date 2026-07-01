/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 11.0E.1 (Upgraded from 8.8.4-M5C)
 * ══════════════════════════════════════════════════════════════════════════════
 * VTS Runner - Autonomous Virtual Trading Simulator (Phase 10 Modernized)
 * 
 * Purpose: Runs autonomous virtual trade simulation independent of live trading.
 * Sources data from Ideal Pool and calculates pair-level market regimes.
 * 
 * Directive 11.0E.1 Features:
 * - Phase-10 canonical math (finalScore, hybridScore, regimeWeight, decayPenalty)
 * - Per-pair regime calculation (TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, etc.)
 * - Regime → Strategy mapping with signalType selection
 * - 100-pair Ideal Pool integration
 * - ITEM-4 O1 (2026-06-09): standalone always-on — runs INDEPENDENT of
 *   tradingActive (the automatic-stop coupling was removed; lifecycle is
 *   VTS's own start/stop only, with re-entrancy/overlap/containment guards)
 * - Generates virtual trades for Telemetry + Predictive Learning
 * 
 * Legacy Features (Preserved):
 * - Autonomous signal generation when passiveLearning=true
 * - 60-second simulation loop
 * - Trade recording to /data/vts_trades_<timestamp>.json
 * 
 * Schema: v1.6.6
 * Governance: M45, M46, M47, M48, M49
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { vtsService, type VirtualSignal } from './vts-service.js';
import { asValidAssetClass, resolveAssetClass, safeResolveAssetClass, type AssetClass } from '../../shared/asset-classes.js';
import { recordSyncSpan, syncSpanStart } from './scan-stall-instrument.js';
import { ScanYielder } from './scan-yield.js';
// B72 (2026-05-05): VTS runner caps + cooldowns from module='vts_runner'.
import { getCachedNumberRequired } from './module-constants-service.js';
// Directive 11.8B-A2: Import canonical Net EV kernel for VTS profitability decisions
import { computeNetExpectancyKernel } from '../core/calculations/net-expectancy-kernel.js';
// Note: isSignalProfitable is retained as a regime-aware ROI pre-filter (not EV math)
import { isSignalProfitable, getROIDetails, getDynamicROIThreshold, getPerClassTargetGate } from '../core/calculations/expectancy.js';
// reorg-B2 (Piece A): shared central target-floor normalizer (applied at the VTS convergence point).
import { normalizeAndGateTarget } from '../core/calculations/signal-target-normalizer.js';
import { getPredictiveConfidence } from '../core/utils/score-calculator.js';
import { logSkippedSignal } from '../core/logging/skipped-signals-logger.js';
import { loadCalibration, applyCalibration, type CalibrationCoefficients } from '../utils/calibration.js';
import { priceCache, type CachedPrice, type CacheBucketType } from './price-cache.js';
// B65.2: centralized exit-decision primitive (stale / timeout / stop / target / trailing)
import { evaluateTECExit } from './tec-evaluator.js';
// B65.2-HF2 (2026-04-23): ML dashboard needs trailing-engine state for VTS
// open trades (tradeMode, latch flags, ratcheted stop).
import { getTrailingState as getTECState } from './trailing-exit-controller.js';
import { systemConfigService } from './system-config.js';
import { activeFilterPool } from './active-filter-pool.js';
// Batch 19C import removed by 19G HF1 Item 4: PATTERN_POOL_STRATEGIES no longer used
// Pattern pool pairs now use scanPatterns() detection to drive strategy selection (mirrors active trading path)
// Batch 19G: Hybrid confluence buffer for VTS — same mechanism as signal-orchestrator
import { hybridConfluenceBuffer, type BufferedPatternSignal } from './hybrid-confluence-buffer.js';
// Batch 19G Fix 5: Shared hybrid compatibility registry (single source of truth)
import { findHybridMatch as findVTSHybridMatch } from '../config/hybrid-compatibility-registry.js';
import { getTelemetryAggregator } from './telemetry-aggregator.js';
import { fx5Scanner, type ScanBatchPair } from './fx5-scanner.js';
import { KrakenService } from '../exchanges/kraken/kraken.js';
// Batch 18: OHLC cache (5-min TTL) eliminates redundant per-symbol OHLC fetches
import { ohlcCache } from './ohlc-cache.js';
import { computeStrategyWeights, getWeightSync } from '../utils/strategyWeights.js';
import { computeExposureBias, getExposureMultiplierSync } from '../utils/strategyBias.js';
import { getCachedCostMetrics, computeNetGeometry, getFrictionForAssetClass } from '../core/math/cost-model.js';
// P19-B7.2b (OBJ-A): the SHARED maker/taker best-of-both entry decision (same pure
// function the active path calls — F6) + its per-class DB-governed haircut resolver.
// The VTS calls it before its Net-EV gate so VTS evaluates on best-of-both too.
import { decideMakerTaker, entryUrgencyClassForFamily } from '../core/math/maker-taker-decision.js';
import { resolveMakerTakerHaircut } from './maker-taker-config.js';
import { compareLatestSessions, savePaperSessionTrades, getPaperSessionTrades } from './vts-live-comparison-audit.js';
import { SCORE_WEIGHTS } from '../config/score-weights.config.js';
import { calculatePairRegime, getRegimeWeight, calculateRegimeScore, getNormalizedRegimeWithDetails } from '../core/metrics/market-regime.js';
// Phase 13: Market Context Engine for centralized indicator + regime computation
import { getMarketContextEngine } from './market-context-engine.js';
// Phase 14 HF6: StrategyEngine for strategy-specific detect functions
import { StrategyEngine, type StrategySignal, stampMaxHoldingMs } from './strategy-engine.js';
import type { PatternInput, GateDisposition } from '../strategies/strategy-helpers.js';
// Phase 14 HF6: Global friction/DBS getters for trade context dimensions
import { getGlobalFriction, getLastGlobalDBSCategory, getLastGlobalDBSScore } from './market-indicators.js';
// Phase 14: Real score calculator replaces simulation stubs
import { computeRealHybridScore, computeRealDecayPenalty } from '../core/utils/vts-real-score.js';
// Phase 15b B61: DBS telemetry emitter (observational, feature-flagged, no behavior change)
import { emitConsumerTelemetry } from './phase15b-dbs-telemetry.js';
import {
  CANONICAL_REGIME_STRATEGY_MAP as REGIME_STRATEGY_MAP,
  REGIMES,
  selectContextAwareStrategy,
  symbolToHash,
  getRegimeRiskMultiplier,
  getStrategiesForRegime,
  normalizeStrategy,
  normalizePatternToCanonical,
  STRATEGY_FAMILY_MAP,
  type CanonicalRegimeType as MarketRegimeType,
  type CanonicalSignalType,
  type CanonicalPatternType,
  type StrategyDefinition
} from '../config/canonical-regime-strategy-map.js';
import type { OHLCData } from '../types/market-regime.types';
import type { VTSCycleMetrics } from '../types/virtual-trade.interface';
import { scanPatterns } from './pattern-recognizer.js';
import type { PatternType } from '../types';
import { normalizeToInternalSymbol, getSymbolMappingDetails } from '../markets/kraken-symbol-resolver.js';
// HF9: applyGovernance removed (dead import — governance gate moved to SQE)
import { isStrategyEligible, logGovernanceBlock, getPreScoreExclusionStats } from '../core/governance/strategy-eligibility.js';
import { getStrategyDependency, type RegimeStability } from '../config/strategy-governance.js';
import { computeGlobalStability } from '../core/governance/regime-stability.js';
import { computeRankingScore, normalizeNetReturn } from '../config/ranking-weights.js';
// B-NEW-20 (2026-05-13): db + sql for xstock exit-side price-fetch from
// xstock_spot_ticker_snap. Without these imports, the B79.0m.b2 xstock leg
// of resolveOpenVirtualTrades threw `ReferenceError: db is not defined`
// every minute — silently caught by the try/catch — leaving every xstock
// open trade with currentPrice=null and never able to evaluate target/stop.
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import '../core/governance/governance-persistence.js'; // Batch 46: Auto-persist/rehydrate governance state
import { logSkippedSignal as logGovernanceSkippedSignal } from '../core/logging/skipped-signals-logger.js';
// B67.0 — Factor ablation framework: emit hook for replay-ablation telemetry
import { emitAblationRecord } from './factor-ablation-emitter.js';
// B76 — Two-pass stash-then-build dispatch
import { buildAllAlternates, type FactorAlternateInput } from './factor-ablation-builders.js';
// B67.2 — phase preference application
import { applyPhasePreference, regimePhaseStore } from '../core/metrics/regime-phase.js';
// B67.4 cheap-tier bundle (2026-05-01)
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
import {
  computeMultiTfAgreement,
} from '../core/metrics/multi-tf-agreement.js';
// B67.3 — Per-underlying position cap (VTS-mirror admission gate)
import { checkPerUnderlyingCap, formatDecisionLog, assignCohortHash } from './per-underlying-cap.js';
import { resolveStrategyMode, getModeOverlay, meetsConfidenceFloor, recordModeExecution, type StrategyMode, type StrategyModeOverlay } from '../core/governance/strategy-modes.js';
import fs from 'fs/promises';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

/**
 * P19-B6.5d (OBJ-5 passive rule): VTS/telemetry sites must NEVER silently default an
 * unclassifiable symbol to crypto_spot — a silent mislabel poisons per-class training
 * data. This resolves the class and, on the (pathological) null, LOGS the mislabel +
 * returns crypto_spot so the passive sim/telemetry stays fail-soft but the mislabel is
 * DETECTABLE. (safeResolveAssetClass already bumps the central classify-fall-through
 * counter on null; this adds the per-site visibility OBJ-5 requires.)
 */
function vtsResolveClassOrLoggedDefault(symbol: string): AssetClass {
  const c = safeResolveAssetClass(symbol, 'kraken');
  if (c !== null) return c;
  console.warn(`[P19-B6.5d][VTS] ${symbol} unclassifiable — telemetry labeled crypto_spot (logged passive default, not silent)`);
  return 'crypto_spot';
}

// Phase 14 HF6: Strategy call settings (same defaults as signal orchestrator lines 680-688)
const STRATEGY_CALL_SETTINGS = {
  smaLength: 20,
  riskPerTradePercent: 2.0,
  maxOpenPositions: 5,
  dailyLossLimitPercent: 10.0,
  whitelistedSymbols: [],
  blacklistedSymbols: [],
  allowedTradingPairs: [],
} as any;

async function getSystemConfig() {
  const config = await systemConfigService.getConfig();
  return {
    tradingActive: !(config?.passiveLearning ?? true),
    passiveLearning: config?.passiveLearning ?? true
  };
}

let isInitialized = false;
let calibration: CalibrationCoefficients | null = null;
let autonomousLoopInterval: NodeJS.Timeout | null = null;
let isAutonomousRunning = false;
// ITEM-4 O1 lifecycle guard (2026-06-09): prevents overlapping simulation
// cycles now that the loop runs concurrently with active trading. Skip count
// is the O6 throughput-study in-process starvation signal.
let vtsCycleInFlight = false;
let vtsCycleOverlapSkips = 0;
let sessionStartTime: number | null = null;
let cycleCount = 0;
let patternRecognitionWarmedUp = false;

// Batch 21: VTS evaluation diagnostics — imported from shared types
import type { VTSEvalSnapshot, NullReasonBreakdown } from '../types/virtual-trade.interface.js';
import { setNullReason, resetNullReason, getNullReason } from '../utils/null-reason-tracker.js';
// B-5 AMR (scope delta 6): VTS dials stay PINNED to the legacy stability path
// forever - the AMR contribution to VTS is the at-open weather/mode STAMP
// only. Lazy ref (not static import) to keep the module graph cycle-free.
let _amrWeatherMod: typeof import('./amr-weather-report.js') | null = null;
void import('./amr-weather-report.js').then(m => { _amrWeatherMod = m; }).catch(() => { /* stamp stays null */ });

const VTS_EVAL_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
let vtsEvalHistory: VTSEvalSnapshot[] = [];

// Batch 22 HF7: Disk persistence for VTS eval history
const VTS_EVAL_HISTORY_DIR = path.join(process.cwd(), 'logs', 'vts_eval_history');
const getVtsEvalHistoryPath = () => path.join(VTS_EVAL_HISTORY_DIR, `${new Date().toISOString().slice(0, 10)}.json`);

function hydrateVtsEvalHistory(): void {
  try {
    if (!existsSync(VTS_EVAL_HISTORY_DIR)) {
      mkdirSync(VTS_EVAL_HISTORY_DIR, { recursive: true });
    }
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
    for (const dateStr of [yesterday, today]) {
      const filePath = path.join(VTS_EVAL_HISTORY_DIR, `${dateStr}.json`);
      if (existsSync(filePath)) {
        try {
          const data = JSON.parse(readFileSync(filePath, 'utf-8'));
          if (Array.isArray(data)) {
            for (const entry of data) {
              if (entry.timestamp && entry.timestamp > cutoff) {
                vtsEvalHistory.push(entry);
              }
            }
          }
        } catch (e) {
          console.warn(`[22HF7] Failed to parse ${filePath}:`, e);
        }
      }
    }
    console.log(`[22HF7] Hydrated ${vtsEvalHistory.length} VTS eval snapshots from disk`);
  } catch (e) {
    console.warn('[22HF7] VTS eval history hydration failed:', e);
  }
}

function persistVtsEvalSnapshot(snapshot: VTSEvalSnapshot): void {
  try {
    if (!existsSync(VTS_EVAL_HISTORY_DIR)) {
      mkdirSync(VTS_EVAL_HISTORY_DIR, { recursive: true });
    }
    const filePath = getVtsEvalHistoryPath();
    let existing: VTSEvalSnapshot[] = [];
    if (existsSync(filePath)) {
      try {
        existing = JSON.parse(readFileSync(filePath, 'utf-8'));
      } catch { existing = []; }
    }
    existing.push(snapshot);
    writeFileSync(filePath, JSON.stringify(existing, null, 2));
  } catch (e) {
    console.warn('[22HF7] Failed to persist VTS eval snapshot:', e);
  }
}

// Batch 37: Helper to check if sourcePool is any quant family variant
function isQuantPool(sourcePool?: string): boolean {
  return !sourcePool || sourcePool === 'quant' || sourcePool.startsWith('quant-');
}

// Run hydration on module load
hydrateVtsEvalHistory();

export function getVTSEvalRolling24h(): VTSEvalSnapshot | null {
  // Prune entries older than 24h
  const cutoff = Date.now() - VTS_EVAL_ROLLING_WINDOW_MS;
  vtsEvalHistory = vtsEvalHistory.filter(s => s.timestamp > cutoff);

  if (vtsEvalHistory.length === 0) return null;

  // Aggregate all snapshots into a single rolled-up object
  const aggregated: VTSEvalSnapshot = {
    timestamp: Date.now(),
    quantPairsEvaluated: 0,
    patternPairsEvaluated: 0,
    quantStrategyNulls: 0,
    patternNoDetection: 0,
    patternDetected: 0,
    quantPatternDetected: 0,
    quantPatternNoDetection: 0,
    signalsGenerated: 0,
    quantStrategyEvaluations: 0,
    patternStrategyEvaluations: 0,
    quantSignalsGenerated: 0,
    patternSignalsGenerated: 0,
    totalStrategyEvaluations: 0,
    signalsRejected: 0,
    quantSignalsRejected: 0,
    patternSignalsRejected: 0,
    pairsSkippedNoPrice: 0,
    pairsSkippedInsufficientOHLC: 0,
    nullReasons: {
      conditionsNotMet: 0,
      adxGuard: 0,
      duplicatePosition: 0,
      uniqueDuplicateCombos: 0,
      maxOpenTrades: 0,
      regimeNoStrategies: 0,
      familyFilterMismatch: 0,
    },
    rejectedReasons: {
      netEvBelowFloor: 0,
    },
    byStrategy: {},
    nullReasonDetail: {},
    quantNullReasonDetail: {},
    patternNullReasonDetail: {},
  };

  for (const snap of vtsEvalHistory) {
    aggregated.quantPairsEvaluated += snap.quantPairsEvaluated;
    aggregated.patternPairsEvaluated += snap.patternPairsEvaluated;
    // Batch 51: Aggregate pair-pool evaluations
    aggregated.quantPairPoolEvaluations = (aggregated.quantPairPoolEvaluations ?? 0) + (snap.quantPairPoolEvaluations ?? 0);
    aggregated.patternPairPoolEvaluations = (aggregated.patternPairPoolEvaluations ?? 0) + (snap.patternPairPoolEvaluations ?? 0);
    aggregated.quantStrategyNulls += snap.quantStrategyNulls;
    aggregated.patternStrategyNulls = (aggregated.patternStrategyNulls ?? 0) + (snap.patternStrategyNulls ?? 0);
    aggregated.patternNoDetection += snap.patternNoDetection;
    aggregated.patternDetected += snap.patternDetected;
    aggregated.quantPatternDetected = (aggregated.quantPatternDetected ?? 0) + (snap.quantPatternDetected ?? 0);
    aggregated.quantPatternNoDetection = (aggregated.quantPatternNoDetection ?? 0) + (snap.quantPatternNoDetection ?? 0);
    aggregated.signalsGenerated += snap.signalsGenerated;
    aggregated.totalStrategyEvaluations += snap.totalStrategyEvaluations;
    aggregated.quantStrategyEvaluations = (aggregated.quantStrategyEvaluations ?? 0) + (snap.quantStrategyEvaluations ?? 0);
    aggregated.patternStrategyEvaluations = (aggregated.patternStrategyEvaluations ?? 0) + (snap.patternStrategyEvaluations ?? 0);
    aggregated.quantSignalsGenerated = (aggregated.quantSignalsGenerated ?? 0) + (snap.quantSignalsGenerated ?? 0);
    aggregated.patternSignalsGenerated = (aggregated.patternSignalsGenerated ?? 0) + (snap.patternSignalsGenerated ?? 0);
    // Batch 26: Aggregate new counters
    aggregated.signalsRejected = (aggregated.signalsRejected ?? 0) + (snap.signalsRejected ?? 0);
    aggregated.quantSignalsRejected = (aggregated.quantSignalsRejected ?? 0) + (snap.quantSignalsRejected ?? 0);
    aggregated.patternSignalsRejected = (aggregated.patternSignalsRejected ?? 0) + (snap.patternSignalsRejected ?? 0);
    aggregated.pairsSkippedNoPrice = (aggregated.pairsSkippedNoPrice ?? 0) + (snap.pairsSkippedNoPrice ?? 0);
    aggregated.pairsSkippedInsufficientOHLC = (aggregated.pairsSkippedInsufficientOHLC ?? 0) + (snap.pairsSkippedInsufficientOHLC ?? 0);
    // Batch 21: Aggregate null reasons
    if (snap.nullReasons) {
      aggregated.nullReasons.conditionsNotMet += snap.nullReasons.conditionsNotMet;
      aggregated.nullReasons.adxGuard += snap.nullReasons.adxGuard;
      aggregated.nullReasons.duplicatePosition += snap.nullReasons.duplicatePosition;
      aggregated.nullReasons.uniqueDuplicateCombos += snap.nullReasons.uniqueDuplicateCombos ?? 0;
      aggregated.nullReasons.maxOpenTrades += snap.nullReasons.maxOpenTrades;
      aggregated.nullReasons.regimeNoStrategies += snap.nullReasons.regimeNoStrategies;
      aggregated.nullReasons.familyFilterMismatch += snap.nullReasons.familyFilterMismatch ?? 0;
    }
    // Batch 26: Aggregate rejected reasons (separate from null reasons — signals that existed but failed post-generation guards)
    if (snap.rejectedReasons) {
      if (!aggregated.rejectedReasons) { aggregated.rejectedReasons = { netEvBelowFloor: 0 }; }
      aggregated.rejectedReasons.netEvBelowFloor += snap.rejectedReasons.netEvBelowFloor ?? 0;
    }
    // Batch 26: Backwards compat — old snapshots may have netEvBelowFloor in nullReasons
    if (snap.nullReasons && (snap.nullReasons as any).netEvBelowFloor) {
      if (!aggregated.rejectedReasons) { aggregated.rejectedReasons = { netEvBelowFloor: 0 }; }
      aggregated.rejectedReasons.netEvBelowFloor += (snap.nullReasons as any).netEvBelowFloor;
    }

    for (const [strat, counts] of Object.entries(snap.byStrategy)) {
      if (!aggregated.byStrategy[strat]) {
        aggregated.byStrategy[strat] = { evaluated: 0, nulls: 0, signals: 0, preRejectionSignals: 0, rejected: 0 };
      }
      aggregated.byStrategy[strat].evaluated += counts.evaluated;
      aggregated.byStrategy[strat].nulls += counts.nulls;
      aggregated.byStrategy[strat].signals += counts.signals;
      aggregated.byStrategy[strat].preRejectionSignals += counts.preRejectionSignals ?? 0;
      aggregated.byStrategy[strat].rejected += counts.rejected ?? 0;
    }
    // Batch 31: Aggregate nullReasonDetail
    if (snap.nullReasonDetail) {
      if (!aggregated.nullReasonDetail) { aggregated.nullReasonDetail = {}; }
      for (const [reason, count] of Object.entries(snap.nullReasonDetail)) {
        aggregated.nullReasonDetail![reason] = (aggregated.nullReasonDetail![reason] ?? 0) + count;
      }
    }
    // Batch 57: Aggregate pool-keyed null reason detail
    if (snap.quantNullReasonDetail) {
      if (!aggregated.quantNullReasonDetail) { aggregated.quantNullReasonDetail = {}; }
      for (const [reason, count] of Object.entries(snap.quantNullReasonDetail)) {
        aggregated.quantNullReasonDetail![reason] = (aggregated.quantNullReasonDetail![reason] ?? 0) + count;
      }
    }
    if (snap.patternNullReasonDetail) {
      if (!aggregated.patternNullReasonDetail) { aggregated.patternNullReasonDetail = {}; }
      for (const [reason, count] of Object.entries(snap.patternNullReasonDetail)) {
        aggregated.patternNullReasonDetail![reason] = (aggregated.patternNullReasonDetail![reason] ?? 0) + count;
      }
    }
    // B63: Aggregate per-strategy null reason detail
    const snapByStrat = (snap as any).byStrategyNullReasons;
    if (snapByStrat) {
      if (!(aggregated as any).byStrategyNullReasons) { (aggregated as any).byStrategyNullReasons = {}; }
      const aggByStrat = (aggregated as any).byStrategyNullReasons;
      for (const [strat, reasons] of Object.entries(snapByStrat as Record<string, Record<string, number>>)) {
        if (!aggByStrat[strat]) aggByStrat[strat] = {};
        for (const [reason, count] of Object.entries(reasons)) {
          aggByStrat[strat][reason] = (aggByStrat[strat][reason] ?? 0) + count;
        }
      }
    }
  }

  return aggregated;
}

// Keep backward compat for any other callers
export function getLastVTSEvalCounters() {
  return getVTSEvalRolling24h();
}

// Batch 51 HF2: Get the most recent single VTS cycle snapshot (not 24h rollup)
export function getLastVTSCycleSnapshot(): VTSEvalSnapshot | null {
  if (vtsEvalHistory.length === 0) return null;
  return vtsEvalHistory[vtsEvalHistory.length - 1];
}

// Phase 14 HF6: Strategy engine instance for detect function calls
const strategyEngine = new StrategyEngine();

interface VTSConfig {
  autonomousMode: boolean;
  simulationIntervalSec: number;
  pairsPerCycle: number;
  strategies: string[];
  targetProfit: number;
  stopLoss: number;
  // B54: minVolume24h and minPrice REMOVED — DB is sole authority (screener_filters).
  // FX5 scanner already filters on DB-driven values before pairs reach VTS.
}

// ══════════════════════════════════════════════════════════════════════════════
// Batch 18L: VTS Throughput Constants
// These constants control VTS-ONLY behavior. Active trading is NOT affected.
// Purpose: Increase VTS simulated trade volume for ML learning data.
// ══════════════════════════════════════════════════════════════════════════════
export const VTS_NET_EV_FLOOR = -0.01;        // Batch 52 Fix 19: Tightened -2.0%→-1.0%. -2% was too permissive (zero rejections). -1% allows boundary-case learning while filtering truly negative-EV trades. Active trading unaffected (strict netEV>0). B79.0m.b2: exported for xstock eval-cycle.
// B72: VTS_MAX_CONCURRENT_PER_COMBO read from module='vts_runner'.
// B19G HF1 stabilized at 1 (was 3). Tunable via SQL UPDATE without code redeploy.
const _VTS_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
function getVtsMaxConcurrentPerCombo(): number {
  return getCachedNumberRequired('vts_runner', 'max_concurrent_per_symbol_strategy', _VTS_GK);
}
// Option C: ROI gate skipped entirely for VTS (see Edit 3)
// Option D: simulationIntervalSec reduced to 30s (aligned with FX5 scan cycle)
// Option E: pairsPerCycle increased to 200 (capture all FX5 output)

const DEFAULT_CONFIG: VTSConfig = {
  autonomousMode: true,
  simulationIntervalSec: 30,  // Batch 18L Option D: was 60, now aligned with FX5 30s scan cycle
  pairsPerCycle: 200,         // Batch 18L Option E: was 100, now captures all FX5 survivors
  strategies: [
    'vwap_pullback', 'sma_trend_ride', 'breakout', 'range_trade',
    'support_bounce', 'vwap_bounce', 'mean_reversion', 'liquidity_trap'
  ],
  targetProfit: 0.015,
  stopLoss: 0.008,
  // B54: minVolume24h and minPrice REMOVED — FX5 scanner applies DB-driven filtering upstream.
};

/**
 * B70.3 (2026-05-05) — Universally disabled strategies.
 *
 * Strategies in this set are SKIPPED at the strategy iteration loop BEFORE
 * detect() is called. Pre-B70.3 these strategies were evaluated and
 * immediately rejected with reason `strategy_disabled_bearish` (or similar),
 * wasting ~7k evaluations/day on liquidity_trap alone in long-only VTS.
 *
 * To re-enable a strategy: remove from this set + ensure detect() returns
 * non-null setups in the current pipeline (long-only check, family map,
 * regime map, etc.).
 *
 * To add a strategy: add the canonical strategy key + a comment explaining
 * WHY it's disabled (pointer to the directive/batch that disabled it).
 */
export const UNIVERSALLY_DISABLED_STRATEGIES: Set<string> = new Set([
  // Batch 45: bearish failed-breakout fade strategy (stop > entry, target < entry).
  // Incompatible with long-only system. Bullish redesign deferred.
  'liquidity_trap',
]);

let vtsConfig: VTSConfig = { ...DEFAULT_CONFIG };

async function loadVTSConfig(): Promise<VTSConfig> {
  try {
    const configPath = path.join(process.cwd(), 'config', 'vts.json');
    const content = await fs.readFile(configPath, 'utf-8');
    const loaded = JSON.parse(content);
    vtsConfig = { ...DEFAULT_CONFIG, ...loaded };
    console.log('[11.0E.1][VTS_CONFIG] Loaded config:', JSON.stringify(vtsConfig, null, 2));
    return vtsConfig;
  } catch (error) {
    console.warn('[11.0E.1][VTS_CONFIG] Using default config (file not found or invalid)');
    return DEFAULT_CONFIG;
  }
}

interface Phase10TradeRecord {
  symbol: string;
  // P19-B3b: asset class captured on the learning-substrate archive record. The
  // active-paper path co-writes this substrate, so the class must be persisted
  // (sourced from the resolved class at signal-gen / the OpenVirtualTrade record,
  // both of which carry it). Required — every construction site sets it, and the
  // per-class telemetry write reads it as a strict AssetClass.
  assetClass: AssetClass;
  regime: MarketRegimeType;
  regimeScore?: number; // Directive 11.4H.4A: Dynamic 0-100 score for telemetry
  signalType: CanonicalSignalType;
  strategy: string;
  patternType?: PatternType | null;
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
  frictionCost: number;
  entry: number;
  exit?: number;
  profit?: number;
  positionSize: number;
  pool?: 'ideal' | 'rotational';
  sourcePool?: string; // Batch 37: Family-qualified source pool
  timestamp: string;
  // B65.2 (2026-04-23): expanded with trailing_stop_hit + moonbag_timeout
  // HF3: break_even_stop added.
  exitType?: 'stop_hit' | 'target_hit' | 'timeout' | 'pending' | 'trailing_stop_hit' | 'moonbag_timeout' | 'break_even_stop';
  volZ?: number; // Directive 11.7F-B: Volatility Z-score for drift calculation
  trendZ?: number; // Directive 11.7F-B: Trend Z-score (momentum) for drift calculation
  executionContext?: 'VTS' | 'VTS_MULTI'; // 11.8C: Multi-strategy identification
  // Phase 14: 6 context dimensions captured at trade OPEN
  globalRegime?: string;
  pairFriction?: number;
  globalFriction?: number;
  pairDirectionalBias?: string;
  globalDirectionalBias?: string;
  // B61 (2026-04-15): numeric DBS score captured alongside the category string.
  // Category alone collapses [-1, +1] into one of 7 buckets and loses magnitude.
  pairDirectionalBiasScore?: number | null;
  globalDirectionalBiasScore?: number | null;
  filterTier?: 'standard' | 'relaxed';  // HF9: IMF filter tier
  // P19-B7.2b (OBJ-B): the maker/taker entry fee-mode this trade OPENED on, carried
  // from the OpenVirtualTrade record onto the closed archive so the VTS closed-trades
  // UI can show WHICH fee the entry paid. ENTRY-leg only (exit pays taker today).
  // Optional — pre-B7.2b records lack it (UI renders NULL as an em-dash).
  chosenEntryMode?: 'taker' | 'maker';
  entryFeeRate?: number;
}

/**
 * Directive 11.6: Open Virtual Trades Tracking
 * Tracks trades waiting for real Kraken price resolution instead of random simulation
 * 
 * Directive 11.6H: dollarValue = fixed USD exposure (capped at 25% of portfolio)
 *                  quantity = variable coin units (dollarValue / entryPrice)
 */
interface OpenVirtualTrade {
  id: string;
  symbol: string;
  // B79.TEC (2026-05-08): assetClass on the open-trade record so the TEC
  // exit loop can route to the correct per-class config without a lookup.
  // Populated at trade-open via resolveAssetClass(symbol, exchange).
  assetClass: AssetClass;
  // reorg-B3.2 (2026-06-24): the reorg-B2 quality-gate verdict this trade carries. 'passed' = cleared
  // the RR/reachability gate; 'rr_below_min'/'unreachable' = the active path would suppress it but the
  // VTS tags-and-simulates it for learning data. Optional — older in-flight trades + non-gated paths
  // omit it (treated as 'passed'/unknown). Lets analysis filter the VTS population to the gate-passing
  // "what active would do" subset.
  vtsGateVerdict?: 'passed' | 'rr_below_min' | 'unreachable';
  // B-NEW-36 (2026-05-20): lifecycle marker hydrated from vts_open_trades.state.
  // 'open' = normal active trade (default; new inserts get DB DEFAULT 'open').
  // 'weekend_suspended' = paused by the off-hours session-lifecycle controller
  //   during Fri 8PM ET → Sun 8PM ET (xstock_spot ONLY; DB CHECK enforces).
  //   resolveOpenVirtualTrades() skips trades with this state so the TEC exit
  //   path doesn't churn against stale weekend data.
  // 'closed' = terminal (mirrors closed=true; the sim cycle's Map.has() gate
  //   means closed trades are already absent from the Map, but the column is
  //   kept consistent for DB-side queries).
  state?: import('./vts-trade-persistence.js').VtsOpenTradeState;
  // P19-B7.2b (OBJ-A/B): the SHARED maker/taker best-of-both entry decision for this
  // VTS trade + the actual per-side entry fee rate used. Optional (older in-flight
  // trades omit it → NULL, never coerced to a default mode). Carried to vts_open_trades
  // + the vts_trades_*.json closed payload for the fee-mode UI column.
  chosenEntryMode?: 'taker' | 'maker';
  entryFeeRate?: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  dollarValue: number;      // Directive 11.6H: Fixed USD exposure
  quantity: number;         // Directive 11.6H: Variable coin units
  frictionCost: number;
  regime: MarketRegimeType;
  regimeScore: number;
  signalType: CanonicalSignalType;
  strategy: string;
  patternType?: PatternType | null;
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
  // B-NEW-53.1 (2026-06-08, #207): declared to match the literal (≈L1486) + the
  // persisted DB row. Consumed by the B70.2 admitted-features archive, which had
  // been reading it off the lean Phase10TradeRecord (which never carried it) →
  // archived undefined on every crypto admitted row since 2026-05-05. Optional →
  // backward-compatible with every other OpenVirtualTrade construction site.
  expectedEdge?: number;
  pool: 'ideal' | 'rotational';
  openedAt: number;
  strategyMode?: StrategyMode;         // 11.7S: Mode for observability
  modeOverlay?: StrategyModeOverlay;   // 11.7S: Overlay values for observability
  regimeStability?: RegimeStability;   // 11.7S: Regime stability for observability
  executionContext?: 'VTS' | 'VTS_MULTI'; // 11.8C: Identifies multi-strategy trades
  sourcePool?: string;        // Batch 37: Family-qualified source pool
  // Phase 14: 6 context dimensions captured at trade OPEN
  globalRegime?: string;
  pairFriction?: number;
  globalFriction?: number;
  pairDirectionalBias?: string;
  globalDirectionalBias?: string;
  // B61 (2026-04-15): numeric DBS score captured alongside the category string.
  pairDirectionalBiasScore?: number | null;
  globalDirectionalBiasScore?: number | null;
  // B.2.UI (2026-06-02): entry-liquidity snapshot for the "Volume / Order Book"
  // column on the ML sim-trade tables. xStock = ask-side order-book depth USD
  // (LQ gate input, rolling-20m median) → 'depth_usd'; crypto = native 24h volume
  // in COIN UNITS (NOT USD) → 'volume_qty'. Optional + null-guarded: a missing
  // value renders "—" and must never break trade-open.
  entryLiquidityValue?: number;
  entryLiquidityKind?: 'depth_usd' | 'volume_qty';
  // B-5 AMR: weather stamp at trade OPEN (shadow visibility; dials unaffected).
  amrClassification?: string;
  amrMode?: string;
  // B65.2 (2026-04-23): volatility snapshot at open, consumed by the
  // trailing-exit engine. ATR drives the break-even trigger and trailing
  // distance math; DI + VolNoise fine-tune the trailing K' multiplier.
  atrAtOpen?: number;
  diAtOpen?: number;
  volNoiseAtOpen?: number;
  // B65.4 (2026-04-25): live ladder rung count, updated by the engine
  // writeback in the exit loop. Propagated to closed-trade record on close.
  ladderRungsHit?: number;
  // B65.4.2 (2026-04-28): observability fields kept in sync with engine state
  // so /api/vts/ml/open + persistRealPriceTrade can serialize them. Original
  // stop captured at trade open; latchTriggerPrice + rungTargetHistory
  // populated after target latches.
  originalStopPrice?: number;
  latchTriggerPrice?: number;
  rungTargetHistory?: number[];
  // B67.3 (2026-04-29): cohort marker for the per-underlying limits A/B
  // observation. 0 = capped treatment, 1 = uncapped control. Persisted on
  // close to JSONL so end-of-observation cohort comparison can group trades.
  pairIdHash?: number;
  // B67.2.1 (2026-04-29): regime classifier confidence + macro modifier +
  // phase persisted at trade-open per Kyle directive (master plan §0.11.D).
  // Available throughout the trade lifecycle for UI rendering, CSV export,
  // and serialized to JSONL on close for B70 archive ingestion.
  regimeConfidenceRaw?: number;
  macroModifierValue?: number;
  phase?: 'EARLY' | 'PRIME' | 'LATE';
  phaseAgeSeconds?: number;
  strategyPhaseWeight?: number;
  regimeConfidenceModulated?: number;
}

const openVirtualTrades: Map<string, OpenVirtualTrade> = new Map();

// ════════════════════════════════════════════════════════════════════════════
// reorg-B4 (2026-06-25) — the shadow-trade telemetry layer's SEPARATE open-trades
// Map. Shadow sims live here, NOT in `openVirtualTrades` — so every reader of
// `openVirtualTrades` (cap gates :1544/:3032/:3455, dup/lane guards :1489/:1503/
// :3017/:3715, getStats :2961/:2981, ranking :4503/:4536) is shadow-free BY
// CONSTRUCTION (no predicate to forget). The resolver `resolveOpenVirtualTrades`
// drains BOTH Maps but dispatches PER-MAP-ORIGIN: real → `persistRealPriceTrade`;
// shadow → `shadowClose` (an ALLOWLIST routine that writes ONLY the
// `rtb_shadow_pairings` sink — NEVER outcomeFeedbackStore.updateEma /
// recordPairTelemetry / updateRollingAverages / the exit-archive). That + this
// separate Map = the by-construction open+closed-side segregation. See the
// P19_REORG_B4 scope/pre-audit.
const openShadowTrades: Map<string, OpenVirtualTrade> = new Map();

// reorg-B4 shadow-population bound (Langston Step-2). The TTL is the real governor:
// shadows resolve at first-of {stop, target, SHADOW_MAX_HOLD_MS}. The CAP is a true
// backstop sized ABOVE steady-state (~2.9k–6.5k at the active picker's ~30s cadence
// × 6h TTL vs the ~28.7h VTS avg hold), so it fires ONLY on a runaway anomaly — at
// which point we reject-new + increment a drop counter + ALERT, never silently
// rebiasing the selection-quality sample.
const SHADOW_MAX_HOLD_MS = 6 * 60 * 60 * 1000; // 6h
const SHADOW_CAP = 10000;
let shadowDropCount = 0; // count of reject-new-at-cap events (surfaced + alerted; never silent)
// reorg-B4: per-signal dedupe — a pool member that already has a LIVE shadow is
// NOT re-opened on the next promotion cycle. Without this, the same queued signal
// (which can sit in the pool across many cycles until promoted/expired) would open
// one shadow PER cycle → uncontrolled creep. With it, the open-shadow population is
// bounded at ~pool-size (TTL + SHADOW_CAP are then true backstops, not the primary
// bound). Keyed by `${mode}:${signalId}` → shadow trade id; cleared at shadow close.
const shadowOpenBySignal: Map<string, string> = new Map();

/**
 * reorg-B4 — the ONE derivation of the per-signal dedupe key, called at ALL three
 * sites (open / rehydration re-seed / close delete) so they are byte-identical by
 * construction (Langston Step-4: the open key and the rehydration key must match
 * exactly, or a post-restart cycle re-opens a duplicate shadow across the very
 * boundary the dedupe must survive). `mode`+`signalId` round-trip through
 * `vts_open_trades.context` jsonb (they are NOT core columns → bundled into context
 * by splitTradeForPersist → spread back by rehydrateOpenTrades), so the same inputs
 * are available at all three sites. The `${symbol}:${strategy}` fallback only fires
 * when signalId is genuinely absent, identically everywhere.
 */
export function shadowDedupeKey(
  mode: string | undefined | null,
  signalId: string | undefined | null,
  symbol: string,
  strategy: string,
): string {
  return `${mode ?? 'paper'}:${signalId ?? `${symbol}:${strategy}`}`;
}
// reorg-B4: monotonic per-promotion-cycle sequence — the 4th component of cycleKey
// (mode|assetClass|tsMs|seq) so two cycles within the same ms are still provably
// distinct (Langston Step-2: composite key, not ts+mode alone).
let _shadowCycleSeq = 0;

/**
 * reorg-B4 — mint ONE cycleKey per promotion cycle. The promotion caller calls
 * this once, then stamps every pool member's pairing row with the same key +
 * its own promotionRank, so a downstream query can reconstruct the exact pool
 * that was ranked at that decision.
 */
export function nextShadowCycleKey(mode: string, assetClass: string): string {
  return `${mode}|${assetClass}|${Date.now()}|${_shadowCycleSeq++}`;
}

/**
 * reorg-B4 decision-time input for opening ONE shadow trade (one RTB-pool member
 * at one promotion cycle). Carries the exit-eval shell + the ranking-input
 * snapshot that lands in `rtb_shadow_pairings`. All scoring fields optional —
 * the active path may carry nulls (#233 EV inputs) and the sink records the
 * honest absence.
 */
export interface RegisterOpenShadowTradeInput {
  cycleKey: string;
  mode: string;                 // 'paper' | 'live'
  assetClass: AssetClass;
  symbol: string;
  strategy: string;
  signalId?: string | null;
  regime?: string | null;
  promotionRank?: number | null;
  promoted?: boolean;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  atrAtOpen?: number | null;
  sourcePool?: string | null;
  // ── ranking-input snapshot (decision-time; persisted, never recomputed) ──
  finalScore?: number | null;
  hybridScore?: number | null;
  confidence?: number | null;
  regimeWeight?: number | null;
  decayPenalty?: number | null;
  rankingScore?: number | null;
  diAtQueue?: number | null;
  dbsScoreAtQueue?: number | null;
  // P19-B7.1 (OBJ-4): the new ranker's decision-time outputs (selection-IC harness).
  predictedRMultiple?: number | null;
  pwinFloored?: boolean;
  crossClassPromotion?: boolean;
  sqeVerdict?: string | null;
  sqeRejectReason?: string | null;
}

/**
 * reorg-B4 — open ONE shadow trade. The shadow LIFECYCLE mirrors a real VTS
 * trade (persist → Map → resolve → close) but is segregated BY CONSTRUCTION:
 *
 *   • it lands in `openShadowTrades`, NEVER `openVirtualTrades` — so every cap /
 *     dedupe / lane / getStats / ranking reader of the live Map is shadow-free
 *     with no predicate to forget;
 *   • it persists to `vts_open_trades` with `context.shadow = true` so a restart
 *     rehydrates it back into `openShadowTrades` (the rehydration split), NOT the
 *     live Map;
 *   • it writes the decision-time row to `rtb_shadow_pairings` (the isolated
 *     selection-quality sink) — and the close path (`shadowClose`) writes ONLY
 *     that sink, never a learning store.
 *
 * Returns the shadow trade id — the EXISTING one if a live shadow already exists for
 * this signal (dedupe), or the NEW one on open. Returns null ONLY on a genuine
 * failure: cap-reject (reject-new backstop) or persist-fail. (reorg-B4.1 widened the
 * dedupe return from null→id so the per-cycle pool-member row can FK the trade; null
 * now means "no trade to reference, skip the member-write".) Caller fires this
 * fire-and-forget off the promotion hot path.
 */
export async function registerOpenShadowTrade(
  input: RegisterOpenShadowTradeInput,
): Promise<string | null> {
  // Dedupe: one live shadow per (mode, signalId). Skip a re-OPEN across cycles, but
  // reorg-B4.1: RETURN the existing trade id (not null) so the per-cycle pool-member
  // row can FK it. The contract is now: returns the shadow trade id (existing on
  // dedupe / new on open); null ONLY on a genuine failure (cap-reject / persist-fail).
  // Verified safe (Langston Step-2): the sole caller discards the return today, so
  // widening null→id breaks no control flow.
  const dedupeKey = shadowDedupeKey(input.mode, input.signalId, input.symbol, input.strategy);
  const existingId = shadowOpenBySignal.get(dedupeKey);
  if (existingId !== undefined) {
    return existingId;
  }

  // Cap backstop: reject-NEW at SHADOW_CAP (never evict-oldest — that would bias
  // the selection-quality sample toward fast-resolvers). Count + alert, never silent.
  if (openShadowTrades.size >= SHADOW_CAP) {
    shadowDropCount++;
    console.warn(
      `[reorg-B4][SHADOW_CAP] openShadowTrades at cap (${SHADOW_CAP}); rejecting NEW shadow for ` +
      `${input.symbol}/${input.strategy} (mode=${input.mode}). shadowDropCount=${shadowDropCount}. ` +
      `This is a runaway backstop — the 6h TTL should keep steady-state well below the cap; ` +
      `investigate if shadowDropCount climbs.`,
    );
    return null;
  }

  const tradeId = `shadow_${input.assetClass}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const openedAt = Date.now();

  // Minimal exit-eval shell + the `shadow:true` marker (bundled into context jsonb
  // by splitTradeForPersist → drives the rehydration split). Sizing fields are
  // nominal: selection-quality reads the netPnl FRACTION + R-multiple, not dollars.
  const shadowTrade: OpenVirtualTrade = {
    id: tradeId,
    symbol: input.symbol,
    assetClass: input.assetClass,
    entryPrice: input.entryPrice,
    stopLoss: input.stopPrice,
    takeProfit: input.targetPrice,
    positionSize: 1,
    dollarValue: 1,
    quantity: 0,
    frictionCost: 0,
    regime: input.regime ?? '',
    regimeScore: 0,
    signalType: 'SHADOW',
    strategy: input.strategy,
    patternType: null,
    finalScore: input.finalScore ?? 0,
    hybridScore: input.hybridScore ?? 0,
    predictiveConfidence: input.confidence ?? 0,
    regimeWeight: input.regimeWeight ?? 0,
    decayPenalty: input.decayPenalty ?? 0,
    pool: 'rotational',
    openedAt,
    executionContext: 'VTS',
    sourcePool: input.sourcePool ?? undefined,
    atrAtOpen: input.atrAtOpen ?? 0,
    diAtOpen: input.diAtQueue ?? 50,
    volNoiseAtOpen: 0.3,
    originalStopPrice: input.stopPrice,
    rungTargetHistory: [],
    // reorg-B4: the discriminator + the dedupe re-seed inputs. splitTradeForPersist
    // bundles unknown keys into context jsonb, so these round-trip through
    // vts_open_trades: `shadow:true` drives the boot rehydration split, and
    // mode/signalId let the rehydration re-seed the per-signal dedupe map exactly
    // as it was keyed at open.
    shadow: true,
    mode: input.mode,
    signalId: input.signalId ?? null,
  } as unknown as OpenVirtualTrade;

  // Persist BEFORE Map.set (mirrors registerOpenVtsTrade's ordering) so a failed
  // insert leaves no orphan in-memory shadow and no untracked durable pairing row.
  try {
    const { insertOpenTrade } = await import('./vts-trade-persistence.js');
    await insertOpenTrade(shadowTrade as any);
    const { insertShadowPairing } = await import('./rtb-shadow-store.js');
    await insertShadowPairing({
      id: tradeId,
      cycleKey: input.cycleKey,
      mode: input.mode,
      assetClass: input.assetClass,
      regime: input.regime ?? null,
      promotionRank: input.promotionRank ?? null,
      promoted: input.promoted ?? false,
      signalId: input.signalId ?? null,
      symbol: input.symbol,
      strategy: input.strategy,
      entryPrice: input.entryPrice,
      stopPrice: input.stopPrice,
      targetPrice: input.targetPrice,
      finalScore: input.finalScore ?? null,
      hybridScore: input.hybridScore ?? null,
      confidence: input.confidence ?? null,
      regimeWeight: input.regimeWeight ?? null,
      decayPenalty: input.decayPenalty ?? null,
      rankingScore: input.rankingScore ?? null,
      sourcePool: input.sourcePool ?? null,
      diAtQueue: input.diAtQueue ?? null,
      dbsScoreAtQueue: input.dbsScoreAtQueue ?? null,
      predictedRMultiple: input.predictedRMultiple ?? null, // P19-B7.1 (OBJ-4)
      pwinFloored: input.pwinFloored ?? false,
      crossClassPromotion: input.crossClassPromotion ?? false,
      sqeVerdict: input.sqeVerdict ?? null,
      sqeRejectReason: input.sqeRejectReason ?? null,
    });
  } catch (persistErr) {
    console.error(
      `[reorg-B4][SHADOW_PERSIST_FAIL] shadow=${tradeId} symbol=${input.symbol} ` +
      `asset_class=${input.assetClass} — aborting shadow-open:`,
      persistErr instanceof Error ? persistErr.message : persistErr,
    );
    return null;
  }

  openShadowTrades.set(tradeId, shadowTrade);
  shadowOpenBySignal.set(dedupeKey, tradeId);
  return tradeId;
}

/**
 * B-NEW-36 (2026-05-20): expose the in-memory open-trades Map for the
 * off-hours session-lifecycle controller. The controller's bulk-suspend /
 * bulk-restore helpers (markAllXstockWeekendSuspended /
 * unmarkAllXstockWeekendSuspended) mirror their DB UPDATE into the Map so
 * the sim cycle's `if (t.state === 'weekend_suspended') continue;` filter
 * sees the new state immediately (next tick) instead of waiting for the
 * next rehydrate at server restart.
 *
 * The Map's value type is structurally compatible with the helpers' loose
 * `{ assetClass; state? }` shape; the cast is internal-module-safe because
 * `OpenVirtualTrade.assetClass` and `.state` carry the expected types.
 */
export function getOpenVirtualTradesMap(): Map<string, { assetClass: AssetClass; state?: import('./vts-trade-persistence.js').VtsOpenTradeState }> {
  return openVirtualTrades as unknown as Map<string, { assetClass: AssetClass; state?: import('./vts-trade-persistence.js').VtsOpenTradeState }>;
}

// B79.0g — rehydrate the in-memory Map from vts_open_trades at server boot.
// Called once from server/index.ts after DB connection but before scanner
// starts. If the table is empty AND the Map has entries (post-deploy bootstrap
// case), call bootstrapOpenTradesFromMemory which re-resolves asset_class so
// legacy bad values from pre-B79.0f resolver don't freeze into DB.
export async function rehydrateOpenVtsTrades(): Promise<void> {
  try {
    const { rehydrateOpenTrades, bootstrapOpenTradesFromMemory } = await import('./vts-trade-persistence.js');
    const rows = await rehydrateOpenTrades();
    if (rows.length > 0) {
      // reorg-B4: rehydration split. A persisted shadow row carries `shadow:true`
      // in its context jsonb (spread onto the record by rehydrateOpenTrades). It
      // MUST route into openShadowTrades — NOT the live Map — or it would defeat
      // the in-memory separation (every live-Map reader would see it). Strict
      // `=== true` so a missing/NULL discriminator fails SAFE to the live pool.
      let liveCount = 0;
      let shadowCount = 0;
      for (const r of rows) {
        if ((r as { shadow?: unknown }).shadow === true) {
          openShadowTrades.set(r.id, r as unknown as OpenVirtualTrade);
          // Re-seed the per-signal dedupe so a post-restart promotion cycle doesn't
          // re-open a shadow that's already live for this signal. SAME key derivation
          // as the open site (shadowDedupeKey) so the keys are byte-identical.
          shadowOpenBySignal.set(
            shadowDedupeKey((r as any).mode, (r as any).signalId, r.symbol, r.strategy),
            r.id,
          );
          shadowCount++;
        } else {
          openVirtualTrades.set(r.id, r as unknown as OpenVirtualTrade);
          liveCount++;
        }
      }
      console.log(`[B79.0g][REHYDRATE] loaded ${liveCount} open VTS trades + ${shadowCount} shadow trades from DB`);
    } else if (openVirtualTrades.size > 0) {
      // Bootstrap path — first deploy of B79.0g, table empty but Map has entries.
      const seeded = await bootstrapOpenTradesFromMemory(
        Array.from(openVirtualTrades.values()) as any,
      );
      console.log(`[B79.0g][REHYDRATE] table empty + Map non-empty → bootstrapped ${seeded ?? 0}`);
    } else {
      console.log('[B79.0g][REHYDRATE] table empty + Map empty — clean start');
    }
  } catch (err) {
    console.error(
      '[B79.0g][REHYDRATE_FAIL] continuing with in-memory state only:',
      err instanceof Error ? err.message : err,
    );
  }
}

// B72: MAX_OPEN_TRADES from module='vts_runner'.
function getMaxOpenTrades(): number {
  return getCachedNumberRequired('vts_runner', 'max_open_vts_trades', _VTS_GK);
}
// HF6 Item 3: openVirtualTrades is cleared at startup via vtsService.hf6ClearStaleTrades()
// which handles the vts-service side. Runner-side Map starts empty on module load.
// (initial log removed; runtime ceiling read each evaluation via getMaxOpenTrades())

// Batch 45+47f15: Post-close re-entry suppression — prevents same symbol+strategy from reopening
// with identical setup. Two layers: time cooldown + setup-hash matching.
const recentCloses: Map<string, number> = new Map(); // key → close timestamp
// B72: cooldown + hash tolerance/expiry from module='vts_runner'.
function getReentryCooldownMs(): number {
  return getCachedNumberRequired('vts_runner', 'reentry_cooldown_ms', _VTS_GK);
}
function getSetupHashTolerance(): number {
  return getCachedNumberRequired('vts_runner', 'setup_hash_tolerance', _VTS_GK);
}
function getSetupHashExpiryMs(): number {
  return getCachedNumberRequired('vts_runner', 'setup_hash_expiry_ms', _VTS_GK);
}
// Batch 47f15: Setup-hash suppression — block re-entry if entry/stop/target are unchanged
const lastSetupHash: Map<string, string> = new Map(); // key → "entry|stop|target" hash

function computeSetupHash(entry: number, stop: number, _target: number): string {
  // Hash only entry+stop (structural setup). Target varies with ATR each cycle
  // so including it defeats the purpose. Same entry+stop = same trade thesis.
  const tol = getSetupHashTolerance();
  const round = (v: number) => Math.round(v / (v * tol)) * (v * tol);
  return `${round(entry).toFixed(4)}|${round(stop).toFixed(4)}`;
}

// Memory audit fix: prune stale entries from recentCloses and lastSetupHash
function pruneReentryMaps(): void {
  const now = Date.now();
  const HASH_EXPIRY_MS = getSetupHashExpiryMs();
  const REENTRY_COOLDOWN_MS = getReentryCooldownMs();
  for (const [key, ts] of recentCloses) {
    if (now - ts > REENTRY_COOLDOWN_MS) {
      recentCloses.delete(key);
    }
  }
  for (const [key] of lastSetupHash) {
    const closeTs = recentCloses.get(key);
    if (!closeTs || now - closeTs > HASH_EXPIRY_MS) {
      lastSetupHash.delete(key);
    }
  }
}
// 2026-04-23 (B63-close → B64b): 24h VTS timeout REMOVED for normal operation, but a 7-day
// hard SAFETY VALVE is preserved. The Batch 18I force-close-stale gate below (L1453-ish) uses
// this constant to catch trades on illiquid pairs that stop receiving price updates. Without
// a finite cap, such trades would accumulate indefinitely in the openVirtualTrades Map
// (pre-B18I behavior). Longest observed hold in 7d+ of live data is ~22h, so 7 days should
// never fire for a normal trade — this exists only as zombie-cleanup.
//
// Prior cap was 24h. Removed because 63 timeouts in the 04-16 to 04-23 window (43 on 04-23
// alone) were converting trades that could have resolved naturally via TP/SL into "timeout"
// rows with ambiguous attribution — polluting learning data. Concurrent-open count has been
// comfortably below the 300 VTS cap (peak ~170 on 2026-04-22). If open-trade count starts
// approaching 300 consistently, revisit via cap raise (300 → 500) or timeout tightening.
//
// Langston flagged the POSITIVE_INFINITY interim value in B63-close commit review
// (2026-04-23 10:43 UTC) — the force-close-stale gate was effectively disabled. 7-day value
// restores the safety valve.
const MAX_HOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (safety valve only)

let phase10SessionTrades: Phase10TradeRecord[] = [];
let phase10SessionStartTime: number | null = null;

async function getPortfolioValue(): Promise<number> {
  try {
    const config = await systemConfigService.getConfig() as any;
    return config?.paperBalance ?? 1000;
  } catch {
    return 1000;
  }
}

async function getRiskPerTrade(): Promise<number> {
  try {
    const config = await systemConfigService.getConfig() as any;
    return config?.riskPerTrade ?? 0.02;
  } catch {
    return 0.02;
  }
}

function computePositionSize(
  portfolioValue: number, 
  riskPerTrade: number, 
  entryPrice: number, 
  stopPrice: number, 
  riskMultiplier: number
): number {
  const stopDistance = Math.abs(entryPrice - stopPrice) / entryPrice;
  if (stopDistance <= 0) return 0;
  
  const riskAmount = portfolioValue * riskPerTrade * riskMultiplier;
  const positionSize = riskAmount / stopDistance;
  
  const maxPositionSize = portfolioValue * 0.25;
  return Math.min(positionSize, maxPositionSize);
}

// B79.0m.b2: exported so xstock eval-cycle can mirror the crypto post-detect
// math without duplicating it.
export function computeFinalScore(
  hybridScore: number,
  predictiveConfidence: number,
  regimeWeight: number,
  decayPenalty: number
): number {
  const { FINAL_SCORE } = SCORE_WEIGHTS;
  return (
    hybridScore * FINAL_SCORE.HYBRID +
    predictiveConfidence * FINAL_SCORE.CONFIDENCE +
    regimeWeight * FINAL_SCORE.REGIME -
    decayPenalty * FINAL_SCORE.DECAY
  );
}

const vtsKrakenService = new KrakenService();

// Phase 14.1 HF8 (A3): BTC OHLC cache for defensive_hedge Spearman correlation analysis
// Fetched once per VTS cycle (before pair loop), consumed by callStrategyDetect
let btcOhlcCache: any[] = [];

async function fetchOHLCForPair(symbol: string): Promise<OHLCData[]> {
  try {
    // Phase 14.1 HF8 (A1+A2): 60-min candles (matches signal orchestrator) + 100 candle lookback
    // Batch 18: Use OHLC cache (5-min TTL) — 60-min candles only change once/hour
    const { ohlc } = await ohlcCache.getOHLCData(symbol, 60);
    
    if (!ohlc || ohlc.length === 0) {
      return [];
    }
    
    const ohlcData = ohlc.map((candle: any) => ({
      open: parseFloat(candle.open || candle[1]),
      high: parseFloat(candle.high || candle[2]),
      low: parseFloat(candle.low || candle[3]),
      close: parseFloat(candle.close || candle[4]),
      vwap: parseFloat(candle.vwap || candle[5] || 0) || undefined, // Batch 50: Kraken OHLC index [5]
      volume: parseFloat(candle.volume || candle[6] || 0),
      // B-NEW-53 fix: the cache candle (OHLCCandle) carries `time` in SECONDS, not
      // `timestamp` — so the old `candle.timestamp || candle[0]*1000` produced NaN
      // for crypto (object form, no `.timestamp`/`[0]`). Source it from `.time`.
      timestamp:
        candle.timestamp != null ? candle.timestamp
        : candle.time != null ? candle.time * 1000
        : candle[0] != null ? candle[0] * 1000
        : NaN,
    }));
    
    // Directive 11.4H.6A Task 3: Cache OHLC data for IMF passive learning calculations
    const { cacheOHLCData } = await import('../core/metrics/imf-metrics.js');
    cacheOHLCData(symbol, ohlcData);
    
    return ohlcData;
  } catch (error) {
    console.warn(`[11.0E.1][VTS] OHLC fetch failed for ${symbol}:`, error);
    return [];
  }
}

// Phase 14: simulateHybridScore REMOVED — replaced by computeRealHybridScore()
// from server/core/utils/vts-real-score.ts (imported above)

// Phase 14: simulatePredictiveConfidence REMOVED — replaced by getPredictiveConfidence()
// from server/core/utils/score-calculator.ts (already imported at line 35)

// Phase 14: simulateDecayPenalty REMOVED — replaced by computeRealDecayPenalty()
// from server/core/utils/vts-real-score.ts (imported above)

/**
 * Phase 14 HF6: Call strategy-specific detect function.
 * Maps strategy name to the correct StrategyEngine detect method.
 * Uses the EXACT same parameters as the signal orchestrator for parity.
 *
 * B79.0n.STRATEGY (2026-05-24): `symbol` + `assetClass` promoted from optional
 * to REQUIRED. The B79.0j fail-safe at the orb case is removed because the
 * TypeScript REQUIRED-parameter discipline now catches missing-arg sites at
 * compile time — no runtime null-return needed.
 *
 * B79.0m.b: exported so xstock-side eval-cycle.ts can dispatch strategy detect
 * without duplicating the per-strategy switch. Crypto path inside this module
 * still calls it locally (unchanged behavior).
 */
export function callStrategyDetect(
  strategy: string,
  indicators: any,
  ohlcData: any[],
  patternInput: PatternInput | null,
  symbol: string,         // B79.0n.STRATEGY — REQUIRED (was optional)
  assetClass: AssetClass, // B79.0n.STRATEGY — REQUIRED + typed (was optional `string`)
  // reorg-B3.3 (2026-06-24): per-PATH guard disposition. Default 'enforce' = the active/live
  // drop-everything behavior. The VTS callers opt into 'tag' so the QUALITY/EV guards
  // (rr_below_min, unreachable) DON'T drop at signal-gen — they flow forward to be tagged +
  // simulated (un-strangling the learning engine; corrects the inert reorg-B3.2). Per Option A
  // (Langston 2026-06-24) ONLY the crypto VTS path (vts-runner :1174) passes 'tag' this batch;
  // the xStock eval-cycle stays default-'enforce' until reorg-B3.3x.
  gateDisposition: GateDisposition = 'enforce',
): StrategySignal | null {
  // W2.1 (2026-06-06): central max-holding-ms stamp for the VTS dispatch path.
  // Guarantees every VTS-emitted signal carries an unambiguous
  // metadata.maxHoldingMs. Forward-prep only — VTS enforces holds via the 7-day
  // MAX_HOLD_MS valve, not this field (see stampMaxHoldingMs invariant).
  return stampMaxHoldingMs(
    callStrategyDetectRaw(strategy, indicators, ohlcData, patternInput, symbol, assetClass, gateDisposition),
    assetClass,
  );
}

function callStrategyDetectRaw(
  strategy: string,
  indicators: any,
  ohlcData: any[],
  patternInput: PatternInput | null,
  symbol: string,
  assetClass: AssetClass,
  gateDisposition: GateDisposition = 'enforce', // reorg-B3.3 — threaded to every detector (see callStrategyDetect)
): StrategySignal | null {
  switch (strategy) {
    // ── Quant strategies ──
    case 'vwap_pullback':
      return strategyEngine.detectVWAPPullback(indicators, STRATEGY_CALL_SETTINGS, ohlcData, assetClass, gateDisposition);
    case 'abcd_long':
      return strategyEngine.detectABCDLong(ohlcData, STRATEGY_CALL_SETTINGS, assetClass, gateDisposition);
    case 'sma_trend_ride':
      return strategyEngine.detectSMATrendRide(indicators, ohlcData, STRATEGY_CALL_SETTINGS, assetClass, gateDisposition);
    case 'breakout':
      // B72.2: detector reads params from module_constants 'strategy.breakout'.
      return strategyEngine.detectBreakout(ohlcData, {}, assetClass, gateDisposition);
    case 'mean_reversion':
      // B72.2: detector reads params from module_constants 'strategy.mean_reversion'.
      return strategyEngine.detectMeanReversion(indicators, ohlcData, {}, assetClass, gateDisposition);
    case 'range_trading':
    case 'range_trade':  // HF6B: Alias for canonical strategy map name
      // B72.2: detector reads params from module_constants 'strategy.range_trade'.
      return strategyEngine.detectRangeTrading(ohlcData, {}, assetClass, gateDisposition);
    case 'vwap_bounce':
      // B72.2: detector reads params from module_constants 'strategy.vwap_bounce'.
      return strategyEngine.detectVWAPBounce(indicators, ohlcData, {}, assetClass, gateDisposition);
    case 'liquidity_trap':
      // Batch 45: DISABLED — strategy produces bearish geometry (stop > entry, target < entry)
      // which is incompatible with long-only system. Confirmed by system manual spec and
      // web research: this is a bearish failed-breakout fade by design. Bullish redesign
      // (failed breakdown below support → long) is future work.
      setNullReason('strategy_disabled_bearish');
      return null;
    case 'dhma':
      // B72.2: detector reads params from module_constants 'strategy.dhma'.
      return strategyEngine.detectDHMA(indicators, ohlcData, {}, assetClass, gateDisposition);
    // ── Pattern + Hybrid strategies ──
    case 'morning_star':
      return strategyEngine.detectMorningStar(indicators, ohlcData, patternInput, assetClass, gateDisposition);
    case 'inside_bar_reversal':
      return strategyEngine.detectInsideBarReversal(indicators, ohlcData, patternInput, assetClass, gateDisposition);
    case 'support_bounce':
      return strategyEngine.detectSupportBounce(indicators, ohlcData, patternInput, assetClass, gateDisposition);
    case 'pivot_shift':
      return strategyEngine.detectPivotShift(indicators, ohlcData, patternInput, assetClass, gateDisposition);
    case 'reverse_impulse':
      return strategyEngine.detectReverseImpulse(indicators, ohlcData, patternInput, assetClass, gateDisposition);
    case 'defensive_hedge':
      // Phase 14.1 HF8 (A3): Pass BTC candles for Spearman correlation (needs >= 32 candles)
      // B79.0n.STRATEGY: assetClass threads BEFORE btcCandles per wrapper signature.
      return strategyEngine.detectDefensiveHedge(indicators, ohlcData, patternInput, btcOhlcCache.length >= 32 ? btcOhlcCache : undefined, assetClass, gateDisposition);
    case 'adaptive_flow':
      return strategyEngine.detectAdaptiveFlow(indicators, ohlcData, patternInput, assetClass, gateDisposition);
    case 'volatility_edge':
      return strategyEngine.detectVolatilityEdge(indicators, ohlcData, patternInput, assetClass, gateDisposition);
    // B63: Strong Bull Trend (Path D) — QUANT, LONG-only
    case 'strong_bull_trend':
      return strategyEngine.detectStrongBullTrend(indicators, ohlcData, patternInput, assetClass, gateDisposition);
    // B79.0d strategy. B79.0n.STRATEGY: ctx promoted to REQUIRED; fail-safe removed.
    case 'orb':
      return strategyEngine.detectORB(symbol, ohlcData as any, indicators, { assetClass, symbol }, gateDisposition);
    default:
      console.warn(`[HF6][VTS] Unknown strategy: ${strategy}, no detect function available`);
      return null;
  }
}

async function generatePhase10Signal(
  symbol: string,
  priceData: CachedPrice,
  ohlcData: OHLCData[],
  pool: 'ideal' | 'rotational',
  strategyOverride?: StrategyDefinition,
  filterTier?: 'standard' | 'relaxed',
  sourcePool?: string, // Batch 37: Family-qualified source pool
  counters?: any,
  preDetectedPatterns?: any[], // Batch 44: Pre-detected patterns from outer loop (avoids duplicate scanPatterns)
  propagatedDbs?: { score: number; category: string; slope?: number } // B63: DBS pre-filter propagation (hard contract)
): Promise<{ signal: VirtualSignal; tradeRecord: Phase10TradeRecord } | null> {
  // B79.0n.PATTERN-DETECT (2026-05-24, post-Step-8 iteration): capture-and-reuse
  // asset-class resolution at function entry. Replaces the prior pattern of
  // calling resolveAssetClass() at each downstream consumer (which threw on
  // B69-unregistered symbols like H/USD and amplified COLLISION_RESOLVE WARNs
  // for collision-set symbols like DASH/SUI). Uses safeResolveAssetClass —
  // null → skip the pair cleanly (no signal generated). Pre-existing B79.0n.MCE
  // line at the MCE call below now consumes the captured _assetClass instead
  // of re-resolving (eliminates one duplicate resolve per pair-cycle, dedupes
  // WARN logs by ~3x for collision symbols, and converts a fail-hard throw on
  // unregistered symbols to a clean skip-return-null — Langston Step 8 flag).
  const _assetClass = safeResolveAssetClass(symbol, 'kraken');
  if (_assetClass === null) {
    // safeResolveAssetClass already logged a WARN with the symbol; nothing more
    // to do — caller treats null return as "no signal possible for this pair".
    return null;
  }

  // Phase 13: MCE computes regime (uses cache from main loop call)
  const mce = getMarketContextEngine();
  // B63: DBS is a hard pipeline contract — must be propagated from scanner via pair object.
  // B79.0n.MCE: required assetClass parameter (captured once above, reused here).
  const mceContext = mce.computeContext(symbol, ohlcData, priceData.price, priceData.volume24h ?? 0, undefined, propagatedDbs, _assetClass);
  const regimeResult = mceContext.raw;
  const regime = regimeResult.regime;

  // Directive 11.5 Task 2: Z-Score normalization for regime classification
  const zScoreResult = getNormalizedRegimeWithDetails({
    adx: regimeResult.adx,
    vol: regimeResult.volatility,
    momentum: regimeResult.momentum ?? 0
  });
  
  if (zScoreResult.isWarmedUp && cycleCount % 10 === 0) {
    console.log(`[11.5][ZScore] ${symbol}: regime=${regime} zScores={adx=${zScoreResult.zScores.adxZ.toFixed(2)}, vol=${zScoreResult.zScores.volZ.toFixed(2)}, mom=${zScoreResult.zScores.momZ.toFixed(2)}}`);
  }
  
  const riskMultiplier = getRegimeRiskMultiplier(regime);
  
  // Directive 11.4C.3 Task 2: Pattern injection - detect patterns from OHLC data
  const candles = ohlcData.map(o => ({
    timestamp: o.timestamp,
    open: o.open,
    high: o.high,
    low: o.low,
    close: o.close,
    volume: o.volume
  }));
  
  // Batch 44: Use pre-detected patterns when available (avoids duplicate scanPatterns call)
  // B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` reused from
  // the captured _assetClass at function entry (Langston Step 8 iteration —
  // capture-and-reuse eliminates COLLISION_RESOLVE WARN amplification).
  const detectedPatterns = preDetectedPatterns ?? scanPatterns(candles, symbol, _assetClass);
  const detectedPattern = detectedPatterns.length > 0 ? detectedPatterns[0] : null;
  if (counters && isQuantPool(sourcePool)) {
    if (detectedPattern) { counters.quantPatternDetected = (counters.quantPatternDetected ?? 0) + 1; }
    else { counters.quantPatternNoDetection = (counters.quantPatternNoDetection ?? 0) + 1; }
  }
  
  // ══════════════════════════════════════════════════════════════════════════════
  // Directive 11.8C: Multi-Strategy Regime-Scoped Simulation
  // When strategyOverride is provided, use it directly (bypasses DSS-style selection).
  // When not provided, fall back to context-aware selection (legacy single-strategy path).
  // ══════════════════════════════════════════════════════════════════════════════
  let signalType: CanonicalSignalType;
  let strategy: string;
  let canonicalPatternType: PatternType | null;
  let selectionReason: string;
  const isMultiStrategy = !!strategyOverride;

  if (strategyOverride) {
    signalType = strategyOverride.signalType;
    strategy = strategyOverride.strategyKey;
    canonicalPatternType = (strategyOverride.patternType as PatternType | null) ?? null;
    selectionReason = 'regime_scoped';
    console.log(`[11.8C][VTS] ${symbol}: Using regime-scoped strategy=${strategy} signalType=${signalType}`);
  } else {
    const sHash = symbolToHash(symbol);
    // B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` reused from
    // the captured _assetClass at function entry (Langston Step 8 iteration).
    const strategySelection = selectContextAwareStrategy(
      regime,
      detectedPattern?.pattern ?? null,
      sHash,
      _assetClass,
    );
    signalType = strategySelection.signalType;
    strategy = strategySelection.strategy;
    canonicalPatternType = strategySelection.patternType as PatternType | null;
    selectionReason = strategySelection.selectionReason;
    
    if (!signalType) {
      console.warn(`[11.4C.3-C][VTS] Unmapped strategy: ${strategy} for regime ${regime}`);
      signalType = 'HYBRID';
    }
    
    if (selectionReason !== 'primary') {
      console.log(`[11.4G][VTS] ${symbol}: ${signalType}/${strategy} selected via ${selectionReason}`);
    }
    
    if (signalType === 'PATTERN' && !detectedPattern && selectionReason === 'diversity') {
      console.log(`[11.4C.3][VTS] ${symbol}: PATTERN signal from diversity without pattern - reverting to QUANT`);
      signalType = 'QUANT';
    }
  }

  const patternType: PatternType | null = canonicalPatternType;
  
  if (detectedPattern && detectedPattern.pattern !== canonicalPatternType) {
    console.debug(`[11.4G][VTS] ${symbol}: Detected ${detectedPattern.pattern} → canonical ${canonicalPatternType}`);
  }
  
  // Phase 14 HF6: Call strategy-specific detect function for real entry/stop/target
  // Build indicators (same format as signal orchestrator lines 857-864)
  // B63: Pass through DBS fields so detect() guards and strong_bull_trend can read them.
  // B63 Item 12: Attach strongTrendGeometryOverride when pair is routed via strong-trend lane.
  // vwap_pullback consumes the override per Item 11 to use Variant E geometry (4×ATR stop, 3R target).
  // Other strategies routed via this lane ignore the field and use their own geometry.
  const isStrongTrendLane = sourcePool === 'quant-strong_trend';
  const stratDetectIndicators = {
    vwap: mceContext.indicators.vwap,
    sma: mceContext.indicators.sma,
    currentPrice: mceContext.indicators.currentPrice,
    volume: mceContext.indicators.volume,
    high24h: mceContext.indicators.high24h,
    low24h: mceContext.indicators.low24h,
    atr: mceContext.indicators.atr,
    dbsScore: propagatedDbs?.score,
    dbsCategory: propagatedDbs?.category,
    dbsSlope: propagatedDbs?.slope,
    strongTrendGeometryOverride: isStrongTrendLane
      ? { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 }
      : undefined,
  };

  // Build patternInput from detected patterns (same as orchestrator lines 1048-1070)
  // Batch 44: Always normalize detected pattern name through normalizePatternToCanonical()
  // before passing to strategy detect(). This is the single source of truth for pattern
  // name mapping (PATTERN_TO_CANONICAL in canonical-regime-strategy-map.ts).
  // B57 Fix: Match pattern to strategy's expected patternType instead of global best
  // When canonicalPatternType is set (from strategyOverride), filter to matching patterns first
  const matchingPatterns = canonicalPatternType
    ? detectedPatterns.filter((p: any) => normalizePatternToCanonical(p.pattern) === canonicalPatternType)
    : detectedPatterns;
  const bestDetectedPattern = matchingPatterns.length > 0
    ? matchingPatterns.reduce((best: any, p: any) => p.strength > best.strength ? p : best, matchingPatterns[0])
    : null;

  const canonicalPatternName = bestDetectedPattern
    ? normalizePatternToCanonical(bestDetectedPattern.pattern)
    : null;

  const stratPatternInput: PatternInput | null = bestDetectedPattern ? {
    pattern: canonicalPatternName ?? bestDetectedPattern.pattern,
    direction: bestDetectedPattern.direction as 'BUY' | 'SELL',
    strength: bestDetectedPattern.strength,
    metadata: {
      ...bestDetectedPattern,
      parentHigh: bestDetectedPattern.metadata?.parentHigh ?? (candles.length >= 2 ? candles[candles.length - 2].high : 0),
      parentLow: bestDetectedPattern.metadata?.parentLow ?? (candles.length >= 2 ? candles[candles.length - 2].low : 0),
      compressionRatio: bestDetectedPattern.metadata?.compressionRatio ?? 0.5,
      pinbarLow: bestDetectedPattern.metadata?.pinbarLow ?? (candles.length > 0 ? candles[candles.length - 1].low : 0),
      engulfingLow: bestDetectedPattern.metadata?.engulfingLow ??
        (candles.length >= 2 ? Math.min(candles[candles.length - 1].low, candles[candles.length - 2].low) : 0),
      engulfRatio: bestDetectedPattern.metadata?.engulfRatio ?? 1.0,
      hasGap: bestDetectedPattern.metadata?.hasGap ?? false,
      recoveryRatio: bestDetectedPattern.metadata?.recoveryRatio ?? 0,
      aPointLow: bestDetectedPattern.metadata?.aPointLow,
      bPointHigh: bestDetectedPattern.metadata?.bPointHigh,
      cPointLow: bestDetectedPattern.metadata?.cPointLow,
      cPointHigh: bestDetectedPattern.metadata?.cPointHigh,
    }
  } : null;

  // Call strategy-specific detect function (replaces generic volatility formula)
  const ohlcAsAny = ohlcData as any[];
  // B79.0j: thread symbol + assetClass for ORB (other strategies ignore them).
  // P19-B4a (C4 / #230): reuse the captured _assetClass (non-null past the :981
  // function-entry skip) instead of re-resolving with a `?? 'crypto_spot'` default —
  // an unclassifiable symbol already returned null above, so no mislabel can occur.
  const _resolvedAssetClass = _assetClass;
  // reorg-B3.3 (2026-06-24): crypto VTS path opts into 'tag' — the QUALITY/EV guards (rr_below_min,
  // unreachable) no longer DROP the signal at the strategy; they fall through tagged, then the existing
  // reorg-B3.2 normalizer below (:~1189) re-derives the same verdict, sets vtsGateVerdict, and simulates
  // to close. This is what makes reorg-B3.2 stop being inert (the strategy was dropping upstream of it).
  // ACTIVE/LIVE (the orchestrator) omit the arg → default 'enforce' → suppression unchanged. (Option A:
  // xStock eval-cycle stays default-'enforce' this batch; un-strangled in reorg-B3.3x.)
  const strategySignal = callStrategyDetect(strategy, stratDetectIndicators, ohlcAsAny, stratPatternInput, symbol, _resolvedAssetClass, 'tag');

  if (!strategySignal) {
    console.log(`[HF6][VTS] ${symbol}: Strategy ${strategy} returned null - conditions not met, skipping`);
    return null;
  }

  // Use strategy-computed entry/stop/target (replaces generic volatility formula)
  strategySignal.symbol = symbol;
  const entryPrice = strategySignal.entryPrice;
  const stopLoss = strategySignal.stopPrice;
  // reorg-B2 (Piece A): central target-floor lift + universal RR gate (per-class) — the VTS
  // convergence point. VTS calls strategyEngine.detect* DIRECTLY (not via the orchestrator),
  // so the SAME normalizer must run here too, or sim-to-live target parity breaks.
  const _b2Gate = getPerClassTargetGate(_assetClass, strategy);
  const _b2 = normalizeAndGateTarget({
    entryPrice, stopPrice: stopLoss, targetPrice: strategySignal.targetPrice,
    floorPct: _b2Gate.floorPct, minRR: _b2Gate.minRR,
    atr: mceContext.indicators.atr, reachAtrMax: _b2Gate.reachAtrMax,
  });
  // reorg-B3.2 (2026-06-24, CC-B + Langston + Kyle consensus): VTS = TAG-DON'T-DROP for the QUALITY/EV
  // gates. The reorg-B2 gate, wired here for sim-to-live target parity, collapsed VTS volume 95-97%
  // (opens ~150/day → 3-5/day, staging-confirmed) by hard-dropping every gated signal — strangling the
  // learning engine AND making reorg-B2.3 CIRCULAR (you cannot calibrate the RR floor from a population
  // the floor already filtered; only the REALIZED win/loss of rejected trades can falsify the floor).
  // Fix: on the VTS (telemetry-only learning) path, the QUALITY gates (rr_below_min, unreachable) now
  // LABEL the trade with their verdict and let it simulate to a close with the strategy's NATIVE target
  // — capturing the counterfactual outcome the active gate would reject. Only DATA-VALIDITY failures
  // (invalid_atr, invalid_geometry) still DROP, because simulating garbage isn't learning signal. The
  // ACTIVE + LIVE paths keep the gate SUPPRESSING (same gate eval, different disposition per path); the
  // verdict rides onto the trade record (vtsGateVerdict, below) so analysis can always filter back to
  // the gate-passing "what active would do" view.
  let vtsGateVerdict: 'passed' | 'rr_below_min' | 'unreachable' = 'passed';
  if (!_b2.ok) {
    if (_b2.reason === 'rr_below_min' || _b2.reason === 'unreachable') {
      // QUALITY/EV gate: TAG-AND-SIMULATE on the VTS learning path (no drop). POSITIVE-NARROW on the two
      // quality reasons so vtsGateVerdict assigns type-safely under strict-null — TargetNormalizeResult
      // is a FLAT type, so `!_b2.ok` does NOT narrow `_b2.reason` (Langston Step-4 catch). This also
      // future-proofs: a NEW reason added to the normalizer later falls through to the DROP default
      // below rather than being silently mistagged as a quality verdict.
      vtsGateVerdict = _b2.reason;
      console.log(`[reorg-B3.2][VTS][TAG_NO_DROP] ${symbol}/${strategy} would-gate=${_b2.reason} rr=${_b2.rr.toFixed(2)} — simulating anyway for learning data (active path still suppresses).`);
    } else {
      // DROP — data-validity garbage (invalid_atr, invalid_geometry, or any unknown/missing reason),
      // never a learning signal. invalid_atr stays LOUD (wiring/data bug, full parity with the active path).
      if (_b2.reason === 'invalid_atr') {
        console.error(`[reorg-B2][TARGET_GATE][VTS][INVALID_ATR] ${symbol}/${strategy} — ATR unavailable (mceContext.indicators.atr missing). Wiring bug — investigate.`);
      }
      logSkippedSignal({ symbol, reason: _b2.reason === 'invalid_atr' ? 'Target_Invalid_ATR' : 'Target_Invalid_Geometry', regime, strategy, source: 'VTS' });
      setNullReason(_b2.reason === 'invalid_atr' ? 'target_invalid_atr' : 'target_invalid_geometry');
      return null;
    }
  }
  // Gate PASSED → _b2.targetPrice (reorg-B2.1 dropped the floor-lift, so this already equals the native
  // target). TAG-DON'T-DROP → the strategy's NATIVE target so the realized outcome reflects the real signal.
  const takeProfit = _b2.ok ? _b2.targetPrice : strategySignal.targetPrice;

  // Batch 47f15: Setup-hash suppression — block re-entry if same entry/stop/target
  const setupKey = `${symbol}:${strategy}`;
  const currentHash = computeSetupHash(entryPrice, stopLoss, takeProfit);
  const prevHash = lastSetupHash.get(setupKey);
  if (prevHash && prevHash === currentHash) {
    setNullReason('identical_setup_suppressed');
    return null;
  }

  // Compute proportional target distance for downstream calcs (lines 653, 665)
  const dynamicTarget = Math.abs(takeProfit - entryPrice) / entryPrice;
  const spread = priceData.ask > 0 && priceData.bid > 0
    ? (priceData.ask - priceData.bid) / priceData.price
    : 0.001;
  
  // Phase 14: Real strategy score calculation (no Math.random)
  const hybridScore = computeRealHybridScore(strategy, mceContext.indicators, ohlcData, regime);
  // B79.0n.SCORING (2026-05-26): assetClass threaded for per-class cache-key isolation.
  // Reuses _resolvedAssetClass captured at line 1086 (safeResolveAssetClass + crypto_spot fallback).
  const predictiveConfidence = getPredictiveConfidence(_resolvedAssetClass, symbol, regime, strategy);

  // B62: Half-wired DBS modifier removed. Was dead code — biasModifier was computed
  // but never consumed. See B61 provisional findings report.

  // Phase 15b B61: observational telemetry emit (no-op unless DT_PHASE15B_DBS_TELEMETRY=1).
  // Half-wire removed — emitter retained for audit continuity.
  const biasCategory = mceContext.directionalBias?.category ?? 'NEUTRAL';
  emitConsumerTelemetry({
    cycleId: Date.now(),
    site: 'vts-runner.ts:877',
    symbol,
    strategy,
    dbsCategory: biasCategory,
    dbsModifier: 1.0,
    confidencePreDBS: predictiveConfidence,
    confidencePostDBS: predictiveConfidence,
    finalScorePreDBS: hybridScore,
    finalScorePostDBS: hybridScore,
    dbsApplied: false,
  });
  
  // ══════════════════════════════════════════════════════════════════════════════
  // Directive 11.7R-E: HARD GOVERNANCE FILTER (BEFORE SCORING)
  // ══════════════════════════════════════════════════════════════════════════════
  // This is the authoritative enforcement point. If a strategy is not eligible:
  // - ❌ Never scored
  // - ❌ Never ranked  
  // - ❌ Never generates a virtual trade
  // ══════════════════════════════════════════════════════════════════════════════
  // Phase 14: Governance gate REMOVED from VTS path — generates trades for ALL strategies
  // Governance remains in active trading path (paper-execution-engine.ts processSignal)

  // Compute global stability (kept for observability — stored on trade record)
  const stabilityResult = computeGlobalStability(
    zScoreResult.isWarmedUp ? Math.abs(zScoreResult.zScores.volZ) : 0.5,
    zScoreResult.isWarmedUp ? zScoreResult.zScores.volZ : 0,
    predictiveConfidence
  );
  const regimeStability: RegimeStability = stabilityResult.stability;
  // ══════════════════════════════════════════════════════════════════════════════
  
  // ══════════════════════════════════════════════════════════════════════════════
  // Directive 11.7S — Strategy Mode Modulation
  // ══════════════════════════════════════════════════════════════════════════════
  // Assign mode based on global regime stability (after governance, before scoring)
  const strategyMode: StrategyMode = resolveStrategyMode(regimeStability);
  const modeOverlay: StrategyModeOverlay = getModeOverlay(strategyMode);
  
  // 11.7S: Confidence floor check — VTS COLD-START BYPASS
  // VTS is a simulation system that generates virtual trades for ML calibration.
  // Blocking signals at the confidence floor creates a cold-start paradox:
  //   no trades → no data → confidence stuck at 0.50 → no trades (forever).
  // The bypass lets VTS generate trades so the ML calibration service can compute
  // real confidence values. The mode overlay (position sizing, stops) still applies.
  // Downstream gates (Net EV kernel, ROI gate, strategy guardrails) remain active.
  if (!meetsConfidenceFloor(predictiveConfidence, regimeStability)) {
    console.log(`[11.7S][VTS] BELOW_FLOOR (bypassed): ${symbol} ${strategy} - confidence ${predictiveConfidence.toFixed(2)} < floor ${modeOverlay.confidenceFloor} (mode=${strategyMode})`);
  }
  
  console.log(`[11.7S][VTS] Mode: ${strategyMode} | Size×${modeOverlay.positionSizeMultiplier} | Stop×${modeOverlay.stopLossDistanceMultiplier} | TP×${modeOverlay.takeProfitDistanceMultiplier}`);
  // ══════════════════════════════════════════════════════════════════════════════
  
  // Directive 11.4H.4A Task 1: Use dynamic regime scoring based on ADX + volatility
  const regimeScoreRaw = calculateRegimeScore(regime, {
    adx: regimeResult.adx,
    volatility: regimeResult.volatility
  });
  const regimeWeight = regimeScoreRaw / 100; // Normalize to 0-1 range for finalScore calculation
  const decayPenalty = computeRealDecayPenalty(); // Phase 14: 0 for fresh signals
  
  const finalScore = computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty);
  
  // B79.0n.MCE: assetClass REQUIRED — resolved from the symbol.
  // P19-B4a (C4 / #230): reuse the captured _assetClass (non-null past the :981 skip)
  // rather than re-resolving with a crypto_spot default — no mislabel-by-construction.
  const costMetrics = getCachedCostMetrics(symbol, _assetClass);
  const frictionCost = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + costMetrics.spread;
  
  // ══════════════════════════════════════════════════════════════════════════════
  // Directive 11.8B-A2: Canonical Net EV Gate using computeNetExpectancyKernel()
  // VTS must use identical math as DSS and Paper Execution for EV decisions
  // ══════════════════════════════════════════════════════════════════════════════
  const estimatedSlippage = costMetrics.slippage || 0.001;
  // Canonical friction formula: 2 × fee + 2 × slippage + spread (round-trip costs)
  const totalFriction = (costMetrics.fee * 2) + (estimatedSlippage * 2) + spread;
  
  // Convert predictiveConfidence to DI scale (0-100) for kernel
  // predictiveConfidence is typically 0-1, so scale to 0-100
  const DI = Math.min(100, Math.max(0, predictiveConfidence * 100));
  
  const kernelResult = computeNetExpectancyKernel({
    entryPrice,
    stopPrice: stopLoss,
    targetPrice: takeProfit,
    totalFriction,
    DI,
    // B63: Path-aware pWin for Path D. Strong-trend signals use DBS magnitude (not DI) for win probability.
    sourcePool,
    dbsScore: propagatedDbs?.score,
    // B72: caller-injected pWin params (preserves kernel purity).
    minPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_floor',     _VTS_GK),
    maxPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_ceiling',   _VTS_GK),
    diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', _VTS_GK),
  });
  
  // ══════════════════════════════════════════════════════════════════════════════
  // P19-B7.2b (OBJ-A): the SHARED maker/taker best-of-both entry decision.
  // The VTS calls the SAME `decideMakerTaker` the active path uses (F6 — one shared
  // function, no duplicated economics), HERE, BEFORE the VTS Net-EV gate below, so the
  // VTS evaluates on the best-of-both netEV too (Kyle: the decision is a service
  // SHARED across active-live, active-paper, AND the VTS). NOTE (Kyle 2026-07-01): the
  // VTS has NO SQE — this decision is standalone and unrelated to the SQE; on the
  // ACTIVE path the shared decision sits just BEFORE the SQE (not inside it — the SQE
  // stays calculation-free, a pure quality gate). The taker leg passes the SAME inputs
  // the kernel above just used (identical DI / sourcePool / dbsScore / pWin params /
  // canonical friction), so `decision.takerNetEV` == `kernelResult.netEV` — only the
  // maker leg + the haircut are new. Data-fenced: VTS maker fills are model-vs-model
  // (non-calibration); real adverse selection is Phase-21.
  // ══════════════════════════════════════════════════════════════════════════════
  const _vtsFriction = getFrictionForAssetClass(_assetClass);
  const _vtsMtDecision = decideMakerTaker({
    entryPrice,
    stopPrice: stopLoss,
    targetPrice: takeProfit,
    costs: costMetrics,
    feeRateMaker: _vtsFriction.feeRateMaker,
    feeRateTaker: _vtsFriction.feeRateTaker,
    DI,
    sourcePool,
    dbsScore: propagatedDbs?.score,
    minPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_floor',     _VTS_GK),
    maxPWin:      getCachedNumberRequired('expectancy_kernel',     'pwin_ceiling',   _VTS_GK),
    diPWinFactor: getCachedNumberRequired('directional_integrity', 'di_pwin_factor', _VTS_GK),
    signalStrength: finalScore,
    urgencyClass: entryUrgencyClassForFamily(STRATEGY_FAMILY_MAP[strategy]),
    haircut: resolveMakerTakerHaircut(_assetClass),
  });
  // The per-side entry fee actually used by the chosen mode (carried onto the trade record).
  const _vtsEntryFeeRate = _vtsMtDecision.chosenMode === 'maker' ? _vtsFriction.feeRateMaker : _vtsFriction.feeRateTaker;
  console.log(`[P19-B7.2b][VTS][MAKER_TAKER] ${symbol}/${strategy}: chose ${_vtsMtDecision.chosenMode} (taker=${_vtsMtDecision.takerNetEV.toFixed(6)}, maker-adj=${_vtsMtDecision.makerNetEVAdjusted.toFixed(6)})`);

  // Batch 52 Fix 19C: All byStrategy counter increments moved to caller (runPhase10SimulationCycle)
  // to prevent double-counting. Inner function only sets nullReason for caller to classify.

  // Batch 18L Option A: VTS-specific relaxed Net EV gate
  // Active trading still uses strict netEV > 0 (in signal-orchestrator.ts)
  // VTS allows marginally negative EV for ML boundary learning
  // Signals with slightly negative EV teach the model where the profitability edge is
  // P19-B7.2b (OBJ-A): gate on the CHOSEN best-of-both netEV (not the taker-only
  // kernelResult) — a taker-marginal / maker-better signal is evaluated on its best
  // option, consistent with the active path.
  if (_vtsMtDecision.chosenNetEV <= VTS_NET_EV_FLOOR) {
    logSkippedSignal({
      symbol,
      reason: 'Net_EV_Negative',
      regime,
      signalType,
      strategy,
      source: 'VTS'
    });
    console.log(`[18L][NetEV] Skipping ${symbol}: chosen ${_vtsMtDecision.chosenMode} Net EV=${_vtsMtDecision.chosenNetEV.toFixed(6)} <= ${VTS_NET_EV_FLOOR} (taker=${kernelResult.netEV.toFixed(6)}, rawEV=${kernelResult.rawEV.toFixed(6)}, friction=${totalFriction.toFixed(6)})`);
    // Batch 50: Mark as post-signal rejection so caller doesn't count as strategy null
    setNullReason('net_ev_rejected');
    return null;
  }
  
  // ══════════════════════════════════════════════════════════════════════════════
  // Batch 18L Option C: ROI gate SKIPPED for VTS
  // Active trading still enforces ROI gate (in signal-orchestrator.ts / SQE)
  // VTS relaxes this because:
  //   1. Net EV gate already validates trade geometry (even with relaxed floor)
  //   2. ROI gate is redundant filtering for ML learning purposes
  //   3. ML needs to see trades across ROI spectrum to learn optimal thresholds
  // The ROI values are still logged for ML feature extraction
  // ══════════════════════════════════════════════════════════════════════════════
  // B-4.5: fee REQUIRED on the ROI fns; pass the SAME resolved costs the
  // Net-EV gate above just used (costMetrics.fee = DB-governed per-class taker).
  const roiDetails = getROIDetails(entryPrice, takeProfit, regime, _assetClass, predictiveConfidence, costMetrics.fee, estimatedSlippage);
  if (!isSignalProfitable(entryPrice, takeProfit, regime, _assetClass, predictiveConfidence, costMetrics.fee, estimatedSlippage)) {
    console.log(`[18L][ROI_Gate] VTS BYPASS: ${symbol} ROI ${roiDetails.roiPercent} < min ${roiDetails.minROIPercent} — allowing for ML learning`);
  }
  
  // Directive 11.5 Task 5: Strategy-Specific Guardrails
  // Require ADX > 25 for SMA-based trend strategies (only meaningful in trending markets)
  if (strategy === 'sma_trend_ride' && regimeResult.adx < 25) {
    logSkippedSignal({
      symbol,
      reason: 'ADX_Guard',
      regime,
      signalType,
      strategy,
      source: 'VTS'
    });
    console.log(`[11.5][Guard] Skipping ${symbol}: SMA Trend requires ADX > 25, got ADX=${regimeResult.adx.toFixed(1)}`);
    return null;
  }
  
  // Note: Directive 11.7R-E hard governance filter applied before scoring (lines 386-418)
  // Note: Directive 11.7S mode overlay assigned after governance (lines 421-444)
  // If we reach here, strategy is eligible for execution with mode overlay applied
  
  const portfolioValue = await getPortfolioValue();
  const riskPerTrade = await getRiskPerTrade();
  const basePositionSize = computePositionSize(portfolioValue, riskPerTrade, entryPrice, stopLoss, riskMultiplier);
  
  // Directive 11.7S: Apply mode overlay to position size
  const positionSize = basePositionSize * modeOverlay.positionSizeMultiplier;
  
  // Directive 11.6H: Compute capital allocation - fixed USD exposure capped at 25% of portfolio
  const maxPositionSize = portfolioValue * 0.25;
  const dollarValue = Math.min(positionSize, maxPositionSize);
  
  // Directive 11.6H: Convert to variable quantity based on entry price
  const quantity = dollarValue / entryPrice;
  
  // Directive 11.7S: Apply mode overlay to stop loss and take profit distances
  // B63 Item 14: Strong-trend lane mode-overlay BYPASS. Trades routed via quant-strong_trend
  // use their NATIVE geometry (no mode-overlay multiplication). Rationale: mode-overlay's
  // asymmetric stop×1.2 + target×0.8 (DEFENSIVE) or stop×1.5 + target×0.6 (SURVIVAL) silently
  // destroys the 2:1 (strong_bull_trend) or 3:1 (vwap_pullback Variant E) RR that the
  // strong-trend archetype requires. Reversal/continuation archetypes still use the overlay
  // as designed — the bypass is SCOPED to the strong-trend lane only.
  const useNativeGeometry = sourcePool === 'quant-strong_trend';
  const stopDistance = entryPrice - stopLoss;
  const targetDistance = takeProfit - entryPrice;
  const adjustedStopDistance = useNativeGeometry
    ? stopDistance
    : stopDistance * modeOverlay.stopLossDistanceMultiplier;
  const adjustedTargetDistance = useNativeGeometry
    ? targetDistance
    : targetDistance * modeOverlay.takeProfitDistanceMultiplier;
  const adjustedStopLoss = entryPrice - adjustedStopDistance;
  const adjustedTakeProfit = entryPrice + adjustedTargetDistance;
  
  console.log(`[VTS][11.6H][Sizing] ${symbol}: $${dollarValue.toFixed(2)} exposure → ${quantity.toFixed(6)} units @ $${entryPrice.toFixed(4)}`);
  console.log(`[11.7S][VTS] ${symbol}: Stop ${stopLoss.toFixed(4)}→${adjustedStopLoss.toFixed(4)} | TP ${takeProfit.toFixed(4)}→${adjustedTakeProfit.toFixed(4)} (mode=${strategyMode})`);
  
  // Batch 45: Post-close re-entry cooldown (B72: from module_constants)
  const cooldownKey = `${symbol}:${strategy}`;
  const lastClose = recentCloses.get(cooldownKey);
  if (lastClose && Date.now() - lastClose < getReentryCooldownMs()) {
    setNullReason('reentry_cooldown');
    return null;
  }

  // B63 Item 11 — Strong-trend lane arbitration. When a pair is routed via the strong-trend
  // lane, multiple strategies (currently strong_bull_trend + vwap_pullback) are eligible to
  // fire on the SAME pair in the SAME cycle. Scope doc committed to a tie-break rule; we
  // implement it here as first-claim-wins (same pattern as the existing per-strategy duplicate
  // guard immediately below).
  //
  // Rationale for first-claim-wins vs strict R-multiple arbitration:
  //   (a) strategy dispatch iterates serially per pair — the first strategy to produce a valid
  //       signal wins by natural order. R-multiple tie-break would require collecting all
  //       lane-eligible signals before opening any, which is a larger refactor.
  //   (b) practically, vwap_pullback (requires pullback-to-VWAP + reversal pattern) and
  //       strong_bull_trend (requires Donchian breakout + anti-exhaustion) rarely satisfy
  //       their entry conditions on the same bar — same-cycle conflicts should be uncommon.
  //   (c) extending to explicit R-multiple arbitration remains available as a follow-up.
  //
  // Null-reason: strong_trend_lane_conflict (distinguishable in logs from duplicate_position).
  if (sourcePool === 'quant-strong_trend') {
    const strongTrendLaneStrategies = new Set(['strong_bull_trend', 'vwap_pullback']);
    const laneConflict = Array.from(openVirtualTrades.values()).find(t =>
      t.symbol === symbol &&
      t.strategy !== strategy &&
      strongTrendLaneStrategies.has(t.strategy)
    );
    if (laneConflict) {
      console.log(`[B63][Item 11][LANE_CONFLICT] ${symbol}: ${strategy} blocked — already open via ${laneConflict.strategy} in strong-trend lane`);
      setNullReason('strong_trend_lane_conflict');
      return null;
    }
  }

  // Batch 19G HF1: Strict duplicate guard — only 1 open trade per symbol+strategy combo
  // Previously allowed 3 (Batch 18L Option B), now aligned with active trading policy
  const existingTradeCount = Array.from(openVirtualTrades.values()).filter(t =>
    t.symbol === symbol && t.strategy === strategy
  ).length;
  if (existingTradeCount >= getVtsMaxConcurrentPerCombo()) {
    logSkippedSignal({
      symbol,
      reason: 'Duplicate_Position_Max',
      regime,
      signalType,
      strategy,
      source: 'VTS'
    });
    console.log(`[18L][DUP_GUARD] Skipping ${symbol}/${strategy}: ${existingTradeCount}/${getVtsMaxConcurrentPerCombo()} concurrent VTS trades`);
    // Batch 50: Mark as post-signal rejection so caller doesn't count as strategy null
    setNullReason('duplicate_position');
    return null;
  }

  // Batch 53 Fix 2: Entry validation — verify current market price is viable for the trade
  // Prevents zero-duration trades caused by opening at a calculated entry while market price
  // has already moved past the stop or target. Direction-aware: for long trades, current price
  // must be above stop and below target with enough room after friction.
  const currentMarketPrice = priceData.price;
  const minViableDistance = frictionCost * currentMarketPrice * 2; // At least 2× friction cost of room
  if (currentMarketPrice <= adjustedStopLoss) {
    console.log(`[B53][ENTRY_GUARD] ${symbol}/${strategy}: Market price ${currentMarketPrice.toFixed(6)} already at/below stop ${adjustedStopLoss.toFixed(6)} — trade not viable`);
    setNullReason('price_past_stop');
    return null;
  }
  if (currentMarketPrice >= adjustedTakeProfit - minViableDistance) {
    console.log(`[B53][ENTRY_GUARD] ${symbol}/${strategy}: Market price ${currentMarketPrice.toFixed(6)} already near/past target ${adjustedTakeProfit.toFixed(6)} (minDist=${minViableDistance.toFixed(6)}) — trade not viable`);
    setNullReason('price_past_target');
    return null;
  }

  // Directive 11.8C: Trade ID includes strategy for unique identification
  // Format: vts_{symbol}_{strategy}_{timestamp}
  const tradeId = `vts_${symbol.replace('/', '_')}_${strategy}_${Date.now()}`;
  
  // Check if we can accept more open trades
  const maxOpenTrades = getMaxOpenTrades();
  if (openVirtualTrades.size >= maxOpenTrades) {
    console.log(`[11.6][VTS] Max open trades reached (${maxOpenTrades}), skipping new trade for ${symbol}`);
    // Batch 50: Mark as post-signal rejection so caller doesn't count as strategy null
    setNullReason('max_open_trades');
    return null;
  }

  // B67.3 — Per-underlying position cap check (VTS-mirror gate).
  // Default disabled (shadow mode) at ship; logs would-reject without
  // actually rejecting until module_constants flag flips. Cohort 1 (control)
  // bypasses the cap during the A/B observation window. Same gate as the
  // active-trading path in signal-orchestrator.
  try {
    const openSymbols = Array.from(openVirtualTrades.values()).map((t) => t.symbol);
    const capDecision = await checkPerUnderlyingCap(symbol, openSymbols);
    console.log(formatDecisionLog(symbol, capDecision));
    if (!capDecision.allowed) {
      setNullReason('per_underlying_cap');
      return null;
    }
  } catch (err) {
    console.error(`[B67.3][cap-check][VTS] Failed for ${symbol}; allowing through:`, err instanceof Error ? err.message : err);
    // Fail-open: B67.3 lookup error must not block VTS data accumulation.
  }
  
  // Directive 11.6: Create open virtual trade for real-price resolution
  // Directive 11.7S: Uses adjusted stop/target based on mode overlay
  // B79.TEC (2026-05-08, Langston Finding 3): use SAFE resolver so a single
  // unrecognized symbol can't crash the VTS cycle at trade-open. If
  // resolution fails, skip the trade open entirely with a loud log — same
  // policy as B69 §A.2 directive on B69 INSERT sites.
  const tradeAssetClass = safeResolveAssetClass(symbol, 'kraken');
  if (!tradeAssetClass) {
    console.error(
      `[B79.TEC][VTS] symbol=${symbol} failed asset-class resolution at trade-open — skipping. ` +
      `Pattern not registered in shared/asset-classes.ts.`,
    );
    return null;
  }

  const openTrade: OpenVirtualTrade = {
    id: tradeId,
    symbol,
    assetClass: tradeAssetClass,
    // P19-B7.2b (OBJ-A/B): carry the shared maker/taker decision + the actual entry
    // fee rate onto the VTS trade record → vts_open_trades + the vts_trades_*.json
    // closed payload → the fee-mode UI column.
    chosenEntryMode: _vtsMtDecision.chosenMode,
    entryFeeRate: _vtsEntryFeeRate,
    entryPrice,
    stopLoss: adjustedStopLoss,       // 11.7S: Mode-adjusted stop loss
    takeProfit: adjustedTakeProfit,   // 11.7S: Mode-adjusted take profit
    positionSize,
    dollarValue,      // Directive 11.6H: Fixed USD exposure
    quantity,         // Directive 11.6H: Variable coin units
    frictionCost,
    regime,
    regimeScore: regimeScoreRaw,
    signalType,
    strategy,
    patternType,
    finalScore,
    hybridScore,
    predictiveConfidence,
    expectedEdge: finalScore * dynamicTarget - frictionCost, // Batch 45: Store actual computed edge
    regimeWeight,
    decayPenalty,
    pool,
    openedAt: Date.now(),
    strategyMode,         // 11.7S: Mode for observability
    modeOverlay,          // 11.7S: Overlay values for observability
    regimeStability,      // 11.7S: Regime stability for observability
    executionContext: isMultiStrategy ? 'VTS_MULTI' : 'VTS', // 11.8C: Multi-strategy identification
    // B.2.UI (2026-06-02): crypto entry-liquidity = native 24h volume (COIN UNITS, not USD).
    // Inline path is the crypto VTS open; guard on class + finite>0 so a missing
    // value renders "—" and never throws on the hot path.
    entryLiquidityValue: (tradeAssetClass === 'crypto_spot' && typeof priceData?.volume24h === 'number' && priceData.volume24h > 0)
      ? priceData.volume24h
      : undefined,
    entryLiquidityKind: tradeAssetClass === 'crypto_spot' ? 'volume_qty' : undefined,
    // B-5 AMR: at-open weather/mode stamp (null-guarded; never throws on the
    // hot path; absent when the class flag is disabled or no cycle has run).
    amrClassification: _amrWeatherMod?.getAmrWeatherReport(tradeAssetClass)?.classification,
    amrMode: _amrWeatherMod?.getAmrWeatherReport(tradeAssetClass)?.resolvedMode ?? undefined,
    // Phase 14: Snapshot 6 context dimensions at trade OPEN
    // B-4.7: per-class (supersedes the WIRE-IN #16 deferral). The pre-B-4.7
    // `?? regime` fallback was SILENT per-pair-regime substitution — removed;
    // a null vote (class idle/warming) stamps NULL, the honest at-open value.
    globalRegime: (() => {
      try { const ta = getTelemetryAggregator(); return ta.getDominantRegimeForClass?.(tradeAssetClass)?.regime ?? undefined; } catch { return undefined; }
    })(),
    pairFriction: (() => {
      // B79.0n.MCE: assetClass REQUIRED — resolved from the symbol.
      // P19-B4a (C4 / #230): reuse the captured _assetClass (non-null past the :981 skip)
      // instead of a crypto_spot default — no mislabel-by-construction at the friction read.
      const cm = getCachedCostMetrics(symbol, _assetClass);
      return Math.min(((cm.fee * 2 + cm.slippage * 2 + cm.spread) * 10000) / 3, 100);
    })(),
    globalFriction: getGlobalFriction(tradeAssetClass) ?? undefined, // B-4.7: per-class (undefined until same-class sample)
    pairDirectionalBias: mceContext.directionalBias?.category ?? 'NEUTRAL',
    globalDirectionalBias: getLastGlobalDBSCategory(tradeAssetClass), // B-4.7: per-class
    // B61 (2026-04-15): capture numeric scores alongside the category strings
    pairDirectionalBiasScore: mceContext.directionalBias?.score ?? null,
    globalDirectionalBiasScore: getLastGlobalDBSScore(tradeAssetClass) ?? undefined,
    filterTier,  // HF9: IMF filter tier from FX5 scanner
    sourcePool: sourcePool,  // Batch 37: Propagate as-is, no fallback
    // reorg-B3.2: the quality-gate verdict this VTS trade carries. 'passed' = cleared the reorg-B2
    // RR/reachability gate; 'rr_below_min'/'unreachable' = the active path WOULD have suppressed it but
    // the VTS tags-and-simulates anyway (learning data). Lets analysis filter to the gate-passing
    // "what active would do" subset — so un-gating the VTS adds data without losing the realistic view.
    vtsGateVerdict,
    // B65.2: snapshot volatility inputs at open for the trailing engine.
    // Defaults match the engine's own defaults when mceContext doesn't carry them.
    atrAtOpen: mceContext.indicators.atr,
    diAtOpen: 50,
    volNoiseAtOpen: 0.3,
    // B65.4.2: capture the original stop at trade-open time so it survives
    // ratcheting and is available on closed-trade record + open-trade API.
    originalStopPrice: stopLoss,
    rungTargetHistory: [],
    // B67.3 (2026-04-29): cohort marker for per-underlying-cap A/B observation.
    pairIdHash: assignCohortHash(symbol),
    // B67.2.1 (2026-04-29): capture regime classifier confidence + macro
    // modifier + phase at trade-open. Read from MCE cached context +
    // macro context + phase weights. Phase weight looked up from the
    // 54-cell blob via (strategy, phase) key.
    regimeConfidenceModulated: mceContext.regime.confidence,
    macroModifierValue: getMarketContextEngine().getCurrentMacroContext()?.modifier.value,
    regimeConfidenceRaw: (() => {
      const mod = getMarketContextEngine().getCurrentMacroContext()?.modifier.value;
      const conf = mceContext.regime.confidence;
      return mod && mod > 0 ? conf / mod : conf;
    })(),
    phase: mceContext.regime.phase,
    phaseAgeSeconds: mceContext.regime.phaseAgeSeconds,
    strategyPhaseWeight: (() => {
      const weights = getMarketContextEngine().getCurrentPhaseWeights();
      const p = mceContext.regime.phase;
      return weights ? weights[`${strategy}_${p}`] : undefined;
    })(),
  };

  // B79.0g (Langston Step 4 F1 fix): INSERT before Map.set — invert order so
  // observer-visibility (TEC, scanner, signal logging below) NEVER sees a
  // trade that fails to persist. If INSERT fails, abort the trade-open cleanly
  // (no half-state). The previous fire-and-forget pattern created an observer-
  // divergence window between Map.set and the async INSERT outcome.
  try {
    const { insertOpenTrade } = await import('./vts-trade-persistence.js');
    await insertOpenTrade(openTrade as any);
  } catch (persistErr) {
    console.error(
      `[B79.0g][PERSIST_FAIL] aborting trade-open for trade=${tradeId} symbol=${symbol} ` +
      `because vts_open_trades INSERT failed:`,
      persistErr instanceof Error ? persistErr.message : persistErr,
    );
    return null;
  }
  openVirtualTrades.set(tradeId, openTrade);
  // Batch 47f15: Record setup hash to prevent identical re-entry
  lastSetupHash.set(`${symbol}:${strategy}`, computeSetupHash(entryPrice, stopLoss, takeProfit));
  // Directive 11.8C: Enhanced entry logging with execution context
  console.log(`[11.8C][Entry] ${symbol} opened @ ${entryPrice.toFixed(6)} | stop=${stopLoss.toFixed(6)} target=${takeProfit.toFixed(6)} strategy=${strategy} context=${isMultiStrategy ? 'VTS_MULTI' : 'VTS'}`);
  
  // Directive 11.4C.3: VirtualSignal with full Phase-10 metrics and pattern (M50 compliant)
  // Directive 11.7R: Use finalScore which has governance multiplier applied
  const signal: VirtualSignal = {
    id: `vsig_p10_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    symbol,
    entryPrice,
    takeProfit,
    stopLoss,
    spread,
    predictedProfit: finalScore * dynamicTarget,
    strategy,
    createdAt: Date.now(),
    signalType, // Directive 11.4C.3: Canonical format 'QUANT' | 'PATTERN' | 'HYBRID'
    patternType, // Directive 11.4C.3: Attached pattern from detection (null if none)
    patternStrength: detectedPattern?.strength ?? undefined, // Directive 11.4C.3: Explicit undefined for type safety
    hybridScore,
    predictiveConfidence,
    // Phase-10 canonical fields (M50)
    finalScore: finalScore, // Directive 11.7R: Governed score
    regimeWeight,
    decayPenalty,
    expectedEdge: finalScore * dynamicTarget - frictionCost,
    frictionCost, // M50: Schema parity with VirtualTrade
    regime,
    regimeScore: regimeScoreRaw, // Directive 11.4H.4A: Raw 0-100 score for UI display
    pool,
    source: 'vts', // Phase 14: Source tag for fresh VTS data (legacy 'simulation' records flagged by migration)
    // P19-B3b: attach the computed net expected value so the caller-side Net-EV
    // floor check (Batch 26, ~line 3746) actually works. The kernel computes netEV
    // here (line ~1267 / 1289) and rejects below-floor inside, but never attached it
    // to the returned signal — so the caller-side `signal.netEV !== undefined` guard
    // was permanently false (dead branch). Now it's a real, surfaced value.
    netEV: kernelResult.netEV,
  };
  
  // Directive 11.6: Trade record marked as pending - exit determined by resolveOpenVirtualTrades()
  // Directive 11.7R: Uses finalScore with governance multiplier
  const tradeRecord: Phase10TradeRecord = {
    symbol,
    // P19-B3b: stamp the asset class on the substrate record so the per-class
    // telemetry write (recordPairTelemetry, ~line 3812) reads a real value rather
    // than undefined. _assetClass is non-null here (guarded at function entry).
    assetClass: _assetClass,
    regime,
    regimeScore: regimeScoreRaw, // Directive 11.4H.4A: Raw 0-100 score for telemetry
    signalType,
    strategy,
    patternType, // Directive 11.4C.3: Attached pattern for telemetry
    finalScore: finalScore, // Directive 11.7R: Governed score
    hybridScore,
    predictiveConfidence,
    regimeWeight,
    decayPenalty,
    frictionCost,
    entry: entryPrice,
    exit: undefined, // Directive 11.6: Exit determined by real price resolution
    profit: undefined, // Directive 11.6: P&L calculated at exit
    positionSize,
    pool,
    sourcePool: sourcePool, // Batch 37: Propagate as-is, no fallback
    timestamp: new Date().toISOString(),
    exitType: 'pending', // Directive 11.6: Awaiting real-price resolution
    volZ: zScoreResult.isWarmedUp ? zScoreResult.zScores.volZ : undefined, // Directive 11.7F-B
    trendZ: zScoreResult.isWarmedUp ? zScoreResult.zScores.momZ : undefined, // Directive 11.7F-B (momentum as trend)
    executionContext: isMultiStrategy ? 'VTS_MULTI' : 'VTS', // 11.8C
  };
  
  console.log(`[11.0E.1][VTS] Trade: ${symbol} regime=${regime} signalType=${signalType} strategy=${strategy} finalScore=${finalScore.toFixed(3)} pool=${pool} sourcePool=${sourcePool ?? 'quant'} context=${isMultiStrategy ? 'VTS_MULTI' : 'VTS'}`);

  // B67.0 — Factor ablation emit hook (VTS path mirror).
  // Today fires with empty alternates and no-ops (no factors deployed). When
  // B67.1+ producers ship, each adds its FactorAlternate here. signal.id is
  // the synthetic VTS string trade id (vsig_p10_*) — the schema's
  // sourceType='vts_trade' branch carries this in vts_trade_id (TEXT).
  // B67.1 + B67.2 — VTS path mirror of the orchestrator alternates. Always
  // emit per Kyle directive 2026-04-29 (no shadow theater). Defensive null
  // checks only for the cold-start race window.
  // B76 (2026-05-06): two-pass stash-then-build (matches signal-orchestrator).
  const _alternateInputs: FactorAlternateInput[] = [];
  let _modulatedConfChain = predictiveConfidence ?? 0.5;
  {
    const _mce = getMarketContextEngine();
    const _macro = _mce.getCurrentMacroContext();
    // B79.0n.CONFIDENCE-CHAIN: per-class accessor with global fallback for back-compat.
    const _macroConfig = _mce.getMacroConfigForClass(_assetClass) ?? _mce.getCurrentMacroConfig();
    const _phaseWeights = _mce.getPhaseWeightsForClass(_assetClass) ?? _mce.getCurrentPhaseWeights();
    // B79.0n.MCE: append required assetClass — the cache is keyed by (symbol, assetClass).
    // Reuse the captured _assetClass instead of re-resolving (B79.0n.PATTERN-DETECT Step 9 capture-and-reuse).
    const _ctx = _mce.getCachedContext(symbol, _assetClass);

    // B67.1 macro modifier — stash for chain-final dispatch
    if (_macro === null || _macroConfig === null) {
      console.warn('[B67.1][vts-runner] macro context/config null at ablation hook — cold-start race');
    } else {
      _alternateInputs.push({
        kind: 'b67_1',
        modifier: _macro.modifier,
        admissionPossible: true,
        config: _macroConfig,
        assetClass: _assetClass,
      });
    }

    // B67.2 phase preference alternate
    const _outcomeFeedbackConfig = _mce.getCurrentOutcomeFeedbackConfig();
    const _regimeAgeConfig = _mce.getCurrentRegimeAgeConfig();
    const _fullRegimeConfig = _mce.getCurrentRegimeConfig();
    const _baseConf = predictiveConfidence ?? 0.5;
    const _regimeLabel = regime ?? 'UNKNOWN';

    if (_phaseWeights === null) {
      console.warn('[B67.2][vts-runner] phase weights null at ablation hook — cold-start race');
    } else if (_ctx) {
      const phase = _ctx.regime.phase;
      const phaseAgeSeconds = _ctx.regime.phaseAgeSeconds;
      try {
        const modulated = applyPhasePreference(strategy, phase, _phaseWeights, _baseConf, _assetClass);
        const weight = _phaseWeights[`${strategy}_${phase}`];
        _modulatedConfChain = modulated;
        _alternateInputs.push({
          kind: 'b67_2',
          phase,
          phaseAgeSeconds,
          strategy,
          phaseWeight: weight,
          assetClass: _assetClass,
        });
      } catch (err) {
        console.error(
          '[B67.2][vts-runner] phase preference lookup failed:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    // ── B68.4 freshness factor (cheap-tier bundle) ────────────────────
    if (_regimeAgeConfig !== null) {
      const ageMs = regimePhaseStore.peekAgeMs(symbol, Date.now());
      const freshness = computeFreshnessFactor(ageMs, _regimeAgeConfig, _assetClass);
      _modulatedConfChain *= freshness.factor;
      _alternateInputs.push({
        kind: 'b68_4',
        result: freshness,
        targetAgeHours: _regimeAgeConfig.targetAgeHours,
        assetClass: _assetClass,
      });
      console.log(
        `[B68.4][freshness] pair=${symbol} age_hours=${freshness.ageHours.toFixed(2)} factor=${freshness.factor.toFixed(4)}`,
      );
    } else {
      console.warn('[B68.4][vts-runner] regime age config null at ablation hook — cold-start race');
    }

    // ── B67.4 outcome feedback (cheap-tier bundle) ────────────────────
    if (_outcomeFeedbackConfig !== null) {
      // B79.0n.CONFIDENCE-CHAIN: per-class store key isolation.
      // ITEM-4 step 2 (D9): SOURCE-MATCHED read — VTS reads the vts partition.
      const entry = outcomeFeedbackStore.peek('vts', _assetClass, _regimeLabel, strategy);
      const outcome = computeOutcomeFeedbackFactor(entry, _outcomeFeedbackConfig, _assetClass);
      _modulatedConfChain *= outcome.factor;
      _alternateInputs.push({
        kind: 'b67_4',
        result: outcome,
        context: { regime: _regimeLabel, strategy, entry },
        assetClass: _assetClass,
      });
    } else {
      console.warn('[B67.4][vts-runner] outcome feedback config null at ablation hook — cold-start race');
    }

    // ── B68.2 volume regime (5th chain modulator, 2026-05-02) ─────────
    // Pure-function score over rolling OHLC. Uses function-scope ohlcData
    // parameter directly (correct path from B67.4 hotfix #3 pattern).
    const _volumeRegimeConfig = _mce.getCurrentVolumeRegimeConfig();
    if (_volumeRegimeConfig !== null && ohlcData && ohlcData.length >= _volumeRegimeConfig.minSamples) {
      try {
        const result = computeVolumeRegime(ohlcData, _volumeRegimeConfig, _assetClass);
        _modulatedConfChain *= result.factor;
        _alternateInputs.push({ kind: 'b68_2', result, config: _volumeRegimeConfig, assetClass: _assetClass });
        console.log(
          `[B68.2][volume] pair=${symbol} score=${result.score.toFixed(3)} ` +
            `factor=${result.factor.toFixed(4)} label=${result.label}` +
            (result.hasLiquidationSpike ? ' (liquidation_spike)' : ''),
        );
      } catch (err) {
        console.error(
          '[B68.2][vts-runner] volume regime emit failed:',
          err instanceof Error ? err.message : err,
        );
      }
    } else if (_volumeRegimeConfig === null) {
      console.warn('[B68.2][vts-runner] volume regime config null at ablation hook — cold-start race');
    }

    // ── B68.3 pair correlation (6th chain modulator, 2026-05-02) ──────
    // Spearman correlation pair vs BTC over rolling N bars. Decorrelation
    // = 1 - |corr|; factor = clamp(1 + decorr × sensitivity). Asymmetric
    // [0.95, 1.05] — boost only. BTC OHLC fetched from ohlcCache (cache
    // read; microsecond latency). Self-reference handled inside
    // computePairCorrelation (factor=1.0 + SELF_REFERENCE flag).
    const _pairCorrelationConfig = _mce.getPairCorrelationConfigForClass(_assetClass) ?? _mce.getCurrentPairCorrelationConfig();
    if (_pairCorrelationConfig !== null && ohlcData && ohlcData.length >= _pairCorrelationConfig.minSamples) {
      try {
        const btcRaw = await ohlcCache.getOHLCData(_pairCorrelationConfig.btcReferenceSymbol, 60);
        const btcOhlc = (btcRaw?.ohlc ?? []).map((c: any) => ({
          open: parseFloat(c.open || c[1]),
          high: parseFloat(c.high || c[2]),
          low: parseFloat(c.low || c[3]),
          close: parseFloat(c.close || c[4]),
          volume: parseFloat(c.volume || c[6] || 0),
          timestamp: c.timestamp || c[0] * 1000,
        }));
        const result = computePairCorrelation(
          symbol,
          ohlcData,
          btcOhlc.length >= _pairCorrelationConfig.minSamples ? btcOhlc : null,
          _pairCorrelationConfig,
          _assetClass,
        );
        _modulatedConfChain *= result.factor;
        _alternateInputs.push({ kind: 'b68_3', result, config: _pairCorrelationConfig, assetClass: _assetClass });
        console.log(
          `[B68.3][correlation] pair=${symbol} corr=${result.correlationToBtc.toFixed(3)} ` +
            `decorr=${result.decorrelationScore.toFixed(3)} factor=${result.factor.toFixed(4)} ` +
            `label=${result.label}`,
        );
      } catch (err) {
        console.error(
          '[B68.3][vts-runner] pair correlation emit failed:',
          err instanceof Error ? err.message : err,
        );
      }
    } else if (_pairCorrelationConfig === null) {
      console.warn('[B68.3][vts-runner] pair correlation config null at ablation hook — cold-start race');
    }

    // ── B68.1 multi-TF agreement (7th chain modulator, 2026-05-03) ────
    // Higher-TF (240-min / 4h) regime classification reused via
    // calculatePairRegime (Path A only — DBS=0 in v1). Three-state agreement:
    // CONFIRMED (labels match) → 1.05 / COMPATIBLE (same family or ST-tolerant)
    // → 1.00 / CONFLICTED → 0.95. ST is universally COMPATIBLE. Cold-start
    // returns factor=1.0 + agreement=COLD_START. Ablation row metadata carries
    // explicit higher_tf_dbs_score:0 + higher_tf_dbs_slope:0 (Langston D.1).
    const _multiTfConfig = _mce.getCurrentMultiTfAgreementConfig();
    if (_multiTfConfig !== null && ohlcData && ohlcData.length > 0) {
      try {
        const higherRaw = await ohlcCache.getOHLCData(
          symbol,
          _multiTfConfig.higherTfIntervalMinutes,
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
          _regimeLabel as MarketRegimeType,
          higherTfOhlc.length >= _multiTfConfig.minHigherTfSamples ? higherTfOhlc : null,
          _multiTfConfig,
          _fullRegimeConfig ?? undefined,
          // B79.0n.CONFIDENCE-CHAIN: reuse captured _assetClass (B79.0n.PATTERN-DETECT Step 9 capture-and-reuse).
          _assetClass,
        );
        _modulatedConfChain *= result.factor;
        _alternateInputs.push({ kind: 'b68_1', result, config: _multiTfConfig, assetClass: _assetClass });
        console.log(
          `[B68.1][multi-tf] pair=${symbol} active=${result.activeTfRegime} ` +
            `higher=${result.higherTfRegime ?? 'COLD'} agree=${result.agreement} ` +
            `factor=${result.factor.toFixed(4)}`,
        );
      } catch (err) {
        console.error(
          '[B68.1][vts-runner] multi-tf emit failed:',
          err instanceof Error ? err.message : err,
        );
      }
    } else if (_multiTfConfig === null) {
      console.warn('[B68.1][vts-runner] multi-tf config null at ablation hook — cold-start race');
    }

    // ── B68.5 Path B sustainability ablation (label counterfactual) ───
    // Stash inputs; built in Pass 2 with chain-final reference.
    if (_fullRegimeConfig !== null && _ctx) {
      const ohlc = ohlcData;
      const dbsScore = _ctx.directionalBias?.score ?? 0;
      const dbsSlope = (_ctx.directionalBias as any)?.slope ?? 0;
      const macroValue = _macro?.modifier.value ?? 1.0;
      if (ohlc && Array.isArray(ohlc) && ohlc.length >= 30) {
        _alternateInputs.push({
          kind: 'b68_5',
          ohlcData: ohlc,
          dbsScore,
          dbsSlope,
          macroModifier: macroValue,
          regimeConfig: _fullRegimeConfig,
          // B79.0n.MCE: resolve the pair's asset class for the b68_5
          // label-counterfactual re-classification.
          // P19-B4a (C4 / #230): PERSISTED learning sample — reuse the captured
          // _assetClass (non-null past the :981 skip) so this sample carries the TRUE
          // class, never a crypto_spot mislabel-by-construction (Langston's #230 call).
          assetClass: _assetClass,
        });
        console.log(
          `[B68.5][gate] pair=${symbol} dbs=${dbsScore.toFixed(3)} ` +
            `slope=${dbsSlope.toFixed(4)} gate_admitted=${_regimeLabel === REGIMES.TREND_FRIENDLY_STABLE} ` +
            `regime_label=${_regimeLabel}`,
        );
      }
    }

    // ── Final clamp on modulated chain confidence ─────────────────────
    // B67.5-prep (2026-05-03): floor sourced from module_constant via
    // _fullRegimeConfig.b67_5PostCompositionFloor (default 0.45). Falls back
    // to 0.4 only if regime config not yet loaded — same cold-start race
    // as other config consumers. Note: constant name carries B67.5 prefix
    // for historical reasons; the consumer (this clamp) has been live since
    // B70.3 / B72-family.
    const _floor = _fullRegimeConfig?.b67_5PostCompositionFloor ?? 0.4;
    _modulatedConfChain = Math.max(_floor, Math.min(1.0, _modulatedConfChain));
    // Update the persisted regimeConfidenceModulated on the open trade so the
    // closed-trade record carries the full chain (raw × macro × phase ×
    // freshness × outcome) per pre-audit §B.3 step 5.
    const _openTrade = openVirtualTrades.get(tradeId);
    if (_openTrade) {
      _openTrade.regimeConfidenceModulated = _modulatedConfChain;
    }
  }

  // ── B76 PASS 2: dispatch stashed inputs with chain-final reference ──
  const _chainFinalConfidence = _modulatedConfChain;
  const _regimeLabelForEmit = regime ?? 'UNKNOWN';
  const _b67_1_alternates = buildAllAlternates(
    _alternateInputs,
    _chainFinalConfidence,
    _regimeLabelForEmit,
  );

  // BATCH_82 (2026-05-14): resolve assetClass for the ablation record. REQUIRED
  // parameter — no default, no silent fallback. Compile fails if missed.
  // P19-B4a (C4 / #230): PERSISTED learning sample — reuse the captured _assetClass
  // (non-null past the :981 function-entry skip) so the ablation row carries the TRUE
  // class, never a crypto_spot mislabel-by-construction (Langston's #230 hard-skip call).
  const _assetClassForAblation = _assetClass; // P19-B3a #139 / P19-B4a (C4)
  emitAblationRecord(
    { kind: 'vts_trade', vtsTradeId: signal.id },
    symbol,
    {
      regimeLabel: _regimeLabelForEmit,
      // B76: chain-final, NOT raw classifier value. Raw preserved in metadata.
      confidence: _chainFinalConfidence,
      admissionPossible: true,
      metadata: {
        finalScore,
        regimeWeight, // pre-B67.5; replaced by regimeConfidence after Consumer #1 ships
        sourcePool,
        // B76: preserve raw classifier output for any downstream that wants raw semantics
        predictiveConfidenceRaw: predictiveConfidence ?? 0.5,
      },
    },
    _b67_1_alternates,
    _assetClassForAblation, // BATCH_82
    strategy, // B67.0.1 (2026-04-30): natural-key join in replay-ablation per Langston #864
  );

  // B70 Step 3.6: signal-eval archive — admitted row alongside ablation emit.
  // Fire-and-forget, try/catch wrapped — must never block the VTS cycle.
  // NOTE: `_modulatedConfChain` is block-scoped inside the bare `{ ... }`
  // block above (lines ~1447-1724) — NOT accessible here. Use the
  // openTrade record's persisted value instead (set at line 1722).
  try {
    const { archiveSignalEval, buildBarProvenance } = await import('./data-archive/signal-eval-archiver.js');
    const { safeResolveAssetClass } = await import('../../shared/asset-classes.js'); // P19-B3a #139: safe variant (alarms + crypto_spot fallback at use site)
    const persistedTrade = openVirtualTrades.get(tradeId);
    const chainModulatedConfidence =
      persistedTrade?.regimeConfidenceModulated ?? predictiveConfidence ?? undefined;
    archiveSignalEval({
      mode: 'vts', // ITEM-4 step 2 (D1): carried entry-stamp
      symbol,
      exchange: 'kraken',
      assetClass: vtsResolveClassOrLoggedDefault(symbol), // P19-B6.5d (was safeResolve ?? crypto_spot silent default)
      source: 'vts-runner',
      strategy,
      regimeLabel: regime ?? undefined,
      rejectStage: 'admitted',
      // B-NEW-53: decision-provenance (crypto path). Forming bar BY VALUE from the
      // ohlcData fed to detection + the DETECT-OUTPUT stop/target levels (RI-a
      // checksum) — the `stopLoss`/`takeProfit` locals (= strategySignal.stop/
      // targetPrice, pre mode-overlay), which is what a detect-replay re-derives.
      // (NOT tradeRecord.* — the Phase10TradeRecord literal never sets those.)
      // Capture is gated per-asset-class at write time (crypto enabled 2026-06-07).
      provenance: buildBarProvenance(ohlcData, stopLoss, takeProfit),
      finalScore: typeof finalScore === 'number' ? finalScore : undefined,
      confidenceModulated:
        typeof chainModulatedConfidence === 'number' ? chainModulatedConfidence : undefined,
      // B70.2 (2026-05-05) — full at-entry context per Kyle directive.
      // Mirrors the open-trades CSV export columns so admitted rows carry
      // every field needed to reconstruct the trade decision.
      features: {
        // B-NEW-53.1 (2026-06-08, #207): the at-entry economics + phase + cohort
        // + ATR fields are read from the SSOT open-trade record (`persistedTrade`,
        // already fetched above as openVirtualTrades.get(tradeId)), NOT the lean
        // `Phase10TradeRecord` `tradeRecord` — which never declares/carries them,
        // so they archived `undefined` on every crypto admitted row since
        // 2026-05-05. `?? null` so a cold-start Map miss degrades the row instead
        // of substituting a stale value. The scoring/classification/bias fields
        // below stay on `tradeRecord` (they ARE declared + set there, populate fine).
        // Signal economics
        entryPrice: persistedTrade?.entryPrice ?? null,
        target: persistedTrade?.takeProfit ?? null,
        stopLoss: persistedTrade?.stopLoss ?? null,
        positionSize: tradeRecord.positionSize,
        quantity: persistedTrade?.quantity ?? null,
        // Signal classification
        signalType: tradeRecord.signalType,
        patternType: tradeRecord.patternType,
        pool: tradeRecord.pool,
        sourcePool,
        filterTier: tradeRecord.filterTier,
        // Scoring (rankingScore is computed downstream in RTB; not in vts-runner scope)
        hybridScore: tradeRecord.hybridScore,
        predictiveConfidence,
        regimeWeight,
        expectedEdge: persistedTrade?.expectedEdge ?? null,
        decayPenalty: tradeRecord.decayPenalty,
        // Regime + bias
        globalRegime: tradeRecord.globalRegime,
        pairFriction: tradeRecord.pairFriction,
        globalFriction: tradeRecord.globalFriction,
        pairDirectionalBias: tradeRecord.pairDirectionalBias,
        globalDirectionalBias: tradeRecord.globalDirectionalBias,
        pairDirectionalBiasScore: tradeRecord.pairDirectionalBiasScore,
        globalDirectionalBiasScore: tradeRecord.globalDirectionalBiasScore,
        // Phase
        regimeConfidenceRaw: persistedTrade?.regimeConfidenceRaw ?? null,
        macroModifierValue: persistedTrade?.macroModifierValue ?? null,
        phase: persistedTrade?.phase ?? null,
        phaseAgeSeconds: persistedTrade?.phaseAgeSeconds ?? null,
        strategyPhaseWeight: persistedTrade?.strategyPhaseWeight ?? null,
        // Cohort marker + ATR
        pairIdHash: persistedTrade?.pairIdHash ?? null,
        atrAtOpen: persistedTrade?.atrAtOpen ?? null,
      },
      modulators: {
        chain_modulated_confidence: chainModulatedConfidence,
        regimeConfidenceModulated: persistedTrade?.regimeConfidenceModulated ?? null,
      },
      gateDecision: {
        gate: 'admitted',
        accepted: true,
      },
    });
  } catch (b70Err) {
    console.warn(
      `[B70][ARCH] vts signal-eval archive enqueue failed:`,
      b70Err instanceof Error ? b70Err.message : b70Err,
    );
  }

  return { signal, tradeRecord };
}

/**
 * Directive 11.4C.1: Get pairs directly from FX5 Scanner (not telemetry)
 * VTS is the sole source of telemetry writes - it gets raw pairs from FX5 and generates signal data
 */
async function getIdealPoolPairs(): Promise<Array<{ symbol: string; pool: 'ideal' | 'rotational'; filterTier?: 'standard' | 'relaxed'; sourcePool?: string; dbsScore?: number; dbsCategory?: string; dbsSlope?: number; atr?: number }>> {
  try {
    // Directive 11.4C.1: Get pairs directly from FX5 scanner's current batch
    // Batch 19F Phase 2: FX5 scan batch now includes sourcePool tags from dual-path filters.
    // This is the CORRECT source for VTS — NOT activeFilterPool (which is EMPTY during passive learning).
    const scanBatch = fx5Scanner.getCurrentScanBatch('paper');

    if (scanBatch.length >= 10) {
      // B62: Benchmarks are now tradable — no longer filtered out (was Directive 11.6F)
      const benchmarkCount = scanBatch.filter(p => p.isBenchmark).length;
      const patternCount = scanBatch.filter(p => p.sourcePool === 'pattern').length;
      const quantCount = scanBatch.filter(p => isQuantPool(p.sourcePool)).length;
      console.log(`[11.4C.1][VTS] Using FX5 scan batch: ${scanBatch.length} pairs (${benchmarkCount} benchmarks included, ${scanBatch.length} tradable: ${quantCount} quant + ${patternCount} pattern)`);

      // Directive 11.4H.1 Task 1: Normalize symbols at ingress with fallback and tier logging
      // B63: Extended with DBS fields propagated from scan batch.
      const validPairs: Array<{ symbol: string; pool: 'ideal' | 'rotational'; filterTier?: 'standard' | 'relaxed'; sourcePool?: string; dbsScore?: number; dbsCategory?: string; dbsSlope?: number; atr?: number }> = [];
      for (const p of scanBatch) {
        const rawSymbol = p.symbol;
        const canonicalSymbol = normalizeToInternalSymbol(rawSymbol);

        // Directive 11.4H.1: Fallback for unmappable symbols
        if (!canonicalSymbol || canonicalSymbol === rawSymbol.toUpperCase()) {
          const mappingDetails = getSymbolMappingDetails(rawSymbol);
          if (!mappingDetails.mappable) {
            console.warn(`[11.4H.1][Symbol Warning] Unmappable symbol detected: ${rawSymbol}`);
            continue; // Skip processing this symbol
          }
        }

        // Directive 11.4H.1: Audit Tier-3 mappings
        const mappingDetails = getSymbolMappingDetails(rawSymbol);
        if (mappingDetails?.tier === 3) {
          console.warn(`[11.4H.1][Mapping Tier 3] ${rawSymbol} → ${canonicalSymbol}`);
        }

        // Batch 19F Phase 2: Propagate sourcePool from FX5 scan batch
        // B63: Also propagate DBS fields — hard pipeline contract (no fallback downstream).
        validPairs.push({
          symbol: canonicalSymbol,
          pool: p.pool,
          filterTier: p.filterTier,
          sourcePool: p.sourcePool,
          dbsScore: (p as any).dbsScore,
          dbsCategory: (p as any).dbsCategory,
          dbsSlope: (p as any).dbsSlope,
          atr: (p as any).atr,
        });
      }
      // Batch 52: Diagnostic trace — handoff chain counts
      const droppedByNormalization = scanBatch.length - validPairs.length;
      const validQuant = validPairs.filter(p => isQuantPool(p.sourcePool)).length;
      const validPattern = validPairs.filter(p => p.sourcePool === 'pattern').length;
      console.log(`[52][HANDOFF] FX5 batch: ${scanBatch.length} → benchmarks included: ${benchmarkCount} → tradable: ${scanBatch.length} → after normalization: ${validPairs.length} (dropped ${droppedByNormalization}) | quant=${validQuant} pattern=${validPattern}`);
      return validPairs;
    }

    // Cold start fallback: If FX5 hasn't scanned yet, check active filter pool
    console.log('[11.4C.1][VTS] Scan batch too small, checking Active Filter Pool...');
    const fx5Survivors = activeFilterPool.getActivePool('paper');

    if (fx5Survivors && fx5Survivors.length >= 10) {
      console.log(`[11.4C.1][VTS] Using Active Filter Pool: ${fx5Survivors.length} pairs`);
      const validPairs: Array<{ symbol: string; pool: 'ideal' | 'rotational'; sourcePool: string }> = [];
      for (const p of fx5Survivors) {
        // B54: minPrice/minVolume24h filtering REMOVED — FX5 scanner already applies DB-driven
        // screening (screener_filters table) before pairs reach the Active Filter Pool.
        // No secondary hardcoded filtering here.
        const canonicalSymbol = normalizeToInternalSymbol(p.symbol);
        if (!canonicalSymbol) {
          console.warn(`[11.4H.1][Symbol Warning] Unmappable symbol in fallback: ${p.symbol}`);
          continue;
        }
        validPairs.push({ symbol: canonicalSymbol, pool: 'rotational' as const, sourcePool: 'quant-trend' });
        console.warn('[37][COLD_START] Using quant-trend as cold-start default sourcePool');
        if (validPairs.length >= vtsConfig.pairsPerCycle) break;
      }
      return validPairs;
    }

    console.log('[11.4C.1][VTS] No pairs available (cold start) - waiting for FX5 scan');
    return [];
  } catch (error) {
    console.warn('[11.4C.1][VTS] Failed to get pairs:', error);
    return [];
  }
}

/**
 * Directive 11.6 Task 4: Resolution Loop
 * Checks real Kraken prices against open virtual trades and closes them when stop/target is hit
 * Runs aligned with VTS simulation cycle (every 60 seconds)
 */
async function resolveOpenVirtualTrades(): Promise<{
  resolved: number;
  stopHits: number;
  targetHits: number;
  timeouts: number;
}> {
  const now = Date.now();
  let resolved = 0;
  let stopHits = 0;
  let targetHits = 0;
  let timeouts = 0;
  
  if (openVirtualTrades.size === 0) {
    return { resolved, stopHits, targetHits, timeouts };
  }
  
  // B79.0m.b2 — asset-class-aware price routing (Langston R1).
  // Crypto trades fetch via priceCache (KrakenService crypto REST). Xstock
  // trades fetch the most-recent tick from xstock_spot_ticker_snap (populated
  // by the wss://ws-equities.kraken.com archiver, NOT exposed via priceCache).
  // Without this dispatch, xstock trades would never receive a non-null
  // currentPrice and never close cleanly.
  const cryptoSymbols = new Set<string>();
  const xstockSymbols = new Set<string>();
  for (const t of openVirtualTrades.values()) {
    // B-NEW-36 (2026-05-20): skip weekend-suspended trades. The off-hours
    // session-lifecycle controller marks all open xstock_spot trades as
    // weekend_suspended on Fri 8PM ET and restores them on Sun 8PM ET; in
    // between, the sim cycle must not evaluate them (stale weekend data
    // would otherwise drive TEC stale-config fail-closed log noise — the
    // #116 noise this batch exists to eliminate). Pre-audit §4.2.
    if (t.state === 'weekend_suspended') continue;
    if (t.assetClass === 'xstock_spot') xstockSymbols.add(t.symbol);
    else cryptoSymbols.add(t.symbol);
  }

  // Crypto leg — existing priceCache path.
  const bucketType: CacheBucketType = 'vtsSimulation';
  const cryptoSymbolList = Array.from(cryptoSymbols);
  for (const symbol of cryptoSymbolList) {
    priceCache.subscribe(symbol, bucketType);
  }
  if (cryptoSymbolList.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const cryptoPriceMap = cryptoSymbolList.length > 0
    ? await priceCache.getBatch(bucketType, cryptoSymbolList)
    : new Map<string, CachedPrice>();

  // Xstock leg — read latest tick per symbol from xstock_spot_ticker_snap.
  const xstockPriceMap = new Map<string, { symbol: string; price: number; bid: number; ask: number }>();
  if (xstockSymbols.size > 0) {
    try {
      const xstockSymbolListSql = Array.from(xstockSymbols)
        .map((s) => `'${s.replace(/'/g, "''")}'`)
        .join(',');
      const result: any = await db.execute(sql.raw(`
        SELECT DISTINCT ON (symbol)
          symbol::text AS symbol,
          last::text AS price,
          bid::text AS bid,
          ask::text AS ask
        FROM xstock_spot_ticker_snap
        WHERE captured_at > NOW() - INTERVAL '5 minutes'
          AND symbol IN (${xstockSymbolListSql})
        ORDER BY symbol, captured_at DESC
      `));
      const rows = (result as any).rows ?? result;
      if (Array.isArray(rows)) {
        for (const r of rows as Array<{ symbol: string; price: string; bid: string; ask: string }>) {
          const price = parseFloat(r.price);
          if (Number.isFinite(price) && price > 0) {
            xstockPriceMap.set(r.symbol, {
              symbol: r.symbol,
              price,
              bid: parseFloat(r.bid) || 0,
              ask: parseFloat(r.ask) || 0,
            });
          }
        }
      }
    } catch (err) {
      console.error(`[B79.0m.b2][EXIT_XSTOCK_PRICE_FETCH] failed for ${xstockSymbols.size} symbols:`, err instanceof Error ? err.message : err);
    }
  }

  // Unified lookup helper: returns the current price for a trade, dispatching
  // by trade.assetClass. Used inside the per-trade loop below.
  const priceDataMap = {
    get(symbol: string, assetClass?: string): { price: number; bid?: number; ask?: number } | undefined {
      if (assetClass === 'xstock_spot') {
        return xstockPriceMap.get(symbol);
      }
      const p = cryptoPriceMap.get(symbol);
      return p ? { price: p.price, bid: p.bid, ask: p.ask } : undefined;
    },
  };
  
  // Check each open trade against current prices
  // B65.2 (2026-04-23): widened exit-reason domain now that the TEC state
  // machine is engaged — trailing_stop_hit + moonbag_timeout join the
  // legacy triad. B65.2-HF3: break_even_stop added to distinguish BE-lock
  // protective exits from genuine moonbag trailing closes.
  const tradesToClose: Array<{
    id: string;
    trade: OpenVirtualTrade;
    exitPrice: number;
    exitReason: 'stop_hit' | 'target_hit' | 'timeout' | 'trailing_stop_hit' | 'moonbag_timeout' | 'break_even_stop';
  }> = [];
  
  // B65.2: VTS exit loop engages the full trailing-exit engine. Each trade
  // gets break-even protection at 1×ATR gain, target-lock on target hit,
  // moonbag mode (if strategy qualifies) with a 4h duration cap, and a
  // trailing stop that ratchets up with new highs. VTS has no concurrency
  // cap on moonbag mode (passing slot total = Infinity signals unlimited).
  // The B64b 7-day MAX_HOLD_MS safety valve is preserved as a stale-cleanup
  // outer bound.
  for (const [tradeId, trade] of openVirtualTrades) {
    // B-NEW-36 (2026-05-20): skip weekend-suspended trades. See the
    // symbol-collection loop above for full rationale (pre-audit §4.2).
    if (trade.state === 'weekend_suspended') continue;
    const holdDurationMs = now - trade.openedAt;
    // B79.0m.b2: pass assetClass so xstock trades route to xstock_spot_ticker_snap
    // instead of priceCache (which only has crypto prices via Kraken REST).
    const priceData = priceDataMap.get(trade.symbol, trade.assetClass);
    const currentPrice = priceData && priceData.price > 0 ? priceData.price : null;

    // B79.TEC (2026-05-08): assetClass MUST come from the trade record,
    // not a hardcoded literal. OpenVirtualTrade.assetClass is populated at
    // open via resolveAssetClass(symbol, exchange) (vts-runner:1733). No
    // silent fallback (CLAUDE.md §11).
    if (!trade.assetClass) {
      console.error(
        `[TEC_VTS_MISSING_ASSET_CLASS] trade ${tradeId} symbol=${trade.symbol} ` +
        `has no assetClass — skipping TEC eval to avoid wrong-class config lookup.`,
      );
      continue;
    }
    // B80 (2026-05-13): Option C+ rehydrate seed. Built once on the first
    // exit-cycle for an open trade post-deploy (when TEC engine has no state
    // for this tradeId yet). Passes through trade-record fields so the
    // freshly-initialized per-trade TEC state preserves in-flight tradeMode,
    // ladderRung, originalStopPrice. Subsequent cycles: engine state is in
    // memory, seed is ignored by initializeTrailingState (only fires when
    // state doesn't exist yet). Per Langston rev2 §4.4.
    const { getTrailingState } = await import('./trailing-exit-controller.js');
    const existingTecState = getTrailingState(tradeId);
    const tecSeed = existingTecState
      ? undefined
      : {
          tradeMode: (trade as any).tradeMode === 'TRAILING_TAKE'
            ? ('TRAILING_TAKE' as const)
            : ('TARGET' as const),
          ladderRung: trade.ladderRungsHit ?? 0,
          originalStopPrice: trade.originalStopPrice ?? trade.stopLoss,
        };

    // OBJ-2 (B-TEC-SELFHEAL, 2026-06-25 — RUNNING_ISSUES #349): per-trade
    // isolation around the exit-eval, mirroring the proven
    // paper-execution-engine.ts:794 pattern. A [TEC_STALE_FAIL_CLOSED] (or any
    // evaluateTECExit throw) for ONE open trade must NOT abort the whole exit
    // loop — today there is no per-trade catch here, so a single stale-class
    // trade propagates out of resolveOpenVirtualTrades and aborts the entire
    // runPhase10SimulationCycle at its FIRST step (line ~3273), which also skips
    // the scan/open phase (~3293). Catch + log loudly + skip THIS trade this
    // cycle; the refresh OBJ-1 scheduled in resolveTECConfig reheats the class so
    // the next cycle succeeds. `decision` is declared before the try so the
    // unchanged post-processing below still sees it on the success path.
    let decision: Awaited<ReturnType<typeof evaluateTECExit>>;
    try {
      decision = await evaluateTECExit({
        // B80: per-trade keying. tradeId from the for-of iteration variable.
        tradeId,
        symbol: trade.symbol,
        entryPrice: trade.entryPrice,
        stopPrice: trade.stopLoss,
        targetPrice: trade.takeProfit,
        currentPrice,
        atr: trade.atrAtOpen ?? 0,
        holdDurationMs,
        maxHoldMs: MAX_HOLD_MS,
        context: {
          exchange: 'kraken',
          assetClass: trade.assetClass,
          strategy: trade.strategy,
          regime: trade.regime,
        },
        useTrailing: true,
        DI: trade.diAtOpen ?? 50,
        volNoise: trade.volNoiseAtOpen ?? 0.3,
        callerMode: 'vts',
        sourcePool: trade.sourcePool ?? null,
        currentSlotTotal: Number.POSITIVE_INFINITY, // VTS: no concurrency cap
        // B80: Option C+ seed (only on first cycle post-restart).
        seed: tecSeed,
      });
    } catch (tecExitErr) {
      console.error(
        `[TEC_VTS_EXIT_EVAL_ISOLATED] tradeId=${tradeId} symbol=${trade.symbol} ` +
        `assetClass=${trade.assetClass} — exit-eval threw; skipping THIS trade ` +
        `this cycle (loop + scan/open continue):`,
        tecExitErr,
      );
      continue;
    }

    // [B83-DIAG] (2026-05-14) Per-trade decision diagnostic for stuck crypto
    // trades. Surface every key input + the evaluator's verdict so we can
    // identify why stop_hit isn't firing when currentPrice < stopLoss. Scoped
    // to crypto trades older than 30 minutes to avoid flooding logs with
    // healthy young-trade noise. REMOVE after root cause identified.
    if (trade.assetClass === 'crypto_spot' && holdDurationMs > 30 * 60 * 1000) {
      const currentPriceStr = currentPrice === null ? 'NULL' : String(currentPrice);
      const atrStr = trade.atrAtOpen === undefined ? 'UNDEF' : String(trade.atrAtOpen);
      const wouldFireSimpleStop =
        currentPrice !== null && currentPrice <= trade.stopLoss ? 'YES' : 'NO';
      console.log(
        `[B83-DIAG] ${trade.symbol} tradeId=${tradeId} ` +
        `cur=${currentPriceStr} stop=${trade.stopLoss} atr=${atrStr} ` +
        `useTrailing=true shouldExit=${decision.shouldExit} ` +
        `reason=${decision.exitReason ?? 'null'} ` +
        `engineStop=${decision.newStopPrice ?? 'undef'} ` +
        `wouldFireSimpleStop=${wouldFireSimpleStop} ` +
        `holdMin=${Math.round(holdDurationMs / 60000)}`
      );
    }

    // B65.2: if the engine ratcheted the stop (break-even lock or trailing),
    // propagate the new stop back onto the in-memory trade record so the
    // next cycle's evaluation sees the updated level and so any downstream
    // reader (e.g. diagnostic endpoint) shows the live stop.
    if (decision.newStopPrice !== undefined && decision.newStopPrice > trade.stopLoss) {
      trade.stopLoss = decision.newStopPrice;
    }

    // B80 (2026-05-13, Langston rev2 #1): runtime invariant assertion on
    // every exit-cycle iteration. After per-trade keying, displayed
    // `trade.stopLoss` MUST always equal the engine's `state.currentStopPrice`
    // (within tick-relative epsilon). Divergence indicates the per-trade
    // keying contract has broken somewhere; surface for the next pre-audit.
    //
    // Asymmetry note (Langston Phase 1 review): vts-runner checks
    // post-ratchet `|stopLoss - engine|`; paper-engine checks
    // `|max(engine, stopLoss) - engine|`. Both collapse to engine-≤-displayed
    // asymmetry post-ratchet — engine should never report a stop LOWER than
    // the displayed value since the write-back above is monotonic-up.
    if (decision.newStopPrice !== undefined) {
      const epsilon = Math.max(0.00001, 0.0001 * trade.entryPrice);
      const delta = Math.abs(trade.stopLoss - decision.newStopPrice);
      if (delta > epsilon) {
        console.error(
          `[B80][TEC_KEYING_INVARIANT_VIOLATION] tradeId=${tradeId} symbol=${trade.symbol} ` +
          `displayed=${trade.stopLoss.toFixed(6)} engine=${decision.newStopPrice.toFixed(6)} ` +
          `delta=${delta.toFixed(6)} epsilon=${epsilon.toFixed(6)}`
        );
      }
    }

    // B65.4: write back the live ladder rung count so the closed-trade
    // record (and ML page Open Simulated Trades) can show how far up the
    // ladder this trade has climbed.
    if (typeof decision.ladderRungsHit === 'number') {
      trade.ladderRungsHit = decision.ladderRungsHit;
    }
    // B65.4.2: keep the open-trade observability fields in sync with engine
    // state so /api/vts/ml/open + persistRealPriceTrade have current values.
    if (typeof decision.originalStopPrice === 'number') {
      trade.originalStopPrice = decision.originalStopPrice;
    }
    if (typeof decision.latchTriggerPrice === 'number') {
      trade.latchTriggerPrice = decision.latchTriggerPrice;
    }
    if (Array.isArray(decision.rungTargetHistory)) {
      trade.rungTargetHistory = decision.rungTargetHistory;
    }

    if (!decision.shouldExit) continue;

    // Map TEC exit reasons to the VTS closed-trade enum. VTS preserves its
    // existing 3-valued set plus the 2 new trailing-related reasons.
    let normalizedReason: 'stop_hit' | 'target_hit' | 'trailing_stop_hit' | 'moonbag_timeout' | 'break_even_stop' | 'timeout';
    switch (decision.exitReason) {
      case 'stop_hit':
      case 'target_hit':
      case 'trailing_stop_hit':
      case 'moonbag_timeout':
      case 'break_even_stop':
        normalizedReason = decision.exitReason;
        break;
      case 'stale_timeout':
      case 'timeout':
      default:
        normalizedReason = 'timeout';
    }

    if (decision.exitReason === 'stale_timeout' || decision.exitReason === 'timeout') {
      const hasLivePrice = currentPrice !== null;
      console.log(
        `[11.6][STALE_CLEANUP] Force-closing ${trade.symbol}/${trade.strategy} after ${Math.round(
          holdDurationMs / 3600000,
        )}h (price=${hasLivePrice ? 'live' : 'entry-fallback'})`,
      );
    }

    tradesToClose.push({
      id: tradeId,
      trade,
      exitPrice: decision.exitPrice,
      exitReason: normalizedReason,
    });
  }
  
  // Directive 11.6C: Track persistence and ML queue counts
  let persisted = 0;
  let mlQueued = 0;
  
  // Process closed trades
  for (const { id, trade, exitPrice, exitReason } of tradesToClose) {
    const holdDurationMs = now - trade.openedAt;
    const holdDurationStr = formatHoldDuration(holdDurationMs);
    
    // Calculate P&L
    const grossPnl = (exitPrice - trade.entryPrice) / trade.entryPrice;
    const netPnl = grossPnl - trade.frictionCost;
    const pnlPercent = (netPnl * 100).toFixed(2);
    
    // Calculate dollar P&L based on position size
    const dollarPnl = trade.positionSize * netPnl;
    
    // Create completed trade record
    const closedTradeRecord: Phase10TradeRecord = {
      symbol: trade.symbol,
      // P19-B3b: carry the asset class onto the closed substrate record too
      // (the open trade always has it; keeps the record consistent for telemetry).
      assetClass: trade.assetClass,
      regime: trade.regime,
      regimeScore: trade.regimeScore,
      signalType: trade.signalType,
      strategy: trade.strategy,
      patternType: trade.patternType,
      finalScore: trade.finalScore,
      hybridScore: trade.hybridScore,
      predictiveConfidence: trade.predictiveConfidence,
      regimeWeight: trade.regimeWeight,
      decayPenalty: trade.decayPenalty,
      frictionCost: trade.frictionCost,
      entry: trade.entryPrice,
      exit: exitPrice,
      profit: dollarPnl,
      positionSize: trade.positionSize,
      pool: trade.pool,
      timestamp: new Date(trade.openedAt).toISOString(),
      exitType: exitReason,
      executionContext: trade.executionContext, // 11.8C: Preserve multi-strategy context
      // Phase 14: Preserve context from trade OPEN
      globalRegime: trade.globalRegime,
      pairFriction: trade.pairFriction,
      globalFriction: trade.globalFriction,
      pairDirectionalBias: trade.pairDirectionalBias,
      globalDirectionalBias: trade.globalDirectionalBias,
      // B61 (2026-04-15): propagate numeric DBS scores alongside categories
      pairDirectionalBiasScore: trade.pairDirectionalBiasScore,
      globalDirectionalBiasScore: trade.globalDirectionalBiasScore,
      sourcePool: trade.sourcePool,
      // P19-B7.2b (OBJ-B): carry the maker/taker entry fee-mode onto the closed
      // archive (from the OpenVirtualTrade record) → the vts_trades_*.json closed
      // payload → the VTS closed-trades UI fee-mode column. Entry-leg only.
      chosenEntryMode: trade.chosenEntryMode,
      entryFeeRate: trade.entryFeeRate,
    };

    // Add to session trades
    phase10SessionTrades.push(closedTradeRecord);
    
    // Update telemetry with actual outcome
    // B-4.7: per-class threading landed (supersedes the WIRE-IN #16 deferral);
    // M70 invariant unchanged — VTS is the only authorized writer.
    const telemetry = getTelemetryAggregator();
    telemetry.recordPairTelemetry(trade.symbol, {
      assetClass: trade.assetClass, // B-4.7: stamped at write
      finalScore: trade.finalScore,
      hybridScore: trade.hybridScore,
      regimeWeight: trade.regimeWeight,
      regimeScore: trade.regimeScore,
      predictiveConfidence: trade.predictiveConfidence,
      success: netPnl > 0,
      pool: trade.pool,
      source: 'simulation',
      pairRegime: trade.regime,
      signalType: trade.signalType,
      strategy: trade.strategy,
      pattern: trade.signalType !== 'QUANT' ? (trade.patternType ?? undefined) : undefined,
      caller: 'vts'
    });
    
    // B65.2 + B70.3 (2026-05-05): hoisted out of the persist-try block so
    // the B70 exit-decision hook below can reference finalTradeMode without
    // a scope error. The trailing snapshot read is cheap (in-memory map).
    const { getTrailingState } = await import('./trailing-exit-controller.js');
    // B80 (2026-05-13): per-trade keying — look up engine state by tradeId.
    // B83 (2026-05-14): destructured variable in this for-loop is `id`, not
    // `tradeId`. Pre-B83 bug threw `ReferenceError: tradeId is not defined`
    // every cycle where ≥1 trade should have closed → entire function aborted
    // mid-way → no trades closed → silent pipeline stall since BATCH_80
    // deploy 2026-05-13.
    const trailingSnapshot = getTrailingState(id);
    const finalTradeMode: 'TARGET' | 'TRAILING_TAKE' = trailingSnapshot?.tradeMode ?? 'TARGET';

    // Directive 11.6C: Persist to legacy VTS storage and ML pipeline
    try {
      const result = await vtsService.persistRealPriceTrade({
        // B67.0 follow-up: thread the original VTS signal id (matches the
        // vts_trade_id stored on ablation rows at emit time) so the
        // replay-ablation job can join JSONL outcomes back to ablation rows.
        originalSignalId: trade.id,
        symbol: trade.symbol,
        entryTime: trade.openedAt,
        exitTime: now,
        entryPrice: trade.entryPrice,
        exitPrice: exitPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        positionSize: trade.positionSize,
        regime: trade.regime,
        strategy: trade.strategy,
        signalType: trade.signalType,
        patternType: trade.patternType,
        pnl: netPnl,
        grossPnl: grossPnl,
        exitReason: exitReason,
        tradeMode: finalTradeMode, // B65.2
        ladderRungsHit: trade.ladderRungsHit ?? 0, // B65.4
        // B65.4.2: ladder mechanics observability — read from in-memory trade
        // state (kept in sync with engine via the writeback above).
        originalStopPrice: trade.originalStopPrice,
        latchTriggerPrice: trade.latchTriggerPrice,
        rungTargetHistory: trade.rungTargetHistory,
        finalScore: trade.finalScore,
        hybridScore: trade.hybridScore,
        predictiveConfidence: trade.predictiveConfidence,
        regimeWeight: trade.regimeWeight,
        decayPenalty: trade.decayPenalty,
        frictionCost: trade.frictionCost,
        pool: trade.pool,
        sourcePool: trade.sourcePool, // Batch 45: Propagate family-qualified sourcePool to closed trade
        expectedEdge: trade.expectedEdge, // Batch 45: Propagate actual computed expectedEdge
        // HF9 Item A: Persist context dimensions from trade OPEN snapshot
        globalRegime: trade.globalRegime,
        pairFriction: trade.pairFriction,
        globalFriction: trade.globalFriction,
        pairDirectionalBias: trade.pairDirectionalBias,
        globalDirectionalBias: trade.globalDirectionalBias,
        // B61 (2026-04-15): propagate numeric DBS scores
        pairDirectionalBiasScore: trade.pairDirectionalBiasScore,
        globalDirectionalBiasScore: trade.globalDirectionalBiasScore,
        filterTier: trade.filterTier,
        // B67.3 (2026-04-29): cohort marker for per-underlying-cap A/B observation
        pairIdHash: trade.pairIdHash,
        // B67.2.1 (2026-04-29): regime confidence + macro modifier + phase
        regimeConfidenceRaw: trade.regimeConfidenceRaw,
        macroModifierValue: trade.macroModifierValue,
        phase: trade.phase,
        phaseAgeSeconds: trade.phaseAgeSeconds,
        strategyPhaseWeight: trade.strategyPhaseWeight,
        regimeConfidenceModulated: trade.regimeConfidenceModulated,
        // B73.1 (2026-04-30): real ATR for exit-strategy ablation replay.
        atrAtOpen: trade.atrAtOpen,
        // B79.0m.b2 (2026-05-11): thread assetClass so B73 replay can branch
        // OHLC source (xstock_spot → xstock_spot_ohlc_1m vs crypto_spot →
        // Kraken REST via ohlcCache). Missing field silently degrades xstock
        // replay to empty bars per Langston rev1 #5.
        assetClass: trade.assetClass,
        // B.2.UI (2026-06-02): propagate entry-liquidity snapshot to the closed-trade record.
        entryLiquidityValue: trade.entryLiquidityValue,
        entryLiquidityKind: trade.entryLiquidityKind,
        // B-5 AMR: propagate the at-open weather stamp to the closed record.
        amrClassification: trade.amrClassification,
        amrMode: trade.amrMode,
        // P19-B7.2b (OBJ-B): propagate the maker/taker entry fee-mode to the closed
        // VTS JSON record → the Closed Simulated Trades UI fee-mode column. Entry-leg only.
        chosenEntryMode: trade.chosenEntryMode,
        entryFeeRate: trade.entryFeeRate,
      });
      if (result.persisted) persisted++;
      if (result.mlTriggered) mlQueued++;
    } catch (error) {
      console.error(`[11.6C][Error] Failed to persist ${trade.symbol}:`, error);
    }
    
    // B70 Step 3.5: exit-decision archive — actual exit (parallel to B73 counterfactual).
    // Fire-and-forget, try/catch wrapped — must never block the VTS exit loop.
    try {
      const { archiveExitDecision } = await import('./data-archive/exit-decision-archiver.js');
      const { safeResolveAssetClass } = await import('../../shared/asset-classes.js'); // P19-B3a #139: safe variant (alarms + crypto_spot fallback at use site)
      const exitReasonMap: Record<string, 'BE_stop' | 'SL_hit' | 'TP_target_hit' | 'TRAIL_hit' | 'time_stop' | 'other'> = {
        stop_hit: 'SL_hit',
        target_hit: 'TP_target_hit',
        trailing_stop_hit: 'TRAIL_hit',
        moonbag_timeout: 'TRAIL_hit',
        break_even_stop: 'BE_stop',
        timeout: 'time_stop',
      };
      const mappedReason = exitReasonMap[exitReason] ?? 'other';
      // openedAt is stored as a number (ms epoch) per OpenVirtualTrade interface,
      // not a Date — calling .getTime() throws and silently failed every exit
      // until 2026-05-05.
      const openedAtMs =
        typeof trade.openedAt === 'number'
          ? trade.openedAt
          : new Date(trade.openedAt as any).getTime();
      const durationMin = (now - openedAtMs) / 60000;
      const rMultiple =
        trade.entryPrice && trade.stopLoss && trade.entryPrice !== trade.stopLoss
          ? (exitPrice - trade.entryPrice) / Math.abs(trade.entryPrice - trade.stopLoss)
          : undefined;
      archiveExitDecision({
        mode: 'vts', // ITEM-4 step 2 (D1): carried entry-stamp
        tradeId: trade.id,
        symbol: trade.symbol,
        exchange: 'kraken',
        assetClass: vtsResolveClassOrLoggedDefault(trade.symbol), // P19-B6.5d (was safeResolve ?? crypto_spot silent default)
        source: 'vts-runner',
        strategy: trade.strategy,
        exitReason: mappedReason,
        entryPrice: trade.entryPrice,
        exitPrice,
        pnlPct: pnlPercent !== undefined ? Number(pnlPercent) : undefined,
        rMultiple,
        durationMin,
        regimeAtEntry: trade.regime,
        dbsAtEntry: trade.pairDirectionalBiasScore,
        // B70.2 (2026-05-05) — full closed-trade context per Kyle directive.
        // Capture every field that appears in the closed-trades CSV export.
        stateSnapshot: {
          // Exit semantics
          rawExitReason: exitReason,
          tradeMode: finalTradeMode,
          ladderRungsHit: trade.ladderRungsHit ?? 0,
          originalStopPrice: trade.originalStopPrice,
          latchTriggerPrice: trade.latchTriggerPrice,
          rungTargetHistory: trade.rungTargetHistory,
          // Trade economics (raw values; pnlPct flat already)
          dollarValue: trade.positionSize,
          quantity: trade.quantity,
          target: trade.takeProfit,
          stopLoss: trade.stopLoss,
          grossPnl,
          netPnl,
          fees: trade.fees ?? null,
          // Signal context at entry
          signalType: trade.signalType,
          patternType: trade.patternType,
          pool: trade.pool,
          sourcePool: trade.sourcePool,
          filterTier: trade.filterTier,
          // Scoring
          finalScore: trade.finalScore,
          hybridScore: trade.hybridScore,
          predictiveConfidence: trade.predictiveConfidence,
          expectedEdge: trade.expectedEdge,
          decayPenalty: trade.decayPenalty,
          // Regime + bias context
          globalRegime: trade.globalRegime,
          pairFriction: trade.pairFriction,
          globalFriction: trade.globalFriction,
          pairDirectionalBias: trade.pairDirectionalBias,
          globalDirectionalBias: trade.globalDirectionalBias,
          pairDirectionalBiasScore: trade.pairDirectionalBiasScore,
          globalDirectionalBiasScore: trade.globalDirectionalBiasScore,
          // Confidence chain (raw + modulated)
          regimeWeight: trade.regimeWeight,
          regimeConfidenceRaw: trade.regimeConfidenceRaw,
          regimeConfidenceModulated: trade.regimeConfidenceModulated,
          macroModifierValue: trade.macroModifierValue,
          phase: trade.phase,
          phaseAgeSeconds: trade.phaseAgeSeconds,
          strategyPhaseWeight: trade.strategyPhaseWeight,
          // Cohort marker
          pairIdHash: trade.pairIdHash,
          // ATR at open (B73.1)
          atrAtOpen: trade.atrAtOpen,
        },
      });
    } catch (b70Err) {
      console.warn(
        `[B70][ARCH] vts exit-decision archive enqueue failed:`,
        b70Err instanceof Error ? b70Err.message : b70Err,
      );
    }

    // Remove from open trades registry FIRST (synchronous, can't fail).
    // The Map gate is the correctness invariant against re-running the
    // non-idempotent close cascade (persistRealPriceTrade → closedTrades.push,
    // session P&L, JSON ledger, B73 ablation replay, B70 archive enqueue,
    // ML calibration). Must run before the soft-delete UPDATE so a thrown
    // UPDATE cannot let the next exit cycle re-evaluate this trade and
    // double-execute the cascade.
    openVirtualTrades.delete(id);
    // B79.0g-tx: AWAITED soft-delete UPDATE (no re-throw). Replaces the
    // B79.0g fire-and-log async DELETE. UPDATE is idempotent via
    // `WHERE closed=false`. If this fails, the DB row stays closed=false
    // and rehydrate-on-next-boot re-adds the trade to the Map; a
    // subsequent close cycle retries the cascade idempotently. Soft-
    // delete is NOT a transactional close-time invariant — only Option C
    // would be; this is observability + bounded-history for vts_open_trades.
    try {
      const { markOpenTradeClosed } = await import('./vts-trade-persistence.js');
      await markOpenTradeClosed(id);
    } catch (err) {
      console.error(
        `[B79.0g-tx][MARK_CLOSED_FAIL] trade=${id} soft-delete UPDATE failed; ` +
        `JSON ledger + session metrics OK; DB row stays closed=false until rehydrate-on-next-boot ` +
        `re-adds to Map and a subsequent close cycle retries. Investigate if recurring:`,
        err instanceof Error ? err.message : err,
      );
      // Intentional: do NOT re-throw. Re-throw would let the next exit
      // cycle re-execute the non-idempotent close cascade.
    }
    // Batch 45: Record close timestamp for re-entry cooldown.
    // B79.0m.b2: assetClass-keyed namespace so xstock closes don't block crypto
    // re-entries (or vice versa). The crypto-side generatePhase10Signal check
    // at line 1258 still reads the legacy `${symbol}:${strategy}` key; write
    // BOTH formats during the transition so neither path misses cooldowns.
    // Future cleanup: migrate generatePhase10Signal to assetClass-keyed format
    // and drop the legacy write.
    // P19-B6.5d (Langston JC#3): a STAMP read, not a resolver — prefer the carried trade
    // stamp; on a missing/invalid stamp, LOG the mislabel (passive telemetry, never silent)
    // before the crypto_spot cooldown-key default. Folded in so vts-runner is fully
    // consistent with the five sibling default-sites converted this batch.
    const _cooldownStamp = asValidAssetClass(trade.assetClass);
    if (_cooldownStamp === null) {
      console.warn(`[P19-B6.5d][VTS] cooldown-key: trade ${trade.symbol}/${trade.strategy} missing/invalid asset-class stamp — labeled crypto_spot (logged passive default)`);
    }
    const assetClass = _cooldownStamp ?? 'crypto_spot';
    recentCloses.set(`${assetClass}:${trade.symbol}:${trade.strategy}`, Date.now());
    if (assetClass === 'crypto_spot') {
      recentCloses.set(`${trade.symbol}:${trade.strategy}`, Date.now());
    }

    // B65.2 / B80 (2026-05-13): clear trailing engine state for THIS TRADE.
    // Pre-B80 keyed by symbol — wiped state for ALL concurrent trades on the
    // symbol. Post-B80 keyed by tradeId — only this trade's state is cleared,
    // other concurrent trades on the same symbol are untouched.
    try {
      const { clearTrailingState } = await import('./trailing-exit-controller.js');
      // B83 (2026-05-14): use destructured `id` (was `tradeId` — same BATCH_80
      // rename bug as line 2349 above; would never execute due to abort there).
      clearTrailingState(id);
    } catch (err) {
      console.error(`[B65.2][TEC] Failed to clear trailing state for tradeId=${id} symbol=${trade.symbol}:`, err);
    }

    // Directive 11.6 Task 6: Verification logging
    const pnlSign = netPnl >= 0 ? '+' : '';
    console.log(`[11.6][Exit] ${trade.symbol} closed via ${exitReason} @ ${exitPrice.toFixed(6)} after ${holdDurationStr} | PnL=${pnlSign}${pnlPercent}%`);

    resolved++;
    if (exitReason === 'stop_hit') stopHits++;
    if (exitReason === 'target_hit') targetHits++;
    if (exitReason === 'timeout') timeouts++;
    // B65.2: count trailing-stop and moonbag-timeout closes separately so
    // the cycle summary reflects trailing engagement. HF3: break_even_stop
    // counts as neither hit — it's protection-at-breakeven, call it a stopHit
    // for cycle accounting since the stop fired, but semantically it's
    // distinct and the DB row carries the real reason.
    if (exitReason === 'trailing_stop_hit') { targetHits++; /* counts as winner */ }
    if (exitReason === 'moonbag_timeout') { targetHits++; }
    if (exitReason === 'break_even_stop') { stopHits++; /* for cycle stats only */ }
  }
  
  // [B83-CYCLE] (2026-05-14) Per-cycle summary ALWAYS fires so silent zero-close
  // cycles are observable. Removes the `if (resolved > 0)` gate that hid the
  // pipeline-stall from PM2 logs. REMOVE the unconditional log after observability
  // dashboard ships; the resolved>0 block below stays as the success-path detail.
  console.log(`[B83-CYCLE] ${openVirtualTrades.size} evaluated, ${resolved} closed (stops=${stopHits}, targets=${targetHits}, timeouts=${timeouts}), pending=${tradesToClose.length}`);
  if (resolved > 0) {
    console.log(`[11.6][Resolution] Cycle complete: ${resolved} trades closed (stops=${stopHits}, targets=${targetHits}, timeouts=${timeouts}), ${openVirtualTrades.size} still open`);
    // Directive 11.6D: Sanity check - all trades resolved via real-price
    console.log(`[11.6D][SanityCheck] All trades resolved via real-price. No legacy random trades found.`);
    console.log(`[11.6D][Summary] Trades Closed: ${resolved} | Persisted: ${persisted} | ML Queued: ${mlQueued}`);
  }
  
  return { resolved, stopHits, targetHits, timeouts };
}

/**
 * reorg-B4 — the shadow close ALLOWLIST routine. Writes ONLY the segregated
 * `rtb_shadow_pairings` sink + the shadow's own `vts_open_trades` backing row +
 * its TEC engine state. It NEVER calls a learning store:
 *   ✗ outcomeFeedbackStore.updateEma   ✗ telemetry.recordPairTelemetry
 *   ✗ vtsService.persistRealPriceTrade ✗ archiveExitDecision
 *   ✗ updateRollingAverages           ✗ paper_sim_trades
 * That allowlist (not denylist) is the by-construction closed-side segregation
 * Langston required at Step-2. The PnL/R-multiple math is identical to the real
 * close cascade (vts-runner ~:2610/:2790) — a counterfactual priced the same way.
 */
/**
 * reorg-B4 — the shadow outcome math, extracted PURE + exported so it can be
 * unit-tested AND so the test can pin that it is identical to the real close
 * cascade's formula (vts-runner ~:2610 grossPnl/netPnl + ~:2790 rMultiple). A
 * counterfactual priced exactly like the real trade.
 */
export function computeShadowOutcomeMath(input: {
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  frictionCost?: number;
  openedAt: number;
  now: number;
}): { grossPnl: number; netPnl: number; rMultiple: number | null; holdingMs: number } {
  const { entryPrice, exitPrice, stopLoss, frictionCost = 0, openedAt, now } = input;
  const grossPnl = (exitPrice - entryPrice) / entryPrice;
  const netPnl = grossPnl - frictionCost;
  const holdingMs = now - openedAt;
  const rMultiple =
    entryPrice && stopLoss && entryPrice !== stopLoss
      ? (exitPrice - entryPrice) / Math.abs(entryPrice - stopLoss)
      : null;
  return { grossPnl, netPnl, rMultiple, holdingMs };
}

async function shadowClose(
  id: string,
  trade: OpenVirtualTrade,
  exitPrice: number,
  exitReason: string,
  now: number,
): Promise<void> {
  const { grossPnl, netPnl, rMultiple, holdingMs } = computeShadowOutcomeMath({
    entryPrice: trade.entryPrice,
    exitPrice,
    stopLoss: trade.stopLoss,
    frictionCost: trade.frictionCost ?? 0,
    openedAt: trade.openedAt,
    now,
  });

  // 1) The ONLY outcome write: the segregated selection-quality sink.
  try {
    const { updateShadowPairingOutcome } = await import('./rtb-shadow-store.js');
    await updateShadowPairingOutcome(id, {
      grossPnl,
      netPnl,
      rMultiple,
      closeReason: exitReason,
      exitPrice,
      holdingMs: Math.round(holdingMs),
    });
  } catch (err) {
    console.error(`[reorg-B4][SHADOW_OUTCOME_FAIL] shadow=${id} symbol=${trade.symbol}:`, err instanceof Error ? err.message : err);
  }

  // 2) Map delete FIRST (the correctness gate against re-running this close), then
  //    soft-close the shadow's own backing row (idempotent via WHERE closed=false).
  openShadowTrades.delete(id);
  // SAME key derivation as open/rehydration so the entry actually clears (incl. on a
  // TTL/shadow_max_hold expiry close — those route through here too, so an expired
  // signal's dedupe entry is released and it can re-open later).
  const dedupeKey = shadowDedupeKey((trade as any).mode, (trade as any).signalId, trade.symbol, trade.strategy);
  if (shadowOpenBySignal.get(dedupeKey) === id) shadowOpenBySignal.delete(dedupeKey);
  try {
    const { markOpenTradeClosed } = await import('./vts-trade-persistence.js');
    await markOpenTradeClosed(id);
  } catch (err) {
    console.error(`[reorg-B4][SHADOW_MARK_CLOSED_FAIL] shadow=${id}:`, err instanceof Error ? err.message : err);
  }

  // 3) Clear the shadow's TEC engine state (it's exit-MECHANICS, not a learning
  //    sink; shadows populate it so we must clear it — bounded by cap + TTL).
  try {
    const { clearTrailingState } = await import('./trailing-exit-controller.js');
    clearTrailingState(id);
  } catch (err) {
    console.error(`[reorg-B4][SHADOW_TEC_CLEAR_FAIL] shadow=${id}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * reorg-B4 — the SHADOW resolver pass. A sibling to resolveOpenVirtualTrades that
 * drains `openShadowTrades` ONLY. Kept fully separate (own price fetch, own loop)
 * so the live resolver above is byte-identical (OBJ-3b) and shadow logic touches
 * nothing on the learning path BY CONSTRUCTION. Reuses the SAME exit-math service
 * `evaluateTECExit` the real resolver uses (vts-runner:2458) — ZERO drift: a change
 * to the exit math is auto-applied to shadows. The ONLY shadow-specific differences
 * are PARAMETERS/ACTIONS, not forked math: `maxHoldMs = SHADOW_MAX_HOLD_MS` (6h vs
 * 7d), and the close ACTION is `shadowClose` (isolated sink) vs the real cascade.
 *
 * No-op while `openShadowTrades` is empty — which it is until paper-mode active
 * trading is turned on (the promotion boundary is dormant at rtb_total=0 today).
 */
async function resolveOpenShadowTrades(): Promise<{ shadowResolved: number }> {
  const now = Date.now();
  let shadowResolved = 0;
  if (openShadowTrades.size === 0) {
    return { shadowResolved };
  }

  // Price fetch — mirrors resolveOpenVirtualTrades' asset-class dispatch. Kept
  // duplicated (not extracted) ON PURPOSE: isolation over DRY for a telemetry-only
  // layer means the live resolver is never touched.
  const cryptoSymbols = new Set<string>();
  const xstockSymbols = new Set<string>();
  for (const t of openShadowTrades.values()) {
    if (t.assetClass === 'xstock_spot') xstockSymbols.add(t.symbol);
    else cryptoSymbols.add(t.symbol);
  }
  const bucketType: CacheBucketType = 'vtsSimulation';
  const cryptoSymbolList = Array.from(cryptoSymbols);
  for (const symbol of cryptoSymbolList) priceCache.subscribe(symbol, bucketType);
  if (cryptoSymbolList.length > 0) await new Promise(resolve => setTimeout(resolve, 100));
  const cryptoPriceMap = cryptoSymbolList.length > 0
    ? await priceCache.getBatch(bucketType, cryptoSymbolList)
    : new Map<string, CachedPrice>();

  const xstockPriceMap = new Map<string, { price: number }>();
  if (xstockSymbols.size > 0) {
    try {
      const xstockSymbolListSql = Array.from(xstockSymbols).map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
      const result: any = await db.execute(sql.raw(`
        SELECT DISTINCT ON (symbol) symbol::text AS symbol, last::text AS price
        FROM xstock_spot_ticker_snap
        WHERE captured_at > NOW() - INTERVAL '5 minutes' AND symbol IN (${xstockSymbolListSql})
        ORDER BY symbol, captured_at DESC
      `));
      const rows = (result as any).rows ?? result;
      if (Array.isArray(rows)) {
        for (const r of rows as Array<{ symbol: string; price: string }>) {
          const price = parseFloat(r.price);
          if (Number.isFinite(price) && price > 0) xstockPriceMap.set(r.symbol, { price });
        }
      }
    } catch (err) {
      console.error(`[reorg-B4][SHADOW_XSTOCK_PRICE_FETCH] failed:`, err instanceof Error ? err.message : err);
    }
  }
  const getShadowPrice = (symbol: string, assetClass?: string): number | null => {
    if (assetClass === 'xstock_spot') return xstockPriceMap.get(symbol)?.price ?? null;
    const p = cryptoPriceMap.get(symbol);
    return p && p.price > 0 ? p.price : null;
  };

  const { getTrailingState } = await import('./trailing-exit-controller.js');
  const toClose: Array<{ id: string; trade: OpenVirtualTrade; exitPrice: number; exitReason: string }> = [];
  for (const [tradeId, trade] of openShadowTrades) {
    if (!trade.assetClass) { openShadowTrades.delete(tradeId); continue; }
    const holdDurationMs = now - trade.openedAt;
    const currentPrice = getShadowPrice(trade.symbol, trade.assetClass);
    const existingTecState = getTrailingState(tradeId);
    const tecSeed = existingTecState ? undefined : {
      tradeMode: 'TARGET' as const,
      ladderRung: trade.ladderRungsHit ?? 0,
      originalStopPrice: trade.originalStopPrice ?? trade.stopLoss,
    };
    let decision: Awaited<ReturnType<typeof evaluateTECExit>>;
    try {
      decision = await evaluateTECExit({
        tradeId,
        symbol: trade.symbol,
        entryPrice: trade.entryPrice,
        stopPrice: trade.stopLoss,
        targetPrice: trade.takeProfit,
        currentPrice,
        atr: trade.atrAtOpen ?? 0,
        holdDurationMs,
        maxHoldMs: SHADOW_MAX_HOLD_MS, // ← the ONLY exit-math PARAM that differs from the real pass
        context: {
          exchange: 'kraken',
          assetClass: trade.assetClass,
          strategy: trade.strategy,
          regime: trade.regime,
        },
        useTrailing: true,
        DI: trade.diAtOpen ?? 50,
        volNoise: trade.volNoiseAtOpen ?? 0.3,
        callerMode: 'vts',
        sourcePool: trade.sourcePool ?? null,
        currentSlotTotal: Number.POSITIVE_INFINITY,
        seed: tecSeed,
      });
    } catch (tecErr) {
      console.error(`[reorg-B4][SHADOW_EXIT_EVAL_ISOLATED] shadow=${tradeId} symbol=${trade.symbol} — skipping this cycle:`, tecErr instanceof Error ? tecErr.message : tecErr);
      continue;
    }
    if (decision.newStopPrice !== undefined && decision.newStopPrice > trade.stopLoss) {
      trade.stopLoss = decision.newStopPrice;
    }
    if (!decision.shouldExit) continue;
    const reason = decision.exitReason === 'stale_timeout' ? 'shadow_max_hold' : (decision.exitReason ?? 'timeout');
    toClose.push({ id: tradeId, trade, exitPrice: decision.exitPrice, exitReason: reason });
  }

  for (const { id, trade, exitPrice, exitReason } of toClose) {
    await shadowClose(id, trade, exitPrice, exitReason, now);
    shadowResolved++;
  }
  if (shadowResolved > 0) {
    console.log(`[reorg-B4][SHADOW_RESOLVE] closed ${shadowResolved} shadow trades, ${openShadowTrades.size} still open (dropCount=${shadowDropCount})`);
  }
  return { shadowResolved };
}

/**
 * Helper function to format hold duration in human-readable format
 */
function formatHoldDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  // Batch 53 Fix 2: Show seconds for sub-minute durations instead of misleading "0m"
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m`;
}

/**
 * Get current open virtual trades count and status
 */
export function getOpenVirtualTradesStatus(): {
  count: number;
  oldestOpenedAt: string | null;
  newestOpenedAt: string | null;
  trades: Array<{
    symbol: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    holdDurationMs: number;
    openedAt: string;
    strategy: string;
    regime: string;
    signalType: string;         // Batch 19F Phase 2: Expose signal type for ML page
    sourcePool: string;         // Batch 19F Phase 2: Expose source pool for ML page
    patternType: string | null; // Batch 19F Phase 2: Expose pattern type for ML page
    pool: string;               // Batch 19F Phase 2: Expose pool tier for ML page
    finalScore: number;         // Batch 19F Phase 2: Expose finalScore for ML page
    hybridScore: number;        // Batch 19F Phase 2: Expose hybridScore for ML page
  }>;
} {
  const now = Date.now();
  const trades = Array.from(openVirtualTrades.values()).map(t => ({
    symbol: t.symbol,
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    holdDurationMs: now - t.openedAt,
    openedAt: new Date(t.openedAt).toISOString(),
    strategy: t.strategy,
    regime: t.regime,
    signalType: t.signalType ?? 'QUANT',
    sourcePool: t.sourcePool ?? 'quant',
    patternType: t.patternType ?? null,
    pool: t.pool ?? 'rotational',
    finalScore: t.finalScore ?? 0,
    hybridScore: t.hybridScore ?? 0,
  }));
  
  const sortedByTime = trades.slice().sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime());
  
  return { 
    count: openVirtualTrades.size,
    oldestOpenedAt: sortedByTime.length > 0 ? sortedByTime[0].openedAt : null,
    newestOpenedAt: sortedByTime.length > 0 ? sortedByTime[sortedByTime.length - 1].openedAt : null,
    trades
  };
}

// ════════════════════════════════════════════════════════════════════════════
// B79.0m.b2 — pre-trade-open gate check for non-crypto eval cycles
// ════════════════════════════════════════════════════════════════════════════
// Mirrors the gates in generatePhase10Signal (re-entry cooldown, duplicate
// position guard, max open trades cap) so xstock_spot eval-cycle gets the
// same pre-open safety checks as crypto. Returns null if all gates pass, or
// the rejection reason if any fails.
//
// Setup-hash dedupe + per-underlying-cap (B67.3) are kept inline in the
// asset-class eval-cycle (setup-hash) or omitted at Layer-1 (per-underlying
// is a crypto cohort observation).
// ════════════════════════════════════════════════════════════════════════════
export function checkPreOpenGates(
  assetClass: AssetClass,
  symbol: string,
  strategy: string,
  currentPrice: number,
  stopLoss: number,
  takeProfit: number,
  frictionCost: number,
): { allowed: true } | { allowed: false; reason: string } {
  // Re-entry cooldown (recentCloses) — assetClass-keyed namespace so xstock
  // closes don't block crypto re-entries or vice versa.
  const cooldownKey = `${assetClass}:${symbol}:${strategy}`;
  const lastClose = recentCloses.get(cooldownKey);
  if (lastClose && Date.now() - lastClose < getReentryCooldownMs()) {
    return { allowed: false, reason: 'reentry_cooldown' };
  }
  // Duplicate position guard — max concurrent per (symbol, strategy) combo.
  const existingTradeCount = Array.from(openVirtualTrades.values()).filter((t) =>
    t.symbol === symbol && t.strategy === strategy && t.assetClass === assetClass
  ).length;
  if (existingTradeCount >= getVtsMaxConcurrentPerCombo()) {
    return { allowed: false, reason: 'duplicate_position' };
  }
  // Entry-price-past-stop / target validation (B53).
  const minViableDistance = frictionCost * currentPrice * 2;
  if (currentPrice <= stopLoss) {
    return { allowed: false, reason: 'price_past_stop' };
  }
  if (currentPrice >= takeProfit - minViableDistance) {
    return { allowed: false, reason: 'price_past_target' };
  }
  // Max open trades cap.
  if (openVirtualTrades.size >= getMaxOpenTrades()) {
    return { allowed: false, reason: 'max_open_trades' };
  }
  return { allowed: true };
}

// B79.0m.b — registerOpenVtsTrade
// ════════════════════════════════════════════════════════════════════════════
// Shared trade-registration helper used by the xstock_spot eval-cycle (and
// future non-crypto eval cycles). Encapsulates the INSERT-before-Map.set
// invariant (Langston B79.0g Step 4 F1), the assetClass-keyed setup-hash
// (Langston B79.0m.b rev2 R6), and the openVirtualTrades Map insertion so
// callers don't reach into module-private state.
//
// Crypto's existing trade-open path inside `generatePhase10Signal` does NOT
// route through this helper today — Langston-locked architecture for B79.0m.b
// is "build new xstock pipeline + call existing shared post-filter functions;
// vts-runner.ts UNTOUCHED on crypto's hot path." Retrofitting crypto's
// trade-open to use this helper is a future cleanup (B79.0n+).
//
// Setup-hash key:  ${assetClass}:${symbol}:${strategy}
//   The assetClass prefix isolates xstock vs crypto re-entry namespaces.
//   Crypto's pre-existing entries use ${symbol}:${strategy} (no assetClass
//   prefix) — those decay out via time-expiry pruning.
// ════════════════════════════════════════════════════════════════════════════
export interface RegisterOpenVtsTradeInput {
  id?: string;
  symbol: string;
  assetClass: AssetClass;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  dollarValue: number;
  quantity: number;
  frictionCost: number;
  regime: MarketRegimeType;
  regimeScore: number;
  signalType: CanonicalSignalType;
  strategy: string;
  patternType?: PatternType | null;
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
  pool: 'ideal' | 'rotational';
  sourcePool?: string;
  // Optional context fields — caller may pass MCE-derived snapshots.
  // B-NEW-22 (2026-05-13): if caller omits any of globalRegime / pairFriction /
  // globalFriction / pairDirectionalBias / globalDirectionalBias / pair-
  // DirectionalBiasScore / globalDirectionalBiasScore, registerOpenVtsTrade
  // default-resolves them via the canonical helpers (matches the inline crypto
  // open path in this file at lines ~1414-1426). Prevents xstock-style empty
  // columns in the open-trades CSV/UI when callers don't know to pass them.
  atrAtOpen?: number;
  globalRegime?: MarketRegimeType;
  pairFriction?: number;
  globalFriction?: number;
  pairDirectionalBias?: string;
  pairDirectionalBiasScore?: number | null;
  globalDirectionalBias?: string;
  globalDirectionalBiasScore?: number | null;
  macroModifierValue?: number;
  regimeConfidenceRaw?: number;
  regimeConfidenceModulated?: number;
  phase?: 'EARLY' | 'PRIME' | 'LATE';
  phaseAgeSeconds?: number;
  strategyPhaseWeight?: number;
  // B.2.UI (2026-06-02): entry-liquidity snapshot (xStock ask-depth USD / crypto 24h coin-volume).
  entryLiquidityValue?: number;
  entryLiquidityKind?: 'depth_usd' | 'volume_qty';
  // B-5 AMR: at-open weather stamp.
  amrClassification?: string;
  amrMode?: string;
  // reorg-B3.3x: the VTS quality-gate verdict (the shared normalizer's reorg-B3.2 tag-don't-drop output).
  // 'passed' cleared the RR/reachability gate; 'rr_below_min'/'unreachable' = the active path WOULD suppress
  // it but VTS tags + simulates. Lands on the same in-memory OpenVirtualTrade record crypto's inline path uses
  // (vts-runner ~:1649). In-memory-only — there is NO DB column (reorg-B3.2 no-migration; re-derivable from
  // geometry). The xStock eval-cycle now passes it so xStock VTS trades carry the verdict at parity with crypto.
  vtsGateVerdict?: 'passed' | 'rr_below_min' | 'unreachable';
}

/**
 * INSERT a new open VTS trade into both persistence + in-memory Map +
 * setup-hash dedupe map. Returns the trade id on success, or null on
 * INSERT failure (caller treats as fatal trade-open and aborts).
 */
export async function registerOpenVtsTrade(input: RegisterOpenVtsTradeInput): Promise<string | null> {
  const tradeId = input.id ?? `vts_${input.assetClass}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const openedAt = Date.now();

  // B79.0g pre-flight: refuse duplicate id (Map.set idempotency check).
  if (openVirtualTrades.has(tradeId)) {
    console.warn(`[B79.0m.b][registerOpenVtsTrade] tradeId=${tradeId} already in openVirtualTrades — refusing duplicate insert`);
    return null;
  }

  // B-NEW-22 (2026-05-13): default-resolve the 5 context fields that callers
  // may not pass (xstock eval-cycle was passing only pairDirectionalBias[Score]).
  // Mirrors the inline crypto open-path resolution at this file's lines
  // ~1414-1426. Without these, the open-trades CSV/UI showed empty
  // globalRegime/pairFriction/globalFriction/globalDirectionalBias/
  // globalDirectionalBiasScore columns for every xstock trade.
  // B-4.7 (Langston pre-audit item (b)): globalRegime is an AT-OPEN snapshot —
  // the close-time re-resolution (which also read the deleted mixed-class
  // vote) was removed; null-at-open is PRESERVED as the honest value.
  const resolvedGlobalRegime: MarketRegimeType | undefined = input.globalRegime ?? undefined;
  const resolvedPairFriction = input.pairFriction ?? (() => {
    try {
      // B79.0n.MCE: assetClass REQUIRED — resolved from the symbol.
      const cm = getCachedCostMetrics(input.symbol, vtsResolveClassOrLoggedDefault(input.symbol)); // P19-B6.5d (was safeResolve ?? crypto_spot)
      return Math.min(((cm.fee * 2 + cm.slippage * 2 + cm.spread) * 10000) / 3, 100);
    } catch {
      return undefined;
    }
  })();
  // B-4.7 (Langston pre-audit item (b)): these are AT-OPEN snapshots — the
  // close-time re-resolution fallbacks were removed (re-resolving at close
  // mixes timestamps AND, pre-B-4.7, mixed classes). A null/undefined at-open
  // value is PRESERVED as the honest absence.
  const resolvedGlobalFriction = input.globalFriction ?? undefined;
  const resolvedGlobalDirectionalBias = input.globalDirectionalBias ?? undefined;
  const resolvedGlobalDirectionalBiasScore = input.globalDirectionalBiasScore ?? undefined;

  const openTrade: OpenVirtualTrade = {
    id: tradeId,
    symbol: input.symbol,
    assetClass: input.assetClass,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    positionSize: input.positionSize,
    dollarValue: input.dollarValue,
    quantity: input.quantity,
    frictionCost: input.frictionCost,
    regime: input.regime,
    regimeScore: input.regimeScore,
    signalType: input.signalType,
    strategy: input.strategy,
    patternType: input.patternType ?? null,
    finalScore: input.finalScore,
    hybridScore: input.hybridScore,
    predictiveConfidence: input.predictiveConfidence,
    regimeWeight: input.regimeWeight,
    decayPenalty: input.decayPenalty,
    pool: input.pool,
    openedAt,
    executionContext: 'VTS',
    // B.2.UI: pass-through the caller-captured entry-liquidity snapshot (null-guarded).
    entryLiquidityValue: input.entryLiquidityValue,
    entryLiquidityKind: input.entryLiquidityKind,
    // B-5 Obj-15a Finding-B fix: default-resolve the at-open weather stamp
    // when the caller omits it — same B-NEW-22 pattern as the 5 context
    // fields above. The xstock eval-cycle opens through here WITHOUT passing
    // stamps, so every xstock VTS row persisted amrClassification=null while
    // the inline crypto path (line ~1528) stamped correctly (audit evidence:
    // 19 post-deploy entries, the 1 stamped row crypto, all 18 null xstock).
    amrClassification: input.amrClassification ?? _amrWeatherMod?.getAmrWeatherReport(input.assetClass)?.classification,
    amrMode: input.amrMode ?? _amrWeatherMod?.getAmrWeatherReport(input.assetClass)?.resolvedMode ?? undefined,
    sourcePool: input.sourcePool,
    // reorg-B3.3x: thread the caller's VTS gate verdict onto the shared OpenVirtualTrade record (parity with
    // crypto's inline path). undefined → the OpenVirtualTrade optional field defaults; crypto callers that
    // don't pass it are unaffected.
    vtsGateVerdict: input.vtsGateVerdict,
    atrAtOpen: input.atrAtOpen,
    diAtOpen: 50,
    volNoiseAtOpen: 0.3,
    originalStopPrice: input.stopLoss,
    rungTargetHistory: [],
    // B-NEW-22 resolved context fields (default to inline-resolution if caller omitted).
    globalRegime: resolvedGlobalRegime,
    pairFriction: resolvedPairFriction,
    globalFriction: resolvedGlobalFriction,
    pairDirectionalBias: input.pairDirectionalBias,
    pairDirectionalBiasScore: input.pairDirectionalBiasScore ?? null,
    globalDirectionalBias: resolvedGlobalDirectionalBias,
    globalDirectionalBiasScore: resolvedGlobalDirectionalBiasScore,
    macroModifierValue: input.macroModifierValue,
    regimeConfidenceRaw: input.regimeConfidenceRaw,
    regimeConfidenceModulated: input.regimeConfidenceModulated,
    phase: input.phase,
    phaseAgeSeconds: input.phaseAgeSeconds,
    strategyPhaseWeight: input.strategyPhaseWeight,
  };

  // INSERT before Map.set — Langston B79.0g Step 4 F1.
  try {
    const { insertOpenTrade } = await import('./vts-trade-persistence.js');
    await insertOpenTrade(openTrade as any);
  } catch (persistErr) {
    console.error(
      `[B79.0m.b][registerOpenVtsTrade] PERSIST_FAIL trade=${tradeId} symbol=${input.symbol} ` +
      `asset_class=${input.assetClass} — aborting trade-open:`,
      persistErr instanceof Error ? persistErr.message : persistErr,
    );
    return null;
  }

  openVirtualTrades.set(tradeId, openTrade);

  // Setup-hash dedupe — assetClass-namespaced per Langston R6.
  const setupKey = `${input.assetClass}:${input.symbol}:${input.strategy}`;
  lastSetupHash.set(setupKey, computeSetupHash(input.entryPrice, input.stopLoss, input.takeProfit));

  console.log(
    `[B79.0m.b][Entry] ${input.symbol} (${input.assetClass}) opened @ ${input.entryPrice.toFixed(6)} ` +
    `stop=${input.stopLoss.toFixed(6)} target=${input.takeProfit.toFixed(6)} ` +
    `strategy=${input.strategy} regime=${input.regime}`,
  );
  return tradeId;
}

/**
 * B79.0m.b — read-only check whether the (assetClass, symbol, strategy) tuple
 * already has a setup-hash recorded with the same entry/stop/target. Used by
 * non-crypto eval cycles to suppress identical re-entries (mirrors crypto's
 * Batch 47f15 hash-suppression — same prevention, assetClass-keyed).
 */
export function isIdenticalXstockSetupSuppressed(
  assetClass: AssetClass,
  symbol: string,
  strategy: string,
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
): boolean {
  const key = `${assetClass}:${symbol}:${strategy}`;
  const prev = lastSetupHash.get(key);
  if (!prev) return false;
  return prev === computeSetupHash(entryPrice, stopLoss, takeProfit);
}

async function runPhase10SimulationCycle(): Promise<VTSCycleMetrics> {
  const cycleStart = Date.now();
  cycleCount++;

  // Memory audit: prune stale re-entry suppression data each cycle
  pruneReentryMaps();

  // Directive 11.6: First resolve any open trades before creating new ones
  await resolveOpenVirtualTrades();

  // reorg-B4: drain the SEPARATE shadow-trade Map (telemetry-only selection-quality
  // layer). No-op until paper-mode active trading is on (the promotion boundary that
  // opens shadows is dormant at rtb_total=0 today). Own try/catch — a shadow-resolve
  // fault must never perturb the live VTS cycle.
  try {
    await resolveOpenShadowTrades();
  } catch (shadowErr) {
    console.error(`[reorg-B4][SHADOW_RESOLVE_FAULT] shadow pass threw (live cycle unaffected):`, shadowErr instanceof Error ? shadowErr.message : shadowErr);
  }

  // ITEM-4 O1 (2026-06-09): the tradingActive cycle-skip guard is REMOVED.
  // VTS is a standalone always-on producer — it runs regardless of paper/live
  // active-trading state (Kyle Gate-2 design, ITEM_4_GATE2_DESIGN_PACKET.md §3 O1).
  // Lifecycle is governed ONLY by VTS's own start/stop (isAutonomousRunning).

  // Batch 19F Phase 2: getIdealPoolPairs() now returns ALL pairs from FX5 scan batch
  // with sourcePool tags (quant/pattern) already set. This is the SOLE pair source for VTS.
  // The FX5 scan batch includes duplicated entries for pairs that pass BOTH filter paths
  // (each entry tagged with the respective sourcePool), matching active trading path parity.
  // CRITICAL FIX: Previous code called activeFilterPool.getPatternPool('paper') which returns
  // EMPTY during passive learning — active filter pool only populates when trading is ACTIVE.
  //
  // ITEM-4 ENTRY-STAMP (2026-06-09, Kyle stamp-at-entry architecture): this is the
  // POSSESSION BOUNDARY — where VTS takes the shared FX5 compute output as its own
  // working set. Every pair is stamped sourceMode='vts' HERE and the tag rides the
  // payload through the pipeline. Downstream stages read the carried tag — never a
  // global "current mode" lookup. (Consumer re-points = Phase B step 2 / D1+D9;
  // threading pattern identical to the proven asset_class dimension, B79.0n.)
  const allPairs = (await getIdealPoolPairs()).map(p => ({ ...p, sourceMode: 'vts' as const }));

  // Split pairs by sourcePool for logging and strategy routing
  const quantPairs = allPairs.filter(p => isQuantPool(p.sourcePool));
  const patternPairs = allPairs.filter(p => p.sourcePool === 'pattern');

  // Use all pairs (quant + pattern) for the simulation loop
  const pairs = allPairs;
  // Batch 52 Fix 16A: Diagnostic trace — VTS loop entry count
  // IMPORTANT: Use dynamic import to avoid circular dependency at boot time.
  // The static fx5Scanner import (line 48) causes "Cannot access fx5Scanner2 before initialization"
  // when boot_orchestrator calls startAutonomousSimulation() during startup.
  const { fx5Scanner: fx5ScannerForDiag } = await import('./fx5-scanner.js');
  const lastDiagForTrace = fx5ScannerForDiag.getLastScanDiagnostics();
  console.log(`[52][HANDOFF] VTS loop entry: ${pairs.length} pairs (quant=${quantPairs.length} pattern=${patternPairs.length}) | FX5 destinationCount=${lastDiagForTrace?.destinationCount ?? 'N/A'} | uniqueSymbols=${new Set(pairs.map(p => p.symbol)).size}`);

  if (pairs.length === 0) {
    console.warn(`[11.0E.1][VTS] No pairs available for simulation cycle`);
    return {
      cycleId: cycleCount,
      pairsEvaluated: 0,
      tradesSimulated: 0,
      avgFinalScore: 0,
      regimeDistribution: {} as Record<MarketRegimeType, number>,
      signalTypeDistribution: {},
      strategiesExecuted: [],
      cycleDurationMs: Date.now() - cycleStart,
      timestamp: Date.now()
    };
  }

  console.log(`[11.0E.1][VTS] Running cycle with ${pairs.length} pairs (${quantPairs.length} quant + ${patternPairs.length} pattern)`);
  
  const regimeDistribution: Record<MarketRegimeType, number> = {
    TREND_FRIENDLY_STABLE: 0,
    HIGH_VOLATILITY_UNSTABLE: 0,
    RANGE_BOUND_STABLE: 0,
    IMPULSE_EXPANSION: 0,
    STRUCTURAL_TRANSITION: 0
  };
  const signalTypeDistribution: Record<string, number> = {};
  const strategiesExecuted: Set<string> = new Set();
  let simulatedCount = 0;
  let totalFinalScore = 0;

  // Batch 21: VTS evaluation outcome counters (expanded with null reasons + totalStrategyEvaluations)
  let vtsEvalCounters: Omit<VTSEvalSnapshot, 'timestamp'> = {
    quantPairsEvaluated: 0,
    patternPairsEvaluated: 0,
    quantPairPoolEvaluations: 0,   // Batch 51: pair+family combinations (apples-to-apples with IMF survivors)
    patternPairPoolEvaluations: 0, // Batch 51: pair+family combinations
    quantStrategyNulls: 0,
    patternStrategyNulls: 0,
    patternNoDetection: 0,
    patternDetected: 0,
    quantPatternDetected: 0,
    quantPatternNoDetection: 0,
    signalsGenerated: 0,
    quantStrategyEvaluations: 0,
    patternStrategyEvaluations: 0,
    quantSignalsGenerated: 0,
    patternSignalsGenerated: 0,
    signalsRejected: 0,
    quantSignalsRejected: 0,
    patternSignalsRejected: 0,
    pairsSkippedNoPrice: 0,
    pairsSkippedInsufficientOHLC: 0,
    totalStrategyEvaluations: 0,
    nullReasons: {
      conditionsNotMet: 0,
      adxGuard: 0,
      duplicatePosition: 0,
      uniqueDuplicateCombos: 0,
      maxOpenTrades: 0,
      regimeNoStrategies: 0,
      familyFilterMismatch: 0,
    },
    rejectedReasons: {
      netEvBelowFloor: 0,
    },
    byStrategy: {} as Record<string, { evaluated: number; nulls: number; signals: number; preRejectionSignals: number; rejected: number }>,
    nullReasonDetail: {} as Record<string, number>,
    quantNullReasonDetail: {} as Record<string, number>,
    patternNullReasonDetail: {} as Record<string, number>,
  };
  
  // Directive 11.0E.2: Use isolated VTS cache bucket for sandboxing
  const bucketType: CacheBucketType = 'vtsSimulation';
  for (const pair of pairs) {
    priceCache.subscribe(pair.symbol, bucketType);
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const symbols = pairs.map(p => p.symbol);
  const priceDataMap = await priceCache.getBatch(bucketType, symbols);

  // Phase 14.1 HF8 (A3): Fetch BTC OHLC once per cycle for defensive_hedge correlation
  // BTC is a separate pair with its own rate limit counter — negligible API impact
  try {
    // Batch 18: Use OHLC cache for BTC too — fetched at most once per 5 minutes
    const { ohlc: btcOhlc } = await ohlcCache.getOHLCData('XXBTZUSD', 60);
    if (btcOhlc && btcOhlc.length > 0) {
      btcOhlcCache = btcOhlc.map((candle: any) => ({
        open: parseFloat(candle.open || candle[1]),
        high: parseFloat(candle.high || candle[2]),
        low: parseFloat(candle.low || candle[3]),
        close: parseFloat(candle.close || candle[4]),
        volume: parseFloat(candle.volume || candle[6] || 0),
        timestamp: candle.timestamp || candle[0] * 1000
      }));
      console.log(`[HF8][VTS] BTC OHLC cached: ${btcOhlcCache.length} candles for defensive_hedge`);
    }
  } catch (err) {
    console.warn('[HF8][VTS] BTC OHLC fetch failed, defensive_hedge will degrade gracefully:', err);
    btcOhlcCache = [];
  }

  // Batch 19G: Hybrid confluence dedupe guard — prevent duplicate hybrids per cycle
  const hybridDedupeSet = new Set<string>();

    // Batch 22: Build per-symbol family set for VTS from ACTUAL family filter results.
    // FX5 scanner runs family IMF filters and stores results in familyPoolSurvivors.
    // We need those results tagged onto VTS pairs. Read from FX5 scanner's last diagnostics.
    const { STRATEGY_FAMILY_MAP, FILTER_FAMILIES, HYBRID_FAMILY_ELIGIBILITY, MULTI_FAMILY_ELIGIBILITY } = await import('../config/canonical-regime-strategy-map.js');
    const { fx5Scanner } = await import('./fx5-scanner.js');
    const vtsSymbolFamilies = new Map<string, Set<string>>();

    // Get family filter results from last FX5 scan
    const lastDiag = fx5Scanner.getLastScanDiagnostics();
    if (lastDiag?.familyPaths) {
      for (const [family, data] of Object.entries(lastDiag.familyPaths as Record<string, any>)) {
        const survivorSymbols: string[] = data.survivorSymbols ?? [];
        for (const sym of survivorSymbols) {
          if (!vtsSymbolFamilies.has(sym)) vtsSymbolFamilies.set(sym, new Set());
          vtsSymbolFamilies.get(sym)!.add(family);
        }
      }
    }

    // Also tag pattern-pool pairs with 'pattern' family
    for (const pair of pairs) {
      if (pair.sourcePool === 'pattern') {
        if (!vtsSymbolFamilies.has(pair.symbol)) vtsSymbolFamilies.set(pair.symbol, new Set());
        vtsSymbolFamilies.get(pair.symbol)!.add('pattern');
      }
    }

    console.log(`[22][VTS] Family tags built: ${vtsSymbolFamilies.size} symbols with family data`);

  // Batch 22 HF3: Track unique duplicate combos for observability
  const blockedDupCombos = new Set<string>();

  // B-4.6-B chunk B: elapsed-gated macrotask yields at PAIR boundaries ONLY
  // in this EVAL loop (the resolve loop above gets NO yields in this scope —
  // pre-audit C1: its .state weekend-suspend read-coherence spans stay atomic).
  const _yield46b = new ScanYielder('vts_eval');

  for (const pair of pairs) {
    await _yield46b.maybeYield(); // B-4.6-B chunk B: pair boundary
    try {
      // Batch 23: Max open trades check (B72: from module_constants).
      if (openVirtualTrades.size >= getMaxOpenTrades()) {
        vtsEvalCounters.nullReasons.maxOpenTrades++;
        // Batch 57: Pool-keyed pre-eval skip
        if (pair.sourcePool === 'pattern') {
          if (!vtsEvalCounters.patternNullReasonDetail) { vtsEvalCounters.patternNullReasonDetail = {}; }
          vtsEvalCounters.patternNullReasonDetail['max_open_trades'] = (vtsEvalCounters.patternNullReasonDetail['max_open_trades'] ?? 0) + 1;
        } else {
          if (!vtsEvalCounters.quantNullReasonDetail) { vtsEvalCounters.quantNullReasonDetail = {}; }
          vtsEvalCounters.quantNullReasonDetail['max_open_trades'] = (vtsEvalCounters.quantNullReasonDetail['max_open_trades'] ?? 0) + 1;
        }
        continue; // Skip this pair — portfolio full
      }
      const priceData = priceDataMap.get(pair.symbol);
      if (!priceData || priceData.price <= 0) {
        vtsEvalCounters.pairsSkippedNoPrice = (vtsEvalCounters.pairsSkippedNoPrice ?? 0) + 1;
        continue;
      }

      const ohlcData = await fetchOHLCForPair(pair.symbol);
      if (ohlcData.length < 10) {
        vtsEvalCounters.pairsSkippedInsufficientOHLC = (vtsEvalCounters.pairsSkippedInsufficientOHLC ?? 0) + 1;
        continue;
      }
      
      // ══════════════════════════════════════════════════════════════════════════════
      // Directive 11.8C: Multi-Strategy Regime-Scoped Simulation
      // Instead of selecting one "best" strategy per pair, compute the pair's regime
      // and simulate trades for ALL strategies mapped to that regime.
      // This generates N trades per pair (where N = regime-compatible strategy count).
      // ══════════════════════════════════════════════════════════════════════════════
      // B79.0n.PATTERN-DETECT (2026-05-24, post-Step-8 iteration): capture-and-reuse
      // asset-class resolution at outer-loop pair entry. Eliminates the prior pattern
      // of calling resolveAssetClass() at MCE + outer-scanPatterns + inner-scanPatterns
      // (3 separate throws/WARNs per pair iteration). Uses safeResolveAssetClass —
      // null → skip pair cleanly. Converts the fail-hard throw on B69-unregistered
      // symbols (e.g. H/USD — Langston Step 8 flag) into a clean per-pair skip.
      // B-4.6-B chunk A (measurement only): the contiguous per-pair sync span
      // (assetClass resolve + computeContext + scanPatterns x2 + regime/family
      // mapping) ending before the per-strategy loop. Early-continue paths are
      // not recorded (trivial spans; documented undercount).
      const _ss46b = syncSpanStart();
      const _pairAssetClass = safeResolveAssetClass(pair.symbol, 'kraken');
      if (_pairAssetClass === null) {
        // WARN already logged by safeResolveAssetClass. Skip this pair cleanly.
        vtsEvalCounters.pairsSkippedNoPrice = vtsEvalCounters.pairsSkippedNoPrice ?? 0;
        // (Counter shared with no-price skip — both are "pair unprocessable" semantics.)
        continue;
      }

      // Phase 13: MCE computes regime + indicators in a single pass (cached per symbol)
      const mce = getMarketContextEngine();
      // B63: DBS propagated from FX5 scanner pre-filter via pair object. Hard contract.
      const pairPropagatedDbs = (pair as any).dbsScore !== undefined
        ? {
            score: (pair as any).dbsScore as number,
            category: ((pair as any).dbsCategory as string) || 'NEUTRAL',
            slope: (pair as any).dbsSlope as number | undefined,
          }
        : undefined;
      // B79.0n.MCE: required assetClass parameter (captured once above, reused here).
      const mceContext = mce.computeContext(pair.symbol, ohlcData, priceData.price, priceData.volume24h ?? 0, undefined, pairPropagatedDbs, _pairAssetClass);
      const pairRegime = mceContext.regime.regime as MarketRegimeType;
      const regimeStrategies = getStrategiesForRegime(_pairAssetClass as 'crypto_spot' | 'xstock_spot', pairRegime);
      
      if (regimeStrategies.length === 0) {
        console.warn(`[11.8C][VTS] No strategies mapped for regime ${pairRegime}, skipping ${pair.symbol}`);
        continue;
      }
      
      // Batch 19G HF1 Item 4: Route based on sourcePool — mirrors active trading path
      // - Quant pairs: ALL regime strategies (existing behavior)
      // - Pattern pairs: Pattern detection drives strategy selection, NOT regime
      //   1. scanPatterns() runs first
      //   2. If pattern detected → canonical pattern determines strategy
      //   3. If no pattern detected → pair is skipped for this cycle
      //   4. Regime is used for MCE context/indicators only, not strategy selection

      let effectiveStrategies: StrategyDefinition[] = [];
      let outerLoopDetectedPatterns: any[] | undefined; // Batch 44: Cache patterns from outer loop

      if (pair.sourcePool === 'pattern') {
        vtsEvalCounters.patternPairsEvaluated++;
        // Batch 51: Pattern-pool pair = exactly 1 pair-pool evaluation (the 'pattern' pool entry)
        // Do NOT use full vtsSymbolFamilies.size here — that includes quant families too
        vtsEvalCounters.patternPairPoolEvaluations = (vtsEvalCounters.patternPairPoolEvaluations ?? 0) + 1;
        // Convert OHLC to Candle[] for scanPatterns
        const candles = ohlcData.map(o => ({
          timestamp: o.timestamp,
          open: o.open,
          high: o.high,
          low: o.low,
          close: o.close,
          volume: o.volume,
        }));

        // B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` reused
        // from outer-loop capture (Langston Step 8 iteration).
        const detectedPatterns = scanPatterns(candles, pair.symbol, _pairAssetClass);
        outerLoopDetectedPatterns = detectedPatterns; // Batch 44: Cache for inner loop
        const buyPatterns = detectedPatterns.filter(p => p.direction === 'BUY');

        if (buyPatterns.length === 0) {
          // No BUY pattern detected — skip this pair for this cycle (mirrors active trading path)
          vtsEvalCounters.patternNoDetection++;
          continue;
        }
        vtsEvalCounters.patternDetected++;

        // Map each detected BUY pattern to a canonical strategy definition.
        // Search ALL regimes (not just current) because pattern detection drives strategy,
        // not regime — this mirrors the active trading path in signal-orchestrator.
        for (const patternSig of buyPatterns) {
          const canonicalPattern: CanonicalPatternType = normalizePatternToCanonical(patternSig.pattern);
          if (!canonicalPattern) continue;

          // Find a PATTERN or HYBRID strategy whose patternType matches the canonical pattern
          let matchedStratDef: StrategyDefinition | undefined;
          // B-4.7 (#163): search THIS pair's class tree — a pattern may only
          // match strategies the class is actually eligible for.
          for (const regimeMapping of Object.values(REGIME_STRATEGY_MAP[_pairAssetClass as 'crypto_spot' | 'xstock_spot'])) {
            matchedStratDef = regimeMapping.strategies.find(
              s => s.patternType === canonicalPattern && (s.signalType === 'PATTERN' || s.signalType === 'HYBRID')
            );
            if (matchedStratDef) break; // Prefer first match (PATTERN strategies appear before HYBRID in most regimes)
          }

          if (matchedStratDef && !effectiveStrategies.some(s => s.strategyKey === matchedStratDef!.strategyKey)) {
            effectiveStrategies.push(matchedStratDef);
          }
        }

        if (effectiveStrategies.length === 0) {
          vtsEvalCounters.nullReasons.regimeNoStrategies++;
          // Batch 57: Pool-keyed pre-eval skip (pattern branch)
          if (!vtsEvalCounters.patternNullReasonDetail) { vtsEvalCounters.patternNullReasonDetail = {}; }
          vtsEvalCounters.patternNullReasonDetail['regime_no_strategies'] = (vtsEvalCounters.patternNullReasonDetail['regime_no_strategies'] ?? 0) + 1;
          continue;
        }

        console.log(`[19G_HF1][VTS] ${pair.symbol} | Regime=${pairRegime} | sourcePool=pattern | Pattern-driven: ${effectiveStrategies.map(s => `${s.strategyKey}(${s.patternType})`).join(', ')}`);
      } else {
        vtsEvalCounters.quantPairsEvaluated++;
        // Batch 52 Fix 17: Count pair-pool as +1 per loop entry.
        // The VTS batch contains fan-out entries (one per family per symbol from FX5).
        // Each entry represents one pair+family combination entering evaluation.
        // Previous code counted ALL families per symbol per entry (N×N overcounting).
        vtsEvalCounters.quantPairPoolEvaluations = (vtsEvalCounters.quantPairPoolEvaluations ?? 0) + 1;
        // Batch 44: Quant pairs — include QUANT strategies always.
        // PATTERN/HYBRID strategies only when a matching pattern was detected.
        // This prevents the massive null rate from evaluating quant pairs against
        // pattern strategies that hard-gate on specific pattern types.
        const quantOnlyStrategies = regimeStrategies.filter(s => s.signalType === 'QUANT');
        const patternHybridStrategies = regimeStrategies.filter(s => s.signalType === 'PATTERN' || s.signalType === 'HYBRID');

        // Scan for patterns on this quant pair to see if any pattern strategies apply
        let quantPairPatternStrategies: typeof regimeStrategies = [];
        if (patternHybridStrategies.length > 0 && ohlcData.length > 0) {
          const candles = ohlcData.map(o => ({
            timestamp: o.timestamp, open: o.open, high: o.high,
            low: o.low, close: o.close, volume: o.volume,
          }));
          // B79.0n.PATTERN-DETECT (2026-05-24): REQUIRED-`assetClass` reused
          // from outer-loop capture (Langston Step 8 iteration).
          const detectedPatterns = scanPatterns(candles, pair.symbol, _pairAssetClass);
          const buyPatterns = detectedPatterns.filter(p => p.direction === 'BUY');
          if (buyPatterns.length > 0) {
            // Only include pattern/hybrid strategies whose canonical pattern was detected
            for (const patSig of buyPatterns) {
              const canonical = normalizePatternToCanonical(patSig.pattern);
              if (!canonical) continue;
              const matchingStrats = patternHybridStrategies.filter(s => s.patternType === canonical);
              for (const ms of matchingStrats) {
                if (!quantPairPatternStrategies.some(s => s.strategyKey === ms.strategyKey)) {
                  quantPairPatternStrategies.push(ms);
                }
              }
            }
          }
        }

        effectiveStrategies = [...quantOnlyStrategies, ...quantPairPatternStrategies];

        if (effectiveStrategies.length === 0) {
          vtsEvalCounters.nullReasons.regimeNoStrategies++;
          // Batch 57: Pool-keyed pre-eval skip (quant branch)
          if (!vtsEvalCounters.quantNullReasonDetail) { vtsEvalCounters.quantNullReasonDetail = {}; }
          vtsEvalCounters.quantNullReasonDetail['regime_no_strategies'] = (vtsEvalCounters.quantNullReasonDetail['regime_no_strategies'] ?? 0) + 1;
          continue;
        }

        const patternNote = quantPairPatternStrategies.length > 0
          ? ` + ${quantPairPatternStrategies.length} pattern(${quantPairPatternStrategies.map(s => s.strategyKey).join(',')})`
          : '';
        console.log(`[44][VTS] ${pair.symbol} | Regime=${pairRegime} | sourcePool=${pair.sourcePool ?? 'quant'} | ${quantOnlyStrategies.length} quant${patternNote}`);
      }

      vtsService.updateMarketPrice(pair.symbol, priceData.price);

      recordSyncSpan('vts_eval', _ss46b, pair.symbol);
      for (const stratDef of effectiveStrategies) {
        // B70.3 (2026-05-05): exclude universally-disabled strategies BEFORE
        // they reach detect(). Per Kyle directive 2026-05-05: liquidity_trap
        // is a bearish strategy disabled per Batch 45 (long-only VTS).
        // Pre-B70.3 it was being evaluated 7,342×/24h all returning
        // `strategy_disabled_bearish` — wasted CPU + log noise. Excluding at
        // iteration time eliminates the waste. The strategy DEFINITION is
        // retained (in case bullish redesign happens later); it's just not
        // iterated against today.
        if (UNIVERSALLY_DISABLED_STRATEGIES.has(stratDef.strategyKey)) {
          continue;
        }
        // Batch 22: Family-aware strategy check
        const stratFamily = STRATEGY_FAMILY_MAP[stratDef.strategyKey];
        const pairFams = vtsSymbolFamilies.get(pair.symbol);
        // B63 Item 11: MULTI_FAMILY_ELIGIBILITY extends eligibility beyond the primary family.
        // A strategy passes the family gate if its primary family is in pairFams OR any of its
        // additional multi-family entries is in pairFams. Used to route vwap_pullback into the
        // strong-trend lane alongside strong_bull_trend per BATCH_63_SCOPE Items 11/12.
        const additionalFams = MULTI_FAMILY_ELIGIBILITY[stratDef.strategyKey] ?? [];
        const primaryFamilyMismatch = stratFamily && stratFamily !== 'hybrid' && pairFams && !pairFams.has(stratFamily);
        const additionalFamilyMatch = additionalFams.some(f => pairFams?.has(f) ?? false);
        if (primaryFamilyMismatch && !additionalFamilyMatch) {
          // Batch 45: familyFilterMismatch is a pre-detect eligibility skip, NOT a strategy evaluation.
          // Do NOT count it in totalStrategyEvaluations, byStrategy, or null counters.
          // This keeps the detect()-level null rate honest.
          vtsEvalCounters.nullReasons.familyFilterMismatch++;
          // Batch 57: Pool-keyed pre-eval skip
          if (pair.sourcePool === 'pattern') {
            if (!vtsEvalCounters.patternNullReasonDetail) { vtsEvalCounters.patternNullReasonDetail = {}; }
            vtsEvalCounters.patternNullReasonDetail['family_filter_mismatch'] = (vtsEvalCounters.patternNullReasonDetail['family_filter_mismatch'] ?? 0) + 1;
          } else {
            if (!vtsEvalCounters.quantNullReasonDetail) { vtsEvalCounters.quantNullReasonDetail = {}; }
            vtsEvalCounters.quantNullReasonDetail['family_filter_mismatch'] = (vtsEvalCounters.quantNullReasonDetail['family_filter_mismatch'] ?? 0) + 1;
          }
          continue; // Skip strategy — pair didn't survive this family's filter path
        }
        if (stratFamily === 'hybrid') {
          const parentFams = HYBRID_FAMILY_ELIGIBILITY[stratDef.strategyKey] ?? [];
          if (pairFams && !parentFams.some(f => pairFams.has(f))) {
            // Batch 26: Count hybrid family filter skips
            vtsEvalCounters.totalStrategyEvaluations++;
            if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternStrategyEvaluations = (vtsEvalCounters.patternStrategyEvaluations ?? 0) + 1; } else { vtsEvalCounters.quantStrategyEvaluations = (vtsEvalCounters.quantStrategyEvaluations ?? 0) + 1; }
            if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternStrategyNulls = (vtsEvalCounters.patternStrategyNulls ?? 0) + 1; } else { vtsEvalCounters.quantStrategyNulls++; }
            const hybStratKey = stratDef.strategyKey;
            if (!vtsEvalCounters.byStrategy[hybStratKey]) { vtsEvalCounters.byStrategy[hybStratKey] = { evaluated: 0, nulls: 0, signals: 0 }; }
            vtsEvalCounters.byStrategy[hybStratKey].evaluated++;
            vtsEvalCounters.byStrategy[hybStratKey].nulls++;
            vtsEvalCounters.nullReasons.familyFilterMismatch++;
            // Batch 57: Pool-keyed pre-eval skip (hybrid family)
            if (pair.sourcePool === 'pattern') {
              if (!vtsEvalCounters.patternNullReasonDetail) { vtsEvalCounters.patternNullReasonDetail = {}; }
              vtsEvalCounters.patternNullReasonDetail['family_filter_mismatch'] = (vtsEvalCounters.patternNullReasonDetail['family_filter_mismatch'] ?? 0) + 1;
            } else {
              if (!vtsEvalCounters.quantNullReasonDetail) { vtsEvalCounters.quantNullReasonDetail = {}; }
              vtsEvalCounters.quantNullReasonDetail['family_filter_mismatch'] = (vtsEvalCounters.quantNullReasonDetail['family_filter_mismatch'] ?? 0) + 1;
            }
            continue;
          }
        }
        // Batch 22 HF3: Duplicate pre-check at outer loop level (blockedDupCombos in scope)
        const dupCheckCount = Array.from(openVirtualTrades.values()).filter(t =>
          t.symbol === pair.symbol && t.strategy === stratDef.strategyKey
        ).length;
        if (dupCheckCount >= getVtsMaxConcurrentPerCombo()) {
          vtsEvalCounters.totalStrategyEvaluations++;
          if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternStrategyEvaluations = (vtsEvalCounters.patternStrategyEvaluations ?? 0) + 1; } else { vtsEvalCounters.quantStrategyEvaluations = (vtsEvalCounters.quantStrategyEvaluations ?? 0) + 1; }
          if (pair.sourcePool === 'pattern') {
            vtsEvalCounters.patternStrategyNulls = (vtsEvalCounters.patternStrategyNulls ?? 0) + 1;
          } else {
            vtsEvalCounters.quantStrategyNulls++;
          }
          // Batch 27: Add byStrategy increment for duplicate guard (was missing — caused byStrategy TOTAL != totalStrategyEvaluations)
          const dupStratKey = stratDef.strategyKey;
          if (!vtsEvalCounters.byStrategy[dupStratKey]) { vtsEvalCounters.byStrategy[dupStratKey] = { evaluated: 0, nulls: 0, signals: 0 }; }
          vtsEvalCounters.byStrategy[dupStratKey].evaluated++;
          vtsEvalCounters.byStrategy[dupStratKey].nulls++;
          vtsEvalCounters.nullReasons.duplicatePosition++;
          // Batch 57: Pool-keyed pre-eval skip
          if (pair.sourcePool === 'pattern') {
            if (!vtsEvalCounters.patternNullReasonDetail) { vtsEvalCounters.patternNullReasonDetail = {}; }
            vtsEvalCounters.patternNullReasonDetail['duplicate_position'] = (vtsEvalCounters.patternNullReasonDetail['duplicate_position'] ?? 0) + 1;
          } else {
            if (!vtsEvalCounters.quantNullReasonDetail) { vtsEvalCounters.quantNullReasonDetail = {}; }
            vtsEvalCounters.quantNullReasonDetail['duplicate_position'] = (vtsEvalCounters.quantNullReasonDetail['duplicate_position'] ?? 0) + 1;
          }
          blockedDupCombos.add(`${pair.symbol}:${stratDef.strategyKey}`);
          continue;
        }

        // Batch 23: ADX guard for sma_trend_ride
        if (stratDef.strategyKey === 'sma_trend_ride' && mceContext.raw?.adx !== undefined && mceContext.raw.adx < 25) {
          // Batch 26: Increment all counters (was only incrementing nullReasons.adxGuard)
          vtsEvalCounters.totalStrategyEvaluations++;
          if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternStrategyEvaluations = (vtsEvalCounters.patternStrategyEvaluations ?? 0) + 1; } else { vtsEvalCounters.quantStrategyEvaluations = (vtsEvalCounters.quantStrategyEvaluations ?? 0) + 1; }
          if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternStrategyNulls = (vtsEvalCounters.patternStrategyNulls ?? 0) + 1; } else { vtsEvalCounters.quantStrategyNulls++; }
          if (!vtsEvalCounters.byStrategy['sma_trend_ride']) { vtsEvalCounters.byStrategy['sma_trend_ride'] = { evaluated: 0, nulls: 0, signals: 0 }; }
          vtsEvalCounters.byStrategy['sma_trend_ride'].evaluated++;
          vtsEvalCounters.byStrategy['sma_trend_ride'].nulls++;
          vtsEvalCounters.nullReasons.adxGuard++;
          continue; // Skip — ADX too low for trend-following strategy
        }

        // Batch 31: Reset null reason tracker before each strategy call
        resetNullReason();
        const result = await generatePhase10Signal(pair.symbol, priceData, ohlcData, pair.pool, stratDef, pair.filterTier, pair.sourcePool, vtsEvalCounters, outerLoopDetectedPatterns, pairPropagatedDbs);
        // Batch 19I: Track strategy outcomes
        const stratKey = stratDef.strategyKey;
        if (!vtsEvalCounters.byStrategy[stratKey]) {
          vtsEvalCounters.byStrategy[stratKey] = { evaluated: 0, nulls: 0, signals: 0, preRejectionSignals: 0, rejected: 0 };
        }
        vtsEvalCounters.byStrategy[stratKey].evaluated++;
        vtsEvalCounters.totalStrategyEvaluations++;
        if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternStrategyEvaluations = (vtsEvalCounters.patternStrategyEvaluations ?? 0) + 1; } else { vtsEvalCounters.quantStrategyEvaluations = (vtsEvalCounters.quantStrategyEvaluations ?? 0) + 1; }
        if (!result) {
          // Batch 50: Distinguish true strategy nulls from post-signal rejections
          const detailReason = getNullReason();
          const isPostSignalRejection = detailReason === 'net_ev_rejected' || detailReason === 'duplicate_position' || detailReason === 'max_open_trades';

          // B70.1 Step 3.6b: signal-eval reject archive. Map VTS reject reasons
          // to the canonical reject_stage enum.
          //   net_ev_rejected     → 'sqe' (EV gate is the SQE-equivalent in VTS)
          //   duplicate_position  → 'tcl' (TCL semantics — already-have-position dedup)
          //   max_open_trades     → 'tcl' (TCL semantics — capacity gate)
          //   conditions_not_met  → 'strategy_internal'
          //   anything else null  → 'strategy_internal'
          try {
            const { archiveSignalEval, buildBarProvenance } = await import('./data-archive/signal-eval-archiver.js');
            const { safeResolveAssetClass } = await import('../../shared/asset-classes.js'); // P19-B3a #139: safe variant (alarms + crypto_spot fallback at use site)
            const stageMap: Record<string, 'sqe' | 'tcl' | 'strategy_internal'> = {
              net_ev_rejected: 'sqe',
              duplicate_position: 'tcl',
              max_open_trades: 'tcl',
            };
            const mappedStage =
              stageMap[detailReason] ?? (isPostSignalRejection ? 'sqe' : 'strategy_internal');
            archiveSignalEval({
      mode: 'vts', // ITEM-4 step 2 (D1): carried entry-stamp
              symbol: pair.symbol,
              exchange: 'kraken',
              assetClass: vtsResolveClassOrLoggedDefault(pair.symbol), // P19-B6.5d (was safeResolve ?? crypto_spot silent default)
              source: 'vts-runner',
              strategy: stratDef.strategyKey,
              regimeLabel: pairRegime ?? undefined,
              rejectStage: mappedStage,
              gateDecision: {
                gate: mappedStage,
                accepted: false,
                reason: detailReason,
                isPostSignalRejection,
              },
              features: {
                sourcePool: pair.sourcePool,
                detailReason,
              },
              // B-NEW-53: forming bar only — detect returned null, no stop/target yet.
              provenance: buildBarProvenance(ohlcData),
            });
          } catch (b70Err) {
            // Silent on hot path
          }

          if (isPostSignalRejection) {
            // Batch 52 Fix 19: Signal WAS produced but rejected after — count as rejection, not null
            // Batch 52 Fix 19C: Caller is single source of truth for all post-signal rejection counters
            vtsEvalCounters.byStrategy[stratKey].preRejectionSignals = (vtsEvalCounters.byStrategy[stratKey].preRejectionSignals ?? 0) + 1;
            vtsEvalCounters.byStrategy[stratKey].rejected = (vtsEvalCounters.byStrategy[stratKey].rejected ?? 0) + 1;
            vtsEvalCounters.signalsRejected = (vtsEvalCounters.signalsRejected ?? 0) + 1;
            if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternSignalsRejected = (vtsEvalCounters.patternSignalsRejected ?? 0) + 1; } else { vtsEvalCounters.quantSignalsRejected = (vtsEvalCounters.quantSignalsRejected ?? 0) + 1; }
            // Update reason-specific counters (previously done inside generatePhase10Signal, moved here)
            if (detailReason === 'net_ev_rejected') {
              if (!vtsEvalCounters.rejectedReasons) { vtsEvalCounters.rejectedReasons = { netEvBelowFloor: 0 }; }
              vtsEvalCounters.rejectedReasons.netEvBelowFloor++;
            }
            if (!vtsEvalCounters.nullReasonDetail) { vtsEvalCounters.nullReasonDetail = {}; }
            vtsEvalCounters.nullReasonDetail[detailReason] = (vtsEvalCounters.nullReasonDetail[detailReason] ?? 0) + 1;
            // Batch 57: Pool-keyed null reason detail
            if (pair.sourcePool === 'pattern') {
              if (!vtsEvalCounters.patternNullReasonDetail) { vtsEvalCounters.patternNullReasonDetail = {}; }
              vtsEvalCounters.patternNullReasonDetail[detailReason] = (vtsEvalCounters.patternNullReasonDetail[detailReason] ?? 0) + 1;
            } else {
              if (!vtsEvalCounters.quantNullReasonDetail) { vtsEvalCounters.quantNullReasonDetail = {}; }
              vtsEvalCounters.quantNullReasonDetail[detailReason] = (vtsEvalCounters.quantNullReasonDetail[detailReason] ?? 0) + 1;
            }
            // B63: Per-strategy null reason detail (Kyle's request — DBS diagnostic tab)
            if (!(vtsEvalCounters as any).byStrategyNullReasons) { (vtsEvalCounters as any).byStrategyNullReasons = {}; }
            const byStratReasonsR = (vtsEvalCounters as any).byStrategyNullReasons;
            if (!byStratReasonsR[stratKey]) { byStratReasonsR[stratKey] = {}; }
            byStratReasonsR[stratKey][detailReason] = (byStratReasonsR[stratKey][detailReason] ?? 0) + 1;
          } else {
            // True strategy null — no setup found
            vtsEvalCounters.byStrategy[stratKey].nulls++;
            if (pair.sourcePool === 'pattern') {
              vtsEvalCounters.patternStrategyNulls = (vtsEvalCounters.patternStrategyNulls ?? 0) + 1;
            } else {
              vtsEvalCounters.quantStrategyNulls++;
            }
            vtsEvalCounters.nullReasons.conditionsNotMet++;
            if (!vtsEvalCounters.nullReasonDetail) { vtsEvalCounters.nullReasonDetail = {}; }
            vtsEvalCounters.nullReasonDetail[detailReason] = (vtsEvalCounters.nullReasonDetail[detailReason] ?? 0) + 1;
            // Batch 57: Pool-keyed null reason detail
            if (pair.sourcePool === 'pattern') {
              if (!vtsEvalCounters.patternNullReasonDetail) { vtsEvalCounters.patternNullReasonDetail = {}; }
              vtsEvalCounters.patternNullReasonDetail[detailReason] = (vtsEvalCounters.patternNullReasonDetail[detailReason] ?? 0) + 1;
            } else {
              if (!vtsEvalCounters.quantNullReasonDetail) { vtsEvalCounters.quantNullReasonDetail = {}; }
              vtsEvalCounters.quantNullReasonDetail[detailReason] = (vtsEvalCounters.quantNullReasonDetail[detailReason] ?? 0) + 1;
            }
            // B63: Per-strategy null reason detail (Kyle's request — needed for
            // strong_bull_trend-specific null breakdown in the DBS diagnostic tab).
            if (!(vtsEvalCounters as any).byStrategyNullReasons) { (vtsEvalCounters as any).byStrategyNullReasons = {}; }
            const byStratReasons = (vtsEvalCounters as any).byStrategyNullReasons;
            if (!byStratReasons[stratKey]) { byStratReasons[stratKey] = {}; }
            byStratReasons[stratKey][detailReason] = (byStratReasons[stratKey][detailReason] ?? 0) + 1;
          }
          continue;
        }
        const { signal, tradeRecord } = result;

        // Batch 26: Net EV floor check (caller-side, for signals that passed inside generatePhase10Signal)
        // Note: Most Net EV rejections are caught INSIDE generatePhase10Signal and return null.
        // This catch handles edge cases where signal has netEV but wasn't checked inside.
        if (signal && signal.netEV !== undefined && signal.netEV < VTS_NET_EV_FLOOR) {
          // B70.1 Step 3.6b: caller-side Net-EV reject → reject_stage='sqe'
          try {
            const { archiveSignalEval, buildBarProvenance } = await import('./data-archive/signal-eval-archiver.js');
            const { safeResolveAssetClass } = await import('../../shared/asset-classes.js'); // P19-B3a #139: safe variant (alarms + crypto_spot fallback at use site)
            archiveSignalEval({
      mode: 'vts', // ITEM-4 step 2 (D1): carried entry-stamp
              symbol: pair.symbol,
              exchange: 'kraken',
              assetClass: vtsResolveClassOrLoggedDefault(pair.symbol), // P19-B6.5d (was safeResolve ?? crypto_spot silent default)
              source: 'vts-runner',
              strategy: stratDef.strategyKey,
              regimeLabel: pairRegime ?? undefined,
              rejectStage: 'sqe',
              finalScore: signal.finalScore,
              gateDecision: {
                gate: 'net_ev_floor',
                accepted: false,
                reason: 'net_ev_below_floor',
                netEv: signal.netEV,
                netEvFloor: VTS_NET_EV_FLOOR,
              },
              features: { sourcePool: pair.sourcePool },
              // B-NEW-53: forming bar only — this is the rare caller-side net-EV
              // edge case (signal built but not checked inside generatePhase10Signal);
              // the detect-output stop/target locals aren't in scope here, and the
              // signal's mode-ADJUSTED levels would mismatch a detect-replay, so we
              // capture the forming bar (the irreducible part) and skip the checksum.
              provenance: buildBarProvenance(ohlcData),
            });
          } catch (b70Err) {
            // Silent on hot path
          }
          if (!vtsEvalCounters.rejectedReasons) { vtsEvalCounters.rejectedReasons = { netEvBelowFloor: 0 }; }
          vtsEvalCounters.rejectedReasons.netEvBelowFloor++;
          vtsEvalCounters.signalsRejected = (vtsEvalCounters.signalsRejected ?? 0) + 1;
          vtsEvalCounters.byStrategy[stratKey].preRejectionSignals = (vtsEvalCounters.byStrategy[stratKey].preRejectionSignals ?? 0) + 1;
          vtsEvalCounters.byStrategy[stratKey].rejected = (vtsEvalCounters.byStrategy[stratKey].rejected ?? 0) + 1;
          if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternSignalsRejected = (vtsEvalCounters.patternSignalsRejected ?? 0) + 1; } else { vtsEvalCounters.quantSignalsRejected = (vtsEvalCounters.quantSignalsRejected ?? 0) + 1; }
          logSkippedSignal({
            symbol: pair.symbol,
            reason: 'Net_EV_Negative',
            regime: pairRegime ?? 'UNKNOWN',
            signalType: signal.signalType ?? 'QUANT',
            strategy: stratDef.strategyKey,
            source: 'VTS'
          });
          continue; // Skip — Net EV below floor
        }

        // Signal passed all post-generation guards — count as generated
        vtsEvalCounters.byStrategy[stratKey].preRejectionSignals = (vtsEvalCounters.byStrategy[stratKey].preRejectionSignals ?? 0) + 1;
        vtsEvalCounters.byStrategy[stratKey].signals++;
        vtsEvalCounters.signalsGenerated++;
        if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternSignalsGenerated = (vtsEvalCounters.patternSignalsGenerated ?? 0) + 1; } else { vtsEvalCounters.quantSignalsGenerated = (vtsEvalCounters.quantSignalsGenerated ?? 0) + 1; }

        // B-4.7: per-class threading landed (supersedes the WIRE-IN #16
        // deferral); M70 invariant unchanged — VTS-only writer.
        const telemetry = getTelemetryAggregator();
        telemetry.recordPairTelemetry(pair.symbol, {
          assetClass: tradeRecord.assetClass, // B-4.7: stamped at write
          finalScore: tradeRecord.finalScore,
          hybridScore: tradeRecord.hybridScore,
          regimeWeight: tradeRecord.regimeWeight,
          regimeScore: tradeRecord.regimeScore,
          predictiveConfidence: tradeRecord.predictiveConfidence,
          success: (tradeRecord.profit ?? 0) > 0,
          pool: pair.pool,
          source: 'simulation',
          pairRegime: tradeRecord.regime,
          signalType: tradeRecord.signalType,
          strategy: tradeRecord.strategy,
          pattern: tradeRecord.signalType !== 'QUANT' ? (tradeRecord.patternType ?? undefined) : undefined,
          caller: 'vts',
          volZ: tradeRecord.volZ,
          trendZ: tradeRecord.trendZ,
        });

        phase10SessionTrades.push(tradeRecord);

        // Batch 19G: Hybrid confluence buffer integration
        // (a) If PATTERN signal: add to buffer for potential hybrid match with future quant signals
        if (tradeRecord.signalType === 'PATTERN' && tradeRecord.patternType) {
          hybridConfluenceBuffer.addPatternSignal({
            sourceMode: 'vts', // ITEM-4 step 2 (D1b): own namespace
            symbol: pair.symbol,
            patternType: tradeRecord.patternType,
            strategy: tradeRecord.strategy,
            strength: tradeRecord.hybridScore ?? 0.5,
            direction: 'BUY',
            timestamp: Date.now(),
          });
        }

        // (b) If QUANT signal: check buffer for compatible pattern signals → create hybrid
        if (tradeRecord.signalType === 'QUANT') {
          const compatiblePatterns = hybridConfluenceBuffer.findCompatiblePatterns(pair.symbol, 'vts');
          for (const patternSig of compatiblePatterns) {
            // Check if this quant strategy + pattern type maps to a known hybrid strategy
            const hybridStrategy = findVTSHybridMatch(tradeRecord.strategy, patternSig.patternType);
            if (hybridStrategy) {
              // Dedupe guard: don't create hybrid if same symbol+hybrid already in this cycle
              const hybridKey = `${pair.symbol}_${hybridStrategy}`;
              if (!hybridDedupeSet.has(hybridKey)) {
                hybridDedupeSet.add(hybridKey);
                const decayFactor = hybridConfluenceBuffer.getDecayFactor(patternSig);
                const hybridConfidence = (tradeRecord.finalScore * 0.4 + patternSig.strength * 0.4 + 0.2) * decayFactor;

                // Create hybrid trade record (independent of the quant trade)
                const hybridTradeRecord = {
                  ...tradeRecord,
                  strategy: hybridStrategy,
                  signalType: 'HYBRID' as const,
                  sourcePool: 'hybrid' as const,
                  finalScore: hybridConfidence,
                  // P19-B3b: buffered pattern signals carry patternType as a raw string;
                  // Phase10TradeRecord.patternType is PatternType | null. Normalize through
                  // the canonical converter (same convention as canonicalPatternType at
                  // ~line 1041/1056) instead of assigning the bare string.
                  patternType: normalizePatternToCanonical(patternSig.patternType) as PatternType | null,
                  hybridSource: {
                    quantStrategy: tradeRecord.strategy,
                    patternType: patternSig.patternType,
                    patternStrategy: patternSig.strategy,
                    decayFactor,
                    confluenceAge: Date.now() - patternSig.timestamp,
                  },
                };

                phase10SessionTrades.push(hybridTradeRecord);
                signalTypeDistribution['HYBRID'] = (signalTypeDistribution['HYBRID'] || 0) + 1;
                strategiesExecuted.add(hybridStrategy);
                totalFinalScore += hybridConfidence;
                simulatedCount++;
                console.log(`[19G][VTS_HYBRID] Confluence: ${pair.symbol} quant=${tradeRecord.strategy} + pattern=${patternSig.patternType} → hybrid=${hybridStrategy} (decay=${decayFactor.toFixed(2)}, conf=${hybridConfidence.toFixed(3)})`);
              }
            }
          }
        }

        regimeDistribution[tradeRecord.regime]++;
        signalTypeDistribution[tradeRecord.signalType] = (signalTypeDistribution[tradeRecord.signalType] || 0) + 1;
        strategiesExecuted.add(tradeRecord.strategy);
        totalFinalScore += tradeRecord.finalScore;
        simulatedCount++;
      }
      
    } catch (error) {
      console.warn(`[11.0E.1][VTS] Strategy execution failed for ${pair.symbol}:`, error);
    }
  }

  // Batch 19F Phase 2: Removed legacy Batch 19C pattern pool section.
  // Pattern pairs are now routed through PATTERN+HYBRID strategies in the main loop above,
  // sourced directly from FX5 scan batch (which works during passive learning).
  // The old code called activeFilterPool.getPatternPool('paper') which returns EMPTY
  // during passive learning because activeFilterPool only populates when trading is ACTIVE.

  // Batch 19G: Sweep expired entries from hybrid confluence buffer
  const evictedCount = hybridConfluenceBuffer.sweep();
  if (evictedCount > 0) {
    console.log(`[19G][VTS_HYBRID] Buffer sweep: evicted ${evictedCount} expired entries, ${hybridConfluenceBuffer.size} remaining`);
  }

  const avgFinalScore = simulatedCount > 0 ? totalFinalScore / simulatedCount : 0;
  const cycleDurationMs = Date.now() - cycleStart;
  
  console.log(`[VTS][Cycle ${cycleCount}] Ideal Pool: ${pairs.length} | Regime Dist: TREND=${regimeDistribution.TREND_FRIENDLY_STABLE}, RANGE=${regimeDistribution.RANGE_BOUND_STABLE}, HIVOL=${regimeDistribution.HIGH_VOLATILITY_UNSTABLE}`);
  console.log(`[VTS][Cycle ${cycleCount}] Executing ${simulatedCount} signals across ${Object.keys(signalTypeDistribution).length} signal types`);
  console.log(`[VTS][Cycle ${cycleCount}] Completed: ${simulatedCount} trades simulated | Avg finalScore=${avgFinalScore.toFixed(2)}`);
  
  // Batch 22 HF3: Record unique duplicate combos count
  vtsEvalCounters.nullReasons.uniqueDuplicateCombos = blockedDupCombos.size;
  if (blockedDupCombos.size > 0) {
    const avgAttempts = vtsEvalCounters.nullReasons.duplicatePosition / blockedDupCombos.size;
    console.log(`[22HF3][DUP_STATS] ${vtsEvalCounters.nullReasons.duplicatePosition} dup events from ${blockedDupCombos.size} unique combos (avg ${avgAttempts.toFixed(1)} attempts/combo): ${Array.from(blockedDupCombos).slice(0, 5).join(', ')}${blockedDupCombos.size > 5 ? '...' : ''}`);
  }

  // Batch 19I: Store VTS evaluation diagnostics
  const evalSnapshot = { ...vtsEvalCounters, timestamp: Date.now() };
  vtsEvalHistory.push(evalSnapshot);
  // Memory audit: prune on write (not just on read via getVTSEvalRolling24h)
  const evalCutoff = Date.now() - VTS_EVAL_ROLLING_WINDOW_MS;
  vtsEvalHistory = vtsEvalHistory.filter(s => s.timestamp > evalCutoff);
  persistVtsEvalSnapshot(evalSnapshot); // Batch 22 HF7
  console.log(`[19I][VTS_EVAL] quant=${vtsEvalCounters.quantPairsEvaluated} pattern=${vtsEvalCounters.patternPairsEvaluated} noDetect=${vtsEvalCounters.patternNoDetection} detected=${vtsEvalCounters.patternDetected} stratNulls=${vtsEvalCounters.quantStrategyNulls} signals=${vtsEvalCounters.signalsGenerated}`);
  // Batch 51: Log pair-pool evaluations for reconciliation tracing
  // Batch 52: Full reconciliation trace
  const totalSkips = (vtsEvalCounters.pairsSkippedNoPrice ?? 0) + (vtsEvalCounters.pairsSkippedInsufficientOHLC ?? 0) + (vtsEvalCounters.nullReasons.maxOpenTrades ?? 0);
  const totalEvaluated = vtsEvalCounters.quantPairsEvaluated + vtsEvalCounters.patternPairsEvaluated;
  console.log(`[52][RECONCILE] Loop entries: ${pairs.length} | Evaluated: ${totalEvaluated} (quant=${vtsEvalCounters.quantPairsEvaluated} pattern=${vtsEvalCounters.patternPairsEvaluated}) | Skipped: ${totalSkips} (noPrice=${vtsEvalCounters.pairsSkippedNoPrice ?? 0} ohlc=${vtsEvalCounters.pairsSkippedInsufficientOHLC ?? 0} maxTrades=${vtsEvalCounters.nullReasons.maxOpenTrades ?? 0}) | Unaccounted: ${pairs.length - totalEvaluated - totalSkips}`);
  console.log(`[51][PAIR_POOL] quantPairPool=${vtsEvalCounters.quantPairPoolEvaluations ?? 0} patternPairPool=${vtsEvalCounters.patternPairPoolEvaluations ?? 0} total=${(vtsEvalCounters.quantPairPoolEvaluations ?? 0) + (vtsEvalCounters.patternPairPoolEvaluations ?? 0)} | skippedNoPrice=${vtsEvalCounters.pairsSkippedNoPrice ?? 0} skippedOHLC=${vtsEvalCounters.pairsSkippedInsufficientOHLC ?? 0} familyMismatch=${vtsEvalCounters.nullReasons.familyFilterMismatch ?? 0}`);
  console.log(`[21][VTS_EVAL] totalStratEvals=${vtsEvalCounters.totalStrategyEvaluations} nullReasons: conditions=${vtsEvalCounters.nullReasons.conditionsNotMet} netEV=${vtsEvalCounters.rejectedReasons?.netEvBelowFloor ?? 0} adx=${vtsEvalCounters.nullReasons.adxGuard} dup=${vtsEvalCounters.nullReasons.duplicatePosition} maxTrades=${vtsEvalCounters.nullReasons.maxOpenTrades} noRegimeStrats=${vtsEvalCounters.nullReasons.regimeNoStrategies}`);

  // Batch 21: DI distribution logging — capture actual DI values for threshold calibration
  for (const pair of pairs) {
    if ((pair as any).DI !== undefined) {
      console.log(`[21][DI_DIST] ${pair.symbol} DI=${((pair as any).DI as number).toFixed(2)} pool=${pair.sourcePool ?? 'quant'}`);
    }
  }

  return {
    cycleId: cycleCount,
    pairsEvaluated: pairs.length,
    signalsGenerated: simulatedCount,  // Batch 21: renamed from tradesSimulated
    avgFinalScore,
    regimeDistribution,
    signalTypeDistribution,
    strategiesExecuted: Array.from(strategiesExecuted),
    cycleDurationMs,
    timestamp: Date.now()
  };
}

export async function startAutonomousSimulation(): Promise<{ success: boolean; message: string }> {
  if (isAutonomousRunning) {
    return { success: true, message: 'Autonomous simulation already running' };
  }
  
  // ITEM-4 O1 (2026-06-09): the tradingActive start-refusal guard is REMOVED.
  // VTS starts regardless of paper/live state (standalone always-on producer).

  await loadVTSConfig();
  
  if (!isInitialized) {
    await initVTSRunner();
  }
  
  sessionStartTime = Date.now();
  phase10SessionStartTime = Date.now();
  vtsCycleOverlapSkips = 0; // ITEM-4 step 2: clean per-session O6 numbers
  vtsService.resetSessionMetrics();

  console.log(`[11.0E.1][VTS] Starting Phase-10 autonomous simulation (interval: ${vtsConfig.simulationIntervalSec}s, pairs: ${vtsConfig.pairsPerCycle})`);

  // Batch 52 Fix 16B: Run first cycle BEFORE setting isAutonomousRunning flag.
  // Previously the flag was set before the cycle, so if the first cycle crashed,
  // the flag stayed true and all subsequent startAutonomousSimulation() calls
  // returned "already running" — making the Fix 15 fallback a no-op.
  try {
    await runPhase10SimulationCycle();
  } catch (firstCycleError) {
    console.error('[11.0E.1][VTS] First simulation cycle failed:', firstCycleError);
    return { success: false, message: `First cycle failed: ${firstCycleError}` };
  }

  isAutonomousRunning = true;

  autonomousLoopInterval = setInterval(async () => {
    // ITEM-4 O1 (2026-06-09): the tradingActive self-teardown is REMOVED — VTS
    // never stops because paper/live turned on. LIFECYCLE GUARD instead:
    // (a) re-entrancy — a tick that fires after stopAutonomousSimulation()
    //     mid-flight is a no-op (interval cleared, belt-and-suspenders);
    // (b) overlap — if the previous cycle is still running (long cycle vs the
    //     interval, or event-loop pressure under concurrent producers), skip
    //     this tick rather than stacking cycles. Skips are logged — a growing
    //     skip count is exactly the O6 throughput-study starvation signal.
    if (!isAutonomousRunning) return;
    if (vtsCycleInFlight) {
      vtsCycleOverlapSkips++;
      console.warn(`[ITEM4][VTS] Cycle overlap — previous cycle still running; tick skipped (total skips: ${vtsCycleOverlapSkips})`);
      return;
    }
    vtsCycleInFlight = true;
    try {
      await runPhase10SimulationCycle();
    } catch (err) {
      // ITEM-4 O1 containment (Langston Step-4 required revision): an uncaught
      // cycle throw must NOT escape the async interval callback — post-O1 the
      // VTS shares the process with live trading paths, and an unhandled
      // rejection would crash the process with open positions (Node >=15
      // default). Contained + logged; the next tick proceeds normally.
      console.error('[ITEM4][VTS] Cycle error (contained):', err);
    } finally {
      vtsCycleInFlight = false;
    }
  }, vtsConfig.simulationIntervalSec * 1000);

  return { success: true, message: `Phase-10 autonomous simulation started (${vtsConfig.pairsPerCycle} pairs every ${vtsConfig.simulationIntervalSec}s)` };
}

export function stopAutonomousSimulation(): void {
  if (autonomousLoopInterval) {
    clearInterval(autonomousLoopInterval);
    autonomousLoopInterval = null;
  }
  isAutonomousRunning = false;
  console.log('[11.0E.1][VTS] Autonomous simulation stopped');
}

export function isAutonomousSimulationRunning(): boolean {
  return isAutonomousRunning;
}

export function getAutonomousSessionInfo(): {
  isRunning: boolean;
  sessionStartTime: number | null;
  sessionDurationMs: number;
  config: VTSConfig;
  cycleCount: number;
  tradesThisSession: number;
  cycleOverlapSkips: number;
} {
  return {
    isRunning: isAutonomousRunning,
    // ITEM-4 step 2 (chunk 7): O6 starvation signal exposed for the throughput study
    cycleOverlapSkips: vtsCycleOverlapSkips,
    sessionStartTime,
    sessionDurationMs: sessionStartTime ? Date.now() - sessionStartTime : 0,
    config: vtsConfig,
    cycleCount,
    tradesThisSession: phase10SessionTrades.length
  };
}

export async function initVTSRunner(): Promise<void> {
  if (isInitialized) return;
  
  try {
    calibration = await loadCalibration();
    await loadVTSConfig();
    vtsService.start();
    isInitialized = true;
    patternRecognitionWarmedUp = true;
    console.log('[11.0E.1][VTS_RUNNER] INIT_OK - Phase-10 autonomous mode ready');
  } catch (error) {
    console.error('[11.0E.1][VTS_RUNNER] Init failed:', error);
  }
}

export async function captureSignalForVTS(
  symbol: string,
  entryPrice: number,
  takeProfit: number,
  stopLoss: number,
  predictedProfit: number,
  strategy: string,
  spread: number = 0.001
): Promise<void> {
  console.warn('[11.0E.1][VTS] DEPRECATED: captureSignalForVTS called - use autonomous simulation instead');
}

export function updateVTSPrice(symbol: string, price: number): void {
  if (isInitialized) {
    vtsService.updateMarketPrice(symbol, price);
  }
}

export async function getCalibratedProfit(predictedProfit: number): Promise<number> {
  if (!calibration) {
    calibration = await loadCalibration();
  }
  return applyCalibration(predictedProfit, calibration);
}

export async function refreshCalibration(): Promise<CalibrationCoefficients> {
  calibration = await loadCalibration();
  return calibration;
}

export function getVTSStats() {
  return vtsService.getStats();
}

export function stopVTSRunner(): void {
  stopAutonomousSimulation();
  vtsService.stop();
  isInitialized = false;
  console.log('[11.0E.1][VTS_RUNNER] Stopped');
}

export async function generateValidationReport(): Promise<{
  timestamp: string;
  mode: string;
  tradingActive: boolean;
  simulatedTradesThisSession: number;
  calibrationFileExists: boolean;
  sessionDurationMs: number;
  config: VTSConfig;
  stats: any;
  strategyStats: any;
  phase10Trades: number;
}> {
  const stats = vtsService.getStats();
  const strategyStats = vtsService.getStrategyStats();
  const sessionMetrics = vtsService.getSessionMetrics();
  const config = await getSystemConfig();
  
  let calibrationExists = false;
  try {
    await fs.access(path.join(process.cwd(), 'data', 'vts_calibration.json'));
    calibrationExists = true;
  } catch {}
  
  const report = {
    timestamp: new Date().toISOString(),
    mode: 'phase10_simulator',
    tradingActive: config.tradingActive ?? false,
    simulatedTradesThisSession: sessionMetrics.simulatedTradesThisSession,
    calibrationFileExists: calibrationExists,
    sessionDurationMs: sessionStartTime ? Date.now() - sessionStartTime : 0,
    config: vtsConfig,
    stats,
    strategyStats,
    phase10Trades: phase10SessionTrades.length
  };
  
  const reportsDir = path.join(process.cwd(), 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  
  const reportPath = path.join(reportsDir, `VTS_Phase10_Validation_${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`[11.0E.1][VTS] Validation report saved: ${reportPath}`);
  
  return report;
}

export async function startM5CValidationSession(durationMinutes: number = 60): Promise<{ success: boolean; message: string; sessionId: string }> {
  const sessionId = `vts_p10_${Date.now()}`;
  
  resetPhase10Session();
  phase10SessionStartTime = Date.now();
  
  try {
    await computeStrategyWeights();
    await computeExposureBias();
  } catch (err) {
    console.warn('[11.0E.1][VTS] Failed to compute weights/bias, using defaults:', err);
  }
  
  console.log(`[11.0E.1][VTS] Starting Phase-10 validation session ${sessionId} for ${durationMinutes} minutes`);
  
  const result = await startAutonomousSimulation();
  if (!result.success) {
    return { success: false, message: result.message, sessionId };
  }
  
  setTimeout(async () => {
    console.log(`[11.0E.1][VTS] Session ${sessionId} duration reached - saving ${phase10SessionTrades.length} trades`);
    await savePhase10SessionTrades(sessionId);
    stopAutonomousSimulation();
    
    const paperTrades = getPaperSessionTrades();
    if (paperTrades.length > 0) {
      console.log(`[11.0E.1][AUTO] Saving ${paperTrades.length} paper trades`);
      await savePaperSessionTrades(sessionId);
    }
    
    console.log(`[11.0E.1][AUTO] Running comparison audit`);
    try {
      const comparisonReport = await compareLatestSessions();
      if (comparisonReport) {
        const reportsDir = path.join(process.cwd(), 'reports');
        await fs.mkdir(reportsDir, { recursive: true });
        const combinedReportPath = path.join(reportsDir, `VTS_Phase10_Comparison_${Date.now()}.json`);
        await fs.writeFile(combinedReportPath, JSON.stringify(comparisonReport, null, 2));
        console.log(`[11.0E.1][AUTO] Combined audit report saved: ${combinedReportPath}`);
        console.log(`[11.0E.1][AUTO] Validation result: matchRate=${comparisonReport.matchRate}, calibrationError=${comparisonReport.calibrationError}, validationPassed=${comparisonReport.validationPassed}`);
      } else {
        console.log(`[11.0E.1][AUTO] Comparison skipped - missing VTS or paper trades files`);
      }
    } catch (compErr) {
      console.error(`[11.0E.1][AUTO] Comparison audit failed:`, compErr);
    }
  }, durationMinutes * 60 * 1000);
  
  return { success: true, message: `Phase-10 validation session started for ${durationMinutes} minutes`, sessionId };
}

export async function savePhase10SessionTrades(sessionId?: string): Promise<string> {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  
  const timestamp = sessionId || Date.now().toString();
  const filePath = path.join(dataDir, `vts_phase10_trades_${timestamp}.json`);
  
  const sessionData = {
    sessionId: timestamp,
    schemaVersion: 'v1.6.6',
    directive: '11.0E.1',
    startTime: phase10SessionStartTime ? new Date(phase10SessionStartTime).toISOString() : null,
    endTime: new Date().toISOString(),
    durationMinutes: phase10SessionStartTime ? Math.round((Date.now() - phase10SessionStartTime) / 60000) : 0,
    tradeCount: phase10SessionTrades.length,
    trades: phase10SessionTrades
  };
  
  await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
  console.log(`[11.0E.1][VTS] Saved ${phase10SessionTrades.length} Phase-10 trades to ${filePath}`);
  
  return filePath;
}

export function getPhase10SessionTrades(): Phase10TradeRecord[] {
  return [...phase10SessionTrades];
}

export function addPhase10TradeRecord(trade: Phase10TradeRecord): void {
  phase10SessionTrades.push(trade);
}

export function resetPhase10Session(): void {
  phase10SessionTrades = [];
  phase10SessionStartTime = null;
  cycleCount = 0;
}

export async function getLatestVTSTradesFile(): Promise<string | null> {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    const files = await fs.readdir(dataDir);
    const vtsFiles = files.filter(f => (f.startsWith('vts_trades_') || f.startsWith('vts_phase10_trades_')) && f.endsWith('.json'));
    if (vtsFiles.length === 0) return null;
    
    vtsFiles.sort().reverse();
    return path.join(dataDir, vtsFiles[0]);
  } catch {
    return null;
  }
}

export function getM5CSessionTrades(): Phase10TradeRecord[] {
  return getPhase10SessionTrades();
}

export function addM5CTradeRecord(trade: any): void {
  if (trade.regime && trade.signalType) {
    phase10SessionTrades.push(trade);
  }
}

export function resetM5CSession(): void {
  resetPhase10Session();
}

export async function saveM5CSessionTrades(sessionId?: string): Promise<string> {
  return savePhase10SessionTrades(sessionId);
}

/**
 * Directive 11.6E: Get all open virtual trades with full data for ML dashboard
 * Directive 11.6H: Added dollarValue and quantity fields
 */
export async function getOpenVirtualTradesForML(): Promise<Array<{
  symbol: string;
  // B69.1 (2026-05-04): asset class surfaced on Open Simulated Trades UI.
  // VTS today handles crypto_spot exclusively; hardcoded here to match the
  // existing trade-open insert site convention (vts-runner:~1895). When VTS
  // expands to cover other asset classes, both sites update together.
  assetClass: string;
  regime: string;
  strategy: string;
  signalType: string;
  patternType: string | null;
  pool: string;
  sourcePool: string;
  dollarValue: number;    // Directive 11.6H: Fixed USD exposure
  quantity: number;       // Directive 11.6H: Variable coin units
  entryPrice: number;
  exitPrice: null;
  target: number;
  stopLoss: number;
  currentPrice: number | null;
  distanceToTarget: string;
  distanceToStop: string;
  grossProfitValue: number;
  grossProfitPercent: string;
  costs: number;
  netProfitValue: number;
  netProfitPercent: string;
  finalScore: number;
  hybridScore: number;
  expectedEdge: number;
  regimeWeight: number;
  entryTime: string;
  durationOpenMinutes: number;
  globalRegime: string | null;
  pairFriction: number | null;
  globalFriction: number | null;
  pairDirectionalBias: string | null;
  globalDirectionalBias: string | null;
  // B61 (2026-04-15): numeric DBS scores alongside categories
  pairDirectionalBiasScore: number | null;
  globalDirectionalBiasScore: number | null;
  // B.2.UI (2026-06-02): entry-liquidity for the "Volume / Order Book" column.
  entryLiquidityValue?: number;
  entryLiquidityKind?: 'depth_usd' | 'volume_qty';
  // B65.2 (2026-04-23): trailing-engine state surfaced to the Open
  // Simulated Trades UI. tradeMode distinguishes TARGET (still aiming for
  // original target price) from TRAILING_TAKE (hit target, now in moonbag
  // mode trailing for additional upside). breakEvenLatched = true once
  // price gained 1×ATR and the stop ratcheted to net-breakeven (trade is
  // protected from becoming a loser). targetLatched = true once target
  // was reached (equivalent to tradeMode === 'TRAILING_TAKE'). The current
  // engine-tracked stop is also surfaced so the UI reflects ratcheted
  // stop moves, not just the original entry-time stop.
  tradeMode: 'TARGET' | 'TRAILING_TAKE';
  breakEvenLatched: boolean;
  targetLatched: boolean;
  engineStopPrice: number | null;
  // B65.4: live ladder rung count (0 = no targets hit; 1+ = N target hits in moonbag mode).
  // Surfaces a "rung climb count" diagnostic in the Open Simulated Trades UI.
  ladderRungsHit: number;
  // B65.4.2 (2026-04-28): ladder mechanics observability for the Open
  // Simulated Trades UI / CSV export. originalStopPrice always present
  // (captured at trade open). latchTriggerPrice null until target latches.
  // rungTargetHistory empty array until first ratchet event.
  originalStopPrice: number | null;
  latchTriggerPrice: number | null;
  rungTargetHistory: number[] | null;
  // P19-B7.2b (OBJ-B): the maker/taker entry fee-mode + per-side rate the entry
  // opened on, surfaced to the Open Simulated Trades (VTS) UI fee-mode column.
  // NULL for pre-B7.2b trades (UI renders an em-dash). Entry-leg only.
  chosenEntryMode: 'taker' | 'maker' | null;
  entryFeeRate: number | null;
}>> {
  const now = Date.now();
  const trades: Array<any> = [];

  // B65.2 (2026-04-23): read trailing-engine state once per call so the UI
  // sees the current mode + latch flags + ratcheted stop for every trade.
  // Imported at module-load (see top of file): getTECState.

  // B-NEW-25 (Kyle directive 2026-05-13): asset-class-aware price routing for
  // the UI serializer. Pre-B-NEW-25, every trade read from priceCache (which
  // only has crypto prices via Kraken REST/WS). xstock trades got
  // priceCache.get() === undefined → priceIsFresh = false → currentPrice = null
  // → UI rendered "Stale" badge with placeholder values. Mirrors the same
  // dispatch pattern the exit-cycle uses (resolveOpenVirtualTrades B79.0m.b2
  // xstock leg). Batch-fetch all xstock open-trade prices once per call from
  // xstock_spot_ticker_snap; reuse the priceCache path for crypto trades.
  const xstockSymbolsForUi = new Set<string>();
  for (const trade of openVirtualTrades.values()) {
    if (trade.assetClass === 'xstock_spot') xstockSymbolsForUi.add(trade.symbol);
  }
  const xstockPriceMapUi = new Map<string, number>();
  if (xstockSymbolsForUi.size > 0) {
    try {
      const xstockListSql = Array.from(xstockSymbolsForUi)
        .map((s) => `'${s.replace(/'/g, "''")}'`)
        .join(',');
      const result: any = await db.execute(sql.raw(`
        SELECT DISTINCT ON (symbol)
          symbol::text AS symbol,
          last::text AS price,
          captured_at
        FROM xstock_spot_ticker_snap
        WHERE captured_at > NOW() - INTERVAL '5 minutes'
          AND symbol IN (${xstockListSql})
        ORDER BY symbol, captured_at DESC
      `));
      const rows = (result as any).rows ?? result;
      if (Array.isArray(rows)) {
        for (const r of rows as Array<{ symbol: string; price: string }>) {
          const p = parseFloat(r.price);
          if (Number.isFinite(p) && p > 0) {
            xstockPriceMapUi.set(r.symbol, p);
          }
        }
      }
    } catch (err) {
      console.error(`[B-NEW-25][UI_XSTOCK_PRICE_FETCH] failed for ${xstockSymbolsForUi.size} symbols:`, err instanceof Error ? err.message : err);
    }
  }

  for (const [tradeId, trade] of openVirtualTrades) {
    let currentPrice: number | null = null;
    if (trade.assetClass === 'xstock_spot') {
      const p = xstockPriceMapUi.get(trade.symbol);
      currentPrice = p !== undefined ? p : null;
    } else {
      const cachedPrice = priceCache.get(trade.symbol);
      const priceIsFresh = cachedPrice && (Date.now() - cachedPrice.lastUpdatedAt < 120000);
      currentPrice = priceIsFresh ? cachedPrice.price : null;
    }
    
    const priceForCalc = currentPrice ?? trade.entryPrice;
    
    const distanceToTarget = trade.takeProfit > 0 
      ? ((trade.takeProfit - priceForCalc) / priceForCalc * 100).toFixed(2) + '%'
      : 'N/A';
    const distanceToStop = trade.stopLoss > 0 
      ? ((trade.stopLoss - priceForCalc) / priceForCalc * 100).toFixed(2) + '%'
      : 'N/A';
    
    // Directive 11.6H: Use quantity for P/L calculations, with fallback for legacy trades
    // For legacy trades without dollarValue/quantity: positionSize represents USD, so divide by entryPrice to get units
    const tradeDollarValue = trade.dollarValue ?? trade.positionSize;
    const tradeQuantity = trade.quantity ?? (tradeDollarValue / trade.entryPrice);
    
    const grossProfitValue = currentPrice !== null 
      ? (currentPrice - trade.entryPrice) * tradeQuantity 
      : 0;
    const grossProfitPercent = currentPrice !== null 
      ? ((currentPrice - trade.entryPrice) / trade.entryPrice * 100).toFixed(2) 
      : '0.00';
    // Fix: Convert frictionCost (percentage) to dollar amount
    const costsDollar = tradeDollarValue * trade.frictionCost;
    const netProfitValue = currentPrice !== null 
      ? grossProfitValue - costsDollar 
      : 0;
    const netProfitPercent = currentPrice !== null 
      ? (tradeDollarValue > 0 ? (netProfitValue / tradeDollarValue * 100).toFixed(2) : '0.00')
      : '0.00';
    
    const durationMs = now - trade.openedAt;
    const durationMinutes = Math.floor(durationMs / 60000);
    
    trades.push({
      symbol: trade.symbol,
      // B79.TEC (2026-05-08): read from trade record; was hardcoded 'crypto_spot'.
      // VTS now handles multi-asset-class trades; the hardcoded literal would
      // misclassify xstock_spot / crypto_perp Open Simulated Trades on the UI.
      assetClass: trade.assetClass,
      // B.2.UI (2026-06-02): entry-liquidity snapshot for the "Volume / Order Book" column.
      entryLiquidityValue: trade.entryLiquidityValue,
      entryLiquidityKind: trade.entryLiquidityKind,
      regime: trade.regime,
      strategy: trade.strategy,
      signalType: trade.signalType,
      patternType: trade.patternType || null,
      pool: trade.pool.toUpperCase(),
      sourcePool: trade.sourcePool || ("unknown" as string),
      // P19-B7.2b (OBJ-B): maker/taker entry fee-mode for the fee-mode column.
      chosenEntryMode: trade.chosenEntryMode ?? null,
      entryFeeRate: trade.entryFeeRate ?? null,
      dollarValue: parseFloat(tradeDollarValue.toFixed(2)),  // Directive 11.6H: Fixed USD exposure
      quantity: parseFloat(tradeQuantity.toFixed(6)),        // Directive 11.6H: Variable coin units
      entryPrice: trade.entryPrice,
      exitPrice: null,
      target: trade.takeProfit,
      stopLoss: trade.stopLoss,
      currentPrice,
      distanceToTarget: (parseFloat(distanceToTarget) >= 0 ? '+' : '') + distanceToTarget,
      distanceToStop,
      grossProfitValue: parseFloat(grossProfitValue.toFixed(2)),
      grossProfitPercent: (parseFloat(grossProfitPercent) >= 0 ? '+' : '') + grossProfitPercent + '%',
      costs: parseFloat(costsDollar.toFixed(4)),
      netProfitValue: parseFloat(netProfitValue.toFixed(2)),
      netProfitPercent: (parseFloat(netProfitPercent) >= 0 ? '+' : '') + netProfitPercent + '%',
      // Batch 47f15: Compute ranking score for display (same formula as RTB queue)
      rankingScore: computeRankingScore(
        trade.finalScore,
        normalizeNetReturn(trade.expectedEdge ?? 0),
        trade.frictionCost ?? 0,
        0, // contextBonus — DECLARED-NEVER-WIRED (B-4.7 C2 finding): the
           // CONTEXT_BONUS pair-vs-global regime agreement rules exist in
           // ranking-weights.ts but nothing computes them; wire-or-remove is
           // homed to AMR scoping (RUNNING_ISSUES #217).
        trade.signalType ?? 'QUANT'
      ),
      finalScore: trade.finalScore,
      hybridScore: trade.hybridScore,
      expectedEdge: trade.expectedEdge ?? trade.predictiveConfidence ?? 0, // Batch 45: Use actual computed edge, not default 0.5
      regimeWeight: trade.regimeWeight,
      entryTime: new Date(trade.openedAt).toISOString(),
      durationOpenMinutes: durationMinutes,
      globalRegime: trade.globalRegime || null,
      pairFriction: trade.pairFriction ?? null,
      globalFriction: trade.globalFriction ?? null,
      pairDirectionalBias: trade.pairDirectionalBias || null,
      globalDirectionalBias: trade.globalDirectionalBias || null,
      // B61 (2026-04-15): numeric DBS scores alongside categories
      pairDirectionalBiasScore: trade.pairDirectionalBiasScore ?? null,
      globalDirectionalBiasScore: trade.globalDirectionalBiasScore ?? null,
      // B65.2 (2026-04-23): trailing-engine state for the Open Simulated
      // Trades UI. tradeMode flips to TRAILING_TAKE on target hit for
      // qualifying strategies; breakEvenLatched fires at 1×ATR gain.
      // engineStopPrice is the engine's ratcheted stop (may be higher
      // than the original trade.stopLoss once the engine has moved it).
      ...(() => {
        // B80 (2026-05-13): per-trade keying — look up engine state by tradeId.
        const ts = getTECState(tradeId);
        return {
          tradeMode: (ts?.tradeMode ?? 'TARGET') as 'TARGET' | 'TRAILING_TAKE',
          breakEvenLatched: ts?.breakEvenLatched ?? false,
          targetLatched: ts?.targetLatched ?? false,
          engineStopPrice: ts?.currentStopPrice ?? null,
          ladderRungsHit: ts?.ladderRung ?? 0, // B65.4
          // B65.4.2: ladder mechanics observability — read directly from
          // engine state, not from trade.* fields, so we get the freshest
          // values regardless of how recently the writeback ran.
          originalStopPrice: ts?.originalStopPrice ?? trade.originalStopPrice ?? null,
          latchTriggerPrice: ts?.latchTriggerPrice ?? trade.latchTriggerPrice ?? null,
          rungTargetHistory: ts?.rungTargetHistory ?? trade.rungTargetHistory ?? null,
        };
      })(),
      // B67.3 (2026-04-29): cohort marker for per-underlying-cap A/B observation
      pairIdHash: trade.pairIdHash ?? null,
      // B67.2.1 (2026-04-29): regime confidence + macro modifier + phase persisted
      // at trade-open. Surfaced on the open-trades UI so daily monitoring can see
      // per-trade modulation values in real time.
      regimeConfidenceRaw: trade.regimeConfidenceRaw ?? null,
      macroModifierValue: trade.macroModifierValue ?? null,
      phase: trade.phase ?? null,
      phaseAgeSeconds: trade.phaseAgeSeconds ?? null,
      strategyPhaseWeight: trade.strategyPhaseWeight ?? null,
      regimeConfidenceModulated: trade.regimeConfidenceModulated ?? null,
    });
  }

  return trades.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());
}

// Batch 19G Fix 5: VTS_HYBRID_COMPATIBILITY and findVTSHybridMatch removed —
// now imported from shared hybrid-compatibility-registry.ts (single source of truth)
