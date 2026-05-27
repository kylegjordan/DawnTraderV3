/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — Reserved-future class [CLASS_NOT_WIRED] throw (T6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per scope §4 T6: "Reserved-future class throws [CLASS_NOT_WIRED] on
 * per-class read paths (handled at factory layer; this test exercises that
 * the path is reachable from RTB reads)."
 *
 * The factory at server/services/asset-class-instances.ts already throws
 * [B79.0n.TELEMETRY][CLASS_NOT_WIRED] for any reserved-future class. This
 * test confirms:
 *   T6.1 — Direct factory invocation throws for all 4 reserved classes
 *   T6.2 — Error message cites ASSET_CLASS_REGISTRY.<class>.active path
 *   T6.3 — Active classes (the 4 RTB_ACTIVE_CLASSES) do NOT throw
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
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
  _testResetAllAssetClassInstances,
} from '../../services/asset-class-instances.js';
import { ASSET_CLASSES, type AssetClass } from '../../../shared/asset-classes.js';

describe('B79.0n.RTB — Reserved-future class [CLASS_NOT_WIRED] (T6)', () => {
  beforeEach(() => {
    _testResetAllAssetClassInstances();
  });

  it.each([
    ASSET_CLASSES.EQUITY_SPOT,
    ASSET_CLASSES.EQUITY_FUTURES,
    ASSET_CLASSES.COMMODITY_FUTURES,
    ASSET_CLASSES.FX_SPOT,
  ])('T6.1 — getAssetClassInstances(%s) throws [CLASS_NOT_WIRED]', (cls) => {
    expect(() => getAssetClassInstances(cls as AssetClass)).toThrow(/CLASS_NOT_WIRED/);
  });

  it('T6.2 — error message mentions ASSET_CLASS_REGISTRY.<class>.active', () => {
    let err: Error | null = null;
    try {
      getAssetClassInstances(ASSET_CLASSES.FX_SPOT as AssetClass);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/ASSET_CLASS_REGISTRY/);
    expect(err!.message).toMatch(/\.active/);
    expect(err!.message).toMatch(/fx_spot/);
  });

  it('T6.3 — RTB_ACTIVE_CLASSES (the 4 active) do NOT throw', () => {
    // crypto_spot returns null (no-touch fence); the other 3 return triads.
    expect(() => getAssetClassInstances(ASSET_CLASSES.CRYPTO_SPOT)).not.toThrow();
    expect(() => getAssetClassInstances(ASSET_CLASSES.CRYPTO_PERP)).not.toThrow();
    expect(() => getAssetClassInstances(ASSET_CLASSES.XSTOCK_SPOT)).not.toThrow();
    expect(() => getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP)).not.toThrow();
  });
});
