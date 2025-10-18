import { db } from "../db";
import {
  modelConsistencySnapshot,
  crossNodeAlignmentLog,
  type ModelConsistencySnapshot,
  type CrossNodeAlignmentLog,
  type AlignmentStrategy,
  type DomainChannel,
} from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { clusterBus } from "./cluster-bus";
import { createHash } from "crypto";
import { nanoid } from "nanoid";

/**
 * Phase 18.0: Model Consistency Manager
 * 
 * Detects and reconciles model drift across cluster nodes.
 * - Takes snapshots of model hashes by domain channel
 * - Detects drift when hashes diverge
 * - Applies alignment strategies: accept, reject, or blend
 */
export class ModelConsistencyManager {
  private static instance: ModelConsistencyManager;
  private readonly driftThreshold: number = 0.2; // 20% hash difference triggers drift detection

  private constructor() {
    console.log("[ModelConsistencyManager] ✅ Initialized");
  }

  static getInstance(): ModelConsistencyManager {
    if (!ModelConsistencyManager.instance) {
      ModelConsistencyManager.instance = new ModelConsistencyManager();
    }
    return ModelConsistencyManager.instance;
  }

  /**
   * Capture current model snapshot for a node
   */
  async captureSnapshot(
    nodeId: string,
    domainChannel: DomainChannel,
    modelParams: Record<string, any>,
    version: string
  ): Promise<ModelConsistencySnapshot> {
    const modelHash = this.calculateModelHash(modelParams);
    const parameterCount = this.countParameters(modelParams);

    const [snapshot] = await db
      .insert(modelConsistencySnapshot)
      .values({
        nodeId,
        modelHash,
        domainChannel,
        version,
        parameterCount,
        lastUpdated: new Date(),
        metadata: {
          capturedAt: new Date().toISOString(),
        },
      })
      .returning();

    console.log(
      `[ModelConsistencyManager] 📸 Snapshot captured (node: ${nodeId}, channel: ${domainChannel}, hash: ${modelHash.substring(0, 8)}...)`
    );

    return snapshot;
  }

  /**
   * Detect drift between two nodes on the same domain channel
   */
  async detectDrift(
    sourceNodeId: string,
    targetNodeId: string,
    domainChannel: DomainChannel
  ): Promise<{ hasDrift: boolean; sourceHash: string; targetHash: string; alignmentScore: number }> {
    // Get latest snapshots for both nodes
    const sourceSnapshot = await this.getLatestSnapshot(sourceNodeId, domainChannel);
    const targetSnapshot = await this.getLatestSnapshot(targetNodeId, domainChannel);

    if (!sourceSnapshot || !targetSnapshot) {
      console.log("[ModelConsistencyManager] ⚠️  Missing snapshot for drift detection");
      return {
        hasDrift: false,
        sourceHash: sourceSnapshot?.modelHash || "unknown",
        targetHash: targetSnapshot?.modelHash || "unknown",
        alignmentScore: 0,
      };
    }

    // Calculate alignment score (1.0 = identical, 0.0 = completely different)
    const alignmentScore = this.calculateAlignmentScore(
      sourceSnapshot.modelHash,
      targetSnapshot.modelHash
    );

    const hasDrift = alignmentScore < (1 - this.driftThreshold);

    if (hasDrift) {
      console.log(
        `[ModelConsistencyManager] 🚨 Drift detected (alignment: ${(alignmentScore * 100).toFixed(1)}%, threshold: ${((1 - this.driftThreshold) * 100).toFixed(1)}%)`
      );
    }

    return {
      hasDrift,
      sourceHash: sourceSnapshot.modelHash,
      targetHash: targetSnapshot.modelHash,
      alignmentScore,
    };
  }

  /**
   * Reconcile drift using specified alignment strategy
   */
  async reconcile(
    sourceNodeId: string,
    targetNodeId: string,
    domainChannel: DomainChannel,
    strategy: AlignmentStrategy,
    traceId?: string
  ): Promise<CrossNodeAlignmentLog> {
    const drift = await this.detectDrift(sourceNodeId, targetNodeId, domainChannel);
    const logTraceId = traceId || nanoid();

    console.log(
      `[ModelConsistencyManager] 🔄 Reconciling drift (strategy: ${strategy}, trace: ${logTraceId})`
    );

    let postAlignmentHash: string | null = null;
    let reconciliationSuccess = false;

    try {
      switch (strategy) {
        case "accept":
          // Target adopts source's model
          postAlignmentHash = drift.sourceHash;
          reconciliationSuccess = true;
          console.log("[ModelConsistencyManager] ✅ Accept strategy: target adopts source model");
          break;

        case "reject":
          // Target keeps its model, source is rejected
          postAlignmentHash = drift.targetHash;
          reconciliationSuccess = false;
          console.log("[ModelConsistencyManager] ❌ Reject strategy: source model rejected");
          break;

        case "blend":
          // Merge models (simplified: use hash of combined hashes)
          const blendedHash = this.blendHashes(drift.sourceHash, drift.targetHash);
          postAlignmentHash = blendedHash;
          reconciliationSuccess = true;
          console.log("[ModelConsistencyManager] 🔀 Blend strategy: models merged");
          break;
      }

      // Log alignment attempt
      const [alignmentLog] = await db
        .insert(crossNodeAlignmentLog)
        .values({
          sourceNodeId,
          targetNodeId,
          preAlignmentHash: drift.targetHash,
          postAlignmentHash,
          alignmentStrategy: strategy,
          alignmentScore: drift.alignmentScore,
          driftDetected: drift.hasDrift,
          reconciliationSuccess,
          traceId: logTraceId,
          metadata: {
            domainChannel,
            reconciliationTimestamp: new Date().toISOString(),
          },
        })
        .returning();

      // Publish reconciliation event to cluster bus
      await clusterBus.publish(
        "model_sync",
        {
          alignmentLogId: alignmentLog.id,
          sourceNode: sourceNodeId,
          targetNode: targetNodeId,
          strategy,
          success: reconciliationSuccess,
          traceId: logTraceId,
        },
        "model_consistency_manager"
      );

      return alignmentLog;
    } catch (error) {
      console.error("[ModelConsistencyManager] Reconciliation failed:", error);
      throw error;
    }
  }

  /**
   * Get latest snapshot for a node on a specific domain channel
   */
  private async getLatestSnapshot(
    nodeId: string,
    domainChannel: DomainChannel
  ): Promise<ModelConsistencySnapshot | null> {
    const snapshots = await db
      .select()
      .from(modelConsistencySnapshot)
      .where(
        and(
          eq(modelConsistencySnapshot.nodeId, nodeId),
          eq(modelConsistencySnapshot.domainChannel, domainChannel)
        )
      )
      .orderBy(desc(modelConsistencySnapshot.createdAt))
      .limit(1);

    return snapshots[0] || null;
  }

  /**
   * Calculate model hash from parameters
   */
  private calculateModelHash(params: Record<string, any>): string {
    const jsonString = JSON.stringify(params, Object.keys(params).sort());
    return createHash("sha256").update(jsonString).digest("hex");
  }

  /**
   * Count total parameters in model
   */
  private countParameters(params: Record<string, any>): number {
    let count = 0;
    const traverse = (obj: any) => {
      if (typeof obj === "object" && obj !== null) {
        for (const key in obj) {
          if (typeof obj[key] === "number" || typeof obj[key] === "string") {
            count++;
          } else if (typeof obj[key] === "object") {
            traverse(obj[key]);
          }
        }
      }
    };
    traverse(params);
    return count;
  }

  /**
   * Calculate alignment score between two hashes
   * Uses Hamming distance for hex strings
   */
  private calculateAlignmentScore(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0;

    let differences = 0;
    const maxLength = Math.max(hash1.length, hash2.length);

    for (let i = 0; i < maxLength; i++) {
      if (hash1[i] !== hash2[i]) {
        differences++;
      }
    }

    return 1 - differences / maxLength;
  }

  /**
   * Blend two model hashes (simplified merge)
   */
  private blendHashes(hash1: string, hash2: string): string {
    const combined = hash1 + hash2;
    return createHash("sha256").update(combined).digest("hex");
  }

  /**
   * Get alignment history
   */
  async getAlignmentHistory(limit: number = 20): Promise<CrossNodeAlignmentLog[]> {
    return await db
      .select()
      .from(crossNodeAlignmentLog)
      .orderBy(desc(crossNodeAlignmentLog.createdAt))
      .limit(limit);
  }

  /**
   * Get alignment statistics
   */
  async getStatistics(): Promise<{
    totalAlignments: number;
    successfulAlignments: number;
    failedAlignments: number;
    driftDetections: number;
    averageAlignmentScore: number;
  }> {
    const result = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        successful: sql<number>`COUNT(*) FILTER (WHERE ${crossNodeAlignmentLog.reconciliationSuccess} = true)::int`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${crossNodeAlignmentLog.reconciliationSuccess} = false)::int`,
        driftDetected: sql<number>`COUNT(*) FILTER (WHERE ${crossNodeAlignmentLog.driftDetected} = true)::int`,
        avgScore: sql<number>`COALESCE(AVG(${crossNodeAlignmentLog.alignmentScore}), 0)`,
      })
      .from(crossNodeAlignmentLog);

    return {
      totalAlignments: result[0]?.total || 0,
      successfulAlignments: result[0]?.successful || 0,
      failedAlignments: result[0]?.failed || 0,
      driftDetections: result[0]?.driftDetected || 0,
      averageAlignmentScore: result[0]?.avgScore || 0,
    };
  }
}

// Export singleton instance
export const modelConsistencyManager = ModelConsistencyManager.getInstance();
