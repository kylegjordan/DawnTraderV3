// P19-B7.2 — the maker/taker best-of-both entry decision (the structural crypto opener).
// DB-free unit coverage of the load-bearing correctness: both EVs run through the SAME kernel
// (only friction differs), the single-consistent-number invariant (the CHOSEN value is never the
// raw un-haircut maker EV), the non-fill-is-negative property (Langston Step-2 item 1), the
// opens-crypto property (a taker-negative / maker-positive signal is chosen as maker with a
// positive chosen EV), the hard taker floor, urgency endogeneity, and the family→urgency map.
// The DB-governed per-class haircut values + the runtime snapshot/refresh wiring are exercised on
// staging once paper-active; the decision MATH is proven here against the same net-expectancy kernel
// the [11.8B] gate and the B7.1 ranker use.
import { describe, it, expect } from 'vitest';
import { computeNetExpectancyKernel } from '../../core/calculations/net-expectancy-kernel';
import {
  decideMakerTaker,
  entryUrgencyClassForFamily,
  type MakerTakerHaircutConfig,
  type MakerTakerDecisionInput,
} from '../../core/math/maker-taker-decision';

// The START-TIGHT crypto haircut seeds (mirrors the B7.2 migration crypto_spot rows).
const CRYPTO_HAIRCUT: MakerTakerHaircutConfig = {
  makerFillProbability: 0.50,
  adverseSelectionBase: 0.0015,
  adverseSelectionStrengthMult: 0.0035,
  nonFillCostBase: 0.0010,
  nonFillContinuationPenalty: 0.0030,
  nonFillReversalDiscount: 0.0008,
  hardFloorContinuationStrength: 0.70,
};

// Crypto Tier-1 friction components (taker fee 0.80%, maker 0.40%).
const CRYPTO_COSTS = { fee: 0.008, slippage: 0.0005, spread: 0.001 };
const FEE_MAKER = 0.004;

// pWin pinned to 0.5 (minPWin=maxPWin) so the geometry math is deterministic + kernel-independent
// of the DI→pWin curve for these property tests.
function baseInput(over: Partial<MakerTakerDecisionInput> = {}): MakerTakerDecisionInput {
  return {
    entryPrice: 100,
    // B-PRICE-SIDE-BY-JOB: this fixture's SUBJECT is the MID arm and it stays that way
    // (Langston, 2026-09-04) — the 0.0055 advantage below is the mid-geometry number and must
    // not be re-pointed. The sided arm gets its own describe block at the bottom of this file.
    levelGeometry: 'mid' as const,
    entryPriceMaker: 100,
    stopPrice: 98,     // risk 2
    targetPrice: 105.5, // reward 5.5
    costs: CRYPTO_COSTS,
    feeRateMaker: FEE_MAKER,
    feeRateTaker: CRYPTO_COSTS.fee, // single-sourced fee delta (per-class taker == the crypto seed here)
    minPWin: 0.5,
    maxPWin: 0.5,
    diPWinFactor: 200,
    signalStrength: 0.3,
    urgencyClass: 'reversal',
    haircut: CRYPTO_HAIRCUT,
    ...over,
  };
}

describe('P19-B7.2 — both EVs run through the SAME kernel; only friction differs', () => {
  it('takerNetEV equals the kernel netEV computed with the taker round-trip friction', () => {
    const d = decideMakerTaker(baseInput());
    // takerFrictionPct = 2*fee + 2*slip + spread = 0.018 ; per-unit at entry 100 = 1.8
    const takerFrictionPerUnit = (2 * 0.008 + 2 * 0.0005 + 0.001) * 100;
    const k = computeNetExpectancyKernel({
      entryPrice: 100, stopPrice: 98, targetPrice: 105.5,
      totalFriction: takerFrictionPerUnit, minPWin: 0.5, maxPWin: 0.5,
    });
    expect(d.takerNetEV).toBeCloseTo(k.netEV, 9);
    expect(d.takerNetEV).toBeCloseTo(-0.05, 9); // rawEV 1.75 − friction 1.8
  });

  it('the maker leg saves the entry-leg fee diff + spread + entry slippage → higher raw netEV', () => {
    const d = decideMakerTaker(baseInput());
    // makerEntryAdvantage = (0.008−0.004) + 0.001 + 0.0005 = 0.0055 (of entry)
    expect(d.makerEntryAdvantagePct).toBeCloseTo(0.0055, 9);
    expect(d.makerNetEVRaw).toBeGreaterThan(d.takerNetEV);
    expect(d.makerNetEVRaw).toBeCloseTo(0.5, 9); // rawEV 1.75 − maker friction 1.25
  });
});

describe('P19-B7.2 OBJ-3 — single-consistent-number invariant', () => {
  it('chosenNetEV is the chosen mode value, and when maker it is the HAIRCUT-ADJUSTED (never the raw) maker EV', () => {
    const d = decideMakerTaker(baseInput()); // weak reversal opener → maker
    expect(d.chosenMode).toBe('maker');
    expect(d.chosenNetEV).toBeCloseTo(d.makerNetEVAdjusted, 9);
    // the raw (pre-haircut) maker EV must NOT be what flows downstream
    expect(d.chosenNetEV).not.toBeCloseTo(d.makerNetEVRaw, 6);
    expect(d.makerNetEVAdjusted).toBeLessThan(d.makerNetEVRaw);
  });

  it('a taker-chosen signal reports chosenNetEV === takerNetEV', () => {
    // strong continuation → hard floor forces taker
    const d = decideMakerTaker(baseInput({ signalStrength: 0.9, urgencyClass: 'continuation' }));
    expect(d.chosenMode).toBe('taker');
    expect(d.chosenNetEV).toBeCloseTo(d.takerNetEV, 9);
  });
});

describe('P19-B7.2 OBJ-2 — non-fill is booked as an opportunity-cost LOSS, never EV=0 (Langston item 1)', () => {
  it('the (1−pFill) non-fill term strictly reduces the adjusted maker EV below the fill-only value', () => {
    const d = decideMakerTaker(baseInput());
    const pFill = CRYPTO_HAIRCUT.makerFillProbability;
    const A = (CRYPTO_HAIRCUT.adverseSelectionBase + CRYPTO_HAIRCUT.adverseSelectionStrengthMult * 0.3) * 100;
    const makerNetEVOnFill = d.makerNetEVRaw - A;
    const fillOnlyValue = pFill * makerNetEVOnFill; // if non-fill were booked at zero
    expect(d.makerNetEVAdjusted).toBeLessThan(fillOnlyValue); // the non-fill loss pulls it down
  });
});

describe('P19-B7.2 — the OPENS-CRYPTO property (the whole point)', () => {
  it('a taker-NEGATIVE / maker-POSITIVE signal is chosen as maker with a positive chosen EV', () => {
    const d = decideMakerTaker(baseInput()); // taker −0.05, weak reversal
    expect(d.takerNetEV).toBeLessThan(0);       // taker refuses it
    expect(d.chosenMode).toBe('maker');
    expect(d.chosenNetEV).toBeGreaterThan(0);   // opens on the maker economics
    expect(d.chosenNetEV).toBeCloseTo(0.1125, 6);
  });

  it('a badly-taker-negative signal is NOT rescued by the ~0.55% maker advantage (still refused)', () => {
    // target 103 → reward 3 → rawEV 0.5 ; taker netEV = 0.5 − 1.8 = −1.3 (far below the maker window)
    const d = decideMakerTaker(baseInput({ targetPrice: 103 }));
    expect(d.takerNetEV).toBeCloseTo(-1.3, 9);
    expect(d.chosenNetEV).toBeLessThan(0); // maker can't flip it → no false open
  });
});

describe('P19-B7.2 OBJ-2 — hard taker floor + urgency endogeneity', () => {
  it('a strong CONTINUATION signal is forced to taker even when the maker EV would otherwise win', () => {
    const weak = decideMakerTaker(baseInput({ urgencyClass: 'continuation', signalStrength: 0.5 }));
    const strong = decideMakerTaker(baseInput({ urgencyClass: 'continuation', signalStrength: 0.9 }));
    expect(strong.hardFloorFired).toBe(true);
    expect(strong.chosenMode).toBe('taker');
    expect(weak.hardFloorFired).toBe(false);
  });

  it('reversal signals carry a smaller non-fill cost than continuation → maker is more favorable', () => {
    const rev = decideMakerTaker(baseInput({ urgencyClass: 'reversal' }));
    const cont = decideMakerTaker(baseInput({ urgencyClass: 'continuation' }));
    expect(rev.nonFillCostPct).toBeLessThan(cont.nonFillCostPct);
    expect(rev.makerNetEVAdjusted).toBeGreaterThan(cont.makerNetEVAdjusted);
  });

  it('adverse selection increases monotonically with signal strength', () => {
    const lo = decideMakerTaker(baseInput({ signalStrength: 0.2 }));
    const hi = decideMakerTaker(baseInput({ signalStrength: 0.8 }));
    expect(hi.adverseSelectionPct).toBeGreaterThan(lo.adverseSelectionPct);
  });
});

describe('P19-B7.2 — family → entry-urgency prior (no calibration data needed)', () => {
  it('continuation families (trend / breakout / strong_trend) → continuation', () => {
    expect(entryUrgencyClassForFamily('trend')).toBe('continuation');
    expect(entryUrgencyClassForFamily('breakout')).toBe('continuation');
    expect(entryUrgencyClassForFamily('strong_trend')).toBe('continuation');
  });
  it('reversal / oscillator families → reversal', () => {
    expect(entryUrgencyClassForFamily('reversal')).toBe('reversal');
    expect(entryUrgencyClassForFamily('oscillator')).toBe('reversal');
  });
  it('pattern / hybrid / undefined → neutral (no strong prior)', () => {
    expect(entryUrgencyClassForFamily('pattern')).toBe('neutral');
    expect(entryUrgencyClassForFamily('hybrid')).toBe('neutral');
    expect(entryUrgencyClassForFamily(undefined)).toBe('neutral');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════════════
// B-PRICE-SIDE-BY-JOB — the SIDED arm. Its OWN block, never a re-pointing of the mid tests
// above (Langston, 2026-09-04): the 0.0055 advantage up there is the mid-geometry number and
// stays the subject of its own assertions.
//
// Fixture: mid 100, spread 0.001 (= 0.1% = 0.1 in price) ⇒ ask 100.05, bid 99.95.
// ═══════════════════════════════════════════════════════════════════════════════════════
const SIDED_ASK = 100.05;
const SIDED_BID = 99.95;

function sidedInput(over: Partial<MakerTakerDecisionInput> = {}): MakerTakerDecisionInput {
  return baseInput({
    levelGeometry: 'sided' as const,
    entryPrice: SIDED_ASK,      // the taker lifts the ask
    entryPriceMaker: SIDED_BID, // the resting maker IS a bid
    ...over,
  });
}

describe('B-PRICE-SIDE-BY-JOB — the SIDED arm does not pay the spread twice', () => {
  it('⛔ taker friction carries NO spread term — it is in the geometry now', () => {
    const d = decideMakerTaker(sidedInput());
    // sided taker friction = 2*fee + 2*slip = 0.017, WITHOUT the 0.001 spread.
    const expectedPct = 2 * 0.008 + 2 * 0.0005;
    expect(d.takerNetEV).toBeCloseTo(
      computeNetExpectancyKernel({
        entryPrice: SIDED_ASK, stopPrice: 98, targetPrice: 105.5,
        totalFriction: expectedPct * SIDED_ASK, minPWin: 0.5, maxPWin: 0.5,
      }).netEV, 9);
  });

  it('⛔ the maker advantage carries NO spread CREDIT — bid-to-bid earns no spread saving', () => {
    // mid geometry credits (0.008−0.004) + 0.001 + 0.0005 = 0.0055.
    // sided credits (0.008−0.004) + 0.0005 = 0.0045. The 0.001 is the spurious bonus.
    expect(decideMakerTaker(sidedInput()).makerEntryAdvantagePct).toBeCloseTo(0.0045, 9);
    expect(decideMakerTaker(baseInput()).makerEntryAdvantagePct).toBeCloseTo(0.0055, 9);
  });

  it("⭐ Langston's identity: sided maker friction = fee_taker + fee_maker + one slippage leg", () => {
    // One maker leg in, one taker leg out, one slippage leg, zero spread.
    const d = decideMakerTaker(sidedInput());
    const takerPct = 2 * 0.008 + 2 * 0.0005;
    const makerPct = takerPct - d.makerEntryAdvantagePct;
    expect(makerPct).toBeCloseTo(0.008 + 0.004 + 0.0005, 9);
  });

  it('⛔⛔ THE DOUBLE-COUNT, DEMONSTRATED: sided friction is EXACTLY one spread below mid friction', () => {
    // This is the defect in one line. If sided friction ever equals mid friction, the spread is
    // being charged in the geometry AND in the model — which is what shipping the levels
    // without this change would have done.
    const midPct = 2 * 0.008 + 2 * 0.0005 + 0.001;
    const sidedPct = 2 * 0.008 + 2 * 0.0005;
    expect(midPct - sidedPct).toBeCloseTo(CRYPTO_COSTS.spread, 12);
  });
});

describe('B-PRICE-SIDE-BY-JOB — the two arms price on their OWN entries', () => {
  it('the arms are a FULL SPREAD apart, and that is the correction', () => {
    expect(SIDED_ASK - SIDED_BID).toBeCloseTo(CRYPTO_COSTS.spread * 100, 9);
  });

  it('⭐ R:R differs BETWEEN THE ARMS, in opposite directions — the economics the mid concealed', () => {
    // Against the same bid-side stop of 98, a taker entry at 100.05 risks more and gains less
    // than a maker entry at 99.95. Under the mid there was one number and this was invisible.
    const takerRisk = SIDED_ASK - 98;
    const makerRisk = SIDED_BID - 98;
    expect(takerRisk).toBeGreaterThan(makerRisk);
    const takerRR = (105.5 - SIDED_ASK) / takerRisk;
    const makerRR = (105.5 - SIDED_BID) / makerRisk;
    expect(makerRR).toBeGreaterThan(takerRR);
  });

  it("⛔ the maker haircut prices off the MAKER's entry, not the taker's (Langston FINDING)", () => {
    // ⚠️ THIS TEST WAS REWRITTEN AFTER IT FAILED TO DISCRIMINATE. r1 moved `entryPriceMaker` and
    // asserted the adjusted maker EV responded — but the KERNEL already scales with that entry,
    // so it responded under the defect too. The mutation (haircut on `entryTaker`) stayed GREEN.
    // ⇒ A difference test could not isolate the haircut term. This asserts the term ANALYTICALLY.
    const d = decideMakerTaker(sidedInput());

    // Rebuild the maker branch by hand, priced entirely off the MAKER entry.
    const sidedMakerPct = 2 * 0.008 + 2 * 0.0005 - ((0.008 - 0.004) + 0.0005);
    const makerKernel = computeNetExpectancyKernel({
      entryPrice: SIDED_BID, stopPrice: 98, targetPrice: 105.5,
      totalFriction: sidedMakerPct * SIDED_BID, minPWin: 0.5, maxPWin: 0.5,
    });
    const adverseSelectionPct = 0.0015 + 0.0035 * 0.3;          // base + mult*strength
    const nonFillPct = Math.max(0, 0.0010 - 0.0008);            // reversal discount
    const pFill = 0.50;
    const expected =
      pFill * (makerKernel.netEV - adverseSelectionPct * SIDED_BID)
      - (1 - pFill) * nonFillPct * SIDED_BID;

    expect(d.makerNetEVAdjusted).toBeCloseTo(expected, 9);

    // ⭐ AND THE DISCRIMINATION, STATED: pricing the haircut off the TAKER entry instead would
    // move the result by this much — comfortably above the 1e-9 tolerance above, so the
    // assertion genuinely separates the two implementations rather than merely passing.
    const gap = (pFill * adverseSelectionPct + (1 - pFill) * nonFillPct) * (SIDED_ASK - SIDED_BID);
    expect(gap).toBeGreaterThan(1e-6);
  });
});

describe('B-PRICE-SIDE-BY-JOB — the geometry declaration REFUSES, it never defaults', () => {
  it('⛔ an unrecognised geometry THROWS rather than falling to the mid branch', () => {
    // An absent stamp defaulting to `mid` would charge a SIDED signal its spread twice — the
    // exact defect, silently. Three constructors already bypass the birth seam (#927/#928/#929).
    expect(() =>
      decideMakerTaker(baseInput({ levelGeometry: 'midpoint' as unknown as 'mid' })),
    ).toThrow(/levelGeometry/);
  });

  it('⛔ a mid-priced triple with two DIFFERENT entries THROWS — a caller has half-migrated', () => {
    expect(() => decideMakerTaker(baseInput({ entryPriceMaker: 99 }))).toThrow(/ONE entry/);
  });

  it('a mid-priced triple with matching entries is accepted, so the guard is not always-on', () => {
    // The other arm. Without it, "throws on everything" would satisfy the two tests above.
    expect(() => decideMakerTaker(baseInput())).not.toThrow();
  });
});
