// P19-B8.6 — maker TARGET-exit semantics: the B7.2c pure pending logic reused with the
// side flipped. These pin the SELL-side behavior the exit rest depends on (the engine
// seam consumes evaluatePendingMaker verbatim), plus the fill=limit rule extended to
// exits (the OBJ-7 inert-tier guard: an accidental haircut wiring fails HERE, not in
// production fill data).
import { describe, it, expect } from 'vitest';
import { evaluatePendingMaker, tradedThrough, makerFillPrice } from '../../core/trading/pending-maker-logic';

describe('[P19-B8.6] exit rest — sell-side honest trade-through', () => {
  it('a resting SELL fills iff the venue price is AT/THROUGH the limit (price >= limit)', () => {
    expect(tradedThrough('sell', 101, 100)).toBe(true);
    expect(tradedThrough('sell', 100, 100)).toBe(true);
    expect(tradedThrough('sell', 99.999, 100)).toBe(false);
  });

  it('one tick, one outcome: fill / rest / drop — FILL WINS over the deadline (R2)', () => {
    const base = { side: 'sell' as const, limit: 100, nowMs: 1_000_000 };
    expect(evaluatePendingMaker({ ...base, currentPrice: 101, deadlineMs: 999_999 })).toBe('fill'); // both → FILL WINS
    expect(evaluatePendingMaker({ ...base, currentPrice: 99, deadlineMs: 2_000_000 })).toBe('rest');
    expect(evaluatePendingMaker({ ...base, currentPrice: 99, deadlineMs: 999_999 })).toBe('drop'); // the CONVERT trigger
  });

  it('a null/unavailable venue price can NEVER fill (venue-only discipline) but can still deadline-convert', () => {
    expect(evaluatePendingMaker({ side: 'sell', currentPrice: null, limit: 100, nowMs: 1_000_000, deadlineMs: 2_000_000 })).toBe('rest');
    expect(evaluatePendingMaker({ side: 'sell', currentPrice: null, limit: 100, nowMs: 1_000_000, deadlineMs: 999_999 })).toBe('drop');
  });

  it('the exit fill is at the LIMIT exactly — the inert-tier guard extends to exits (OBJ-7)', () => {
    // If a future change wires a haircut into makerFillPrice, exits inherit the same
    // CI trip as entries: fill !== limit fails here before it pollutes fill data.
    expect(makerFillPrice(100)).toBe(100);
    expect(makerFillPrice(0.16736)).toBe(0.16736);
  });

  it('D1 semantics documented: the placement tick is the TOUCH tick — the same price that fired target_hit satisfies the comparator, which is exactly why the engine must not evaluate the rest on the placement tick (same-tick place-and-fill would be an optimistic touch-fill)', () => {
    // The comparator itself cannot distinguish "touch" from "continuation" — the
    // engine enforces D1 by placing on one tick (continue) and evaluating from the
    // NEXT. This test pins the premise: the touch price DOES satisfy the comparator,
    // so an engine that evaluated on the placement tick would always insta-fill.
    expect(tradedThrough('sell', 100, 100)).toBe(true);
  });
});
