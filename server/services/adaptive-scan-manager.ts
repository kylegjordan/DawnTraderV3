/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.8 — Adaptive Scan Manager (Dual-Pool Scheduler)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Replaces static Tier A/B scanning logic with a learning-driven, telemetry-based
 * adaptive pair selection system using a 60/40 Ideal/Rotational pool split.
 * 
 * Features:
 * - Dual-pool selection: 60% Ideal (top performers) + 40% Rotational (exploration)
 * - Pair failure tracking with cooldown blacklist
 * - Integration with TelemetryAggregator for performance-based ranking
 * - Graceful fallback to all available pairs if telemetry is insufficient
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SCANNER_PARAMS } from '../config/system-guards.js';
import { getTelemetryAggregator, TelemetryAggregatorService } from './telemetry-aggregator.js';

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
 */
export class AdaptiveScanManager {
  private telemetry: TelemetryAggregatorService;
  private failureTracker: PairFailureTracker;
  private lastBatch: AdaptiveScanBatch | null = null;

  constructor(telemetry?: TelemetryAggregatorService, failureTracker?: PairFailureTracker) {
    this.telemetry = telemetry || getTelemetryAggregator();
    this.failureTracker = failureTracker || new PairFailureTracker();
  }

  /**
   * Get the next batch of pairs to scan using 60/40 Ideal/Rotational split
   */
  async getNextScanBatch(allAvailablePairs: string[]): Promise<AdaptiveScanBatch> {
    const batchSize = SCANNER_PARAMS.BATCH_SIZE;
    const idealRatio = SCANNER_PARAMS.DUAL_POOL.IDEAL_RATIO;
    const rotationalRatio = SCANNER_PARAMS.DUAL_POOL.ROTATIONAL_RATIO;
    
    // Get ideal pairs from telemetry (top performers)
    const idealCount = Math.ceil(batchSize * idealRatio);
    let idealPairs = this.telemetry.getTopPairs(idealRatio);
    
    // If not enough ideal pairs, fall back to available pairs
    if (idealPairs.length < idealCount) {
      console.log(`[10.8][AdaptiveScan] Insufficient ideal pairs (${idealPairs.length}/${idealCount}), using fallback`);
      idealPairs = allAvailablePairs.slice(0, idealCount);
    }
    
    // Get rotational pairs for exploration
    const rotationalCount = Math.ceil(batchSize * rotationalRatio);
    const rotationalPairs = this.telemetry.getRotationalPairs(rotationalRatio, allAvailablePairs)
      .filter(p => !idealPairs.includes(p)) // No duplicates
      .slice(0, rotationalCount);
    
    // Combine and filter out failed pairs
    const combined = [...idealPairs, ...rotationalPairs];
    const excludedPairs = combined.filter(p => this.failureTracker.isInCooldown(p));
    const filteredBatch = this.failureTracker.filterFailedPairs(combined);
    
    // Create batch result
    const batch: AdaptiveScanBatch = {
      idealPairs: idealPairs.filter(p => !this.failureTracker.isInCooldown(p)),
      rotationalPairs: rotationalPairs.filter(p => !this.failureTracker.isInCooldown(p)),
      excludedPairs,
      totalBatch: filteredBatch,
      timestamp: Date.now(),
    };
    
    this.lastBatch = batch;
    
    console.log(`[AdaptiveScan] Ideal=${batch.idealPairs.length} | Rotational=${batch.rotationalPairs.length} | Excluded=${batch.excludedPairs.length} | Total=${batch.totalBatch.length}`);
    
    return batch;
  }

  /**
   * Record scan result for a pair
   */
  recordScanResult(symbol: string, success: boolean, data?: {
    finalScore?: number;
    hybridScore?: number;
    regimeWeight?: number;
    predictiveConfidence?: number;
    decayedStrength?: number;
    timeframe?: '1h' | '15m' | '5m';
    failureReason?: string;
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
      });
    } else {
      this.failureTracker.recordFailure(symbol, data?.failureReason);
    }
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
   */
  getParamsInfo(): string {
    return `[10.8][CONFIG] AdaptiveScan: enabled=${SCANNER_PARAMS.ADAPTIVE_ENABLED}, ideal=${SCANNER_PARAMS.DUAL_POOL.IDEAL_RATIO * 100}%, rotational=${SCANNER_PARAMS.DUAL_POOL.ROTATIONAL_RATIO * 100}%, batch=${SCANNER_PARAMS.BATCH_SIZE}`;
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
