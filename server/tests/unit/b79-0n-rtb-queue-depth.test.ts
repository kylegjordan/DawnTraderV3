/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — getQueueDepth accessor (T5)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the per-class × per-mode queue depth accessor on readyToBuyService:
 *   T5.1 — Returns a Record over all 4 active asset classes
 *   T5.2 — Each class row has both modes (paper + live) = 8 cells total
 *   T5.3 — Counts match the underlying per-class storage rows
 *   T5.4 — Empty class returns 0 (no error)
 *   T5.5 — xstock pre-WIRE-IN depth=0 is the 48h verify-gate signal
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

const tableByMode: Record<string, any[]> = {};

vi.mock('../../storage', () => ({
  storage: {
    getRtbSignals: vi.fn(async (filters: any) => {
      const { mode, status, assetClass } = filters;
      let rows = (tableByMode[mode] ?? []).slice();
      if (assetClass) rows = rows.filter((r) => r.assetClass === assetClass);
      if (status) rows = rows.filter((r) => r.status === status);
      return rows;
    }),
    getActiveTrades: vi.fn(async () => []),
  },
}));

vi.mock('../../services/central-clock', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
  ClockTick: undefined,
}));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service';

function seed(mode: string, assetClass: string, count: number, status: string = 'active') {
  const arr = tableByMode[mode] ?? (tableByMode[mode] = []);
  for (let i = 0; i < count; i++) {
    arr.push({
      id: `${mode}-${assetClass}-${i}`,
      mode, assetClass, status,
      symbol: `S_${i}`, strategy: 'fx5',
      finalScore: '0.5',
      queuedAt: new Date(),
    });
  }
}

describe('B79.0n.RTB — getQueueDepth accessor (T5)', () => {
  beforeEach(() => {
    for (const k of Object.keys(tableByMode)) delete tableByMode[k];
  });

  it('T5.1 — returns a Record over all 4 active asset classes', async () => {
    const depth = await readyToBuyService.getQueueDepth();
    const classes = Object.keys(depth).sort();
    expect(classes).toEqual(['crypto_perp', 'crypto_spot', 'xstock_perp', 'xstock_spot']);
  });

  it('T5.2 — each class row has both paper + live = 8 cells total', async () => {
    const depth = await readyToBuyService.getQueueDepth();
    let cellCount = 0;
    for (const cls of Object.keys(depth) as Array<keyof typeof depth>) {
      const modeMap = depth[cls];
      expect(Object.keys(modeMap).sort()).toEqual(['live', 'paper']);
      cellCount += Object.keys(modeMap).length;
    }
    expect(cellCount).toBe(8);
  });

  it('T5.3 — counts match per-class storage rows', async () => {
    seed('paper', 'crypto_spot', 5);
    seed('paper', 'xstock_spot', 2);
    seed('live', 'crypto_perp', 3);

    const depth = await readyToBuyService.getQueueDepth();
    expect(depth.crypto_spot.paper).toBe(5);
    expect(depth.xstock_spot.paper).toBe(2);
    expect(depth.crypto_perp.live).toBe(3);
    // Untouched cells = 0
    expect(depth.crypto_spot.live).toBe(0);
    expect(depth.xstock_perp.paper).toBe(0);
    expect(depth.xstock_perp.live).toBe(0);
  });

  it('T5.4 — empty class returns 0 (no error)', async () => {
    // No seed at all.
    const depth = await readyToBuyService.getQueueDepth();
    for (const cls of ['crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp'] as const) {
      expect(depth[cls].paper).toBe(0);
      expect(depth[cls].live).toBe(0);
    }
  });

  it('T5.5 — xstock pre-WIRE-IN depth=0 (48h verify-gate signal)', async () => {
    // Per scope §6.4 — only crypto_spot carries depth pre-WIRE-IN.
    seed('paper', 'crypto_spot', 12);
    seed('live', 'crypto_spot', 4);

    const depth = await readyToBuyService.getQueueDepth();
    expect(depth.crypto_spot.paper).toBe(12);
    expect(depth.crypto_spot.live).toBe(4);
    expect(depth.xstock_spot.paper).toBe(0);
    expect(depth.xstock_spot.live).toBe(0);
    expect(depth.xstock_perp.paper).toBe(0);
    expect(depth.xstock_perp.live).toBe(0);
    expect(depth.crypto_perp.paper).toBe(0);
    expect(depth.crypto_perp.live).toBe(0);
  });
});
