// P19-B8.2 — the friction-divergence estimator (pure module) + the re-anchor
// trigger. DB-free coverage of the load-bearing math: sqrt-impact monotonicity
// in Q, liquidity separation (thin book costs more), the divergence's
// spread-cancellation property, trigger bound edges, and the cooldown
// suppression (Langston Step-1 hysteresis condition). Knob VALUES are seeded
// placeholders (Phase-25 calibrates); the MATH is proven here.
import { describe, it, expect } from 'vitest';
import {
  estimateCostBps,
  computeDivergence,
  evaluateReanchorTrigger,
} from '../../core/math/friction-divergence';

const BASE = { spreadHalfBps: 2, sigmaBps: 80, k: 1, liquidityNotionalUsd: 1_000_000 };

describe('estimateCostBps — sqrt impact law', () => {
  it('is monotonically increasing in order size', () => {
    const c1 = estimateCostBps({ ...BASE, orderNotionalUsd: 100 });
    const c2 = estimateCostBps({ ...BASE, orderNotionalUsd: 10_000 });
    const c3 = estimateCostBps({ ...BASE, orderNotionalUsd: 1_000_000 });
    expect(c2).toBeGreaterThan(c1);
    expect(c3).toBeGreaterThan(c2);
  });

  it('costs more on a thinner book (liquidity separation)', () => {
    const thick = estimateCostBps({ ...BASE, orderNotionalUsd: 10_000, liquidityNotionalUsd: 10_000_000 });
    const thin = estimateCostBps({ ...BASE, orderNotionalUsd: 10_000, liquidityNotionalUsd: 100_000 });
    expect(thin).toBeGreaterThan(thick);
  });

  it('resolves to bps: k=1, sigma=100bps, Q=L gives spread_half + 100', () => {
    const c = estimateCostBps({ spreadHalfBps: 3, sigmaBps: 100, k: 1, orderNotionalUsd: 5000, liquidityNotionalUsd: 5000 });
    expect(c).toBeCloseTo(103, 6);
  });

  it('throws on non-positive liquidity and non-finite inputs (fail-hard, no silent zero)', () => {
    expect(() => estimateCostBps({ ...BASE, orderNotionalUsd: 100, liquidityNotionalUsd: 0 })).toThrow();
    expect(() => estimateCostBps({ ...BASE, orderNotionalUsd: NaN })).toThrow();
    expect(() => estimateCostBps({ ...BASE, sigmaBps: Infinity, orderNotionalUsd: 100 })).toThrow();
  });
});

describe('computeDivergence — paper vs live cost delta', () => {
  it('positive when the paper order is larger (paper trades cost more)', () => {
    const r = computeDivergence({
      paperOrderNotionalUsd: 40_000,
      liveOrderNotionalUsd: 400,
      spreadHalfBps: 2,
      sigmaBps: 80,
      k: 1,
      liquidityNotionalUsd: 1_000_000,
    });
    expect(r.divergenceBps).toBeGreaterThan(0);
    expect(r.paperCostBps).toBeGreaterThan(r.liveCostBps);
  });

  it('zero when the balances (and thus orders) are identical', () => {
    const r = computeDivergence({
      paperOrderNotionalUsd: 1234,
      liveOrderNotionalUsd: 1234,
      spreadHalfBps: 2,
      sigmaBps: 80,
      k: 1,
      liquidityNotionalUsd: 1_000_000,
    });
    expect(r.divergenceBps).toBeCloseTo(0, 10);
  });

  it('the spread term cancels — divergence is invariant to spreadHalfBps', () => {
    const mk = (spreadHalfBps: number) =>
      computeDivergence({
        paperOrderNotionalUsd: 50_000,
        liveOrderNotionalUsd: 500,
        spreadHalfBps,
        sigmaBps: 80,
        k: 1,
        liquidityNotionalUsd: 1_000_000,
      }).divergenceBps;
    expect(mk(0)).toBeCloseTo(mk(25), 10);
  });
});

describe('evaluateReanchorTrigger — bounds + cooldown', () => {
  const KNOBS = { maxDivergenceBps: 25, minNotionalDeltaMax: 3, minReanchorIntervalMs: 86_400_000 };

  it('does not trigger inside both bounds', () => {
    const r = evaluateReanchorTrigger({ ...KNOBS, divergenceBps: 10, minNotionalDelta: 1, msSinceLastAnchor: Infinity });
    expect(r.triggered).toBe(false);
    expect(r.breach).toBeNull();
  });

  it('triggers on a divergence breach outside the cooldown', () => {
    const r = evaluateReanchorTrigger({ ...KNOBS, divergenceBps: 26, minNotionalDelta: 0, msSinceLastAnchor: Infinity });
    expect(r.triggered).toBe(true);
    expect(r.breach).toBe('divergence_bps');
  });

  it('triggers on the discrete min-notional leg alone', () => {
    const r = evaluateReanchorTrigger({ ...KNOBS, divergenceBps: 0, minNotionalDelta: 4, msSinceLastAnchor: Infinity });
    expect(r.triggered).toBe(true);
    expect(r.breach).toBe('min_notional_delta');
  });

  it('a breach INSIDE the cooldown is suppressed, never fired (hysteresis)', () => {
    const r = evaluateReanchorTrigger({ ...KNOBS, divergenceBps: 100, minNotionalDelta: 9, msSinceLastAnchor: 3_600_000 });
    expect(r.triggered).toBe(false);
    expect(r.breach).toBe('both');
    expect(r.suppressedByCooldown).toBe(true);
  });

  it('the boundary itself does not fire (strict inequality — hover cannot storm)', () => {
    const r = evaluateReanchorTrigger({ ...KNOBS, divergenceBps: 25, minNotionalDelta: 3, msSinceLastAnchor: Infinity });
    expect(r.triggered).toBe(false);
  });

  it('negative divergence (paper CHEAPER than live) breaches on magnitude', () => {
    const r = evaluateReanchorTrigger({ ...KNOBS, divergenceBps: -30, minNotionalDelta: 0, msSinceLastAnchor: Infinity });
    expect(r.triggered).toBe(true);
  });
});
