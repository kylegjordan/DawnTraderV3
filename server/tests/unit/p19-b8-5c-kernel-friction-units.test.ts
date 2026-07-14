// P19-B8.5c (#503) — kernel-friction UNITS at the single surviving computation site.
// The bug this batch killed: the deleted standalone calls passed a round-trip FRACTION
// (~0.018) as `totalFriction` where the kernel contract requires PRICE-UNIT dollars,
// mis-scaling friction by ~entryPrice× with the DIRECTION FLIPPING AT $1 (sub-$1
// symbols over-penalized, >$1 under-penalized). Langston Step-2 condition: pin BOTH
// price regimes — a single high-priced fixture proves units trivially and never
// exercises the sub-dollar case that raised crypto admits.
import { describe, it, expect } from 'vitest';
import { decideMakerTaker } from '../../core/math/maker-taker-decision.js';
import { computeTotalRoundTripCost } from '../../core/math/cost-model.js';

const HAIRCUT = {
  adverseSelectionBase: 0.0015,
  adverseSelectionStrengthMult: 0.0035,
  nonFillCostBase: 0.001,
  nonFillContinuationPenalty: 0.003,
  nonFillReversalDiscount: 0.0008,
  makerFillProbability: 0.5,
  hardFloorContinuationStrength: 0.7,
} as any;

// 5%-of-price geometry both regimes; fee/slip/spread as FRACTIONS (the cost-model shape).
const COSTS = { fee: 0.008, slippage: 0.001, spread: 0.0015 };
const FRICTION_FRACTION = computeTotalRoundTripCost(COSTS.fee, COSTS.slippage, COSTS.spread); // 0.0195

function takerLegAt(entryPrice: number) {
  return decideMakerTaker({
    entryPrice,
    stopPrice: entryPrice * 0.95,
    targetPrice: entryPrice * 1.05,
    costs: COSTS,
    feeRateMaker: 0.004,
    feeRateTaker: 0.008,
    DI: 50, // neutral → pWin = 0.40 + 50/200 = 0.65 with default diPWinFactor... pinned via kernel output below
    minPWin: 0.05,
    maxPWin: 0.95,
    diPWinFactor: 0.005,
    signalStrength: 0.3,
    urgencyClass: 'reversal' as const,
    haircut: HAIRCUT,
  });
}

describe('[P19-B8.5c] kernel friction units at the single computation site', () => {
  it('>$1 regime ($900): friction lands as fraction × entryPrice (dollars), not the bare fraction', () => {
    const d = takerLegAt(900);
    expect(d.taker.totalCost).toBeCloseTo(FRICTION_FRACTION * 900, 8); // ≈ $17.55 — the bug booked ~2¢
    // netEV identity: rawEV − friction, in dollars.
    expect(d.taker.netEV).toBeCloseTo(d.taker.rawEV - FRICTION_FRACTION * 900, 8);
  });

  it('<$1 regime ($0.50): friction lands as fraction × entryPrice — SMALLER than the bare fraction (the old over-penalty)', () => {
    const d = takerLegAt(0.5);
    expect(d.taker.totalCost).toBeCloseTo(FRICTION_FRACTION * 0.5, 10); // ≈ $0.00975 — the bug booked 0.0195 (2× over)
    expect(d.taker.totalCost).toBeLessThan(FRICTION_FRACTION);
    expect(d.taker.netEV).toBeCloseTo(d.taker.rawEV - FRICTION_FRACTION * 0.5, 10);
  });

  it('scale coherence: netEV-per-dollar-of-price is IDENTICAL across regimes (same geometry, same rates)', () => {
    const hi = takerLegAt(900);
    const lo = takerLegAt(0.5);
    expect(hi.taker.netEV / 900).toBeCloseTo(lo.taker.netEV / 0.5, 10);
    // The bugged form violated this by construction: netEV/price differed because the
    // constant-fraction friction wasn't scaled — this assertion is the regression fence.
  });

  it('chosen ≥ taker always (the impossibility observed in the wild — chosen −7.41 vs taker +0.97 — cannot recur from one site)', () => {
    for (const p of [0.5, 900]) {
      const d = takerLegAt(p);
      expect(d.chosenNetEV).toBeGreaterThanOrEqual(d.taker.netEV - 1e-12);
    }
  });
});
