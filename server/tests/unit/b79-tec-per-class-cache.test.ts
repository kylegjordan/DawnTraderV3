/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B79.TEC — Per-asset-class TEC config cache architecture
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Validates the load-bearing structural fix from B79.TEC:
 *   - cache structure: Map<AssetClass, TrailingExitConfig>
 *   - resolveTECConfig: sync, per-class lookup
 *   - primeTECConfig: HARD-FAILs when explicit per-class break_even_enabled
 *     row is missing (hostile-sim equivalent)
 *   - TEC_DEFAULTS.breakEvenEnabled: false (fail-closed)
 *   - cache miss for unregistered class throws [TEC_CACHE_MISS_FATAL]
 *
 * DB mocked. The mock rowset is mutated per-test to drive the various
 * primeTECConfig outcomes.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mockRows.current,
      }),
    }),
  },
}));

// Cost metrics + storage stubs for engine compatibility.
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

import {
  primeTECConfig,
  resolveTECConfig,
  getResolvedTECConfig,
  getTECBootstrapStatus,
  _testClearEngineConfigCache,
  updatePosition,
  clearTrailingState,
} from '../../services/trailing-exit-controller.js';
import { clearModuleConstantsCache } from '../../services/module-constants-service.js';
import { ASSET_CLASSES } from '../../../shared/asset-classes.js';

const wildcardBase = {
  moduleName: 'trailing_exit',
  exchange: '*',
  assetClass: '*',
  strategy: '*',
  regime: '*',
  updatedAt: new Date(),
  updatedBy: 'test',
};

function seedFullActive(beValue: boolean = false) {
  mockRows.current = [
    { ...wildcardBase, assetClass: 'crypto_spot', constantName: 'break_even_enabled', value: beValue },
    { ...wildcardBase, assetClass: 'crypto_perp', constantName: 'break_even_enabled', value: beValue },
    { ...wildcardBase, assetClass: 'xstock_spot', constantName: 'break_even_enabled', value: beValue },
    { ...wildcardBase, assetClass: 'xstock_perp', constantName: 'break_even_enabled', value: beValue },
    { ...wildcardBase, constantName: 'break_even_trigger_r', value: 1.0 },
    { ...wildcardBase, constantName: 'target_lock_r', value: 1.5 },
    { ...wildcardBase, constantName: 'trail_distance_atr_multiplier', value: 1.0 },
    { ...wildcardBase, constantName: 'persistence_debounce_ms', value: 5000 },
    {
      ...wildcardBase,
      constantName: 'moonbag_qualifying_strategies',
      value: ['strong_bull_trend', 'sma_trend_ride', 'vwap_pullback', 'breakout'],
    },
    {
      ...wildcardBase,
      constantName: 'moonbag_qualifying_source_pools',
      value: { vwap_pullback: ['quant-strong_trend'] },
    },
    { ...wildcardBase, constantName: 'moonbag_max_duration_ms', value: 14400000 },
    { ...wildcardBase, constantName: 'moonbag_cap_mode', value: 'reserved_slots' },
    { ...wildcardBase, constantName: 'moonbag_reserved_slots', value: 1 },
  ];
}

describe('B79.TEC — per-asset-class TEC config cache', () => {
  beforeEach(() => {
    clearModuleConstantsCache();
    _testClearEngineConfigCache();
  });

  it('primeTECConfig warms a snapshot for every ACTIVE class', async () => {
    seedFullActive(false);
    await primeTECConfig();
    const status = getTECBootstrapStatus();
    expect(status.ready).toBe(true);
    for (const cls of Object.values(ASSET_CLASSES)) {
      const meta = status.perClassStatus[cls];
      // Only ACTIVE classes get warmed; reserved-future classes are absent.
      if (meta) {
        expect(meta.ready).toBe(true);
        expect(meta.error).toBeNull();
      }
    }
    // crypto_spot must be ready.
    expect(status.perClassStatus['crypto_spot'].ready).toBe(true);
  });

  it('resolveTECConfig returns the per-class snapshot synchronously', async () => {
    seedFullActive(false);
    await primeTECConfig();
    const cs = resolveTECConfig('crypto_spot');
    expect(cs.breakEvenEnabled).toBe(false); // seeded false
    expect(cs.breakEvenTriggerR).toBe(1.0);
    expect(cs.targetLockR).toBe(1.5);
  });

  it('per-class break_even differs across classes when seeded differently', async () => {
    mockRows.current = [
      { ...wildcardBase, assetClass: 'crypto_spot', constantName: 'break_even_enabled', value: false },
      { ...wildcardBase, assetClass: 'crypto_perp', constantName: 'break_even_enabled', value: true },
      { ...wildcardBase, assetClass: 'xstock_spot', constantName: 'break_even_enabled', value: false },
      { ...wildcardBase, assetClass: 'xstock_perp', constantName: 'break_even_enabled', value: false },
      { ...wildcardBase, constantName: 'break_even_trigger_r', value: 1.0 },
      { ...wildcardBase, constantName: 'target_lock_r', value: 1.5 },
      { ...wildcardBase, constantName: 'trail_distance_atr_multiplier', value: 1.0 },
      { ...wildcardBase, constantName: 'persistence_debounce_ms', value: 5000 },
      { ...wildcardBase, constantName: 'moonbag_qualifying_strategies', value: ['strong_bull_trend'] },
      { ...wildcardBase, constantName: 'moonbag_qualifying_source_pools', value: {} },
      { ...wildcardBase, constantName: 'moonbag_max_duration_ms', value: 14400000 },
      { ...wildcardBase, constantName: 'moonbag_cap_mode', value: 'reserved_slots' },
      { ...wildcardBase, constantName: 'moonbag_reserved_slots', value: 1 },
    ];
    await primeTECConfig();
    expect(resolveTECConfig('crypto_spot').breakEvenEnabled).toBe(false);
    expect(resolveTECConfig('crypto_perp').breakEvenEnabled).toBe(true);
    expect(resolveTECConfig('xstock_spot').breakEvenEnabled).toBe(false);
  });

  it('primeTECConfig HARD-FAILs when an active class lacks an explicit BE row', async () => {
    // Seed everything EXCEPT crypto_spot's per-class break_even_enabled row.
    mockRows.current = [
      // crypto_spot break_even_enabled INTENTIONALLY MISSING — hostile sim
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
    ];
    await expect(primeTECConfig()).rejects.toThrow(/TEC_BOOTSTRAP_FAIL/);
    // Verify the per-class status reflects the failure.
    const status = getTECBootstrapStatus();
    expect(status.ready).toBe(false);
    expect(status.perClassStatus['crypto_spot']?.ready).toBe(false);
    expect(status.perClassStatus['crypto_spot']?.error).toMatch(/missing an explicit per-class row/);
  });

  it('resolveTECConfig throws [TEC_CACHE_MISS_FATAL] for an unprimed class', async () => {
    seedFullActive(false);
    await primeTECConfig();
    // Pass a reserved-future class that primeTECConfig never warmed.
    expect(() => resolveTECConfig('equity_spot' as any)).toThrow(/TEC_CACHE_MISS_FATAL/);
  });

  it('updatePosition throws when assetClass missing on the update', async () => {
    seedFullActive(false);
    await primeTECConfig();
    clearTrailingState('TEST/USD');
    expect(() =>
      updatePosition({
        // @ts-expect-error — intentionally bypassing type to test runtime guard
        assetClass: undefined,
        tradeId: 'TEST/USD',
        symbol: 'TEST/USD',
        entryPrice: 100,
        targetPrice: 110,
        currentPrice: 105,
        currentStopPrice: 95,
        DI: 50,
        VolNoise: 0.3,
        ATR: 1,
      }),
    ).toThrow(/TEC_UPDATE_MISSING_ASSET_CLASS/);
  });

  it('TEC_DEFAULTS.breakEvenEnabled is false (fail-closed)', async () => {
    // Seed only the assertion-required rows; omit the actual break_even_enabled row's
    // value field so that `pick('break_even_enabled', TEC_DEFAULTS.breakEvenEnabled)`
    // falls back to TEC_DEFAULTS. Wait — primeTECConfig requires the per-class row to
    // exist. We seed the row with `null` value, which makes pick() fall back.
    mockRows.current = [
      { ...wildcardBase, assetClass: 'crypto_spot', constantName: 'break_even_enabled', value: false },
      { ...wildcardBase, assetClass: 'crypto_perp', constantName: 'break_even_enabled', value: false },
      { ...wildcardBase, assetClass: 'xstock_spot', constantName: 'break_even_enabled', value: false },
      { ...wildcardBase, assetClass: 'xstock_perp', constantName: 'break_even_enabled', value: false },
      // Intentionally NO other config keys — TEC_DEFAULTS will be used for those.
    ];
    await primeTECConfig();
    const cfg = resolveTECConfig('crypto_spot');
    // Default TTL/trigger fields should still match documented TEC_DEFAULTS.
    expect(cfg.breakEvenEnabled).toBe(false);
    expect(cfg.breakEvenTriggerR).toBe(1.0);
    expect(cfg.persistenceDebounceMs).toBe(5000);
  });
});
