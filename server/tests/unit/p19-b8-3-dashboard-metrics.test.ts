/**
 * P19-B8.3 — dashboard-metric math + gate-disposition contract tests.
 *
 * Langston Step-4 conditions covered, by name:
 *  (a) an EMPTY selected window still yields real calendar earnings — the
 *      earnings math runs over the all-time valid set, independent of the
 *      window (the zero-shape hoist in routes.ts calls the same function);
 *  (b) makerShare / feeDrag.pctOfGross / avgNetR.value return null (never
 *      0 / NaN / Infinity) on their zero-denominator paths;
 *  (c) the enforce identity: evals − passes ≡ rr + reach + stop + atr drops,
 *      asserted against the REAL applyGlobalGuards over an input grid
 *      (pass XOR exactly-one-of-4-reasons);
 *  (A) profit factor is null on a no-loss window (never Infinity→0 → "0.00"
 *      on an all-wins day);
 *  (2) the 'tag' disposition structurally yields NO "Rejected" column
 *      (Dropped + Tagged instead) — the pure column contract the panel maps.
 */
import { describe, it, expect } from 'vitest';
import {
  computeCalendarEarnings,
  computeFeeDrag,
  computeMakerTakerMix,
  computeAvgNetR,
  computeMaxDrawdownUsd,
  computeByAssetClass,
  profitFactorOrNull,
} from '../../services/dashboard-metrics.js';
import { applyGlobalGuards } from '../../strategies/strategy-helpers.js';
import { gateAggregateColumns } from '../../../client/src/components/vts/gate-columns.js';

const NOW = new Date('2026-07-06T18:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600 * 1000);

describe('P19-B8.3 dashboard metrics (pure math)', () => {
  // ── (a) calendar earnings survive an empty selected window ──────────────
  it('calendar earnings are computed from the ALL-TIME valid set, not the window', () => {
    // Local-calendar boundaries: NOW is a Monday (2026-07-06). Use hours-ago
    // (same day), 1 day ago (this week, not today), and 20 days ago (this
    // month via mid-June? no — 20d ago = June 16, PRIOR month). Choose 3 days
    // ago = July 3 → this month, not this week (week starts Sunday July 5).
    const validTrades = [
      { netPnl: '10', closedAt: new Date(NOW.getTime() - 2 * 3600 * 1000) },  // today
      { netPnl: '20', closedAt: daysAgo(1) },                                  // this week (Sunday)
      { netPnl: '40', closedAt: daysAgo(3) },                                  // this month, prior week
      { netPnl: '80', closedAt: daysAgo(40) },                                 // prior month — excluded
    ];
    const e = computeCalendarEarnings(validTrades as any, NOW);
    expect(e.today).toBeCloseTo(10);
    expect(e.thisWeek).toBeGreaterThanOrEqual(30);   // today + Sunday close
    expect(e.thisMonth).toBeCloseTo(70);             // all July closes
    // The empty-window contract: the WINDOW plays no part — the same call the
    // zero-shape makes returns these same real values.
  });

  it('calendar earnings are zero only when there are genuinely no closes', () => {
    expect(computeCalendarEarnings([], NOW)).toEqual({ today: 0, thisWeek: 0, thisMonth: 0 });
  });

  // ── (b) zero-denominator paths return null, never 0/NaN/Infinity ────────
  it('feeDrag.pctOfGross is null when gross <= 0 (fees still reported)', () => {
    const losing = [{ grossPnl: '-50', totalFee: '2' }, { grossPnl: '10', totalFee: '1' }];
    const d = computeFeeDrag(losing as any);
    expect(d.totalFees).toBeCloseTo(3);
    expect(d.pctOfGross).toBeNull();
    const winning = [{ grossPnl: '100', totalFee: '2' }];
    expect(computeFeeDrag(winning as any).pctOfGross).toBeCloseTo(2);
  });

  it('makerShare is null when no row carries a known entry mode', () => {
    const mix = computeMakerTakerMix([{ chosenEntryMode: null }, { chosenEntryMode: undefined }] as any);
    expect(mix.makerShare).toBeNull();
    expect(mix.unknownCount).toBe(2);
    const known = computeMakerTakerMix([{ chosenEntryMode: 'maker' }, { chosenEntryMode: 'taker' }, { chosenEntryMode: null }] as any);
    expect(known.makerShare).toBeCloseTo(50);
    expect(known.unknownCount).toBe(1);
  });

  it('avgNetR is null when every row lacks a usable stop, with excludedCount surfaced', () => {
    const r = computeAvgNetR([
      { netPnl: '5', entryPrice: '10', stopLoss: null, quantity: '1' },
      { netPnl: '5', entryPrice: '10', stopLoss: '10', quantity: '1' },   // zero risk
    ] as any);
    expect(r.value).toBeNull();
    expect(r.sampleCount).toBe(0);
    expect(r.excludedCount).toBe(2);
    const ok = computeAvgNetR([{ netPnl: '10', entryPrice: '100', stopLoss: '95', quantity: '2' }] as any);
    expect(ok.value).toBeCloseTo(1);  // 10 / (5 × 2)
    expect(ok.excludedCount).toBe(0);
  });

  it('max drawdown is peak-to-trough on the running realized cumulative', () => {
    // +10 → +30 → -20 (dd 50) → +5
    const trades = [
      { netPnl: '10', closedAt: daysAgo(4) },
      { netPnl: '20', closedAt: daysAgo(3) },
      { netPnl: '-50', closedAt: daysAgo(2) },
      { netPnl: '25', closedAt: daysAgo(1) },
    ];
    expect(computeMaxDrawdownUsd(trades as any)).toBeCloseTo(50);
    expect(computeMaxDrawdownUsd([])).toBe(0);
  });

  it('byAssetClass wins use the SAME pnl basis as the headline winRate', () => {
    const trades = [
      { assetClass: 'crypto_spot', pnl: '5', netPnl: '4', totalFee: '1' },
      { assetClass: 'crypto_spot', pnl: '-2', netPnl: '-3', totalFee: '1' },
      { assetClass: 'xstock_spot', pnl: '1', netPnl: '0.5', totalFee: '0.5' },
    ];
    const b = computeByAssetClass(trades as any);
    expect(b.crypto_spot.count).toBe(2);
    expect(b.crypto_spot.wins).toBe(1);           // pnl>0 basis
    expect(b.crypto_spot.winRate).toBeCloseTo(50);
    expect(b.xstock_spot.wins).toBe(1);
    // headline basis parity: wins across classes == pnl>0 rows overall
    const headlineWins = trades.filter(t => parseFloat(t.pnl) > 0).length;
    expect(Object.values(b).reduce((s, r) => s + r.wins, 0)).toBe(headlineWins);
  });

  // ── (A) profit-factor honesty ────────────────────────────────────────────
  it('profit factor is null on a no-loss window (NEVER Infinity coerced to 0)', () => {
    expect(profitFactorOrNull(120, 0)).toBeNull();   // all wins → ∞ label, not "0.00"
    expect(profitFactorOrNull(0, 0)).toBeNull();     // no trades → no denominator
    expect(profitFactorOrNull(50, 25)).toBeCloseTo(2);
    expect(profitFactorOrNull(0, 25)).toBe(0);       // genuine 0: zero profit, real losses
  });
});

describe('P19-B8.3 gate disposition contract (Langston HARD check 1 + identity)', () => {
  const GATE = { minRR: 1.5, reachAtrMax: 6 } as any;

  it('enforce identity: evals − passes ≡ rr + reach + stop + atr over a real applyGlobalGuards grid', () => {
    // Grid over entry/stop/target/ATR shapes designed to hit every branch:
    // null ATR, degenerate stop, sub-min RR, unreachable target, clean pass.
    const entries = [100];
    const stops = [99.99999999, 95, 90, 100];          // near-zero risk, sane, wide, zero
    const targets = [100.5, 103, 115, 200, 1000];      // low RR → unreachable extremes
    const atrs: (number | null)[] = [null, 0.5, 2, 10];
    const counts = { evals: 0, passes: 0, rrDrops: 0, reachDrops: 0, stopDrops: 0, atrDrops: 0 };
    for (const e of entries) for (const s of stops) for (const t of targets) for (const a of atrs) {
      const r = applyGlobalGuards(e, s, t, a, GATE);
      counts.evals++;
      if (r.pass) { counts.passes++; expect(r.dropReason).toBeNull(); continue; }
      // exactly one of the four reasons — the exhaustiveness the Rejected column relies on
      expect(['rr_below_min', 'unreachable', 'stop_distance', 'invalid_atr']).toContain(r.dropReason);
      if (r.dropReason === 'rr_below_min') counts.rrDrops++;
      else if (r.dropReason === 'unreachable') counts.reachDrops++;
      else if (r.dropReason === 'stop_distance') counts.stopDrops++;
      else counts.atrDrops++;
    }
    // every reason class must actually have been exercised for the grid to prove anything
    expect(counts.passes).toBeGreaterThan(0);
    expect(counts.rrDrops).toBeGreaterThan(0);
    expect(counts.reachDrops).toBeGreaterThan(0);
    expect(counts.stopDrops).toBeGreaterThan(0);
    expect(counts.atrDrops).toBeGreaterThan(0);
    // the identity the UI's Rejected column asserts to the user
    expect(counts.evals - counts.passes).toBe(counts.rrDrops + counts.reachDrops + counts.stopDrops + counts.atrDrops);

    // and the column contract agrees with the same counts:
    const [rejected] = gateAggregateColumns('enforce');
    expect(rejected.value(counts)).toBe(counts.evals - counts.passes);
    const [dropped, tagged] = gateAggregateColumns('tag');
    expect(dropped.value(counts) + tagged.value(counts)).toBe(rejected.value(counts));
  });

  it("the 'tag' disposition structurally yields NO Rejected column (Dropped + Tagged instead)", () => {
    const tagCols = gateAggregateColumns('tag');
    expect(tagCols.map(c => c.key)).toEqual(['dropped', 'tagged']);
    expect(tagCols.some(c => c.key === 'rejected' || c.label === 'Rejected')).toBe(false);
    const enforceCols = gateAggregateColumns('enforce');
    expect(enforceCols.map(c => c.key)).toEqual(['rejected']);
    // tag semantics: Dropped = data-validity (stop+atr); Tagged = quality (rr+reach)
    const s = { evals: 100, passes: 40, rrDrops: 30, reachDrops: 15, stopDrops: 10, atrDrops: 5 };
    expect(tagCols[0].value(s)).toBe(15);   // dropped
    expect(tagCols[1].value(s)).toBe(45);   // tagged
    expect(enforceCols[0].value(s)).toBe(60);
  });
});
