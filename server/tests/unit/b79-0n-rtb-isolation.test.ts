/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — Per-class queue isolation (T1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that getQueuedSignals(mode, assetClass) returns ONLY signals
 * whose assetClass matches the filter. A write to xstock_perp does NOT
 * appear in a crypto_spot per-class read, and vice versa. Confirms the
 * Phase-1 dual-write contract (assetClass column is the per-class
 * partitioning key for storage.getRtbSignals filtering).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// DB / cost-model stubs (B79.0n.TELEMETRY precedent)
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

// Per-class signal table (mode + assetClass keyed)
const signalsByKey: Record<string, any[]> = {};
const keyOf = (mode: string, assetClass: string | null | undefined, status?: string) =>
  `${mode}|${assetClass ?? 'null'}|${status ?? 'any'}`;

vi.mock('../../storage', () => ({
  storage: {
    getRtbSignals: vi.fn(async (filters: any) => {
      const { mode, status, assetClass } = filters;
      let rows = [...(signalsByKey[mode] ?? [])];
      if (assetClass) rows = rows.filter((r) => r.assetClass === assetClass);
      if (status) rows = rows.filter((r) => r.status === status);
      return rows;
    }),
    getActiveTrades: vi.fn(async () => []),
    upsertRtbSignal: vi.fn(async (data: any) => ({ ...data, id: `id-${Math.random()}` })),
    getRtbSignalById: vi.fn(async () => undefined),
  },
}));

// Central clock stub — non-subscribing
vi.mock('../../services/central-clock', () => ({
  centralClock: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    start: vi.fn(),
    getTickNumber: () => 0,
    getIsRunning: () => false,
  },
  ClockTick: undefined,
}));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service';

function seed(mode: string, assetClass: string, count: number, status: string = 'active') {
  const arr = signalsByKey[mode] ?? (signalsByKey[mode] = []);
  for (let i = 0; i < count; i++) {
    arr.push({
      id: `${mode}-${assetClass}-${i}`,
      mode,
      signalId: `sig-${mode}-${assetClass}-${i}`,
      symbol: `SYM_${assetClass}_${i}`,
      strategy: 'fx5',
      status,
      finalScore: '0.5',
      assetClass,
      queuedAt: new Date(),
    });
  }
}

describe('B79.0n.RTB — Per-class queue isolation (T1)', () => {
  beforeEach(() => {
    for (const k of Object.keys(signalsByKey)) delete signalsByKey[k];
  });

  it('T1.1 — crypto_spot filter returns only crypto_spot signals', async () => {
    seed('paper', 'crypto_spot', 3);
    seed('paper', 'xstock_spot', 2);
    seed('paper', 'xstock_perp', 4);

    const cryptoSpot = await readyToBuyService.getQueuedSignals('paper' as any, 'crypto_spot' as any);
    expect(cryptoSpot).toHaveLength(3);
    expect(cryptoSpot.every((s) => s.assetClass === 'crypto_spot')).toBe(true);
  });

  it('T1.2 — xstock_perp filter does NOT include crypto_spot signals', async () => {
    seed('paper', 'crypto_spot', 5);
    seed('paper', 'xstock_perp', 2);

    const xstockPerp = await readyToBuyService.getQueuedSignals('paper' as any, 'xstock_perp' as any);
    expect(xstockPerp).toHaveLength(2);
    expect(xstockPerp.every((s) => s.assetClass === 'xstock_perp')).toBe(true);
    expect(xstockPerp.find((s) => s.assetClass === 'crypto_spot')).toBeUndefined();
  });

  it('T1.3 — write to xstock_perp does NOT bleed into crypto_spot read', async () => {
    seed('paper', 'crypto_spot', 1);
    const cryptoBefore = await readyToBuyService.getQueuedSignals('paper' as any, 'crypto_spot' as any);
    expect(cryptoBefore).toHaveLength(1);

    // ACT: write to xstock_perp
    seed('paper', 'xstock_perp', 3);

    const cryptoAfter = await readyToBuyService.getQueuedSignals('paper' as any, 'crypto_spot' as any);
    const xstockPerpAfter = await readyToBuyService.getQueuedSignals('paper' as any, 'xstock_perp' as any);

    expect(cryptoAfter).toHaveLength(1); // unchanged
    expect(cryptoAfter[0].assetClass).toBe('crypto_spot');
    expect(xstockPerpAfter).toHaveLength(3);
  });

  it('T1.4 — global read (no assetClass filter) returns ALL classes', async () => {
    seed('paper', 'crypto_spot', 2);
    seed('paper', 'xstock_spot', 2);
    seed('paper', 'xstock_perp', 2);
    seed('paper', 'crypto_perp', 1);

    const all = await readyToBuyService.getQueuedSignals('paper' as any);
    // 2+2+2+1 = 7 across active+reconfirmed+queued; only 'active' status seeded.
    expect(all.length).toBe(7);
    const classes = new Set(all.map((s) => s.assetClass));
    expect(classes.has('crypto_spot')).toBe(true);
    expect(classes.has('xstock_spot')).toBe(true);
    expect(classes.has('xstock_perp')).toBe(true);
    expect(classes.has('crypto_perp')).toBe(true);
  });

  it('T1.5 — per-class isolation holds across paper + live modes independently', async () => {
    seed('paper', 'crypto_spot', 2);
    seed('live', 'crypto_spot', 4);
    seed('paper', 'xstock_perp', 1);

    const paperCrypto = await readyToBuyService.getQueuedSignals('paper' as any, 'crypto_spot' as any);
    const liveCrypto = await readyToBuyService.getQueuedSignals('live' as any, 'crypto_spot' as any);

    expect(paperCrypto).toHaveLength(2);
    expect(liveCrypto).toHaveLength(4);
    // Cross-mode bleed check
    expect(paperCrypto.every((s) => s.mode === 'paper')).toBe(true);
    expect(liveCrypto.every((s) => s.mode === 'live')).toBe(true);
  });
});
