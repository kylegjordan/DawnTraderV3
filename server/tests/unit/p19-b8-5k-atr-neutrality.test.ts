/**
 * P19-B8.5k (B-ATR-RESTORE, #556) — ATR carry restore: NEUTRALITY UNDER atr>0.
 *
 * B8.5i proved the trailing switch neutral while atr=0 — but with atr=0 the
 * `useTrailing && atr>0` block in tec-evaluator never runs, so the state machine
 * never actually executed. Restoring the atr carry (OBJ-1) makes atr>0 on the
 * active path, firing tecUpdatePosition for the FIRST time. This suite re-proves
 * neutrality under that new condition, against the LIVE production config
 * (break_even_enabled=false, moonbag_qualifying_strategies=[], trailing switches
 * false — verified on the staging DB, all four asset classes):
 *
 *  - OBJ-2(b) behavioural: with BE off + moonbag off, a price that WOULD latch
 *    break-even in the BE-on config produces NO stop movement (the write-back at
 *    active-execution-engine.ts:1563 guards on `> stopLoss`, so an unchanged stop
 *    is a genuine no-op); and at target the position closes without flipping into
 *    TRAILING_TAKE.
 *  - OBJ-1 + OBJ-2(b) source guards: the atr carry is wired at the rebuild, and
 *    the write-back guard is strict `>`.
 *
 * Mirrors the DB-mock + primeTECConfig harness of trailing-exit.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// --- DB mock so primeTECConfig can resolve module_constants (B79.TEC harness). ---
const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: { select: () => ({ from: () => ({ where: async () => mockRows.current }) }) },
}));
vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (entry: number) => entry,
  computeNetTargetFloor: (target: number) => target,
  computeTotalRoundTripCost: () => 0,
}));
vi.mock('../../storage.js', () => ({
  storage: { getActiveOpenPositions: async () => [], updateActiveOpenPosition: async () => undefined },
}));
vi.mock('../../services/trade-safety.js', () => ({ persistTrailingStates: () => undefined }));

import {
  initializeTrailingState,
  updatePosition,
  clearTrailingState,
  primeTECConfig,
  _testClearEngineConfigCache,
} from '../../services/trailing-exit-controller.js';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';

const wildcardBase = {
  moduleName: 'trailing_exit',
  exchange: '*',
  assetClass: '*',
  strategy: '*',
  regime: '*',
  updatedAt: new Date(),
  updatedBy: 'test',
};

// The LIVE production config (staging DB, 2026-07-24, all 4 classes):
// break_even_enabled=false, moonbag_qualifying_strategies=[], trailing switches false.
function seedLiveTECRows() {
  mockRows.current = [
    { ...wildcardBase, assetClass: 'crypto_spot', constantName: 'break_even_enabled', value: false },
    { ...wildcardBase, assetClass: 'crypto_perp', constantName: 'break_even_enabled', value: false },
    { ...wildcardBase, assetClass: 'xstock_spot', constantName: 'break_even_enabled', value: false },
    { ...wildcardBase, assetClass: 'xstock_perp', constantName: 'break_even_enabled', value: false },
    { ...wildcardBase, constantName: 'break_even_trigger_r', value: 1.0 },
    { ...wildcardBase, constantName: 'target_lock_r', value: 1.5 },
    { ...wildcardBase, constantName: 'trail_distance_atr_multiplier', value: 1.0 },
    { ...wildcardBase, constantName: 'persistence_debounce_ms', value: 5000 },
    { ...wildcardBase, constantName: 'moonbag_qualifying_strategies', value: [] },
    { ...wildcardBase, constantName: 'moonbag_qualifying_source_pools', value: {} },
    { ...wildcardBase, constantName: 'moonbag_max_duration_ms', value: 14400000 },
    { ...wildcardBase, constantName: 'moonbag_cap_mode', value: 'reserved_slots' },
    { ...wildcardBase, constantName: 'moonbag_reserved_slots', value: 1 },
    { ...wildcardBase, constantName: 'rung_floor_slippage_buffer_multiplier', value: 1.0 },
    { ...wildcardBase, constantName: 'trailing_enabled_vts', value: false },
    { ...wildcardBase, constantName: 'trailing_enabled_active', value: false },
  ];
}

describe('P19-B8.5k — ATR carry: neutrality under atr>0 (OBJ-2b behavioural)', () => {
  beforeEach(async () => {
    clearModuleConstantsCache();
    seedLiveTECRows();
    _testClearEngineConfigCache();
    await primeTECConfig();
    clearTrailingState('ATRK/USD');
  });

  it('BE off + atr>0: a price that WOULD latch break-even does NOT move the stop (no write-back trigger)', () => {
    // entry 100, target 110, stop 95, ATR 2. currentPrice 105 = 2.5×ATR gain —
    // this latches BE (and ratchets the stop) in the BE-ON config
    // (trailing-exit.test.ts latches the same shape at 102). With BE OFF it must not.
    initializeTrailingState('ATRK/USD', 'ATRK/USD', 100, 110, 95, 50, 0.3, 2);
    const result = updatePosition({
      tradeId: 'ATRK/USD',
      symbol: 'ATRK/USD',
      entryPrice: 100,
      targetPrice: 110,
      currentPrice: 105,
      DI: 50,
      VolNoise: 0.3,
      ATR: 2,
      currentStopPrice: 95,
      assetClass: 'crypto_spot',
      moonbagQualified: false,
      moonbagAllowed: false,
      callerMode: 'paper',
      discontinuity: { active: false },
    });
    expect(result.breakEvenLatched).toBe(false); // BE gated off → never latches
    expect(result.newStopPrice).toBe(95);         // stop unchanged → write-back is a no-op
    expect(result.newStopPrice).not.toBeGreaterThan(95);
  });

  it('atr>0 + moonbag off: at target the position CLOSES without flipping into TRAILING_TAKE', () => {
    initializeTrailingState('ATRK/USD', 'ATRK/USD', 100, 110, 95, 50, 0.3, 2);
    const result = updatePosition({
      tradeId: 'ATRK/USD',
      symbol: 'ATRK/USD',
      entryPrice: 100,
      targetPrice: 110,
      currentPrice: 112,        // at/above target
      DI: 50,
      VolNoise: 0.3,
      ATR: 2,
      currentStopPrice: 95,
      assetClass: 'crypto_spot',
      moonbagQualified: false,  // live: isMoonbagQualifier returns false (flag off, empty list)
      moonbagAllowed: false,
      callerMode: 'paper',
      discontinuity: { active: false },
    });
    expect(result.newMode).toBe('TARGET');        // NO flip to TRAILING_TAKE
    expect(result.modeChanged).toBe(false);
    expect(result.closeNow).toBe(true);            // closes at target instead of trailing
    expect(result.closeReason).toBe('target_hit_no_trailing');
  });
});

describe('P19-B8.5k — source guards (OBJ-1 carry + OBJ-2b write-back)', () => {
  const root = join(__dirname, '..', '..', '..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');

  it('OBJ-1: signal-orchestrator carries atr forward at the sized-signal metadata rebuild', () => {
    const src = read('server/services/signal-orchestrator.ts');
    expect(src).toMatch(/atr:\s*sizingContext\.atr/);
  });

  it('OBJ-2b: the exit-engine stop write-back is guarded by a strict `> stopLoss` (equal ⇒ no-op)', () => {
    const src = read('server/services/active-execution-engine.ts');
    expect(src).toMatch(/decision\.newStopPrice\s*>\s*stopLoss/);
  });
});
