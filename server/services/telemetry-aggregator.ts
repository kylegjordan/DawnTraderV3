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
import { DynamicStrategySelector, type DSSMetrics } from './dynamic-strategy-selector.js';

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
  private dss = new DynamicStrategySelector();
  private currentRegime: MarketRegime = 'LOW_VOL_CHOP';
  private rehydrated = false;

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
    
    // Directive 11.1A: Persist to SQL if enabled
    if (shouldPersist()) {
      const mode = (process.env.MODE as 'live' | 'paper') || 'paper';
      this.persistTelemetryAsync({
        symbol,
        mode,
        regime: this.currentRegime,
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
   * Directive 11.1A: Rehydrate telemetry state from SQL on startup
   * Loads recent telemetry records for the current market regime
   */
  async rehydrateTelemetryState(): Promise<number> {
    if (this.rehydrated) {
      console.log('[11.1A][Telemetry] Already rehydrated, skipping');
      return 0;
    }
    
    const mode = (process.env.MODE as 'live' | 'paper') || 'paper';
    
    try {
      const records = await loadRecentTelemetry(this.currentRegime, mode, 100);
      
      for (const record of records) {
        const existing = this.pairTelemetry.get(record.symbol) || [];
        
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
        };
        
        existing.push(entry);
        this.pairTelemetry.set(record.symbol, existing);
      }
      
      this.rehydrated = true;
      console.log(`[11.1A][Telemetry] Rehydrated ${records.length} entries for regime=${this.currentRegime}, mode=${mode}`);
      return records.length;
    } catch (error) {
      console.error('[11.1A][Telemetry] Failed to rehydrate telemetry:', error);
      return 0;
    }
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
