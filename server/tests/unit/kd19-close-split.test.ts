/**
 * KD-19 P1/P2 (`B-PRICE-SIDE-BY-JOB`, folds P-8e) — the paper close returns its fill split, and a close of no quantity is
 * REFUSED (never booked at a price of 0).
 */
import { describe, it, expect } from 'vitest';
import { PaperOrderPlacer } from '../../services/execution/order-placer.js';
import type { CloseOrderRequest } from '../../services/execution/types.js';

const placer = new PaperOrderPlacer(() => 0.4);
const base: CloseOrderRequest = {
  symbol: 'TEST/USD', side: 'sell', quantity: 3, requestedPrice: 100, mode: 'paper', positionId: 'p1',
  assetClass: 'crypto_spot', bookBids: [{ price: 100, qty: 1 }, { price: 99, qty: 1 }], beyondDepthPenaltyBps: 50,
};

describe('KD-19 P2 — paper close split', () => {
  it('walk: the bids held 2, 1 was priced beyond them', async () => {
    const r = await placer.closeOrder(base);
    expect(r.status).toBe('filled');
    if (r.status !== 'filled') return;
    expect(r.closeSplit).toEqual({ branch: 'walk', walkedQty: 2, extrapolatedQty: 1 });
    expect(r.fillPrice).toBeCloseTo((100 + 99 + 99 * 0.995) / 3, 10);
  });

  it('cold_reference: a flatten with no bids walked nothing', async () => {
    const r = await placer.closeOrder({ ...base, bookBids: [], coldBookReferencePrice: 100 });
    expect(r.status).toBe('filled');
    if (r.status !== 'filled') return;
    expect(r.closeSplit).toEqual({ branch: 'cold_reference', walkedQty: 0, extrapolatedQty: 3 });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('quantity %s is REJECTED with invalid_close_qty, never booked', async (q) => {
    const r = await placer.closeOrder({ ...base, quantity: q });
    expect(r.status).toBe('rejected');
    if (r.status !== 'rejected') return;
    expect(r.code).toBe('invalid_close_qty');
  });

  it('control: before the guard, a zero quantity walked to a price of 0 (the defect the guard exists for)', async () => {
    const { closeFillFull } = await import('../../services/execution/depth-walk.js');
    expect(closeFillFull(0, base.bookBids!, 50).avgFillPrice).toBe(0);
  });
});
