/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.0E — Ready-to-Buy (RTB) Queue Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Manages the unified pool of high-quality, SQE-qualified signals.
 * 
 * DIRECTIVE 11.0E: FinalScore Unification
 * - ALL legacy metrics (CWQI, NGC, ProfitRate) have been PURGED
 * - Signals are ranked by FinalScore only
 * - FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)
 * 
 * Key Features:
 * 1. Accepts ALL SQE-qualified signals into unified pool
 * 2. Ranks signals by FinalScore (descending)
 * 3. Enforces uniqueness by symbol + strategy pair
 * 4. Removes stale/expired signals (TTL: 30s per-signal rolling)
 * 5. Promotes highest-FinalScore signals when TCL is active and capacity available
 * 6. FinalScore Decay: fresher signals prioritized via decayPenalty
 * 7. Per-signal rolling TTL with staggered refresh
 * 8. Explicit state transitions: active → reconfirmed → promoted → expired
 * 9. TCL synchronization barrier for atomic operations
 * 10. Enhanced deduplication via (symbol, strategy, createdAt)
 * 11. Central Clock synchronized refresh (every 30 ticks)
 * 
 * See: server/legacy/metrics_archive.ts for historical CWQI/NGC formulas
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { storage } from '../../storage';
import { 
  MIN_QUEUE_CONFIDENCE,
} from '../metrics/quality_index';
import { calculateFinalScore, calculateRegimeWeight } from '../utils/score-calculator';
import { signalQualityEvaluator, type SQEInput } from '../filters/signal_quality_evaluator';
import { isCapacityBlock, type TradingMode, type CapacityGuardrailCode } from '../../services/guardrail-policy';
import { signalLifecycleAudit } from '../audit/signal_lifecycle_audit';
import type { RtbSignal, InsertRtbSignal } from '@shared/schema';
import { tclWatchdog } from './tcl_watchdog';
import { eventBus, type PromotionEvent } from '../../lib/event-bus';
import { contextBridge } from '../../services/context-bridge';
import { centralClock, ClockTick } from '../../services/central-clock';
import { performanceMonitor } from '../diagnostics/performance_monitor';
import { normalizeInternal } from '../../markets/kraken-symbol-resolver';
import { diagnosticTrace } from '../diagnostics/trace_service';
// Directive 11.0E: fetchFreshMetrics/calculateDecayedMetric removed - using FinalScore-native logic
import { getAdaptivePoolSize } from '../../services/adaptive-pool-config';
import { poolBus } from '../../services/pool-broadcast';
// Directive 10.9A: Math Core Harmonization - Version-tracked weights (inlined calculation)
import { SCORE_WEIGHTS, SCORE_WEIGHTS_VERSION } from '../../config/score-weights.config.js';
// Directive 11.3A: Net Expectancy Standardization - Cost Model & Spread
import { getCachedCostMetrics, computeTotalRoundTripCost, computeNetGeometry } from '../math/cost-model.js';
import { getCachedSpread } from '../metrics/cost-metrics.js';
import { getNormalizedVolatility as getVolatility } from '../metrics/market-metrics.js';
// Phase 14.5: Ranking weights for cross-family signal comparison
import { computeRankingScore, normalizeNetReturn, FINAL_SCORE_GAP_OVERRIDE } from '../../config/ranking-weights.js';

// T5: Subscribe to pool size updates from RTB Refresh Service
let currentPoolSize = getAdaptivePoolSize();
poolBus.on('POOL_UPDATE', (size: number) => {
  currentPoolSize = size;
  console.log(`[8.8.4-A4.R10R-3.T5][ACT][SYNC] ReadyToBuyService updated pool=${size}`);
});

export interface RTBSignalInput {
  signalId: string;
  mode: TradingMode;
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  quantity?: number;
  notional?: number;
  confidence: number;
  atr?: number;
  blockReason: string; // The capacity guardrail that blocked this signal
  metadata?: Record<string, unknown>;
}

/**
 * Phase 8.8.4-C.5: SQE-qualified signal input for unified RTB pool
 * All signals that pass SQE go directly into the pool regardless of capacity
 * 
 * DIRECTIVE 11.0E: Legacy metrics (ngc, cwqi, profitRate) are DEPRECATED
 * Use finalScore, confidence, regimeWeight, decayPenalty instead
 */
export interface SQESignalInput {
  signalId: string;
  mode: TradingMode;
  symbol: string;
  strategy: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  quantity?: number;
  notional?: number;
  confidence: number;
  finalScore: number; // Directive 11.0E: PRIMARY ranking metric
  regimeWeight?: number; // Directive 11.0E: Market regime alignment
  decayPenalty?: number; // Directive 11.0E: Freshness penalty (replaces CWQI decay)
  hybridScore?: number; // Directive 11.0E: Combined quant+pattern score
  trendStrength?: number; // Directive 11.0E: For regime calculation
  volatility?: number; // Directive 11.0E: For regime calculation
  atr?: number;
  currentPrice?: number; // Directive 8.8.4-C.14.B: Market price at queue time
  volume24h?: number | null; // Directive 8.8.4-C.14.B: 24h USD volume (NULL if not in FX5 pool)
  metadata?: Record<string, unknown>;
  skipSelfCheck?: boolean; // Directive 8.8.4-A3.R2: Skip self-dedupe during refreshAndRank
  sourcePool?: string;    // Batch 37: Family-qualified source pool
  signalType?: 'QUANT' | 'PATTERN' | 'HYBRID';  // Phase 14.5: signal family
  assetClass?: string;                  // Phase 14.5: 'crypto_spot' default
  rankingScore?: number;                // Phase 14.5: cross-family desirability score
}

export interface RTBQueueStats {
  mode: TradingMode;
  totalQueued: number;
  avgFinalScore: number; // Directive 11.0E: Replaced avgCWQI
  oldestSignalAge: number; // seconds
  byStrategy: Record<string, number>;
  byBlockReason: Record<string, number>;
}

export interface RTBPromotionResult {
  success: boolean;
  signal?: RtbSignal;
  tradeId?: string;
  reason?: string;
}

// Directive 8.8.4-A3.R8: Immediate expiry on SQE failure (no missed refresh counter)
const RTB_REFRESH_INTERVAL_MS = 30 * 1000; // 30 seconds

// Directive 8.8.4-A3.R9.3: TTL removed - lifecycle governed by SQE results only
// const SIGNAL_TTL_MS removed per R9.3-C

// Directive 8.8.4-A3.R2: TCL Warm-Up threshold (reduced for faster activation)
const TCL_WARMUP_THRESHOLD = parseInt(process.env.TCL_SIGNAL_THRESHOLD || '15', 10);

// Directive 8.8.4-A3.R2: TCL failsafe (reduced to 2 minutes)
const TCL_FAILSAFE_MS = 2 * 60 * 1000; // 2 minutes

// Directive 11.0E: FinalScore decay configuration (replaces legacy CWQI decay)
// Decay rate λ = 0.03/min means a signal loses ~3% of its freshness bonus per minute
const FINALSCORE_DECAY_LAMBDA = parseFloat(process.env.FINALSCORE_DECAY_RATE || '0.03');
console.log(`[11.0E][CONFIG] FINALSCORE_DECAY_LAMBDA=${FINALSCORE_DECAY_LAMBDA} (per minute)`);

/**
 * Directive 11.0E: Calculate decay penalty for FinalScore
 * 
 * Decay is applied as a penalty subtracted from FinalScore (not multiplicative)
 * This creates a gentle aging effect that prioritizes fresher signals
 * 
 * Formula: decayPenalty = λ × ageMinutes (linear, simple)
 * Capped at 0.10 to prevent excessive freshness bias
 * 
 * @param queuedAt - Timestamp when signal was queued
 * @param symbol - Optional symbol for diagnostic logging
 * @returns Decay penalty value [0, 0.10]
 */
export function calculateDecayPenalty(queuedAt: Date | string, symbol?: string): number {
  const ageMs = Date.now() - new Date(queuedAt).getTime();
  const ageMinutes = ageMs / (60 * 1000);
  
  // Linear decay penalty: λ * ageMinutes, capped at 0.10
  // This creates a gentle freshness preference without over-penalizing older signals
  const rawPenalty = FINALSCORE_DECAY_LAMBDA * ageMinutes;
  const cappedPenalty = Math.min(rawPenalty, 0.10);
  
  if (symbol && rawPenalty > 0.01) {
    console.log(
      `[11.0E][DECAY_PENALTY] symbol=${symbol} ageMin=${ageMinutes.toFixed(1)} rawPenalty=${rawPenalty.toFixed(4)} cappedPenalty=${cappedPenalty.toFixed(4)}`
    );
  }
  
  return Math.round(cappedPenalty * 10000) / 10000;
}

/**
 * Directive 11.0E: Get FinalScore decay factor (for compatibility)
 * Returns 1 - decayPenalty for cases where multiplicative decay is needed
 */
export function getFinalScoreDecayFactor(ageMinutes: number): number {
  const penalty = Math.min(FINALSCORE_DECAY_LAMBDA * ageMinutes, 0.10);
  return 1 - penalty;
}

// Directive 11.3A: Geometry refresh thresholds
const GEOMETRY_VOLATILITY_SHIFT_THRESHOLD = 0.05; // 5%
const GEOMETRY_SPREAD_SHIFT_THRESHOLD = 0.05; // 5%
const GEOMETRY_MAX_AGE_MS = 180 * 1000; // 180 seconds

/**
 * Directive 11.3A: Determine if geometry should be recalculated
 * Recalculate when:
 * - Volatility shift > 5%, OR
 * - Spread shift > 5%, OR
 * - Time since last refresh > 180 seconds
 */
export function shouldRecalculateGeometry(
  signal: RtbSignal,
  currentVol: number,
  currentSpread: number
): boolean {
  const metadata = signal.metadata as Record<string, any> || {};
  const lastCostRefresh = metadata.lastCostRefresh ?? 0;
  const lastVol = metadata.volatility ?? 0.3;
  const lastSpread = metadata.spread ?? 0.001;
  
  const timeSinceRefresh = Date.now() - lastCostRefresh;
  if (timeSinceRefresh > GEOMETRY_MAX_AGE_MS) {
    return true;
  }
  
  const volShift = lastVol > 0 ? Math.abs(currentVol - lastVol) / lastVol : 0;
  if (volShift > GEOMETRY_VOLATILITY_SHIFT_THRESHOLD) {
    return true;
  }
  
  const spreadShift = lastSpread > 0 ? Math.abs(currentSpread - lastSpread) / lastSpread : 0;
  if (spreadShift > GEOMETRY_SPREAD_SHIFT_THRESHOLD) {
    return true;
  }
  
  return false;
}

/**
 * Directive 8.8.4-A3.R9.0.C (R9C-3): Normalize pair key via Kraken Symbol Resolver
 * Ensures consistent comparison and storage of trading pairs using canonical format
 * 
 * @param symbol - The trading pair (e.g., 'btc/usd', 'BTC/USD', 'XBTUSD')
 * @returns Normalized BASE/QUOTE format (e.g., 'BTC/USD')
 */
export function normalizePairKey(symbol: string): string {
  // R9C-3: Use Kraken Symbol Resolver for canonical normalization
  const startMs = Date.now();
  const canonical = normalizeInternal(symbol);
  const elapsedMs = Date.now() - startMs;
  
  // R9C-5: Track symbol resolution latency if > 1ms
  if (elapsedMs > 1) {
    performanceMonitor.recordSymbolResolutionLatency(elapsedMs);
  }
  
  return canonical;
}

// Directive 8.8.4-A3.R7: Central Clock tick interval for RTB refresh
const RTB_REFRESH_INTERVAL_SECONDS = 30;

/**
 * Directive 8.8.4-A3.R9.0.A (R9-D2): Simple hash function for uniform refresh stagger
 * Uses djb2 algorithm for fast, well-distributed hashing
 * @param str - String to hash (signal id + symbol)
 * @returns Positive integer hash value
 */
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit integer
  }
  return hash;
}

/**
 * Directive 8.8.4-A3.R9.0.A (R9-D2): Calculate stagger offset for uniform distribution
 * Distributes signal refreshes evenly across the 30-second window
 * @param signalId - Signal ID
 * @param symbol - Signal symbol
 * @returns Offset in milliseconds (0-30000)
 */
function calculateRefreshStaggerMs(signalId: string, symbol: string): number {
  const hashKey = `${signalId}${symbol}`;
  const offsetMs = Math.abs(simpleHash(hashKey)) % 30000; // 0-30s distribution
  return offsetMs;
}

/**
 * Directive 8.8.4-A4.R10R-3.T3: Chunk array into groups for concurrent processing
 * @param array - Array to chunk
 * @param size - Chunk size
 * @returns Array of chunks
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Directive 8.8.4-A4.R10R-3.T3: Signal processing result for batch operations
 */
interface SignalProcessingResult {
  type: 'update' | 'delete';
  signalId: string;
  symbol: string;
  updates?: Partial<RtbSignal>;
  reason?: string;
}

/**
 * Directive 8.8.4-A3.R9.3: Per-signal refresh state tracking
 * Replaces global batch refresh with individual signal timers
 */
interface SignalRefreshState {
  nextRefreshAt: number;  // Unix timestamp (ms) when signal should next refresh
  isRefreshing: boolean;  // Flag to prevent TCL promoting during refresh
}

class ReadyToBuyService {
  private initialized = false;
  private refreshIntervals: Map<TradingMode, NodeJS.Timeout> = new Map();
  private clockTickHandlers: Map<TradingMode, (tick: ClockTick) => void> = new Map(); // Directive A3.R7
  // Directive R9.3-A: Per-signal refresh tracking (replaces global isRefreshing)
  private signalRefreshStates: Map<string, SignalRefreshState> = new Map(); // key = signalId
  private engineStartTimes: Map<TradingMode, number> = new Map(); // Phase 8.8.4-C.6: Track engine start for TCL failsafe
  private tclFailsafeTriggered: Map<TradingMode, boolean> = new Map(); // Phase 8.8.4-C.6: Track if failsafe was triggered
  private promotionHandlerRegistered = false; // Directive 8.8.4-A1: Track handler registration
  
  constructor() {
    console.log('[RTB] Ready-to-Buy Queue Service initialized');
    this.registerPromotionHandler();
    // A3.R9.0: Start performance monitor for metrics collection
    performanceMonitor.start();
  }

  /**
   * Directive 8.8.4-A1: Register PROMOTION event handler for cleanup
   * When a signal is promoted to active trade, immediately remove it from RTB queue
   * and broadcast rtb:cleared to all clients
   */
  private registerPromotionHandler(): void {
    if (this.promotionHandlerRegistered) {
      return;
    }

    eventBus.onPromotion(async (event: PromotionEvent) => {
      try {
        console.log(`[8.8.4-A1][RTB_CLEANUP] Processing promotion event: ${event.symbol}/${event.strategy} (mode=${event.mode})`);
        
        // Remove the promoted signal from the queue by symbol/mode
        const removed = await this.removeSignalBySymbol(event.symbol, event.mode);
        
        if (removed) {
          // Broadcast rtb:cleared for the promoted symbol
          await contextBridge.broadcast({
            type: 'rtb:cleared',
            payload: {
              mode: event.mode,
              symbol: event.symbol,
              reason: 'promoted',
              timestamp: new Date().toISOString()
            },
            mode: event.mode
          });
          console.log(`[8.8.4-A1][RTB_CLEANUP] ✅ Signal ${event.symbol} removed and rtb:cleared broadcasted`);
        }
      } catch (err: any) {
        console.error(`[8.8.4-A1][RTB_CLEANUP][ERROR] Failed to cleanup promoted signal:`, err);
      }
    });

    this.promotionHandlerRegistered = true;
    console.log('[8.8.4-A1][RTB_CLEANUP] PROMOTION event handler registered');
  }

  /**
   * Directive 8.8.4-A3: Check if a pair exists in the RTB queue
   * Used for pair-level duplicate validation
   * 
   * @param symbol - The trading pair in BASE/QUOTE format (e.g., 'BTC/USD')
   * @param mode - Trading mode ('paper' or 'live')
   * @returns true if the pair exists in the RTB queue
   */
  async hasPair(symbol: string, mode: TradingMode): Promise<boolean> {
    // Directive 8.8.4-A3.R1: Normalize pair key for consistent comparison
    const normalizedSymbol = normalizePairKey(symbol);
    const signals = await storage.getRtbSignals({ mode, status: 'queued', symbol: normalizedSymbol });
    return signals.length > 0;
  }

  /**
   * Directive 8.8.4-A1: Remove a signal by symbol and mode
   * Used when a signal is promoted to an active trade
   * 
   * @param symbol - The symbol to remove (e.g., 'BTC/USD')
   * @param mode - Trading mode ('paper' or 'live')
   * @returns true if a signal was removed
   */
  async removeSignalBySymbol(symbol: string, mode: TradingMode): Promise<boolean> {
    const signals = await storage.getRtbSignals({ mode, status: 'queued' });
    const matchingSignal = signals.find(s => s.symbol === symbol);
    
    if (matchingSignal) {
      // Mark as promoted (removes from queued pool)
      await storage.updateRtbSignal(matchingSignal.id, {
        status: 'promoted',
        promotedAt: new Date()
      });
      performanceMonitor.recordQueueRemove(1);
      console.log(`[A3.R9.2][RTB] Removed signal ${symbol} (id=${matchingSignal.id}) from ${mode} queue`);
      return true;
    }
    
    return false;
  }

  /**
   * Phase 8.8.4-C.6: Set engine start time for TCL failsafe tracking
   * Called when trading engine starts
   */
  setEngineStartTime(mode: TradingMode): void {
    this.engineStartTimes.set(mode, Date.now());
    this.tclFailsafeTriggered.set(mode, false);
    console.log(`[8.8.4-C.6][TCL_FAILSAFE] Engine start time set for ${mode} mode`);
  }

  /**
   * Phase 8.8.4-C.6: Clear engine start time
   * Called when trading engine stops
   */
  clearEngineStartTime(mode: TradingMode): void {
    this.engineStartTimes.delete(mode);
    this.tclFailsafeTriggered.delete(mode);
  }

  /**
   * Directive 8.8.4-A3.R9.3-A: Per-signal refresh helpers
   */
  private getSignalRefreshState(signalId: string): SignalRefreshState {
    if (!this.signalRefreshStates.has(signalId)) {
      this.signalRefreshStates.set(signalId, {
        nextRefreshAt: Date.now() + RTB_REFRESH_INTERVAL_MS,
        isRefreshing: false
      });
    }
    return this.signalRefreshStates.get(signalId)!;
  }

  isSignalRefreshing(signalId: string): boolean {
    return this.signalRefreshStates.get(signalId)?.isRefreshing ?? false;
  }

  /**
   * Phase 8.8.4-C.5: Start the refresh cycle for a mode
   * Directive 8.8.4-A3.R9.3-A: Per-signal refresh model with Central Clock
   * Each signal refreshes independently when its timer expires
   */
  startRefreshCycle(mode: TradingMode): void {
    // Prevent duplicate subscriptions
    if (this.clockTickHandlers.has(mode)) {
      console.log(`[A3.R9.3][RTB_REFRESH] Refresh cycle already running for ${mode} mode`);
      return;
    }

    console.log(`[A3.R9.3][RTB_REFRESH] Starting per-signal refresh cycle with Central Clock for ${mode} mode`);

    // Ensure Central Clock is running
    if (!centralClock.getIsRunning()) {
      centralClock.start();
      console.log(`[A3.R9.3][RTB_REFRESH] Started Central Clock`);
    }

    // R9.3-A: Subscribe to Central Clock - check each second for signals due for refresh
    const tickHandler = async (tick: ClockTick) => {
      // R9.3-A: Every 30 seconds, trigger refresh cycle
      if (tick.tickNumber <= 0 || tick.tickNumber % RTB_REFRESH_INTERVAL_SECONDS !== 0) return;

      console.log(`[A3.R9.3][RTB_REFRESH][TICK] mode=${mode} tickNumber=${tick.tickNumber} drift=${tick.drift}ms`);
      
      // R9.3-A/R9.3-B: Execute refresh with per-signal error handling
      await this.executePerSignalRefresh(mode);
    };

    this.clockTickHandlers.set(mode, tickHandler);
    centralClock.subscribe(`RTB_${mode}`, tickHandler);
    console.log(`[A3.R9.3][RTB_REFRESH] ✅ Subscribed to Central Clock for ${mode} mode`);
  }

  /**
   * Phase 8.8.4-C.5: Stop the refresh cycle for a mode
   * Directive 8.8.4-A3.R7: Unsubscribe from Central Clock
   */
  stopRefreshCycle(mode: TradingMode): void {
    // Unsubscribe from Central Clock
    if (this.clockTickHandlers.has(mode)) {
      centralClock.unsubscribe(`RTB_${mode}`);
      this.clockTickHandlers.delete(mode);
      console.log(`[A3.R9.3][RTB_REFRESH] Stopped refresh cycle for ${mode} mode`);
    }

    // Also clean up legacy intervals if present
    const interval = this.refreshIntervals.get(mode);
    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(mode);
    }
    
    // R9.3-A: Clear signal refresh states for this mode
    // Note: In a full implementation, we'd filter by mode, but signalIds are global
  }

  /**
   * Directive 8.8.4-A3.R9.3-A: Per-signal refresh with try/finally error handling (R9.3-B)
   */
  private async executePerSignalRefresh(mode: TradingMode): Promise<void> {
    // Check if engine is active
    const systemContext = await storage.getSystemContext(mode);
    if (!systemContext?.isEngineActive) {
      return; // Skip refresh when engine is inactive
    }

    const startTime = Date.now();
    const signals = await this.getQueuedSignals(mode);
    
    if (signals.length === 0) {
      console.log(`[A3.R9.3][RTB_REFRESH] mode=${mode} no signals to refresh`);
      // R9.3-D: Check TCL after refresh (no barrier)
      await tclWatchdog.checkSignalThresholdLive(mode);
      return;
    }

    let reconfirmedCount = 0;
    let expiredCount = 0;

    // R9.3-A: Process each signal individually with try/finally (R9.3-B)
    for (const signal of signals) {
      const signalState = this.getSignalRefreshState(signal.signalId);
      
      // R9.3-B: Set isRefreshing flag and ensure it's reset in finally
      signalState.isRefreshing = true;
      
      try {
        const result = await this.refreshSingleSignal(signal, mode);
        if (result.passed) {
          reconfirmedCount++;
        } else {
          expiredCount++;
        }
        
        // R9.3-A: Update next refresh time
        signalState.nextRefreshAt = Date.now() + RTB_REFRESH_INTERVAL_MS;
        
      } catch (error) {
        console.error(`[A3.R9.3][REFRESH_ERROR] signal=${signal.signalId}:`, error);
        // R9.3-B: Error doesn't block other signals
      } finally {
        // R9.3-B: Always reset isRefreshing
        signalState.isRefreshing = false;
      }
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`[A3.R9.3][REFRESH_COMPLETE] mode=${mode} reconfirmed=${reconfirmedCount} expired=${expiredCount} elapsed=${elapsedMs}ms`);
    
    // Broadcast update
    await contextBridge.broadcast({
      type: 'rtb:updated',
      payload: { mode, timestamp: new Date().toISOString(), reconfirmedCount, expiredCount },
      mode
    });

    // R9.3-D: Check TCL after refresh (no barrier)
    await tclWatchdog.checkSignalThresholdLive(mode);
  }

  /**
   * Directive 11.0E: Refresh a single signal using FinalScore-native logic
   * Directive 11.3A: Enhanced with conditional geometry refresh
   * Legacy CWQI/NGC metrics removed, replaced with FinalScore/decayPenalty
   */
  private async refreshSingleSignal(signal: RtbSignal, mode: TradingMode): Promise<{ passed: boolean }> {
    const normalizedSymbol = normalizePairKey(signal.symbol);
    const now = new Date();
    
    // Directive 11.0E: Extract FinalScore-native metrics from signal
    const metadata = signal.metadata as Record<string, any> || {};
    const confidence = parseFloat(signal.confidence || '0.5');
    const originalFinalScore = metadata.finalScore ?? parseFloat(signal.finalScore || '0.5');
    const hybridScore = metadata.hybridScore ?? confidence;
    const regimeWeight = metadata.regimeWeight ?? 0.5;
    
    // Directive 11.3A: Conditional geometry refresh
    const currentSpread = getCachedSpread(normalizedSymbol);
    const currentVol = getVolatility(normalizedSymbol);
    let netExpectedEdge = metadata.netExpectedEdge;
    let geometryRefreshed = false;
    
    if (shouldRecalculateGeometry(signal, currentVol, currentSpread)) {
      const costMetrics = getCachedCostMetrics(normalizedSymbol);
      const entryPrice = parseFloat(signal.entryPrice?.toString() || '0');
      const stopPrice = parseFloat(signal.stopPrice?.toString() || '0');
      const targetPrice = parseFloat(signal.targetPrice?.toString() || '0');
      
      if (entryPrice > 0 && stopPrice > 0 && targetPrice > 0) {
        const geometry = computeNetGeometry(entryPrice, stopPrice, targetPrice, costMetrics);
        netExpectedEdge = geometry.netExpectedEdge;
        geometryRefreshed = true;
        console.log(`[11.3A][GEOMETRY_REFRESH] ${normalizedSymbol}: netEdge=${(netExpectedEdge * 100).toFixed(3)}%`);
      }
    }
    
    // Directive 11.0E: Calculate decay penalty based on signal age
    const decayPenalty = calculateDecayPenalty(signal.queuedAt, normalizedSymbol);
    
    // Directive 11.0E: Recalculate FinalScore with decay applied
    const W = SCORE_WEIGHTS.FINAL_SCORE;
    const refreshedFinalScore = Math.max(0, Math.min(1,
      (hybridScore ?? 0) * W.HYBRID +
      (confidence ?? 0) * W.CONFIDENCE +
      (regimeWeight ?? 0) * W.REGIME -
      (decayPenalty ?? 0) * W.DECAY
    ));
    
    // Phase 14: SQE revalidation — pass pre-computed FinalScore/RegimeWeight (no backfill)
    const sqeInput: SQEInput = {
      signalId: signal.signalId,
      symbol: normalizedSymbol,
      strategy: signal.strategy,
      mode,
      confidence: confidence,
      finalScore: refreshedFinalScore,
      regimeWeight: regimeWeight,
      trendStrength: metadata.trendStrength ?? 0.5,
      volatility: currentVol,
    };
    
    const sqeResult = await signalQualityEvaluator.evaluate(sqeInput);
    
    if (!sqeResult.passed) {
      await storage.deleteRtbSignals({ mode, id: signal.id });
      performanceMonitor.recordQueueRemove(1);
      console.log(`[11.0E][REFRESH_COMPLETE] symbol=${normalizedSymbol} DELETED reason=${sqeResult.reason}`);
      
      this.signalRefreshStates.delete(signal.signalId);
      return { passed: false };
    }
    
    // Directive 11.0E + 11.3A: Update signal with FinalScore-native metrics + net geometry
    await storage.updateRtbSignal(signal.id, {
      status: 'reconfirmed',
      confidence: confidence.toString(),
      finalScore: refreshedFinalScore.toString(),
      lastRefreshedAt: now,
      metadata: {
        ...metadata,
        lastReconfirmedAt: now.toISOString(),
        originalFinalScore: originalFinalScore.toString(),
        decayPenalty: decayPenalty,
        hybridScore: hybridScore,
        regimeWeight: regimeWeight,
        // Directive 11.3A: Net geometry fields
        netExpectedEdge: netExpectedEdge,
        volatility: currentVol,
        spread: currentSpread,
        lastCostRefresh: geometryRefreshed ? Date.now() : (metadata.lastCostRefresh ?? 0),
      }
    });
    
    console.log(`[11.0E][REFRESH_COMPLETE] symbol=${normalizedSymbol} RECONFIRMED FinalScore=${refreshedFinalScore.toFixed(4)} decayPenalty=${decayPenalty.toFixed(4)}${geometryRefreshed ? ' (geometry refreshed)' : ''}`);
    return { passed: true };
  }

  /**
   * Phase 8.8.4-C.5: Execute a single refresh cycle
   * - Cleans up expired signals
   * - Re-evaluates queue quality
   * - Logs pool status
   * 
   * Directive 8.8.4-A1-Extended: Also triggers refreshAndRank for dynamic re-ranking
   * Directive 8.8.4-A3.R1: Only runs when engine is active for this mode
   */
  private async executeRefreshCycle(mode: TradingMode): Promise<void> {
    // Directive 8.8.4-A3.R1: Engine-aware refresh control
    // Only run refresh cycle when trading engine is active for this mode
    const systemContext = await storage.getSystemContext(mode);
    if (!systemContext?.isEngineActive) {
      return; // Skip refresh when engine is inactive (passive learning mode)
    }
    
    const startTime = Date.now();
    
    // Step 1: Clean up expired signals
    const expiredCount = await this.cleanupExpiredSignals(mode);
    
    // Step 2: Re-evaluate remaining signals
    const { removed, remaining } = await this.reEvaluateQueue(mode);
    
    // Step 3: Directive 8.8.4-A1-Extended: Refresh and re-rank signals by CWQI
    await this.refreshAndRank(mode);
    
    // Step 4: Get TCL status
    const tclStatus = await this.getTCLStatus(mode);
    
    const elapsedMs = Date.now() - startTime;
    
    console.log(
      `[8.8.4-C.5][RTB_REFRESH] mode=${mode}, expired=${expiredCount}, removed=${removed}, ` +
      `remaining=${remaining}, poolSize=${tclStatus.poolSize}, TCL=${tclStatus.isActive ? 'ACTIVE' : 'WARMING'} ` +
      `(${tclStatus.progressPercent.toFixed(1)}%), elapsed=${elapsedMs}ms`
    );
    
    // Directive 8.8.4-A3.R9.0: Synchronize TCL promotion events with live query
    // Check signal threshold AFTER executeRefreshCycle() and cleanupExpiredSignals()
    // Uses live database query instead of cached snapshot
    // Only check if refresh is complete (barrier respected)
    if (tclStatus.poolSize > 0 && this.isRefreshComplete(mode)) {
      await tclWatchdog.checkSignalThresholdLive(mode, true);
      console.log(`[A3.R9.2][TCL_SYNC] TCL threshold check after refresh (live query): poolSize=${tclStatus.poolSize}`);
    }
  }

  /**
   * Directive 11.0E: Refresh and dynamically re-rank RTB signals using FinalScore
   * 
   * Per-signal rolling TTL refresh (30s per signal):
   * 1. Check individual signal expiry based on its own TTL
   * 2. Calculate decayPenalty based on signal age (fresher signals rank higher)
   * 3. Recalculate FinalScore with decay applied
   * 4. Re-validate signals through SQE (FinalScore/RegimeWeight only)
   * 5. Immediate deletion on SQE failure
   * 6. Update status to 'reconfirmed' on successful refresh with FinalScore-native metrics
   * 7. Broadcast rtb:updated to clients for UI refresh
   * 
   * @param mode - Trading mode ('paper' or 'live')
   * @param bucketSignalKeys - Optional set of signal keys (mode:symbol:strategy) to filter
   *                           If provided, only processes signals matching these keys
   */
  async refreshAndRank(mode: TradingMode, bucketSignalKeys?: Set<string>): Promise<void> {
    const startTime = Date.now();
    
    // A3.R9.0: Set refresh incomplete flag for TCL sync barrier
    this.setRefreshComplete(mode, false);
    
    try {
      let signals = await this.getQueuedSignals(mode);
      
      // R3: Filter to bucket-specific signals if keys provided
      if (bucketSignalKeys && bucketSignalKeys.size > 0) {
        const originalCount = signals.length;
        signals = signals.filter(s => {
          const signalKey = `${mode}:${s.symbol}:${s.strategy}`;
          return bucketSignalKeys.has(signalKey);
        });
        console.log(`[A4.R10R-3.R3][RTBRefresh][BUCKET_FILTER] mode=${mode} total=${originalCount} bucketFiltered=${signals.length}`);
      }
      
      if (signals.length === 0) {
        console.log(`[A3.R9.2][RTB_REFRESH] mode=${mode} no signals to refresh`);
        this.setRefreshComplete(mode, true);
        return;
      }

      // Directive 8.8.4-A3.R8.5: Deduplicate during refresh
      // Track seen symbol+strategy pairs to prevent duplicates in the pool
      const seenPairs = new Set<string>();
      const deduplicatedSignals: typeof signals = [];
      let duplicateCount = 0;
      
      for (const signal of signals) {
        // A3.R9.0: Enhanced dedup key includes createdAt timestamp bucket (minute-level)
        const createdAtBucket = signal.queuedAt 
          ? new Date(signal.queuedAt).toISOString().substring(0, 16) // YYYY-MM-DDTHH:MM
          : 'unknown';
        // Directive A3.R9.0.C: Normalize symbol via Kraken Resolver for consistent comparisons
        const normalizedSymbol = normalizePairKey(signal.symbol);
        const pairKey = `${normalizedSymbol}:${signal.strategy}`;
        const fullDedupKey = `${pairKey}:${createdAtBucket}`;
        
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          deduplicatedSignals.push(signal);
        } else {
          // A3.R9.0: Delete older duplicates immediately (not just mark expired)
          await storage.deleteRtbSignals({ mode, id: signal.id });
          duplicateCount++;
          performanceMonitor.recordQueueRemove(1);
          console.log(`[A3.R9.2][RTB_DEDUP] Deleted duplicate ${pairKey} id=${signal.id}`);
        }
      }
      
      if (duplicateCount > 0) {
        console.log(`[A3.R9.2][RTB_DEDUP] mode=${mode} deleted=${duplicateCount} duplicates, remaining=${deduplicatedSignals.length}`);
      }

      // Directive 8.8.4-A4.R10R-3.T3/T4/T5: Concurrent processing with batched DB writes and adaptive pool
      const now = new Date();
      const statusUpdatedAt = now.toISOString();
      
      // T5: Use broadcast-synced pool size (falls back to getAdaptivePoolSize if not yet received)
      const POOL_SIZE = currentPoolSize > 0 ? currentPoolSize : getAdaptivePoolSize();
      console.log(`[8.8.4-A4.R10R-3.T5][RTBRefresh][POOL_USE] poolSize=${POOL_SIZE} signals=${deduplicatedSignals.length}`);
      const cycleStart = performance.now();
      
      // Collect batch operations for efficient DB writes
      const bulkUpdates: Array<{ id: string; updates: Partial<RtbSignal> }> = [];
      const bulkDeletes: string[] = [];
      let reconfirmedCount = 0;
      let expiredCount = 0;
      
      // Process signals in concurrent chunks
      const chunks = chunkArray(deduplicatedSignals, POOL_SIZE);
      
      for (const group of chunks) {
        await Promise.all(
          group.map(async (signal) => {
            try {
              // Directive 11.0E: Normalize symbol for consistent comparisons
              const normalizedSymbol = normalizePairKey(signal.symbol);
              
              // Directive 11.0E: Extract FinalScore-native metrics
              const metadata = signal.metadata as Record<string, any> || {};
              const confidence = parseFloat(signal.confidence || '0.5');
              const originalFinalScore = metadata.finalScore ?? parseFloat(signal.finalScore || '0.5');
              const hybridScore = metadata.hybridScore ?? confidence;
              const regimeWeight = metadata.regimeWeight ?? 0.5;
              
              const queuedAt = signal.queuedAt;
              const oldStatus = signal.status || 'active';
              
              // Directive 11.0E: Calculate decay penalty (replaces CWQI decay)
              const decayPenalty = calculateDecayPenalty(queuedAt, normalizedSymbol);
              
              // Directive 11.0E: Recalculate FinalScore with decay applied
              const W = SCORE_WEIGHTS.FINAL_SCORE;
              const refreshedFinalScore = Math.max(0, Math.min(1,
                (hybridScore ?? 0) * W.HYBRID +
                (confidence ?? 0) * W.CONFIDENCE +
                (regimeWeight ?? 0) * W.REGIME -
                (decayPenalty ?? 0) * W.DECAY
              ));
              
              // Phase 14: SQE revalidation — pass pre-computed FinalScore/RegimeWeight (no backfill)
              const sqeInput: SQEInput = {
                signalId: signal.signalId,
                symbol: normalizedSymbol,
                strategy: signal.strategy,
                mode,
                confidence: confidence,
                finalScore: refreshedFinalScore,
                regimeWeight: regimeWeight,
                trendStrength: metadata.trendStrength ?? 0.5,
                volatility: metadata.volatility ?? 0.3,
              };
              
              const sqeResult = await signalQualityEvaluator.evaluate(sqeInput);
              
              if (!sqeResult.passed) {
                console.log(`[11.0E][SQE_REVALIDATION_FAIL] symbol=${normalizedSymbol} reason=${sqeResult.reason}`);
                this.logRtbTrace(mode, normalizedSymbol, signal.strategy, oldStatus, 'deleted', 'SQE_failure');
                this.logSqeRejection(signal, sqeResult.reason || 'unknown', confidence, refreshedFinalScore);
                bulkDeletes.push(signal.id);
                expiredCount++;
                return;
              }
              
              // Directive 11.0E: Queue update with FinalScore-native metrics
              bulkUpdates.push({
                id: signal.id,
                updates: {
                  status: 'reconfirmed',
                  confidence: confidence.toString(),
                  finalScore: refreshedFinalScore.toString(),
                  lastRefreshedAt: now,
                  metadata: {
                    ...metadata,
                    lastReconfirmedAt: statusUpdatedAt,
                    statusUpdatedAt,
                    originalFinalScore: originalFinalScore.toString(),
                    hybridScore: hybridScore,
                    regimeWeight: regimeWeight,
                    decayPenalty: decayPenalty,
                  }
                }
              });
              
              this.logRtbTrace(mode, normalizedSymbol, signal.strategy, oldStatus, 'reconfirmed', 'refresh');
              console.log(`[11.0E][RECONFIRM_COMPLETE] pair=${normalizedSymbol} ${oldStatus}→reconfirmed FinalScore=${refreshedFinalScore.toFixed(4)} decayPenalty=${decayPenalty.toFixed(4)}`);
              reconfirmedCount++;
            } catch (err) {
              console.error(`[T3][SIGNAL_PROCESS_ERROR] signal=${signal.id}:`, err);
              bulkDeletes.push(signal.id);
              expiredCount++;
            }
          })
        );
      }
      
      // T3: Batch database operations
      if (bulkDeletes.length > 0) {
        const deleted = await storage.deleteRtbSignalsByIds(bulkDeletes);
        performanceMonitor.recordQueueRemove(deleted);
        console.log(`[T3][BATCH_DELETE] deleted=${deleted} signals`);
      }
      
      if (bulkUpdates.length > 0) {
        const updated = await storage.updateRtbSignalsBatch(bulkUpdates);
        console.log(`[T3][BATCH_UPDATE] updated=${updated} signals`);
      }
      
      // T3 Metrics: End timing
      const duration = performance.now() - cycleStart;
      console.log(`[8.8.4-A4.R10R-3.T3][RTBRefresh][METRICS] duration=${duration.toFixed(2)}ms`)

      // A3.R8.5 FIX: Use deduplicatedSignals count, not original signals count
      await contextBridge.broadcast({
        type: 'rtb:updated',
        payload: {
          mode,
          timestamp: now.toISOString(),
          signalCount: deduplicatedSignals.length,
          reconfirmedCount,
          expiredCount,
          duplicatesRemoved: duplicateCount
        },
        mode
      });

      const elapsedMs = Date.now() - startTime;
      
      // A3.R9.2: Report remaining from deduplicated set minus expired
      console.log(`[A3.R9.2][RTB_REFRESH] mode=${mode} reconfirmed=${reconfirmedCount} expired=${expiredCount} duplicates=${duplicateCount} remaining=${deduplicatedSignals.length - expiredCount} elapsed=${elapsedMs}ms`);
      
      // A3.R9.2: Record metrics for performance monitoring
      performanceMonitor.recordRTBRefresh(elapsedMs, reconfirmedCount, expiredCount);
      
      // A3.R9.2: Set refresh complete flag to release TCL barrier
      this.setRefreshComplete(mode, true);
      
      // A3.R9.2: Check TCL threshold now that refresh is complete (barrier released)
      await tclWatchdog.checkSignalThresholdLive(mode, this.isRefreshComplete(mode));
      
    } catch (error) {
      console.error(`[A3.R9.2][RTB_REFRESH][ERROR] mode=${mode}:`, error);
      // A3.R9.2: On error, keep barrier closed - TCL should NOT proceed during failed refresh
      // The next refresh cycle will retry and properly complete
      // This prevents TCL from activating on potentially corrupt/incomplete state
      console.log(`[A3.R9.2][TCL_SYNC] Refresh failed for ${mode}, barrier remains CLOSED until next cycle`);
    }
  }

  /**
   * Directive A3.R9.3-D: Legacy barrier methods - kept for backwards compatibility
   * R9.3-D removes the global barrier concept. These methods now always return true.
   * Per-signal refresh tracking is handled via signalRefreshStates.
   */
  private refreshComplete: Map<TradingMode, boolean> = new Map();
  
  isRefreshComplete(_mode: TradingMode): boolean {
    // R9.3-D: Global barrier removed - always return true
    // Per-signal refresh state is tracked via isSignalRefreshing()
    return true;
  }
  
  setRefreshComplete(_mode: TradingMode, _complete: boolean): void {
    // R9.3-D: No-op - global barrier removed
    // Per-signal refresh state is tracked via signalRefreshStates
  }

  /**
   * Directive 8.8.4-A3.R8: Log RTB trace event to persistent file
   * Tracks all status transitions for observability
   */
  private logRtbTrace(mode: TradingMode, symbol: string, strategy: string, oldStatus: string, newStatus: string, trigger: string): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), 'logs');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString();
      const dateStr = timestamp.split('T')[0].replace(/-/g, '');
      const logEntry = {
        timestamp,
        mode,
        symbol,
        strategy,
        oldStatus,
        newStatus,
        trigger
      };
      
      const logPath = path.join(logDir, `rtb_refresh_trace_${dateStr}.log`);
      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      // Silent fail - diagnostic logging should not break refresh cycle
    }
  }

  /**
   * Directive 8.8.4-A3.R2: Log SQE rejection to diagnostic file
   */
  private logSqeRejection(signal: RtbSignal, reason: string, ngc: number, cwqi: number): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), 'logs', 'diagnostics');
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        symbol: signal.symbol,
        strategy: signal.strategy,
        ngc: ngc.toFixed(4),
        cwqi: cwqi.toFixed(4),
        reason,
        signalId: signal.signalId
      };
      
      const logPath = path.join(logDir, 'sqe_rejections.log');
      fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    } catch (err) {
      // Silent fail - diagnostic logging should not break refresh cycle
    }
  }

  /**
   * Phase 8.8.4-C.5: Check if refresh cycle is running for a mode
   */
  isRefreshCycleRunning(mode: TradingMode): boolean {
    return this.refreshIntervals.has(mode);
  }

  /**
   * Queue a signal that was blocked by a capacity constraint
   * 
   * @param input - Signal data to queue
   * @returns The queued signal record or null if rejected
   */
  async queueSignal(input: RTBSignalInput): Promise<RtbSignal | null> {
    // Validate this is a capacity block (not quality block)
    if (!isCapacityBlock(input.blockReason)) {
      console.log(`[RTB] Rejecting signal ${input.symbol}/${input.strategy} - ${input.blockReason} is a QUALITY block, not CAPACITY`);
      return null;
    }

    // Check minimum confidence threshold
    if (input.confidence < MIN_QUEUE_CONFIDENCE) {
      console.log(`[RTB] Rejecting signal ${input.symbol}/${input.strategy} - confidence ${input.confidence.toFixed(2)} below threshold ${MIN_QUEUE_CONFIDENCE}`);
      return null;
    }

    // Directive 11.0E: Calculate FinalScore instead of CWQI
    const finalScore = calculateFinalScore({
      confidence: input.confidence,
      hybridScore: input.confidence, // Use confidence as hybrid score for capacity-blocked signals
      regimeWeight: 0.5, // Default regime weight
      decayPenalty: 0, // No decay for new signals
    });

    // Phase 14.1 HF8 (B1): Duplicate FinalScore check REMOVED — SQE already enforces FinalScore >= 0.35
    // (signal_quality_evaluator.ts line 130). Signals reaching RTB have already passed SQE.
    console.log(`[11.0E][RTB] Processing signal ${input.symbol}/${input.strategy} - FinalScore ${finalScore.toFixed(4)}`);

    const now = new Date();
    // R9.3-C: TTL removed - lifecycle governed by SQE results only

    // Check for existing queued signal with same symbol+strategy
    const existingSignal = await this.getQueuedSignal(input.mode, input.symbol, input.strategy);
    
    if (existingSignal) {
      // Directive 11.0E: Compare by FinalScore instead of CWQI
      const existingFinalScore = parseFloat(existingSignal.finalScore || existingSignal.cwqi || '0');
      if (existingFinalScore >= finalScore) {
        console.log(`[11.0E][RTB] Keeping existing signal ${input.symbol}/${input.strategy} with FinalScore ${existingFinalScore.toFixed(4)} >= new ${finalScore.toFixed(4)}`);
        return existingSignal;
      }
      
      // New signal is better - expire the old one
      await this.expireSignal(existingSignal.id, 'Replaced by higher-FinalScore signal');
    }

    // Directive 11.0E: Calculate simple risk score from stop distance
    const riskScore = input.stopPrice > 0 
      ? Math.min(1, Math.abs(input.entryPrice - input.stopPrice) / input.entryPrice * 10)
      : 0.5;

    // Insert new signal
    const insertData: InsertRtbSignal = {
      mode: input.mode,
      signalId: input.signalId,
      symbol: input.symbol,
      strategy: input.strategy as any,
      entryPrice: input.entryPrice.toString(),
      stopPrice: input.stopPrice.toString(),
      targetPrice: input.targetPrice?.toString(),
      quantity: input.quantity?.toString(),
      notional: input.notional?.toString(),
      confidence: input.confidence.toString(),
      riskScore: riskScore.toString(),
      expectedReturn: '0.15', // Default expected return
      cwqi: finalScore.toString(), // Directive 11.0E: Store FinalScore in cwqi field for compatibility
      finalScore: finalScore.toString(), // Directive 11.0E: New field
      status: 'queued',
      queuedAt: now,
      // R9.3-C: expiresAt removed - lifecycle governed by SQE
      blockReason: input.blockReason,
      metadata: input.metadata as any,
    };

    // Phase 8.8.4-C.13.B: Use upsert to prevent duplicate key errors
    const signal = await storage.upsertRtbSignal(insertData);

    // Record SLAL QUEUED event
    signalLifecycleAudit.recordQueued(
      input.signalId,
      input.mode,
      input.symbol,
      input.strategy,
      {
        cwqi: finalScore, // Directive 11.0E: FinalScore stored for compatibility
        finalScore,
        blockReason: input.blockReason,
      }
    );

    console.log(`[11.0E][RTB] Queued signal ${input.symbol}/${input.strategy} with FinalScore ${finalScore.toFixed(4)}`);
    
    return signal;
  }

  /**
   * Directive 11.0E: Get the highest-FinalScore queued signal for a mode
   * Uses FinalScore as primary ranking metric (replaces CWQI)
   */
  async getTopSignal(mode: TradingMode): Promise<RtbSignal | null> {
    const signals = await storage.getRtbSignals({ mode, status: 'queued' });
    if (signals.length === 0) return null;

    let bestSignal: RtbSignal | null = null;
    let bestRankingScore = -1;

    for (const signal of signals) {
      const signalFinalScore = parseFloat(signal.finalScore || signal.cwqi || '0');

      // Phase 14.5: Use rankingScore from metadata if available, otherwise fall back to FinalScore
      const metadata = signal.metadata as Record<string, unknown> | null;
      let signalRankingScore = (metadata?.rankingScore as number) ?? signalFinalScore;

      // Phase 14.5: FinalScore gap safety rule
      // If gap > 0.10, FinalScore always wins (prevents return-magnitude gaming)
      if (bestSignal) {
        const bestFinalScore = parseFloat(bestSignal.finalScore || bestSignal.cwqi || '0');
        const gap = Math.abs(signalFinalScore - bestFinalScore);
        if (gap > FINAL_SCORE_GAP_OVERRIDE) {
          // Large quality gap — use FinalScore directly
          signalRankingScore = signalFinalScore;
        }
      }

      if (signalRankingScore > bestRankingScore) {
        bestRankingScore = signalRankingScore;
        bestSignal = signal;
      }
    }

    if (bestSignal) {
      const ageMinutes = bestSignal.queuedAt
        ? ((Date.now() - new Date(bestSignal.queuedAt).getTime()) / 60000).toFixed(1)
        : 'unknown';
      console.log(`[RTB] Top signal: ${bestSignal.symbol} ${bestSignal.strategy} rankingScore=${bestRankingScore.toFixed(4)} age=${ageMinutes}min`);
    }

    return bestSignal;
  }

  /**
   * Directive 11.0E: Shadow Mode Ranking Test
   * Compares FinalScore and CWQI rankings to verify correlation
   * This is a guardrail to ensure ranking consistency before full CWQI removal
   * 
   * @returns Correlation coefficient (-1 to 1) and detailed comparison
   */
  async runShadowRankingTest(mode: TradingMode): Promise<{
    correlation: number;
    totalSignals: number;
    rankingMatches: number;
    mismatchDetails: Array<{ symbol: string; cwqiRank: number; finalScoreRank: number }>;
    verdict: 'PASS' | 'WARN' | 'FAIL';
  }> {
    const signals = await storage.getRtbSignals({ mode, status: 'queued' });
    
    if (signals.length < 3) {
      return { 
        correlation: 1, 
        totalSignals: signals.length, 
        rankingMatches: signals.length,
        mismatchDetails: [],
        verdict: 'PASS'
      };
    }

    // Rank by CWQI (legacy)
    const cwqiRanked = [...signals].sort((a, b) => 
      parseFloat(b.cwqi || '0') - parseFloat(a.cwqi || '0')
    );
    
    // Rank by FinalScore (new)
    const finalScoreRanked = [...signals].sort((a, b) => 
      parseFloat(b.finalScore || b.cwqi || '0') - parseFloat(a.finalScore || a.cwqi || '0')
    );

    // Build rank maps
    const cwqiRankMap = new Map<string, number>();
    const finalScoreRankMap = new Map<string, number>();
    
    cwqiRanked.forEach((s, i) => cwqiRankMap.set(s.signalId, i + 1));
    finalScoreRanked.forEach((s, i) => finalScoreRankMap.set(s.signalId, i + 1));

    // Calculate Spearman rank correlation
    let sumDiffSquared = 0;
    const mismatchDetails: Array<{ symbol: string; cwqiRank: number; finalScoreRank: number }> = [];
    let rankingMatches = 0;

    for (const signal of signals) {
      const cwqiRank = cwqiRankMap.get(signal.signalId) || 0;
      const finalScoreRank = finalScoreRankMap.get(signal.signalId) || 0;
      const diff = cwqiRank - finalScoreRank;
      sumDiffSquared += diff * diff;
      
      if (cwqiRank === finalScoreRank) {
        rankingMatches++;
      } else if (Math.abs(diff) > 2) {
        mismatchDetails.push({ symbol: signal.symbol, cwqiRank, finalScoreRank });
      }
    }

    const n = signals.length;
    const correlation = 1 - (6 * sumDiffSquared) / (n * (n * n - 1));

    // Verdict based on correlation threshold
    let verdict: 'PASS' | 'WARN' | 'FAIL';
    if (correlation >= 0.85) {
      verdict = 'PASS';
    } else if (correlation >= 0.70) {
      verdict = 'WARN';
    } else {
      verdict = 'FAIL';
    }

    console.log(
      `[11.0E][SHADOW_RANKING_TEST] mode=${mode} signals=${n} correlation=${correlation.toFixed(4)} ` +
      `matches=${rankingMatches}/${n} mismatches=${mismatchDetails.length} verdict=${verdict}`
    );

    return { correlation, totalSignals: n, rankingMatches, mismatchDetails, verdict };
  }

  /**
   * Get a specific queued signal by symbol+strategy
   */
  async getQueuedSignal(mode: TradingMode, symbol: string, strategy: string): Promise<RtbSignal | null> {
    const signals = await storage.getRtbSignals({
      mode,
      status: 'queued',
      symbol,
      strategy: strategy as any,
      limit: 1,
    });
    
    return signals[0] || null;
  }

  /**
   * Get all queued signals for a mode
   * Directive 8.8.4-A3.R8: Include both 'active' and 'reconfirmed' statuses
   */
  async getQueuedSignals(mode: TradingMode): Promise<RtbSignal[]> {
    // Get active signals (newly inserted, pending first refresh)
    const activeSignals = await storage.getRtbSignals({
      mode,
      status: 'active',
      orderBy: 'cwqi',
      orderDir: 'desc',
    });
    
    // Get reconfirmed signals (passed at least one refresh)
    const reconfirmedSignals = await storage.getRtbSignals({
      mode,
      status: 'reconfirmed',
      orderBy: 'cwqi',
      orderDir: 'desc',
    });
    
    // Also include legacy 'queued' status for backward compatibility
    const queuedSignals = await storage.getRtbSignals({
      mode,
      status: 'queued',
      orderBy: 'cwqi',
      orderDir: 'desc',
    });
    
    // Directive 10.9: Sort by finalScore (if available), fallback to CWQI
    const allSignals = [...activeSignals, ...reconfirmedSignals, ...queuedSignals];
    allSignals.sort((a, b) => {
      const aMetadata = (a.metadata as Record<string, any>) || {};
      const bMetadata = (b.metadata as Record<string, any>) || {};
      const aFinalScore = aMetadata.finalScore ?? parseFloat(a.cwqi || '0');
      const bFinalScore = bMetadata.finalScore ?? parseFloat(b.cwqi || '0');
      return bFinalScore - aFinalScore;
    });
    
    return allSignals;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(mode: TradingMode): Promise<RTBQueueStats> {
    const signals = await this.getQueuedSignals(mode);
    
    const byStrategy: Record<string, number> = {};
    const byBlockReason: Record<string, number> = {};
    let totalCWQI = 0;
    let oldestAge = 0;
    const now = Date.now();

    for (const signal of signals) {
      const strategy = signal.strategy;
      byStrategy[strategy] = (byStrategy[strategy] || 0) + 1;
      
      const blockReason = signal.blockReason || 'UNKNOWN';
      byBlockReason[blockReason] = (byBlockReason[blockReason] || 0) + 1;
      
      totalCWQI += parseFloat(signal.cwqi);
      
      const age = (now - new Date(signal.queuedAt).getTime()) / 1000;
      if (age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      mode,
      totalQueued: signals.length,
      avgCWQI: signals.length > 0 ? totalCWQI / signals.length : 0,
      oldestSignalAge: Math.round(oldestAge),
      byStrategy,
      byBlockReason,
    };
  }

  /**
   * Directive 8.8.4-A3.R8.4.A: Immediately delete signal on expiry
   * Amendment: No longer marks as 'expired' - deletes immediately
   */
  async expireSignal(signalId: string, reason?: string): Promise<void> {
    const signal = await storage.getRtbSignalById(signalId);
    
    if (!signal) {
      console.warn(`[RTB] Cannot expire - signal ${signalId} not found`);
      return;
    }
    
    // A3.R9.0.C: Normalize symbol for consistent logging
    const normalizedSymbol = normalizePairKey(signal.symbol);
    
    // A3.R9.0: Immediately delete instead of marking expired
    await storage.deleteRtbSignals({
      mode: signal.mode as 'live' | 'paper',
      id: signal.id
    });
    performanceMonitor.recordQueueRemove(1);
    
    console.log(`[A3.R9.2][RTB] Deleted signal ${normalizedSymbol}/${signal.strategy}: ${reason || 'expired'}`);
  }

  /**
   * Promote a signal from queue to execution
   * Directive 8.8.4-A3.R8: Log trace and delete signal after promotion
   * Directive 8.8.4-A3.R9.2-D: Atomic promotion - defer RTB removal until trade creation confirmed
   * Directive A3.R9.0.C: Normalize symbols for consistent comparisons
   * 
   * IMPORTANT: This method should ONLY be called AFTER trade creation succeeds.
   * The tradeId parameter confirms the trade was already created.
   */
  async promoteSignal(signalId: string, tradeId: string): Promise<void> {
    const signal = await storage.getRtbSignalById(signalId);
    
    if (!signal) {
      console.warn(`[A3.R9.2][RTB] Cannot promote - signal ${signalId} not found`);
      return;
    }

    // A3.R9.0.C: Normalize symbol for consistent comparisons
    const normalizedSymbol = normalizePairKey(signal.symbol);
    const oldStatus = signal.status || 'active';
    const mode = signal.mode as TradingMode;
    const promotionStartMs = Date.now();

    // Directive 8.8.4-A3.R9.2-D: Verify trade exists before deleting signal
    // This ensures we don't orphan signals if trade creation failed
    if (!tradeId) {
      console.error(`[A3.R9.2][PROMOTION_ABORT] symbol=${normalizedSymbol} no tradeId - trade creation may have failed`);
      return;
    }

    console.log(`[A3.R9.2][PROMOTION_START] symbol=${normalizedSymbol} tradeId=${tradeId} starting atomic promotion`);
    
    // Step 1: Record SLAL PROMOTED event first (audit trail)
    signalLifecycleAudit.recordPromoted(
      signal.signalId,
      mode,
      normalizedSymbol,
      signal.strategy,
      {
        tradeId,
        cwqi: parseFloat(signal.cwqi),
        queueDurationMs: Date.now() - new Date(signal.queuedAt).getTime(),
      }
    );

    // Step 2: Log promotion trace
    this.logRtbTrace(mode, normalizedSymbol, signal.strategy, oldStatus, 'promoted', 'TCL_promotion');

    // Step 3: Delete signal from RTBQ (deferred until after trade creation confirmed)
    // A3.R9.2-D: Deletion happens ONLY after trade creation is confirmed via tradeId
    try {
      await storage.deleteRtbSignals({ mode, id: signal.id });
      performanceMonitor.recordQueueRemove(1);
      
      const promotionDurationMs = Date.now() - promotionStartMs;
      console.log(`[A3.R9.2][PROMOTION_COMPLETE] symbol=${normalizedSymbol} tradeId=${tradeId} rtbRemoved=true duration=${promotionDurationMs}ms`);
      
    } catch (error) {
      // A3.R9.2-D: Deletion failed but trade was already created
      // Signal may remain in queue as orphan - log for manual cleanup
      console.error(`[A3.R9.2][PROMOTION_CLEANUP_FAILED] symbol=${normalizedSymbol} tradeId=${tradeId} - signal may be orphaned:`, error);
      
      // Attempt to mark as promoted to prevent re-promotion
      try {
        await storage.updateRtbSignal(signalId, {
          status: 'promoted',
          promotedAt: new Date(),
          promotedTradeId: tradeId,
        });
        console.log(`[A3.R9.2][PROMOTION_MARKED] symbol=${normalizedSymbol} marked as promoted (delete failed)`);
      } catch (markError) {
        console.error(`[A3.R9.2][PROMOTION_MARK_FAILED] symbol=${normalizedSymbol}:`, markError);
      }
    }
  }

  /**
   * Directive 8.8.4-A3.R9.3-C: Legacy cleanup only
   * 
   * R9.3-C: TTL-based expiry removed. Lifecycle governed by SQE only.
   * This method now only handles legacy 'expired' status signals (immediate delete).
   * Active signal expiry is handled by SQE revalidation in executePerSignalRefresh().
   */
  async cleanupExpiredSignals(mode: TradingMode): Promise<number> {
    let cleanedCount = 0;
    
    // R9.3-C: Only handle legacy 'expired' status signals
    const expiredSignals = await storage.getRtbSignals({
      mode,
      status: 'expired',
    });
    
    for (const signal of expiredSignals) {
      // A3.R9.0.C: Normalize symbol for consistent logging
      const normalizedSymbol = normalizePairKey(signal.symbol);
      await storage.deleteRtbSignals({ mode, id: signal.id });
      performanceMonitor.recordQueueRemove(1);
      console.log(`[A3.R9.3][CLEANUP] Deleted legacy expired signal ${normalizedSymbol}/${signal.strategy}`);
      cleanedCount++;
    }
    
    // R9.3-C: TTL-based expiry removed - no longer checking expiresAt
    // Signal lifecycle is now governed solely by SQE revalidation

    if (cleanedCount > 0) {
      console.log(`[A3.R9.3][RTB] Cleaned up ${cleanedCount} legacy signals for ${mode} mode`);
    }

    return cleanedCount;
  }

  /**
   * Re-evaluate all queued signals
   * Removes signals that no longer meet quality thresholds
   */
  async reEvaluateQueue(mode: TradingMode): Promise<{ removed: number; remaining: number }> {
    const signals = await this.getQueuedSignals(mode);
    let removed = 0;

    for (const signal of signals) {
      const confidence = parseFloat(signal.confidence);
      const cwqi = parseFloat(signal.cwqi);
      const age = (Date.now() - new Date(signal.queuedAt).getTime()) / 1000;

      // R9.3-C: TTL check removed - lifecycle governed by SQE only
      // Only remove if confidence is below threshold
      if (confidence < MIN_QUEUE_CONFIDENCE) {
        await this.expireSignal(signal.id, `Confidence ${confidence.toFixed(2)} below threshold`);
        removed++;
      }
    }

    const remaining = signals.length - removed;
    console.log(`[RTB] Re-evaluated queue: ${removed} removed, ${remaining} remaining`);

    return { removed, remaining };
  }

  /**
   * Check if there's capacity for promotion and get the best candidate
   * R9.3-C: expiresAt check removed - lifecycle governed by SQE only
   */
  async checkForPromotion(mode: TradingMode): Promise<RtbSignal | null> {
    // Get the top signal (already filtered by SQE revalidation)
    const topSignal = await this.getTopSignal(mode);

    if (!topSignal) {
      return null;
    }

    // R9.3-C: No expiry check - signals are valid until SQE rejects them
    // R9.3-A: Check if signal is currently refreshing
    if (this.isSignalRefreshing(topSignal.signalId)) {
      console.log(`[A3.R9.3][PROMOTION] Signal ${topSignal.symbol}/${topSignal.strategy} is refreshing - skipping`);
      return null;
    }

    // Batch 19F: Pair-level promotion guard (prevent overexposure)
    // Skip promotion if an active trade already exists for this pair (regardless of strategy)
    try {
      const activeTrades = await storage.getActiveTrades(mode as 'paper' | 'live');
      const existingTrade = activeTrades.find(t => t.symbol === topSignal.symbol);
      if (existingTrade) {
        console.log(`[19F][RTB] Skipping promotion for ${topSignal.symbol}/${topSignal.strategy} — active trade already exists for this pair`);
        return null;
      }
    } catch (err) {
      console.warn(`[19F][RTB] Pair-level guard check failed, proceeding with promotion:`, err);
    }

    return topSignal;
  }

  /**
   * Phase 8.8.4-C.14.B: Get ranked signals for multi-signal promotion
   * Returns top N signals sorted by CWQI descending
   * R9.3-C: expiresAt filter removed - lifecycle governed by SQE only
   */
  async getRankedSignals(mode: TradingMode, limit: number = 15): Promise<RtbSignal[]> {
    const signals = await this.getQueuedSignals(mode);

    if (signals.length === 0) {
      return [];
    }

    // R9.3-C: No expiry filter - all queued signals are valid (SQE governs lifecycle)
    // R9.3-A: Filter out signals currently being refreshed
    let validSignals = signals.filter(s => !this.isSignalRefreshing(s.signalId));

    // Batch 19F: Pair-level promotion guard (prevent overexposure)
    // Filter out signals for pairs that already have active trades
    try {
      const activeTrades = await storage.getActiveTrades(mode as 'paper' | 'live');
      const activeSymbols = new Set(activeTrades.map(t => t.symbol));
      const beforeCount = validSignals.length;
      validSignals = validSignals.filter(s => !activeSymbols.has(s.symbol));
      const pairGuardFiltered = beforeCount - validSignals.length;
      if (pairGuardFiltered > 0) {
        console.log(`[19F][RTB] Pair-level guard filtered ${pairGuardFiltered} signals (active trades exist for those pairs)`);
      }
    } catch (err) {
      console.warn(`[19F][RTB] Pair-level guard check failed in getRankedSignals:`, err);
    }

    // Sort by CWQI descending (highest quality first)
    validSignals.sort((a, b) => {
      const cwqiA = parseFloat(a.cwqi || '0');
      const cwqiB = parseFloat(b.cwqi || '0');
      return cwqiB - cwqiA;
    });

    console.log(`[8.8.4-C.14.B][RTB_RANKED] mode=${mode}, total=${signals.length}, valid=${validSignals.length}, returning top ${Math.min(limit, validSignals.length)}`);

    return validSignals.slice(0, limit);
  }

  /**
   * Clear all queued signals for a mode (used during engine reset)
   * Directive 8.8.4-C.14.D: Actually DELETE records instead of just expiring them
   */
  async clearQueue(mode: TradingMode): Promise<number> {
    // Delete ALL RTB signals for this mode (not just queued ones)
    const deleted = await storage.deleteRtbSignals({ mode });
    
    // A3.R9.0: Track queue clears in performance metrics
    if (deleted > 0) {
      performanceMonitor.recordQueueRemove(deleted);
    }
    
    console.log(`[A3.R9.2][RTB] Deleted ${deleted} signals from ${mode} queue`);
    return deleted;
  }

  /**
   * Phase 8.8.4-C.5: Queue an SQE-qualified signal into the unified RTB pool
   * Directive 8.8.4-A3.R8.5: Enforce SQE await before insert
   * 
   * Unlike queueSignal(), this method:
   * - Accepts ALL SQE-qualified signals regardless of capacity blocks
   * - Uses pre-computed CWQI from SQE instead of re-calculating
   * - Supports TCL warm-up tracking
   * 
   * Directive 8.8.4-A3.R2: Supports skipSelfCheck flag for reconfirmation
   * When skipSelfCheck=true, skips the existing RTB signal check to allow
   * re-queuing during refresh cycles without self-rejection
   * 
   * Directive 8.8.4-A3.R8.5: Explicit SQE validation before insert
   * Defense-in-depth: Validates NGC threshold even for pre-computed signals
   * 
   * @param input - SQE-qualified signal with pre-computed metrics
   * @returns The queued signal record or null if rejected
   */
  async queueSQESignal(input: SQESignalInput): Promise<RtbSignal | null> {
    const now = new Date();
    // R9.3-C: TTL removed - lifecycle governed by SQE results only
    
    // Directive 8.8.4-A3.R1: Normalize pair key to uppercase BASE/QUOTE format
    const normalizedSymbol = normalizePairKey(input.symbol);

    // Directive 8.8.4-A3.R8.5: Trust upstream SQE result
    // SQE evaluation already happened upstream before calling queueSQESignal
    // Log trace for audit trail without re-running evaluation
    console.log(`[A3.R8.5][SQE][GATE] pair=${normalizedSymbol} TRUSTED NGC=${input.ngc.toFixed(4)} CWQI=${input.cwqi.toFixed(4)}`);

    // Directive 8.8.4-A3: Pair-level duplicate validation
    // Check if this pair already exists in active trades (duplicate_pair_active)
    // NOTE: Always check active positions even with skipSelfCheck (trade may have opened)
    const hasActivePosition = await storage.hasActivePair(normalizedSymbol, input.mode);
    if (hasActivePosition) {
      console.log(`[8.8.4-A3][SQE][Validation] pair=${normalizedSymbol} status=duplicate_pair_active`);
      return null;
    }

    // Directive 8.8.4-A3.R2: Skip self-dedupe check when reconfirming existing RTB signals
    if (input.skipSelfCheck) {
      console.log(`[A3.R2][RTB] skipSelfCheck=true for ${normalizedSymbol}/${input.strategy}`);
    }

    // Check for existing queued signal with same symbol+strategy
    // Directive 8.8.4-A3.R2: Skip this check when reconfirming (skipSelfCheck=true)
    const existingSignal = input.skipSelfCheck 
      ? null 
      : await this.getQueuedSignal(input.mode, normalizedSymbol, input.strategy);
    
    if (existingSignal) {
      // If existing signal has higher CWQI, keep it
      const existingCWQI = parseFloat(existingSignal.cwqi);
      if (existingCWQI >= input.cwqi) {
        console.log(`[8.8.4-C.5][RTB_SKIP] Keeping existing ${normalizedSymbol}/${input.strategy} with CWQI ${existingCWQI.toFixed(4)} >= new ${input.cwqi.toFixed(4)}`);
        return existingSignal;
      }
      
      // New signal is better - expire the old one
      await this.expireSignal(existingSignal.id, 'Replaced by higher-CWQI SQE signal');
    }

    // Phase 14.5: Persist routing and ranking metadata for auditability
    const enrichedMetadata = {
      ...(input.metadata || {}),
      sourcePool: input.sourcePool || undefined,
      signalType: input.signalType || 'QUANT',
      assetClass: input.assetClass || 'crypto_spot',
      rankingScore: input.rankingScore ?? parseFloat(String(input.finalScore || '0')),
    };

    // Insert new signal with pre-computed metrics from SQE
    // Directive 8.8.4-A3.R1: Store with normalized pair key
      // R9.3-C: expiresAt removed - lifecycle governed by SQE, not TTL
    const insertData: InsertRtbSignal = {
      mode: input.mode,
      signalId: input.signalId,
      symbol: normalizedSymbol,
      strategy: input.strategy as any,
      entryPrice: input.entryPrice.toString(),
      stopPrice: input.stopPrice.toString(),
      targetPrice: input.targetPrice?.toString(),
      quantity: input.quantity?.toString(),
      notional: input.notional?.toString(),
      confidence: input.ngc.toString(), // Use NGC as confidence
      riskScore: input.riskScore.toString(),
      expectedReturn: input.profitRate.toString(),
      cwqi: input.cwqi.toString(),
      ngc: input.ngc.toString(), // Directive 8.8.4-C.14.A
      currentPrice: input.currentPrice?.toString(), // Directive 8.8.4-C.14.A
      volume24h: input.volume24h?.toString(), // Directive 8.8.4-C.14.A
      status: 'active', // Directive 8.8.4-A3.R8: Use 'active' for new signals pending first refresh
      queuedAt: now,
      // R9.3-C: expiresAt omitted - field is now optional
      blockReason: 'SQE_QUALIFIED', // Mark as SQE-qualified, not capacity-blocked
      metadata: enrichedMetadata as any,
    };

    // Directive 8.8.4-A3.R8: Log trace event for new signal insertion
    this.logRtbTrace(input.mode, normalizedSymbol, input.strategy, 'queued', 'active', 'insertion');

    // Phase 8.8.4-C.13.B: Use upsert to prevent duplicate key errors
    const signal = await storage.upsertRtbSignal(insertData);
    
    // A3.R9.0: Record queue add for performance metrics
    performanceMonitor.recordQueueAdd(1);
    
    // Directive 8.8.4-A3.R9.0.D: Trace RTB queue insertion
    diagnosticTrace.traceRTB(
      normalizedSymbol,
      input.strategy,
      { ngc: input.ngc, cwqi: input.cwqi },
      true, // inserted
      { mode: input.mode, signalId: input.signalId }
    );

    // Record SLAL QUEUED event
    // R9.3-C: expiresAt removed from audit - lifecycle governed by SQE
    signalLifecycleAudit.recordQueued(
      input.signalId,
      input.mode,
      normalizedSymbol,
      input.strategy,
      {
        cwqi: input.cwqi,
        ngc: input.ngc,
        profitRate: input.profitRate,
        blockReason: 'SQE_QUALIFIED',
      }
    );

    // Get current pool size for warm-up tracking
    const poolSize = await this.getPoolSize(input.mode);

    console.log(`[8.8.4-C.5][RTB_INSERT] ${normalizedSymbol}/${input.strategy}: CWQI=${input.cwqi.toFixed(4)}, NGC=${input.ngc.toFixed(4)}, poolSize=${poolSize}`);
    
    // Directive 8.8.4-A3.R9.3-D: Simplified TCL - always check threshold on enqueue
    // Global barrier removed per R9.3-A (per-signal refresh model)
    await tclWatchdog.checkSignalThresholdLive(input.mode);
    
    return signal;
  }

  /**
   * Phase 8.8.4-C.5: Get the current pool size for a mode
   * Directive 8.8.4-A3.R8: Include active/reconfirmed/queued statuses
   * @returns Number of signals in RTB queue
   */
  async getPoolSize(mode: TradingMode): Promise<number> {
    const signals = await this.getQueuedSignals(mode);
    return signals.length;
  }

  /**
   * Phase 8.8.4-C.5 + C.6: Check if TCL (Trading Capacity Limit) is active
   * TCL activates when:
   * - Pool has accumulated ≥100 signals (normal activation), OR
   * - 5 minutes have passed since engine start (failsafe activation)
   * 
   * @param mode - Trading mode to check
   * @returns true if TCL is active
   */
  async isTCLActive(mode: TradingMode): Promise<boolean> {
    const poolSize = await this.getPoolSize(mode);
    
    // Normal activation: ≥100 signals
    if (poolSize >= TCL_WARMUP_THRESHOLD) {
      console.log(`[8.8.4-C.5][TCL_ACTIVATE] mode=${mode}, poolSize=${poolSize} >= ${TCL_WARMUP_THRESHOLD}, TCL is active`);
      return true;
    }
    
    // Phase 8.8.4-C.6: Check 5-minute failsafe
    const engineStartTime = this.engineStartTimes.get(mode);
    if (engineStartTime) {
      const elapsedMs = Date.now() - engineStartTime;
      if (elapsedMs >= TCL_FAILSAFE_MS) {
        // Failsafe triggered
        if (!this.tclFailsafeTriggered.get(mode)) {
          this.tclFailsafeTriggered.set(mode, true);
          console.log(`[8.8.4-C.6][TCL_FALLBACK_TRIGGER] mode=${mode}, elapsed=${(elapsedMs/1000).toFixed(0)}s >= 300s, activating TCL via failsafe`);
        }
        console.log(`[8.8.4-C.6][TCL_FALLBACK_ACTIVATE] mode=${mode}, poolSize=${poolSize}, TCL active via 5-minute failsafe`);
        return true;
      } else {
        const remainingMs = TCL_FAILSAFE_MS - elapsedMs;
        console.log(`[8.8.4-C.5][TCL_WARMUP] mode=${mode}, poolSize=${poolSize}/${TCL_WARMUP_THRESHOLD}, failsafe in ${(remainingMs/1000).toFixed(0)}s`);
      }
    } else {
      console.log(`[8.8.4-C.5][TCL_WARMUP] mode=${mode}, poolSize=${poolSize}/${TCL_WARMUP_THRESHOLD}, TCL not yet active (no engine start time)`);
    }
    
    return false;
  }

  /**
   * Phase 8.8.4-C.5 + C.6: Get TCL warm-up status
   * @returns Object with pool size, threshold, active status, and failsafe info
   */
  async getTCLStatus(mode: TradingMode): Promise<{
    poolSize: number;
    threshold: number;
    isActive: boolean;
    progressPercent: number;
    failsafeEnabled: boolean;
    failsafeTriggered: boolean;
    failsafeRemainingMs: number | null;
  }> {
    const poolSize = await this.getPoolSize(mode);
    const engineStartTime = this.engineStartTimes.get(mode);
    const failsafeTriggered = this.tclFailsafeTriggered.get(mode) || false;
    
    let failsafeRemainingMs: number | null = null;
    let isActiveViaFailsafe = false;
    
    if (engineStartTime) {
      const elapsedMs = Date.now() - engineStartTime;
      if (elapsedMs >= TCL_FAILSAFE_MS) {
        isActiveViaFailsafe = true;
        failsafeRemainingMs = 0;
      } else {
        failsafeRemainingMs = TCL_FAILSAFE_MS - elapsedMs;
      }
    }
    
    const isActiveViaThreshold = poolSize >= TCL_WARMUP_THRESHOLD;
    const isActive = isActiveViaThreshold || isActiveViaFailsafe;
    const progressPercent = Math.min(100, (poolSize / TCL_WARMUP_THRESHOLD) * 100);
    
    return {
      poolSize,
      threshold: TCL_WARMUP_THRESHOLD,
      isActive,
      progressPercent: Math.round(progressPercent * 10) / 10,
      failsafeEnabled: engineStartTime !== undefined,
      failsafeTriggered,
      failsafeRemainingMs,
    };
  }
}

export const readyToBuyService = new ReadyToBuyService();
