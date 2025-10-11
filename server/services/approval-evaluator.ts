/**
 * Approval Evaluator Service
 * 
 * Determines whether Walter (AI SysAdmin) can execute an action automatically
 * or requires manual user approval based on:
 * 1. Approval matrix toggle settings (autoExecute flags)
 * 2. Risk threshold policy (maxPortfolioRiskPercent)
 */

interface ApprovalMatrix {
  autoExecute?: {
    startLiveTrading?: boolean;
    adjustGoals?: boolean;
    modifyGuardrails?: boolean;
    updateFilters?: boolean;
    changeStrategyVariables?: boolean;
    riskThresholdAdjustments?: boolean;
    paperTradingActivation?: boolean;
  };
  policyConstraints?: {
    maxPortfolioRiskPercent?: number;
    maxRiskPerTradePercent?: number;
    maxDailyLossPercent?: number;
    maxExposurePercent?: number;
    maxPositionSizeUSD?: number;
  };
  killSwitchOverride?: boolean;
}

interface ApprovalRequest {
  actionType: string; // e.g., 'startLiveTrading', 'adjustGoals', etc.
  projectedRisk?: number; // Projected portfolio risk percentage
  currentPortfolioValue?: number;
  proposedChange?: any; // Additional context about the change
}

interface ApprovalResult {
  approved: boolean;
  requiresManualApproval: boolean;
  reason: string;
  riskAssessment?: {
    projectedRisk: number;
    threshold: number;
    exceedsThreshold: boolean;
  };
}

export class ApprovalEvaluator {
  /**
   * Evaluates whether an action requires manual approval
   */
  static evaluate(
    approvalMatrix: ApprovalMatrix,
    request: ApprovalRequest
  ): ApprovalResult {
    // 1. Check if action is enabled in autoExecute settings
    const isAutoExecuteEnabled = this.isActionAutoExecuteEnabled(
      approvalMatrix,
      request.actionType
    );

    // 2. Check risk threshold if projectedRisk is provided
    if (request.projectedRisk !== undefined) {
      const riskCheck = this.checkRiskThreshold(
        approvalMatrix,
        request.projectedRisk
      );

      if (riskCheck.exceedsThreshold) {
        return {
          approved: false,
          requiresManualApproval: true,
          reason: `Change requires approval; estimated risk ${request.projectedRisk.toFixed(1)}% exceeds threshold of ${riskCheck.threshold}%`,
          riskAssessment: riskCheck,
        };
      }
    }

    // 3. If toggle is OFF, require manual approval
    if (!isAutoExecuteEnabled) {
      return {
        approved: false,
        requiresManualApproval: true,
        reason: `Action '${request.actionType}' requires manual approval based on approval matrix settings`,
      };
    }

    // 4. Action is approved for automatic execution
    return {
      approved: true,
      requiresManualApproval: false,
      reason: 'Change executed automatically.',
      riskAssessment: request.projectedRisk !== undefined ? {
        projectedRisk: request.projectedRisk,
        threshold: approvalMatrix.policyConstraints?.maxPortfolioRiskPercent || 5.0,
        exceedsThreshold: false,
      } : undefined,
    };
  }

  /**
   * Checks if an action type is enabled in the autoExecute settings
   */
  private static isActionAutoExecuteEnabled(
    approvalMatrix: ApprovalMatrix,
    actionType: string
  ): boolean {
    const autoExecute = approvalMatrix.autoExecute || {};
    
    // Map action types to approval matrix keys
    const key = actionType as keyof typeof autoExecute;
    return autoExecute[key] ?? false;
  }

  /**
   * Checks if projected risk exceeds the threshold
   */
  private static checkRiskThreshold(
    approvalMatrix: ApprovalMatrix,
    projectedRisk: number
  ): {
    projectedRisk: number;
    threshold: number;
    exceedsThreshold: boolean;
  } {
    const threshold = approvalMatrix.policyConstraints?.maxPortfolioRiskPercent || 5.0;
    const exceedsThreshold = projectedRisk > threshold;

    return {
      projectedRisk,
      threshold,
      exceedsThreshold,
    };
  }

  /**
   * Calculates projected portfolio risk for a proposed change
   * This is a placeholder - actual implementation would depend on:
   * - Current portfolio composition
   * - Proposed trade size and parameters
   * - Market volatility
   * - Correlation with existing positions
   */
  static calculateProjectedRisk(
    currentPortfolioValue: number,
    proposedTradeSize: number,
    marketVolatility: number = 0.02 // default 2%
  ): number {
    // Simple risk calculation: (trade size / portfolio value) * volatility * 100
    const positionRisk = (proposedTradeSize / currentPortfolioValue) * marketVolatility * 100;
    
    // Add a safety margin
    const projectedRisk = positionRisk * 1.5;
    
    return Math.min(projectedRisk, 100); // Cap at 100%
  }
}

export default ApprovalEvaluator;
