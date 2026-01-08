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
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE } from '../config/schema-version.js';

export interface PairTelemetry {
  symbol: string;
  finalScore: number;
  hybridScore: number;
  regimeWeight: number;
  predictiveConfidence: number;
  lastUpdated: number;
  sampleCount: number;
  successRate: number;
  avgDecayedStrength: number;
  timeframe?: '1h' | '15m' | '5m';
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

export class TelemetryAggregatorService {
  private pairTelemetry: Map<string, PairTelemetry[]> = new Map();
  private cascadeHistory: CascadeEfficiency[] = [];
  private readonly historyWindowMs = SCANNER_PARAMS.TELEMETRY.HISTORY_WINDOW_MS;
  private readonly minSamples = SCANNER_PARAMS.TELEMETRY.MIN_SAMPLES;

  /**
   * Record telemetry for a pair
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
    }
  ): void {
    const now = Date.now();
    const existing = this.pairTelemetry.get(symbol) || [];
    
    // Prune old entries outside the history window
    const recent = existing.filter(t => now - t.lastUpdated < this.historyWindowMs);
    
    const entry: PairTelemetry = {
      symbol,
      finalScore: data.finalScore,
      hybridScore: data.hybridScore ?? 0,
      regimeWeight: data.regimeWeight ?? 0,
      predictiveConfidence: data.predictiveConfidence ?? 0.5,
      lastUpdated: now,
      sampleCount: recent.length + 1,
      successRate: data.success !== undefined 
        ? (recent.filter(t => t.successRate > 0.5).length + (data.success ? 1 : 0)) / (recent.length + 1)
        : recent.length > 0 ? recent[recent.length - 1].successRate : 0.5,
      avgDecayedStrength: data.decayedStrength ?? 0,
      timeframe: data.timeframe,
    };
    
    recent.push(entry);
    this.pairTelemetry.set(symbol, recent);
    
    console.log(`[10.8][Telemetry] ${symbol} recorded: finalScore=${data.finalScore.toFixed(2)}, samples=${recent.length}`);
  }

  /**
   * Get composite score for a pair based on weighted telemetry
   */
  getCompositeScore(symbol: string): number {
    const entries = this.pairTelemetry.get(symbol);
    if (!entries || entries.length < this.minSamples) {
      return 0; // Not enough data
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
   * Returns the top N% of pairs based on composite score
   */
  getTopPairs(ratio: number): string[] {
    const now = Date.now();
    const scoredPairs: Array<{ symbol: string; score: number }> = [];
    
    for (const [symbol, entries] of this.pairTelemetry.entries()) {
      // Filter to recent entries only
      const recent = entries.filter(t => now - t.lastUpdated < this.historyWindowMs);
      if (recent.length >= this.minSamples) {
        scoredPairs.push({
          symbol,
          score: this.getCompositeScore(symbol),
        });
      }
    }
    
    // Sort by score descending
    scoredPairs.sort((a, b) => b.score - a.score);
    
    const count = Math.ceil(scoredPairs.length * ratio);
    const topPairs = scoredPairs.slice(0, count).map(p => p.symbol);
    
    console.log(`[10.8][Telemetry] getTopPairs(${ratio}): ${topPairs.length} pairs selected`);
    return topPairs;
  }

  /**
   * Get rotational pairs for exploration (pairs with limited samples)
   * These are pairs that haven't been scanned recently or have insufficient data
   */
  getRotationalPairs(ratio: number, allPairs: string[]): string[] {
    const now = Date.now();
    const undersampled: string[] = [];
    
    for (const symbol of allPairs) {
      const entries = this.pairTelemetry.get(symbol);
      if (!entries || entries.length < this.minSamples) {
        undersampled.push(symbol);
        continue;
      }
      
      // Also include pairs not scanned in the last hour
      const lastEntry = entries[entries.length - 1];
      if (now - lastEntry.lastUpdated > 3600000) {
        undersampled.push(symbol);
      }
    }
    
    // Shuffle for random rotation
    const shuffled = undersampled.sort(() => Math.random() - 0.5);
    const count = Math.ceil(allPairs.length * ratio);
    const rotationalPairs = shuffled.slice(0, count);
    
    console.log(`[10.8][Telemetry] getRotationalPairs(${ratio}): ${rotationalPairs.length} pairs selected`);
    return rotationalPairs;
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
   * Clear all telemetry data
   */
  clear(): void {
    this.pairTelemetry.clear();
    this.cascadeHistory = [];
    console.log('[10.8][Telemetry] All telemetry data cleared');
  }

  /**
   * Directive 10.9A: Get telemetry summary with coefficient metadata and version
   * Directive 10.9B: Added phaseDirective and filterSchemaVersion
   * Directive 10.9C: Updated to v1.2.0 with rolling 24h window
   * Directive 10.9E: Added filter performance telemetry (pass rate, failure breakdown)
   * This logs the coefficient set used during this session for auditability
   */
  getTelemetrySummaryWithCoefficients(): {
    version: string;
    pairCount: number;
    totalSamples: number;
    weights: { hybrid: number; confidence: number; regime: number; decay: number };
    phaseDirective: string;
    filterSchemaVersion: string;
    timestamp: string;
    tecConfig?: {
      expandFactor: number;
      contractFactor: number;
      trailingBase: number;
      trailingAccel: number;
      maxRisk: number;
      version: string;
    };
    configProvenance?: {
      phaseDirective: string;
      backendSchema: string;
      executionConfigVersion: string;
      screenerConfigVersion: string;
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
      phaseDirective: SCHEMA_DIRECTIVE,
      filterSchemaVersion: FILTER_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      tecConfig: {
        expandFactor: EXECUTION_CONFIG.ADAPTIVE_EXPAND_FACTOR,
        contractFactor: EXECUTION_CONFIG.ADAPTIVE_CONTRACT_FACTOR,
        trailingBase: EXECUTION_CONFIG.TRAILING_STOP_BASE,
        trailingAccel: EXECUTION_CONFIG.TRAILING_STOP_ACCELERATION,
        maxRisk: EXECUTION_CONFIG.MAX_POSITION_RISK,
        version: EXECUTION_CONFIG.VERSION
      },
      configProvenance: {
        phaseDirective: SCHEMA_DIRECTIVE,
        backendSchema: SCHEMA_VERSION,
        executionConfigVersion: EXECUTION_CONFIG.VERSION,
        screenerConfigVersion: FILTER_SCHEMA_VERSION
      },
      ...filterPerformance,
    };
    
    console.log(`[${SCHEMA_DIRECTIVE}][Telemetry] Summary with coefficients (${SCORE_WEIGHTS_VERSION}, filter=${FILTER_SCHEMA_VERSION}):`, JSON.stringify(summary));
    return summary;
  }
}

// Singleton instance
let telemetryInstance: TelemetryAggregatorService | null = null;

export function getTelemetryAggregator(): TelemetryAggregatorService {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryAggregatorService();
    console.log('[10.8][Telemetry] TelemetryAggregatorService initialized');
  }
  return telemetryInstance;
}

export { TelemetryAggregatorService as TelemetryAggregator };
