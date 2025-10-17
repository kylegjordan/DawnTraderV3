// server/services/ethical-reasoning-engine.ts
// Phase 9.5: Ethical Reasoning & Value Alignment Module

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { contextBridge } from './context-bridge';
import { nanoid } from 'nanoid';

type EthicalPriority = 'critical' | 'high' | 'medium' | 'low';
type ComplianceStatus = 'compliant' | 'warning' | 'violation' | 'override';
type ValueCategory = 'safety' | 'fairness' | 'transparency' | 'accountability' | 'user_welfare';

interface EthicalRule {
  id: string;
  ruleName: string;
  category: ValueCategory;
  description: string | null;
  constraintLogic: Record<string, any>;
  priority: EthicalPriority;
  isActive: boolean;
  violationAction: string;
}

interface EthicalEvaluation {
  actionType: string;
  actionId?: string;
  actionData: Record<string, any>;
}

interface EthicalAudit {
  id: string;
  userId: string | null;
  actionType: string;
  actionId: string | null;
  rulesEvaluated: string[];
  complianceStatus: ComplianceStatus;
  violationsDetected: Record<string, any> | null;
  overrideReason: string | null;
  recommendations: string[] | null;
  metadata: unknown;
  createdAt: Date;
}

/**
 * Ethical Reasoning Engine
 * Evaluates actions against ethical rules and ensures value alignment
 */
class EthicalReasoningEngine {
  /**
   * Initialize default ethical rules for a user
   */
  async initializeDefaultRules(userId: string): Promise<void> {
    const defaultRules = [
      {
        ruleName: 'risk_limit_safety',
        category: 'safety',
        description: 'Ensure trades do not exceed maximum risk threshold',
        constraintLogic: { maxRiskPercent: 2.0, type: 'risk_check' },
        priority: 'critical',
        violationAction: 'block',
      },
      {
        ruleName: 'position_size_fairness',
        category: 'fairness',
        description: 'Ensure position sizes are proportional to account balance',
        constraintLogic: { maxPositionPercent: 10.0, type: 'position_check' },
        priority: 'high',
        violationAction: 'warn',
      },
      {
        ruleName: 'decision_transparency',
        category: 'transparency',
        description: 'All trading decisions must have clear reasoning',
        constraintLogic: { requireReasoning: true, type: 'transparency_check' },
        priority: 'medium',
        violationAction: 'log',
      },
      {
        ruleName: 'user_welfare_protection',
        category: 'user_welfare',
        description: 'Protect user from excessive losses',
        constraintLogic: { maxDailyLoss: 5.0, type: 'welfare_check' },
        priority: 'critical',
        violationAction: 'block',
      },
    ];

    for (const rule of defaultRules) {
      await db.execute(sql`
        INSERT INTO ethical_rule_set (
          id, user_id, rule_name, category, description, 
          constraint_logic, priority, is_active, violation_action
        ) VALUES (
          ${`rule_${nanoid(12)}`},
          ${userId},
          ${rule.ruleName},
          ${rule.category}::value_category,
          ${rule.description},
          ${JSON.stringify(rule.constraintLogic)}::jsonb,
          ${rule.priority}::ethical_priority,
          true,
          ${rule.violationAction}
        )
        ON CONFLICT DO NOTHING
      `);
    }
  }

  /**
   * Evaluate an action against ethical rules
   */
  async evaluateAction(
    userId: string,
    evaluation: EthicalEvaluation,
    mode?: 'live' | 'paper'
  ): Promise<EthicalAudit> {
    const auditId = `audit_${nanoid(12)}`;

    // Fetch active rules for user
    const rulesResult = await db.execute(sql`
      SELECT * FROM ethical_rule_set
      WHERE user_id = ${userId} AND is_active = true
      ORDER BY 
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `);

    const rules = rulesResult.rows as unknown as EthicalRule[];
    const rulesEvaluated: string[] = [];
    const violations: Record<string, any> = {};
    let overallStatus: ComplianceStatus = 'compliant';
    const recommendations: string[] = [];

    // Evaluate each rule
    for (const rule of rules) {
      rulesEvaluated.push(rule.ruleName);
      
      const { compliant, violation, recommendation } = this.evaluateRule(
        rule,
        evaluation.actionData
      );

      if (!compliant) {
        violations[rule.ruleName] = violation;

        // Update overall status based on priority
        if (rule.priority === 'critical' && overallStatus !== 'violation') {
          overallStatus = 'violation';
        } else if (rule.priority === 'high' && overallStatus === 'compliant') {
          overallStatus = 'warning';
        }

        if (recommendation) {
          recommendations.push(recommendation);
        }
      }
    }

    // Create audit log
    const result = await db.execute(sql`
      INSERT INTO ethical_audit_log (
        id, user_id, action_type, action_id, rules_evaluated,
        compliance_status, violations_detected, recommendations, metadata
      ) VALUES (
        ${auditId},
        ${userId},
        ${evaluation.actionType},
        ${evaluation.actionId || null},
        ${JSON.stringify(rulesEvaluated)}::text[],
        ${overallStatus}::compliance_status,
        ${JSON.stringify(violations)}::jsonb,
        ${JSON.stringify(recommendations)}::text[],
        ${JSON.stringify({ mode })}::jsonb
      )
      RETURNING *
    `);

    const audit = result.rows[0] as EthicalAudit;

    // Broadcast via Context Bridge
    await contextBridge.broadcast({
      type: 'state_update',
      userId,
      mode,
      payload: {
        source: 'ethical_reasoning',
        action: 'evaluation_complete',
        auditId,
        complianceStatus: overallStatus,
        violationsCount: Object.keys(violations).length,
      },
    });

    return audit;
  }

  /**
   * Evaluate a single rule
   */
  private evaluateRule(
    rule: EthicalRule,
    actionData: Record<string, any>
  ): {
    compliant: boolean;
    violation?: string;
    recommendation?: string;
  } {
    const logic = rule.constraintLogic;

    switch (logic.type) {
      case 'risk_check':
        const riskPercent = actionData.riskPercent || 0;
        if (riskPercent > logic.maxRiskPercent) {
          return {
            compliant: false,
            violation: `Risk ${riskPercent}% exceeds limit ${logic.maxRiskPercent}%`,
            recommendation: `Reduce position size to stay within ${logic.maxRiskPercent}% risk`,
          };
        }
        break;

      case 'position_check':
        const positionPercent = actionData.positionPercent || 0;
        if (positionPercent > logic.maxPositionPercent) {
          return {
            compliant: false,
            violation: `Position ${positionPercent}% exceeds limit ${logic.maxPositionPercent}%`,
            recommendation: `Limit position to ${logic.maxPositionPercent}% of portfolio`,
          };
        }
        break;

      case 'transparency_check':
        if (logic.requireReasoning && !actionData.reasoning) {
          return {
            compliant: false,
            violation: 'Decision lacks clear reasoning',
            recommendation: 'Provide transparent reasoning for all decisions',
          };
        }
        break;

      case 'welfare_check':
        const dailyLoss = actionData.dailyLossPercent || 0;
        if (dailyLoss > logic.maxDailyLoss) {
          return {
            compliant: false,
            violation: `Daily loss ${dailyLoss}% exceeds welfare limit ${logic.maxDailyLoss}%`,
            recommendation: `Stop trading for today - daily loss limit reached`,
          };
        }
        break;
    }

    return { compliant: true };
  }

  /**
   * Get recent ethical audits
   */
  async getAudits(userId: string, limit = 20): Promise<EthicalAudit[]> {
    const result = await db.execute(sql`
      SELECT * FROM ethical_audit_log
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return result.rows as EthicalAudit[];
  }

  /**
   * Get active ethical rules
   */
  async getRules(userId: string): Promise<EthicalRule[]> {
    const result = await db.execute(sql`
      SELECT * FROM ethical_rule_set
      WHERE user_id = ${userId} AND is_active = true
      ORDER BY priority::text
    `);

    return result.rows as unknown as EthicalRule[];
  }

  /**
   * Override an ethical violation with justification
   */
  async overrideViolation(
    auditId: string,
    userId: string,
    overrideReason: string
  ): Promise<void> {
    await db.execute(sql`
      UPDATE ethical_audit_log
      SET 
        compliance_status = 'override'::compliance_status,
        override_reason = ${overrideReason}
      WHERE id = ${auditId} AND user_id = ${userId}
    `);

    await contextBridge.broadcast({
      type: 'state_update',
      userId,
      payload: {
        source: 'ethical_reasoning',
        action: 'violation_overridden',
        auditId,
        reason: overrideReason,
      },
    });
  }
}

export const ethicalReasoningEngine = new EthicalReasoningEngine();
