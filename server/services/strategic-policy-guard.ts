import { db } from "../db";
import { alignmentPolicies, strategicPlanLog, learningWeightProfile, alignmentAuditLog } from "@shared/schema";
import type { StrategicPlanLog, LearningWeightProfile } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { contextBridge } from "./context-bridge";

interface ValidationResult {
  approved: boolean;
  violations: string[];
  warnings: string[];
  alignmentScore: number;
  recommendations: string[];
}

interface CognitiveWeights {
  reasoning: number;
  exploration: number;
  exploitation: number;
  riskAversion: number;
  adaptability: number;
}

export class StrategicPolicyGuard {
  async validateStrategicPlan(
    planId: string,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<ValidationResult> {
    const [plan] = await db
      .select()
      .from(strategicPlanLog)
      .where(eq(strategicPlanLog.planId, planId));

    if (!plan) {
      return {
        approved: false,
        violations: ["Plan not found"],
        warnings: [],
        alignmentScore: 0,
        recommendations: [],
      };
    }

    const policies = await db
      .select()
      .from(alignmentPolicies)
      .where(eq(alignmentPolicies.isActive, true));

    const violations: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let alignmentScore = 1.0;

    const successCriteria = plan.successCriteria as any[];

    for (const policy of policies) {
      const constraints = policy.constraints as any;

      if (policy.policyType === "risk") {
        const riskCriteria = successCriteria.filter((c: any) =>
          c.metricName.toLowerCase().includes("risk") ||
          c.metricName.toLowerCase().includes("drawdown") ||
          c.metricName.toLowerCase().includes("loss")
        );

        if (constraints.maxRiskPerTrade) {
          for (const criteria of riskCriteria) {
            const targetValue = parseFloat(String(criteria.targetValue));
            if (targetValue > constraints.maxRiskPerTrade) {
              violations.push(
                `Risk target ${criteria.metricName} exceeds policy limit (${targetValue} > ${constraints.maxRiskPerTrade})`
              );
              alignmentScore -= 0.3;
            }
          }
        }

        if (constraints.maxDrawdown) {
          const drawdownCriteria = successCriteria.find((c: any) =>
            c.metricName.toLowerCase().includes("drawdown")
          );
          if (drawdownCriteria) {
            const targetDrawdown = parseFloat(String(drawdownCriteria.targetValue));
            if (targetDrawdown > constraints.maxDrawdown) {
              violations.push(
                `Drawdown target exceeds policy limit (${targetDrawdown} > ${constraints.maxDrawdown})`
              );
              alignmentScore -= 0.25;
            }
          }
        }
      }

      if (policy.policyType === "operational") {
        const phases = plan.phases as any[];
        const totalDuration = phases.reduce((sum: number, phase: any) => {
          if (phase.targetEndDate && phase.startDate) {
            const start = new Date(phase.startDate);
            const end = new Date(phase.targetEndDate);
            return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
          }
          return sum;
        }, 0);

        if (constraints.maxPlanDuration && totalDuration > constraints.maxPlanDuration) {
          warnings.push(
            `Plan duration (${totalDuration} days) exceeds recommended limit (${constraints.maxPlanDuration} days)`
          );
          alignmentScore -= 0.1;
        }

        if (constraints.minMilestones) {
          const totalMilestones = phases.reduce(
            (sum: number, phase: any) => sum + (phase.milestones?.length || 0),
            0
          );
          if (totalMilestones < constraints.minMilestones) {
            warnings.push(
              `Plan has insufficient milestones (${totalMilestones} < ${constraints.minMilestones})`
            );
            recommendations.push("Add more granular milestones to track progress effectively");
          }
        }
      }
    }

    alignmentScore = Math.max(0, Math.min(1, alignmentScore));

    const approved = violations.length === 0;

    await db.insert(alignmentAuditLog).values({
      auditId: nanoid(16),
      verificationResult: approved ? "approved" : "flagged",
      proposedChange: { type: "strategic_plan", planId, title: plan.title },
      violatedPolicies: violations,
      alignmentScore,
      recommendations,
      metadata: { userId, mode, source: "strategic_policy_guard" },
    });

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "strategic_policy_guard",
        action: "plan_validated",
        planId,
        approved,
        violations: violations.length,
        alignmentScore,
      },
    });

    return {
      approved,
      violations,
      warnings,
      alignmentScore,
      recommendations,
    };
  }

  async validateWeightAdjustment(
    profileId: string,
    proposedWeights: Partial<CognitiveWeights>,
    rationale: string,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<ValidationResult> {
    const [profile] = await db
      .select()
      .from(learningWeightProfile)
      .where(eq(learningWeightProfile.profileId, profileId));

    if (!profile) {
      return {
        approved: false,
        violations: ["Learning profile not found"],
        warnings: [],
        alignmentScore: 0,
        recommendations: [],
      };
    }

    const policies = await db
      .select()
      .from(alignmentPolicies)
      .where(eq(alignmentPolicies.isActive, true));

    const violations: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    let alignmentScore = 1.0;

    const currentWeights = profile.cognitiveWeights as CognitiveWeights;
    const newWeights = { ...currentWeights, ...proposedWeights };

    for (const policy of policies) {
      const constraints = policy.constraints as any;

      if (policy.policyType === "operational" || policy.policyType === "functional") {
        if (constraints.minRiskAversion !== undefined) {
          if (newWeights.riskAversion < constraints.minRiskAversion) {
            violations.push(
              `Risk aversion weight too low (${newWeights.riskAversion} < ${constraints.minRiskAversion})`
            );
            alignmentScore -= 0.3;
          }
        }

        if (constraints.maxExploration !== undefined) {
          if (newWeights.exploration > constraints.maxExploration) {
            violations.push(
              `Exploration weight too high (${newWeights.exploration} > ${constraints.maxExploration})`
            );
            alignmentScore -= 0.25;
          }
        }

        if (constraints.minReasoning !== undefined) {
          if (newWeights.reasoning < constraints.minReasoning) {
            warnings.push(
              `Reasoning weight below recommended threshold (${newWeights.reasoning} < ${constraints.minReasoning})`
            );
            alignmentScore -= 0.15;
            recommendations.push(
              "Consider increasing reasoning weight to ensure thorough analysis"
            );
          }
        }
      }

      if (policy.policyType === "ethical") {
        const weightSum = Object.values(newWeights).reduce((sum, w) => sum + w, 0);
        if (Math.abs(weightSum - 1.0) > 0.1) {
          warnings.push(
            `Weights do not sum to approximately 1.0 (sum: ${weightSum.toFixed(2)})`
          );
          recommendations.push("Normalize weights to ensure balanced cognitive allocation");
        }

        const maxWeight = Math.max(...Object.values(newWeights));
        if (maxWeight > 0.8) {
          warnings.push(`Single weight dominates cognitive allocation (${maxWeight.toFixed(2)})`);
          recommendations.push(
            "Consider more balanced weight distribution to avoid cognitive bias"
          );
        }
      }
    }

    alignmentScore = Math.max(0, Math.min(1, alignmentScore));

    const approved = violations.length === 0;

    await db.insert(alignmentAuditLog).values({
      auditId: nanoid(16),
      verificationResult: approved ? "approved" : violations.length > 0 ? "rejected" : "flagged",
      proposedChange: {
        type: "weight_adjustment",
        profileId,
        currentWeights,
        proposedWeights,
        rationale,
      },
      violatedPolicies: violations,
      alignmentScore,
      recommendations,
      metadata: { userId, mode, source: "strategic_policy_guard" },
    });

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "strategic_policy_guard",
        action: "weights_validated",
        profileId,
        approved,
        violations: violations.length,
        alignmentScore,
      },
    });

    return {
      approved,
      violations,
      warnings,
      alignmentScore,
      recommendations,
    };
  }

  async enforceGuardrails(
    action: "create_plan" | "adjust_weights" | "activate_plan" | "retrain_model",
    context: any,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policies = await db
      .select()
      .from(alignmentPolicies)
      .where(eq(alignmentPolicies.isActive, true));

    for (const policy of policies) {
      const constraints = policy.constraints as any;

      if (action === "create_plan" && constraints.requireApproval === true) {
        return {
          allowed: false,
          reason: `Policy "${policy.name}" requires manual approval for creating strategic plans`,
        };
      }

      if (action === "adjust_weights" && constraints.requireReview === true) {
        return {
          allowed: false,
          reason: `Policy "${policy.name}" requires review before adjusting cognitive weights`,
        };
      }

      if (action === "activate_plan") {
        if (context.alignmentScore < (constraints.minAlignmentScore || 0.7)) {
          return {
            allowed: false,
            reason: `Plan alignment score (${context.alignmentScore}) below policy threshold (${constraints.minAlignmentScore || 0.7})`,
          };
        }
      }

      if (action === "retrain_model") {
        if (context.confidenceScore < (constraints.minConfidenceForRetrain || 0.5)) {
          return {
            allowed: false,
            reason: `Confidence score (${context.confidenceScore}) too low for model retraining (min: ${constraints.minConfidenceForRetrain || 0.5})`,
          };
        }
      }
    }

    return { allowed: true };
  }

  async getComplianceStatus(userId: string): Promise<{
    compliant: boolean;
    activeViolations: number;
    recentAudits: number;
    riskLevel: "low" | "medium" | "high";
  }> {
    const recentAudits = await db
      .select()
      .from(alignmentAuditLog)
      .orderBy(alignmentAuditLog.timestamp)
      .limit(10);

    const violations = recentAudits.filter(
      (audit) => audit.verificationResult === "rejected" || audit.verificationResult === "flagged"
    );

    const avgScore =
      recentAudits.reduce((sum, audit) => sum + (audit.alignmentScore || 0), 0) /
      (recentAudits.length || 1);

    const riskLevel: "low" | "medium" | "high" =
      avgScore >= 0.8 ? "low" : avgScore >= 0.6 ? "medium" : "high";

    return {
      compliant: violations.length === 0,
      activeViolations: violations.length,
      recentAudits: recentAudits.length,
      riskLevel,
    };
  }
}

export const strategicPolicyGuard = new StrategicPolicyGuard();
