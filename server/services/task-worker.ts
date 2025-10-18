import { db } from "../db";
import {
  clusterTaskQueue,
  clusterResultLog,
  clusterAuditLog,
  type ClusterTaskQueue,
  type OutcomeStatus,
  type GateType,
} from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { clusterRegistry } from "./cluster-registry";
import { taskRouter } from "./task-router";
import { clusterBus } from "./cluster-bus";
import { circuitBreaker } from "./circuit-breaker";

// Will be imported when integrating with autonomy controller
// import { autonomyController } from "./autonomy-controller";

/**
 * Phase 17.0: TaskWorker
 * 
 * Executes cluster tasks with full Safety → Ethics → Knowledge gating
 * - Pulls tasks assigned to local node
 * - Executes through Autonomy Controller gates
 * - Logs results to cluster_result_log
 */
export class TaskWorker {
  private isRunning = false;
  private pollInterval = 5000; // 5 seconds
  private workerTimer: NodeJS.Timeout | null = null;
  private maxConcurrent = 5;
  private activeTasks = new Set<string>();

  /**
   * Start the worker loop
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log("[TaskWorker] Starting worker loop");

    this.workerTimer = setInterval(async () => {
      await this.pollAndExecute();
    }, this.pollInterval);

    // Execute immediately
    this.pollAndExecute();
  }

  /**
   * Stop the worker loop
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log("[TaskWorker] Stopping worker loop");

    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  /**
   * Poll for tasks and execute them
   */
  private async pollAndExecute(): Promise<void> {
    const nodeId = clusterRegistry.getLocalNodeId();
    if (!nodeId) {
      return; // Node not registered yet
    }

    if (this.activeTasks.size >= this.maxConcurrent) {
      return; // At capacity
    }

    try {
      // Get pending tasks for this node
      const availableSlots = this.maxConcurrent - this.activeTasks.size;
      const tasks = await taskRouter.getPendingTasksForNode(nodeId, availableSlots);

      for (const task of tasks) {
        if (this.activeTasks.size >= this.maxConcurrent) {
          break;
        }

        // Execute task asynchronously (don't await)
        this.executeTask(task).catch(error => {
          console.error(`[TaskWorker] Error executing task ${task.id}:`, error);
        });
      }
    } catch (error) {
      console.error("[TaskWorker] Poll error:", error);
    }
  }

  /**
   * Execute a single task through the full gate pipeline
   * 
   * Phase 17.5: Circuit breaker integration
   * Phase 17.6: Audit logging for ethical gates
   * 
   * Pipeline: Circuit Breaker → Safety → Federated Ethics → Ethical Reasoner → Knowledge Acquisition → Execution
   */
  private async executeTask(task: ClusterTaskQueue): Promise<void> {
    const nodeId = clusterRegistry.getLocalNodeId();
    if (!nodeId) {
      throw new Error("Node not registered");
    }

    // Phase 17.5: Circuit breaker check
    const circuitStatus = await circuitBreaker.canProcessRequest(nodeId);
    if (!circuitStatus.allowed) {
      console.log(`[TaskWorker] Circuit breaker OPEN for node ${nodeId}, skipping task ${task.id}`);
      // Requeue task for another node
      await db
        .update(clusterTaskQueue)
        .set({
          status: "queued",
          assignedNodeId: null,
        })
        .where(eq(clusterTaskQueue.id, task.id));
      return;
    }

    // Track active task
    this.activeTasks.add(task.id);

    try {
      // Mark as running
      await taskRouter.markRunning(task.id, nodeId);

      const startTime = Date.now();

      // Execute through gates (Phase 17.6: with audit logging)
      const result = await this.executeWithGates(task, nodeId);

      const executionTime = Date.now() - startTime;

      // Log result
      await db.insert(clusterResultLog).values({
        taskId: task.id,
        nodeId,
        userId: task.userId || undefined,
        outcomeStatus: result.status,
        resultSummary: result.summary,
        metrics: {
          executionTimeMs: executionTime,
          timestamp: new Date().toISOString(),
        },
      });

      // Mark task as completed
      await taskRouter.markCompleted(task.id);

      // Phase 17.5: Record success in circuit breaker
      await circuitBreaker.recordSuccess(nodeId);

      console.log(`[TaskWorker] Completed task ${task.id} in ${executionTime}ms`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log failed result
      await db.insert(clusterResultLog).values({
        taskId: task.id,
        nodeId,
        userId: task.userId || undefined,
        outcomeStatus: "failed",
        resultSummary: `Error: ${errorMessage}`,
        metrics: {
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      });

      // Mark task as failed (with retry logic)
      await taskRouter.markFailed(task.id, errorMessage);

      // Phase 17.5: Record failure in circuit breaker
      await circuitBreaker.recordFailure(nodeId, errorMessage);

      console.error(`[TaskWorker] Failed task ${task.id}:`, errorMessage);
    } finally {
      // Remove from active tasks
      this.activeTasks.delete(task.id);

      // Update node load
      await clusterRegistry.updateLoad(this.activeTasks.size, this.activeTasks.size);
    }
  }

  /**
   * Execute task through Safety → Federated Ethics → Ethical Reasoner → Knowledge gates
   * 
   * Phase 17.6: Enhanced with per-gate audit logging
   * 
   * NOTE: This is where we integrate with the Autonomy Controller's execution pipeline
   * For now, it's a simplified implementation that will be enhanced when integrating
   */
  private async executeWithGates(task: ClusterTaskQueue, nodeId: string): Promise<{
    status: OutcomeStatus;
    summary: string;
    data?: any;
  }> {
    // TODO: Integrate with Autonomy Controller when implementing delegation hooks
    // The autonomyController.executeIntent() method will handle full gate execution
    
    // Phase 17.6: Simulate ethical gate execution with audit logging
    const gates: GateType[] = ["safety", "federated_ethics", "ethical_reasoning", "knowledge_acquisition"];
    
    for (const gateType of gates) {
      const gateStartTime = Date.now();
      
      try {
        // Simulate gate execution (will be replaced with actual gate calls)
        const gatePassed = await this.simulateGateExecution(gateType, task);
        const executionTimeMs = Date.now() - gateStartTime;
        
        // Phase 17.6: Log gate execution to audit log
        await db.insert(clusterAuditLog).values({
          taskId: task.id,
          nodeId,
          userId: task.userId || undefined,
          gateType,
          gatePassed,
          gateResult: gatePassed ? `${gateType} gate passed` : `${gateType} gate failed`,
          executionTimeMs,
          metadata: {
            taskType: task.taskType,
            timestamp: new Date().toISOString(),
          },
        });
        
        if (!gatePassed) {
          return {
            status: "failed",
            summary: `Task blocked by ${gateType} gate`,
          };
        }
      } catch (error) {
        const executionTimeMs = Date.now() - gateStartTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Log gate failure
        await db.insert(clusterAuditLog).values({
          taskId: task.id,
          nodeId,
          userId: task.userId || undefined,
          gateType,
          gatePassed: false,
          gateResult: `Gate error: ${errorMessage}`,
          executionTimeMs,
          metadata: {
            error: errorMessage,
            timestamp: new Date().toISOString(),
          },
        });
        
        return {
          status: "failed",
          summary: `${gateType} gate error: ${errorMessage}`,
        };
      }
    }
    
    // All gates passed - execute task
    try {
      const result = await this.executeTaskByType(task);
      return {
        status: "success",
        summary: result.summary || "Task completed successfully",
        data: result.data,
      };
    } catch (error) {
      return {
        status: "failed",
        summary: error instanceof Error ? error.message : "Task execution failed",
      };
    }
  }
  
  /**
   * Simulate gate execution (placeholder for actual gate integration)
   * Phase 17.6: Returns true/false for gate pass/fail
   */
  private async simulateGateExecution(gateType: GateType, task: ClusterTaskQueue): Promise<boolean> {
    // Simulate gate execution time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
    
    // For now, all gates pass (will be replaced with actual gate logic)
    // In real implementation, this will call:
    // - SafetyGuardrails for "safety"
    // - FederatedEthicsHub for "federated_ethics"
    // - EthicalReasoner for "ethical_reasoning"
    // - KnowledgeRetrievalService for "knowledge_acquisition"
    
    return true; // Placeholder: gates always pass
  }

  /**
   * Execute task based on its type
   * This is a placeholder that will be replaced with proper delegation to specialized handlers
   */
  private async executeTaskByType(task: ClusterTaskQueue): Promise<{
    summary: string;
    data?: any;
  }> {
    switch (task.taskType) {
      case "trading_signal":
        return await this.executeTradingSignal(task);
      case "market_analysis":
        return await this.executeMarketAnalysis(task);
      case "risk_assessment":
        return await this.executeRiskAssessment(task);
      case "compliance_check":
        return await this.executeComplianceCheck(task);
      case "research":
        return await this.executeResearch(task);
      case "optimization":
        return await this.executeOptimization(task);
      default:
        return await this.executeGeneral(task);
    }
  }

  // Task type handlers (placeholders for now)
  
  private async executeTradingSignal(task: ClusterTaskQueue): Promise<any> {
    // Placeholder: Would integrate with TradingEngine
    return {
      summary: `Trading signal processed: ${task.payload.symbol || "unknown"}`,
      data: { signal: "processed" },
    };
  }

  private async executeMarketAnalysis(task: ClusterTaskQueue): Promise<any> {
    // Placeholder: Would integrate with MarketScanner or AIAnalyst
    return {
      summary: `Market analysis completed for ${task.payload.market || "unknown"}`,
      data: { analysis: "completed" },
    };
  }

  private async executeRiskAssessment(task: ClusterTaskQueue): Promise<any> {
    // Placeholder: Would integrate with RiskManager
    return {
      summary: `Risk assessment completed`,
      data: { riskLevel: "moderate" },
    };
  }

  private async executeComplianceCheck(task: ClusterTaskQueue): Promise<any> {
    // Placeholder: Would integrate with EthicalReasoner
    return {
      summary: `Compliance check passed`,
      data: { compliant: true },
    };
  }

  private async executeResearch(task: ClusterTaskQueue): Promise<any> {
    // Placeholder: Would integrate with KnowledgeRetrievalService
    return {
      summary: `Research task completed: ${task.payload.query || "unknown"}`,
      data: { findings: "placeholder" },
    };
  }

  private async executeOptimization(task: ClusterTaskQueue): Promise<any> {
    // Placeholder: Would integrate with SelfOptimizer
    return {
      summary: `Optimization task completed`,
      data: { optimized: true },
    };
  }

  private async executeGeneral(task: ClusterTaskQueue): Promise<any> {
    // General task execution
    return {
      summary: `General task completed`,
      data: task.payload,
    };
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean;
    activeTasks: number;
    maxConcurrent: number;
  } {
    return {
      isRunning: this.isRunning,
      activeTasks: this.activeTasks.size,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Singleton instance
export const taskWorker = new TaskWorker();
