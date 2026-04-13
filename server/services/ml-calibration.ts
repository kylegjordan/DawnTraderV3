/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 DIRECTIVE 11.0E.2 — ML Calibration Service (Phase-10 Training Loop)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Analyze VTS trade outcomes using Phase-10 metrics and generate
 * learning recommendations for strategy weighting.
 * 
 * Directive 11.0E.2 Changes:
 * - Consumes Phase-10 metrics: finalScore, predictiveConfidence, regimeWeight
 * - Computes performance score using Phase-10 formula
 * - Uses expectedEdge vs realizedPnL delta for learning weights
 * - Uses Phase-10 metrics exclusively
 * 
 * Schema Version: 1.6.7
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { HYBRID_PARAMS } from '../config/system-guards';
import type { CalibrationReport, CalibrationRecommendation, PatternType } from '../types';
import { logPredictiveAdjustment, AdjustmentCategory } from '../core/logging/predictive-adjustments';

/**
 * B59-fix: In-memory cumulative weight tracker.
 * Tracks the current adjusted weight for each parameter so that subsequent
 * calibrations build on prior adjustments instead of always using baseline=1.0.
 * Persists in memory across calibration cycles; resets on PM2 restart (by design —
 * weights restart from baseline 1.0 on deploy, matching the Authority Baseline).
 */
const weightTracker = new Map<string, number>();

function getCurrentWeight(paramKey: string): number {
  return weightTracker.get(paramKey) ?? 1.0; // Authority Baseline V1.0 default
}

function setCurrentWeight(paramKey: string, value: number): void {
  weightTracker.set(paramKey, value);
}

/**
 * Phase-10 TradeRecord interface - Directive 11.0E.2 (M52: Schema Parity)
 */
export interface TradeRecord {
  signalType?: string;
  patternType?: string;
  pnl: number;
  // Phase-10 metrics
  finalScore?: number;
  hybridScore?: number;
  predictiveConfidence?: number;
  regimeWeight?: number;
  decayPenalty?: number;
  expectedEdge?: number;
  frictionCost?: number;
  regime?: string;
  strategy?: string;
  source?: 'simulation' | 'live';
}

export type GetRecentTradesFn = (windowSize: number, signalType: string) => Promise<TradeRecord[]>;

let getRecentTradesFn: GetRecentTradesFn | null = null;

export function setGetRecentTradesFn(fn: GetRecentTradesFn): void {
  getRecentTradesFn = fn;
}

/**
 * Phase-10 performance metrics aggregation - Directive 11.0E.2
 */
interface Phase10Aggregate {
  wins: number;
  losses: number;
  expectancy: number;
  totalFinalScore: number;
  totalPredictiveConfidence: number;
  totalRegimeWeight: number;
  totalExpectedEdge: number;
  totalRealizedPnL: number;
  edgeDeltaSum: number; // expectedEdge - realizedPnL
  regimeCounts: Record<string, number>; // B59-fix: Track dominant regime per pattern
}

export class MLCalibrationService {
  private static readonly WIN_RATE_INCREASE_THRESHOLD = 55;
  private static readonly WIN_RATE_DECREASE_THRESHOLD = 45;
  private static readonly ADJUSTMENT_STEP = 0.05;

  /**
   * Directive 11.0E.2: Compute Phase-10 performance score
   * Formula: (finalScore * 0.5) + (predictiveConfidence * 0.3) + (regimeWeight * 0.2)
   */
  static computePerformanceScore(trade: TradeRecord): number {
    const finalScore = trade.finalScore ?? 0;
    const predictiveConfidence = trade.predictiveConfidence ?? 0;
    const regimeWeight = trade.regimeWeight ?? 0;
    
    return (finalScore * 0.5) + (predictiveConfidence * 0.3) + (regimeWeight * 0.2);
  }

  /**
   * Directive 11.0E.2: Analyze using Phase-10 metrics
   * @param windowSize Number of trades to analyze (default: 50)
   */
  static async analyzePerformance(windowSize: number = 50): Promise<CalibrationReport> {
    if (!getRecentTradesFn) {
      return { 
        success: false, 
        reason: 'VTS trade retrieval function not configured',
        timestamp: Date.now()
      };
    }

    const trades = await getRecentTradesFn(windowSize, 'HYBRID');
    
    if (!trades.length) {
      return { 
        success: false, 
        reason: 'No HYBRID trades found for calibration',
        timestamp: Date.now()
      };
    }

    // Phase-10 grouped metrics
    const grouped: Record<string, Phase10Aggregate> = {};

    for (const t of trades) {
      const pattern = t.patternType || t.strategy || 'UNKNOWN';
      if (!grouped[pattern]) {
        grouped[pattern] = {
          wins: 0,
          losses: 0,
          expectancy: 0,
          totalFinalScore: 0,
          totalPredictiveConfidence: 0,
          totalRegimeWeight: 0,
          totalExpectedEdge: 0,
          totalRealizedPnL: 0,
          edgeDeltaSum: 0,
          regimeCounts: {},
        };
      }
      
      const g = grouped[pattern];
      
      if (t.pnl > 0) {
        g.wins++;
      } else {
        g.losses++;
      }
      g.expectancy += t.pnl;
      g.totalFinalScore += t.finalScore ?? 0;
      g.totalPredictiveConfidence += t.predictiveConfidence ?? 0;
      g.totalRegimeWeight += t.regimeWeight ?? 0;
      g.totalExpectedEdge += t.expectedEdge ?? 0;
      g.totalRealizedPnL += t.pnl;
      
      // Edge delta: how well did expectedEdge predict realizedPnL?
      const edgeDelta = (t.expectedEdge ?? 0) - t.pnl;
      g.edgeDeltaSum += edgeDelta;

      // B59-fix: Track regime frequency for dominant regime detection
      if (t.regime) {
        g.regimeCounts[t.regime] = (g.regimeCounts[t.regime] || 0) + 1;
      }
    }

    const recommendations: CalibrationRecommendation[] = [];

    for (const [pattern, stats] of Object.entries(grouped)) {
      const total = stats.wins + stats.losses;
      if (total === 0) continue;

      const winRate = (stats.wins / total) * 100;
      const avgExpectancy = stats.expectancy / total;
      
      // Phase-10: Compute average performance score for weighting
      const avgFinalScore = stats.totalFinalScore / total;
      const avgEdgeDelta = stats.edgeDeltaSum / total;
      const performanceScore = (avgFinalScore * 0.5) + 
        ((stats.totalPredictiveConfidence / total) * 0.3) + 
        ((stats.totalRegimeWeight / total) * 0.2);
      
      let suggestion: 'INCREASE' | 'DECREASE' | 'HOLD' = 'HOLD';
      let adjustment = 0;

      // Use performanceScore to weight adjustment magnitude
      const performanceMultiplier = Math.max(0.5, Math.min(1.5, performanceScore));
      
      if (winRate > this.WIN_RATE_INCREASE_THRESHOLD) {
        suggestion = 'INCREASE';
        adjustment = this.ADJUSTMENT_STEP * performanceMultiplier;
      } else if (winRate < this.WIN_RATE_DECREASE_THRESHOLD) {
        suggestion = 'DECREASE';
        adjustment = -this.ADJUSTMENT_STEP * performanceMultiplier;
      }

      // B59-fix: Find dominant regime for this pattern (most frequent)
      const dominantRegime = Object.entries(stats.regimeCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0] ?? undefined;

      recommendations.push({
        pattern: pattern as PatternType | 'UNKNOWN',
        winRate: parseFloat(winRate.toFixed(1)),
        avgExpectancy: parseFloat(avgExpectancy.toFixed(4)),
        suggestion,
        adjustment: parseFloat(adjustment.toFixed(4)),
        // Phase-10 extended metrics
        phase10Metrics: {
          avgFinalScore: parseFloat(avgFinalScore.toFixed(4)),
          avgEdgeDelta: parseFloat(avgEdgeDelta.toFixed(6)),
          performanceScore: parseFloat(performanceScore.toFixed(4)),
          sampleCount: total
        },
        regime: dominantRegime, // B59-fix: Populate regime field
      });
    }

    const report: CalibrationReport = {
      success: true,
      recommendations,
      analyzedTrades: trades.length,
      timestamp: Date.now(),
    };

    console.log('[11.0E.2] ML Calibration Report (Phase-10):', JSON.stringify(report, null, 2));
    return report;
  }

  /**
   * Log individual calibration suggestions to console.
   * Directive 11.0E.2: Includes Phase-10 performance context
   */
  static logRecommendations(report: CalibrationReport): void {
    if (!report.success || !report.recommendations) return;

    for (const rec of report.recommendations) {
      const phase10Info = rec.phase10Metrics 
        ? ` perfScore=${rec.phase10Metrics.performanceScore} edgeDelta=${rec.phase10Metrics.avgEdgeDelta}`
        : '';
      console.log(
        `[11.0E.2] ML Suggestion: ${rec.suggestion} ${rec.pattern} weight by ${rec.adjustment.toFixed(4)}${phase10Info}`
      );

      // B59-fix: Read actual current weight from cumulative tracker (not hardcoded 1.0)
      const paramKey = `ml.${rec.pattern}_weight`;
      const currentWeight = getCurrentWeight(paramKey);
      const newWeight = rec.suggestion === 'INCREASE'
        ? currentWeight + rec.adjustment
        : rec.suggestion === 'DECREASE'
          ? currentWeight - rec.adjustment
          : currentWeight; // HOLD — no change

      // B59-fix: Update cumulative tracker so next calibration builds on this value
      if (rec.suggestion !== 'HOLD') {
        setCurrentWeight(paramKey, newWeight);
      }

      logPredictiveAdjustment({
        category: 'Weight',
        parameter: paramKey,
        oldValue: currentWeight,
        newValue: newWeight,
        strategy: rec.pattern,
        regime: rec.regime, // B59-fix: Pass dominant regime
        reason: `MLCalibration: ${rec.suggestion} by ${rec.adjustment.toFixed(4)}${phase10Info}`
      });
    }
  }
}
