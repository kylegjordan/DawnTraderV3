import { nlaiActionRegistry, type ActionIntent, type ActionResult } from './nlai-action-registry';

interface ExecutionLog {
  timestamp: Date;
  userId: string;
  actionId: string;
  intent: ActionIntent;
  result: ActionResult;
  executionTimeMs: number;
}

export class NLAIExecutionBroker {
  private readonly MODULE_NAME = 'NLAI-ExecutionBroker';
  private executionLogs: ExecutionLog[] = [];
  private readonly MAX_LOGS = 100;
  private readonly EXECUTION_TIMEOUT_MS = 30000; // 30 seconds

  async dispatch(
    userId: string,
    actionId: string,
    intent: ActionIntent
  ): Promise<ActionResult> {
    const startTime = Date.now();
    
    console.log(`[${this.MODULE_NAME}] Dispatching action: ${actionId} for user: ${userId}`);
    console.log(`[${this.MODULE_NAME}] Intent:`, intent);

    try {
      const result = await Promise.race([
        nlaiActionRegistry.execute(actionId, userId, intent),
        this.timeoutPromise(),
      ]);

      const executionTimeMs = Date.now() - startTime;

      this.logExecution({
        timestamp: new Date(),
        userId,
        actionId,
        intent,
        result,
        executionTimeMs,
      });

      console.log(
        `[${this.MODULE_NAME}] Action ${actionId} completed in ${executionTimeMs}ms - Success: ${result.success}`
      );

      return result;
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;
      const errorResult: ActionResult = {
        success: false,
        message: `Execution error: ${error.message}`,
        error: error.message,
      };

      this.logExecution({
        timestamp: new Date(),
        userId,
        actionId,
        intent,
        result: errorResult,
        executionTimeMs,
      });

      console.error(
        `[${this.MODULE_NAME}] Action ${actionId} failed after ${executionTimeMs}ms:`,
        error
      );

      return errorResult;
    }
  }

  async dispatchAsync(
    userId: string,
    actionId: string,
    intent: ActionIntent
  ): Promise<void> {
    setImmediate(async () => {
      await this.dispatch(userId, actionId, intent);
    });
  }

  private timeoutPromise(): Promise<ActionResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Action execution timeout after ${this.EXECUTION_TIMEOUT_MS}ms`));
      }, this.EXECUTION_TIMEOUT_MS);
    });
  }

  private logExecution(log: ExecutionLog): void {
    this.executionLogs.push(log);
    
    if (this.executionLogs.length > this.MAX_LOGS) {
      this.executionLogs.shift();
    }
  }

  getExecutionLogs(userId?: string, limit: number = 20): ExecutionLog[] {
    let logs = this.executionLogs;
    
    if (userId) {
      logs = logs.filter(log => log.userId === userId);
    }
    
    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getExecutionStats(): {
    totalExecutions: number;
    successRate: number;
    averageExecutionTimeMs: number;
    actionBreakdown: Record<string, { count: number; successRate: number }>;
  } {
    const total = this.executionLogs.length;
    const successful = this.executionLogs.filter(log => log.result.success).length;
    const avgTime = total > 0
      ? this.executionLogs.reduce((sum, log) => sum + log.executionTimeMs, 0) / total
      : 0;

    const actionBreakdown: Record<string, { count: number; successRate: number }> = {};
    
    for (const log of this.executionLogs) {
      if (!actionBreakdown[log.actionId]) {
        actionBreakdown[log.actionId] = { count: 0, successRate: 0 };
      }
      actionBreakdown[log.actionId].count++;
    }

    for (const actionId in actionBreakdown) {
      const actionLogs = this.executionLogs.filter(log => log.actionId === actionId);
      const actionSuccessful = actionLogs.filter(log => log.result.success).length;
      actionBreakdown[actionId].successRate = (actionSuccessful / actionLogs.length) * 100;
    }

    return {
      totalExecutions: total,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      averageExecutionTimeMs: avgTime,
      actionBreakdown,
    };
  }

  clearLogs(): void {
    this.executionLogs = [];
    console.log(`[${this.MODULE_NAME}] Execution logs cleared`);
  }
}

export const nlaiExecutionBroker = new NLAIExecutionBroker();
