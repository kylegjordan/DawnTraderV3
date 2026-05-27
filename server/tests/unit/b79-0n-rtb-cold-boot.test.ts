/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — Cold-boot per-class queues + empty class no-error (T11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * On a fresh boot with zero seeded signals:
 *   T11.1 — getQueueDepth() returns 4 classes × 2 modes, all cells = 0
 *   T11.2 — getQueuedSignals(mode, cls) returns [] for every class+mode
 *   T11.3 — getRankedSignals(mode, limit, cls) returns [] for empty class
 *   T11.4 — rtbRefreshService boots inactive, can be started cleanly
 *   T11.5 — No throw on accessor calls against any of the 4 active classes
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (e: number) => e,
  computeNetTargetFloor: (t: number) => t,
  computeTotalRoundTripCost: () => 0,
  computeNetGeometry: () => ({ netBreakeven: 0, netTargetFloor: 0, totalCost: 0 }),
}));

vi.mock('../../storage', () => ({
  storage: {
    getRtbSignals: vi.fn(async () => []),
    getActiveTrades: vi.fn(async () => []),
  },
}));

// Mock both extension forms — ready_to_buy_service imports without `.js`,
// rtb-refresh-service imports with `.js`. Vitest treats them as separate
// specifiers under Node ESM resolution.
vi.mock('../../services/central-clock', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
  ClockTick: undefined,
}));
vi.mock('../../services/central-clock.js', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
  ClockTick: undefined,
}));
vi.mock('../../services/price-cache', () => ({
  priceCache: { subscribe: vi.fn(), getBatch: vi.fn(async () => new Map()) },
}));
vi.mock('../../services/pool-broadcast', () => ({
  poolBus: { on: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../services/data-aggregator.js', () => ({
  dataAggregator: { capture: vi.fn(async () => undefined) },
}));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service';
import { rtbRefreshService } from '../../services/rtb-refresh-service';

const ACTIVE_CLASSES = ['crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp'] as const;
const MODES = ['paper', 'live'] as const;

describe('B79.0n.RTB — Cold-boot per-class queues empty (T11)', () => {
  beforeEach(() => {
    rtbRefreshService.stop();
  });

  it('T11.1 — getQueueDepth() returns all 8 cells = 0 on cold boot', async () => {
    const depth = await readyToBuyService.getQueueDepth();
    for (const cls of ACTIVE_CLASSES) {
      for (const mode of MODES) {
        expect(depth[cls][mode]).toBe(0);
      }
    }
  });

  it('T11.2 — getQueuedSignals returns [] for every class+mode combination', async () => {
    for (const cls of ACTIVE_CLASSES) {
      for (const mode of MODES) {
        const rows = await readyToBuyService.getQueuedSignals(mode as any, cls as any);
        expect(rows).toEqual([]);
      }
    }
  });

  it('T11.3 — getRankedSignals returns [] for empty class', async () => {
    for (const cls of ACTIVE_CLASSES) {
      for (const mode of MODES) {
        const rows = await readyToBuyService.getRankedSignals(mode as any, 10, cls as any);
        expect(rows).toEqual([]);
      }
    }
  });

  it('T11.4 — rtbRefreshService boots inactive, start() is non-throwing', () => {
    expect(rtbRefreshService.isActive()).toBe(false);
    expect(() => rtbRefreshService.start()).not.toThrow();
    expect(rtbRefreshService.isActive()).toBe(true);
    rtbRefreshService.stop();
  });

  it('T11.5 — no throw on accessor calls against any active class on cold boot', async () => {
    for (const cls of ACTIVE_CLASSES) {
      for (const mode of MODES) {
        await expect(
          readyToBuyService.getQueuedSignals(mode as any, cls as any)
        ).resolves.toBeDefined();
        await expect(
          readyToBuyService.getRankedSignals(mode as any, 5, cls as any)
        ).resolves.toBeDefined();
      }
    }
  });
});
