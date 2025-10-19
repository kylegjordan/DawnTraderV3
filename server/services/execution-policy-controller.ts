/**
 * Execution Policy Controller
 * Phase 22 - Autonomous Execution Layer
 * 
 * Controls whether Walter can execute autonomous actions based on:
 * 1. Walter Approvals matrix (autoExecute toggles)
 * 2. Risk thresholds from guardrails
 * 3. Safety guardrails and kill switch state
 * 
 * Integrates with NLAI interpreter to provide policy-based execution control
 */

import { ApprovalEvaluator } from './approval-evaluator.js';
import type { DatabaseStorage } from '../storage.js';
import type { InsertWalterExecutionLog } from '@shared/schema';
import { permissionCache } from './permission-cache.js';
import { getRequiredPermission } from '../config/permissions.js';
import type { UserRole } from '../config/permissions.js';

export interface ExecutionRequest {
  userId: string;
  mode: 'live' | 'paper';
  commandText: string;
  actionType: string; // NLAI action ID (e.g., 'update_risk_per_trade', 'start_paper_simulation')
  source: string; // 'nlai', 'orchestrator', 'api'
  proposedChanges?: {
    parameterName?: string;
    currentValue?: any;
    proposedValue?: any;
  };
  chatSessionId?: string;
}

export interface ExecutionDecision {
  approved: boolean;
  requiresManualApproval: boolean;
  reason: string;
  projectedRisk?: number;
  riskThreshold?: number;
  executionLogId?: string; // ID of the log entry created
  approvalId?: string; // ID of approval record if manual approval required
}

export class ExecutionPolicyController {
  private storage: DatabaseStorage;

  constructor(storage: DatabaseStorage) {
    this.storage = storage;
  }

  /**
   * Evaluates whether an action can be executed automatically
   * Creates execution log entry and handles approval flow
   */
  async evaluateExecution(request: ExecutionRequest): Promise<ExecutionDecision> {
    const startTime = Date.now();
    
    try {
      console.log(`[ExecutionPolicy] Evaluating ${request.actionType} for user ${request.userId} (${request.mode} mode)`);
      
      // 1. Get user and check permissions (Phase 27.3)
      const user = await this.storage.getUser(request.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 1a. Check if user has required permission for this action (fail closed)
      const requiredPermission = getRequiredPermission(request.actionType);
      if (requiredPermission) {
        if (!user.role) {
          console.log(`[ExecutionPolicy] ❌ Permission denied: user ${request.userId} has no role assigned`);
          
          const executionLog = await this.storage.createWalterExecutionLog({
            userId: request.userId,
            mode: request.mode,
            commandText: request.commandText,
            actionType: request.actionType,
            source: request.source,
            approvalStatus: 'permission_denied',
            approvalReason: 'Permission denied: User has no role assigned',
            executionStatus: 'rejected',
            projectedRisk: null,
            chatSessionId: request.chatSessionId,
            executionTimeMs: Date.now() - startTime,
          });
          
          return {
            approved: false,
            requiresManualApproval: false,
            reason: 'Permission denied: User account improperly configured',
            executionLogId: executionLog.id,
          };
        }
        
        const userRole = user.role as UserRole;
        const hasPermission = await permissionCache.hasPermission(request.userId, userRole, requiredPermission);
        
        if (!hasPermission) {
          console.log(`[ExecutionPolicy] ❌ Permission denied: user ${request.userId} (${userRole}) lacks ${requiredPermission}`);
          
          // Create log entry for permission denial
          const executionLog = await this.storage.createWalterExecutionLog({
            userId: request.userId,
            mode: request.mode,
            commandText: request.commandText,
            actionType: request.actionType,
            source: request.source,
            approvalStatus: 'permission_denied',
            approvalReason: `Permission denied: User lacks ${requiredPermission} permission`,
            executionStatus: 'rejected',
            projectedRisk: null,
            chatSessionId: request.chatSessionId,
            executionTimeMs: Date.now() - startTime,
          });
          
          return {
            approved: false,
            requiresManualApproval: false,
            reason: `Permission denied: You do not have permission to ${request.actionType.replace(/_/g, ' ')}`,
            executionLogId: executionLog.id,
          };
        }
      }

      // 2. Get user's approval matrix
      const approvalMatrix = (user.approvalMatrix as any) || {};
      
      // 2. Map NLAI action to approval matrix key
      const approvalAction = this.mapActionToApprovalKey(request.actionType);
      
      // 3. Calculate projected risk if applicable
      const projectedRisk = await this.calculateRisk(request);
      
      // 4. Evaluate using ApprovalEvaluator
      const evaluation = ApprovalEvaluator.evaluate(approvalMatrix, {
        actionType: approvalAction,
        projectedRisk,
        proposedChange: request.proposedChanges,
      });
      
      console.log(`[ExecutionPolicy] Evaluation result: approved=${evaluation.approved}, requiresApproval=${evaluation.requiresManualApproval}`);
      
      // 5. Create execution log entry
      const executionLog = await this.storage.createWalterExecutionLog({
        userId: request.userId,
        mode: request.mode,
        commandText: request.commandText,
        actionType: request.actionType,
        source: request.source,
        approvalStatus: evaluation.approved ? 'auto_approved' : 
                       evaluation.requiresManualApproval ? 'manual_required' : 'not_required',
        approvalReason: evaluation.reason,
        executionStatus: 'pending',
        projectedRisk: projectedRisk ? projectedRisk.toString() : null,
        chatSessionId: request.chatSessionId,
        executionTimeMs: Date.now() - startTime,
      });
      
      // 6. If manual approval required, create pending approval record
      let approvalId: string | undefined;
      if (evaluation.requiresManualApproval) {
        const approval = await this.storage.createWalterPendingApproval({
          userId: request.userId,
          mode: request.mode,
          parameterName: request.proposedChanges?.parameterName || request.actionType,
          currentValue: request.proposedChanges?.currentValue || {},
          proposedValue: request.proposedChanges?.proposedValue || {},
          projectedRisk: projectedRisk?.toFixed(2) || '0.00',
          riskDetails: {
            actionType: request.actionType,
            command: request.commandText,
            evaluation: evaluation.riskAssessment,
          },
          status: 'pending',
          action: request.actionType, // Phase 27.2: Store action for execution after approval
          traceId: `trace_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Phase 27.2: Unique trace ID
        });
        
        approvalId = approval.id;
        
        // Update execution log with approval ID
        await this.storage.updateWalterExecutionLog(executionLog.id, { approvalId });
        
        console.log(`[ExecutionPolicy] Created pending approval ${approvalId}`);
      }
      
      return {
        approved: evaluation.approved,
        requiresManualApproval: evaluation.requiresManualApproval,
        reason: evaluation.reason,
        projectedRisk,
        riskThreshold: evaluation.riskAssessment?.threshold,
        executionLogId: executionLog.id,
        approvalId,
      };
      
    } catch (error: any) {
      console.error(`[ExecutionPolicy] Error evaluating execution:`, error);
      throw error;
    }
  }

  /**
   * Logs successful or failed execution result
   */
  async logExecutionResult(
    executionLogId: string,
    result: {
      success: boolean;
      message: string;
      details?: any;
      actualRisk?: number;
    }
  ): Promise<void> {
    try {
      await this.storage.updateWalterExecutionLog(executionLogId, {
        executionStatus: result.success ? 'success' : 'failed',
        resultMessage: result.message,
        resultDetails: result.details,
        actualRisk: result.actualRisk ? result.actualRisk.toString() : null,
        executedAt: new Date(),
      });
      
      console.log(`[ExecutionPolicy] Updated execution log ${executionLogId}: ${result.success ? 'success' : 'failed'}`);
    } catch (error: any) {
      console.error(`[ExecutionPolicy] Error logging execution result:`, error);
    }
  }

  /**
   * Map NLAI action ID to approval matrix key
   */
  private mapActionToApprovalKey(actionType: string): string {
    // Map NLAI actions to approval matrix keys
    const actionMap: Record<string, string> = {
      'update_risk_per_trade': 'modifyGuardrails',
      'update_max_drawdown': 'modifyGuardrails',
      'update_max_daily_loss': 'modifyGuardrails',
      'update_screener_liquidity': 'updateFilters',
      'update_trading_goal': 'adjustGoals',
      'start_paper_simulation': 'paperTradingActivation',
      'stop_paper_simulation': 'paperTradingActivation',
      'check_simulation_status': 'paperTradingActivation', // Read-only, should auto-approve
    };
    
    return actionMap[actionType] || actionType;
  }

  /**
   * Calculate projected risk for an action
   * Returns risk percentage (0-100)
   */
  private async calculateRisk(request: ExecutionRequest): Promise<number | undefined> {
    const { actionType, userId, mode, proposedChanges } = request;
    
    // Risk-free actions (read-only or paper mode only)
    const riskFreeActions = [
      'check_simulation_status',
      'check_system_health',
      'generate_report',
      'refresh_context',
      'check_system_truth',
    ];
    
    if (riskFreeActions.includes(actionType)) {
      return 0;
    }
    
    // Paper mode actions have lower risk
    if (mode === 'paper') {
      // Guardrail changes in paper mode: low risk
      if (actionType.startsWith('update_') && actionType.includes('guardrail')) {
        return 2.0; // 2% risk for paper mode guardrail changes
      }
      
      // Paper simulation: very low risk
      if (actionType.includes('paper_simulation')) {
        return 1.0; // 1% risk for paper simulation
      }
      
      // Other paper mode changes
      return 3.0; // 3% default risk for paper mode
    }
    
    // Live mode: calculate based on proposed changes
    if (mode === 'live') {
      // Get current guardrails
      const guardrails = await this.storage.getGuardrails({ userId, mode });
      
      if (actionType === 'update_risk_per_trade' && proposedChanges?.proposedValue) {
        const newRiskPerTrade = parseFloat(proposedChanges.proposedValue as string);
        return newRiskPerTrade * 2; // Projected risk = 2x risk per trade
      }
      
      if (actionType === 'update_max_drawdown' && proposedChanges?.proposedValue) {
        const newDrawdown = parseFloat(proposedChanges.proposedValue as string);
        return newDrawdown; // Projected risk = drawdown percentage
      }
      
      // Default live mode risk calculation
      const baseRisk = parseFloat(guardrails?.riskPerTrade || '2.0');
      return baseRisk * 3; // 3x the base risk per trade for live changes
    }
    
    return undefined; // No risk calculated
  }

}

export default ExecutionPolicyController;
