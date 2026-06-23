/**
 * reorg-B2.2 OBJ-B — guard-eval-tracker per-(strategy, assetClass) re-key.
 *
 * Verifies: (1) the strategy-level #372 aggregate is preserved by SUMMING raw fields across classes and
 * RE-DERIVING the ratios (FLAG-2 — never averaging per-class ratios); (2) getGuardEvalStatsByClass splits
 * by class; (3) getGuardEvalStatsPerClass returns the full nested breakdown; (4) the checkpoint keySchema
 * guard DISCARDS an unversioned legacy (strategy-only) checkpoint on reload (FLAG-1) but reloads a matching
 * one. fs is mocked so the checkpoint path is fully controlled and never touches disk.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Controls what the checkpoint file "contains" at module load. null => ENOENT (fresh window).
const h = vi.hoisted(() => ({ fileContent: null as string | null }));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const stub = {
    ...actual,
    readFileSync: (..._args: any[]) => {
      if (h.fileContent === null) { const e: any = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return h.fileContent;
    },
    writeFileSync: () => {},
    mkdirSync: () => {},
    renameSync: () => {},
    unlinkSync: () => {},
  };
  return { ...stub, default: { ...(actual as any).default, ...stub } };
});

const CRYPTO = 'crypto_spot' as any;
const XSTOCK = 'xstock_spot' as any;

describe('reorg-B2.2 OBJ-B — guard-eval-tracker per-class re-key', () => {
  beforeEach(() => {
    h.fileContent = null;
    vi.resetModules();
  });

  it('aggregates per-strategy across classes, re-deriving ratios from summed raw (FLAG-2)', async () => {
    const t = await import('../../strategies/guard-eval-tracker.js');
    t.resetGuardEvalStats();
    // crypto_spot: 2 passes @ rr 3.0, 1 rr_below_min @ rr 1.0
    t.recordGuardEval('morning_star', 3.0, true, null, CRYPTO);
    t.recordGuardEval('morning_star', 3.0, true, null, CRYPTO);
    t.recordGuardEval('morning_star', 1.0, false, 'rr_below_min', CRYPTO);
    // xstock_spot: 1 rr_below_min @ rr 2.0
    t.recordGuardEval('morning_star', 2.0, false, 'rr_below_min', XSTOCK);

    const agg = t.getGuardEvalStats();
    expect(Object.keys(agg)).toEqual(['morning_star']); // one row per strategy, classes folded
    const m = agg.morning_star;
    expect(m.evals).toBe(4);
    expect(m.passes).toBe(2);
    expect(m.rrDrops).toBe(2);
    expect(m.rrEvals).toBe(4);
    expect(m.rrSum).toBeCloseTo(9.0); // 3+3+1+2
    expect(m.meanRR).toBeCloseTo(9.0 / 4); // re-derived from summed raw
    expect(m.rrSuppressionRate).toBeCloseTo(2 / 4);
    expect(m.rrMin).toBeCloseTo(1.0);
    expect(m.rrMax).toBeCloseTo(3.0);
  });

  it('FLAG-2: summed-raw re-derivation, NOT an average of per-class ratios', async () => {
    const t = await import('../../strategies/guard-eval-tracker.js');
    t.resetGuardEvalStats();
    // crypto: 100 evals, 50 rr_below_min → 50% suppression
    for (let i = 0; i < 50; i++) t.recordGuardEval('s', 4.0, true, null, CRYPTO);
    for (let i = 0; i < 50; i++) t.recordGuardEval('s', 1.0, false, 'rr_below_min', CRYPTO);
    // xstock: 2 evals, 2 rr_below_min → 100% suppression
    t.recordGuardEval('s', 1.0, false, 'rr_below_min', XSTOCK);
    t.recordGuardEval('s', 1.0, false, 'rr_below_min', XSTOCK);

    const agg = t.getGuardEvalStats();
    // Correct (raw): 52 drops / 102 evals ≈ 0.5098. Averaging the ratios would wrongly give (0.5+1.0)/2 = 0.75.
    expect(agg.s.rrSuppressionRate).toBeCloseTo(52 / 102, 5);
    expect(agg.s.rrSuppressionRate).not.toBeCloseTo(0.75, 2);
  });

  it('splits stats by asset class (getGuardEvalStatsByClass + getGuardEvalStatsPerClass)', async () => {
    const t = await import('../../strategies/guard-eval-tracker.js');
    t.resetGuardEvalStats();
    t.recordGuardEval('orb', 3.0, true, null, CRYPTO);
    t.recordGuardEval('orb', 1.0, false, 'rr_below_min', XSTOCK);

    const crypto = t.getGuardEvalStatsByClass('crypto_spot');
    const xstock = t.getGuardEvalStatsByClass('xstock_spot');
    expect(Object.keys(crypto)).toEqual(['orb']);
    expect(crypto.orb.passes).toBe(1);
    expect(crypto.orb.rrDrops).toBe(0);
    expect(xstock.orb.passes).toBe(0);
    expect(xstock.orb.rrDrops).toBe(1);

    const per = t.getGuardEvalStatsPerClass();
    expect(per.crypto_spot.orb.passes).toBe(1);
    expect(per.xstock_spot.orb.rrDrops).toBe(1);
  });

  it('FLAG-3 support: a class with no evaluations yields an empty map (UI renders "no evaluations")', async () => {
    const t = await import('../../strategies/guard-eval-tracker.js');
    t.resetGuardEvalStats();
    t.recordGuardEval('orb', 3.0, true, null, CRYPTO);
    expect(t.getGuardEvalStatsByClass('xstock_spot')).toEqual({});
  });

  it('FLAG-1: an unversioned legacy checkpoint is DISCARDED on reload, not loaded as orphan buckets', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Legacy reorg-B2.1/OBJ-A format: strategy-only keys, NO keySchema field.
    h.fileContent = JSON.stringify({
      startedAt: '2026-06-20T00:00:00.000Z',
      stats: { morning_star: { evals: 99, passes: 0, atrDrops: 0, stopDrops: 0, rrDrops: 99, reachDrops: 0, rrEvals: 99, rrSum: 99, rrMin: 1, rrMax: 1 } },
    });
    vi.resetModules();
    const t = await import('../../strategies/guard-eval-tracker.js');
    expect(Object.keys(t.getGuardEvalStats())).toHaveLength(0); // discarded — no phantom buckets
    expect(t.getGuardEvalStartedAt()).toBeNull();                // fresh window, not the stale stamp
    expect(errSpy).toHaveBeenCalled();                           // loud-logged
    errSpy.mockRestore();
  });

  it('a checkpoint with the matching keySchema reloads its composite buckets', async () => {
    h.fileContent = JSON.stringify({
      keySchema: 'strategy::assetClass/v1',
      startedAt: '2026-06-20T00:00:00.000Z',
      stats: { 'orb::crypto_spot': { evals: 5, passes: 5, atrDrops: 0, stopDrops: 0, rrDrops: 0, reachDrops: 0, rrEvals: 5, rrSum: 20, rrMin: 4, rrMax: 4 } },
    });
    vi.resetModules();
    const t = await import('../../strategies/guard-eval-tracker.js');
    const crypto = t.getGuardEvalStatsByClass('crypto_spot');
    expect(crypto.orb.evals).toBe(5);
    expect(crypto.orb.meanRR).toBeCloseTo(4.0);
    expect(t.getGuardEvalStartedAt()).toBe('2026-06-20T00:00:00.000Z');
  });
});
