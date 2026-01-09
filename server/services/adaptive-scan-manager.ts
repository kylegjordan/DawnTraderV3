/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.8 + 11.2 R1 — Adaptive Scan Manager (Dual-Pool Scheduler)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Replaces static Tier A/B scanning logic with a learning-driven, telemetry-based
 * adaptive pair selection system using dynamic Ideal/Rotational pool split.
 * 
 * Features:
 * - Dual-pool selection: Dynamic ratio based on pool performance (11.2 R1)
 * - Pair failure tracking with cooldown blacklist
 * - Integration with TelemetryAggregator for performance-based ranking
 * - AdaptiveRatioManager for regime-aware ratio adjustment (11.2 R1)
 * - Graceful fallback to all available pairs if telemetry is insufficient
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SCANNER_PARAMS } from '../config/system-guards.js';
import { getTelemetryAggregator, TelemetryAggregatorService, type PoolType } from './telemetry-aggregator.js';
import { adaptiveRatioManager, type AdaptiveRatio } from './adaptive-ratio-manager.js';

export interface FailedPairEntry {
  symbol: string;
  failTime: number;
  failCount: number;
  reason?: string;
}

export interface AdaptiveScanBatch {
  idealPairs: string[];
  rotationalPairs: string[];
  excludedPairs: string[];
  totalBatch: string[];
  timestamp: number;
  ratioUsed?: AdaptiveRatio; // Directive 11.2 R1: Track ratio used for this batch
}

/**
 * Pair Failure Tracker - Manages cooldown blacklist for failed pairs
 */
export class PairFailureTracker {
  private failedPairs: Map<string, FailedPairEntry> = new Map();
  private readonly cooldownMs = SCANNER_PARAMS.FAILURE_TRACKING.COOLDOWN_MS;
  private readonly maxFailures = SCANNER_PARAMS.FAILURE_TRACKING.MAX_FAILURES;
  private readonly extendedCooldownMs = SCANNER_PARAMS.FAILURE_TRACKING.EXTENDED_COOLDOWN_MS;

  /**
   * Record a pair failure
   */
  recordFailure(symbol: string, reason?: string): void {
    const now = Date.now();
    const existing = this.failedPairs.get(symbol);
    
    if (existing) {
      existing.failCount++;
      existing.failTime = now;
      existing.reason = reason;
    } else {
      this.failedPairs.set(symbol, {
        symbol,
        failTime: now,
        failCount: 1,
        reason,
      });
    }
    
    const entry = this.failedPairs.get(symbol)!;
    const cooldown = entry.failCount >= this.maxFailures ? this.extendedCooldownMs : this.cooldownMs;
    console.log(`[10.8][FailureTracker] ${symbol} failed (count=${entry.failCount}, cooldown=${cooldown / 1000}s): ${reason || 'unknown'}`);
  }

  /**
   * Record a pair success - resets failure count
   */
  recordSuccess(symbol: string): void {
    if (this.failedPairs.has(symbol)) {
      this.failedPairs.delete(symbol);
      console.log(`[10.8][FailureTracker] ${symbol} succeeded - removed from failure list`);
    }
  }

  /**
   * Check if a pair is in cooldown
   */
  isInCooldown(symbol: string): boolean {
    const entry = this.failedPairs.get(symbol);
    if (!entry) return false;
    
    const now = Date.now();
    const cooldown = entry.failCount >= this.maxFailures ? this.extendedCooldownMs : this.cooldownMs;
    
    if (now - entry.failTime >= cooldown) {
      // Cooldown expired - remove from list but keep for tracking
      return false;
    }
    
    return true;
  }

  /**
   * Filter out pairs that are in cooldown
   */
  filterFailedPairs(pairs: string[]): string[] {
    const filtered: string[] = [];
    const excluded: string[] = [];
    
    for (const symbol of pairs) {
      if (this.isInCooldown(symbol)) {
        excluded.push(symbol);
      } else {
        filtered.push(symbol);
      }
    }
    
    if (excluded.length > 0) {
      console.log(`[10.8][FailureTracker] Excluded ${excluded.length} pairs (cooldown): ${excluded.slice(0, 5).join(', ')}${excluded.length > 5 ? '...' : ''}`);
    }
    
    return filtered;
  }

  /**
   * Get all failed pairs currently in cooldown
   */
  getFailedPairs(): FailedPairEntry[] {
    const now = Date.now();
    const result: FailedPairEntry[] = [];
    
    for (const entry of this.failedPairs.values()) {
      const cooldown = entry.failCount >= this.maxFailures ? this.extendedCooldownMs : this.cooldownMs;
      if (now - entry.failTime < cooldown) {
        result.push(entry);
      }
    }
    
    return result;
  }

  /**
   * Clear all failure records
   */
  clear(): void {
    this.failedPairs.clear();
    console.log('[10.8][FailureTracker] All failure records cleared');
  }
}

/**
 * Adaptive Scan Manager - Dual-Pool Scheduler
 * Directive 11.2 R1: Now uses AdaptiveRatioManager for dynamic ratio adjustment
 */
export class AdaptiveScanManager {
  private telemetry: TelemetryAggregatorService;
  private failureTracker: PairFailureTracker;
  private lastBatch: AdaptiveScanBatch | null = null;
  private useAdaptiveRatio: boolean = true; // Enable dynamic ratios by default

  constructor(telemetry?: TelemetryAggregatorService, failureTracker?: PairFailureTracker) {
    this.telemetry = telemetry || getTelemetryAggregator();
    this.failureTracker = failureTracker || new PairFailureTracker();
  }

  /**
   * Get the next batch of pairs to scan using dynamic Ideal/Rotational split
   * Directive 11.2 R1: Ratios now computed by AdaptiveRatioManager based on pool performance
   */
  async getNextScanBatch(allAvailablePairs: string[]): Promise<AdaptiveScanBatch> {
    const batchSize = SCANNER_PARAMS.BATCH_SIZE;
    
    // Directive 11.2 R1: Compute dynamic ratio based on pool performance
    let idealRatio: number;
    let rotationalRatio: number;
    let currentRatio: AdaptiveRatio | undefined;
    
    if (this.useAdaptiveRatio) {
      const regime = this.telemetry.getCurrentMarketRegime();
      const mode = (process.env.MODE as 'live' | 'paper') || 'paper';
      currentRatio = await adaptiveRatioManager.computeAdaptiveRatio(regime, mode);
      idealRatio = currentRatio.idealRatio;
      rotationalRatio = currentRatio.rotationalRatio;
    } else {
      // Fallback to static config
      idealRatio = SCANNER_PARAMS.DUAL_POOL.IDEAL_RATIO;
      rotationalRatio = SCANNER_PARAMS.DUAL_POOL.ROTATIONAL_RATIO;
    }
    
    // Get ideal pairs from telemetry (top performers)
    // Directive 11.4C.1 FIX: Pass INTEGER COUNTS, not ratios to telemetry methods
    const idealCount = Math.ceil(batchSize * idealRatio);
    const rotationalCount = Math.ceil(batchSize * rotationalRatio);
    
    console.log(`[AdaptiveScan][11.4C.1] Target counts: Ideal=${idealCount}, Rotational=${rotationalCount} (batchSize=${batchSize})`);
    
    let idealPairs = this.telemetry.getTopPairs(idealCount); // FIX: Pass count, not ratio
    
    // If not enough ideal pairs, fall back to available pairs
    if (idealPairs.length < idealCount) {
      console.log(`[10.8][AdaptiveScan] Insufficient ideal pairs (${idealPairs.length}/${idealCount}), using fallback`);
      idealPairs = allAvailablePairs.slice(0, idealCount);
    }
    
    // Get rotational pairs for exploration
    // Directive 11.4C.1 FIX: Pass count, not ratio to getRotationalPairs
    const rotationalPairs = this.telemetry.getRotationalPairs(rotationalCount, allAvailablePairs)
      .filter(p => !idealPairs.includes(p)) // No duplicates
      .slice(0, rotationalCount);
    
    // Combine and filter out failed pairs
    const combined = [...idealPairs, ...rotationalPairs];
    const excludedPairs = combined.filter(p => this.failureTracker.isInCooldown(p));
    const filteredBatch = this.failureTracker.filterFailedPairs(combined);
    
    // Create batch result with ratio tracking (11.2 R1)
    const batch: AdaptiveScanBatch = {
      idealPairs: idealPairs.filter(p => !this.failureTracker.isInCooldown(p)),
      rotationalPairs: rotationalPairs.filter(p => !this.failureTracker.isInCooldown(p)),
      excludedPairs,
      totalBatch: filteredBatch,
      timestamp: Date.now(),
      ratioUsed: currentRatio,
    };
    
    this.lastBatch = batch;
    
    // Directive 11.2 R1: Enhanced logging with ratio info
    console.log(`[AdaptiveScan] Ideal=${batch.idealPairs.length} (${(idealRatio * 100).toFixed(0)}%) | Rotational=${batch.rotationalPairs.length} (${(rotationalRatio * 100).toFixed(0)}%) | Excluded=${batch.excludedPairs.length} | Total=${batch.totalBatch.length}`);
    
    return batch;
  }

  /**
   * Record scan result for a pair
   * Directive 11.2 R1: Now includes pool tracking for segmented performance
   */
  recordScanResult(symbol: string, success: boolean, data?: {
    finalScore?: number;
    hybridScore?: number;
    regimeWeight?: number;
    predictiveConfidence?: number;
    decayedStrength?: number;
    timeframe?: '1h' | '15m' | '5m';
    failureReason?: string;
    pool?: PoolType; // Directive 11.2 R1: Track source pool
  }): void {
    if (success && data) {
      this.failureTracker.recordSuccess(symbol);
      this.telemetry.recordPairTelemetry(symbol, {
        finalScore: data.finalScore ?? 0,
        hybridScore: data.hybridScore,
        regimeWeight: data.regimeWeight,
        predictiveConfidence: data.predictiveConfidence,
        success: true,
        decayedStrength: data.decayedStrength,
        timeframe: data.timeframe,
        pool: data.pool ?? this.inferPoolFromLastBatch(symbol), // Directive 11.2 R1
      });
    } else {
      this.failureTracker.recordFailure(symbol, data?.failureReason);
    }
  }

  /**
   * Directive 11.2 R1: Infer pool from last batch for telemetry recording
   */
  private inferPoolFromLastBatch(symbol: string): PoolType {
    if (!this.lastBatch) return 'ideal';
    if (this.lastBatch.idealPairs.includes(symbol)) return 'ideal';
    if (this.lastBatch.rotationalPairs.includes(symbol)) return 'rotational';
    return 'ideal'; // Default fallback
  }

  /**
   * Directive 11.2 R1: Enable or disable adaptive ratio computation
   */
  setAdaptiveRatioEnabled(enabled: boolean): void {
    this.useAdaptiveRatio = enabled;
    console.log(`[11.2R1][AdaptiveScan] Adaptive ratio ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Directive 11.2 R1: Get current adaptive ratio manager state
   */
  getAdaptiveRatioState() {
    return adaptiveRatioManager.getState();
  }

  /**
   * Get the last scan batch
   */
  getLastBatch(): AdaptiveScanBatch | null {
    return this.lastBatch;
  }

  /**
   * Get current failure tracker state
   */
  getFailedPairs(): FailedPairEntry[] {
    return this.failureTracker.getFailedPairs();
  }

  /**
   * Get telemetry aggregator
   */
  getTelemetry(): TelemetryAggregatorService {
    return this.telemetry;
  }

  /**
   * Check if adaptive scanning is enabled
   */
  isAdaptiveEnabled(): boolean {
    return SCANNER_PARAMS.ADAPTIVE_ENABLED;
  }

  /**
   * Get scanning params info
   * Directive 11.2 R1: Now includes adaptive ratio status
   */
  getParamsInfo(): string {
    const ratio = adaptiveRatioManager.getCurrentRatio();
    return `[10.8+11.2R1][CONFIG] AdaptiveScan: enabled=${SCANNER_PARAMS.ADAPTIVE_ENABLED}, adaptiveRatio=${this.useAdaptiveRatio}, ideal=${(ratio.idealRatio * 100).toFixed(0)}%, rotational=${(ratio.rotationalRatio * 100).toFixed(0)}%, batch=${SCANNER_PARAMS.BATCH_SIZE}`;
  }
}

// Singleton instances
let adaptiveScanManagerInstance: AdaptiveScanManager | null = null;
let failureTrackerInstance: PairFailureTracker | null = null;

export function getAdaptiveScanManager(): AdaptiveScanManager {
  if (!adaptiveScanManagerInstance) {
    failureTrackerInstance = new PairFailureTracker();
    adaptiveScanManagerInstance = new AdaptiveScanManager(getTelemetryAggregator(), failureTrackerInstance);
    console.log(adaptiveScanManagerInstance.getParamsInfo());
  }
  return adaptiveScanManagerInstance;
}

export function getPairFailureTracker(): PairFailureTracker {
  if (!failureTrackerInstance) {
    failureTrackerInstance = new PairFailureTracker();
  }
  return failureTrackerInstance;
}
