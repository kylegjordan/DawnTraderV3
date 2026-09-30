/**
 * `B-PRICE-SIDE-BY-JOB` row `8a-P4c` increment 3a-ii (plan §C3, P14; `#1118`) — VTS BOOKED FRICTION, PER LEG.
 *
 * ⭐ SPREAD IS EITHER GEOMETRY OR FRICTION — NEVER BOTH. A leg carries its half-spread ONLY if it was booked at a level
 * that is not a side: entry `'level'` ⇒ ½·s, `'ask'`/`'limit'` ⇒ none; exit arm `bid` ⇒ none, a clamp arm ⇒ ½·s.
 * Plan §C3.8's build requirements, each pinned here:
 *   (1) every arm of the composer and of the close-time recomposition;
 *   (2) the no-double-count assertion on the CHOSEN leg and on the TWIN, mutation-proved (a regression that charges the
 *       full spread again turns these red — the mutants are computed in-test so the red side is shown, not asserted);
 *   (3) the refusal arm exercised at build: `chosenEntryMode` absent ⇒ `frictionBasis = 'stamped'`, the counter
 *       increments and ONE alert is raised on dedupe `vts-friction-recompose-refused`;
 *   (4) a fence: every production open writer that stamps the cost components also stamps `entryPriceBasis`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const addAlert = vi.fn(async () => ({}));
vi.mock('../../services/system-alerts.js', () => ({ addAlert }));

import {
  composeVtsLegFriction,
  entryPriceBasisFor,
  recomposeVtsCloseFriction,
  vtsSpreadShareByLeg,
  type VtsFrictionRecord,
} from '../../core/trading/vts-friction.js';
import { planTwin } from '../../core/trading/pending-maker-logic.js';
import { noteVtsCloseFriction, vtsFrictionSinceBoot } from '../../services/vts-friction-ledger.js';

const FEE_M = 0.004;
const FEE_T = 0.008;
const SLIP = 0.0005;
const S = 0.002;
const OLD_FULL_SPREAD = (fe: number, fx: number) => fe + fx + 2 * SLIP + S; // the deleted composeBookedFriction

const rec = (over: Partial<VtsFrictionRecord> = {}): VtsFrictionRecord => ({
  frictionCost: 0.123, // the stamped open-time figure — a sentinel no recomposition can produce
  chosenEntryMode: 'taker',
  entryPriceBasis: 'level',
  costEntryFeeFraction: FEE_T,
  costExitFeeFraction: FEE_T,
  costSlippageFraction: SLIP,
  costSpreadFraction: S,
  ...over,
});

describe('8a-P4c 3a-ii (1) — the per-leg composer, every arm', () => {
  it('entryPriceBasisFor: a maker fills at its limit; a taker at the level, or at the ask when booked there', () => {
    expect(entryPriceBasisFor('maker', false)).toBe('limit');
    expect(entryPriceBasisFor('maker', true)).toBe('limit');
    expect(entryPriceBasisFor('taker', false)).toBe('level');
    expect(entryPriceBasisFor('taker', true)).toBe('ask');
  });

  it.each([
    ['level', false, S],       // both legs at a level: the full spread — the old formula, and only here
    ['level', true, S / 2],    // exit on its side
    ['ask', false, S / 2],     // entry on its side
    ['limit', false, S / 2],   // maker entry
    ['ask', true, 0],
    ['limit', true, 0],
  ] as const)('entry %s, exit on side %s ⇒ spread charged %d', (basis, exitSide, spreadCharged) => {
    const f = composeVtsLegFriction({ entryFee: FEE_T, exitFee: FEE_T, slippage: SLIP, spread: S, entryPriceBasis: basis, exitSideBooked: exitSide });
    expect(f).toBeCloseTo(FEE_T + FEE_T + 2 * SLIP + spreadCharged, 12);
  });

  it('a signed (negative) maker fee is carried, not floored', () => {
    const f = composeVtsLegFriction({ entryFee: -0.0002, exitFee: 0.001, slippage: SLIP, spread: S, entryPriceBasis: 'limit', exitSideBooked: true });
    expect(f).toBeCloseTo(-0.0002 + 0.001 + 2 * SLIP, 12);
  });
});

describe('8a-P4c 3a-ii (1) — recomposition at close, every arm', () => {
  it('bid exit + level entry ⇒ recomposed, entry half only', () => {
    const r = recomposeVtsCloseFriction(rec(), 'bid');
    expect(r).toMatchObject({ basis: 'recomposed', entryPriceBasis: 'level', legacyBasis: false, missing: null });
    expect(r.friction).toBeCloseTo(FEE_T * 2 + 2 * SLIP + S / 2, 12);
  });

  it.each(['clamp_no_bid', 'clamp_no_mark'] as const)('a clamp exit (%s) carries the exit half', (arm) => {
    const r = recomposeVtsCloseFriction(rec({ entryPriceBasis: 'ask' }), arm);
    expect(r.friction).toBeCloseTo(FEE_T * 2 + 2 * SLIP + S / 2, 12);
  });

  it('legacy row (no stamp): a taker reads as level, a maker as limit — and is COUNTED', () => {
    const t = recomposeVtsCloseFriction(rec({ entryPriceBasis: undefined }), 'bid');
    expect(t).toMatchObject({ basis: 'recomposed', entryPriceBasis: 'level', legacyBasis: true });
    const m = recomposeVtsCloseFriction(rec({ entryPriceBasis: undefined, chosenEntryMode: 'maker', costEntryFeeFraction: FEE_M }), 'bid');
    expect(m).toMatchObject({ basis: 'recomposed', entryPriceBasis: 'limit', legacyBasis: true });
    expect(m.friction).toBeCloseTo(FEE_M + FEE_T + 2 * SLIP, 12);
  });

  it.each([
    'chosenEntryMode', 'costEntryFeeFraction', 'costExitFeeFraction', 'costSlippageFraction', 'costSpreadFraction',
  ] as const)('a missing %s is REFUSED — the stamped figure is kept, never a fabricated one', (field) => {
    const r = recomposeVtsCloseFriction(rec({ [field]: undefined }), 'bid');
    expect(r).toEqual({ friction: 0.123, basis: 'stamped', entryPriceBasis: null, legacyBasis: false, missing: field });
  });

  it('a non-finite component is refused like an absent one (NaN never books)', () => {
    expect(recomposeVtsCloseFriction(rec({ costSpreadFraction: Number.NaN }), 'bid').basis).toBe('stamped');
  });
});

describe('8a-P4c 3a-ii (2) — NO DOUBLE COUNT, on the chosen leg and on the twin (mutation-proved)', () => {
  it('chosen taker leg, bid exit: the exit half-spread is NOT charged (the `#1118` defect)', () => {
    const r = recomposeVtsCloseFriction(rec(), 'bid');
    const mutant = OLD_FULL_SPREAD(FEE_T, FEE_T); // the deleted composer: full spread on a bid-booked exit
    expect(r.friction).toBeCloseTo(mutant - S / 2, 12);
    expect(r.friction).not.toBeCloseTo(mutant, 6); // RED if the full spread comes back
  });

  it('chosen maker leg, bid exit: NO spread at all (a limit fill never paid a half)', () => {
    const r = recomposeVtsCloseFriction(rec({ chosenEntryMode: 'maker', entryPriceBasis: 'limit', costEntryFeeFraction: FEE_M }), 'bid');
    const mutant = OLD_FULL_SPREAD(FEE_M, FEE_T);
    expect(r.friction).toBeCloseTo(mutant - S, 12);
    expect(r.friction).not.toBeCloseTo(mutant, 6);
  });

  const base = {
    twinEnabled: true, limitPrice: 100, placementTransactablePrice: 101, feeRateMaker: FEE_M, feeRateTaker: FEE_T,
    makerMaxPendingMs: () => 60_000, nowMs: 1_000_000, chosenSlippage: SLIP, chosenSpread: S,
  };

  it('maker twin: composes its OWN leg — no spread; neither the old full spread nor the old fee-delta', () => {
    const plan = planTwin({ ...base, pendingMaker: false, decisionChosenMode: 'taker' });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.overlay.entryPriceBasis).toBe('limit');
    expect(plan.overlay.frictionCost).toBeCloseTo(FEE_M + FEE_T + 2 * SLIP, 12);
    expect(plan.overlay.frictionCost).not.toBeCloseTo(OLD_FULL_SPREAD(FEE_M, FEE_T), 6);
    const chosen = composeVtsLegFriction({ entryFee: FEE_T, exitFee: FEE_T, slippage: SLIP, spread: S, entryPriceBasis: 'level', exitSideBooked: true });
    expect(plan.overlay.frictionCost).not.toBeCloseTo(chosen - FEE_T + FEE_M, 6); // BLOCKER-1's fee-delta mutant
  });

  // `8a-P4c` 3b (P9): a taker twin books the guarded ask — on its side at both legs, so no spread half at all.
  it('taker twin: booked at the ASK — no spread half at either leg (not the level\'s half, not the full spread)', () => {
    const plan = planTwin({ ...base, pendingMaker: true, decisionChosenMode: 'maker' });
    expect(plan.kind).toBe('open');
    if (plan.kind !== 'open') return;
    expect(plan.overlay.entryPriceBasis).toBe('ask');
    expect(plan.overlay.entryPrice).toBe(101);
    expect(plan.overlay.frictionCost).toBeCloseTo(FEE_T * 2 + 2 * SLIP, 12);
    expect(plan.overlay.frictionCost).not.toBeCloseTo(FEE_T * 2 + 2 * SLIP + S / 2, 6); // the level mutant
    expect(plan.overlay.frictionCost).not.toBeCloseTo(OLD_FULL_SPREAD(FEE_T, FEE_T), 6);
  });

  it('taker twin with NO usable ask is skipped (no_entry_ask) — never booked at the level', () => {
    expect(planTwin({ ...base, pendingMaker: true, decisionChosenMode: 'maker', placementTransactablePrice: null }))
      .toEqual({ kind: 'skip', reason: 'no_entry_ask' });
  });

  it('the twin record recomposes at close to what planTwin stamped (one rule at both ends)', () => {
    const plan = planTwin({ ...base, pendingMaker: false, decisionChosenMode: 'taker' });
    if (plan.kind !== 'open') throw new Error('expected open');
    const twinRecord = { ...rec(), ...plan.overlay } as VtsFrictionRecord;
    const r = recomposeVtsCloseFriction(twinRecord, 'bid');
    expect(r.basis).toBe('recomposed');
    expect(r.friction).toBeCloseTo(plan.overlay.frictionCost as number, 12);
  });
});

describe('8a-P4c 3a-ii (3) — the refusal arm, exercised: stamped + counter + ONE alert', () => {
  beforeEach(() => addAlert.mockClear());

  it('chosenEntryMode absent ⇒ frictionBasis stamped, refused counter +1, alert on the dedupe key', async () => {
    const before = vtsFrictionSinceBoot();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fr = recomposeVtsCloseFriction(rec({ chosenEntryMode: undefined }), 'bid');
    expect(fr.basis).toBe('stamped');
    expect(fr.friction).toBe(0.123);
    noteVtsCloseFriction('vts', { symbol: 'XYZ/USD' }, fr);
    await vi.waitFor(() => expect(addAlert).toHaveBeenCalledTimes(1));
    const after = vtsFrictionSinceBoot();
    expect(after.refused).toBe(before.refused + 1);
    expect(after.recomposed).toBe(before.recomposed);
    const arg = (addAlert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg.dedupe_key).toBe('vts-friction-recompose-refused');
    expect(String(arg.title)).toContain('missing chosenEntryMode');
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('[VTS_FRICTION_REFUSED]'))).toBe(true);
    errSpy.mockRestore();
  });

  it('a recomposed close counts and raises nothing; a legacy one counts legacyBasis too', async () => {
    const before = vtsFrictionSinceBoot();
    noteVtsCloseFriction('shadow', { symbol: 'A/USD' }, recomposeVtsCloseFriction(rec(), 'bid'));
    noteVtsCloseFriction('shadow', { symbol: 'B/USD' }, recomposeVtsCloseFriction(rec({ entryPriceBasis: undefined }), 'bid'));
    const after = vtsFrictionSinceBoot();
    expect(after.recomposed).toBe(before.recomposed + 2);
    expect(after.legacyBasis).toBe(before.legacyBasis + 1);
    expect(after.refused).toBe(before.refused);
    await new Promise((r) => setTimeout(r, 10));
    expect(addAlert).not.toHaveBeenCalled();
  });

  it('the since-boot read is a COPY — a caller cannot move the counters', () => {
    const snap = vtsFrictionSinceBoot();
    snap.refused += 99;
    expect(vtsFrictionSinceBoot().refused).toBe(snap.refused - 99);
  });
});

describe('8a-P4c 3a-ii (4) — fence: every production writer of the cost components stamps entryPriceBasis', () => {
  const ROOT = join(process.cwd(), 'server');
  const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
  const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n === 'tests' || n === '__tests__') continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (SOURCE.test(n) && !TEST_FILE.test(n)) out.push(p);
    }
    return out;
  };
  const files = walk(ROOT);

  it('the walk reaches the writers it must (positive control)', () => {
    const rel = files.map((f) => f.replace(/\\/g, '/'));
    for (const must of ['services/vts-runner.ts', 'asset_classes/xstock_spot/eval-cycle.ts', 'core/trading/pending-maker-logic.ts']) {
      expect(rel.some((f) => f.endsWith(must))).toBe(true);
    }
  });

  it('every `costSpreadFraction:` property write has an entryPriceBasis within 8 lines', () => {
    const sites: string[] = [];
    const missing: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf-8').split(/\r?\n/);
      lines.forEach((l, i) => {
        if (!/^\s*costSpreadFraction\s*:/.test(l)) return;
        sites.push(`${f}:${i + 1}`);
        const win = lines.slice(Math.max(0, i - 8), i + 9).join('\n');
        if (!/\bentryPriceBasis\b/.test(win)) missing.push(`${f}:${i + 1}`);
      });
    }
    // Langston nit (a): EQUALITY to the census, so a collapse cannot read green. 8 at build: eval-cycle (1), vts-runner (5 —
    // two open writers, two close payloads, registerOpenVtsTrade), vts-service (2 close records).
    expect(sites.length).toBe(8);
    expect(missing).toEqual([]);
  });

  it('the twin overlay stamps its OWN basis (never inherited from the chosen leg)', () => {
    const src = readFileSync(join(ROOT, 'core/trading/pending-maker-logic.ts'), 'utf-8');
    expect(src).toMatch(/const twinEntryPriceBasis = entryPriceBasisFor\(twinMode, true\);/);
    expect(src).toMatch(/entryPriceBasis: twinEntryPriceBasis, \/\/ the twin's OWN basis/);
  });

  it('nothing books VTS P&L from the open-time scalar — both close paths recompose', () => {
    const vts = readFileSync(join(ROOT, 'services/vts-runner.ts'), 'utf-8');
    expect(vts).not.toMatch(/grossPnl\s*-\s*trade\.frictionCost/);
    expect((vts.match(/recomposeVtsCloseFriction\(/g) ?? []).length).toBe(2);
    expect(vts).not.toMatch(/composeBookedFriction/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Langston 3a-ii r1 BLOCKER-1 — a record that never carried ANY cost input is UNPRICED, not refused: counted, no alert.
// Only a PARTIAL absence (a writer lost an input) is the tripwire.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('8a-P4c 3a-ii r2 — unpriced vs refused', () => {
  beforeEach(() => addAlert.mockClear());
  const bare = { frictionCost: 0 } as VtsFrictionRecord; // the shadow lane's shape: frictionCost 0, no components

  it('ALL four components absent ⇒ unpriced (the stamped 0 kept), not stamped', () => {
    expect(recomposeVtsCloseFriction(bare, 'bid')).toEqual({ friction: 0, basis: 'unpriced', entryPriceBasis: null, legacyBasis: false, missing: null });
  });

  it('unpriced is COUNTED separately and raises NO alert; partial absence still refuses and alerts', async () => {
    const before = vtsFrictionSinceBoot();
    noteVtsCloseFriction('shadow', { symbol: 'S/USD' }, recomposeVtsCloseFriction(bare, 'bid'));
    await new Promise((r) => setTimeout(r, 10));
    const mid = vtsFrictionSinceBoot();
    expect(mid.unpriced).toBe(before.unpriced + 1);
    expect(mid.refused).toBe(before.refused);
    expect(addAlert).not.toHaveBeenCalled();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    noteVtsCloseFriction('vts', { symbol: 'P/USD' }, recomposeVtsCloseFriction(rec({ costSpreadFraction: undefined }), 'bid'));
    await vi.waitFor(() => expect(addAlert).toHaveBeenCalledTimes(1));
    expect(vtsFrictionSinceBoot().refused).toBe(mid.refused + 1);
    errSpy.mockRestore();
  });

  it('FENCE: the shadow lane registers NO cost components today — the day it gains them, this flips and unpriced must reach 0', () => {
    const vts = readFileSync(join(process.cwd(), 'server/services/vts-runner.ts'), 'utf-8').replace(/\r\n/g, '\n');
    const start = vts.indexOf('export async function registerOpenShadowTrade(');
    const lit = vts.slice(vts.indexOf('const shadowTrade: OpenVirtualTrade = {', start));
    const body = lit.slice(0, lit.indexOf('\n  };'));
    expect(body).toMatch(/frictionCost: 0,/);
    expect(body).not.toMatch(/cost(Entry|Exit)FeeFraction|costSlippageFraction|costSpreadFraction|chosenEntryMode/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Langston 3a-ii r1 FINDING-1 — the P19-B8.7 five-column split must sum to the booked `costs` under the per-leg rule.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('8a-P4c 3a-ii r2 — the cost split sums to the booked friction, per leg', () => {
  const split = (t: Parameters<typeof vtsSpreadShareByLeg>[0], closed: boolean) => {
    const sh = vtsSpreadShareByLeg(t, closed);
    return FEE_T * 2 + (SLIP + S * sh.entry) + (SLIP + S * sh.exit);
  };
  it.each([
    ['level', 'bid', FEE_T * 2 + 2 * SLIP + S / 2],
    ['level', 'clamp_no_bid', FEE_T * 2 + 2 * SLIP + S],
    ['ask', 'bid', FEE_T * 2 + 2 * SLIP],
    ['limit', 'clamp_no_mark', FEE_T * 2 + 2 * SLIP + S / 2],
  ] as const)('closed, recomposed: entry %s + exit %s ⇒ the columns equal the recomposed friction', (basis, arm, want) => {
    const fr = recomposeVtsCloseFriction(rec({ entryPriceBasis: basis }), arm);
    expect(fr.friction).toBeCloseTo(want, 12);
    expect(split({ entryPriceBasis: basis, frictionBasis: 'recomposed', exitBookingArm: arm }, true)).toBeCloseTo(fr.friction, 12);
  });
  it('an OPEN row matches the open-time estimate (exit on its side); a LEGACY row keeps ½ + ½ (the full-spread stamp)', () => {
    const openEst = composeVtsLegFriction({ entryFee: FEE_T, exitFee: FEE_T, slippage: SLIP, spread: S, entryPriceBasis: 'level', exitSideBooked: true });
    expect(split({ entryPriceBasis: 'level' }, false)).toBeCloseTo(openEst, 12);
    expect(split({}, false)).toBeCloseTo(OLD_FULL_SPREAD(FEE_T, FEE_T), 12);
    expect(split({}, true)).toBeCloseTo(OLD_FULL_SPREAD(FEE_T, FEE_T), 12);
  });
  it('both display sites use the helper (no hard-coded _sp / 2 left)', () => {
    for (const f of ['server/services/vts-runner.ts', 'server/utils/export-csv.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf-8');
      expect(src).toMatch(/vtsSpreadShareByLeg\(trade, (true|false)\)/);
      expect(src).not.toMatch(/_sp \/ 2/);
    }
  });
});
