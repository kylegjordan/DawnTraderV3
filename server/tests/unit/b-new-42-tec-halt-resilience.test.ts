/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-42 §2.3.3 — TEC halt-resilience regression test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * **PURPOSE: Documents existing gap on the post-resume-gap scenario, not
 * desired-behavior verification.**
 *
 * Three scenarios per pre-audit §3.3 (Langston rev1 §3 add — post-resume gap
 * is the actually-interesting failure mode):
 *
 *   1. **Pause-no-movement.** Kraken pauses ticker, no new rows; caller's
 *      lastTick stays at pre-halt price. Stop check sees a non-decreasing
 *      stable price → no stop fires. This is the BENIGN halt case.
 *
 *   2. **Stale-stream.** Kraken streams stale value with advancing
 *      captured_at; price stays constant across the halt window. Same as
 *      pause from TEC's perspective. Data-freshness layer would normally
 *      flag this as stale, but xstock_spot's freshness window was DELETED
 *      in B-NEW-34 (_NO_WINDOW = Infinity → always-fresh), so the gate is
 *      a no-op. From TEC perspective, identical to scenario 1.
 *
 *   3. **Post-resume gap (THE GAP).** Ticker freezes 10 min, resumes at a
 *      price that gapped down through the stop level. Naive TEC fires the
 *      stop on what is effectively a re-priced open, not market movement.
 *      Current behavior: stop fires at the re-priced level. Desired
 *      (post-B-NEW-42b): halt-detection sentinel recognizes the resume
 *      discontinuity and short-circuits the stop check until the next
 *      independent price tick confirms the re-priced level is real.
 *
 * **Mock fidelity (CLAUDE.md §6):** uses actual `evaluateTECExit` API,
 * mocks only db / cost-model / storage / trade-safety. Trailing engine
 * state machine runs unmocked. Vitest fake timers simulate the halt window.
 *
 * **CURRENT-BEHAVIOR ASSERTIONS:** scenarios 1+2 pass on no-stop-fire (benign
 * cases work). Scenario 3 asserts stop fires (documents the gap). Post fix
 * inverts scenario 3.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  },
}));

vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (entry: number) => entry,
  computeNetTargetFloor: (target: number) => target,
  computeTotalRoundTripCost: () => 0,
}));

vi.mock('../../storage.js', () => ({
  storage: {
    getPaperSimOpenPositions: async () => [],
    updatePaperSimOpenPosition: async () => undefined,
  },
}));

vi.mock('../../services/trade-safety.js', () => ({
  persistTrailingStates: () => undefined,
}));

// ──────────────────────────────────────────────────────────────────────────
// MARKET-HOURS MOCK — fidelity flag (Langston verdict-check-in 4e)
// ──────────────────────────────────────────────────────────────────────────
// Without this mock the TEC weekend gate (server/asset_classes/xstock_spot/
// market-hours.ts → isXstockMarketOpenUTC) short-circuits all xstock_spot
// updatePosition calls during Fri 8PM ET → Sun 8PM ET.
//
// **CI implication:** CI runs on a weekend day will silently no-op every
// xstock_spot test via the gate. The mock prevents that silent rot.
//
// **For halt-resilience specifically:** unlike the split tests where the
// weekend gate is a real partial defense (splits are overnight-effective),
// halts happen INTRA-RTH and the weekend gate provides NO defense. The
// test's "DOCUMENTS GAP" claim is operationally accurate for the live path —
// the mock here just removes the test-environment-only obstacle.
//
// DO NOT remove this mock without a time-injection replacement. See
// b-new-42-tec-split-resilience.test.ts header for the full rationale.
vi.mock('../../asset_classes/xstock_spot/market-hours.js', () => ({
  isXstockMarketOpenUTC: () => true,
}));

import { evaluateTECExit } from '../../services/tec-evaluator.js';
import {
  clearTrailingState,
  primeTECConfig,
  _testClearEngineConfigCache,
} from '../../services/trailing-exit-controller.js';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';
// B-NEW-42b: clear per-symbol detector state between tests.
import { _testClearAllState as _testClearDetectorState } from '../../services/price-discontinuity-detector.js';

// B-NEW-43 Phase 2 chunk 8 (2026-05-23): seed XSTOCK_SPOT_SYMBOLS so the
// detector recognizes AAPL/USD + TSLA/USD as in-universe. Without this
// the detector early-returns "not in xStock universe" and the halt-
// resilience short-circuit doesn't engage, causing the post-fix stop-
// suppression to be missed.
import { seedXstockUniverse } from '../helpers/seed-xstock-universe.js';

function seedAllConstants() {
  const wildcard = {
    moduleName: 'trailing_exit',
    exchange: '*', assetClass: '*', strategy: '*', regime: '*',
    updatedAt: new Date(), updatedBy: 'test',
  };
  const perClassBE = (cls: string) => ({
    ...wildcard, assetClass: cls, constantName: 'break_even_enabled', value: false,
  });
  mockRows.current = [
    perClassBE('crypto_spot'),
    perClassBE('crypto_perp'),
    perClassBE('xstock_spot'),
    perClassBE('xstock_perp'),
    { ...wildcard, constantName: 'break_even_trigger_r', value: 1.0 },
    { ...wildcard, constantName: 'target_lock_r', value: 1.5 },
    { ...wildcard, constantName: 'trail_distance_atr_multiplier', value: 1.0 },
    { ...wildcard, constantName: 'persistence_debounce_ms', value: 5000 },
    {
      ...wildcard, constantName: 'moonbag_qualifying_strategies',
      value: ['strong_bull_trend', 'sma_trend_ride', 'vwap_pullback', 'breakout'],
    },
    {
      ...wildcard, constantName: 'moonbag_qualifying_source_pools',
      value: { vwap_pullback: ['quant-strong_trend'] },
    },
    { ...wildcard, constantName: 'moonbag_max_duration_ms', value: 14400000 },
    { ...wildcard, constantName: 'moonbag_cap_mode', value: 'reserved_slots' },
    { ...wildcard, constantName: 'moonbag_reserved_slots', value: 1 },
    // P19-B1 TEC.b (2026-06-13): strict requireKey — full 11-key set required.
    { ...wildcard, constantName: 'rung_floor_slippage_buffer_multiplier', value: 1.0 },
  ];
}

const xstockContext = {
  exchange: 'kraken',
  assetClass: 'xstock_spot',
  strategy: 'strong_bull_trend',
  regime: 'TREND_FRIENDLY_STABLE',
};

describe('B-NEW-42 §2.3.3 — TEC halt-resilience (VERIFIES B-NEW-42b FIX)', () => {
  beforeEach(async () => {
    seedXstockUniverse();
    clearModuleConstantsCache();
    seedAllConstants();
    _testClearEngineConfigCache();
    await primeTECConfig();
    clearTrailingState('AAPL/USD');
    clearTrailingState('TSLA/USD');
    _testClearDetectorState();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 1: Pause-no-movement — benign case, should work today
  // ──────────────────────────────────────────────────────────────────────────

  it('PAUSE: 10-minute halt with stable pre-halt price does NOT fire stop', async () => {
    // Pre-halt: position at $200, stop $190, target $230, currentPrice $205.
    // No new ticks during halt; caller passes the same lastTick repeatedly
    // (~one call per ~minute of the halt window in real operation).
    //
    // CURRENT BEHAVIOR: stop check is `currentPrice <= currentStopPrice`.
    // With currentPrice = $205 (stable, above stop $190), stop never fires
    // regardless of how many calls. This scenario WORKS TODAY.
    //
    // Asserts current behavior is correct for the benign case (defends against
    // future regression where a halt-resilient fix might over-correct and
    // incorrectly fire stops during legitimate paused windows).

    let lastDecision: any = null;
    // Simulate ~10 calls (~10 simulated minutes of halt with no new ticks).
    for (let i = 0; i < 10; i++) {
      lastDecision = await evaluateTECExit({
        tradeId: 'AAPL/USD',
        symbol: 'AAPL/USD',
        entryPrice: 200, stopPrice: 190, targetPrice: 230,
        currentPrice: 205, atr: 3,
        holdDurationMs: 60_000 + i * 60_000, maxHoldMs: 7 * 86400_000,
        context: xstockContext, useTrailing: true, callerMode: 'paper',
        currentSlotTotal: 10,
      });
    }
    expect(lastDecision.shouldExit).toBe(false);
    expect(lastDecision.modeChanged).toBeFalsy();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 2: Stale-stream — equivalent to pause from TEC's perspective
  // ──────────────────────────────────────────────────────────────────────────

  it('STALE-STREAM: 10-minute halt with stale price (same value, advancing captured_at) does NOT fire stop', async () => {
    // Identical to scenario 1 from TEC's perspective. The freshness layer
    // would normally flag this as stale, but B-NEW-34 removed the xstock_spot
    // freshness window (_NO_WINDOW = Infinity), so the caller passes the
    // stale price through without gating. TEC sees a stable price → no stop.

    let lastDecision: any = null;
    for (let i = 0; i < 10; i++) {
      lastDecision = await evaluateTECExit({
        tradeId: 'AAPL/USD',
        symbol: 'AAPL/USD',
        entryPrice: 200, stopPrice: 190, targetPrice: 230,
        currentPrice: 205, atr: 3,
        holdDurationMs: 60_000 + i * 60_000, maxHoldMs: 7 * 86400_000,
        context: xstockContext, useTrailing: true, callerMode: 'paper',
        currentSlotTotal: 10,
      });
    }
    expect(lastDecision.shouldExit).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 3: Post-resume gap — THE GAP. Bug-documenting test.
  // ──────────────────────────────────────────────────────────────────────────

  it('POST-RESUME GAP (post-fix): 10-minute halt, resumes at gapped-down price below stop does NOT fire stop — discontinuity sentinel defers', async () => {
    // Pre-halt: position at $200, stop $190, target $230, currentPrice $205.
    // Halt fires (news pending, LULD circuit breaker, etc.) — ticker freezes
    // for 10 minutes.
    // Resume tick: currentPrice = $185 (gapped DOWN through stop on resume).
    //
    // The $185 is a "real" price the moment it appears, but the gap from $205
    // to $185 is a price-discovery discontinuity, not normal market movement.
    // A halt-resilient TEC would:
    //   (a) detect the discontinuity (last-tick was 10+ min ago, price moved
    //       >5% across the gap), AND
    //   (b) defer the stop check until at least one independent confirming
    //       tick after resume, OR re-evaluate the trailing stop level
    //       relative to the post-resume price baseline.
    //
    // CURRENT BEHAVIOR: TEC sees currentPrice ($185) <= currentStopPrice
    // ($190) → fires stop_hit. Exit price clamps to $190 (the stop), not
    // $185 (the actual resume price). That fill price would be unattainable
    // on a real market with a halt-resume gap — best execution would be at
    // or worse than $185, not at $190 — so the system would log a fictitious
    // PnL based on an unfillable price.
    //
    // POST-B-NEW-42b: assertion inverts to shouldExit=false (defer stop
    // check; await independent confirming tick). Also, the audit recommends
    // logging a [TEC_HALT_RESUME_DEFER] line so the deferral is observable.

    // B-NEW-42b: explicit timestamps for the detector. Without these, both
    // calls would land in microseconds in real wallclock → detector sees
    // ~0s gap, halt_resume_gap doesn't trigger (gap > 300s threshold). We
    // synthesize a 10-min halt window via explicit currentTs values.
    const t0 = 1_700_000_000_000;

    // Step 1: pre-halt baseline at $205 (t0).
    const preHalt = await evaluateTECExit({
      tradeId: 'TSLA/USD',
      symbol: 'TSLA/USD',
      entryPrice: 200, stopPrice: 190, targetPrice: 230,
      currentPrice: 205, atr: 3,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context: xstockContext, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
      currentTs: t0,
    });
    expect(preHalt.shouldExit).toBe(false);

    // Need a steady-state tick to populate the cache after cold-start; without
    // this, the next call would still be cold-start (cache populated but state
    // is IDLE awaiting actual prior-tick comparison; cold-start records and
    // returns active=true on FIRST call only).
    const steadyState = await evaluateTECExit({
      tradeId: 'TSLA/USD',
      symbol: 'TSLA/USD',
      entryPrice: 200, stopPrice: 190, targetPrice: 230,
      currentPrice: 205, atr: 3,
      holdDurationMs: 120_000, maxHoldMs: 7 * 86400_000,
      context: xstockContext, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
      currentTs: t0 + 60_000,
    });
    expect(steadyState.shouldExit).toBe(false);

    // Step 2 (skipped — halt window has no ticks; would be no-op calls).

    // Step 3: resume tick at $185 (gapped down through stop). 10-min after
    // last steady-state tick → detector sees gap=600s, |Δ%|=9.76% → triggers
    // halt_resume_gap.
    const postResume = await evaluateTECExit({
      tradeId: 'TSLA/USD',
      symbol: 'TSLA/USD',
      entryPrice: 200, stopPrice: 190, targetPrice: 230,
      currentPrice: 185, atr: 3,
      holdDurationMs: 11 * 60_000, maxHoldMs: 7 * 86400_000,
      context: xstockContext, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
      currentTs: t0 + 60_000 + 10 * 60_000,
    });

    // POST-FIX BEHAVIOR (B-NEW-42b): discontinuity sentinel flags the 660s
    // gap with |Δ%|≈10% from pre-halt price (well above 0.5% halt threshold)
    // → halt_resume_gap kind. shouldClosePosition short-circuits → returns
    // false. Trade stays open through the discontinuity window; next
    // confirming tick within the 30s clearing window transitions to IDLE.
    expect(postResume.shouldExit).toBe(false);

    // Langston Step 4 review recommendation: ensure the gate fired for the
    // INTENDED reason (halt_resume_gap), not cold_start fail-safe. Probe the
    // detector state directly post-call — entry.activeKind should be
    // 'halt_resume_gap' (we passed currentTs explicitly so synthesis is real).
    // If a future regression breaks the currentTs plumbing, the cold_start
    // path would silently fire here and this assert catches it.
    const { _testGetSymbolEntry } = await import('../../services/price-discontinuity-detector.js');
    const entry = _testGetSymbolEntry('TSLA/USD');
    expect(entry?.activeKind).toBe('halt_resume_gap');
  });
});
