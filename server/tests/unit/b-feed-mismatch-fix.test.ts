// B-FEED-MISMATCH-FIX (PHASE_19_PLAN row 3n.u) — the CLOSE-FILL CONTRACT, pinned at RUNTIME.
//
// Langston's Step-2 conditions this file answers:
//   C4 — the #911 witness fence pinned TEXT ORDER where the property is BRANCH REACHABILITY; and r5 makes a new
//        ordering property load-bearing (a refused close returns before ANY persistence). Both are pinned here by
//        DRIVING `closePosition` (prototype call, fake `this`, the module seams mocked), not by reading its source.
//   A-4 — the signed predicate is exercised on the measured rows: the three harmful stale walks refuse, the
//        harmless ones and a deep crypto walk (−3.79 %) do not.
//
// THE PASSED-THE-FILL-CONTRACT MARKER: `storage.findOpenTradeRecord` (the keyed open trade-record lookup, B-CLOSE-WRITER-COSTS
// P-1) runs right after the fill, the witness and the gate — ABOVE the write block, not inside it (Langston Step-4 record
// item i: R-none is the counterexample, marker called and nothing persisted). A refused close must never reach it; an
// accepted one always does. The persistence leg is `h.updateClosedTrade`, asserted where the tests need it.
// (The accepted path then runs far past this unit's mocks — learning capture, archives — so it is allowed to throw
// AFTER the marker; the marker, not the delete, is what these tests assert.)
//
// POSITIVE CONTROLS (mutation-proved while writing this file):
//   - moving the `getTickerWitness` call INTO the taker branch fails test 4 (maker leg: witness never read);
//   - removing the refusal's `return` (so a refused close falls through to persistence) fails tests 1 and 2;
//   - making the predicate unsigned (Math.abs) fails test 3 (the −3.79 % crypto walk is refused).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const h = vi.hoisted(() => ({
  addAlert: vi.fn(async (_a: unknown) => undefined),
  getActiveOpenPosition: vi.fn(),
  updateClosedTrade: vi.fn(async () => ({})),
  deleteActiveOpenPosition: vi.fn(async () => undefined),
  findOpenTradeRecord: vi.fn(async () => ({ status: 'one', record: { id: 't-1', openedAt: new Date(), closedAt: null, metadata: {} } })),
  getDepthSnapshot: vi.fn(),
  getTickerWitness: vi.fn(),
  resolveFillDepthGateConfig: vi.fn(),
  resolveCloseFillContractConfig: vi.fn(),
  // B-CRYPTO-FEED-WATCHDOG (#1232, P7): the recorder's in-memory answers the vouch reads.
  isInCryptoRecorderUniverse: vi.fn(),
  isCryptoRecorderSymbolConnectionLive: vi.fn(),
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
        if (prop === 'findOpenTradeRecord') return h.findOpenTradeRecord;
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
vi.mock('../../services/passive-archive/crypto-spot-archiver.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isInCryptoRecorderUniverse: h.isInCryptoRecorderUniverse,
  isCryptoRecorderSymbolConnectionLive: h.isCryptoRecorderSymbolConnectionLive,
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
    // B-CLOSE-WRITER-COSTS P-16: the record resolve + refusal, shared by the close and the never-filled drop.
    _resolveOpenTradeRecord: (proto as any)._resolveOpenTradeRecord,
    _refuseUnresolvedRecord: (proto as any)._refuseUnresolvedRecord,
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
    expect(h.findOpenTradeRecord).not.toHaveBeenCalled();
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
    expect(h.findOpenTradeRecord).not.toHaveBeenCalled();
    expect(h.addAlert).not.toHaveBeenCalled();
    await proto.closePosition.call(eng, 'pos-CTVA/USD', 90, STOP, 'test', {}).catch(() => {});
    // Exactly ONE refusal alert. (Langston Step-4 R-2: `mockReset` restores the `vi.fn(impl)` default, so the lookup returns
    // `one` and no record-refusal alert is raised here; the filter on the refusal title is kept so a later change to the
    // lookup's default cannot turn a different alert into a false pass.)
    const refusalAlerts = h.addAlert.mock.calls.filter((c) => String((c[0] as { title?: string }).title).includes('Close refused'));
    expect(refusalAlerts).toHaveLength(1);
    expect(h.findOpenTradeRecord).toHaveBeenCalled();                  // it yielded and proceeded to persist
    expect(eng._closeRefusalStreak.has('pos-CTVA/USD')).toBe(false);       // cleared once the gate passed
  });

  it('3. a not-warm walk BELOW the witness (a deep walk) is not refused — the predicate is signed', async () => {
    const eng = fakeEngine();
    h.getActiveOpenPosition.mockResolvedValue(position('WLD/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(96.21, 20_000));
    h.getTickerWitness.mockResolvedValue({ bid: 100, ask: 100.1, capturedAtMs: Date.now() });
    await proto.closePosition.call(eng, 'pos-WLD/USD', 100, STOP, 'test', {}).catch(() => {});
    expect(eng._closeRefusalStreak.has('pos-WLD/USD')).toBe(false);
    expect(h.findOpenTradeRecord).toHaveBeenCalled();
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
    expect(h.findOpenTradeRecord).not.toHaveBeenCalled();
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
    expect(h.findOpenTradeRecord).toHaveBeenCalled();
  });
});

describe('B-CRYPTO-FEED-WATCHDOG (#1232, P7) — the not-warm gate grades a crypto witness only when VOUCHED', () => {
  const CRYPTO_CONTRACT = { upTol: 0.01, coldRefusalCap: 3, witnessMaxAgeMs: 21_600_000 };
  // The 2026-10-28 DOS/USD shape: a walk well above a witness bid frozen at 10-21 10:19:57Z (> up_tol above it).
  const frozenWitness = () => ({ bid: 81.26, ask: 81.5, capturedAtMs: Date.now() - 7 * 86_400_000 });
  const freshWitness = () => ({ bid: 81.26, ask: 81.5, capturedAtMs: Date.now() - 5_000 });

  it('V1. ★ a witness from a SILENT recorder connection does not refuse the close; it is stamped unvouched', async () => {
    const eng = fakeEngine();
    h.resolveCloseFillContractConfig.mockResolvedValue(CRYPTO_CONTRACT);
    h.isInCryptoRecorderUniverse.mockReturnValue(true);
    h.isCryptoRecorderSymbolConnectionLive.mockReturnValue(false);
    h.getActiveOpenPosition.mockResolvedValue(position('DOS/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(89.59, 19_700));          // not warm
    h.getTickerWitness.mockResolvedValue(frozenWitness());
    await proto.closePosition.call(eng, 'pos-DOS/USD', 90, STOP, 'test', {}).catch(() => {});
    expect(eng._closeRefusalStreak.has('pos-DOS/USD')).toBe(false);
    expect(h.findOpenTradeRecord).toHaveBeenCalled();                 // proceeded to persist
    const warned = (console.warn as any).mock.calls.map((c: unknown[]) => String(c[0]));
    expect(warned.some((w: string) => w.includes('[WITNESS_UNVOUCHED]') && w.includes('reason=connection_not_live'))).toBe(true);
  });

  it('V2. the same walk against a VOUCHED witness is still refused (the gate is not weakened)', async () => {
    const eng = fakeEngine();
    h.resolveCloseFillContractConfig.mockResolvedValue(CRYPTO_CONTRACT);
    h.isInCryptoRecorderUniverse.mockReturnValue(true);
    h.isCryptoRecorderSymbolConnectionLive.mockReturnValue(true);
    h.getActiveOpenPosition.mockResolvedValue(position('DOS/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(89.59, 19_700));
    h.getTickerWitness.mockResolvedValue(freshWitness());
    await proto.closePosition.call(eng, 'pos-DOS/USD', 90, STOP, 'test', {});
    expect(h.findOpenTradeRecord).not.toHaveBeenCalled();
    expect(h.updateClosedTrade).not.toHaveBeenCalled();
    expect(eng._closeRefusalStreak.get('pos-DOS/USD')).toBe(1);
  });

  it('V3. the GLMR/USD shape: a symbol outside the recorder universe is not graded', async () => {
    const eng = fakeEngine();
    h.resolveCloseFillContractConfig.mockResolvedValue(CRYPTO_CONTRACT);
    h.isInCryptoRecorderUniverse.mockReturnValue(false);
    h.isCryptoRecorderSymbolConnectionLive.mockReturnValue(null);
    h.getActiveOpenPosition.mockResolvedValue(position('GLMR/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(89.59, 19_700));
    h.getTickerWitness.mockResolvedValue({ bid: 81.26, ask: 81.5, capturedAtMs: Date.now() - 40 * 3_600_000 });
    await proto.closePosition.call(eng, 'pos-GLMR/USD', 90, STOP, 'test', {}).catch(() => {});
    expect(eng._closeRefusalStreak.has('pos-GLMR/USD')).toBe(false);
    expect(h.findOpenTradeRecord).toHaveBeenCalled();
  });
});

describe('B-FEED-MISMATCH-FIX Step-4 blockers', () => {
  it('BLOCKER-2: a refused FLATTEN alerts on its FIRST refusal (no retrying caller)', async () => {
    const eng = fakeEngine();
    h.resolveFillDepthGateConfig.mockResolvedValue(null);                 // fill_depth_gate unseeded -> no_depth_config
    h.getActiveOpenPosition.mockResolvedValue(position('BTC/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(95, 100));
    h.getTickerWitness.mockResolvedValue(null);
    await proto.closePosition.call(eng, 'pos-BTC/USD', 95, { type: 'manual_stop', price: 95, reason: 't' }, 'test', { flatten: true });
    expect(h.findOpenTradeRecord).not.toHaveBeenCalled();             // refused, nothing persisted
    expect(h.addAlert).toHaveBeenCalledTimes(1);                           // ...and NOT silent at streak 1
    expect(String((h.addAlert.mock.calls[0][0] as { title: string }).title)).toMatch(/FLATTEN left BTC\/USD OPEN/);
  });

  it('BLOCKER-1 (re-pointed by B-CLOSE-WRITER-COSTS P-10): the stranded clear writes NO record of its own — it closes through the one chain', () => {
    // The writer this test pinned (its own createClosedTrade with `stranded_clear` and the quote's provenance) is DELETED:
    // each position now closes through `closeOnePositionByOperator` → `closePosition`, which stamps the provenance itself.
    const src = readFileSync(resolve(__dirname, '../../routes.ts'), 'utf-8');
    const at = src.indexOf("apiRouter.post('/active-engine/force-clear-stranded'");
    expect(at).toBeGreaterThan(-1);
    const route = src.slice(at, src.indexOf('apiRouter.', at + 10));
    expect(route).toContain("manager.closeOnePositionByOperator(position.id, 'stranded_clear')");
    expect(route).not.toContain('createClosedTrade');
    expect(route).not.toContain('deleteActiveOpenPosition');
    expect(route).not.toMatch(/FALLBACK_TO_ENTRY/);
    expect(src).not.toContain("closeReason: 'stranded_clear'");
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

// B-CLOSE-WRITER-COSTS P-1/P-2 (KD-17, KD-24): the close finds its ONE open trade record by symbol + mode + asset class,
// and refuses rather than guesses. POSITIVE CONTROLS (mutation-proved while writing): removing the refusal's `return`
// makes R-none, R-many and R-class THROW (the write block dereferences a missing record), failing `resolves`; dropping the
// asset-class argument from the lookup fails the `toHaveBeenCalledWith` in R-one.
describe('B-CLOSE-WRITER-COSTS — the close refuses when its trade record does not resolve', () => {
  const warm = () => {
    h.getActiveOpenPosition.mockResolvedValue(position('WLD/USD', 'crypto_spot'));
    h.getDepthSnapshot.mockResolvedValue(snap(100, 0));
    h.getTickerWitness.mockResolvedValue({ bid: 100, ask: 100.1, capturedAtMs: Date.now() });
  };
  const unresolved = () => h.addAlert.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((a) => String(a.title).includes('cannot close'));

  for (const [label, result] of [['none', { status: 'none' }], ['many', { status: 'many', ids: ['t-1', 't-2'] }]] as const) {
    it(`R-${label}: the position is KEPT, nothing is written, one critical alert names it`, async () => {
      const eng = fakeEngine();
      warm();
      h.findOpenTradeRecord.mockResolvedValue(result as never);
      await expect(proto.closePosition.call(eng, 'pos-WLD/USD', 100, STOP, 'test', {})).resolves.toBeUndefined();
      expect(h.updateClosedTrade).not.toHaveBeenCalled();
      expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
      const a = unresolved();
      expect(a).toHaveLength(1);
      expect(a[0].severity).toBe('critical');
      expect(a[0].dedupe_key).toBe('close-record-unresolved-paper-WLD/USD');
      if (label === 'many') expect(String(a[0].body)).toContain('t-1, t-2');
    });
  }

  it('R-flatten: a stopped-engine FLATTEN is refused the same way — the flatten exemption does not reach the record (P-2)', async () => {
    const eng = fakeEngine();
    warm();
    h.findOpenTradeRecord.mockResolvedValue({ status: 'none' } as never);
    await expect(proto.closePosition.call(eng, 'pos-WLD/USD', 100, { type: 'manual_stop', price: 100, reason: 't' }, 'test', { flatten: true })).resolves.toBeUndefined();
    expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
    expect(unresolved()).toHaveLength(1);
  });

  it('R-cap: at the lookup cap the alert says "more than 3" and names the first 3 (Langston C-2)', async () => {
    const eng = fakeEngine();
    warm();
    h.findOpenTradeRecord.mockResolvedValue({ status: 'many', ids: ['a', 'b', 'c'], more: true } as never);
    await proto.closePosition.call(eng, 'pos-WLD/USD', 100, STOP, 'test', {});
    const body = String(unresolved()[0].body);
    expect(body).toContain('more than 3 open trade records match (first 3: a, b, c)');
  });

  it('R-streak: a close whose FILL passed clears the fill-refusal streak even when the record refuses (Langston C-1)', async () => {
    const eng = fakeEngine();
    warm();
    eng._closeRefusalStreak.set('pos-WLD/USD', 2);
    h.findOpenTradeRecord.mockResolvedValue({ status: 'none' } as never);
    await proto.closePosition.call(eng, 'pos-WLD/USD', 100, STOP, 'test', {});
    expect(eng._closeRefusalStreak.has('pos-WLD/USD')).toBe(false);
    expect(unresolved()).toHaveLength(1);
  });

  it('R-class: a position with no valid asset class is refused WITHOUT a lookup (a missing class never widens the match)', async () => {
    const eng = fakeEngine();
    warm();
    h.getActiveOpenPosition.mockResolvedValue(position('WLD/USD', 'not_a_class'));
    await expect(proto.closePosition.call(eng, 'pos-WLD/USD', 100, STOP, 'test', {})).resolves.toBeUndefined();
    expect(h.findOpenTradeRecord).not.toHaveBeenCalled();
    expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
    expect(unresolved()).toHaveLength(1);
  });

  it('R-one: exactly one record ⇒ looked up by mode + symbol + class, and no refusal alert', async () => {
    const eng = fakeEngine();
    warm();
    h.findOpenTradeRecord.mockResolvedValue({ status: 'one', record: { id: 't-1', openedAt: new Date(), closedAt: null, metadata: {} } } as never);
    await proto.closePosition.call(eng, 'pos-WLD/USD', 100, STOP, 'test', {}).catch(() => {});
    expect(h.findOpenTradeRecord).toHaveBeenCalledWith('paper', 'WLD/USD', 'crypto_spot');
    expect(unresolved()).toHaveLength(0);
  });
});
