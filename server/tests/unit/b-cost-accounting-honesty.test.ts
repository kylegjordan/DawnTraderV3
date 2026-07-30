// B-COST-ACCOUNTING-HONESTY (Kyle 2026-07-28) — gross is measured on ACTUAL fills and the cost
// line carries EXPLICIT costs (fees) only; slippage is retained as signed telemetry, not deducted.
//
// THE CENTRAL SAFETY PROPERTY, and the reason this batch is safe to ship against live money data:
// the NET P&L IS UNCHANGED. The old form computed gross against the INTENDED prices and then
// subtracted fees + entry-slippage + exit-slippage; that expression telescopes ALGEBRAICALLY to
// (actualExit - actualEntry)*qty - fees, which is exactly what the new form computes directly.
// Measured on the live population before the change: net matched true economics on 293/293 closed
// trades (including all 57 with a negative total_cost). These tests pin that equivalence so a
// future edit cannot silently break it — e.g. the tempting "clamp total_cost >= 0" fix, which
// WOULD have broken the net on those 57 rows.
//
// Industry basis (see the batch pre-audit for citations): Harris, *Trading and Exchanges* Ch.21
// (explicit vs implicit costs); Zipline `finance/slippage.py` (slippage baked into the fill price,
// commissions modelled separately — never both); Perold (1988) implementation shortfall.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The OLD accounting: gross vs INTENDED prices, slippage deducted as a cost. */
function oldNet(p: {
  intendedEntry: number; actualEntry: number;
  requestedExit: number; actualExit: number;
  qty: number; entryFee: number; exitFee: number;
}): number {
  const entrySlippage = (p.actualEntry - p.intendedEntry) * p.qty;   // order-placer.ts:78
  const exitSlippage = (p.requestedExit - p.actualExit) * p.qty;     // order-placer.ts:120
  const gross = (p.requestedExit - p.intendedEntry) * p.qty;
  const totalCost = p.entryFee + p.exitFee + entrySlippage + exitSlippage;
  return gross - totalCost;
}

/** The NEW accounting: gross on ACTUAL fills, explicit costs only. */
function newNet(p: {
  actualEntry: number; actualExit: number;
  qty: number; entryFee: number; exitFee: number;
}): number {
  const gross = (p.actualExit - p.actualEntry) * p.qty;
  const totalCost = p.entryFee + p.exitFee;                          // fees ONLY
  return gross - totalCost;
}

/** Ground truth: what the trade actually earned on the prices actually traded, less real fees. */
function trueEconomics(p: {
  actualEntry: number; actualExit: number; qty: number; entryFee: number; exitFee: number;
}): number {
  return (p.actualExit - p.actualEntry) * p.qty - (p.entryFee + p.exitFee);
}

describe('[B-COST-ACCOUNTING-HONESTY] net P&L is UNCHANGED by the accounting change', () => {
  // The real ONDO/USD case that prompted this batch (2026-07-27 05:45, stop_hit, +6.98%).
  // Filled 8.8% BETTER than the signal price, so the old form produced a NEGATIVE total_cost
  // (-30.23) and a gross that read as a LOSS (-11.86) on a trade that genuinely made +$18.36.
  const ONDO = {
    intendedEntry: 0.40904864, actualEntry: 0.37317,
    requestedExit: 0.39059500, actualExit: 0.40798840,
    qty: 642.80097870, entryFee: 1.91899233, exitFee: 2.09804275,
  };

  it('ONDO (price improvement, negative old total_cost): old net === new net === true economics', () => {
    expect(oldNet(ONDO)).toBeCloseTo(newNet(ONDO), 6);
    expect(newNet(ONDO)).toBeCloseTo(trueEconomics(ONDO), 6);
    // The recorded live value, to 4dp — the number Kyle saw on the tab.
    expect(newNet(ONDO)).toBeCloseTo(18.3643, 3);
  });

  it('the OLD gross was misleading and the NEW gross tells the truth', () => {
    const oldGross = (ONDO.requestedExit - ONDO.intendedEntry) * ONDO.qty;
    const newGross = (ONDO.actualExit - ONDO.actualEntry) * ONDO.qty;
    expect(oldGross).toBeLessThan(0);      // read as a LOSS…
    expect(newGross).toBeGreaterThan(0);   // …on a trade that actually GAINED
    expect(newGross).toBeCloseTo(22.3813, 3);
  });

  it('the new cost line is fees only and can NEVER be negative', () => {
    const oldTotalCost = ONDO.entryFee + ONDO.exitFee
      + (ONDO.actualEntry - ONDO.intendedEntry) * ONDO.qty
      + (ONDO.requestedExit - ONDO.actualExit) * ONDO.qty;
    expect(oldTotalCost).toBeLessThan(0);                       // the nonsense being removed
    expect(ONDO.entryFee + ONDO.exitFee).toBeGreaterThan(0);    // the replacement
  });

  it('equivalence holds for adverse slippage, price improvement, and exact fills alike', () => {
    const cases = [
      // adverse on both legs (the ordinary case: paid more, sold lower)
      { intendedEntry: 100, actualEntry: 100.5, requestedExit: 110, actualExit: 109.4, qty: 10, entryFee: 1, exitFee: 1 },
      // improvement on both legs (the case that produced negative "cost")
      { intendedEntry: 100, actualEntry: 99.2, requestedExit: 110, actualExit: 110.7, qty: 10, entryFee: 1, exitFee: 1 },
      // mixed
      { intendedEntry: 50, actualEntry: 50.4, requestedExit: 47, actualExit: 47.9, qty: 33, entryFee: 0.4, exitFee: 0.4 },
      // exact fills (no slippage at all — maker fill at the resting limit)
      { intendedEntry: 8, actualEntry: 8, requestedExit: 8.6, actualExit: 8.6, qty: 125, entryFee: 2, exitFee: 2 },
      // a LOSING trade — the sign must not flip
      { intendedEntry: 200, actualEntry: 201, requestedExit: 190, actualExit: 188, qty: 5, entryFee: 1.5, exitFee: 1.5 },
    ];
    for (const c of cases) {
      expect(oldNet(c)).toBeCloseTo(newNet(c), 6);
      expect(newNet(c)).toBeCloseTo(trueEconomics(c), 6);
    }
  });

  it('a losing trade still reports a loss (no green-washing)', () => {
    const loser = { intendedEntry: 200, actualEntry: 201, requestedExit: 190, actualExit: 188, qty: 5, entryFee: 1.5, exitFee: 1.5 };
    expect(newNet(loser)).toBeLessThan(0);
  });
});

// ── SOURCE FENCE — bound to the REAL files, all THREE sites ───────────────────
// The census (§9.5) found this arithmetic duplicated at THREE sites, each documented in-code as a
// deliberate mirror. If any one drifts back, an engine-closed trade and a manually-closed trade
// report different numbers for identical economics. These assertions fail if a site regresses.
const ENGINE_SRC = readFileSync(resolve(__dirname, '../../services/active-execution-engine.ts'), 'utf8');
const ROUTES_SRC = readFileSync(resolve(__dirname, '../../routes.ts'), 'utf8');

describe('[B-COST-ACCOUNTING-HONESTY] source fence — all three sites stay in lockstep', () => {
  // ★★ THESE THREE FENCES CHANGED SHAPE AT B-COST-MATH-CONSOLIDATION, AND THE CHANGE IS RECORDED
  // RATHER THAN QUIETLY MADE. They originally asserted the INLINE arithmetic existed at each site
  // — the correct fence while three hand-synchronised copies were the design. The copies are now
  // ONE implementation (`core/math/trade-pnl.ts`), so asserting the inline form would demand the
  // very duplication the later batch removed, and these went red on exactly that.
  // ⚠️ THE INTENT IS UNCHANGED AND MUST NOT BE WEAKENED: "the sites report identical numbers for
  // identical economics." What changed is HOW it is guaranteed — previously by comparing copies,
  // now structurally by there being nothing to compare. So each fence asserts the site CALLS the
  // shared function; re-inlining is caught in `b-cost-math-consolidation.test.ts`, and the
  // bit-identity of the extraction is proven there too.
  it('site 1 (engine close): delegates to the shared implementation', () => {
    expect(ENGINE_SRC).toMatch(/computeRealizedPnl\(\{/);
    expect(ENGINE_SRC).toMatch(/from '\.\.\/core\/math\/trade-pnl\.js'/);
    // the deducted-slippage form must NOT come back, at the site OR in the shared module
    expect(ENGINE_SRC).not.toMatch(/const totalCost = entryFee \+ exitFee \+ entrySlippage \+ exitSlippage/);
  });

  it('site 2 (manual close): delegates to the shared implementation', () => {
    expect(ROUTES_SRC).toMatch(/computeRealizedPnl\(\{/);
    expect(ROUTES_SRC).toMatch(/from '\.\/core\/math\/trade-pnl\.js'/);
    expect(ROUTES_SRC).not.toMatch(/const totalCost = entryFee \+ exitFee \+ entrySlippage \+ exitSlippage/);
  });

  it('site 2 persists the benchmark fields (slippage telemetry must be auditable, not hollow)', () => {
    // Langston Step-4: the manual-close payload wrote the DERIVED slippage but none of the five
    // benchmarks the engine writes — signed numbers with nothing to audit them against, and any
    // actual-fill verification would silently exclude these rows.
    for (const key of ['intendedEntryPrice:', 'actualEntryPrice:', 'targetExitPrice:', 'actualExitPrice:', 'netPnlPercent:']) {
      expect(ROUTES_SRC).toContain(key);
    }
  });

  it('★ no cost line anywhere adds slippage back under ANY spelling', () => {
    // Langston Step-4 edit 3: the exact-form negative guards above would sail past a re-introduction
    // spelled differently (e.g. `entryFee + exitFee + totalSlippage`). This is the shape-independent
    // guard: no assignment to a *Cost identifier may mention a slippage term on its right-hand side.
    const costAssignments = [
      ...ENGINE_SRC.matchAll(/const\s+\w*[Cc]ost\w*\s*=\s*([^;]+);/g),
      ...ROUTES_SRC.matchAll(/const\s+\w*[Cc]ost\w*\s*=\s*([^;]+);/g),
    ].map((m) => m[1]);
    // ★ EXPLICIT CARVE-OUT — `computeTotalRoundTripCost` (routes.ts ~8812) legitimately includes
    // slippage: it is an EX-ANTE FRICTION ESTIMATE feeding the EV gate — a forward-looking
    // "what will this round trip cost me?" — NOT realized cost accounting of a completed trade.
    // Harris-consistent, and Langston named it at Step-4 as a name collision one file away from
    // the line this batch changed. It is excluded BY NAME, not by assumption: an earlier draft of
    // this test asserted it "is a function call, not a `const …Cost =` assignment, so it is not
    // matched" — that reasoning was WRONG (it is exactly such an assignment) and this guard caught
    // it. Anything else that mentions slippage in a *Cost assignment is a genuine regression.
    const EX_ANTE_ESTIMATE = /computeTotalRoundTripCost\s*\(/;
    const offenders = costAssignments
      .filter((rhs) => /slippage/i.test(rhs))
      .filter((rhs) => !EX_ANTE_ESTIMATE.test(rhs));
    expect(offenders).toEqual([]);
  });

  it('site 3 (open-positions display): delegates to the shared OPEN implementation', () => {
    // ★ The OPEN entry point specifically — not the realized one. The exit leg here is a MARK and
    // the exit fee is MODELLED, so the semantics differ even though the arithmetic is shared.
    expect(ROUTES_SRC).toMatch(/computeOpenPnl\(\{/);
    expect(ROUTES_SRC).not.toMatch(/const estTotalCost = entryFee \+ entrySlippage \+ estExitFee \+ estExitSlippage/);
  });

  it('slippage is RETAINED as telemetry (still computed and persisted, just not deducted)', () => {
    expect(ENGINE_SRC).toMatch(/entrySlippage: entrySlippage\.toString\(\)/);
    expect(ENGINE_SRC).toMatch(/exitSlippage: exitSlippage\.toString\(\)/);
  });
});
