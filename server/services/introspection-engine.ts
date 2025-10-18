import { db } from "../db";
import {
  biasObservationLog,
  confidenceDriftLog,
  introspectionReport,
  type BiasType,
  type InsertBiasObservationLog,
  type InsertConfidenceDriftLog,
  type InsertIntrospectionReport,
  reasoningTrace,
  autonomyAuditLog,
  metaReasoningLog,
} from "@shared/schema";
import { sql, desc, and, gte } from "drizzle-orm";
import { eventBus } from "../lib/event-bus";

/**
 * Phase 15.0: IntrospectionEngine
 * 
 * Continuous self-analysis layer that:
 * - Analyzes reasoning traces for cognitive biases
 * - Tracks confidence drift over time
 * - Generates daily introspection reports
 * - Emits events for bias detection
 */
export class IntrospectionEngine {
  /**
   * Analyze recent decisions for cognitive biases
   */
  async detectBiases(userId: string, lookbackHours: number = 4): Promise<void> {
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

    // Fetch recent reasoning traces
    const traces = await db
      .select()
      .from(reasoningTrace)
      .where(and(
        sql`${reasoningTrace.createdAt} >= ${since}`,
        sql`${reasoningTrace.userId} = ${userId}`
      ))
      .orderBy(desc(reasoningTrace.createdAt))
      .limit(100);

    // Fetch recent meta-reasoning logs
    const metaLogs = await db
      .select()
      .from(metaReasoningLog)
      .where(and(
        sql`${metaReasoningLog.createdAt} >= ${since}`,
        sql`${metaReasoningLog.userId} = ${userId}`
      ))
      .orderBy(desc(metaReasoningLog.createdAt))
      .limit(50);

    // Analyze for each bias type
    const biasAnalyses = [
      this.detectConfirmationBias(traces),
      this.detectRecencyBias(traces),
      this.detectAnchoringBias(traces),
      this.detectOverconfidenceBias(metaLogs),
      this.detectAvailabilityBias(traces),
      this.detectOptimismBias(traces),
    ];

    // Record detected biases
    for (const bias of biasAnalyses) {
      if (bias.detected) {
        await db.insert(biasObservationLog).values({
          userId,
          biasType: bias.type,
          detectedContext: bias.context,
          confidenceScore: bias.confidence,
          decisionId: bias.decisionId,
          impactAssessment: bias.impact,
          metadata: bias.metadata,
        });

        // Emit event for real-time monitoring
        eventBus.emit("introspection_event", {
          type: "bias_detected",
          userId,
          biasType: bias.type,
          confidence: bias.confidence,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Calculate confidence drift metrics
   */
  async calculateConfidenceDrift(userId: string, sessionWindow: string = "last_4h"): Promise<void> {
    const windowHours = this.parseSessionWindow(sessionWindow);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    // Fetch decisions with confidence scores
    const decisions = await db
      .select()
      .from(metaReasoningLog)
      .where(and(
        sql`${metaReasoningLog.createdAt} >= ${since}`,
        sql`${metaReasoningLog.userId} = ${userId}`,
        sql`${metaReasoningLog.reflectionScore} IS NOT NULL`
      ))
      .orderBy(desc(metaReasoningLog.createdAt));

    if (decisions.length === 0) {
      return;
    }

    // Extract confidence scores (using reflectionScore as proxy)
    const confidenceScores = decisions.map(d => d.reflectionScore || 0.5);
    
    // Calculate statistics
    const average = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
    const variance = confidenceScores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / confidenceScores.length;
    
    // Determine drift direction
    const recentScores = confidenceScores.slice(0, Math.floor(confidenceScores.length / 3));
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const driftDirection = recentAvg > average + 0.05 ? "increasing" : 
                           recentAvg < average - 0.05 ? "decreasing" : "stable";

    // Record drift log
    await db.insert(confidenceDriftLog).values({
      userId,
      sessionWindow,
      averageConfidence: average,
      varianceScore: variance,
      driftDirection,
      decisionsAnalyzed: decisions.length,
      metadata: {
        minConfidence: Math.min(...confidenceScores),
        maxConfidence: Math.max(...confidenceScores),
        standardDeviation: Math.sqrt(variance),
      },
    });

    // Emit event if high variance detected
    if (variance > 0.15) {
      eventBus.emit("introspection_event", {
        type: "confidence_drift_warning",
        userId,
        variance,
        direction: driftDirection,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Generate daily introspection report
   */
  async generateDailyReport(userId: string, reportDate?: Date): Promise<void> {
    const date = reportDate || new Date();
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    // Fetch bias observations for the day
    const biasEvents = await db
      .select()
      .from(biasObservationLog)
      .where(and(
        sql`${biasObservationLog.userId} = ${userId}`,
        sql`${biasObservationLog.createdAt} >= ${startOfDay}`,
        sql`${biasObservationLog.createdAt} <= ${endOfDay}`
      ));

    // Aggregate bias types
    const biasTypeCounts: Record<string, number> = {};
    let totalConfidence = 0;

    for (const event of biasEvents) {
      biasTypeCounts[event.biasType] = (biasTypeCounts[event.biasType] || 0) + 1;
      totalConfidence += event.confidenceScore;
    }

    const topBiasTypes = Object.entries(biasTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate bias index (0-100)
    const biasIndex = Math.min(100, Math.floor(biasEvents.length * 5 + (totalConfidence / Math.max(biasEvents.length, 1)) * 30));

    // Get confidence stability from drift logs
    const driftLogs = await db
      .select()
      .from(confidenceDriftLog)
      .where(and(
        sql`${confidenceDriftLog.userId} = ${userId}`,
        sql`${confidenceDriftLog.createdAt} >= ${startOfDay}`,
        sql`${confidenceDriftLog.createdAt} <= ${endOfDay}`
      ))
      .orderBy(desc(confidenceDriftLog.createdAt))
      .limit(1);

    const confidenceStability = driftLogs.length > 0 
      ? Math.max(0, 1 - driftLogs[0].varianceScore) 
      : 1.0;

    // Count mitigations applied today
    const mitigationCount = 0; // Will be populated by BiasMitigation service

    // Generate summary
    const summary = this.generateSummaryText(biasIndex, confidenceStability, biasEvents.length, topBiasTypes);

    // Create report
    await db.insert(introspectionReport).values({
      userId,
      reportDate: startOfDay,
      biasIndex,
      confidenceStability,
      totalBiasEvents: biasEvents.length,
      topBiasTypes,
      mitigationsApplied: mitigationCount,
      summary,
      metadata: {
        avgBiasConfidence: biasEvents.length > 0 ? totalConfidence / biasEvents.length : 0,
        uniqueBiasTypes: Object.keys(biasTypeCounts).length,
      },
    });

    // Emit report event
    eventBus.emit("introspection_event", {
      type: "daily_report_generated",
      userId,
      biasIndex,
      confidenceStability,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get latest introspection summary
   */
  async getLatestSummary(userId: string) {
    const latestReport = await db
      .select()
      .from(introspectionReport)
      .where(sql`${introspectionReport.userId} = ${userId}`)
      .orderBy(desc(introspectionReport.createdAt))
      .limit(1);

    if (latestReport.length === 0) {
      return {
        biasIndex: 0,
        confidenceStability: 1.0,
        totalBiasEvents: 0,
        lastUpdated: null,
      };
    }

    return {
      biasIndex: latestReport[0].biasIndex,
      confidenceStability: latestReport[0].confidenceStability,
      totalBiasEvents: latestReport[0].totalBiasEvents,
      topBiasTypes: latestReport[0].topBiasTypes,
      summary: latestReport[0].summary,
      lastUpdated: latestReport[0].createdAt,
    };
  }

  /**
   * Get recent bias events (last 24h)
   */
  async getRecentBiases(userId: string, hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return await db
      .select()
      .from(biasObservationLog)
      .where(and(
        sql`${biasObservationLog.userId} = ${userId}`,
        sql`${biasObservationLog.createdAt} >= ${since}`
      ))
      .orderBy(desc(biasObservationLog.createdAt));
  }

  /**
   * Get confidence drift chart data
   */
  async getConfidenceDriftData(userId: string, hours: number = 48) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return await db
      .select()
      .from(confidenceDriftLog)
      .where(and(
        sql`${confidenceDriftLog.userId} = ${userId}`,
        sql`${confidenceDriftLog.createdAt} >= ${since}`
      ))
      .orderBy(confidenceDriftLog.createdAt);
  }

  // Bias detection methods
  private detectConfirmationBias(traces: any[]): BiasAnalysisResult {
    // Look for patterns where agent only considers supporting evidence
    const supportingCount = traces.filter(t => 
      t.reasoning?.toLowerCase().includes("confirms") || 
      t.reasoning?.toLowerCase().includes("supports")
    ).length;
    
    const confidence = Math.min(1.0, supportingCount / Math.max(traces.length, 1));
    
    return {
      detected: confidence > 0.6,
      type: "confirmation",
      confidence,
      context: `Detected ${supportingCount}/${traces.length} reasoning traces showing confirmation patterns`,
      decisionId: traces[0]?.id,
      impact: "May ignore contradictory evidence",
      metadata: { supportingCount, totalTraces: traces.length },
    };
  }

  private detectRecencyBias(traces: any[]): BiasAnalysisResult {
    // Check if recent data is overweighted
    if (traces.length < 5) {
      return { detected: false, type: "recency", confidence: 0, context: "", decisionId: null, impact: "", metadata: {} };
    }

    const recentWeight = traces.slice(0, 2).length / traces.length;
    const confidence = recentWeight > 0.5 ? 0.7 : 0.3;

    return {
      detected: confidence > 0.6,
      type: "recency",
      confidence,
      context: `Recent decisions appear to dominate reasoning patterns`,
      decisionId: traces[0]?.id,
      impact: "May give undue weight to recent events",
      metadata: { recentWeight },
    };
  }

  private detectAnchoringBias(traces: any[]): BiasAnalysisResult {
    // Simplified detection - would need historical baseline
    return {
      detected: false,
      type: "anchoring",
      confidence: 0.3,
      context: "Anchoring bias requires baseline comparison",
      decisionId: null,
      impact: "",
      metadata: {},
    };
  }

  private detectOverconfidenceBias(metaLogs: any[]): BiasAnalysisResult {
    const highConfidenceLogs = metaLogs.filter(log => 
      (log.reflectionScore || 0) > 0.85
    ).length;

    const confidence = Math.min(1.0, highConfidenceLogs / Math.max(metaLogs.length, 1));

    return {
      detected: confidence > 0.7,
      type: "overconfidence",
      confidence,
      context: `${highConfidenceLogs}/${metaLogs.length} meta-reasoning logs show high confidence`,
      decisionId: metaLogs[0]?.id,
      impact: "May underestimate uncertainty",
      metadata: { highConfidenceCount: highConfidenceLogs },
    };
  }

  private detectAvailabilityBias(traces: any[]): BiasAnalysisResult {
    // Simplified - would need to check if easily recalled info dominates
    return {
      detected: false,
      type: "availability",
      confidence: 0.2,
      context: "Availability bias requires deeper context analysis",
      decisionId: null,
      impact: "",
      metadata: {},
    };
  }

  private detectOptimismBias(traces: any[]): BiasAnalysisResult {
    const optimisticPatterns = traces.filter(t =>
      t.reasoning?.toLowerCase().includes("optimistic") ||
      t.reasoning?.toLowerCase().includes("positive") ||
      t.reasoning?.toLowerCase().includes("likely succeed")
    ).length;

    const confidence = Math.min(1.0, optimisticPatterns / Math.max(traces.length, 1));

    return {
      detected: confidence > 0.5,
      type: "optimism",
      confidence,
      context: `Detected ${optimisticPatterns} optimistic reasoning patterns`,
      decisionId: traces[0]?.id,
      impact: "May underestimate risks",
      metadata: { optimisticPatterns },
    };
  }

  private parseSessionWindow(window: string): number {
    const match = window.match(/last_(\d+)h/);
    return match ? parseInt(match[1]) : 4;
  }

  private generateSummaryText(
    biasIndex: number,
    confidenceStability: number,
    totalBiases: number,
    topBiasTypes: Array<{ type: string; count: number }>
  ): string {
    const biasLevel = biasIndex < 30 ? "low" : biasIndex < 60 ? "moderate" : "high";
    const stabilityLevel = confidenceStability > 0.8 ? "high" : confidenceStability > 0.5 ? "moderate" : "low";

    let summary = `Cognitive introspection shows ${biasLevel} bias index (${biasIndex}/100) with ${stabilityLevel} confidence stability (${(confidenceStability * 100).toFixed(1)}%). `;
    
    if (totalBiases > 0) {
      const topBias = topBiasTypes[0];
      summary += `Detected ${totalBiases} bias events today, primarily ${topBias.type} bias (${topBias.count} occurrences). `;
    } else {
      summary += `No significant biases detected today. `;
    }

    if (biasIndex > 70) {
      summary += `⚠️ High bias index suggests need for immediate mitigation.`;
    }

    return summary;
  }
}

interface BiasAnalysisResult {
  detected: boolean;
  type: BiasType;
  confidence: number;
  context: string;
  decisionId: string | null;
  impact: string;
  metadata: Record<string, any>;
}

// Singleton instance
export const introspectionEngine = new IntrospectionEngine();
