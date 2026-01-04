/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 DIRECTIVE 10.6 — ML Calibration Service (The Training Loop)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Analyze VTS trade outcomes and generate learning recommendations
 * for Hybrid signal weights and decay parameters.
 * 
 * This service acts as the system's "self-tuning module", enabling the engine
 * to learn from its own trades and continuously improve strategy weighting.
 * 
 * Key Features:
 * - Analyzes recent Hybrid trades grouped by pattern type
 * - Calculates win rate and expectancy per pattern
 * - Generates structured adjustment recommendations
 * - Provides training-ready dataset for future ML integration
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { HYBRID_PARAMS } from '../config/system-guards';
import type { CalibrationReport, CalibrationRecommendation, PatternType } from '../types';

export interface TradeRecord {
  signalType?: string;
  patternType?: string;
  pnl: number;
}

export type GetRecentTradesFn = (windowSize: number, signalType: string) => Promise<TradeRecord[]>;

let getRecentTradesFn: GetRecentTradesFn | null = null;

export function setGetRecentTradesFn(fn: GetRecentTradesFn): void {
  getRecentTradesFn = fn;
}

export class MLCalibrationService {
  private static readonly WIN_RATE_INCREASE_THRESHOLD = 55;
  private static readonly WIN_RATE_DECREASE_THRESHOLD = 45;
  private static readonly ADJUSTMENT_STEP = 0.05;

  /**
   * Analyze recent Hybrid trades and generate learning recommendations.
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
        reason: 'No Hybrid trades found for calibration',
        timestamp: Date.now()
      };
    }

    const grouped: Record<string, { wins: number; losses: number; expectancy: number }> = {};

    for (const t of trades) {
      const pattern = t.patternType || 'UNKNOWN';
      if (!grouped[pattern]) {
        grouped[pattern] = { wins: 0, losses: 0, expectancy: 0 };
      }
      if (t.pnl > 0) {
        grouped[pattern].wins++;
      } else {
        grouped[pattern].losses++;
      }
      grouped[pattern].expectancy += t.pnl;
    }

    const recommendations: CalibrationRecommendation[] = [];

    for (const [pattern, stats] of Object.entries(grouped)) {
      const total = stats.wins + stats.losses;
      if (total === 0) continue;

      const winRate = (stats.wins / total) * 100;
      const avgExpectancy = stats.expectancy / total;
      
      let suggestion: 'INCREASE' | 'DECREASE' | 'HOLD' = 'HOLD';
      let adjustment = 0;

      if (winRate > this.WIN_RATE_INCREASE_THRESHOLD) {
        suggestion = 'INCREASE';
        adjustment = this.ADJUSTMENT_STEP;
      } else if (winRate < this.WIN_RATE_DECREASE_THRESHOLD) {
        suggestion = 'DECREASE';
        adjustment = -this.ADJUSTMENT_STEP;
      }

      recommendations.push({
        pattern: pattern as PatternType | 'UNKNOWN',
        winRate: parseFloat(winRate.toFixed(1)),
        avgExpectancy: parseFloat(avgExpectancy.toFixed(4)),
        suggestion,
        adjustment,
      });
    }

    const report: CalibrationReport = {
      success: true,
      recommendations,
      analyzedTrades: trades.length,
      timestamp: Date.now(),
    };

    console.log('[10.6] ML Calibration Report:', JSON.stringify(report, null, 2));
    return report;
  }

  /**
   * Log individual calibration suggestions to console.
   * Called after analyzePerformance() completes.
   */
  static logRecommendations(report: CalibrationReport): void {
    if (!report.success || !report.recommendations) return;

    for (const rec of report.recommendations) {
      console.log(
        `[10.6] ML Suggestion: ${rec.suggestion} ${rec.pattern} weight by ${rec.adjustment.toFixed(2)}`
      );
    }
  }
}
