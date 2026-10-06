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
// B72 (2026-05-05): getMaxPositionBufferFactor() moved to module='active_sizing'.
import { getCachedNumberRequired } from './module-constants-service.js';
// P19-B8.8: consecutive read-fail rail — in-memory counter increments only (the
// threshold alert write lives inside rtb-metrics, not here; sizing stays sync).
import { rtbMetricsService } from './rtb-metrics-service.js';

/**
 * B-SIZING-DEC-RESTORE (obj-2, PRE_AUDIT §14.4 BLOCKER-2): THE ONE resolver of the per-trade share of the
 * exposure budget. The sizer AND the slot derivation (`deriveSlotCount`) read it, so a term added here
 * — obj-5's posture multiplier must land HERE — moves both together, and §1's named breach (N slots
 * sized at ×1.25 = 125% of the budget) cannot re-arm through the slot count.
 * ⛔ B-SIZING-DEC-RESTORE 2e (Pe5, Kyle 2026-09-30): the pattern-list cap that lived here is GONE — every trade, pattern
 * or quant, takes the max position % exactly. The function stays as the identity SEAM (Langston: obj-5 lands here).
 */
export function resolveEffectivePositionPct(maxPositionPct: number): number {
  return maxPositionPct;
}

/**
 * B-SIZING-DEC-RESTORE (obj-2 / obj-4, PRE_AUDIT §14): HOW MANY POSITIONS THE EXPOSURE BUDGET HOLDS — the ONE
 * derivation (the retired `max_open_positions` setting and m5e's `floor(e/p)` twin both answered this
 * differently; §14.4 BLOCKER-1). `p` slices the exposure BUDGET, not the balance (the sizer below:
 * budget = balance × e, trade = budget × p × 0.97), so the budget holds `floor(100 / effectiveP)` trades,
 * independent of `e`. ⚠️ Deliberately ~3% conservative: N FULL-SIZE slots commit N × p × 0.97 = 97% of the
 * budget at p = 100/N. Do not "correct" the floor to use the buffer.
 * The count gate (engine `maxOpenTrades`) caps POSITIONS while the budget holds DOLLARS. ⛔ CORRECTED in 2e (Langston,
 * §20 Pe5): the under-use measured on 09-29 (8 open, 5 of them $51-56 against a ~$160 full size, 91.5% of the budget)
 * was the PATTERN-LIST CAP, not `correlationScale` as this comment said — that factor was identically 1 (§20.4 J1b).
 * 2e removed both, so every position is a full slot. Callers pass `resolveEffectivePositionPct(p)`.
 * Non-finite or non-positive input returns `NaN`, `Infinity` or a negative number; every caller HALTS
 * on `!Number.isFinite(slots) || slots <= 0` rather than inventing a cap.
 */
export function deriveSlotCount(effectivePositionPct: number): number {
  return Math.floor(100 / effectivePositionPct);
}

/** #698 amendment 5: the promotion loop's full-book state. `since` = when the book filled (null = not full). */
export interface BookFullState { since: number | null; lastLogAt: number }

/**
 * #698 amendment 5 (B-SIZING-DEC-RESTORE inc3 r9, Langston deploy-B Step 8): the continuous promotion loop skips its
 * promotion step while the book is full and wrote nothing, so a full book read exactly like a dead loop. This decides
 * the one line to write, if any: on entering a full book, every `reminderMs` while it stays full, and on leaving it.
 * Pure — the caller holds the state and prints the line.
 */
export function nextBookFullLog(
  prev: BookFullState, openSlots: number, openCount: number, maxTrades: number, now: number, reminderMs: number,
): { state: BookFullState; line: string | null } {
  const mins = (since: number) => Math.round((now - since) / 60_000);
  if (openSlots <= 0) {
    if (prev.since === null) {
      return { state: { since: now, lastLogAt: now }, line: `BOOK_FULL ${openCount}/${maxTrades} open — promotion paused until a slot frees` };
    }
    if (now - prev.lastLogAt >= reminderMs) {
      return { state: { since: prev.since, lastLogAt: now }, line: `BOOK_FULL still full ${openCount}/${maxTrades} for ${mins(prev.since)} min — loop alive` };
    }
    return { state: prev, line: null };
  }
  if (prev.since !== null) {
    return { state: { since: null, lastLogAt: prev.lastLogAt }, line: `BOOK_SLOT_FREE ${openSlots} slot(s) free after ${mins(prev.since)} min full` };
  }
  return { state: prev, line: null };
}

export function getMaxPositionBufferFactor(): number {
  return getCachedNumberRequired('active_sizing', 'max_position_buffer_factor',
    { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
}

/**
 * B-SIZING-DEC-RESTORE increment 2c (PRE_AUDIT §17 P-4): THE size of a normal trade — balance × exposure % × max
 * position % × the buffer factor. The ONE formula, in two forms: `tradeNotional` takes the buffer as an argument (pure, for
 * callers that pass their inputs in), `bufferedTradeNotional` reads it fail-hard from the DB (the
 * sizer above, the max-position check's missing-notional branch, the pre-execution validator's estimate). Before 2c those
 * callers either re-derived it or fell back to risk ÷ stop distance.
 * Pre-covariance and pre-pattern-cap for a caller that passes the raw `maxPositionPct` — say which in the caller.
 */
export function tradeNotional(balance: number, maxTotalExposurePct: number, maxPositionPct: number, bufferFactor: number): number {
  return balance * (maxTotalExposurePct / 100) * (maxPositionPct / 100) * bufferFactor;
}

export function bufferedTradeNotional(balance: number, maxTotalExposurePct: number, maxPositionPct: number): number {
  return tradeNotional(balance, maxTotalExposurePct, maxPositionPct, getMaxPositionBufferFactor());
}

/**
 * AJ9: Buffer factor for max position sizing — WHAT IT ACTUALLY DOES (corrected in 2e, Langston §20.4 J1a).
 * AJ9's stated reason ("room for price fluctuations … prevents a block at MAX_POSITION during execution") is dead:
 * the max-position check trusts the size fixed at signal birth and compares p × e/100 × 0.97 against p on a strict `>`,
 * so it cannot block. Its LIVE job is the TOTAL EXPOSURE check (`checkMaxTotalExposure`): open positions are summed at
 * their frozen entry notionals against a budget that moves with the balance. At p = 5 the 20 slots fill the budget
 * EXACTLY, so without the 0.97 a ~3% dip in the balance would refuse the last slot. The buffer keeps a full book
 * inside the exposure limit through a small drawdown.
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
  // ⛔ B-SIZING-DEC-RESTORE 2e (Langston Step-4 A2 FINDING-2): NO `sourcePool` and NO `assetClass`. Both keyed the
  // pattern-list size cap, which 2e removed (Kyle 2026-09-30); nothing read them after that, and a field kept "so a
  // future term has its key" is a forward-load, not a home. The size is balance × e × p × buffer for every signal, and
  // the type now says so. A per-class term, if one is ever decided, adds its key back with the term.
  /**
   * P19-B4b D5 (S4 isolation): the trading mode this sizing is for — required, no silent default. It named the
   * per-mode concentration store until 2e removed the correlation shrink (§20.4 J1b); it still labels the read-fail rail.
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
    // (`wasClamped` and `effectiveRiskFractionRatio` are RETIRED — B-SIZING-DEC-RESTORE 2d, #1110: the flag was a
    //  constant false, and the ratio was identically 0.97 × correlationScale, so the clamp-bind stream built on them
    //  measured one function, not clamping. B-CLAMP-ESTIMAND-RESPEC names what Phase 25 should read instead.)
  };
}

/**
 * Calculate paper-mode position size for a signal.
 * 
 * Pure function - no DB calls, no network calls.
 * 
 * What runs (B-SIZING-DEC-RESTORE obj-1, fixed-notional; the risk-based steps this header used to list
 * were retired 2026-08-07 and cost a withdrawn ratification when read as current — Langston §13.4 F):
 * 1. Exposure budget: portfolioValue × (maxTotalExposurePct / 100)
 * 2. Per-trade share: effectiveP = resolveEffectivePositionPct(maxPositionPercentPct) — today the max position % itself
 * 3. Per-trade notional: exposureBudget × (effectiveP / 100), then × the 0.97 buffer
 * 4. quantity = notional / entryPrice; the stop plays no part in the size, and nothing scales it afterwards
 *    (2e removed the correlation shrink — it was identically 1 and mis-unitted, §20.4 J1b)
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
  // makes both fields notNull-with-default and both live callers pass a full
  // guardrails_v2 row or null, so a missing/unparseable/non-positive value can only
  // mean a real fault (missing row, schema drift, out-of-range write). The old
  // null→100 branch silently UNCAPPED portfolio exposure on exactly that fault.
  // Contract: refuse the signal loudly (invalidResult → the engine's SIZING_INVALID
  // path; loop intact, nothing sized on fabricated inputs) + rail the refusal so a
  // persistently broken row alerts instead of silently starving trading.
  const guardrailsAny = guardrails as any;
  // B-SIZING-DEC-RESTORE increment 2c: Portfolio Risk per Trade is RETIRED (Kyle 2026-09-29) — it was a REQUIRED input
  // here that sized nothing (its value reached only the audit log), so a missing column would have refused every signal.
  const sizingInputs: Array<[string, unknown]> = [
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
  const safeMaxPositionPct = parsedInputs.maxPositionPercentPct;
  const safeMaxTotalExposurePct = parsedInputs.maxTotalExposurePct;
  // B-SIZING-DEC-RESTORE §14.4: the ONE resolver (shared with deriveSlotCount). 2e removed the pattern-list cap that
  // lived there (Kyle 2026-09-30), so a pattern signal and a quant signal take the same share.
  const effectiveMaxPositionPct = resolveEffectivePositionPct(safeMaxPositionPct);
  
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
  // exposure budget still bounds total deployment, and the 0.97 buffer keeps a full book of slots inside that budget
  // through a small balance dip (see getMaxPositionBufferFactor's docblock; corrected in 2e).
  const exposureBudget = portfolioValue * (safeMaxTotalExposurePct / 100);
  const perTradeNotional = exposureBudget * (effectiveMaxPositionPct / 100);
  // B-SIZING-DEC-RESTORE increment 2c: the ONE formula, shared with every caller that needs a normal trade's size.
  const bufferedMaxNotional = bufferedTradeNotional(portfolioValue, safeMaxTotalExposurePct, effectiveMaxPositionPct);

  const quantity = bufferedMaxNotional / entryPrice;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    console.log(`[B6][SIZING] Invalid fixed-notional quantity (${quantity}) for ${symbol} - returning 0`);
    return invalidResult;
  }

  const estimatedValue = quantity * entryPrice;
  // ⛔ B-SIZING-DEC-RESTORE 2e (Pe10, §20.4 J1b): the covariance `correlationScale` that stood here is REMOVED. It was
  // identically 1 (scores computed once at boot on an empty weights map, cached forever) and mis-unitted (dollar
  // weights against a 2.5 cap), so a restart with open positions would have latched every boot-20 symbol at 0.25×.
  // Kyle kept it only if justified; it was not. The block `isCorrelatedExposure` (trade-safety) stays.
  // HOME for a real concentration score: B-CONCENTRATION-SCORE-UNITS, SPRINT_TO_LIVE_PLAN row 135b.

  // What survives is the DOLLAR RISK ITSELF, which is now an OUTPUT rather than an input:
  // it varies with stop distance instead of pinning it. Reported for the Phase-25
  // R-rank-vs-realized-$EV work that consumed the old ratio, so that analysis keeps a
  // real input; the old warn-on-ratio>1 is gone because it tested an invariant this
  // sizing model does not claim.
  const dollarRiskAtStop = quantity * stopDistance;
  const dollarRiskPctOfPortfolio = portfolioValue > 0 ? (dollarRiskAtStop / portfolioValue) * 100 : 0;

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
  });
  
  b5SizingAudit.logSizingCalled({
    strategy: strategy,
    symbol,
    entryPrice,
    rawNotional: perTradeNotional,
    sizedQuantity: quantity,
    sizedNotional: estimatedValue,
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
