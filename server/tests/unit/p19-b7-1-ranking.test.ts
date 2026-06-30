// P19-B7.1 — the ranking fix (R-multiple ranker). DB-free unit coverage of the load-bearing
// correctness: the R-multiple identity + dimensional/cross-asset property (OBJ-2), the degenerate-
// geometry floor math (OBJ-3), the selection-IC harness (OBJ-4), and the no-double-EV-sample
// structural guarantee (OBJ-2 Step-4 anchor). Runtime ranker-selection / reject / sizing-bind paths
// are exercised on staging once paper-active (they read warmed module_constants); the math + the
// structural sample-isolation are proven here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeNetExpectancyKernel } from '../../core/calculations/net-expectancy-kernel';
import { computeRankRiskFloor, RANKER_STRATEGIES } from '../../core/rtb/ready_to_buy_service';
import { spearmanRho, computeSelectionIC, type SelectionICCycle } from '../../core/metrics/selection-ic';

describe('P19-B7.1 OBJ-2 — the R-multiple is the kernel netEV ÷ risk_price (price-delta, dimensionless)', () => {
  const base = { totalFriction: 0, DI: 60, volNoise: 0.3 };

  it('netRewardToRisk === netEV / distStop (the identity we surface, not a re-derivation)', () => {
    const r = computeNetExpectancyKernel({ entryPrice: 100, stopPrice: 98, targetPrice: 106, ...base });
    expect(r.distStop).toBeCloseTo(2, 9);
    expect(r.netRewardToRisk).toBeCloseTo(r.netEV / r.distStop, 9);
  });

  it('is dimensionless / cross-asset comparable — same geometry RATIO on a $0.50 token and a $200 xStock → same R', () => {
    // identical reward:risk multiples, friction-free, same pWin inputs → the R-multiple must match
    // regardless of absolute price level (that is the whole cross-asset point).
    const lo = computeNetExpectancyKernel({ entryPrice: 0.50, stopPrice: 0.49, targetPrice: 0.53, ...base }); // risk 0.02, reward 0.06 (×3)
    const hi = computeNetExpectancyKernel({ entryPrice: 200, stopPrice: 196, targetPrice: 212, ...base });     // risk 0.02, reward 0.06 (×3)
    expect(lo.netRewardToRisk).toBeCloseTo(hi.netRewardToRisk, 6);
  });

  it('negative net-EV → negative R (losers sort to the bottom; no abs/clamp collapses the sign)', () => {
    // tiny target, heavy friction → net-negative EV.
    const r = computeNetExpectancyKernel({ entryPrice: 100, stopPrice: 95, targetPrice: 100.5, totalFriction: 2, DI: 50, volNoise: 0.3 });
    expect(r.netEV).toBeLessThan(0);
    expect(r.netRewardToRisk).toBeLessThan(0);
  });

  it('distStop === 0 → R = 0 (the built-in ∞-guard; gate-reject is primary upstream)', () => {
    const r = computeNetExpectancyKernel({ entryPrice: 100, stopPrice: 100, targetPrice: 106, ...base });
    expect(r.distStop).toBe(0);
    expect(r.netRewardToRisk).toBe(0);
  });
});

describe('P19-B7.1 OBJ-4 — pWinFloored is read from the kernel OUTPUT, complete across ALL floor paths (CHANGE-2)', () => {
  // The wrapper flags floored = (pWin <= minPWin). These assert the kernel floors pWin in the cases
  // the OLD derivation (strong-trend && null-dbs) MISSED — proving the output-read is the complete fix.
  const F = 0.40; // DEFAULT_MIN_PWIN
  const g = { entryPrice: 100, stopPrice: 98, targetPrice: 106, totalFriction: 0 };

  it('DI-branch DI<=0 floors pWin (the case the strong-trend-only derivation missed)', () => {
    const r = computeNetExpectancyKernel({ ...g, DI: 0 });   // non-strong-trend, DI=0 → pWin at floor
    expect(r.pWin).toBeLessThanOrEqual(F + 1e-9);            // → flagged floored (correct)
  });
  it('strong-trend with NULL dbs floors pWin', () => {
    const r = computeNetExpectancyKernel({ ...g, sourcePool: 'quant-strong_trend' }); // dbs undefined → absDbs 0 → floor
    expect(r.pWin).toBeLessThanOrEqual(F + 1e-9);
  });
  it('a healthy DI does NOT floor pWin (flagged not-floored)', () => {
    const r = computeNetExpectancyKernel({ ...g, DI: 80 });
    expect(r.pWin).toBeGreaterThan(F + 1e-9);
  });
});

describe('P19-B7.1 OBJ-3 — degenerate-geometry microstructure floor (capital-independent)', () => {
  const minAtrFrac = 0.10, minAbsFrac = 0.0005;

  it('ATR-fraction is PRIMARY when ATR is available', () => {
    // entry 100, ATR 4 → atrFloor = 0.4; absFloor = 0.05 → floor = 0.4
    expect(computeRankRiskFloor(100, 4, minAtrFrac, minAbsFrac)).toBeCloseTo(0.4, 9);
  });

  it('falls back to the absolute entry-fraction floor when ATR is unavailable', () => {
    expect(computeRankRiskFloor(100, null, minAtrFrac, minAbsFrac)).toBeCloseTo(0.05, 9);
    expect(computeRankRiskFloor(100, 0, minAtrFrac, minAbsFrac)).toBeCloseTo(0.05, 9);
  });

  it('a near-zero stop falls below the floor (→ rejected); a normal stop clears it', () => {
    const floor = computeRankRiskFloor(100, 4, minAtrFrac, minAbsFrac); // 0.4
    expect(Math.abs(100 - 99.99)).toBeLessThan(floor);  // 0.01 stop → reject
    expect(Math.abs(100 - 98)).toBeGreaterThan(floor);  // 2.0 stop  → keep
  });
});

describe('P19-B7.1 OBJ-4 — Spearman selection-IC', () => {
  it('perfect rank agreement → +1, perfect inversion → −1', () => {
    expect(spearmanRho([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 9);
    expect(spearmanRho([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 9);
  });
  it('zero variance on a side → null (undefined, NOT 0)', () => {
    expect(spearmanRho([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(spearmanRho([5], [5])).toBeNull(); // n<2
  });
  it('handles ties via fractional ranks', () => {
    expect(spearmanRho([1, 2, 2, 3], [1, 2, 2, 3])).toBeCloseTo(1, 9);
  });
});

describe('P19-B7.1 OBJ-4 — computeSelectionIC (per-cycle, min-N gate, per-regime, clustered SE)', () => {
  const mk = (cycleKey: string, regime: string, windowKey: string, predicted: number[], realized: number[]): SelectionICCycle =>
    ({ cycleKey, regime, windowKey, predicted, realized });

  it('drops cycles below min-N and flags zero-variance cycles as degenerate', () => {
    const cycles = [
      mk('c1', 'TFS', 'd1', [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),   // kept, IC=+1
      mk('c2', 'TFS', 'd1', [1, 2], [2, 1]),                      // below minN(5) → dropped
      mk('c3', 'TFS', 'd2', [1, 1, 1, 1, 1], [1, 2, 3, 4, 5]),    // zero variance → degenerate
    ];
    const r = computeSelectionIC(cycles, { minN: 5 });
    expect(r.belowMinN).toBe(1);
    expect(r.degenerate).toBe(1);
    expect(r.nCycles).toBe(1);
    expect(r.meanIC).toBeCloseTo(1, 9);
  });

  it('reports a per-regime breakdown (Simpson-paradox guard) and a clustered SE across windows', () => {
    const cycles = [
      mk('a', 'TFS', 'd1', [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),   // +1
      mk('b', 'TFS', 'd2', [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]),   // +1
      mk('c', 'HVU', 'd1', [1, 2, 3, 4, 5], [5, 4, 3, 2, 1]),   // −1
      mk('d', 'HVU', 'd2', [1, 2, 3, 4, 5], [5, 4, 3, 2, 1]),   // −1
    ];
    const r = computeSelectionIC(cycles, { minN: 5 });
    expect(r.perRegime['TFS'].meanIC).toBeCloseTo(1, 9);
    expect(r.perRegime['HVU'].meanIC).toBeCloseTo(-1, 9);
    expect(r.meanIC).toBeCloseTo(0, 9); // aggregate hides the split — the per-regime view is the truth
    expect(r.nClusters).toBe(2);        // two window buckets
    expect(r.clusteredSE).not.toBeNull();
  });

  it('CHANGE-3: the point estimate is PERIOD-weighted (mean of per-cycle ICs), not cluster-weighted', () => {
    // window d1 holds TWO cycles (IC +1, +1); window d2 holds ONE (IC −1).
    // period-equal mean = (1 + 1 − 1)/3 = +0.3333 ; cluster-weighted would be (mean(1,1) + (−1))/2 = 0.
    const perfect = [1, 2, 3, 4, 5], inverse = [5, 4, 3, 2, 1], asc = [1, 2, 3, 4, 5];
    const cycles = [
      mk('a', 'TFS', 'd1', asc, perfect),  // +1
      mk('b', 'TFS', 'd1', asc, perfect),  // +1  (same window d1)
      mk('c', 'TFS', 'd2', asc, inverse),  // −1  (window d2)
    ];
    const r = computeSelectionIC(cycles, { minN: 5 });
    expect(r.nCycles).toBe(3);
    expect(r.nClusters).toBe(2);
    expect(r.meanIC).toBeCloseTo(1 / 3, 9); // period-equal, NOT 0 (which cluster-weighting would give)
  });
});

describe('P19-B7.1 OBJ-2 — no-double-EV-sample (structural guarantee, source-level)', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('the expectancy wrapper does NOT record an EV-input sample (the sample is open-path only)', () => {
    const wrapper = read('server/core/calculations/expectancy.ts');
    expect(wrapper).not.toMatch(/recordEvInputSample/);
  });

  it('the open path is the SOLE recorder of EV-input samples', () => {
    const openPath = read('server/services/paper-execution-engine.ts');
    expect(openPath).toMatch(/recordEvInputSample/);
  });

  it('the rank-time helper reuses evaluateTradeExpectancy with quiet=true (no pool-spam, no sample)', () => {
    const rtb = read('server/core/rtb/ready_to_buy_service.ts');
    // signalRMultiple calls evaluateTradeExpectancy with the quiet flag.
    expect(rtb).toMatch(/evaluateTradeExpectancy\([\s\S]*?\/\* quiet \*\/ true\)/);
  });
});

describe('P19-B7.1 OBJ-1 — the ranker strategy set', () => {
  it('exposes r_multiple (default) + the two control arms, no others', () => {
    expect(RANKER_STRATEGIES).toEqual(['r_multiple', 'confidence', 'ranking_score']);
  });
});
