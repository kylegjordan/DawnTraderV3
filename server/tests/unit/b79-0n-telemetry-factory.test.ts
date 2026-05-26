/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.TELEMETRY — Factory dispatch + exhaustive-switch tests (T1 + T3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies:
 *   T1.1-1.4 — getAssetClassInstances dispatch for each active class:
 *     crypto_spot returns null (no-touch fence path), other 3 return valid triads
 *   T1.5     — triad shape (fresh TelemetryAggregator + ARM with injected telemetry
 *              + ASM with injected telemetry + failureTracker + inMemoryOnly=true)
 *   T3.1-3.4 — reserved-future classes throw [CLASS_NOT_WIRED] error with
 *              ASSET_CLASS_REGISTRY mention
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// DB mock (B79.0a precedent)
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
import { TelemetryAggregatorService } from '../../services/telemetry-aggregator.js';
import { AdaptiveRatioManager } from '../../services/adaptive-ratio-manager.js';
import { AdaptiveScanManager, PairFailureTracker } from '../../services/adaptive-scan-manager.js';
import { ASSET_CLASSES, type AssetClass } from '../../../shared/asset-classes.js';

describe('B79.0n.TELEMETRY — Factory dispatch (T1)', () => {
  beforeEach(() => {
    _testResetAllAssetClassInstances();
  });

  it('T1.1 — crypto_spot returns null (no-touch fence path)', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.CRYPTO_SPOT);
    expect(triad).toBeNull();
  });

  it('T1.2 — xstock_spot returns valid triad with all 4 instance fields', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_SPOT);
    expect(triad).not.toBeNull();
    expect(triad!.telemetry).toBeInstanceOf(TelemetryAggregatorService);
    expect(triad!.ratioManager).toBeInstanceOf(AdaptiveRatioManager);
    expect(triad!.failureTracker).toBeInstanceOf(PairFailureTracker);
    expect(triad!.scanManager).toBeInstanceOf(AdaptiveScanManager);
    expect(triad!.inMemoryOnly).toBe(true);
  });

  it('T1.3 — xstock_perp returns valid triad (B79.0n.TELEMETRY new)', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP);
    expect(triad).not.toBeNull();
    expect(triad!.telemetry).toBeInstanceOf(TelemetryAggregatorService);
    expect(triad!.ratioManager).toBeInstanceOf(AdaptiveRatioManager);
    expect(triad!.failureTracker).toBeInstanceOf(PairFailureTracker);
    expect(triad!.scanManager).toBeInstanceOf(AdaptiveScanManager);
    expect(triad!.inMemoryOnly).toBe(true);
  });

  it('T1.4 — crypto_perp returns valid triad (B79.0n.TELEMETRY new)', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.CRYPTO_PERP);
    expect(triad).not.toBeNull();
    expect(triad!.telemetry).toBeInstanceOf(TelemetryAggregatorService);
    expect(triad!.ratioManager).toBeInstanceOf(AdaptiveRatioManager);
    expect(triad!.failureTracker).toBeInstanceOf(PairFailureTracker);
    expect(triad!.scanManager).toBeInstanceOf(AdaptiveScanManager);
    expect(triad!.inMemoryOnly).toBe(true);
  });

  it('T1.5a — fresh triad telemetry has recordCount === 0', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP);
    expect(triad!.telemetry.getRecordCount()).toBe(0);
    expect(triad!.telemetry.getLastWriteAt()).toBeNull();
    expect(triad!.telemetry.getPairCount()).toBe(0);
  });

  it('T1.5b — each active class returns a DISTINCT TelemetryAggregator instance', () => {
    const xstockSpot = getAssetClassInstances(ASSET_CLASSES.XSTOCK_SPOT)!.telemetry;
    const xstockPerp = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP)!.telemetry;
    const cryptoPerp = getAssetClassInstances(ASSET_CLASSES.CRYPTO_PERP)!.telemetry;
    expect(xstockSpot).not.toBe(xstockPerp);
    expect(xstockSpot).not.toBe(cryptoPerp);
    expect(xstockPerp).not.toBe(cryptoPerp);
  });

  it('T1.5c — idempotent: second call returns the SAME cached triad', () => {
    const first = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP);
    const second = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP);
    expect(first).toBe(second); // identity, not just equality
  });
});

describe('B79.0n.TELEMETRY — Reserved-future class throws (T3)', () => {
  beforeEach(() => {
    _testResetAllAssetClassInstances();
  });

  it.each([
    [ASSET_CLASSES.EQUITY_SPOT, 'equity_spot'],
    [ASSET_CLASSES.EQUITY_FUTURES, 'equity_futures'],
    [ASSET_CLASSES.COMMODITY_FUTURES, 'commodity_futures'],
    [ASSET_CLASSES.FX_SPOT, 'fx_spot'],
  ])('T3 — getAssetClassInstances("%s") throws [CLASS_NOT_WIRED]', (cls, name) => {
    expect(() => getAssetClassInstances(cls as AssetClass)).toThrow(/CLASS_NOT_WIRED/);
  });

  it('T3 — error message mentions ASSET_CLASS_REGISTRY registry path', () => {
    let err: Error | null = null;
    try {
      getAssetClassInstances(ASSET_CLASSES.EQUITY_SPOT as AssetClass);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/ASSET_CLASS_REGISTRY/);
    expect(err!.message).toMatch(/\.active/);
  });
});
