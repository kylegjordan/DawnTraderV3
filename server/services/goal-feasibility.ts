/**
 * Goal Feasibility Service
 * 
 * [9.7] Migrated to guardrails_v2 – legacy dollar fields removed
 * Now uses percentage-based limits from guardrails_v2 table.
 */

import { IStorage } from '../storage';

export type FeasibilityStatus = 'OK' | 'WARN' | 'BLOCK';

export interface FeasibilityResult {
  status: FeasibilityStatus;
  reason: string;
  riskLimit?: number;
  exceedsBy?: number;
  details?: {
    targetPerTrade: number;
    maxPositionPercentPct: number;
    portfolioRiskPerTradePct: number;
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
    console.log(`[GoalFeasibility][9.7] Evaluating goal for user ${userId} in ${mode} mode:`, context);

    const { targetPerTrade, portfolioBalance, exploratoryMode = false } = context;

    // [9.7] Get guardrails_v2 for the mode (replaces legacy guardrails table)
    const guardrails = await this.storage.getGuardrailsV2({ mode });
    if (!guardrails) {
      console.warn(`[GoalFeasibility][9.7] No guardrails_v2 found for ${mode} mode, using conservative defaults`);
      return {
        status: 'BLOCK',
        reason: 'Guardrails not configured for this mode',
      };
    }

    // P19-B8.8: the || '3.00' / '12.00' / '100.00' substitutions are GONE — the
    // exposure one LOOSENED the cap to 100% on a failed read, feeding a BLOCKING
    // feasibility check. Unreadable limits → refuse the feasibility PASS loudly.
    const portfolioRiskPerTradePct = parseFloat(String(guardrails.portfolioRiskPerTradePct));
    const maxPositionPercentPct = parseFloat(String(guardrails.maxPositionPercentPct));
    const maxTotalExposurePct = parseFloat(String(guardrails.maxTotalExposurePct));
    const unreadable = [
      ['portfolioRiskPerTradePct', portfolioRiskPerTradePct],
      ['maxPositionPercentPct', maxPositionPercentPct],
      ['maxTotalExposurePct', maxTotalExposurePct],
    ].filter(([, v]) => !Number.isFinite(v as number) || (v as number) <= 0);
    if (unreadable.length > 0) {
      const fields = unreadable.map(([f]) => f).join(', ');
      console.error(`[P19-B8.8][GUARDRAIL_READ_FAIL check=GOAL_FEASIBILITY mode=${mode}] unreadable: ${fields} — blocking feasibility, no fallback substitution`);
      return {
        status: 'BLOCK',
        reason: `Guardrail limits unreadable (${fields}) — feasibility cannot be evaluated`,
      };
    }

    console.log(`[GoalFeasibility][9.7] Guardrails loaded: portfolioRiskPerTradePct=${portfolioRiskPerTradePct}%, maxPositionPercentPct=${maxPositionPercentPct}%`);

    // Check 1: Target per Trade vs Portfolio Balance (percentage-based)
    if (portfolioBalance && portfolioBalance > 0) {
      const targetPercentage = (targetPerTrade / portfolioBalance) * 100;
      
      // Check against maxPositionPercentPct
      if (targetPercentage > maxPositionPercentPct && !exploratoryMode) {
        const maxAllowed = (portfolioBalance * maxPositionPercentPct) / 100;
        console.log(`[GoalFeasibility][9.7] BLOCK - Target per Trade (${targetPercentage.toFixed(1)}%) exceeds Max Position Percent (${maxPositionPercentPct}%)`);
        return {
          status: 'BLOCK',
          reason: `Target per Trade ($${targetPerTrade.toFixed(2)}) is ${targetPercentage.toFixed(1)}% of portfolio, exceeding ${maxPositionPercentPct}% limit ($${maxAllowed.toFixed(2)})`,
          riskLimit: maxAllowed,
          exceedsBy: targetPerTrade - maxAllowed,
          details: {
            targetPerTrade,
            maxPositionPercentPct,
            portfolioRiskPerTradePct,
            portfolioBalance,
          },
        };
      }

      // Check against max total exposure (looser check)
      if (targetPercentage > maxTotalExposurePct && !exploratoryMode) {
        const maxAllowed = (portfolioBalance * maxTotalExposurePct) / 100;
        console.log(`[GoalFeasibility][9.7] BLOCK - Target per Trade (${targetPercentage.toFixed(1)}%) exceeds Max Total Exposure (${maxTotalExposurePct}%)`);
        return {
          status: 'BLOCK',
          reason: `Target per Trade ($${targetPerTrade.toFixed(2)}) is ${targetPercentage.toFixed(1)}% of portfolio, exceeding ${maxTotalExposurePct}% max exposure`,
          riskLimit: maxAllowed,
          exceedsBy: targetPerTrade - maxAllowed,
          details: {
            targetPerTrade,
            maxPositionPercentPct,
            portfolioRiskPerTradePct,
            portfolioBalance,
          },
        };
      }

      // WARN if approaching limit (> 80% of max position)
      if (targetPercentage > maxPositionPercentPct * 0.8) {
        console.log(`[GoalFeasibility][9.7] WARN - Target per Trade (${targetPercentage.toFixed(1)}%) approaching Max Position Percent (${maxPositionPercentPct}%)`);
        return {
          status: 'WARN',
          reason: `Target per Trade ($${targetPerTrade.toFixed(2)}) is ${targetPercentage.toFixed(1)}% of portfolio, approaching ${maxPositionPercentPct}% limit`,
          details: {
            targetPerTrade,
            maxPositionPercentPct,
            portfolioRiskPerTradePct,
            portfolioBalance,
          },
        };
      }
    }

    // All checks passed
    console.log(`[GoalFeasibility][9.7] OK - Target per Trade ($${targetPerTrade}) is within guardrails`);
    return {
      status: 'OK',
      reason: 'Goal is within all guardrails',
      details: {
        targetPerTrade,
        maxPositionPercentPct,
        portfolioRiskPerTradePct,
        portfolioBalance,
      },
    };
  }
}
