/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B65.2 — TEC Exit-Evaluator Parity Test (end-to-end)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Exercises the full trailing engine via evaluateTECExit() with DB mocked.
 * Covers the Langston-approved scenario set plus the new B65.2 additions
 * (qualifier accept/reject, concurrency cap, duration cap).
 *
 * Scenarios:
 *   1. Non-trailing stop hit (useTrailing:false)
 *   2. Non-trailing target hit (useTrailing:false)
 *   3. Stale-price force-close (currentPrice=null, hold > maxHold)
 *   4. MAX_HOLD_MS timeout with live price
 *   5. Qualifier accept: strong_bull_trend hits target → enters moonbag (modeChanged)
 *   6. Qualifier reject: unknown_strategy hits target → closes at target, no mode flip
 *   7. Source-pool qualifier: vwap_pullback requires quant-strong_trend pool
 *   8. Concurrency cap: paper at N-1 blocks further moonbag entries
 *   9. VTS unlimited: no concurrency cap regardless of count
 *  10. Resolved constants include all B65.1 + B65.2 seeds
 *
 * DB mocked via vitest. Real trailing-exit-controller logic exercised.
 * Cost metrics stubbed to zero for clean arithmetic.
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

// --- Storage stub (not actually exercised by the evaluator, but the trailing
//     engine's async module-sync helper imports it). ---
vi.mock('../../storage.js', () => ({
  storage: {
    getPaperSimOpenPositions: async () => [],
    updatePaperSimOpenPosition: async () => undefined,
  },
}));

// --- Trade-safety stub (debounced persistence — not exercised in tests). ---
vi.mock('../../services/trade-safety.js', () => ({
  persistTrailingStates: () => undefined,
}));

import { evaluateTECExit } from '../../services/tec-evaluator.js';
import {
  clearTrailingState,
  getConcurrentMoonbagCount,
  getResolvedTECConfig,
} from '../../services/trailing-exit-controller.js';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';

// --- Helper: seed the module_constants rowset with all B65.1 + B65.2 defaults.
function seedAllConstants() {
  const base = {
    moduleName: 'trailing_exit',
    exchange: '*',
    assetClass: '*',
    strategy: '*',
    regime: '*',
    updatedAt: new Date(),
    updatedBy: 'test',
  };
  mockRows.current = [
    { ...base, constantName: 'break_even_trigger_r', value: 1.0 },
    { ...base, constantName: 'target_lock_r', value: 1.5 },
    { ...base, constantName: 'trail_distance_atr_multiplier', value: 1.0 },
    { ...base, constantName: 'persistence_debounce_ms', value: 5000 },
    {
      ...base,
      constantName: 'moonbag_qualifying_strategies',
      value: ['strong_bull_trend', 'sma_trend_ride', 'vwap_pullback', 'breakout'],
    },
    {
      ...base,
      constantName: 'moonbag_qualifying_source_pools',
      value: { vwap_pullback: ['quant-strong_trend'] },
    },
    { ...base, constantName: 'moonbag_max_duration_ms', value: 14400000 },
    { ...base, constantName: 'moonbag_cap_mode', value: 'reserved_slots' },
    { ...base, constantName: 'moonbag_reserved_slots', value: 1 },
  ];
}

const context = {
  exchange: 'kraken',
  assetClass: 'crypto_spot',
  strategy: 'strong_bull_trend',
  regime: 'TREND_FRIENDLY_STABLE',
};

describe('B65.2 — evaluateTECExit end-to-end', () => {
  beforeEach(() => {
    clearModuleConstantsCache();
    seedAllConstants();
    // Reset engine state between tests.
    clearTrailingState('BTC/USD');
    clearTrailingState('ETH/USD');
    clearTrailingState('SOL/USD');
  });

  it('Scenario 1: useTrailing=false, stop hit clamps to stop', async () => {
    const d = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 94, atr: 0,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: false,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('stop_hit');
    expect(d.exitPrice).toBe(95);
  });

  it('Scenario 2: useTrailing=false, target hit clamps to target', async () => {
    const d = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 112, atr: 0,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: false,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('target_hit');
    expect(d.exitPrice).toBe(110);
  });

  it('Scenario 3: stale-price force-close exits at entry', async () => {
    const d = await evaluateTECExit({
      symbol: 'ILLIQUID/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: null, atr: 0,
      holdDurationMs: 8 * 86400_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: false,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('stale_timeout');
    expect(d.exitPrice).toBe(100);
  });

  it('Scenario 4: MAX_HOLD timeout with live price closes at currentPrice', async () => {
    const d = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 103, atr: 0,
      holdDurationMs: 8 * 86400_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: false,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('timeout');
    expect(d.exitPrice).toBe(103);
  });

  it('Scenario 5: qualifier accept — strong_bull_trend hits target, enters moonbag', async () => {
    const d = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 111, atr: 2,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });
    expect(d.modeChanged).toBe(true);
    expect(d.shouldExit).toBe(false);
    // The engine bumped into moonbag; trade is NOT exited here, the stop has
    // been latched at target floor and future cycles will trail.
  });

  it('Scenario 6: qualifier reject — unknown strategy hits target, closes without moonbag', async () => {
    const d = await evaluateTECExit({
      symbol: 'ETH/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 111, atr: 2,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context: { ...context, strategy: 'mean_reversion' },
      useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('target_hit');
    expect(d.exitPrice).toBe(110);
    expect(d.modeChanged).toBeFalsy();
  });

  it('Scenario 7: source-pool qualifier — vwap_pullback outside strong-trend pool rejected', async () => {
    const d = await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 111, atr: 2,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context: { ...context, strategy: 'vwap_pullback' },
      sourcePool: 'quant-mean_reversion', // NOT quant-strong_trend
      useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('target_hit');
    expect(d.modeChanged).toBeFalsy();
  });

  it('Scenario 8: concurrency cap — paper at N-1 blocks further moonbag entries', async () => {
    // Trade 1 enters moonbag (10 slots total, reserved=1, so cap = 9 moonbags)
    await evaluateTECExit({
      symbol: 'BTC/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 111, atr: 2,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 2, // cap = 2 - 1 = 1 moonbag allowed
    });
    expect(getConcurrentMoonbagCount('paper')).toBe(1);

    // Trade 2: strategy qualifies, but cap exhausted → closes at target.
    const d = await evaluateTECExit({
      symbol: 'ETH/USD',
      entryPrice: 200, stopPrice: 190, targetPrice: 220,
      currentPrice: 221, atr: 4,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 2,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('target_hit');
    expect(getConcurrentMoonbagCount('paper')).toBe(1);
  });

  it('Scenario 9: VTS unlimited — concurrency cap never blocks', async () => {
    // Pre-seed 50 concurrent moonbags by cycling trades through the engine.
    // Even with currentSlotTotal = 3, VTS should allow the 51st moonbag.
    for (let i = 0; i < 5; i++) {
      await evaluateTECExit({
        symbol: `PAIR${i}/USD`,
        entryPrice: 100, stopPrice: 95, targetPrice: 110,
        currentPrice: 111, atr: 2,
        holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
        context, useTrailing: true, callerMode: 'vts',
        currentSlotTotal: 3, // would cap paper at 2; VTS ignores it
      });
    }
    expect(getConcurrentMoonbagCount('vts')).toBe(5);

    const d = await evaluateTECExit({
      symbol: 'NEWPAIR/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 111, atr: 2,
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'vts',
      currentSlotTotal: 3,
    });
    expect(d.modeChanged).toBe(true);
    expect(getConcurrentMoonbagCount('vts')).toBe(6);
  });

  it('Scenario 10: resolved constants include all B65.1 + B65.2 seeds', async () => {
    const cfg = await getResolvedTECConfig();
    expect(cfg.breakEvenTriggerR).toBe(1.0);
    expect(cfg.targetLockR).toBe(1.5);
    expect(cfg.trailDistanceAtrMultiplier).toBe(1.0);
    expect(cfg.moonbagMaxDurationMs).toBe(14400000);
    expect(cfg.moonbagCapMode).toBe('reserved_slots');
    expect(cfg.moonbagReservedSlots).toBe(1);
    expect(cfg.moonbagQualifyingStrategies).toContain('strong_bull_trend');
    expect(cfg.moonbagQualifyingStrategies).toContain('breakout');
    expect(cfg.moonbagQualifyingSourcePools.vwap_pullback).toContain('quant-strong_trend');
  });

  it('Scenario 11: stop_hit via trailing path (engine never ratcheted) reports as stop_hit, not trailing_stop_hit', async () => {
    const d = await evaluateTECExit({
      symbol: 'SOL/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 110,
      currentPrice: 94, atr: 2, // price below stop, ATR present
      holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper',
      currentSlotTotal: 10,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('stop_hit');
    expect(d.exitPrice).toBe(95); // clamped to static stop level
  });

  // ─────────────────────────────────────────────────────────────────────
  // B65.4 (2026-04-25) — Ladder model scenarios
  // ─────────────────────────────────────────────────────────────────────

  it('Scenario 12 (B65.4): Rung 1 hit + reverse — exit captures original-target floor', async () => {
    // Trade entry $100, stop $95, target $107.5 → R = 5, R_step = 7.5
    // Price hits $107.5 → rung 1: new target = $115, new floor = $107.5
    // Price reverses to $107.30 → exit with ladderRungsHit=1
    const sym = 'LADDER1/USD';
    // Step 1: hit rung 1
    let d = await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 107.5, atr: 2, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    expect(d.modeChanged).toBe(true);
    expect(d.ladderRungsHit).toBe(1);
    expect(d.shouldExit).toBe(false);
    // Step 2: price reverses below rung floor
    d = await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 107.30, atr: 2, holdDurationMs: 120_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('trailing_stop_hit');
    expect(d.ladderRungsHit).toBe(1);
  });

  it('Scenario 13 (B65.4): Rung 2 hit + reverse — captures rung-1 floor (locked-in profit)', async () => {
    // Trade hits rung 1 at $107.5, then rung 2 at $115. Reverse to $114.40.
    const sym = 'LADDER2/USD';
    // rung 1
    await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 107.5, atr: 2, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    // rung 2
    let d = await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 115, atr: 2, holdDurationMs: 120_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    expect(d.ladderRungsHit).toBe(2);
    expect(d.shouldExit).toBe(false);
    // reverse below rung-2 floor (115)
    d = await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 114.40, atr: 2, holdDurationMs: 180_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('trailing_stop_hit');
    expect(d.ladderRungsHit).toBe(2);
  });

  it('Scenario 14 (B65.4): Rung 3 hit — multi-rung gap in single cycle', async () => {
    // Price gap directly from below rung-1 to past rung-3 in one cycle.
    // Engine should ladder up through all rungs cleared.
    const sym = 'LADDER3/USD';
    const d = await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 123, atr: 2, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    // Single cycle should ratchet: rung 1 ($107.5), rung 2 ($115), rung 3 ($122.5).
    // currentPrice $123 ≥ $122.5 (rung 3 target), but < $130 (rung 4 target).
    expect(d.ladderRungsHit).toBe(3);
  });

  it('Scenario 15 (B65.4): Qualifier reject at rung 0 — closes at target with ladderRungsHit=0', async () => {
    const d = await evaluateTECExit({
      symbol: 'LADDER4/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 108, atr: 2, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context: { ...context, strategy: 'mean_reversion' }, // not in qualifier list
      useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('target_hit');
    expect(d.ladderRungsHit).toBe(0);
  });

  it('Scenario 16 (B65.4): Concurrency cap reject — same outcome', async () => {
    // First trade fills the cap.
    await evaluateTECExit({
      symbol: 'LADDER5A/USD',
      entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 108, atr: 2, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 2, // cap = 1
    });
    // Second trade — cap blocks moonbag entry
    const d = await evaluateTECExit({
      symbol: 'LADDER5B/USD',
      entryPrice: 200, stopPrice: 190, targetPrice: 215,
      currentPrice: 216, atr: 4, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 2,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('target_hit');
    expect(d.ladderRungsHit).toBe(0);
  });

  it('Scenario 17 (B65.4): HWM dynamic floor — captures upside when running between rungs', async () => {
    // After rung 1, price climbs to $113 (between rung-1 target $107.5 and rung-2 target $115).
    // HWM = $113. K' default ~1 → dynamic stop ≈ $113 - 1×ATR = $113 - 2 = $111.
    // Effective stop = max(rungFloor=$107.5, dynamicStop=$111) = $111.
    // Reverse to $110.50 → exit at $110.50 (ABOVE rung floor, captured upside via HWM).
    const sym = 'LADDER6/USD';
    // rung 1
    await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 107.5, atr: 2, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    // climb between rungs
    await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 113, atr: 2, holdDurationMs: 120_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    // reverse — should hit dynamic floor, not rung floor
    const d = await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 110.50, atr: 2, holdDurationMs: 180_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('trailing_stop_hit');
    expect(d.ladderRungsHit).toBe(1); // never made it to rung 2
    // Exit price is currentPrice (engine's "exit at currentPrice when stop hit" convention).
    // The point: stop level was ABOVE rung-1 floor due to dynamic HWM trail.
  });

  it('Scenario 18 (B65.4): Duration cap fires at rung > 1 — moonbag_timeout with ladder count preserved', async () => {
    // Use a tiny moonbag duration cap by setting moonbag_max_duration_ms via mockRows.
    // After climbing to rung 2, sit until duration cap fires.
    mockRows.current = mockRows.current.map(r =>
      r.constantName === 'moonbag_max_duration_ms' ? { ...r, value: 100 } : r
    );
    clearModuleConstantsCache();

    const sym = 'LADDER7/USD';
    // rung 1
    await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 107.5, atr: 2, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    // rung 2
    await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 115, atr: 2, holdDurationMs: 90_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    // wait past the cap
    await new Promise(resolve => setTimeout(resolve, 200));
    const d = await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 116, atr: 2, holdDurationMs: 95_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    expect(d.shouldExit).toBe(true);
    expect(d.exitReason).toBe('moonbag_timeout');
    expect(d.ladderRungsHit).toBe(2);
  });

  it('Scenario 19 (B65.4): Backward-compat persistence — pre-ladder state migrates to ladderRung=1 if targetLatched', async () => {
    // Test the importStates migration path. Old state shape (no ladder fields).
    const { importStates, getTrailingState } = await import('../../services/trailing-exit-controller.js');

    const oldState: any = {
      symbol: 'OLDSTATE/USD',
      tradeMode: 'TRAILING_TAKE',
      entryPrice: 100,
      targetPrice: 107.5,
      currentStopPrice: 107.5,
      highWaterMark: 110,
      breakEvenLatched: true,
      targetLatched: true,
      lastUpdated: Date.now() - 60_000,
      DI: 50,
      VolNoise: 0.3,
      ATR: 2,
      callerMode: 'paper',
      // ladderRung, currentRungTarget, currentRungFloor INTENTIONALLY missing
    };

    importStates([oldState]);
    const restored = getTrailingState('OLDSTATE/USD');
    expect(restored).toBeDefined();
    expect(restored?.ladderRung).toBe(1); // migrated because targetLatched=true
    expect(restored?.currentRungTarget).toBe(107.5); // best-effort
    expect(restored?.currentRungFloor).toBe(0); // safe default
  });

  it('Scenario 20 (B65.4 — Langston Q5 ordering test): Rung target hit on same tick as HWM update', async () => {
    // Critical ordering: when currentPrice equals a rung target exactly,
    // the rung event must fire FIRST, then HWM updates, then dynamic trail
    // computes against the new HWM. If HWM updates first, the dynamic trail
    // could overshoot the new rung floor and produce inconsistent state.
    //
    // Setup: rung 1 already hit. currentRungTarget = $115. ATR = 2.
    // currentPrice = $115 exactly. Expected:
    //   1. Loop fires: ladderRung increments to 2, currentRungFloor = $115.
    //   2. HWM updates to $115.
    //   3. Dynamic trail: HWM - K'×ATR = $115 - 1×2 = $113.
    //   4. newStop = max(currentRungFloor=$115, dynamicStop=$113) = $115.
    //
    // The rung floor wins, stop locks at $115 — locked-in profit at the rung
    // target. If HWM update came first, dynamic could be higher than $115
    // (which it isn't here), but rungFloor of $115 still wins.
    const sym = 'LADDER8/USD';
    // rung 1
    await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 107.5, atr: 2, holdDurationMs: 60_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    // currentPrice exactly at rung-2 target
    const d = await evaluateTECExit({
      symbol: sym, entryPrice: 100, stopPrice: 95, targetPrice: 107.5,
      currentPrice: 115, atr: 2, holdDurationMs: 120_000, maxHoldMs: 7 * 86400_000,
      context, useTrailing: true, callerMode: 'paper', currentSlotTotal: 10,
    });
    expect(d.ladderRungsHit).toBe(2);
    expect(d.newStopPrice).toBeGreaterThanOrEqual(115); // rung-2 floor at $115
    expect(d.shouldExit).toBe(false); // not exited; trade is alive at the rung-2 target boundary
  });
});
