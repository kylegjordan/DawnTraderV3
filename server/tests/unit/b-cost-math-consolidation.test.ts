// B-COST-MATH-CONSOLIDATION — the extraction must be BIT-IDENTICAL to the three inline copies.
//
// THE SAFETY PROPERTY, and the reason this file is written BEFORE the re-point:
// this batch's Step-8 claim is "bit-identical refactor" and NOTHING ELSE. No correctness proof
// rides along — the balance-correctness question is #614's separate item and the display-gap
// figure is #618's. So the ONLY thing these tests may assert is that moving the arithmetic did
// not move a number.
//
// The reference implementations below are TRANSCRIBED VERBATIM from the three sites as they
// stood at `1791771fd`, before the re-point. They are deliberately duplicated here rather than
// imported: a test that imports the thing it is checking against proves nothing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeRealizedPnl, computeOpenPnl } from '../../core/math/trade-pnl.js';

/** SITE 1 + SITE 2 verbatim (they were byte-identical but for the entry-price variable name). */
function inlineRealized(p: {
  entry: number; exit: number; qty: number; entryFee: number; exitFee: number;
}) {
  const grossPnl = (p.exit - p.entry) * p.qty;
  const totalCost = p.entryFee + p.exitFee;
  const netPnl = grossPnl - totalCost;
  const actualEntryValue = p.entry * p.qty;
  const netPnlPercent = actualEntryValue > 0 ? (netPnl / actualEntryValue) * 100 : 0;
  return { grossPnl, totalCost, netPnl, netPnlPercent };
}

/** SITE 3 verbatim (open-positions display: current price as the exit leg, estimated exit fee). */
function inlineOpen(p: {
  entry: number; current: number; qty: number; entryFee: number; estExitFee: number;
}) {
  const actualEntryValue = p.entry * p.qty;
  const grossPnl = (p.current - p.entry) * p.qty;
  const grossPnlPercent = actualEntryValue > 0 ? (grossPnl / actualEntryValue) * 100 : 0;
  const estTotalCost = p.entryFee + p.estExitFee;
  const netPnl = grossPnl - estTotalCost;
  const netPnlPercent = actualEntryValue > 0 ? (netPnl / actualEntryValue) * 100 : 0;
  return { grossPnl, grossPnlPercent, estTotalCost, netPnl, netPnlPercent };
}

// Real and adversarial cases. The first is the live ONDO row that prompted the parent batch.
const CASES = [
  // ONDO/USD 2026-07-27 05:45 — filled 8.8% BETTER than signal; the old form made cost negative.
  { entry: 0.37317, exit: 0.40798840, qty: 642.80097870, entryFee: 1.91899233, exitFee: 2.09804275 },
  { entry: 100, exit: 110, qty: 10, entryFee: 1, exitFee: 1 },          // ordinary win
  { entry: 200, exit: 188, qty: 5, entryFee: 1.5, exitFee: 1.5 },       // loser — sign must hold
  { entry: 8, exit: 8, qty: 125, entryFee: 2, exitFee: 2 },             // flat, maker-at-limit
  { entry: 0.00001234, exit: 0.00001301, qty: 81037449.2, entryFee: 0.8, exitFee: 0.9 }, // sub-penny
  { entry: 1e-8, exit: 2e-8, qty: 1e9, entryFee: 0, exitFee: 0 },       // extreme scale
];

describe('[B-COST-MATH-CONSOLIDATION] the shared function is bit-identical to the inline copies', () => {
  it('sites 1 and 2 (realized close): every field matches to full float precision', () => {
    for (const c of CASES) {
      const inline = inlineRealized(c);
      const shared = computeRealizedPnl({
        actualEntryPrice: c.entry, actualExitPrice: c.exit,
        quantity: c.qty, entryFee: c.entryFee, exitFee: c.exitFee,
      });
      // toBe, NOT toBeCloseTo — "bit-identical" is the claim, so prove it exactly.
      expect(shared.grossPnl).toBe(inline.grossPnl);
      expect(shared.totalCost).toBe(inline.totalCost);
      expect(shared.netPnl).toBe(inline.netPnl);
      expect(shared.netPnlPercent).toBe(inline.netPnlPercent);
    }
  });

  it('site 3 (open display): every field matches to full float precision', () => {
    for (const c of CASES) {
      const inline = inlineOpen({
        entry: c.entry, current: c.exit, qty: c.qty, entryFee: c.entryFee, estExitFee: c.exitFee,
      });
      const shared = computeOpenPnl({
        actualEntryPrice: c.entry, currentPrice: c.exit,
        quantity: c.qty, entryFee: c.entryFee, estExitFee: c.exitFee,
      });
      expect(shared.grossPnl).toBe(inline.grossPnl);
      expect(shared.grossPnlPercent).toBe(inline.grossPnlPercent);
      expect(shared.totalCost).toBe(inline.estTotalCost);
      expect(shared.netPnl).toBe(inline.netPnl);
      expect(shared.netPnlPercent).toBe(inline.netPnlPercent);
    }
  });

  it('the zero-basis guard is preserved: 0, never NaN or Infinity', () => {
    // All three original sites guarded with `actualEntryValue > 0`. A never_filled row reaches
    // this path with zeros by construction, so the guard is load-bearing, not defensive padding.
    const zero = computeRealizedPnl({
      actualEntryPrice: 0, actualExitPrice: 0, quantity: 0, entryFee: 0, exitFee: 0,
    });
    expect(zero.netPnlPercent).toBe(0);
    expect(Number.isNaN(zero.netPnlPercent)).toBe(false);
    expect(Number.isFinite(zero.netPnlPercent)).toBe(true);

    const openZero = computeOpenPnl({
      actualEntryPrice: 0, currentPrice: 5, quantity: 0, entryFee: 0, estExitFee: 0,
    });
    expect(openZero.netPnlPercent).toBe(0);
    expect(openZero.grossPnlPercent).toBe(0);
  });

  it('the cost line can never be negative, on any input', () => {
    // The regression this whole family exists to prevent. Fees are non-negative by construction;
    // no price improvement may re-enter this line.
    for (const c of CASES) {
      const r = computeRealizedPnl({
        actualEntryPrice: c.entry, actualExitPrice: c.exit,
        quantity: c.qty, entryFee: c.entryFee, exitFee: c.exitFee,
      });
      expect(r.totalCost).toBeGreaterThanOrEqual(0);
      expect(r.totalCost).toBe(c.entryFee + c.exitFee);
    }
  });

  it('net === gross − cost identically, which is the invariant the C5 self-check asserts', () => {
    // Site 4 (c5-financial-diagnostics) asserts this relationship on every engine close. If the
    // shared function and the self-check ever disagree, the self-check is the thing that fires.
    for (const c of CASES) {
      const r = computeRealizedPnl({
        actualEntryPrice: c.entry, actualExitPrice: c.exit,
        quantity: c.qty, entryFee: c.entryFee, exitFee: c.exitFee,
      });
      expect(r.netPnl).toBe(r.grossPnl - r.totalCost);
    }
  });
});

// ── SOURCE FENCE — the sites must CALL the shared function, not re-inline it ──
const ENGINE_SRC = readFileSync(resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf8');
const ROUTES_SRC = readFileSync(resolve(__dirname, '../../routes.ts'), 'utf8');
const SHARED_SRC = readFileSync(resolve(__dirname, '../../core/math/trade-pnl.ts'), 'utf8');

describe('[B-COST-MATH-CONSOLIDATION] source fence — one implementation, quantity-scoped', () => {
  it('the shared module is the ONLY place the arithmetic is written', () => {
    // ★ QUANTITY-scoped, not SHAPE-scoped. The parent batch's fence matched the `gross − cost`
    // SHAPE, which is exactly why it could not see site 4 (which spells the same relationship out
    // under different variable names and never says `totalCost`). This asserts the arithmetic
    // exists in one file and that the callers reference it.
    expect(SHARED_SRC).toMatch(/const grossPnl = \(actualExitPrice - actualEntryPrice\) \* quantity/);
    expect(SHARED_SRC).toMatch(/const totalCost = entryFee \+ exitFee;/);
  });

  it('no consumer re-inlines the gross formula', () => {
    // The three retired inline forms, by their exact former spellings. If any returns, a caller
    // has stopped using the shared function and the copies can drift again.
    expect(ENGINE_SRC).not.toMatch(/const grossPnl = \(actualExitPrice - avgPrice\) \* quantity/);
    expect(ROUTES_SRC).not.toMatch(/const grossPnl = \(actualExitPrice - entryPrice\) \* quantity/);
    expect(ROUTES_SRC).not.toMatch(/const grossPnl = \(currentPrice - entryPrice\) \* quantity/);
  });

  it('both consumers import the shared module', () => {
    expect(ENGINE_SRC).toMatch(/computeRealizedPnl/);
    expect(ROUTES_SRC).toMatch(/computeRealizedPnl/);
    expect(ROUTES_SRC).toMatch(/computeOpenPnl/);
  });

  it('★ no *Cost assignment anywhere may mention slippage — carried forward from the parent batch', () => {
    // Retained verbatim in intent from b-cost-accounting-honesty: the shape-independent guard that
    // catches a re-introduction spelled differently (e.g. `entryFee + exitFee + totalSlippage`).
    // ★ The carve-out is BY NAME and was earned: an earlier draft asserted computeTotalRoundTripCost
    // "is a function call, not a `const …Cost =` assignment, so it is not matched" — that reasoning
    // was WRONG (it is exactly such an assignment) and this guard went red within a minute.
    const costAssignments = [
      ...ENGINE_SRC.matchAll(/const\s+\w*[Cc]ost\w*\s*=\s*([^;]+);/g),
      ...ROUTES_SRC.matchAll(/const\s+\w*[Cc]ost\w*\s*=\s*([^;]+);/g),
      ...SHARED_SRC.matchAll(/const\s+\w*[Cc]ost\w*\s*=\s*([^;]+);/g),
    ].map((m) => m[1]);
    const EX_ANTE_ESTIMATE = /computeTotalRoundTripCost\s*\(/;
    const offenders = costAssignments
      .filter((rhs) => /slippage/i.test(rhs))
      .filter((rhs) => !EX_ANTE_ESTIMATE.test(rhs));
    expect(offenders).toEqual([]);
  });

  it('the shared module performs no I/O — it must stay pure', () => {
    // Purity is what makes it safe to call from the engine close path, the route handlers and the
    // tests alike. A DB read or a clock here would make the same inputs stop producing the same
    // outputs, which would silently break the equivalence claim above.
    expect(SHARED_SRC).not.toMatch(/\bimport\b[^;]*\b(db|storage|drizzle)\b/);
    expect(SHARED_SRC).not.toMatch(/\bawait\b/);
    expect(SHARED_SRC).not.toMatch(/Date\.now\(\)|new Date\(/);
  });
});
