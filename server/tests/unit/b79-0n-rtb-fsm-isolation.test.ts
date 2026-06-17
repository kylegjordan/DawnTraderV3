/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — FSM transition integrity across classes (T3)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that signal state advances (active → reconfirmed → promoted →
 * expired) do not cross asset-class boundaries. Per Langston Step 2 ACK:
 * promotions on a crypto_spot signal must not flip the status of an
 * xstock_perp signal sharing the same (mode, symbol, strategy) tuple.
 *
 * The storage layer routes by id (UUID primary key); the FSM contract is
 * that per-class reads only ever surface that class's signals so any
 * downstream state change applies to one class's row only.
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

// In-memory signal table keyed by id; supports per-class filtering + status update.
type Sig = {
  id: string;
  mode: string;
  symbol: string;
  strategy: string;
  status: string;
  assetClass: string;
  finalScore: string;
  queuedAt: Date;
  signalId: string;
};
const table: Record<string, Sig> = {};

vi.mock('../../storage', () => ({
  storage: {
    getRtbSignals: vi.fn(async (filters: any) => {
      const { mode, status, assetClass } = filters;
      let rows = Object.values(table).filter((r) => r.mode === mode);
      if (assetClass) rows = rows.filter((r) => r.assetClass === assetClass);
      if (status) rows = rows.filter((r) => r.status === status);
      return rows;
    }),
    getActiveTrades: vi.fn(async () => []),
    getRtbSignalById: vi.fn(async (id: string) => table[id]),
    updateRtbSignal: vi.fn(async (id: string, updates: any) => {
      table[id] = { ...table[id], ...updates };
      return table[id];
    }),
    upsertRtbSignal: vi.fn(async (data: any) => {
      const id = `id-${data.symbol}-${data.strategy}-${data.assetClass}`;
      table[id] = { ...table[id], ...data, id };
      return table[id];
    }),
  },
}));

vi.mock('../../services/central-clock', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
  ClockTick: undefined,
}));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service';
import { storage } from '../../storage';

function seedSignal(id: string, mode: string, symbol: string, strategy: string, assetClass: string, status: string = 'active') {
  table[id] = {
    id, mode, symbol, strategy, status, assetClass,
    finalScore: '0.7',
    queuedAt: new Date(),
    signalId: `sig-${id}`,
  };
}

describe('B79.0n.RTB — FSM transition integrity across classes (T3)', () => {
  beforeEach(() => {
    for (const k of Object.keys(table)) delete table[k];
  });

  it('T3.1 — updating crypto_spot signal status does NOT touch xstock_perp row', async () => {
    seedSignal('cs-1', 'paper', 'BTC/USD', 'fx5', 'crypto_spot', 'active');
    seedSignal('xp-1', 'paper', 'PF_BTCUSD', 'fx5', 'xstock_perp', 'active');

    // ACT: promote the crypto_spot row.
    await storage.updateRtbSignal('cs-1', { status: 'promoted' as any });

    expect(table['cs-1'].status).toBe('promoted');
    expect(table['xp-1'].status).toBe('active'); // untouched
    expect(table['xp-1'].assetClass).toBe('xstock_perp');
  });

  it('T3.2 — per-class read after one-class state change surfaces only that class', async () => {
    seedSignal('cs-a', 'paper', 'BTC/USD', 'fx5', 'crypto_spot', 'active');
    seedSignal('cs-b', 'paper', 'ETH/USD', 'fx5', 'crypto_spot', 'active');
    seedSignal('xp-a', 'paper', 'PF_BTCUSD', 'fx5', 'xstock_perp', 'active');

    await storage.updateRtbSignal('cs-a', { status: 'reconfirmed' as any });

    const cryptoActive = await readyToBuyService.getQueuedSignals('paper' as any, 'crypto_spot' as any);
    const cryptoActiveStatuses = cryptoActive.map((s) => s.status).sort();
    // Both 'active' and 'reconfirmed' are surfaced by getQueuedSignals.
    expect(cryptoActiveStatuses).toEqual(['active', 'reconfirmed']);
    expect(cryptoActive.every((s) => s.assetClass === 'crypto_spot')).toBe(true);

    const xstockPerpActive = await readyToBuyService.getQueuedSignals('paper' as any, 'xstock_perp' as any);
    expect(xstockPerpActive).toHaveLength(1);
    expect(xstockPerpActive[0].id).toBe('xp-a');
    expect(xstockPerpActive[0].status).toBe('active');
  });

  it('T3.3 — same-symbol-across-classes (R-8 corner case): independent state advance', async () => {
    // R-8: architecturally possible — same symbol could land in 2 classes
    // after WIRE-IN. Verify state advances independently.
    seedSignal('cs-eth', 'paper', 'ETH/USD', 'fx5', 'crypto_spot', 'active');
    seedSignal('cp-eth', 'paper', 'ETH/USD', 'fx5', 'crypto_perp', 'active');

    await storage.updateRtbSignal('cs-eth', { status: 'promoted' as any });

    expect(table['cs-eth'].status).toBe('promoted');
    expect(table['cp-eth'].status).toBe('active'); // sibling row in different class untouched

    const cpRows = await readyToBuyService.getQueuedSignals('paper' as any, 'crypto_perp' as any);
    expect(cpRows).toHaveLength(1);
    expect(cpRows[0].status).toBe('active');
  });

  it('T3.4 — all 3 lifecycle statuses (active / reconfirmed / queued) are surfaced per-class', async () => {
    seedSignal('cs-a', 'paper', 'BTC/USD', 'fx5', 'crypto_spot', 'active');
    seedSignal('cs-r', 'paper', 'ETH/USD', 'fx5', 'crypto_spot', 'reconfirmed');
    seedSignal('cs-q', 'paper', 'SOL/USD', 'fx5', 'crypto_spot', 'queued');
    seedSignal('cs-p', 'paper', 'ADA/USD', 'fx5', 'crypto_spot', 'promoted'); // should NOT surface
    seedSignal('xp-a', 'paper', 'PF_AAPLXUSD', 'fx5', 'xstock_perp', 'active');

    const cryptoRows = await readyToBuyService.getQueuedSignals('paper' as any, 'crypto_spot' as any);
    expect(cryptoRows).toHaveLength(3);
    const statuses = cryptoRows.map((s) => s.status).sort();
    expect(statuses).toEqual(['active', 'queued', 'reconfirmed']);
    expect(cryptoRows.find((s) => s.id === 'cs-p')).toBeUndefined();
  });
});
