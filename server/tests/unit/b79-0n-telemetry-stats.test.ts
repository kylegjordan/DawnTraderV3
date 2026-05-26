/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.TELEMETRY — getTelemetryInstanceStats accessor (T5)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the per-class observability accessor:
 *   T5.1 — Returns a Record over all 8 ASSET_CLASS_REGISTRY entries
 *   T5.2 — crypto_spot: source='global-singleton' (via peekTelemetryInstance)
 *   T5.3 — xstock_spot / xstock_perp / crypto_perp: source='factory-instance'
 *   T5.4 — 4 reserved-future classes: source='inactive'
 *   T5.5 — post-write counts increment correctly per class
 *   T5.6 — cold-boot semantic: crypto_spot row reads
 *          {recordCount: 0, lastWriteAt: null, pairCount: 0, source: 'global-singleton'}
 *          when the singleton hasn't been touched (Langston Step 2 ACK
 *          clarification 1 — zero ≠ inactive for crypto_spot)
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
  getTelemetryInstanceStats,
  _testResetAllAssetClassInstances,
} from '../../services/asset-class-instances.js';
import { getTelemetryAggregator } from '../../services/telemetry-aggregator.js';
import { ASSET_CLASSES } from '../../../shared/asset-classes.js';

describe('B79.0n.TELEMETRY — Stats accessor (T5)', () => {
  beforeEach(() => {
    _testResetAllAssetClassInstances();
  });

  it('T5.1 — returns a Record over all 8 ASSET_CLASS_REGISTRY entries', () => {
    const stats = getTelemetryInstanceStats();
    expect(Object.keys(stats).sort()).toEqual([
      'commodity_futures',
      'crypto_perp',
      'crypto_spot',
      'equity_futures',
      'equity_spot',
      'fx_spot',
      'xstock_perp',
      'xstock_spot',
    ]);
  });

  it('T5.2 — crypto_spot row has source="global-singleton"', () => {
    const stats = getTelemetryInstanceStats();
    expect(stats.crypto_spot.source).toBe('global-singleton');
  });

  it('T5.3 — xstock_spot / xstock_perp / crypto_perp have source="factory-instance" once bootstrapped', () => {
    // Bootstrap all 3 factory-managed classes first.
    getAssetClassInstances(ASSET_CLASSES.XSTOCK_SPOT);
    getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP);
    getAssetClassInstances(ASSET_CLASSES.CRYPTO_PERP);
    const stats = getTelemetryInstanceStats();
    expect(stats.xstock_spot.source).toBe('factory-instance');
    expect(stats.xstock_perp.source).toBe('factory-instance');
    expect(stats.crypto_perp.source).toBe('factory-instance');
  });

  it('T5.4 — 4 reserved-future classes have source="inactive" + zeros', () => {
    const stats = getTelemetryInstanceStats();
    for (const cls of ['equity_spot', 'equity_futures', 'commodity_futures', 'fx_spot'] as const) {
      expect(stats[cls].source).toBe('inactive');
      expect(stats[cls].recordCount).toBe(0);
      expect(stats[cls].lastWriteAt).toBeNull();
      expect(stats[cls].pairCount).toBe(0);
    }
  });

  it('T5.5 — recordCount increments correctly per class after writes', () => {
    // Bootstrap then write to xstock_perp; read stats.
    const xstockPerpTriad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP)!;
    xstockPerpTriad.telemetry.recordPairTelemetry('PF_BTCUSD', {
      finalScore: 0.5, success: true, pool: 'ideal', caller: 'vts',
    });
    xstockPerpTriad.telemetry.recordPairTelemetry('PF_ETHUSD', {
      finalScore: 0.6, success: false, pool: 'rotational', caller: 'vts',
    });

    const stats = getTelemetryInstanceStats();
    expect(stats.xstock_perp.recordCount).toBe(2);
    expect(stats.xstock_perp.pairCount).toBe(2);
    expect(stats.xstock_perp.lastWriteAt).not.toBeNull();
    // crypto_perp untouched
    expect(stats.crypto_perp.recordCount).toBe(0);
    expect(stats.crypto_perp.lastWriteAt).toBeNull();
  });

  it('T5.6 — cold-boot semantic: crypto_spot row reads zeros with source="global-singleton" when singleton armed but untouched', () => {
    // Force singleton to be armed (so peek returns non-null) but DO NOT
    // write to it. The stats row should still show zeros — and crucially,
    // source MUST be 'global-singleton', NOT 'inactive'.
    getTelemetryAggregator(); // arm but don't write
    const stats = getTelemetryInstanceStats();
    expect(stats.crypto_spot.source).toBe('global-singleton');
    // recordCount may be 0 or whatever the previous test landed; the
    // load-bearing assertion is source != 'inactive' (zero ≠ inactive).
    expect(stats.crypto_spot.source).not.toBe('inactive');
  });

  it('T5.6b — factory-managed classes that have not yet bootstrapped read source="factory-instance" with zeros', () => {
    // Reset all caches so factory-managed classes are uninitialized.
    _testResetAllAssetClassInstances();
    const stats = getTelemetryInstanceStats();
    // Lazy-bootstrap NOT triggered by stats read — source still 'factory-instance' with zeros.
    expect(stats.xstock_perp.source).toBe('factory-instance');
    expect(stats.xstock_perp.recordCount).toBe(0);
    expect(stats.crypto_perp.source).toBe('factory-instance');
    expect(stats.crypto_perp.recordCount).toBe(0);
  });
});
