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
// B65.2 (2026-04-23): EXECUTION_CONFIG deleted. TEC diagnostic payload below
// mirrors the seeded defaults from `module_constants` (trailing_exit +
// risk_sizing modules). Authoritative per-trade resolution (which honors
// strategy/regime overrides) happens inside trailing-exit-controller.ts itself.
import { REGIMES } from '../config/canonical-regime-strategy-map.js';
// B-4.7 (#162): per-class telemetry records + per-class dominant-regime vote.
import type { AssetClass } from '../../shared/asset-classes.js';
// P19-B7.2a (#330): fee composed at read time from the B-4.5 merge site (the
// cost-cache no longer stores fees); class from the pair entry's AT-WRITE
// stamp (B-4.7 #163 pattern) — pairTelemetry spans BOTH classes.
import { getFrictionForAssetClass } from '../core/math/cost-model.js';
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
// HF9: DSS import removed — DSS deleted
import {
  getTypeForStrategy,
  getPatternForStrategy,
  selectPrimaryStrategy,
  normalizeRegime,
  type CanonicalRegimeType
} from '../config/canonical-regime-strategy-map.js';
import { getCostMetrics, getOrSetCostMetrics } from '../core/cache/cost-cache.js';
import { computeMarketFriction } from '../core/metrics/cost-metrics.js';
import { toCanonical } from './utils/symbol-canonicalizer.js';
import { computeDriftScore, aggregateDriftStats, type DriftScoreResult } from '../core/analytics/mapping-drift-calculator.js';

export type PoolType = 'ideal' | 'rotational';

/**
 * Directive 11.0E.2: Source type for data segregation
 */
export type TelemetrySource = 'simulation' | 'live';

export interface PairTelemetry {
  symbol: string;
  /**
   * B-4.7 (#162): stamped AT WRITE by the VTS lanes (M70 single-writer).
   * Optional only because records rehydrated from pre-B-4.7 disk persists
   * lack it — such records are EXCLUDED from per-class votes and age out
   * within the recency window. New writes always carry it.
   */
  assetClass?: AssetClass;
  finalScore: number;
  hybridScore: number;
  regimeWeight: number;
  regimeScore?: number; // Directive 11.4H.4A: Dynamic 0-100 regime score
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
  volZ?: number; // Directive 11.7F-B: Volatility Z-score for drift calculation
  trendZ?: number; // Directive 11.7F-B: Trend Z-score (momentum) for drift calculation
  volZHistory?: number[]; // Directive 11.7F-B: Rolling 50-sample volZ history
  trendZHistory?: number[]; // Directive 11.7F-B: Rolling 50-sample trendZ history
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
  // HF9: DSS instance removed — DSS deleted
  private currentRegime: string = REGIMES.RANGE_BOUND_STABLE;  // HF9: Fixed stale LOW_VOL_CHOP → canonical name
  private rehydrated = false;
  
  // Memory audit: Z-score histories stored per-symbol (not per-entry). Saves ~40MB.
  private pairZScoreHistory: Map<string, { volZ: number[]; trendZ: number[] }> = new Map();

  // Directive 11.2 R1: Pool-level performance tracking

  // B79.0n.TELEMETRY (2026-05-26): per-instance observability counters
  // for the per-class instance pattern. Read via getRecordCount() /
  // getLastWriteAt() / getPairCount() — aggregated across all 4 active
  // class instances by getTelemetryInstanceStats() in asset-class-instances.ts.
  // Increment site: inside recordPairTelemetry() after the M70 caller guard
  // (blocked writes do NOT increment — preserves M70 signal integrity).
  private _recordCount = 0;
  private _lastWriteAt: number | null = null;

  /**
   * B79.0n.TELEMETRY: monotonic count of accepted recordPairTelemetry() calls
   * since instance construction. Resets to 0 on instance restart.
   */
  public getRecordCount(): number {
    return this._recordCount;
  }

  /**
   * B79.0n.TELEMETRY: epoch-ms timestamp of the most recent accepted
   * recordPairTelemetry() call. Null if no calls have landed yet.
   */
  public getLastWriteAt(): number | null {
    return this._lastWriteAt;
  }

  /**
   * B79.0n.TELEMETRY: count of unique symbols currently tracked in
   * pairTelemetry. Pure read of the Map size.
   */
  public getPairCount(): number {
    return this.pairTelemetry.size;
  }

  /**
   * Record telemetry for a pair
   * Directive 11.2 R1: Added pool parameter for segmented performance tracking
   * Directive 11.0E.2: Added source parameter for simulation/live segregation
   * Directive 11.4C.1: Only VTS can write telemetry (caller must identify as 'vts')
   */
  recordPairTelemetry(
    symbol: string,
    data: {
      // B-4.7: REQUIRED — the per-class dominant-regime vote filters on it.
      assetClass: AssetClass;
      finalScore: number;
      hybridScore?: number;
      regimeWeight?: number;
      regimeScore?: number; // Directive 11.4H.4A: Dynamic 0-100 regime score
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
      volZ?: number; // Directive 11.7F-B: Volatility Z-score
      trendZ?: number; // Directive 11.7F-B: Trend Z-score (momentum)
    }
  ): void {
    // Directive 11.4C.1: Guard against non-VTS writers
    // Only VTS is authorized to write telemetry data (M70 compliance)
    if (data.caller !== 'vts') {
      console.warn(`[11.4C.1][BLOCKED] Telemetry write blocked for ${symbol}: caller="${data.caller || 'unknown'}" (only 'vts' allowed)`);
      return;
    }
    const now = Date.now();
    // B79.0n.TELEMETRY: increment observability counters AFTER M70 guard
    // passes. Counters track accepted writes only — blocked writes (non-vts
    // caller) do NOT increment, preserving the M70 signal integrity.
    this._recordCount++;
    this._lastWriteAt = now;
    const existing = this.pairTelemetry.get(symbol) || [];
    
    // Prune old entries outside the history window
    const recent = existing.filter(t => now - t.lastUpdated < this.historyWindowMs);
    
    // Directive 11.4C-R2: VTS is the single source of truth for telemetry
    // All telemetry now comes from VTS with real calculated values (no defaults)
    // Directive 11.4C.3: QUANT signals should NOT have a pattern (purely mathematical)
    // Only HYBRID and PATTERN signals should have pattern names
    const shouldHavePattern = data.signalType !== 'QUANT';
    
    // Directive 11.7F-B: Build rolling Z-score history from previous entries
    const MAX_ZSCORE_HISTORY = 50;
    // Memory audit: Z-score histories stored per-symbol, not per-entry
    const zHist = this.pairZScoreHistory.get(symbol) ?? { volZ: [], trendZ: [] };
    if (data.volZ !== undefined) {
      zHist.volZ = [...zHist.volZ.slice(-(MAX_ZSCORE_HISTORY - 1)), data.volZ];
    }
    if (data.trendZ !== undefined) {
      zHist.trendZ = [...zHist.trendZ.slice(-(MAX_ZSCORE_HISTORY - 1)), data.trendZ];
    }
    this.pairZScoreHistory.set(symbol, zHist);
    // Reference the shared history (not copied per entry)
    const newVolZHistory = zHist.volZ;
    const newTrendZHistory = zHist.trendZ;

    const entry: PairTelemetry = {
      symbol,
      assetClass: data.assetClass, // B-4.7: stamped at write (M70 single-writer)
      finalScore: data.finalScore,
      hybridScore: data.hybridScore ?? 0,
      regimeWeight: data.regimeWeight ?? 0,
      regimeScore: data.regimeScore, // Directive 11.4H.4A: Store dynamic 0-100 regime score
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
      volZ: data.volZ, // Directive 11.7F-B: Store current volatility Z-score
      trendZ: data.trendZ, // Directive 11.7F-B: Store current trend Z-score
      volZHistory: newVolZHistory, // Directive 11.7F-B: Rolling Z-score history
      trendZHistory: newTrendZHistory, // Directive 11.7F-B: Rolling Z-score history
    };
    
    recent.push(entry);
    this.pairTelemetry.set(symbol, recent);
    
    // Directive 11.0E.2: Include source in telemetry log
    console.log(`[11.0E.2][Telemetry] ${symbol} (${entry.pool}/${entry.source}) recorded: finalScore=${data.finalScore.toFixed(2)}, samples=${recent.length}`);
    
    // Directive 11.1A + 11.2 R1: Persist to SQL with pool tracking
    // Directive 11.4C-R2: Use per-pair regime (not global) for database persistence
    if (shouldPersist()) {
      const mode = (process.env.MODE as 'live' | 'paper') || 'paper';
      this.persistTelemetryAsync({
        symbol,
        mode,
        regime: entry.pairRegime ?? REGIMES.TRANSITION, // Use per-pair regime from VTS with fallback
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


  // ★ B-ARM-REMOVAL: pool-aggregate limb DELETED (poolAggregates / updatePoolAggregate /
  // getPoolPerformanceComparison / resetPoolAggregates). Its sole consumer was the
  // AdaptiveRatioManager, deleted in this batch. Not preserved: (a) its input `avgFinalScore`
  // has been fed `finalScore ?? 0` since #558 A2, so it would have persisted a decaying number
  // to disk every 60s forever; (b) it measures WIN RATE, the statistic §0 rejects and the reason
  // the ARM died — keeping it would hand the wrong metric to whoever builds pool quality next.
  // That work starts from Net Expectancy. `PoolType` SURVIVES (still types `entry.pool`).


  /**
   * Directive 11.4H Task 4: Regime Entropy Monitoring
   * Directive 11.4H.1 Task 4: Enhanced with null filtering and audit persistence
   * Calculates Shannon entropy of regime distribution to detect normalization collapse.
   * Low entropy (<0.2) indicates regime concentration (e.g., all pairs in same regime).
   * @returns Entropy value 0-1 and regime distribution
   */
  computeRegimeEntropy(): { entropy: number; distribution: Record<string, number>; totalPairs: number; validPairs: number } {
    const regimeCounts: Record<string, number> = {
      TREND_FRIENDLY_STABLE: 0,
      HIGH_VOLATILITY_UNSTABLE: 0,
      RANGE_BOUND_STABLE: 0,
      IMPULSE_EXPANSION: 0,
      STRUCTURAL_TRANSITION: 0
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
   * Directive 11.7F-B: Mapping Drift Check with Per-Strategy DriftScores
   * Compares canonical regimes against empirical telemetry distribution.
   * Computes DriftScore per regime-strategy pair using weighted Euclidean distance.
   * @returns Drift analysis with per-strategy DriftScores and coverage metrics
   */
  computeMappingDrift(): {
    isDrifted: boolean;
    driftScore: number;
    canonicalCoverage: number;
    empiricalRegimes: string[];
    missingCanonical: string[];
    extraEmpirical: string[];
    distribution: Record<string, number>;
    normalizedDistribution: Record<string, number>;
    recommendations: string[];
    validPairs: number;
    minSamplesMet: boolean;
    driftScores: Record<string, Record<string, DriftScoreResult>>; // Directive 11.7F-B: Per-regime-strategy DriftScores
    hasZScoreData: boolean; // Directive 11.7F-B: Indicates if real Z-score data available
    schema: string; // Directive 11.7F-B: Current schema version
  } {
    const MIN_SAMPLES = 10; // B59: Lowered from 30. VTS populates Z-score histories slowly; 30 was unreachable. 10 is pragmatic.
    const SCHEMA = 'regime-mapping/v1.4c';
    
    const CANONICAL_SET = new Set([
      REGIMES.TREND_FRIENDLY_STABLE,
      REGIMES.HIGH_VOLATILITY_UNSTABLE,
      REGIMES.RANGE_BOUND_STABLE,
      REGIMES.IMPULSE_EXPANSION,
      REGIMES.STRUCTURAL_TRANSITION
    ]);
    
    // HF9: DSS_TO_CANONICAL mapping removed — DSS deleted, only canonical regimes exist
    
    const empiricalCounts: Record<string, number> = {};
    const normalizedCounts: Record<string, number> = {
      [REGIMES.TREND_FRIENDLY_STABLE]: 0,
      [REGIMES.HIGH_VOLATILITY_UNSTABLE]: 0,
      [REGIMES.RANGE_BOUND_STABLE]: 0,
      [REGIMES.IMPULSE_EXPANSION]: 0,
      [REGIMES.STRUCTURAL_TRANSITION]: 0
    };
    
    // Directive 11.7F-B: Aggregate Z-scores per regime-strategy pair
    const regimeStrategyZScores: Record<string, Record<string, { volZ: number[]; trendZ: number[] }>> = {};
    
    let validPairs = 0;
    let pairsWithZScores = 0;
    
    for (const [, entries] of this.pairTelemetry.entries()) {
      if (entries.length === 0) continue;
      const latest = entries[entries.length - 1];
      const regime = latest.pairRegime;
      const strategy = latest.strategy;
      if (!regime) continue;
      
      validPairs++;
      empiricalCounts[regime] = (empiricalCounts[regime] || 0) + 1;
      
      // HF9: Direct canonical regime (DSS extended types removed)
      const normalizedRegime = regime;
      if (normalizedCounts[normalizedRegime] !== undefined) {
        normalizedCounts[normalizedRegime]++;
      }
      
      // Directive 11.7F-B: Collect Z-scores per regime-strategy pair
      if (strategy && latest.volZHistory && latest.trendZHistory && 
          latest.volZHistory.length > 0 && latest.trendZHistory.length > 0) {
        pairsWithZScores++;
        if (!regimeStrategyZScores[normalizedRegime]) {
          regimeStrategyZScores[normalizedRegime] = {};
        }
        if (!regimeStrategyZScores[normalizedRegime][strategy]) {
          regimeStrategyZScores[normalizedRegime][strategy] = { volZ: [], trendZ: [] };
        }
        // Aggregate all Z-scores for this regime-strategy pair
        regimeStrategyZScores[normalizedRegime][strategy].volZ.push(...latest.volZHistory);
        regimeStrategyZScores[normalizedRegime][strategy].trendZ.push(...latest.trendZHistory);
      }
    }
    
    const minSamplesMet = validPairs >= MIN_SAMPLES;
    const hasZScoreData = pairsWithZScores >= 10; // Need at least 10 pairs with Z-scores
    
    // Directive 11.7F-B: Compute DriftScores per regime-strategy pair
    const driftScores: Record<string, Record<string, DriftScoreResult>> = {};
    const allDriftResults: DriftScoreResult[] = [];
    
    for (const [regime, strategies] of Object.entries(regimeStrategyZScores)) {
      driftScores[regime] = {};
      for (const [strategy, zData] of Object.entries(strategies)) {
        const result = computeDriftScore(zData.volZ, zData.trendZ, regime);
        driftScores[regime][strategy] = result;
        allDriftResults.push(result);
      }
    }
    
    // If insufficient samples, return early with no drift detected
    if (!minSamplesMet) {
      return {
        isDrifted: false,
        driftScore: 0,
        canonicalCoverage: 0,
        empiricalRegimes: Object.keys(empiricalCounts),
        missingCanonical: [],
        extraEmpirical: [],
        distribution: empiricalCounts,
        normalizedDistribution: normalizedCounts,
        recommendations: [`Insufficient samples (${validPairs}/${MIN_SAMPLES}) - drift check deferred`],
        validPairs,
        minSamplesMet: false,
        driftScores,
        hasZScoreData,
        schema: SCHEMA
      };
    }
    
    const empiricalRegimes = Object.keys(empiricalCounts);
    const canonicalArray = [...CANONICAL_SET] as string[];
    // Missing = canonical regimes with 0 counts in normalized distribution
    const missingCanonical = canonicalArray.filter(r => normalizedCounts[r] === 0);
    
    // Extra = regimes that aren't in the canonical set
    const extraEmpirical = empiricalRegimes.filter(r =>
      !canonicalArray.includes(r)
    );
    
    const observedCanonical = canonicalArray.length - missingCanonical.length;
    const canonicalCoverage = observedCanonical / canonicalArray.length;
    
    // Directive 11.7F-B: Use real DriftScore if Z-score data available, fallback to coverage-based
    let driftScore: number;
    if (hasZScoreData && allDriftResults.length > 0) {
      const stats = aggregateDriftStats(allDriftResults);
      driftScore = stats.avgScore;
    } else {
      // Fallback: coverage-based score (legacy formula)
      driftScore = (extraEmpirical.length * 0.5) + (missingCanonical.length * 0.1);
    }
    
    // Only flag drift for truly unknown regimes or high mathematical drift
    const isDrifted = extraEmpirical.length > 0 || driftScore > 0.8;
    
    const recommendations: string[] = [];
    if (!hasZScoreData) {
      recommendations.push('Waiting for Z-score data to compute accurate DriftScores');
    }
    if (extraEmpirical.length > 0) {
      recommendations.push(`Unknown regimes detected: ${extraEmpirical.join(', ')}`);
    }
    if (missingCanonical.length >= 3) {
      recommendations.push(`Low regime diversity: ${observedCanonical}/5 canonical regimes observed`);
    }
    if (isDrifted && hasZScoreData) {
      recommendations.push('Review strategy parameters for drifted regime-strategy pairs');
    }
    
    if (isDrifted && extraEmpirical.length > 0) {
      console.warn(`[11.7F-B][Drift] Mapping drift detected (score=${driftScore.toFixed(3)})`);
      console.warn(`[11.7F-B][Drift] Unknown regimes: ${JSON.stringify(extraEmpirical)}`);
    }
    
    return {
      isDrifted,
      driftScore: parseFloat(driftScore.toFixed(4)),
      canonicalCoverage: parseFloat(canonicalCoverage.toFixed(4)),
      empiricalRegimes,
      missingCanonical,
      extraEmpirical,
      distribution: empiricalCounts,
      normalizedDistribution: normalizedCounts,
      recommendations,
      validPairs,
      minSamplesMet: true,
      driftScores,
      hasZScoreData,
      schema: SCHEMA
    };
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
    // Keep rehydrated=false to allow rehydrateTelemetryState() to run and restore live history
    console.log(`[11.4C.1][FLUSH] Cleared ${beforeCount} in-memory entries on restart (SQL history preserved)`);
    console.log(`[11.4C.1][FLUSH] Ready for rehydration from live telemetry + fresh VTS population`);
  }

  /**
   * Directive 11.4H.3 Task 3: Write telemetry snapshot to JSON file for entropy audits
   * Creates a comprehensive snapshot of current telemetry state for regime distribution analysis.
   * 
   * Note: Friction/spread values are computed at scan-time from live market data and are
   * logged separately via the [FrictionAudit] and [GlobalFriction][Audit] log entries.
   * This snapshot captures telemetry-based metrics: regime, finalScore, pool assignment, etc.
   * 
   * Output file: /logs/telemetry_snapshot_<timestamp>.json
   */
  async writeTelemetrySnapshot(): Promise<string> {
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    
    const now = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    interface PairSnapshot {
      symbol: string;
      regime: string;
      finalScore: number;
      hybridScore: number | null;
      regimeWeight: number | null;
      compositeScore: number;
      pool: string;
      source: string;
      sampleCount: number;
      lastUpdated: string;
    }
    
    const snapshotData: PairSnapshot[] = [];
    
    // Collect data from ALL pairs (no truncation)
    for (const [symbol, entries] of this.pairTelemetry.entries()) {
      const recent = entries.filter(t => now - t.lastUpdated < this.historyWindowMs);
      if (recent.length === 0) continue;
      
      const latest = recent[recent.length - 1];
      const compositeScore = this.getCompositeScore(symbol);
      
      snapshotData.push({
        symbol,
        regime: latest.pairRegime ?? this.currentRegime,
        finalScore: parseFloat((latest.finalScore ?? 0).toFixed(4)),
        hybridScore: latest.hybridScore != null ? parseFloat(latest.hybridScore.toFixed(4)) : null,
        regimeWeight: latest.regimeWeight != null ? parseFloat(latest.regimeWeight.toFixed(4)) : null,
        compositeScore: parseFloat(compositeScore.toFixed(4)),
        pool: latest.pool ?? 'ideal',
        source: latest.source ?? 'simulation',
        sampleCount: recent.length,
        lastUpdated: new Date(latest.lastUpdated).toISOString()
      });
    }
    
    // Calculate regime distribution
    const regimeDistribution: Record<string, number> = {};
    for (const entry of snapshotData) {
      regimeDistribution[entry.regime] = (regimeDistribution[entry.regime] || 0) + 1;
    }
    
    // Calculate pool distribution
    const poolDistribution: Record<string, number> = { ideal: 0, rotational: 0 };
    for (const entry of snapshotData) {
      poolDistribution[entry.pool] = (poolDistribution[entry.pool] || 0) + 1;
    }
    
    // Calculate source distribution
    const sourceDistribution: Record<string, number> = {};
    for (const entry of snapshotData) {
      sourceDistribution[entry.source] = (sourceDistribution[entry.source] || 0) + 1;
    }
    
    // Calculate Shannon entropy for regime distribution
    const totalPairs = snapshotData.length;
    let entropy = 0;
    if (totalPairs > 0) {
      for (const count of Object.values(regimeDistribution)) {
        const p = count / totalPairs;
        if (p > 0) {
          entropy -= p * Math.log2(p);
        }
      }
    }
    const regimeCount = Object.keys(regimeDistribution).length || 1;
    const maxEntropy = Math.log2(regimeCount);
    const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
    
    // Score statistics
    const finalScores = snapshotData.map(p => p.finalScore).filter(s => s > 0);
    const scoreStats = {
      min: finalScores.length > 0 ? Math.min(...finalScores) : 0,
      max: finalScores.length > 0 ? Math.max(...finalScores) : 0,
      avg: finalScores.length > 0 ? parseFloat((finalScores.reduce((a, b) => a + b, 0) / finalScores.length).toFixed(4)) : 0,
      nonZeroCount: finalScores.length
    };
    
    const snapshot = {
      timestamp: new Date().toISOString(),
      directive: '11.4H.3',
      description: 'Telemetry-based entropy and regime distribution snapshot. For friction/spread data, see [FrictionAudit] logs.',
      pairCount: totalPairs,
      entropy: {
        shannon: parseFloat(entropy.toFixed(4)),
        normalized: parseFloat(normalizedEntropy.toFixed(4)),
        maxPossible: parseFloat(maxEntropy.toFixed(4)),
        regimeCount
      },
      regimeDistribution,
      regimeDistributionPercent: Object.fromEntries(
        Object.entries(regimeDistribution).map(([k, v]) => [k, parseFloat(((v / Math.max(totalPairs, 1)) * 100).toFixed(1))])
      ),
      poolDistribution,
      sourceDistribution,
      scoreStats,
      pairs: snapshotData, // ALL pairs - no truncation
    };
    
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    try {
      await fs.mkdir(logsDir, { recursive: true });
    } catch (e) {
      // Directory may already exist
    }
    
    const filePath = path.join(logsDir, `telemetry_snapshot_${timestamp}.json`);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2));
    
    console.log(`[11.4H.3][TelemetrySnapshot] Written ${totalPairs} pairs to ${filePath}`);
    console.log(`[11.4H.3][TelemetrySnapshot] Entropy: ${normalizedEntropy.toFixed(4)}, Regimes: ${JSON.stringify(regimeDistribution)}`);
    console.log(`[11.4H.3][TelemetrySnapshot] Pools: ${JSON.stringify(poolDistribution)}, Sources: ${JSON.stringify(sourceDistribution)}`);
    
    return filePath;
  }

  /**
   * Directive 11.1A: Update current market regime
   * Call this when market conditions change
   */
  /**
   * HF9: Update current market regime (DSS removed — accepts canonical regime string directly)
   * Note: This method was never called at runtime. Kept for interface compatibility.
   */
  updateMarketRegime(regime: string): string {
    this.currentRegime = regime;
    console.log(`[11.1A][Telemetry] Market regime updated: ${this.currentRegime}`);
    return this.currentRegime;
  }

  /**
   * Directive 11.1A: Get current market regime
   */
  getCurrentMarketRegime(): string {
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
   * Directive 11.4H.4 Task 2: Deterministic rotation index for full Kraken coverage
   * Persists across cycles to ensure all pairs are eventually scanned
   */
  private rotationIndex: number = 0;
  
  /**
   * Directive 11.2 R1: Get rotational pairs with explicit pool attribution
   * Directive 11.4C.1: Now accepts explicit count instead of ratio
   * Directive 11.4B.2-R1: Includes pairs with default score (0.5) or no score (M63)
   * Directive 11.4H.4 Task 2: Deterministic rotation with benchmark injection
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
    
    // Directive 11.4H.4 Task 2: Deterministic rotation instead of random shuffling
    // This ensures full Kraken coverage over time without skipping pairs
    const total = rotationalCandidates.length;
    if (total === 0) {
      console.log(`[11.4H.4][Rotation] No rotational candidates available`);
      return [];
    }
    
    // Wrap rotation index if it exceeds available pairs
    this.rotationIndex = this.rotationIndex % total;
    
    // Slice from rotation index, wrapping around if needed
    const startIdx = this.rotationIndex;
    const endIdx = startIdx + count;
    let selected: string[];
    
    if (endIdx <= total) {
      selected = rotationalCandidates.slice(startIdx, endIdx);
    } else {
      // Wrap around: take remainder from start
      selected = [
        ...rotationalCandidates.slice(startIdx),
        ...rotationalCandidates.slice(0, endIdx - total)
      ];
    }
    
    // Advance rotation index for next cycle
    this.rotationIndex = endIdx % total;
    
    // Directive 11.4H.4 Task 2: Benchmark injection - always include BTC/ETH
    const selectedSet = new Set(selected);
    const rotationBenchmarks = ['BTC/USD', 'XXBTZUSD', 'XBT/USD', 'ETH/USD', 'XETHZUSD', 'SOL/USD', 'SOLUSD'];
    for (const benchmark of rotationBenchmarks) {
      if (!selectedSet.has(benchmark) && allPairs.includes(benchmark)) {
        selected.push(benchmark);
        selectedSet.add(benchmark);
      }
    }
    
    const rotationalPairs = selected.slice(0, count).map(symbol => ({
      symbol,
      pool: 'rotational' as PoolType,
      score: 0, // Rotational pairs don't have established scores
    }));
    
    console.log(`[11.4H.4][Rotation] Deterministic selection: idx=${startIdx}→${this.rotationIndex}, selected=${rotationalPairs.length}/${count}`);
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
   * Directive 11.4H.4A-Fix: Calculate dominant regime from current telemetry
   * Returns the most common regime among active pairs with average regime score
   * This replaces the stale static cache in market-indicators.ts
   */
  /**
   * TEST-ONLY (B-4.7): clear pair telemetry — same worker-shared-singleton
   * rationale as MCE._clearCacheForTests. Throws outside vitest.
   */
  _clearPairTelemetryForTests(): void {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      throw new Error('_clearPairTelemetryForTests is test-only');
    }
    this.pairTelemetry.clear();
  }

  /**
   * B-4.7 (#162): per-asset-class dominant regime over VTS telemetry. The
   * mixed-class getDominantRegime() was DELETED in this batch (see the MCE
   * counterpart for rationale). Records without an assetClass stamp
   * (pre-B-4.7 disk rehydrates) are excluded and age out naturally.
   * Returns null below MIN_CLASS_VOTE_PAIRS — CLASS_IDLE semantics.
   */
  getDominantRegimeForClass(assetClass: AssetClass): { regime: MarketRegime; avgRegimeScore: number; pairCount: number; percentage: number } | null {
    const MIN_CLASS_VOTE_PAIRS = 5;
    const now = Date.now();
    const regimeCounts: Record<string, { count: number; totalScore: number }> = {};
    let totalPairs = 0;
    
    for (const [, entries] of this.pairTelemetry.entries()) {
      const recent = entries.filter(t => now - t.lastUpdated < this.historyWindowMs);
      if (recent.length === 0) continue;
      
      const latest = recent[recent.length - 1];
      if (latest.assetClass !== assetClass) continue; // B-4.7: class filter (unstamped excluded)
      const regime = latest.pairRegime ?? this.currentRegime;
      
      if (!regimeCounts[regime]) {
        regimeCounts[regime] = { count: 0, totalScore: 0 };
      }
      regimeCounts[regime].count += 1;
      regimeCounts[regime].totalScore += latest.regimeScore ?? 50;
      totalPairs++;
    }
    
    if (totalPairs < MIN_CLASS_VOTE_PAIRS) {
      return null;
    }
    
    // Find dominant regime
    const sorted = Object.entries(regimeCounts).sort((a, b) => b[1].count - a[1].count);
    if (sorted.length === 0) return null;
    
    const [regime, stats] = sorted[0];
    const avgRegimeScore = Math.round(stats.totalScore / stats.count);
    const percentage = Math.round((stats.count / totalPairs) * 100);
    
    return {
      regime: regime as MarketRegime,
      avgRegimeScore,
      pairCount: totalPairs,
      percentage
    };
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
   * Directive 11.4H.3: Added frictionScore from cost cache
   * Returns ordered list with rank, symbol, score, signalType, strategy, pattern, regime, source, frictionScore
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
    frictionScore: number; // Directive 11.4H.3: Friction score from cost cache
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
      
      // Directive 11.4H.4A Task 3: Friction synchronization with symbol normalization
      // Try original symbol first, then canonical format, then fallback to defaults
      let costMetrics = getCostMetrics(p.symbol);
      if (!costMetrics) {
        const canonicalSymbol = toCanonical(p.symbol);
        if (canonicalSymbol !== p.symbol) {
          costMetrics = getCostMetrics(canonicalSymbol);
        }
      }
      // Use getOrSetCostMetrics as final fallback (ensures non-null with defaults)
      const finalCostMetrics = costMetrics ?? getOrSetCostMetrics(p.symbol);
      // P19-B7.2a: fee from the merge site, class from the entry's AT-WRITE
      // stamp (the B-4.7 #163 pattern used at inferStrategy — telemetry spans
      // both classes; crypto fallback covers pre-B-4.7 rehydrated records only).
      // NOT a hardcode: the fee's class follows the pair's own class (Langston
      // Step-2 CHANGE-1), so the compose stays correct when B79/B81 lights up
      // more classes.
      const _pairClass = p.entry.assetClass === 'xstock_spot' ? 'xstock_spot' as const : 'crypto_spot' as const;
      const frictionScore = computeMarketFriction(finalCostMetrics.spread, finalCostMetrics.slippage, getFrictionForAssetClass(_pairClass).feeRateTaker);
      
      return {
        rank: index + 1,
        symbol: p.symbol,
        score: parseFloat(p.score.toFixed(4)),
        signalType,
        strategy,
        pattern,
        regime: p.entry.pairRegime ?? this.currentRegime, // Directive 11.4C-R2: Use per-pair regime with fallback
        regimeScore: p.entry.regimeScore, // Directive 11.4H.4A: Dynamic 0-100 regime score
        source: p.entry.source ?? 'simulation', // Directive 11.4C-R2: Default to simulation if not set
        lastUpdated: p.entry.lastUpdatedIso ?? new Date(p.entry.lastUpdated).toISOString(), // Directive 11.4C.3-B
        frictionScore, // Directive 11.4H.3: Friction from cost cache
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
    // B-4.7 (#163): per-class primary pick — class from the at-write stamp
    // (crypto fallback covers pre-B-4.7 rehydrated records only; display path).
    const cls = entry.assetClass === 'xstock_spot' ? 'xstock_spot' : 'crypto_spot';
    const { strategy } = selectPrimaryStrategy(cls, regime);
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
      // B65.2 (2026-04-23): Authoritative TEC config is in `module_constants`
      // (modules `trailing_exit` + `risk_sizing`). This telemetry payload
      // surfaces the seeded defaults as a diagnostic mirror for any downstream
      // UI that consumes this shape. For live per-trade resolution (which
      // honors strategy/regime-specific overrides), read via
      // `moduleConstantsService.getConstant(...)` directly. Values below
      // match the B65.1 + B65.2 seed migrations.
      tecConfig: {
        breakEvenTriggerR: 1.0,        // trailing_exit.break_even_trigger_r (seeded B65.1)
        targetLockR: 1.5,               // trailing_exit.target_lock_r (seeded B65.1)
        trailDistanceAtrMultiplier: 1.0, // trailing_exit.trail_distance_atr_multiplier (seeded B65.1)
        persistenceDebounceMs: 5000,    // trailing_exit.persistence_debounce_ms (seeded B65.1)
        moonbagMaxDurationMs: 14400000, // trailing_exit.moonbag_max_duration_ms (seeded B65.2)
        moonbagCapMode: 'reserved_slots', // trailing_exit.moonbag_cap_mode (seeded B65.2)
        moonbagReservedSlots: 1,        // trailing_exit.moonbag_reserved_slots (seeded B65.2)
        maxPositionRisk: 0.02,          // risk_sizing.max_position_risk (seeded B65.2, migrated from deleted EXECUTION_CONFIG)
        version: 'B65.2',
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

// Batch 46: Telemetry aggregate persistence
import fs from 'fs';
import path from 'path';
const TELEMETRY_STATE_DIR = path.join(process.cwd(), 'logs', 'telemetry_state');
const TELEMETRY_STATE_FILE = path.join(TELEMETRY_STATE_DIR, 'aggregator_state.json');
let telemetryPersistTimer: ReturnType<typeof setInterval> | null = null;

function persistTelemetryState(instance: TelemetryAggregatorService): void {
  try {
    if (!fs.existsSync(TELEMETRY_STATE_DIR)) {
      fs.mkdirSync(TELEMETRY_STATE_DIR, { recursive: true });
    }
    const state = {
      version: 1,
      savedAt: Date.now(),
      cascadeHistory: (instance as any).cascadeHistory ?? [],
    };
    fs.writeFileSync(TELEMETRY_STATE_FILE, JSON.stringify(state));
  } catch (err) {
    console.error('[46][Telemetry] Failed to persist state:', err);
  }
}

function rehydrateTelemetryState(instance: TelemetryAggregatorService): void {
  try {
    if (!fs.existsSync(TELEMETRY_STATE_FILE)) return;
    const data = JSON.parse(fs.readFileSync(TELEMETRY_STATE_FILE, 'utf-8'));
    if (data.cascadeHistory && Array.isArray(data.cascadeHistory)) {
      (instance as any).cascadeHistory = data.cascadeHistory;
    }
    // ★ B-ARM-REMOVAL: the guarded `if (data.poolAggregates)` restore block is deleted with the
    // limb. A pre-existing on-disk file's leftover `poolAggregates` key is simply ignored by
    // JSON.parse — the state file is module-local (`logs/telemetry_state/aggregator_state.json`),
    // written and read only here, so there is no format contract and no migration.
    (instance as any).rehydrated = true; // Batch 46: Set rehydrated flag
  } catch (err) {
    console.error('[46][Telemetry] Failed to rehydrate state:', err);
  }
}

export function getTelemetryAggregator(): TelemetryAggregatorService {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryAggregatorService();
    // Directive 11.4C.1 + 11.4C.3-C: Flush stale placeholder data and clear in-memory cache on restart
    // This prevents stale classifications and ensures only real VTS-generated telemetry is used
    telemetryInstance.flushStaleTelemetry();
    // Batch 46: Rehydrate aggregates from disk
    rehydrateTelemetryState(telemetryInstance);
    // Batch 46: Auto-persist every 60 seconds (singleton-safe — only one timer)
    if (!telemetryPersistTimer) {
      telemetryPersistTimer = setInterval(() => persistTelemetryState(telemetryInstance!), 60 * 1000);
    }
    console.log('[10.8][Telemetry] TelemetryAggregatorService initialized (11.4C.3-C cache purged on startup)');
  }
  return telemetryInstance;
}

/**
 * B79.0n.TELEMETRY (2026-05-26): non-arming read-only peek at the global
 * singleton state. Returns null if singleton not yet armed (avoids
 * triggering rehydrate + persist-timer arm just for a stats read).
 *
 * Consumed by getTelemetryInstanceStats() in asset-class-instances.ts —
 * the per-class observability accessor needs to read crypto_spot stats
 * WITHOUT side-effecting the global singleton (which would arm the
 * 60s persist-timer if not already armed). Module-scoped state read only;
 * no setter exposed — callers cannot mutate the singleton via this export.
 *
 * Cold-boot semantic (Langston Step 2 ACK clarification 1): on a fresh
 * boot where getTelemetryAggregator() has never been called, this returns
 * null and the caller should construct a crypto_spot stats row with
 * { recordCount: 0, lastWriteAt: null, pairCount: 0, source: 'global-singleton' }.
 * Crypto_spot is active — zero ≠ inactive for crypto_spot.
 */
export function peekTelemetryInstance(): TelemetryAggregatorService | null {
  return telemetryInstance;
}

export { TelemetryAggregatorService as TelemetryAggregator };
