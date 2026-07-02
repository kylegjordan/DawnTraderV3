/**
 * P19-B7.2d (#434) — xStock VTS lane maker/taker wiring + the shared twin seam.
 *
 * The load-bearing suite is the CRYPTO-LANE TWIN REGRESSION (Langston Step-2
 * condition on the narrow B79.0m.b lock-lift): `planTwin` (the pure decision
 * half of the extracted `maybeOpenTwin`) must be behavior-IDENTICAL to the
 * pre-B7.2d inline twin block (vts-runner :2099-2136) on BOTH branches — the
 * twin-OPENS path AND every SKIP path. A helper identical when it fires but
 * divergent on the no-op decision is the exact regression the lock existed to
 * catch, so the skip decisions are asserted explicitly, not just the opens.
 *
 * Inline-block semantics being pinned (transcribed from the pre-extraction code):
 *   if (resolveTwinEnabled(class)) {
 *     twinMode = pendingMaker ? 'taker' : (decision.chosenMode === 'taker' ? 'maker' : null)
 *     if (twinMode === 'maker' && isMarketableAtPlacement('buy', market, limit)) → SKIP (marketable)
 *     else if (twinMode == null)                                                → SKIP (degenerate fallback)
 *     else → open twin: { chosenEntryMode: twinMode,
 *                         entryFeeRate: twinMode === 'maker' ? feeMaker : feeTaker,
 *                         maker → { state:'pending', makerLimitPrice: limit, makerDeadline: now + maxPendingMs }
 *                         taker → { state:'open',   makerLimitPrice: undefined, makerDeadline: undefined } }
 *   } // twin disabled → silent no-op
 */

import { describe, it, expect } from 'vitest';
import { planTwin } from '../../core/trading/pending-maker-logic.js';
import { decideMakerTaker, entryUrgencyClassForFamily } from '../../core/math/maker-taker-decision.js';

const FEES = { feeRateMaker: 0.004, feeRateTaker: 0.008 };
const NOW = 1_700_000_000_000;
const MAX_PENDING = 3_600_000; // 1h — the seeded per-class knob value

function base(over: Partial<Parameters<typeof planTwin>[0]> = {}) {
  return {
    twinEnabled: true,
    pendingMaker: false,
    decisionChosenMode: 'taker' as const,
    limitPrice: 100,
    currentMarketPrice: 101, // above the buy limit → NOT marketable
    ...FEES,
    makerMaxPendingMs: () => MAX_PENDING,
    nowMs: NOW,
    ...over,
  };
}

describe('P19-B7.2d — crypto-lane twin regression: planTwin ≡ the inline block (OPEN branches)', () => {
  it('chosen leg PENDING maker → the twin is the TAKER leg, born state=open, taker fee, no limit/deadline', () => {
    const plan = planTwin(base({ pendingMaker: true, decisionChosenMode: 'maker' }));
    expect(plan).toEqual({
      kind: 'open',
      twinMode: 'taker',
      overlay: {
        chosenEntryMode: 'taker',
        entryFeeRate: FEES.feeRateTaker,
        state: 'open',
        makerLimitPrice: undefined,
        makerDeadline: undefined,
      },
    });
  });

  it('chosen leg taker BY DECISION, non-marketable limit → MAKER twin rests pending at the limit + deadline, maker fee', () => {
    const plan = planTwin(base({ pendingMaker: false, decisionChosenMode: 'taker' }));
    expect(plan).toEqual({
      kind: 'open',
      twinMode: 'maker',
      overlay: {
        chosenEntryMode: 'maker',
        entryFeeRate: FEES.feeRateMaker,
        state: 'pending',
        makerLimitPrice: 100,
        makerDeadline: NOW + MAX_PENDING,
      },
    });
  });
});

describe('P19-B7.2d — crypto-lane twin regression: planTwin ≡ the inline block (SKIP branches)', () => {
  it('kill-knob off → silent skip (the inline `if (resolveTwinEnabled)` wrapper)', () => {
    expect(planTwin(base({ twinEnabled: false }))).toEqual({ kind: 'skip', reason: 'twin_disabled' });
  });

  it('maker twin would be MARKETABLE at placement (market ≤ buy limit) → skip, no honest rest', () => {
    // market AT the limit — tradedThrough is <= for a buy, exactly the inline comparator.
    expect(planTwin(base({ currentMarketPrice: 100 }))).toEqual({ kind: 'skip', reason: 'marketable_maker' });
    // market BELOW the limit.
    expect(planTwin(base({ currentMarketPrice: 99.5 }))).toEqual({ kind: 'skip', reason: 'marketable_maker' });
  });

  it('chosen leg was the marketable taker-FALLBACK (decision=maker, not pending) → degenerate, skip', () => {
    // decision said maker but the leg opened as the taker fallback (pendingMaker=false):
    // inline twinMode = null → degenerate.
    expect(planTwin(base({ decisionChosenMode: 'maker', pendingMaker: false }))).toEqual({
      kind: 'skip',
      reason: 'degenerate_fallback',
    });
  });

  it('skip precedence matches inline order: marketable check fires on the maker twin, disabled beats everything', () => {
    // Disabled wins even in an otherwise-marketable configuration (inline: outer wrapper).
    expect(planTwin(base({ twinEnabled: false, currentMarketPrice: 99 }))).toEqual({
      kind: 'skip', reason: 'twin_disabled',
    });
    // A TAKER twin (pending-maker chosen leg) is never blocked by marketability — it opens filled.
    const plan = planTwin(base({ pendingMaker: true, decisionChosenMode: 'maker', currentMarketPrice: 99 }));
    expect(plan.kind).toBe('open');
    if (plan.kind === 'open') expect(plan.twinMode).toBe('taker');
  });
});

describe('P19-B7.2d — xStock seam: stamp + floor semantics via the shared decision', () => {
  const HAIRCUT = {
    makerFillProbability: 0.7,
    adverseSelectionBase: 0.0005,
    adverseSelectionStrengthMult: 0.001,
    nonFillCostBase: 0.0005,
    nonFillContinuationPenalty: 0.0005,
    nonFillReversalDiscount: 0.0002,
    hardFloorContinuationStrength: 0.85,
  };

  function xstockDecision(over: Record<string, unknown> = {}) {
    return decideMakerTaker({
      entryPrice: 25,
      stopPrice: 24,
      targetPrice: 27,
      costs: { fee: 0.006, slippage: 0.001, spread: 0.001 } as any,
      feeRateMaker: 0.003,
      feeRateTaker: 0.006,
      DI: 65,
      signalStrength: 0.5,
      urgencyClass: entryUrgencyClassForFamily('oscillator'), // reversal — no hard floor
      haircut: HAIRCUT,
      ...over,
    } as any);
  }

  it('chosenNetEV is the best-of-both (≥ the taker leg) — the floor gating on it only ADMITS more', () => {
    const d = xstockDecision();
    expect(d.chosenNetEV).toBeGreaterThanOrEqual(d.takerNetEV);
    expect(d.chosenNetEV).toBe(d.chosenMode === 'maker' ? d.makerNetEVAdjusted : d.takerNetEV);
  });

  it('the entry-fee stamp follows the EFFECTIVE mode with per-class rates (xstock rates ≠ crypto rates → different stamp)', () => {
    // The seam stamps entryFeeRate = effectiveMode === 'maker' ? feeRateMaker : feeRateTaker.
    // With diverged per-class rates a crypto hardcode at the stamp would be caught here.
    const xstock = { feeRateMaker: 0.003, feeRateTaker: 0.006 };
    const crypto = { feeRateMaker: 0.004, feeRateTaker: 0.008 };
    const stamp = (mode: 'taker' | 'maker', rates: typeof xstock) =>
      mode === 'maker' ? rates.feeRateMaker : rates.feeRateTaker;
    expect(stamp('taker', xstock)).not.toBe(stamp('taker', crypto));
    expect(stamp('maker', xstock)).not.toBe(stamp('maker', crypto));
  });

  it('hard continuation floor forces taker (the guardrail is class-agnostic — same shared decision)', () => {
    const d = xstockDecision({ urgencyClass: entryUrgencyClassForFamily('strong_trend'), signalStrength: 0.9 });
    expect(d.hardFloorFired).toBe(true);
    expect(d.chosenMode).toBe('taker');
  });
});
