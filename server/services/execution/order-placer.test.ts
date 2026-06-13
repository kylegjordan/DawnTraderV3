/**
 * P19-B3a — PaperOrderPlacer unit tests.
 *
 * Verifies the paper fill adapter is a BEHAVIOUR-IDENTICAL relocation of the
 * inline slippage+fee math previously in paper-execution-engine, and that it
 * always returns `status: 'filled'` (paper is sync/atomic/always-full). The
 * partial/delayed/rejected `FillResult` variants exist for the future live
 * adapter and are exercised here only at the type/shape level.
 */
import { describe, it, expect } from 'vitest';
import { PaperOrderPlacer } from './order-placer.js';
import type { FillResult, FilledResult } from './types.js';

const SLIP = 0.05; // 0.05% per-unit slippage (matches CANONICAL_SLIPPAGE * 100)
const FEE = 0.26; // 0.26% taker fee

function placer(feeFor: (s: string) => number = () => FEE) {
  return new PaperOrderPlacer(SLIP, feeFor);
}

function expectFilled(r: FillResult): asserts r is FilledResult {
  expect(r.status).toBe('filled');
}

describe('PaperOrderPlacer.openOrder', () => {
  it('fills a buy at intended price made WORSE (higher) by slippage, fee on filled notional', async () => {
    const r = await placer().openOrder({
      symbol: 'BTC/USD', side: 'buy', quantity: 2, intendedPrice: 100, mode: 'paper',
    });
    expectFilled(r);
    // slippagePerUnit = 100 * 0.05/100 = 0.05 → fillPrice = 100.05
    expect(r.fillPrice).toBeCloseTo(100.05, 10);
    expect(r.fillQty).toBe(2);
    // notional = 100.05 * 2 = 200.10 → fee = 200.10 * 0.26/100 = 0.52026
    expect(r.feeQuote).toBeCloseTo(0.52026, 10);
    // slippageQuote = 0.05 * 2 = 0.10
    expect(r.slippageQuote).toBeCloseTo(0.1, 10);
  });

  it('matches the legacy inline open math exactly for arbitrary inputs', async () => {
    const intendedPrice = 4321.5, quantity = 0.37;
    const r = await placer().openOrder({ symbol: 'ETH/USD', side: 'buy', quantity, intendedPrice, mode: 'paper' });
    expectFilled(r);
    const slip = intendedPrice * (SLIP / 100);
    const actualEntryPrice = intendedPrice + slip;
    const positionValue = actualEntryPrice * quantity;
    expect(r.fillPrice).toBeCloseTo(actualEntryPrice, 10);
    expect(r.feeQuote).toBeCloseTo(positionValue * (FEE / 100), 10);
    expect(r.slippageQuote).toBeCloseTo(slip * quantity, 10);
  });

  it('passes the symbol through to the per-class fee resolver', async () => {
    const seen: string[] = [];
    const r = await placer((s) => { seen.push(s); return s === 'AAPL/USD' ? 0.4 : 0.26; })
      .openOrder({ symbol: 'AAPL/USD', side: 'buy', quantity: 1, intendedPrice: 200, mode: 'paper' });
    expectFilled(r);
    expect(seen).toContain('AAPL/USD');
    // fillPrice = 200.10 → notional = 200.10 → fee = 200.10 * 0.4/100 = 0.8004
    expect(r.feeQuote).toBeCloseTo(0.8004, 10);
  });
});

describe('PaperOrderPlacer.closeOrder', () => {
  it('fills a sell at requested price made WORSE (lower) by slippage, fee on filled notional', async () => {
    const r = await placer().closeOrder({
      symbol: 'BTC/USD', side: 'sell', quantity: 2, requestedPrice: 100, mode: 'paper', positionId: 'p1',
    });
    expectFilled(r);
    // slippagePerUnit = 0.05 → fillPrice = 99.95
    expect(r.fillPrice).toBeCloseTo(99.95, 10);
    expect(r.fillQty).toBe(2);
    // notional = 99.95 * 2 = 199.90 → fee = 199.90 * 0.26/100 = 0.51974
    expect(r.feeQuote).toBeCloseTo(0.51974, 10);
    expect(r.slippageQuote).toBeCloseTo(0.1, 10);
  });

  it('matches the legacy inline close math exactly for arbitrary inputs', async () => {
    const requestedPrice = 4321.5, quantity = 0.37;
    const r = await placer().closeOrder({ symbol: 'ETH/USD', side: 'sell', quantity, requestedPrice, mode: 'paper', positionId: 'p2' });
    expectFilled(r);
    const slipPerUnit = requestedPrice * (SLIP / 100);
    const actualExitPrice = requestedPrice - slipPerUnit;
    const exitValue = actualExitPrice * quantity;
    expect(r.fillPrice).toBeCloseTo(actualExitPrice, 10);
    expect(r.feeQuote).toBeCloseTo(exitValue * (FEE / 100), 10);
    expect(r.slippageQuote).toBeCloseTo(slipPerUnit * quantity, 10);
  });
});

describe('FillResult union (live-shape, paper never produces these)', () => {
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
