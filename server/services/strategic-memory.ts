import { db } from "../db";
import { strategicMemorySnapshot, strategicSimulationLog, decisionTraceLog } from "@shared/schema";
import type { InsertStrategicMemorySnapshot, StrategicMemorySnapshot } from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { contextBridge } from "./context-bridge";

interface LessonContext {
  strategyType?: string;
  marketCondition?: string;
  riskLevel?: string;
  timeframe?: string;
  [key: string]: any;
}

export class StrategicMemoryService {
  /**
   * Capture lesson from simulation
   */
  async captureLesson(
    userId: string,
    lessonData: {
      title: string;
      content: string;
      sourceSimulations?: string[];
      sourceDecisions?: string[];
      applicableContexts: LessonContext;
      confidenceLevel?: "very_low" | "low" | "medium" | "high" | "very_high";
    },
    mode?: "live" | "paper"
  ): Promise<StrategicMemorySnapshot> {
    const snapshotId = nanoid(16);

    const lesson: InsertStrategicMemorySnapshot = {
      snapshotId,
      userId,
      lessonTitle: lessonData.title,
      lessonContent: lessonData.content,
      sourceSimulations: lessonData.sourceSimulations || [],
      sourceDecisions: lessonData.sourceDecisions || [],
      applicableContexts: lessonData.applicableContexts,
      confidenceLevel: lessonData.confidenceLevel || "medium",
      timesApplied: 0,
      successRate: null,
      metadata: {
        capturedBy: "strategic_memory",
        captureMethod: "automated",
        timestamp: new Date().toISOString(),
      },
    };

    const [created] = await db.insert(strategicMemorySnapshot).values(lesson).returning();

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "strategic_memory",
        action: "lesson_captured",
        snapshotId: created.snapshotId,
        lessonTitle: created.lessonTitle,
        confidence: created.confidenceLevel,
      },
    });

    return created;
  }

  /**
   * Extract lessons from completed simulations
   */
  async extractLessonsFromSimulations(
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicMemorySnapshot[]> {
    // Get recent completed simulations with actual outcomes
    const recentSimulations = await db
      .select()
      .from(strategicSimulationLog)
      .where(
        and(
          eq(strategicSimulationLog.userId, userId),
          eq(strategicSimulationLog.evaluationStatus, "completed"),
          sql`${strategicSimulationLog.actualOutcome} IS NOT NULL`
        )
      )
      .orderBy(desc(strategicSimulationLog.createdAt))
      .limit(10);

    const lessons: StrategicMemorySnapshot[] = [];

    for (const simulation of recentSimulations) {
      // Analyze simulation to extract lessons
      const lesson = this.analyzeSimulation(simulation);
      
      if (lesson) {
        const captured = await this.captureLesson(
          userId,
          {
            title: lesson.title,
            content: lesson.content,
            sourceSimulations: [simulation.simulationId],
            applicableContexts: lesson.contexts,
            confidenceLevel: this.determineConfidenceFromScore(simulation.successScore || 0),
          },
          mode
        );
        lessons.push(captured);
      }
    }

    return lessons;
  }

  /**
   * Analyze simulation to extract lesson
   */
  private analyzeSimulation(simulation: any): {
    title: string;
    content: string;
    contexts: LessonContext;
  } | null {
    if (!simulation.actualOutcome || !simulation.predictedOutcome) {
      return null;
    }

    const successScore = simulation.successScore || 0;
    const predicted = simulation.predictedOutcome as Record<string, any>;
    const actual = simulation.actualOutcome as Record<string, any>;

    let title = "";
    let content = "";
    const contexts: LessonContext = {
      scenarioType: simulation.scenarioType,
    };

    if (successScore > 0.8) {
      title = `Accurate ${simulation.scenarioType} prediction`;
      content = `The simulation for ${simulation.scenarioDescription} showed high accuracy (${(successScore * 100).toFixed(1)}%). Key factors that contributed to accuracy: ${JSON.stringify(predicted)}`;
    } else if (successScore < 0.5) {
      title = `Inaccurate ${simulation.scenarioType} prediction - learning opportunity`;
      content = `The simulation for ${simulation.scenarioDescription} had low accuracy (${(successScore * 100).toFixed(1)}%). Predicted: ${JSON.stringify(predicted)}. Actual: ${JSON.stringify(actual)}. This suggests our model needs refinement.`;
    } else {
      title = `Moderate ${simulation.scenarioType} result`;
      content = `The simulation showed moderate accuracy. Continuing to gather data to improve predictions.`;
    }

    return { title, content, contexts };
  }

  /**
   * Determine confidence level from success score
   */
  private determineConfidenceFromScore(score: number): "very_low" | "low" | "medium" | "high" | "very_high" {
    if (score >= 0.9) return "very_high";
    if (score >= 0.75) return "high";
    if (score >= 0.5) return "medium";
    if (score >= 0.25) return "low";
    return "very_low";
  }

  /**
   * Retrieve applicable lessons for a context
   */
  async getApplicableLessons(
    userId: string,
    context: LessonContext,
    limit = 10
  ): Promise<StrategicMemorySnapshot[]> {
    // Get all lessons for user
    const allLessons = await db
      .select()
      .from(strategicMemorySnapshot)
      .where(eq(strategicMemorySnapshot.userId, userId))
      .orderBy(desc(strategicMemorySnapshot.confidenceLevel), desc(strategicMemorySnapshot.successRate))
      .limit(50);

    // Filter lessons that match the context
    const matchingLessons = allLessons.filter(lesson => {
      const applicableContexts = lesson.applicableContexts as LessonContext;
      
      // Check if contexts match
      const contextKeys = Object.keys(context);
      const matches = contextKeys.filter(key => {
        return applicableContexts[key] === context[key] || !applicableContexts[key];
      });

      return matches.length >= contextKeys.length * 0.5; // At least 50% match
    });

    return matchingLessons.slice(0, limit);
  }

  /**
   * Record lesson application
   */
  async recordLessonApplication(
    snapshotId: string,
    success: boolean,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicMemorySnapshot | null> {
    const [lesson] = await db
      .select()
      .from(strategicMemorySnapshot)
      .where(eq(strategicMemorySnapshot.snapshotId, snapshotId));

    if (!lesson) return null;

    const timesApplied = (lesson.timesApplied || 0) + 1;
    const previousSuccessRate = lesson.successRate || 0;
    const previousSuccesses = previousSuccessRate * (timesApplied - 1);
    const newSuccesses = previousSuccesses + (success ? 1 : 0);
    const successRate = newSuccesses / timesApplied;

    const [updated] = await db
      .update(strategicMemorySnapshot)
      .set({
        timesApplied,
        successRate,
        lastApplied: new Date(),
      })
      .where(eq(strategicMemorySnapshot.snapshotId, snapshotId))
      .returning();

    if (updated) {
      await contextBridge.broadcast({
        type: "state_update",
        userId,
        mode,
        payload: {
          source: "strategic_memory",
          action: "lesson_applied",
          snapshotId: updated.snapshotId,
          success,
          successRate: updated.successRate,
        },
      });
    }

    return updated || null;
  }

  /**
   * Get all lessons for a user
   */
  async getLessons(
    userId: string,
    limit = 50
  ): Promise<StrategicMemorySnapshot[]> {
    return await db
      .select()
      .from(strategicMemorySnapshot)
      .where(eq(strategicMemorySnapshot.userId, userId))
      .orderBy(desc(strategicMemorySnapshot.createdAt))
      .limit(limit);
  }

  /**
   * Get high-confidence lessons
   */
  async getHighConfidenceLessons(
    userId: string,
    minConfidence: "medium" | "high" | "very_high" = "high",
    limit = 20
  ): Promise<StrategicMemorySnapshot[]> {
    const confidenceLevels = minConfidence === "very_high" 
      ? ["very_high"]
      : minConfidence === "high"
      ? ["high", "very_high"]
      : ["medium", "high", "very_high"];

    return await db
      .select()
      .from(strategicMemorySnapshot)
      .where(
        and(
          eq(strategicMemorySnapshot.userId, userId),
          sql`${strategicMemorySnapshot.confidenceLevel} IN (${sql.join(confidenceLevels.map(c => sql`${c}`), sql`, `)})`
        )
      )
      .orderBy(desc(strategicMemorySnapshot.successRate), desc(strategicMemorySnapshot.timesApplied))
      .limit(limit);
  }

  /**
   * Get lesson snapshots
   */
  async getSnapshot(snapshotId: string): Promise<StrategicMemorySnapshot | null> {
    const [snapshot] = await db
      .select()
      .from(strategicMemorySnapshot)
      .where(eq(strategicMemorySnapshot.snapshotId, snapshotId));

    return snapshot || null;
  }

  /**
   * Update lesson confidence based on application results
   */
  async updateLessonConfidence(
    snapshotId: string,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicMemorySnapshot | null> {
    const [lesson] = await db
      .select()
      .from(strategicMemorySnapshot)
      .where(eq(strategicMemorySnapshot.snapshotId, snapshotId));

    if (!lesson) return null;

    // Update confidence based on success rate
    let newConfidence = lesson.confidenceLevel;
    const successRate = lesson.successRate || 0;

    if (lesson.timesApplied && lesson.timesApplied >= 5) {
      newConfidence = this.determineConfidenceFromScore(successRate);
    }

    if (newConfidence !== lesson.confidenceLevel) {
      const [updated] = await db
        .update(strategicMemorySnapshot)
        .set({ confidenceLevel: newConfidence })
        .where(eq(strategicMemorySnapshot.snapshotId, snapshotId))
        .returning();

      if (updated) {
        await contextBridge.broadcast({
          type: "state_update",
          userId,
          mode,
          payload: {
            source: "strategic_memory",
            action: "confidence_updated",
            snapshotId: updated.snapshotId,
            previousConfidence: lesson.confidenceLevel,
            newConfidence: updated.confidenceLevel,
          },
        });
      }

      return updated || null;
    }

    return lesson;
  }
}

export const strategicMemory = new StrategicMemoryService();
