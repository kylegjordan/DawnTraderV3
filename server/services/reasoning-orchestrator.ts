import { nanoid } from 'nanoid';
import { db } from '../db';
import { reasoningTrace, reasoningQueue, dataLineage } from '@shared/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import type { InsertReasoningTrace, InsertReasoningQueue } from '@shared/schema';

// Type definitions
export interface ReasoningStep {
  action: string;
  target?: string;
  params?: Record<string, any>;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  duration?: number;
}

export interface ReasoningPlan {
  traceId: string;
  steps: ReasoningStep[];
  domainContext: string[];
  status: 'in_progress' | 'completed' | 'failed' | 'interrupted';
  metadata?: Record<string, any>;
}

export interface ReasoningRequest {
  userId: string;
  intentAction: string;
  userMessage: string;
  systemState: any;
  mode?: 'live' | 'paper';
}

class ReasoningOrchestrator {
  private workerId: string;
  private workerInterval: NodeJS.Timeout | null = null;
  private isWorkerRunning = false;

  constructor() {
    this.workerId = `worker_${nanoid(8)}`;
  }

  /**
   * Create a reasoning plan based on user intent and system state
   */
  async createPlan(request: ReasoningRequest): Promise<ReasoningPlan> {
    const traceId = `trace_${nanoid(12)}`;
    
    try {
      // Analyze the intent and determine reasoning steps
      const steps = this.buildReasoningSteps(request);
      const domainContext = this.inferDomainContext(request);

      // Create reasoning plan
      const plan: ReasoningPlan = {
        traceId,
        steps,
        domainContext,
        status: 'in_progress',
        metadata: {
          userId: request.userId,
          intentAction: request.intentAction,
          mode: request.mode || 'paper',
          createdAt: new Date().toISOString(),
        },
      };

      // Store trace in database
      await db.insert(reasoningTrace).values({
        traceId,
        userId: request.userId,
        intentAction: request.intentAction,
        steps: steps as any,
        domainContext,
        status: 'in_progress',
        metadata: plan.metadata as any,
      });

      // Log to data lineage for provenance
      await db.insert(dataLineage).values({
        traceId,
        originatingService: 'reasoning_orchestrator',
        targetService: 'walter',
        sourceTable: 'reasoning_trace',
        operation: 'write',
        metadata: {
          userId: request.userId,
          intentAction: request.intentAction,
          stepCount: steps.length,
        } as any,
      });

      console.log(`[ReasoningOrchestrator] Plan created: ${traceId} (${steps.length} steps, domains: ${domainContext.join(', ')})`);

      // Enqueue tasks for parallel execution
      for (const step of steps) {
        if (step.action === 'query_bob' || step.action.startsWith('fetch_')) {
          await this.enqueueTask(traceId, step);
        }
      }

      return plan;
    } catch (error) {
      console.error(`[ReasoningOrchestrator] Error creating plan:`, error);
      throw new Error(`E422_PLAN_BUILD_FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build reasoning steps based on intent analysis
   */
  private buildReasoningSteps(request: ReasoningRequest): ReasoningStep[] {
    const steps: ReasoningStep[] = [];
    const { userMessage, intentAction } = request;
    const lowerMessage = userMessage.toLowerCase();

    // Step 1: Always check trading status first
    steps.push({
      action: 'check_trading_status',
      target: 'trading_engine',
      params: { mode: request.mode || 'paper' },
      status: 'pending',
    });

    // Step 2: Detect domain-specific actions
    if (lowerMessage.includes('strategy') || lowerMessage.includes('enable') || lowerMessage.includes('disable')) {
      steps.push({
        action: 'fetch_strategies',
        target: 'strategy_engine',
        params: { mode: request.mode || 'paper' },
        status: 'pending',
      });
    }

    if (lowerMessage.includes('goal') || lowerMessage.includes('target') || lowerMessage.includes('profit')) {
      steps.push({
        action: 'retrieve_goals',
        target: 'goals_system',
        params: { mode: request.mode || 'paper' },
        status: 'pending',
      });
    }

    if (lowerMessage.includes('risk') || lowerMessage.includes('guardrail') || lowerMessage.includes('limit')) {
      steps.push({
        action: 'compare_guardrails',
        target: 'risk_manager',
        params: { mode: request.mode || 'paper' },
        status: 'pending',
      });
    }

    if (lowerMessage.includes('ui') || lowerMessage.includes('interface') || lowerMessage.includes('dark mode')) {
      steps.push({
        action: 'query_bob',
        target: 'ux_bob',
        params: { query: 'ui_status' },
        status: 'pending',
      });
    }

    if (lowerMessage.includes('performance') || lowerMessage.includes('optimize') || lowerMessage.includes('slow')) {
      steps.push({
        action: 'query_bob',
        target: 'fullstack_bob',
        params: { query: 'performance_analysis' },
        status: 'pending',
      });
    }

    if (lowerMessage.includes('system') || lowerMessage.includes('health') || lowerMessage.includes('deployment')) {
      steps.push({
        action: 'query_bob',
        target: 'devops_bob',
        params: { query: 'system_health' },
        status: 'pending',
      });
    }

    // Step N: Compose response (always last)
    steps.push({
      action: 'compose_response',
      target: 'llm',
      params: { intentAction },
      status: 'pending',
    });

    return steps;
  }

  /**
   * Infer domain context from request
   */
  private inferDomainContext(request: ReasoningRequest): string[] {
    const domains: Set<string> = new Set();
    const lowerMessage = request.userMessage.toLowerCase();

    if (lowerMessage.includes('strategy') || lowerMessage.includes('trade')) {
      domains.add('Trading');
    }

    if (lowerMessage.includes('ui') || lowerMessage.includes('interface')) {
      domains.add('UX');
    }

    if (lowerMessage.includes('performance') || lowerMessage.includes('api') || lowerMessage.includes('schema')) {
      domains.add('FullStack');
    }

    if (lowerMessage.includes('system') || lowerMessage.includes('deployment') || lowerMessage.includes('health')) {
      domains.add('DevOps');
    }

    if (lowerMessage.includes('goal') || lowerMessage.includes('risk')) {
      domains.add('Trading');
    }

    // Default to General if no specific domain detected
    if (domains.size === 0) {
      domains.add('General');
    }

    return Array.from(domains);
  }

  /**
   * Enqueue a task for async processing
   */
  async enqueueTask(traceId: string, step: ReasoningStep): Promise<void> {
    try {
      await db.insert(reasoningQueue).values({
        traceId,
        taskType: step.action,
        payload: {
          target: step.target,
          params: step.params,
        } as any,
        status: 'pending',
      });

      console.log(`[ReasoningOrchestrator] Task enqueued: ${step.action} (traceId: ${traceId})`);
    } catch (error) {
      console.error(`[ReasoningOrchestrator] Error enqueueing task:`, error);
      throw new Error(`E503_QUEUE_ENQUEUE_FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Log reasoning result after completion
   */
  async logResult(traceId: string, outcomeSummary: string, success: boolean = true): Promise<void> {
    try {
      const status = success ? 'completed' : 'failed';

      await db.update(reasoningTrace)
        .set({
          decisionSummary: outcomeSummary,
          status,
          updatedAt: new Date(),
        })
        .where(eq(reasoningTrace.traceId, traceId));

      // Log to data lineage
      await db.insert(dataLineage).values({
        traceId,
        originatingService: 'reasoning_orchestrator',
        targetService: 'walter',
        sourceTable: 'reasoning_trace',
        operation: 'write',
        metadata: {
          status,
          summary: outcomeSummary.substring(0, 200),
        } as any,
      });

      console.log(`[ReasoningOrchestrator] Result logged: ${traceId} (${status})`);
    } catch (error) {
      console.error(`[ReasoningOrchestrator] Error logging result:`, error);
      // Don't throw - this is best effort logging
    }
  }

  /**
   * Worker loop to process queued tasks
   * Uses PostgreSQL row locking (FOR UPDATE SKIP LOCKED) for safe concurrency
   */
  async processQueue(): Promise<void> {
    if (this.isWorkerRunning) return;
    this.isWorkerRunning = true;

    try {
      // Fetch pending tasks using row-level locking
      const tasks = await db
        .select()
        .from(reasoningQueue)
        .where(eq(reasoningQueue.status, 'pending'))
        .limit(10)
        .for('update', { skipLocked: true });

      for (const task of tasks) {
        try {
          // Lock the task
          await db.update(reasoningQueue)
            .set({
              status: 'in_progress',
              lockedAt: new Date(),
              lockedBy: this.workerId,
            })
            .where(eq(reasoningQueue.id, task.id));

          // Execute the task
          const result = await this.executeTask(task);

          // Mark as completed
          await db.update(reasoningQueue)
            .set({
              status: 'completed',
              result: result as any,
              completedAt: new Date(),
            })
            .where(eq(reasoningQueue.id, task.id));

          console.log(`[ReasoningOrchestrator] Task completed: ${task.taskType} (${task.id})`);
        } catch (error) {
          console.error(`[ReasoningOrchestrator] Task failed: ${task.taskType}`, error);

          // Mark as failed
          await db.update(reasoningQueue)
            .set({
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              completedAt: new Date(),
            })
            .where(eq(reasoningQueue.id, task.id));
        }
      }
    } catch (error) {
      console.error(`[ReasoningOrchestrator] Queue processing error:`, error);
    } finally {
      this.isWorkerRunning = false;
    }
  }

  /**
   * Execute a specific task
   */
  private async executeTask(task: any): Promise<any> {
    const { taskType, payload } = task;

    // TODO: Integrate with Domain Bobs based on taskType
    // For now, return mock data
    switch (taskType) {
      case 'query_bob':
        return { status: 'ok', data: 'Bob query result' };
      case 'fetch_strategies':
        return { status: 'ok', strategies: [] };
      case 'retrieve_goals':
        return { status: 'ok', goals: [] };
      case 'compare_guardrails':
        return { status: 'ok', guardrails: {} };
      default:
        return { status: 'ok', message: 'Task executed' };
    }
  }

  /**
   * Start the worker loop
   */
  startWorker(intervalMs: number = 2000): void {
    if (this.workerInterval) {
      console.log('[ReasoningOrchestrator] Worker already running');
      return;
    }

    this.workerInterval = setInterval(() => {
      this.processQueue().catch(error => {
        console.error('[ReasoningOrchestrator] Worker error:', error);
      });
    }, intervalMs);

    console.log(`[ReasoningOrchestrator] Worker started (interval: ${intervalMs}ms, worker: ${this.workerId})`);
  }

  /**
   * Stop the worker loop
   */
  stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.log('[ReasoningOrchestrator] Worker stopped');
    }
  }

  /**
   * Get reasoning trace by traceId
   */
  async getTrace(traceId: string): Promise<any> {
    try {
      const trace = await db
        .select()
        .from(reasoningTrace)
        .where(eq(reasoningTrace.traceId, traceId))
        .limit(1);

      if (trace.length === 0) {
        return null;
      }

      // Get associated queue tasks
      const tasks = await db
        .select()
        .from(reasoningQueue)
        .where(eq(reasoningQueue.traceId, traceId));

      return {
        ...trace[0],
        queueTasks: tasks,
      };
    } catch (error) {
      console.error(`[ReasoningOrchestrator] Error fetching trace:`, error);
      throw error;
    }
  }

  /**
   * Clean up interrupted traces (e.g., on system restart)
   */
  async cleanupInterruptedTraces(): Promise<void> {
    try {
      const result = await db
        .update(reasoningTrace)
        .set({
          status: 'interrupted',
          updatedAt: new Date(),
        })
        .where(eq(reasoningTrace.status, 'in_progress'));

      console.log(`[ReasoningOrchestrator] Cleaned up interrupted traces`);
    } catch (error) {
      console.error(`[ReasoningOrchestrator] Error cleaning up traces:`, error);
    }
  }
}

// Export singleton instance
export const reasoningOrchestrator = new ReasoningOrchestrator();

// Start worker on module load (can be disabled for testing)
if (process.env.NODE_ENV !== 'test') {
  reasoningOrchestrator.startWorker(2000); // 2-second interval
}
