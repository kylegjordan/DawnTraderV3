/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.TELEMETRY — M70 invariant preserved on new instances (T6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Directive 11.4C.1 / M70: only VTS may write telemetry. The guard at the
 * top of recordPairTelemetry rejects callers ≠ 'vts'. New per-class
 * instances inherit this guard via `new TelemetryAggregatorService()`
 * construction — verify it still works.
 *
 * Additionally verifies the counter integrity invariant from Chunk A:
 * blocked writes (non-vts caller) MUST NOT increment _recordCount or
 * mutate _lastWriteAt. The counter is M70-clean.
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
import { ASSET_CLASSES } from '../../../shared/asset-classes.js';

describe('B79.0n.TELEMETRY — M70 invariant on new instances (T6)', () => {
  beforeEach(() => {
    _testResetAllAssetClassInstances();
  });

  it('T6 — xstock_perp instance rejects non-vts caller', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP)!;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    triad.telemetry.recordPairTelemetry('PF_BTCUSD', {
      finalScore: 0.5,
      caller: 'fx5', // not 'vts' — M70 guard should reject
    });

    // [11.4C.1][BLOCKED] log line emitted
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[11.4C.1][BLOCKED]')
    );
    warnSpy.mockRestore();
  });

  it('T6 — blocked writes do NOT increment recordCount (counter integrity)', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP)!;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(triad.telemetry.getRecordCount()).toBe(0);
    expect(triad.telemetry.getLastWriteAt()).toBeNull();

    // Blocked write
    triad.telemetry.recordPairTelemetry('PF_BTCUSD', {
      finalScore: 0.5,
      caller: 'scanner', // not 'vts'
    });

    // Counter still zero — blocked writes do NOT increment.
    expect(triad.telemetry.getRecordCount()).toBe(0);
    expect(triad.telemetry.getLastWriteAt()).toBeNull();
    expect(triad.telemetry.getPairCount()).toBe(0);

    warnSpy.mockRestore();
  });

  it('T6 — also rejects undefined caller', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.CRYPTO_PERP)!;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    triad.telemetry.recordPairTelemetry('XBT/USD:USD', {
      finalScore: 0.5,
      // caller intentionally omitted
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[11.4C.1][BLOCKED]')
    );
    expect(triad.telemetry.getRecordCount()).toBe(0);
    warnSpy.mockRestore();
  });

  it('T6 — vts caller IS accepted (sanity check on the positive path)', () => {
    const triad = getAssetClassInstances(ASSET_CLASSES.XSTOCK_PERP)!;
    triad.telemetry.recordPairTelemetry('PF_AAPLXUSD', {
      finalScore: 0.7,
      success: true,
      pool: 'ideal',
      caller: 'vts',
    });
    expect(triad.telemetry.getRecordCount()).toBe(1);
    expect(triad.telemetry.getLastWriteAt()).not.toBeNull();
    expect(triad.telemetry.getPairCount()).toBe(1);
  });
});
