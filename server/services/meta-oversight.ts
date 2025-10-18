/**
 * Phase 9.8: Meta-Cognitive Oversight Engine
 * 
 * Supervises learning activity, detects bias trends, and identifies instability
 * across all domain agents. Provides oversight and recommendations for
 * cognitive health and performance optimization.
 */

import { db } from '../db';
import { metaCognitionLog, agentLearningFeedback } from '../../shared/schema';
import type { InsertMetaCognitionLog, MetaCognitionLog, OversightFlagType } from '../../shared/schema';
import { desc, eq, and, gte, sql, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface OversightFlag {
  id: string;
  sourceAgent: string | null;
  flagType: OversightFlagType;
  severity: number;
  message: string;
  context: any;
  recommendations: string[];
  resolved: boolean;
  createdAt: Date;
}

export interface OversightSummary {
  totalActiveFlags: number;
  highestSeverity: number;
  flagsByType: Record<OversightFlagType, number>;
  topRecommendations: string[];
  recentFlags: OversightFlag[];
}

export interface LearningTrendAnalysis {
  agentName: string;
  domain: string;
  hasInstability: boolean;
  hasBias: boolean;
  hasLowConfidence: boolean;
  trendDetails: {
    averageAccuracy: number;
    accuracyVariance: number;
    recentDropPercent: number;
    consistencyScore: number;
  };
}

class MetaOversightService {
  /**
   * Sanitize numerical values to prevent NaN/Infinity propagation
   */
  private sanitizeScore(value: number): number | null {
    if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) {
      return null;
    }
    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, value));
  }

  /**
   * Analyze learning trends across all agents to detect issues
   */
  async analyzeLearningTrends(): Promise<LearningTrendAnalysis[]> {
    try {
      console.log('[MetaOversight] 🔍 Analyzing learning trends across agents');

      // Get all agents with feedback in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentFeedback = await db.select()
        .from(agentLearningFeedback)
        .where(gte(agentLearningFeedback.createdAt, sevenDaysAgo))
        .orderBy(desc(agentLearningFeedback.createdAt));

      // Group by agent
      const agentGroups = new Map<string, typeof recentFeedback>();
      for (const feedback of recentFeedback) {
        const key = `${feedback.agentName}:${feedback.domain}`;
        if (!agentGroups.has(key)) {
          agentGroups.set(key, []);
        }
        agentGroups.get(key)!.push(feedback);
      }

      const analyses: LearningTrendAnalysis[] = [];

      for (const [key, feedbacks] of agentGroups.entries()) {
        const [agentName, domain] = key.split(':');
        
        if (feedbacks.length < 3) {
          // Not enough data for meaningful analysis
          continue;
        }

        const accuracyScores = feedbacks
          .map(f => f.accuracyScore)
          .filter((score): score is number => score !== null && isFinite(score));

        if (accuracyScores.length === 0) continue;

        const avgAccuracy = accuracyScores.reduce((a, b) => a + b, 0) / accuracyScores.length;
        const variance = accuracyScores.reduce((sum, score) => {
          return sum + Math.pow(score - avgAccuracy, 2);
        }, 0) / accuracyScores.length;

        // Check recent performance drop
        const recentScores = accuracyScores.slice(0, Math.min(5, accuracyScores.length));
        const olderScores = accuracyScores.slice(5);
        const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
        const olderAvg = olderScores.length > 0 
          ? olderScores.reduce((a, b) => a + b, 0) / olderScores.length 
          : recentAvg;
        const dropPercent = olderAvg > 0 ? ((olderAvg - recentAvg) / olderAvg) * 100 : 0;

        // Calculate consistency score (inverse of variance)
        const consistencyScore = Math.max(0, 1 - Math.sqrt(variance));

        const analysis: LearningTrendAnalysis = {
          agentName,
          domain,
          hasInstability: variance > 0.15, // High variance indicates instability
          hasBias: avgAccuracy < 0.5, // Consistently low accuracy suggests bias
          hasLowConfidence: consistencyScore < 0.6, // Low consistency
          trendDetails: {
            averageAccuracy: this.sanitizeScore(avgAccuracy) ?? 0,
            accuracyVariance: this.sanitizeScore(variance) ?? 0,
            recentDropPercent: this.sanitizeScore(dropPercent / 100) ?? 0,
            consistencyScore: this.sanitizeScore(consistencyScore) ?? 0,
          },
        };

        analyses.push(analysis);

        // Auto-flag serious issues
        if (analysis.hasInstability && variance > 0.25) {
          await this.flagIssues(
            agentName,
            'instability',
            this.sanitizeScore(variance) ?? 0.5,
            `High performance variance detected (${(variance * 100).toFixed(1)}%)`,
            { domain, variance, avgAccuracy, consistencyScore }
          );
        }

        if (analysis.hasBias && avgAccuracy < 0.4) {
          await this.flagIssues(
            agentName,
            'bias',
            this.sanitizeScore(1 - avgAccuracy) ?? 0.5,
            `Consistently low accuracy detected (${(avgAccuracy * 100).toFixed(1)}%)`,
            { domain, avgAccuracy, recentScores }
          );
        }

        if (dropPercent > 20) {
          await this.flagIssues(
            agentName,
            'performance_drop',
            this.sanitizeScore(dropPercent / 100) ?? 0.5,
            `Recent performance drop of ${dropPercent.toFixed(1)}%`,
            { domain, recentAvg, olderAvg, dropPercent }
          );
        }

        if (analysis.hasLowConfidence) {
          await this.flagIssues(
            agentName,
            'low_confidence',
            this.sanitizeScore(1 - consistencyScore) ?? 0.5,
            `Low consistency score (${(consistencyScore * 100).toFixed(1)}%)`,
            { domain, consistencyScore, variance }
          );
        }
      }

      console.log(`[MetaOversight] ✅ Analyzed ${analyses.length} agents, flagged ${analyses.filter(a => a.hasInstability || a.hasBias || a.hasLowConfidence).length} issues`);

      return analyses;
    } catch (error: any) {
      console.error('[MetaOversight] Failed to analyze learning trends:', error);
      return [];
    }
  }

  /**
   * Flag an issue for meta-cognitive oversight
   */
  async flagIssues(
    agentName: string,
    flagType: OversightFlagType,
    severity: number,
    message: string,
    context: any
  ): Promise<MetaCognitionLog> {
    try {
      console.log(`[MetaOversight] 🚩 Flagging ${flagType} for ${agentName} (severity: ${severity.toFixed(2)})`);

      const safeSeverity = this.sanitizeScore(severity) ?? 0.5;

      // Generate recommendations based on flag type
      const recommendations = this.generateRecommendations(flagType, agentName, safeSeverity, context);

      const flagData: InsertMetaCognitionLog = {
        sourceAgent: agentName,
        flagType,
        severity: safeSeverity,
        message,
        context,
        recommendations,
        resolved: false,
      };

      const [flag] = await db.insert(metaCognitionLog)
        .values(flagData)
        .returning();

      console.log(`[MetaOversight] ✅ Flag created: ${flag.id}`);

      return flag;
    } catch (error: any) {
      console.error(`[MetaOversight] Failed to flag issue for ${agentName}:`, error);
      throw error;
    }
  }

  /**
   * Generate recommendations based on flag type
   */
  private generateRecommendations(
    flagType: OversightFlagType,
    agentName: string,
    severity: number,
    context: any
  ): string[] {
    const recommendations: string[] = [];

    switch (flagType) {
      case 'instability':
        recommendations.push('Review agent decision patterns for inconsistency');
        recommendations.push('Increase training data diversity');
        if (severity > 0.7) {
          recommendations.push('Consider temporary weight reduction for unstable agent');
        }
        break;

      case 'bias':
        recommendations.push('Audit training data for systematic bias');
        recommendations.push('Review agent scoring algorithms');
        recommendations.push('Increase feedback diversity from multiple sources');
        break;

      case 'low_confidence':
        recommendations.push('Increase agent training iterations');
        recommendations.push('Review input data quality');
        recommendations.push('Consider ensemble methods for low-confidence domains');
        break;

      case 'conflict':
        recommendations.push('Analyze source of inter-agent conflicts');
        recommendations.push('Review consensus mechanisms');
        recommendations.push('Consider mediator agent for conflict resolution');
        break;

      case 'performance_drop':
        recommendations.push('Investigate recent system or data changes');
        recommendations.push('Review agent parameter drift');
        if (severity > 0.5) {
          recommendations.push('Restore previous agent configuration if available');
        }
        break;
    }

    return recommendations;
  }

  /**
   * Get summary of active oversight flags and recommendations
   */
  async recommendAdjustments(): Promise<OversightSummary> {
    try {
      console.log('[MetaOversight] 📋 Generating oversight summary');

      // Get active (unresolved) flags from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activeFlags = await db.select()
        .from(metaCognitionLog)
        .where(and(
          eq(metaCognitionLog.resolved, false),
          gte(metaCognitionLog.createdAt, thirtyDaysAgo)
        ))
        .orderBy(desc(metaCognitionLog.severity), desc(metaCognitionLog.createdAt))
        .limit(50);

      const flagsByType: Record<OversightFlagType, number> = {
        instability: 0,
        bias: 0,
        low_confidence: 0,
        conflict: 0,
        performance_drop: 0,
      };

      let highestSeverity = 0;
      const allRecommendations: string[] = [];

      for (const flag of activeFlags) {
        flagsByType[flag.flagType] = (flagsByType[flag.flagType] || 0) + 1;
        if (flag.severity > highestSeverity) {
          highestSeverity = flag.severity;
        }
        allRecommendations.push(...(flag.recommendations || []));
      }

      // Get top unique recommendations
      const recommendationCounts = new Map<string, number>();
      for (const rec of allRecommendations) {
        recommendationCounts.set(rec, (recommendationCounts.get(rec) || 0) + 1);
      }

      const topRecommendations = Array.from(recommendationCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([rec]) => rec);

      const summary: OversightSummary = {
        totalActiveFlags: activeFlags.length,
        highestSeverity: this.sanitizeScore(highestSeverity) ?? 0,
        flagsByType,
        topRecommendations,
        recentFlags: activeFlags.slice(0, 10).map(f => ({
          id: f.id,
          sourceAgent: f.sourceAgent,
          flagType: f.flagType,
          severity: this.sanitizeScore(f.severity) ?? 0,
          message: f.message,
          context: f.context,
          recommendations: f.recommendations || [],
          resolved: f.resolved,
          createdAt: f.createdAt,
        })),
      };

      console.log(`[MetaOversight] ✅ Summary: ${summary.totalActiveFlags} active flags, highest severity: ${summary.highestSeverity.toFixed(2)}`);

      return summary;
    } catch (error: any) {
      console.error('[MetaOversight] Failed to generate summary:', error);
      return {
        totalActiveFlags: 0,
        highestSeverity: 0,
        flagsByType: {
          instability: 0,
          bias: 0,
          low_confidence: 0,
          conflict: 0,
          performance_drop: 0,
        },
        topRecommendations: [],
        recentFlags: [],
      };
    }
  }

  /**
   * Resolve a meta-cognition flag
   */
  async resolveFlag(flagId: string): Promise<MetaCognitionLog | null> {
    try {
      console.log(`[MetaOversight] ✅ Resolving flag: ${flagId}`);

      const [resolved] = await db.update(metaCognitionLog)
        .set({ resolved: true })
        .where(eq(metaCognitionLog.id, flagId))
        .returning();

      if (resolved) {
        console.log(`[MetaOversight] Flag ${flagId} marked as resolved`);
      }

      return resolved || null;
    } catch (error: any) {
      console.error(`[MetaOversight] Failed to resolve flag ${flagId}:`, error);
      return null;
    }
  }

  /**
   * Get oversight logs with optional filtering
   */
  async getOversightLogs(
    limit: number = 50,
    flagType?: OversightFlagType,
    resolvedStatus?: boolean
  ): Promise<OversightFlag[]> {
    try {
      let query = db.select().from(metaCognitionLog);

      const conditions = [];
      if (flagType) {
        conditions.push(eq(metaCognitionLog.flagType, flagType));
      }
      if (resolvedStatus !== undefined) {
        conditions.push(eq(metaCognitionLog.resolved, resolvedStatus));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const logs = await query
        .orderBy(desc(metaCognitionLog.createdAt))
        .limit(limit);

      return logs.map(log => ({
        id: log.id,
        sourceAgent: log.sourceAgent,
        flagType: log.flagType,
        severity: this.sanitizeScore(log.severity) ?? 0,
        message: log.message,
        context: log.context,
        recommendations: log.recommendations || [],
        resolved: log.resolved,
        createdAt: log.createdAt,
      }));
    } catch (error: any) {
      console.error('[MetaOversight] Failed to get oversight logs:', error);
      return [];
    }
  }

  /**
   * Get oversight summary statistics
   */
  async getOversightSummary() {
    try {
      const allFlags = await db.select().from(metaCognitionLog);
      
      const totalFlags = allFlags.length;
      const unresolvedFlags = allFlags.filter(flag => !flag.resolved).length;
      const highSeverity = allFlags.filter(flag => flag.severity >= 0.7).length;
      
      // Count recent trends (flags created in last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentTrends = allFlags.filter(flag => 
        new Date(flag.createdAt) > oneDayAgo
      ).length;

      return {
        totalFlags,
        unresolvedFlags,
        highSeverity,
        recentTrends,
      };
    } catch (error: any) {
      console.error('[MetaOversight] Failed to get oversight summary:', error);
      return {
        totalFlags: 0,
        unresolvedFlags: 0,
        highSeverity: 0,
        recentTrends: 0,
      };
    }
  }
}

export default new MetaOversightService();
