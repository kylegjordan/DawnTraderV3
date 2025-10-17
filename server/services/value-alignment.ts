// server/services/value-alignment.ts
// Phase 9.5: Value Alignment Service

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { contextBridge } from './context-bridge';
import { nanoid } from 'nanoid';

type ValueCategory = 'safety' | 'fairness' | 'transparency' | 'accountability' | 'user_welfare';

interface AlignmentMatrix {
  id: string;
  userId: string | null;
  objectiveName: string;
  valueCategory: ValueCategory;
  alignmentScore: number;
  weighting: number;
  constraints: Record<string, any> | null;
  lastEvaluated: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Value Alignment Service
 * Manages alignment between system objectives and ethical values
 */
class ValueAlignmentService {
  /**
   * Initialize default value alignment matrix for a user
   */
  async initializeDefaultMatrix(userId: string): Promise<void> {
    const defaultObjectives = [
      {
        objectiveName: 'maximize_profit',
        valueCategory: 'safety',
        alignmentScore: 0.75,
        weighting: 1.0,
        constraints: { mustNotExceedRisk: 2.0 },
      },
      {
        objectiveName: 'protect_capital',
        valueCategory: 'user_welfare',
        alignmentScore: 0.95,
        weighting: 1.5,
        constraints: { stopLossRequired: true },
      },
      {
        objectiveName: 'transparent_decisions',
        valueCategory: 'transparency',
        alignmentScore: 0.9,
        weighting: 1.2,
        constraints: { requireReasoningLog: true },
      },
      {
        objectiveName: 'fair_execution',
        valueCategory: 'fairness',
        alignmentScore: 0.85,
        weighting: 1.0,
        constraints: { noPriceManipulation: true },
      },
      {
        objectiveName: 'accountable_actions',
        valueCategory: 'accountability',
        alignmentScore: 0.9,
        weighting: 1.1,
        constraints: { auditTrailRequired: true },
      },
    ];

    for (const obj of defaultObjectives) {
      await db.execute(sql`
        INSERT INTO value_alignment_matrix (
          id, user_id, objective_name, value_category, 
          alignment_score, weighting, constraints
        ) VALUES (
          ${`align_${nanoid(12)}`},
          ${userId},
          ${obj.objectiveName},
          ${obj.valueCategory}::value_category,
          ${obj.alignmentScore},
          ${obj.weighting},
          ${JSON.stringify(obj.constraints)}::jsonb
        )
        ON CONFLICT DO NOTHING
      `);
    }
  }

  /**
   * Evaluate alignment for a specific objective
   */
  async evaluateObjective(
    userId: string,
    objectiveName: string,
    actionData: Record<string, any>
  ): Promise<{ aligned: boolean; score: number; issues: string[] }> {
    const result = await db.execute(sql`
      SELECT * FROM value_alignment_matrix
      WHERE user_id = ${userId} AND objective_name = ${objectiveName}
    `);

    if (result.rows.length === 0) {
      return { aligned: false, score: 0, issues: ['Objective not found in alignment matrix'] };
    }

    const matrix = result.rows[0] as unknown as AlignmentMatrix;
    const issues: string[] = [];

    // Check constraints
    if (matrix.constraints) {
      const constraints = matrix.constraints as Record<string, any>;
      
      if (constraints.mustNotExceedRisk && actionData.riskPercent > constraints.mustNotExceedRisk) {
        issues.push(`Risk ${actionData.riskPercent}% exceeds aligned limit ${constraints.mustNotExceedRisk}%`);
      }

      if (constraints.stopLossRequired && !actionData.stopLoss) {
        issues.push('Stop loss required for user welfare alignment');
      }

      if (constraints.requireReasoningLog && !actionData.reasoning) {
        issues.push('Reasoning log required for transparency alignment');
      }
    }

    // Calculate weighted alignment score
    const baseScore = matrix.alignmentScore;
    const penaltyPerIssue = 0.1;
    const finalScore = Math.max(0, baseScore - (issues.length * penaltyPerIssue));

    return {
      aligned: issues.length === 0,
      score: finalScore,
      issues,
    };
  }

  /**
   * Get overall alignment status across all objectives
   */
  async getOverallAlignment(
    userId: string
  ): Promise<{
    averageScore: number;
    byCategory: Record<ValueCategory, number>;
    objectives: AlignmentMatrix[];
  }> {
    const result = await db.execute(sql`
      SELECT * FROM value_alignment_matrix
      WHERE user_id = ${userId}
    `);

    const objectives = result.rows as unknown as AlignmentMatrix[];
    
    if (objectives.length === 0) {
      return {
        averageScore: 0,
        byCategory: {
          safety: 0,
          fairness: 0,
          transparency: 0,
          accountability: 0,
          user_welfare: 0,
        },
        objectives: [],
      };
    }

    // Calculate weighted average
    const totalWeight = objectives.reduce((sum, obj) => sum + obj.weighting, 0);
    const weightedSum = objectives.reduce(
      (sum, obj) => sum + (obj.alignmentScore * obj.weighting),
      0
    );
    const averageScore = weightedSum / totalWeight;

    // Group by category
    const byCategory: Record<string, number> = {};
    const categoryCount: Record<string, number> = {};

    for (const obj of objectives) {
      const cat = obj.valueCategory;
      byCategory[cat] = (byCategory[cat] || 0) + obj.alignmentScore;
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    }

    // Average by category
    for (const cat in byCategory) {
      byCategory[cat] = byCategory[cat] / categoryCount[cat];
    }

    return {
      averageScore,
      byCategory: byCategory as Record<ValueCategory, number>,
      objectives,
    };
  }

  /**
   * Update alignment score for an objective
   */
  async updateAlignment(
    userId: string,
    objectiveName: string,
    newScore: number
  ): Promise<void> {
    await db.execute(sql`
      UPDATE value_alignment_matrix
      SET 
        alignment_score = ${newScore},
        last_evaluated = now(),
        updated_at = now()
      WHERE user_id = ${userId} AND objective_name = ${objectiveName}
    `);

    await contextBridge.broadcast({
      type: 'state_update',
      userId,
      payload: {
        source: 'value_alignment',
        action: 'alignment_updated',
        objectiveName,
        newScore,
      },
    });
  }

  /**
   * Get alignment matrix for a user
   */
  async getMatrix(userId: string): Promise<AlignmentMatrix[]> {
    const result = await db.execute(sql`
      SELECT * FROM value_alignment_matrix
      WHERE user_id = ${userId}
      ORDER BY weighting DESC, value_category
    `);

    return result.rows as unknown as AlignmentMatrix[];
  }
}

export const valueAlignmentService = new ValueAlignmentService();
