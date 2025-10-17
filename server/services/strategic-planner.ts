import { db } from "../db";
import { strategicPlanLog, experienceMemoryLog, alignmentPolicies } from "@shared/schema";
import type { InsertStrategicPlanLog, StrategicPlanLog } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { contextBridge } from "./context-bridge";

interface PlanPhase {
  phaseId: string;
  title: string;
  description: string;
  milestones: Array<{
    id: string;
    title: string;
    completed: boolean;
    completedAt?: string;
  }>;
  startDate?: string;
  targetEndDate?: string;
  actualEndDate?: string;
}

interface SuccessCriteria {
  metricName: string;
  targetValue: number | string;
  currentValue?: number | string;
  achieved: boolean;
}

interface StrategicRecommendation {
  planId: string;
  title: string;
  description: string;
  rationale: string;
  estimatedDuration: string;
  successCriteria: SuccessCriteria[];
  linkedExperiences: string[];
}

export class StrategicPlannerService {
  async createPlan(
    userId: string,
    planData: {
      title: string;
      description?: string;
      phases: PlanPhase[];
      successCriteria: SuccessCriteria[];
      linkedExperiences?: string[];
    },
    mode?: "live" | "paper"
  ): Promise<StrategicPlanLog> {
    const planId = nanoid(16);

    const plan: InsertStrategicPlanLog = {
      planId,
      userId,
      title: planData.title,
      description: planData.description,
      status: "draft",
      phases: planData.phases,
      successCriteria: planData.successCriteria,
      currentProgress: {
        completedPhases: 0,
        totalPhases: planData.phases.length,
        completedMilestones: 0,
        totalMilestones: planData.phases.reduce((sum, phase) => sum + phase.milestones.length, 0),
        overallCompletion: 0,
      },
      linkedExperiences: planData.linkedExperiences || [],
      alignmentScore: 0.8,
      metadata: {
        createdBy: "strategic_planner",
        source: "user_initiated",
      },
    };

    const [created] = await db.insert(strategicPlanLog).values(plan).returning();

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "strategic_planner",
        action: "plan_created",
        planId: created.planId,
        title: created.title,
        phases: planData.phases.length,
        successCriteria: planData.successCriteria.length,
      },
    });

    return created;
  }

  async updatePlanProgress(
    planId: string,
    updates: {
      phaseId?: string;
      milestoneId?: string;
      completed?: boolean;
    },
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicPlanLog | null> {
    const [plan] = await db
      .select()
      .from(strategicPlanLog)
      .where(eq(strategicPlanLog.planId, planId));

    if (!plan) return null;

    const phases = plan.phases as PlanPhase[];
    let updated = false;

    if (updates.phaseId && updates.milestoneId !== undefined) {
      const phase = phases.find((p) => p.phaseId === updates.phaseId);
      if (phase) {
        const milestone = phase.milestones.find((m) => m.id === updates.milestoneId);
        if (milestone && updates.completed !== undefined) {
          milestone.completed = updates.completed;
          if (updates.completed) {
            milestone.completedAt = new Date().toISOString();
          } else {
            delete milestone.completedAt;
          }
          updated = true;
        }
      }
    }

    if (!updated) return plan;

    const totalMilestones = phases.reduce((sum, p) => sum + p.milestones.length, 0);
    const completedMilestones = phases.reduce(
      (sum, p) => sum + p.milestones.filter((m) => m.completed).length,
      0
    );
    const completedPhases = phases.filter((p) =>
      p.milestones.every((m) => m.completed)
    ).length;

    const newProgress = {
      completedPhases,
      totalPhases: phases.length,
      completedMilestones,
      totalMilestones,
      overallCompletion: totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0,
    };

    const [updatedPlan] = await db
      .update(strategicPlanLog)
      .set({
        phases,
        currentProgress: newProgress,
        updatedAt: new Date(),
      })
      .where(eq(strategicPlanLog.planId, planId))
      .returning();

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "strategic_planner",
        action: "progress_updated",
        planId: updatedPlan.planId,
        progress: newProgress,
      },
    });

    return updatedPlan;
  }

  async updatePlanStatus(
    planId: string,
    status: "draft" | "active" | "paused" | "completed",
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicPlanLog | null> {
    const updates: any = { status, updatedAt: new Date() };

    if (status === "active" && !updates.startedAt) {
      updates.startedAt = new Date();
    } else if (status === "completed") {
      updates.completedAt = new Date();
    }

    const [updated] = await db
      .update(strategicPlanLog)
      .set(updates)
      .where(eq(strategicPlanLog.planId, planId))
      .returning();

    if (!updated) return null;

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "strategic_planner",
        action: "status_changed",
        planId: updated.planId,
        status: updated.status,
        startedAt: updated.startedAt,
        completedAt: updated.completedAt,
      },
    });

    return updated;
  }

  async generateRecommendations(
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicRecommendation[]> {
    const experiences = await db
      .select()
      .from(experienceMemoryLog)
      .orderBy(desc(experienceMemoryLog.timestamp))
      .limit(10);

    const policies = await db
      .select()
      .from(alignmentPolicies)
      .where(eq(alignmentPolicies.isActive, true));

    const recommendations: StrategicRecommendation[] = [];

    const highImpactExperiences = experiences.filter((exp) => exp.impact === "high");

    if (highImpactExperiences.length >= 3) {
      const successfulPatterns = highImpactExperiences.map((exp) => exp.memoryId);

      recommendations.push({
        planId: `plan_${nanoid(12)}`,
        title: "Optimize High-Impact Patterns",
        description:
          "Develop a systematic approach to identify and scale successful patterns based on recent high-impact experiences.",
        rationale: `${highImpactExperiences.length} high-impact experiences detected in recent history. Focus on reinforcing proven patterns.`,
        estimatedDuration: "2-4 weeks",
        successCriteria: [
          {
            metricName: "Win Rate Improvement",
            targetValue: "15%",
            achieved: false,
          },
          {
            metricName: "Risk-Adjusted Returns",
            targetValue: "1.5 Sharpe Ratio",
            achieved: false,
          },
        ],
        linkedExperiences: successfulPatterns,
      });
    }

    const lowConfidenceExperiences = experiences.filter((exp) => exp.confidence < 0.5);

    if (lowConfidenceExperiences.length >= 2) {
      const uncertainPatterns = lowConfidenceExperiences.map((exp) => exp.memoryId);

      recommendations.push({
        planId: `plan_${nanoid(12)}`,
        title: "Risk Mitigation Enhancement",
        description:
          "Implement stricter risk controls and exit strategies to reduce exposure from low-confidence patterns.",
        rationale: `${lowConfidenceExperiences.length} low-confidence experiences detected. Strengthen risk management protocols.`,
        estimatedDuration: "1-2 weeks",
        successCriteria: [
          {
            metricName: "Maximum Drawdown Reduction",
            targetValue: "25%",
            achieved: false,
          },
          {
            metricName: "Loss Per Trade",
            targetValue: "< 2% portfolio value",
            achieved: false,
          },
        ],
        linkedExperiences: uncertainPatterns,
      });
    }

    if (policies.length > 0) {
      recommendations.push({
        planId: `plan_${nanoid(12)}`,
        title: "Policy Alignment Review",
        description:
          "Comprehensive review and update of active policies to ensure alignment with current market conditions and performance goals.",
        rationale: `${policies.length} active policies require periodic review for relevance and effectiveness.`,
        estimatedDuration: "1 week",
        successCriteria: [
          {
            metricName: "Policy Compliance Rate",
            targetValue: "95%",
            achieved: false,
          },
          {
            metricName: "Policy Effectiveness Score",
            targetValue: "0.8",
            achieved: false,
          },
        ],
        linkedExperiences: [],
      });
    }

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "strategic_planner",
        action: "recommendations_generated",
        count: recommendations.length,
        recommendations: recommendations.map((r) => ({
          planId: r.planId,
          title: r.title,
        })),
      },
    });

    return recommendations;
  }

  async getPlansByUser(userId: string): Promise<StrategicPlanLog[]> {
    return await db
      .select()
      .from(strategicPlanLog)
      .where(eq(strategicPlanLog.userId, userId))
      .orderBy(desc(strategicPlanLog.createdAt));
  }

  async getActivePlans(userId: string): Promise<StrategicPlanLog[]> {
    return await db
      .select()
      .from(strategicPlanLog)
      .where(
        and(eq(strategicPlanLog.userId, userId), eq(strategicPlanLog.status, "active"))
      )
      .orderBy(desc(strategicPlanLog.startedAt));
  }

  async evaluateAlignment(planId: string): Promise<number> {
    const [plan] = await db
      .select()
      .from(strategicPlanLog)
      .where(eq(strategicPlanLog.planId, planId));

    if (!plan) return 0.5;

    const policies = await db
      .select()
      .from(alignmentPolicies)
      .where(eq(alignmentPolicies.isActive, true));

    const successCriteria = plan.successCriteria as SuccessCriteria[];
    let alignmentScore = 1.0;

    for (const policy of policies) {
      const constraints = policy.constraints as any;

      if (constraints?.maxRiskPerTrade) {
        const riskCriteria = successCriteria.find((c) =>
          c.metricName.toLowerCase().includes("risk")
        );
        if (riskCriteria) {
          const targetRisk = parseFloat(String(riskCriteria.targetValue));
          if (targetRisk > constraints.maxRiskPerTrade) {
            alignmentScore -= 0.2;
          }
        }
      }

      if (constraints?.requiredWinRate) {
        const winRateCriteria = successCriteria.find((c) =>
          c.metricName.toLowerCase().includes("win rate")
        );
        if (winRateCriteria) {
          const targetWinRate = parseFloat(String(winRateCriteria.targetValue));
          if (targetWinRate < constraints.requiredWinRate) {
            alignmentScore -= 0.15;
          }
        }
      }
    }

    alignmentScore = Math.max(0, Math.min(1, alignmentScore));

    await db
      .update(strategicPlanLog)
      .set({ alignmentScore })
      .where(eq(strategicPlanLog.planId, planId));

    return alignmentScore;
  }
}

export const strategicPlannerService = new StrategicPlannerService();
