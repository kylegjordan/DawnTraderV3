import { db } from "../db";
import {
  agentLearningDelta,
  type InsertAgentLearningDelta,
  type AgentLearningDelta,
  type LearningDeltaType,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { clusterBus } from "./cluster-bus";
import { learningGateValidator } from "./learning-gate-validator";
import { createHash } from "crypto";
import { nanoid } from "nanoid";

/**
 * Phase 18.0: Learning Coordinator
 * 
 * Validates, scores, and routes learning deltas across cluster nodes.
 * - Subscribes to learning_delta events from cluster bus
 * - Calculates trust, recency, and overall scores
 * - Accepts high-scoring deltas and fans out model_sync events
 */
export class LearningCoordinator {
  private static instance: LearningCoordinator;
  private readonly scoreThreshold: number = 0.75; // Accept deltas with score >= 0.75
  private readonly trustWeight: number = 0.4;
  private readonly recencyWeight: number = 0.3;
  private readonly successRateWeight: number = 0.3;

  private constructor() {
    this.initializeSubscriptions();
    console.log("[LearningCoordinator] ✅ Initialized");
  }

  static getInstance(): LearningCoordinator {
    if (!LearningCoordinator.instance) {
      LearningCoordinator.instance = new LearningCoordinator();
    }
    return LearningCoordinator.instance;
  }

  /**
   * Subscribe to learning_delta events from cluster bus
   */
  private initializeSubscriptions(): void {
    clusterBus.subscribe("learning_delta", async (payload: Record<string, any>, sourceNode?: string) => {
      await this.handleLearningDelta(payload, sourceNode);
    });
  }

  /**
   * Process incoming learning delta
   */
  private async handleLearningDelta(payload: Record<string, any>, sourceNode?: string): Promise<void> {
    try {
      const traceId = payload.traceId || nanoid();
      console.log(`[LearningCoordinator] 📥 Received learning delta (trace: ${traceId}, node: ${sourceNode})`);

      // Validate required fields
      if (!this.validatePayload(payload)) {
        console.error("[LearningCoordinator] ❌ Invalid payload structure");
        return;
      }

      // Calculate payload hash for deduplication
      const payloadHash = this.calculateHash(payload.data);

      // Check if this delta already exists
      const existing = await db
        .select()
        .from(agentLearningDelta)
        .where(and(
          eq(agentLearningDelta.payloadHash, payloadHash),
          eq(agentLearningDelta.originNodeId, sourceNode || "unknown")
        ))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[LearningCoordinator] ⏭️  Duplicate delta detected (hash: ${payloadHash})`);
        return;
      }

      // Score the learning delta
      const scores = await this.scoreDelta(sourceNode || "unknown", payload.deltaType);

      // Phase 18.7: Validate through ethical gate chain
      const gateValidation = await learningGateValidator.validate({
        actionType: "accept_delta",
        deltaType: payload.deltaType as LearningDeltaType,
        sourceNode: sourceNode || "unknown",
        payload: { ...payload, overallScore: scores.overall },
        traceId,
      });

      if (!gateValidation.allowed) {
        console.log(
          `[LearningCoordinator] 🚫 Delta blocked by gates: ${gateValidation.overallReason}`
        );
        // Still persist but mark as rejected
        scores.overall = 0; // Force rejection
      }

      // Persist the delta
      const [delta] = await db
        .insert(agentLearningDelta)
        .values({
          originNodeId: sourceNode || "unknown",
          deltaType: payload.deltaType as LearningDeltaType,
          payload: payload.data,
          payloadHash,
          traceId,
          trustScore: scores.trust,
          recencyScore: scores.recency,
          successRate: scores.successRate,
          overallScore: scores.overall,
          isAccepted: scores.overall >= this.scoreThreshold,
          acceptedBy: scores.overall >= this.scoreThreshold ? "learning_coordinator" : null,
          acceptedAt: scores.overall >= this.scoreThreshold ? new Date() : null,
          metadata: {
            sourceNode,
            receivedAt: new Date().toISOString(),
          },
        })
        .returning();

      console.log(
        `[LearningCoordinator] ${delta.isAccepted ? "✅ Accepted" : "❌ Rejected"} delta (score: ${scores.overall.toFixed(2)})`
      );

      // If accepted, fan out model_sync event
      if (delta.isAccepted) {
        await this.fanOutModelSync(delta, traceId);
      }
    } catch (error) {
      console.error("[LearningCoordinator] Error handling learning delta:", error);
    }
  }

  /**
   * Validate learning delta payload
   */
  private validatePayload(payload: Record<string, any>): boolean {
    return !!(
      payload.deltaType &&
      payload.data &&
      typeof payload.data === "object"
    );
  }

  /**
   * Calculate hash of payload for deduplication
   */
  private calculateHash(data: any): string {
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    return createHash("sha256").update(jsonString).digest("hex");
  }

  /**
   * Score a learning delta based on trust, recency, and success rate
   */
  private async scoreDelta(
    originNodeId: string,
    deltaType: string
  ): Promise<{ trust: number; recency: number; successRate: number; overall: number }> {
    // Get historical performance for this node
    const history = await db
      .select()
      .from(agentLearningDelta)
      .where(eq(agentLearningDelta.originNodeId, originNodeId))
      .orderBy(desc(agentLearningDelta.createdAt))
      .limit(10);

    // Trust score: based on acceptance rate of previous deltas
    let trustScore = 0.5; // Default neutral trust
    if (history.length > 0) {
      const acceptedCount = history.filter(d => d.isAccepted).length;
      trustScore = acceptedCount / history.length;
    }

    // Recency score: always 1.0 for new deltas
    const recencyScore = 1.0;

    // Success rate: similar to trust but weighted by delta type
    let successRate = 0.5; // Default
    const typeHistory = history.filter(d => d.deltaType === deltaType);
    if (typeHistory.length > 0) {
      const typeAccepted = typeHistory.filter(d => d.isAccepted).length;
      successRate = typeAccepted / typeHistory.length;
    }

    // Calculate overall weighted score
    const overallScore =
      trustScore * this.trustWeight +
      recencyScore * this.recencyWeight +
      successRate * this.successRateWeight;

    return {
      trust: trustScore,
      recency: recencyScore,
      successRate,
      overall: overallScore,
    };
  }

  /**
   * Fan out model_sync event to notify other nodes of accepted delta
   */
  private async fanOutModelSync(delta: AgentLearningDelta, traceId: string): Promise<void> {
    console.log(`[LearningCoordinator] 📡 Fanning out model_sync event (trace: ${traceId})`);

    await clusterBus.publish(
      "model_sync",
      {
        deltaId: delta.id,
        deltaType: delta.deltaType,
        originNode: delta.originNodeId,
        payload: delta.payload,
        overallScore: delta.overallScore,
        traceId,
      },
      "learning_coordinator"
    );
  }

  /**
   * Get recent learning deltas with optional filters
   */
  async getRecentDeltas(
    limit: number = 20,
    onlyAccepted?: boolean
  ): Promise<AgentLearningDelta[]> {
    let query = db.select().from(agentLearningDelta);

    if (onlyAccepted !== undefined) {
      query = query.where(eq(agentLearningDelta.isAccepted, onlyAccepted)) as any;
    }

    return await query.orderBy(desc(agentLearningDelta.createdAt)).limit(limit);
  }

  /**
   * Get delta statistics
   */
  async getStatistics(): Promise<{
    totalDeltas: number;
    acceptedDeltas: number;
    rejectedDeltas: number;
    averageScore: number;
  }> {
    const result = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        accepted: sql<number>`COUNT(*) FILTER (WHERE ${agentLearningDelta.isAccepted} = true)::int`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE ${agentLearningDelta.isAccepted} = false)::int`,
        avgScore: sql<number>`COALESCE(AVG(${agentLearningDelta.overallScore}), 0)`,
      })
      .from(agentLearningDelta);

    return {
      totalDeltas: result[0]?.total || 0,
      acceptedDeltas: result[0]?.accepted || 0,
      rejectedDeltas: result[0]?.rejected || 0,
      averageScore: result[0]?.avgScore || 0,
    };
  }
}

// Export singleton instance
export const learningCoordinator = LearningCoordinator.getInstance();
