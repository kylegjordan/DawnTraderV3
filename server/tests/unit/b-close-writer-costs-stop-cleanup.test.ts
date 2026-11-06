// B-CLOSE-WRITER-COSTS P-11 (Kyle KD-17; pre-audit A-3 path 2) — the engine-stop cleanup books REAL costs.
//
// `reconcileIncompleteTrades` closes a stale record (no open position left) with `engine_stop_cleanup`. It used to
// book gross `pnl` only — no fee, no net. It now books the no-bids-close economics at the observed reference through
// the SAME functions the paper order placer uses. Run here for real, against mocked storage / pricing / config.
//   C-1  the shared functions are bit-identical to the placer's former inline arithmetic.
//   C-2  the cleanup books penalty-worsened fill, taker exit fee on that fill, the record's own entry fee, net P&L.
//   C-3  a record it cannot price (no entry fee) is LEFT OPEN with an alert — never booked with an invented zero.
//   C-4  the placer's cold-reference arm and the cleanup agree on the same inputs (one implementation).
// POSITIVE CONTROL (mutation-proved while writing): booking `exitFee: 0` in the cleanup fails C-2 and C-4.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  getClosedTrades: vi.fn(),
  getActiveOpenPositions: vi.fn(async () => []),
  updateClosedTrade: vi.fn(async () => ({})),
  getPriceWithFallback: vi.fn(),
  resolveFillDepthGateConfig: vi.fn(),
  addAlert: vi.fn(async () => undefined),
}));
vi.mock('../../storage', async (orig) => {
  const real = await orig<Record<string, any>>();
  return { ...real, storage: new Proxy(real.storage ?? {}, { get(t, p) {
    if (p === 'getClosedTrades') return h.getClosedTrades;
    if (p === 'getActiveOpenPositions') return h.getActiveOpenPositions;
    if (p === 'updateClosedTrade') return h.updateClosedTrade;
    return (t as any)[p];
  } }) };
});
vi.mock('../../services/live-pricing-adapter.js', async (orig) => ({
  ...(await orig<Record<string, any>>()),
  livePricingAdapter: { getPriceWithFallback: h.getPriceWithFallback },
}));
vi.mock('../../services/execution/depth-gate-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()), resolveFillDepthGateConfig: h.resolveFillDepthGateConfig,
}));
vi.mock('../../core/math/cost-model.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()), getFrictionForAssetClass: () => ({ feeRateMaker: 0.0025, feeRateTaker: 0.004 }),
}));
vi.mock('../../services/system-alerts.js', async (orig) => ({ ...(await orig<Record<string, unknown>>()), addAlert: h.addAlert }));

import { reconcileIncompleteTrades } from '../../services/active-engine-service';
import { referenceFillPrice, closeFillCosts } from '../../core/math/trade-pnl';
import { PaperOrderPlacer } from '../../services/execution/order-placer';

const RECORD = { id: 't-9', symbol: 'ETH/USD', assetClass: 'crypto_spot', strategyName: 'test', closedAt: null,
  // the LEGACY open-record shape: the open path writes `fees` (the entry fee) and leaves `entry_fee` at its '0' default
  entryPrice: '2000', actualEntryPrice: '2000', quantity: '0.5', fees: '4', entryFee: '0', entrySlippage: '0.2' };
const QUOTE = { price: 2100, source: 'kraken_ws', producer: 'kraken-ws', observedAt: 1_700_000_000_000 };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  Object.values(h).forEach((f) => f.mockClear());
  h.getPriceWithFallback.mockResolvedValue(QUOTE);
  h.resolveFillDepthGateConfig.mockResolvedValue({ warmthMaxAgeMs: 15000, sufficiencyMultiple: 2, minLevels: 1, beyondDepthPenaltyBps: 50 });
});

describe('B-CLOSE-WRITER-COSTS P-11 — the engine-stop cleanup books real costs', () => {
  it('C-1 the shared functions reproduce the former inline arithmetic exactly', () => {
    const ref = 2100, bps = 50, qty = 0.5, pct = 0.4;
    const fill = referenceFillPrice(ref, bps);
    expect(fill).toBe(ref * (1 - bps / 10_000));
    const c = closeFillCosts({ fillPrice: fill, quantity: qty, requestedPrice: ref, feePercent: pct });
    const notional = fill * qty;
    expect(c.exitFee).toBe(notional * (pct / 100));
    expect(c.exitSlippage).toBe((ref - fill) * qty);
  });

  it('C-2 a stale record is closed with the penalty fill, the taker fee, its own entry fee and net P&L', async () => {
    h.getClosedTrades.mockResolvedValue([RECORD]);
    const r = await reconcileIncompleteTrades('paper', 'sess-1');
    expect(r).toEqual({ reconciled: 1, stillOpen: 0, errors: 0 });
    const [mode, id, w] = h.updateClosedTrade.mock.calls[0] as unknown as [string, string, Record<string, string>];
    expect([mode, id, w.closeReason, (w as any).exitFillArm]).toEqual(['paper', 't-9', 'engine_stop_cleanup', 'synthetic_reference']);
    const fill = 2100 * (1 - 50 / 10_000);                 // 2089.5
    const exitFee = fill * 0.5 * 0.004;                     // 4.179
    const gross = (fill - 2000) * 0.5;                      // 44.75
    expect(parseFloat(w.exitPrice)).toBeCloseTo(fill, 10);
    expect(parseFloat(w.exitFee)).toBeCloseTo(exitFee, 10);
    expect(parseFloat(w.totalFee)).toBeCloseTo(4 + exitFee, 10);
    expect(parseFloat(w.grossPnl)).toBeCloseTo(gross, 10);
    expect(parseFloat(w.netPnl)).toBeCloseTo(gross - 4 - exitFee, 10);
    expect(w.pnl).toBe(w.netPnl);                            // `pnl` carries net, as the canonical close writes it
    expect(w.exitDecisionPrice).toBe('2100');
  });

  it('C-3 a record with no entry fee (fees) is LEFT OPEN and alerted, never booked with a zero', async () => {
    h.getClosedTrades.mockResolvedValue([{ ...RECORD, fees: null }]);
    const r = await reconcileIncompleteTrades('paper', 'sess-1');
    expect(r).toEqual({ reconciled: 0, stillOpen: 1, errors: 0 });
    expect(h.updateClosedTrade).not.toHaveBeenCalled();
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    expect(String((h.addAlert.mock.calls[0] as any)[0].body)).toContain('no entry fee on its record');
  });

  it('C-4 the placer\'s cold-reference arm and the cleanup book the same exit for the same inputs', async () => {
    const placer = new PaperOrderPlacer(() => 0.4);
    const f = await placer.closeOrder({ symbol: 'ETH/USD', side: 'sell', quantity: 0.5, requestedPrice: 2100, mode: 'paper',
      positionId: 'p', assetClass: 'crypto_spot', bookBids: [], beyondDepthPenaltyBps: 50, coldBookReferencePrice: 2100 } as any);
    h.getClosedTrades.mockResolvedValue([RECORD]);
    await reconcileIncompleteTrades('paper', 'sess-1');
    const w = (h.updateClosedTrade.mock.calls[0] as unknown as unknown[])[2] as Record<string, string>;
    expect(f.status).toBe('filled');
    expect(parseFloat(w.exitPrice)).toBe((f as any).fillPrice);
    expect(parseFloat(w.exitFee)).toBe((f as any).feeQuote);
    expect(parseFloat(w.exitSlippage)).toBe((f as any).slippageQuote);
  });
});

// P-17: the stop flow's orphan step lives inside the engine stop (not unit-constructible), so its ORDER is pinned on the
// source — the delete is reachable only after the record is finished, and an unfinished one `continue`s past it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
describe('B-CLOSE-WRITER-COSTS P-17 — the orphan step finishes the record before it deletes the position', () => {
  const src = readFileSync(resolve(__dirname, '../../services/active-engine-service.ts'), 'utf8').split(String.fromCharCode(13)).join('');
  const start = src.indexOf('for (const orphan of remainingOpen) {');
  const del = src.indexOf("await storage.deleteActiveOpenPosition('paper', orphan.id);", start);
  const block = src.slice(start, del);
  it('O-1 the record is resolved by tradeId, else by the close key, and finished through the shared close', () => {
    expect(start).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(start);
    expect(block).toContain("storage.getClosedTrade('paper', _tid)");
    expect(block).toContain("storage.findOpenTradeRecord('paper', orphan.symbol, _ocls)");
    expect(block).toContain("closeStaleRecordAtReference('paper', _orec)");
  });
  it('O-2 an unfinished record keeps the position: the `continue` sits between the finish check and the delete', () => {
    const guard = block.indexOf('if (!_finished) {');
    expect(guard).toBeGreaterThan(-1);
    expect(block.indexOf('flattenReport.orphansKept.push(orphan.symbol);', guard)).toBeGreaterThan(guard);
    expect(block.indexOf('continue;', guard)).toBeGreaterThan(guard);
  });
  it('O-4 a FAILED tradeId stamp fails CLOSED here: kept, reported, and never reaches the finish (Langston NEW-1 condition)', () => {
    const stampAt = block.indexOf("if (!(await stampPositionTradeId('paper', orphan, _orec.id))) {");
    const finishAt = block.indexOf("closeStaleRecordAtReference('paper', _orec)");
    expect(stampAt).toBeGreaterThan(0);
    expect(finishAt).toBeGreaterThan(stampAt);
    const arm = block.slice(stampAt, finishAt);
    expect(arm).toContain('flattenReport.orphansKept.push(orphan.symbol);');
    expect(arm).toContain('continue;');
    expect(arm).toContain('tradeId stamp FAILED');
  });
  it('O-3 a delete that FAILS after the record was finished is reported in orphansKept (Langston Part C C-2)', () => {
    const after = src.slice(del, src.indexOf('} else {', del));
    const catchAt = after.indexOf('} catch (cleanupErr) {');
    expect(catchAt).toBeGreaterThan(-1);
    expect(after.indexOf('flattenReport.orphansKept.push(orphan.symbol);', catchAt)).toBeGreaterThan(catchAt);
  });
});

// P-11 (Langston Part C C-3): the cleanup reads an open record's entry fee from `fees`. That is right only while the open
// path writes the entry fee into `fees` — `fees` has the same DEFAULT '0' as `entry_fee`, so a writer that stopped setting it
// would make the cleanup book a zero entry fee silently. Pinned on the source, in class with O-1..O-3.
describe('B-CLOSE-WRITER-COSTS P-11 — the open record carries its entry fee in `fees`', () => {
  it('F-1 the open path writes fees: entryFee into its createClosedTrade payload, and the restore writes both columns', () => {
    const engine = readFileSync(resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf8').split(String.fromCharCode(13)).join('');
    const at = engine.indexOf('const trade = await storage.createClosedTrade(this.mode, {');
    expect(at).toBeGreaterThan(-1);
    const payload = engine.slice(at, engine.indexOf('});', at));
    expect(payload).toMatch(/\n\s+fees: entryFee\.toString\(\),/);
    const restore = readFileSync(resolve(__dirname, '../../services/trade-record-restore.ts'), 'utf8');
    expect(restore).toContain("fees: String(position.entryFee),");
    expect(restore).toContain("entryFee: String(position.entryFee),");
    // Langston Part B condition 2: no invented zero — a null entry cost is refused, never defaulted.
    expect(restore).not.toContain("?? '0'");
  });
  it("F-2 a record whose fees is '0' books a zero entry fee — the guard does NOT refuse a zero (a zero-fee class must work); the fence above is the protection", async () => {
    h.getClosedTrades.mockResolvedValue([{ ...RECORD, fees: '0' }]);
    await reconcileIncompleteTrades('paper', 'sess-1');
    const w = (h.updateClosedTrade.mock.calls[0] as unknown as unknown[])[2] as Record<string, string>;
    const fill = 2100 * (1 - 50 / 10_000);
    expect(parseFloat(w.totalFee)).toBeCloseTo(fill * 0.5 * 0.004, 10);
  });
});
