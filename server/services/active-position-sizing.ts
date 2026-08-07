/**
 * Phase 8.8.3-J7/AJ9/B6: Paper-Mode Position Sizing Helper
 * 
 * Pure function for calculating position sizes during signal generation (P2).
 * This helper does NOT access the database or make any network calls.
 * All inputs must be provided by the caller.
 * 
 * Constraints:
 * - Paper mode only
 * - No legacy risk modules
 * - Uses guardrailsV2 configuration
 * 
 * AJ9 Addition:
 * - getMaxPositionBufferFactor() (0.97) provides 3% wiggle room below max position cap
 * - This prevents legitimate trades from being blocked by MAX_POSITION due to
 *   price changes between RTB sizing and execution
 * 
 * B6 Refactor:
 * - maxNotional is now derived from exposure budget (portfolioValue × maxTotalExposurePct)
 * - This aligns sizing with the MAX_TOTAL_EXPOSURE guardrail check
 * - Formula: exposureBudget = portfolioValue × (maxTotalExposurePct / 100)
 *            maxNotional = exposureBudget × (maxPositionPercentPct / 100)
 */

import type { GuardrailsV2 } from '@shared/schema';
import { b5SizingAudit } from './b5-sizing-audit.js';
import { getScalingFactor } from './risk-concentration.js';
// B79.0n.ORCHESTRATOR (2026-05-27): per-asset-class pattern pool guardrails
// dispatcher. Replaces the prior class-bound `PATTERN_POOL_GUARDRAILS` import
// from `crypto_spot/pattern-pool-filters.js`. xstock pattern signals now
// correctly read XSTOCK_PATTERN_POOL_GUARDRAILS (DB-resolved 0.50 cap vs
// crypto's literal 0.15) via the dispatcher.
import { getPatternPoolGuardrailsForAssetClass } from '../asset_classes/pattern-pool-dispatch.js';
import type { AssetClass } from '../../shared/asset-classes.js';
// B72 (2026-05-05): getMaxPositionBufferFactor() moved to module='active_sizing'.
import { getCachedNumberRequired } from './module-constants-service.js';
// P19-B8.8: consecutive read-fail rail — in-memory counter increments only (the
// threshold alert write lives inside rtb-metrics, not here; sizing stays sync).
import { rtbMetricsService } from './rtb-metrics-service.js';

function getMaxPositionBufferFactor(): number {
  return getCachedNumberRequired('active_sizing', 'max_position_buffer_factor',
    { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
}

/**
 * AJ9: Buffer factor for max position sizing.
 * Size positions at 97% of max to provide 3% wiggle room for price fluctuations.
 * This prevents trades from being blocked by MAX_POSITION during execution.
 *
 * B72: literal removed — value now read via getMaxPositionBufferFactor()
 * declared above (module_constants 'active_sizing.max_position_buffer_factor',
 * seeded at 0.97).
 */

export type StrategyType = 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout' | 'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap' | 'dhma';

export interface ActivePositionSizingParams {
  portfolioValue: number;
  guardrails: GuardrailsV2 | null | undefined;
  entryPrice: number;
  stopPrice: number;
  symbol: string;
  strategy: StrategyType;
  /**
   * B-NEW-43 chunk 3 (2026-05-22): the signal's source pool ('quant' | 'pattern').
   * Phase 14.5 pattern-pool reduced sizing keys off this. Optional — absent
   * defaults to 'quant' (the standard lane). Previously read from an undeclared
   * `signal` reference (TS2304); now passed explicitly by callers.
   */
  sourcePool?: string;
  /**
   * B79.0n.ORCHESTRATOR (2026-05-27): REQUIRED per-class pattern pool guardrails
   * dispatcher key. Resolved deterministically by callers via
   * `resolveAssetClass(symbol, 'kraken')` per Langston Step 2 no-silent-fallback
   * disposition. No default — explicit class required. xstock pattern signals
   * route to XSTOCK_PATTERN_POOL_GUARDRAILS (0.50 cap, DB-resolved); crypto
   * signals route to PATTERN_POOL_GUARDRAILS (0.15 cap, literal).
   */
  assetClass: AssetClass;
  /**
   * P19-B4b D5 (S4 isolation): the trading mode this sizing is for. Threaded so the
   * correlation/concentration scaling factor is read from the correct per-mode store
   * (paper vs live position weights are isolated). Required — no silent default.
   */
  mode: 'live' | 'paper';
}

export interface ActivePositionSizingResult {
  quantity: number;
  estimatedValue: number;
  sizingDetails?: {
    portfolioValue: number;
    stopDistance: number;
    // obj-1: dollar risk is an OUTPUT under fixed-notional sizing, not an input. It varies
    // with stop distance instead of pinning size. Kept because Phase-25's R-rank-vs-$EV
    // work consumed the old risk figure and needs a real one.
    dollarRiskAtStop: number;
    dollarRiskPctOfPortfolio: number;
    maxPositionPct: number;
    maxTotalExposurePct: number;
    exposureBudget: number;
    // obj-1: the intended per-trade size = exposureBudget × maxPositionPct. This IS the
    // size now; it is no longer a ceiling that a risk-derived number occasionally hit.
    perTradeNotional: number;
    bufferedMaxNotional: number;
    // obj-1: retained at false — nothing clamps when the size IS the cap. Kept in the
    // contract because a live consumer reads it; see rtb-metrics-service.
    wasClamped: boolean;
    // P19-B7.1 (OBJ-5), RE-POINTED by obj-1: deployed notional ÷ intended per-trade
    // notional. ≤1; = 1 when the full intended size was deployed. Under fixed-notional the
    // only thing that can reduce it is the covariance correlationScale — which never flips
    // wasClamped (CC-A A.2b) — so this remains the bind signal a wasClamped-only watch misses.
    effectiveRiskFractionRatio: number;
  };
}

/**
 * Calculate paper-mode position size for a signal.
 * 
 * Pure function - no DB calls, no network calls.
 * 
 * B6 Logic:
 * 1. Calculate risk amount: portfolioValue × (portfolioRiskPerTradePct / 100)
 * 2. Calculate stop distance: |entryPrice - stopPrice|
 * 3. Calculate raw quantity (risk-based): riskAmount / stopDistance
 * 4. Calculate exposure budget: portfolioValue × (maxTotalExposurePct / 100)
 * 5. Calculate maxNotional: exposureBudget × (maxPositionPercentPct / 100)
 * 6. Apply buffer factor to maxNotional
 * 7. Clamp quantity if risk-based notional exceeds bufferedMaxNotional
 * 8. Return quantity and estimatedValue
 * 
 * Returns { quantity: 0, estimatedValue: 0 } for any invalid input
 * (NaN, zero, negative values, malformed data)
 */
export function sizeActivePositionForSignal(params: ActivePositionSizingParams): ActivePositionSizingResult {
  const { portfolioValue, guardrails, entryPrice, stopPrice, symbol, strategy, mode } = params;
  
  const invalidResult: ActivePositionSizingResult = { quantity: 0, estimatedValue: 0 };
  
  if (!Number.isFinite(portfolioValue) || portfolioValue <= 0) {
    console.log(`[B6][SIZING] Invalid portfolioValue (${portfolioValue}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    console.log(`[B6][SIZING] Invalid entryPrice (${entryPrice}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  if (!Number.isFinite(stopPrice) || stopPrice <= 0) {
    console.log(`[B6][SIZING] Invalid stopPrice (${stopPrice}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  const stopDistance = Math.abs(entryPrice - stopPrice);
  if (stopDistance === 0 || !Number.isFinite(stopDistance)) {
    console.log(`[B6][SIZING] Invalid stopDistance (${stopDistance}) for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  // P19-B8.8: DB-governed sizing inputs are read RAW — the hardcoded fallbacks
  // ('1.50'/'10.00'/null→100) and the safe* re-default layer are retired. The schema
  // makes all three fields notNull-with-default and both live callers pass a full
  // guardrails_v2 row or null, so a missing/unparseable/non-positive value can only
  // mean a real fault (missing row, schema drift, out-of-range write). The old
  // null→100 branch silently UNCAPPED portfolio exposure on exactly that fault.
  // Contract: refuse the signal loudly (invalidResult → the engine's SIZING_INVALID
  // path; loop intact, nothing sized on fabricated inputs) + rail the refusal so a
  // persistently broken row alerts instead of silently starving trading.
  const guardrailsAny = guardrails as any;
  const sizingInputs: Array<[string, unknown]> = [
    ['portfolioRiskPerTradePct', guardrailsAny?.portfolioRiskPerTradePct],
    ['maxPositionPercentPct', guardrailsAny?.maxPositionPercentPct],
    ['maxTotalExposurePct', guardrailsAny?.maxTotalExposurePct],
  ];
  const parsedInputs: Record<string, number> = {};
  for (const [field, raw] of sizingInputs) {
    const value = raw != null ? parseFloat(String(raw)) : NaN;
    if (!Number.isFinite(value) || value <= 0) {
      console.error(`[P19-B8.8][SIZING_GUARDRAIL_READ_FAIL field=${field} mode=${mode}] raw=${String(raw)} for ${symbol} — refusing signal, no fallback substitution`);
      rtbMetricsService.recordSizingGuardrailReadFail(field, mode);
      return invalidResult;
    }
    parsedInputs[field] = value;
  }
  rtbMetricsService.recordSizingGuardrailReadOk();
  const safeRiskPct = parsedInputs.portfolioRiskPerTradePct;
  const safeMaxPositionPct = parsedInputs.maxPositionPercentPct;
  const safeMaxTotalExposurePct = parsedInputs.maxTotalExposurePct;
  // Phase 14.5: Pattern pool signals use reduced position sizing (15% vs 25%)
  // B-NEW-43 chunk 3 (2026-05-22): sourcePool now arrives as a typed param —
  // the prior `signal` reference was undeclared (TS2304).
  const signalSourcePool = params.sourcePool || 'quant';
  let effectiveMaxPositionPct = safeMaxPositionPct;
  if (signalSourcePool === 'pattern') {
    // B79.0n.ORCHESTRATOR (2026-05-27): resolve per-class pattern pool cap via
    // dispatcher. Crypto returns 0.15 literal (unchanged); xstock returns
    // 0.50 DB-resolved (real behavioral correction — pre-batch was crypto's
    // 0.15 due to class-bound import; post-batch routes correctly).
    const guardrails = getPatternPoolGuardrailsForAssetClass(params.assetClass);
    const patternMaxPct = guardrails.MAX_POSITION_PCT * 100;
    if (effectiveMaxPositionPct > patternMaxPct) {
      effectiveMaxPositionPct = patternMaxPct;
      console.log(`[14.5][SIZING][B79.0n.ORCHESTRATOR] Pattern pool signal — capping position at ${patternMaxPct}% (vs ${safeMaxPositionPct}% quant) assetClass=${params.assetClass}`);
    }
  }
  
  // ══════════════════════════════════════════════════════════════════════════════
  // obj-1: FIXED-NOTIONAL SIZING — B-SIZING-DEC-RESTORE (Kyle's ruling, 2026-08-06)
  // ══════════════════════════════════════════════════════════════════════════════
  // Kyle's words: "$800 balance, portfolio exposure 100%, percent allocated per any
  // trade 25%, then we would essentially have 4 trading slots at $200 each."
  //
  // So the per-trade size is a SHARE OF THE PORTFOLIO, not a function of where the stop
  // sits. The old form was `riskAmount / stopDistance`, which made position size move
  // INVERSELY with stop distance — a tight stop bought a huge position and a wide stop a
  // tiny one, for the same account and the same conviction. That is why the clamp below
  // was doing the real work on most trades: the risk-derived number was usually larger
  // than the cap, so the cap WAS the size, and the risk percentage was decorative.
  //
  // Now the notional is stated directly and the stop plays no part in sizing it. The
  // exposure budget still bounds total deployment, and the same buffer keeps a rounding
  // error from tipping a fill over the venue's limit.
  const exposureBudget = portfolioValue * (safeMaxTotalExposurePct / 100);
  const perTradeNotional = exposureBudget * (effectiveMaxPositionPct / 100);
  const bufferedMaxNotional = perTradeNotional * getMaxPositionBufferFactor();

  let quantity = bufferedMaxNotional / entryPrice;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    console.log(`[B6][SIZING] Invalid fixed-notional quantity (${quantity}) for ${symbol} - returning 0`);
    return invalidResult;
  }

  let estimatedValue = quantity * entryPrice;
  // Retained for the result contract: nothing is clamped any more because the size IS
  // the cap. Reporting a clamp that cannot occur would misdescribe the sizing decision.
  const wasClamped = false;

  const correlationScale = getScalingFactor(mode, symbol); // P19-B4b D5: per-mode scaling
  if (correlationScale < 1) {
    quantity = quantity * correlationScale;
    estimatedValue = quantity * entryPrice;
    console.log(`[9.4][SIZE] ${symbol} scaled ${correlationScale.toFixed(2)}× due to covariance`);
  }

  // P19-B7.1 (OBJ-5): the effective-risk-fraction ratio = actual dollar-risk after ALL reductions
  // (notional clamp + covariance correlationScale) ÷ the intended riskAmount. One field absorbing
  // BOTH reductions — crucially correlationScale, which does NOT flip wasClamped (CC-A A.2b), so a
  // wasClamped-only watch is blind to covariance decoherence. = 1 when the position risks exactly
  // its intended fraction; < 1 when a clamp or the covariance scale held it below. The open-path /
  // shadow telemetry bins on this to measure how often R-rank decoheres from realized-$EV (Phase-25:
  // >~15-20% bind → switch the honest ranker to realized-$EV at the post-clamp executed size).
  // ★ obj-1 CHANGES WHAT THIS INVARIANT CAN MEAN — read before "fixing" it.
  // The OBJ-5 ratio was defined for FIXED-FRACTIONAL-RISK sizing: risk at most
  // `riskAmount`, where clamps and the covariance scale could only REDUCE it. Under
  // fixed-notional there IS no riskAmount to be a fraction of — the size is a share of
  // the portfolio and the stop is not an input — so the old ratio has no denominator and
  // computing one would invent a number.
  //
  // What survives is the DOLLAR RISK ITSELF, which is now an OUTPUT rather than an input:
  // it varies with stop distance instead of pinning it. Reported for the Phase-25
  // R-rank-vs-realized-$EV work that consumed the old ratio, so that analysis keeps a
  // real input; the old warn-on-ratio>1 is gone because it tested an invariant this
  // sizing model does not claim.
  const dollarRiskAtStop = quantity * stopDistance;
  const dollarRiskPctOfPortfolio = portfolioValue > 0 ? (dollarRiskAtStop / portfolioValue) * 100 : 0;

  // ★ THE RATIO IS RE-POINTED, NOT DELETED — it has a LIVE consumer.
  // `rtb-metrics-service.ts` bins on this to measure how often sizing decoheres from
  // intent. Deleting the field would leave that reader without a writer, which is the
  // trap this batch's own pre-audit made a census mandatory for — so the field keeps its
  // name and its ROLE ("how much of the intended size actually got deployed") and gets
  // the only denominator that means anything under fixed-notional: the intended
  // per-trade notional. Still ≤ 1, still reduced only by the covariance scale.
  const effectiveRiskFractionRatio = perTradeNotional > 0 ? estimatedValue / perTradeNotional : 0;

  if (!Number.isFinite(quantity) || !Number.isFinite(estimatedValue)) {
    console.log(`[B6][SIZING] Final validation failed for ${symbol} - returning 0`);
    return invalidResult;
  }
  
  console.log(`[B6][SIZING]`, {
    symbol,
    strategy,
    portfolioValue: portfolioValue.toFixed(2),
    stopDistance: stopDistance.toFixed(8),
    dollarRiskAtStop: dollarRiskAtStop.toFixed(2),
    dollarRiskPctOfPortfolio: dollarRiskPctOfPortfolio.toFixed(2),
    maxTotalExposurePct: safeMaxTotalExposurePct.toFixed(2),
    exposureBudget: exposureBudget.toFixed(2),
    maxPositionPct: safeMaxPositionPct.toFixed(2),
    perTradeNotional: perTradeNotional.toFixed(2),
    bufferedMaxNotional: bufferedMaxNotional.toFixed(2),
    quantity: quantity.toFixed(8),
    estimatedValue: estimatedValue.toFixed(2),
    bufferFactor: getMaxPositionBufferFactor(),
    wasClamped
  });
  
  b5SizingAudit.logSizingCalled({
    strategy: strategy,
    symbol,
    entryPrice,
    rawNotional: perTradeNotional,
    sizedQuantity: quantity,
    sizedNotional: estimatedValue,
    riskPct: safeRiskPct,
    maxPositionUsd: perTradeNotional,
    bufferFactor: getMaxPositionBufferFactor(),
  });
  
  return {
    quantity,
    estimatedValue,
    sizingDetails: {
      portfolioValue,
      stopDistance,
      dollarRiskAtStop,
      dollarRiskPctOfPortfolio,
      maxPositionPct: safeMaxPositionPct,
      maxTotalExposurePct: safeMaxTotalExposurePct,
      exposureBudget,
      perTradeNotional,
      bufferedMaxNotional,
      wasClamped,
      effectiveRiskFractionRatio // P19-B7.1 (OBJ-5) — re-pointed to a notional basis by obj-1
    }
  };
}

/**
 * Validate that a portfolio value is usable for sizing.
 * Returns the value if valid, throws if not.
 */
export function validateActivePortfolioValue(balance: string | number | null | undefined, source: string): number {
  if (balance === null || balance === undefined) {
    console.error(`[B6][PORTFOLIO_ERROR] No portfolio balance found from ${source}`);
    throw new Error(`Paper portfolio value not found. Cannot size positions.`);
  }
  
  const parsed = typeof balance === 'number' ? balance : parseFloat(String(balance));
  
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`[B6][PORTFOLIO_ERROR] Invalid portfolio balance: ${balance} from ${source}`);
    throw new Error(`Invalid paper portfolio value: ${balance}. Cannot size positions.`);
  }
  
  return parsed;
}

/**
 * Directive 11.3 — Dynamic Sizing Engine Integration
 * 
 * Applies DSE multiplier to position sizing result.
 * DSE multiplier range: 0.3 to 1.2
 * 
 * This wrapper function takes a standard position sizing result and applies
 * the DSE multiplier to scale the position based on:
 * - Strategy performance (expected edge)
 * - Market volatility (normalized ATR)
 * - Transaction costs (spread + slippage)
 * - Adaptive learning confidence
 */
export interface DSEAdjustedResult extends ActivePositionSizingResult {
  dseMultiplier?: number;
  dseAdjusted?: boolean;
  originalQuantity?: number;
}

export function applyDSEMultiplier(
  result: ActivePositionSizingResult,
  dseMultiplier: number,
  symbol: string
): DSEAdjustedResult {
  if (result.quantity <= 0 || !Number.isFinite(dseMultiplier)) {
    return { ...result, dseAdjusted: false };
  }

  const clampedMultiplier = Math.min(1.2, Math.max(0.3, dseMultiplier));
  const originalQuantity = result.quantity;
  const adjustedQuantity = result.quantity * clampedMultiplier;
  const adjustedValue = adjustedQuantity * (result.estimatedValue / result.quantity);

  console.log(`[11.3][DSE_SIZING] ${symbol} quantity=${originalQuantity.toFixed(8)} → ${adjustedQuantity.toFixed(8)} (×${clampedMultiplier.toFixed(3)})`);

  return {
    ...result,
    quantity: adjustedQuantity,
    estimatedValue: adjustedValue,
    dseMultiplier: clampedMultiplier,
    dseAdjusted: true,
    originalQuantity,
  };
}
