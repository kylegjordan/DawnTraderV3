import { db } from "../db";
import { learningWeightProfile, experienceMemoryLog, strategicPlanLog } from "@shared/schema";
import type { InsertLearningWeightProfile, LearningWeightProfile } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { contextBridge } from "./context-bridge";

interface CognitiveWeights {
  reasoning: number;
  exploration: number;
  exploitation: number;
  riskAversion: number;
  adaptability: number;
}

interface BehavioralTendency {
  pattern: string;
  frequency: number;
  successRate: number;
  contexts: string[];
}

interface PerformanceMetrics {
  winRate: number;
  avgProfitLoss: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
}

interface FeedbackIteration {
  timestamp: string;
  phase: "observation" | "adjustment" | "evaluation";
  performanceDelta: number;
  weightAdjustments: Partial<CognitiveWeights>;
  insights: string[];
}

export class ContinuousLearningEngine {
  async initializeProfile(
    userId: string,
    initialWeights?: Partial<CognitiveWeights>,
    mode?: "live" | "paper"
  ): Promise<LearningWeightProfile> {
    const profileId = nanoid(16);

    const defaultWeights: CognitiveWeights = {
      reasoning: 0.7,
      exploration: 0.2,
      exploitation: 0.6,
      riskAversion: 0.5,
      adaptability: 0.4,
      ...initialWeights,
    };

    const profile: InsertLearningWeightProfile = {
      profileId,
      userId,
      currentPhase: "observation",
      cognitiveWeights: defaultWeights,
      behavioralTendencies: {},
      performanceMetrics: {},
      feedbackHistory: [],
      confidenceScore: 0.5,
      metadata: {
        initialized: new Date().toISOString(),
        source: "continuous_learning_engine",
      },
    };

    const [created] = await db.insert(learningWeightProfile).values(profile).returning();

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "continuous_learning",
        action: "profile_initialized",
        profileId: created.profileId,
        weights: defaultWeights,
        phase: created.currentPhase,
      },
    });

    return created;
  }

  async updatePhase(
    profileId: string,
    newPhase: "observation" | "adjustment" | "evaluation",
    userId: string,
    mode?: "live" | "paper"
  ): Promise<LearningWeightProfile | null> {
    const [updated] = await db
      .update(learningWeightProfile)
      .set({ currentPhase: newPhase, updatedAt: new Date() })
      .where(eq(learningWeightProfile.profileId, profileId))
      .returning();

    if (!updated) return null;

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "continuous_learning",
        action: "phase_updated",
        profileId: updated.profileId,
        phase: newPhase,
      },
    });

    return updated;
  }

  async adjustWeights(
    profileId: string,
    adjustments: Partial<CognitiveWeights>,
    rationale: string,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<LearningWeightProfile | null> {
    const [profile] = await db
      .select()
      .from(learningWeightProfile)
      .where(eq(learningWeightProfile.profileId, profileId));

    if (!profile) return null;

    const currentWeights = profile.cognitiveWeights as CognitiveWeights;
    const newWeights = { ...currentWeights, ...adjustments };

    const normalizedWeights = this.normalizeWeights(newWeights);

    const revisionEntry = {
      timestamp: new Date().toISOString(),
      previousWeights: currentWeights,
      newWeights: normalizedWeights,
      adjustments,
      rationale,
    };

    const revisionHistory = Array.isArray(profile.revisionHistory)
      ? [...profile.revisionHistory, revisionEntry]
      : [revisionEntry];

    const [updated] = await db
      .update(learningWeightProfile)
      .set({
        cognitiveWeights: normalizedWeights,
        revisionHistory,
        lastRetraining: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(learningWeightProfile.profileId, profileId))
      .returning();

    if (!updated) return null;

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "continuous_learning",
        action: "weights_adjusted",
        profileId: updated.profileId,
        weights: normalizedWeights,
        rationale,
      },
    });

    return updated;
  }

  async learnFromExperience(
    profileId: string,
    memoryId: string,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<LearningWeightProfile | null> {
    const [profile] = await db
      .select()
      .from(learningWeightProfile)
      .where(eq(learningWeightProfile.profileId, profileId));

    if (!profile) return null;

    const [experience] = await db
      .select()
      .from(experienceMemoryLog)
      .where(eq(experienceMemoryLog.memoryId, memoryId));

    if (!experience) return null;

    const metadata = experience.metadata as any;
    const sourceEvents = experience.sourceEvents as any;
    const impactLevel = experience.impact;

    const tendencies = (profile.behavioralTendencies as any) || {};
    const pattern = experience.contextDomain || metadata?.domain || "unknown";

    if (!tendencies[pattern]) {
      tendencies[pattern] = {
        pattern,
        frequency: 0,
        successRate: 0,
        contexts: [],
      };
    }

    tendencies[pattern].frequency += 1;
    tendencies[pattern].contexts.push(memoryId);

    if (impactLevel === "high" && experience.confidence > 0.6) {
      const previousSuccesses =
        (tendencies[pattern].successRate * (tendencies[pattern].frequency - 1)) /
        tendencies[pattern].frequency;
      tendencies[pattern].successRate =
        previousSuccesses + 1 / tendencies[pattern].frequency;
    }

    const performanceMetrics = (profile.performanceMetrics as any) || {};
    const totalExperiences = performanceMetrics.totalExperiences || 0;
    
    performanceMetrics.avgConfidence =
      ((performanceMetrics.avgConfidence || 0.5) * totalExperiences + experience.confidence) /
      (totalExperiences + 1);
    performanceMetrics.totalExperiences = totalExperiences + 1;

    if (impactLevel === "high") {
      performanceMetrics.highImpactCount = (performanceMetrics.highImpactCount || 0) + 1;
    }

    const feedbackIteration: FeedbackIteration = {
      timestamp: new Date().toISOString(),
      phase: profile.currentPhase as any,
      performanceDelta: experience.confidence - 0.5,
      weightAdjustments: {},
      insights: [experience.insight, experience.recommendation].filter(Boolean) as string[],
    };

    const feedbackHistory = Array.isArray(profile.feedbackHistory)
      ? [...profile.feedbackHistory, feedbackIteration]
      : [feedbackIteration];

    const confidenceAdjustment = impactLevel === "high" && experience.confidence > 0.6 ? 0.05 : 
                                  impactLevel === "low" || experience.confidence < 0.3 ? -0.03 : 0;
    const newConfidence = Math.max(
      0,
      Math.min(1, (profile.confidenceScore || 0.5) + confidenceAdjustment)
    );

    const [updated] = await db
      .update(learningWeightProfile)
      .set({
        behavioralTendencies: tendencies,
        performanceMetrics,
        feedbackHistory,
        confidenceScore: newConfidence,
        updatedAt: new Date(),
      })
      .where(eq(learningWeightProfile.profileId, profileId))
      .returning();

    if (!updated) return null;

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "continuous_learning",
        action: "experience_integrated",
        profileId: updated.profileId,
        memoryId,
        confidence: newConfidence,
        phase: profile.currentPhase,
      },
    });

    return updated;
  }

  async evaluatePerformance(
    profileId: string,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<{
    profile: LearningWeightProfile;
    recommendations: string[];
    suggestedAdjustments: Partial<CognitiveWeights>;
  } | null> {
    const [profile] = await db
      .select()
      .from(learningWeightProfile)
      .where(eq(learningWeightProfile.profileId, profileId));

    if (!profile) return null;

    const metrics = profile.performanceMetrics as PerformanceMetrics;
    const weights = profile.cognitiveWeights as CognitiveWeights;
    const recommendations: string[] = [];
    const suggestedAdjustments: Partial<CognitiveWeights> = {};

    if (metrics.winRate && metrics.winRate < 0.4) {
      recommendations.push("Win rate below 40% - Consider increasing risk aversion");
      suggestedAdjustments.riskAversion = Math.min(1, weights.riskAversion + 0.1);
      suggestedAdjustments.exploration = Math.max(0, weights.exploration - 0.05);
    }

    if (metrics.winRate && metrics.winRate > 0.6) {
      recommendations.push(
        "Strong win rate detected - Consider increasing exploitation weight"
      );
      suggestedAdjustments.exploitation = Math.min(1, weights.exploitation + 0.1);
      suggestedAdjustments.exploration = Math.max(0.1, weights.exploration - 0.05);
    }

    if (metrics.avgProfitLoss && metrics.avgProfitLoss < 0) {
      recommendations.push("Negative average P/L - Strengthen reasoning and analysis");
      suggestedAdjustments.reasoning = Math.min(1, weights.reasoning + 0.15);
      suggestedAdjustments.riskAversion = Math.min(1, weights.riskAversion + 0.1);
    }

    if (metrics.maxDrawdown && metrics.maxDrawdown > 0.2) {
      recommendations.push("High drawdown detected - Increase adaptability");
      suggestedAdjustments.adaptability = Math.min(1, weights.adaptability + 0.1);
    }

    if ((profile.confidenceScore || 0) < 0.3) {
      recommendations.push("Low confidence - Enter observation phase for learning");
      await this.updatePhase(profileId, "observation", userId, mode);
    }

    if ((profile.confidenceScore || 0) > 0.7 && profile.currentPhase === "observation") {
      recommendations.push("High confidence - Ready for adjustment phase");
    }

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "continuous_learning",
        action: "performance_evaluated",
        profileId: profile.profileId,
        recommendations: recommendations.length,
        confidenceScore: profile.confidenceScore,
      },
    });

    return {
      profile,
      recommendations,
      suggestedAdjustments,
    };
  }

  async getProfileByUser(userId: string): Promise<LearningWeightProfile | null> {
    const [profile] = await db
      .select()
      .from(learningWeightProfile)
      .where(eq(learningWeightProfile.userId, userId))
      .orderBy(desc(learningWeightProfile.createdAt))
      .limit(1);

    return profile || null;
  }

  private normalizeWeights(weights: CognitiveWeights): CognitiveWeights {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

    if (total === 0) return weights;

    return {
      reasoning: weights.reasoning / total,
      exploration: weights.exploration / total,
      exploitation: weights.exploitation / total,
      riskAversion: weights.riskAversion / total,
      adaptability: weights.adaptability / total,
    };
  }
}

export const continuousLearningEngine = new ContinuousLearningEngine();
