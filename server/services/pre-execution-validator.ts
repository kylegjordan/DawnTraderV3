import { storage } from '../storage';
import { slippageFeeModel } from './slippage-fee-model';
import { TradeSignal } from './trading-engine';
import { nanoid } from 'nanoid';
import { provenanceLogger } from './provenance-logger';
import { buildSettingsFromGuardrails, checkGuardrailRisk, calculateRiskAmount, type TradeCandidate } from './trade-safety';
import { getCachedNumbersForModule, getCachedNumberRequired } from './module-constants-service.js';
// B-4.5: per-class fee resolution (DB-governed) for the fee-aware validation block.
import { getFrictionForAssetClass } from '../core/math/cost-model.js';
import { resolveAssetClass } from '../../shared/asset-classes.js';

// B72.1 (2026-05-05): goal_alignment + strategy_profiles atomic block.
// Read all weights/thresholds + strategy profile in ONE pass at top of
// validateTrade() so a single validation call sees a consistent snapshot.
// HIGH-risk because mutating any subset between resolve calls would skew the
// alignment math.
const _GOAL_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };
const _STRAT_PROFILE_KEY_BASE = { exchange: '*', assetClass: '*', regime: '*' } as const;

interface GoalAlignmentConfig {
  weightHiRrProfit: number;       // alignment_score_weight_hi_rr_profit
  weightLoRrProfit: number;       // alignment_score_weight_lo_rr_profit
  weightConsistencyA: number;     // alignment_score_weight_consistency_a
  weightConsistencyB: number;     // alignment_score_weight_consistency_b
  highRiskRewardThreshold: number;// high_risk_reward_threshold
  goalAlignmentMinPercent: number;// goal_alignment_min_percent
}

function resolveGoalAlignmentConfig(): GoalAlignmentConfig {
  const m = getCachedNumbersForModule('goal_alignment', _GOAL_KEY);
  return {
    weightHiRrProfit: m['alignment_score_weight_hi_rr_profit'] ?? getCachedNumberRequired('goal_alignment', 'alignment_score_weight_hi_rr_profit', _GOAL_KEY),
    weightLoRrProfit: m['alignment_score_weight_lo_rr_profit'] ?? getCachedNumberRequired('goal_alignment', 'alignment_score_weight_lo_rr_profit', _GOAL_KEY),
    weightConsistencyA: m['alignment_score_weight_consistency_a'] ?? getCachedNumberRequired('goal_alignment', 'alignment_score_weight_consistency_a', _GOAL_KEY),
    weightConsistencyB: m['alignment_score_weight_consistency_b'] ?? getCachedNumberRequired('goal_alignment', 'alignment_score_weight_consistency_b', _GOAL_KEY),
    highRiskRewardThreshold: m['high_risk_reward_threshold'] ?? getCachedNumberRequired('goal_alignment', 'high_risk_reward_threshold', _GOAL_KEY),
    goalAlignmentMinPercent: m['goal_alignment_min_percent'] ?? getCachedNumberRequired('goal_alignment', 'goal_alignment_min_percent', _GOAL_KEY),
  };
}

function resolveStrategyProfile(strategyKey: string): { risk: number; consistency: number } {
  const key = { ..._STRAT_PROFILE_KEY_BASE, strategy: strategyKey };
  const m = getCachedNumbersForModule('strategy_profiles', key);
  // Fallback to neutral 0.5/0.5 if no row for this strategy. Legacy strategies
  // not present in strategy_profiles (e.g. vwap_pullback retired pre-Phase-15b)
  // fall through to this safe-default.
  return {
    risk: m['risk_profile_risk'] ?? 0.5,
    consistency: m['risk_profile_consistency'] ?? 0.5,
  };
}

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

/**
 * Pre-Execution Validator
 * Phase 8.8.3-H4: Uses guardrail-driven checks instead of RiskManager
 */
export class PreExecutionValidator {
  constructor() {}

  async validateTrade(request: ValidationRequest): Promise<ValidationResponse> {
    const traceId = request.traceId || `trace_${nanoid(10)}`;
    const timestamp = new Date().toISOString();

    console.log(`[PreValidator:${traceId}] Validating trade: ${request.signal.symbol} ${request.signal.strategy}`);

    try {
      // Phase 8.8.3-H4: Build complete settings from guardrails
      const settings = await buildSettingsFromGuardrails(request.mode);
      
      const portfolioValue = parseFloat(settings.portfolioValue);
      const riskPct = parseFloat(settings.riskPerTradePct);
      const riskAmount = calculateRiskAmount(portfolioValue, riskPct);

      // B72.1: snapshot goal_alignment config ONCE per validation call
      const goalCfg = resolveGoalAlignmentConfig();

      const goalAlignmentScore = await this.calculateGoalAlignmentScore(
        request.userId,
        request.signal,
        request.mode,
        goalCfg
      );

      const goalAlignmentPercent = Math.round(goalAlignmentScore * 100);
      
      // Phase 8.8.3-H4: Pre-trade guardrail checks
      const tradeCandidate: TradeCandidate = {
        symbol: request.signal.symbol,
        strategy: request.signal.strategy,
        entryPrice: request.signal.entryPrice,
        stopPrice: request.signal.stopPrice,
        targetPrice: request.signal.targetPrice,
      };
      
      const riskCheckResult = await checkGuardrailRisk(request.mode, tradeCandidate);

      const stopDistance = Math.abs(request.signal.entryPrice - request.signal.stopPrice);
      const quantity = riskAmount / stopDistance;

      const slippageModel = slippageFeeModel.modelSlippage(
        request.signal.symbol,
        'buy',
        quantity,
        request.signal.entryPrice
      );

      const orderValue = quantity * request.signal.entryPrice;
      // B-4.5: calculateFees is per-class (DB-governed Tier-1 rates, fail-hard).
      const _b45AssetClass = resolveAssetClass(request.signal.symbol, 'kraken');
      const feeModel = slippageFeeModel.calculateFees(orderValue, false, _b45AssetClass);

      const slippagePercent = Math.abs(slippageModel.slippageBps / 100);
      const feesPercent = (feeModel.totalFees / orderValue) * 100;

      // Phase 27.F.14.B: Fee-Aware Pre-Trade Validation
      // Get fee configuration from system_context
      const systemContext = await storage.getSystemContext(request.mode);
      // B-4.5: the '0.0016'/'0.0026' string fallbacks were a SECOND fee source
      // priced at ~Tier 6 — a buried silent-fallback (surfaced in this batch's
      // sweep; not an exchange-defaults importer, so the pre-audit grep missed
      // it). Explicit system_context overrides still win (legacy operator
      // surface — Phase-16 register candidate); the FALLBACK is now the
      // DB-resolved per-class rate. No hardcoded fee literals remain.
      const _b45Friction = getFrictionForAssetClass(_b45AssetClass);
      const makerFeePct = systemContext?.makerFeePct ? parseFloat(systemContext.makerFeePct) : _b45Friction.feeRateMaker;
      const takerFeePct = systemContext?.takerFeePct ? parseFloat(systemContext.takerFeePct) : _b45Friction.feeRateTaker;
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
      const riskApproved = riskCheckResult.ok;
      const riskReason = !riskCheckResult.ok ? riskCheckResult.reason : undefined;
      
      details.push(`Risk checks: ${riskApproved ? 'PASSED' : 'FAILED'}`);
      if (riskReason) {
        details.push(`Risk reason: ${riskReason}`);
      }
      details.push(`Goal alignment: ${goalAlignmentPercent}%`);
      details.push(`Slippage estimate: ${slippagePercent.toFixed(3)}%`);
      details.push(`Fee estimate: ${feesPercent.toFixed(3)}%`);
      details.push(`Expected gain: ${expectedGainPct.toFixed(3)}%`);
      details.push(`Round-trip fees: ${roundTripFeePct.toFixed(3)}%`);
      details.push(`Net expected gain: ${netExpectedGainPct.toFixed(3)}%`);
      details.push(`Min net profit threshold: ${minNetProfitPct.toFixed(3)}%`);

      // B72.1: goal_alignment_min_percent from module_constants
      const goalAlignmentThreshold = goalCfg.goalAlignmentMinPercent;
      const goalAlignmentPassed = goalAlignmentPercent >= goalAlignmentThreshold;
      const feeProfitabilityPassed = netExpectedGainPct >= minNetProfitPct;

      let canExecute = riskApproved && goalAlignmentPassed && feeProfitabilityPassed;
      let blockReason: string | undefined;

      if (!riskApproved) {
        blockReason = `Risk check failed: ${riskReason}`;
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
        targetService: 'ui',
        sourceTable: 'pre_execution_validation',
        mode: request.mode,
        operation: 'write',
        data: { canExecute, goalAlignmentPercent, riskApproved },
        metadata: {
          userId: request.userId,
          symbol: request.signal.symbol,
          strategy: request.signal.strategy,
          canExecute,
          goalAlignmentScore: goalAlignmentPercent,
          riskApproved
        }
      });

      const response: ValidationResponse = {
        canExecute,
        slippageEstimate: slippagePercent,
        fees: feesPercent,
        goalAlignmentScore: goalAlignmentPercent,
        riskChecks: {
          approved: riskApproved,
          failedCheck: riskReason,
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
    mode: 'live' | 'paper',
    goalCfg: GoalAlignmentConfig
  ): Promise<number> {
    try {
      const goals = mode === 'live' 
        ? await storage.getGoalsLive()
        : await storage.getGoalsPaper();
      
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

      // B72.1: high_risk_reward_threshold and weights from goal_alignment;
      // strategy profile from strategy_profiles (per-strategy scope).
      const isHighRiskReward = riskRewardRatio >= goalCfg.highRiskRewardThreshold;

      const profile = resolveStrategyProfile(signal.strategy);

      let alignmentScore = 0;

      // Branch 1: hi-RR-profit weight if matched, lo-RR-profit weight otherwise.
      if (profitabilityFocus > 0.6 && isHighRiskReward) {
        alignmentScore += goalCfg.weightHiRrProfit;
      } else if (consistencyFocus > 0.6 && riskRewardRatio < goalCfg.highRiskRewardThreshold) {
        alignmentScore += goalCfg.weightHiRrProfit;
      } else {
        alignmentScore += goalCfg.weightLoRrProfit;
      }

      // Branch 2: strategy-profile alignment, weighted by consistency-A.
      const strategyAlignment = (profitabilityFocus * profile.risk) + (consistencyFocus * profile.consistency);
      alignmentScore += strategyAlignment * goalCfg.weightConsistencyA;

      // Branch 3: confidence/RR bonus, weighted by consistency-B.
      if (consistencyFocus > 0.6 && signal.confidence > 0.7) {
        alignmentScore += goalCfg.weightConsistencyB;
      } else if (profitabilityFocus > 0.6 && isHighRiskReward) {
        alignmentScore += goalCfg.weightConsistencyB;
      } else {
        alignmentScore += signal.confidence * goalCfg.weightConsistencyB;
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
