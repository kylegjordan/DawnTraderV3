import { db } from "../db";
import {
  biasCorrectionLog,
  biasObservationLog,
  type BiasType,
  type InsertBiasCorrectionLog,
  learningWeightProfile,
  cognitiveCoreState,
} from "@shared/schema";
import { sql, desc, and } from "drizzle-orm";
import { eventBus } from "../lib/event-bus";

/**
 * Phase 15.0: BiasMitigation Service
 * 
 * Applies corrective interventions when biases are detected:
 * - Adjusts cognitive learning weights
 * - Modifies confidence thresholds
 * - Applies counter-bias strategies
 * - Tracks mitigation effectiveness
 */
export class BiasMitigation {
  private activeMitigations: Map<string, MitigationStrategy> = new Map();

  constructor() {
    // Listen for bias detection events
    eventBus.on("introspection_event", async (event: any) => {
      if (event.type === "bias_detected") {
        await this.handleBiasDetection(event);
      }
    });
  }

  /**
   * Handle bias detection event and apply mitigation
   */
  private async handleBiasDetection(event: {
    userId: string;
    biasType: BiasType;
    confidence: number;
    timestamp: string;
  }): Promise<void> {
    // Only mitigate if confidence is high enough
    if (event.confidence < 0.6) {
      return;
    }

    const strategy = this.selectMitigationStrategy(event.biasType, event.confidence);
    
    if (strategy) {
      await this.applyMitigation(event.userId, event.biasType, strategy);
    }
  }

  /**
   * Select appropriate mitigation strategy based on bias type
   */
  private selectMitigationStrategy(biasType: BiasType, confidence: number): MitigationStrategy | null {
    const strategies: Record<BiasType, MitigationStrategy> = {
      confirmation: {
        name: "evidence_balance",
        adjustments: {
          contraryEvidenceWeight: 1.5,
          supportingEvidenceWeight: 0.8,
          uncertaintyThreshold: 0.3,
        },
        description: "Increase weight for contrary evidence",
      },
      recency: {
        name: "temporal_smoothing",
        adjustments: {
          historicalDataWeight: 1.3,
          recentDataWeight: 0.7,
          timeDecayFactor: 0.9,
        },
        description: "Apply temporal smoothing to reduce recency bias",
      },
      anchoring: {
        name: "baseline_refresh",
        adjustments: {
          anchorDiscount: 0.6,
          dynamicBaselineWeight: 1.2,
        },
        description: "Refresh baseline values to reduce anchoring",
      },
      overconfidence: {
        name: "confidence_calibration",
        adjustments: {
          confidenceDiscount: 0.85,
          uncertaintyBoost: 1.15,
          minConfidenceThreshold: 0.7,
        },
        description: "Apply confidence calibration to reduce overconfidence",
      },
      availability: {
        name: "systematic_search",
        adjustments: {
          searchBreadth: 1.4,
          memorabilityDiscount: 0.7,
        },
        description: "Broaden search to counter availability bias",
      },
      optimism: {
        name: "risk_adjustment",
        adjustments: {
          riskWeighting: 1.3,
          pessimismBalance: 1.2,
          scenarioBalanceThreshold: 0.5,
        },
        description: "Increase risk awareness to counter optimism bias",
      },
    };

    return strategies[biasType] || null;
  }

  /**
   * Apply mitigation strategy
   */
  async applyMitigation(
    userId: string,
    biasType: BiasType,
    strategy: MitigationStrategy
  ): Promise<void> {
    // Record the correction
    const [correction] = await db.insert(biasCorrectionLog).values({
      userId,
      biasType,
      correctionStrategy: strategy.name,
      parameterAdjustments: strategy.adjustments,
      metadata: {
        description: strategy.description,
        appliedAt: new Date().toISOString(),
      },
    }).returning();

    // Apply to learning weight profile if exists
    await this.updateLearningWeights(userId, biasType, strategy.adjustments);

    // Store active mitigation
    this.activeMitigations.set(`${userId}:${biasType}`, strategy);

    // Emit mitigation event
    eventBus.emit("bias_mitigation_applied", {
      userId,
      biasType,
      strategy: strategy.name,
      timestamp: new Date().toISOString(),
    });

    console.log(`[BiasMitigation] Applied ${strategy.name} for ${biasType} bias (user: ${userId})`);
  }

  /**
   * Update learning weights in cognitive system
   */
  private async updateLearningWeights(
    userId: string,
    biasType: BiasType,
    adjustments: Record<string, number>
  ): Promise<void> {
    try {
      // Try to update existing learning weight profile
      const existing = await db
        .select()
        .from(learningWeightProfile)
        .where(sql`${learningWeightProfile.userId} = ${userId}`)
        .limit(1);

      if (existing.length > 0) {
        const currentWeights = existing[0].cognitiveWeights as Record<string, number>;
        const newWeights = { ...currentWeights, ...adjustments };

        await db
          .update(learningWeightProfile)
          .set({
            cognitiveWeights: newWeights,
            updatedAt: new Date(),
          })
          .where(sql`${learningWeightProfile.userId} = ${userId}`);
      }
    } catch (error) {
      console.error("[BiasMitigation] Failed to update learning weights:", error);
    }
  }

  /**
   * Force a bias mitigation cycle
   */
  async runMitigationCycle(userId: string): Promise<MitigationCycleResult> {
    const startTime = Date.now();
    let mitigationsApplied = 0;
    let errors: string[] = [];

    try {
      // Get recent bias observations
      const since = new Date(Date.now() - 8 * 60 * 60 * 1000); // Last 8 hours
      const biasEvents = await db
        .select()
        .from(biasObservationLog)
        .where(and(
          sql`user_id = ${userId}`,
          sql`created_at >= ${since}`
        ))
        .orderBy(desc(sql`created_at`));

      // Group by bias type and apply mitigations for high-confidence ones
      const biasByType: Map<BiasType, number> = new Map();
      
      for (const event of biasEvents as any[]) {
        const currentMax = biasByType.get(event.biasType) || 0;
        biasByType.set(event.biasType, Math.max(currentMax, event.confidenceScore));
      }

      // Apply mitigations for each detected bias type
      for (const [biasType, maxConfidence] of biasByType.entries()) {
        if (maxConfidence >= 0.6) {
          const strategy = this.selectMitigationStrategy(biasType, maxConfidence);
          if (strategy) {
            await this.applyMitigation(userId, biasType, strategy);
            mitigationsApplied++;
          }
        }
      }

      // Evaluate effectiveness of previous mitigations
      await this.evaluateMitigationEffectiveness(userId);

    } catch (error) {
      errors.push(String(error));
      console.error("[BiasMitigation] Error in mitigation cycle:", error);
    }

    const duration = Date.now() - startTime;

    return {
      success: errors.length === 0,
      mitigationsApplied,
      duration,
      errors,
    };
  }

  /**
   * Evaluate effectiveness of applied mitigations
   */
  private async evaluateMitigationEffectiveness(userId: string): Promise<void> {
    // Get corrections from last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const corrections = await db
      .select()
      .from(biasCorrectionLog)
      .where(and(
        sql`${biasCorrectionLog.userId} = ${userId}`,
        sql`${biasCorrectionLog.createdAt} >= ${since}`,
        sql`${biasCorrectionLog.effectivenessScore} IS NULL`
      ));

    // For each correction, check if bias recurred
    for (const correction of corrections) {
      const biasEventsAfter = await db
        .select()
        .from(biasObservationLog)
        .where(and(
          sql`user_id = ${userId}`,
          sql`bias_type = ${correction.biasType}`,
          sql`created_at > ${correction.createdAt}`
        ));

      // Calculate effectiveness (0-1, where 1 = no recurrence)
      const hoursElapsed = (Date.now() - correction.createdAt.getTime()) / (1000 * 60 * 60);
      const expectedRecurrenceRate = 0.1; // Expected 10% recurrence per hour
      const expectedRecurrences = Math.max(1, hoursElapsed * expectedRecurrenceRate);
      const actualRecurrences = biasEventsAfter.length;
      
      const effectiveness = Math.max(0, Math.min(1, 1 - (actualRecurrences / expectedRecurrences)));

      // Update correction log with effectiveness score
      await db
        .update(biasCorrectionLog)
        .set({ effectivenessScore: effectiveness })
        .where(sql`${biasCorrectionLog.id} = ${correction.id}`);
    }
  }

  /**
   * Get active mitigations for a user
   */
  getActiveMitigations(userId: string): MitigationStrategy[] {
    const active: MitigationStrategy[] = [];
    
    for (const [key, strategy] of this.activeMitigations.entries()) {
      if (key.startsWith(`${userId}:`)) {
        active.push(strategy);
      }
    }
    
    return active;
  }

  /**
   * Get recent corrections
   */
  async getRecentCorrections(userId: string, hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    return await db
      .select()
      .from(biasCorrectionLog)
      .where(and(
        sql`${biasCorrectionLog.userId} = ${userId}`,
        sql`${biasCorrectionLog.createdAt} >= ${since}`
      ))
      .orderBy(desc(biasCorrectionLog.createdAt));
  }

  /**
   * Clear all active mitigations for a user
   */
  clearMitigations(userId: string): void {
    for (const key of this.activeMitigations.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.activeMitigations.delete(key);
      }
    }
  }
}

interface MitigationStrategy {
  name: string;
  adjustments: Record<string, number>;
  description: string;
}

interface MitigationCycleResult {
  success: boolean;
  mitigationsApplied: number;
  duration: number;
  errors: string[];
}

// Singleton instance
export const biasMitigation = new BiasMitigation();
