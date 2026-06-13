/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.8 + 11.2 R1 + 11.4C-R2 — Adaptive Scan Manager (Dual-Pool Scheduler)
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
 * - Directive 11.4C-R2: Initialization guard with retry logic for underflow protection
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SCANNER_PARAMS } from '../config/system-guards.js';
import { getTelemetryAggregator, TelemetryAggregatorService, type PoolType } from './telemetry-aggregator.js';
import { adaptiveRatioManager, type AdaptiveRatio } from './adaptive-ratio-manager.js';
import { BENCHMARK_SYMBOLS, isBenchmarkSymbol } from './fx5-scanner.js';
import { type MarketRegime } from './telemetry-repository.js';

export interface FailedPairEntry {
  symbol: string;
  failTime: number;
  failCount: number;
  reason?: string;
}

export interface AdaptiveScanBatch {
  idealPairs: string[];
  rotationalPairs: string[];
  benchmarkPairs: string[]; // Directive 11.4H.5: Track injected benchmark pairs
  excludedPairs: string[];
  totalBatch: string[];
  timestamp: number;
  ratioUsed?: AdaptiveRatio; // Directive 11.2 R1: Track ratio used for this batch
  retryCount?: number; // Directive 11.4C-R2: Track retry attempts
}

// Directive 11.4C-R2: Helper for async sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
   * Directive 11.4C.2: Dynamic Fill - always scan batchSize pairs, fill deficit from rotational
   * Directive 11.4B.2-R1: Underflow protection guarantees BATCH_SIZE-pair cycles (M64)
   * Directive 11.4C-R2: Initialization guard with retry logic (M65)
   */
  async getNextScanBatch(allAvailablePairs: string[], retryAttempt: number = 0): Promise<AdaptiveScanBatch> {
    const batchSize = SCANNER_PARAMS.BATCH_SIZE; // 300 pairs per Batch 18 (M64)
    const MAX_RETRIES = 1; // Directive 11.4C-R2: Maximum retry attempts
    
    // Directive 11.2 R1: Compute dynamic ratio based on pool performance
    let idealRatio: number;
    let rotationalRatio: number;
    let currentRatio: AdaptiveRatio | undefined;
    
    if (this.useAdaptiveRatio) {
      // P19-B3b: the telemetry getter yields canonical MarketRegime values but is
      // typed `string`; narrow with the codebase's established convention for this
      // exact case (cf. telemetry-repository.ts:117/340 `record.regime as MarketRegime`).
      // A runtime allow-list would hardcode regime string literals, which the
      // regime-mapping-integrity governance test forbids outside config/tests.
      const regime = this.telemetry.getCurrentMarketRegime() as MarketRegime;
      const mode = (process.env.MODE as 'live' | 'paper') || 'paper';
      currentRatio = await adaptiveRatioManager.computeAdaptiveRatio(regime, mode);
      idealRatio = currentRatio.idealRatio;
      rotationalRatio = currentRatio.rotationalRatio;
    } else {
      // Fallback to static config
      idealRatio = SCANNER_PARAMS.DUAL_POOL.IDEAL_RATIO;
      rotationalRatio = SCANNER_PARAMS.DUAL_POOL.ROTATIONAL_RATIO;
    }
    
    // Directive 11.4B.2-R1 (M64): Underflow Protection with guaranteed BATCH_SIZE-pair cycles
    // 1. Check available ideal pool pairs first
    // 2. Calculate actualIdeal = min(target, available)
    // 3. actualRotational = 100 - actualIdeal (guarantees full batch)
    const targetIdealCount = Math.ceil(batchSize * idealRatio);
    
    // M64: Get count of available ideal pairs BEFORE fetching
    const availableIdealCount = this.telemetry.getAvailableIdealPoolCount();
    const actualIdealCount = Math.min(targetIdealCount, availableIdealCount);
    const actualRotationalCount = batchSize - actualIdealCount; // M64: Always total 100
    
    console.log(`[11.4B.2-R1][AdaptiveScan] Target: Ideal=${targetIdealCount}, Available=${availableIdealCount}, Actual=${actualIdealCount}+${actualRotationalCount}=${batchSize} (M64)`);
    
    // Get ideal pairs from telemetry (top performers only)
    const idealPairs = this.telemetry.getTopPairs(actualIdealCount);
    
    // Directive 11.4B.2-R1: Dynamic fill - remaining slots go to rotational
    const isDynamicFill = actualIdealCount < targetIdealCount;
    
    if (isDynamicFill) {
      console.log(`[11.4B.2-R1][AdaptiveScan] UNDERFLOW PROTECTION: Ideal deficit=${targetIdealCount - actualIdealCount}, rotational expanded to ${actualRotationalCount}`);
    }
    
    // Get rotational pairs for exploration (expanded if ideal was insufficient)
    const rotationalPairs = this.telemetry.getRotationalPairs(actualRotationalCount, allAvailablePairs)
      .filter(p => !idealPairs.includes(p)) // No duplicates
      .slice(0, actualRotationalCount);
    
    // Directive 11.4H.3 Task 4: Rotation Audit Logging
    const rotationSource = allAvailablePairs.length > 0 ? 'Kraken symbol map' : 'telemetry fallback';
    console.log(`[RotationAudit] Source: ${rotationSource} | allAvailablePairs: ${allAvailablePairs.length} | rotationalCandidates: ${rotationalPairs.length}`);
    console.log(`[RotationAudit] First 10 rotational: ${rotationalPairs.slice(0, 10).join(', ')}`);
    
    // Directive 11.4H.5 Task 1: Benchmark Force-Inclusion
    // Always inject benchmark pairs regardless of telemetry scores
    const benchmarkPairs = allAvailablePairs.filter(p => isBenchmarkSymbol(p));
    const injectedBenchmarks = benchmarkPairs.filter(p => 
      !idealPairs.includes(p) && !rotationalPairs.includes(p)
    );
    
    if (injectedBenchmarks.length > 0) {
      console.log(`[11.4H.5][Benchmark] Injected ${injectedBenchmarks.length} benchmark pairs: ${injectedBenchmarks.slice(0, 5).join(', ')}${injectedBenchmarks.length > 5 ? '...' : ''}`);
    }
    
    // Batch 52: PairFailureTracker cooldown REMOVED (Kyle directive 2026-04-06)
    // Cooldown was redundant — batch size is fixed at ~300 per cycle regardless.
    // Adaptive ratio manager + ideal/rotational selection controls what gets scanned.
    const combined = [...idealPairs, ...rotationalPairs, ...injectedBenchmarks];
    const uniqueCombined = [...new Set(combined)]; // Deduplicate
    const excludedPairs: string[] = []; // No cooldown exclusions

    // Directive 11.4C-R2: Initialization guard - retry if batch is underfilled
    if (uniqueCombined.length < batchSize && retryAttempt < MAX_RETRIES) {
      console.warn(`[11.4C-R2][AdaptiveScan] Underfilled batch: ${uniqueCombined.length}/${batchSize}. Retrying in 5s...`);
      await sleep(5000);
      return this.getNextScanBatch(allAvailablePairs, retryAttempt + 1);
    }

    // Create batch result with ratio tracking (11.2 R1)
    // Directive 11.4H.5: Include benchmark pairs in batch for tracking
    const batch: AdaptiveScanBatch = {
      idealPairs,
      rotationalPairs,
      benchmarkPairs: injectedBenchmarks,
      excludedPairs,
      totalBatch: uniqueCombined,
      timestamp: Date.now(),
      ratioUsed: currentRatio,
      retryCount: retryAttempt, // Directive 11.4C-R2: Track retries
    };
    
    this.lastBatch = batch;
    
    // Directive 11.4B.2-R1: Log actual composition achieved
    const actualIdealRatio = batch.totalBatch.length > 0 ? batch.idealPairs.length / batch.totalBatch.length : 0;
    const actualRotationalRatio = batch.totalBatch.length > 0 ? batch.rotationalPairs.length / batch.totalBatch.length : 0;
    console.log(`[11.4B.2-R1][AdaptiveScan] Cycle composed of ${batch.idealPairs.length} ideal + ${batch.rotationalPairs.length} rotational pairs (${(actualIdealRatio * 100).toFixed(0)}%/${(actualRotationalRatio * 100).toFixed(0)}%)${isDynamicFill ? ' [UNDERFLOW]' : ''}`);
    
    // M64/M65 Governance: Warn if total batch still < 100 after retry
    if (batch.totalBatch.length < batchSize) {
      console.warn(`[11.4C-R2][M65] WARNING: Batch size ${batch.totalBatch.length} < ${batchSize} after ${retryAttempt} retry(s). Check allAvailablePairs source.`);
    }
    
    return batch;
  }

  /**
   * Directive 11.4B.2-R1: Get available pairs in ideal pool
   * Used for underflow protection calculation
   */
  getAvailablePairs(pool: 'ideal' | 'rotational'): string[] {
    if (pool === 'ideal') {
      return this.telemetry.getTopPairs(SCANNER_PARAMS.BATCH_SIZE);
    }
    return []; // Rotational is computed from allAvailablePairs
  }

  /**
   * Record scan result for a pair
   * Directive 11.2 R1: Now includes pool tracking for segmented performance
   * Directive 11.4C-R2: VTS is the single source of truth for telemetry
   * Scanner only tracks pass/fail for failure cooldown - no telemetry recording
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
    // Batch 52: PairFailureTracker recording disabled (cooldown removed)
    // if (success) { this.failureTracker.recordSuccess(symbol); }
    // else { this.failureTracker.recordFailure(symbol, data?.failureReason); }
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
