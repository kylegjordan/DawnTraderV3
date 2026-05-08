/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0b — N4 idempotency + dispatch tests for asset-class-instances
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies:
 *   - `getXstockSpotInstances()` is idempotent (same triad on subsequent calls)
 *   - `_testResetXstockSpotInstances()` clears the cache so next call rebuilds
 *   - `getAssetClassInstances('crypto_spot')` returns null (no-touch fence)
 *   - `getAssetClassInstances(<inactive class>)` throws
 *
 * DB mock so `bootstrapXstockSpotInstances()` can construct the triad without
 * a real connection.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
}));
vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (e: number) => e,
  computeNetTargetFloor: (t: number) => t,
  computeTotalRoundTripCost: () => 0,
}));

import {
  getAssetClassInstances,
  getXstockSpotInstances,
  _testResetXstockSpotInstances,
} from '../../services/asset-class-instances.js';

describe('B79.0b — asset-class-instances factory', () => {
  beforeEach(() => {
    _testResetXstockSpotInstances();
  });

  it('getXstockSpotInstances() is idempotent — second call returns same triad', () => {
    const first = getXstockSpotInstances();
    const second = getXstockSpotInstances();
    expect(second).toBe(first); // same reference, not just deep-equal
    expect(second.telemetry).toBe(first.telemetry);
    expect(second.ratioManager).toBe(first.ratioManager);
    expect(second.failureTracker).toBe(first.failureTracker);
    expect(second.scanManager).toBe(first.scanManager);
  });

  it('_testResetXstockSpotInstances clears cache — next call rebuilds', () => {
    const first = getXstockSpotInstances();
    _testResetXstockSpotInstances();
    const second = getXstockSpotInstances();
    expect(second).not.toBe(first); // new triad
  });

  it('xstock instance reports inMemoryOnly:true (Day 1 design)', () => {
    const triad = getXstockSpotInstances();
    expect(triad.inMemoryOnly).toBe(true);
  });

  it('getAssetClassInstances(crypto_spot) returns null (no-touch fence)', () => {
    expect(getAssetClassInstances('crypto_spot')).toBeNull();
  });

  it('getAssetClassInstances(xstock_spot) returns triad', () => {
    const triad = getAssetClassInstances('xstock_spot');
    expect(triad).not.toBeNull();
    expect(triad?.telemetry).toBeDefined();
    expect(triad?.ratioManager).toBeDefined();
  });

  it('getAssetClassInstances on unsupported asset class throws', () => {
    // crypto_perp / xstock_perp / equity_spot / etc. are NOT in the dispatcher
    // switch (per asset-class-instances.ts:138-149). Throw is by design —
    // explicit mis-routing surfaces immediately rather than silently corrupting.
    expect(() => getAssetClassInstances('crypto_perp' as any)).toThrow(/unsupported/i);
    expect(() => getAssetClassInstances('equity_spot' as any)).toThrow(/unsupported/i);
  });
});
