/**
 * B65.2 — TEC Exit Evaluator
 *
 * Centralized exit-decision function consumed by both VTS (vts-runner.ts) and
 * paper execution (active-execution-engine.ts). Replaces two separately-evolved
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
 *   - **UPDATE 2026-04-25:** the original B65.3 sub-batch ("migrate metadata
 *     percentage trailing onto ATR TEC") was found MOOT during the B65.2 audit
 *     because active-execution-engine.ts no longer consumes
 *     `metadata.trailingStopPercent` for exit decisions — that path was
 *     deleted as part of the B65.2 functional ship. The only residual
 *     reference is one `highWaterMark` write at trade-open
 *     (active-execution-engine.ts:1929) retained for legacy dashboards and
 *     explicitly comment-flagged as not consumed by exit logic. Phase 16
 *     legacy cleanup will remove that residual write plus any remaining
 *     percentage-trailing references for the ABCD / SMA Trend Ride strategy
 *     detectors if those strategies are themselves being retired.
 *   - Paper's `metadata.maxHoldingMs` (position-specific override, milliseconds;
 *     W2.1 2026-06-06 — was the ambiguous `metadata.maxHoldingPeriod`) stays
 *     inline in active-execution-engine.ts. VTS's MAX_HOLD_MS (global 7-day
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

// B79.0n.TEC (2026-05-26): resolveTECConfig now SOLE source of TEC R-multiplier
// knobs via the per-class cache. getModuleConstants import dropped — eliminates
// the duplicate DB round-trip per exit-cycle + the silent DEFAULTS-fallback path.
// See pre-audit §4.2 + D-3 Langston ACK.
import {
  updatePosition as tecUpdatePosition,
  shouldClosePosition as tecShouldClose,
  isMoonbagQualifier,
  canEnterMoonbag,
  getConcurrentMoonbagCount,
  resolveTECConfig,
  type TrailingUpdateResult,
  type TrailingStateSeed,
  type CallerMode,
} from './trailing-exit-controller.js';
// B-NEW-42b (2026-05-17) per Langston Step 4 BLOCKER 2 fix: detector consultation
// hoisted from TEC to here so we have ONE state-machine advance per logical tick.
// Result is threaded down to both `tecUpdatePosition` (target-lock decision) and
// `tecShouldClose` (stop-check decision) as a pre-resolved parameter.
import { isDiscontinuityActive } from './price-discontinuity-detector.js';
import type { AssetClass } from '../../shared/asset-classes.js';

export interface TECExitContext {
  /** Exchange code, e.g. 'kraken'. Passed through to module_constants resolution. */
  exchange?: string;
  /**
   * B79.TEC (2026-05-08): Asset class is now NON-OPTIONAL and a typed
   * `AssetClass`. Drives per-class TEC config resolution. Every caller
   * MUST resolve the actual class of the position from its row data —
   * NO hardcoded `'crypto_spot'` literals (CLAUDE.md §11).
   */
  assetClass: AssetClass;
  /** Strategy key, e.g. 'strong_bull_trend'. Passed through to module_constants resolution. */
  strategy?: string;
  /** Canonical regime key. Passed through to module_constants resolution. */
  regime?: string;
}

export interface TECExitInput {
  /**
   * B80 (2026-05-13): per-trade keying. VTS callers pass OpenVirtualTrade.id;
   * paper/live callers pass active_open_positions.id (DB UUID). Required.
   * See BATCH_80_SCOPE.md + RUNNING_ISSUES #105.
   */
  tradeId: string;
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
   * VTS and paper both pass true in B65.2+. Default false for backward compat.
   */
  useTrailing?: boolean;
  /** Directional integrity for trailing K' calculation. Default 50. */
  DI?: number;
  /** Volatility noise for trailing K' calculation. Default 0.3. */
  volNoise?: number;
  // B65.2: caller mode + moonbag inputs
  /** Which runtime path is calling: 'vts' | 'paper' | 'live'. Default 'paper'. */
  callerMode?: CallerMode;
  /** Source pool key for strategies that qualify only in specific pools (e.g. vwap_pullback). */
  sourcePool?: string | null;
  /** Current total slot count in the caller's pool — used for the concurrency cap. Ignored for VTS. */
  currentSlotTotal?: number;
  /**
   * B80 (2026-05-13): Option C+ rehydrate seed. Pass on the FIRST exit-cycle
   * for an open trade after PM2 restart. Caller builds from trade record:
   * `{ tradeMode: trade.tradeMode, ladderRung: trade.ladderRungsHit,
   *    originalStopPrice: trade.originalStopPrice }`. Engine uses this to
   * reconstruct in-flight TEC state instead of silently downgrading moonbag
   * trades to TARGET mode. Subsequent cycles pass nothing.
   */
  seed?: TrailingStateSeed;
  /**
   * B-NEW-42b (2026-05-17): optional tick timestamp for the price-discontinuity
   * detector. Production callers omit (defaults to Date.now() — the price-tick
   * arrival time). Test callers pass explicit values to simulate halt timing.
   */
  currentTs?: number;
}

export type TECExitReason =
  | 'stop_hit'
  | 'target_hit'
  | 'trailing_stop_hit'
  | 'break_even_stop' // B65.2-HF3: BE lock ratcheted the stop, trade exited on that ratcheted stop without ever reaching target. Distinct from trailing_stop_hit which now means only a moonbag-mode trailing exit.
  | 'timeout'
  | 'stale_timeout'
  | 'moonbag_timeout';

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
  // B65.4 (2026-04-25): ladder rung count from the engine — 0 if the trade
  // has not entered moonbag, 1+ if it has. Surfaced so the caller can
  // capture it on the closed-trade record.
  ladderRungsHit?: number;
  // B65.4.2 (2026-04-28): observability fields propagated from TrailingState
  // through the engine update result to the caller for closed-trade persistence.
  originalStopPrice?: number;
  latchTriggerPrice?: number;
  rungTargetHistory?: number[];
}

/**
 * B79.0n.TEC (2026-05-26): Load + resolve the 3 TEC tuning constants from the
 * per-class cache. SYNC — the cache is pre-warmed by `primeTECConfig()` at
 * boot before `server.listen()`, so steady-state reads are sync map lookups.
 *
 * Replaces the prior async `getModuleConstants` round-trip + silent
 * `catch → DEFAULTS` fallback (D-3 disposition). The cache itself HARD-FAILs
 * on missing per-class rows during primeTECConfig (B79.0n.TEC HARD-FAIL
 * extension), so this function NEVER returns DEFAULTS at runtime — it only
 * throws if resolveTECConfig throws (cache-miss or staleness ceiling).
 *
 * Behavior change vs B65.2: zero DB round-trips per exit-cycle (was 1/cycle);
 * fail-loud on cache invariant violation (was silent DEFAULTS fallback).
 */
function resolveTECConstants(
  context: TECExitContext,
): TECExitDecision['resolvedConstants'] {
  const snapshot = resolveTECConfig(context.assetClass);
  return {
    breakEvenTriggerR: snapshot.breakEvenTriggerR,
    targetLockR: snapshot.targetLockR,
    trailDistanceAtrMultiplier: snapshot.trailDistanceAtrMultiplier,
  };
}

/**
 * Core exit-decision primitive. Order of evaluation is load-bearing and must
 * match the order documented in the file header for parity tests to pass.
 */
export async function evaluateTECExit(input: TECExitInput): Promise<TECExitDecision> {
  // B79.0n.TEC (2026-05-26): resolveTECConstants is now sync (per-class cache lookup).
  const resolvedConstants = resolveTECConstants(input.context);

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

  // 3/4. When trailing is OFF, short-circuit on hard stop/target (legacy
  //      B65.2-plumbing path). When trailing is ON, the trailing engine
  //      owns the target-hit decision (qualifier gate + moonbag flip vs.
  //      close-at-target) and the stop-hit decision (via its ratcheted
  //      internal stop). So we skip these when useTrailing=true.
  //
  //      P19-B6.5b (F5 / audit H14 — ATR-zero exit FLOOR): the trailing engine
  //      at step 5 only engages when `atr > 0`. If trailing is ON but ATR is
  //      0/missing (e.g. a position opened without a stamped atr_at_open), NEITHER
  //      this block (gated useTrailing===false) NOR the trailing block (gated
  //      atr>0) would run — leaving a position that NEVER closes on stop or target
  //      (only the MAX_HOLD timeout valve at step 2 could close it = unbounded
  //      exposure to the stop). So the hard stop/target acts as a FLOOR that always
  //      runs when ATR is unavailable, regardless of useTrailing. With trailing ON +
  //      a valid ATR (the normal paper path), this stays skipped — trailing owns it,
  //      behavior unchanged. Unit-tested: atr=0 forces the floor (b6-5b F5 test).
  const atrUnavailableForTrailing = !(input.atr > 0);
  if (!input.useTrailing || atrUnavailableForTrailing) {
    const viaAtrFloor = input.useTrailing && atrUnavailableForTrailing;
    if (currentPrice <= input.stopPrice) {
      if (viaAtrFloor) console.warn(`[TEC][P19-B6.5b][F5][ATR_FLOOR] ${input.symbol} stop_hit via hard floor (useTrailing but ATR<=0=${input.atr}); trailing engine could not engage. tradeId=${input.tradeId}`);
      return {
        shouldExit: true,
        exitReason: 'stop_hit',
        exitPrice: input.stopPrice,
        resolvedConstants,
      };
    }
    if (currentPrice >= input.targetPrice) {
      if (viaAtrFloor) console.warn(`[TEC][P19-B6.5b][F5][ATR_FLOOR] ${input.symbol} target_hit via hard floor (useTrailing but ATR<=0=${input.atr}). tradeId=${input.tradeId}`);
      return {
        shouldExit: true,
        exitReason: 'target_hit',
        exitPrice: input.targetPrice,
        resolvedConstants,
      };
    }
  }

  // 5. Trailing path (ATR-based state machine). B65.2: engaged by both VTS
  //    and paper. The engine owns ALL exit decisions once engaged —
  //    break-even lock, target lock + moonbag gate, trailing stop, duration
  //    cap. The evaluator layer only forwards the engine's verdict.
  if (input.useTrailing && input.atr > 0) {
    const callerMode: CallerMode = input.callerMode ?? 'paper';

    // B-NEW-42b (Step 4 fix BLOCKER 2): consult the price-discontinuity detector
    // ONCE per logical tick. The result threads to both `tecUpdatePosition`
    // (target-lock skip decision) and `tecShouldClose` (stop-check skip
    // decision). Pre-fix: each function consulted independently → two state-
    // machine advances per logical tick → the intended 2-tick deferral
    // (DISCONTINUITY_ACTIVE → confirming tick → CLEARING → IDLE) collapsed to
    // 1-tick, exactly the unfillable-fill failure this batch closes.
    const tickTs = input.currentTs ?? Date.now();
    const discontinuity = isDiscontinuityActive(input.symbol, currentPrice, tickTs);

    // B79.TEC: moonbag gates are now SYNC (cache pre-warmed by primeTECConfig).
    // Both calls take an explicit `assetClass` from the context.
    const moonbagQualified = isMoonbagQualifier(
      input.context.assetClass,
      callerMode, // P19-B8.5i — selects VTS vs active trailing flag ('vts' incl. shadow → VTS; paper/live → active)
      input.context.strategy ?? '',
      input.sourcePool,
      input.context.regime,
    );
    const moonbagAllowed = canEnterMoonbag(
      input.context.assetClass,
      callerMode,
      input.currentSlotTotal ?? Number.POSITIVE_INFINITY,
      input.context.strategy,
      input.context.regime,
    );

    const update: TrailingUpdateResult = tecUpdatePosition({
      // B80 (2026-05-13): per-trade keying. tradeId is required.
      tradeId: input.tradeId,
      symbol: input.symbol,
      entryPrice: input.entryPrice,
      targetPrice: input.targetPrice,
      currentPrice,
      DI: input.DI ?? 50,
      VolNoise: input.volNoise ?? 0.3,
      ATR: input.atr,
      currentStopPrice: input.stopPrice,
      strategy: input.context.strategy,
      sourcePool: input.sourcePool,
      regime: input.context.regime,
      // B79.TEC: load-bearing fix — assetClass must propagate to TEC config
      // lookup so per-class settings (BE enable, moonbag knobs) are honored.
      // Was missing; constructed PositionUpdate inherited crypto_spot defaults
      // because the TEC global cache was hardcoded to crypto_spot.
      assetClass: input.context.assetClass,
      callerMode,
      moonbagQualified,
      moonbagAllowed,
      // B80: Option C+ rehydrate seed (only on first cycle after restart).
      seed: input.seed,
      // B-NEW-42b (2026-05-17): tick timestamp passed through so any inline
      // detector consult inside updatePosition (only possible if discontinuity
      // param is omitted, which it isn't here) uses the same tick time.
      currentTs: tickTs,
      // B-NEW-42b (Step 4 fix BLOCKER 2): pre-resolved discontinuity from the
      // single hoisted consult above. Target-lock skip honors this.
      discontinuity,
    });

    // Engine-authored terminal decisions (B65.2):
    if (update.closeNow && update.closeReason === 'moonbag_timeout') {
      return {
        shouldExit: true,
        exitReason: 'moonbag_timeout',
        exitPrice: currentPrice,
        newStopPrice: update.newStopPrice,
        modeChanged: update.modeChanged,
        resolvedConstants,
        ladderRungsHit: update.ladderRungsHit,
        // B65.4.2: propagate observability fields for closed-trade persistence.
        originalStopPrice: update.originalStopPrice,
        latchTriggerPrice: update.latchTriggerPrice,
        rungTargetHistory: update.rungTargetHistory,
      };
    }
    if (update.closeNow && update.closeReason === 'target_hit_no_trailing') {
      return {
        shouldExit: true,
        exitReason: 'target_hit',
        exitPrice: input.targetPrice, // clamp to target for fill-convention parity
        newStopPrice: update.newStopPrice,
        modeChanged: update.modeChanged,
        resolvedConstants,
        ladderRungsHit: update.ladderRungsHit, // 0 — qualifier rejected, no ladder
        originalStopPrice: update.originalStopPrice,
        latchTriggerPrice: update.latchTriggerPrice,
        rungTargetHistory: update.rungTargetHistory,
      };
    }

    // B-NEW-42b (Step 4 fix BLOCKER 2): pass the SAME discontinuity result we
    // resolved at the top of this trailing branch. No second detector call.
    if (tecShouldClose(input.tradeId, currentPrice, tickTs, discontinuity)) {
      // B65.2-HF3: three distinct close semantics when the engine reports
      // "close now":
      //   1. targetLatched = trade entered TRAILING_TAKE (moonbag), now
      //      the ratcheting trailing stop caught a pullback → trailing_stop_hit
      //   2. breakEvenLatched & !targetLatched = trade gained 1×ATR, stop
      //      ratcheted up to net-breakeven, price reversed into that
      //      protective level without ever hitting target → break_even_stop
      //   3. neither latched = original entry-time stop hit on a losing
      //      trade before any protection engaged → stop_hit
      // These distinct reasons produce distinct UI badges and let post-close
      // analysis tell apart moonbag wins, breakeven-protected exits, and
      // real losers — which the prior collapsed 'trailing_stop_hit' label
      // could not.
      let exitReason: TECExitReason;
      let exitPrice: number;
      if (update.targetLatched) {
        exitReason = 'trailing_stop_hit';
        exitPrice = currentPrice;
      } else if (update.breakEvenLatched) {
        exitReason = 'break_even_stop';
        exitPrice = currentPrice;
      } else {
        exitReason = 'stop_hit';
        // Static-stop close clamps to the original stop level (fill-convention
        // parity with the !useTrailing path).
        exitPrice = input.stopPrice;
      }
      return {
        shouldExit: true,
        exitReason,
        exitPrice,
        newStopPrice: update.newStopPrice,
        modeChanged: update.modeChanged,
        resolvedConstants,
        ladderRungsHit: update.ladderRungsHit,
        // B65.4.2: propagate observability fields for closed-trade persistence.
        originalStopPrice: update.originalStopPrice,
        latchTriggerPrice: update.latchTriggerPrice,
        rungTargetHistory: update.rungTargetHistory,
      };
    }

    return {
      shouldExit: false,
      exitReason: null,
      exitPrice: currentPrice,
      newStopPrice: update.newStopPrice,
      modeChanged: update.modeChanged,
      resolvedConstants,
      ladderRungsHit: update.ladderRungsHit,
      // B65.4.2: still propagate even on no-exit so callers tracking the
      // open-trade state can observe latch-trigger after it fires.
      originalStopPrice: update.originalStopPrice,
      latchTriggerPrice: update.latchTriggerPrice,
      rungTargetHistory: update.rungTargetHistory,
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
