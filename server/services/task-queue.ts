import { db } from "../db";
import { reasoningQueue, InsertReasoningQueue } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { performanceMonitor } from "./performance-monitor";

/**
 * Phase 8.8.3: Async Task Queue Service
 * PostgreSQL-backed queue with optimistic locking (FOR UPDATE SKIP LOCKED)
 * Manages reasoning tasks for DevOpsBob, FullStackBob, UXBob
 */

export interface ReasoningTask {
  id: string;
  traceId: string;
  taskType: string;
  payload: any;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: any;
  error?: string;
  retryCount?: number;
  lockedAt?: Date;
  lockedBy?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface EnqueueTaskInput {
  traceId: string;
  taskType: string;
  payload: any;
  domain?: string;
}

class TaskQueueService {
  private workerId: string;
  private concurrency: number;
  private running: boolean = false;

  constructor() {
    this.workerId = `worker-${nanoid(8)}`;
    this.concurrency = parseInt(process.env.TASK_QUEUE_CONCURRENCY || "5", 10);
    console.log(`[TaskQueue] Initialized worker: ${this.workerId}, concurrency: ${this.concurrency}`);
  }

  /**
   * Enqueue a new reasoning task
   */
  async enqueueTask(input: EnqueueTaskInput): Promise<string> {
    const taskId = nanoid();
    performanceMonitor.recordQueueEnqueue(); // Phase 12.1
    
    const task: InsertReasoningQueue = {
      id: taskId,
      traceId: input.traceId,
      taskType: input.taskType,
      payload: input.payload,
      status: "pending",
      retryCount: 0,
    };

    await db.insert(reasoningQueue).values(task);
    
    console.log(`[TaskQueue] ✅ Task enqueued: ${taskId} (type: ${input.taskType}, trace: ${input.traceId})`);
    
    // Broadcast queue event for Context Bridge
    this.broadcastQueueEvent({
      type: "task_enqueued",
      taskId,
      traceId: input.traceId,
      taskType: input.taskType,
      status: "pending",
    });

    return taskId;
  }

  /**
   * Fetch next available task for a specific domain (with optimistic locking)
   * Uses FOR UPDATE SKIP LOCKED within transaction to prevent race conditions
   * Phase 8.8.3 Fix: Enforces retry delay via retry_at timestamp
   */
  async fetchNextTask(domain?: string): Promise<ReasoningTask | null> {
    try {
      // Phase 8.8.3 Fix: Wrap fetch-and-lock in transaction to maintain row lock
      const task = await db.transaction(async (tx) => {
        // Use raw SQL for FOR UPDATE SKIP LOCKED
        // Phase 8.8.3: Add retry_at check to enforce exponential backoff delay
        const query = domain
          ? sql`
              SELECT * FROM reasoning_queue
              WHERE status = 'pending'
              AND (retry_at IS NULL OR retry_at <= NOW())
              AND task_type LIKE ${`%${domain}%`}
              ORDER BY created_at ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            `
          : sql`
              SELECT * FROM reasoning_queue
              WHERE status = 'pending'
              AND (retry_at IS NULL OR retry_at <= NOW())
              ORDER BY created_at ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            `;

        const result = await tx.execute(query);
        const rows = result.rows as any[];

        if (!rows || rows.length === 0) {
          return null;
        }

        const selectedTask = rows[0];

        // Mark as in_progress and lock (within same transaction)
        await tx.update(reasoningQueue)
          .set({
            status: "in_progress",
            lockedAt: new Date(),
            lockedBy: this.workerId,
          })
          .where(eq(reasoningQueue.id, selectedTask.id));

        return selectedTask;
      });

      if (!task) {
        return null;
      }

      console.log(`[TaskQueue] 🔒 Task locked: ${task.id} (worker: ${this.workerId})`);

      return {
        id: task.id,
        traceId: task.trace_id,
        taskType: task.task_type,
        payload: task.payload,
        status: "in_progress",
        result: task.result,
        error: task.error,
        retryCount: task.retry_count || 0,
        lockedAt: task.locked_at,
        lockedBy: this.workerId,
        createdAt: task.created_at,
        completedAt: task.completed_at,
      };
    } catch (error: any) {
      console.error("[TaskQueue] ❌ fetchNextTask error:", error.message);
      return null;
    }
  }

  /**
   * Mark task as completed
   */
  async markTaskComplete(id: string, result: any): Promise<void> {
    performanceMonitor.recordQueueDequeue(true); // Phase 12.1
    
    await db.update(reasoningQueue)
      .set({
        status: "completed",
        result,
        completedAt: new Date(),
      })
      .where(eq(reasoningQueue.id, id));

    const [task] = await db.select()
      .from(reasoningQueue)
      .where(eq(reasoningQueue.id, id))
      .limit(1);

    console.log(`[TaskQueue] ✅ Task completed: ${id}`);

    // Broadcast completion event
    if (task) {
      this.broadcastQueueEvent({
        type: "task_completed",
        taskId: id,
        traceId: task.traceId,
        taskType: task.taskType,
        status: "completed",
        result,
      });
    }
  }

  /**
   * Mark task as failed (with retry logic)
   * Phase 8.8.3 Fix: Sets retry_at timestamp to enforce exponential backoff delay
   */
  async markTaskFailed(id: string, error: string, retryCount: number = 0): Promise<void> {
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      performanceMonitor.recordQueueDequeue(false); // Phase 12.1 - permanent failure
    }

    if (retryCount < maxRetries) {
      // Phase 8.8.3+: Calculate retry_at with exponential backoff + jitter
      const baseBackoffMs = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      const jitterMs = Math.random() * 500; // 0-500ms random jitter
      const backoffMs = baseBackoffMs + jitterMs;
      const retryAt = new Date(Date.now() + backoffMs);
      
      await db.update(reasoningQueue)
        .set({
          status: "pending", // Reset to pending for retry
          retryCount: retryCount + 1,
          errorMessage: error,
          retryAt, // Phase 8.8.3 Fix: Set retry_at to enforce delay
          lockedAt: null,
          lockedBy: null,
        })
        .where(eq(reasoningQueue.id, id));

      console.log(`[TaskQueue] 🔄 Task retry scheduled: ${id} (attempt ${retryCount + 1}/${maxRetries}, backoff: ${backoffMs}ms, retry at: ${retryAt.toISOString()})`);
    } else {
      // Max retries exceeded, mark as permanently failed
      await db.update(reasoningQueue)
        .set({
          status: "failed",
          errorMessage: `Max retries (${maxRetries}) exceeded: ${error}`,
          completedAt: new Date(),
        })
        .where(eq(reasoningQueue.id, id));

      const [task] = await db.select()
        .from(reasoningQueue)
        .where(eq(reasoningQueue.id, id))
        .limit(1);

      console.error(`[TaskQueue] ❌ Task FAILED permanently: ${id} - ${error}`);

      // Broadcast failure alert
      if (task) {
        this.broadcastQueueEvent({
          type: "task_failed",
          taskId: id,
          traceId: task.traceId,
          taskType: task.taskType,
          status: "failed",
          error,
          retries: maxRetries,
        });

        // Log to memory_audit_log for forensic review
        await this.logFailureForForensics(task, error);
      }
    }
  }

  /**
   * Broadcast queue events to Context Bridge
   */
  private async broadcastQueueEvent(event: any): Promise<void> {
    try {
      const { contextBridge } = await import('./context-bridge');
      await contextBridge.broadcast({
        type: 'state_update',
        payload: { ...event, eventType: 'queue_event' },
        userId: event.userId || undefined,
      });
    } catch (error) {
      // Context Bridge may not be available, fail silently
      console.log("[TaskQueue] Context Bridge not available for broadcast");
    }
  }

  /**
   * Log permanent failures to memory_audit_log for forensics
   */
  private async logFailureForForensics(task: any, error: string): Promise<void> {
    try {
      const { memoryAuditLog } = await import("@shared/schema");
      
      await db.insert(memoryAuditLog).values({
        checksum: `task-failure-${task.id}`,
        status: "UNVERIFIED",
        traceId: task.traceId,
        userId: null,
        memorySnapshot: {
          taskId: task.id,
          taskType: task.taskType,
          payload: task.payload,
          error,
          timestamp: new Date().toISOString(),
        },
        repairDetails: {
          failureType: "task_queue_permanent_failure",
          retries: 3,
          recommendation: "Manual investigation required",
        },
      });

      console.log(`[TaskQueue] 📝 Failure logged to memory_audit_log for task: ${task.id}`);
    } catch (err) {
      console.error("[TaskQueue] Failed to log to memory_audit_log:", err);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    const [pending] = await db.select({ count: sql<number>`count(*)` })
      .from(reasoningQueue)
      .where(eq(reasoningQueue.status, "pending"));

    const [inProgress] = await db.select({ count: sql<number>`count(*)` })
      .from(reasoningQueue)
      .where(eq(reasoningQueue.status, "in_progress"));

    const [completed] = await db.select({ count: sql<number>`count(*)` })
      .from(reasoningQueue)
      .where(eq(reasoningQueue.status, "completed"));

    const [failed] = await db.select({ count: sql<number>`count(*)` })
      .from(reasoningQueue)
      .where(eq(reasoningQueue.status, "failed"));

    return {
      pending: Number(pending?.count || 0),
      inProgress: Number(inProgress?.count || 0),
      completed: Number(completed?.count || 0),
      failed: Number(failed?.count || 0),
      workerId: this.workerId,
      concurrency: this.concurrency,
    };
  }

  /**
   * Clean up old completed/failed tasks (older than 7 days)
   */
  async cleanupOldTasks(): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await db.delete(reasoningQueue)
      .where(
        and(
          sql`${reasoningQueue.status} IN ('completed', 'failed')`,
          sql`${reasoningQueue.completedAt} < ${sevenDaysAgo}`
        )
      );

    const deletedCount = result.rowCount || 0;
    console.log(`[TaskQueue] 🧹 Cleaned up ${deletedCount} old tasks`);

    return deletedCount;
  }
}

export const taskQueue = new TaskQueueService();
