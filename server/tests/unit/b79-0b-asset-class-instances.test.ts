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
    // B79.0n.ORCHESTRATOR (2026-05-27): `.ratioManager` reference removed per
    // POOL skip — field deleted from AssetClassInstances interface.
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
    // B79.0n.ORCHESTRATOR (2026-05-27): `.ratioManager` reference removed per POOL skip.
    expect(triad?.failureTracker).toBeDefined();
    expect(triad?.scanManager).toBeDefined();
  });

  it('getAssetClassInstances on reserved-future class throws (B79.0n.TELEMETRY: was "unsupported" until 2026-05-26)', () => {
    // B79.0n.TELEMETRY (2026-05-26): crypto_perp + xstock_perp moved from
    // "unsupported throws" to "factory-managed triads" — the whole point of
    // sub-batch #10. The 4 reserved-future classes (equity_spot,
    // equity_futures, commodity_futures, fx_spot) still throw with
    // [CLASS_NOT_WIRED] surfacing the ASSET_CLASS_REGISTRY[X].active flag
    // so call sites can self-correct.
    expect(() => getAssetClassInstances('equity_spot' as any)).toThrow(/CLASS_NOT_WIRED/);
    expect(() => getAssetClassInstances('equity_futures' as any)).toThrow(/CLASS_NOT_WIRED/);
    expect(() => getAssetClassInstances('commodity_futures' as any)).toThrow(/CLASS_NOT_WIRED/);
    expect(() => getAssetClassInstances('fx_spot' as any)).toThrow(/CLASS_NOT_WIRED/);
  });

  it('getAssetClassInstances on crypto_perp + xstock_perp now returns valid triads (B79.0n.TELEMETRY)', () => {
    // B79.0n.TELEMETRY (2026-05-26): completes the 4-of-4 active-class
    // coverage. These two classes previously THREW; now they return
    // dedicated in-memory triads via the same Variant C path as xstock_spot.
    const cryptoPerpTriad = getAssetClassInstances('crypto_perp' as any);
    const xstockPerpTriad = getAssetClassInstances('xstock_perp' as any);
    expect(cryptoPerpTriad).not.toBeNull();
    expect(cryptoPerpTriad?.telemetry).toBeDefined();
    // B79.0n.ORCHESTRATOR (2026-05-27): `.ratioManager` references removed per POOL skip.
    expect(cryptoPerpTriad?.failureTracker).toBeDefined();
    expect(cryptoPerpTriad?.inMemoryOnly).toBe(true);
    expect(xstockPerpTriad).not.toBeNull();
    expect(xstockPerpTriad?.telemetry).toBeDefined();
    expect(xstockPerpTriad?.failureTracker).toBeDefined();
    expect(xstockPerpTriad?.inMemoryOnly).toBe(true);
    // Cross-class distinct instances:
    expect(cryptoPerpTriad?.telemetry).not.toBe(xstockPerpTriad?.telemetry);
  });
});
