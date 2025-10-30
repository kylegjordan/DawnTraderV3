import { db } from "../db";
import { strategyDriveMetrics, strategyDriveSummary } from "../../shared/schema";
import { desc, eq } from "drizzle-orm";

interface StrategyTelemetry {
  strategy: string;
  hitRate: number;
  avgRMultiple: number;
  avgToxicity: number;
  totalProfitUSD?: number;
  totalTrades?: number;
  alphaStrength?: number;
}

/**
 * Phase 31.A – EMA Smoothing Utility
 * Calculates exponential moving average for SDI smoothing
 */
function emaSmooth(values: number[], period: number = 5): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  return values.reduce(
    (prev, curr, idx) => idx === 0 ? curr : curr * k + prev * (1 - k),
    values[0]
  );
}

/**
 * Phase 31.G: Motivational Incentive Engine Parameters
 */
interface MotivationalIncentiveConfig {
  driveRewardFactor: number;
  drivePenaltyFactor: number;
  challengePersistence: number;
  minConfidenceForReward: number;
}

export class StrategicDriveService {
  private incentiveConfig: MotivationalIncentiveConfig = {
    driveRewardFactor: 0.8,
    drivePenaltyFactor: 0.6,
    challengePersistence: 12,
    minConfidenceForReward: 0.55,
  };

  constructor() {
    console.log('[31.G][SDPOE] Motivational Incentive Layer initialized');
  }

  /**
   * Compute drive metrics for all strategies based on telemetry data
   */
  async computeDriveMetrics(mode: "paper" | "live"): Promise<any[]> {
    try {
      // Get telemetry for all strategies
      const telemetry = await this.getTelemetryForAllStrategies(mode);
      const results: any[] = [];

      for (const t of telemetry) {
        // Calculate drive score: 50% hit rate, 30% R-multiple, -20% toxicity
        const driveScore =
          0.5 * (t.hitRate || 0) +
          0.3 * (t.avgRMultiple || 0) -
          0.2 * (t.avgToxicity || 0);

        const [inserted] = await db.insert(strategyDriveMetrics).values({
          strategy: t.strategy,
          mode,
          totalProfitUSD: t.totalProfitUSD || 0,
          totalTrades: t.totalTrades || 0,
          winRate: t.hitRate || 0,
          avgRMultiple: t.avgRMultiple || 0,
          alphaStrength: t.alphaStrength || 0,
          riskExposure: t.avgToxicity || 0,
          driveScore,
        }).returning();

        results.push(inserted);
      }

      console.log(`[31.0][SDPOE] Computed drive metrics for ${results.length} strategies (mode: ${mode})`);
      return results;
    } catch (error: any) {
      console.error(`[31.0][SDPOE] Error computing drive metrics:`, error);
      return [];
    }
  }

  /**
   * Summarize drive metrics and calculate Strategic Drive Index (SDI)
   * Phase 31.B – Enhanced with EMA smoothing and forecasting
   */
  async summarizeDriveMetrics(): Promise<any> {
    try {
      // Get the last 5 metrics for each strategy
      const metrics = await db
        .select()
        .from(strategyDriveMetrics)
        .orderBy(desc(strategyDriveMetrics.timestamp))
        .limit(50);

      if (metrics.length === 0) {
        console.log('[31.0][SDPOE] No metrics available for summary');
        return null;
      }

      // Group by strategy and calculate average drive scores
      const grouped = metrics.reduce((acc: any, m) => {
        if (!acc[m.strategy]) {
          acc[m.strategy] = [];
        }
        acc[m.strategy].push(m.driveScore);
        return acc;
      }, {});

      const avgScores: Record<string, number> = {};
      for (const strategy in grouped) {
        const scores = grouped[strategy];
        avgScores[strategy] = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
      }

      // Find best and worst strategies
      const entries = Object.entries(avgScores);
      if (entries.length === 0) {
        console.log('[31.0][SDPOE] No strategy scores available');
        return null;
      }

      const best = entries.sort((a, b) => b[1] - a[1])[0];
      const worst = entries.sort((a, b) => a[1] - b[1])[0];

      // Calculate global SDI (average of all strategy scores)
      const globalSDI = entries.reduce((sum, [_, v]) => sum + v, 0) / entries.length;

      // Phase 31.B – Add Smoothed SDI and Forecast
      const recent = await db
        .select()
        .from(strategyDriveSummary)
        .orderBy(desc(strategyDriveSummary.createdAt))
        .limit(10);

      // Reverse to chronological order (oldest→newest) for correct EMA calculation
      const recentValues = recent.map(r => Number(r.globalSDI)).reverse();
      const sdiSmoothed = emaSmooth([...recentValues, globalSDI]);

      // Simple forecast logic – trend based prediction
      const mostRecentSDI = recent.length > 0 ? Number(recent[0].globalSDI) : globalSDI;
      const delta = globalSDI - mostRecentSDI;
      const forecastConfidence = Math.min(Math.abs(delta) * 10, 1);
      const forecastBest = best[0];
      const forecastWeakest = worst[0];

      // Phase 31.G: Motivational Incentive Engine
      const previousDriveIndex = recent.length > 0 ? Number(recent[0].driveIndex) : 0.5;
      const previousPersonalBest = recent.length > 0 ? Number(recent[0].personalBest) : 0;
      
      let driveIndex = previousDriveIndex;
      let personalBest = previousPersonalBest;
      
      // Apply reward or penalty based on SDI delta
      if (delta > 0 && forecastConfidence >= this.incentiveConfig.minConfidenceForReward) {
        // Reward: SDI increased
        const rewardPoints = delta * 100 * this.incentiveConfig.driveRewardFactor;
        driveIndex = Math.min(1.0, driveIndex + (rewardPoints / 100));
        console.log(`[31.G][Motivation] SDI +${delta.toFixed(3)} → Reward +${rewardPoints.toFixed(0)} pts (DriveIndex = ${driveIndex.toFixed(2)})`);
      } else if (delta < 0) {
        // Penalty: SDI decreased
        const penaltyPoints = Math.abs(delta) * 100 * this.incentiveConfig.drivePenaltyFactor;
        driveIndex = Math.max(0.0, driveIndex - (penaltyPoints / 100));
        console.log(`[31.G][Motivation] SDI ${delta.toFixed(3)} → Penalty -${penaltyPoints.toFixed(0)} pts (DriveIndex = ${driveIndex.toFixed(2)})`);
      }
      
      // Update personal best if exceeded
      if (globalSDI > personalBest) {
        personalBest = globalSDI;
        console.log(`[31.G][Motivation] New personal best! Target updated → ${personalBest.toFixed(2)}`);
      }

      // Create summary record with smoothed values, forecast, and motivational metrics
      const [summary] = await db.insert(strategyDriveSummary).values({
        globalSDI,
        bestStrategy: best[0],
        weakestStrategy: worst[0],
        dhmaWeight: avgScores["dhma"] || 1,
        quantflowWeight: avgScores["quantflow"] || 1,
        trendpulseWeight: avgScores["trendpulse"] || 1,
        volsurfWeight: avgScores["volsurf"] || 1,
        momentumxWeight: avgScores["momentumx"] || 1,
        sdiSmoothed,
        forecastBest,
        forecastWeakest,
        forecastConfidence,
        driveIndex,
        personalBest,
      }).returning();

      console.log(`[31.0][SDPOE] Summary created - Global SDI: ${globalSDI.toFixed(3)}, Best: ${best[0]}, Weakest: ${worst[0]}`);
      console.log(`[31.A/B] Smoothed SDI: ${sdiSmoothed.toFixed(3)} | Forecast Best: ${forecastBest} (confidence: ${forecastConfidence.toFixed(2)})`);
      console.log(`[31.G] DriveIndex: ${driveIndex.toFixed(2)} | PersonalBest: ${personalBest.toFixed(2)}`);

      return { globalSDI, best, worst, summary, driveIndex, personalBest };
    } catch (error: any) {
      console.error(`[31.0][SDPOE] Error summarizing drive metrics:`, error);
      return null;
    }
  }

  /**
   * Get telemetry data for all strategies (mock data for now)
   * TODO: Integrate with actual telemetry service
   */
  private async getTelemetryForAllStrategies(mode: "paper" | "live"): Promise<StrategyTelemetry[]> {
    // Mock telemetry data for now - in production, this would query actual strategy telemetry
    const mockTelemetry: StrategyTelemetry[] = [
      {
        strategy: "dhma",
        hitRate: 0.65,
        avgRMultiple: 2.1,
        avgToxicity: 0.3,
        totalProfitUSD: 450.25,
        totalTrades: 15,
        alphaStrength: 0.75,
      },
      {
        strategy: "quantflow",
        hitRate: 0.58,
        avgRMultiple: 1.8,
        avgToxicity: 0.4,
        totalProfitUSD: 320.50,
        totalTrades: 12,
        alphaStrength: 0.68,
      },
      {
        strategy: "trendpulse",
        hitRate: 0.70,
        avgRMultiple: 2.3,
        avgToxicity: 0.25,
        totalProfitUSD: 520.75,
        totalTrades: 18,
        alphaStrength: 0.82,
      },
      {
        strategy: "volsurf",
        hitRate: 0.45,
        avgRMultiple: 1.5,
        avgToxicity: 0.55,
        totalProfitUSD: 150.30,
        totalTrades: 10,
        alphaStrength: 0.52,
      },
      {
        strategy: "momentumx",
        hitRate: 0.62,
        avgRMultiple: 1.9,
        avgToxicity: 0.35,
        totalProfitUSD: 380.60,
        totalTrades: 14,
        alphaStrength: 0.71,
      },
    ];

    return mockTelemetry;
  }

  /**
   * Get the latest drive summary
   */
  async getLatestSummary() {
    try {
      const [latest] = await db
        .select()
        .from(strategyDriveSummary)
        .orderBy(desc(strategyDriveSummary.createdAt))
        .limit(1);

      return latest || null;
    } catch (error: any) {
      console.error(`[31.0][SDPOE] Error getting latest summary:`, error);
      return null;
    }
  }
}

export const strategicDriveService = new StrategicDriveService();
