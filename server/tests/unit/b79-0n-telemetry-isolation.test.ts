/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.TELEMETRY — Cross-class isolation (T2 — Langston C2: BOTH directions)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies BOTH:
 *   (i)  Write to xstock_perp instance DOES mutate xstock_perp internal state
 *        (recordCount + pairCount + pool aggregates ALL increment)
 *   (ii) crypto_spot global singleton state DOES NOT mutate as a result
 *        (recordCount unchanged + pool aggregates totalTrades unchanged)
 *
 *   The test fails closed if a future refactor accidentally points the
 *   perp instance at the global singleton — the singleton's snapshot before
 *   the perp write would shift after, and the assertion catches it.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
import { getTelemetryAggregator } from '../../services/telemetry-aggregator.js';
import { ASSET_CLASSES } from '../../../shared/asset-classes.js';

describe('B79.0n.TELEMETRY — Cross-class isolation (T2)', () => {
  beforeEach(() => {
    _testResetAllAssetClassInstances();
  });

  it('T2 — write to xstock_perp does NOT bleed into crypto_spot singleton', () => {
    // PRE-snapshot: crypto_spot global singleton state
    const cryptoSingleton = getTelemetryAggregator();
    const cryptoCountBefore = cryptoSingleton.getRecordCount();
    const cryptoLastWriteBefore = cryptoSingleton.getLastWriteAt();
    const cryptoPairCountBefore = cryptoSingleton.getPairCount();
    const cryptoPoolBefore = cryptoSingleton.getPoolPerformanceComparison();
    const cryptoIdealTotalBefore = cryptoPoolBefore.ideal.totalTrades;
    const cryptoRotationalTotalBefore = cryptoPoolBefore.rotational.totalTrades;

    // ACT: write to xstock_perp triad's telemetry
    const xstockPerpTriad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP)!;
    xstockPerpTriad.telemetry.recordPairTelemetry('PF_BTCUSD', {
      finalScore: 0.75,
      success: true,
      pool: 'ideal',
      caller: 'vts',
    });

    // (i) xstock_perp instance DID mutate
    expect(xstockPerpTriad.telemetry.getRecordCount()).toBe(1);
    expect(xstockPerpTriad.telemetry.getLastWriteAt()).not.toBeNull();
    expect(xstockPerpTriad.telemetry.getPairCount()).toBe(1);
    const xstockPerpPool = xstockPerpTriad.telemetry.getPoolPerformanceComparison();
    expect(xstockPerpPool.ideal.totalTrades).toBe(1);
    expect(xstockPerpPool.ideal.successfulTrades).toBe(1);

    // (ii) crypto_spot global singleton DID NOT mutate
    expect(cryptoSingleton.getRecordCount()).toBe(cryptoCountBefore);
    expect(cryptoSingleton.getLastWriteAt()).toBe(cryptoLastWriteBefore);
    expect(cryptoSingleton.getPairCount()).toBe(cryptoPairCountBefore);
    const cryptoPoolAfter = cryptoSingleton.getPoolPerformanceComparison();
    expect(cryptoPoolAfter.ideal.totalTrades).toBe(cryptoIdealTotalBefore);
    expect(cryptoPoolAfter.rotational.totalTrades).toBe(cryptoRotationalTotalBefore);
  });

  it('T2 — write to crypto_perp also does NOT bleed into crypto_spot (separate perp class)', () => {
    const cryptoSingleton = getTelemetryAggregator();
    const cryptoCountBefore = cryptoSingleton.getRecordCount();
    const cryptoPoolBefore = cryptoSingleton.getPoolPerformanceComparison();

    const cryptoPerpTriad = getAssetClassInstances(ASSET_CLASSES.CRYPTO_PERP)!;
    cryptoPerpTriad.telemetry.recordPairTelemetry('BTC/USD:USD', {
      finalScore: 0.65,
      success: false,
      pool: 'rotational',
      caller: 'vts',
    });

    expect(cryptoPerpTriad.telemetry.getRecordCount()).toBe(1);
    expect(cryptoSingleton.getRecordCount()).toBe(cryptoCountBefore);
    expect(cryptoSingleton.getPoolPerformanceComparison().ideal.totalTrades).toBe(cryptoPoolBefore.ideal.totalTrades);
    expect(cryptoSingleton.getPoolPerformanceComparison().rotational.totalTrades).toBe(cryptoPoolBefore.rotational.totalTrades);
  });

  it('T2 — xstock_perp and crypto_perp writes are also isolated from each other', () => {
    const xstockPerpTriad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP)!;
    const cryptoPerpTriad = getAssetClassInstances(ASSET_CLASSES.CRYPTO_PERP)!;

    xstockPerpTriad.telemetry.recordPairTelemetry('PF_AAPLXUSD', {
      finalScore: 0.80, success: true, pool: 'ideal', caller: 'vts',
    });

    // crypto_perp should still be at zero
    expect(cryptoPerpTriad.telemetry.getRecordCount()).toBe(0);
    expect(cryptoPerpTriad.telemetry.getPairCount()).toBe(0);
    // xstock_perp should be at 1
    expect(xstockPerpTriad.telemetry.getRecordCount()).toBe(1);
    expect(xstockPerpTriad.telemetry.getPairCount()).toBe(1);
  });
});
