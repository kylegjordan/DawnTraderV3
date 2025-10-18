/**
 * Phase 9.7: Learning Bridge Service
 * 
 * Manages cooperative learning feedback loops between domain agents.
 * Tracks accuracy, consensus alignment, and performance trends to enable
 * continuous improvement through inter-agent learning.
 */

import { db } from '../db';
import { agentLearningFeedback } from '../../shared/schema';
import type { InsertAgentLearningFeedback, AgentLearningFeedback, FeedbackSource } from '../../shared/schema';
import { desc, eq, and, gte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface AgentPerformanceTrend {
  agentName: string;
  domain: string;
  averageAccuracy: number;
  averageAlignment: number;
  trend: 'improving' | 'stable' | 'declining';
  feedbackCount: number;
  recentScores: number[];
}

export interface LearningSummary {
  totalFeedbackRecords: number;
  agentMetrics: Array<{
    agentName: string;
    domain: string;
    accuracy: number;
    alignment: number;
    feedbackCount: number;
  }>;
  topPerformers: string[];
  needsImprovement: string[];
  lastUpdated: Date;
}

class LearningBridge {
  /**
   * Record feedback for an agent's performance
   */
  async recordFeedback(
    agentName: string,
    domain: string,
    sessionId: string | null,
    accuracyScore: number,
    consensusAlignment: number,
    improvementNotes: string,
    feedbackSource: FeedbackSource = 'system'
  ): Promise<AgentLearningFeedback> {
    try {
      console.log(`[LearningBridge] 📝 Recording feedback for ${agentName} (domain: ${domain})`);

      // Safe guard against Infinity, NaN, or out-of-range values
      const safeAccuracy = this.sanitizeScore(accuracyScore);
      const safeAlignment = this.sanitizeScore(consensusAlignment);

      if (safeAccuracy === null || safeAlignment === null) {
        console.warn(`[LearningBridge] ⚠️ Invalid scores for ${agentName}, using defaults`);
      }

      const feedbackData: InsertAgentLearningFeedback = {
        agentName,
        domain,
        sessionId,
        feedbackSource,
        accuracyScore: safeAccuracy,
        consensusAlignment: safeAlignment,
        improvementNotes,
        metadata: {
          recordedBy: 'learning-bridge',
          timestamp: new Date().toISOString(),
        },
      };

      const [feedback] = await db.insert(agentLearningFeedback)
        .values(feedbackData)
        .returning();

      console.log(`[LearningBridge] ✅ Feedback recorded for ${agentName}: accuracy=${safeAccuracy?.toFixed(2)}, alignment=${safeAlignment?.toFixed(2)}`);

      return feedback;
    } catch (error: any) {
      console.error(`[LearningBridge] Failed to record feedback for ${agentName}:`, error);
      throw error;
    }
  }

  /**
   * Analyze performance trends for a specific agent
   */
  async analyzePerformanceTrends(agentName: string): Promise<AgentPerformanceTrend | null> {
    try {
      console.log(`[LearningBridge] 📊 Analyzing performance trends for ${agentName}`);

      // Get recent feedback (last 30 days or 20 most recent records)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentFeedback = await db.select()
        .from(agentLearningFeedback)
        .where(and(
          eq(agentLearningFeedback.agentName, agentName),
          gte(agentLearningFeedback.createdAt, thirtyDaysAgo)
        ))
        .orderBy(desc(agentLearningFeedback.createdAt))
        .limit(20);

      if (recentFeedback.length === 0) {
        console.log(`[LearningBridge] No feedback found for ${agentName}`);
        return null;
      }

      // Calculate metrics with safe guards
      const accuracyScores = recentFeedback
        .map(f => f.accuracyScore)
        .filter((score): score is number => score !== null && isFinite(score));

      const alignmentScores = recentFeedback
        .map(f => f.consensusAlignment)
        .filter((score): score is number => score !== null && isFinite(score));

      if (accuracyScores.length === 0) {
        console.log(`[LearningBridge] No valid accuracy scores for ${agentName}`);
        return null;
      }

      const averageAccuracy = accuracyScores.reduce((sum, score) => sum + score, 0) / accuracyScores.length;
      const averageAlignment = alignmentScores.length > 0
        ? alignmentScores.reduce((sum, score) => sum + score, 0) / alignmentScores.length
        : 0;

      // Determine trend (compare first half vs second half of recent scores)
      const midpoint = Math.floor(accuracyScores.length / 2);
      const recentHalf = accuracyScores.slice(0, midpoint);
      const olderHalf = accuracyScores.slice(midpoint);

      const recentAvg = recentHalf.reduce((sum, score) => sum + score, 0) / recentHalf.length;
      const olderAvg = olderHalf.reduce((sum, score) => sum + score, 0) / olderHalf.length;

      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      const diff = recentAvg - olderAvg;
      if (Math.abs(diff) > 0.05) {
        trend = diff > 0 ? 'improving' : 'declining';
      }

      const domain = recentFeedback[0]?.domain || 'unknown';

      console.log(`[LearningBridge] ✅ Trends for ${agentName}: accuracy=${averageAccuracy.toFixed(2)}, trend=${trend}`);

      return {
        agentName,
        domain,
        averageAccuracy,
        averageAlignment,
        trend,
        feedbackCount: recentFeedback.length,
        recentScores: accuracyScores.slice(0, 10), // Last 10 scores
      };
    } catch (error: any) {
      console.error(`[LearningBridge] Failed to analyze trends for ${agentName}:`, error);
      return null;
    }
  }

  /**
   * Generate aggregated learning summary across all agents
   */
  async generateLearningSummary(): Promise<LearningSummary> {
    try {
      console.log('[LearningBridge] 📈 Generating learning summary');

      // Get all feedback grouped by agent
      const allFeedback = await db.select()
        .from(agentLearningFeedback)
        .orderBy(desc(agentLearningFeedback.createdAt))
        .limit(500); // Last 500 feedback records

      // Group by agent
      const agentMap = new Map<string, AgentLearningFeedback[]>();
      for (const feedback of allFeedback) {
        const key = `${feedback.agentName}:${feedback.domain}`;
        if (!agentMap.has(key)) {
          agentMap.set(key, []);
        }
        agentMap.get(key)!.push(feedback);
      }

      // Calculate metrics for each agent
      const agentMetrics = Array.from(agentMap.entries()).map(([key, feedbacks]) => {
        const [agentName, domain] = key.split(':');
        
        const accuracyScores = feedbacks
          .map(f => f.accuracyScore)
          .filter((score): score is number => score !== null && isFinite(score));

        const alignmentScores = feedbacks
          .map(f => f.consensusAlignment)
          .filter((score): score is number => score !== null && isFinite(score));

        const accuracy = accuracyScores.length > 0
          ? accuracyScores.reduce((sum, s) => sum + s, 0) / accuracyScores.length
          : 0;

        const alignment = alignmentScores.length > 0
          ? alignmentScores.reduce((sum, s) => sum + s, 0) / alignmentScores.length
          : 0;

        return {
          agentName,
          domain,
          accuracy,
          alignment,
          feedbackCount: feedbacks.length,
        };
      });

      // Sort by accuracy to find top performers and those needing improvement
      const sortedByAccuracy = [...agentMetrics].sort((a, b) => b.accuracy - a.accuracy);
      const topPerformers = sortedByAccuracy.slice(0, 3).map(m => m.agentName);
      const needsImprovement = sortedByAccuracy.slice(-3).filter(m => m.accuracy < 0.7).map(m => m.agentName);

      console.log(`[LearningBridge] ✅ Summary generated: ${agentMetrics.length} agents, ${allFeedback.length} total records`);

      return {
        totalFeedbackRecords: allFeedback.length,
        agentMetrics,
        topPerformers,
        needsImprovement,
        lastUpdated: new Date(),
      };
    } catch (error: any) {
      console.error('[LearningBridge] Failed to generate learning summary:', error);
      return {
        totalFeedbackRecords: 0,
        agentMetrics: [],
        topPerformers: [],
        needsImprovement: [],
        lastUpdated: new Date(),
      };
    }
  }

  /**
   * Get feedback history for a session
   */
  async getSessionFeedback(sessionId: string): Promise<AgentLearningFeedback[]> {
    try {
      const feedback = await db.select()
        .from(agentLearningFeedback)
        .where(eq(agentLearningFeedback.sessionId, sessionId))
        .orderBy(desc(agentLearningFeedback.createdAt));

      return feedback;
    } catch (error: any) {
      console.error(`[LearningBridge] Failed to fetch session feedback for ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Sanitize score to ensure it's a valid finite number between 0-1
   * Returns null if invalid to allow database NULL handling
   */
  private sanitizeScore(score: number | null | undefined): number | null {
    if (score === null || score === undefined) {
      return null;
    }

    if (!isFinite(score)) {
      console.warn(`[LearningBridge] ⚠️ Non-finite score detected: ${score}, returning null`);
      return null;
    }

    // Clamp to 0-1 range
    if (score < 0) return 0;
    if (score > 1) return 1;

    return score;
  }
}

// Export singleton instance
export const learningBridge = new LearningBridge();
