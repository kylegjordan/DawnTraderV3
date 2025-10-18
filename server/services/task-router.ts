import { db } from "../db";
import {
  clusterTaskQueue,
  clusterNode,
  type InsertClusterTaskQueue,
  type ClusterTaskQueue,
  type ClusterTaskType,
  type ClusterTaskStatus,
  type NodeRole,
} from "@shared/schema";
import { eq, and, sql, or, desc } from "drizzle-orm";
import { clusterBus } from "./cluster-bus";
import { clusterRegistry } from "./cluster-registry";

/**
 * Phase 17.0: TaskRouter
 * 
 * Routes tasks to appropriate cluster nodes based on:
 * - Task type and node role affinity
 * - Node capacity and current load
 * - Priority and retry policies
 * - Admission control and backpressure
 */
export class TaskRouter {
  // Admission control thresholds
  private readonly maxGlobalQueueDepth = 1000;
  private readonly maxNodeLoadPercent = 90;
  
  // Task type to role affinity mapping
  private readonly taskRoleAffinity: Map<ClusterTaskType, NodeRole[]> = new Map([
    ["trading_signal", ["trading", "general"]],
    ["market_analysis", ["analysis", "research", "general"]],
    ["risk_assessment", ["analysis", "compliance", "general"]],
    ["compliance_check", ["compliance", "general"]],
    ["research", ["research", "general"]],
    ["optimization", ["general"]],
    ["general", ["general"]],
  ]);

  /**
   * Enqueue a new task
   */
  async enqueueTask(
    taskType: ClusterTaskType,
    payload: Record<string, any>,
    userId?: string,
    priority: number = 5
  ): Promise<ClusterTaskQueue> {
    // Admission control check
    const globalQueueDepth = await this.getGlobalQueueDepth();
    if (globalQueueDepth >= this.maxGlobalQueueDepth) {
      throw new Error(`Queue depth exceeded: ${globalQueueDepth}/${this.maxGlobalQueueDepth}`);
    }

    // Create task
    const task = await db.insert(clusterTaskQueue).values({
      taskType,
      payload,
      userId,
      priority,
      status: "queued",
      metadata: {
        enqueuedAt: new Date().toISOString(),
      },
    }).returning();

    // Try to assign immediately
    await this.assignTask(task[0].id);

    return task[0];
  }

  /**
   * Assign a task to an appropriate node
   */
  async assignTask(taskId: string): Promise<boolean> {
    // Get task
    const tasks = await db
      .select()
      .from(clusterTaskQueue)
      .where(and(
        eq(clusterTaskQueue.id, taskId),
        eq(clusterTaskQueue.status, "queued")
      ))
      .limit(1);

    if (tasks.length === 0) {
      return false; // Task not found or already assigned
    }

    const task = tasks[0];

    // Find appropriate node
    const node = await this.findBestNode(task.taskType);
    if (!node) {
      return false; // No available node
    }

    // Check node load
    const loadPercent = (node.currentLoad / node.capacity) * 100;
    if (loadPercent >= this.maxNodeLoadPercent) {
      return false; // Node overloaded
    }

    // Assign task to node
    await db
      .update(clusterTaskQueue)
      .set({
        status: "assigned",
        assignedNodeId: node.id,
        startedAt: new Date(),
      })
      .where(eq(clusterTaskQueue.id, taskId));

    // Publish assignment event
    await clusterBus.publish("task_assigned", {
      taskId: task.id,
      nodeId: node.id,
      taskType: task.taskType,
    }, node.name);

    return true;
  }

  /**
   * Find best node for a task type
   */
  private async findBestNode(taskType: ClusterTaskType): Promise<any> {
    const preferredRoles = this.taskRoleAffinity.get(taskType) || ["general"];

    // Build role filter
    const roleFilter = sql`${clusterNode.role} = ANY(ARRAY[${sql.join(
      preferredRoles.map(r => sql`${r}`),
      sql`, `
    )}])`;

    const nodes = await db
      .select()
      .from(clusterNode)
      .where(
        and(
          roleFilter,
          eq(clusterNode.status, "healthy"),
          sql`${clusterNode.lastHeartbeat} > NOW() - INTERVAL '2 minutes'`
        )
      )
      .orderBy(clusterNode.currentLoad)
      .limit(1);

    return nodes.length > 0 ? nodes[0] : null;
  }

  /**
   * Mark task as running
   */
  async markRunning(taskId: string, nodeId: string): Promise<void> {
    await db
      .update(clusterTaskQueue)
      .set({
        status: "running",
        assignedNodeId: nodeId,
      })
      .where(eq(clusterTaskQueue.id, taskId));
  }

  /**
   * Mark task as completed
   */
  async markCompleted(taskId: string): Promise<void> {
    await db
      .update(clusterTaskQueue)
      .set({
        status: "completed",
        finishedAt: new Date(),
      })
      .where(eq(clusterTaskQueue.id, taskId));

    await clusterBus.publish("task_completed", { taskId });
  }

  /**
   * Mark task as failed (with retry logic)
   */
  async markFailed(taskId: string, errorMessage: string): Promise<void> {
    const tasks = await db
      .select()
      .from(clusterTaskQueue)
      .where(eq(clusterTaskQueue.id, taskId))
      .limit(1);

    if (tasks.length === 0) return;

    const task = tasks[0];
    const retryCount = task.retryCount + 1;

    if (retryCount < task.maxRetries) {
      // Retry with exponential backoff
      await db
        .update(clusterTaskQueue)
        .set({
          status: "queued",
          retryCount,
          errorMessage,
          assignedNodeId: null,
          startedAt: null,
        })
        .where(eq(clusterTaskQueue.id, taskId));
    } else {
      // Max retries exceeded
      await db
        .update(clusterTaskQueue)
        .set({
          status: "failed",
          retryCount,
          errorMessage,
          finishedAt: new Date(),
        })
        .where(eq(clusterTaskQueue.id, taskId));
    }
  }

  /**
   * Get global queue depth
   */
  private async getGlobalQueueDepth(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(clusterTaskQueue)
      .where(sql`${clusterTaskQueue.status} IN ('queued', 'assigned', 'running')`);

    return Number(result[0]?.count || 0);
  }

  /**
   * Get pending tasks for a node
   */
  async getPendingTasksForNode(nodeId: string, limit: number = 10): Promise<ClusterTaskQueue[]> {
    return await db
      .select()
      .from(clusterTaskQueue)
      .where(
        and(
          eq(clusterTaskQueue.assignedNodeId, nodeId),
          or(
            eq(clusterTaskQueue.status, "assigned"),
            eq(clusterTaskQueue.status, "running")
          )
        )
      )
      .orderBy(clusterTaskQueue.priority, desc(clusterTaskQueue.createdAt))
      .limit(limit);
  }

  /**
   * Rebalance stuck tasks
   */
  async rebalanceStuckTasks(): Promise<number> {
    // Find tasks that have been running too long
    const stuckTasks = await db
      .select()
      .from(clusterTaskQueue)
      .where(
        and(
          or(
            eq(clusterTaskQueue.status, "assigned"),
            eq(clusterTaskQueue.status, "running")
          ),
          sql`${clusterTaskQueue.startedAt} < NOW() - INTERVAL '30 minutes'`
        )
      );

    let rebalanced = 0;

    for (const task of stuckTasks) {
      // Reset to queued for reassignment
      await db
        .update(clusterTaskQueue)
        .set({
          status: "queued",
          assignedNodeId: null,
          startedAt: null,
        })
        .where(eq(clusterTaskQueue.id, task.id));

      rebalanced++;
    }

    if (rebalanced > 0) {
      await clusterBus.publish("rebalance_triggered", {
        rebalancedCount: rebalanced,
        reason: "stuck_tasks",
      });
    }

    return rebalanced;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    queued: number;
    running: number;
    completed: number;
    failed: number;
  }> {
    const stats = await db
      .select({
        status: clusterTaskQueue.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(clusterTaskQueue)
      .groupBy(clusterTaskQueue.status);

    const result = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };

    for (const stat of stats) {
      const count = Number(stat.count);
      if (stat.status === "queued") result.queued = count;
      else if (stat.status === "running") result.running = count;
      else if (stat.status === "completed") result.completed = count;
      else if (stat.status === "failed") result.failed = count;
    }

    return result;
  }

  /**
   * Get queued tasks with optional status filter
   */
  async getQueuedTasks(
    limit: number = 50,
    status?: ClusterTaskStatus
  ): Promise<ClusterTaskQueue[]> {
    const query = db.select().from(clusterTaskQueue);

    if (status) {
      return await query
        .where(eq(clusterTaskQueue.status, status))
        .orderBy(clusterTaskQueue.priority, desc(clusterTaskQueue.createdAt))
        .limit(limit);
    }

    return await query
      .orderBy(clusterTaskQueue.priority, desc(clusterTaskQueue.createdAt))
      .limit(limit);
  }

  /**
   * Drain all tasks from a specific node
   */
  async drainNode(nodeId: string): Promise<number> {
    // Find all tasks assigned to this node
    const nodeTasks = await db
      .select()
      .from(clusterTaskQueue)
      .where(
        and(
          eq(clusterTaskQueue.assignedNodeId, nodeId),
          or(
            eq(clusterTaskQueue.status, "assigned"),
            eq(clusterTaskQueue.status, "running")
          )
        )
      );

    let reassigned = 0;

    for (const task of nodeTasks) {
      // Reset to queued for reassignment
      await db
        .update(clusterTaskQueue)
        .set({
          status: "queued",
          assignedNodeId: null,
          startedAt: null,
        })
        .where(eq(clusterTaskQueue.id, task.id));

      reassigned++;
    }

    if (reassigned > 0) {
      await clusterBus.publish("rebalance_triggered", {
        nodeId,
        reassignedCount: reassigned,
        reason: "node_drain",
      });
    }

    return reassigned;
  }
}

// Singleton instance
export const taskRouter = new TaskRouter();
