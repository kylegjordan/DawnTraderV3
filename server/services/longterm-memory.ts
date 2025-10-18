import { db } from '../db';
import { strategicMemoryArchive, modelCalibrationLog, agentLearningFeedback, MemoryScope } from '@shared/schema';
import { desc, and, eq, gte, sql } from 'drizzle-orm';

/**
 * Phase 9.9: Long-Term Strategic Memory & Model Calibration
 * 
 * Provides persistent knowledge archival and cognitive parameter tuning based on
 * historical performance trends and strategic learning outcomes.
 */

interface ArchivedInsight {
  id: string;
  agentName: string;
  memoryScope: MemoryScope;
  summary: string;
  insights: any;
  performanceDelta: number | null;
  adjustments: any;
  createdAt: Date;
}

interface PerformanceDelta {
  agentName: string;
  currentAccuracy: number;
  historicalAccuracy: number;
  deltaPercent: number;
  trend: 'improving' | 'stable' | 'degrading';
  recommendation: string;
}

interface CalibrationResult {
  parameter: string;
  oldValue: number;
  newValue: number;
  reason: string;
  appliedAt: Date;
}

class LongTermMemoryService {
  /**
   * Safe score sanitization to prevent NaN/Infinity
   */
  private sanitizeScore(value: any): number {
    if (typeof value !== 'number' || !isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  /**
   * Archive high-value insights into strategic memory
   */
  async archiveInsights(
    agentName: string,
    memoryScope: MemoryScope,
    summary: string,
    insights: any,
    performanceDelta?: number
  ): Promise<ArchivedInsight | null> {
    try {
      const sanitizedDelta = performanceDelta !== undefined 
        ? this.sanitizeScore(performanceDelta) 
        : null;
      
      console.log(`[LongTermMemory] 📚 Archiving ${memoryScope} memory for agent: ${agentName}`);

      const [archived] = await db.insert(strategicMemoryArchive)
        .values({
          agentName,
          memoryScope,
          summary,
          insights: insights || {},
          performanceDelta: sanitizedDelta,
          adjustments: {},
        })
        .returning();

      if (archived) {
        console.log(`[LongTermMemory] ✅ Insight archived with ID: ${archived.id}`);
        return {
          id: archived.id,
          agentName: archived.agentName,
          memoryScope: archived.memoryScope as MemoryScope,
          summary: archived.summary,
          insights: archived.insights,
          performanceDelta: archived.performanceDelta,
          adjustments: archived.adjustments,
          createdAt: archived.createdAt,
        };
      }

      return null;
    } catch (error: any) {
      console.error('[LongTermMemory] Failed to archive insight:', error);
      return null;
    }
  }

  /**
   * Analyze performance delta between current and historical data
   */
  async analyzePerformanceDelta(agentName: string): Promise<PerformanceDelta | null> {
    try {
      console.log(`[LongTermMemory] 📊 Analyzing performance delta for: ${agentName}`);

      // Get all feedback for this agent
      const allFeedback = await db.select()
        .from(agentLearningFeedback)
        .where(eq(agentLearningFeedback.agentName, agentName))
        .orderBy(desc(agentLearningFeedback.createdAt));

      if (allFeedback.length === 0) {
        console.log(`[LongTermMemory] No historical data for agent: ${agentName}`);
        return null;
      }

      // Split into recent (last 10) and historical (10-30)
      const recentFeedback = allFeedback.slice(0, 10);
      const historicalFeedback = allFeedback.slice(10, 30);

      if (historicalFeedback.length === 0) {
        console.log(`[LongTermMemory] Insufficient historical data for comparison`);
        return null;
      }

      // Calculate average accuracy scores
      const currentAccuracy = recentFeedback.reduce((sum, f) => 
        sum + this.sanitizeScore(f.accuracyScore), 0) / recentFeedback.length;
      
      const historicalAccuracy = historicalFeedback.reduce((sum, f) => 
        sum + this.sanitizeScore(f.accuracyScore), 0) / historicalFeedback.length;

      const deltaPercent = ((currentAccuracy - historicalAccuracy) / historicalAccuracy) * 100;

      // Determine trend
      let trend: 'improving' | 'stable' | 'degrading';
      let recommendation: string;

      if (deltaPercent > 5) {
        trend = 'improving';
        recommendation = `${agentName} performance is improving. Consider archiving successful strategies.`;
      } else if (deltaPercent < -5) {
        trend = 'degrading';
        recommendation = `${agentName} performance is degrading. Review recent changes and consider calibration.`;
      } else {
        trend = 'stable';
        recommendation = `${agentName} performance is stable. Continue current approach.`;
      }

      console.log(`[LongTermMemory] Delta: ${deltaPercent.toFixed(2)}% - Trend: ${trend}`);

      return {
        agentName,
        currentAccuracy: this.sanitizeScore(currentAccuracy),
        historicalAccuracy: this.sanitizeScore(historicalAccuracy),
        deltaPercent,
        trend,
        recommendation,
      };
    } catch (error: any) {
      console.error('[LongTermMemory] Failed to analyze performance delta:', error);
      return null;
    }
  }

  /**
   * Calibrate cognitive model parameters based on performance trends
   */
  async calibrateModel(
    agentName: string,
    parameter: string,
    performanceTrend: 'improving' | 'stable' | 'degrading'
  ): Promise<CalibrationResult | null> {
    try {
      console.log(`[LongTermMemory] ⚙️ Calibrating ${parameter} for ${agentName} (trend: ${performanceTrend})`);

      // Get latest calibration for this parameter
      const latestCalibration = await db.select()
        .from(modelCalibrationLog)
        .where(and(
          eq(modelCalibrationLog.agentName, agentName),
          eq(modelCalibrationLog.parameter, parameter)
        ))
        .orderBy(desc(modelCalibrationLog.createdAt))
        .limit(1);

      const oldValue = latestCalibration.length > 0 
        ? this.sanitizeScore(latestCalibration[0].newValue) 
        : 0.5;

      let newValue: number;
      let reason: string;

      // Adjust parameter based on trend
      if (performanceTrend === 'improving') {
        newValue = Math.min(1.0, oldValue + 0.05);
        reason = `Performance improving - incrementally increasing ${parameter} to reinforce successful patterns`;
      } else if (performanceTrend === 'degrading') {
        newValue = Math.max(0.0, oldValue - 0.1);
        reason = `Performance degrading - reducing ${parameter} to reset behavior and encourage exploration`;
      } else {
        newValue = oldValue;
        reason = `Performance stable - maintaining current ${parameter} value`;
      }

      newValue = this.sanitizeScore(newValue);

      // Log the calibration
      const [calibration] = await db.insert(modelCalibrationLog)
        .values({
          agentName,
          parameter,
          oldValue,
          newValue,
          reason,
        })
        .returning();

      if (calibration) {
        console.log(`[LongTermMemory] ✅ Calibration logged: ${parameter} ${oldValue.toFixed(3)} → ${newValue.toFixed(3)}`);
        return {
          parameter,
          oldValue: this.sanitizeScore(oldValue),
          newValue: this.sanitizeScore(newValue),
          reason,
          appliedAt: calibration.createdAt,
        };
      }

      return null;
    } catch (error: any) {
      console.error('[LongTermMemory] Failed to calibrate model:', error);
      return null;
    }
  }

  /**
   * Get archived insights with optional filtering
   */
  async getArchivedInsights(
    memoryScope?: MemoryScope,
    agentName?: string,
    limit: number = 50
  ): Promise<ArchivedInsight[]> {
    try {
      let query = db.select().from(strategicMemoryArchive);

      const conditions = [];
      if (memoryScope) {
        conditions.push(eq(strategicMemoryArchive.memoryScope, memoryScope));
      }
      if (agentName) {
        conditions.push(eq(strategicMemoryArchive.agentName, agentName));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const archives = await query
        .orderBy(desc(strategicMemoryArchive.createdAt))
        .limit(limit);

      return archives.map(archive => ({
        id: archive.id,
        agentName: archive.agentName,
        memoryScope: archive.memoryScope as MemoryScope,
        summary: archive.summary,
        insights: archive.insights,
        performanceDelta: archive.performanceDelta,
        adjustments: archive.adjustments,
        createdAt: archive.createdAt,
      }));
    } catch (error: any) {
      console.error('[LongTermMemory] Failed to get archived insights:', error);
      return [];
    }
  }

  /**
   * Get calibration history for an agent/parameter
   */
  async getCalibrationHistory(
    agentName?: string,
    parameter?: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      let query = db.select().from(modelCalibrationLog);

      const conditions = [];
      if (agentName) {
        conditions.push(eq(modelCalibrationLog.agentName, agentName));
      }
      if (parameter) {
        conditions.push(eq(modelCalibrationLog.parameter, parameter));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const history = await query
        .orderBy(desc(modelCalibrationLog.createdAt))
        .limit(limit);

      return history.map(cal => ({
        id: cal.id,
        agentName: cal.agentName,
        parameter: cal.parameter,
        oldValue: this.sanitizeScore(cal.oldValue),
        newValue: this.sanitizeScore(cal.newValue),
        reason: cal.reason,
        createdAt: cal.createdAt,
      }));
    } catch (error: any) {
      console.error('[LongTermMemory] Failed to get calibration history:', error);
      return [];
    }
  }

  /**
   * Update adjustments for an archived insight
   */
  async updateAdjustments(insightId: string, adjustments: any): Promise<boolean> {
    try {
      await db.update(strategicMemoryArchive)
        .set({ adjustments })
        .where(eq(strategicMemoryArchive.id, insightId));

      console.log(`[LongTermMemory] Updated adjustments for insight ${insightId}`);
      return true;
    } catch (error: any) {
      console.error('[LongTermMemory] Failed to update adjustments:', error);
      return false;
    }
  }
}

export default new LongTermMemoryService();
