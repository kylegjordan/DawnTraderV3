/**
 * Alert Action Handler Service
 * Executes actions for actionable alerts
 */

import { storage } from '../storage';
import { SystemAlert } from '@shared/schema';

interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

export class AlertActionHandler {
  /**
   * Execute an action based on alert type and user's choice
   */
  static async executeAction(
    alert: SystemAlert,
    action: string,
    userId: string
  ): Promise<ActionResult> {
    // Validate action exists in alert's action buttons
    const actionButtons = alert.actionButtons as any[];
    const validAction = actionButtons?.find((btn: any) => btn.action === action);
    
    if (!validAction) {
      throw new Error(`Invalid action "${action}" for this alert`);
    }

    // Route to appropriate handler based on alert type
    switch (alert.alertType) {
      case 'approval_required':
        return await this.handleApprovalAction(alert, action, userId);
      
      case 'parameter_change':
      case 'risk_adjustment':
        return await this.handleParameterChangeAction(alert, action, userId);
      
      case 'strategy_activation':
        return await this.handleStrategyActivationAction(alert, action, userId);
      
      case 'kill_switch_reset':
        return await this.handleKillSwitchAction(alert, action, userId);
      
      case 'trading_mode_change':
        return await this.handleModeChangeAction(alert, action, userId);
      
      case 'confirmation_needed':
        return await this.handleConfirmationAction(alert, action, userId);
      
      default:
        // Generic handler for unknown types
        return await this.handleGenericAction(alert, action, userId);
    }
  }

  /**
   * Handle approval actions (approve/reject)
   */
  private static async handleApprovalAction(
    alert: SystemAlert,
    action: string,
    userId: string
  ): Promise<ActionResult> {
    const metadata = alert.metadata as any;
    
    if (action === 'approve') {
      // Get proposed adjustment from metadata
      const adjustmentId = metadata?.adjustmentId;
      
      if (adjustmentId) {
        // Update adjustment status to approved
        await storage.updateProposedAdjustment(adjustmentId, {
          status: 'approved',
          appliedAt: new Date()
        });

        return {
          success: true,
          message: 'Adjustment approved and will be applied',
          data: { adjustmentId }
        };
      }

      return {
        success: true,
        message: 'Approval recorded',
        data: { action: 'approved' }
      };
    }

    if (action === 'reject') {
      const adjustmentId = metadata?.adjustmentId;
      
      if (adjustmentId) {
        await storage.updateProposedAdjustment(adjustmentId, {
          status: 'rejected',
          appliedAt: new Date()
        });

        return {
          success: true,
          message: 'Adjustment rejected',
          data: { adjustmentId }
        };
      }

      return {
        success: true,
        message: 'Rejection recorded',
        data: { action: 'rejected' }
      };
    }

    throw new Error(`Unknown approval action: ${action}`);
  }

  /**
   * Handle parameter change actions
   */
  private static async handleParameterChangeAction(
    alert: SystemAlert,
    action: string,
    userId: string
  ): Promise<ActionResult> {
    const metadata = alert.metadata as any;
    const { parameter, oldValue, newValue } = metadata || {};

    if (action === 'approve') {
      // Apply the parameter change
      const updateData: any = {};
      updateData[parameter] = newValue;
      
      await storage.updateTradingSettings(userId, updateData);

      return {
        success: true,
        message: `Parameter "${parameter}" updated from ${oldValue} to ${newValue}`,
        data: { parameter, oldValue, newValue }
      };
    }

    if (action === 'reject') {
      return {
        success: true,
        message: `Parameter change rejected. Keeping "${parameter}" at ${oldValue}`,
        data: { parameter, value: oldValue }
      };
    }

    throw new Error(`Unknown parameter change action: ${action}`);
  }

  /**
   * Handle strategy activation actions
   */
  private static async handleStrategyActivationAction(
    alert: SystemAlert,
    action: string,
    userId: string
  ): Promise<ActionResult> {
    const metadata = alert.metadata as any;
    const { strategy, mode } = metadata || {};

    if (action === 'approve') {
      // Enable the strategy
      await storage.upsertStrategySettings({
        mode: mode || 'paper',
        strategy,
        enabled: true,
        params: {}
      });

      return {
        success: true,
        message: `Strategy "${strategy}" activated in ${mode} mode`,
        data: { strategy, mode, enabled: true }
      };
    }

    if (action === 'reject') {
      return {
        success: true,
        message: `Strategy activation rejected`,
        data: { strategy, enabled: false }
      };
    }

    throw new Error(`Unknown strategy activation action: ${action}`);
  }

  /**
   * REB 8.8.3-KS-B: Handle kill switch actions
   * Kill switch is now auto-cleared on trading start, so these actions are informational only
   */
  private static async handleKillSwitchAction(
    alert: SystemAlert,
    action: string,
    userId: string
  ): Promise<ActionResult> {
    if (action === 'approve' || action === 'retry') {
      // REB 8.8.3-KS-B: Kill switch is auto-cleared when user starts trading
      // This action just acknowledges the alert
      return {
        success: true,
        message: 'Kill switch acknowledged. Resume trading to continue.',
        data: { action: 'acknowledged' }
      };
    }

    if (action === 'ignore') {
      return {
        success: true,
        message: 'Kill switch alert dismissed. Resume trading when ready.',
        data: { action: 'ignored' }
      };
    }

    throw new Error(`Unknown kill switch action: ${action}`);
  }

  /**
   * Handle trading mode change actions
   */
  private static async handleModeChangeAction(
    alert: SystemAlert,
    action: string,
    userId: string
  ): Promise<ActionResult> {
    const metadata = alert.metadata as any;
    const { newMode } = metadata || {};

    if (action === 'approve') {
      // This would typically update user's trading mode
      // For now, just acknowledge
      return {
        success: true,
        message: `Mode change to ${newMode} approved`,
        data: { mode: newMode }
      };
    }

    if (action === 'reject') {
      return {
        success: true,
        message: 'Mode change rejected',
        data: { action: 'rejected' }
      };
    }

    throw new Error(`Unknown mode change action: ${action}`);
  }

  /**
   * Handle generic confirmation actions
   */
  private static async handleConfirmationAction(
    alert: SystemAlert,
    action: string,
    userId: string
  ): Promise<ActionResult> {
    return {
      success: true,
      message: `Action "${action}" recorded`,
      data: { action, alertType: alert.alertType }
    };
  }

  /**
   * Fallback handler for unknown alert types
   */
  private static async handleGenericAction(
    alert: SystemAlert,
    action: string,
    userId: string
  ): Promise<ActionResult> {
    console.log(`[AlertActionHandler] Generic action handler: ${alert.alertType} - ${action}`);
    
    return {
      success: true,
      message: `Action "${action}" acknowledged`,
      data: { alertType: alert.alertType, action }
    };
  }
}
