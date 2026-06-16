/**
 * P19-B4b.1 — PaperOrderPlacer unit tests (DEPTH-WALKED fill).
 *
 * The placer now walks the real order book passed on the request (replacing the flat
 * 0.05% slippage of B3a): open = VWAP over the ask side (partial when the book is too
 * thin); close = VWAP over the bid side, ALWAYS full-fill, beyond-book remainder priced
 * with the DB-resolved penalty (no magic constant). Fee stays per-class. RNG-free.
 */
import { describe, it, expect } from 'vitest';
import { PaperOrderPlacer } from './order-placer.js';
import type { FillResult, FilledResult, PartialFillResult } from './types.js';

const FEE = 0.26; // 0.26% taker fee

function placer(feeFor: (s: string) => number = () => FEE) {
  return new PaperOrderPlacer(feeFor);
}
function expectFilled(r: FillResult): asserts r is FilledResult { expect(r.status).toBe('filled'); }
function expectPartial(r: FillResult): asserts r is PartialFillResult { expect(r.status).toBe('partial'); }

describe('PaperOrderPlacer.openOrder (depth-walked)', () => {
  it('fills a buy at the ask-side VWAP, fee on filled notional, slippage vs intended', async () => {
    const r = await placer().openOrder({
      symbol: 'BTC/USD', side: 'buy', quantity: 2, intendedPrice: 100, mode: 'paper',
      bookAsks: [{ price: 100.1, qty: 5 }],
    });
    expectFilled(r);
    expect(r.fillPrice).toBeCloseTo(100.1, 10); // 2 units all at 100.1
    expect(r.fillQty).toBe(2);
    expect(r.feeQuote).toBeCloseTo(100.1 * 2 * (FEE / 100), 10);
    expect(r.slippageQuote).toBeCloseTo((100.1 - 100) * 2, 10);
  });

  it('walks multiple ask levels for the VWAP', async () => {
    const r = await placer().openOrder({
      symbol: 'ETH/USD', side: 'buy', quantity: 3, intendedPrice: 100, mode: 'paper',
      bookAsks: [{ price: 100, qty: 1 }, { price: 102, qty: 5 }],
    });
    expectFilled(r);
    // (1*100 + 2*102)/3 = 304/3 = 101.333…
    expect(r.fillPrice).toBeCloseTo((100 + 2 * 102) / 3, 10);
    expect(r.fillQty).toBe(3);
  });

  it('returns a PARTIAL when the ask book is too thin (sizes down to filled qty)', async () => {
    const r = await placer().openOrder({
      symbol: 'UNI/USD', side: 'buy', quantity: 5, intendedPrice: 100, mode: 'paper',
      bookAsks: [{ price: 100, qty: 1 }, { price: 101, qty: 0.5 }],
    });
    expectPartial(r);
    expect(r.fillQty).toBeCloseTo(1.5, 10);
    expect(r.requestedQty).toBe(5);
    expect(r.remainingQty).toBeCloseTo(3.5, 10);
    expect(r.fillPrice).toBeCloseTo((100 * 1 + 101 * 0.5) / 1.5, 10);
  });

  it('rejects an open with no ask book (defense-in-depth; the gate should have blocked it)', async () => {
    const r = await placer().openOrder({
      symbol: 'BTC/USD', side: 'buy', quantity: 1, intendedPrice: 100, mode: 'paper',
    });
    expect(r.status).toBe('rejected');
  });

  it('passes the symbol through to the per-class fee resolver', async () => {
    const seen: string[] = [];
    const r = await placer((s) => { seen.push(s); return s === 'AAPL/USD' ? 0.4 : 0.26; })
      .openOrder({ symbol: 'AAPL/USD', side: 'buy', quantity: 1, intendedPrice: 200, mode: 'paper', bookAsks: [{ price: 200, qty: 10 }] });
    expectFilled(r);
    expect(seen).toContain('AAPL/USD');
    expect(r.feeQuote).toBeCloseTo(200 * 1 * (0.4 / 100), 10);
  });
});

describe('PaperOrderPlacer.closeOrder (depth-walked, always full-fill)', () => {
  it('fills a sell at the bid-side VWAP when the book is deep enough', async () => {
    const r = await placer().closeOrder({
      symbol: 'BTC/USD', side: 'sell', quantity: 2, requestedPrice: 100, mode: 'paper', positionId: 'p1',
      bookBids: [{ price: 99.9, qty: 5 }], beyondDepthPenaltyBps: 50,
    });
    expectFilled(r);
    expect(r.fillPrice).toBeCloseTo(99.9, 10);
    expect(r.fillQty).toBe(2);
    expect(r.slippageQuote).toBeCloseTo((100 - 99.9) * 2, 10);
  });

  it('ALWAYS full-fills, penalizing the beyond-book remainder with the DB penalty', async () => {
    const r = await placer().closeOrder({
      symbol: 'UNI/USD', side: 'sell', quantity: 4, requestedPrice: 100, mode: 'paper', positionId: 'p2',
      bookBids: [{ price: 100, qty: 1 }, { price: 99, qty: 1 }], beyondDepthPenaltyBps: 50,
    });
    expectFilled(r);
    expect(r.fillQty).toBe(4); // full fill, never a phantom stuck position
    // filled 2 @ VWAP(100,99)=99.5; remainder 2 @ 99*(1-0.005)=98.505 → blended 99.0025
    expect(r.fillPrice).toBeCloseTo((2 * 99.5 + 2 * 98.505) / 4, 8);
  });

  it('cold book (no bids) + penalty → exits at requestedPrice worsened by the penalty', async () => {
    const r = await placer().closeOrder({
      symbol: 'BTC/USD', side: 'sell', quantity: 1, requestedPrice: 100, mode: 'paper', positionId: 'p3',
      beyondDepthPenaltyBps: 50,
    });
    expectFilled(r);
    expect(r.fillPrice).toBeCloseTo(100 * (1 - 50 / 10000), 10); // 99.5
  });

  it('no config at all → still exits (never a stuck position) at requestedPrice', async () => {
    const r = await placer().closeOrder({
      symbol: 'BTC/USD', side: 'sell', quantity: 1, requestedPrice: 100, mode: 'paper', positionId: 'p4',
    });
    expectFilled(r);
    expect(r.fillPrice).toBeCloseTo(100, 10);
  });
});

describe('FillResult union (live-shape)', () => {
  it('discriminates each variant on status', () => {
    const variants: FillResult[] = [
      { status: 'filled', fillPrice: 1, fillQty: 1, feeQuote: 0, slippageQuote: 0 },
      { status: 'partial', fillPrice: 1, fillQty: 1, requestedQty: 2, feeQuote: 0, slippageQuote: 0, remainingQty: 1 },
      { status: 'delayed', orderRef: 'O-1', submittedAt: '2026-06-13T00:00:00Z' },
      { status: 'rejected', reason: 'insufficient balance', code: 'EOrder:Insufficient funds' },
    ];
    expect(variants.map((v) => v.status)).toEqual(['filled', 'partial', 'delayed', 'rejected']);
  });
});
