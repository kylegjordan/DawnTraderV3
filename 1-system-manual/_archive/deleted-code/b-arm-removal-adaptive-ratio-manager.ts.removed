/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.2 R1 — Adaptive Ratio Manager (Dynamic Pool Balancer)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Dynamically adjusts the ratio between Ideal and Rotational pools based on
 * real-time performance telemetry. Enables fair, regime-aware resource allocation
 * for adaptive pair scanning.
 * 
 * Features:
 * - Pool-segmented performance tracking
 * - Regime-aware ratio computation
 * - Configurable bounds (min/max ratios)
 * - Gradual adjustment to prevent oscillation
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { 
  getPoolComparison, 
  type MarketRegime, 
  type PoolPerformance,
  type PoolComparison 
} from './telemetry-repository.js';
import { getTelemetryAggregator, type PoolPerformanceAggregate, type TelemetryAggregatorService } from './telemetry-aggregator.js';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE } from '../config/schema-version.js';
import { REGIMES } from '../config/canonical-regime-strategy-map.js';

export interface RatioConfig {
  minIdealRatio: number;     // Minimum allocation to ideal pool (default 0.3)
  maxIdealRatio: number;     // Maximum allocation to ideal pool (default 0.9)
  defaultRatio: number;      // Starting ratio when no data (default 0.7)
  adjustmentRate: number;    // How fast to adjust ratios (default 0.1)
  minSamples: number;        // Minimum samples before adjusting (default 10)
}

export interface AdaptiveRatio {
  idealRatio: number;
  rotationalRatio: number;
  regime: MarketRegime;
  confidence: number;
  adjustedAt: number;
  reasoning: string;
}

export interface RatioManagerState {
  currentRatio: AdaptiveRatio;
  idealPerf: PoolPerformance | null;
  rotationalPerf: PoolPerformance | null;
  lastComputed: number;
}

const DEFAULT_CONFIG: RatioConfig = {
  minIdealRatio: 0.3,
  maxIdealRatio: 0.9,
  defaultRatio: 0.7,
  adjustmentRate: 0.1,
  minSamples: 10,
};

export class AdaptiveRatioManager {
  private config: RatioConfig;
  private currentRatio: AdaptiveRatio;
  private lastComparison: PoolComparison | null = null;
  // B79.0a (2026-05-08): optional injected telemetry instance. Crypto path
  // omits this arg → falls back to `getTelemetryAggregator()` global singleton
  // (back-compat). xstock path passes the per-class TelemetryAggregator from
  // `bootstrapXstockSpotInstances()` so per-class telemetry never bleeds into
  // the global crypto telemetry.
  private telemetry: TelemetryAggregatorService | null = null;

  constructor(config: Partial<RatioConfig> = {}, telemetry?: TelemetryAggregatorService) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.telemetry = telemetry ?? null;
    this.currentRatio = {
      idealRatio: this.config.defaultRatio,
      rotationalRatio: 1 - this.config.defaultRatio,
      regime: REGIMES.RANGE_BOUND_STABLE,
      confidence: 0,
      adjustedAt: Date.now(),
      reasoning: 'Initial default ratio - no performance data yet',
    };

    console.log(`[11.2R1][RatioManager] Initialized | schemaVersion=${SCHEMA_VERSION} | directive=${SCHEMA_DIRECTIVE} | telemetry_source=${telemetry ? 'injected' : 'global_singleton'}`);
  }
  
  /**
   * Compute adaptive ratio based on pool performance data
   * Directive 11.2 R1: Now uses both in-memory aggregates and SQL data
   * Directive 11.4C.1: Only uses real VTS-generated scores (telemetry guard + flush on restart)
   */
  async computeAdaptiveRatio(
    regime: MarketRegime,
    mode: 'live' | 'paper' = 'live'
  ): Promise<AdaptiveRatio> {
    try {
      // First, try in-memory pool performance from TelemetryAggregator
      // Directive 11.4C.1: Telemetry now only contains VTS-generated data (no FX5 seeding)
      // B79.0a: prefer injected per-class telemetry instance over global singleton.
      // Crypto path: this.telemetry is null → falls back to getTelemetryAggregator() (back-compat).
      // Xstock path: this.telemetry is the per-class instance from bootstrapXstockSpotInstances().
      const telemetry = this.telemetry ?? getTelemetryAggregator();
      const inMemoryComparison = telemetry.getPoolPerformanceComparison();
      
      // Check if we have sufficient in-memory data
      const hasInMemoryData = 
        inMemoryComparison.ideal.sampleCount >= this.config.minSamples ||
        inMemoryComparison.rotational.sampleCount >= this.config.minSamples;
      
      let idealPerf: PoolPerformance | null = null;
      let rotationalPerf: PoolPerformance | null = null;
      
      if (hasInMemoryData) {
        // Use in-memory data (more recent)
        idealPerf = this.aggregateToPoolPerformance(inMemoryComparison.ideal);
        rotationalPerf = this.aggregateToPoolPerformance(inMemoryComparison.rotational);
        console.log(`[11.2R1][RatioManager] Using in-memory pool data: ideal=${inMemoryComparison.ideal.sampleCount} samples, rotational=${inMemoryComparison.rotational.sampleCount} samples`);
      } else {
        // Fall back to SQL-backed data
        const comparison = await getPoolComparison(regime, mode);
        this.lastComparison = comparison;
        idealPerf = comparison.ideal;
        rotationalPerf = comparison.rotational;
      }
      
      // Not enough data from either pool
      if (!idealPerf && !rotationalPerf) {
        console.log(`[11.2R1][RatioManager] No pool data available for regime=${regime}`);
        return this.currentRatio;
      }
      
      // Calculate combined score for each pool
      const idealScore = this.computePoolScore(idealPerf);
      const rotationalScore = this.computePoolScore(rotationalPerf);
      
      // Compute target ratio based on relative performance
      let targetIdealRatio: number;
      let reasoning: string;
      
      if (idealScore === 0 && rotationalScore === 0) {
        targetIdealRatio = this.config.defaultRatio;
        reasoning = 'Both pools have zero scores, using default ratio';
      } else if (rotationalScore === 0) {
        targetIdealRatio = this.config.maxIdealRatio;
        reasoning = 'Rotational pool inactive, maximizing ideal allocation';
      } else if (idealScore === 0) {
        targetIdealRatio = this.config.minIdealRatio;
        reasoning = 'Ideal pool inactive, maximizing rotational allocation';
      } else {
        // Performance-weighted ratio
        const totalScore = idealScore + rotationalScore;
        targetIdealRatio = idealScore / totalScore;
        
        // Apply confidence-weighted adjustment
        const confidence = this.computeConfidence(idealPerf, rotationalPerf);
        targetIdealRatio = this.applyConfidenceAdjustment(targetIdealRatio, confidence);
        
        reasoning = `Performance-based: ideal=${idealScore.toFixed(3)}, rotational=${rotationalScore.toFixed(3)}, confidence=${confidence.toFixed(2)}`;
      }
      
      // Apply bounds
      targetIdealRatio = Math.max(
        this.config.minIdealRatio,
        Math.min(this.config.maxIdealRatio, targetIdealRatio)
      );
      
      // Gradual adjustment to prevent oscillation
      const adjustedRatio = this.smoothAdjustment(
        this.currentRatio.idealRatio,
        targetIdealRatio
      );
      
      const newRatio: AdaptiveRatio = {
        idealRatio: adjustedRatio,
        rotationalRatio: 1 - adjustedRatio,
        regime,
        confidence: this.computeConfidence(idealPerf, rotationalPerf),
        adjustedAt: Date.now(),
        reasoning,
      };
      
      this.currentRatio = newRatio;
      
      console.log(`[11.2R1][RatioManager] Computed ratio | regime=${regime} | ideal=${adjustedRatio.toFixed(2)} | rotational=${(1-adjustedRatio).toFixed(2)} | ${reasoning}`);
      
      return newRatio;
    } catch (error) {
      console.error('[11.2R1][RatioManager] Failed to compute adaptive ratio:', error);
      return this.currentRatio;
    }
  }
  
  /**
   * Directive 11.2 R1: Convert in-memory aggregate to PoolPerformance format
   */
  private aggregateToPoolPerformance(aggregate: PoolPerformanceAggregate): PoolPerformance | null {
    if (aggregate.sampleCount < this.config.minSamples) {
      return null;
    }
    
    return {
      winRate: aggregate.winRate,
      avgEdge: aggregate.avgFinalScore, // Map avgFinalScore to avgEdge
      sampleCount: aggregate.sampleCount,
    };
  }

  /**
   * Compute pool score from performance metrics
   */
  private computePoolScore(perf: PoolPerformance | null): number {
    if (!perf || perf.sampleCount < this.config.minSamples) {
      return 0;
    }
    
    // Combine win rate and edge for overall score
    // Win rate weighted at 60%, edge at 40%
    return (perf.winRate * 0.6) + (perf.avgEdge * 0.4);
  }
  
  /**
   * Compute confidence based on sample sizes
   */
  private computeConfidence(
    ideal: PoolPerformance | null,
    rotational: PoolPerformance | null
  ): number {
    const idealSamples = ideal?.sampleCount ?? 0;
    const rotationalSamples = rotational?.sampleCount ?? 0;
    const totalSamples = idealSamples + rotationalSamples;
    
    // Confidence scales from 0 to 1 based on total samples
    // At 100+ samples, confidence is capped at 1.0
    return Math.min(1, totalSamples / 100);
  }
  
  /**
   * Apply confidence-weighted adjustment
   * Low confidence = stick closer to default ratio
   */
  private applyConfidenceAdjustment(targetRatio: number, confidence: number): number {
    const defaultWeight = 1 - confidence;
    return (targetRatio * confidence) + (this.config.defaultRatio * defaultWeight);
  }
  
  /**
   * Smooth adjustment to prevent oscillation
   */
  private smoothAdjustment(current: number, target: number): number {
    const diff = target - current;
    const maxAdjustment = this.config.adjustmentRate;
    
    if (Math.abs(diff) <= maxAdjustment) {
      return target;
    }
    
    return current + (Math.sign(diff) * maxAdjustment);
  }
  
  /**
   * Get current ratio without recomputing
   */
  getCurrentRatio(): AdaptiveRatio {
    return this.currentRatio;
  }
  
  /**
   * Get full manager state for diagnostics
   */
  getState(): RatioManagerState {
    return {
      currentRatio: this.currentRatio,
      idealPerf: this.lastComparison?.ideal ?? null,
      rotationalPerf: this.lastComparison?.rotational ?? null,
      lastComputed: this.currentRatio.adjustedAt,
    };
  }
  
  /**
   * Allocate count of pairs between pools based on current ratio
   */
  allocatePairCounts(totalPairs: number): { idealCount: number; rotationalCount: number } {
    const idealCount = Math.round(totalPairs * this.currentRatio.idealRatio);
    const rotationalCount = totalPairs - idealCount;
    
    return { idealCount, rotationalCount };
  }
  
  /**
   * Reset ratio to default (for testing or manual override)
   */
  reset(): void {
    this.currentRatio = {
      idealRatio: this.config.defaultRatio,
      rotationalRatio: 1 - this.config.defaultRatio,
      regime: REGIMES.RANGE_BOUND_STABLE,
      confidence: 0,
      adjustedAt: Date.now(),
      reasoning: 'Manual reset to default ratio',
    };
    this.lastComparison = null;
    console.log('[11.2R1][RatioManager] Reset to default ratio');
  }
}

export const adaptiveRatioManager = new AdaptiveRatioManager();
