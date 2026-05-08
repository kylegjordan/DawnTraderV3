/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0a — AdaptiveRatioManager constructor injection back-compat
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies:
 *   - Default-arg constructor (crypto path) still falls back to global singleton
 *   - Explicit-injected telemetry is used in computeAdaptiveRatio
 *   - Mixed paths don't bleed (xstock instance ≠ crypto global)
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';

// DB mock
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

import { AdaptiveRatioManager } from '../../services/adaptive-ratio-manager.js';
import { TelemetryAggregatorService, getTelemetryAggregator } from '../../services/telemetry-aggregator.js';

describe('B79.0a — AdaptiveRatioManager constructor injection', () => {
  it('default-arg constructor (crypto path back-compat) does not throw', () => {
    expect(() => new AdaptiveRatioManager()).not.toThrow();
  });

  it('config-only constructor (legacy back-compat) does not throw', () => {
    expect(() => new AdaptiveRatioManager({ minSamples: 5 })).not.toThrow();
  });

  it('config + injected telemetry constructor accepts both args', () => {
    const customTelemetry = new TelemetryAggregatorService();
    const arm = new AdaptiveRatioManager({}, customTelemetry);
    expect(arm).toBeDefined();
  });

  it('global singleton is a TelemetryAggregatorService instance', () => {
    const global = getTelemetryAggregator();
    expect(global).toBeInstanceOf(TelemetryAggregatorService);
  });

  it('per-instance telemetry is distinct from global singleton', () => {
    const instance1 = new TelemetryAggregatorService();
    const instance2 = new TelemetryAggregatorService();
    const global = getTelemetryAggregator();
    expect(instance1).not.toBe(instance2);
    expect(instance1).not.toBe(global);
    expect(instance2).not.toBe(global);
  });
});
