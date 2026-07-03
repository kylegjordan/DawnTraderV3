/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-42 §2.1.4 — TEC split-resilience regression test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * **PURPOSE: Verifies the B-NEW-42b fix (post-assertion-inversion).**
 *
 * **History:** Pre-B-NEW-42b this test documented the structural gap in the
 * trailing-exit controller's stop-trigger — `currentPrice <= currentStopPrice`
 * (server/services/trailing-exit-controller.ts:1330) — by asserting that a
 * synthetic 50% drop (2:1 split) DID fire the stop and a 2× jump (1:2 reverse
 * split) DID phantom-promote to TRAILING_TAKE.
 *
 * **B-NEW-42b inverted the assertions** — the new
 * `server/services/price-discontinuity-detector.ts` sentinel module short-
 * circuits both the stop-check and target-lock gates when it detects a
 * single-bar price change ≥40% (corp_action kind). TEC's stop-check now
 * returns `false` and target-lock fires `false` during the discontinuity
 * window — the fix's verification surface.
 *
 * Kraken's WebSocket schema (verified B-NEW-42 §2.1.3) sends no
 * `adjustment_factor` / `event_type` / `corporate_action` envelope fields with
 * their ticker stream. There is no upstream signal we consume; the detector
 * infers structural events from single-bar discontinuity magnitude alone.
 *
 * Two variants per Langston rev2 §2.1.4:
 *
 *   - **Forward split (2:1):** synthetic 50% single-bar drop. Asserts stop
 *     fires (the bug). Post-fix: assert stop does NOT fire.
 *
 *   - **Reverse split (1:2):** synthetic 2× single-bar jump on LONG position
 *     with target in the jump's path. Per pre-audit §3.2: entry $50, target
 *     $80, jump to $100 — guarantees the jump traverses target, exercising
 *     `isTargetLockTriggered` and the phantom-promote-to-TRAILING_TAKE risk.
 *     Currently target-lock latches on the jump. Post-fix: corporate-action
 *     detector short-circuits the target check on a >40% single-bar
 *     discontinuity, NO mode change.
 *
 * **Test mock fidelity (CLAUDE.md §6 "Trust but verify"):** uses the actual
 * exported `evaluateTECExit` API (not a re-implementation). Mocks only the
 * upstream db / cost-model / storage / trade-safety layers (matches B-NEW-40
 * + b65 test patterns). The trailing engine state machine runs unmocked.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- DB mock: service reads rows synchronously from this in-memory table. ---
const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mockRows.current,
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: async () => undefined,
      }),
    }),
  },
}));

// --- Cost metrics stub: zero costs → net-breakeven = entry, net-target = target.
vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (entry: number) => entry,
  computeNetTargetFloor: (target: number) => target,
  computeTotalRoundTripCost: () => 0,
}));

// --- Storage stub (not exercised by the evaluator, but the trailing engine
//     async helper imports it). ---
vi.mock('../../storage.js', () => ({
  storage: {
    getActiveOpenPositions: async () => [],
    updateActiveOpenPosition: async () => undefined,
  },
}));

// --- Trade-safety stub (debounced persistence — not exercised in tests). ---
vi.mock('../../services/trade-safety.js', () => ({
  persistTrailingStates: () => undefined,
}));

// ──────────────────────────────────────────────────────────────────────────
// MARKET-HOURS MOCK — fidelity flag (Langston rev1 §5 + verdict-check-in 4e)
// ──────────────────────────────────────────────────────────────────────────
// Without this mock the TEC weekend gate (server/asset_classes/xstock_spot/
// market-hours.ts → isXstockMarketOpenUTC) short-circuits all xstock_spot
// updatePosition calls when the host clock falls in Fri 8PM ET → Sun 8PM ET.
// Returns state unchanged regardless of currentPrice.
//
// **CI implication:** if CI runs on a weekend (or any time the host clock
// is in the gated window), tests with assetClass='xstock_spot' will silently
// no-op via the gate. They will appear to pass even when the underlying bug
// they document is unchanged. This mock isolates the structural TEC gap from
// the orthogonal weekend-safety gate so the regression test means what its
// name says.
//
// **Mock-removal failure mode (silent test rot):** if a future cleanup pass
// removes this mock as "obviously unused", the next CI run that lands on a
// weekend day will mask the bug — every assertion in this file passes
// regardless of the trailing-stop code's actual behavior. The mock is
// intentional and load-bearing. DO NOT remove without replacing with a
// test-friendly time-injection in the market-hours module.
//
// The weekend gate itself is a real safety on the live path — splits are
// almost always overnight-effective, so the gate IS partial defense against
// the forward/reverse split scenarios in production. Halts (intra-RTH) are
// NOT covered by the gate; the halt-resilience test in the sibling file
// exercises that exposure.
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
// B-NEW-42b: clear per-symbol detector state between tests so each starts cold.
import { _testClearAllState as _testClearDetectorState } from '../../services/price-discontinuity-detector.js';
// B-NEW-43 Phase 2 chunk 8 (2026-05-23): seed XSTOCK_SPOT_SYMBOLS so the
// discontinuity detector recognizes test symbols as in-universe.
import { seedXstockUniverse } from '../helpers/seed-xstock-universe.js';

// Seed all module_constants rows required by primeTECConfig
function seedAllConstants() {
  const wildcard = {
    moduleName: 'trailing_exit',
    exchange: '*',
    assetClass: '*',
    strategy: '*',
    regime: '*',
    updatedAt: new Date(),
    updatedBy: 'test',
  };
  const perClassBE = (cls: string) => ({
    ...wildcard,
    assetClass: cls,
    constantName: 'break_even_enabled',
    value: false,
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
      ...wildcard,
      constantName: 'moonbag_qualifying_strategies',
      value: ['strong_bull_trend', 'sma_trend_ride', 'vwap_pullback', 'breakout'],
    },
    {
      ...wildcard,
      constantName: 'moonbag_qualifying_source_pools',
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

describe('B-NEW-42 §2.1.4 — TEC split-resilience (VERIFIES B-NEW-42b FIX)', () => {
  beforeEach(async () => {
    seedXstockUniverse();
    clearModuleConstantsCache();
    seedAllConstants();
    _testClearEngineConfigCache();
    await primeTECConfig();
    clearTrailingState('AAPL/USD');
    clearTrailingState('TSLA/USD');
    clearTrailingState('NVDA/USD');
    // B-NEW-42b: clear per-symbol discontinuity-detector cache so each test
    // starts cold. Forward-split + reverse-split tests use real xStock
    // symbols (AAPL/USD + TSLA/USD) so the detector intercepts.
    _testClearDetectorState();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Forward split (2:1) — 50% single-bar drop
  // ──────────────────────────────────────────────────────────────────────────

  it('FORWARD SPLIT (post-fix): 50% single-bar drop does NOT fire stop — discontinuity sentinel short-circuits', async () => {
    // Pre-split state: LONG AAPL at $200, stop $190, target $230, currentPrice
    // is steady at $205. With useTrailing=true, the engine doesn't move the
    // stop on its own without break-even latching or target-lock; with
    // break_even_enabled=false (seeded), the stop stays at $190.
    //
    // Simulate 2:1 split: next call comes in at currentPrice=$100. Kraken
    // sends post-split price as if it were real price action. TEC sees
    // currentPrice ($100) <= currentStopPrice ($190) → fires stop_hit.
    //
    // Current behavior assertion: shouldExit=true, exitReason='stop_hit',
    // exitPrice clamped to $190 (the pre-split stop, post-clamp).
    //
    // Post B-NEW-42b: the assertion inverts to shouldExit=false because a
    // corporate-action detector recognizes the >40% single-bar drop as a
    // structural event (not real price movement) and short-circuits the
    // stop check until adjustment processing completes.

    // Step 1: pre-split — establish baseline trailing state at $205.
    const preSplit = await evaluateTECExit({
      tradeId: 'AAPL/USD',
      symbol: 'AAPL/USD',
      entryPrice: 200, stopPrice: 190, targetPrice: 230,
      currentPrice: 205, atr: 3,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context: xstockContext, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });
    expect(preSplit.shouldExit).toBe(false);

    // Step 2: 2:1 split — currentPrice halves to $100. Stop at $190 still > price.
    const postSplit = await evaluateTECExit({
      tradeId: 'AAPL/USD',
      symbol: 'AAPL/USD',
      entryPrice: 200, stopPrice: 190, targetPrice: 230,
      currentPrice: 100, atr: 3,
      holdDurationMs: 120_000, maxHoldMs: 7 * 86400_000,
      context: xstockContext, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });

    // POST-FIX BEHAVIOR (B-NEW-42b): discontinuity sentinel short-circuits the
    // target-lock check on the 50% drop (|Δ%|=50 >= 40% corp_action threshold).
    // The stop check in `shouldClosePosition` is also short-circuited if the
    // path reaches it. shouldExit=false → trade stays open until next confirming
    // tick clears the discontinuity OR the 24h TTL auto-clears the corp_action
    // state.
    expect(postSplit.shouldExit).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Reverse split (1:2) — 2× single-bar jump on LONG, target in path
  // ──────────────────────────────────────────────────────────────────────────

  it('REVERSE SPLIT (post-fix): 2× jump on LONG (entry $50, target $80, jump to $100) does NOT phantom-promote — discontinuity sentinel short-circuits target-lock', async () => {
    // Per pre-audit §3.2: parameters chosen to stress phantom-promotion.
    // Entry $50, target $80, single-bar jump $50 → $100. Jump traverses
    // target ($80), so isTargetLockTriggered() returns true, target-lock
    // latch fires, mode flips to TRAILING_TAKE (moonbag), stop locked to
    // target floor.
    //
    // Current behavior assertion: modeChanged=true (phantom-promoted on
    // reverse-split discontinuity). shouldExit=false (target-lock doesn't
    // immediately exit; the engine assumes real upside continuation and
    // trails the moonbag).
    //
    // Post B-NEW-42b: assertion inverts to modeChanged=false because the
    // corporate-action detector recognizes the >40% single-bar jump and
    // short-circuits the target-lock check until adjustment processing
    // completes.

    // Step 1: pre-jump — establish baseline at $52 (small profit, no latches).
    const preJump = await evaluateTECExit({
      tradeId: 'TSLA/USD',
      symbol: 'TSLA/USD',
      entryPrice: 50, stopPrice: 45, targetPrice: 80,
      currentPrice: 52, atr: 1,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context: xstockContext, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });
    expect(preJump.shouldExit).toBe(false);
    expect(preJump.modeChanged).toBeFalsy();

    // Step 2: 1:2 reverse-split jump — currentPrice doubles to $100, past
    // target ($80). target-lock fires.
    const postJump = await evaluateTECExit({
      tradeId: 'TSLA/USD',
      symbol: 'TSLA/USD',
      entryPrice: 50, stopPrice: 45, targetPrice: 80,
      currentPrice: 100, atr: 1,
      holdDurationMs: 120_000, maxHoldMs: 7 * 86400_000,
      context: xstockContext, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });

    // POST-FIX BEHAVIOR (B-NEW-42b): discontinuity sentinel flags the 100%
    // single-bar jump (|Δ%|=100 >= 40% corp_action threshold). Target-lock
    // check is short-circuited → modeChanged=false, no phantom-promotion to
    // TRAILING_TAKE. shouldExit also false (no stop fires; no target latches).
    expect(postJump.modeChanged).toBeFalsy();
    expect(postJump.shouldExit).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Sanity check: NORMAL price movement (no split) should not trigger either
  // failure mode. Used to validate the test harness itself, not behavior.
  // ──────────────────────────────────────────────────────────────────────────

  it('SANITY: normal 5% intraday move neither fires stop nor latches target', async () => {
    const normal = await evaluateTECExit({
      tradeId: 'NVDA/USD',
      symbol: 'NVDA/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 120,
      currentPrice: 105, atr: 2,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context: xstockContext, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });
    expect(normal.shouldExit).toBe(false);
    expect(normal.modeChanged).toBeFalsy();
  });
});
