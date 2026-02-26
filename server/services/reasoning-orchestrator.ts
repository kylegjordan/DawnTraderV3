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

type DomainHandler = (task: any) => Promise<any>;

class ReasoningOrchestrator {
  private workerId: string;
  private workerInterval: NodeJS.Timeout | null = null;
  private isWorkerRunning = false;
  private domainHandlers: Map<string, DomainHandler> = new Map(); // Phase 8.8.3: Domain registration
  private queueIterations = 0; // Phase 8.8.3+: Track iterations for logging
  
  // Phase 8.8.3+: Queue performance metrics
  private metrics = {
    latencyByDomain: new Map<string, number[]>(), // Track latency per domain
    totalRetries: 0,
    totalCompleted: 0,
    totalFailed: 0,
  };

  constructor() {
    this.workerId = `worker_${nanoid(8)}`;
    // Directive 12.2.3 Batch 7B-hotfix: Bob domain auto-registration removed (specialist Bobs deleted in Batch 7A)
    console.log('[ReasoningOrchestrator] No default domains registered (Bob domains removed — Directive 12.2.3)');
  }

  /**
   * Phase 8.8.3: Register domain-specific handlers
   */
  registerDomain(domain: string, handler: DomainHandler): void {
    this.domainHandlers.set(domain.toLowerCase(), handler);
    console.log(`[ReasoningOrchestrator] Domain registered: ${domain}`);
  }

  /**
   * Phase 8.8.3: Aggregate findings from multiple domain tasks
   */
  async aggregateFindings(traceId: string, domainResults: Array<{domain: string, result: any}>): Promise<any> {
    const aggregated = {
      traceId,
      timestamp: new Date().toISOString(),
      domains: domainResults.map(dr => dr.domain),
      findings: domainResults,
      summary: '',
      confidence: 0,
      provenance: {
        sources: domainResults.map(dr => ({
          domain: dr.domain,
          confidence: dr.result?.confidence || 0.5,
        })),
      },
    };

    // Calculate aggregate confidence (weighted average)
    const totalConfidence = domainResults.reduce((sum, dr) => 
      sum + (dr.result?.confidence || 0.5), 0
    );
    aggregated.confidence = domainResults.length > 0 
      ? totalConfidence / domainResults.length 
      : 0;

    // Generate summary
    const summaries = domainResults
      .map(dr => `${dr.domain}: ${dr.result?.summary || 'No summary'}`)
      .join('; ');
    aggregated.summary = `Multi-domain analysis (${domainResults.length} domains): ${summaries}`;

    console.log(`[ReasoningOrchestrator] Aggregated ${domainResults.length} domain results (confidence: ${aggregated.confidence.toFixed(2)})`);

    return aggregated;
  }

  /**
   * Phase 8.8.3: Process task through registered domain handler
   */
  async processTask(task: any): Promise<any> {
    const domain = this.extractDomainFromTaskType(task.taskType);
    const handler = this.domainHandlers.get(domain.toLowerCase());

    if (handler) {
      console.log(`[ReasoningOrchestrator] Processing task ${task.id} via ${domain} handler`);
      return await handler(task);
    } else {
      console.log(`[ReasoningOrchestrator] No handler for domain ${domain}, using default execution`);
      return await this.executeTask(task);
    }
  }

  /**
   * Extract domain from task type (e.g., 'query_bob_devops' -> 'devops')
   */
  private extractDomainFromTaskType(taskType: string): string {
    if (taskType.includes('devops')) return 'devops';
    if (taskType.includes('fullstack')) return 'fullstack';
    if (taskType.includes('ux')) return 'ux';
    return 'general';
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
        action: 'evaluate_risk',
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

    // Trading domain keywords - expanded coverage for market-related scenarios
    if (lowerMessage.includes('strategy') || 
        lowerMessage.includes('trade') || 
        lowerMessage.includes('trading') ||
        lowerMessage.includes('market') || 
        lowerMessage.includes('sentiment') || 
        lowerMessage.includes('bullish') || 
        lowerMessage.includes('bearish') ||
        lowerMessage.includes('portfolio') ||
        lowerMessage.includes('risk')) {
      domains.add('trading');
    }

    if (lowerMessage.includes('ui') || lowerMessage.includes('interface')) {
      domains.add('ux');
    }

    if (lowerMessage.includes('performance') || lowerMessage.includes('api') || lowerMessage.includes('schema')) {
      domains.add('fullstack');
    }

    if (lowerMessage.includes('system') || lowerMessage.includes('deployment') || lowerMessage.includes('health')) {
      domains.add('devops');
    }

    if (lowerMessage.includes('goal') || lowerMessage.includes('risk')) {
      domains.add('trading');
    }

    // Default to General if no specific domain detected
    if (domains.size === 0) {
      domains.add('general');
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
        const domain = this.extractDomainFromTaskType(task.taskType);
        const startTime = Date.now();
        
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
          
          // Calculate duration
          const duration = Date.now() - startTime;

          // Mark as completed
          await db.update(reasoningQueue)
            .set({
              status: 'completed',
              result: result as any,
              completedAt: new Date(),
            })
            .where(eq(reasoningQueue.id, task.id));

          // Track metrics
          this.metrics.totalCompleted++;
          if (!this.metrics.latencyByDomain.has(domain)) {
            this.metrics.latencyByDomain.set(domain, []);
          }
          this.metrics.latencyByDomain.get(domain)!.push(duration);
          
          // Track retries
          if (task.retryCount && task.retryCount > 0) {
            this.metrics.totalRetries += task.retryCount;
          }

          console.log(`[ReasoningOrchestrator] ✅ Task completed: ${task.taskType} (${task.id}) | Domain: ${domain} | Duration: ${duration}ms | Retries: ${task.retryCount || 0}`);
        } catch (error) {
          const duration = Date.now() - startTime;
          console.error(`[ReasoningOrchestrator] ❌ Task failed: ${task.taskType} (${task.id}) | Domain: ${domain} | Duration: ${duration}ms`, error);

          // Mark as failed
          await db.update(reasoningQueue)
            .set({
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              completedAt: new Date(),
            })
            .where(eq(reasoningQueue.id, task.id));
          
          this.metrics.totalFailed++;
        }
      }
      
      // Log summarized queue metrics every 10 iterations
      this.queueIterations++;
      if (this.queueIterations % 10 === 0) {
        this.logQueueMetrics();
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

    try {
      switch (taskType) {
        case 'query_bob': {
          // Directive 12.2.3 Batch 7B-hotfix: Specialist Bobs removed (deleted in Batch 7A)
          const target = payload.target;
          return { status: 'ok', message: `Bob domain '${target}' removed (Directive 12.2.3)`, findings: [] };
        }
        
        case 'fetch_strategies': {
          // Fetch strategy settings from database
          const { strategySettings } = await import('@shared/schema');
          const mode = payload.params?.mode || 'paper';
          const strategies = await db.select().from(strategySettings).where(eq(strategySettings.mode, mode));
          return { status: 'ok', strategies };
        }
        
        case 'retrieve_goals': {
          // Fetch user goals from database
          const { userGoalsLive, userGoalsPaper } = await import('@shared/schema');
          const mode = payload.params?.mode || 'paper';
          const goalsTable = mode === 'live' ? userGoalsLive : userGoalsPaper;
          const goals = await db.select().from(goalsTable);
          return { status: 'ok', goals };
        }
        
        case 'compare_guardrails': {
          // Fetch guardrails from database
          const { guardrails } = await import('@shared/schema');
          const mode = payload.params?.mode || 'paper';
          const guardrailData = await db.select().from(guardrails).where(eq(guardrails.mode, mode));
          return { status: 'ok', guardrails: guardrailData };
        }
        
        default:
          return { status: 'ok', message: 'Task executed', taskType };
      }
    } catch (error) {
      console.error(`[ReasoningOrchestrator] Error executing task ${taskType}:`, error);
      throw error;
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
   * Phase 8.8.3+: Log summarized queue metrics
   */
  private logQueueMetrics(): void {
    const latencyStats: Record<string, { avg: number; count: number }> = {};
    
    // Calculate average latency per domain
    this.metrics.latencyByDomain.forEach((latencies, domain) => {
      const avg = latencies.length > 0 
        ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length 
        : 0;
      latencyStats[domain] = { avg: Math.round(avg), count: latencies.length };
    });

    const totalTasks = this.metrics.totalCompleted + this.metrics.totalFailed;
    const completionRatio = totalTasks > 0 
      ? (this.metrics.totalCompleted / totalTasks * 100).toFixed(1) 
      : '0.0';

    console.log(`[ReasoningOrchestrator] 📊 Queue Metrics (iteration ${this.queueIterations}):`);
    console.log(`  - Latency by Domain:`, latencyStats);
    console.log(`  - Total Retries: ${this.metrics.totalRetries}`);
    console.log(`  - Completion Ratio: ${completionRatio}% (${this.metrics.totalCompleted}/${totalTasks})`);
    console.log(`  - Failed Tasks: ${this.metrics.totalFailed}`);
  }

  /**
   * Phase 8.8.3+: Get aggregated queue metrics
   */
  getMetrics(): any {
    const latencyStats: Record<string, { avgLatency: number; taskCount: number }> = {};
    
    this.metrics.latencyByDomain.forEach((latencies, domain) => {
      const avg = latencies.length > 0 
        ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length 
        : 0;
      latencyStats[domain] = { 
        avgLatency: Math.round(avg), 
        taskCount: latencies.length 
      };
    });

    const totalTasks = this.metrics.totalCompleted + this.metrics.totalFailed;
    const completionRatio = totalTasks > 0 
      ? Number((this.metrics.totalCompleted / totalTasks * 100).toFixed(1))
      : 0;

    return {
      workerId: this.workerId,
      iterations: this.queueIterations,
      latencyByDomain: latencyStats,
      totalRetries: this.metrics.totalRetries,
      totalCompleted: this.metrics.totalCompleted,
      totalFailed: this.metrics.totalFailed,
      completionRatio,
    };
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
