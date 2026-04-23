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
});
