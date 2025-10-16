/**
 * Phase 8.6 - Intent Gateway
 * 
 * Mediates between Walter's Cognitive Layer and Execution Core
 * - Validates all operational commands before execution
 * - Enforces RBAC (owner/editor/viewer)
 * - Logs every intent with timestamp and rationale
 * - Prevents cognitive layer from executing trades directly
 */

import { storage } from '../storage';

export interface IntentValidationResult {
  isValid: boolean;
  canExecute: boolean;
  reason?: string;
  requiresApproval?: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface IntentLog {
  intentId: string;
  userId: string;
  intent: string;
  action: string;
  status: 'approved' | 'blocked' | 'pending_approval';
  reason: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface OperationalCommand {
  type: 'trade' | 'config' | 'risk' | 'strategy' | 'system';
  action: string;
  parameters: Record<string, any>;
  mode: 'live' | 'paper';
  requestedBy: string;
}

export class WalterIntentGateway {
  private readonly MODULE_NAME = 'IntentGateway';
  private intentLogs: IntentLog[] = [];

  /**
   * Validate an intent before allowing execution
   */
  async validateIntent(
    userId: string,
    intent: string,
    command?: OperationalCommand
  ): Promise<IntentValidationResult> {
    console.log(`[${this.MODULE_NAME}] Validating intent for user ${userId}: "${intent}"`);

    try {
      // Get user role
      const user = await storage.getUser(userId);
      if (!user) {
        return {
          isValid: false,
          canExecute: false,
          reason: 'User not found',
          riskLevel: 'critical'
        };
      }

      const userRole = user.role || 'viewer';

      // If no command, it's just a query/conversation - allow
      if (!command) {
        return {
          isValid: true,
          canExecute: true,
          riskLevel: 'low'
        };
      }

      // Check role-based permissions
      const rolePermissions = this.getRolePermissions(userRole);
      
      // Validate command type against role
      if (!rolePermissions.allowedActions.includes(command.type)) {
        await this.logIntent(userId, intent, command.action, 'blocked', 
          `User role '${userRole}' not authorized for ${command.type} actions`, command);
        
        return {
          isValid: false,
          canExecute: false,
          reason: `Your role (${userRole}) cannot perform ${command.type} actions`,
          riskLevel: 'high'
        };
      }

      // Assess risk level
      const riskLevel = this.assessRiskLevel(command);

      // High-risk actions in live mode require owner role
      if (command.mode === 'live' && (riskLevel === 'high' || riskLevel === 'critical')) {
        if (userRole !== 'owner') {
          await this.logIntent(userId, intent, command.action, 'blocked', 
            `High-risk live action requires owner role`, command);
          
          return {
            isValid: true,
            canExecute: false,
            requiresApproval: true,
            reason: 'High-risk live actions require owner approval',
            riskLevel
          };
        }
      }

      // Log approved intent
      await this.logIntent(userId, intent, command.action, 'approved', 
        `Validated - role: ${userRole}, risk: ${riskLevel}`, command);

      return {
        isValid: true,
        canExecute: true,
        riskLevel
      };

    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Validation error:`, error);
      return {
        isValid: false,
        canExecute: false,
        reason: 'Internal validation error',
        riskLevel: 'critical'
      };
    }
  }

  /**
   * Get role-based permissions
   */
  private getRolePermissions(role: string): { allowedActions: string[] } {
    const permissions: Record<string, string[]> = {
      owner: ['trade', 'config', 'risk', 'strategy', 'system'],
      editor: ['config', 'risk', 'strategy'],
      viewer: []
    };

    return {
      allowedActions: permissions[role] || []
    };
  }

  /**
   * Assess risk level of a command
   */
  private assessRiskLevel(command: OperationalCommand): 'low' | 'medium' | 'high' | 'critical' {
    // Trade commands are high risk in live mode
    if (command.type === 'trade' && command.mode === 'live') {
      return 'high';
    }

    // System commands are critical
    if (command.type === 'system') {
      return 'critical';
    }

    // Risk parameter changes are medium-high
    if (command.type === 'risk' && command.mode === 'live') {
      return 'high';
    }

    // Strategy changes in live mode are medium
    if (command.type === 'strategy' && command.mode === 'live') {
      return 'medium';
    }

    // Paper mode and config are low risk
    return 'low';
  }

  /**
   * Log intent for audit trail
   */
  private async logIntent(
    userId: string,
    intent: string,
    action: string,
    status: 'approved' | 'blocked' | 'pending_approval',
    reason: string,
    command?: OperationalCommand
  ): Promise<void> {
    const intentLog: IntentLog = {
      intentId: `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      intent,
      action,
      status,
      reason,
      timestamp: new Date(),
      metadata: command ? {
        type: command.type,
        mode: command.mode,
        parameters: command.parameters
      } : {}
    };

    this.intentLogs.push(intentLog);

    // Keep only last 1000 logs in memory
    if (this.intentLogs.length > 1000) {
      this.intentLogs = this.intentLogs.slice(-1000);
    }

    console.log(`[${this.MODULE_NAME}] Intent ${status}: ${intent} (${reason})`);
  }

  /**
   * Get recent intent logs for a user
   */
  async getRecentIntents(userId: string, limit: number = 50): Promise<IntentLog[]> {
    return this.intentLogs
      .filter(log => log.userId === userId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get all blocked intents for review
   */
  async getBlockedIntents(userId?: string): Promise<IntentLog[]> {
    let logs = this.intentLogs.filter(log => log.status === 'blocked');
    
    if (userId) {
      logs = logs.filter(log => log.userId === userId);
    }

    return logs.reverse();
  }
}

// Singleton instance
export const intentGateway = new WalterIntentGateway();
