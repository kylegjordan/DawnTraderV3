// B-FEED-MISMATCH-FIX (PHASE_19_PLAN row 3n.u) — the CLOSE-FILL CONTRACT, pinned at RUNTIME.
//
// Langston's Step-2 conditions this file answers:
//   C4 — the #911 witness fence pinned TEXT ORDER where the property is BRANCH REACHABILITY; and r5 makes a new
//        ordering property load-bearing (a refused close returns before ANY persistence). Both are pinned here by
//        DRIVING `closePosition` (prototype call, fake `this`, the module seams mocked), not by reading its source.
//   A-4 — the signed predicate is exercised on the measured rows: the three harmful stale walks refuse, the
//        harmless ones and a deep crypto walk (−3.79 %) do not.
//
// THE PERSISTENCE MARKER: `closePosition`'s write block opens with `storage.getClosedTradesBySymbol` (the open trade-row
// lookup), after the fill, the witness and the gate. A refused close must never reach it; an accepted one always does.
// (The accepted path then runs far past this unit's mocks — learning capture, archives — so it is allowed to throw
// AFTER the marker; the marker, not the delete, is what these tests assert.)
//
// POSITIVE CONTROLS (mutation-proved while writing this file):
//   - moving the `getTickerWitness` call INTO the taker branch fails test 4 (maker leg: witness never read);
//   - removing the refusal's `return` (so a refused close falls through to persistence) fails tests 1 and 2;
//   - making the predicate unsigned (Math.abs) fails test 3 (the −3.79 % crypto walk is refused).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  addAlert: vi.fn(async (_a: unknown) => undefined),
  getActiveOpenPosition: vi.fn(),
  updateClosedTrade: vi.fn(async () => ({})),
  deleteActiveOpenPosition: vi.fn(async () => undefined),
  getClosedTradesBySymbol: vi.fn(async () => []),
  getDepthSnapshot: vi.fn(),
  getTickerWitness: vi.fn(),
  resolveFillDepthGateConfig: vi.fn(),
  resolveCloseFillContractConfig: vi.fn(),
}));

vi.mock('../../services/system-alerts.js', async (orig) => ({ ...(await orig<Record<string, unknown>>()), addAlert: h.addAlert }));
vi.mock('../../storage', async (orig) => {
  const real = await orig<Record<string, any>>();
  return {
    ...real,
    storage: new Proxy(real.storage ?? {}, {
      get(target, prop) {
        if (prop === 'getActiveOpenPosition') return h.getActiveOpenPosition;
        if (prop === 'updateClosedTrade') return h.updateClosedTrade;
        if (prop === 'deleteActiveOpenPosition') return h.deleteActiveOpenPosition;
        if (prop === 'getClosedTradesBySymbol') return h.getClosedTradesBySymbol;
        return (target as any)[prop];
      },
    }),
  };
});
vi.mock('../../services/execution/depth-source.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getDepthSnapshot: h.getDepthSnapshot,
  getTickerWitness: h.getTickerWitness,
}));
vi.mock('../../services/execution/depth-gate-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveFillDepthGateConfig: h.resolveFillDepthGateConfig,
}));
vi.mock('../../services/execution/close-fill-contract-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveCloseFillContractConfig: h.resolveCloseFillContractConfig,
}));
vi.mock('../../core/math/cost-model.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFrictionForAssetClass: () => ({ feeRateMaker: 0.0004, feeRateTaker: 0.004 }),
}));
vi.mock('../../asset_classes/xstock_spot/book-state-tracker.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  assessBookStateNow: () => ({ ok: false }),
}));

import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';
import { PaperOrderPlacer } from '../../services/execution/order-placer.js';
import { walkAboveReference } from '../../services/execution/close-fill-contract-config.js';

type Close = (this: unknown, id: string, exitPrice: number, cond: unknown, src?: string, opts?: unknown) => Promise<void>;
const proto = ActiveExecutionEngine.prototype as unknown as { closePosition: Close; _countCloseRefusal: unknown };

const DEPTH_CFG = { warmthMaxAgeMs: 15000, sufficiencyMultiple: 2, minLevels: 1, beyondDepthPenaltyBps: 50 };
const CONTRACT = { upTol: 0.01, coldRefusalCap: 3 };
const STOP = { type: 'stop_hit', price: 0, reason: 'test' };

function fakeEngine() {
  return {
    mode: 'paper',
    feePercentFor: () => 0.1,
    orderPlacer: new PaperOrderPlacer(() => 0.1),
    _closeRefusalStreak: new Map<string, number>(),
    _countCloseRefusal: proto._countCloseRefusal,
  };
}
function position(symbol: string, assetClass: string) {
  return {
    id: `pos-${symbol}`, symbol, assetClass, strategyName: 'test', side: 'buy', quantity: '1', avgPrice: '100',
    intendedEntryPrice: '100', entryFee: '0', entrySlippage: '0', openedAt: new Date(), metadata: {},
  };
}
const snap = (bid: number, ageMs: number) => ({ asks: [{ price: bid * 1.1, qty: 10 }], bids: [{ price: bid, qty: 10 }], ageMs, source: 'test' });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.resolveFillDepthGateConfig.mockResolvedValue(DEPTH_CFG);
  h.resolveCloseFillContractConfig.mockResolvedValue(CONTRACT);
});
afterEach(() => { vi.restoreAllMocks(); Object.values(h).forEach((f) => (f as any).mockReset?.()); });

describe('B-FEED-MISMATCH-FIX — the signed predicate on the measured rows (A-4)', () => {
  it('refuses the three harmful stale walks and none of the harmless ones', () => {
    // [walked fill, witness bid] from closed_trades, staging 2026-09-19
    for (const [fill, bid] of [[439.0, 417.51], [118.4, 112.0], [89.59, 81.26]]) expect(walkAboveReference(fill, bid, 0.01)).toBe(true);
    for (const [fill, bid] of [[238.02, 238.02], [76.48, 76.48], [5.8, 5.8], [21.31, 21.31]]) expect(walkAboveReference(fill, bid, 0.01)).toBe(false);
    // KTA +0.47 % (the healthy maximum) and a −3.79 % deep crypto walk: both pass. Signed, not absolute.
    expect(walkAboveReference(100.47, 100, 0.01)).toBe(false);
    expect(walkAboveReference(96.21, 100, 0.01)).toBe(false);
  });
});

describe('B-FEED-MISMATCH-FIX — closePosition at runtime', () => {
  it('1. ★ a not-warm walk above the witness is REFUSED before ANY persistence (C4)', async () => {
    const eng = fakeEngine();
    h.getActiveOpenPosition.mockResolvedValue(position('CTVA/USD', 'xstock_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(89.59, 19_700));          // 19.7 s > 15 s warmth
    h.getTickerWitness.mockResolvedValue({ bid: 81.26, ask: 94.88, capturedAtMs: Date.now() });
    await proto.closePosition.call(eng, 'pos-CTVA/USD', 90, STOP, 'test', {});
    expect(h.getClosedTradesBySymbol).not.toHaveBeenCalled();
    expect(h.updateClosedTrade).not.toHaveBeenCalled();
    expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
    expect(eng._closeRefusalStreak.get('pos-CTVA/USD')).toBe(1);
  });

  it('2. at the cap the refused close YIELDS and alerts exactly once (FINDING-1)', async () => {
    const eng = fakeEngine();
    h.getActiveOpenPosition.mockResolvedValue(position('CTVA/USD', 'xstock_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(89.59, 19_700));
    h.getTickerWitness.mockResolvedValue({ bid: 81.26, ask: 94.88, capturedAtMs: Date.now() });
    for (let i = 0; i < 2; i++) await proto.closePosition.call(eng, 'pos-CTVA/USD', 90, STOP, 'test', {});
    expect(h.getClosedTradesBySymbol).not.toHaveBeenCalled();
    expect(h.addAlert).not.toHaveBeenCalled();
    await proto.closePosition.call(eng, 'pos-CTVA/USD', 90, STOP, 'test', {}).catch(() => {});
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    expect(h.getClosedTradesBySymbol).toHaveBeenCalled();                  // it yielded and proceeded to persist
    expect(eng._closeRefusalStreak.has('pos-CTVA/USD')).toBe(false);       // cleared once the gate passed
  });

  it('3. a not-warm walk BELOW the witness (a deep walk) is not refused — the predicate is signed', async () => {
    const eng = fakeEngine();
    h.getActiveOpenPosition.mockResolvedValue(position('WLD/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(96.21, 20_000));
    h.getTickerWitness.mockResolvedValue({ bid: 100, ask: 100.1, capturedAtMs: Date.now() });
    await proto.closePosition.call(eng, 'pos-WLD/USD', 100, STOP, 'test', {}).catch(() => {});
    expect(eng._closeRefusalStreak.has('pos-WLD/USD')).toBe(false);
    expect(h.getClosedTradesBySymbol).toHaveBeenCalled();
  });

  it('4. ★ the MAKER leg still reads the witness — branch reachability, not text order (C4, BLOCKER-4)', async () => {
    const eng = fakeEngine();
    h.getActiveOpenPosition.mockResolvedValue(position('BTC/USD', 'crypto_spot'));
    h.getTickerWitness.mockResolvedValue({ bid: 100, ask: 100.1, capturedAtMs: Date.now() });
    await proto.closePosition.call(eng, 'pos-BTC/USD', 100, { type: 'target_hit', price: 100, reason: 't' }, 'test', { makerExitFill: { limit: 100 } }).catch(() => {});
    expect(h.getTickerWitness).toHaveBeenCalledWith('BTC/USD', 'crypto_spot');
    expect(h.getDepthSnapshot).not.toHaveBeenCalled();                     // the maker leg consults no book
  });

  it('5. a cold book on a RUNNING monitor is refused (non-filled), never booked at the requested price', async () => {
    const eng = fakeEngine();
    h.getActiveOpenPosition.mockResolvedValue(position('BTC/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(null);
    h.getTickerWitness.mockResolvedValue(null);
    await proto.closePosition.call(eng, 'pos-BTC/USD', 100, STOP, 'test', {});
    expect(h.getClosedTradesBySymbol).not.toHaveBeenCalled();
    expect(h.updateClosedTrade).not.toHaveBeenCalled();
    expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
    expect(eng._closeRefusalStreak.get('pos-BTC/USD')).toBe(1);
  });

  it('6. a cold book on a stopped-engine FLATTEN books against the observed reference (not refused)', async () => {
    const eng = fakeEngine();
    h.getActiveOpenPosition.mockResolvedValue(position('BTC/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(null);
    h.getTickerWitness.mockResolvedValue(null);
    await proto.closePosition.call(eng, 'pos-BTC/USD', 95, { type: 'manual_stop', price: 95, reason: 't' }, 'test', { flatten: true }).catch(() => {});
    expect(eng._closeRefusalStreak.has('pos-BTC/USD')).toBe(false);
    expect(h.getClosedTradesBySymbol).toHaveBeenCalled();
  });
});

describe('B-FEED-MISMATCH-FIX — PaperOrderPlacer.closeOrder cold arms', () => {
  const placer = new PaperOrderPlacer(() => 0.1);
  const base = { symbol: 'BTC/USD', side: 'sell' as const, quantity: 1, requestedPrice: 100, mode: 'paper' as const, positionId: 'p' };
  it('cold + no reference → rejected cold_book (never requestedPrice)', async () => {
    const r = await placer.closeOrder({ ...base, beyondDepthPenaltyBps: 50 });
    expect(r).toMatchObject({ status: 'rejected', code: 'cold_book' });
  });
  it('cold + observed reference (flatten) → reference worsened by the penalty', async () => {
    const r = await placer.closeOrder({ ...base, beyondDepthPenaltyBps: 50, coldBookReferencePrice: 95 });
    expect(r.status).toBe('filled');
    if (r.status === 'filled') expect(r.fillPrice).toBeCloseTo(95 * (1 - 50 / 10_000), 10);
  });
  it('no depth config → rejected no_depth_config (never a zero-slippage exit)', async () => {
    const r = await placer.closeOrder({ ...base, bookBids: [{ price: 99, qty: 5 }] });
    expect(r).toMatchObject({ status: 'rejected', code: 'no_depth_config' });
  });
});
