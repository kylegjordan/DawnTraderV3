// P19-B8.5 — the exploration lane: fail-closed knobs, floor %-of-price semantics,
// deterministic anneal, daily budget, and the NetEV-only override condition.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Knob + DB stubs (mutable per test).
let knobs: Record<string, unknown> = {};
let rtbExplorationToday = 0;
let closedExploration = 0;

vi.mock('../../services/module-constants-service.js', () => ({
  getCachedConstant: (_m: string, name: string) => knobs[name],
}));
vi.mock('../../db.js', () => ({
  db: {
    execute: async (q: any) => {
      const text = String(q?.queryChunks ?? q?.sql ?? q);
      // Crude but sufficient: the budget query targets rtb_signals, the anneal query closed_trades.
      const s = JSON.stringify(q);
      if (s.includes('rtb_signals')) return { rows: [{ n: rtbExplorationToday }] };
      if (s.includes('closed_trades')) return { rows: [{ n: closedExploration }] };
      return { rows: [{ n: 0 }] };
    },
  },
}));

import { checkExplorationAdmit, isNetEvOnlyFailure, _clearExplorationCaches } from '../../services/execution/exploration-lane.js';

const FULL_KNOBS = {
  enabled: true, daily_budget: 28, base_floor_pct: -0.02,
  anneal_step_trades: 50, anneal_step_pct: 0.005, policy_version: 1,
};

beforeEach(() => {
  knobs = { ...FULL_KNOBS };
  rtbExplorationToday = 0;
  closedExploration = 0;
  _clearExplorationCaches();
});

describe('[P19-B8.5] exploration lane — fail-closed', () => {
  it('missing enabled knob → DISABLED (never a silent default-open)', async () => {
    knobs = {};
    const d = await checkExplorationAdmit({ assetClass: 'crypto_spot', chosenNetEv: -0.5, entryPrice: 100 });
    expect(d.admit).toBe(false);
    expect(d.reason).toContain('fail-closed');
  });
  it('enabled but incomplete knob set → DISABLED', async () => {
    knobs = { enabled: true, daily_budget: 28 };
    const d = await checkExplorationAdmit({ assetClass: 'crypto_spot', chosenNetEv: -0.5, entryPrice: 100 });
    expect(d.admit).toBe(false);
    expect(d.reason).toContain('knobs_incomplete');
  });
});

describe('[P19-B8.5] exploration lane — floor as % of entry price', () => {
  it('admits above the floor, declines below it (same dollar EV, different prices)', async () => {
    // -$0.50 on a $100 symbol = -0.5% → above the -2% floor → admit.
    const a = await checkExplorationAdmit({ assetClass: 'crypto_spot', chosenNetEv: -0.5, entryPrice: 100 });
    expect(a.admit).toBe(true);
    expect(a.floorInEffect).toBeCloseTo(-0.02, 10);
    // -$0.50 on a $10 symbol = -5% → below the floor → decline.
    _clearExplorationCaches();
    const b = await checkExplorationAdmit({ assetClass: 'crypto_spot', chosenNetEv: -0.5, entryPrice: 10 });
    expect(b.admit).toBe(false);
    expect(b.reason).toContain('below exploration floor');
  });
});

describe('[P19-B8.5] exploration lane — deterministic anneal', () => {
  it('floor tightens toward zero as closed exploration trades accrue, capped at 0', async () => {
    closedExploration = 100; // 2 steps × 0.005 → floor -0.02 + 0.01 = -0.01
    const d = await checkExplorationAdmit({ assetClass: 'crypto_spot', chosenNetEv: -1.5, entryPrice: 100 });
    expect(d.floorInEffect).toBeCloseTo(-0.01, 10);
    expect(d.admit).toBe(false); // -1.5% below the tightened -1% floor
    _clearExplorationCaches();
    closedExploration = 1000; // would overshoot → capped at 0
    const e = await checkExplorationAdmit({ assetClass: 'crypto_spot', chosenNetEv: -0.01, entryPrice: 100 });
    expect(e.floorInEffect).toBe(0);
    expect(e.admit).toBe(false); // negative netEV never clears a zero floor → lane fully annealed shut
  });
});

describe('[P19-B8.5] exploration lane — daily budget', () => {
  it('declines when the budget is exhausted', async () => {
    rtbExplorationToday = 28;
    const d = await checkExplorationAdmit({ assetClass: 'crypto_spot', chosenNetEv: -0.5, entryPrice: 100 });
    expect(d.admit).toBe(false);
    expect(d.reason).toContain('budget exhausted');
  });
});

describe('[P19-B8.5] isNetEvOnlyFailure — the override condition', () => {
  it('true ONLY for exactly one failure starting with "NetEV "', () => {
    expect(isNetEvOnlyFailure(['NetEV -0.005000 <= 0 (chosen taker mode — non-positive net expectancy after friction)'])).toBe(true);
    expect(isNetEvOnlyFailure(['NetEV -0.005 <= 0', 'RegimeWeight 0.05 < 0.3'])).toBe(false);
    expect(isNetEvOnlyFailure(['RegimeWeight 0.05 < 0.3'])).toBe(false);
    expect(isNetEvOnlyFailure([])).toBe(false);
  });
});
