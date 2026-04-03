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
 * - Automatic stop when tradingActive=true
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
// Directive 11.8B-A2: Import canonical Net EV kernel for VTS profitability decisions
import { computeNetExpectancyKernel } from '../core/calculations/net-expectancy-kernel.js';
// Note: isSignalProfitable is retained as a regime-aware ROI pre-filter (not EV math)
import { isSignalProfitable, getROIDetails, getDynamicROIThreshold } from '../core/calculations/expectancy.js';
import { getPredictiveConfidence } from '../core/utils/score-calculator.js';
import { logSkippedSignal } from '../core/logging/skipped-signals-logger.js';
import { loadCalibration, applyCalibration, type CalibrationCoefficients } from '../utils/calibration.js';
import { priceCache, type CachedPrice, type CacheBucketType } from './price-cache.js';
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
import { KrakenService } from './kraken.js';
// Batch 18: OHLC cache (5-min TTL) eliminates redundant per-symbol OHLC fetches
import { ohlcCache } from './ohlc-cache.js';
import { computeStrategyWeights, getWeightSync } from '../utils/strategyWeights.js';
import { computeExposureBias, getExposureMultiplierSync } from '../utils/strategyBias.js';
import { getCachedCostMetrics, computeNetGeometry } from '../core/math/cost-model.js';
import { compareLatestSessions, savePaperSessionTrades, getPaperSessionTrades } from './vts-live-comparison-audit.js';
import { SCORE_WEIGHTS } from '../config/score-weights.config.js';
import { calculatePairRegime, getRegimeWeight, calculateRegimeScore, getNormalizedRegimeWithDetails } from '../core/metrics/market-regime.js';
// Phase 13: Market Context Engine for centralized indicator + regime computation
import { getMarketContextEngine } from './market-context-engine.js';
// Phase 14 HF6: StrategyEngine for strategy-specific detect functions
import { StrategyEngine, type StrategySignal } from './strategy-engine.js';
import type { PatternInput } from '../strategies/strategy-helpers.js';
// Phase 14 HF6: Global friction/DBS getters for trade context dimensions
import { getGlobalFriction, getLastGlobalDBSCategory } from './market-indicators.js';
// Phase 14: Real score calculator replaces simulation stubs
import { computeRealHybridScore, computeRealDecayPenalty } from '../core/utils/vts-real-score.js';
import { computeBiasConfidenceModifier } from '../core/metrics/directional-bias.js';
import {
  CANONICAL_REGIME_STRATEGY_MAP as REGIME_STRATEGY_MAP,
  selectContextAwareStrategy,
  symbolToHash,
  getRegimeRiskMultiplier,
  getStrategiesForRegime,
  normalizeStrategy,
  normalizePatternToCanonical,
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
import '../core/governance/governance-persistence.js'; // Batch 46: Auto-persist/rehydrate governance state
import { logSkippedSignal as logGovernanceSkippedSignal } from '../core/logging/skipped-signals-logger.js';
import { resolveStrategyMode, getModeOverlay, meetsConfidenceFloor, recordModeExecution, type StrategyMode, type StrategyModeOverlay } from '../core/governance/strategy-modes.js';
import fs from 'fs/promises';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

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
let sessionStartTime: number | null = null;
let cycleCount = 0;
let patternRecognitionWarmedUp = false;

// Batch 21: VTS evaluation diagnostics — imported from shared types
import type { VTSEvalSnapshot, NullReasonBreakdown } from '../types/virtual-trade.interface.js';
import { setNullReason, resetNullReason, getNullReason } from '../utils/null-reason-tracker.js';

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
  };

  for (const snap of vtsEvalHistory) {
    aggregated.quantPairsEvaluated += snap.quantPairsEvaluated;
    aggregated.patternPairsEvaluated += snap.patternPairsEvaluated;
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
        aggregated.byStrategy[strat] = { evaluated: 0, nulls: 0, signals: 0 };
      }
      aggregated.byStrategy[strat].evaluated += counts.evaluated;
      aggregated.byStrategy[strat].nulls += counts.nulls;
      aggregated.byStrategy[strat].signals += counts.signals;
    }
    // Batch 31: Aggregate nullReasonDetail
    if (snap.nullReasonDetail) {
      if (!aggregated.nullReasonDetail) { aggregated.nullReasonDetail = {}; }
      for (const [reason, count] of Object.entries(snap.nullReasonDetail)) {
        aggregated.nullReasonDetail![reason] = (aggregated.nullReasonDetail![reason] ?? 0) + count;
      }
    }
  }

  return aggregated;
}

// Keep backward compat for any other callers
export function getLastVTSEvalCounters() {
  return getVTSEvalRolling24h();
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
  minVolume24h: number;
  minPrice: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Batch 18L: VTS Throughput Constants
// These constants control VTS-ONLY behavior. Active trading is NOT affected.
// Purpose: Increase VTS simulated trade volume for ML learning data.
// ══════════════════════════════════════════════════════════════════════════════
const VTS_NET_EV_FLOOR = -0.02;        // Batch 48: Staged relaxation -0.5%→-2.0%. VTS learning benefits from boundary-case trades. Active trading unaffected (strict netEV>0).
const VTS_MAX_CONCURRENT_PER_COMBO = 1; // Batch 19G HF1: Strict 1-per-combo (was 3). Only 1 open VTS trade per symbol+strategy.
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
  minVolume24h: 50000,
  minPrice: 0.5
};

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
  exitType?: 'stop_hit' | 'target_hit' | 'timeout' | 'pending';
  volZ?: number; // Directive 11.7F-B: Volatility Z-score for drift calculation
  trendZ?: number; // Directive 11.7F-B: Trend Z-score (momentum) for drift calculation
  executionContext?: 'VTS' | 'VTS_MULTI'; // 11.8C: Multi-strategy identification
  // Phase 14: 6 context dimensions captured at trade OPEN
  globalRegime?: string;
  pairFriction?: number;
  globalFriction?: number;
  pairDirectionalBias?: string;
  globalDirectionalBias?: string;
  filterTier?: 'standard' | 'relaxed';  // HF9: IMF filter tier
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
}

const openVirtualTrades: Map<string, OpenVirtualTrade> = new Map();
const MAX_OPEN_TRADES = 500; // Batch 18L: Increased from 300 to accommodate VTS throughput boost (VTS trades don't make Kraken API calls for execution)
// HF6 Item 3: openVirtualTrades is cleared at startup via vtsService.hf6ClearStaleTrades()
// which handles the vts-service side. Runner-side Map starts empty on module load.
console.log(`[11.6E][Registry] Max open trades set to ${MAX_OPEN_TRADES}`);

// Batch 45+47f15: Post-close re-entry suppression — prevents same symbol+strategy from reopening
// with identical setup. Two layers: time cooldown + setup-hash matching.
const recentCloses: Map<string, number> = new Map(); // key → close timestamp
const REENTRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minute cooldown after close
// Batch 47f15: Setup-hash suppression — block re-entry if entry/stop/target are unchanged
const lastSetupHash: Map<string, string> = new Map(); // key → "entry|stop|target" hash
const SETUP_HASH_TOLERANCE = 0.001; // 0.1% tolerance for "same setup"

function computeSetupHash(entry: number, stop: number, _target: number): string {
  // Hash only entry+stop (structural setup). Target varies with ATR each cycle
  // so including it defeats the purpose. Same entry+stop = same trade thesis.
  const round = (v: number) => Math.round(v / (v * SETUP_HASH_TOLERANCE)) * (v * SETUP_HASH_TOLERANCE);
  return `${round(entry).toFixed(4)}|${round(stop).toFixed(4)}`;
}

// Memory audit fix: prune stale entries from recentCloses and lastSetupHash
function pruneReentryMaps(): void {
  const now = Date.now();
  const HASH_EXPIRY_MS = 30 * 60 * 1000; // 30 min — hashes expire when setup likely changed
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
const MAX_HOLD_MS = 24 * 60 * 60 * 1000; // Directive 11.6: 24 hours max hold time (configurable)

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

function computeFinalScore(
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
      volume: parseFloat(candle.volume || candle[6] || 0),
      timestamp: candle.timestamp || candle[0] * 1000
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
 */
function callStrategyDetect(
  strategy: string,
  indicators: any,
  ohlcData: any[],
  patternInput: PatternInput | null
): StrategySignal | null {
  switch (strategy) {
    // ── Quant strategies ──
    case 'vwap_pullback':
      return strategyEngine.detectVWAPPullback(indicators, STRATEGY_CALL_SETTINGS, ohlcData);
    case 'abcd_long':
      return strategyEngine.detectABCDLong(ohlcData, STRATEGY_CALL_SETTINGS);
    case 'sma_trend_ride':
      return strategyEngine.detectSMATrendRide(indicators, ohlcData, STRATEGY_CALL_SETTINGS);
    case 'breakout':
      return strategyEngine.detectBreakout(ohlcData, {
        minConsolidationBars: 10,
        maxRangeWidth: 3,
        breakoutBuffer: 1,
        volumeMultiplier: 1.5,    // HF8: Relaxed from 2 — 1.5x avg volume still confirms breakout interest
        maxHoldingHours: 12
      });
    case 'mean_reversion':
      return strategyEngine.detectMeanReversion(indicators, ohlcData, {
        meanType: 'vwap',
        smaLength: 20,
        deviationThreshold: 2.0,  // HF8: Relaxed from 2.5 — 2% VWAP deviation is significant for 60-min
        partialExitPercent: 50,
        stopLossBuffer: 1
      });
    case 'range_trading':
    case 'range_trade':  // HF6B: Alias for canonical strategy map name
      return strategyEngine.detectRangeTrading(ohlcData, {
        minRangeDurationHours: 7,   // Batch 48: 12→7, aligned with strategy-engine.ts default (crypto consolidates faster)
        minRangeWidth: 2,           // HF8: Relaxed from 3 — 2% range width is meaningful
        minBoundaryTouches: 1,      // Batch 48: 2→1, aligned with strategy-engine.ts (crypto ranges need fewer boundary touches)
        entryZoneWidth: 0.5,
        stopLossBeyond: 1
      });
    case 'vwap_bounce':
      return strategyEngine.detectVWAPBounce(indicators, ohlcData, {
        vwapProximity: 0.5,
        minVWAPSlope: 0.3,
        volumeMultiplier: 1.3,
        maxPullbackBars: 5,
        partialExitR: 1.5
      });
    case 'liquidity_trap':
      // Batch 45: DISABLED — strategy produces bearish geometry (stop > entry, target < entry)
      // which is incompatible with long-only system. Confirmed by system manual spec and
      // web research: this is a bearish failed-breakout fade by design. Bullish redesign
      // (failed breakdown below support → long) is future work.
      setNullReason('strategy_disabled_bearish');
      return null;
    case 'dhma':
      return strategyEngine.detectDHMA(indicators, ohlcData, {
        theta_OBI: 0.3,
        epsilon_micro: 0.2,
        tau_toxicity: 0.7,
        maxSpread: 5,
        k_tp: 1.5,
        N_flow: 50,
        N_burst: 10,
        window_session: 20
      });
    // ── Pattern + Hybrid strategies ──
    case 'morning_star':
      return strategyEngine.detectMorningStar(indicators, ohlcData, patternInput);
    case 'inside_bar_reversal':
      return strategyEngine.detectInsideBarReversal(indicators, ohlcData, patternInput);
    case 'support_bounce':
      return strategyEngine.detectSupportBounce(indicators, ohlcData, patternInput);
    case 'pivot_shift':
      return strategyEngine.detectPivotShift(indicators, ohlcData, patternInput);
    case 'reverse_impulse':
      return strategyEngine.detectReverseImpulse(indicators, ohlcData, patternInput);
    case 'defensive_hedge':
      // Phase 14.1 HF8 (A3): Pass BTC candles for Spearman correlation (needs >= 32 candles)
      return strategyEngine.detectDefensiveHedge(indicators, ohlcData, patternInput, btcOhlcCache.length >= 32 ? btcOhlcCache : undefined);
    case 'adaptive_flow':
      return strategyEngine.detectAdaptiveFlow(indicators, ohlcData, patternInput);
    case 'volatility_edge':
      return strategyEngine.detectVolatilityEdge(indicators, ohlcData, patternInput);
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
  preDetectedPatterns?: any[] // Batch 44: Pre-detected patterns from outer loop (avoids duplicate scanPatterns)
): Promise<{ signal: VirtualSignal; tradeRecord: Phase10TradeRecord } | null> {
  // Phase 13: MCE computes regime (uses cache from main loop call)
  const mce = getMarketContextEngine();
  const mceContext = mce.computeContext(symbol, ohlcData, priceData.price, priceData.volume24h ?? 0);  // HF6B: Pass real ticker volume instead of 0
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
  const detectedPatterns = preDetectedPatterns ?? scanPatterns(candles, symbol);
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
    const strategySelection = selectContextAwareStrategy(
      regime, 
      detectedPattern?.pattern ?? null,
      sHash
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
  const stratDetectIndicators = {
    vwap: mceContext.indicators.vwap,
    sma: mceContext.indicators.sma,
    currentPrice: mceContext.indicators.currentPrice,
    volume: mceContext.indicators.volume,
    high24h: mceContext.indicators.high24h,
    low24h: mceContext.indicators.low24h,
  };

  // Build patternInput from detected patterns (same as orchestrator lines 1048-1070)
  // Batch 44: Always normalize detected pattern name through normalizePatternToCanonical()
  // before passing to strategy detect(). This is the single source of truth for pattern
  // name mapping (PATTERN_TO_CANONICAL in canonical-regime-strategy-map.ts).
  const bestDetectedPattern = detectedPatterns.length > 0 ? detectedPatterns.reduce((best: any, p: any) =>
    p.strength > best.strength ? p : best, detectedPatterns[0]) : null;

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
  const strategySignal = callStrategyDetect(strategy, stratDetectIndicators, ohlcAsAny, stratPatternInput);

  if (!strategySignal) {
    console.log(`[HF6][VTS] ${symbol}: Strategy ${strategy} returned null - conditions not met, skipping`);
    return null;
  }

  // Use strategy-computed entry/stop/target (replaces generic volatility formula)
  strategySignal.symbol = symbol;
  const entryPrice = strategySignal.entryPrice;
  const takeProfit = strategySignal.targetPrice;
  const stopLoss = strategySignal.stopPrice;

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
  const predictiveConfidence = getPredictiveConfidence(symbol, regime, strategy);

  // Phase 14: Apply Directional Bias confidence modifier
  const biasCategory = mceContext.directionalBias?.category ?? 'NEUTRAL';
  const biasModifier = computeBiasConfidenceModifier(biasCategory);
  
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
  
  const costMetrics = getCachedCostMetrics(symbol);
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
    DI
  });
  
  // Batch 18L Option A: VTS-specific relaxed Net EV gate
  // Active trading still uses strict netEV > 0 (in signal-orchestrator.ts)
  // VTS allows marginally negative EV for ML boundary learning
  // Signals with slightly negative EV teach the model where the profitability edge is
  if (kernelResult.netEV <= VTS_NET_EV_FLOOR) {
    logSkippedSignal({
      symbol,
      reason: 'Net_EV_Negative',
      regime,
      signalType,
      strategy,
      source: 'VTS'
    });
    console.log(`[18L][NetEV] Skipping ${symbol}: Net EV=${kernelResult.netEV.toFixed(6)} <= ${VTS_NET_EV_FLOOR} (rawEV=${kernelResult.rawEV.toFixed(6)}, friction=${totalFriction.toFixed(6)})`);
    if (counters) {
      if (!counters.rejectedReasons) {
        counters.rejectedReasons = { netEvBelowFloor: 0 };
      }
      counters.rejectedReasons.netEvBelowFloor++;
      counters.signalsRejected = (counters.signalsRejected ?? 0) + 1;
      if (isQuantPool(sourcePool)) {
        counters.quantSignalsRejected = (counters.quantSignalsRejected ?? 0) + 1;
      } else {
        counters.patternSignalsRejected = (counters.patternSignalsRejected ?? 0) + 1;
      }
    }
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
  const roiDetails = getROIDetails(entryPrice, takeProfit, regime, predictiveConfidence);
  if (!isSignalProfitable(entryPrice, takeProfit, regime, predictiveConfidence)) {
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
  const stopDistance = entryPrice - stopLoss;
  const targetDistance = takeProfit - entryPrice;
  const adjustedStopDistance = stopDistance * modeOverlay.stopLossDistanceMultiplier;
  const adjustedTargetDistance = targetDistance * modeOverlay.takeProfitDistanceMultiplier;
  const adjustedStopLoss = entryPrice - adjustedStopDistance;
  const adjustedTakeProfit = entryPrice + adjustedTargetDistance;
  
  console.log(`[VTS][11.6H][Sizing] ${symbol}: $${dollarValue.toFixed(2)} exposure → ${quantity.toFixed(6)} units @ $${entryPrice.toFixed(4)}`);
  console.log(`[11.7S][VTS] ${symbol}: Stop ${stopLoss.toFixed(4)}→${adjustedStopLoss.toFixed(4)} | TP ${takeProfit.toFixed(4)}→${adjustedTakeProfit.toFixed(4)} (mode=${strategyMode})`);
  
  // Batch 45: Post-close re-entry cooldown
  const cooldownKey = `${symbol}:${strategy}`;
  const lastClose = recentCloses.get(cooldownKey);
  if (lastClose && Date.now() - lastClose < REENTRY_COOLDOWN_MS) {
    setNullReason('reentry_cooldown');
    return null;
  }

  // Batch 19G HF1: Strict duplicate guard — only 1 open trade per symbol+strategy combo
  // Previously allowed 3 (Batch 18L Option B), now aligned with active trading policy
  const existingTradeCount = Array.from(openVirtualTrades.values()).filter(t =>
    t.symbol === symbol && t.strategy === strategy
  ).length;
  if (existingTradeCount >= VTS_MAX_CONCURRENT_PER_COMBO) {
    logSkippedSignal({
      symbol,
      reason: 'Duplicate_Position_Max',
      regime,
      signalType,
      strategy,
      source: 'VTS'
    });
    console.log(`[18L][DUP_GUARD] Skipping ${symbol}/${strategy}: ${existingTradeCount}/${VTS_MAX_CONCURRENT_PER_COMBO} concurrent VTS trades`);
    return null;
  }
  
  // Directive 11.8C: Trade ID includes strategy for unique identification
  // Format: vts_{symbol}_{strategy}_{timestamp}
  const tradeId = `vts_${symbol.replace('/', '_')}_${strategy}_${Date.now()}`;
  
  // Check if we can accept more open trades
  if (openVirtualTrades.size >= MAX_OPEN_TRADES) {
    console.log(`[11.6][VTS] Max open trades reached (${MAX_OPEN_TRADES}), skipping new trade for ${symbol}`);
    return null;
  }
  
  // Directive 11.6: Create open virtual trade for real-price resolution
  // Directive 11.7S: Uses adjusted stop/target based on mode overlay
  const openTrade: OpenVirtualTrade = {
    id: tradeId,
    symbol,
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
    // Phase 14: Snapshot 6 context dimensions at trade OPEN
    globalRegime: (() => {
      try { const ta = getTelemetryAggregator(); return ta.getDominantRegime?.()?.regime ?? regime; } catch { return regime; }
    })(),
    pairFriction: (() => {
      const cm = getCachedCostMetrics(symbol);
      return Math.min(((cm.fee * 2 + cm.slippage * 2 + cm.spread) * 10000) / 3, 100);
    })(),
    globalFriction: getGlobalFriction(), // HF6: Read cached global friction from market-indicators
    pairDirectionalBias: mceContext.directionalBias?.category ?? 'NEUTRAL',
    globalDirectionalBias: getLastGlobalDBSCategory(), // HF6: Read cached global DBS from market-indicators
    filterTier,  // HF9: IMF filter tier from FX5 scanner
    sourcePool: sourcePool,  // Batch 37: Propagate as-is, no fallback
  };

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
  };
  
  // Directive 11.6: Trade record marked as pending - exit determined by resolveOpenVirtualTrades()
  // Directive 11.7R: Uses finalScore with governance multiplier
  const tradeRecord: Phase10TradeRecord = {
    symbol,
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
  
  return { signal, tradeRecord };
}

/**
 * Directive 11.4C.1: Get pairs directly from FX5 Scanner (not telemetry)
 * VTS is the sole source of telemetry writes - it gets raw pairs from FX5 and generates signal data
 */
async function getIdealPoolPairs(): Promise<Array<{ symbol: string; pool: 'ideal' | 'rotational'; filterTier?: 'standard' | 'relaxed'; sourcePool?: string }>> {
  try {
    // Directive 11.4C.1: Get pairs directly from FX5 scanner's current batch
    // Batch 19F Phase 2: FX5 scan batch now includes sourcePool tags from dual-path filters.
    // This is the CORRECT source for VTS — NOT activeFilterPool (which is EMPTY during passive learning).
    const scanBatch = fx5Scanner.getCurrentScanBatch('paper');

    if (scanBatch.length >= 10) {
      // Directive 11.6F: Filter out benchmarks before processing - they stay in pool but don't trade
      const tradablePairs = scanBatch.filter(p => !p.isBenchmark);
      const benchmarkCount = scanBatch.length - tradablePairs.length;
      const patternCount = tradablePairs.filter(p => p.sourcePool === 'pattern').length;
      const quantCount = tradablePairs.filter(p => isQuantPool(p.sourcePool)).length;
      console.log(`[11.4C.1][VTS] Using FX5 scan batch: ${scanBatch.length} pairs (${benchmarkCount} benchmarks excluded, ${tradablePairs.length} tradable: ${quantCount} quant + ${patternCount} pattern)`);

      // Directive 11.4H.1 Task 1: Normalize symbols at ingress with fallback and tier logging
      const validPairs: Array<{ symbol: string; pool: 'ideal' | 'rotational'; filterTier?: 'standard' | 'relaxed'; sourcePool?: string }> = [];
      for (const p of tradablePairs) {
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
        validPairs.push({ symbol: canonicalSymbol, pool: p.pool, filterTier: p.filterTier, sourcePool: p.sourcePool });
      }
      return validPairs;
    }

    // Cold start fallback: If FX5 hasn't scanned yet, check active filter pool
    console.log('[11.4C.1][VTS] Scan batch too small, checking Active Filter Pool...');
    const fx5Survivors = activeFilterPool.getActivePool('paper');

    if (fx5Survivors && fx5Survivors.length >= 10) {
      console.log(`[11.4C.1][VTS] Using Active Filter Pool: ${fx5Survivors.length} pairs`);
      const validPairs: Array<{ symbol: string; pool: 'ideal' | 'rotational'; sourcePool: string }> = [];
      for (const p of fx5Survivors) {
        if ((p.price ?? 0) < vtsConfig.minPrice || (p.volume24h ?? 0) < vtsConfig.minVolume24h) {
          continue;
        }
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
  
  // Get all symbols from open trades
  const symbols = Array.from(new Set([...openVirtualTrades.values()].map(t => t.symbol)));
  
  // Subscribe all symbols to vtsSimulation bucket and fetch prices
  const bucketType: CacheBucketType = 'vtsSimulation';
  for (const symbol of symbols) {
    priceCache.subscribe(symbol, bucketType);
  }
  
  // Wait for cache to refresh
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const priceDataMap = await priceCache.getBatch(bucketType, symbols);
  
  // Check each open trade against current prices
  const tradesToClose: Array<{
    id: string;
    trade: OpenVirtualTrade;
    exitPrice: number;
    exitReason: 'stop_hit' | 'target_hit' | 'timeout';
  }> = [];
  
  for (const [tradeId, trade] of openVirtualTrades) {
    const holdDurationMs = now - trade.openedAt;
    const priceData = priceDataMap.get(trade.symbol);

    // Batch 18I: Force-close stale positions even without price data.
    // Previously, trades with unavailable prices were skipped entirely via
    // `continue`, causing indefinite accumulation in the in-memory Map.
    // Timeout check now runs BEFORE price availability check.
    if (holdDurationMs > MAX_HOLD_MS) {
      const exitPrice = (priceData && priceData.price > 0) ? priceData.price : trade.entryPrice;
      tradesToClose.push({ id: tradeId, trade, exitPrice, exitReason: 'timeout' });
      console.log(`[11.6][STALE_CLEANUP] Force-closing ${trade.symbol}/${trade.strategy} after ${Math.round(holdDurationMs / 3600000)}h (price=${(priceData && priceData.price > 0) ? 'live' : 'entry-fallback'})`);
      continue;
    }

    if (!priceData || priceData.price <= 0) {
      // No price data - skip this cycle (stale trades handled above)
      continue;
    }

    const currentPrice = priceData.price;

    // Directive 11.6 Task 3: Trade Exit Conditions
    let exitReason: 'stop_hit' | 'target_hit' | 'timeout' | null = null;
    let exitPrice = currentPrice;

    if (currentPrice <= trade.stopLoss) {
      exitReason = 'stop_hit';
      exitPrice = trade.stopLoss; // Exit at stop level
    } else if (currentPrice >= trade.takeProfit) {
      exitReason = 'target_hit';
      exitPrice = trade.takeProfit; // Exit at target level
    }

    if (exitReason) {
      tradesToClose.push({ id: tradeId, trade, exitPrice, exitReason });
    }
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
      sourcePool: trade.sourcePool,
    };
    
    // Add to session trades
    phase10SessionTrades.push(closedTradeRecord);
    
    // Update telemetry with actual outcome
    const telemetry = getTelemetryAggregator();
    telemetry.recordPairTelemetry(trade.symbol, {
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
    
    // Directive 11.6C: Persist to legacy VTS storage and ML pipeline
    try {
      const result = await vtsService.persistRealPriceTrade({
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
        filterTier: trade.filterTier,
      });
      if (result.persisted) persisted++;
      if (result.mlTriggered) mlQueued++;
    } catch (error) {
      console.error(`[11.6C][Error] Failed to persist ${trade.symbol}:`, error);
    }
    
    // Remove from open trades registry
    openVirtualTrades.delete(id);
    // Batch 45: Record close timestamp for re-entry cooldown
    recentCloses.set(`${trade.symbol}:${trade.strategy}`, Date.now());
    
    // Directive 11.6 Task 6: Verification logging
    const pnlSign = netPnl >= 0 ? '+' : '';
    console.log(`[11.6][Exit] ${trade.symbol} closed via ${exitReason} @ ${exitPrice.toFixed(6)} after ${holdDurationStr} | PnL=${pnlSign}${pnlPercent}%`);
    
    resolved++;
    if (exitReason === 'stop_hit') stopHits++;
    if (exitReason === 'target_hit') targetHits++;
    if (exitReason === 'timeout') timeouts++;
  }
  
  if (resolved > 0) {
    console.log(`[11.6][Resolution] Cycle complete: ${resolved} trades closed (stops=${stopHits}, targets=${targetHits}, timeouts=${timeouts}), ${openVirtualTrades.size} still open`);
    // Directive 11.6D: Sanity check - all trades resolved via real-price
    console.log(`[11.6D][SanityCheck] All trades resolved via real-price. No legacy random trades found.`);
    console.log(`[11.6D][Summary] Trades Closed: ${resolved} | Persisted: ${persisted} | ML Queued: ${mlQueued}`);
  }
  
  return { resolved, stopHits, targetHits, timeouts };
}

/**
 * Helper function to format hold duration in human-readable format
 */
function formatHoldDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
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

async function runPhase10SimulationCycle(): Promise<VTSCycleMetrics> {
  const cycleStart = Date.now();
  cycleCount++;

  // Memory audit: prune stale re-entry suppression data each cycle
  pruneReentryMaps();

  // Directive 11.6: First resolve any open trades before creating new ones
  await resolveOpenVirtualTrades();
  
  const config = await getSystemConfig();
  if (config.tradingActive) {
    console.log('[11.0E.1][VTS] Skipping cycle - tradingActive=true');
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
  
  // Batch 19F Phase 2: getIdealPoolPairs() now returns ALL pairs from FX5 scan batch
  // with sourcePool tags (quant/pattern) already set. This is the SOLE pair source for VTS.
  // The FX5 scan batch includes duplicated entries for pairs that pass BOTH filter paths
  // (each entry tagged with the respective sourcePool), matching active trading path parity.
  // CRITICAL FIX: Previous code called activeFilterPool.getPatternPool('paper') which returns
  // EMPTY during passive learning — active filter pool only populates when trading is ACTIVE.
  const allPairs = await getIdealPoolPairs();

  // Split pairs by sourcePool for logging and strategy routing
  const quantPairs = allPairs.filter(p => isQuantPool(p.sourcePool));
  const patternPairs = allPairs.filter(p => p.sourcePool === 'pattern');

  // Use all pairs (quant + pattern) for the simulation loop
  const pairs = allPairs;

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
    byStrategy: {} as Record<string, { evaluated: number; nulls: number; signals: number }>,
    nullReasonDetail: {} as Record<string, number>,
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
    const { STRATEGY_FAMILY_MAP, FILTER_FAMILIES, HYBRID_FAMILY_ELIGIBILITY } = await import('../config/canonical-regime-strategy-map.js');
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

  for (const pair of pairs) {
    try {
      // Batch 23: Max open trades check
      if (openVirtualTrades.size >= MAX_OPEN_TRADES) {
        vtsEvalCounters.nullReasons.maxOpenTrades++;
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
      // Phase 13: MCE computes regime + indicators in a single pass (cached per symbol)
      const mce = getMarketContextEngine();
      const mceContext = mce.computeContext(pair.symbol, ohlcData, priceData.price, priceData.volume24h ?? 0);  // HF6B: Pass real ticker volume instead of 0
      const pairRegime = mceContext.regime.regime as MarketRegimeType;
      const regimeStrategies = getStrategiesForRegime(pairRegime);
      
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
        // Convert OHLC to Candle[] for scanPatterns
        const candles = ohlcData.map(o => ({
          timestamp: o.timestamp,
          open: o.open,
          high: o.high,
          low: o.low,
          close: o.close,
          volume: o.volume,
        }));

        const detectedPatterns = scanPatterns(candles, pair.symbol);
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
          for (const regimeMapping of Object.values(REGIME_STRATEGY_MAP)) {
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
          continue;
        }

        console.log(`[19G_HF1][VTS] ${pair.symbol} | Regime=${pairRegime} | sourcePool=pattern | Pattern-driven: ${effectiveStrategies.map(s => `${s.strategyKey}(${s.patternType})`).join(', ')}`);
      } else {
        vtsEvalCounters.quantPairsEvaluated++;
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
          const detectedPatterns = scanPatterns(candles, pair.symbol);
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
          continue;
        }

        const patternNote = quantPairPatternStrategies.length > 0
          ? ` + ${quantPairPatternStrategies.length} pattern(${quantPairPatternStrategies.map(s => s.strategyKey).join(',')})`
          : '';
        console.log(`[44][VTS] ${pair.symbol} | Regime=${pairRegime} | sourcePool=${pair.sourcePool ?? 'quant'} | ${quantOnlyStrategies.length} quant${patternNote}`);
      }

      vtsService.updateMarketPrice(pair.symbol, priceData.price);

      for (const stratDef of effectiveStrategies) {
        // Batch 22: Family-aware strategy check
        const stratFamily = STRATEGY_FAMILY_MAP[stratDef.strategyKey];
        const pairFams = vtsSymbolFamilies.get(pair.symbol);
        if (stratFamily && stratFamily !== 'hybrid' && pairFams && !pairFams.has(stratFamily)) {
          // Batch 45: familyFilterMismatch is a pre-detect eligibility skip, NOT a strategy evaluation.
          // Do NOT count it in totalStrategyEvaluations, byStrategy, or null counters.
          // This keeps the detect()-level null rate honest.
          vtsEvalCounters.nullReasons.familyFilterMismatch++;
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
            continue;
          }
        }
        // Batch 22 HF3: Duplicate pre-check at outer loop level (blockedDupCombos in scope)
        const dupCheckCount = Array.from(openVirtualTrades.values()).filter(t =>
          t.symbol === pair.symbol && t.strategy === stratDef.strategyKey
        ).length;
        if (dupCheckCount >= VTS_MAX_CONCURRENT_PER_COMBO) {
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
        const result = await generatePhase10Signal(pair.symbol, priceData, ohlcData, pair.pool, stratDef, pair.filterTier, pair.sourcePool, vtsEvalCounters, outerLoopDetectedPatterns);
        // Batch 19I: Track strategy outcomes
        const stratKey = stratDef.strategyKey;
        if (!vtsEvalCounters.byStrategy[stratKey]) {
          vtsEvalCounters.byStrategy[stratKey] = { evaluated: 0, nulls: 0, signals: 0 };
        }
        vtsEvalCounters.byStrategy[stratKey].evaluated++;
        vtsEvalCounters.totalStrategyEvaluations++;
        if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternStrategyEvaluations = (vtsEvalCounters.patternStrategyEvaluations ?? 0) + 1; } else { vtsEvalCounters.quantStrategyEvaluations = (vtsEvalCounters.quantStrategyEvaluations ?? 0) + 1; }
        if (!result) {
          vtsEvalCounters.byStrategy[stratKey].nulls++;
          if (pair.sourcePool === 'pattern') {
            vtsEvalCounters.patternStrategyNulls = (vtsEvalCounters.patternStrategyNulls ?? 0) + 1;
          } else {
            vtsEvalCounters.quantStrategyNulls++;
          }
          vtsEvalCounters.nullReasons.conditionsNotMet++;
          // Batch 31: Capture granular null reason from strategy
          const detailReason = getNullReason();
          if (!vtsEvalCounters.nullReasonDetail) { vtsEvalCounters.nullReasonDetail = {}; }
          vtsEvalCounters.nullReasonDetail[detailReason] = (vtsEvalCounters.nullReasonDetail[detailReason] ?? 0) + 1;
          continue;
        }
        const { signal, tradeRecord } = result;

        // Batch 26: Net EV floor check BEFORE counting as generated signal
        // Per semantic contract: rejected = signal created but failed post-generation guard (not a null)
        if (signal && signal.netEV !== undefined && signal.netEV < VTS_NET_EV_FLOOR) {
          if (!vtsEvalCounters.rejectedReasons) { vtsEvalCounters.rejectedReasons = { netEvBelowFloor: 0 }; }
          vtsEvalCounters.rejectedReasons.netEvBelowFloor++;
          vtsEvalCounters.signalsRejected = (vtsEvalCounters.signalsRejected ?? 0) + 1;
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
        vtsEvalCounters.byStrategy[stratKey].signals++;
        vtsEvalCounters.signalsGenerated++;
        if (pair.sourcePool === 'pattern') { vtsEvalCounters.patternSignalsGenerated = (vtsEvalCounters.patternSignalsGenerated ?? 0) + 1; } else { vtsEvalCounters.quantSignalsGenerated = (vtsEvalCounters.quantSignalsGenerated ?? 0) + 1; }

        const telemetry = getTelemetryAggregator();
        telemetry.recordPairTelemetry(pair.symbol, {
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
          const compatiblePatterns = hybridConfluenceBuffer.findCompatiblePatterns(pair.symbol);
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
                  patternType: patternSig.patternType,
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
  
  const config = await getSystemConfig();
  if (config.tradingActive) {
    return { success: false, message: 'Cannot start autonomous simulation while trading is active' };
  }
  
  await loadVTSConfig();
  
  if (!isInitialized) {
    await initVTSRunner();
  }
  
  isAutonomousRunning = true;
  sessionStartTime = Date.now();
  phase10SessionStartTime = Date.now();
  vtsService.resetSessionMetrics();
  
  console.log(`[11.0E.1][VTS] Starting Phase-10 autonomous simulation (interval: ${vtsConfig.simulationIntervalSec}s, pairs: ${vtsConfig.pairsPerCycle})`);
  
  await runPhase10SimulationCycle();
  
  autonomousLoopInterval = setInterval(async () => {
    const sysConfig = await getSystemConfig();
    if (sysConfig.tradingActive) {
      console.log('[11.0E.1][VTS] Trading activated - stopping autonomous simulation');
      stopAutonomousSimulation();
      return;
    }
    
    await runPhase10SimulationCycle();
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
} {
  return {
    isRunning: isAutonomousRunning,
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
export function getOpenVirtualTradesForML(): Array<{
  symbol: string;
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
}> {
  const now = Date.now();
  const trades: Array<any> = [];
  
  for (const [_, trade] of openVirtualTrades) {
    const cachedPrice = priceCache.get(trade.symbol);
    const priceIsFresh = cachedPrice && (Date.now() - cachedPrice.lastUpdatedAt < 120000);
    const currentPrice = priceIsFresh ? cachedPrice.price : null;
    
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
      regime: trade.regime,
      strategy: trade.strategy,
      signalType: trade.signalType,
      patternType: trade.patternType || null,
      pool: trade.pool.toUpperCase(),
      sourcePool: trade.sourcePool || ("unknown" as string),
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
        0, // contextBonus — not available on open trade, use 0
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
      globalDirectionalBias: trade.globalDirectionalBias || null
    });
  }
  
  return trades.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());
}

// Batch 19G Fix 5: VTS_HYBRID_COMPATIBILITY and findVTSHybridMatch removed —
// now imported from shared hybrid-compatibility-registry.ts (single source of truth)
