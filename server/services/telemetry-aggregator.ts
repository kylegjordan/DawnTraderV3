/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 10.8 — Telemetry Aggregator Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Collects and aggregates performance telemetry for adaptive pair selection.
 * Tracks FinalScore, HybridScore, RegimeWeight, and PredictiveConfidence per pair.
 * Provides ranked pair lists for the AdaptiveScanManager.
 * 
 * Features:
 * - Rolling 24-hour history window
 * - Weighted composite scoring for pair ranking
 * - Timeframe efficiency reporting for ML calibration
 * - Cascade efficiency tracking
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SCANNER_PARAMS, FILTER_SCHEMA_VERSION } from '../config/system-guards.js';
import { getScoreWeightsMetadata, SCORE_WEIGHTS_VERSION } from '../config/score-weights.config.js';
import { EXECUTION_CONFIG } from '../config/execution-config.js';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE, METRIC_ENGINE_VERSION } from '../config/schema-version.js';
import { 
  loadRecentTelemetry, 
  saveTelemetryRecord, 
  shouldPersist,
  type MarketRegime,
  type TelemetryEntry 
} from './telemetry-repository.js';
import { 
  loadAdaptiveWeightsWithTimestamps,
  saveAdaptiveWeights,
  type AdaptiveWeights 
} from './adaptive-learning-repository.js';
import { adaptiveManager, type TimestampedWeightEntry } from '../core/adaptive-manager.js';
import { DynamicStrategySelector, type DSSMetrics } from './dynamic-strategy-selector.js';
import {
  getTypeForStrategy,
  getPatternForStrategy,
  selectPrimaryStrategy,
  normalizeRegime,
  type CanonicalRegimeType
} from '../config/canonical-regime-strategy-map.js';

export type PoolType = 'ideal' | 'rotational';

/**
 * Directive 11.0E.2: Source type for data segregation
 */
export type TelemetrySource = 'simulation' | 'live';

export interface PairTelemetry {
  symbol: string;
  finalScore: number;
  hybridScore: number;
  regimeWeight: number;
  predictiveConfidence: number;
  lastUpdated: number;
  lastUpdatedIso?: string; // Directive 11.4C.3-B: ISO 8601 timestamp for UI display
  sampleCount: number;
  successRate: number;
  avgDecayedStrength: number;
  timeframe?: '1h' | '15m' | '5m';
  pairRegime?: MarketRegime; // Directive 11.4C-R2: Per-pair regime at scan time
  pattern?: string; // Directive 11.4C.3: Pattern name for HYBRID/PATTERN signals (empty for QUANT)
  pool?: PoolType; // Directive 11.2 R1: Source pool for segmented tracking
  source?: TelemetrySource; // Directive 11.0E.2: simulation vs live segregation
  signalType?: string; // Directive 11.4C.3: Signal type from VTS (HYBRID/QUANT/PATTERN)
  strategy?: string; // Directive 11.4C-R2: Strategy name from VTS
}

export interface TimeframeEfficiency {
  timeframe: '1h' | '15m' | '5m';
  avgDecayedStrength: number;
  sampleCount: number;
  successRate: number;
}

export interface CascadeEfficiency {
  global: number;
  tactical: number;
  precision: number;
  tacticalRatio: number;
  precisionRatio: number;
  timestamp: number;
}

/**
 * Directive 11.2 R1: Pool-level performance aggregates for dynamic ratio balancing
 */
export interface PoolPerformanceAggregate {
  pool: PoolType;
  winRate: number;
  sampleCount: number;
  totalTrades: number;
  successfulTrades: number;
  avgFinalScore: number;
  lastUpdated: number;
}

/**
 * Directive 11.2 R1: Pair selection result with explicit pool attribution
 */
export interface PairWithPool {
  symbol: string;
  pool: PoolType;
  score: number;
}

export class TelemetryAggregatorService {
  private pairTelemetry: Map<string, PairTelemetry[]> = new Map();
  private cascadeHistory: CascadeEfficiency[] = [];
  private readonly historyWindowMs = SCANNER_PARAMS.TELEMETRY.HISTORY_WINDOW_MS;
  private readonly minSamples = SCANNER_PARAMS.TELEMETRY.MIN_SAMPLES;
  private dss = new DynamicStrategySelector();
  private currentRegime: MarketRegime = 'LOW_VOL_CHOP';
  private rehydrated = false;
  
  // Directive 11.2 R1: Pool-level performance tracking
  private poolAggregates: Map<PoolType, PoolPerformanceAggregate> = new Map([
    ['ideal', { pool: 'ideal', winRate: 0.5, sampleCount: 0, totalTrades: 0, successfulTrades: 0, avgFinalScore: 0, lastUpdated: Date.now() }],
    ['rotational', { pool: 'rotational', winRate: 0.5, sampleCount: 0, totalTrades: 0, successfulTrades: 0, avgFinalScore: 0, lastUpdated: Date.now() }],
  ]);

  /**
   * Record telemetry for a pair
   * Directive 11.2 R1: Added pool parameter for segmented performance tracking
   * Directive 11.0E.2: Added source parameter for simulation/live segregation
   * Directive 11.4C.1: Only VTS can write telemetry (caller must identify as 'vts')
   */
  recordPairTelemetry(
    symbol: string,
    data: {
      finalScore: number;
      hybridScore?: number;
      regimeWeight?: number;
      predictiveConfidence?: number;
      success?: boolean;
      decayedStrength?: number;
      timeframe?: '1h' | '15m' | '5m';
      pool?: PoolType; // Directive 11.2 R1: ideal or rotational
      source?: TelemetrySource; // Directive 11.0E.2: simulation or live
      pairRegime?: MarketRegime; // Directive 11.4C-R2: Per-pair regime
      pattern?: string; // Directive 11.4C.3: Pattern name for HYBRID/PATTERN signals (empty for QUANT)
      signalType?: string; // Directive 11.4C.3: Signal type from VTS (HYBRID/QUANT/PATTERN)
      strategy?: string; // Directive 11.4C-R2: Strategy name from VTS
      caller?: string; // Directive 11.4C.1: Caller identification (must be 'vts')
    }
  ): void {
    // Directive 11.4C.1: Guard against non-VTS writers
    // Only VTS is authorized to write telemetry data (M70 compliance)
    if (data.caller !== 'vts') {
      console.warn(`[11.4C.1][BLOCKED] Telemetry write blocked for ${symbol}: caller="${data.caller || 'unknown'}" (only 'vts' allowed)`);
      return;
    }
    const now = Date.now();
    const existing = this.pairTelemetry.get(symbol) || [];
    
    // Prune old entries outside the history window
    const recent = existing.filter(t => now - t.lastUpdated < this.historyWindowMs);
    
    // Directive 11.4C-R2: VTS is the single source of truth for telemetry
    // All telemetry now comes from VTS with real calculated values (no defaults)
    // Directive 11.4C.3: QUANT signals should NOT have a pattern (purely mathematical)
    // Only HYBRID and PATTERN signals should have pattern names
    const shouldHavePattern = data.signalType !== 'QUANT';
    
    const entry: PairTelemetry = {
      symbol,
      finalScore: data.finalScore,
      hybridScore: data.hybridScore ?? 0,
      regimeWeight: data.regimeWeight ?? 0,
      predictiveConfidence: data.predictiveConfidence ?? 0.5,
      lastUpdated: now,
      lastUpdatedIso: new Date(now).toISOString(), // Directive 11.4C.3-B: ISO 8601 timestamp
      sampleCount: recent.length + 1,
      successRate: data.success !== undefined 
        ? (recent.filter(t => t.successRate > 0.5).length + (data.success ? 1 : 0)) / (recent.length + 1)
        : recent.length > 0 ? recent[recent.length - 1].successRate : 0.5,
      avgDecayedStrength: data.decayedStrength ?? 0,
      timeframe: data.timeframe,
      pool: data.pool ?? 'ideal', // Directive 11.2 R1: Track source pool
      source: data.source ?? 'simulation', // Directive 11.4C-R2: Default to simulation (VTS source)
      pairRegime: data.pairRegime ?? this.currentRegime, // Directive 11.4C-R2: Per-pair or fallback to global
      pattern: shouldHavePattern ? data.pattern : undefined, // Directive 11.4C.3: No pattern for QUANT
      signalType: data.signalType, // Directive 11.4C.3: Store signal type from VTS (HYBRID/QUANT/PATTERN)
      strategy: data.strategy, // Directive 11.4C-R2: Store strategy name from VTS
    };
    
    recent.push(entry);
    this.pairTelemetry.set(symbol, recent);
    
    // Directive 11.2 R1: Update pool-level aggregates
    if (data.pool) {
      this.updatePoolAggregate(data.pool, data.finalScore, data.success);
    }
    
    // Directive 11.0E.2: Include source in telemetry log
    console.log(`[11.0E.2][Telemetry] ${symbol} (${entry.pool}/${entry.source}) recorded: finalScore=${data.finalScore.toFixed(2)}, samples=${recent.length}`);
    
    // Directive 11.1A + 11.2 R1: Persist to SQL with pool tracking
    // Directive 11.4C-R2: Use per-pair regime (not global) for database persistence
    if (shouldPersist()) {
      const mode = (process.env.MODE as 'live' | 'paper') || 'paper';
      this.persistTelemetryAsync({
        symbol,
        mode,
        regime: entry.pairRegime ?? 'TRANSITION', // Use per-pair regime from VTS with fallback
        pool: data.pool ?? 'ideal', // Directive 11.2 R1
        finalScore: data.finalScore,
        hybridScore: data.hybridScore,
        regimeWeight: data.regimeWeight,
        predictiveConfidence: data.predictiveConfidence,
        successRate: entry.successRate,
        sampleCount: entry.sampleCount,
        timeframe: data.timeframe,
      });
    }
  }

  /**
   * Directive 11.1A: Persist telemetry asynchronously
   */
  private async persistTelemetryAsync(entry: TelemetryEntry): Promise<void> {
    try {
      await saveTelemetryRecord(entry);
    } catch (error) {
      console.error('[11.1A][Telemetry] Failed to persist telemetry:', error);
    }
  }

  /**
   * Directive 11.2 R1: Update pool-level performance aggregates
   * Tracks win rate and average scores per pool for dynamic ratio balancing
   */
  private updatePoolAggregate(pool: PoolType, finalScore: number, success?: boolean): void {
    const aggregate = this.poolAggregates.get(pool);
    if (!aggregate) return;

    aggregate.sampleCount++;
    aggregate.avgFinalScore = (
      (aggregate.avgFinalScore * (aggregate.sampleCount - 1) + finalScore) / aggregate.sampleCount
    );
    
    if (success !== undefined) {
      aggregate.totalTrades++;
      if (success) {
        aggregate.successfulTrades++;
      }
      aggregate.winRate = aggregate.totalTrades > 0 
        ? aggregate.successfulTrades / aggregate.totalTrades 
        : 0.5;
    }
    
    aggregate.lastUpdated = Date.now();
    this.poolAggregates.set(pool, aggregate);
    
    console.log(`[11.2R1][Telemetry] Pool ${pool} updated: winRate=${(aggregate.winRate * 100).toFixed(1)}%, samples=${aggregate.sampleCount}`);
  }

  /**
   * Directive 11.2 R1: Get pool performance comparison for AdaptiveRatioManager
   * Returns aggregated performance metrics by pool
   */
  getPoolPerformanceComparison(): { ideal: PoolPerformanceAggregate; rotational: PoolPerformanceAggregate } {
    return {
      ideal: this.poolAggregates.get('ideal') || { 
        pool: 'ideal', winRate: 0.5, sampleCount: 0, totalTrades: 0, successfulTrades: 0, avgFinalScore: 0, lastUpdated: Date.now() 
      },
      rotational: this.poolAggregates.get('rotational') || { 
        pool: 'rotational', winRate: 0.5, sampleCount: 0, totalTrades: 0, successfulTrades: 0, avgFinalScore: 0, lastUpdated: Date.now() 
      },
    };
  }

  /**
   * Directive 11.2 R1: Reset pool aggregates (for testing or regime change)
   */
  resetPoolAggregates(): void {
    this.poolAggregates.set('ideal', { pool: 'ideal', winRate: 0.5, sampleCount: 0, totalTrades: 0, successfulTrades: 0, avgFinalScore: 0, lastUpdated: Date.now() });
    this.poolAggregates.set('rotational', { pool: 'rotational', winRate: 0.5, sampleCount: 0, totalTrades: 0, successfulTrades: 0, avgFinalScore: 0, lastUpdated: Date.now() });
    console.log('[11.2R1][Telemetry] Pool aggregates reset');
  }

  /**
   * Directive 11.4H Task 4: Regime Entropy Monitoring
   * Directive 11.4H.1 Task 4: Enhanced with null filtering and audit persistence
   * Calculates Shannon entropy of regime distribution to detect normalization collapse.
   * Low entropy (<0.2) indicates regime concentration (e.g., all pairs in same regime).
   * @returns Entropy value 0-1 and regime distribution
   */
  computeRegimeEntropy(): { entropy: number; distribution: Record<string, number>; totalPairs: number; validPairs: number } {
    const regimeCounts: Record<string, number> = {
      BULL_STABLE: 0,
      BEAR_VOLATILE: 0,
      LOW_VOL_CHOP: 0,
      HIGH_VOL_IMPULSE: 0,
      TRANSITION: 0
    };
    
    let totalPairs = 0;
    let validPairs = 0;
    
    // Directive 11.4H.1 Task 4: Filter null/undefined regimes before entropy computation
    for (const [symbol, entries] of this.pairTelemetry.entries()) {
      if (entries.length === 0) continue;
      totalPairs++;
      const latest = entries[entries.length - 1];
      const regime = latest.pairRegime;
      
      // Directive 11.4H.1: Skip null/undefined regimes
      if (!regime || regime === null || regime === undefined) {
        continue;
      }
      
      if (regimeCounts[regime] !== undefined) {
        regimeCounts[regime]++;
        validPairs++;
      }
    }
    
    if (validPairs === 0) {
      return { entropy: 0, distribution: regimeCounts, totalPairs, validPairs: 0 };
    }
    
    // Shannon entropy: -sum(p * log2(p))
    let entropy = 0;
    const numRegimes = Object.keys(regimeCounts).length;
    for (const count of Object.values(regimeCounts)) {
      if (count > 0) {
        const p = count / validPairs;
        entropy -= p * Math.log2(p);
      }
    }
    
    // Normalize to 0-1 range (max entropy = log2(numRegimes))
    const maxEntropy = Math.log2(numRegimes);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
    
    // Directive 11.4H.1 Task 4: Enhanced warning trigger with validPairs check
    if (normalizedEntropy < 0.2 && validPairs > 100) {
      console.warn(`[Entropy Alert] Low entropy (${normalizedEntropy.toFixed(3)}) — possible normalization collapse`);
      console.warn(`[11.4H][Regime] Distribution: ${JSON.stringify(regimeCounts)} (validPairs=${validPairs})`);
      
      // Directive 11.4H.1 Task 4: Persist entropy metrics to audit log (async, non-blocking)
      this.persistEntropyAudit(normalizedEntropy, validPairs, regimeCounts);
    }
    
    return { entropy: normalizedEntropy, distribution: regimeCounts, totalPairs, validPairs };
  }
  
  /**
   * Directive 11.4H.1 Task 4: Persist entropy metrics to audit log
   */
  private async persistEntropyAudit(entropy: number, validPairs: number, regimeCounts: Record<string, number>): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const auditDir = path.join(process.cwd(), 'audit', 'reports');
      await fs.mkdir(auditDir, { recursive: true });
      
      const auditEntry = {
        timestamp: new Date().toISOString(),
        entropy: parseFloat(entropy.toFixed(4)),
        validPairs,
        regimeCounts,
        warning: entropy < 0.2
      };
      
      const auditPath = path.join(auditDir, 'regime_entropy_monitor.json');
      let history: any[] = [];
      try {
        const existing = await fs.readFile(auditPath, 'utf-8');
        history = JSON.parse(existing);
      } catch {
        // File doesn't exist yet
      }
      
      history.push(auditEntry);
      // Keep last 100 entries
      if (history.length > 100) history = history.slice(-100);
      
      await fs.writeFile(auditPath, JSON.stringify(history, null, 2));
      console.log(`[11.4H.1][Audit] Entropy persisted to ${auditPath}`);
    } catch (err) {
      console.warn('[11.4H.1][Audit] Failed to persist entropy:', err);
    }
  }

  /**
   * Directive 11.4C.1: Flush placeholder/stale in-memory data on restart
   * Called on service initialization to clear any cached data before rehydrating
   * This clears in-memory cache only - SQL history remains intact for rehydration
   * Note: rehydrated flag stays false to allow proper rehydration of live history
   */
  flushStaleTelemetry(): void {
    const beforeCount = this.pairTelemetry.size;
    this.pairTelemetry.clear();
    this.resetPoolAggregates();
    // Keep rehydrated=false to allow rehydrateTelemetryState() to run and restore live history
    console.log(`[11.4C.1][FLUSH] Cleared ${beforeCount} in-memory entries on restart (SQL history preserved)`);
    console.log(`[11.4C.1][FLUSH] Ready for rehydration from live telemetry + fresh VTS population`);
  }

  /**
   * Directive 11.1A: Update current market regime
   * Call this when market conditions change
   */
  updateMarketRegime(metrics: DSSMetrics): MarketRegime {
    this.currentRegime = this.dss.determineRegime(metrics);
    console.log(`[11.1A][Telemetry] Market regime updated: ${this.currentRegime}`);
    return this.currentRegime;
  }

  /**
   * Directive 11.1A: Get current market regime
   */
  getCurrentMarketRegime(): MarketRegime {
    return this.currentRegime;
  }

  /**
   * Directive 11.1A + 11.1A1 + 11.2 R1: Rehydrate telemetry state from SQL on startup
   * CRITICAL: Only loads live-mode records to prevent test data contamination
   * This ensures adaptive learning operates on verified production data only
   * Directive 11.2 R1: Now includes pool tracking for segmented performance
   */
  async rehydrateTelemetryState(): Promise<number> {
    if (this.rehydrated) {
      console.log('[11.1A1][Telemetry] Already rehydrated, skipping');
      return 0;
    }
    
    // Directive 11.1A1: Always load from 'live' mode only
    // Paper/staging data must never contaminate production intelligence
    const mode: 'live' | 'paper' = 'live';
    
    try {
      const records = await loadRecentTelemetry(this.currentRegime, mode, 100);
      
      for (const record of records) {
        const existing = this.pairTelemetry.get(record.symbol) || [];
        
        // Directive 11.2 R1: Include pool tracking
        const entry: PairTelemetry = {
          symbol: record.symbol,
          finalScore: parseFloat(record.finalScore),
          hybridScore: record.hybridScore ? parseFloat(record.hybridScore) : 0,
          regimeWeight: record.regimeWeight ? parseFloat(record.regimeWeight) : 0,
          predictiveConfidence: record.predictiveConfidence ? parseFloat(record.predictiveConfidence) : 0.5,
          lastUpdated: new Date(record.timestamp).getTime(),
          sampleCount: record.sampleCount ?? 1,
          successRate: record.successRate ? parseFloat(record.successRate) : 0.5,
          avgDecayedStrength: 0,
          timeframe: record.timeframe as '1h' | '15m' | '5m' | undefined,
          pool: (record.pool as PoolType) ?? 'ideal', // Directive 11.2 R1: Restore pool tracking
        };
        
        existing.push(entry);
        this.pairTelemetry.set(record.symbol, existing);
      }
      
      this.rehydrated = true;
      console.log(`[11.2R1][Telemetry] Rehydrated ${records.length} live entries for regime=${this.currentRegime} with pool tracking`);
      return records.length;
    } catch (error) {
      console.error('[11.1A][Telemetry] Failed to rehydrate telemetry:', error);
      return 0;
    }
  }

  /**
   * Directive 11.1B: Rehydrate adaptive learning weights from SQL
   * Loads weights with timestamps and applies time-based decay
   */
  async rehydrateAdaptiveLearning(): Promise<number> {
    const regime = this.getCurrentMarketRegime();
    
    try {
      const results = await loadAdaptiveWeightsWithTimestamps(regime);
      
      if (results.length === 0) {
        console.log(`[11.1B][Learning] No adaptive weights found for regime=${regime}`);
        return 0;
      }
      
      const timestampedWeights = new Map<string, TimestampedWeightEntry>(
        results.map(r => [
          r.strategyId, 
          { 
            weights: JSON.parse(r.weights) as AdaptiveWeights, 
            updatedAt: new Date(r.updatedAt) 
          }
        ])
      );
      
      adaptiveManager.initializeWithTimestamps(timestampedWeights);
      console.log(`[Learning] Rehydrated ${timestampedWeights.size} adaptive profiles for ${regime}`);
      return timestampedWeights.size;
    } catch (error) {
      console.error('[11.1B][Learning] Failed to rehydrate adaptive weights:', error);
      return 0;
    }
  }

  /**
   * Directive 11.1B: Persist current adaptive learning weights
   * IMPORTANT: Preserves original timestamps for time-based decay on rehydration
   */
  async persistAdaptiveLearning(): Promise<number> {
    if (!shouldPersist()) {
      return 0;
    }
    
    const regime = this.getCurrentMarketRegime();
    const allWeights = adaptiveManager.getAllWeights();
    let savedCount = 0;
    
    for (const [strategyId, weights] of allWeights.entries()) {
      const originalTimestamp = adaptiveManager.getWeightTimestamp(strategyId);
      const success = await saveAdaptiveWeights(strategyId, regime, weights, undefined, originalTimestamp);
      if (success) savedCount++;
    }
    
    console.log(`[Learning] Persisted ${savedCount} adaptive weight profiles with original timestamps`);
    return savedCount;
  }

  /**
   * Get composite score for a pair based on weighted telemetry
   * Directive 11.4B.2-R1: Removes minSamples requirement for immediate high-performer promotion (M63)
   */
  getCompositeScore(symbol: string): number {
    const entries = this.pairTelemetry.get(symbol);
    if (!entries || entries.length === 0) {
      return 0; // No data at all
    }
    
    const weights = SCANNER_PARAMS.TELEMETRY.SCORE_WEIGHTS;
    const latest = entries[entries.length - 1];
    
    const score = 
      latest.finalScore * weights.FINAL_SCORE +
      latest.hybridScore * weights.HYBRID_SCORE +
      latest.regimeWeight * weights.REGIME_WEIGHT +
      latest.predictiveConfidence * weights.PREDICTIVE_CONF;
    
    return Math.min(1, Math.max(0, score));
  }

  /**
   * Get top-performing pairs (Ideal Pool)
   * Directive 11.4C.1: Now accepts explicit count instead of ratio
   * @param count - Number of top pairs to return (e.g., 60 for 60 pairs)
   */
  getTopPairs(count: number): string[] {
    const pairs = this.getTopPairsWithPool(count);
    return pairs.map(p => p.symbol);
  }

  /**
   * Directive 11.2 R1: Get top pairs with explicit pool attribution
   * Directive 11.4C.1: Now accepts explicit count instead of ratio
   * Directive 11.4B.2-R1: Removes samples<3 requirement, filters performanceScore===0.5 (M63)
   */
  getTopPairsWithPool(count: number): PairWithPool[] {
    const now = Date.now();
    const scoredPairs: Array<{ symbol: string; score: number }> = [];
    const DEFAULT_SCORE = 0.5; // M63: Default/unscored pairs are excluded from Ideal Pool
    const SCORE_TOLERANCE = 0.001; // Floating point tolerance
    
    for (const [symbol, entries] of this.pairTelemetry.entries()) {
      // Filter to recent entries only
      const recent = entries.filter(t => now - t.lastUpdated < this.historyWindowMs);
      if (recent.length === 0) continue;
      
      const score = this.getCompositeScore(symbol);
      
      // Directive 11.4B.2-R1 (M63): Only include pairs with non-default performanceScore
      // Removes legacy "three-sample" requirement for immediate promotion of high-performers
      // Use tolerance for floating point comparison
      const isDefaultScore = Math.abs(score - DEFAULT_SCORE) < SCORE_TOLERANCE;
      if (score !== undefined && !isDefaultScore && score > SCORE_TOLERANCE) {
        scoredPairs.push({ symbol, score });
      }
    }
    
    // Sort by score descending
    scoredPairs.sort((a, b) => b.score - a.score);
    
    // Directive 11.4C.1: Use explicit count directly
    const topPairs = scoredPairs.slice(0, count).map(p => ({
      symbol: p.symbol,
      pool: 'ideal' as PoolType,
      score: p.score,
    }));
    
    console.log(`[11.4B.2-R1][Telemetry] getTopPairs(count=${count}): ${topPairs.length} pairs selected (M63: score!=0.5 filter)`);
    return topPairs;
  }

  /**
   * Directive 11.4B.2-R1: Get count of available ideal pool pairs
   * Used for underflow protection calculation (M64)
   */
  getAvailableIdealPoolCount(): number {
    const now = Date.now();
    const DEFAULT_SCORE = 0.5;
    const SCORE_TOLERANCE = 0.001;
    let count = 0;
    
    for (const [symbol, entries] of this.pairTelemetry.entries()) {
      const recent = entries.filter(t => now - t.lastUpdated < this.historyWindowMs);
      if (recent.length === 0) continue;
      
      const score = this.getCompositeScore(symbol);
      const isDefaultScore = Math.abs(score - DEFAULT_SCORE) < SCORE_TOLERANCE;
      if (score !== undefined && !isDefaultScore && score > SCORE_TOLERANCE) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * Get rotational pairs for exploration (pairs with limited samples)
   * These are pairs that haven't been scanned recently or have insufficient data
   * Directive 11.4C.1: Now accepts explicit count instead of ratio
   * @param count - Number of rotational pairs to return (e.g., 40 for 40 pairs)
   */
  getRotationalPairs(count: number, allPairs: string[]): string[] {
    const pairs = this.getRotationalPairsWithPool(count, allPairs);
    return pairs.map(p => p.symbol);
  }

  /**
   * Directive 11.2 R1: Get rotational pairs with explicit pool attribution
   * Directive 11.4C.1: Now accepts explicit count instead of ratio
   * Directive 11.4B.2-R1: Includes pairs with default score (0.5) or no score (M63)
   */
  getRotationalPairsWithPool(count: number, allPairs: string[]): PairWithPool[] {
    const now = Date.now();
    const DEFAULT_SCORE = 0.5;
    const SCORE_TOLERANCE = 0.001;
    const rotationalCandidates: string[] = [];
    
    for (const symbol of allPairs) {
      const entries = this.pairTelemetry.get(symbol);
      
      // Directive 11.4B.2-R1 (M63): Include pairs with no entries, default score, or stale data
      if (!entries || entries.length === 0) {
        rotationalCandidates.push(symbol);
        continue;
      }
      
      const score = this.getCompositeScore(symbol);
      const isDefaultScore = Math.abs(score - DEFAULT_SCORE) < SCORE_TOLERANCE;
      
      // Include pairs with default/unscored performance (M63: performanceScore === 0.5)
      if (isDefaultScore || score < SCORE_TOLERANCE) {
        rotationalCandidates.push(symbol);
        continue;
      }
      
      // Also include pairs not scanned in the last hour (stale data)
      const lastEntry = entries[entries.length - 1];
      if (now - lastEntry.lastUpdated > 3600000) {
        rotationalCandidates.push(symbol);
      }
    }
    
    // Shuffle for random rotation
    const shuffled = rotationalCandidates.sort(() => Math.random() - 0.5);
    // Directive 11.4C.1: Use explicit count directly
    const rotationalPairs = shuffled.slice(0, count).map(symbol => ({
      symbol,
      pool: 'rotational' as PoolType,
      score: 0, // Rotational pairs don't have established scores
    }));
    
    console.log(`[11.4B.2-R1][Telemetry] getRotationalPairs(count=${count}): ${rotationalPairs.length} pairs selected`);
    return rotationalPairs;
  }

  /**
   * Directive 11.0E.2: Get pairs filtered by source (simulation/live)
   * Enables data segregation for ML training and analysis
   */
  getPairsBySource(source: TelemetrySource): PairWithPool[] {
    const now = Date.now();
    const result: PairWithPool[] = [];
    
    for (const [symbol, entries] of this.pairTelemetry.entries()) {
      const sourceFiltered = entries.filter(t => 
        t.source === source && 
        now - t.lastUpdated < this.historyWindowMs
      );
      
      if (sourceFiltered.length > 0) {
        const lastEntry = sourceFiltered[sourceFiltered.length - 1];
        result.push({
          symbol,
          pool: lastEntry.pool ?? 'ideal',
          score: lastEntry.finalScore,
        });
      }
    }
    
    return result;
  }

  /**
   * Directive 11.0E.2: Get aggregate metrics filtered by source
   */
  getSourceMetrics(source: TelemetrySource): { count: number; avgFinalScore: number; sampleCount: number } {
    const pairs = this.getPairsBySource(source);
    if (pairs.length === 0) {
      return { count: 0, avgFinalScore: 0, sampleCount: 0 };
    }
    
    let totalScore = 0;
    let totalSamples = 0;
    
    for (const pair of pairs) {
      const entries = this.pairTelemetry.get(pair.symbol) || [];
      const sourceFiltered = entries.filter(t => t.source === source);
      totalScore += sourceFiltered.reduce((sum, e) => sum + e.finalScore, 0);
      totalSamples += sourceFiltered.length;
    }
    
    return {
      count: pairs.length,
      avgFinalScore: totalSamples > 0 ? totalScore / totalSamples : 0,
      sampleCount: totalSamples,
    };
  }

  /**
   * Record cascade efficiency metrics
   */
  recordCascadeEfficiency(global: number, tactical: number, precision: number): void {
    const efficiency: CascadeEfficiency = {
      global,
      tactical,
      precision,
      tacticalRatio: global > 0 ? tactical / global : 0,
      precisionRatio: tactical > 0 ? precision / tactical : 0,
      timestamp: Date.now(),
    };
    
    this.cascadeHistory.push(efficiency);
    
    // Keep last 100 entries
    if (this.cascadeHistory.length > 100) {
      this.cascadeHistory = this.cascadeHistory.slice(-100);
    }
    
    console.log(`[10.8][Telemetry] Cascade: Global=${global} → Tactical=${tactical} → Precision=${precision}`);
  }

  /**
   * Get timeframe efficiency report for ML calibration
   */
  getTimeframeEfficiencyReport(): TimeframeEfficiency[] {
    const now = Date.now();
    const timeframes: ('1h' | '15m' | '5m')[] = ['1h', '15m', '5m'];
    const report: TimeframeEfficiency[] = [];
    
    for (const tf of timeframes) {
      let totalStrength = 0;
      let totalSuccess = 0;
      let sampleCount = 0;
      
      for (const entries of this.pairTelemetry.values()) {
        const tfEntries = entries.filter(
          e => e.timeframe === tf && now - e.lastUpdated < this.historyWindowMs
        );
        
        for (const e of tfEntries) {
          totalStrength += e.avgDecayedStrength;
          totalSuccess += e.successRate;
          sampleCount++;
        }
      }
      
      report.push({
        timeframe: tf,
        avgDecayedStrength: sampleCount > 0 ? totalStrength / sampleCount : 0,
        sampleCount,
        successRate: sampleCount > 0 ? totalSuccess / sampleCount : 0,
      });
    }
    
    console.log('[10.8][Telemetry] Timeframe Efficiency Report:', report);
    return report;
  }

  /**
   * Get cascade efficiency history
   */
  getCascadeHistory(): CascadeEfficiency[] {
    return [...this.cascadeHistory];
  }

  /**
   * Get all pair statistics
   */
  getAllPairStats(): Map<string, { score: number; samples: number; lastUpdated: number }> {
    const stats = new Map<string, { score: number; samples: number; lastUpdated: number }>();
    
    for (const [symbol, entries] of this.pairTelemetry.entries()) {
      if (entries.length > 0) {
        const latest = entries[entries.length - 1];
        stats.set(symbol, {
          score: this.getCompositeScore(symbol),
          samples: entries.length,
          lastUpdated: latest.lastUpdated,
        });
      }
    }
    
    return stats;
  }

  /**
   * Directive 11.4C-R2: Get ranked pairs with full metadata for Top Batch UI (M66)
   * Returns ordered list with rank, symbol, score, signalType, strategy, pattern, regime, source
   */
  getRankedPairs(limit: number = 100): Array<{
    rank: number;
    symbol: string;
    score: number;
    signalType: string;
    strategy: string;
    pattern: string;
    regime: string;
    source: TelemetrySource;
    lastUpdated: string; // Directive 11.4C.3-B: ISO 8601 timestamp
  }> {
    const now = Date.now();
    const scoredPairs: Array<{ 
      symbol: string; 
      score: number; 
      entry: PairTelemetry;
    }> = [];
    
    for (const [symbol, entries] of this.pairTelemetry.entries()) {
      const recent = entries.filter(t => now - t.lastUpdated < this.historyWindowMs);
      if (recent.length === 0) continue;
      
      const score = this.getCompositeScore(symbol);
      const latest = recent[recent.length - 1];
      
      if (score > 0) {
        scoredPairs.push({ symbol, score, entry: latest });
      }
    }
    
    // Sort by score descending
    scoredPairs.sort((a, b) => b.score - a.score);
    
    // Map to ranked output with metadata
    // Directive 11.4F.1A: Use stored values from VTS, derive pattern from canonical mapping
    // QUANT signals should NOT have a pattern (purely mathematical)
    const rankedPairs = scoredPairs.slice(0, limit).map((p, index) => {
      // Use stored signalType/strategy from VTS only - no inference fallback
      // For legacy data without these fields, use placeholder to avoid misleading "AdaptiveFlow"
      const signalType = p.entry.signalType ?? '—';
      const strategy = p.entry.strategy ?? '—';
      
      // Directive 11.4F.1A: Derive pattern from canonical mapping for HYBRID/PATTERN signals
      let pattern = '—';
      if (signalType !== 'QUANT' && signalType !== '—') {
        const canonicalPattern = this.getPatternTypeForEntry(p.entry);
        pattern = canonicalPattern ?? p.entry.pattern ?? '—';
      }
      
      return {
        rank: index + 1,
        symbol: p.symbol,
        score: parseFloat(p.score.toFixed(4)),
        signalType,
        strategy,
        pattern,
        regime: p.entry.pairRegime ?? this.currentRegime, // Directive 11.4C-R2: Use per-pair regime with fallback
        source: p.entry.source ?? 'simulation', // Directive 11.4C-R2: Default to simulation if not set
        lastUpdated: p.entry.lastUpdatedIso ?? new Date(p.entry.lastUpdated).toISOString(), // Directive 11.4C.3-B
      };
    });
    
    console.log(`[11.4C.3-B][Telemetry] getRankedPairs(limit=${limit}): ${rankedPairs.length} pairs returned`);
    return rankedPairs;
  }

  /**
   * Directive 11.4F.1A: Get signal type from canonical mapping
   * Uses stored strategy to derive canonical signal type
   */
  private inferSignalType(entry: PairTelemetry): string {
    if (entry.strategy) {
      return getTypeForStrategy(entry.strategy);
    }
    if (entry.hybridScore > 0.5 && entry.predictiveConfidence > 0.5) {
      return 'HYBRID';
    } else if (entry.hybridScore > 0.3) {
      return 'QUANT';
    } else if (entry.avgDecayedStrength > 0.3) {
      return 'PATTERN';
    }
    return 'HYBRID';
  }

  /**
   * Directive 11.4F.1A: Infer strategy from canonical regime-strategy map
   * Uses normalizeRegime and selectPrimaryStrategy from canonical source (deterministic)
   */
  private inferStrategy(entry: PairTelemetry): string {
    const rawRegime = entry.pairRegime ?? this.currentRegime;
    const regime = normalizeRegime(rawRegime) as CanonicalRegimeType;
    const { strategy } = selectPrimaryStrategy(regime);
    return strategy;
  }
  
  /**
   * Directive 11.4F.1A: Get pattern type from canonical mapping
   */
  private getPatternTypeForEntry(entry: PairTelemetry): string | null {
    if (entry.strategy) {
      return getPatternForStrategy(entry.strategy);
    }
    return entry.pattern ?? null;
  }

  /**
   * Clear all telemetry data
   */
  clear(): void {
    this.pairTelemetry.clear();
    this.cascadeHistory = [];
    console.log('[10.8][Telemetry] All telemetry data cleared');
  }

  /**
   * Directive 11.0G: Validate telemetry schema between backend and frontend
   * 
   * Compares schema versions and returns validation result.
   */
  validateSchemaSync(frontendSchemaVersion?: string): {
    isValid: boolean;
    health: 'green' | 'yellow' | 'red';
    backendVersion: string;
    frontendVersion: string | null;
    mismatchReason: string | null;
  } {
    const backendVersion = SCHEMA_VERSION;
    
    if (!frontendSchemaVersion) {
      return {
        isValid: false,
        health: 'yellow',
        backendVersion,
        frontendVersion: null,
        mismatchReason: 'Frontend schema version not provided',
      };
    }
    
    if (backendVersion !== frontendSchemaVersion) {
      console.warn(`[Telemetry] Schema mismatch detected: backend=${backendVersion}, frontend=${frontendSchemaVersion}`);
      return {
        isValid: false,
        health: 'yellow',
        backendVersion,
        frontendVersion: frontendSchemaVersion,
        mismatchReason: `Version mismatch: backend=${backendVersion}, frontend=${frontendSchemaVersion}`,
      };
    }
    
    return {
      isValid: true,
      health: 'green',
      backendVersion,
      frontendVersion: frontendSchemaVersion,
      mismatchReason: null,
    };
  }

  /**
   * Directive 11.0G: Get telemetry summary with Metric Engine v1.0 metadata
   * 
   * Returns system configuration with FinalScore-canonical metrics.
   * Includes schema validation status for frontend sync checking.
   * Legacy configProvenance fields removed - replaced by systemConfig.
   */
  getTelemetrySummaryWithCoefficients(frontendSchemaVersion?: string): {
    version: string;
    pairCount: number;
    totalSamples: number;
    weights: { hybrid: number; confidence: number; regime: number; decay: number };
    timestamp: string;
    systemConfig: {
      metricEngineVersion: string;
      schemaVersion: string;
      directive: string;
      telemetryHealth: 'green' | 'yellow' | 'red';
    };
    schemaSync?: {
      isValid: boolean;
      mismatchReason: string | null;
    };
    tecConfig?: {
      expandFactor: number;
      contractFactor: number;
      trailingBase: number;
      trailingAccel: number;
      maxRisk: number;
      version: string;
      readOnly: boolean;
    };
    fx5Evaluated24h?: number;
    fx5Passed24h?: number;
    passRate24h?: number;
    failedByCategory?: Record<string, number>;
  } {
    const coefficients = getScoreWeightsMetadata();
    let totalSamples = 0;
    
    for (const entries of this.pairTelemetry.values()) {
      totalSamples += entries.length;
    }

    // 10.9E: Get filter performance data from FilterInsightsService
    let filterPerformance: {
      fx5Evaluated24h: number;
      fx5Passed24h: number;
      passRate24h: number;
      failedByCategory: Record<string, number>;
    } = {
      fx5Evaluated24h: 0,
      fx5Passed24h: 0,
      passRate24h: 0,
      failedByCategory: {},
    };

    try {
      const { getFilterInsightsService } = require('./filter-insights.service.js');
      const filterInsights = getFilterInsightsService();
      const stats = filterInsights.getFilterStats();
      
      filterPerformance = {
        fx5Evaluated24h: stats.totalEvaluated,
        fx5Passed24h: stats.passed,
        passRate24h: stats.totalEvaluated > 0 
          ? parseFloat(((stats.passed / stats.totalEvaluated) * 100).toFixed(1))
          : 0,
        failedByCategory: stats.failuresByFilter,
      };
    } catch (error) {
      console.warn('[10.9F][Telemetry] FilterInsights not available for summary:', error);
    }
    
    // Directive 11.0G: Validate schema sync if frontend version provided
    const schemaValidation = this.validateSchemaSync(frontendSchemaVersion);
    
    const summary = {
      version: SCORE_WEIGHTS_VERSION,
      pairCount: this.pairTelemetry.size,
      totalSamples,
      weights: {
        hybrid: coefficients.weights.HYBRID,
        confidence: coefficients.weights.CONFIDENCE,
        regime: coefficients.weights.REGIME,
        decay: coefficients.weights.DECAY,
      },
      timestamp: new Date().toISOString(),
      systemConfig: {
        metricEngineVersion: METRIC_ENGINE_VERSION,
        schemaVersion: SCHEMA_VERSION,
        directive: SCHEMA_DIRECTIVE,
        telemetryHealth: schemaValidation.health,
      },
      schemaSync: {
        isValid: schemaValidation.isValid,
        mismatchReason: schemaValidation.mismatchReason,
      },
      tecConfig: {
        expandFactor: EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR,
        contractFactor: EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR,
        trailingBase: EXECUTION_CONFIG.TRAILING_STOP_BASE,
        trailingAccel: EXECUTION_CONFIG.TRAILING_STOP_ACCELERATION,
        maxRisk: EXECUTION_CONFIG.MAX_POSITION_RISK,
        version: EXECUTION_CONFIG.VERSION,
        readOnly: true,
      },
      ...filterPerformance,
    };
    
    console.log(`[${SCHEMA_DIRECTIVE}][Telemetry] Summary with coefficients (${SCORE_WEIGHTS_VERSION}, filter=${FILTER_SCHEMA_VERSION}):`, JSON.stringify(summary));
    return summary;
  }
}

/**
 * Directive 11.4C-R2: Ranked pair entry with full metadata for UI display
 */
export interface RankedPairEntry {
  rank: number;
  symbol: string;
  score: number;
  signalType: string;
  strategy: string;
  pattern: string;
  regime: string;
  source: TelemetrySource;
}

// Singleton instance
let telemetryInstance: TelemetryAggregatorService | null = null;

export function getTelemetryAggregator(): TelemetryAggregatorService {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryAggregatorService();
    // Directive 11.4C.1 + 11.4C.3-C: Flush stale placeholder data and clear in-memory cache on restart
    // This prevents stale classifications and ensures only real VTS-generated telemetry is used
    telemetryInstance.flushStaleTelemetry();
    console.log('[10.8][Telemetry] TelemetryAggregatorService initialized (11.4C.3-C cache purged on startup)');
  }
  return telemetryInstance;
}

export { TelemetryAggregatorService as TelemetryAggregator };
