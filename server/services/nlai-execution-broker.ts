import { nlaiActionRegistry, type ActionIntent, type ActionResult } from './nlai-action-registry';
import type ExecutionPolicyController from './execution-policy-controller';
import type { IStorage } from '../storage';

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
  private policyController: ExecutionPolicyController | null = null;

  /**
   * Initialize the broker with ExecutionPolicyController for approval checks
   */
  initialize(storage: IStorage, policyController: ExecutionPolicyController): void {
    this.policyController = policyController;
    console.log(`[${this.MODULE_NAME}] Initialized with ExecutionPolicyController`);
  }

  async dispatch(
    userId: string,
    actionId: string,
    intent: ActionIntent,
    options?: {
      mode?: 'live' | 'paper';
      chatSessionId?: string;
      source?: 'chat' | 'voice' | 'api';
    }
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const mode = options?.mode || 'paper'; // Default to paper mode for safety
    const source = options?.source || 'chat';
    
    console.log(`[${this.MODULE_NAME}] Dispatching action: ${actionId} for user: ${userId} (${mode} mode)`);
    console.log(`[${this.MODULE_NAME}] Intent:`, intent);

    let executionLogId: string | undefined;

    try {
      // Step 1: Check approval via ExecutionPolicyController
      if (this.policyController) {
        const approvalCheck = await this.policyController.evaluateExecution({
          userId,
          mode,
          commandText: intent.originalMessage || '',
          actionType: actionId,
          source,
          chatSessionId: options?.chatSessionId,
          proposedChanges: intent.extractedValue ? {
            proposedValue: intent.extractedValue,
          } : undefined,
        });

        executionLogId = approvalCheck.executionLogId;

        if (approvalCheck.requiresManualApproval) {
          console.log(`[${this.MODULE_NAME}] Action ${actionId} requires manual approval - approval ID: ${approvalCheck.approvalId}`);
          
          return {
            success: false,
            message: approvalCheck.reason || 'This action requires manual approval due to risk assessment.',
            data: {
              requiresApproval: true,
              approvalId: approvalCheck.approvalId,
              executionLogId,
              reason: approvalCheck.reason,
            },
          };
        }

        if (!approvalCheck.approved) {
          console.log(`[${this.MODULE_NAME}] Action ${actionId} not approved: ${approvalCheck.reason}`);
          
          return {
            success: false,
            message: approvalCheck.reason || 'Action not approved by policy controller.',
            data: {
              requiresApproval: false,
              approved: false,
              executionLogId,
            },
          };
        }

        console.log(`[${this.MODULE_NAME}] Action ${actionId} auto-approved for execution`);
      }

      // Step 2: Execute the action
      const result = await Promise.race([
        nlaiActionRegistry.execute(actionId, userId, intent),
        this.timeoutPromise(),
      ]);

      const executionTimeMs = Date.now() - startTime;

      // Step 3: Log execution result
      if (this.policyController && executionLogId) {
        await this.policyController.logExecutionResult(executionLogId, {
          success: result.success,
          message: result.message,
          details: result.data,
        });
      }

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

      // Log execution failure
      if (this.policyController && executionLogId) {
        await this.policyController.logExecutionResult(executionLogId, {
          success: false,
          message: error.message,
          details: { stack: error.stack },
        });
      }

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
    intent: ActionIntent,
    options?: {
      mode?: 'live' | 'paper';
      chatSessionId?: string;
      source?: 'chat' | 'voice' | 'api';
    }
  ): Promise<void> {
    setImmediate(async () => {
      await this.dispatch(userId, actionId, intent, options);
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
