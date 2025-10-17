import { nanoid } from 'nanoid';
import { db } from '../db';
import { autonomyAuditLog, cognitiveTuningLog, reasoningQueue } from '@shared/schema';
import { contextBridge } from './context-bridge';
import { desc, sql, gte } from 'drizzle-orm';

/**
 * Phase 8.9.4: Self-Optimization Cycle
 * Analyzes long-term performance metrics and tunes system parameters automatically
 */

export interface PerformanceTrends {
  period: string;
  averageLatency: number;
  successRate: number;
  queueThroughput: number;
  cognitiveAccuracy: number;
  trends: {
    latency: 'improving' | 'stable' | 'degrading';
    accuracy: 'improving' | 'stable' | 'degrading';
    throughput: 'improving' | 'stable' | 'degrading';
  };
}

export interface OptimizationHeuristic {
  parameter: string;
  currentValue: any;
  suggestedValue: any;
  rationale: string;
  expectedImpact: string;
}

export interface OptimizationEvent {
  runId: string;
  timestamp: Date;
  heuristicsUpdated: string[];
  performanceGains: Record<string, number>;
  success: boolean;
}

class SelfOptimizerService {
  private config = {
    latencyThresholds: {
      excellent: 200,
      good: 400,
      acceptable: 600,
      poor: 1000,
    },
    accuracyThresholds: {
      excellent: 0.9,
      good: 0.8,
      acceptable: 0.7,
      poor: 0.6,
    },
    throughputThresholds: {
      excellent: 10,
      good: 5,
      acceptable: 2,
      poor: 1,
    },
  };

  /**
   * Evaluate performance trends over time
   */
  async evaluatePerformanceTrends(days: number = 7): Promise<PerformanceTrends> {
    console.log(`[SelfOptimizer] 📊 Evaluating performance trends (${days} days)`);

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // 1. Fetch recent cognitive test results
      const recentTests = await db
        .select()
        .from(cognitiveTuningLog)
        .where(gte(cognitiveTuningLog.createdAt, cutoffDate))
        .orderBy(desc(cognitiveTuningLog.createdAt));

      if (recentTests.length === 0) {
        return this.getDefaultTrends(days);
      }

      // 2. Calculate average metrics
      const averageLatency = recentTests
        .filter(t => t.avgLatencyMs)
        .reduce((sum, t) => sum + (t.avgLatencyMs || 0), 0) / recentTests.length;

      const passedTests = recentTests.filter(t => t.result === 'PASS').length;
      const successRate = passedTests / recentTests.length;

      const averageThroughput = recentTests
        .filter(t => t.queueThroughput)
        .reduce((sum, t) => sum + (t.queueThroughput || 0), 0) / recentTests.length;

      // 3. Calculate cognitive accuracy from domain accuracy
      const cognitiveAccuracy = recentTests
        .filter(t => t.domainAccuracy)
        .reduce((sum, t) => {
          const domainAcc = t.domainAccuracy as any;
          const totalPassed = Object.values(domainAcc).reduce((s: number, d: any) => s + (d.passed || 0), 0);
          const totalFailed = Object.values(domainAcc).reduce((s: number, d: any) => s + (d.failed || 0), 0);
          return sum + (totalPassed / (totalPassed + totalFailed || 1));
        }, 0) / recentTests.length;

      // 4. Analyze trends (compare first half vs second half)
      const midpoint = Math.floor(recentTests.length / 2);
      const firstHalf = recentTests.slice(0, midpoint);
      const secondHalf = recentTests.slice(midpoint);

      const trends = {
        latency: this.analyzeTrend(
          firstHalf.reduce((s, t) => s + (t.avgLatencyMs || 0), 0) / firstHalf.length,
          secondHalf.reduce((s, t) => s + (t.avgLatencyMs || 0), 0) / secondHalf.length,
          'lower'
        ),
        accuracy: this.analyzeTrend(
          firstHalf.filter(t => t.result === 'PASS').length / firstHalf.length,
          secondHalf.filter(t => t.result === 'PASS').length / secondHalf.length,
          'higher'
        ),
        throughput: this.analyzeTrend(
          firstHalf.reduce((s, t) => s + (t.queueThroughput || 0), 0) / firstHalf.length,
          secondHalf.reduce((s, t) => s + (t.queueThroughput || 0), 0) / secondHalf.length,
          'higher'
        ),
      };

      const performanceTrends: PerformanceTrends = {
        period: `${days} days`,
        averageLatency,
        successRate,
        queueThroughput: averageThroughput,
        cognitiveAccuracy,
        trends,
      };

      console.log(`[SelfOptimizer] ✅ Trends analyzed - Latency: ${trends.latency}, Accuracy: ${trends.accuracy}`);

      return performanceTrends;
    } catch (error) {
      console.error(`[SelfOptimizer] ❌ Trend evaluation failed:`, error);
      throw error;
    }
  }

  /**
   * Update heuristics based on performance trends
   */
  async updateHeuristics(trends: PerformanceTrends): Promise<OptimizationHeuristic[]> {
    console.log(`[SelfOptimizer] 🔧 Updating heuristics based on trends`);

    const heuristics: OptimizationHeuristic[] = [];

    // 1. Latency optimization
    if (trends.trends.latency === 'degrading' || trends.averageLatency > this.config.latencyThresholds.acceptable) {
      heuristics.push({
        parameter: 'queue_retry_backoff_ms',
        currentValue: 1000,
        suggestedValue: 2000,
        rationale: 'Increasing backoff to reduce queue contention',
        expectedImpact: 'Reduce latency by 15-20%',
      });

      heuristics.push({
        parameter: 'cache_ttl_seconds',
        currentValue: 30,
        suggestedValue: 60,
        rationale: 'Extend cache TTL to reduce database queries',
        expectedImpact: 'Improve response time by 25%',
      });
    }

    // 2. Accuracy optimization
    if (trends.trends.accuracy === 'degrading' || trends.cognitiveAccuracy < this.config.accuracyThresholds.acceptable) {
      heuristics.push({
        parameter: 'domain_inference_threshold',
        currentValue: 0.5,
        suggestedValue: 0.7,
        rationale: 'Increase confidence threshold for domain classification',
        expectedImpact: 'Improve accuracy by 10-15%',
      });

      heuristics.push({
        parameter: 'memory_checksum_frequency',
        currentValue: 'on_demand',
        suggestedValue: 'every_trace',
        rationale: 'More frequent integrity checks to prevent corruption',
        expectedImpact: 'Reduce reasoning errors by 20%',
      });
    }

    // 3. Throughput optimization
    if (trends.trends.throughput === 'degrading' || trends.queueThroughput < this.config.throughputThresholds.acceptable) {
      heuristics.push({
        parameter: 'queue_worker_concurrency',
        currentValue: 1,
        suggestedValue: 3,
        rationale: 'Increase parallel task processing',
        expectedImpact: 'Boost throughput by 200%',
      });

      heuristics.push({
        parameter: 'task_batch_size',
        currentValue: 1,
        suggestedValue: 5,
        rationale: 'Process tasks in batches for better efficiency',
        expectedImpact: 'Improve queue processing by 40%',
      });
    }

    console.log(`[SelfOptimizer] ✅ Generated ${heuristics.length} optimization heuristics`);

    return heuristics;
  }

  /**
   * Log optimization event
   */
  async logOptimizationEvent(
    heuristics: OptimizationHeuristic[],
    applied: boolean = false
  ): Promise<OptimizationEvent> {
    const runId = `opt_${nanoid(12)}`;
    const startTime = performance.now();

    console.log(`[SelfOptimizer] 📝 Logging optimization event (runId: ${runId})`);

    try {
      const heuristicsUpdated = heuristics.map(h => h.parameter);
      
      // Calculate expected performance gains
      const performanceGains: Record<string, number> = {};
      for (const h of heuristics) {
        const impact = h.expectedImpact.match(/(\d+)/);
        if (impact) {
          performanceGains[h.parameter] = parseInt(impact[1]);
        }
      }

      // Record in autonomy audit log
      await db.insert(autonomyAuditLog).values({
        runId,
        actionType: 'optimization',
        triggerSource: 'scheduled',
        assessmentResult: {
          heuristics: heuristics.map(h => ({
            parameter: h.parameter,
            from: h.currentValue,
            to: h.suggestedValue,
            rationale: h.rationale,
          })),
          applied,
        } as any,
        actionsTriggered: heuristicsUpdated,
        success: true,
        executionTimeMs: Math.round(performance.now() - startTime),
        metadata: { heuristicsCount: heuristics.length, applied } as any,
      });

      // Broadcast optimization event
      await contextBridge.broadcast({
        type: 'state_update',
        userId: undefined,
        payload: {
          runId,
          heuristicsUpdated,
          performanceGains,
          applied,
          eventSubtype: 'self_optimization',
        },
      });

      const event: OptimizationEvent = {
        runId,
        timestamp: new Date(),
        heuristicsUpdated,
        performanceGains,
        success: true,
      };

      console.log(`[SelfOptimizer] ✅ Optimization event logged - ${heuristicsUpdated.length} parameters`);

      return event;
    } catch (error) {
      console.error(`[SelfOptimizer] ❌ Event logging failed:`, error);
      throw error;
    }
  }

  /**
   * Run full optimization cycle
   */
  async runOptimizationCycle(): Promise<{
    trends: PerformanceTrends;
    heuristics: OptimizationHeuristic[];
    event: OptimizationEvent;
  }> {
    console.log(`[SelfOptimizer] 🚀 Running full optimization cycle`);

    try {
      // 1. Evaluate performance trends
      const trends = await this.evaluatePerformanceTrends(7);

      // 2. Generate optimization heuristics
      const heuristics = await this.updateHeuristics(trends);

      // 3. Log optimization event (not applying yet, just recommending)
      const event = await this.logOptimizationEvent(heuristics, false);

      console.log(`[SelfOptimizer] ✅ Optimization cycle complete - ${heuristics.length} recommendations`);

      return { trends, heuristics, event };
    } catch (error) {
      console.error(`[SelfOptimizer] ❌ Optimization cycle failed:`, error);
      throw error;
    }
  }

  /**
   * Analyze trend direction
   */
  private analyzeTrend(
    earlierValue: number,
    laterValue: number,
    desiredDirection: 'higher' | 'lower'
  ): 'improving' | 'stable' | 'degrading' {
    const changePercent = ((laterValue - earlierValue) / earlierValue) * 100;

    if (Math.abs(changePercent) < 5) return 'stable';

    if (desiredDirection === 'higher') {
      return changePercent > 0 ? 'improving' : 'degrading';
    } else {
      return changePercent < 0 ? 'improving' : 'degrading';
    }
  }

  /**
   * Get default trends when no data available
   */
  private getDefaultTrends(days: number): PerformanceTrends {
    return {
      period: `${days} days`,
      averageLatency: 0,
      successRate: 0,
      queueThroughput: 0,
      cognitiveAccuracy: 0,
      trends: {
        latency: 'stable',
        accuracy: 'stable',
        throughput: 'stable',
      },
    };
  }

  /**
   * Get recent optimization events
   */
  async getRecentOptimizations(limit: number = 10): Promise<any[]> {
    return await db
      .select()
      .from(autonomyAuditLog)
      .where(sql`${autonomyAuditLog.actionType} = 'optimization'`)
      .orderBy(desc(autonomyAuditLog.timestamp))
      .limit(limit);
  }
}

export const selfOptimizer = new SelfOptimizerService();
