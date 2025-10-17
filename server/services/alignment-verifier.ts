import { db } from '../db';
import { alignmentPolicies, alignmentAuditLog, goalAlignmentProfile } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { contextBridge as ContextBridgeType } from './context-bridge';

/**
 * AlignmentVerifier - Pre-Execution Alignment Validation
 * 
 * Purpose: Ensures all autonomous actions align with system objectives and policies
 * before execution, providing a safety gate for AI-driven decisions.
 * 
 * Features:
 * - Policy-based action validation
 * - Risk constraint checking
 * - Alignment score computation
 * - Audit trail logging
 */
export class AlignmentVerifier {
  constructor(private contextBridge: typeof ContextBridgeType) {}

  /**
   * Verify an action against alignment policies
   */
  async verifyAction(params: {
    actionType: string;
    actionParams: Record<string, any>;
    policyType: string;
    requestedBy: string;
  }): Promise<{
    approved: boolean;
    alignmentScore: number;
    rationale: string;
    constraints: string[];
    warnings: string[];
  }> {
    const { actionType, actionParams, policyType, requestedBy } = params;
    const auditId = `audit-${nanoid()}`;

    console.log(`[AlignmentVerifier] 🔍 Verifying action: ${actionType} (type: ${policyType})`);

    try {
      // 1. Load active policies for this type
      const policies = await db
        .select()
        .from(alignmentPolicies)
        .where(
          and(
            eq(alignmentPolicies.isActive, true),
            eq(alignmentPolicies.policyType, policyType as any)
          )
        );

      if (policies.length === 0) {
        console.warn(`[AlignmentVerifier] ⚠️ No active policies found for type: ${policyType}`);
      }

      // 2. Load current alignment profile (initialize if missing)
      let profile = await db
        .select()
        .from(goalAlignmentProfile)
        .orderBy(desc(goalAlignmentProfile.updatedAt))
        .limit(1)
        .then((rows: any[]) => rows[0]);

      // Initialize profile if it doesn't exist
      if (!profile) {
        console.log("[AlignmentVerifier] ⚠️ No profile found, initializing default profile...");
        const { AdaptiveObjectiveEngine } = await import('./adaptive-objective-engine');
        const adaptiveEngine = new AdaptiveObjectiveEngine(this.contextBridge);
        profile = await adaptiveEngine.initializeProfile();
      }

      // 3. Evaluate action against policies
      const evaluation = this.evaluateAgainstPolicies(
        actionType,
        actionParams,
        policies,
        profile
      );

      // 4. Compute alignment score
      const alignmentScore = this.computeAlignmentScore(evaluation, profile);

      // 5. Determine approval
      const approved = alignmentScore >= 0.6 && evaluation.violations.length === 0;

      // 6. Generate rationale
      const rationale = this.generateRationale(
        approved,
        alignmentScore,
        evaluation,
        policies
      );

      // 7. Log audit trail
      await db.insert(alignmentAuditLog).values({
        auditId,
        timestamp: new Date(),
        verificationResult: approved ? 'approved' : 'rejected',
        proposedChange: {
          actionType,
          actionParams,
          requestedBy
        },
        violatedPolicies: evaluation.violations,
        alignmentScore,
        recommendations: evaluation.warnings,
        metadata: {
          policyType,
          appliedPolicies: policies.map((p: any) => p.policyId),
          constraints: evaluation.constraints
        }
      });

      console.log(
        `[AlignmentVerifier] ${approved ? '✅' : '❌'} Verification ${approved ? 'PASSED' : 'FAILED'} - Score: ${alignmentScore.toFixed(2)}`
      );

      // 8. Broadcast verification result
      await this.contextBridge.broadcast({
        type: "state_update",
        userId: null, // System-level event
        mode: undefined,
        payload: {
          eventType: "alignment_verification_complete",
          auditId,
          actionType,
          approved,
          alignmentScore,
          rationale
        }
      });

      return {
        approved,
        alignmentScore,
        rationale,
        constraints: evaluation.constraints,
        warnings: evaluation.warnings
      };

    } catch (error) {
      console.error(`[AlignmentVerifier] ❌ Verification failed:`, error);
      
      // Log failed verification
      await db.insert(alignmentAuditLog).values({
        auditId,
        timestamp: new Date(),
        verificationResult: 'flagged',
        proposedChange: {
          actionType,
          actionParams,
          requestedBy
        },
        violatedPolicies: ['verification_error'],
        alignmentScore: 0,
        recommendations: [`Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        metadata: { error: true }
      });

      return {
        approved: false,
        alignmentScore: 0,
        rationale: `Verification failed due to system error`,
        constraints: ['error_state'],
        warnings: ['System in error state - action rejected']
      };
    }
  }

  /**
   * Evaluate action against policy constraints
   */
  private evaluateAgainstPolicies(
    actionType: string,
    actionParams: Record<string, any>,
    policies: Array<{
      policyId: string;
      policyType: string;
      constraints: any;
      priority: number;
    }>,
    profile?: {
      objectives: any;
      targetMetrics: any;
    }
  ): {
    violations: string[];
    constraints: string[];
    warnings: string[];
    policyMatches: number;
  } {
    const violations: string[] = [];
    const constraints: string[] = [];
    const warnings: string[] = [];
    let policyMatches = 0;

    for (const policy of policies) {
      const policyConstraints = policy.constraints || {};

      // Check for action type restrictions
      if (policyConstraints.allowedActions && Array.isArray(policyConstraints.allowedActions)) {
        if (!policyConstraints.allowedActions.includes(actionType)) {
          violations.push(`action_not_allowed: ${actionType} not in allowed list`);
        } else {
          policyMatches++;
        }
      }

      // Check risk limits for trading actions
      if (actionType.includes('trade') || actionType.includes('order')) {
        if (policyConstraints.maxRiskPerTrade && actionParams.amount) {
          const riskAmount = parseFloat(actionParams.amount);
          const maxRisk = parseFloat(policyConstraints.maxRiskPerTrade);
          if (riskAmount > maxRisk) {
            violations.push(`risk_exceeded: ${riskAmount} > ${maxRisk}`);
          }
        }

        if (policyConstraints.requiredApproval && actionParams.amount) {
          const amount = parseFloat(actionParams.amount);
          const threshold = parseFloat(policyConstraints.requiredApproval.threshold || '1000');
          if (amount > threshold) {
            warnings.push(`manual_approval_required: Amount ${amount} exceeds threshold ${threshold}`);
          }
        }
      }

      // Check domain-specific constraints
      if (policyConstraints.domainRules) {
        const rules = policyConstraints.domainRules;
        
        if (rules.maxActionsPerHour && actionParams.frequency) {
          const freq = parseInt(actionParams.frequency);
          if (freq > rules.maxActionsPerHour) {
            violations.push(`frequency_exceeded: ${freq} actions/hour > ${rules.maxActionsPerHour}`);
          }
        }

        if (rules.requiresContext && !actionParams.context) {
          warnings.push('context_missing: Action requires contextual justification');
        }
      }

      // Add policy constraints to list
      if (policyConstraints.mustComplyWith) {
        constraints.push(...policyConstraints.mustComplyWith);
      }
    }

    return { violations, constraints, warnings, policyMatches };
  }

  /**
   * Compute alignment score (0.0 - 1.0)
   */
  private computeAlignmentScore(
    evaluation: {
      violations: string[];
      warnings: string[];
      policyMatches: number;
    },
    profile?: {
      objectives: any;
    }
  ): number {
    let score = 1.0;

    // Deduct for violations (severe)
    score -= evaluation.violations.length * 0.3;

    // Deduct for warnings (moderate)
    score -= evaluation.warnings.length * 0.1;

    // Bonus for policy matches
    score += evaluation.policyMatches * 0.05;

    // Weight by profile objectives if available
    if (profile?.objectives) {
      const objectives = profile.objectives;
      if (typeof objectives === 'object' && objectives !== null) {
        const avgObjective = Object.values(objectives).reduce((sum: number, w: any) => sum + (parseFloat(w) || 0), 0) / Object.keys(objectives).length;
        score *= avgObjective; // Scale by average objective weight
      }
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate human-readable rationale
   */
  private generateRationale(
    approved: boolean,
    alignmentScore: number,
    evaluation: {
      violations: string[];
      warnings: string[];
      policyMatches: number;
    },
    policies: Array<{ policyId: string; policyType: string }>
  ): string {
    if (!approved) {
      if (evaluation.violations.length > 0) {
        return `Action rejected due to policy violations: ${evaluation.violations.join(', ')}`;
      }
      return `Action rejected due to low alignment score (${alignmentScore.toFixed(2)} < 0.60)`;
    }

    const parts: string[] = [
      `Action approved with alignment score ${alignmentScore.toFixed(2)}`
    ];

    if (evaluation.policyMatches > 0) {
      parts.push(`matched ${evaluation.policyMatches} policies`);
    }

    if (evaluation.warnings.length > 0) {
      parts.push(`warnings: ${evaluation.warnings.join(', ')}`);
    }

    return parts.join('; ');
  }

  /**
   * Batch verify multiple actions
   */
  async verifyBatch(actions: Array<{
    actionType: string;
    actionParams: Record<string, any>;
    policyType: string;
    requestedBy: string;
  }>): Promise<Array<{
    approved: boolean;
    alignmentScore: number;
    rationale: string;
  }>> {
    console.log(`[AlignmentVerifier] 📦 Batch verifying ${actions.length} actions`);

    const results = await Promise.all(
      actions.map(action => this.verifyAction(action))
    );

    const approvedCount = results.filter(r => r.approved).length;
    console.log(`[AlignmentVerifier] ✅ Batch complete: ${approvedCount}/${actions.length} approved`);

    return results;
  }

  /**
   * Get recent verification history
   */
  async getVerificationHistory(limit: number = 20): Promise<Array<{
    auditId: string;
    timestamp: Date;
    verificationResult: string;
    proposedChange: any;
    alignmentScore: number | null;
    recommendations: string[] | null;
  }>> {
    const history = await db
      .select({
        auditId: alignmentAuditLog.auditId,
        timestamp: alignmentAuditLog.timestamp,
        verificationResult: alignmentAuditLog.verificationResult,
        proposedChange: alignmentAuditLog.proposedChange,
        alignmentScore: alignmentAuditLog.alignmentScore,
        recommendations: alignmentAuditLog.recommendations
      })
      .from(alignmentAuditLog)
      .orderBy(desc(alignmentAuditLog.timestamp))
      .limit(limit);

    return history;
  }
}
