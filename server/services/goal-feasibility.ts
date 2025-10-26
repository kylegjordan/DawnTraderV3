import { IStorage } from '../storage';

export type FeasibilityStatus = 'OK' | 'WARN' | 'BLOCK';

export interface FeasibilityResult {
  status: FeasibilityStatus;
  reason: string;
  riskLimit?: number;
  exceedsBy?: number;
  details?: {
    targetPerTrade: number;
    maxRiskPerTradeLimit: number;
    maxPositionSize: number;
    portfolioBalance?: number;
  };
}

export interface FeasibilityContext {
  targetPerTrade: number;
  tradesPerDay?: number;
  portfolioBalance?: number;
  exploratoryMode?: boolean;
}

export class GoalFeasibilityService {
  constructor(private storage: IStorage) {}

  async evaluateGoal(
    userId: string,
    mode: 'live' | 'paper',
    context: FeasibilityContext
  ): Promise<FeasibilityResult> {
    console.log(`[GoalFeasibility] Evaluating goal for user ${userId} in ${mode} mode:`, context);

    const { targetPerTrade, portfolioBalance, exploratoryMode = false } = context;

    // Get guardrails for the mode
    const guardrails = await this.storage.getGuardrails({ mode });
    if (!guardrails) {
      console.warn(`[GoalFeasibility] No guardrails found for ${mode} mode, using conservative defaults`);
      return {
        status: 'BLOCK',
        reason: 'Guardrails not configured for this mode',
      };
    }

    const maxRiskPerTradeLimit = parseFloat(guardrails.maxRiskPerTradeLimit || '1000');
    const maxPositionSize = parseFloat(guardrails.maxPositionSize || '5000');

    console.log(`[GoalFeasibility] Guardrails loaded: maxRiskPerTradeLimit=$${maxRiskPerTradeLimit}, maxPositionSize=$${maxPositionSize}`);

    // Check 1: Target per Trade vs Max Risk Per Trade Limit
    // WARN at 1×, BLOCK at 2×
    const riskRatio = targetPerTrade / maxRiskPerTradeLimit;
    
    if (riskRatio > 2.0 && !exploratoryMode) {
      const exceedsBy = targetPerTrade - maxRiskPerTradeLimit;
      console.log(`[GoalFeasibility] BLOCK - Target per Trade ($${targetPerTrade}) exceeds Max Risk Per Trade Limit by ${riskRatio.toFixed(2)}×`);
      return {
        status: 'BLOCK',
        reason: `Target per Trade ($${targetPerTrade.toFixed(2)}) exceeds Max Risk Per Trade Limit by ${riskRatio.toFixed(2)}× (limit: $${maxRiskPerTradeLimit.toFixed(2)})`,
        riskLimit: maxRiskPerTradeLimit,
        exceedsBy,
        details: {
          targetPerTrade,
          maxRiskPerTradeLimit,
          maxPositionSize,
          portfolioBalance,
        },
      };
    }

    if (riskRatio > 1.0) {
      const exceedsBy = targetPerTrade - maxRiskPerTradeLimit;
      console.log(`[GoalFeasibility] WARN - Target per Trade ($${targetPerTrade}) approaches Max Risk Per Trade Limit (${riskRatio.toFixed(2)}×)`);
      return {
        status: 'WARN',
        reason: `Target per Trade ($${targetPerTrade.toFixed(2)}) approaches Max Risk Per Trade Limit (${riskRatio.toFixed(2)}× of $${maxRiskPerTradeLimit.toFixed(2)})`,
        riskLimit: maxRiskPerTradeLimit,
        exceedsBy,
        details: {
          targetPerTrade,
          maxRiskPerTradeLimit,
          maxPositionSize,
          portfolioBalance,
        },
      };
    }

    // Check 2: Target per Trade vs Max Position Size
    if (targetPerTrade > maxPositionSize && !exploratoryMode) {
      const exceedsBy = targetPerTrade - maxPositionSize;
      console.log(`[GoalFeasibility] BLOCK - Target per Trade ($${targetPerTrade}) exceeds Max Position Size ($${maxPositionSize})`);
      return {
        status: 'BLOCK',
        reason: `Target per Trade ($${targetPerTrade.toFixed(2)}) exceeds Max Position Size limit of $${maxPositionSize.toFixed(2)}`,
        riskLimit: maxPositionSize,
        exceedsBy,
        details: {
          targetPerTrade,
          maxRiskPerTradeLimit,
          maxPositionSize,
          portfolioBalance,
        },
      };
    }

    // Check 3: Target per Trade vs Portfolio Balance (if available)
    if (portfolioBalance && portfolioBalance > 0) {
      const portfolioPercentage = (targetPerTrade / portfolioBalance) * 100;
      // Conservative check: warn if target per trade is more than 10% of portfolio
      if (portfolioPercentage > 20 && !exploratoryMode) {
        console.log(`[GoalFeasibility] BLOCK - Target per Trade is ${portfolioPercentage.toFixed(1)}% of portfolio balance`);
        return {
          status: 'BLOCK',
          reason: `Target per Trade ($${targetPerTrade.toFixed(2)}) is ${portfolioPercentage.toFixed(1)}% of portfolio ($${portfolioBalance.toFixed(2)}). Maximum recommended: 20%`,
          riskLimit: portfolioBalance * 0.2,
          exceedsBy: targetPerTrade - (portfolioBalance * 0.2),
          details: {
            targetPerTrade,
            maxRiskPerTradeLimit,
            maxPositionSize,
            portfolioBalance,
          },
        };
      }

      if (portfolioPercentage > 10) {
        console.log(`[GoalFeasibility] WARN - Target per Trade is ${portfolioPercentage.toFixed(1)}% of portfolio balance`);
        return {
          status: 'WARN',
          reason: `Target per Trade ($${targetPerTrade.toFixed(2)}) is ${portfolioPercentage.toFixed(1)}% of portfolio ($${portfolioBalance.toFixed(2)}). Recommended: <10%`,
          riskLimit: portfolioBalance * 0.1,
          exceedsBy: targetPerTrade - (portfolioBalance * 0.1),
          details: {
            targetPerTrade,
            maxRiskPerTradeLimit,
            maxPositionSize,
            portfolioBalance,
          },
        };
      }
    }

    // All checks passed
    console.log(`[GoalFeasibility] OK - Target per Trade ($${targetPerTrade}) is within guardrails`);
    return {
      status: 'OK',
      reason: 'Goal is within all guardrails',
      details: {
        targetPerTrade,
        maxRiskPerTradeLimit,
        maxPositionSize,
        portfolioBalance,
      },
    };
  }
}
