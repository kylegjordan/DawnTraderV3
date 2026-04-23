/**
 * B65.2 — TEC Exit Evaluator
 *
 * Centralized exit-decision function consumed by both VTS (vts-runner.ts) and
 * paper execution (paper-execution-engine.ts). Replaces two separately-evolved
 * inline exit-decision blocks with one authoritative primitive.
 *
 * ## Parity scope (B65.2)
 *
 * This evaluator handles the five exit-decision primitives that are common to
 * VTS and paper:
 *
 *   1. stale_timeout — no current price AND holdDuration > maxHold → force-close
 *      at entryPrice (zombie-cleanup). VTS-specific today; paper never reaches
 *      this branch because its loop only runs when prices are available.
 *   2. timeout       — current price available but holdDuration > maxHold →
 *      close at currentPrice. Safety valve, not a normal exit.
 *   3. stop_hit      — currentPrice <= stopPrice → close at stopPrice (clamped).
 *   4. target_hit    — currentPrice >= targetPrice → close at targetPrice (clamped).
 *   5. trailing_stop_hit — optional ATR-based TEC state machine. Delegates to
 *      trailing-exit-controller.ts (Directive 9.2.A). Engaged only when
 *      `useTrailing:true` is passed by the caller.
 *
 * ## Module constants wiring
 *
 * Pulls 3 TEC tuning parameters from `module_constants` (module='trailing_exit'):
 *
 *   - break_even_trigger_r         (default 1.0)   — R multiple that latches BE
 *   - target_lock_r                (default 1.5)   — R multiple that latches TL
 *   - trail_distance_atr_multiplier (default 1.0)  — ATR multiple for trailing K'
 *
 * Defaults are the seed values written by migration
 * `drizzle/migrations/2026-04-23-b65-create-module-constants.sql`. If the DB
 * has no matching row (service returns undefined), the evaluator falls back to
 * the same numeric default so behavior is identical to pre-B65.2.
 *
 * ## What this does NOT do (by design, to keep B65.2 surgical)
 *
 *   - Paper's metadata-driven percentage trailing stop (legacy
 *     `metadata.trailingStopPercent` + `metadata.highWaterMark`) is left
 *     in paper-execution-engine.ts. Migrating that to the ATR-based TEC state
 *     machine is a future B65.3 sub-batch (separate regression surface).
 *   - Paper's `metadata.maxHoldingPeriod` (position-specific override) stays
 *     inline in paper-execution-engine.ts. VTS's MAX_HOLD_MS (global 7-day
 *     safety valve) is passed in through `maxHoldMs`.
 *   - The TEC state machine's persistence debounce (Directive 9.2.D) is still
 *     hardcoded at 5000ms inside trailing-exit-controller.ts. Re-wiring that
 *     through moduleConstantsService would require injecting the resolved
 *     constant into the module timer, which is best done in a follow-up.
 *
 * ## Parity test contract
 *
 * `scripts/tests/b65-tec-parity.test.ts` covers all 7 Langston-approved
 * scenarios. Changes to this file must keep those tests green.
 */

import { getModuleConstants } from './module-constants-service.js';
import {
  updatePosition as tecUpdatePosition,
  shouldClosePosition as tecShouldClose,
  type TrailingUpdateResult,
} from './trailing-exit-controller.js';

export interface TECExitContext {
  /** Exchange code, e.g. 'kraken'. Passed through to module_constants resolution. */
  exchange?: string;
  /** Asset class, e.g. 'crypto_spot'. Passed through to module_constants resolution. */
  assetClass?: string;
  /** Strategy key, e.g. 'strong_bull_trend'. Passed through to module_constants resolution. */
  strategy?: string;
  /** Canonical regime key. Passed through to module_constants resolution. */
  regime?: string;
}

export interface TECExitInput {
  symbol: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  /** Current mid/last price. Pass null or <=0 to signal stale/unavailable price. */
  currentPrice: number | null;
  /** Average true range. Required for trailing path; ignored if useTrailing=false. */
  atr: number;
  holdDurationMs: number;
  /** Hard safety-valve cap on hold time. Pass Infinity to disable. */
  maxHoldMs: number;
  /** Context dimensions for module_constants resolution. Missing fields resolve as '*'. */
  context: TECExitContext;
  /**
   * When true, engages the TEC state machine (trailing-exit-controller.ts).
   * VTS passes false (simple SL/TP only); paper can pass true when an
   * ATR-based trailing policy is desired. Default false.
   */
  useTrailing?: boolean;
  /** Directional integrity for trailing K' calculation. Default 50. */
  DI?: number;
  /** Volatility noise for trailing K' calculation. Default 0.3. */
  volNoise?: number;
}

export type TECExitReason =
  | 'stop_hit'
  | 'target_hit'
  | 'trailing_stop_hit'
  | 'timeout'
  | 'stale_timeout';

export interface TECExitDecision {
  shouldExit: boolean;
  exitReason: TECExitReason | null;
  /** Price to record on the closed trade. Zero when shouldExit=false and no price is available. */
  exitPrice: number;
  /** Present only when the trailing state machine updated the stop. */
  newStopPrice?: number;
  /** Present only when useTrailing=true and TEC flipped mode (TARGET → TRAILING_TAKE). */
  modeChanged?: boolean;
  /** Resolved constants snapshot — useful for diagnostics and parity tests. */
  resolvedConstants?: {
    breakEvenTriggerR: number;
    targetLockR: number;
    trailDistanceAtrMultiplier: number;
  };
}

const DEFAULTS = {
  breakEvenTriggerR: 1.0,
  targetLockR: 1.5,
  trailDistanceAtrMultiplier: 1.0,
};

/**
 * Load and resolve the 3 TEC tuning constants for the given context.
 * Falls back to hardcoded defaults if the DB has no matching row. The
 * defaults match the B65.1 seed migration, so behavior is bit-identical
 * to pre-B65.2 when the DB is in its shipped state.
 */
async function resolveTECConstants(
  context: TECExitContext,
): Promise<TECExitDecision['resolvedConstants']> {
  const key = {
    exchange: context.exchange ?? '*',
    assetClass: context.assetClass ?? '*',
    strategy: context.strategy ?? '*',
    regime: context.regime ?? '*',
  };

  try {
    const rows = await getModuleConstants('trailing_exit', key);
    return {
      breakEvenTriggerR:
        typeof rows.break_even_trigger_r === 'number'
          ? rows.break_even_trigger_r
          : DEFAULTS.breakEvenTriggerR,
      targetLockR:
        typeof rows.target_lock_r === 'number' ? rows.target_lock_r : DEFAULTS.targetLockR,
      trailDistanceAtrMultiplier:
        typeof rows.trail_distance_atr_multiplier === 'number'
          ? rows.trail_distance_atr_multiplier
          : DEFAULTS.trailDistanceAtrMultiplier,
    };
  } catch (err) {
    // Do not fail a trade resolution because the constants service is down.
    // Log once per decision and fall back to seeded defaults.
    console.error('[B65.2][TEC] moduleConstantsService read failed; using defaults:', err);
    return { ...DEFAULTS };
  }
}

/**
 * Core exit-decision primitive. Order of evaluation is load-bearing and must
 * match the order documented in the file header for parity tests to pass.
 */
export async function evaluateTECExit(input: TECExitInput): Promise<TECExitDecision> {
  const resolvedConstants = await resolveTECConstants(input.context);

  // 1. Stale-price branch (no usable price).
  //    If held beyond max, force-close at entry (zombie cleanup).
  //    Otherwise, no decision this cycle — caller should skip and try again.
  if (input.currentPrice === null || input.currentPrice <= 0) {
    if (input.holdDurationMs > input.maxHoldMs) {
      return {
        shouldExit: true,
        exitReason: 'stale_timeout',
        exitPrice: input.entryPrice,
        resolvedConstants,
      };
    }
    return { shouldExit: false, exitReason: null, exitPrice: 0, resolvedConstants };
  }

  const currentPrice = input.currentPrice;

  // 2. MAX_HOLD timeout with a live price. Safety valve, not a normal exit.
  if (input.holdDurationMs > input.maxHoldMs) {
    return {
      shouldExit: true,
      exitReason: 'timeout',
      exitPrice: currentPrice,
      resolvedConstants,
    };
  }

  // 3. Hard stop hit. Clamp to stopPrice to match VTS fill convention.
  if (currentPrice <= input.stopPrice) {
    return {
      shouldExit: true,
      exitReason: 'stop_hit',
      exitPrice: input.stopPrice,
      resolvedConstants,
    };
  }

  // 4. Hard target hit. Clamp to targetPrice to match VTS fill convention.
  if (currentPrice >= input.targetPrice) {
    return {
      shouldExit: true,
      exitReason: 'target_hit',
      exitPrice: input.targetPrice,
      resolvedConstants,
    };
  }

  // 5. Optional trailing path (ATR-based state machine via TEC module).
  //    Only engaged when caller opts in and ATR is meaningful.
  if (input.useTrailing && input.atr > 0) {
    const update: TrailingUpdateResult = tecUpdatePosition({
      symbol: input.symbol,
      entryPrice: input.entryPrice,
      targetPrice: input.targetPrice,
      currentPrice,
      DI: input.DI ?? 50,
      VolNoise: input.volNoise ?? 0.3,
      ATR: input.atr,
      currentStopPrice: input.stopPrice,
    });

    if (tecShouldClose(input.symbol, currentPrice)) {
      return {
        shouldExit: true,
        exitReason: 'trailing_stop_hit',
        exitPrice: currentPrice,
        newStopPrice: update.newStopPrice,
        modeChanged: update.modeChanged,
        resolvedConstants,
      };
    }

    return {
      shouldExit: false,
      exitReason: null,
      exitPrice: currentPrice,
      newStopPrice: update.newStopPrice,
      modeChanged: update.modeChanged,
      resolvedConstants,
    };
  }

  // 6. No exit this cycle.
  return {
    shouldExit: false,
    exitReason: null,
    exitPrice: currentPrice,
    resolvedConstants,
  };
}

/**
 * Re-exported for callers that need to look up constants independently
 * of a full exit evaluation (diagnostics, admin UI, tests).
 */
export { resolveTECConstants };
