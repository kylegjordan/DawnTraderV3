import { nlaiActionRegistry, type ActionIntent, type ActionResult } from './nlai-action-registry';
import type ExecutionPolicyController from './execution-policy-controller';
import type { IStorage } from '../storage';
import { clusterBus } from './cluster-bus';

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

      // Step 4: Emit cluster bus event for coordination (Phase 22)
      try {
        await clusterBus.publish('task_completed', {
          taskType: 'walter_command',
          actionId,
          userId,
          mode,
          success: result.success,
          executionTimeMs,
          executionLogId,
          timestamp: new Date().toISOString(),
        }, 'walter_nlai');
      } catch (busError: any) {
        console.error(`[${this.MODULE_NAME}] Failed to emit cluster bus event:`, busError);
      }

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

      // Emit cluster bus event for failed executions (Phase 22)
      try {
        await clusterBus.publish('task_completed', {
          taskType: 'walter_command',
          actionId,
          userId,
          mode,
          success: false,
          executionTimeMs,
          executionLogId,
          error: error.message,
          timestamp: new Date().toISOString(),
        }, 'walter_nlai');
      } catch (busError: any) {
        console.error(`[${this.MODULE_NAME}] Failed to emit cluster bus event:`, busError);
      }

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

  /**
   * Dispatch multiple intents sequentially with parent_command_id linking
   * Part B2: Multi-intent execution coordinator
   * 
   * @param userId - User ID
   * @param intents - Array of parsed intents to execute
   * @param options - Execution options
   * @returns Aggregated result with per-intent details
   */
  async dispatchMultiple(
    userId: string,
    intents: any[], // ParsedIntent[]
    options?: {
      mode?: 'live' | 'paper';
      chatSessionId?: string;
      source?: 'chat' | 'voice' | 'api';
      parentCommandId?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    results: ActionResult[];
    failedIntentIndex?: number;
    totalIntents: number;
    successfulIntents: number;
    failedIntents: number;
  }> {
    const startTime = Date.now();
    const mode = options?.mode || 'paper';
    const parentCommandId = options?.parentCommandId || `multi_${Date.now()}`;
    
    console.log(`[${this.MODULE_NAME}] Dispatching ${intents.length} intents sequentially (parent: ${parentCommandId})`);
    
    // Filter out conversational intents before dispatch (critical fix)
    const actionableIntents = intents.filter(intent => intent.type !== 'conversation');
    
    if (actionableIntents.length === 0) {
      console.log(`[${this.MODULE_NAME}] No actionable intents found after filtering conversations`);
      return {
        success: true,
        message: 'No actionable commands found in message.',
        results: [],
        totalIntents: 0,
        successfulIntents: 0,
        failedIntents: 0,
      };
    }
    
    console.log(`[${this.MODULE_NAME}] Filtered to ${actionableIntents.length} actionable intents (removed ${intents.length - actionableIntents.length} conversational)`);
    
    const results: ActionResult[] = [];
    let successfulIntents = 0;
    let failedIntents = 0;
    let failedIntentIndex: number | undefined;
    
    // Execute intents sequentially
    for (let i = 0; i < actionableIntents.length; i++) {
      const intent = actionableIntents[i];
      
      // Use registry pattern matching to get canonical actionId (critical fix)
      const matched = nlaiActionRegistry.matchIntent(intent.rawInput || '');
      
      if (!matched) {
        console.warn(`[${this.MODULE_NAME}] Intent ${i + 1} could not be matched to registered action: "${intent.rawInput}"`);
        
        const errorResult: ActionResult = {
          success: false,
          message: `Could not match command to a registered action: "${intent.rawInput}"`,
          error: 'ActionNotFoundError',
        };
        results.push(errorResult);
        failedIntents++;
        failedIntentIndex = i;
        continue;
      }
      
      const { actionId, intent: actionIntent } = matched;
      
      console.log(`[${this.MODULE_NAME}] Executing intent ${i + 1}/${actionableIntents.length}: ${actionId}`);
      
      try {
        // Execute single intent with parent linkage
        const result = await this.dispatch(userId, actionId, actionIntent, {
          ...options,
          mode,
        });
        
        results.push(result);
        
        if (result.success) {
          successfulIntents++;
        } else {
          failedIntents++;
          failedIntentIndex = i;
          
          // Check if we should stop on failure (strict mode)
          // For now, continue execution to show all results
          console.warn(`[${this.MODULE_NAME}] Intent ${i + 1} failed, continuing with remaining intents`);
        }
      } catch (error: any) {
        const errorResult: ActionResult = {
          success: false,
          message: `Intent execution error: ${error.message}`,
          error: error.message,
        };
        results.push(errorResult);
        failedIntents++;
        failedIntentIndex = i;
      }
    }
    
    const executionTimeMs = Date.now() - startTime;
    
    // Emit aggregated cluster bus event
    try {
      await clusterBus.publish('task_completed', {
        taskType: 'walter_multi_command',
        parentCommandId,
        userId,
        mode,
        totalIntents: actionableIntents.length,
        successfulIntents,
        failedIntents,
        executionTimeMs,
        timestamp: new Date().toISOString(),
      }, 'walter_nlai');
    } catch (busError: any) {
      console.error(`[${this.MODULE_NAME}] Failed to emit multi-intent cluster bus event:`, busError);
    }
    
    // Generate aggregated message (use actionable intents for proper indexing)
    const aggregatedMessage = this.generateAggregatedMessage(results, actionableIntents);
    
    console.log(
      `[${this.MODULE_NAME}] Multi-intent execution completed in ${executionTimeMs}ms - ` +
      `${successfulIntents}/${actionableIntents.length} successful`
    );
    
    return {
      success: failedIntents === 0,
      message: aggregatedMessage,
      results,
      failedIntentIndex,
      totalIntents: actionableIntents.length,
      successfulIntents,
      failedIntents,
    };
  }
  
  /**
   * Generate user-friendly aggregated message from multi-intent execution results
   * Part B3: Unified response aggregator
   */
  private generateAggregatedMessage(results: ActionResult[], intents: any[]): string {
    if (results.length === 0) {
      return 'No intents were executed.';
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    if (failed === 0) {
      // All successful
      if (results.length === 1) {
        return results[0].message;
      }
      
      const messages = results.map((r, i) => {
        const intent = intents[i];
        const intentDesc = intent?.entity ? `${intent.action} ${intent.entity}` : `action ${i + 1}`;
        return `✓ ${intentDesc}: ${r.message}`;
      }).join('\n');
      
      return `All ${results.length} actions completed successfully:\n${messages}`;
    } else if (successful === 0) {
      // All failed
      const messages = results.map((r, i) => {
        const intent = intents[i];
        const intentDesc = intent?.entity ? `${intent.action} ${intent.entity}` : `action ${i + 1}`;
        return `✗ ${intentDesc}: ${r.message}`;
      }).join('\n');
      
      return `All ${results.length} actions failed:\n${messages}`;
    } else {
      // Mixed results
      const messages = results.map((r, i) => {
        const intent = intents[i];
        const intentDesc = intent?.entity ? `${intent.action} ${intent.entity}` : `action ${i + 1}`;
        const icon = r.success ? '✓' : '✗';
        return `${icon} ${intentDesc}: ${r.message}`;
      }).join('\n');
      
      return `Completed ${successful}/${results.length} actions:\n${messages}`;
    }
  }

  clearLogs(): void {
    this.executionLogs = [];
    console.log(`[${this.MODULE_NAME}] Execution logs cleared`);
  }
}

export const nlaiExecutionBroker = new NLAIExecutionBroker();
