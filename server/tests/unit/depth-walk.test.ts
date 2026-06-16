/**
 * P19-B4b.1 — depth-walk GOLDEN test (Langston C-Q2a: port-and-prove).
 *
 * `walkBook` is a port of `slippage-fee-model.ts:91-125 calculatePriceImpact`.
 * The reference algorithm is embedded below verbatim so the port is pinned to the
 * original's outputs across shared inputs — we prove the port, not re-derive it.
 * Also covers partial (open) + always-full penalized (close) + determinism.
 */
import { describe, it, expect } from 'vitest';
import {
  walkBook,
  openFill,
  closeFillFull,
  cumulativeNotional,
  validLevelCount,
  type BookLevel,
} from '../../services/execution/depth-walk.js';

// ── Reference: verbatim port of calculatePriceImpact's consume loop (the "golden"
//    source). Returns the avgFillPrice it computes internally (= totalCost/filledQty).
function refAvgFillPrice(quantity: number, book: ReadonlyArray<[number, number]>): number {
  let remainingQty = quantity;
  let totalCost = 0;
  let filledQty = 0;
  for (const [price, volume] of book) {
    if (remainingQty <= 0) break;
    const fillQty = Math.min(remainingQty, volume);
    totalCost += fillQty * price;
    filledQty += fillQty;
    remainingQty -= fillQty;
  }
  return filledQty === 0 ? 0 : totalCost / filledQty;
}

const asLevels = (b: ReadonlyArray<[number, number]>): BookLevel[] =>
  b.map(([price, qty]) => ({ price, qty }));

describe('P19-B4b.1 depth-walk — GOLDEN vs calculatePriceImpact', () => {
  const fixtures: Array<{ name: string; qty: number; book: Array<[number, number]> }> = [
    { name: 'single deep level', qty: 1, book: [[100, 10]] },
    { name: 'partial first level', qty: 0.5, book: [[100, 10], [101, 5]] },
    { name: 'spans two levels', qty: 12, book: [[100, 10], [101, 5]] },
    { name: 'spans three levels', qty: 18, book: [[100, 10], [101, 5], [102, 8]] },
    { name: 'exact level boundary', qty: 10, book: [[100, 10], [101, 5]] },
    { name: 'tiny order top of book', qty: 0.001, book: [[50000, 2], [50010, 3]] },
  ];

  for (const f of fixtures) {
    it(`avgFillPrice matches the reference: ${f.name}`, () => {
      const walked = walkBook(f.qty, asLevels(f.book));
      const ref = refAvgFillPrice(f.qty, f.book);
      expect(walked.avgFillPrice).toBeCloseTo(ref, 10);
    });
  }

  it('order exceeds book → fills what it can, flags exhausted, VWAP over filled matches reference', () => {
    const book: Array<[number, number]> = [[100, 10], [101, 5]];
    const walked = walkBook(100, asLevels(book)); // only 15 available
    expect(walked.filledQty).toBeCloseTo(15, 10);
    expect(walked.exhausted).toBe(true);
    expect(walked.avgFillPrice).toBeCloseTo(refAvgFillPrice(100, book), 10);
  });

  it('empty book → nothing filled, exhausted, zero price (no NaN)', () => {
    const walked = walkBook(5, []);
    expect(walked.filledQty).toBe(0);
    expect(walked.avgFillPrice).toBe(0);
    expect(walked.exhausted).toBe(true);
  });

  it('is deterministic — identical input yields identical output (RNG-free, C-Q5)', () => {
    const book = asLevels([[100, 3], [101, 4], [102, 9]]);
    const a = walkBook(10, book);
    const b = walkBook(10, book);
    expect(a).toEqual(b);
  });
});

describe('P19-B4b.1 depth-walk — open partial / close full-fill', () => {
  it('openFill returns a partial when the ask side is too thin', () => {
    const asks = asLevels([[100, 1], [101, 2]]); // 3 available
    const r = openFill(5, asks);
    expect(r.exhausted).toBe(true);
    expect(r.filledQty).toBeCloseTo(3, 10);
  });

  it('closeFillFull ALWAYS fills the full order, penalizing the beyond-book remainder', () => {
    const bids = asLevels([[100, 1], [99, 1]]); // 2 available, order 4
    const penaltyBps = 50; // 0.50%
    const r = closeFillFull(4, bids, penaltyBps);
    expect(r.filledQty).toBe(4);
    expect(r.exhausted).toBe(false);
    // filled 2 @ VWAP (100,99) = 99.5; remainder 2 @ worst-bid(99) * (1-0.005) = 98.505
    // blended = (2*99.5 + 2*98.505)/4 = 99.0025
    expect(r.avgFillPrice).toBeCloseTo((2 * 99.5 + 2 * 98.505) / 4, 8);
  });

  it('closeFillFull on a sufficient book == plain walk (no penalty applied)', () => {
    const bids = asLevels([[100, 10]]);
    const r = closeFillFull(3, bids, 50);
    expect(r.filledQty).toBe(3);
    expect(r.avgFillPrice).toBeCloseTo(100, 10);
  });
});

describe('P19-B4b.1 depth-walk — sufficiency helpers', () => {
  it('cumulativeNotional sums valid levels only', () => {
    const lv = asLevels([[100, 2], [0, 5], [101, 0], [102, 1]]); // 200 + skip + skip + 102
    expect(cumulativeNotional(lv)).toBeCloseTo(302, 10);
  });
  it('validLevelCount counts only price>0 && qty>0 levels', () => {
    expect(validLevelCount(asLevels([[100, 2], [0, 5], [101, 0], [102, 1]]))).toBe(2);
  });
});
