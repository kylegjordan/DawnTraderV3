import { storage } from '../storage';
import { RiskManager } from './risk-manager';
import { slippageFeeModel } from './slippage-fee-model';
import { TradeSignal } from './trading-engine';
import { nanoid } from 'nanoid';
import { provenanceLogger } from './provenance-logger';

export interface ValidationRequest {
  userId: string;
  signal: TradeSignal;
  mode: 'live' | 'paper';
  traceId?: string;
}

export interface ValidationResponse {
  canExecute: boolean;
  slippageEstimate: number;
  fees: number;
  goalAlignmentScore: number;
  riskChecks: {
    approved: boolean;
    failedCheck?: string;
    details: string[];
  };
  traceId: string;
  timestamp: string;
  blockReason?: string;
}

export class PreExecutionValidator {
  private riskManager: RiskManager;

  constructor() {
    this.riskManager = new RiskManager();
  }

  async validateTrade(request: ValidationRequest): Promise<ValidationResponse> {
    const traceId = request.traceId || `trace_${nanoid(10)}`;
    const timestamp = new Date().toISOString();

    console.log(`[PreValidator:${traceId}] Validating trade: ${request.signal.symbol} ${request.signal.strategy}`);

    try {
      const settings = await storage.getTradingSettings(request.userId);
      if (!settings) {
        throw new Error('Trading settings not found');
      }

      const goalAlignmentScore = await this.calculateGoalAlignmentScore(
        request.userId,
        request.signal,
        request.mode
      );

      const goalAlignmentPercent = Math.round(goalAlignmentScore * 100);
      
      const riskCheckResult = await this.riskManager.checkPreTradeRisk(
        request.userId,
        request.signal,
        settings
      );

      const riskAmount = parseFloat(settings.riskPerTrade || '100');
      const stopDistance = Math.abs(request.signal.entryPrice - request.signal.stopPrice);
      const quantity = riskAmount / stopDistance;

      const slippageModel = slippageFeeModel.modelSlippage(
        request.signal.symbol,
        'buy',
        quantity,
        request.signal.entryPrice
      );

      const orderValue = quantity * request.signal.entryPrice;
      const feeModel = slippageFeeModel.calculateFees(orderValue, false);

      const slippagePercent = Math.abs(slippageModel.slippageBps / 100);
      const feesPercent = (feeModel.totalFees / orderValue) * 100;

      // Phase 27.F.14.B: Fee-Aware Pre-Trade Validation
      // Get fee configuration from system_context
      const systemContext = await storage.getSystemContext(request.mode);
      const makerFeePct = parseFloat(systemContext?.makerFeePct || '0.0016');
      const takerFeePct = parseFloat(systemContext?.takerFeePct || '0.0026');
      const defaultFeeMode = systemContext?.defaultFeeMode || 'taker';
      const minNetProfitThreshold = parseFloat(systemContext?.minNetProfitThreshold || '0.0030');

      // Calculate expected profit percentage
      const profitDistance = Math.abs(request.signal.targetPrice - request.signal.entryPrice);
      const expectedGainPct = (profitDistance / request.signal.entryPrice) * 100;

      // Calculate round-trip fee (entry + exit)
      const feeRate = defaultFeeMode === 'maker' ? makerFeePct : takerFeePct;
      const roundTripFeePct = feeRate * 2 * 100; // Convert to percentage and double for round trip

      // Calculate net expected gain after fees
      const netExpectedGainPct = expectedGainPct - roundTripFeePct;
      const minNetProfitPct = minNetProfitThreshold * 100;

      const details: string[] = [];
      details.push(`Risk checks: ${riskCheckResult.approved ? 'PASSED' : 'FAILED'}`);
      if (riskCheckResult.reason) {
        details.push(`Risk reason: ${riskCheckResult.reason}`);
      }
      details.push(`Goal alignment: ${goalAlignmentPercent}%`);
      details.push(`Slippage estimate: ${slippagePercent.toFixed(3)}%`);
      details.push(`Fee estimate: ${feesPercent.toFixed(3)}%`);
      details.push(`Expected gain: ${expectedGainPct.toFixed(3)}%`);
      details.push(`Round-trip fees: ${roundTripFeePct.toFixed(3)}%`);
      details.push(`Net expected gain: ${netExpectedGainPct.toFixed(3)}%`);
      details.push(`Min net profit threshold: ${minNetProfitPct.toFixed(3)}%`);

      const goalAlignmentThreshold = 75;
      const goalAlignmentPassed = goalAlignmentPercent >= goalAlignmentThreshold;
      const feeProfitabilityPassed = netExpectedGainPct >= minNetProfitPct;

      let canExecute = riskCheckResult.approved && goalAlignmentPassed && feeProfitabilityPassed;
      let blockReason: string | undefined;

      if (!riskCheckResult.approved) {
        blockReason = `Risk check failed: ${riskCheckResult.reason}`;
        details.push(`❌ Blocked: ${blockReason}`);
      } else if (!goalAlignmentPassed) {
        blockReason = `Goal alignment score ${goalAlignmentPercent}% below threshold ${goalAlignmentThreshold}%`;
        details.push(`❌ Blocked: ${blockReason}`);
      } else if (!feeProfitabilityPassed) {
        blockReason = `Fee-adjusted gain ${netExpectedGainPct.toFixed(3)}% below threshold ${minNetProfitPct.toFixed(3)}%`;
        details.push(`❌ Blocked: ${blockReason}`);
        console.log(`[LATTI] Trade rejected – fee-adjusted gain below threshold (${netExpectedGainPct.toFixed(3)}% < ${minNetProfitPct.toFixed(3)}%)`);
      } else {
        details.push('✅ All validations passed (including fee-aware profitability)');
      }

      await provenanceLogger.logLineage({
        traceId,
        originatingService: 'bob',
        targetService: 'walter',
        sourceTable: 'pre_execution_validation',
        mode: request.mode,
        operation: 'write',
        data: { canExecute, goalAlignmentPercent, riskApproved: riskCheckResult.approved },
        metadata: {
          userId: request.userId,
          symbol: request.signal.symbol,
          strategy: request.signal.strategy,
          canExecute,
          goalAlignmentScore: goalAlignmentPercent,
          riskApproved: riskCheckResult.approved
        }
      });

      const response: ValidationResponse = {
        canExecute,
        slippageEstimate: slippagePercent,
        fees: feesPercent,
        goalAlignmentScore: goalAlignmentPercent,
        riskChecks: {
          approved: riskCheckResult.approved,
          failedCheck: riskCheckResult.reason,
          details
        },
        traceId,
        timestamp,
        blockReason
      };

      console.log(`[PreValidator:${traceId}] Validation result: ${canExecute ? 'APPROVED' : 'BLOCKED'}`);
      if (blockReason) {
        console.log(`[PreValidator:${traceId}] Block reason: ${blockReason}`);
      }

      return response;

    } catch (error: any) {
      console.error(`[PreValidator:${traceId}] Validation error:`, error);
      
      return {
        canExecute: false,
        slippageEstimate: 0,
        fees: 0,
        goalAlignmentScore: 0,
        riskChecks: {
          approved: false,
          failedCheck: 'Validation error',
          details: [`Error: ${error.message}`]
        },
        traceId,
        timestamp,
        blockReason: `Validation error: ${error.message}`
      };
    }
  }

  private async calculateGoalAlignmentScore(
    userId: string,
    signal: TradeSignal,
    mode: 'live' | 'paper'
  ): Promise<number> {
    try {
      const goals = mode === 'live' 
        ? await storage.getUserGoalsLive(userId)
        : await storage.getUserGoalsPaper(userId);
      
      const profConsGoal = goals.find(g => g.metricName === 'profitability_vs_consistency');
      
      if (!profConsGoal || !profConsGoal.goalValue) {
        console.log('[PreValidator] No profitability_vs_consistency goal found, allowing trade (score: 1.0)');
        return 1.0;
      }

      const goalValueNum = parseFloat(profConsGoal.goalValue);
      if (isNaN(goalValueNum) || goalValueNum < 1 || goalValueNum > 10) {
        console.warn(`[PreValidator] Invalid goalValue: ${profConsGoal.goalValue}, allowing trade (score: 1.0)`);
        return 1.0;
      }

      const profitabilityFocus = goalValueNum / 10;
      const consistencyFocus = 1 - profitabilityFocus;

      const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
      
      if (stopDistance < 0.000001) {
        console.warn(`[PreValidator] Invalid stop distance (${stopDistance}), allowing trade (score: 1.0)`);
        return 1.0;
      }

      const profitDistance = Math.abs(signal.targetPrice - signal.entryPrice);
      const riskRewardRatio = profitDistance / stopDistance;
      
      if (!isFinite(riskRewardRatio) || riskRewardRatio < 0) {
        console.warn(`[PreValidator] Invalid risk/reward ratio (${riskRewardRatio}), allowing trade (score: 1.0)`);
        return 1.0;
      }

      const isHighRiskReward = riskRewardRatio >= 2.0;
      
      const strategyRiskProfile: { [key: string]: { risk: number; consistency: number } } = {
        'vwap_pullback': { risk: 0.5, consistency: 0.8 },
        'abcd_long': { risk: 0.7, consistency: 0.6 },
        'sma_trend_ride': { risk: 0.6, consistency: 0.7 },
      };

      const profile = strategyRiskProfile[signal.strategy] || { risk: 0.5, consistency: 0.5 };

      let alignmentScore = 0;

      if (profitabilityFocus > 0.6 && isHighRiskReward) {
        alignmentScore += 0.4;
      } else if (consistencyFocus > 0.6 && riskRewardRatio < 2.0) {
        alignmentScore += 0.4;
      } else {
        alignmentScore += 0.2;
      }

      const strategyAlignment = (profitabilityFocus * profile.risk) + (consistencyFocus * profile.consistency);
      alignmentScore += strategyAlignment * 0.3;

      if (consistencyFocus > 0.6 && signal.confidence > 0.7) {
        alignmentScore += 0.3;
      } else if (profitabilityFocus > 0.6 && isHighRiskReward) {
        alignmentScore += 0.3;
      } else {
        alignmentScore += signal.confidence * 0.3;
      }

      const finalAlignmentScore = Math.max(0, Math.min(1, alignmentScore));
      
      if (!isFinite(finalAlignmentScore) || isNaN(finalAlignmentScore)) {
        console.warn(`[PreValidator] Invalid final alignment score (${finalAlignmentScore}), allowing trade (score: 1.0)`);
        return 1.0;
      }
      
      return finalAlignmentScore;
      
    } catch (error) {
      console.error('[PreValidator] Error calculating goal alignment score:', error);
      return 1.0;
    }
  }
}

export const preExecutionValidator = new PreExecutionValidator();
