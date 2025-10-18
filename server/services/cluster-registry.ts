import { db } from "../db";
import {
  clusterNode,
  type InsertClusterNode,
  type ClusterNode,
  type NodeStatus,
  type NodeRole,
} from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import os from "os";

/**
 * Phase 17.0: ClusterRegistry
 * 
 * Manages cluster node registration, heartbeats, and capacity tracking
 */
export class ClusterRegistry {
  private localNodeId: string | null = null;
  private localNodeName: string;
  private readonly heartbeatInterval = 30000; // 30 seconds
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.localNodeName = process.env.NODE_NAME || `node-${os.hostname()}-${process.pid}`;
  }

  /**
   * Register this node in the cluster
   */
  async registerNode(
    role: NodeRole = "general",
    capacity: number = 100
  ): Promise<ClusterNode> {
    const existing = await db
      .select()
      .from(clusterNode)
      .where(eq(clusterNode.name, this.localNodeName))
      .limit(1);

    let node: ClusterNode;

    if (existing.length > 0) {
      // Update existing node
      const updated = await db
        .update(clusterNode)
        .set({
          status: "healthy",
          lastHeartbeat: new Date(),
          capacity,
          role,
          version: process.env.APP_VERSION || "1.0.0",
          updatedAt: new Date(),
        })
        .where(eq(clusterNode.id, existing[0].id))
        .returning();
      node = updated[0];
    } else {
      // Create new node
      const created = await db
        .insert(clusterNode)
        .values({
          name: this.localNodeName,
          role,
          capacity,
          status: "healthy",
          version: process.env.APP_VERSION || "1.0.0",
          currentLoad: 0,
          queueDepth: 0,
        })
        .returning();
      node = created[0];
    }

    this.localNodeId = node.id;
    return node;
  }

  /**
   * Update node heartbeat and metrics
   */
  async heartbeat(): Promise<void> {
    if (!this.localNodeId) {
      throw new Error("Node not registered");
    }

    const cpuUsage = this.getCpuUsage();
    const memoryUsage = this.getMemoryUsage();

    await db
      .update(clusterNode)
      .set({
        lastHeartbeat: new Date(),
        cpuUsage,
        memoryUsage,
        updatedAt: new Date(),
      })
      .where(eq(clusterNode.id, this.localNodeId));
  }

  /**
   * Update node load and queue depth
   */
  async updateLoad(currentLoad: number, queueDepth: number): Promise<void> {
    if (!this.localNodeId) {
      throw new Error("Node not registered");
    }

    await db
      .update(clusterNode)
      .set({
        currentLoad,
        queueDepth,
        updatedAt: new Date(),
      })
      .where(eq(clusterNode.id, this.localNodeId));
  }

  /**
   * Update node status
   */
  async updateStatus(status: NodeStatus): Promise<void> {
    if (!this.localNodeId) {
      throw new Error("Node not registered");
    }

    await db
      .update(clusterNode)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(clusterNode.id, this.localNodeId));
  }

  /**
   * Get all active nodes
   */
  async getActiveNodes(): Promise<ClusterNode[]> {
    return await db
      .select()
      .from(clusterNode)
      .where(
        and(
          sql`${clusterNode.status} IN ('healthy', 'degraded')`,
          sql`${clusterNode.lastHeartbeat} > NOW() - INTERVAL '5 minutes'`
        )
      )
      .orderBy(desc(clusterNode.lastHeartbeat));
  }

  /**
   * Get nodes by role
   */
  async getNodesByRole(role: NodeRole): Promise<ClusterNode[]> {
    return await db
      .select()
      .from(clusterNode)
      .where(
        and(
          eq(clusterNode.role, role),
          eq(clusterNode.status, "healthy"),
          sql`${clusterNode.lastHeartbeat} > NOW() - INTERVAL '5 minutes'`
        )
      )
      .orderBy(clusterNode.currentLoad);
  }

  /**
   * Get local node ID
   */
  getLocalNodeId(): string | null {
    return this.localNodeId;
  }

  /**
   * Start automatic heartbeats
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) {
      return; // Already running
    }

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.heartbeat();
      } catch (error) {
        console.error("[ClusterRegistry] Heartbeat error:", error);
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop automatic heartbeats
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Get CPU usage (simplified)
   */
  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return Math.max(0, Math.min(100, usage));
  }

  /**
   * Get memory usage percentage
   */
  private getMemoryUsage(): number {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usage = (usedMem / totalMem) * 100;

    return Math.max(0, Math.min(100, usage));
  }
}

// Singleton instance
export const clusterRegistry = new ClusterRegistry();
